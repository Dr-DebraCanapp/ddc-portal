/* global React, window */
/* ============================================================
   Hospital side — the pieces a clinic account needs
     HospitalAccountView : their details, sign-in email, password reset
     RequestDaysModal    : ask for clinic dates when none are open
   Loads AFTER schedule-shared.jsx.
   ============================================================ */
const HA_S = () => window.SCHED;

function HospitalAccountView({ profile, clinic, flash, oops }) {
  const Cloud = window.SchedCloud;
  const [f, setF] = useState({
    contact: (clinic && clinic.contact) || '',
    email: (clinic && clinic.email) || '',
    phone: (clinic && clinic.phone) || '',
    address: (clinic && clinic.address) || '',
    city: (clinic && clinic.city) || '',
    state: (clinic && clinic.state) || '',
    intakeNote: (clinic && clinic.intakeNote) || '',
    canSedate: clinic ? clinic.canSedate !== false : true,
  });
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ next: '', again: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [loginEmail, setLoginEmail] = useState((profile && profile.email) || '');

  if (!clinic) {
    return <div className="sc-empty"><div className="eh">Account not linked</div><p>This sign-in isn’t attached to a hospital yet. Contact our office and we’ll put it right.</p></div>;
  }

  const saveDetails = async () => {
    setBusy(true);
    try {
      await Cloud.saveClinic({ ...clinic, ...f });
      Object.assign(clinic, f);
      flash('Details saved.');
    } catch (e) { oops && oops(e); }
    setBusy(false);
  };

  const changePassword = async () => {
    if (pw.next.length < 8) { flash('Use at least 8 characters.'); return; }
    if (pw.next !== pw.again) { flash('The two passwords don’t match.'); return; }
    setPwBusy(true);
    try {
      const { error } = await Cloud.client.auth.updateUser({ password: pw.next });
      if (error) throw new Error(error.message);
      setPw({ next: '', again: '' });
      flash('Password changed.');
    } catch (e) { oops && oops(e); }
    setPwBusy(false);
  };

  const changeEmail = async () => {
    const next = loginEmail.trim();
    if (!/\S+@\S+\.\S+/.test(next)) { flash('That doesn’t look like an email address.'); return; }
    setBusy(true);
    try {
      const { error } = await Cloud.client.auth.updateUser({ email: next });
      if (error) throw new Error(error.message);
      flash('Check ' + next + ' for a confirmation link — the change takes effect once you click it.');
    } catch (e) { oops && oops(e); }
    setBusy(false);
  };

  return (
    <React.Fragment>
      <div className="sc-caltools">
        <div className="sc-monthnav"><div className="mo" style={{ minWidth: 0 }}>Account</div></div>
      </div>
      <p className="rv-sub" style={{ marginBottom: 22 }}>Your hospital’s details and sign-in. Changes here are what we use to contact you and plan your clinic days.</p>

      <div className="ha-grid">
        <section className="ha-card">
          <div className="sc-sec-label"><span>Hospital details</span></div>
          <div className="sc-pat-grid" style={{ marginTop: 10 }}>
            <div className="form-row"><label className="form-label">Hospital</label><input className="form-input" value={clinic.name} disabled title="Contact our office to change the hospital name" /></div>
            <div className="form-row"><label className="form-label">Main contact</label><input className="form-input" value={f.contact} onChange={ev => setF({ ...f, contact: ev.target.value })} /></div>
            <div className="form-row"><label className="form-label">Contact email</label><input className="form-input" type="email" value={f.email} onChange={ev => setF({ ...f, email: ev.target.value })} /><div className="form-help">Where we send day sheets and invoices.</div></div>
            <div className="form-row"><label className="form-label">Phone</label><input className="form-input" value={f.phone} onChange={ev => setF({ ...f, phone: ev.target.value })} /></div>
            <div className="form-row"><label className="form-label">Address</label><input className="form-input" value={f.address} onChange={ev => setF({ ...f, address: ev.target.value })} /></div>
            <div className="form-row"><label className="form-label">City / state</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="form-input" value={f.city} onChange={ev => setF({ ...f, city: ev.target.value })} placeholder="City" />
                <input className="form-input" style={{ maxWidth: 90 }} value={f.state} onChange={ev => setF({ ...f, state: ev.target.value })} placeholder="State" />
              </div>
            </div>
          </div>
          <label className="sc-rush" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={f.canSedate} onChange={ev => setF({ ...f, canSedate: ev.target.checked })} />
            <span><b>We can sedate in-house</b><br />Iliopsoas scans need sedation, as the patient is positioned in dorsal recumbency. Tell us if that changes.</span>
          </label>
          <div className="form-row" style={{ marginTop: 12 }}><label className="form-label">Anything we should know</label>
            <textarea className="form-area" style={{ minHeight: 70 }} value={f.intakeNote} onChange={ev => setF({ ...f, intakeNote: ev.target.value })} placeholder="Parking, where to set up, the best door to use, who to ask for on arrival…" />
          </div>
          <div className="ha-actions"><button className="btn btn-clay btn-sm" disabled={busy} onClick={saveDetails}>{busy ? 'Saving…' : 'Save details'}</button></div>
        </section>

        <section className="ha-card">
          <div className="sc-sec-label"><span>Sign-in</span></div>
          <div className="form-row" style={{ marginTop: 10 }}><label className="form-label">Sign-in email</label>
            <input className="form-input" type="email" value={loginEmail} onChange={ev => setLoginEmail(ev.target.value)} />
            <div className="form-help">Changing this sends a confirmation link to the new address. You keep signing in with the old one until you click it.</div>
          </div>
          <div className="ha-actions"><button className="btn btn-ghost btn-sm" disabled={busy || loginEmail.trim() === (profile.email || '')} onClick={changeEmail}>Change sign-in email</button></div>

          <div className="ha-sep" />
          <div className="form-row"><label className="form-label">New password</label><input className="form-input" type="password" value={pw.next} onChange={ev => setPw({ ...pw, next: ev.target.value })} placeholder="At least 8 characters" /></div>
          <div className="form-row" style={{ marginTop: 10 }}><label className="form-label">Type it again</label><input className="form-input" type="password" value={pw.again} onChange={ev => setPw({ ...pw, again: ev.target.value })} /></div>
          <div className="ha-actions"><button className="btn btn-clay btn-sm" disabled={pwBusy || !pw.next || !pw.again} onClick={changePassword}>{pwBusy ? 'Changing…' : 'Change password'}</button></div>

          <div className="ha-sep" />
          <div className="ha-note">
            <b>Clinic days and patient numbers</b><br />
            You currently book {(clinic.bookingDays || []).length ? (clinic.bookingDays || []).map(i => HA_S().WEEKDAYS[i]).join(' · ') : 'any weekday'}, up to {clinic.maxCasesPerDay} patients a day.
            To change either, use <strong>Request clinic days</strong> on the calendar or email <a href="mailto:info@DrDebraCanapp.com">info@DrDebraCanapp.com</a>.
          </div>
        </section>
      </div>
    </React.Fragment>
  );
}

