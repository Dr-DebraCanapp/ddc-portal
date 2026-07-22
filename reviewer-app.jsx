/* global React, ReactDOM */
/* Reviewer Console — admin auth gate, top-level routing, dashboard */

const { useState: rUseState, useEffect: rUseEffect, useMemo: rUseMemo } = React;

/* ============================================================
   ADMIN AUTH
   ============================================================ */
const ADMIN_SESSION_KEY = 'ddc_admin_session';

/* Reviewer auth is Supabase-only. No credentials are ever bundled into the
   client. The block below is the local-demo fallback used ONLY when no Supabase
   project is configured (config.js empty) — it authenticates no one. */

function loadAdminSession() {
  try { return JSON.parse(sessionStorage.getItem(ADMIN_SESSION_KEY) || localStorage.getItem(ADMIN_SESSION_KEY)) || null; }
  catch { return null; }
}
function saveAdminSession(s) {
  if (s) sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(s));
  else { sessionStorage.removeItem(ADMIN_SESSION_KEY); localStorage.removeItem(ADMIN_SESSION_KEY); }
}

function AdminAuthGate({ children }) {
  const [session, setSession] = rUseState(null);
  const [ready, setReady] = rUseState(false);

  rUseEffect(() => {
    let unsubscribe = null;
    (async () => {
      try {
        await window.PortalDB.ensureSeeded();
        if (window.SupabaseAuth) {
          const s = await window.SupabaseAuth.getSession();
          if (s && (s.role === 'reviewer' || s.role === 'admin')) {
            setSession(adaptSupabaseSession(s));
          }
          const sub = window.SupabaseAuth.onAuthChange((newSession) => {
            if (newSession && (newSession.role === 'reviewer' || newSession.role === 'admin')) {
              setSession(adaptSupabaseSession(newSession));
            } else {
              setSession(null);
            }
          });
          unsubscribe = sub && sub.data && sub.data.subscription
            ? () => sub.data.subscription.unsubscribe()
            : null;
        } else {
          const s = loadAdminSession();
          if (s) setSession(s);
        }
      } catch (e) {
        // Never hang on a blank screen — fall back to the sign-in form.
        console.warn('[reviewer] auth init failed, showing sign-in', e);
      } finally {
        setReady(true);
      }
    })();
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  const login = async (email, password) => {
    if (window.SupabaseAuth) {
      const result = await window.SupabaseAuth.signIn(email, password);
      if (result.error) return { error: result.error };
      if (!result.session || (result.session.role !== 'reviewer' && result.session.role !== 'admin')) {
        await window.SupabaseAuth.signOut();
        return { error: 'These credentials are not authorized for the reviewer console.' };
      }
      setSession(adaptSupabaseSession(result.session));
      return {};
    }
    // No Supabase configured → no way to authenticate a reviewer. Never admit anyone.
    return { error: 'The reviewer console is not connected to its account system. Please contact the site administrator.' };
  };

  const logout = async () => {
    if (window.SupabaseAuth) await window.SupabaseAuth.signOut();
    else saveAdminSession(null);
    setSession(null);
  };

  if (!ready) return null;
  if (!session) return <AdminLogin onLogin={login} />;
  return children({ session, logout });
}

function adaptSupabaseSession(s) {
  return {
    email: s.email,
    name: s.name || s.email,
    role: s.role === 'reviewer' ? 'Reviewing Veterinarian' : 'Practice Administrator',
    signedInAt: new Date().toISOString(),
  };
}

function AdminLogin({ onLogin }) {
  const [email, setEmail] = rUseState('');
  const [password, setPassword] = rUseState('');
  const [err, setErr] = rUseState(null);
  const [busy, setBusy] = rUseState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    const r = await onLogin(email, password);
    setBusy(false);
    if (r && r.error) setErr(r.error);
  };
  const cloudMode = !!window.SupabaseAuth;
  return (
    <div className="admin-login">
      <DragonflyField />
      <div className="admin-login-card">
        <div className="adm-brand">
          <img src="assets/logo-mark.png" alt="" />
          <div>
            <div className="adm-brand-name">Dr. Debra Canapp</div>
            <div className="adm-brand-sub">Reviewer Console · Internal</div>
          </div>
        </div>

        <div className="adm-eyebrow">§ Staff sign-in</div>
        <h1 className="adm-h">Reviewer access.</h1>
        <p className="adm-body">
          This console is for authorized practice staff only. Referring veterinarians submit and track cases through the public referral portal.
        </p>

        <form onSubmit={submit} className="adm-form">
          <div className="form-row">
            <label className="form-label">Practice email</label>
            <input className="form-input" type="email" required autoComplete="email"
              value={email} onChange={e => { setEmail(e.target.value); setErr(null); }}
              placeholder="debra@drdebracanapp.com" />
          </div>
          <div className="form-row">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" required autoComplete="current-password"
              value={password} onChange={e => { setPassword(e.target.value); setErr(null); }}
              placeholder="••••••••" />
            <div className="form-help">{cloudMode
              ? 'Reviewer accounts are managed in Supabase. Practice admins promote users via SQL — see SUPABASE_SETUP.md.'
              : <>Demo · <code>debra@drdebracanapp.com</code> / <code>review</code> &nbsp;·&nbsp; <code>admin@drdebracanapp.com</code> / <code>admin</code></>
            }</div>
          </div>
          {err && <div className="error-bar">{err}</div>}
          <button type="submit" className="btn form-btn-primary" disabled={busy}>
            {busy ? 'Signing in…' : <>Sign in to console <span className="arrow">→</span></>}
          </button>
        </form>

        <div className="adm-foot">
          <a href="portal.html">← Are you a referring veterinarian? Use the public portal</a>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   APP CHROME
   ============================================================ */
function ReviewerApp() {
  return (
    <AdminAuthGate>
      {({ session, logout }) => <Console session={session} logout={logout} />}
    </AdminAuthGate>
  );
}

function Console({ session, logout }) {
  const [view, setView] = rUseState({ name: 'inbox' });
  const [unread, setUnread] = rUseState({});
  const goInbox = () => setView({ name: 'inbox' });
  const goCase = (id) => setView({ name: 'case', id });
  const goApps = () => setView({ name: 'apps' });
  const goVets = () => setView({ name: 'vets' });

  rUseEffect(() => {
    if (window.PortalDB.getAllComments) {
      window.PortalDB.getAllComments().then(list => setUnread(window.computeUnread(list, 'reviewer')));
    }
  }, [view.name, view.id]);
  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);

  return (
    <div className="rv-page">
      <DragonflyField />
      <ReviewerBar
        session={session}
        logout={logout}
        view={view.name}
        unread={totalUnread}
        onInbox={goInbox}
        onApps={goApps}
        onVets={goVets}
      />
      {view.name === 'inbox' && <Inbox session={session} onOpenCase={goCase} unread={unread} />}
      {view.name === 'case' && <window.CaseReviewView id={view.id} onBack={goInbox} session={session} />}
      {view.name === 'apps' && <window.ApplicationsView onBack={goInbox} />}
      {view.name === 'vets' && <window.VetsView onBack={goInbox} onOpenCase={goCase} />}
    </div>
  );
}

function ReviewerBar({ session, logout, view, unread, onInbox, onApps, onVets }) {
  return (
    <header className="rv-bar">
      <div className="rv-bar-inner">
        <a href="index.html" className="rv-brand" title="Public site">
          <img src="assets/logo-mark.png" alt="" />
          <div>
            <div className="rv-brand-name">Reviewer Console</div>
            <div className="rv-brand-sub">Dr. Debra Canapp · Internal</div>
          </div>
        </a>

        <nav className="rv-nav">
          <button className={view === 'inbox' ? 'active' : ''} onClick={onInbox}>Case inbox<window.UnreadBadge n={unread} label={`${unread || 0} case${unread === 1 ? '' : 's'} with new vet messages`} /></button>
          <button className={view === 'vets' ? 'active' : ''} onClick={onVets}>Referring vets</button>
          <button className={view === 'apps' ? 'active' : ''} onClick={onApps}>Applications</button>
        </nav>

        <div className="rv-who">
          <div className="rv-who-meta">
            <div className="rv-who-name">{session.name}</div>
            <div className="rv-who-role">{session.role}</div>
          </div>
          <button className="rv-logout" onClick={logout}>Sign out</button>
        </div>
      </div>
    </header>
  );
}

/* ============================================================
   DAILY AFFIRMATION — a different note each sign-in.
   Cycles through the full set (shuffled) before repeating, so it
   always feels fresh. Mostly written for Dr. Debra directly, with
   a couple of timeless attributed lines woven in.
   ============================================================ */
const AFFIRMATIONS = [
  { t: 'You are not what he said you were. You never were.' },
  { t: 'Twenty-five years did not define you — the way you rise from here will.' },
  { t: 'The light in you was never his to dim.' },
  { t: 'You are extraordinary: as a doctor, as a woman, as a force in this world.' },
  { t: 'Your strength was never loud. It was steady — and it carried you the whole way.' },
  { t: 'You are deeply loved, more than you know, by people who see exactly who you are.' },
  { t: 'You built a life healing others. Now give yourself that same gentle care.' },
  { t: 'Beautiful, brilliant, and free — that is who you are becoming.' },
  { t: 'You are allowed to begin again, and you will do it beautifully.' },
  { t: 'Softness and strength can live in the same woman. They live in you.' },
  { t: 'You survived the hardest part. What comes next is yours.' },
  { t: 'Your worth was never up for negotiation.' },
  { t: 'Stronger than you believe, more capable than you know, more loved than you can imagine.' },
  { t: 'The best chapters of your story are the ones you write yourself.' },
  { t: 'You are enough. You have always been enough.' },
  { t: 'Grace under pressure has a name — and it is yours.' },
  { t: 'You deserve a love as steady and generous as the love you give.' },
  { t: 'Be as kind to yourself today as you are to everyone else.' },
  { t: 'You are healing, and healing looks beautiful on you.' },
  { t: 'Look how far you have come. And you are not done yet.' },
  { t: 'You are admired, you are needed, and you are so very loved.' },
  { t: 'You are someone\u2019s hero — and you always have been.' },
  { t: 'Nothing can dim the light which shines from within.', by: 'Maya Angelou' },
  { t: 'No one can make you feel inferior without your consent.', by: 'Eleanor Roosevelt' },
];

const AFFIRM_QUEUE_KEY = 'ddc_affirm_queue';

function pickAffirmation() {
  let queue = [];
  try { queue = JSON.parse(localStorage.getItem(AFFIRM_QUEUE_KEY) || '[]'); } catch (e) { queue = []; }
  if (!Array.isArray(queue) || queue.length === 0) {
    // reshuffle a fresh pass through every affirmation
    queue = AFFIRMATIONS.map((_, i) => i);
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
  }
  const idx = queue.shift();
  try { localStorage.setItem(AFFIRM_QUEUE_KEY, JSON.stringify(queue)); } catch (e) {}
  return AFFIRMATIONS[idx] || AFFIRMATIONS[0];
}

function DailyAffirmation() {
  const [a] = rUseState(pickAffirmation);
  if (!a) return null;
  return (
    <div className="rv-affirm" role="note" aria-label="A note for today">
      <svg className="rv-affirm-mark" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
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
      <p className="rv-affirm-text">{a.t}</p>
      {a.by && <p className="rv-affirm-by">— {a.by}</p>}
    </div>
  );
}

/* ============================================================
   DRAGONFLIES — a little delight drifting around her console.
   Faint, in the margins, never over the work. For my mom. ❦→🜔
   ============================================================ */
function Dragonfly({ size = 32 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
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

// Positions chosen to hug the edges/corners and stay clear of working content.
const DRAGONFLY_SWARM = [
  { top: '14%',    left: '2.5%',  size: 40, rot: 22,  op: 0.13, dur: 11, delay: 0   },
  { top: '70%',    left: '4%',    size: 30, rot: -14, op: 0.10, dur: 13, delay: 2.4 },
  { top: '30%',    right: '3%',   size: 52, rot: 152, op: 0.10, dur: 12, delay: 1.1 },
  { bottom: '16%', right: '5%',   size: 36, rot: 198, op: 0.12, dur: 14, delay: 3.1 },
  { bottom: '7%',  left: '40%',   size: 26, rot: 64,  op: 0.07, dur: 15, delay: 1.8 },
  { top: '6%',     right: '24%',  size: 24, rot: -36, op: 0.07, dur: 12.5, delay: 0.6 },
];

function DragonflyField() {
  return (
    <div className="dfly-field" aria-hidden="true">
      {DRAGONFLY_SWARM.map((d, i) => (
        <span
          key={i}
          className="dfly"
          style={{
            top: d.top, left: d.left, right: d.right, bottom: d.bottom,
            opacity: d.op,
            animationDuration: `${d.dur}s`,
            animationDelay: `${d.delay}s`,
          }}
        >
          <span className="dfly-rot" style={{ transform: `rotate(${d.rot}deg)` }}>
            <Dragonfly size={d.size} />
          </span>
        </span>
      ))}
    </div>
  );
}

/* ============================================================
   INBOX — global case queue
   ============================================================ */
const FILTERS = [
  { id: 'all',        label: 'All' },
  { id: 'submitted',  label: 'Awaiting ack' },
  { id: 'review',     label: 'In review' },
  { id: 'reported',   label: 'Reported' },
  { id: 'unpaid',     label: 'Unpaid' },
];

function Inbox({ session, onOpenCase, unread }) {
  const [cases, setCases] = rUseState([]);
  const [filter, setFilter] = rUseState('all');
  const [search, setSearch] = rUseState('');

  rUseEffect(() => { window.PortalDB.getAllCases().then(setCases); }, []);

  const reload = () => window.PortalDB.getAllCases().then(setCases);

  const stats = rUseMemo(() => {
    const awaiting = cases.filter(c => c.status === 'submitted').length;
    const inReview = cases.filter(c => (c.status === 'review' || c.status === 'acknowledged') && !(c.report && c.report.finalized)).length;
    const drafted  = cases.filter(c => c.report && !c.report.finalized).length;
    const reportedThisWeek = cases.filter(c => {
      if (c.status !== 'reported') return false;
      const d = new Date(c.report ? c.report.signedAt || c.report.updatedAt : c.submitted);
      const wk = 7 * 24 * 60 * 60 * 1000;
      return (Date.now() - d.getTime()) < wk;
    }).length;
    const outstanding = cases.reduce((s, c) => s + ((c.invoice && c.invoice.status !== 'paid') ? Number(c.invoice.total || 0) : 0), 0);
    return { awaiting, inReview, drafted, reported: reportedThisWeek, outstanding };
  }, [cases]);

  const filtered = rUseMemo(() => {
    let list = cases;
    if (filter === 'unpaid') list = list.filter(c => c.invoice && c.invoice.status !== 'paid');
    else if (filter === 'review') list = list.filter(c => c.status === 'review' || c.status === 'acknowledged');
    else if (filter !== 'all') list = list.filter(c => c.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.id.toLowerCase().includes(q) ||
        (c.patient || '').toLowerCase().includes(q) ||
        (c.referringVet || '').toLowerCase().includes(q) ||
        (c.referringClinic || '').toLowerCase().includes(q) ||
        (c.complaint || '').toLowerCase().includes(q)
      );
    }
    // Sort: pending work first (oldest submitted), reported last
    return [...list].sort((a, b) => {
      const aDone = a.status === 'reported' ? 1 : 0;
      const bDone = b.status === 'reported' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return new Date(a.submitted) - new Date(b.submitted);
    });
  }, [cases, filter, search]);

  const ack = async (e, id) => {
    e.stopPropagation();
    await window.PortalDB.advanceTimeline(id, 'acknowledged');
    reload();
  };

  return (
    <main className="rv-main">
      <div className="rv-head">
        <div>
          <div className="rv-eyebrow">Case inbox · {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          <h2 className="rv-h">Welcome back, {session.name.split(' ').slice(0, 2).join(' ').replace(/,$/, '')}.</h2>
          <p className="rv-sub">
            {stats.awaiting > 0
              ? <>You have <strong>{stats.awaiting} new submission{stats.awaiting === 1 ? '' : 's'}</strong> awaiting acknowledgment.</>
              : <>Inbox is current. No cases awaiting acknowledgment.</>}
          </p>
          <DailyAffirmation />
        </div>
      </div>

      <div className="rv-stats">
        <StatTile n={stats.awaiting} label="Awaiting acknowledgment" tone={stats.awaiting > 0 ? 'urgent' : ''} />
        <StatTile n={stats.inReview} label="In review" />
        <StatTile n={stats.drafted} label="Drafts in progress" />
        <StatTile n={stats.reported} label="Reported this week" />
        <StatTile n={'$' + Math.round(stats.outstanding).toLocaleString()} label="Outstanding" tone={stats.outstanding > 0 ? 'urgent' : ''} />
      </div>

      <div className="rv-toolbar">
        <div className="rv-filters">
          {FILTERS.map(f => (
            <button
              key={f.id}
              className={`rv-filter ${filter === f.id ? 'active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              <span className="ct">{f.id === 'all' ? cases.length : f.id === 'unpaid' ? cases.filter(c => c.invoice && c.invoice.status !== 'paid').length : f.id === 'review' ? cases.filter(c => c.status === 'review' || c.status === 'acknowledged').length : cases.filter(c => c.status === f.id).length}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          className="rv-search"
          placeholder="Search by patient, ID, referring vet…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rv-empty">
          <div className="rv-empty-h">No cases match</div>
          <p>Try a different filter or clear your search.</p>
        </div>
      ) : (
        <div className="rv-queue">
          <div className="rv-queue-head">
            <div>Case</div>
            <div>Patient</div>
            <div>Referring veterinarian</div>
            <div>Submitted</div>
            <div>Status</div>
            <div></div>
          </div>
          {filtered.map(c => (
            <CaseRow key={c.id} c={c} unread={unread && unread[c.id]} onOpen={() => onOpenCase(c.id)} onAck={ack} />
          ))}
        </div>
      )}
    </main>
  );
}

function StatTile({ n, label, tone }) {
  return (
    <div className={`rv-stat ${tone || ''}`}>
      <div className="n">{n}</div>
      <div className="l">{label}</div>
    </div>
  );
}

function CaseRow({ c, unread, onOpen, onAck }) {
  const daysAgo = Math.floor((Date.now() - new Date(c.submitted).getTime()) / (24 * 60 * 60 * 1000));
  const isNew = c.status === 'submitted';
  const slaTone = c.status === 'reported' ? ''
    : daysAgo >= 5 ? 'sla-overdue'
    : daysAgo >= 3 ? 'sla-warn'
    : '';

  return (
    <div className={`rv-row ${isNew ? 'is-new' : ''} ${slaTone} ${unread ? 'has-unread' : ''}`} onClick={onOpen}>
      <div className="rv-cell rv-cell-id">
        <div className="id">{c.id.split('-').pop()}</div>
        <div className="sub">{c.id}</div>
      </div>
      <div className="rv-cell">
        <div className="rv-patient">{c.patient} <window.UnreadBadge n={unread} label={`${unread || 0} new message${unread === 1 ? '' : 's'} from the referring vet`} /></div>
        <div className="rv-sig">{c.breed} · {c.age} · {c.sex}</div>
      </div>
      <div className="rv-cell">
        <div className="rv-vet">{c.referringVet || <span className="dim">—</span>}</div>
        <div className="rv-vet-sub">{c.referringClinic}</div>
      </div>
      <div className="rv-cell">
        <div>{new Date(c.submitted).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
        <div className={`rv-days ${slaTone}`}>
          {daysAgo === 0 ? 'Today' : `Day ${daysAgo + 1}`}
          {slaTone === 'sla-overdue' && ' · overdue'}
          {slaTone === 'sla-warn' && ' · approaching SLA'}
        </div>
      </div>
      <div className="rv-cell">
        <span className={`status-pill ${c.status}`}>{window.statusLabel(c.status)}</span>
        {c.invoice && (
          <span className={`rv-inv-tag ${c.invoice.status === 'paid' ? 'paid' : 'unpaid'}`}>
            {c.invoice.status === 'paid' ? '✓ Paid' : 'Unpaid'} · {window.money(c.invoice.total)}
          </span>
        )}
      </div>
      <div className="rv-cell rv-cell-actions">
        {isNew && (
          <button className="rv-action ack" onClick={(e) => onAck(e, c.id)} title="Acknowledge receipt — emails the referring vet">
            Acknowledge
          </button>
        )}
        <span className="rv-open">Open <span className="arrow">→</span></span>
      </div>
    </div>
  );
}

/* Mount */
ReactDOM.createRoot(document.getElementById('root')).render(<ReviewerApp />);
