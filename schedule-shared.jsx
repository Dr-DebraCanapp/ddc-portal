/* global React, window */
/* ============================================================
   Schedule — shared components
   Hook aliases are declared ONCE here (first-loaded component file);
   later schedule-*.jsx files reuse them from global scope.
   Everything is exported on window at the bottom.
   ============================================================ */

const { useState, useEffect, useMemo, useRef } = React;
const S = () => window.SCHED;

/* ---- small atoms ------------------------------------------- */
function SchedPill({ status }) {
  const label = { available: 'Open day', requested: 'Requested', booked: 'Booked', submitted: 'Awaiting approval', confirmed: 'Confirmed', completed: 'Completed' }[status] || status;
  return <span className={`sc-pill ${status}`}>{label}</span>;
}

function PatChip({ p }) {
  const sed = S().sedation(p);
  return (
    <span className={`sc-patchip ${p.cancelled ? 'cancelled' : ''}`}>
      {p.name}
      {!p.cancelled && sed.required && <span className="sed" title="Sedation required">●</span>}
    </span>
  );
}

function SiteList({ sites }) {
  return (
    <div className="sc-sites-row">
      {sites.map(id => {
        const s = S().site(id);
        return <span key={id} className={`sc-site ${s.sedation ? 'sed' : ''}`}>{s.name}</span>;
      })}
      {sites.length === 0 && <span className="sc-site" style={{ opacity: 0.6 }}>No sites yet</span>}
    </div>
  );
}

