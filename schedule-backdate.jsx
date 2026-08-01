/* global React, window */
/* ============================================================
   Back-entry — work performed before it reached this system.
   Two doors, because the two applications batch differently:
     • an in-person clinic day  → creates the day on a past date,
       booked to the hospital; patients go on it as normal
     • remote reads             → historical reads entered by hand,
       merged into that practice's monthly statement exactly as if
       they had come through the portal
   Historical reads live in sched_statements.manual_reads, keyed by
   the same statement id the engine already computes.
   Loads AFTER schedule-billing.jsx / billing-entities.jsx.
   ============================================================ */
const { useState: bdUseState } = React;

const BD_S = () => window.SCHED;
const BD_B = () => window.SchedBill;

const bdBlankRead = () => ({
  key: 'r' + Math.random().toString(36).slice(2, 8),
  patient: '', species: '', service: 'remote_initial', sites: '', rush: false, ref: '', vet: '',
});

/* Statement id for an account + month — must match billing-entities. */
function bdStatementId(accountId, y, m) {
  return 'stmt-' + (accountId || 'rp-unassigned') + '-' + y + String(m + 1).padStart(2, '0');
}

function bdToRead(r, practice, y, m) {
  const sites = String(r.sites || '').split(',').map(s => s.trim()).filter(Boolean);
  return {
    caseId: r.ref.trim() || '',
    patient: r.patient.trim() || 'Patient',
    species: r.species.trim(),
    breed: '',
    service: r.service,
    sites,
    rush: !!r.rush,
    rushBy: '',
    lines: null,
    // dated to the last day of the month it belongs to, at midday
    finalizedAt: new Date(y, m + 1, 0, 12, 0, 0).toISOString(),
    practice,
    vet: r.vet.trim(),
    voided: false,
    manual: true,
    enteredAt: new Date().toISOString(),
  };
}

