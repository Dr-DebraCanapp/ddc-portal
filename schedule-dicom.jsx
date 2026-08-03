/* global React, window */
/* ============================================================
   DICOM matching — clinic patient IDs and the device registry.

   Two identifiers do the work when a clinic machine sends a study:
     · the calling AE Title says WHICH PRACTICE sent it (device registry)
     · the Accession Number says WHICH PATIENT it belongs to (clinic patient ID)
   Patient-name matching stays as the fallback for when the tech skips
   the code. Loads after schedule-data.jsx.
   ============================================================ */
const { useState: sdUseState, useEffect: sdUseEffect } = React;

/* The clinic's own patient ID travels with the study as the Accession
   Number. We never invent one — the tech shouldn't have to change what
   their practice system already calls this patient. */
const sdNorm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const sdCodeMatches = (a, b) => !!sdNorm(a) && sdNorm(a) === sdNorm(b);

function StudyCodeField({ value, onChange, compact }) {
  const code = value || '';
  return (
    <div className="form-row sd-code-row">
      <label className="form-label">Clinic patient ID <span className="sd-opt">— for direct DICOM send</span></label>
      <input className="form-input mono sd-code-input" value={code} placeholder="as it reads in your system"
        onChange={e => onChange(e.target.value)} maxLength={32} />
      {!compact && (
        <div className="form-help">
          The ID this patient already has in the clinic's own records. Their machine sends it as the
          <strong> Accession Number</strong>, so the study files onto this patient by itself — nothing to
          change on their end. Leave it blank and we fall back to matching the patient's name, which is softer.
        </div>
      )}
    </div>
  );
}

/* Unrouted studies that look like they belong to the patient being edited.
   Offered as a link rather than applied silently — a wrong auto-file on a
   medical record is worse than one extra click. */
function IncomingStudyLink({ code, name, picked, onPick }) {
  const [studies, setStudies] = sdUseState(null);
  sdUseEffect(() => {
    let alive = true;
    (async () => {
      const Cloud = window.SchedCloud;
      if (!Cloud || !Cloud.configured || !Cloud.loadUnroutedStudies) { setStudies([]); return; }
      try { const list = await Cloud.loadUnroutedStudies(); if (alive) setStudies(list); }
      catch (e) { if (alive) setStudies([]); }
    })();
    return () => { alive = false; };
  }, []);

  if (!studies || !studies.length) return null;
  const nm = String(name || '').toLowerCase().trim();
  const hits = studies.filter(st =>
    (code && sdCodeMatches(st.accession, code)) ||
    (nm.length > 2 && String(st.patientName || '').toLowerCase().replace(/[\^,_]+/g, ' ').includes(nm))
  );
  if (!hits.length) return null;

  return (
    <div className="sd-link-box">
      <div className="sd-link-h">{hits.length === 1 ? 'A study is waiting that matches this patient' : `${hits.length} studies are waiting that match this patient`}</div>
      {hits.map(st => {
        const on = picked === st.id;
        return (
          <div key={st.id} className={`sd-link-row ${on ? 'on' : ''}`}>
            <div className="l">
              <div className="nm">{st.patientName} <span className="mono">{st.accession ? '· ' + st.accession : ''}</span></div>
              <div className="mt">{st.modality || 'US'} · {st.images || 0} images · {st.device || 'unknown device'}{st.clinicName ? ' · ' + st.clinicName : ''}</div>
            </div>
            <button type="button" className={`btn btn-sm ${on ? 'btn-ghost' : 'btn-clay'}`} onClick={() => onPick(on ? null : st.id)}>
              {on ? 'Linked ✓' : 'Link to this patient'}
            </button>
          </div>
        );
      })}
      <div className="sd-link-foot">Linking files the study onto this patient's records when you save.</div>
    </div>
  );
}

/* ============================================================
   DEVICE REGISTRY — Imaging → Device setup
   ============================================================ */
