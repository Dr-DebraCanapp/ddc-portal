/* global React, window */
/* ============================================================
   Invite a veterinarian to the remote-read portal.
   Until now a vet could only get an account by finding the
   "Apply for an account" link themselves. This sends them a
   personal invitation carrying a pre-filled application link:
   {portal}/?apply=1&n=…&c=…&e=…&inv=<id>
   They land straight on the application form with their details
   already in it, and it arrives under Applications as usual.
   Invitations are tracked in this browser (localStorage) so you
   can see who has not answered yet, copy the link again, or resend.
   Loads AFTER portal-storage.jsx, BEFORE reviewer-applications.jsx.
   ============================================================ */
const { useState: ivUseState } = React;

const VET_INVITES_KEY = 'ddc_vet_invites';

const VetInvites = {
  all() {
    try { return JSON.parse(localStorage.getItem(VET_INVITES_KEY)) || []; }
    catch { return []; }
  },
  save(list) { localStorage.setItem(VET_INVITES_KEY, JSON.stringify(list)); },
  add(inv) {
    const list = VetInvites.all().filter(i => i.email.toLowerCase() !== inv.email.toLowerCase());
    list.unshift(inv);
    VetInvites.save(list);
    return inv;
  },
  touch(id, patch) {
    const list = VetInvites.all().map(i => i.id === id ? { ...i, ...patch } : i);
    VetInvites.save(list);
    return list;
  },
  remove(id) {
    const list = VetInvites.all().filter(i => i.id !== id);
    VetInvites.save(list);
    return list;
  },
  link({ id, name, clinic, email }) {
    const base = (((window.PORTAL_CONFIG || {}).payments || {}).portalUrl || 'https://portal.drdebracanapp.com').replace(/\/$/, '');
    const q = new URLSearchParams({ apply: '1', inv: id });
    if (name) q.set('n', name);
    if (clinic) q.set('c', clinic);
    if (email) q.set('e', email);
    return `${base}/?${q.toString()}`;
  },
};

function inviteBody(f, url) {
  return [
    f.name.trim() ? `Dear ${f.name.trim()},` : 'Hello,',
    '',
    `I would like to invite you to submit cases to Dr. Debra Canapp, DVM, DACVSMR, for remote second-opinion musculoskeletal ultrasound reads${f.clinic.trim() ? ` on behalf of ${f.clinic.trim()}` : ''}.`,
    '',
    ...(f.note.trim() ? [f.note.trim(), ''] : []),
    'Your application link — your details are already filled in:',
    url,
    '',
    'It takes a couple of minutes: it confirms your licence and practice, and once Dr. Canapp approves it we email your sign-in details. From then on you upload DICOM ultrasound clips, radiographs, reports, plus the patient history, and track each case through to the delivered report.',
    '',
    'Reads are billed per bilateral site and a written report is typically returned in 5-7 business days, or within 24 hours on a STAT request.',
    '',
    'Any questions, just reply to this message.',
    '',
    'With thanks,',
    'Ally Canapp - Li',
    '',
    'info@DrDebraCanapp.com',
  ].join('\n');
}

