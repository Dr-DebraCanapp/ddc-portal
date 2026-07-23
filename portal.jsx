/* global React, ReactDOM, JSZip */
/* Portal entry — auth gate + view routing + Horos export */

const { useState: pAppUseState, useEffect: pAppUseEffect } = React;

function PortalApp() {
  return (
    <window.AuthGate>
      {({ session, logout }) => <Authed session={session} logout={logout} />}
    </window.AuthGate>
  );
}

function Authed({ session, logout }) {
  const [view, setView] = pAppUseState({ name: 'dashboard' });

  const goHome = () => setView({ name: 'dashboard' });
  const goNew = () => setView({ name: 'new' });
  const goOpen = (id) => setView({ name: 'detail', id });

  return (
    <div className="portal-page">
      <window.AppBar
        session={session}
        logout={logout}
        onHome={goHome}
        crumb={view.name === 'dashboard' ? 'Dashboard' : view.name === 'new' ? 'New referral' : 'Case detail'}
      />
      {view.name === 'dashboard' && <window.Dashboard session={session} onNew={goNew} onOpen={goOpen} />}
      {view.name === 'new' && <NewCaseView session={session} onSubmit={(id) => goOpen(id)} onCancel={goHome} />}
      {view.name === 'detail' && <CaseDetailView id={view.id} onBack={goHome} session={session} />}
    </div>
  );
}

/* ============================================================
   NEW CASE FLOW
   ============================================================ */
const STEPS = [
  { n: '01', t: 'Patient & history' },
  { n: '02', t: 'Diagnostic MSK ultrasound (DICOM)' },
  { n: '03', t: 'Radiographs · MRI · CT' },
  { n: '04', t: 'Patient videos' },
  { n: '05', t: 'History documents' },
  { n: '06', t: 'Review & submit' },
];

// Common MSK ultrasound regions. Each selected region = ONE bilateral site
// (left + right of that region are read together).
const SITE_REGIONS = [
  'Shoulders', 'Elbows', 'Carpi', 'Digits',
  'Stifles', 'Tarsi / Hocks',
  'Iliopsoas', 'Piriformis', 'Achilles / Common calcanean',
];

function SitesPicker({ sites, setSites }) {
  const [custom, setCustom] = pAppUseState('');
  const toggle = (r) => {
    setSites(sites.includes(r) ? sites.filter(s => s !== r) : [...sites, r]);
  };
  const addCustom = () => {
    const v = custom.trim();
    if (v && !sites.includes(v)) setSites([...sites, v]);
    setCustom('');
  };
  const presetSelected = sites.filter(s => !SITE_REGIONS.includes(s));
  return (
    <div className="sites-picker">
      <p className="sites-help">
        Select each region you'd like evaluated. <strong>Each site is one bilateral region</strong> —
        e.g. choosing <em>“Shoulders”</em> covers both the left and right shoulder. Most reads bill per site.
      </p>
      <div className="sites-chips">
        {SITE_REGIONS.map(r => (
          <button
            type="button"
            key={r}
            className={`site-chip ${sites.includes(r) ? 'on' : ''}`}
            onClick={() => toggle(r)}
          >
            <span className="tick">{sites.includes(r) ? '✓' : '+'}</span>{r}
          </button>
        ))}
      </div>
      {presetSelected.length > 0 && (
        <div className="sites-chips" style={{ marginTop: 10 }}>
          {presetSelected.map(r => (
            <button type="button" key={r} className="site-chip on custom" onClick={() => toggle(r)}>
              <span className="tick">✓</span>{r}
            </button>
          ))}
        </div>
      )}
      <div className="sites-custom">
        <input
          className="form-input"
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
          placeholder="Other region — type and press Add"
        />
        <button type="button" className="btn btn-ghost btn-sm" onClick={addCustom}>Add</button>
      </div>
      <div className="sites-count">
        {sites.length === 0
          ? 'No sites selected yet.'
          : <><strong>{sites.length}</strong> {sites.length === 1 ? 'site' : 'sites'} selected — {sites.join(' · ')}</>}
      </div>
    </div>
  );
}