function DeviceRegistry({ clinics, flash, oops }) {
  const [devices, setDevices] = sdUseState(null);
  const [editing, setEditing] = sdUseState(null);

  const load = async () => {
    const Cloud = window.SchedCloud;
    if (!Cloud || !Cloud.configured || !Cloud.loadDevices) { setDevices([]); return; }
    try { setDevices(await Cloud.loadDevices()); } catch (e) { setDevices([]); }
  };
  sdUseEffect(() => { load(); }, []);

  const save = async (d) => {
    try {
      await window.SchedCloud.saveDevice(d);
      setEditing(null); await load();
      flash && flash(`${d.name} registered — studies sent as ${d.aeTitle} are attributed to that hospital.`);
    } catch (e) { oops && oops(e.message); }
  };
  const remove = async (d) => {
    if (!window.confirm(`Remove ${d.name}? Studies from ${d.aeTitle} will arrive unattributed.`)) return;
    try { await window.SchedCloud.deleteDevice(d.id); await load(); flash && flash('Device removed.'); }
    catch (e) { oops && oops(e.message); }
  };

  return (
    <div className="sd-registry">
      <div className="sd-reg-head">
        <div>
          <div className="dh">Registered clinic devices</div>
          <p className="sd-reg-sub">Each machine identifies itself by its calling AE Title. A study from a
          registered device is attributed to that hospital automatically; anything else lands unattributed
          for you to assign by hand.</p>
        </div>
        <button className="btn btn-clay btn-sm" onClick={() => setEditing({ id: '', name: '', aeTitle: '', clinicId: '', ip: '', modality: 'US', status: 'active', note: '' })}>
          + Register a device
        </button>
      </div>

      {devices === null ? <div className="sd-reg-empty">Loading…</div>
        : devices.length === 0 ? (
          <div className="sd-reg-empty">
            No devices registered yet. Add one per clinic machine — you'll need the AE Title their tech sets
            on the ultrasound or radiology unit.
          </div>
        ) : (
          <div className="sc-device-list">
            {devices.map(d => {
              const c = (clinics || []).find(x => x.id === d.clinicId);
              return (
                <div key={d.id} className="sc-device">
                  <span className="sw" style={{ background: c ? c.color : 'var(--ink-4)' }} />
                  <div className="dn">{d.name}<div className="sub">{c ? c.name : 'No hospital linked'}{d.ip ? ' · ' + d.ip : ''}</div></div>
                  <div className="ae mono">AE: {d.aeTitle}</div>
                  <span className={`sc-acct ${d.status === 'active' ? 'active' : ''}`}>{d.status === 'active' ? 'Active' : 'Paused'}</span>
                  <div className="sd-dev-btns">
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(d)}>Edit</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => remove(d)}>Remove</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      {editing && <DeviceModal device={editing} clinics={clinics} onSave={save} onClose={() => setEditing(null)} />}
    </div>
  );
}

function DeviceModal({ device, clinics, onSave, onClose }) {
  const [f, setF] = sdUseState(() => ({ ...device }));
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));
  const isNew = !device.id;
  const valid = f.name.trim() && /^[A-Za-z0-9_-]{1,16}$/.test(f.aeTitle.trim());

  const submit = () => onSave({
    ...f,
    id: f.id || 'dev-' + Date.now().toString(36),
    name: f.name.trim(),
    aeTitle: f.aeTitle.trim().toUpperCase(),
    clinicId: f.clinicId || null,
  });

  return (
    <div className="sc-modal-overlay" onClick={onClose}>
      <div className="sc-modal" onClick={e => e.stopPropagation()}>
        <div className="sc-modal-eyebrow">{isNew ? 'Register a device' : 'Edit device'}</div>
        <h2 className="sc-modal-h">{f.name || 'Clinic machine'}</h2>
        <p className="sc-modal-sub">
          The AE Title is whatever their tech enters as the <em>calling</em> AE on the machine. It must match
          exactly — that string is how we know whose study it is.
        </p>
        <div className="sc-pat-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="form-row"><label className="form-label">Device name<span className="req">*</span></label>
            <input className="form-input" value={f.name} onChange={e => set('name', e.target.value)} placeholder="Bowie — GE Logiq E10" /></div>
          <div className="form-row"><label className="form-label">Calling AE Title<span className="req">*</span></label>
            <input className="form-input mono" value={f.aeTitle} onChange={e => set('aeTitle', e.target.value.toUpperCase())} placeholder="BOWIE_MOD" maxLength={16} />
            <div className="form-help">Up to 16 characters, letters/numbers/underscore.</div></div>
          <div className="form-row"><label className="form-label">Hospital</label>
            <select className="form-select" value={f.clinicId || ''} onChange={e => set('clinicId', e.target.value)}>
              <option value="">— not linked —</option>
              {(clinics || []).filter(c => c.status !== 'pending').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div className="form-row"><label className="form-label">Modality</label>
            <select className="form-select" value={f.modality || 'US'} onChange={e => set('modality', e.target.value)}>
              <option value="US">Ultrasound (US)</option><option value="CR">Radiography (CR)</option>
              <option value="DX">Radiography (DX)</option><option value="">Other / mixed</option>
            </select></div>
          <div className="form-row"><label className="form-label">Sending IP <span className="sd-opt">— optional</span></label>
            <input className="form-input mono" value={f.ip || ''} onChange={e => set('ip', e.target.value)} placeholder="203.0.113.24" />
            <div className="form-help">Only needed if you firewall the intake port.</div></div>
          <div className="form-row"><label className="form-label">Status</label>
            <select className="form-select" value={f.status} onChange={e => set('status', e.target.value)}>
              <option value="active">Active</option><option value="paused">Paused — refuse studies</option>
            </select></div>
        </div>
        <div className="form-row"><label className="form-label">Note</label>
          <input className="form-input" value={f.note || ''} onChange={e => set('note', e.target.value)} placeholder="Who set it up, when, anything odd about the machine" /></div>
        <div className="sc-modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-clay" disabled={!valid} onClick={submit}>{isNew ? 'Register device' : 'Save device'}</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  schedCodeMatches: sdCodeMatches,
  StudyCodeField, IncomingStudyLink, DeviceRegistry,
});
