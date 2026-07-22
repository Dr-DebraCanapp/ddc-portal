/* global React, ReactDOM */
/* Portal views — Login, Apply, Dashboard, NewCase, CaseDetail (IndexedDB-backed) */

const { useState: pUseState, useEffect: pUseEffect, useRef: pUseRef, useMemo: pUseMemo } = React;

/* ============================================================
   LOCAL STORE (auth session only — small data)
   ============================================================ */
const SESSION_KEY = 'ddc_portal_session';
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; }
  catch { return null; }
}
function saveSession(s) {
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
}
const ACCOUNTS_KEY = 'ddc_portal_accounts';
function loadAccounts() {
  try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY)) || []; }
  catch { return []; }
}

/* ============================================================
   AUTH GATE — uses Supabase Auth when available, localStorage fallback
   ============================================================ */
function AuthGate({ children }) {
  const [session, setSession] = pUseState(null);
  const [view, setView] = pUseState('login');
  const [ready, setReady] = pUseState(false);

  pUseEffect(() => {
    let unsubscribe = null;
    (async () => {
      await window.PortalDB.ensureSeeded();
      if (window.SupabaseAuth) {
        const s = await window.SupabaseAuth.getSession();
        if (s && s.role === 'vet') setSession(s);
        // listen for sign-in/sign-out events
        const sub = window.SupabaseAuth.onAuthChange((newSession) => {
          if (newSession && newSession.role === 'vet') setSession(newSession);
          else setSession(null);
        });
        unsubscribe = sub && sub.data && sub.data.subscription
          ? () => sub.data.subscription.unsubscribe()
          : null;
      } else {
        const s = loadSession();
        if (s) setSession(s);
      }
      setReady(true);
    })();
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  const login = async (email, password) => {
    if (!email || !password) return { error: 'Email and password are required.' };

    if (window.SupabaseAuth) {
      const result = await window.SupabaseAuth.signIn(email, password);
      if (result.error) return { error: result.error };
      if (result.session && result.session.role !== 'vet') {
        await window.SupabaseAuth.signOut();
        return { error: 'This portal is for referring veterinarians. Practice staff should use the reviewer console.' };
      }
      setSession(result.session);
      return {};
    }

    // Local IndexedDB fallback
    const accounts = loadAccounts();
    const match = accounts.find(a => a.email === email && a.password === password);
    if (match) {
      const s = { email: match.email, name: match.name, clinic: match.clinic, role: 'Referring Veterinarian' };
      saveSession(s); setSession(s);
      return {};
    }
    if (password === 'demo') {
      const s = { email, name: 'Dr. Demo Account', clinic: 'Demo Veterinary Clinic', role: 'Referring Veterinarian' };
      saveSession(s); setSession(s);
      return {};
    }
    return { error: 'Email or password does not match an approved account. Try password "demo" for a sample login.' };
  };

  const logout = async () => {
    if (window.SupabaseAuth) {
      await window.SupabaseAuth.signOut();
    } else {
      saveSession(null);
    }
    setSession(null);
    setView('login');
  };

  if (!ready) return null;
  if (!session) {
    return view === 'apply'
      ? <ApplyView onBack={() => setView('login')} />
      : <LoginView onLogin={login} onApply={() => setView('apply')} />;
  }
  return children({ session, logout });
}

function LoginView({ onLogin, onApply }) {
  const [email, setEmail] = pUseState('');
  const [password, setPassword] = pUseState('');
  const [err, setErr] = pUseState(null);
  const [busy, setBusy] = pUseState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    const r = await onLogin(email, password);
    setBusy(false);
    if (r && r.error) setErr(r.error);
  };
  const cloudMode = !!window.SupabaseAuth;
  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <a href="index.html" className="brand">
          <img src="assets/logo-mark.png" alt="" />
          <span>
            <div className="nm" style={{color:'var(--paper)'}}>Dr. Debra Canapp</div>
            <div className="sub">Referral Portal</div>
          </span>
        </a>
        <div>
          <div className="h">The path to a <em style={{fontStyle:'italic', fontWeight:300, color:'var(--tan)'}}>second-opinion read.</em></div>
          <p className="l">A secure submission portal for approved referring veterinarians — DICOM ultrasound clips, radiographs, MRI/CT, patient history, and video uploads, routed directly to Dr. Canapp for diagnostic interpretation.</p>
          <ul className="signals">
            <li>DICOM, JPEG, MP4, PDF, and DOCX accepted — routed directly to Dr. Canapp for interpretation</li>
            <li>Case status tracked from submission through delivered report</li>
            <li>Written report typically returned in 5–7 business days</li>
            <li>Approved access only — each application is personally reviewed by Dr. Canapp</li>
          </ul>
        </div>
        <div className="foot">Approved access only · For licensed veterinary professionals</div>
      </aside>
      <main className="auth-form">
        <div className="auth-form-inner">
          <div className="eb">§ Sign in</div>
          <h1 className="h">Referral portal</h1>
          <p className="body">Use the credentials emailed to you when your access was approved.</p>
          <form onSubmit={submit}>
            <div className="form-row">
              <label className="form-label">Email<span className="req">*</span></label>
              <input className="form-input" type="email" required autoComplete="email"
                value={email} onChange={e => { setEmail(e.target.value); setErr(null); }}
                placeholder="dr.smith@yourclinic.com" />
            </div>
            <div className="form-row">
              <label className="form-label">Password<span className="req">*</span></label>
              <input className="form-input" type="password" required autoComplete="current-password"
                value={password} onChange={e => { setPassword(e.target.value); setErr(null); }}
                placeholder="••••••••" />
              <div className="form-help">{cloudMode ? 'If you applied for access, sign in with the email you used and the password we sent you.' : 'Demo tip — any email plus password "demo" works for testing.'}</div>
            </div>
            {err && <div className="error-bar">{err}</div>}
            <button type="submit" className="btn form-btn-primary" disabled={busy}>
              {busy ? 'Signing in…' : <>Sign in <span className="arrow">→</span></>}
            </button>
          </form>
          <div className="auth-alt">
            Need access? <a href="#" onClick={(e) => { e.preventDefault(); onApply(); }}>Apply for an account</a>
            <br /><br />
            <a href="index.html" style={{color:'var(--ink-3)', borderBottom:'none', fontSize:12, letterSpacing:'0.16em', textTransform:'uppercase'}}>← Back to drdebracanapp.com</a>
          </div>
        </div>
      </main>
    </div>
  );
}

