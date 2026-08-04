/* global React, window */
/* ============================================================
   Referring vet card — who submitted this, and how to reach them

   Opened from any place a vet's name appears. Reads the
   vet_directory view (profile + their application + case history)
   and lets staff correct details in place, because the details
   are only as good as whatever was typed at sign-up.
   ============================================================ */
const { useState: rvcState, useEffect: rvcEffect } = React;

const RVC_FIELDS = [
  ['name', 'Name'],
  ['clinic', 'Practice'],
  ['phone', 'Phone'],
  ['email', 'Email', true],
  ['license', 'Licence'],
  ['state', 'State / region'],
  ['country', 'Country'],
  ['specialty', 'Focus'],
];

function VetCard({ vetKey, onClose }) {
  const [vet, setVet] = rvcState(null);
  const [err, setErr] = rvcState(null);
  const [editing, setEditing] = rvcState(false);
  const [draft, setDraft] = rvcState({});
  const [saving, setSaving] = rvcState(false);
  const [busy, setBusy] = rvcState(false);

  rvcEffect(() => {
    let dead = false;
    (async () => {
      try {
        const v = await window.PortalDB.getVet(vetKey);
        if (dead) return;
        if (!v) { setErr('No account record found for this vet.'); return; }
        setVet(v); setDraft(v);
      } catch (e) {
        if (dead) return;
        console.warn('[vet card]', e);
        const msg = String((e && e.message) || e);
        setErr(/vet_directory|schema cache|PGRST205/i.test(msg)
          ? 'The vet directory isn’t set up yet — run the vet-directory migration in Supabase, then reopen this.'
          : msg);
      }
    })();
    return () => { dead = true; };
  }, [vetKey && vetKey.id, vetKey && vetKey.email]);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await window.PortalDB.updateVet(vet.id, draft);
      setVet(saved || { ...vet, ...draft });
      setEditing(false);
    } catch (e) { alert(e.message || String(e)); }
    setSaving(false);
  };

  const when = (d) => d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  /* Deactivate rather than delete: the case history has to survive. */
  const toggleActive = async () => {
    const off = vet.active !== false;
    if (off) {
      const note = prompt(`Lock ${vet.name || vet.email} out of the portal?\n\nTheir cases, reports and invoices are kept and stay visible to you. They will not be able to sign in or submit.\n\nReason (optional, for your records):`);
      if (note === null) return;
      setBusy(true);
      try { setVet(await window.PortalDB.setVetActive(vet.id, false, note.trim() || null)); }
      catch (e) { alert(e.message || String(e)); }
      setBusy(false);
    } else {
      if (!confirm(`Give ${vet.name || vet.email} access again?`)) return;
      setBusy(true);
      try { setVet(await window.PortalDB.setVetActive(vet.id, true)); }
      catch (e) { alert(e.message || String(e)); }
      setBusy(false);
    }
  };

  return (
    <div className="vc-overlay" onClick={onClose}>
      <div className="vc-panel" onClick={e => e.stopPropagation()}>
        <div className="vc-head">
          <div className="vc-eyebrow">Referring veterinarian</div>
          <button className="rv-drawer-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {err && <div className="vc-empty">{err}</div>}
        {!err && !vet && <div className="vc-empty">Loading…</div>}

        {vet && (
          <React.Fragment>
            <div className="vc-title">{vet.name || vet.email}{vet.active === false && <span className="vc-off">deactivated</span>}</div>
            <div className="vc-sub">{vet.clinic || 'Practice not recorded'}</div>

            {vet.active === false && (
              <div className="vc-offnote">
                Locked out {vet.deactivated_at ? 'on ' + when(vet.deactivated_at) : ''}. Their cases,
                reports and invoices are all still here.
                {vet.deactivated_note ? <><br />{vet.deactivated_note}</> : null}
              </div>
            )}

            <div className="vc-stats">
              <div><span className="vc-n">{vet.case_count || 0}</span><span className="vc-k">cases</span></div>
              <div><span className="vc-n">{vet.open_cases || 0}</span><span className="vc-k">open</span></div>
              <div><span className="vc-n">{vet.last_case_at ? when(vet.last_case_at) : '—'}</span><span className="vc-k">last case</span></div>
            </div>

            {!editing && (
              <div className="vc-rows">
                {RVC_FIELDS.map(([k, label]) => (
                  <div className="vc-row" key={k}>
                    <span className="vc-label">{label}</span>
                    <span className="vc-val">
                      {k === 'email' && vet.email ? <a href={`mailto:${vet.email}`}>{vet.email}</a>
                        : k === 'phone' && vet.phone ? <a href={`tel:${String(vet.phone).replace(/[^\d+]/g, '')}`}>{vet.phone}</a>
                        : (vet[k] || <span className="dim">—</span>)}
                    </span>
                  </div>
                ))}
                <div className="vc-row">
                  <span className="vc-label">Account since</span>
                  <span className="vc-val">{when(vet.created_at)}</span>
                </div>
                {vet.approved_at && (
                  <div className="vc-row">
                    <span className="vc-label">Approved</span>
                    <span className="vc-val">{when(vet.approved_at)}</span>
                  </div>
                )}
              </div>
            )}

            {editing && (
              <div className="vc-rows">
                {RVC_FIELDS.map(([k, label, ro]) => (
                  <div className="vc-row" key={k}>
                    <span className="vc-label">{label}</span>
                    {ro
                      ? <span className="vc-val dim">{vet[k] || '—'}</span>
                      : <input className="vc-input" value={draft[k] || ''} onChange={e => setDraft({ ...draft, [k]: e.target.value })} />}
                  </div>
                ))}
                <div className="vc-row vc-row-notes">
                  <span className="vc-label">Notes</span>
                  <textarea className="vc-input" rows={3} value={draft.notes || ''}
                    onChange={e => setDraft({ ...draft, notes: e.target.value })}
                    placeholder="Anything worth remembering — preferred contact, referral source…" />
                </div>
              </div>
            )}

            {!editing && vet.notes && <div className="vc-notes">{vet.notes}</div>}
            {!editing && vet.application_note && (
              <div className="vc-appnote">
                <div className="vc-eyebrow">From their application</div>
                <p>{vet.application_note}</p>
              </div>
            )}

            <div className="vc-actions">
              {editing ? (
                <React.Fragment>
                  <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setDraft(vet); setEditing(false); }}>Cancel</button>
                </React.Fragment>
              ) : (
                <React.Fragment>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Correct details</button>
                  {vet.email && <a className="btn btn-ghost btn-sm" href={`mailto:${vet.email}`}>Email</a>}
                  {window.PortalDB.setVetActive && (
                    <button className="btn btn-ghost btn-sm vc-danger" onClick={toggleActive} disabled={busy}>
                      {vet.active === false ? 'Restore access' : 'Deactivate'}
                    </button>
                  )}
                </React.Fragment>
              )}
            </div>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

/* A vet's name, anywhere — click to open the card. */
function VetName({ name, email, userId, className, fallback }) {
  const [open, setOpen] = rvcState(false);
  const shown = name && !/@/.test(name) ? name : (name || fallback || '—');
  const linkable = !!(email || userId);
  return (
    <React.Fragment>
      {linkable
        ? <button type="button" className={`vc-namebtn ${className || ''}`} onClick={(e) => { e.stopPropagation(); setOpen(true); }}
                  title="Contact details and case history">{shown}</button>
        : <span className={className}>{shown}</span>}
      {open && <VetCard vetKey={{ id: userId, email }} onClose={() => setOpen(false)} />}
    </React.Fragment>
  );
}

Object.assign(window, { VetCard, VetName });