function NewCaseView({ session, onSubmit, onCancel }) {
  const [step, setStep] = pAppUseState(0);
  const [pendingCaseId] = pAppUseState(() => `PENDING-${Date.now()}-${Math.random().toString(36).slice(2,6)}`);
  const [data, setData] = pAppUseState({
    patient: '', species: 'Canine', breed: '', age: '', sex: '', weight: '',
    complaint: '', duration: '', priorImaging: '', medications: '', examFindings: '',
  });
  const [sites, setSites] = pAppUseState([]);
  const [dicom, setDicom] = pAppUseState([]);
  const [rads, setRads] = pAppUseState([]);
  const [videos, setVideos] = pAppUseState([]);
  const [docs, setDocs] = pAppUseState([]);
  const [submitting, setSubmitting] = pAppUseState(false);
  const [progress, setProgress] = pAppUseState(null);

  const set = (k) => (e) => setData({ ...data, [k]: e.target.value });
  const next = () => setStep(Math.min(STEPS.length - 1, step + 1));
  const back = () => setStep(Math.max(0, step - 1));

  const submit = async () => {
    setSubmitting(true);
    window.onbeforeunload = () => 'Files are still uploading. If you leave now, the remaining files won’t be saved.';
    try {
      // Unique id per submission — avoids colliding with an existing case row
      // (which would turn putCase into an upsert-update that RLS can reject).
      const id = `CASE-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
      const newCase = {
        id,
        patient: data.patient || 'Untitled patient',
        ...data,
        sites,
        submittedBy: session.userId,
        referringVet: session.name,
        referringClinic: session.clinic,
        referringEmail: session.email,
        lang: (window.ddcVetLang && window.ddcVetLang()) || 'en',
        submitted: new Date().toISOString(),
        status: 'submitted',
        seeded: false,
        files: { dicom: dicom.length, rads: rads.length, history: docs.length, video: videos.length },
        timeline: [
          { t: 'Case submitted', ts: new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }), done: true },
          { t: 'Awaiting acknowledgment', ts: 'Pending', done: false },
          { t: 'In review by Dr. Canapp', ts: 'Pending', done: false },
          { t: 'Report drafted', ts: 'Pending', done: false },
          { t: 'Report delivered', ts: 'Pending', done: false },
        ],
      };
      // Create the case FIRST — cloud storage requires the owning case to exist
      // (and belong to this vet) before any file upload is allowed.
      await window.PortalDB.putCase(newCase);
      // Validate/refresh the session up front so a long batch can't expire mid-stream.
      await window.PortalDB.ensureSession();
      const allFiles = [...dicom, ...rads, ...videos, ...docs];
      setProgress({ done: 0, total: allFiles.length });
      const { uploaded, failed } = await window.PortalDB.uploadFiles(
        id, allFiles, (d, t) => setProgress({ done: d, total: t })
      );
      if (failed.length) {
        const sessionOk = await window.PortalDB.ensureSession();
        const tooBig = failed.filter(f => /413|too large|exceeded the maximum/i.test(String(f.e && f.e.message || f.e)));
        const other = failed.length - tooBig.length;
        let msg = `${uploaded} of ${allFiles.length} files uploaded.\n\nYour case “${newCase.patient}” is saved.`;
        if (tooBig.length) {
          msg += `\n\n• ${tooBig.length} file${tooBig.length > 1 ? 's were' : ' was'} too large to upload (over 500 MB):\n   ${tooBig.map(f => f.rec.name).join('\n   ')}\n   Please compress or trim them, or contact Dr. Canapp's office to arrange another way to send them.`;
        }
        if (other) {
          msg += `\n\n• ${other} other file${other > 1 ? 's' : ''} didn't finish` +
            (sessionOk ? '' : ' (your session timed out)') +
            `. Open the case from your dashboard and use “Add files” to upload ${other > 1 ? 'them' : 'it'} — they'll attach to this same case.`;
        }
        alert(msg);
      }
      onSubmit(id);
    } catch (err) {
      setSubmitting(false);
      setProgress(null);
      window.onbeforeunload = null;
      alert('Could not submit the case: ' + (err.message || err) + '\n\nYour information is still here — please try again.');
      return;
    }
    window.onbeforeunload = null;
  };

  return (
    <main className="app-main">
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:36, paddingBottom:24, borderBottom:'1px solid var(--rule)', gap:24, flexWrap:'wrap'}}>
        <div>
          <div className="eb" style={{fontSize:11, letterSpacing:'0.22em', textTransform:'uppercase', color:'var(--clay)', fontWeight:500}}>New referral</div>
          <h2 className="serif" style={{fontSize:'clamp(36px,4vw,52px)', marginTop:10, letterSpacing:'-0.02em', lineHeight:1}}>Submit a case for second-opinion read.</h2>
        </div>
        <button onClick={onCancel} className="btn btn-ghost" style={{padding:'10px 16px', fontSize:12}}>Cancel</button>
      </div>

      <div className="case-shell">
        <aside className="case-side">
          <div className="eb" style={{fontSize:10.5, letterSpacing:'0.18em', textTransform:'uppercase', color:'var(--ink-3)', fontWeight:500, marginBottom:14, paddingLeft:16}}>Steps</div>
          <ul className="step-list">
            {STEPS.map((s, i) => (
              <li key={s.n} className={i === step ? 'active' : i < step ? 'done' : ''} onClick={() => setStep(i)}>
                <span className="step-num">{i < step ? '✓' : s.n}</span>
                <span>{s.t}</span>
              </li>
            ))}
          </ul>
        </aside>

        <section>
          {step === 0 && (
            <div className="step-pane">
              <div className="step-head"><h3>Patient & history</h3><span className="num">{STEPS[0].n}</span></div>
              <div className="form-row split">
                <div><label className="form-label">Patient name<span className="req">*</span></label><input className="form-input" value={data.patient} onChange={set('patient')} /></div>
                <div>
                  <label className="form-label">Species</label>
                  <select className="form-select" value={data.species} onChange={set('species')}>
                    <option>Canine</option><option>Feline</option><option>Equine</option><option>Other</option>
                  </select>
                </div>
              </div>
              <div className="form-row split">
                <div><label className="form-label">Breed</label><input className="form-input" value={data.breed} onChange={set('breed')} /></div>
                <div><label className="form-label">Age</label><input className="form-input" value={data.age} onChange={set('age')} placeholder="e.g. 5 yrs" /></div>
              </div>
              <div className="form-row split">
                <div>
                  <label className="form-label">Sex</label>
                  <select className="form-select" value={data.sex} onChange={set('sex')}>
                    <option value=""></option>
                    <option>MI</option><option>MN</option><option>FI</option><option>FS</option>
                  </select>
                </div>
                <div><label className="form-label">Weight</label><input className="form-input" value={data.weight} onChange={set('weight')} placeholder="kg" /></div>
              </div>
              <div className="form-row">
                <label className="form-label">Presenting complaint<span className="req">*</span></label>
                <textarea className="form-area" value={data.complaint} onChange={set('complaint')} placeholder="Lameness, region affected, timeline, performance impact…" />
              </div>
              <div className="form-row split">
                <div><label className="form-label">Duration of complaint</label><input className="form-input" value={data.duration} onChange={set('duration')} /></div>
                <div><label className="form-label">Current medications</label><input className="form-input" value={data.medications} onChange={set('medications')} /></div>
              </div>
              <div className="form-row">
                <label className="form-label">Exam findings</label>
                <textarea className="form-area" value={data.examFindings} onChange={set('examFindings')} placeholder="Orthopedic exam, neurological exam, palpation, gait observations…" />
              </div>
              <div className="form-row">
                <label className="form-label">Sites for evaluation<span className="req">*</span></label>
                <SitesPicker sites={sites} setSites={setSites} />
              </div>
              <div className="step-actions">
                <span style={{fontSize:12, color:'var(--ink-3)'}}>Step 1 of {STEPS.length}</span>
                <button onClick={next} className="btn">Continue <span className="arrow">→</span></button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="step-pane">
              <div className="step-head"><h3>Diagnostic MSK ultrasound</h3><span className="num">{STEPS[1].n}</span></div>
              <p className="body" style={{marginBottom:24, color:'var(--ink-3)'}}>Upload DICOM clips (.dcm) and stills from your MSK ultrasound exam. Cine loops in MP4 or ADI format are also accepted, along with JPEG, PNG, and TIFF stills. Files are stored encrypted in your browser; nothing leaves your device until you submit.</p>
              <window.DropZone label="MSK Ultrasound (DICOM · MP4 / ADI cine · images)" accept=".dcm,.dicom,.adi,application/dicom,application/octet-stream,image/jpeg,image/png,image/tiff,video/mp4,video/quicktime,.mp4,.mov,.m4v" icon="◐" files={dicom} setFiles={setDicom} badge="DICOM" kind="dicom" caseId={pendingCaseId} />
              <div className="step-actions"><button onClick={back} className="btn btn-ghost">← Back</button><button onClick={next} className="btn">Continue <span className="arrow">→</span></button></div>
            </div>
          )}

          {step === 2 && (
            <div className="step-pane">
              <div className="step-head"><h3>Radiographs · MRI · CT</h3><span className="num">{STEPS[2].n}</span></div>
              <p className="body" style={{marginBottom:24, color:'var(--ink-3)'}}>Upload existing radiographs and any cross-sectional imaging the patient has had. DICOM preferred; JPEG/PDF accepted.</p>
              <window.DropZone label="Radiographs / MRI / CT" accept=".dcm,.dicom,application/dicom,application/octet-stream,image/jpeg,image/png,application/pdf" icon="✚" files={rads} setFiles={setRads} badge="RAD" kind="rads" caseId={pendingCaseId} />
              <div className="step-actions"><button onClick={back} className="btn btn-ghost">← Back</button><button onClick={next} className="btn">Continue <span className="arrow">→</span></button></div>
            </div>
          )}

          {step === 3 && (
            <div className="step-pane">
              <div className="step-head"><h3>Patient videos</h3><span className="num">{STEPS[3].n}</span></div>
              <p className="body" style={{marginBottom:24, color:'var(--ink-3)'}}>Gait videos, working/sport videos, range-of-motion captures. MP4, MOV, WebM accepted.</p>
              <window.DropZone label="Patient videos" accept="video/mp4,video/quicktime,video/webm" icon="▶" files={videos} setFiles={setVideos} badge="VIDEO" kind="video" caseId={pendingCaseId} />
              <div className="step-actions"><button onClick={back} className="btn btn-ghost">← Back</button><button onClick={next} className="btn">Continue <span className="arrow">→</span></button></div>
            </div>
          )}

          {step === 4 && (
            <div className="step-pane">
              <div className="step-head"><h3>History documents</h3><span className="num">{STEPS[4].n}</span></div>
              <p className="body" style={{marginBottom:24, color:'var(--ink-3)'}}>Past medical records, lab work, prior reports, referral letters. PDF, DOC/DOCX accepted. Or type the history directly into the field below.</p>
              <window.DropZone label="History documents (PDF · DOC · DOCX)" accept="application/pdf,.doc,.docx,application/msword" icon="❡" files={docs} setFiles={setDocs} badge="DOC" kind="history" caseId={pendingCaseId} />
              <div className="form-row" style={{marginTop:24}}>
                <label className="form-label">Or — type history in-line</label>
                <textarea className="form-area" value={data.priorImaging} onChange={set('priorImaging')} placeholder="Prior imaging interpretations, surgical history, response to treatment…" style={{minHeight:160}} />
              </div>
              <div className="step-actions"><button onClick={back} className="btn btn-ghost">← Back</button><button onClick={next} className="btn">Continue <span className="arrow">→</span></button></div>
            </div>
          )}

          {step === 5 && (
            <div className="step-pane">
              <div className="step-head"><h3>Review & submit</h3><span className="num">{STEPS[5].n}</span></div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:32, marginBottom:24}}>
                <div>
                  <div className="eb" style={{fontSize:10.5, letterSpacing:'0.18em', textTransform:'uppercase', color:'var(--ink-3)', fontWeight:500, marginBottom:8}}>Patient</div>
                  <div className="serif" style={{fontSize:24, lineHeight:1.1}}>{data.patient || '—'}</div>
                  <div style={{marginTop:6, fontSize:13, color:'var(--ink-3)'}}>{data.species} · {data.breed || '—'} · {data.age || '—'} · {data.sex || '—'} · {data.weight || '—'}</div>
                </div>
                <div>
                  <div className="eb" style={{fontSize:10.5, letterSpacing:'0.18em', textTransform:'uppercase', color:'var(--ink-3)', fontWeight:500, marginBottom:8}}>Referring veterinarian</div>
                  <div className="serif" style={{fontSize:18, lineHeight:1.2}}>{session.name}</div>
                  <div style={{fontSize:13, color:'var(--ink-3)', marginTop:4}}>{session.clinic}</div>
                </div>
              </div>

              <div className="eb" style={{fontSize:10.5, letterSpacing:'0.18em', textTransform:'uppercase', color:'var(--ink-3)', fontWeight:500, marginBottom:8, marginTop:24}}>Complaint</div>
              <div className="body" style={{color:'var(--ink-2)'}}>{data.complaint || <em style={{color:'var(--ink-3)'}}>No complaint entered.</em>}</div>

              <div className="eb" style={{fontSize:10.5, letterSpacing:'0.18em', textTransform:'uppercase', color:'var(--ink-3)', fontWeight:500, marginBottom:8, marginTop:24}}>Sites for evaluation</div>
              <div className="body" style={{color:'var(--ink-2)'}}>
                {sites.length
                  ? <>{sites.length} {sites.length === 1 ? 'site' : 'sites'} (each bilateral): {sites.join(' · ')}</>
                  : <em style={{color:'var(--ink-3)'}}>No sites selected.</em>}
              </div>

              <div className="eb" style={{fontSize:10.5, letterSpacing:'0.18em', textTransform:'uppercase', color:'var(--ink-3)', fontWeight:500, marginBottom:8, marginTop:24}}>Attachments</div>
              <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:0, border:'1px solid var(--rule-2)', background:'var(--rule-2)'}}>
                <Cell n={dicom.length} l="DICOM clips" />
                <Cell n={rads.length} l="Radiographs / MRI" />
                <Cell n={videos.length} l="Patient videos" />
                <Cell n={docs.length} l="History documents" />
              </div>

              <p className="small" style={{marginTop:24, color:'var(--ink-3)'}}>
                By submitting you confirm patient information is accurate and you have client authorization to share these records. Dr. Canapp will acknowledge receipt within 24 hours; written report typically returned in 5–7 business days.
              </p>

              <div className="upload-notice">
                <span className="upload-notice-dot" aria-hidden="true"></span>
                <div>
                  <strong>Please keep this page open while uploading.</strong> Large studies — especially patient videos — can take <strong>5–10 minutes</strong> to finish depending on file sizes and your internet speed. You'll see live progress on the button below, and a confirmation when it's done. Individual files must be under 500 MB.
                </div>
              </div>

              {submitting && progress && (
                <div className="upload-progress">
                  <div className="upload-progress-bar" style={{width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%`}}></div>
                  <div className="upload-progress-label">Uploading {progress.done} of {progress.total} files… please don't close this page.</div>
                </div>
              )}

              <div className="step-actions">
                <button onClick={back} className="btn btn-ghost" disabled={submitting}>← Back</button>
                <button onClick={submit} className="btn btn-clay" disabled={submitting}>
                  {submitting
                    ? (progress ? `Uploading ${progress.done} / ${progress.total}…` : 'Submitting…')
                    : <>Submit referral <span className="arrow">→</span></>}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Cell({ n, l }) {
  return (
    <div style={{background:'var(--cream)', padding:'20px 18px'}}>
      <div className="serif" style={{fontSize:32, lineHeight:1, letterSpacing:'-0.02em'}}>{n}</div>
      <div style={{marginTop:8, fontSize:11, letterSpacing:'0.16em', textTransform:'uppercase', color:'var(--ink-3)', fontWeight:500}}>{l}</div>
    </div>
  );
}

/* ============================================================
   CASE DETAIL with FILE TILES + HOROS EXPORT
   ============================================================ */
const KIND_LABELS = {
  dicom: 'ultrasound (DICOM · cine · images)',
  rads: 'Radiographs · MRI · CT',
  video: 'Patient videos',
  history: 'History documents',
};

function CaseDetailView({ id, onBack, session }) {
  const [c, setC] = pAppUseState(null);
  const [files, setFiles] = pAppUseState([]);
  const [kind, setKind] = pAppUseState('dicom');
  const [seededDemo, setSeededDemo] = pAppUseState(false);
  const [adding, setAdding] = pAppUseState(false);
  const [loaded, setLoaded] = pAppUseState(false);
  const addRef = React.useRef(null);

  pAppUseEffect(() => {
    (async () => {
      const found = await window.PortalDB.getCase(id);
      setC(found);
      setLoaded(true);
      if (found) {
        const allFiles = await window.PortalDB.getCaseFiles(id);
        setFiles(allFiles);
        if (found.seeded && allFiles.length === 0) setSeededDemo(true);
      }
    })();
  }, [id]);

  if (!c) return (
    <main className="app-main">
      {loaded ? (
        <div className="empty-state">
          <div className="serif" style={{fontSize:26, marginBottom:10}}>This case is no longer available.</div>
          <p style={{color:'var(--ink-3)', fontSize:14, marginBottom:24}}>It may have been removed. Return to your dashboard to see your current cases.</p>
          <button className="btn btn-clay" onClick={onBack}>← Back to dashboard</button>
        </div>
      ) : (
        <div className="empty-state">Loading…</div>
      )}
    </main>
  );

  const byKind = {
    dicom: files.filter(f => f.kind === 'dicom'),
    rads: files.filter(f => f.kind === 'rads'),
    video: files.filter(f => f.kind === 'video'),
    history: files.filter(f => f.kind === 'history'),
  };
  const counts = seededDemo
    ? { dicom: c.files.dicom, rads: c.files.rads, video: c.files.video, history: c.files.history }
    : { dicom: byKind.dicom.length, rads: byKind.rads.length, video: byKind.video.length, history: byKind.history.length };

  const visibleFiles = byKind[kind] || [];

  const KIND_ACCEPT = {
    dicom: '.dcm,.dicom,.adi,application/dicom,application/octet-stream,image/jpeg,image/png,image/tiff,video/mp4,video/quicktime,.mp4,.mov,.m4v',
    rads: '.dcm,.dicom,application/dicom,application/octet-stream,image/jpeg,image/png,application/pdf',
    video: 'video/mp4,video/quicktime,video/webm',
    history: 'application/pdf,.doc,.docx,application/msword',
  };

  const addFiles = async (list) => {
    // Snapshot the FileList into an array IMMEDIATELY — the <input> gets its
    // value cleared right after this is called, which empties the live
    // FileList before our first `await` would otherwise read it (yielding 0).
    const arr = Array.from(list || []);
    if (!arr.length) return;
    setAdding(true);
    try {
      await window.PortalDB.ensureSession();
      const recs = arr.map(f => ({ kind, name: f.name, size: f.size, type: f.type || window.guessType(f.name), blob: f }));
      const { uploaded, failed } = await window.PortalDB.uploadFiles(id, recs);
      const fresh = await window.PortalDB.getCaseFiles(id);
      setFiles(fresh);
      setSeededDemo(false);
      const newCounts = {
        dicom: fresh.filter(x => x.kind === 'dicom').length,
        rads: fresh.filter(x => x.kind === 'rads').length,
        video: fresh.filter(x => x.kind === 'video').length,
        history: fresh.filter(x => x.kind === 'history').length,
      };
      const updated = { ...c, files: newCounts };
      await window.PortalDB.putCase(updated);
      setC(updated);
      if (failed.length) {
        const reason = String(failed[0].e && failed[0].e.message || failed[0].e);
        console.error('[add-files] failure reason:', reason);
        if (/row-level security|violates/i.test(reason)) {
          alert("These files couldn't be added because this case isn't under your account. You can add files to cases you submitted yourself — for sample cases, please start a new referral.");
        } else if (/413|too large|exceeded the maximum/i.test(reason)) {
          alert(`${arr.length - failed.length} of ${arr.length} files added. ${failed.length} were too large (over 500 MB) and couldn't be uploaded.`);
        } else {
          const sessionOk = await window.PortalDB.ensureSession();
          alert(`${arr.length - failed.length} of ${arr.length} files added. ${failed.length} didn't finish` +
            (sessionOk ? `.\n\nReason: ${reason}` : ' because your session timed out. Please sign in again and retry.'));
        }
      }
    } catch (err) {
      alert('Could not add files: ' + (err.message || err));
    }
    setAdding(false);
  };

  const viewReport = () => {
    if (!c.report) return;
    const w = window.open('', '_blank', 'width=820,height=1000');
    if (!w) return;
    w.document.write(window.buildReportHTML(c, {
      findings: c.report.findings, impression: c.report.impression,
      recommendations: c.report.recommendations, signedBy: c.report.signedBy,
      draft: !c.report.finalized,
    }));
    w.document.close();
    // Deliver the report in the vet's language (leaves English untouched otherwise).
    const vet = window.ddcVetLang ? window.ddcVetLang() : 'en';
    if (window.ddcTranslateDoc && vet && vet !== 'en') {
      w.addEventListener('load', () => window.ddcTranslateDoc(w.document, vet, 'en'));
      window.ddcTranslateDoc(w.document, vet, 'en');
    }
  };
  const viewInvoice = () => {
    if (!c.invoice) return;
    const w = window.open('', '_blank', 'width=820,height=1000');
    if (!w) return;
    w.document.write(window.buildInvoiceHTML(c, c.invoice));
    w.document.close();
    const vet = window.ddcVetLang ? window.ddcVetLang() : 'en';
    if (window.ddcTranslateDoc && vet && vet !== 'en') {
      window.ddcTranslateDoc(w.document, vet, 'en');
    }
  };

  return (
    <main className="app-main">
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:36, paddingBottom:24, borderBottom:'1px solid var(--rule)', gap:24, flexWrap:'wrap'}}>
        <div>
          <div className="eb" style={{fontSize:11, letterSpacing:'0.22em', textTransform:'uppercase', color:'var(--clay)', fontWeight:500}}>{c.id}</div>
          <h2 className="serif" style={{fontSize:'clamp(36px,4vw,52px)', marginTop:10, letterSpacing:'-0.02em', lineHeight:1}}>{c.patient}</h2>
          <div style={{marginTop:10, fontSize:14, color:'var(--ink-3)'}}>{c.breed} · {c.age} · {c.sex} · {c.weight} · {c.species}</div>
        </div>
        <div style={{display:'flex', gap:12, alignItems:'center'}}>
          <span className={`status-pill ${c.status}`}>{window.statusLabel(c.status)}</span>
          <button onClick={onBack} className="btn btn-ghost" style={{padding:'10px 16px', fontSize:12}}>← Dashboard</button>
        </div>
      </div>

      <div className="detail-grid">
        <div>
          <div className="eb" style={{fontSize:10.5, letterSpacing:'0.18em', textTransform:'uppercase', color:'var(--ink-3)', fontWeight:500, marginBottom:8}}>Complaint</div>
          <p className="body-lg" style={{color:'var(--ink-2)'}}>{c.complaint}</p>
          {c.duration && <p className="small" style={{marginTop:8, color:'var(--ink-3)'}}>Duration: {c.duration}</p>}
          {c.sites && c.sites.length > 0 && (
            <p className="small" style={{marginTop:8, color:'var(--ink-3)'}}>
              Sites: {c.sites.join(' · ')} ({c.sites.length} bilateral {c.sites.length === 1 ? 'site' : 'sites'})
            </p>
          )}

          {c.examFindings && <>
            <div className="eb" style={{fontSize:10.5, letterSpacing:'0.18em', textTransform:'uppercase', color:'var(--ink-3)', fontWeight:500, marginBottom:8, marginTop:32}}>Exam findings</div>
            <p className="body" style={{color:'var(--ink-2)'}}>{c.examFindings}</p>
          </>}
          {c.priorImaging && <>
            <div className="eb" style={{fontSize:10.5, letterSpacing:'0.18em', textTransform:'uppercase', color:'var(--ink-3)', fontWeight:500, marginBottom:8, marginTop:32}}>History notes</div>
            <p className="body" style={{color:'var(--ink-2)'}}>{c.priorImaging}</p>
          </>}

          <div className="eb" style={{fontSize:10.5, letterSpacing:'0.18em', textTransform:'uppercase', color:'var(--ink-3)', fontWeight:500, marginBottom:8, marginTop:36}}>Attachments</div>
          <div className="kind-tabs">
            {['dicom','rads','video','history'].map(k => (
              <button key={k} className={`kind-tab ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)}>
                {KIND_LABELS[k]}<span className="ct">{counts[k] || 0}</span>
              </button>
            ))}
          </div>

          {c.status !== 'reported' && !c.seeded && (
            <div className="add-files-bar">
              <input
                ref={addRef}
                type="file"
                multiple
                accept={KIND_ACCEPT[kind]}
                style={{ display: 'none' }}
                onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
              />
              <button className="btn btn-ghost btn-sm" disabled={adding} onClick={() => addRef.current && addRef.current.click()}>
                {adding ? 'Uploading…' : `+ Add ${KIND_LABELS[kind]}`}
              </button>
              <span className="add-files-hint">Forgot some files, or an upload didn't finish? Add them here — they attach to this same case.</span>
            </div>
          )}

          {c.seeded && (
            <div className="add-files-bar demo">
              <span className="add-files-hint">This is a sample case for reference — it can&rsquo;t be edited. Add files to cases you&rsquo;ve submitted yourself.</span>
            </div>
          )}

          {seededDemo && (
            <div style={{marginTop:18, padding:'14px 16px', background:'rgba(177,106,72,0.08)', border:'1px solid var(--clay)', color:'var(--clay-deep)', fontSize:13}}>
              <strong>Demo case</strong> — actual files are not attached. Submit a real case to see the files you uploaded here.
            </div>
          )}

          {!seededDemo && visibleFiles.length === 0 && (
            <div style={{marginTop:18, padding:'32px 18px', textAlign:'center', color:'var(--ink-3)', fontStyle:'italic', fontFamily:'var(--serif)', fontSize:18}}>
              No files in this category.
            </div>
          )}

          {!seededDemo && visibleFiles.length > 0 && (
            <div className="files-grid">
              {visibleFiles.map((f) => (
                <FileTile key={f.id} file={f} />
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="detail-meta">
            <div className="eb" style={{fontSize:10.5, letterSpacing:'0.18em', textTransform:'uppercase', color:'var(--clay)', fontWeight:500, marginBottom:14}}>Workflow</div>
            <div className="flow">
              {c.timeline.map((t, i) => (
                <div key={i} className={`step ${t.done ? 'done' : 'pending'}`}>
                  <div className="dot" />
                  <div className="t">{t.t}</div>
                  <div className="ts">{t.ts}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{marginTop:24, padding:'20px 24px', background:'var(--ink)', color:'var(--paper)'}}>
            <div className="eb" style={{fontSize:10.5, letterSpacing:'0.18em', textTransform:'uppercase', color:'var(--tan)', fontWeight:500, marginBottom:10}}>What happens next</div>
            <p style={{color:'rgba(244,239,229,0.8)', fontSize:13, lineHeight:1.5}}>
              Dr. Canapp personally reviews each case. You'll receive an acknowledgment within 24 hours and a written report typically within 5–7 business days.
            </p>
            <p style={{color:'var(--tan)', fontSize:11, letterSpacing:'0.16em', textTransform:'uppercase', marginTop:10, fontWeight:500}}>
              You'll be notified by email when the report is ready.
            </p>
          </div>

          {c.status === 'reported' && c.report && (
            <button className="btn btn-clay" style={{width:'100%', justifyContent:'center', marginTop:14}} onClick={viewReport}>
              View / download report <span className="arrow">↓</span>
            </button>
          )}

          {c.invoice && (
            <div className="portal-invoice">
              <div className="pi-top">
                <div>
                  <div className="pi-eyebrow">Invoice</div>
                  <div className="pi-num">{c.invoice.number}</div>
                </div>
                <span className={`pi-pill ${c.invoice.status === 'paid' ? 'paid' : 'unpaid'}`}>
                  {c.invoice.status === 'paid' ? '✓ Paid' : 'Due'}
                </span>
              </div>
              <div className="pi-lines">
                {(c.invoice.lines || []).map((l, i) => (
                  <div key={i} className="pi-line"><span data-mt-en2vet>{l.site || l.label}</span><span>{window.money(l.amount)}</span></div>
                ))}
                <div className="pi-line total"><span>Total</span><span>{window.money(c.invoice.total)}</span></div>
              </div>
              <button className="btn btn-ghost btn-sm" style={{width:'100%', justifyContent:'center'}} onClick={viewInvoice}>
                View / download invoice
              </button>
            </div>
          )}
        </div>
      </div>

      {c.status === 'reported' && (
        <div className="case-comments-wrap">
          <window.CommentThread caseId={c.id} role="vet" name={session ? session.name : 'Referring veterinarian'} />
        </div>
      )}
    </main>
  );
}

function FileTile({ file }) {
  const [thumb, setThumb] = pAppUseState(null);

  pAppUseEffect(() => {
    let cancelled = false;
    (async () => {
      if (file.blob && file.type && file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file.blob);
        if (!cancelled) setThumb(url);
        return () => URL.revokeObjectURL(url);
      }
    })();
    return () => { cancelled = true; };
  }, [file.id]);

  const ext = (file.name.split('.').pop() || '').toUpperCase();
  const extLower = ext.toLowerCase();
  const isVideo = ['mp4','mov','webm','avi','m4v'].includes(extLower) || (file.type && file.type.startsWith('video/'));
  const isDicom = ext === 'DCM' || ext === 'DICOM' || file.kind === 'dicom';
  const isPdf = ext === 'PDF' || file.type === 'application/pdf';
  const isImage = file.type && file.type.startsWith('image/');

  const badge = isDicom ? 'DICOM' : isVideo ? 'VIDEO' : isPdf ? 'PDF' : isImage ? 'IMAGE' : ext;

  return (
    <div className="file-tile file-tile-static" title={file.name}>
      <div className="tile-thumb">
        {thumb ? <img src={thumb} alt="" />
          : isVideo ? <span className="tile-glyph">▶</span>
          : isPdf ? <span className="tile-glyph">❡</span>
          : isDicom ? <span className="tile-glyph">◐</span>
          : <span className="tile-glyph">{ext}</span>}
        <span className="tile-badge">{badge}</span>
      </div>
      <div className="tile-meta">
        <div className="tile-name">{file.name}</div>
        <div className="tile-info">{window.prettySize(file.size)} · Received</div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<PortalApp />);
