/* global React, window */
/* ============================================================
   Account security — two-factor and password change

   Staff only. TOTP via an authenticator app (1Password, Authy,
   Google Authenticator).

   Enforcement is at sign-in: if a verified factor exists, the
   console asks for a code before letting you in. Supabase itself
   would otherwise let a password-only session through at aal1.

   LOCKED OUT? A factor can only be removed by someone with database
   access:
     delete from auth.mfa_factors where user_id =
       (select id from auth.users where email = 'you@example.com');
   That is written in ACCOUNT-SECURITY.md too.
   ============================================================ */
const { useState: secState, useEffect: secEffect } = React;

function secClient() {
  if (window.SchedCloud && window.SchedCloud.client) return window.SchedCloud.client;
  if (window.__pwClient) return window.__pwClient;
  return null;
}

/* A verified TOTP factor, if this account has one. */
async function secVerifiedFactor(sb) {
  try {
    const { data, error } = await sb.auth.mfa.listFactors();
    if (error) return null;
    const list = (data && (data.totp || data.all)) || [];
    return list.find(f => f.status === 'verified') || null;
  } catch (e) { return null; }
}

/* Is this session already stepped up? */
async function secNeedsChallenge(sb) {
  try {
    const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data && data.currentLevel === 'aal2') return false;
    return !!(await secVerifiedFactor(sb));
  } catch (e) { return false; }
}

/* ---- the code prompt shown during sign-in -------------------- */
function MfaChallenge({ onDone, onCancel }) {
  const [code, setCode] = secState('');
  const [busy, setBusy] = secState(false);
  const [err, setErr] = secState('');

  const submit = async (e) => {
    e.preventDefault();
    const sb = secClient();
    if (!sb) { setErr('Not connected.'); return; }
    setBusy(true); setErr('');
    try {
      const factor = await secVerifiedFactor(sb);
      if (!factor) { onDone(); return; }
      const ch = await sb.auth.mfa.challenge({ factorId: factor.id });
      if (ch.error) throw new Error(ch.error.message);
      const v = await sb.auth.mfa.verify({ factorId: factor.id, challengeId: ch.data.id, code: code.replace(/\s/g, '') });
      if (v.error) throw new Error(v.error.message);
      onDone();
    } catch (e2) {
      setErr(/invalid/i.test(e2.message) ? 'That code was not accepted. Codes change every 30 seconds — try the next one.' : e2.message);
      setBusy(false);
    }
  };

  return (
    <div className="pw-shell">
      <div className="pw-card">
        <div className="eb">§ Two-factor</div>
        <h1 className="h">Enter your code.</h1>
        <p className="body">Open your authenticator app and type the six-digit code for Dr. Debra Canapp.</p>
        <form onSubmit={submit}>
          <div className="form-row">
            <label className="form-label">Six-digit code</label>
            <input className="form-input mono" inputMode="numeric" autoComplete="one-time-code" autoFocus
              maxLength={7} value={code} onChange={e => { setCode(e.target.value); setErr(''); }} placeholder="000000" />
          </div>
          {err && <div className="error-bar">{err}</div>}
          <button type="submit" className="btn form-btn-primary" disabled={busy || code.replace(/\s/g, '').length < 6}>
            {busy ? 'Checking…' : <>Continue <span className="arrow">→</span></>}
          </button>
        </form>
        <div className="auth-alt"><a href="#" onClick={(e) => { e.preventDefault(); onCancel(); }}>← Sign in as someone else</a></div>
      </div>
    </div>
  );
}

