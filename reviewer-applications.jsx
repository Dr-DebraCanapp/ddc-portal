/* global React */
/* Reviewer Applications — pending portal access requests, approve/decline */

const { useState: raUseState, useEffect: raUseEffect } = React;

function ApplicationsView({ onBack }) {
  const [apps, setApps] = raUseState([]);
  const [filter, setFilter] = raUseState('pending');
  const [approveModal, setApproveModal] = raUseState(null);
  const [inviteModal, setInviteModal] = raUseState(null);
  const [tick, setTick] = raUseState(0);
  const [note, setNote] = raUseState(null);
  const flash = (m) => { setNote(m); setTimeout(() => setNote(null), 4000); };

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
    // In cloud mode create the real sign-in here — same route the in-person
    // side uses, so nobody has to open the Supabase dashboard.
    const Cloud = window.SchedCloud;
    if (Cloud && Cloud.configured && Cloud.createVetAccount) {
      await Cloud.createVetAccount({ email: app.email, password, name: app.name, clinic: app.clinic });
    } else {
      window.PortalDB.addAccount({ email: app.email, password, name: app.name, clinic: app.clinic });
    }
    await window.PortalDB.updateApplication(app.id, {
      status: 'approved',
      approvedAt: new Date().toISOString(),
      generatedPassword: password,
    });
    reload();
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
        <div className="rv-head-actions">
          <button className="btn btn-clay btn-sm" onClick={() => setInviteModal({})}>Invite a veterinarian <span className="arrow">→</span></button>
        </div>
      </div>
      {note && <div className="rv-flash">{note}</div>}

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
            <AppRow key={app.id} app={app} onApprove={() => startApprove(app)} onDecline={() => decline(app)} onSetup={() => startApprove(app)} />
          ))}
        </div>
      )}

      {window.InvitationsList && (
        <window.InvitationsList
          key={tick}
          apps={apps}
          flash={flash}
          onResend={(inv) => setInviteModal(inv)}
          onChanged={() => setTick(t => t + 1)}
        />
      )}

      {inviteModal && window.InviteVetModal && (
        <window.InviteVetModal
          invite={inviteModal.id ? inviteModal : null}
          flash={flash}
          onSent={() => setTick(t => t + 1)}
          onClose={() => setInviteModal(null)}
        />
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

function AppRow({ app, onApprove, onDecline, onSetup }) {
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
            <strong>Account created.</strong> {app.name} can sign in at the portal with the credentials
            below. Send them on by secure channel if you haven't already.
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
      {app.status === 'approved' && onSetup && (
        <div className="rv-app-actions">
          <button className="btn btn-ghost btn-sm" onClick={onSetup}>Create sign-in / resend welcome</button>
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
  const [busy, setBusy] = raUseState(false);
  const [err, setErr] = raUseState('');
  const [emailed, setEmailed] = raUseState(false);

  const portalUrl = (((window.PORTAL_CONFIG || {}).payments || {}).portalUrl || 'https://portal.drdebracanapp.com').replace(/\/$/, '');
  const welcome = [
    `Dear ${app.name || 'Doctor'},`,
    '',
    'Your access to the Dr. Debra Canapp referral portal has been approved. You can sign in now:',
    '',
    `Web address:        ${portalUrl}`,
    `Email:              ${app.email}`,
    `Temporary password: ${password}`,
    '',
    'Please change the password after your first sign-in.',
    '',
    'WHAT TO DO NEXT',
    'Sign in and choose New referral. Upload the DICOM ultrasound clips, any radiographs or reports, and the patient history. You can follow each case from submission through to the delivered report, and your practice statements and payment history live in the portal too.',
    '',
    'A written report is typically returned in 5-7 business days, or within 24 hours on a STAT request. The current fee schedule is in the portal under Fee schedule.',
    '',
    'Any questions, just reply to this message.',
    '',
    'With thanks,',
    'Ally Canapp - Li',
    '',
    'info@DrDebraCanapp.com',
  ].join('\n');

  const emailWelcome = () => {
    const subject = 'Your Dr. Debra Canapp referral portal sign-in';
    window.location.href = `mailto:${encodeURIComponent(app.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(welcome)}`;
    setEmailed(true);
  };

  const confirm = async () => {
    setBusy(true); setErr('');
    try {
      await onConfirm(app, password);
      setDone(true);
    } catch (e) {
      const m = String((e && e.message) || e);
      setErr(/registered|already/i.test(m)
        ? 'That email already has an account. They can sign in with their existing password, or reset it.'
        : m);
    }
    setBusy(false);
  };

  if (done) {
    return (
      <div className="rv-modal-shell" onClick={onClose}>
        <div className="rv-modal" onClick={e => e.stopPropagation()}>
          <div className="rv-modal-eyebrow">§ Access granted</div>
          <h3 className="rv-modal-h">{app.name} can sign in.</h3>
          <p className="rv-modal-body">
            The account is created and the application is marked approved. Send them the sign-in
            below — the email is already written, including what to do first.
          </p>
          <div className="rv-modal-creds">
            <div className="rv-cred-row"><span>Sign-in page</span><code>{portalUrl}</code></div>
            <div className="rv-cred-row"><span>Email</span><code>{app.email}</code></div>
            <div className="rv-cred-row"><span>Password</span><code>{password}</code></div>
          </div>
          <details className="sd-preview rv-inv-preview"><summary>What the welcome email says</summary><pre>{welcome}</pre></details>
          <div className="rv-modal-actions">
            <button className="btn btn-ghost" onClick={onClose}>Done</button>
            <button className="btn btn-clay" onClick={emailWelcome}>{emailed ? 'Open email again' : 'Email their sign-in →'}</button>
          </div>
          {emailed && <p className="rv-inv-foot">Draft opened. The temporary password is in the message — send it and they can sign in straight away.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="rv-modal-shell" onClick={onClose}>
      <div className="rv-modal" onClick={e => e.stopPropagation()}>
        <div className="rv-modal-eyebrow">§ Approve application</div>
        <h3 className="rv-modal-h">{app.status === 'approved' ? `Create ${app.name}'s sign-in?` : `Grant ${app.name} portal access?`}</h3>
        <p className="rv-modal-body">
          This creates the portal sign-in for <strong>{app.email}</strong> with the temporary password
          below, and marks the application approved. They can sign in straight away — no Supabase step.
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
          <div className="form-help">Default-generated; replace with your own if you prefer. At least 8 characters.</div>
        </div>
        {err && <div className="error-bar" style={{ marginTop: 12 }}>{err}</div>}
        <div className="rv-modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-clay" onClick={confirm} disabled={busy || password.length < 8}>{busy ? 'Creating…' : <>Approve and create account <span className="arrow">→</span></>}</button>
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
