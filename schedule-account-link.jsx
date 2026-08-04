/* global React, window */
/* ============================================================
   Hospital sign-in, on the hospital's own profile

   Hospital logins are linked by a signup trigger that matches the
   clinic's login_email. An account made any other way — by hand in
   the dashboard, or where a profile row already existed — lands
   unlinked, and the vet sees "Your account isn't linked to a
   hospital yet." even though her password is fine.

   This shows the office the truth (linked or not) and lets them fix
   it without touching SQL.
   ============================================================ */
const { useState: calState, useEffect: calEffect } = React;

function ClinicAccountLink({ clinic }) {
  const Cloud = window.SchedCloud;
  const [state, setState] = calState('loading');   // loading | linked | none | off
  const [linked, setLinked] = calState(null);
  const [email, setEmail] = calState('');
  const [busy, setBusy] = calState(false);
  const [err, setErr] = calState('');
  const [msg, setMsg] = calState('');

  const look = async () => {
    if (!Cloud || !Cloud.configured || !clinic.id) { setState('off'); return; }
    try {
      const rows = await Cloud.hospitalAccounts(clinic.id);
      if (rows && rows.length) { setLinked(rows); setState('linked'); }
      else { setState('none'); setEmail(clinic.loginEmail || clinic.email || ''); }
    } catch (e) { setState('off'); }
  };
  calEffect(() => { look(); }, [clinic.id]);

  const link = async () => {
    const addr = email.trim();
    if (!addr) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      await Cloud.linkHospitalAccount(addr, clinic.id);
      setMsg(addr + ' is now linked. Ask them to sign out and back in.');
      await look();
    } catch (e) {
      setErr(e.message || String(e));
    }
    setBusy(false);
  };

  const unlink = async (addr) => {
    if (!window.confirm(`Disconnect ${addr} from ${clinic.name || 'this hospital'}?\n\nThey will no longer see this hospital's schedule. Nothing is deleted, and you can link them again.`)) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      await Cloud.unlinkHospitalAccount(addr);
      setMsg(addr + ' is no longer linked to this hospital.');
      await look();
    } catch (e) { setErr(e.message || String(e)); }
    setBusy(false);
  };

  if (state === 'off') return null;

  return (
    <div className="cal-block">
      <div className="sc-sec-label">Their sign-in</div>

      {state === 'loading' && <p className="form-help" style={{ margin: 0 }}>Checking…</p>}

      {state === 'linked' && (
        <React.Fragment>
          <p className="cal-ok">
            {linked.map(a => a.email).join(', ')} {linked.length === 1 ? 'signs' : 'sign'} in to this hospital.
          </p>
          {Cloud.unlinkHospitalAccount && (
            <div className="cal-row" style={{ marginTop: 10 }}>
              {linked.map(a => (
                <button key={a.id} type="button" className="btn btn-ghost btn-sm" disabled={busy}
                  onClick={() => unlink(a.email)}>
                  {linked.length === 1 ? 'Unlink this account' : 'Unlink ' + a.email}
                </button>
              ))}
            </div>
          )}
        </React.Fragment>
      )}

      {state === 'none' && (
        <React.Fragment>
          <p className="form-help" style={{ margin: '0 0 10px' }}>
            No account is linked to this hospital yet, so anyone signing in will be told their account
            isn't set up. If you have already created their login, enter its email here to connect it.
          </p>
          <div className="cal-row">
            <input className="form-input" type="email" value={email} placeholder="their sign-in email"
              onChange={e => { setEmail(e.target.value); setErr(''); }} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={link} disabled={busy || !email.trim()}>
              {busy ? 'Linking…' : 'Link this account'}
            </button>
          </div>
          <p className="form-help" style={{ margin: '8px 0 0' }}>
            No login yet? Approve their visit request in Schedule → Visit requests, which creates one.
          </p>
        </React.Fragment>
      )}

      {err && <div className="cal-err">{err}</div>}
      {msg && <p className="cal-ok">{msg}</p>}
    </div>
  );
}

Object.assign(window, { ClinicAccountLink });
