/* global React, window */
/* ============================================================
   Password reset

   Two halves of one flow:
     ForgotPassword — ask for the email, Supabase sends the link
     SetNewPassword — the page they land on from that link

   Both are deliberately vague about whether an account exists, so
   the form can't be used to discover who has access.

   The recovery email is sent by Supabase's own mailer, so this works
   without Resend. Supabase's built-in SMTP is rate-limited, though —
   once Resend is configured, point Supabase's SMTP settings at it.
   ============================================================ */
const { useState: pwState, useEffect: pwEffect } = React;

/* Wherever this page is served from, land the recovery link on it. */
function pwRedirectTo() {
  const base = window.location.href.replace(/[^/]*$/, '');
  return base + 'Reset Password.html';
}

async function pwSendReset(email) {
  const auth = window.SupabaseAuth;
  if (auth && auth.resetPassword) return auth.resetPassword(email, pwRedirectTo());
  const Cloud = window.SchedCloud;
  if (Cloud && Cloud.resetPassword) return Cloud.resetPassword(email, pwRedirectTo());
  return { error: 'Password reset is not available in this mode.' };
}

function ForgotPassword({ email: initial, onBack, brand }) {
  const [email, setEmail] = pwState(initial || '');
  const [busy, setBusy] = pwState(false);
  const [sent, setSent] = pwState(false);
  const [err, setErr] = pwState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    const r = await pwSendReset(email.trim());
    setBusy(false);
    // A wrong address must look identical to a right one.
    if (r && r.error && !/rate|limit|invalid email/i.test(r.error)) console.warn('[reset]', r.error);
    if (r && r.error && /rate|limit/i.test(r.error)) { setErr('Too many attempts just now — wait a minute and try again.'); return; }
    setSent(true);
  };

  return (
    <div className="pw-shell">
      <div className="pw-card">
        <div className="eb">§ Password reset</div>
        {sent ? (
          <React.Fragment>
            <h1 className="h">Check your email.</h1>
            <p className="body">
              If <strong>{email}</strong> has an account, a link to set a new password is on its way.
              It expires in an hour. If nothing arrives, check your spam folder — or reply to
              any email from us and we'll sort it out.
            </p>
            <button type="button" className="btn form-btn-primary" onClick={onBack}>← Back to sign in</button>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <h1 className="h">Forgotten password.</h1>
            <p className="body">Enter the email you sign in with{brand ? ' to ' + brand : ''} and we'll send you a link to set a new one.</p>
            <form onSubmit={submit}>
              <div className="form-row">
                <label className="form-label">Email<span className="req">*</span></label>
                <input className="form-input" type="email" required autoFocus autoComplete="email"
                  value={email} onChange={e => setEmail(e.target.value)} placeholder="you@yourclinic.com" />
              </div>
              {err && <div className="error-bar">{err}</div>}
              <button type="submit" className="btn form-btn-primary" disabled={busy || !email.trim()}>
                {busy ? 'Sending…' : <>Send the link <span className="arrow">→</span></>}
              </button>
            </form>
            <div className="auth-alt"><a href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>← Back to sign in</a></div>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

/* ---- the page the recovery link opens ----------------------- */
const PW_MIN = 10;

function pwStrength(p) {
  const s = String(p || '');
  if (s.length < PW_MIN) return { ok: false, note: `At least ${PW_MIN} characters.` };
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(r => r.test(s)).length;
  if (classes < 2) return { ok: false, note: 'Mix in a number, a capital, or a symbol.' };
  if (/^(password|letmein|welcome|changeme)/i.test(s)) return { ok: false, note: 'Too easy to guess.' };
  return { ok: true, note: classes >= 3 ? 'Strong.' : 'Good.' };
}

function SetNewPassword() {
  const [phase, setPhase] = pwState('checking');   // checking | ready | done | invalid
  const [pw, setPw] = pwState('');
  const [pw2, setPw2] = pwState('');
  const [err, setErr] = pwState(null);
  const [busy, setBusy] = pwState(false);
  const [where, setWhere] = pwState('index.html');

  pwEffect(() => {
    const cfg = window.PORTAL_CONFIG || {};
    if (!(cfg.supabase && cfg.supabase.url && window.supabase)) { setPhase('invalid'); return; }
    const sb = window.supabase.createClient(cfg.supabase.url, cfg.supabase.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ddc_supabase_auth', detectSessionInUrl: true },
    });
    window.__pwClient = sb;

    /* Supabase turns the recovery link's fragment into a session. That can
       land either before or after this effect runs, so watch for both. */
    let settled = false;
    const settle = (ok) => { if (!settled) { settled = true; setPhase(ok ? 'ready' : 'invalid'); } };

    const sub = sb.auth.onAuthStateChange((evt, session) => {
      if (evt === 'PASSWORD_RECOVERY' || (session && session.user)) settle(true);
    });
    sb.auth.getSession().then(({ data }) => {
      if (data && data.session) settle(true);
      else setTimeout(() => settle(false), 2500);   // give the URL exchange a moment
    }).catch(() => settle(false));

    return () => { try { sub.data.subscription.unsubscribe(); } catch (e) {} };
  }, []);

  const strength = pwStrength(pw);

  const submit = async (e) => {
    e.preventDefault();
    if (!strength.ok) { setErr(strength.note); return; }
    if (pw !== pw2) { setErr('The two passwords do not match.'); return; }
    setBusy(true); setErr(null);
    try {
      const sb = window.__pwClient;
      const { data, error } = await sb.auth.updateUser({ password: pw });
      if (error) throw new Error(error.message);
      // Send staff to the console and vets to the portal.
      let dest = 'index.html';
      try {
        const uid = data && data.user && data.user.id;
        if (uid) {
          const { data: prof } = await sb.from('profiles').select('role').eq('id', uid).maybeSingle();
          const role = prof && prof.role;
          if (role === 'reviewer' || role === 'admin') dest = 'Console.html';
          else if (role === 'hospital') dest = 'Schedule.html';
        }
      } catch (e2) { /* the default is fine */ }
      setWhere(dest);
      setPhase('done');
    } catch (e2) {
      setErr(/same/i.test(e2.message) ? 'That is your current password — choose a different one.' : e2.message);
    }
    setBusy(false);
  };

  return (
    <div className="pw-shell">
      <div className="pw-card">
        <div className="eb">§ Password reset</div>

        {phase === 'checking' && <React.Fragment>
          <h1 className="h">One moment.</h1>
          <p className="body">Checking your reset link…</p>
        </React.Fragment>}

        {phase === 'invalid' && <React.Fragment>
          <h1 className="h">This link has expired.</h1>
          <p className="body">
            Reset links are good for one hour and can only be used once. Ask for a fresh one from the
            sign-in page.
          </p>
          <a className="btn form-btn-primary" href="index.html">Back to sign in</a>
        </React.Fragment>}

        {phase === 'ready' && <React.Fragment>
          <h1 className="h">Choose a new password.</h1>
          <p className="body">At least {PW_MIN} characters. Use something you don't use elsewhere.</p>
          <form onSubmit={submit}>
            <div className="form-row">
              <label className="form-label">New password<span className="req">*</span></label>
              <input className="form-input" type="password" required autoFocus autoComplete="new-password"
                value={pw} onChange={e => { setPw(e.target.value); setErr(null); }} placeholder="••••••••••" />
              {pw && <div className={`form-help ${strength.ok ? 'pw-ok' : ''}`}>{strength.note}</div>}
            </div>
            <div className="form-row">
              <label className="form-label">Type it again<span className="req">*</span></label>
              <input className="form-input" type="password" required autoComplete="new-password"
                value={pw2} onChange={e => { setPw2(e.target.value); setErr(null); }} placeholder="••••••••••" />
            </div>
            {err && <div className="error-bar">{err}</div>}
            <button type="submit" className="btn form-btn-primary" disabled={busy || !pw || !pw2}>
              {busy ? 'Saving…' : <>Save and sign in <span className="arrow">→</span></>}
            </button>
          </form>
        </React.Fragment>}

        {phase === 'done' && <React.Fragment>
          <h1 className="h">Done.</h1>
          <p className="body">Your password is changed and you're signed in.</p>
          <a className="btn form-btn-primary" href={where}>Continue <span className="arrow">→</span></a>
        </React.Fragment>}
      </div>
    </div>
  );
}

Object.assign(window, { ForgotPassword, SetNewPassword, pwSendReset });