function BackdateModal({ accounts, manual, onCreateDay, onSaveManual, onClose, flash }) {
  const S = BD_S();
  const [mode, setMode] = bdUseState('remote');
  const today = new Date(S.TODAY);
  const [date, setDate] = bdUseState(S.iso(today));
  const [clinicId, setClinicId] = bdUseState('');
  const [acct, setAcct] = bdUseState('');
  const [newPractice, setNewPractice] = bdUseState('');
  const [y, setY] = bdUseState(today.getFullYear());
  const [m, setM] = bdUseState(today.getMonth());
  const [rows, setRows] = bdUseState([bdBlankRead()]);

  const hospitals = (accounts || []).filter(a => a.kind !== 'remote');
  const practices = (accounts || []).filter(a => a.kind !== 'inperson');
  const years = [];
  for (let i = 0; i < 6; i++) years.push(today.getFullYear() - i);

  const practiceName = acct === '__new'
    ? newPractice.trim()
    : ((accounts || []).find(a => a.id === acct) || {}).name || '';
  const accountId = acct === '__new'
    ? (newPractice.trim() ? window.SchedAccounts.fromPractice(newPractice.trim()).id : '')
    : acct;
  const stmtId = accountId ? bdStatementId(accountId, y, m) : '';
  const existing = (manual || {})[stmtId];

  const filled = rows.filter(r => r.patient.trim());
  const preview = filled.map(r => bdToRead(r, practiceName, y, m));
  const previewTotal = preview.reduce((s, r) => s + BD_B().readTotal(r), 0);

  const setRow = (key, patch) => setRows(prev => prev.map(r => r.key === key ? { ...r, ...patch } : r));
  const addRow = () => setRows(prev => [...prev, bdBlankRead()]);
  const rmRow = (key) => setRows(prev => prev.length === 1 ? [bdBlankRead()] : prev.filter(r => r.key !== key));

  const saveRemote = () => {
    if (!accountId || !preview.length) return;
    const prevReads = (existing && existing.reads) || [];
    onSaveManual({
      id: stmtId,
      accountId,
      accountName: practiceName,
      period: { y, m },
      reads: [...prevReads, ...preview],
    });
    flash && flash(preview.length + ' historical read' + (preview.length === 1 ? '' : 's') + ' added to the ' + S.MONTHS[m] + ' ' + y + ' statement for ' + practiceName + '.');
    onClose();
  };

  const removeExisting = (i) => {
    const reads = ((existing && existing.reads) || []).filter((_, ix) => ix !== i);
    onSaveManual({ id: stmtId, accountId, accountName: practiceName, period: { y, m }, reads });
  };

  const saveDay = () => {
    if (!clinicId || !date) return;
    onCreateDay(new Date(date + 'T12:00'), clinicId);
    onClose();
  };

  return (
    <div className="sc-modal-overlay" onClick={onClose}>
      <div className="sc-modal bd-modal" onClick={ev => ev.stopPropagation()}>
        <div className="sc-modal-eyebrow">Billing · back-entry</div>
        <h2 className="sc-modal-h">Add work already performed</h2>
        <p className="sc-modal-sub">
          For cases seen or read before they reached this system. Everything prices off the rate card
          in force on the work's own date, so a historical entry bills at what it cost then, not today.
        </p>

        <div className="sc-seg bd-seg">
          <button className={mode === 'remote' ? 'active' : ''} onClick={() => setMode('remote')}>Remote reads</button>
          <button className={mode === 'inperson' ? 'active' : ''} onClick={() => setMode('inperson')}>In-person clinic day</button>
        </div>

        {mode === 'inperson' ? (
          <React.Fragment>
            <div className="sc-pat-grid">
              <div className="form-row"><label className="form-label">Date of the clinic<span className="req">*</span></label>
                <input className="form-input" type="date" max={S.iso(today)} value={date} onChange={ev => setDate(ev.target.value)} />
              </div>
              <div className="form-row"><label className="form-label">Hospital<span className="req">*</span></label>
                <select className="form-select" value={clinicId} onChange={ev => setClinicId(ev.target.value)}>
                  <option value="">Choose a hospital…</option>
                  {hospitals.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>
            <p className="bd-note">
              This puts the day on the calendar, booked to that hospital and marked complete. Open it and
              add the patients you saw — service, injection sites, STAT — and the invoice builds itself.
              When you issue it you can date the invoice back to when you actually billed them.
            </p>
            <div className="sc-modal-actions">
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-clay" disabled={!clinicId || !date} onClick={saveDay}>Create the day</button>
            </div>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <div className="sc-pat-grid">
              <div className="form-row"><label className="form-label">Practice<span className="req">*</span></label>
                <select className="form-select" value={acct} onChange={ev => setAcct(ev.target.value)}>
                  <option value="">Choose a practice…</option>
                  {practices.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  <option value="__new">Another practice…</option>
                </select>
              </div>
              {acct === '__new' ? (
                <div className="form-row"><label className="form-label">Practice name<span className="req">*</span></label>
                  <input className="form-input" value={newPractice} onChange={ev => setNewPractice(ev.target.value)} placeholder="e.g. River Road Veterinary" />
                </div>
              ) : (
                <div className="form-row"><label className="form-label">Statement month<span className="req">*</span></label>
                  <div className="bd-ym">
                    <select className="form-select" value={m} onChange={ev => setM(Number(ev.target.value))}>
                      {S.MONTHS.map((mo, i) => <option key={mo} value={i}>{mo}</option>)}
                    </select>
                    <select className="form-select" value={y} onChange={ev => setY(Number(ev.target.value))}>
                      {years.map(yy => <option key={yy} value={yy}>{yy}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>
            {acct === '__new' && (
              <div className="form-row"><label className="form-label">Statement month<span className="req">*</span></label>
                <div className="bd-ym">
                  <select className="form-select" value={m} onChange={ev => setM(Number(ev.target.value))}>
                    {S.MONTHS.map((mo, i) => <option key={mo} value={i}>{mo}</option>)}
                  </select>
                  <select className="form-select" value={y} onChange={ev => setY(Number(ev.target.value))}>
                    {years.map(yy => <option key={yy} value={yy}>{yy}</option>)}
                  </select>
                </div>
                <div className="form-help">A practice we have no cases from yet gets its own account, billed like any other.</div>
              </div>
            )}

            {existing && (existing.reads || []).length > 0 && (
              <div className="bd-existing">
                <div className="sc-sec-label">Already entered for this month</div>
                {(existing.reads || []).map((r, i) => (
                  <div key={i} className="bd-ex-row">
                    <span className="p">{r.patient}</span>
                    <span className="s">{(BD_B().RATES[r.service] || {}).label || r.service}{(r.sites || []).length ? ' · ' + r.sites.join(', ') : ''}</span>
                    <span className="a">{S.money(BD_B().readTotal(r))}</span>
                    <button className="sb-x" title="Remove" onClick={() => removeExisting(i)}>×</button>
                  </div>
                ))}
              </div>
            )}

            <div className="bd-rows">
              <div className="bd-head"><div>Patient</div><div>Species</div><div>Read type</div><div>Sites</div><div>STAT</div><div /></div>
              {rows.map(r => (
                <div key={r.key} className="bd-row">
                  <input className="form-input" value={r.patient} onChange={ev => setRow(r.key, { patient: ev.target.value })} placeholder="Name" />
                  <input className="form-input" value={r.species} onChange={ev => setRow(r.key, { species: ev.target.value })} placeholder="Canine" />
                  <select className="form-select" value={r.service} onChange={ev => setRow(r.key, { service: ev.target.value })}>
                    {BD_B().REMOTE_SERVICES.map(s => <option key={s} value={s}>{BD_B().RATES[s].label}</option>)}
                  </select>
                  <input className="form-input" value={r.sites} onChange={ev => setRow(r.key, { sites: ev.target.value })} placeholder="Shoulders, Stifles" />
                  <label className="bd-chk"><input type="checkbox" checked={r.rush} onChange={ev => setRow(r.key, { rush: ev.target.checked })} /></label>
                  <button className="sb-x" title="Remove" onClick={() => rmRow(r.key)}>×</button>
                </div>
              ))}
              <button className="bd-add" onClick={addRow}>+ another read</button>
            </div>
            <div className="form-help" style={{ marginTop: 8 }}>
              Sites are billed per bilateral region — separate them with commas. An unreadable study is a
              flat return fee and ignores the site list.
            </div>

            {filled.length > 0 && (
              <div className="bd-total"><span>{filled.length} read{filled.length === 1 ? '' : 's'} · {S.MONTHS[m]} {y}</span><strong>{S.money(previewTotal)}</strong></div>
            )}

            <div className="sc-modal-actions">
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-clay" disabled={!accountId || !filled.length} onClick={saveRemote}>
                Add to the {S.MONTHS[m]} statement
              </button>
            </div>
            <p className="bd-note" style={{ marginTop: 10 }}>
              Historical reads sit on the statement beside anything that came through the portal, and the
              practice sees them in their own billing history. Issue the statement when you're ready — and
              date it back if it was billed at the time.
            </p>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { BackdateModal, bdStatementId });
