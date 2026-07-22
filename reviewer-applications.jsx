/* global React */
/* Reviewer Applications — pending portal access requests, approve/decline */

const { useState: raUseState, useEffect: raUseEffect } = React;

function ApplicationsView({ onBack }) {
  const [apps, setApps] = raUseState([]);
  const [filter, setFilter] = raUseState('pending');
  const [approveModal, setApproveModal] = raUseState(null);

  const reload = async () => {
    if (window.PortalDB.refreshApplications) {
      await window.PortalDB.refreshApplications();
    }
    setApps(window.PortalDB.getApplications());
  };
  raUseEffect(() => { reload(); }, []);

  const filtered = apps.filter(a => filter === 'all' ? true : a.status === filter);

  const counts = {
    pending:  apps.filter(a => a.status === 'pending').length,
    approved: apps.filter(a => a.status === 'approved').length,
    declined: apps.filter(a => a.status === 'declined').length,
  };

  const decline = async (app) => {
    if (!confirm(`Decline application from ${app.name}?`)) return;
    await window.PortalDB.updateApplication(app.id, { status: 'declined', declinedAt: new Date().toISOString() });
    reload();
  };

  const startApprove = (app) => setApproveModal(app);
  const confirmApprove = async (app, password) => {
    const account = window.PortalDB.addAccount({
      email: app.email,
      password,
      name: app.name,
      clinic: app.clinic,
    });
    await window.PortalDB.updateApplication(app.id, {
      status: 'approved',
      approvedAt: new Date().toISOString(),
      generatedPassword: password,
    });
    reload();
    return account;
  };

  return (
    <main className="rv-main rv-apps-main">
      <div className="rv-head">
        <div>
          <button onClick={onBack} className="rv-back" style={{ marginBottom: 12 }}>← Inbox</button>
          <div className="rv-eyebrow">Applications</div>
          <h2 className="rv-h">Referring veterinarian access requests.</h2>
          <p className="rv-sub">
            {counts.pending > 0
              ? <><strong>{counts.pending}</strong> pending — each one is a request from a licensed vet asking to submit cases.</>
              : <>No applications pending. Approved vets can sign in at the public portal.</>}
          </p>
        </div>
      </div>

      <div className="rv-toolbar">
        <div className="rv-filters">
          <button className={`rv-filter ${filter === 'pending'  ? 'active' : ''}`} onClick={() => setFilter('pending')}>Pending<span className="ct">{counts.pending}</span></button>
          <button className={`rv-filter ${filter === 'approved' ? 'active' : ''}`} onClick={() => setFilter('approved')}>Approved<span className="ct">{counts.approved}</span></button>
          <button className={`rv-filter ${filter === 'declined' ? 'active' : ''}`} onClick={() => setFilter('declined')}>Declined<span className="ct">{counts.declined}</span></button>
          <button className={`rv-filter ${filter === 'all'      ? 'active' : ''}`} onClick={() => setFilter('all')}>All<span className="ct">{apps.length}</span></button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rv-empty">
          <div className="rv-empty-h">No applications</div>
          <p>{filter === 'pending' ? 'You\'re all caught up.' : 'Nothing in this category yet.'}</p>
        </div>
      ) : (
        <div className="rv-app-list">
          {filtered.map(app => (
            <AppRow key={app.id} app={app} onApprove={() => startApprove(app)} onDecline={() => decline(app)} />
          ))}
        </div>
      )}

      {approveModal && (
        <ApproveModal
          app={approveModal}
          onClose={() => setApproveModal(null)}
          onConfirm={confirmApprove}
        />
      )}
    </main>
  );
}