/* ---- the panel behind "Security" in the top bar -------------- */
function SecurityPanel({ who, onClose }) {
  const sb = secClient();
  const [factor, setFactor] = secState(undefined);   // undefined = loading, null = none
  const [enrolling, setEnrolling] = secState(null);   // { id, qr, secret }
  const [code, setCode] = secState('');
  const [busy, setBusy] = secState(false);
  const [err, setErr] = secState('');
  const [msg, setMsg] = secState('');

  const [pw, setPw] = secState('');
  const [pw2, setPw2] = secState('');
  const [pwMsg, setPwMsg] = secState('');

  const load = async () => {
    if (!sb) { setFactor(null); return; }
    setFactor(await secVerifiedFactor(sb));
  };
  secEffect(() => { load(); }, []);

  const begin = async () => {
    setErr(''); setMsg(''); setBusy(true);
    try {
      // A half-finished enrollment from a previous attempt blocks a new one.
      const { data: list } = await sb.auth.mfa.listFactors();
      const stale = ((list && list.totp) || []).filter(f => f.status !== 'verified');
      for (const f of stale) { try { await sb.auth.mfa.unenroll({ factorId: f.id }); } catch (e) {} }

      const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator ' + new Date().toISOString().slice(0, 10) });
      if (error) throw new Error(error.message);
      setEnrolling({ id: data.id, qr: data.totp && data.totp.qr_code, secret: data.totp && data.totp.secret });
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const confirm = async () => {
    setErr(''); setBusy(true);
    try {
      const ch = await sb.auth.mfa.challenge({ factorId: enrolling.id });
      if (ch.error) throw new Error(ch.error.message);
      const v = await sb.auth.mfa.verify({ factorId: enrolling.id, challengeId: ch.data.id, code: code.replace(/\s/g, '') });
      if (v.error) throw new Error(v.error.message);
      setEnrolling(null); setCode('');
      setMsg('Two-factor is on. From now on this account needs a code as well as a password.');
      await load();
    } catch (e) {
      setErr(/invalid/i.test(e.message) ? 'That code was not accepted — wait for the next one and try again.' : e.message);
    }
    setBusy(false);
  };

  const remove = async () => {
    if (!confirm2()) return;
    setBusy(true); setErr('');
    try {
      const { error } = await sb.auth.mfa.unenroll({ factorId: factor.id });
      if (error) throw new Error(error.message);
      setMsg('Two-factor is off. Your password alone will sign you in.');
      await load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const confirm2 = () => window.confirm('Turn off two-factor for this account?\n\nYou will be able to sign in with just your password again.');

  const changePw = async (e) => {
    e.preventDefault();
    setErr(''); setPwMsg('');
    if (pw.length < 10) { setErr('Use at least 10 characters.'); return; }
    if (pw !== pw2) { setErr('The two passwords do not match.'); return; }
    setBusy(true);
    try {
      const { error } = await sb.auth.updateUser({ password: pw });
      if (error) throw new Error(error.message);
      setPw(''); setPw2(''); setPwMsg('Password changed.');
    } catch (e2) {
      setErr(/same/i.test(e2.message) ? 'That is your current password — choose a different one.' : e2.message);
    }
    setBusy(false);
  };

  return (
    <div className="vc-overlay" onClick={onClose}>
      <div className="vc-panel sec-panel" onClick={e => e.stopPropagation()}>
        <div className="vc-head">
          <div className="vc-eyebrow">Account security</div>
          <button className="rv-drawer-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="vc-title">{who || 'Your account'}</div>

        {!sb && <div className="vc-empty">Not connected to the live system.</div>}

        {sb && (
          <React.Fragment>
            <div className="sec-block">
              <div className="vc-eyebrow">Two-factor sign-in</div>
              {factor === undefined && <p className="sec-body">Checking…</p>}

              {factor === null && !enrolling && (
                <React.Fragment>
                  <p className="sec-body">
                    Off. Anyone with your password can sign in. Turning this on means a six-digit code
                    from your phone is needed too — worth it for an account that can read patient records.
                  </p>
                  <button className="btn btn-ghost btn-sm" onClick={begin} disabled={busy}>Turn on two-factor</button>
                </React.Fragment>
              )}

              {enrolling && (
                <React.Fragment>
                  <p className="sec-body">
                    Scan this with your authenticator app — 1Password, Authy and Google Authenticator all work —
                    then type the code it shows.
                  </p>
                  {enrolling.qr && <div className="sec-qr" dangerouslySetInnerHTML={{ __html: enrolling.qr }} />}
                  {enrolling.secret && (
                    <p className="sec-secret">Can't scan it? Enter this key by hand: <span className="mono">{enrolling.secret}</span></p>
                  )}
                  <div className="sec-row">
                    <input className="form-input mono" inputMode="numeric" maxLength={7} value={code}
                      onChange={e => { setCode(e.target.value); setErr(''); }} placeholder="000000" style={{ maxWidth: 130 }} />
                    <button className="btn btn-sm" onClick={confirm} disabled={busy || code.replace(/\s/g, '').length < 6}>Confirm</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setEnrolling(null); setCode(''); setErr(''); }}>Cancel</button>
                  </div>
                </React.Fragment>
              )}

              {factor && (
                <React.Fragment>
                  <p className="sec-body">
                    <strong>On.</strong> This account needs a code as well as a password.
                    Keep a backup of the authenticator entry — if you lose it, someone with database
                    access has to clear it for you.
                  </p>
                  <button className="btn btn-ghost btn-sm vc-danger" onClick={remove} disabled={busy}>Turn off two-factor</button>
                </React.Fragment>
              )}
            </div>

            <div className="sec-block">
              <div className="vc-eyebrow">Password</div>
              <form onSubmit={changePw} className="sec-form">
                <input className="form-input" type="password" autoComplete="new-password" value={pw}
                  onChange={e => { setPw(e.target.value); setErr(''); }} placeholder="New password" />
                <input className="form-input" type="password" autoComplete="new-password" value={pw2}
                  onChange={e => { setPw2(e.target.value); setErr(''); }} placeholder="Type it again" />
                <button className="btn btn-ghost btn-sm" type="submit" disabled={busy || !pw || !pw2}>Change password</button>
              </form>
              {pwMsg && <p className="sec-ok">{pwMsg}</p>}
            </div>

            {err && <div className="error-bar">{err}</div>}
            {msg && <p className="sec-ok">{msg}</p>}
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { SecurityPanel, MfaChallenge, secNeedsChallenge, secVerifiedFactor });
