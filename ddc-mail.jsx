/* global React, window */
/* ============================================================
   Sending email from the console

   Everything used to open a draft in whoever's mail client happened
   to be default, which meant the message left from a personal
   address, or not at all. This sends it from the practice address
   and records that it went.

   The mail-client draft is kept as the fallback, not the default:
   until Resend is configured, or if a send fails, the office still
   has a way to get the message out.

   window.DDCMail.send({ to, subject, body, heading?, html?, kind? })
   <window.SendMailButton …>  — the shared control
   ============================================================ */
const { useState: mailState } = React;

const DDCMail = {
  /* Configured means: cloud connected AND the office has said email is on.
     A false negative just means the draft fallback is offered. */
  get configured() {
    const cfg = window.PORTAL_CONFIG || {};
    const cloud = (window.SchedCloud && window.SchedCloud.configured)
      || (cfg.supabase && cfg.supabase.url);
    return !!(cloud && cfg.mail && cfg.mail.enabled === true);
  },

  endpoint() {
    const cfg = window.PORTAL_CONFIG || {};
    if (cfg.mail && cfg.mail.endpoint) return cfg.mail.endpoint;
    const url = cfg.supabase && cfg.supabase.url;
    return url ? url.replace(/\/$/, '') + '/functions/v1/send-mail' : null;
  },

  async token() {
    const sb = window.SchedCloud && window.SchedCloud.client;
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return (data && data.session && data.session.access_token) || null;
  },

  async send({ to, subject, body, heading, html, kind, cc, attachments }) {
    const url = this.endpoint();
    if (!url) throw new Error('Email sending is not configured.');
    const jwt = await this.token();
    if (!jwt) throw new Error('Sign in again — your session has expired.');
    const cfg = window.PORTAL_CONFIG || {};
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + jwt,
        apikey: (cfg.supabase && cfg.supabase.anonKey) || '',
      },
      body: JSON.stringify({ to, subject, body, heading, html, kind: kind || 'message', cc, attachments }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error || ('The mail service returned ' + res.status));
    return data;
  },

  /* The old behaviour, kept deliberately. */
  draft({ to, subject, body }) {
    window.location.href = `mailto:${encodeURIComponent(to || '')}?subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(body || '')}`;
  },
};

/* ---- the shared control -------------------------------------
   Sends when it can, offers the draft when it can't, and says which
   happened. onSent fires only on a real send or a deliberate draft,
   so callers can record "invitation sent" honestly. */
function SendMailButton({ to, subject, body, heading, html, kind, label, draftLabel, onSent, className, disabled }) {
  const [busy, setBusy] = mailState(false);
  const [err, setErr] = mailState('');
  const [done, setDone] = mailState(false);
  const can = DDCMail.configured;

  const go = async () => {
    setBusy(true); setErr('');
    try {
      await DDCMail.send({ to, subject, body, heading, html, kind });
      setDone(true);
      onSent && onSent('sent');
    } catch (e) {
      setErr(e.message || String(e));
    }
    setBusy(false);
  };

  const draft = () => {
    DDCMail.draft({ to, subject, body });
    onSent && onSent('draft');
  };

  if (done) {
    return <div className="mail-sent">Sent to {to}.</div>;
  }

  return (
    <React.Fragment>
      <div className="mail-acts">
        {can && (
          <button type="button" className={className || 'btn btn-clay'} onClick={go} disabled={busy || disabled || !to}>
            {busy ? 'Sending…' : (label || 'Send it')}
          </button>
        )}
        <button type="button" className={can ? 'btn btn-ghost btn-sm' : (className || 'btn btn-clay')}
          onClick={draft} disabled={disabled || !to}>
          {can ? (draftLabel || 'Open in my mail instead') : (draftLabel || 'Open in my mail')}
        </button>
      </div>
      {!can && (
        <p className="mail-note">
          This opens a draft in your own mail program. To send it from
          info@drdebracanapp.com instead, set up email — see EMAIL-SETUP.md.
        </p>
      )}
      {err && (
        <div className="mail-err">
          {err}
          <br />Nothing was sent. Use “Open in my mail instead” to get it out now.
        </div>
      )}
    </React.Fragment>
  );
}

Object.assign(window, { DDCMail, SendMailButton });