function AppRow({ app, onApprove, onDecline }) {
  return (
    <article className={`rv-app-card status-${app.status}`}>
      <div className="rv-app-main">
        <div className="rv-app-head">
          <div>
            <div className="rv-app-name">{app.name}</div>
            <div className="rv-app-clinic">{app.clinic}</div>
          </div>
          <div className="rv-app-status">
            <span className={`status-pill ${app.status}`}>
              {app.status === 'pending' ? 'Pending review' : app.status === 'approved' ? 'Approved' : 'Declined'}
            </span>
          </div>
        </div>

        <div className="rv-app-meta">
          <Meta label="License">{app.license || '—'}</Meta>
          <Meta label="Country">{app.country}{app.state ? ` · ${app.state}` : ''}</Meta>
          <Meta label="Specialty">{app.specialty || '—'}</Meta>
          <Meta label="Submitted">{new Date(app.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</Meta>
        </div>

        <div className="rv-app-contact">
          <a href={`mailto:${app.email}`}>{app.email}</a>
          {app.phone && <span> · {app.phone}</span>}
        </div>

        {app.why && (
          <div className="rv-app-why">
            <div className="rv-section-eyebrow">Why are you requesting access?</div>
            <p>{app.why}</p>
          </div>
        )}

        {app.status === 'approved' && app.generatedPassword && (
          <div className="rv-app-approved">
            <strong>Access granted.</strong>{' '}
            {window.PORTAL_BACKEND === 'supabase'
              ? <>Application is approved. To grant portal access, create this user in <em>Supabase Dashboard → Authentication → Users → Add user</em> with the credentials below — the trigger will auto-create the profile row with role <code>vet</code>.</>
              : <>Login credentials were generated for {app.email}. Share them with the vet via secure channel.</>
            }
            <div className="rv-app-creds">
              <code>{app.email}</code>
              <code>{app.generatedPassword}</code>
            </div>
          </div>
        )}
      </div>

      {app.status === 'pending' && (
        <div className="rv-app-actions">
          <button className="btn btn-ghost btn-sm" onClick={onDecline}>Decline</button>
          <button className="btn btn-clay btn-sm" onClick={onApprove}>Approve & create account <span className="arrow">→</span></button>
        </div>
      )}
    </article>
  );
}

function Meta({ label, children }) {
  return (
    <div className="rv-meta-cell">
      <div className="rv-meta-label">{label}</div>
      <div className="rv-meta-val">{children}</div>
    </div>
  );
}

/* ============================================================
   APPROVE MODAL
   ============================================================ */
function ApproveModal({ app, onClose, onConfirm }) {
  const [password, setPassword] = raUseState(() => generatePassword());
  const [done, setDone] = raUseState(false);

  const confirm = () => {
    onConfirm(app, password);
    setDone(true);
  };

  if (done) {
    const cloud = window.PORTAL_BACKEND === 'supabase';
    return (
      <div className="rv-modal-shell" onClick={onClose}>
        <div className="rv-modal" onClick={e => e.stopPropagation()}>
          <div className="rv-modal-eyebrow">§ Access granted</div>
          <h3 className="rv-modal-h">{app.name} approved.</h3>
          <p className="rv-modal-body">
            {cloud
              ? <>The application is marked approved. To finish granting portal access, open <strong>Supabase Dashboard → Authentication → Users → Add user</strong> and create an account using the credentials below. The profile trigger will auto-create the vet profile with role <code>vet</code>.</>
              : <>Share these credentials by secure channel (email, encrypted message, or phone). The vet should change the password after their first sign-in.</>
            }
          </p>
          <div className="rv-modal-creds">
            <div className="rv-cred-row"><span>Email</span><code>{app.email}</code></div>
            <div className="rv-cred-row"><span>Password</span><code>{password}</code></div>
          </div>
          <div className="rv-modal-actions">
            <button className="btn" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rv-modal-shell" onClick={onClose}>
      <div className="rv-modal" onClick={e => e.stopPropagation()}>
        <div className="rv-modal-eyebrow">§ Approve application</div>
        <h3 className="rv-modal-h">Grant {app.name} portal access?</h3>
        <p className="rv-modal-body">
          {window.PORTAL_BACKEND === 'supabase'
            ? <>This marks the application as approved and generates a temporary password. You'll then create the actual user in <strong>Supabase Dashboard</strong> with these credentials (a one-minute step).</>
            : <>This creates a portal account for <strong>{app.email}</strong> and generates a temporary password. The vet will be able to sign in immediately at <code>portal.drdebracanapp.com</code>.</>
          }
        </p>
        <div className="rv-modal-field">
          <label className="form-label">Temporary password</label>
          <div className="rv-modal-pwrow">
            <input
              type="text"
              className="form-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPassword(generatePassword())}>
              Regenerate
            </button>
          </div>
          <div className="form-help">Default-generated; replace with your own if you prefer.</div>
        </div>
        <div className="rv-modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-clay" onClick={confirm} disabled={!password}>Approve and create account <span className="arrow">→</span></button>
        </div>
      </div>
    </div>
  );
}

function generatePassword() {
  const words = ['scapular','iliopsoas','biceps','supraspinatus','infraspinatus','meniscal','gastrocnemius','cranial','caudal','medial','lateral'];
  const w = words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(100 + Math.random() * 900);
  return `${w}-${n}`;
}

window.ApplicationsView = ApplicationsView;
