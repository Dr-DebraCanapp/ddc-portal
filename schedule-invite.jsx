/* global React, window */
/* ============================================================
   Invite a hospital — send THEM the form, don't fill it in
   The old button opened the intake form for the admin to complete,
   which meant answering questions only the hospital can answer.
   This opens an email invitation with a link to ClinicIntake.html so
   the practice fills it out themselves, and it lands as a visit
   request to approve or decline.
   Loads AFTER schedule-shared.jsx.
   ============================================================ */
function InviteHospitalModal({ onClose, flash }) {
  const [f, setF] = useState({ hospital: '', contact: '', email: '', note: '' });
  const [sent, setSent] = useState(false);
  const portal = ((window.PORTAL_CONFIG || {}).payments || {}).portalUrl || 'https://portal.drdebracanapp.com';
  const formUrl = portal.replace(/\/$/, '') + '/ClinicIntake.html';
  const valid = /\S+@\S+\.\S+/.test(f.email.trim());

  const body = [
    f.contact.trim() ? `Dear ${f.contact.trim()},` : 'Hello,',
    '',
    `I'd like to invite ${f.hospital.trim() || 'your hospital'} to host in-person diagnostic musculoskeletal ultrasounds with Dr. Debra Canapp, DVM, DACVSMR.`,
    '',
    ...(f.note.trim() ? [f.note.trim(), ''] : []),
    'To get started, please complete the short hospital form here:',
    formUrl,
    '',
    'It asks about your facility, the days that suit you, how many patients you would like seen, and whether you can sedate in-house. It takes about five minutes, and once you submit it we will review and confirm.',
    '',
    'Any questions, just reply to this message.',
    '',
    'With thanks,',
    'Ally Canapp - Li',
    '',
    'info@DrDebraCanapp.com',
  ].join('\n');

  const send = () => {
    const subject = `Invitation — host an in-person MSK ultrasound clinic with Dr. Debra Canapp`;
    window.location.href = `mailto:${encodeURIComponent(f.email.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setSent(true);
    flash && flash('Invitation drafted. Their request appears under Visit requests once they submit the form.');
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(formUrl); flash && flash('Form link copied.'); }
    catch (e) { flash && flash('Copy failed — the link is ' + formUrl); }
  };

  return (
    <div className="sc-modal-overlay" onClick={onClose}>
      <div className="sc-modal" onClick={ev => ev.stopPropagation()}>
        <div className="sc-modal-eyebrow">Hospitals · invitation</div>
        <h2 className="sc-modal-h">Invite a hospital to host a clinic</h2>
        <p className="sc-modal-sub">
          They fill in their own details — facility, days that suit them, patient numbers, whether
          they can sedate. It arrives under <strong>Visit requests</strong> for you to approve or decline.
        </p>

        <div className="sc-pat-grid">
          <div className="form-row"><label className="form-label">Hospital</label>
            <input className="form-input" value={f.hospital} onChange={ev => setF({ ...f, hospital: ev.target.value })} placeholder="e.g. Bowie Animal Hospital" />
          </div>
          <div className="form-row"><label className="form-label">Who you're writing to</label>
            <input className="form-input" value={f.contact} onChange={ev => setF({ ...f, contact: ev.target.value })} placeholder="e.g. Dr. Marina Velez" />
          </div>
        </div>
        <div className="form-row"><label className="form-label">Their email<span className="req">*</span></label>
          <input className="form-input" type="email" value={f.email} onChange={ev => setF({ ...f, email: ev.target.value })} placeholder="frontdesk@hospital.com" />
          <div className="form-help">Only this is required — everything else just personalises the note.</div>
        </div>
        <div className="form-row"><label className="form-label">Anything to add</label>
          <textarea className="form-area" style={{ minHeight: 70 }} value={f.note} onChange={ev => setF({ ...f, note: ev.target.value })} placeholder="Optional — e.g. following up on our conversation at VMX, or a month you had in mind." />
        </div>

        <details className="sd-preview">
          <summary>What the invitation says</summary>
          <pre>{body}</pre>
        </details>

        <div className="ih-link">
          <span className="k">Their form</span>
          <code>{formUrl}</code>
          <button className="btn btn-ghost btn-sm" onClick={copyLink}>Copy link</button>
        </div>

        <div className="sc-modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>{sent ? 'Done' : 'Cancel'}</button>
          <button className="btn btn-clay" disabled={!valid} onClick={send}>Open email invitation</button>
        </div>
        <p className="rv-inv-foot" style={{ marginTop: 10 }}>
          If you'd rather not email from here, copy the link above and send it however you like — the form works the same either way.
        </p>
      </div>
    </div>
  );
}

Object.assign(window, { InviteHospitalModal });