/* ---- patient roster row (expandable) ----------------------- */
function PatientRow({ p, idx, role, day, onEdit, onRemove, onCancel, entities }) {
  const [open, setOpen] = useState(false);
  const [viewFile, setViewFile] = useState(null);
  const sed = S().sedation(p);
  const editable = role === 'clinic'
    ? (day.status === 'available' || day.status === 'booked')
    : day.status !== 'completed';
  const cancellable = day.status !== 'completed';

  return (
    <div className={`sc-pat ${p.cancelled ? 'cancelled' : ''}`}>
      <div className="sc-pat-top" onClick={() => setOpen(o => !o)}>
        <div className="sc-pat-ord">{idx + 1}</div>
        <div className="sc-pat-id">
          <div className="sc-pat-name">{p.name}</div>
          <div className="sc-pat-sig">{[p.breed, p.sex ? S().fmtSex(p.sex, true) : '', p.age, p.weight, p.occupation, p.owner].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="sc-pat-flags">
          {p.cancelled && <span className="sc-flag cancelled" title={`Cancelled by ${p.cancelled.by === 'admin' ? 'admin (our office)' : 'the clinic'}`}>Cancelled</span>}
          {!p.cancelled && sed.required && <span className="sc-flag sed" title={sed.reason}>Sedation</span>}
          {!p.cancelled && p.service === 'injection' && <span className="sc-flag inject">Injection</span>}
          {!p.cancelled && p.visitType === 'recheck' && <span className="sc-flag recheck">Recheck</span>}
          {!p.cancelled && p.caseId && <span className="sc-flag link" title={p.caseId}>Report</span>}
          <span style={{ color: 'var(--ink-4)', fontSize: 13, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
        </div>
      </div>

      {open && (
        <div className="sc-pat-detail">
          {p.cancelled && (
            <div className="sc-callout cancelled">
              <span className="ic">✕</span>
              <div><strong>Cancelled by {p.cancelled.by === 'admin' ? 'admin (our office).' : 'the clinic.'}</strong> {p.cancelled.reason || 'This patient will not be seen and is excluded from the day’s invoice.'}</div>
            </div>
          )}
          {!p.cancelled && (sed.required || sed.likely) && (
            <div className="sc-callout">
              <span className="ic">◑</span>
              <div>
                <strong>{sed.required ? 'Sedation required.' : 'Sedation likely.'}</strong> {sed.reason} Patient must arrive <strong>fasted</strong>.
              </div>
            </div>
          )}
          {p.aiSummary && p.aiSummary.summary && (
            <div className="sc-ai-card compact">
              <div className="sc-ai-card-head">
                <span className="eyebrow">{p.aiSummary.engine === 'ai' ? 'AI intake summary' : 'Intake read'}</span>
                <span className="note">From {(p.aiSummary.docs || []).length || 'the'} uploaded document{(p.aiSummary.docs || []).length === 1 ? '' : 's'}</span>
              </div>
              <p className="sc-ai-summary">{p.aiSummary.summary}</p>
              <window.SchedAISections r={p.aiSummary} />
              {S().liveFlags(p).length > 0 && (
                <div className="sc-ai-flags">{S().liveFlags(p).map((fl, i) => <span key={i} className={`sc-ai-flag ${fl.level}`}><b>{fl.level}</b>{fl.text}</span>)}</div>
              )}
            </div>
          )}
          <div className="sc-pat-grid">
            <div className="sc-field"><div className="k">Referring DVM</div><div className="v">{p.vet}</div></div>
            <div className="sc-field"><div className="k">Owner</div><div className="v">{p.owner}</div></div>
            <div className="sc-field"><div className="k">Service</div><div className="v">{(p.service === 'injection' ? 'Injection · ' + (p.injections || (p.sites || []).length) + ' site' + ((p.injections || 1) === 1 ? '' : 's') : 'Diagnostic ultrasound')}{p.rush ? ' · STAT' : ''} · {S().money(S().rate(p))}</div></div>
            <div className="sc-field"><div className="k">Demeanor / fasting</div><div className="v" style={{ textTransform: 'capitalize' }}>{p.demeanor} · {p.fasted ? 'Fasted confirmed' : 'Fasting NOT confirmed'}</div></div>
            <div className="sc-field full"><div className="k">Sites for evaluation</div><SiteList sites={p.sites} /></div>
            {role === 'admin' && entities && window.PatientBillingHistory && (
              <div className="sc-field full"><window.PatientBillingHistory name={p.name} entities={entities} /></div>
            )}
            <div className="sc-field full"><div className="k">Reason / clinical history</div><div className="v serif">{p.history || '—'}</div></div>
            {p.notes && <div className="sc-field full"><div className="k">Notes</div><div className="v">{p.notes}</div></div>}
            {p.files.length > 0 && (
              <div className="sc-field full">
                <div className="k">Records &amp; imaging</div>
                <div className="sc-files-row">
                  {p.files.map((f, i) => (
                    <button key={i} className="sc-filepill" onClick={() => setViewFile(f)} title={f && f.external ? 'Linked study' : 'Open in viewer'}>
                      <span className="ic">{f && f.external ? 'LINK' : ({ dicom: 'DCM', image: 'IMG', pdf: 'PDF', video: 'VID', doc: 'DOC' }[window.schedFileKind(f)] || 'FILE')}</span>{window.schedFileName(f)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {viewFile && <window.FileViewer file={viewFile} onClose={() => setViewFile(null)} />}
          {(editable || cancellable) && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {p.cancelled ? (
                cancellable && <button className="btn btn-ghost btn-sm" onClick={() => onCancel(p, true)}>Reinstate patient</button>
              ) : (
                <React.Fragment>
                  {editable && <button className="btn btn-ghost btn-sm" onClick={() => onEdit(p)}>Edit patient</button>}
                  {cancellable && <button className="btn btn-ghost btn-sm" onClick={() => onCancel(p, false)} style={{ borderColor: 'var(--clay)', color: 'var(--clay-deep)' }}>Cancel patient</button>}
                </React.Fragment>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   DAY DETAIL DRAWER
   ============================================================ */
function DayDrawer({ day, entity, entities, role, onClose, on }) {
  const clinic = day.clinic ? S().clinic(day.clinic) : null;
  const active = S().active(day);
  const sedCount = active.filter(p => S().sedation(p).required).length;
  const isCA = clinic && clinic.region === 'ca';

  const footer = [];
  if (role === 'admin') {
    if (day.status === 'available') {
      footer.push(<button key="a" className="btn btn-clay" onClick={() => on.assign(day)}>Assign a clinic</button>);
      footer.push(<button key="u" className="btn btn-ghost" onClick={() => on.unpublish(day)}>Unpublish day</button>);
    } else if (day.status === 'requested') {
      footer.push(<button key="dc" className="btn btn-ghost" onClick={() => on.declineDay(day)}>Decline</button>);
      footer.push(<button key="ac" className="btn btn-clay" onClick={() => on.approveDay(day)}>Approve this day</button>);
    } else if (day.status === 'booked') {
      footer.push(<button key="ap" className="btn" onClick={() => on.addPatient(day)}>Add patient</button>);
      footer.push(<button key="c" className="btn btn-clay" onClick={() => on.approve(day)}>Confirm roster</button>);
    } else if (day.status === 'submitted') {
      footer.push(<button key="sb" className="btn btn-ghost" onClick={() => on.sendBack(day)}>Send back</button>);
      footer.push(<button key="ap" className="btn" onClick={() => on.addPatient(day)}>Add patient</button>);
      footer.push(<button key="c" className="btn btn-clay" onClick={() => on.approve(day)}>Approve roster</button>);
    } else if (day.status === 'confirmed') {
      footer.push(<button key="d" className="btn btn-ghost" onClick={() => on.daysheet(day)}>Day sheet</button>);
      footer.push(<button key="m" className="btn btn-clay" onClick={() => on.complete(day)}>Mark done · invoice</button>);
    } else if (day.status === 'completed') {
      footer.push(<button key="d" className="btn btn-ghost" onClick={() => on.daysheet(day)}>Day sheet</button>);
    }
  } else {
    // clinic role
    if (day.status === 'available') {
      footer.push(<button key="b" className="btn btn-clay" onClick={() => on.book(day)}>Request this day</button>);
    } else if (day.status === 'requested') {
      footer.push(<button key="wr" className="btn btn-ghost" onClick={() => on.withdrawRequest(day)}>Withdraw request</button>);
    } else if (day.status === 'booked') {
      footer.push(<button key="ap" className="btn" onClick={() => on.addPatient(day)}>Add patient</button>);
      footer.push(<button key="s" className="btn btn-clay" onClick={() => on.submit(day)}>Submit for approval</button>);
    } else if (day.status === 'submitted') {
      footer.push(<button key="w" className="btn btn-ghost" onClick={() => on.withdraw(day)}>Withdraw &amp; edit</button>);
      footer.push(<button key="so" className="btn btn-clay" onClick={() => on.signoff(day)}>{day.signoff ? 'View sign-off' : 'Consent sign-off'}</button>);
    } else {
      footer.push(<button key="so" className="btn btn-clay" onClick={() => on.signoff(day)}>{day.signoff ? 'View sign-off' : 'Consent sign-off'}</button>);
    }
  }

  return (
    <React.Fragment>
      <div className="sc-overlay" onClick={onClose} />
      <aside className="sc-drawer" role="dialog" aria-label="Clinic day">
        <div className="sc-drawer-head">
          <button className="sc-drawer-close" onClick={onClose} aria-label="Close">×</button>
          <div className="sc-drawer-eyebrow">
            {S().sameDay(day.date, S().TODAY) ? 'Today · clinic day' : 'Clinic day'}{isCA && ' · California'}
          </div>
          <h2 className="sc-drawer-date">{S().fmtLong(day.date)}</h2>
          <div className="sc-drawer-clinic">
            <SchedPill status={day.status} />
            {clinic ? <span>{clinic.name} · {clinic.city}, {clinic.state}</span> : <span style={{ fontStyle: 'italic', color: 'var(--ink-3)' }}>Open day — not yet claimed by a clinic</span>}
          </div>
        </div>

        <div className="sc-drawer-body">
          {day.status === 'requested' && (
            <div className={`sc-approve-note ${role === 'admin' ? 'admin' : ''}`}>
              <span className="ic">{role === 'admin' ? '◑' : '⏳'}</span>
              <div>
                {role === 'admin'
                  ? <><strong>A hospital has asked for this day.</strong> {clinic ? clinic.name : 'They'} picked it{day.requestedBy ? <> — {day.requestedBy}</> : ''}{day.requestedAt ? <> on {S().fmtLong(new Date(day.requestedAt))}</> : ''}. <strong>Approve</strong> and they can start adding patients, or <strong>Decline</strong> to put the day back on offer.</>
                  : <><strong>Requested — waiting on our office.</strong> We'll confirm this day shortly. Once it's approved you can add the patients you'd like seen.</>}
              </div>
            </div>
          )}
          {day.status === 'submitted' && (
            <div className={`sc-approve-note ${role === 'admin' ? 'admin' : ''}`}>
              <span className="ic">{role === 'admin' ? '◑' : '⏳'}</span>
              <div>
                {role === 'admin'
                  ? <><strong>Awaiting your approval.</strong> {clinic ? clinic.name : 'The clinic'} submitted this roster{day.submittedBy ? <> via {day.submittedBy}</> : ''}{day.submittedAt ? <> on {S().fmtLong(day.submittedAt)}</> : ''}. Review the patients below, then <strong>Approve</strong> to confirm — or <strong>Send back</strong> for changes.</>
                  : <><strong>Submitted — awaiting Allyson Li's approval.</strong> The roster is locked while it's reviewed. Need to change something? <strong>Withdraw &amp; edit</strong>, then resubmit.</>}
              </div>
            </div>
          )}
          {day.signoff && (
            <div className="sc-signed-note">
              <span className="ic">✓</span>
              <div>
                <strong>Consent signed off by {day.signoff.name}</strong> ({day.signoff.role || 'referring veterinarian'}) on {S().fmtLong(new Date(day.signoff.at))}, {new Date(day.signoff.at).getFullYear()}. On file for this clinic day.
              </div>
            </div>
          )}
          {clinic && (
            <React.Fragment>
              <div className="sc-sec-label">Clinic</div>
              <div className="rv-refvet" style={{ marginBottom: 0 }}>
                <div className="rv-refvet-grid">
                  <div>
                    <div className="rv-refvet-name">{clinic.name}</div>
                    <div className="rv-refvet-clinic">{clinic.contact} · {clinic.city}, {clinic.state} · {clinic.miles} mi</div>
                  </div>
                  <div className="rv-refvet-meta">
                    <a className="rv-refvet-link" href={`mailto:${clinic.email}`}>{clinic.email}</a>
                    <div className="rv-refvet-when">{clinic.phone}</div>
                  </div>
                </div>
              </div>
            </React.Fragment>
          )}

          <div className="sc-sec-label">
            <span>Patients{active.length > 0 ? ` · ${active.length}` : ''}{sedCount > 0 ? ` · ${sedCount} sedation` : ''}</span>
            {((role === 'admin' && day.status !== 'completed') || (role === 'clinic' && (day.status === 'available' || day.status === 'booked'))) && day.clinic && (
              <span className="add" onClick={() => on.addPatient(day)}>+ Add patient</span>
            )}
          </div>

          {day.patients.length === 0 ? (
            <div className="sc-empty" style={{ padding: '32px 18px' }}>
              <div style={{ fontStyle: 'italic' }}>
                {day.status === 'available'
                  ? 'This is an open day. Once a clinic books it, their patients appear here.'
                  : 'No patients added yet.'}
              </div>
            </div>
          ) : (
            day.patients.map((p, i) => (
              <PatientRow key={p.id} p={p} idx={i} role={role} day={day} onEdit={pt => on.editPatient(day, pt)} onRemove={pt => on.removePatient(day, pt)} entities={entities} onCancel={(pt, reinstate) => on.cancelPatient(day, pt, reinstate)} />
            ))
          )}

          {day.patients.length > 0 && (
            <React.Fragment>
              <div className="sc-sec-label">Billing · batched to clinic</div>
              <window.InvoicePanel entity={entity || window.SchedEntities.day(day, window.SCHED.CLINICS.map(window.SchedAccounts.fromClinic))} role={role} on={on} />
            </React.Fragment>
          )}
        </div>

        {footer.length > 0 && <div className="sc-drawer-foot">{footer}</div>}
      </aside>
    </React.Fragment>
  );
}

/* ============================================================
   PATIENT EDITOR MODAL
   ============================================================ */
const EMPTY_PATIENT = {
  name: '', species: 'Canine', breed: '', sex: 'M/N', age: '', weight: '', occupation: '',
  service: 'scan', injections: 0, rush: false, rushBy: '',
  owner: '', vet: '', sites: [], visitType: 'initial', rate: 'initial',
  demeanor: 'calm', fasted: true, history: '', notes: '', files: [], aiSummary: null,
};

const SC_FILE_BADGE = (f) => (f && f.external ? 'LINK' : { dicom: 'DCM', image: 'IMG', pdf: 'PDF', video: 'VID', doc: 'DOC' }[window.schedFileKind(f)] || 'FILE');

function PatientEditorModal({ day, patient, role, onSave, onClose }) {
  const [f, setF] = useState(() => patient ? { ...patient, files: patient.files || [] } : { ...EMPTY_PATIENT, vet: '' });
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));
  const toggleSite = (id) => setF(prev => ({ ...prev, sites: prev.sites.includes(id) ? prev.sites.filter(s => s !== id) : [...prev.sites, id] }));
  const addFiles = (fileList) => {
    const items = Array.from(fileList).map(file => ({ name: file.name, kind: window.schedFileKind(file.name), url: URL.createObjectURL(file), file }));
    setF(prev => ({ ...prev, files: [...(prev.files || []), ...items] }));
  };
  const rmFile = (i) => setF(prev => ({ ...prev, files: prev.files.filter((_, idx) => idx !== i) }));
  const [linking, setLinking] = useState(false);
  const [lk, setLk] = useState({ url: '', label: '', modality: 'Radiograph', date: '' });
  const addLink = () => {
    const url = lk.url.trim();
    if (!/^https?:\/\//i.test(url)) return;
    const entry = {
      name: (lk.label.trim() || url.replace(/^https?:\/\//, '').slice(0, 48)) + (lk.date ? ' · ' + lk.date : ''),
      kind: window.schedFileKind(url), url, external: true, modality: lk.modality, studyDate: lk.date || null,
    };
    setF(prev => ({ ...prev, files: [...(prev.files || []), entry] }));
    setLk({ url: '', label: '', modality: 'Radiograph', date: '' }); setLinking(false);
  };

  /* AI / rule-based intake review → prefill blanks, attach docs, keep the summary */
  const applyIntake = (fields, review, attachments) => {
    const used = [];
    const L = window.SCHED_AI_LABELS || {};
    const next = { ...f, files: [...(f.files || []), ...attachments] };
    Object.keys(fields || {}).forEach(k => {
      if (k === 'sites') {
        const merged = Array.from(new Set([...(next.sites || []), ...fields.sites]));
        if (merged.length !== (next.sites || []).length) { next.sites = merged; used.push(L.sites || 'Sites'); }
        return;
      }
      const cur = next[k];
      const empty = Array.isArray(cur) ? cur.length === 0 : (cur == null || cur === '');
      if (k === 'fasted' || k === 'demeanor' || k === 'species' || k === 'sex' || k === 'visitType') {
        // these have defaults — only overwrite when the paperwork is explicit and differs
        if (fields[k] !== cur) { next[k] = fields[k]; used.push(L[k] || k); }
        return;
      }
      if (empty) { next[k] = fields[k]; used.push(L[k] || k); }
    });
    next.rate = next.service || 'scan';
    next.aiSummary = {
      engine: review.engine, summary: review.summary || '', keyPoints: review.keyPoints || [],
      mskPoints: review.mskPoints || [], medicalPoints: review.medicalPoints || [],
      flags: review.flags || [], at: new Date().toISOString(), docs: attachments.map(a => a.name),
    };
    setF(next);
    return used;
  };
  const sed = S().sedation(f);
  const missing = [
    !f.name.trim() && 'patient name', !f.breed.trim() && 'breed', !f.owner.trim() && 'owner',
    !f.vet.trim() && 'referring DVM', !f.weight.trim() && 'weight', !f.occupation.trim() && 'occupation',
    f.sites.length === 0 && 'at least one site',
  ].filter(Boolean);
  const valid = missing.length === 0;

  return (
    <div className="sc-modal-overlay" onClick={onClose}>
      <div className="sc-modal wide" onClick={e => e.stopPropagation()}>
        <div className="sc-modal-eyebrow">{patient ? 'Edit patient' : 'Add patient'} · {S().fmtLong(day.date)}</div>
        <h2 className="sc-modal-h">{patient ? patient.name : 'New patient'}</h2>
        <p className="sc-modal-sub">Everything Dr. Canapp needs to walk in and scan — record it here so the day runs without a single phone call.</p>

        <window.SchedIntakeReview onApply={applyIntake} />

        <div className="sc-pat-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="form-row"><label className="form-label">Patient name<span className="req">*</span></label><input className="form-input" value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Ranger" /></div>
          <div className="form-row"><label className="form-label">Breed<span className="req">*</span></label><input className="form-input" value={f.breed} onChange={e => set('breed', e.target.value)} placeholder="e.g. German Shepherd" /></div>
          <div className="form-row"><label className="form-label">Sex</label>
            <select className="form-select" value={f.sex} onChange={e => set('sex', e.target.value)}>
              {[['M/N', 'M/N — neutered male'], ['M/I', 'M/I — intact male'], ['F/S', 'F/S — spayed female'], ['F/I', 'F/I — intact female'], ['M/?', 'M — neuter status not stated'], ['F/?', 'F — neuter status not stated']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="form-row"><label className="form-label">Age</label><input className="form-input" value={f.age} onChange={e => set('age', e.target.value)} placeholder="e.g. 5 yr" /></div>
          <div className="form-row"><label className="form-label">Weight<span className="req">*</span></label><input className="form-input" value={f.weight} onChange={e => set('weight', e.target.value)} placeholder="e.g. 41 kg" /></div>
          <div className="form-row"><label className="form-label">Occupation<span className="req">*</span></label>
            <input className="form-input" list="sc-occupations" value={f.occupation} onChange={e => set('occupation', e.target.value)} placeholder="e.g. Agility" />
            <datalist id="sc-occupations">{window.SCHED_OCCUPATIONS.map(o => <option key={o} value={o} />)}</datalist>
          </div>
          <div className="form-row"><label className="form-label">Owner<span className="req">*</span></label><input className="form-input" value={f.owner} onChange={e => set('owner', e.target.value)} placeholder="Owner name" /></div>
          <div className="form-row"><label className="form-label">Referring DVM<span className="req">*</span></label><input className="form-input" value={f.vet} onChange={e => set('vet', e.target.value)} placeholder="Dr. …" /></div>
          <div className="form-row"><label className="form-label">Service</label>
            <select className="form-select" value={f.service || 'scan'} onChange={e => { const v = e.target.value; setF(prev => ({ ...prev, service: v, rate: v, injections: v === 'injection' ? Math.max(1, prev.injections || prev.sites.length || 1) : 0 })); }}>
              <option value="scan">Diagnostic ultrasound · $1,200</option>
              <option value="injection">US-guided / IA injection · $1,200</option>
            </select>
            <div className="form-help">{(f.service || 'scan') === 'injection' ? 'Includes up to 4 sites (US-guided, intra-articular, or a mix).' : 'Flat rate for the visit, whatever the number of regions scanned.'}</div>
          </div>
          <div className="form-row"><label className="form-label">Visit type</label>
            <select className="form-select" value={f.visitType} onChange={e => setF(prev => ({ ...prev, visitType: e.target.value }))}>
              <option value="initial">Initial</option>
              <option value="recheck">Recheck</option>
            </select>
            <div className="form-help">For the record — in-person pricing is the same either way.</div>
          </div>
        </div>

        {(f.service || 'scan') === 'injection' && (
          <div className="sc-pat-grid" style={{ marginTop: 12 }}>
            <div className="form-row"><label className="form-label">Injection sites<span className="req">*</span></label>
              <input className="form-input" type="number" min="1" max="12" value={f.injections || 1} onChange={e => set('injections', Math.max(1, Math.min(12, Number(e.target.value) || 1)))} />
              <div className="form-help">US-guided, intra-articular, or any combination.</div>
            </div>
            <div className="form-row"><label className="form-label">Procedure fee</label>
              <div className="sc-fee-preview">
                <div className="line"><span>Injection (up to 4 sites)</span><b>$1,200</b></div>
                {Math.max(0, (Number(f.injections) || 1) - 4) > 0 && (
                  <div className="line"><span>{Math.max(0, (Number(f.injections) || 1) - 4)} additional × $300</span><b>{S().money(Math.max(0, (Number(f.injections) || 1) - 4) * 300)}</b></div>
                )}
                <div className="line tot"><span>Total</span><b>{S().money(1200 + Math.max(0, (Number(f.injections) || 1) - 4) * 300)}</b></div>
              </div>
            </div>
          </div>
        )}

        <div className="form-row" style={{ marginTop: 14 }}>
          <label className="form-label">Sites for evaluation<span className="req">*</span> <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--ink-4)', fontWeight: 400 }}>— each region is bilateral</span></label>
          <div className="sc-chiprow">
            {S().SITES.map(s => (
              <button key={s.id} className={`sc-chip ${f.sites.includes(s.id) ? 'on' : ''} ${s.sedation ? 'sed' : ''}`} onClick={() => toggleSite(s.id)}>
                {s.name}{s.sedation ? ' ◑' : ''}
              </button>
            ))}
          </div>
        </div>

        <div className="sc-pat-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
          <div className="form-row"><label className="form-label">Demeanor</label>
            <select className="form-select" value={f.demeanor} onChange={e => set('demeanor', e.target.value)}>
              <option value="calm">Calm</option>
              <option value="anxious">Anxious — sedation may be needed</option>
              <option value="reactive">Reactive — sedation for handling</option>
            </select>
          </div>
          <div className="form-row"><label className="form-label">Fasting</label>
            <select className="form-select" value={f.fasted ? 'y' : 'n'} onChange={e => set('fasted', e.target.value === 'y')}>
              <option value="y">Fasted — owner confirmed</option>
              <option value="n">Not yet confirmed</option>
            </select>
          </div>
        </div>

        <div className="form-row" style={{ marginTop: 14 }}>
          <label className="form-label">Reason / clinical history</label>
          <textarea className="form-area" value={f.history} onChange={e => set('history', e.target.value)} placeholder="Presenting complaint, duration, prior imaging / Dx…" />
        </div>

        <div className="form-row" style={{ marginTop: 14 }}>
          <label className="form-label">Records &amp; imaging <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--ink-4)', fontWeight: 400 }}>— radiographs (JPG/PNG), DICOM (.dcm), reports (PDF), or a link to the study</span></label>
          {f.files && f.files.length > 0 && (
            <div className="sc-files-row" style={{ marginBottom: 10 }}>
              {f.files.map((fl, i) => (
                <span key={i} className="sc-filepill upload">
                  <span className="ic">{SC_FILE_BADGE(fl)}</span>{window.schedFileName(fl)}
                  <span className="rm" onClick={() => rmFile(i)} title="Remove">×</span>
                </span>
              ))}
            </div>
          )}
          <div className="sc-ai-actions">
            <label className="sc-upload-btn">
              <input type="file" multiple accept=".dcm,.jpg,.jpeg,.png,.gif,.webp,.pdf,.mp4,.mov" onChange={e => { addFiles(e.target.files); e.target.value = ''; }} style={{ display: 'none' }} />
              + Upload radiographs / files
            </label>
            <button className="sc-upload-btn" onClick={() => setLinking(v => !v)}>{linking ? 'Cancel link' : '⛓ Link a study'}</button>
          </div>
          {linking && (
            <div className="sc-linkbox">
              <div className="sc-pat-grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                <div className="form-row"><label className="form-label">Study link (PACS, Drive, Dropbox, vet portal)</label><input className="form-input" value={lk.url} onChange={e => setLk({ ...lk, url: e.target.value })} placeholder="https://…" /></div>
                <div className="form-row"><label className="form-label">Modality</label>
                  <select className="form-select" value={lk.modality} onChange={e => setLk({ ...lk, modality: e.target.value })}>
                    {['Radiograph', 'CT', 'MRI', 'Ultrasound', 'Report', 'Other'].map(x => <option key={x}>{x}</option>)}
                  </select>
                </div>
                <div className="form-row"><label className="form-label">Label</label><input className="form-input" value={lk.label} onChange={e => setLk({ ...lk, label: e.target.value })} placeholder="e.g. L stifle rads, 3 views" /></div>
                <div className="form-row"><label className="form-label">Study date</label><input className="form-input" type="date" value={lk.date} onChange={e => setLk({ ...lk, date: e.target.value })} /></div>
              </div>
              <button className="btn btn-clay btn-sm" disabled={!/^https?:\/\//i.test(lk.url.trim())} onClick={addLink}>Attach link</button>
            </div>
          )}
          <div className="form-help">Radiographs can be uploaded (JPG/PNG/DICOM) or linked from the clinic's PACS or a shared folder — Dr. Canapp reviews them before the visit.</div>
        </div>

        {(sed.required || sed.likely) && (
          <div className="sc-callout" style={{ marginTop: 6 }}>
            <span className="ic">◑</span>
            <div><strong>{sed.required ? 'This patient will need sedation.' : 'Sedation may be needed.'}</strong> {sed.reason} The clinic prep sheet will instruct the owner to <strong>fast overnight</strong>.</div>
          </div>
        )}

        <div className="sc-modal-actions">
          {missing.length > 0 && <span className="sc-need">Still needed: {missing.join(', ')}</span>}
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-clay" disabled={!valid} onClick={() => onSave(day, { ...f, rate: f.service || 'scan' })}>{patient ? 'Save patient' : 'Add to day'}</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   ASSIGN / BOOK MODAL
   ============================================================ */
function AssignClinicModal({ day, role, mode, onAssign, onClose }) {
  const [sel, setSel] = useState('');
  const isClinic = role === 'clinic';
  const isPublish = mode === 'publish';

  /* Publishing a run of days: an end date plus which weekdays count.
     Defaults to just the day clicked, so the simple case stays one click. */
  const [thru, setThru] = useState('');
  const [wds, setWds] = useState(null); // null = follow the held hospital / all weekdays
  /* With a hospital chosen, the day can either be held for them to claim,
     or booked outright — most dates are agreed on the phone first. */
  const [book, setBook] = useState(true);
  const held = sel ? S().clinic(sel) : null;
  const defaultWds = (held && (held.bookingDays || []).length) ? held.bookingDays : [1, 2, 3, 4, 5];
  const activeWds = wds || defaultWds;

  const dates = useMemo(() => {
    const start = new Date(day.date);
    if (!isPublish || !thru) return [start];
    const end = new Date(thru + 'T12:00');
    if (isNaN(end) || end < start) return [start];
    const out = [];
    const cur = new Date(start);
    while (cur <= end && out.length < 60) {
      if (activeWds.includes(cur.getDay())) out.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out.length ? out : [start];
  }, [day.date, thru, isPublish, activeWds.join(',')]);

  const toggleWd = (i) => setWds(prev => {
    const base = prev || defaultWds;
    return base.includes(i) ? base.filter(x => x !== i) : [...base, i].sort();
  });

  return (
    <div className="sc-modal-overlay" onClick={onClose}>
      <div className="sc-modal" onClick={e => e.stopPropagation()}>
        <div className="sc-modal-eyebrow">{isPublish ? 'Open clinic days' : isClinic ? 'Book a clinic day' : 'Assign clinic'} · {S().fmtLong(day.date)}</div>
        <h2 className="sc-modal-h">{isPublish ? (dates.length > 1 ? `Publish ${dates.length} days` : 'Publish this day') : isClinic ? 'Claim this open day' : 'Which clinic is this day for?'}</h2>
        <p className="sc-modal-sub">
          {isPublish
            ? 'Leave the hospital blank to let any clinic book these. Choose a hospital and you can either book the days outright or hold them for the hospital to claim.'
            : isClinic
            ? 'You are booking Dr. Canapp for an in-person MSK ultrasound day at your hospital. After booking, add the patients you want seen.'
            : 'Attach a hospital to this open day. They can then load their patient roster.'}
        </p>
        <div className="form-row">
          <label className="form-label">{isPublish ? 'Which hospital (optional)' : 'Clinic / hospital'}</label>
          <select className="form-select" value={sel} onChange={e => { setSel(e.target.value); setWds(null); }}>
            <option value="">{isPublish ? 'Open to any hospital' : 'Select a clinic…'}</option>
            {S().CLINICS.map(c => <option key={c.id} value={c.id}>{c.name} — {c.city}, {c.state}</option>)}
          </select>
        </div>

        {isPublish && sel && (
          <div className="form-row" style={{ marginTop: 12 }}>
            <label className="form-label">And are these agreed already?</label>
            <div className="sc-chiprow">
              <button className={`sc-chip ${book ? 'on' : ''}`} onClick={() => setBook(true)}>Book outright</button>
              <button className={`sc-chip ${!book ? 'on' : ''}`} onClick={() => setBook(false)}>Hold for them to claim</button>
            </div>
            <div className="form-help">
              {book
                ? `Booked and on both calendars. ${held ? held.name : 'They'} can load their roster straight away.`
                : `Only ${held ? held.name : 'they'} will see the days, and nothing is confirmed until they claim them.`}
            </div>
          </div>
        )}

        {isPublish && (
          <React.Fragment>
            <div className="form-row" style={{ marginTop: 12 }}>
              <label className="form-label">Through <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--ink-4)', fontWeight: 400 }}>— optional, to open a block of days</span></label>
              <input className="form-input" type="date" value={thru} min={S().iso(new Date(day.date))} onChange={e => setThru(e.target.value)} />
              <div className="form-help">Leave blank to publish just {S().fmtLong(day.date)}.</div>
            </div>
            {thru && (
              <div className="form-row">
                <label className="form-label">On these weekdays</label>
                <div className="sc-chiprow">
                  {S().WEEKDAYS.map((w, i) => (
                    <button key={w} className={`sc-chip ${activeWds.includes(i) ? 'on' : ''}`} onClick={() => toggleWd(i)}>{w}</button>
                  ))}
                </div>
                {held && <div className="form-help">{held.name} books {(held.bookingDays || []).map(i => S().WEEKDAYS[i]).join(' · ') || 'any weekday'}.</div>}
              </div>
            )}
            {dates.length > 1 && (
              <div className="sc-fee-preview" style={{ marginTop: 10 }}>
                <div className="line"><span>{dates.length} days will {sel && book ? 'be booked' : 'open'}</span><b>{S().fmtLong(dates[0])} – {S().fmtLong(dates[dates.length - 1])}</b></div>
                <div className="line" style={{ color: 'var(--ink-4)', fontSize: 11.5 }}><span>{dates.slice(0, 8).map(d => S().fmtLong(d).replace(/^\w+, /, '')).join(' · ')}{dates.length > 8 ? ' · +' + (dates.length - 8) + ' more' : ''}</span></div>
              </div>
            )}
          </React.Fragment>
        )}

        <div className="sc-modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-clay" disabled={!isPublish && !sel} onClick={() => onAssign(day, sel, isPublish ? dates : null, isPublish && !!sel && book)}>
            {isPublish
              ? (sel && book
                  ? (dates.length > 1 ? `Book ${dates.length} days` : 'Book this day')
                  : (dates.length > 1 ? `Publish ${dates.length} days` : 'Publish day'))
              : isClinic ? 'Book this day' : 'Assign clinic'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- digital signature pad (canvas; mouse + touch) --------- */
function SignaturePad({ onChange }) {
  const ref = useRef(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#18211c';
    canvas._ctx = ctx;
    canvas._rect = rect;
  }, []);

  const pos = (e) => {
    const canvas = ref.current;
    const rect = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  };
  const start = (e) => { e.preventDefault(); drawing.current = true; const { x, y } = pos(e); const ctx = ref.current._ctx; ctx.beginPath(); ctx.moveTo(x, y); };
  const move = (e) => { if (!drawing.current) return; e.preventDefault(); const { x, y } = pos(e); const ctx = ref.current._ctx; ctx.lineTo(x, y); ctx.stroke(); dirty.current = true; };
  const end = () => { if (drawing.current && dirty.current) { onChange && onChange(ref.current.toDataURL('image/png')); } drawing.current = false; };
  const clear = () => { const canvas = ref.current; canvas._ctx.clearRect(0, 0, canvas.width, canvas.height); dirty.current = false; onChange && onChange(null); };

  return (
    <div className="sc-sigpad-wrap">
      <canvas ref={ref} className="sc-sigpad"
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
      <button type="button" className="sc-sig-clear" onClick={clear}>Clear</button>
    </div>
  );
}

/* ============================================================
   CONSENT SIGN-OFF  — referring vet signs; saved into the day.
   No printing; this becomes a record on the clinic-day profile.
   ============================================================ */
function SignoffModal({ day, role, onSave, onRemove, onClose }) {
  const clinic = day.clinic ? S().clinic(day.clinic) : null;
  const roster = S().active(day);
  const existing = day.signoff || null;
  const [mode, setMode] = useState('draw');   // draw | type
  const [typed, setTyped] = useState('');
  const [drawn, setDrawn] = useState(null);    // dataURL
  const [name, setName] = useState(clinic ? clinic.contact : '');
  const hasSig = mode === 'type' ? typed.trim().length > 0 : !!drawn;
  const canSave = name.trim().length > 0 && hasSig;

  const save = () => {
    onSave(day, {
      name: name.trim(),
      role: 'referring veterinarian',
      mode,
      data: mode === 'type' ? typed.trim() : drawn,
      at: new Date().toISOString(),
    });
  };

  return (
    <div className="sc-modal-overlay" onClick={onClose}>
      <div className="sc-modal wide" onClick={e => e.stopPropagation()} style={{ padding: 0 }}>
        <div className="sc-prep">
          <div className="sc-prep-head">
            <div>
              <div className="sc-prep-brand">Dr. Debra Canapp<div className="sub">MSK Ultrasound · Referring-Vet Consent Sign-off</div></div>
            </div>
            <div className="sc-prep-meta">
              {clinic ? clinic.name : 'Clinic'}<br />
              {S().fmtLong(day.date)}, {day.date.getFullYear()}<br />
              {roster.length} patient{roster.length === 1 ? '' : 's'}
            </div>
          </div>
          <div className="sc-prep-body">
            <div className="sc-prep-h">Acknowledgements</div>
            <div className="sc-rule-list">
              <div className="sc-rule"><span className="mk">✦</span><div><strong>Owner consent is handled by the clinic.</strong> Owners must sign the clinic's own consent forms for the ultrasound and, where sedation is anticipated or needed, the clinic's sedation/anesthesia consent. These remain on file at the clinic.</div></div>
              <div className="sc-rule"><span className="mk">✦</span><div><strong>Patients arrive fasted.</strong> No food after 10 pm the night before, in case sedation is needed. Water is fine.</div></div>
              <div className="sc-rule"><span className="mk">✦</span><div><strong>Iliopsoas scans require sedation</strong> (dorsal recumbency); sedation is administered and overseen by the clinic.</div></div>
              <div className="sc-rule"><span className="mk">✦</span><div><strong>The patient remains the responsibility of the overseeing veterinarian</strong> throughout the visit, including any sedation and recovery. Findings are communicated to the referring veterinarian only.</div></div>
            </div>

            {existing ? (
              <React.Fragment>
                <div className="sc-prep-h">Signed</div>
                <div className="sc-signed-record">
                  <div className="sig-show">
                    {existing.mode === 'type'
                      ? <span className="sc-sig-script">{existing.data}</span>
                      : <img src={existing.data} alt="signature" />}
                  </div>
                  <div className="sig-meta">
                    <div className="nm">{existing.name}</div>
                    <div className="rl">Referring veterinarian · signed {S().fmtLong(new Date(existing.at))}, {new Date(existing.at).getFullYear()}</div>
                  </div>
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.6, marginTop: 14 }}>
                  This sign-off is stored on the clinic-day record{clinic ? <> for <strong>{clinic.name}</strong></> : ''} and can be referenced any time.
                </p>
              </React.Fragment>
            ) : (
              <React.Fragment>
                <div className="sc-prep-h">Referring veterinarian sign-off</div>
                <p style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 12 }}>
                  By signing, the referring veterinarian confirms the patients are fasted and prepared as instructed, that the required owner consent forms are signed and on file, and that the clinic will administer and oversee any sedation.
                </p>
                <div className="form-row" style={{ marginBottom: 14 }}>
                  <label className="form-label">Signed by</label>
                  <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Referring veterinarian name" />
                </div>
                <div className="sc-sig-toggle">
                  <button type="button" className={mode === 'draw' ? 'on' : ''} onClick={() => setMode('draw')}>Draw signature</button>
                  <button type="button" className={mode === 'type' ? 'on' : ''} onClick={() => setMode('type')}>Type signature</button>
                </div>
                <div className="sc-sign-block">
                  {mode === 'draw'
                    ? <SignaturePad onChange={setDrawn} />
                    : <input className="form-input sc-sig-typed" value={typed} onChange={e => setTyped(e.target.value)} placeholder="Type full name to sign" />}
                  <div className="sc-sign-cap-row">
                    <span className="sc-sign-cap">Referring veterinarian signature</span>
                  </div>
                </div>
              </React.Fragment>
            )}
          </div>
        </div>
        <div className="sc-modal-actions" style={{ padding: '16px 32px', margin: 0 }}>
          {existing
            ? <React.Fragment>
                <button className="btn btn-ghost" onClick={onClose}>Close</button>
                {role === 'clinic' && <button className="btn btn-ghost" style={{ borderColor: 'var(--clay)', color: 'var(--clay-deep)' }} onClick={() => onRemove(day)}>Remove &amp; re-sign</button>}
              </React.Fragment>
            : <React.Fragment>
                <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                <button className="btn btn-clay" disabled={!canSave} onClick={save}>Save sign-off</button>
              </React.Fragment>}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   DAY SHEET  — Dr. Canapp's printable organizer for the visit.
   Clinic info + referring vets + full patient detail. Built to print.
   ============================================================ */
function DaySheetModal({ day, onClose }) {
  const clinic = day.clinic ? S().clinic(day.clinic) : null;
  const roster = S().active(day);
  const sedCount = roster.filter(p => S().sedation(p).required).length;

  return (
    <div className="sc-modal-overlay" onClick={onClose}>
      <div className="sc-modal wide sc-daysheet-modal" onClick={e => e.stopPropagation()} style={{ padding: 0 }}>
        <div className="sc-daysheet" id="sc-daysheet-print">
          <div className="sc-ds-head">
            <div>
              <div className="sc-ds-brand">Dr. Debra Canapp</div>
              <div className="sc-ds-sub">MSK Ultrasound · Day Sheet</div>
            </div>
            <div className="sc-ds-date">
              <div className="big">{S().fmtLong(day.date)}</div>
              <div className="yr">{day.date.getFullYear()}</div>
            </div>
          </div>

          <div className="sc-ds-clinic">
            <div className="sc-ds-clinic-main">
              <div className="lab">Clinic</div>
              <div className="nm">{clinic ? clinic.name : 'Open day'}</div>
              {clinic && <div className="addr">{clinic.city}, {clinic.state} · {clinic.miles} mi{clinic.region === 'ca' ? ' (CA trip)' : ''}</div>}
            </div>
            {clinic && (
              <div className="sc-ds-clinic-contact">
                <div className="lab">Primary contact</div>
                <div className="nm">{clinic.contact}</div>
                <div className="addr">{clinic.phone} · {clinic.email}</div>
              </div>
            )}
            <div className="sc-ds-clinic-count">
              <div className="lab">Patients</div>
              <div className="big">{roster.length}</div>
              {sedCount > 0 && <div className="sed">{sedCount} need sedation</div>}
            </div>
          </div>

          <div className="sc-ds-patients">
            {roster.length === 0 ? (
              <div style={{ fontStyle: 'italic', color: 'var(--ink-3)', padding: '20px 0' }}>No patients on the roster yet.</div>
            ) : roster.map((p, i) => {
              const sed = S().sedation(p);
              return (
                <div key={p.id} className="sc-ds-pat">
                  <div className="sc-ds-pat-ord">{i + 1}</div>
                  <div className="sc-ds-pat-main">
                    <div className="sc-ds-pat-name">{p.name} <span className="sig">· {[p.breed, p.sex ? S().fmtSex(p.sex, true) : '', p.age, p.weight, p.occupation].filter(Boolean).join(' · ')}</span></div>
                    <div className="sc-ds-pat-row"><span className="k">Owner</span>{p.owner}</div>
                    <div className="sc-ds-pat-row"><span className="k">Referring</span>{p.vet}</div>
                    <div className="sc-ds-pat-row"><span className="k">Sites</span>{p.sites.map(s => S().site(s).name).join(', ')}</div>
                    <div className="sc-ds-pat-row"><span className="k">History</span><span className="hist">{p.history || '—'}</span></div>
                    {p.aiSummary && p.aiSummary.summary && <div className="sc-ds-pat-row"><span className="k">Intake summary</span><span className="hist">{p.aiSummary.summary}</span></div>}
                    {p.aiSummary && (p.aiSummary.mskPoints || p.aiSummary.keyPoints || []).length > 0 && <div className="sc-ds-pat-row"><span className="k">Ortho / sports med</span><span className="hist">{(p.aiSummary.mskPoints && p.aiSummary.mskPoints.length ? p.aiSummary.mskPoints : p.aiSummary.keyPoints).join(' · ')}</span></div>}
                    {p.aiSummary && (p.aiSummary.medicalPoints || []).length > 0 && <div className="sc-ds-pat-row"><span className="k">Medical notes</span><span className="hist">{p.aiSummary.medicalPoints.join(' · ')}</span></div>}
                    {p.notes && <div className="sc-ds-pat-row"><span className="k">Notes</span>{p.notes}</div>}
                    {p.files && p.files.length > 0 && <div className="sc-ds-pat-row"><span className="k">Records</span>{p.files.map(window.schedFileName).join(' · ')}</div>}
                  </div>
                  <div className="sc-ds-pat-tags">
                    <span className="t type">{p.service === 'injection' ? 'Injection · ' + (p.injections || 1) + ' site' + ((p.injections || 1) === 1 ? '' : 's') : p.visitType === 'recheck' ? 'Recheck' : 'Initial'}{p.rush ? ' · STAT · 24 hr' : ''}</span>
                    <span className={`t ${sed.required ? 'sed' : sed.likely ? 'maybe' : 'no'}`}>{sed.required ? 'Sedation' : sed.likely ? 'Sedation?' : 'No sedation'}</span>
                    <span className={`t ${p.fasted ? 'fast' : 'unfast'}`}>{p.fasted ? 'Fasted ✓' : 'Fasting unconfirmed'}</span>
                    <span className="t demeanor">{p.demeanor}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="sc-ds-foot">
            Findings are communicated to the referring veterinarian only · The patient remains the responsibility of the overseeing veterinarian.
          </div>
        </div>
        <div className="sc-modal-actions no-print" style={{ padding: '16px 32px', margin: 0 }}>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-clay" onClick={() => window.print()}>Print day sheet</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   CLINIC PROFILE EDITOR — color, booking weekdays, max cases/day.
   Used to finalize a newly-invited clinic AND to edit any clinic later.
   ============================================================ */
function ClinicProfileModal({ clinic, onSave, onClose }) {
  const S = window.SCHED;
  const isNew = clinic.status === 'pending';
  const [f, setF] = useState(() => ({
    name: clinic.name || '', city: clinic.city || '', state: clinic.state || '',
    contact: clinic.contact || '', email: clinic.email || '', phone: clinic.phone || '',
    color: clinic.color || S.PALETTE[0],
    bookingDays: [...(clinic.bookingDays || [])],
    maxCasesPerDay: clinic.maxCasesPerDay || 4,
    billTo: clinic.billTo || '', billingAttn: clinic.billingAttn || '',
    billingEmail: clinic.billingEmail || '', billingAddress: clinic.billingAddress || '',
    termsDays: clinic.termsDays == null ? '' : String(clinic.termsDays),
    rateOverrides: { ...(clinic.rateOverrides || {}) },
  }));
  const R = window.SchedRates;
  const B = window.SchedBill;
  const setRate = (id, v) => setF(prev => {
    const next = { ...prev.rateOverrides };
    if (v === '' || v == null) delete next[id]; else next[id] = Number(v);
    return { ...prev, rateOverrides: next };
  });
  const overrideCount = Object.keys(f.rateOverrides).length;
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));
  const toggleDay = (i) => setF(prev => ({ ...prev, bookingDays: prev.bookingDays.includes(i) ? prev.bookingDays.filter(x => x !== i) : [...prev.bookingDays, i].sort() }));
  const valid = f.name.trim() && f.color && f.bookingDays.length > 0 && f.maxCasesPerDay >= 1;

  return (
    <div className="sc-modal-overlay" onClick={onClose}>
      <div className="sc-modal wide" onClick={e => e.stopPropagation()}>
        <div className="sc-modal-eyebrow">{isNew ? 'Finalize hospital profile' : 'Edit hospital profile'}</div>
        <h2 className="sc-modal-h" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="sc-color-chip" style={{ background: f.color }} />{f.name || 'New hospital'}
        </h2>
        {isNew && <p className="sc-modal-sub">This hospital submitted the intake form. Confirm their details, assign a color, set which weekdays they may book and how many cases per day — then activate the account.</p>}
        {clinic.intakeNote && isNew && <div className="sc-callout" style={{ marginBottom: 16 }}><span className="ic">◑</span><div><strong>From their intake:</strong> {clinic.intakeNote}{clinic.canSedate === false && <> <strong>Note:</strong> cannot sedate in-house.</>}</div></div>}

        <div className="sc-pat-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="form-row"><label className="form-label">Hospital name<span className="req">*</span></label><input className="form-input" value={f.name} onChange={e => set('name', e.target.value)} /></div>
          <div className="form-row"><label className="form-label">Primary contact</label><input className="form-input" value={f.contact} onChange={e => set('contact', e.target.value)} placeholder="Dr. …" /></div>
          <div className="form-row"><label className="form-label">City</label><input className="form-input" value={f.city} onChange={e => set('city', e.target.value)} /></div>
          <div className="form-row"><label className="form-label">State</label><input className="form-input" value={f.state} onChange={e => set('state', e.target.value)} /></div>
          <div className="form-row"><label className="form-label">Email</label><input className="form-input" value={f.email} onChange={e => set('email', e.target.value)} /></div>
          <div className="form-row"><label className="form-label">Phone</label><input className="form-input" value={f.phone} onChange={e => set('phone', e.target.value)} /></div>
        </div>

        <div className="form-row" style={{ marginTop: 16 }}>
          <label className="form-label">Hospital color <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--ink-4)', fontWeight: 400 }}>— for at-a-glance recognition on the calendar</span></label>
          <div className="sc-swatch-row">
            {S.PALETTE.map(col => (
              <button key={col} type="button" className={`sc-swatch ${f.color === col ? 'on' : ''}`} style={{ background: col }} onClick={() => set('color', col)} aria-label={col}>
                {f.color === col && <span className="chk">✓</span>}
              </button>
            ))}
            <label className="sc-swatch-custom" title="Custom color">
              <input type="color" value={f.color} onChange={e => set('color', e.target.value)} />
            </label>
          </div>
        </div>

        <div className="sc-pat-grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 14, marginTop: 16, alignItems: 'start' }}>
          <div className="form-row">
            <label className="form-label">Bookable weekdays<span className="req">*</span></label>
            <div className="sc-daytoggle">
              {S.WEEKDAYS.map((wd, i) => (
                <button key={i} type="button" className={`sc-daybtn ${f.bookingDays.includes(i) ? 'on' : ''} ${i === 0 || i === 6 ? 'wknd' : ''}`} onClick={() => toggleDay(i)}>{wd}</button>
              ))}
            </div>
            <div className="form-help">Days this hospital is allowed to book Dr. Canapp.</div>
          </div>
          <div className="form-row">
            <label className="form-label">Max cases / day<span className="req">*</span></label>
            <input className="form-input" type="number" min="1" max="12" value={f.maxCasesPerDay} onChange={e => set('maxCasesPerDay', parseInt(e.target.value) || 1)} />
            <div className="form-help">Patient cap per clinic day.</div>
          </div>
        </div>

        <details className="sc-billing-block" open={overrideCount > 0}>
          <summary>Billing — who is invoiced, terms, and this hospital's own prices{overrideCount > 0 ? ` · ${overrideCount} price${overrideCount === 1 ? '' : 's'} set` : ''}</summary>
          <div className="sc-pat-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-row"><label className="form-label">Invoice addressed to</label><input className="form-input" value={f.billTo} onChange={e => set('billTo', e.target.value)} placeholder={f.name || 'The hospital'} /></div>
            <div className="form-row"><label className="form-label">Attention</label><input className="form-input" value={f.billingAttn} onChange={e => set('billingAttn', e.target.value)} placeholder={f.contact || 'Accounts payable'} /></div>
            <div className="form-row"><label className="form-label">Billing email</label><input className="form-input" type="email" value={f.billingEmail} onChange={e => set('billingEmail', e.target.value)} placeholder={f.email || 'billing@hospital.com'} /></div>
            <div className="form-row"><label className="form-label">Payment terms</label><input className="form-input" type="number" min="0" max="90" value={f.termsDays} onChange={e => set('termsDays', e.target.value)} placeholder="15" /><div className="form-help">Days. Blank uses the standard Net 15.</div></div>
          </div>
          <div className="form-row"><label className="form-label">Billing address</label><input className="form-input" value={f.billingAddress} onChange={e => set('billingAddress', e.target.value)} placeholder={[f.city, f.state].filter(Boolean).join(', ')} /></div>

          <div className="sc-sec-label" style={{ marginTop: 18 }}>Prices for this hospital</div>
          <p className="form-help" style={{ margin: '0 0 10px' }}>
            Leave a row blank to use the standard rate card. Anything you set here applies only to this
            hospital, on work dated from now on and on anything not yet invoiced.
          </p>
          <div className="sc-rate-ov">
            {(R ? R.ROWS : []).map(r => {
              const std = (B.RATES[r.id] || {}).amount || 0;
              const val = f.rateOverrides[r.id];
              return (
                <div key={r.id} className={`ov-row ${val != null ? 'on' : ''}`}>
                  <div className="lb">{r.label}<span className="std">standard {S.money(std)}</span></div>
                  <div className="in">
                    <span className="cur">$</span>
                    <input className="form-input" type="number" min="0" step="25" value={val == null ? '' : val}
                      onChange={e => setRate(r.id, e.target.value)} placeholder={String(std)} />
                    {val != null && <button type="button" className="sb-x" title="Use the standard rate" onClick={() => setRate(r.id, '')}>×</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </details>

        <div className="sc-modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-clay" disabled={!valid} onClick={() => {
            const patch = { ...f, termsDays: f.termsDays === '' ? null : Number(f.termsDays), status: 'active', account: 'active' };
            // only touch the overrides column when it is actually in play
            if (!overrideCount) { if (clinic.rateOverrides) patch.rateOverrides = null; else delete patch.rateOverrides; }
            onSave(clinic, patch);
          }}>{isNew ? 'Activate hospital' : 'Save profile'}</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  SchedPill, PatChip, SiteList, PatientRow, SCHED_EMPTY_PATIENT: EMPTY_PATIENT,
  DayDrawer, PatientEditorModal, AssignClinicModal, SignoffModal, DaySheetModal, ClinicProfileModal,
});