function ApplyView({ onBack }) {
  const [submitted, setSubmitted] = pUseState(false);
  const [capToken, setCapToken] = pUseState('');
  const [data, setData] = pUseState({ name: '', license: '', clinic: '', email: '', phone: '', country: 'USA', state: '', specialty: '', why: '' });
  const set = (k) => (e) => setData({ ...data, [k]: e.target.value });
  const capOn = window.turnstileEnabled && window.turnstileEnabled();
  const submit = async (e) => {
    e.preventDefault();
    if (capOn && !capToken) { alert('Please complete the anti-spam check.'); return; }
    try { await window.PortalDB.submitApplication(data, capToken); }
    catch (err) { alert('Could not submit application: ' + (err.message || err)); return; }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="auth-shell">
        <aside className="auth-aside">
          <a href="index.html" className="brand">
            <img src="assets/logo-mark.png" alt="" />
            <span><div className="nm" style={{color:'var(--paper)'}}>Dr. Debra Canapp</div><div className="sub">Referral Portal</div></span>
          </a>
          <div>
            <div className="h">Application <em style={{fontStyle:'italic', fontWeight:300, color:'var(--tan)'}}>received.</em></div>
            <p className="l">Dr. Canapp personally reviews every application. Approval typically takes 2–5 working days.</p>
          </div>
          <div className="foot">Approved access only · For licensed veterinary professionals</div>
        </aside>
        <main className="auth-form">
          <div className="auth-form-inner">
            <div className="eb">§ Confirmation</div>
            <h1 className="h">We have your application.</h1>
            <p className="body">A confirmation has been sent to {data.email || 'your inbox'}. Once approved, your login credentials will arrive in a follow-up email.</p>
            <button type="button" className="btn form-btn-primary" onClick={onBack}>← Back to sign in</button>
          </div>
        </main>
      </div>
    );
  }
  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <a href="index.html" className="brand">
          <img src="assets/logo-mark.png" alt="" />
          <span><div className="nm" style={{color:'var(--paper)'}}>Dr. Debra Canapp</div><div className="sub">Referral Portal</div></span>
        </a>
        <div>
          <div className="h">Apply for portal <em style={{fontStyle:'italic', fontWeight:300, color:'var(--tan)'}}>access.</em></div>
          <p className="l">Open to licensed veterinarians worldwide. Provide your credentials below and Dr. Canapp will personally review your application.</p>
          <ul className="signals">
            <li>Confirms your veterinary license and active practice</li>
            <li>Establishes your remote-read pathway to Dr. Canapp</li>
            <li>Free to submit; per-case fees disclosed at submission</li>
          </ul>
        </div>
        <div className="foot">Reviewed personally by Dr. Canapp · 2–5 working days</div>
      </aside>
      <main className="auth-form">
        <div className="auth-form-inner" style={{maxWidth:560}}>
          <div className="eb">§ Apply</div>
          <h1 className="h">Request access.</h1>
          <form onSubmit={submit}>
            <div className="form-row split">
              <div><label className="form-label">Full name<span className="req">*</span></label><input className="form-input" required value={data.name} onChange={set('name')} placeholder="Dr. First Last, DVM" /></div>
              <div><label className="form-label">Veterinary license #<span className="req">*</span></label><input className="form-input" required value={data.license} onChange={set('license')} /></div>
            </div>
            <div className="form-row"><label className="form-label">Practice / clinic<span className="req">*</span></label><input className="form-input" required value={data.clinic} onChange={set('clinic')} /></div>
            <div className="form-row split">
              <div><label className="form-label">Email<span className="req">*</span></label><input className="form-input" type="email" required value={data.email} onChange={set('email')} /></div>
              <div><label className="form-label">Phone</label><input className="form-input" type="tel" value={data.phone} onChange={set('phone')} /></div>
            </div>
            <div className="form-row split">
              <div><label className="form-label">Country<span className="req">*</span></label><input className="form-input" required value={data.country} onChange={set('country')} /></div>
              <div><label className="form-label">State / region</label><input className="form-input" value={data.state} onChange={set('state')} /></div>
            </div>
            <div className="form-row"><label className="form-label">Primary specialty / focus</label><input className="form-input" value={data.specialty} onChange={set('specialty')} placeholder="GP / Sports Med / Rehab / Surgery / etc." /></div>
            <div className="form-row"><label className="form-label">Why are you requesting access?</label><textarea className="form-area" value={data.why} onChange={set('why')} placeholder="Briefly — what types of cases would you submit?" /></div>
            {capOn && window.TurnstileBox ? <window.TurnstileBox onToken={setCapToken} /> : null}
            <button type="submit" className="btn form-btn-primary" disabled={capOn && !capToken}>Submit application <span className="arrow">→</span></button>
          </form>
          <div className="auth-alt"><a href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>← Back to sign in</a></div>
        </div>
      </main>
    </div>
  );
}

