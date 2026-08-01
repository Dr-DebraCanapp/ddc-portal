/* global React, ReactDOM, window */
/* ============================================================
   Schedule — app shell, state, cloud wiring, mount
   Backed by Supabase via window.SchedCloud (schedule-cloud.js).
   No offline fallback: sign-in required, errors surface plainly.
   ============================================================ */

/* ---- dragonflies (lifted from the live console) ------------ */
function SchedDragonfly({ size = 32 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <g fill="currentColor">
        <g opacity="0.5">
          <ellipse cx="17.4" cy="7.3" rx="6.4" ry="1.25" transform="rotate(-9 12 7.6)" />
          <ellipse cx="6.6" cy="7.3" rx="6.4" ry="1.25" transform="rotate(9 12 7.6)" />
          <ellipse cx="17" cy="8.7" rx="5.9" ry="1.2" transform="rotate(16 12 8.2)" />
          <ellipse cx="7" cy="8.7" rx="5.9" ry="1.2" transform="rotate(-16 12 8.2)" />
        </g>
        <ellipse cx="12" cy="3.2" rx="1.9" ry="1.45" />
        <ellipse cx="12" cy="6.6" rx="1.45" ry="2.1" />
        <path d="M11.45 8.4 L12.55 8.4 L12.22 22.2 Q12 22.9 11.78 22.2 Z" />
      </g>
    </svg>
  );
}
const SCHED_SWARM = [
  { top: '20%', left: '2%', size: 38, rot: 22, op: 0.10, dur: 12, delay: 0 },
  { top: '74%', left: '3.5%', size: 28, rot: -14, op: 0.08, dur: 14, delay: 2.4 },
  { bottom: '14%', right: '4%', size: 34, rot: 198, op: 0.09, dur: 13, delay: 1.1 },
  { top: '8%', right: '20%', size: 22, rot: -36, op: 0.06, dur: 12.5, delay: 0.6 },
];
function SchedDragonflyField() {
  return (
    <div className="dfly-field" aria-hidden="true">
      {SCHED_SWARM.map((d, i) => (
        <span key={i} className="dfly" style={{ top: d.top, left: d.left, right: d.right, bottom: d.bottom, opacity: d.op, animationDuration: `${d.dur}s`, animationDelay: `${d.delay}s` }}>
          <span className="dfly-rot" style={{ transform: `rotate(${d.rot}deg)` }}><SchedDragonfly size={d.size} /></span>
        </span>
      ))}
    </div>
  );
}

/* ---- toast ------------------------------------------------- */
function Toast({ msg }) {
  if (!msg) return null;
  return <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 300, background: 'var(--ink)', color: 'var(--paper)', padding: '13px 22px', fontSize: 13.5, letterSpacing: '0.02em', boxShadow: '0 18px 40px -16px rgba(0,0,0,0.5)', borderLeft: '3px solid var(--clay)' }}>{msg}</div>;
}

/* ---- top bar ----------------------------------------------- */
function SchedBar({ profile }) {
  const isHospital = profile && profile.role === 'hospital';
  return (
    <header className="rv-bar">
      <div className="rv-bar-inner">
        <a href="Schedule.html" className="rv-brand" title="In-person scheduling">
          <img src="assets/logo-mark.png" alt="" onError={e => { e.target.style.display = 'none'; }} />
          <div>
            <div className="rv-brand-name">In-Person Scheduling</div>
            <div className="rv-brand-sub">Dr. Debra Canapp · Traveling MSK Ultrasound</div>
          </div>
        </a>
        <nav className="rv-nav">
          {!isHospital && <a href="Console.html" className="rv-nav-link" title="Everything in one place — remote reads + in-person">⌂ Console</a>}
          <a href="Schedule.html" className="rv-nav-link active">Schedule</a>
          {!isHospital && <a href="Applications.html" className="rv-nav-link">Visit requests</a>}
          {!isHospital && <a href="reviewer.html" className="rv-nav-link muted" title="Remote-read referral portal (separate system)">Remote reads ↗</a>}
        </nav>
        <div className="rv-who">
          <div className="rv-who-meta">
            <div className="rv-who-name">{profile ? (profile.name || profile.email) : '—'}</div>
            <div className="rv-who-role">{isHospital ? 'Hospital account' : 'Admin'}</div>
          </div>
          <button className="rv-logout" onClick={() => window.SchedCloud.signOut()}>Sign out</button>
        </div>
      </div>
    </header>
  );
}

/* ============================================================
   SIGN-IN + GATE
   ============================================================ */
function SchedNotice({ title, children }) {
  return (
    <div className="rv-page">
      <SchedDragonflyField />
      <main className="rv-main" style={{ maxWidth: 560, paddingTop: '14vh' }}>
        <div className="rv-head" style={{ textAlign: 'center' }}>
          <div className="rv-eyebrow">In-Person Scheduling · Dr. Debra Canapp</div>
          <h2 className="rv-h">{title}</h2>
          <div className="rv-sub" style={{ marginTop: 12 }}>{children}</div>
        </div>
      </main>
    </div>
  );
}