function InviteVetModal({ invite, onClose, onSent, flash }) {
  const [f, setF] = ivUseState({
    name: (invite && invite.name) || '',
    clinic: (invite && invite.clinic) || '',
    email: (invite && invite.email) || '',
    note: (invite && invite.note) || '',
  });
  const [sent, setSent] = ivUseState(false);
  const id = (invite && invite.id) || `INV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const valid = /\S+@\S+\.\S+/.test(f.email.trim());
  const url = VetInvites.link({ id, name: f.name.trim(), clinic: f.clinic.trim(), email: f.email.trim() });
  const body = inviteBody(f, url);

  const record = () => {
    VetInvites.add({
      id, name: f.name.trim(), clinic: f.clinic.trim(), email: f.email.trim(), note: f.note.trim(),
      sentAt: new Date().toISOString(),
    });
    onSent && onSent();
  };

  const send = () => {
    const subject = 'Invitation — remote MSK ultrasound reads with Dr. Debra Canapp';
    window.location.href = `mailto:${encodeURIComponent(f.email.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    record();
    setSent(true);
    flash && flash('Invitation drafted. It appears under Invitations until they apply.');
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(url); record(); flash && flash('Invitation link copied.'); }
    catch (e) { flash && flash('Copy failed — the link is ' + url); }
  };

  return (
    <div className="rv-modal-shell" onClick={onClose}>
      <div className="rv-modal rv-modal-wide" onClick={ev => ev.stopPropagation()}>
        <div className="rv-modal-eyebrow">§ Invitation</div>
        <h3 className="rv-modal-h">Invite a veterinarian to the portal</h3>
        <p className="rv-modal-body">
          They get a personal link to the application form with their name, practice and email already
          in it. It lands here under <strong>Applications</strong> for you to approve, exactly as if
          they had found the form themselves.
        </p>

        <div className="rv-inv-grid">
          <div className="form-row">
            <label className="form-label">Their name</label>
            <input className="form-input" value={f.name} onChange={ev => setF({ ...f, name: ev.target.value })} placeholder="Dr. First Last, DVM" />
          </div>
          <div className="form-row">
            <label className="form-label">Practice / clinic</label>
            <input className="form-input" value={f.clinic} onChange={ev => setF({ ...f, clinic: ev.target.value })} placeholder="e.g. River Road Veterinary" />
          </div>
        </div>
        <div className="form-row">
          <label className="form-label">Their email<span className="req">*</span></label>
          <input className="form-input" type="email" value={f.email} onChange={ev => setF({ ...f, email: ev.target.value })} placeholder="dr.smith@theirclinic.com" />
          <div className="form-help">Only this is required — the rest just saves them typing.</div>
        </div>
        <div className="form-row">
          <label className="form-label">Anything to add</label>
          <textarea className="form-area" style={{ minHeight: 70 }} value={f.note} onChange={ev => setF({ ...f, note: ev.target.value })} placeholder="Optional — e.g. following up on the case we discussed, or who referred them." />
        </div>

        <details className="sd-preview rv-inv-preview">
          <summary>What the invitation says</summary>
          <pre>{body}</pre>
        </details>

        <div className="rv-inv-link">
          <span className="k">Their link</span>
          <code>{valid ? url : 'Enter an email to generate the link'}</code>
          <button className="btn btn-ghost btn-sm" disabled={!valid} onClick={copyLink}>Copy link</button>
        </div>

        <div className="rv-modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>{sent ? 'Done' : 'Cancel'}</button>
          {window.SendMailButton ? (
            <window.SendMailButton
              to={f.email.trim()}
              subject="Invitation — remote MSK ultrasound reads with Dr. Debra Canapp"
              body={body}
              kind="vet_invite"
              label="Send the invitation"
              disabled={!valid}
              onSent={(how) => { record(); setSent(true); flash && flash(how === 'sent' ? 'Invitation sent. It appears under Invitations until they apply.' : 'Invitation drafted. It appears under Invitations until they apply.'); }}
            />
          ) : (
            <button className="btn btn-clay" disabled={!valid} onClick={send}>Open email invitation</button>
          )}
        </div>
        <p className="rv-inv-foot" style={{ marginTop: 10 }}>
          Prefer to send it yourself? Copy the link and use any channel — the form behaves the same.
          Nothing is created until they submit it.
        </p>
      </div>
    </div>
  );
}

function InvitationsList({ apps, onResend, onChanged, flash }) {
  const invites = VetInvites.all();
  if (invites.length === 0) return null;

  const statusOf = (inv) => {
    const app = (apps || []).find(a => (a.email || '').toLowerCase() === inv.email.toLowerCase());
    if (!app) return { key: 'sent', label: 'Awaiting their application' };
    if (app.status === 'approved') return { key: 'approved', label: 'Approved' };
    if (app.status === 'declined') return { key: 'declined', label: 'Declined' };
    return { key: 'applied', label: 'Applied — pending review' };
  };

  const copy = async (inv) => {
    try { await navigator.clipboard.writeText(VetInvites.link(inv)); flash && flash('Link copied.'); }
    catch (e) { flash && flash('Copy failed.'); }
  };

  return (
    <section className="rv-invites">
      <div className="rv-section-eyebrow">Invitations sent</div>
      <div className="rv-invite-rows">
        {invites.map(inv => {
          const st = statusOf(inv);
          return (
            <div key={inv.id} className={`rv-invite-row st-${st.key}`}>
              <div className="who">
                <div className="nm">{inv.name || inv.email}</div>
                {(inv.name ? [inv.clinic, inv.email] : [inv.clinic]).filter(Boolean).length > 0 && (
                  <div className="sub">{(inv.name ? [inv.clinic, inv.email] : [inv.clinic]).filter(Boolean).join(' · ')}</div>
                )}
              </div>
              <div className="when">Sent {new Date(inv.sentAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
              <span className={`status-pill ${st.key === 'approved' ? 'approved' : st.key === 'declined' ? 'declined' : 'pending'}`}>{st.label}</span>
              <div className="acts">
                <button className="btn btn-ghost btn-sm" onClick={() => copy(inv)}>Copy link</button>
                {st.key === 'sent' && <button className="btn btn-ghost btn-sm" onClick={() => onResend(inv)}>Resend</button>}
                <button className="btn btn-ghost btn-sm" onClick={() => { VetInvites.remove(inv.id); onChanged && onChanged(); }}>Remove</button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="rv-inv-foot">
        Invitations are remembered in this browser only — the application itself is stored with everything else.
      </p>
    </section>
  );
}

Object.assign(window, { InviteVetModal, InvitationsList, VetInvites });