/* ============================================================
   APP CHROME
   ============================================================ */
function AppBar({ session, crumb, logout, onHome }) {
  return (
    <header className="app-bar">
      <div className="app-bar-inner">
        <a href="#" onClick={(e) => { e.preventDefault(); onHome(); }} className="brand">
          <img src="assets/logo-mark.png" alt="" />
          <span>
            <div className="nm">Referral Portal</div>
            <div className="sub">Dr. Debra Canapp</div>
          </span>
        </a>
        {crumb && <div className="crumb">{crumb}</div>}
        <div className="who">
          <div>
            <div className="name">{session.name}</div>
            <div className="role" style={{textAlign:'right'}}>{session.clinic}</div>
          </div>
          <button onClick={logout}>Sign out</button>
        </div>
      </div>
    </header>
  );
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function Dashboard({ session, onNew, onOpen }) {
  const [cases, setCases] = pUseState([]);
  const [unread, setUnread] = pUseState({});
  pUseEffect(() => {
    window.PortalDB.getAllCases().then(setCases);
    if (window.PortalDB.getAllComments) {
      window.PortalDB.getAllComments().then(list => setUnread(computeUnread(list, 'vet')));
    }
  }, []);

  const submitted = cases.length;
  const inReview = cases.filter(c => c.status === 'review' || c.status === 'submitted' || c.status === 'queued').length;
  const reported = cases.filter(c => c.status === 'reported').length;

  return (
    <main className="app-main">
      <div className="dash-head">
        <div>
          <div className="eb">Welcome back</div>
          <h2>{doctorGreeting(session)}.</h2>
          <p className="body-lg" style={{marginTop:12, color:'var(--ink-3)'}}>Submit a new case, or check the status of one already in review.</p>
        </div>
        <button onClick={onNew} className="btn btn-clay" style={{padding:'14px 22px'}}>
          New referral <span className="arrow">→</span>
        </button>
      </div>

      <div className="dash-stats">
        <div className="stat"><div className="n">{submitted}</div><div className="l">Total cases</div></div>
        <div className="stat"><div className="n">{inReview}</div><div className="l">In review</div></div>
        <div className="stat"><div className="n">{reported}</div><div className="l">Reported</div></div>
        <div className="stat"><div className="n">5–7d</div><div className="l">Avg. turnaround</div></div>
      </div>

      <div className="eb" style={{fontSize:11, letterSpacing:'0.22em', textTransform:'uppercase', color:'var(--clay)', fontWeight:500, marginBottom:18}}>Your cases</div>

      {cases.length === 0 ? (
        <div className="empty-state">
          <div className="es-mark">D</div>
          <h3 className="es-title">No referrals yet.</h3>
          <p className="es-body">When you submit a case, it appears here — with live status as Dr. Canapp reviews the imaging and returns a report. Most referrals are turned around in 5–7 days.</p>
          <button onClick={onNew} className="btn btn-clay es-cta">
            Submit your first referral <span className="arrow">→</span>
          </button>
        </div>
      ) : (
        <div className="case-list">
          {cases.map(c => (
            <div key={c.id} className={`case-row ${unread[c.id] ? 'has-unread' : ''}`} onClick={() => onOpen(c.id)}>
              <div className="id">{c.id.split('-').pop()}</div>
              <div>
                <div className="patient">{c.patient} <UnreadBadge n={unread[c.id]} label={`${unread[c.id] || 0} new reply from Dr. Canapp`} /></div>
                <div className="sig">{c.breed} · {c.age} · {c.sex} · {c.weight}</div>
              </div>
              <div className="complaint">{c.complaint}</div>
              <div className="ts">{new Date(c.submitted).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
              <div><span className={`status-pill ${c.status}`}>{statusLabel(c.status)}</span></div>
              <div className="arrow">→</div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function statusLabel(s) {
  return { draft: 'Draft', queued: 'Queued', submitted: 'Submitted', acknowledged: 'Acknowledged', review: 'In review', reported: 'Reported' }[s] || s;
}

// "Welcome back, Dr. Park." — derive a clean Dr. {lastname} from the
// account name, gracefully handling credential suffixes and email-only names.
function doctorGreeting(session) {
  const raw = (session && session.name) || '';
  let n = raw.includes('@') ? raw.split('@')[0].replace(/[._\-]+/g, ' ') : raw;
  n = n.replace(/,.*$/, '').replace(/\b(d\.?v\.?m\.?|dvm|dacvsmr|ccrt|cva|ms|phd|dipl?)\b/gi, '');
  n = n.replace(/^\s*dr\.?\s+/i, '').trim();
  if (!n) return 'Doctor';
  const parts = n.split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1];
  return 'Dr. ' + last.charAt(0).toUpperCase() + last.slice(1);
}

/* ============================================================
   DROPZONE (with IndexedDB persistence)
   ============================================================ */
function DropZone({ label, accept, multiple = true, icon = '⬆', files, setFiles, badge = 'FILE', kind = 'file', caseId = 'pending' }) {
  const inputRef = pUseRef(null);
  const [drag, setDrag] = pUseState(false);
  const [uploading, setUploading] = pUseState(false);

  const add = async (list) => {
    setUploading(true);
    try {
      const incoming = [];
      for (const f of Array.from(list)) {
        const fid = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        const ftype = f.type || guessType(f.name);
        const preview = ftype.startsWith('image/') ? URL.createObjectURL(f) : null;
        // Hold the file in memory; it's uploaded after the case is created
        // on submit (cloud storage requires the owning case to exist first).
        incoming.push({ id: fid, name: f.name, size: f.size, type: ftype, kind, preview, blob: f });
      }
      setFiles([...files, ...incoming]);
    } catch (err) {
      alert('Could not add file(s): ' + (err.message || err));
    } finally {
      setUploading(false);
    }
  };

  const rm = (id) => {
    setFiles(files.filter(f => f.id !== id));
  };

  return (
    <div>
      <div
        className={`dropzone ${drag ? 'active' : ''}`}
        onClick={() => !uploading && inputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
      >
        <div className="icon">{uploading ? '⋯' : icon}</div>
        <div className="t">{uploading ? 'Saving…' : label}</div>
        <div className="h">Drag files here, or <span className="browse">browse to upload</span></div>
        <input ref={inputRef} type="file" accept={accept} multiple={multiple}
               onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      </div>

      {files.length > 0 && (
        <div className="file-grid">
          {files.map(f => (
            <div key={f.id} className="file-card">
              <div className="thumb">
                {f.preview ? <img src={f.preview} alt="" />
                  : <span className="fmt">{fmtBadge(f.name)}</span>}
                <span className="badge">{badge}</span>
              </div>
              <div className="fname">{f.name}</div>
              <div className="meta">{prettySize(f.size)} · {fmtBadge(f.name)}</div>
              <button className="rm" onClick={(e) => { e.stopPropagation(); rm(f.id); }} title="Remove">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function guessType(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (['dcm', 'dicom'].includes(ext)) return 'application/dicom';
  if (['jpg','jpeg','png','tiff','tif','bmp','gif'].includes(ext)) return 'image/' + ext;
  if (['mp4','mov','webm','avi','m4v'].includes(ext)) return 'video/' + ext;
  if (ext === 'adi') return 'application/octet-stream';
  if (['pdf'].includes(ext)) return 'application/pdf';
  if (['doc','docx'].includes(ext)) return 'application/msword';
  return 'application/octet-stream';
}
function fmtBadge(name) { return (name.split('.').pop() || '').toUpperCase(); }
function prettySize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/* ============================================================
   COMMENT THREAD — post-report Q&A between the referring vet and
   Dr. Canapp. Used on BOTH the vet portal (CaseDetailView) and the
   reviewer console (CaseReviewView). `role` is 'vet' | 'reviewer'.
   ============================================================ */
function relTime(iso) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/* ============================================================
   UNREAD COMMENT TRACKING (per-browser, per-role)
   A case is "unread" for a viewer when the OTHER party posted a
   comment newer than the viewer last opened that case's thread.
   Read-state is stored locally so it follows the device/login.
   ============================================================ */
const COMMENTS_READ_KEY = 'ddc_comments_read';
function getCommentsReadMap() {
  try { return JSON.parse(localStorage.getItem(COMMENTS_READ_KEY)) || {}; }
  catch (e) { return {}; }
}
function markCommentsRead(caseId, viewerRole) {
  if (!caseId || !viewerRole) return;
  const m = getCommentsReadMap();
  m[viewerRole + ':' + caseId] = new Date().toISOString();
  localStorage.setItem(COMMENTS_READ_KEY, JSON.stringify(m));
}
function computeUnread(allComments, viewerRole) {
  const m = getCommentsReadMap();
  const out = {};
  (allComments || []).forEach(cm => {
    if (cm.role === viewerRole) return;            // own messages are never unread
    const lr = m[viewerRole + ':' + cm.case_id];
    const lrt = lr ? new Date(lr).getTime() : 0;
    if (new Date(cm.ts).getTime() > lrt) out[cm.case_id] = (out[cm.case_id] || 0) + 1;
  });
  return out;
}

function UnreadBadge({ n, label }) {
  if (!n) return null;
  return (
    <span className="msg-badge" title={label || (n + ' new message' + (n === 1 ? '' : 's'))}>
      <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M1.6 2.4h10.8v6.6H6l-3 2.3V9H1.6z" fill="currentColor" />
      </svg>
      {n}
    </span>
  );
}

function CommentThread({ caseId, role, name, locked }) {
  const [comments, setComments] = pUseState([]);
  const [draft, setDraft] = pUseState('');
  const [sending, setSending] = pUseState(false);
  const [loaded, setLoaded] = pUseState(false);

  const load = async () => {
    const list = await window.PortalDB.getComments(caseId);
    setComments(list || []);
    setLoaded(true);
    markCommentsRead(caseId, role);   // opening the thread clears its unread state
  };
  pUseEffect(() => { load(); /* eslint-disable-next-line */ }, [caseId]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const list = await window.PortalDB.addComment(caseId, { role, name, text });
      setComments(list || []);
      setDraft('');
    } catch (e) {
      alert('Could not post comment: ' + (e.message || e));
    }
    setSending(false);
  };

  const onKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); send(); }
  };

  return (
    <div className="comment-thread">
      <div className="ct-head">
        <div>
          <div className="ct-eyebrow">Case discussion</div>
          <div className="ct-title">Questions &amp; follow-up</div>
        </div>
        <div className="ct-count">{comments.length} {comments.length === 1 ? 'message' : 'messages'}</div>
      </div>

      <p className="ct-intro">
        {role === 'reviewer'
          ? 'Answer the referring veterinarian’s questions about this case, or add a follow-up note. They are notified by email.'
          : 'Have a question about the report or the recommendations? Message Dr. Canapp here — the thread stays open for this case.'}
      </p>

      <div className="ct-list">
        {loaded && comments.length === 0 && (
          <div className="ct-empty">No messages yet. {role === 'vet' ? 'Start the conversation below.' : 'Awaiting questions from the referring veterinarian.'}</div>
        )}
        {comments.map(c => (
          <div key={c.id} className={`ct-msg ${c.role === role ? 'mine' : 'theirs'} ${c.role === 'reviewer' ? 'is-reviewer' : 'is-vet'}`}>
            <div className="ct-msg-head">
              <span className="ct-author">{c.name}</span>
              <span className="ct-role">{c.role === 'reviewer' ? 'Dr. Canapp · Reviewer' : 'Referring vet'}</span>
              <span className="ct-time">{relTime(c.ts)}</span>
            </div>
            <div className="ct-bubble">{c.text}</div>
          </div>
        ))}
      </div>

      <div className="ct-compose">
        <div className="ct-compose-label">{role === 'reviewer' ? 'Reply to the referring veterinarian' : 'Ask Dr. Canapp about this case'}</div>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={onKey}
          placeholder={role === 'reviewer' ? 'Type your reply — note region, measurements, or next steps as needed…' : 'Type your question about the report, the findings, or the recommendations…'}
          rows={6}
        />
        <div className="ct-compose-foot">
          <span className="ct-hint">⌘ / Ctrl + Enter to send</span>
          <button className="btn btn-clay" onClick={send} disabled={!draft.trim() || sending}>
            {sending ? 'Sending…' : <>Post message <span className="arrow">→</span></>}
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  AuthGate, AppBar, Dashboard, DropZone,
  statusLabel, prettySize, fmtBadge, guessType,
  CommentThread, UnreadBadge,
  getCommentsReadMap, markCommentsRead, computeUnread,
});