function SchedSignIn({ onSignedIn, denied, onDismiss }) {
  const AX = window.AccessNotice;
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await window.SchedCloud.signIn(email.trim(), pw); onSignedIn(); }
    catch (ex) { setErr(ex.message || 'Sign-in failed.'); setBusy(false); }
  };
  return (
    <div className="rv-page">
      <SchedDragonflyField />
      {denied === 'vet' && (
        <AX
          title="This page is for hospitals hosting a clinic day."
          body="Your account is a referring-veterinarian account — the remote-read portal is where your cases live."
          links={[
            { href: 'index.html', t: 'Referring veterinarians',
              d: 'Submit a study for a remote read, and collect your report' },
          ]}
          onDismiss={onDismiss}
        />
      )}
      {denied === 'unlinked' && (
        <AX
          eyebrow="Not set up yet"
          title="Your account isn't linked to a hospital yet."
          body="Our office finishes this when your first visit is approved. Email info@DrDebraCanapp.com and we'll sort it out."
          links={[]}
          onDismiss={onDismiss}
          dismissLabel="Back to sign in"
        />
      )}
      <main className="rv-main" style={{ maxWidth: 440, paddingTop: '12vh' }}>
        <div className="rv-head" style={{ textAlign: 'center', marginBottom: 26 }}>
          <img src="assets/logo-mark.png" alt="" style={{ width: 56, height: 56, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />
          <div className="rv-eyebrow" style={{ marginTop: 10 }}>In-Person Scheduling</div>
          <h2 className="rv-h">Sign in.</h2>
          <p className="rv-sub">Sign in with the details our office sent you.</p>
        </div>
        <form onSubmit={go} style={{ background: 'var(--paper-deep, rgba(0,0,0,0.03))', padding: '26px 26px 22px', border: '1px solid var(--line, #e6e1d6)' }}>
          <div className="form-row"><label className="form-label">Email</label>
            <input className="form-input" type="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div className="form-row" style={{ marginTop: 12 }}><label className="form-label">Password</label>
            <input className="form-input" type="password" required value={pw} onChange={e => setPw(e.target.value)} /></div>
          {err && <div style={{ color: '#c24444', fontSize: 13, marginTop: 12 }}>{err}</div>}
          <button className="btn btn-clay" type="submit" disabled={busy} style={{ width: '100%', marginTop: 18 }}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <div className="form-help" style={{ marginTop: 12, textAlign: 'center' }}>No account? Hospitals are set up by our office after a <a href="ClinicIntake.html">visit request</a> is approved.</div>
        </form>
      </main>
    </div>
  );
}

function SchedGate() {
  const [phase, setPhase] = useState('boot'); // boot | config | signin | denied | error | ready
  const [denied, setDenied] = useState(null);
  const [err, setErr] = useState('');
  const [profile, setProfile] = useState(null);
  const [boot, setBoot] = useState(null);

  const load = async () => {
    try {
      const prof = await window.SchedCloud.profile();
      if (!prof) { setPhase('signin'); return; }
      // Wrong door: sign them out first, or a refresh strands them on the wall.
      if (prof.role === 'vet') {
        try { await window.SchedCloud.signOut(); } catch (e) {}
        setDenied('vet'); setPhase('signin'); return;
      }
      if (prof.role === 'hospital' && !prof.sched_clinic_id) {
        try { await window.SchedCloud.signOut(); } catch (e) {}
        setDenied('unlinked'); setPhase('signin'); return;
      }
      const isAdmin = prof.role === 'reviewer' || prof.role === 'admin';
      // prices first: everything downstream is priced from the active card
      if (window.SchedRates) { try { await window.SchedRates.load(); } catch (e) { window.SchedRates.setCards([]); } }
      const data = await window.SchedCloud.loadAll(isAdmin);
      // remote reads + saved statements, so Billing covers both applications
      if (isAdmin) {
        try {
          const [rd, st] = await Promise.all([
            window.SchedCloud.loadBillableCases(),
            window.SchedCloud.loadStatements(),
          ]);
          data.reads = rd; data.statements = st;
        } catch (e) { data.reads = []; data.statements = {}; }
      }
      // real clock, midnight-anchored
      const now = new Date();
      window.SCHED.TODAY = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      // shared components look clinics up via SCHED.CLINICS — swap contents in place
      window.SCHED.CLINICS.length = 0;
      window.SCHED.CLINICS.push(...data.clinics);
      setProfile(prof); setBoot(data); setPhase('ready');
    } catch (ex) {
      setErr(ex.message || String(ex)); setPhase('error');
    }
  };

  useEffect(() => {
    (async () => {
      if (!window.SchedCloud || !window.SchedCloud.configured) { setPhase('config'); return; }
      try {
        const session = await window.SchedCloud.session();
        if (!session) { setPhase('signin'); return; }
        await load();
      } catch (ex) { setErr(ex.message || String(ex)); setPhase('error'); }
    })();
  }, []);

  if (phase === 'boot') return <SchedNotice title="Connecting…">Loading the schedule from the cloud.</SchedNotice>;
  if (phase === 'config') return <SchedNotice title="Not configured.">Supabase keys are missing from <code>config.js</code>, or the client library failed to load. The scheduling system requires a live connection — see <strong>SCHED-SUPABASE-SETUP.md</strong>.</SchedNotice>;
  if (phase === 'error') return <SchedNotice title="Couldn't reach the cloud."><p style={{ color: '#c24444' }}>{err}</p><p>Check your connection and reload. Nothing was lost — the schedule lives in Supabase.</p></SchedNotice>;
  if (phase === 'signin') return <SchedSignIn onSignedIn={load} denied={denied} onDismiss={() => setDenied(null)} />;
  return <ScheduleApp profile={profile} boot={boot} reload={load} />;
}

/* ============================================================
   MAIN APP
   ============================================================ */
function ScheduleApp({ profile, boot }) {
  const Sx = window.SCHED;
  const Cloud = window.SchedCloud;
  const isHospital = profile.role === 'hospital';

  const [days, setDays] = useState(boot.days);
  const [incoming, setIncoming] = useState(boot.incoming);
  const [clinicRev, setClinicRev] = useState(0);

  // role: hospitals are locked to the clinic side; admins can preview it
  const [role, setRole] = useState(isHospital ? 'clinic' : 'admin');
  const previewClinic = (Sx.CLINICS.find(c => c.status === 'active') || Sx.CLINICS[0] || {}).id || null;
  const clinicId = isHospital ? profile.sched_clinic_id : previewClinic;

  const [reads, setReads] = useState(boot.reads || []);          // finalized remote reads
  const [stmts, setStmts] = useState(boot.statements || {});      // statement id → invoice
  const [ledgerView, setLedgerView] = useState('month');
  const [tab, setTab] = useState('calendar');
  const [cur, setCur] = useState([Sx.TODAY.getFullYear(), Sx.TODAY.getMonth()]);
  const [anchor, setAnchor] = useState(new Date(Sx.TODAY));
  const [selId, setSelId] = useState(null);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const setMonth = ([y, m]) => setCur([y, m]);

  const flash = (m) => { setToast(m); clearTimeout(window.__scToast); window.__scToast = setTimeout(() => setToast(''), 3200); };
  const oops = (e) => { console.error(e); flash('⚠ ' + (e.message || 'Something went wrong — change not saved.')); };

  /* ---- realtime: refetch on any change from other sessions ---- */
  const refresh = async () => {
    try {
      const isAdmin = !isHospital;
      const data = await Cloud.loadAll(isAdmin);
      Sx.CLINICS.length = 0; Sx.CLINICS.push(...data.clinics);
      setDays(data.days); setIncoming(data.incoming); setClinicRev(r => r + 1);
    } catch (e) { console.warn('[sched] live refresh failed', e); }
  };
  useEffect(() => Cloud.subscribe(refresh), []);

  // role-scoped visibility
  const visible = useMemo(() => {
    if (role === 'admin') return days;
    return days.filter(d => d.clinic === clinicId || (d.status === 'available' && (!d.reservedFor || d.reservedFor === clinicId)));
  }, [days, role, clinicId]);

  const selected = selId ? days.find(d => d.id === selId) : null;

  // apply fn locally AND return the computed day so callers can persist it
  const updateDay = (id, fn) => {
    const curDay = days.find(d => d.id === id);
    if (!curDay) return null;
    const next = fn({ ...curDay });
    setDays(prev => prev.map(d => d.id === id ? next : d));
    return next;
  };
  const saveDay = (nd) => { if (nd) Cloud.saveDay(nd).catch(oops); };
  const newPatientId = () => 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---- actions (each one: local update + cloud write) ----
  const who = () => (profile && (profile.name || profile.email)) || role || 'admin';

  /* Write an invoice back to whichever store the entity came from:
     a clinic day row, or a monthly statement row. */
  const persistInvoice = (e, inv) => {
    if (e.kind === 'remote') {
      setStmts(prev => ({ ...prev, [e.id]: inv }));
      Cloud.saveStatement({ ...e, invoice: inv }).catch(oops);
    } else {
      saveDay(updateDay(e.id, d => ({ ...d, status: d.status === 'confirmed' ? 'completed' : d.status, invoice: inv })));
    }
  };
  const on = {
    assign: (day) => setModal({ type: 'assign', day }),
    book: (day) => { saveDay(updateDay(day.id, d => ({ ...d, clinic: clinicId, status: 'booked', reservedFor: null }))); flash('Day booked. Add the patients you want seen.'); },
    unpublish: (day) => { setDays(prev => prev.filter(d => d.id !== day.id)); setSelId(null); Cloud.deleteDay(day.id).catch(oops); flash('Open day removed.'); },
    addPatient: (day) => setModal({ type: 'patient', day, patient: null }),
    editPatient: (day, patient) => setModal({ type: 'patient', day, patient }),
    removePatient: (day, patient) => { updateDay(day.id, d => ({ ...d, patients: d.patients.filter(p => p.id !== patient.id) })); Cloud.deletePatient(patient.id).catch(oops); },
    cancelPatient: (day, patient, reinstate) => {
      const cancelled = reinstate ? null : { by: role, reason: role === 'admin' ? 'Cancelled by admin (our office).' : 'Cancelled by the clinic.' };
      updateDay(day.id, d => ({ ...d, patients: d.patients.map(p => p.id === patient.id ? { ...p, cancelled } : p) }));
      Cloud.savePatient(day.id, { ...patient, cancelled }).catch(oops);
      flash(reinstate ? 'Patient reinstated.' : 'Patient cancelled — removed from the day’s invoice.');
    },
    confirm: (day) => { saveDay(updateDay(day.id, d => ({ ...d, status: 'confirmed' }))); flash('Roster confirmed.'); },
    submit: (day) => {
      const who = isHospital ? (profile.name || profile.email) : (Sx.clinic(clinicId) || {}).contact;
      saveDay(updateDay(day.id, d => ({ ...d, status: 'submitted', submittedBy: who, submittedAt: new Date() })));
      setSelId(null); flash('Roster submitted — sent to our office for approval.');
    },
    approve: (day) => { saveDay(updateDay(day.id, d => ({ ...d, status: 'confirmed' }))); flash('Roster approved — clinic day confirmed.'); },
    sendBack: (day) => { saveDay(updateDay(day.id, d => ({ ...d, status: 'booked' }))); flash('Sent back to the clinic for changes.'); },
    withdraw: (day) => { saveDay(updateDay(day.id, d => ({ ...d, status: 'booked' }))); flash('Submission withdrawn — you can edit the roster again.'); },
    complete: (day) => {
      saveDay(updateDay(day.id, d => ({ ...d, status: 'completed' })));
      flash('Day marked complete. Issue the invoice from Billing when you’re ready.');
    },

    /* ---- invoicing — ONE path for both applications ---- */
    /* An entity is either a clinic day or a monthly remote-read statement.
       persist() puts the invoice back where that entity lives. */
    issueInvoice: (e) => {
      const B = window.SchedBill;
      const inv = B.issue(window.SchedEntities.numbers(entities), e, who());
      persistInvoice(e, inv);
      flash('Invoice ' + inv.number + ' issued · Net ' + inv.termsDays + ', due ' + new Date(inv.due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + '.');
    },
    openPayment: (e) => setModal({ type: 'payment', entityId: e.id }),
    addPayment: (e, pay) => {
      const B = window.SchedBill;
      const inv = B.logged({ ...(e.invoice || {}), payments: [...((e.invoice && e.invoice.payments) || []), pay] }, who(), 'Payment ' + Sx.money(pay.amount) + ' (' + B.method(pay.method).label + ')');
      persistInvoice(e, inv);
      const after = { ...e, invoice: inv };
      flash(B.balance(after) > 0 ? 'Payment recorded · ' + Sx.money(B.balance(after)) + ' still outstanding.' : 'Paid in full — receipt available.');
    },
    removePayment: (e, payId) => {
      const B = window.SchedBill;
      persistInvoice(e, B.logged({ ...e.invoice, payments: (e.invoice.payments || []).filter(p => p.id !== payId) }, who(), 'Payment removed'));
      flash('Payment removed.');
    },
    addCharge: (e, charge) => {
      const B = window.SchedBill;
      const base = e.invoice || { charges: [], payments: [], audit: [] };
      persistInvoice(e, B.logged({ ...base, charges: [...(base.charges || []), charge] }, who(), B.chargeLabel(charge) + ' ' + (B.chargeSign(charge) < 0 ? '−' : '+') + Sx.money(charge.amount)));
      flash(B.chargeLabel(charge) + ' added.');
    },
    removeCharge: (e, chargeId) => {
      const B = window.SchedBill;
      persistInvoice(e, B.logged({ ...e.invoice, charges: (e.invoice.charges || []).filter(c => c.id !== chargeId) }, who(), 'Adjustment removed'));
    },
    writeOff: (e, off) => {
      const B = window.SchedBill;
      persistInvoice(e, B.logged({ ...e.invoice, writtenOff: off }, who(), off ? 'Balance written off' : 'Reinstated'));
      flash(off ? 'Balance written off.' : 'Invoice reinstated.');
    },

    signoff: (day) => setModal({ type: 'signoff', day }),
    daysheet: (day) => setModal({ type: 'daysheet', day }),
    saveSignoff: (day, data) => { saveDay(updateDay(day.id, d => ({ ...d, signoff: data }))); setModal(null); flash('Consent sign-off saved to the clinic-day record.'); },
    removeSignoff: (day) => { saveDay(updateDay(day.id, d => ({ ...d, signoff: null }))); setModal(null); flash('Sign-off removed — ready to re-sign.'); },
    editClinic: (clinic) => setModal({ type: 'clinic', clinic }),
    saveClinic: (clinic, patch) => {
      Object.assign(clinic, patch);
      setClinicRev(r => r + 1); setModal(null);
      Cloud.saveClinic(clinic).catch(oops);
      flash(patch.status === 'active' && clinic.account === 'active' ? `${clinic.name} saved.` : `${clinic.name} activated.`);
    },
  };

  const onPublish = (dt) => {
    const id = 'cd-' + Sx.iso(dt);
    if (days.find(d => d.id === id)) { flash('That day is already on the calendar.'); return; }
    setModal({ type: 'publish', day: { id, date: new Date(dt) } });
  };
  /* Publish one day, or a whole block. Dates already on the calendar are skipped. */
  const publishDay = (day, reservedFor, dates) => {
    const list = (dates && dates.length ? dates : [day.date]).map(d => new Date(d));
    const fresh = list
      .map(d => ({ id: 'cd-' + Sx.iso(d), date: d }))
      .filter(x => !days.some(existing => existing.id === x.id));
    if (!fresh.length) { setModal(null); flash('Those days are already on the calendar.'); return; }
    const rows = fresh.map(x => ({ id: x.id, date: x.date, clinic: null, status: 'available', reservedFor: reservedFor || null, patients: [], invoice: null }));
    setDays(prev => [...prev, ...rows]);
    rows.forEach(r => Cloud.saveDay(r).catch(oops));
    setModal(null);
    const who = reservedFor ? ' held for ' + (Sx.clinic(reservedFor) || {}).name : '';
    flash(rows.length === 1 ? 'Day published' + who + '.' : rows.length + ' days published' + who + '.');
  };

  const savePatient = async (day, data) => {
    const isNew = !data.id;
    const id = data.id || newPatientId();
    let files = data.files || [];
    try { files = await Cloud.uploadPatientFiles(day.id, id, files); }
    catch (e) { oops(e); return; }
    const pat = { ...data, id, files };
    updateDay(day.id, d => {
      const exists = d.patients.find(p => p.id === id);
      const patients = exists ? d.patients.map(p => p.id === id ? { ...pat } : p) : [...d.patients, { ...pat }];
      return { ...d, patients };
    });
    Cloud.savePatient(day.id, pat).catch(oops);
    setModal(null);
    flash(isNew ? 'Patient added to the day.' : 'Patient updated.');
  };

  const openDay = (day) => setSelId(day.id);
  // ---- header stats (admin scope) ----
  /* ONE billing model for both applications: clinic days + monthly
     remote-read statements, resolved against the account registry. */
  const billing = useMemo(() => window.SchedEntities.all(days, reads, stmts), [days, reads, stmts]);
  const entities = billing.entities;
  const accounts = billing.accounts;

  const stats = useMemo(() => {
    const up = days.filter(d => (d.date >= Sx.TODAY || Sx.sameDay(d.date, Sx.TODAY)) && d.status !== 'available');
    const pts = up.reduce((s, d) => s + Sx.active(d).length, 0);
    const open = days.filter(d => d.status === 'available').length;
    const pending = days.filter(d => d.status === 'submitted').length;
    const sed = up.reduce((s, d) => s + Sx.active(d).filter(p => Sx.sedation(p).required).length, 0);
    const B = window.SchedBill;
    const outstanding = (entities || []).reduce((s, e) => s + (e.invoice && e.invoice.issued ? B.balance(e) : 0), 0);
    return { up: up.length, pts, open, pending, sed, outstanding };
  }, [days]);

  const pendingDays = useMemo(() => days.filter(d => d.status === 'submitted').sort((a, b) => a.date - b.date), [days]);
  const imagingUnrouted = incoming.filter(s => s.status === 'unrouted').length;

  const [y, m] = cur;
  const myClinic = clinicId ? Sx.clinic(clinicId) : null;

  return (
    <div className="rv-page">
      <SchedDragonflyField />
      <SchedBar profile={profile} />

      {/* sub bar */}
      <div className="sc-subbar">
        <div className="sc-subbar-inner">
          <div className="sc-seg">
            <button className={tab === 'calendar' ? 'active' : ''} onClick={() => setTab('calendar')}>Calendar</button>
            {!isHospital && <button className={tab === 'clinics' ? 'active' : ''} onClick={() => setTab('clinics')}>Clinics</button>}
            {isHospital && <button className={tab === 'account' ? 'active' : ''} onClick={() => setTab('account')}>Account</button>}
            {role === 'admin' && <button className={tab === 'billing' ? 'active' : ''} onClick={() => setTab('billing')}>Billing</button>}
            {role === 'admin' && <button className={tab === 'imaging' ? 'active' : ''} onClick={() => setTab('imaging')}>Imaging {imagingUnrouted > 0 && <span className="sc-tab-badge">{imagingUnrouted}</span>}</button>}
          </div>
          <div className="sc-subbar-spacer" />
          {!isHospital && (
            <React.Fragment>
            </React.Fragment>
          )}
        </div>
      </div>

      <main className="rv-main">
        {/* header */}
        <div className="rv-head">
          <div className="rv-eyebrow">Schedule · {Sx.fmtLong(Sx.TODAY)}, {Sx.TODAY.getFullYear()}</div>
          <h2 className="rv-h">{role === 'admin' ? <>What's Next? <span style={{ color: 'var(--clay)', verticalAlign: 'baseline', display: 'inline-block', transform: 'translateY(4px)' }}><SchedDragonfly size={34} /></span></> : 'Book Dr. Canapp.'}</h2>
          <p className="rv-sub">
            {role === 'admin'
              ? <>You have <strong>{stats.up} clinic day{stats.up === 1 ? '' : 's'}</strong> ahead{stats.pending > 0 ? <> and <strong>{stats.pending} roster{stats.pending === 1 ? '' : 's'}</strong> waiting on your approval</> : <> and <strong>{stats.open} open day{stats.open === 1 ? '' : 's'}</strong> to fill</>}. {stats.sed > 0 && <>{stats.sed} patient{stats.sed === 1 ? '' : 's'} will need sedation.</>}</>
              : myClinic
                ? <>You're signed in as <strong>{myClinic.name}</strong>. Book an open day, add the patients you'd like Dr. Canapp to scan, then submit the roster for approval.</>
                : <>No clinic is linked to this view yet.</>}
          </p>
        </div>

        {role === 'clinic' && myClinic && (
          <div className="sc-clinic-banner">
            <span className="ic"><SchedDragonfly size={40} /></span>
            <div>
              <div className="who">{myClinic.name}</div>
              <div className="sub">{myClinic.city}, {myClinic.state} · books {(myClinic.bookingDays || []).length ? (myClinic.bookingDays || []).map(i => Sx.WEEKDAYS[i]).join(' · ') : 'any weekday'} · up to {myClinic.maxCasesPerDay} patients a day</div>
            </div>
          </div>
        )}

        {tab === 'calendar' && (
          <React.Fragment>
            {role === 'admin' && pendingDays.length > 0 && (
              <div className="sc-approve-banner">
                <div className="sc-approve-banner-h">
                  <span className="ic">◑</span>
                  <span><strong>{pendingDays.length} roster{pendingDays.length === 1 ? '' : 's'}</strong> awaiting your approval</span>
                </div>
                <div className="sc-approve-list">
                  {pendingDays.map(dd => {
                    const c = dd.clinic ? Sx.clinic(dd.clinic) : null;
                    return (
                      <button key={dd.id} className="sc-approve-item" onClick={() => openDay(dd)}>
                        <span className="d">{Sx.MONTHS[dd.date.getMonth()].slice(0, 3)} {dd.date.getDate()}</span>
                        <span className="c">{c ? c.name : 'Clinic'}</span>
                        <span className="m">{Sx.active(dd).length} pt{Sx.active(dd).length === 1 ? '' : 's'} · {Sx.money(Sx.dayTotal(dd))}</span>
                        <span className="go">Review →</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {role === 'admin' && (
              <div className="rv-stats" style={{ gridTemplateColumns: 'repeat(6,1fr)' }}>
                <div className="rv-stat"><div className="n">{stats.up}</div><div className="l">Upcoming days</div></div>
                <div className="rv-stat"><div className="n">{stats.pts}</div><div className="l">Patients booked</div></div>
                <div className={`rv-stat ${stats.pending > 0 ? 'urgent' : ''}`}><div className="n">{stats.pending}</div><div className="l">Awaiting approval</div></div>
                <div className={`rv-stat ${stats.open > 0 ? 'urgent' : ''}`}><div className="n">{stats.open}</div><div className="l">Open days to fill</div></div>
                <div className="rv-stat"><div className="n">{stats.sed}</div><div className="l">Sedation cases</div></div>
                <div className={`rv-stat ${stats.outstanding > 0 ? 'urgent' : ''}`}><div className="n">{'$' + Math.round(stats.outstanding).toLocaleString()}</div><div className="l">Outstanding</div></div>
              </div>
            )}

            {/* LEDGER toolbar */}
            <div className="sc-caltools">
                <div className="sc-monthnav">
                  <button className="sc-arrow" onClick={() => setCur(m === 0 ? [y - 1, 11] : [y, m - 1])}>‹</button>
                  <div className="mo">{Sx.MONTHS[m]} <span className="yr">{y}</span></div>
                  <button className="sc-arrow" onClick={() => setCur(m === 11 ? [y + 1, 0] : [y, m + 1])}>›</button>
                  <button className="sc-today-btn" onClick={() => { setCur([Sx.TODAY.getFullYear(), Sx.TODAY.getMonth()]); setAnchor(new Date(Sx.TODAY)); }}>Today</button>
                </div>
                <div className="sc-caltools-right">
                  {isHospital && <button className="btn btn-clay btn-sm" onClick={() => setModal({ type: 'reqdays' })}>Request clinic days</button>}
                  <div className="sc-legend">
                    <span className="lg"><span className="sw avail" />Open</span>
                    <span className="lg"><span className="sw booked" />Booked</span>
                    <span className="lg"><span className="sw submitted" />Awaiting approval</span>
                    <span className="lg"><span className="sw confirmed" />Confirmed</span>
                    <span className="lg"><span className="sw completed" />Completed</span>
                  </div>
                  <div className="sc-seg">
                    <button className={ledgerView === 'month' ? 'active' : ''} onClick={() => setLedgerView('month')}>Month</button>
                    <button className={ledgerView === 'week' ? 'active' : ''} onClick={() => setLedgerView('week')}>Week</button>
                  </div>
                </div>
              </div>

            {isHospital && days.length === 0 && (
              <div className="sc-empty" style={{ marginBottom: 18 }}>
                <div className="eh">No clinic days open yet</div>
                <p>When we open a day for you it appears on the calendar below — book it, then add the patients you'd like Dr. Canapp to see. Use <strong>Request clinic days</strong> above to tell us when suits.</p>
              </div>
            )}
            {ledgerView === 'month' && <MonthGrid days={visible} year={y} month={m} role={role} onOpen={openDay} onPublish={onPublish} />}
            {ledgerView === 'week' && <WeekStrip days={visible} anchor={anchor} role={role} onOpen={openDay} onPublish={onPublish} />}
          </React.Fragment>
        )}

        {tab === 'account' && isHospital && <window.HospitalAccountView profile={profile} clinic={myClinic} flash={flash} oops={oops} />}
        {tab === 'clinics' && !isHospital && <ClinicsView days={days} role={role} clinicId={clinicId} rev={clinicRev} onEdit={on.editClinic} flash={flash} entities={entities} accounts={accounts} on={on} />}
        {tab === 'billing' && role === 'admin' && <window.BillingView entities={entities} accounts={accounts} on={on} onOpenEntity={(e) => e.kind === 'inperson' && openDay(e.source || e)} onEditRates={() => setModal({ type: 'rates' })} />}
        {tab === 'imaging' && role === 'admin' && <ImagingView incoming={incoming} setIncoming={setIncoming} days={days} flash={flash} oops={oops} />}
      </main>

      {/* drawer */}
      {selected && <window.DayDrawer day={selected} entity={entities.find(e => e.id === selected.id)} entities={entities} role={role} onClose={() => setSelId(null)} on={on} />}

      {/* modals */}
      {modal && modal.type === 'publish' && <window.AssignClinicModal day={modal.day} role={role} mode="publish" onAssign={(day, cid, dates) => publishDay(day, cid, dates)} onClose={() => setModal(null)} />}
      {modal && modal.type === 'assign' && <window.AssignClinicModal day={modal.day} role={role} onAssign={(day, cid) => { saveDay(updateDay(day.id, d => ({ ...d, clinic: cid, status: 'booked', reservedFor: null }))); setModal(null); flash('Clinic assigned — roster can now be built.'); }} onClose={() => setModal(null)} />}
      {modal && modal.type === 'patient' && <window.PatientEditorModal day={modal.day} patient={modal.patient} role={role} onSave={savePatient} onClose={() => setModal(null)} />}
      {modal && modal.type === 'reqdays' && window.RequestDaysModal && <window.RequestDaysModal clinic={myClinic} profile={profile} onClose={() => setModal(null)} flash={flash} />}
      {modal && modal.type === 'rates' && window.RateCardEditor && <window.RateCardEditor onClose={() => setModal(null)} onSaved={() => { setClinicRev(v => v + 1); flash('Prices updated. Invoices already issued keep the price they were billed at.'); }} />}
      {modal && modal.type === 'payment' && (() => { const en = entities.find(x => x.id === modal.entityId); return en ? <window.PaymentModal entity={en} onSave={(e2, p) => { on.addPayment(e2, p); setModal(null); }} onClose={() => setModal(null)} /> : null; })()}
      {modal && modal.type === 'signoff' && <window.SignoffModal day={modal.day} role={role} onSave={on.saveSignoff} onRemove={on.removeSignoff} onClose={() => setModal(null)} />}
      {modal && modal.type === 'clinic' && <window.ClinicProfileModal clinic={modal.clinic} onSave={on.saveClinic} onClose={() => setModal(null)} />}
      {modal && modal.type === 'daysheet' && <window.DaySheetModal day={modal.day} onClose={() => setModal(null)} />}

      <Toast msg={toast} />
    </div>
  );
}

/* ---- clinics directory ------------------------------------- */
function ClinicsView({ days, role, clinicId, rev, onEdit, flash, entities, accounts, on }) {
  const Sx = window.SCHED;
  const [ledgerFor, setLedgerFor] = useState(null);
  const [invite, setInvite] = useState(false);
  const countFor = (cid) => days.filter(d => d.clinic === cid).length;
  const list = role === 'clinic' ? Sx.CLINICS.filter(c => c.id === clinicId) : Sx.CLINICS;
  const dayLabel = (bd) => (bd && bd.length) ? bd.map(i => Sx.WEEKDAYS[i]).join(' · ') : 'No days set';
  return (
    <React.Fragment>
      <div className="sc-caltools">
        <div className="sc-monthnav"><div className="mo" style={{ minWidth: 0 }}>Hospitals</div></div>
        {role === 'admin' && <div className="sc-caltools-right"><button className="btn btn-clay btn-sm" onClick={() => setInvite(true)}>+ Invite a hospital</button></div>}
      </div>
      <p className="rv-sub" style={{ marginBottom: 24 }}>Hospitals Dr. Canapp travels to. {role === 'admin' && 'Click any hospital to set its color, bookable weekdays, and case cap.'}</p>
      {list.length === 0 && <div className="sc-empty"><div className="eh">No hospitals yet</div><p>Approve a visit request or invite a hospital to get started.</p></div>}
      <div className="sc-clinics">
        {list.map(c => {
          const color = c.color || 'var(--ink-4)';
          const pending = c.status === 'pending';
          return (
            <div key={c.id} className={`sc-clinic-card ${role === 'admin' ? 'clickable' : ''} ${pending ? 'pending' : ''}`}
              style={{ '--ccolor': color }}
              onClick={role === 'admin' ? () => onEdit(c) : undefined}>
              <div className="cc-top">
                <span className="cc-sw" style={{ background: color }} />
                <div className="nm">{c.name}</div>
              </div>
              <div className="loc">{c.city}, {c.state}{c.miles ? ` · ${c.miles} mi` : ''}{c.region === 'ca' ? ' ✈' : ''}</div>
              <div className="contact">{c.contact}<br />{c.email}<br />{c.phone}</div>
              {!pending && (
                <div className="cc-rules">
                  <div className="cc-rule"><span className="k">Books</span>{dayLabel(c.bookingDays)}</div>
                  <div className="cc-rule"><span className="k">Max/day</span>{c.maxCasesPerDay} case{c.maxCasesPerDay === 1 ? '' : 's'}</div>
                </div>
              )}
              {!pending && role === 'admin' && (() => {
                const mine = window.SchedEntities.due(window.SchedEntities.forAccount(entities || [], c.id));
                const bal = mine.reduce((s, e) => s + window.SchedBill.balance(e), 0);
                const over = mine.filter(e => window.SchedBill.status(e) === 'overdue').length;
                return (
                  <div className="cc-bill" onClick={ev => { ev.stopPropagation(); setLedgerFor(ledgerFor === c.id ? null : c.id); }}>
                    <span className="k">Billing</span>
                    <span className={bal > 0 ? 'v due' : 'v'}>{bal > 0 ? Sx.money(bal) + ' outstanding' : 'nothing outstanding'}{over ? ' · ' + over + ' overdue' : ''}</span>
                    <span className="go">{ledgerFor === c.id ? 'Hide ledger' : 'View ledger →'}</span>
                  </div>
                );
              })()}
              <div className="foot">
                <span className={`sc-acct ${pending ? 'invited' : 'active'}`}>{pending ? 'Awaiting finalization' : 'Account active'}</span>
                {pending ? <span className="cc-finalize">Finalize →</span> : <span className="stat">{countFor(c.id)} day{countFor(c.id) === 1 ? '' : 's'} booked</span>}
              </div>
            </div>
          );
        })}
      </div>
      {invite && window.InviteHospitalModal && <window.InviteHospitalModal onClose={() => setInvite(false)} flash={flash} />}
      {ledgerFor && (() => {
        const acct = (accounts || []).find(x => x.id === ledgerFor) || window.SchedAccounts.fromClinic(Sx.clinic(ledgerFor));
        return (
          <div className="sb-drill">
            <div className="sb-drill-h">
              <div><div className="sc-sec-label">Account ledger · in-person and remote</div><h3>{acct.billTo || acct.name}</h3></div>
              <button className="btn btn-ghost btn-sm" onClick={() => setLedgerFor(null)}>Close</button>
            </div>
            <window.AccountLedger account={acct} entities={entities} on={on} />
          </div>
        );
      })()}
    </React.Fragment>
  );
}

function ImagingView({ incoming, setIncoming, days, flash, oops }) {
  const Sx = window.SCHED;
  const Cloud = window.SchedCloud;
  const [tab, setTab] = useState('inbox'); // inbox | setup
  const [pickFor, setPickFor] = useState(null); // study needing a manual case pick
  const [cases, setCases] = useState(null);
  const [pickCase, setPickCase] = useState('');
  const unrouted = incoming.filter(s => s.status === 'unrouted');
  const routed = incoming.filter(s => s.status !== 'unrouted');

  const markLocal = (st, dest) => setIncoming(list => list.map(s => s.id === st.id ? { ...s, route: dest, status: dest === 'schedule' ? 'routed-schedule' : 'routed-remote' } : s));

  const routeToPatient = (st) => {
    const day = days.find(x => x.id === st.matchDay);
    const patient = day && (day.patients || []).find(p => !p.cancelled && p.name.toLowerCase() === String(st.matchName || '').toLowerCase());
    if (!day || !patient) { flash('No matching scheduled patient — route it to remote-read or fix the match.'); return; }
    markLocal(st, 'schedule');
    Cloud.routeStudyToPatient(st, patient).then(() => flash(`Study attached to ${patient.name}'s clinic-day file.`)).catch(oops);
  };

  const routeToRemote = async (st) => {
    if (st.matchCase) {
      markLocal(st, 'remote');
      Cloud.routeStudyToCase(st, st.matchCase).then(() => flash(`Study filed on remote-read ${st.matchCase} — the referring vet can see it now.`)).catch(oops);
      return;
    }
    // manual pick
    setPickFor(st); setPickCase('');
    if (!cases) {
      try { setCases(await Cloud.loadOpenCases()); } catch (e) { oops(e); setCases([]); }
    }
  };

  const confirmPick = () => {
    if (!pickFor || !pickCase) return;
    const st = pickFor;
    setPickFor(null);
    markLocal(st, 'remote');
    Cloud.routeStudyToCase(st, pickCase).then(() => flash(`Study filed on remote-read ${pickCase} — the referring vet can see it now.`)).catch(oops);
  };

  const dayLabel = (id) => { const dd = days.find(x => x.id === id); if (!dd) return ''; const c = dd.clinic ? Sx.clinic(dd.clinic) : null; return `${Sx.MONTHS[dd.date.getMonth()].slice(0,3)} ${dd.date.getDate()} · ${c ? c.name : 'clinic day'}`; };

  return (
    <React.Fragment>
      <div className="rv-head" style={{ marginBottom: 18 }}>
        <div className="rv-eyebrow">Imaging · direct DICOM</div>
        <h2 className="rv-h">Studies from clinic machines.</h2>
        <p className="rv-sub">Clinic ultrasound &amp; radiology units send studies straight to us. Route each to an <strong>in-person patient file</strong> or a <strong>remote-read case</strong> — the referring vet sees remote-read studies on their case immediately.</p>
      </div>
      <div className="sc-caltools">
        <div className="sc-seg">
          <button className={tab === 'inbox' ? 'active' : ''} onClick={() => setTab('inbox')}>Incoming {unrouted.length > 0 && <span className="sc-tab-badge">{unrouted.length}</span>}</button>
          <button className={tab === 'setup' ? 'active' : ''} onClick={() => setTab('setup')}>Device setup</button>
        </div>
      </div>

      {tab === 'inbox' && (
        <React.Fragment>
          {incoming.length === 0 ? (
            <div className="sc-empty"><div className="eh">No studies received</div><p>Studies sent from clinic modalities land here automatically once the DICOM intake server is live (see <strong>DICOM-INTAKE-SETUP.md</strong>).</p></div>
          ) : (
            <div className="sc-study-list">
              {unrouted.map(st => {
                const c = st.from ? Sx.clinic(st.from) : null;
                const hasMatch = st.matchName;
                const picking = pickFor && pickFor.id === st.id;
                return (
                  <div key={st.id} className="sc-study">
                    <div className="sc-study-mod"><span className="m">{st.modality}</span><span className="im">{st.images} img</span></div>
                    <div className="sc-study-main">
                      <div className="nm">{st.matchName || st.patient} <span className="raw">· sent as “{st.patient}”</span></div>
                      <div className="desc">{st.desc}</div>
                      <div className="meta"><span className="sw" style={{ background: c ? c.color : 'var(--ink-4)' }} />{c ? c.name : 'Unknown clinic'} · {st.device} · {Sx.MONTHS[st.receivedAt.getMonth()].slice(0,3)} {st.receivedAt.getDate()}</div>
                    </div>
                    <div className="sc-study-route">
                      {hasMatch ? (
                        <div className="sc-match">
                          <div className="mlab">Auto-matched</div>
                          <div className="mval">{st.matchDay ? dayLabel(st.matchDay) : st.matchCase ? `Remote-read ${st.matchCase}` : ''}</div>
                        </div>
                      ) : <div className="sc-match nomatch"><div className="mlab">No match</div><div className="mval">Assign manually</div></div>}
                      {picking ? (
                        <div className="sc-study-btns" style={{ flexWrap: 'wrap', gap: 6 }}>
                          <select className="form-select" style={{ maxWidth: 240 }} value={pickCase} onChange={e => setPickCase(e.target.value)}>
                            <option value="">{cases === null ? 'Loading cases…' : 'Choose a remote-read case…'}</option>
                            {(cases || []).map(cs => <option key={cs.id} value={cs.id}>{cs.id} · {cs.patient} ({cs.status})</option>)}
                          </select>
                          <button className="btn btn-clay btn-sm" onClick={confirmPick} disabled={!pickCase}>File it</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setPickFor(null)}>Cancel</button>
                        </div>
                      ) : (
                        <div className="sc-study-btns">
                          <button className="btn btn-ghost btn-sm" onClick={() => routeToPatient(st)} disabled={!st.matchDay}>→ Patient file</button>
                          <button className="btn btn-clay btn-sm" onClick={() => routeToRemote(st)}>→ Remote-read</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {routed.length > 0 && <div className="sc-study-sep">Routed</div>}
              {routed.map(st => {
                const c = st.from ? Sx.clinic(st.from) : null;
                return (
                  <div key={st.id} className="sc-study routed">
                    <div className="sc-study-mod"><span className="m">{st.modality}</span><span className="im">{st.images} img</span></div>
                    <div className="sc-study-main">
                      <div className="nm">{st.matchName || st.patient}</div>
                      <div className="desc">{st.desc}</div>
                      <div className="meta"><span className="sw" style={{ background: c ? c.color : 'var(--ink-4)' }} />{c ? c.name : 'Unknown'} · {st.device}</div>
                    </div>
                    <div className="sc-study-route">
                      <span className={`sc-route-tag ${st.route}`}>{st.route === 'schedule' ? '✓ In patient file' : `✓ On remote-read ${st.matchCase || 'case'}`}</span>
                      {st.bucketPath && <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => Cloud.fileURL(st.bucketPath).then(u => window.open(u, '_blank')).catch(oops)}>Download</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </React.Fragment>
      )}

      {tab === 'setup' && (
        <React.Fragment>
          <div className="sc-dicom-note">
            <span className="ic">◑</span>
            <div>Point each clinic's ultrasound / radiology unit at the destination below. We accept studies over <strong>DICOM C-STORE</strong> (classic modality send) and <strong>DICOMweb STOW-RS</strong> (web send). Studies auto-match to a scheduled patient or a remote-read case by patient name; anything ambiguous waits in the inbox for you.</div>
          </div>
          <div className="sc-dicom-dest">
            <div className="dh">Send-to destination — give this to each clinic's imaging tech</div>
            <div className="sc-dicom-grid">
              <div className="fld"><div className="k">AE Title</div><div className="v mono">DDC_MSK_SCP</div></div>
              <div className="fld"><div className="k">Host</div><div className="v mono">intake.drdebracanapp.com</div></div>
              <div className="fld"><div className="k">Port (C-STORE)</div><div className="v mono">11112</div></div>
              <div className="fld"><div className="k">DICOMweb STOW-RS</div><div className="v mono">https://intake.drdebracanapp.com/dicom-web/studies</div></div>
              <div className="fld"><div className="k">TLS</div><div className="v">Required</div></div>
              <div className="fld"><div className="k">Per-clinic AE / token</div><div className="v">Issued on activation</div></div>
            </div>
          </div>
          <div className="sc-dicom-note" style={{ borderLeftColor: 'var(--ink-3)', background: 'var(--paper-deep)' }}>
            <span className="ic" style={{ color: 'var(--ink-3)' }}>‹›</span>
            <div><strong>Server status:</strong> the receiver (Orthanc) + router package is in <span className="mono">dicom-intake/</span> — deploy per <strong>DICOM-INTAKE-SETUP.md</strong>. Until it's live, use manual .dcm upload on each patient.</div>
          </div>
          <div className="dh" style={{ margin: '26px 0 12px', fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)', fontWeight: 600 }}>Registered clinic devices</div>
          <div className="sc-device-list">
            {Sx.CLINICS.filter(c => c.status !== 'pending').slice(0, 8).map(c => (
              <div key={c.id} className="sc-device">
                <span className="sw" style={{ background: c.color || 'var(--ink-4)' }} />
                <div className="dn">{c.name}</div>
                <div className="ae mono">AE: {c.id.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)}_MOD</div>
                <span className="sc-acct active">Linked</span>
              </div>
            ))}
            {Sx.CLINICS.filter(c => c.status !== 'pending').length === 0 && <p className="rv-sub">No active clinics yet.</p>}
          </div>
        </React.Fragment>
      )}
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<SchedGate />);
