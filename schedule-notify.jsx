/* global React, window */
/* ============================================================
   Alert recipients — who gets a text when something needs a human

   Everything here is stored in the database, so changing who is
   alerted (or turning someone off while on holiday) never needs a
   deploy. Sending itself is done by the notify-dispatch function.
   ============================================================ */
const { useState: nfState, useEffect: nfEffect } = React;

const NF_EVENTS = [
  ['case_submitted', 'Remote read submitted', 'A referring vet uploads a new case'],
  ['case_stat', 'STAT remote read', 'Marked urgent — ignores quiet hours'],
  ['case_comment', 'Vet asks a question', 'A referring vet comments on a case'],
  ['vet_application', 'New vet application', 'Someone applies for portal access'],
  ['visit_request', 'Clinic day request', 'A hospital asks for a visit'],
  ['study_unmatched', 'DICOM study needs assigning', 'A study arrived we could not place'],
];

const nfBlank = () => ({
  name: '', phone: '', email: '', sms: true, email_on: false,
  events: ['*'], quiet_from: '', quiet_to: '', active: true,
});

/* Phones must be E.164 or Twilio rejects them. Accept what people type
   and normalize, rather than making them learn the format. */
function nfPhone(raw) {
  const digits = String(raw || '').replace(/[^\d+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return digits;
}
const nfPhoneOk = (p) => /^\+\d{10,15}$/.test(p);

function NotifyPanel({ flash, oops }) {
  const [rows, setRows] = nfState(null);
  const [missing, setMissing] = nfState(false);
  const [editing, setEditing] = nfState(null);   // recipient object or null
  const [log, setLog] = nfState([]);
  const [showLog, setShowLog] = nfState(false);
  const [busy, setBusy] = nfState(false);

  const Cloud = window.SchedCloud;

  const load = async () => {
    try {
      const list = await Cloud.loadRecipients();
      if (list === null) { setMissing(true); setRows([]); return; }
      setMissing(false);
      setRows(list);
    } catch (e) { oops(e); setRows([]); }
  };
  nfEffect(() => { load(); }, []);

  const openLog = async () => {
    setShowLog(v => !v);
    if (!showLog) { try { setLog(await Cloud.loadNotifyLog(25)); } catch (e) { /* log is optional */ } }
  };

  const save = async () => {
    const r = editing;
    if (!r.name.trim()) { flash('Give the recipient a name.'); return; }
    const phone = nfPhone(r.phone);
    if (r.sms && !nfPhoneOk(phone)) { flash('That phone number does not look right — use a full number, e.g. 410 555 1234.'); return; }
    if (r.email_on && !/.+@.+\..+/.test(r.email || '')) { flash('Add a valid email address, or turn email off.'); return; }
    setBusy(true);
    try {
      await Cloud.saveRecipient({ ...r, phone });
      await load();
      setEditing(null);
      flash('Saved.');
    } catch (e) { oops(e); }
    setBusy(false);
  };

  const remove = async (r) => {
    if (!confirm(`Stop sending alerts to ${r.name}?`)) return;
    try { await Cloud.deleteRecipient(r.id); await load(); } catch (e) { oops(e); }
  };

  const toggleActive = async (r) => {
    try { await Cloud.saveRecipient({ ...r, active: !r.active }); await load(); } catch (e) { oops(e); }
  };

  const test = async () => {
    setBusy(true);
    try {
      await Cloud.sendTestAlert();
      flash('Test alert queued — it should arrive within a minute.');
      setTimeout(async () => { try { setLog(await Cloud.loadNotifyLog(25)); setShowLog(true); } catch (e) {} }, 4000);
    } catch (e) { oops(e); }
    setBusy(false);
  };

  const eventLabel = (r) => {
    if (!r.events || r.events.includes('*')) return 'Everything';
    if (!r.events.length) return 'Nothing selected';
    return r.events.length + ' of ' + NF_EVENTS.length + ' events';
  };
  const quietLabel = (r) => (r.quiet_from && r.quiet_to)
    ? `Quiet ${r.quiet_from.slice(0, 5)}–${r.quiet_to.slice(0, 5)}`
    : 'No quiet hours';

  return (
    <div className="nf-wrap">
      <div className="dh nf-dh">Text &amp; email alerts</div>
      <p className="rv-sub nf-intro">
        Anything that needs someone to log in raises an alert: a new remote read, a question from a
        referring vet, an application, a clinic-day request, a DICOM study we could not place. STAT
        cases are marked urgent and ignore quiet hours.
      </p>
      <p className="rv-sub nf-intro">
        Referring vets are emailed separately, and sparingly: when we receive their case, when
        Dr. Canapp starts it, when the report is ready, and when she answers a question. Four emails
        at most, never a digest.
      </p>

      {missing && (
        <div className="sc-dicom-note nf-warn">
          <span className="ic">!</span>
          <div>Alerts aren’t set up yet. Run <span className="mono">supabase/migrations/notifications.sql</span>,
          deploy the <span className="mono">notify-dispatch</span> function and fill in
          <span className="mono"> notify_config</span> — see <strong>ALERTS-SETUP.md</strong>.</div>
        </div>
      )}

      {rows && !!rows.length && (
        <div className="nf-list">
          {rows.map(r => (
            <div key={r.id} className={`nf-row ${r.active ? '' : 'off'}`}>
              <div className="nf-main">
                <div className="nf-name">{r.name}{!r.active && <span className="nf-pill">paused</span>}</div>
                <div className="nf-meta">
                  {r.sms && r.phone ? <span className="mono">{r.phone}</span> : <span className="dim">no text</span>}
                  {r.email_on && r.email ? <span>{r.email}</span> : null}
                  <span>{eventLabel(r)}</span>
                  <span>{quietLabel(r)}</span>
                </div>
              </div>
              <div className="nf-acts">
                <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(r)}>{r.active ? 'Pause' : 'Resume'}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ ...r, quiet_from: r.quiet_from || '', quiet_to: r.quiet_to || '' })}>Edit</button>
                <button className="btn btn-ghost btn-sm" onClick={() => remove(r)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {rows && !rows.length && !missing && <p className="rv-sub">No one is being alerted yet.</p>}

      {editing && (
        <div className="nf-edit">
          <div className="nf-edit-grid">
            <label className="form-row">
              <span className="form-label">Name</span>
              <input className="form-input" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Dr. Debra Canapp" />
            </label>
            <label className="form-row">
              <span className="form-label">Mobile number</span>
              <input className="form-input mono" value={editing.phone} onChange={e => setEditing({ ...editing, phone: e.target.value })} placeholder="410 555 1234" />
            </label>
            <label className="form-row">
              <span className="form-label">Email <span className="nf-opt">— optional</span></span>
              <input className="form-input" value={editing.email || ''} onChange={e => setEditing({ ...editing, email: e.target.value })} placeholder="name@drdebracanapp.com" />
            </label>
            <div className="form-row">
              <span className="form-label">Send by</span>
              <div className="nf-checks">
                <label><input type="checkbox" checked={!!editing.sms} onChange={e => setEditing({ ...editing, sms: e.target.checked })} /> Text message</label>
                <label><input type="checkbox" checked={!!editing.email_on} onChange={e => setEditing({ ...editing, email_on: e.target.checked })} /> Email</label>
              </div>
            </div>
          </div>

          <div className="form-row">
            <span className="form-label">Alert on</span>
            <label className="nf-all">
              <input type="checkbox" checked={(editing.events || []).includes('*')}
                onChange={e => setEditing({ ...editing, events: e.target.checked ? ['*'] : NF_EVENTS.map(x => x[0]) })} />
              Everything (recommended)
            </label>
            {!(editing.events || []).includes('*') && (
              <div className="nf-events">
                {NF_EVENTS.map(([id, label, help]) => (
                  <label key={id} className="nf-event">
                    <input type="checkbox" checked={(editing.events || []).includes(id)}
                      onChange={e => {
                        const set = new Set(editing.events || []);
                        if (e.target.checked) set.add(id); else set.delete(id);
                        setEditing({ ...editing, events: [...set] });
                      }} />
                    <span><strong>{label}</strong><em>{help}</em></span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="form-row">
            <span className="form-label">Quiet hours <span className="nf-opt">— optional; STAT still comes through</span></span>
            <div className="nf-quiet">
              <input className="form-input" type="time" value={editing.quiet_from || ''} onChange={e => setEditing({ ...editing, quiet_from: e.target.value })} />
              <span className="nf-to">to</span>
              <input className="form-input" type="time" value={editing.quiet_to || ''} onChange={e => setEditing({ ...editing, quiet_to: e.target.value })} />
              {(editing.quiet_from || editing.quiet_to) &&
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ ...editing, quiet_from: '', quiet_to: '' })}>Clear</button>}
            </div>
            <div className="form-help">Alerts raised inside this window are held and delivered when it ends. Eastern time.</div>
          </div>

          <div className="nf-edit-acts">
            <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save recipient'}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}

      {!editing && (
        <div className="nf-foot">
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(nfBlank())} disabled={missing}>Add recipient</button>
          <button className="btn btn-ghost btn-sm" onClick={test} disabled={missing || busy || !(rows && rows.length)}>Send test alert</button>
          <button className="btn btn-ghost btn-sm" onClick={openLog}>{showLog ? 'Hide recent alerts' : 'Recent alerts'}</button>
        </div>
      )}

      {showLog && (
        <div className="nf-log">
          {!log.length && <p className="rv-sub">Nothing sent yet.</p>}
          {log.map(l => (
            <div key={l.id} className={`nf-log-row st-${l.status}`}>
              <span className="nf-log-when">{new Date(l.sent_at || l.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
              <span className="nf-log-title">{l.urgent ? 'STAT — ' : ''}{l.title}</span>
              <span className="nf-log-to mono">{l.address}</span>
              <span className="nf-log-st">
                {l.status}
                {l.status === 'pending' && l.send_after && new Date(l.send_after) > new Date() ? ' · held' : ''}
              </span>
              {l.last_error && <span className="nf-log-err">{l.last_error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { NotifyPanel });
