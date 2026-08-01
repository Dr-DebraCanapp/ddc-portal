/* global React */
/* Reviewer Case View — case detail, attachments + DICOM viewer, report builder */

const { useState: rcUseState, useEffect: rcUseEffect, useMemo: rcUseMemo, useRef: rcUseRef } = React;

const RC_KIND_LABELS = {
  dicom: 'DICOM ultrasound',
  rads: 'Radiographs · MRI · CT',
  video: 'Patient videos',
  history: 'History documents',
};

function CaseReviewView({ id, onBack, session, allCases, onBillingChange }) {
  const [c, setC] = rcUseState(null);
  const [stmts, setStmts] = rcUseState({});
  rcUseEffect(() => {
    if (window.SchedCloud && window.SchedCloud.configured) {
      window.SchedCloud.loadStatements().then(setStmts).catch(() => setStmts({}));
    }
  }, []);
  /* Same billing model the scheduler uses — reads batched into monthly
     statements per practice. */
  const billing = rcUseMemo(() => {
    if (!window.SchedEntities) return { entities: [], accounts: [] };
    return window.SchedEntities.all([], allCases || [], stmts);
  }, [allCases, stmts]);
  const billWho = () => (session && (session.name || session.email)) || 'admin';
  const persistStmt = (e, inv) => {
    setStmts(prev => ({ ...prev, [e.id]: inv }));
    if (window.SchedCloud && window.SchedCloud.configured) window.SchedCloud.saveStatement({ ...e, invoice: inv }).catch(() => {});
    onBillingChange && onBillingChange();
  };
  const billingOn = {
    issueInvoice: (e, dated) => persistStmt(e, window.SchedBill.issue(window.SchedEntities.numbers(billing.entities), e, billWho(), dated)),
    openPayment: (e) => setPayFor(e.id),
    addPayment: (e, pay) => persistStmt(e, window.SchedBill.logged({ ...(e.invoice || {}), payments: [...((e.invoice && e.invoice.payments) || []), pay] }, billWho(), 'Payment ' + window.SCHED.money(pay.amount))),
    removePayment: (e, pid) => persistStmt(e, window.SchedBill.logged({ ...e.invoice, payments: (e.invoice.payments || []).filter(p => p.id !== pid) }, billWho(), 'Payment removed')),
    addCharge: (e, ch) => { const base = e.invoice || { charges: [], payments: [], audit: [] }; persistStmt(e, window.SchedBill.logged({ ...base, charges: [...(base.charges || []), ch] }, billWho(), window.SchedBill.chargeLabel(ch))); },
    removeCharge: (e, cid) => persistStmt(e, window.SchedBill.logged({ ...e.invoice, charges: (e.invoice.charges || []).filter(x => x.id !== cid) }, billWho(), 'Adjustment removed')),
    writeOff: (e, off) => persistStmt(e, window.SchedBill.logged({ ...e.invoice, writtenOff: off }, billWho(), off ? 'Balance written off' : 'Reinstated')),
  };
  const [payFor, setPayFor] = rcUseState(null);
  const [files, setFiles] = rcUseState([]);
  const [kind, setKind] = rcUseState('dicom');
  const [seededDemo, setSeededDemo] = rcUseState(false);
  const [viewerState, setViewerState] = rcUseState(null); // { files, idx } | null

  const load = async () => {
    const found = await window.PortalDB.getCase(id);
    setC(found);
    const allFiles = await window.PortalDB.getCaseFiles(id);
    setFiles(allFiles);
    if (found && found.seeded && allFiles.length === 0) setSeededDemo(true);
  };
  rcUseEffect(() => { load(); }, [id]);

  if (!c) {
    return (
      <main className="rv-main">
        <div className="rv-empty">Loading…</div>
      </main>
    );
  }

  const byKind = {
    dicom:   files.filter(f => f.kind === 'dicom'),
    rads:    files.filter(f => f.kind === 'rads'),
    video:   files.filter(f => f.kind === 'video'),
    history: files.filter(f => f.kind === 'history'),
  };
  const counts = seededDemo
    ? { dicom: c.files.dicom, rads: c.files.rads, video: c.files.video, history: c.files.history }
    : { dicom: byKind.dicom.length, rads: byKind.rads.length, video: byKind.video.length, history: byKind.history.length };

  const visibleFiles = byKind[kind] || [];

  const advance = async (stage) => {
    await window.PortalDB.advanceTimeline(id, stage);
    await load();
  };

  const deleteStudy = async () => {
    if (!confirm(`Permanently delete case "${c.patient}" (${c.id}) and ALL of its files?\n\nThis cannot be undone.`)) return;
    if (!confirm(`Last check — really delete "${c.patient}"? Type-of-no-return.`)) return;
    try {
      await window.PortalDB.deleteCase(id);
      onBack();
    } catch (e) {
      alert('Could not delete this case: ' + (e && e.message ? e.message : e));
    }
  };

  const openViewer = (idx) => {
    setViewerState({ files: visibleFiles, idx });
  };

  return (
    <main className="rv-main rv-case-main">
      <CaseHeader c={c} onBack={onBack} onAdvance={advance} onDelete={deleteStudy} />

      <div className="rv-case-grid">
        {/* LEFT — patient + attachments */}
        <div className="rv-case-left">
          <RefVetBlock c={c} />
          <ClinicalBlock c={c} />

          <div className="rv-attach-head">
            <div className="rv-section-eyebrow">Attachments</div>
            <div className="rv-attach-help">Click any image, video, or DICOM to open in the viewer.</div>
          </div>

          <div className="kind-tabs">
            {['dicom','rads','video','history'].map(k => (
              <button key={k} className={`kind-tab ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)}>
                {RC_KIND_LABELS[k]}<span className="ct">{counts[k] || 0}</span>
              </button>
            ))}
          </div>

          {seededDemo && (
            <div className="rv-demo-banner">
              <strong>Demo case</strong> — no real files attached. Submit a real case through the referral portal to use the DICOM viewer and report builder end-to-end.
            </div>
          )}
          {!seededDemo && visibleFiles.length === 0 && (
            <div className="rv-empty-files">No files in this category.</div>
          )}
          {!seededDemo && visibleFiles.length > 0 && (
            <div className="files-grid">
              {visibleFiles.map((f, i) => (
                <ReviewerFileTile key={f.id} file={f} onOpen={() => openViewer(i)} />
              ))}
            </div>
          )}
        </div>

        {/* RIGHT — report builder */}
        <aside className="rv-case-right">
          <ReportBuilder c={c} session={session} onSaved={load} billingEntities={billing.entities} billingOn={billingOn} />
      {payFor && window.PaymentModal && (() => {
        const en = billing.entities.find(x => x.id === payFor);
        return en ? <window.PaymentModal entity={en} onSave={(e2, p) => { billingOn.addPayment(e2, p); setPayFor(null); }} onClose={() => setPayFor(null)} /> : null;
      })()}
        </aside>
      </div>

      <div className="rv-comments-wrap">
        <window.CommentThread caseId={c.id} role="reviewer" name={(session && session.name) || 'Dr. Canapp'} />
      </div>

      {viewerState && (
        <div className="rv-viewer-overlay">
          <window.DicomViewer
            caseId={c.id}
            files={viewerState.files}
            initialFileIndex={viewerState.idx}
            onClose={() => setViewerState(null)}
          />
        </div>
      )}
    </main>
  );
}

/* ============================================================
   CASE HEADER — id, patient, status, transition buttons
   ============================================================ */
function CaseHeader({ c, onBack, onAdvance, onDelete }) {
  const isNew = c.status === 'submitted';
  const isReviewing = c.status === 'review';
  const isReported = c.status === 'reported';
  const hasDraft = c.report && !c.report.finalized;

  return (
    <div className="rv-case-head">
      <button onClick={onBack} className="rv-back">← Inbox</button>

      <div className="rv-case-id">
        <div className="rv-case-id-num">{c.id}</div>
        <h2 className="rv-case-patient">{c.patient}</h2>
        <div className="rv-case-sig">{c.breed} · {c.age} · {c.sex} · {c.weight} · {c.species}</div>
      </div>

      <div className="rv-case-actions">
        <span className={`status-pill ${c.status}`}>{window.statusLabel(c.status)}</span>
        {isNew && (
          <button className="btn btn-clay btn-sm" onClick={() => onAdvance('acknowledged')}>
            Acknowledge receipt <span className="arrow">→</span>
          </button>
        )}
        {!isNew && !isReviewing && !isReported && (
          <button className="btn btn-sm" onClick={() => onAdvance('review')}>
            Start review <span className="arrow">→</span>
          </button>
        )}
        {isNew && (
          <button className="btn btn-ghost btn-sm" onClick={() => onAdvance('review')}>
            Skip → Start review
          </button>
        )}
        <button className="rv-delete-btn" onClick={onDelete} title="Permanently delete this case and all its files">
          Delete
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   REF VET BLOCK
   ============================================================ */
function RefVetBlock({ c }) {
  return (
    <div className="rv-refvet">
      <div className="rv-section-eyebrow">Submitted by</div>
      <div className="rv-refvet-grid">
        <div>
          <div className="rv-refvet-name">{c.referringVet || '—'}</div>
          <div className="rv-refvet-clinic">{c.referringClinic || '—'}</div>
        </div>
        <div className="rv-refvet-meta">
          {c.referringEmail && (
            <a href={`mailto:${c.referringEmail}`} className="rv-refvet-link">{c.referringEmail}</a>
          )}
          <div className="rv-refvet-when">
            Submitted {new Date(c.submitted).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   CLINICAL DETAIL BLOCK
   ============================================================ */
function ClinicalBlock({ c }) {
  return (
    <div className="rv-clinical">
      <div>
        <div className="rv-section-eyebrow">Presenting complaint</div>
        <p className="rv-clinical-text rv-clinical-lead">{c.complaint}</p>
        {c.duration && <div className="rv-clinical-meta">Duration: {c.duration}</div>}
      </div>
      {c.sites && c.sites.length > 0 && (
        <div>
          <div className="rv-section-eyebrow">Sites requested ({c.sites.length} bilateral)</div>
          <div className="rv-sites-tags">
            {c.sites.map((s, i) => <span key={i} className="rv-site-tag">{s}</span>)}
          </div>
        </div>
      )}
      {c.examFindings && (
        <div>
          <div className="rv-section-eyebrow">Exam findings</div>
          <p className="rv-clinical-text">{c.examFindings}</p>
        </div>
      )}
      {c.medications && (
        <div>
          <div className="rv-section-eyebrow">Current medications</div>
          <p className="rv-clinical-text">{c.medications}</p>
        </div>
      )}
      {c.priorImaging && (
        <div>
          <div className="rv-section-eyebrow">History notes</div>
          <p className="rv-clinical-text">{c.priorImaging}</p>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   FILE TILE (clickable — opens viewer)
   ============================================================ */
function ReviewerFileTile({ file, onOpen }) {
  const [thumb, setThumb] = rcUseState(null);
  const [hasAnn, setHasAnn] = rcUseState(false);

  rcUseEffect(() => {
    let cancelled = false;
    (async () => {
      const ann = await window.PortalDB.loadAnnotations(file.id);
      if (!cancelled && ann && Object.keys(ann || {}).length > 0) setHasAnn(true);
      if (file.blob && file.type && file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file.blob);
        if (!cancelled) setThumb(url);
        return () => URL.revokeObjectURL(url);
      }
    })();
    return () => { cancelled = true; };
  }, [file.id]);

  const ext = (file.name.split('.').pop() || '').toUpperCase();
  const isVideo = window.fileIsVideo ? window.fileIsVideo(file) : false;
  const isAdi = ext === 'ADI';
  const isDicom = (ext === 'DCM' || ext === 'DICOM' || file.kind === 'dicom') && !isVideo && !isAdi;
  const isPdf = window.fileIsPdf ? window.fileIsPdf(file) : (ext === 'PDF');
  const isImage = file.type && file.type.startsWith('image/');
  const badge = isVideo ? 'CINE' : isAdi ? 'ADI' : isDicom ? 'DICOM' : isPdf ? 'PDF' : isImage ? 'IMAGE' : ext;

  return (
    <button className="file-tile" onClick={onOpen} title={file.name}>
      <div className="tile-thumb">
        {thumb ? <img src={thumb} alt="" />
          : isVideo ? <span className="tile-glyph">▶</span>
          : isAdi ? <span className="tile-glyph">◗</span>
          : isPdf ? <span className="tile-glyph">❡</span>
          : isDicom ? <span className="tile-glyph">◐</span>
          : <span className="tile-glyph">{ext}</span>}
        <span className="tile-badge">{badge}</span>
      </div>
      <div className="tile-meta">
        <div className="tile-name">{file.name}</div>
        <div className="tile-info">{window.prettySize(file.size)}</div>
        {hasAnn && <div className="tile-anno">● Annotated</div>}
      </div>
    </button>
  );
}

/* ============================================================
   REPORT BUILDER (sticky right rail)
   ============================================================ */
function ReportBuilder({ c, session, onSaved, billingEntities, billingOn }) {
  const initial = c.report || {};
  const [findings, setFindings] = rcUseState(initial.findings || '');
  const [impression, setImpression] = rcUseState(initial.impression || '');
  const [recommendations, setRecommendations] = rcUseState(initial.recommendations || '');
  const [savedAt, setSavedAt] = rcUseState(initial.updatedAt || null);
  const [saving, setSaving] = rcUseState(false);
  const [finalizing, setFinalizing] = rcUseState(false);
  const [showInvoice, setShowInvoice] = rcUseState(false);
  const debounceRef = rcUseRef(null);

  // Reset state when switching cases
  rcUseEffect(() => {
    setFindings(initial.findings || '');
    setImpression(initial.impression || '');
    setRecommendations(initial.recommendations || '');
    setSavedAt(initial.updatedAt || null);
  }, [c.id]);

  const isFinalized = !!(c.report && c.report.finalized) || c.status === 'reported';
  const isLocked = isFinalized;

  // Auto-save (debounced)
  const queueSave = () => {
    if (isLocked) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaving(true);
      await window.PortalDB.saveReport(c.id, {
        findings, impression, recommendations,
        finalized: false,
        signedBy: session.name,
      });
      // Advance to "drafted" timeline if findings/impression have content
      if ((findings.trim() || impression.trim()) && c.status !== 'reported') {
        await window.PortalDB.advanceTimeline(c.id, 'drafted');
      }
      setSavedAt(new Date().toISOString());
      setSaving(false);
      onSaved && onSaved();
    }, 800);
  };
  rcUseEffect(() => {
    if (findings === (initial.findings || '') &&
        impression === (initial.impression || '') &&
        recommendations === (initial.recommendations || '')) return;
    queueSave();
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line
  }, [findings, impression, recommendations]);

  const finalize = async () => {
    if (!findings.trim() || !impression.trim()) {
      alert('Findings and impression are required before finalizing.');
      return;
    }
    setShowInvoice(true);
  };

  /* Finalizing records WHAT the read costs; the money is taken on the
     practice's monthly statement, not per case. */
  const doFinalize = async (billing) => {
    setFinalizing(true);
    if (billing) {
      try { await window.PortalDB.setCaseBilling(c.id, billing); } catch (e) { /* non-fatal */ }
    }
    await window.PortalDB.saveReport(c.id, {
      findings, impression, recommendations,
      finalized: true,
      signedBy: 'Debra A. Canapp, DVM, DACVSMR, CCRT, CVA',
      signedAt: new Date().toISOString(),
    });
    await window.PortalDB.advanceTimeline(c.id, 'reported');
    setFinalizing(false);
    setShowInvoice(false);
    onSaved && onSaved();
  };

  const viewInvoice = () => {
    if (!c.invoice) return;
    const w = window.open('', '_blank', 'width=820,height=1000');
    if (!w) return;
    w.document.write(window.buildInvoiceHTML(c, c.invoice));
    w.document.close();
  };

  const togglePaid = async () => {
    const nowPaid = !(c.invoice && c.invoice.status === 'paid');
    await window.PortalDB.setInvoicePaid(c.id, nowPaid);
    onSaved && onSaved();
  };

  const previewReport = () => {
    const w = window.open('', '_blank', 'width=820,height=1000');
    if (!w) return;
    w.document.write(window.buildReportHTML(c, { findings, impression, recommendations, signedBy: session.name, draft: !isFinalized }));
    w.document.close();
  };

  return (
    <div className="rv-report">
      <div className="rv-report-head">
        <div>
          <div className="rv-section-eyebrow">Diagnostic report</div>
          <div className="rv-report-title">
            {isFinalized ? 'Delivered' : (findings || impression ? 'Draft' : 'New report')}
          </div>
        </div>
        <div className="rv-report-status">
          {isFinalized ? <span className="rv-saved final">✓ Delivered</span>
            : saving ? <span className="rv-saved saving">Saving…</span>
            : savedAt ? <span className="rv-saved">✓ Auto-saved</span>
            : <span className="rv-saved muted">Auto-save on</span>}
        </div>
      </div>

      <div className="rv-report-field">
        <label>Findings</label>
        <textarea
          value={findings}
          onChange={e => setFindings(e.target.value)}
          placeholder="Describe sonographic findings by anatomical region. Note echogenicity, fiber pattern, peri-tendinous changes, joint effusion, ROI measurements…"
          disabled={isLocked}
          rows={8}
        />
      </div>

      <div className="rv-report-field">
        <label>Impression / Diagnosis</label>
        <textarea
          value={impression}
          onChange={e => setImpression(e.target.value)}
          placeholder="Working diagnosis, severity grade, ddx considered and excluded…"
          disabled={isLocked}
          rows={4}
        />
      </div>

      <div className="rv-report-field">
        <label>Recommendations</label>
        <textarea
          value={recommendations}
          onChange={e => setRecommendations(e.target.value)}
          placeholder="Activity restriction, follow-up imaging timeline, treatment options, return-to-work guidance…"
          disabled={isLocked}
          rows={5}
        />
      </div>

      <div className="rv-report-sig">
        <div className="rv-sig-line">{isFinalized && c.report ? c.report.signedBy : 'Debra A. Canapp, DVM, DACVSMR, CCRT, CVA'}</div>
        <div className="rv-sig-sub">Diplomate, American College of Veterinary Sports Medicine & Rehabilitation</div>
        {isFinalized && c.report && c.report.signedAt && (
          <div className="rv-sig-when">Signed {new Date(c.report.signedAt).toLocaleString()}</div>
        )}
      </div>

      <div className="rv-report-actions">
        <button className="btn btn-ghost btn-sm" onClick={previewReport}>
          Preview report
        </button>
        {!isFinalized && (
          <button
            className="btn btn-clay"
            onClick={finalize}
            disabled={finalizing || !findings.trim() || !impression.trim()}
            title={!findings.trim() || !impression.trim() ? 'Add findings and impression to finalize' : 'Finalize and deliver the report'}
          >
            {finalizing ? 'Delivering…' : <>Finalize &amp; deliver <span className="arrow">→</span></>}
          </button>
        )}
        {isFinalized && (
          <div className="rv-final-note">
            Report delivered. The referring veterinarian has been notified.
          </div>
        )}
      </div>

      {isFinalized && window.CaseBillingBlock && (
        <window.CaseBillingBlock c={c} entities={billingEntities} on={billingOn || {}} role="admin" />
      )}

      {showInvoice && (
        <window.ReadRateModal
          c={c}
          busy={finalizing}
          onCancel={() => setShowInvoice(false)}
          onConfirm={doFinalize}
        />
      )}

      {/* Workflow timeline */}
      <div className="rv-timeline">
        <div className="rv-section-eyebrow">Workflow</div>
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
    </div>
  );
}


/* ============================================================
   REPORT — printable HTML  (legacy/unused — the live builder is
   window.buildReportHTML in billing.jsx, shared with the portal)
   ============================================================ */
function _legacyBuildReportHTML(c, r) {
  const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const para = (s) => esc(s).split(/\n\n+/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(c.id)} · ${esc(c.patient)} — Diagnostic Report</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  @page { size: letter; margin: 0.85in 0.85in 1in; }
  body { font-family: 'Inter', sans-serif; color: #1f1f1f; max-width: 7in; margin: 0 auto; padding: 36px 24px; line-height: 1.55; font-size: 13px; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1f1f1f; padding-bottom: 18px; margin-bottom: 28px; }
  header .brand { font-family: 'Cormorant Garamond', serif; font-size: 24px; letter-spacing: -0.01em; }
  header .brand .sub { font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #888; margin-top: 4px; font-weight: 500; }
  header .meta { text-align: right; font-size: 11px; color: #555; }
  h1 { font-family: 'Cormorant Garamond', serif; font-size: 30px; letter-spacing: -0.015em; margin: 0 0 6px; line-height: 1.1; }
  .sig { font-size: 12px; color: #555; }
  .pid { font-size: 9.5px; letter-spacing: 0.2em; text-transform: uppercase; color: #b16a48; font-weight: 500; margin-top: 16px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 28px 0; padding: 16px 0; border-top: 1px solid #ddd; border-bottom: 1px solid #ddd; }
  .grid h4 { font-size: 9.5px; letter-spacing: 0.2em; text-transform: uppercase; color: #888; margin: 0 0 4px; font-weight: 500; }
  .grid div p { margin: 0; font-size: 13px; }
  h2 { font-family: 'Cormorant Garamond', serif; font-size: 20px; margin: 28px 0 8px; letter-spacing: -0.01em; }
  section p { margin: 0 0 12px; }
  .draft-stamp { position: fixed; top: 40%; left: 0; right: 0; text-align: center; font-family: 'Cormorant Garamond', serif; font-size: 120px; color: rgba(177,106,72,0.10); transform: rotate(-18deg); pointer-events: none; letter-spacing: 0.2em; font-style: italic; }
  footer { margin-top: 40px; padding-top: 18px; border-top: 1px solid #ddd; font-size: 10.5px; color: #888; line-height: 1.6; }
  .sigblock { margin-top: 36px; padding-top: 24px; border-top: 1px solid #1f1f1f; }
  .sigblock .name { font-family: 'Cormorant Garamond', serif; font-size: 19px; }
  .sigblock .role { font-size: 10.5px; letter-spacing: 0.16em; text-transform: uppercase; color: #888; margin-top: 6px; font-weight: 500; }
  @media print { .draft-stamp { color: rgba(177,106,72,0.18); } }
</style></head><body>
${r.draft ? '<div class="draft-stamp">DRAFT</div>' : ''}
<header>
  <div class="brand">Dr. Debra Canapp<div class="sub">Veterinary Sports Medicine — Diagnostic MSK Ultrasound</div></div>
  <div class="meta">Report date: ${date}<br>Case ID: ${esc(c.id)}</div>
</header>
<h1>${esc(c.patient)}</h1>
<div class="sig">${esc(c.species)} · ${esc(c.breed)} · ${esc(c.age)} · ${esc(c.sex)} · ${esc(c.weight)}</div>
<div class="pid">Diagnostic musculoskeletal ultrasound · Second-opinion read</div>

<div class="grid">
  <div><h4>Referring veterinarian</h4><p>${esc(c.referringVet || '—')}<br>${esc(c.referringClinic || '')}</p></div>
  <div><h4>Submitted</h4><p>${new Date(c.submitted).toLocaleString()}</p></div>
  <div><h4>Presenting complaint</h4><p>${esc(c.complaint || '—')}</p></div>
  <div><h4>Duration</h4><p>${esc(c.duration || '—')}</p></div>
</div>

<section>
  <h2>Findings</h2>
  ${para(r.findings) || '<p><em>—</em></p>'}
</section>

<section>
  <h2>Impression / Diagnosis</h2>
  ${para(r.impression) || '<p><em>—</em></p>'}
</section>

<section>
  <h2>Recommendations</h2>
  ${para(r.recommendations) || '<p><em>—</em></p>'}
</section>

<div class="sigblock">
  <div class="name">Debra A. Canapp, DVM, DACVSMR, CCRT, CVA</div>
  <div class="role">Diplomate, American College of Veterinary Sports Medicine &amp; Rehabilitation</div>
</div>

<footer>
  This report represents a second-opinion interpretation based on the imaging and history provided by the referring veterinarian. It is not a substitute for in-person clinical examination. Diagnostic conclusions assume image quality and acquisition protocol consistent with the canine MSK ultrasound technique.
</footer>
</body></html>`;
}

window.CaseReviewView = CaseReviewView;