/* ---- ask for clinic dates ---------------------------------- */
function RequestDaysModal({ clinic, profile, onClose, flash }) {
  const S = HA_S();
  const [f, setF] = useState({ from: '', to: '', count: '1', patients: String((clinic && clinic.maxCasesPerDay) || 4), note: '' });
  const valid = !!f.from;

  const body = [
    'Hello,',
    '',
    `${(clinic && clinic.name) || 'We'} would like to book ${f.count} clinic day${f.count === '1' ? '' : 's'} with Dr. Canapp.`,
    '',
    `Preferred dates: ${f.from}${f.to ? ' to ' + f.to : ''}`,
    `Patients we expect to present: about ${f.patients} per day`,
    ...(f.note.trim() ? ['', f.note.trim()] : []),
    '',
    'Please open the days when you can and we will build the roster.',
    '',
    'With thanks,',
    (profile && (profile.name || profile.email)) || '',
    (clinic && clinic.name) || '',
  ].join('\n');

  const send = () => {
    window.location.href = `mailto:${encodeURIComponent('info@DrDebraCanapp.com')}?subject=${encodeURIComponent('Clinic day request — ' + ((clinic && clinic.name) || 'hospital'))}&body=${encodeURIComponent(body)}`;
    flash && flash('Request drafted. We’ll open the days and they’ll appear on your calendar.');
    onClose();
  };

  return (
    <div className="sc-modal-overlay" onClick={onClose}>
      <div className="sc-modal" onClick={ev => ev.stopPropagation()}>
        <div className="sc-modal-eyebrow">Calendar · request days</div>
        <h2 className="sc-modal-h">Send us a note</h2>
        <p className="sc-modal-sub">For anything the calendar can’t say — a run of consecutive days, a backlog you’d like seen, or dates you’re still working out. To ask for specific dates, use <strong>Request days</strong> on the calendar instead; those reach us straight away.</p>
        <div className="sc-pat-grid">
          <div className="form-row"><label className="form-label">Earliest date<span className="req">*</span></label><input className="form-input" type="date" value={f.from} onChange={ev => setF({ ...f, from: ev.target.value })} /></div>
          <div className="form-row"><label className="form-label">Latest date</label><input className="form-input" type="date" value={f.to} onChange={ev => setF({ ...f, to: ev.target.value })} /><div className="form-help">Leave blank if it’s one specific day.</div></div>
          <div className="form-row"><label className="form-label">How many days</label><input className="form-input" type="number" min="1" max="10" value={f.count} onChange={ev => setF({ ...f, count: ev.target.value })} /></div>
          <div className="form-row"><label className="form-label">Patients per day</label><input className="form-input" type="number" min="1" max="12" value={f.patients} onChange={ev => setF({ ...f, patients: ev.target.value })} /></div>
        </div>
        <div className="form-row"><label className="form-label">Anything else</label>
          <textarea className="form-area" style={{ minHeight: 66 }} value={f.note} onChange={ev => setF({ ...f, note: ev.target.value })} placeholder="e.g. we'd like a run of three consecutive days, or we have a backlog of cruciate cases." />
        </div>
        <div className="sc-modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-clay" disabled={!valid} onClick={send}>Send request</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { HospitalAccountView, RequestDaysModal });
