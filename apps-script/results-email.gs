/**
 * Subject Test Central -- results email webhook.
 *
 * Receives a marked SAT mock result from the test page and emails it
 * to admissions. Deployed as a Google Apps Script web app, this is the
 * "server" a static GitHub Pages site doesn't have.
 *
 * ---- HOW TO DEPLOY (once, ~3 minutes) ----
 * 1. Go to https://script.google.com signed in as the account the
 *    emails should come FROM (e.g. zak.k@geniuspremium.com).
 * 2. New project -> delete the sample code -> paste this whole file.
 * 3. Deploy -> New deployment -> type "Web app".
 *      - Execute as: Me
 *      - Who has access: Anyone
 *    -> Deploy, approve the permissions, and copy the /exec URL.
 * 4. Paste that URL into EMAIL_WEBHOOK_URL in index.html's
 *    ACCESS CONTROL PANEL, commit, push.
 *
 * Security: every request must carry a Firebase ID token, which is
 * verified against the schedulemaker-c212c project via Google's
 * Identity Toolkit API. Only signed-in @geniuspremium.com accounts
 * can trigger an email, and the recipient is fixed here server-side,
 * so the URL being public does not let outsiders send mail anywhere.
 */

var RESULTS_TO       = 'admissions@geniuspremium.com';
var ALLOWED_DOMAIN   = 'geniuspremium.com';
var FIREBASE_API_KEY = 'AIzaSyBvFSgHf04mEm8fBsfkc0umWv0J_UjB7j4'; // public web key of schedulemaker-c212c

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var who = verifyFirebaseToken(body.idToken);
    if (!who) return out({ ok: false, error: 'not authorised' });

    var r = body.result || {};
    var student = String(r.studentEmail || who.email);
    var label = r.label ? ' -- ' + r.label : '';

    var subject, lines;
    if (r.voided) {
      subject = 'SAT Math Mock: VOIDED attempt -- ' + student + label;
      lines = [
        'A test attempt was voided (exam-conditions breach).',
        '',
        'Student:    ' + student,
        'Form:       ' + (r.code || '--') + label,
        'Reason:     ' + (r.voidReason || 'left the test window'),
        'When:       ' + new Date().toLocaleString(),
        '',
        'The student can re-sit inside their window unless it has closed.'
      ];
    } else {
      var pct = r.total ? Math.round(100 * r.raw / r.total) : 0;
      lines = [
        'Student:    ' + student,
        'Form:       ' + (r.code || '--') + label,
        'Finished:   ' + new Date().toLocaleString(),
        '',
        'RAW SCORE:  ' + r.raw + '/' + r.total + '  (' + pct + '%)',
        'ESTIMATED SECTION SCORE:  ~' + r.est + '  (hard-route conversion, +/-30)',
        ''
      ];
      (r.modules || []).forEach(function (m, i) {
        lines.push('Module ' + (i + 1) + ':   ' + m.ok + '/' + m.n +
          '  in ' + Math.round((m.secondsUsed || 0) / 60) + ' min');
      });
      if (r.domains) {
        lines.push('', 'By domain:');
        Object.keys(r.domains).forEach(function (d) {
          lines.push('  ' + d + ': ' + r.domains[d].ok + '/' + r.domains[d].n);
        });
      }
      var missed = (r.questions || []).filter(function (q) { return !q.ok; });
      lines.push('', missed.length ? 'Missed questions (' + missed.length + '):' : 'Nothing missed -- a perfect paper.');
      missed.forEach(function (q) {
        lines.push('  M' + q.module + ' Q' + q.number + '  ' + q.domain + ' -- ' + q.skill +
          '  (answered ' + (q.given === null || q.given === undefined ? '--' : q.given) + ', key ' + q.key + ')');
      });
      if (r.violations) lines.push('', 'Focus-loss warnings during the attempt: ' + r.violations);
      subject = 'SAT Math Mock result: ' + student + ' -- ' + r.raw + '/' + r.total + ' (~' + r.est + ')' + label;
    }

    lines.push('', 'Full details: https://zakkattakk2k2.github.io/subject-test-central/ (sign in as an admin)');
    MailApp.sendEmail({ to: RESULTS_TO, subject: subject, body: lines.join('\n') });
    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

/** Verifies a Firebase ID token and returns {email} or null. */
function verifyFirebaseToken(idToken) {
  if (!idToken) return null;
  var resp = UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY,
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ idToken: idToken }),
      muteHttpExceptions: true
    }
  );
  if (resp.getResponseCode() !== 200) return null;
  var data = JSON.parse(resp.getContentText());
  var u = data.users && data.users[0];
  if (!u || !u.email) return null;
  if (u.email.toLowerCase().indexOf('@' + ALLOWED_DOMAIN) === -1) return null;
  return { email: u.email };
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
