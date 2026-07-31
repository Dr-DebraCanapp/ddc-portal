/* global React, window */
/* ============================================================
   Rate card editor — change prices without a deploy
   Lives in the Billing tab. A new card takes effect from a date you
   choose; work already invoiced keeps the price it was billed at.
   Loads AFTER schedule-rates.jsx and schedule-billing-ui.jsx.
   ============================================================ */
const RE_R = () => window.SchedRates;
const RE_S = () => window.SCHED;
const RE_B = () => window.SchedBill;

function RateCardEditor({ onClose, onSaved }) {
  const R = RE_R();
  const cards = R.cards();
  const current = R.current();
  const [mode, setMode] = useState('view');           // view | edit
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const startNew = () => {
    const base = R.current();
    const d = new Date(RE_S().TODAY);
    setF({
      id: 'rate-' + Date.now(),
      effectiveFrom: RE_S().iso(d),
      amounts: { ...base.amounts },
      injectionIncluded: base.injectionIncluded,
      recheckMonths: base.recheckMonths,
      termsDays: base.termsDays,
      note: '',
      isNew: true,
    });
    setMode('edit');
  };
  const startEdit = (c) => { setF({ ...c, amounts: { ...c.amounts }, isNew: false }); setMode('edit'); };

  const setAmt = (id, v) => setF(p => ({ ...p, amounts: { ...p.amounts, [id]: v.replace(/[^\d.]/g, '') } }));
  const changed = f && Object.keys(f.amounts).filter(k => Number(f.amounts[k]) !== Number(current.amounts[k]));

  const save = async () => {
    setBusy(true); setErr('');
    try {
      const card = {
        id: f.id, effectiveFrom: f.effectiveFrom || null,
        amounts: Object.fromEntries(Object.entries(f.amounts).map(([k, v]) => [k, Math.round(Number(v) || 0)])),
        injectionIncluded: Number(f.injectionIncluded) || 4,
        recheckMonths: Number(f.recheckMonths) || 6,
        termsDays: Number(f.termsDays) || 15,
        note: (f.note || '').trim(),
      };
      await R.save(card);
      onSaved && onSaved(card);
      setMode('view'); setF(null);
    } catch (e) { setErr(String(e.message || e)); }
    setBusy(false);
  };

  const remove = async (id) => { setBusy(true); try { await R.remove(id); onSaved && onSaved(); } catch (e) { setErr(String(e.message || e)); } setBusy(false); };

  return (
    <div className="sc-modal-overlay" onClick={onClose}>
      <div className="sc-modal wide" onClick={ev => ev.stopPropagation()}>
        <div className="sc-modal-eyebrow">Billing · rate card</div>
        <h2 className="sc-modal-h">{mode === 'edit' ? (f.isNew ? 'New prices' : 'Edit rate card') : 'Prices'}</h2>
        <p className="sc-modal-sub">
          {mode === 'edit'
            ? 'Set the date these prices start. Anything already invoiced keeps the price it was billed at — only work on or after that date uses the new card.'
            : 'The card in force today is used for new work. Raise prices by adding a new card with a start date; the old one stays on the invoices it produced.'}
        </p>

        {err && <div className="sd-warn" style={{ marginBottom: 12 }}>{err}</div>}

        {mode === 'view' && (
          <React.Fragment>
            <div className="rc-list">
              {cards.slice().reverse().map(c => {
                const active = c.id === current.id;
                return (
                  <div key={c.id} className={`rc-card ${active ? 'on' : ''}`}>
                    <div className="rc-card-h">
                      <div>
                        <div className="when">{c.effectiveFrom ? 'From ' + new Date(c.effectiveFrom + 'T12:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Original prices'}</div>
                        {c.note && <div className="note">{c.note}</div>}
                      </div>
                      <div className="rc-card-a">
                        {active && <span className="sb-pill paid">In force</span>}
                        {c.id !== 'default' && <button className="btn btn-ghost btn-sm" onClick={() => startEdit(c)}>Edit</button>}
                        {c.id !== 'default' && <button className="sb-x" title="Delete this card" disabled={busy} onClick={() => remove(c.id)}>×</button>}
                      </div>
                    </div>
                    <div className="rc-grid">
                      {R.ROWS.map(r => (
                        <div key={r.id} className="rc-row"><span>{r.label}</span><b>{RE_S().money(c.amounts[r.id])}</b></div>
                      ))}
                    </div>
                    <div className="rc-meta">Injection includes {c.injectionIncluded} sites · recheck window {c.recheckMonths} months · terms Net {c.termsDays}</div>
                  </div>
                );
              })}
            </div>
            <div className="sc-modal-actions">
              <button className="btn btn-ghost" onClick={onClose}>Close</button>
              <button className="btn btn-clay" onClick={startNew}>+ New prices</button>
            </div>
          </React.Fragment>
        )}

        {mode === 'edit' && (
          <React.Fragment>
            <div className="sc-pat-grid">
              <div className="form-row"><label className="form-label">These prices start<span className="req">*</span></label>
                <input className="form-input" type="date" value={f.effectiveFrom || ''} onChange={ev => setF({ ...f, effectiveFrom: ev.target.value })} />
                <div className="form-help">Work dated on or after this uses the new prices.</div>
              </div>
              <div className="form-row"><label className="form-label">Why (optional)</label>
                <input className="form-input" value={f.note} onChange={ev => setF({ ...f, note: ev.target.value })} placeholder="e.g. 2027 rates · 6% increase" maxLength={70} />
              </div>
            </div>

            <div className="rc-edit">
              {R.ROWS.map(r => {
                const was = Number(current.amounts[r.id]) || 0;
                const now = Number(f.amounts[r.id]) || 0;
                const diff = now - was;
                return (
                  <div key={r.id} className="rc-edit-row">
                    <div className="l"><b>{r.label}</b><span>{r.note}</span></div>
                    <div className="i">
                      <span className="cur">$</span>
                      <input className="form-input" value={f.amounts[r.id]} onChange={ev => setAmt(r.id, ev.target.value)} inputMode="decimal" />
                    </div>
                    <div className={`d ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}`}>
                      {diff === 0 ? 'unchanged' : (diff > 0 ? '+' : '−') + RE_S().money(Math.abs(diff)).replace('$', '$') + ' (' + (was ? (diff / was * 100).toFixed(0) : '—') + '%)'}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rc-settings">
              {R.SETTINGS.map(s => (
                <div key={s.id} className="form-row">
                  <label className="form-label">{s.label}</label>
                  <div className="rc-num">
                    <input className="form-input" type="number" min={s.min} max={s.max} value={f[s.id]} onChange={ev => setF({ ...f, [s.id]: ev.target.value })} />
                    <span>{s.suffix}</span>
                  </div>
                </div>
              ))}
            </div>

            {changed.length > 0 && (
              <div className="rc-summary">
                <b>{changed.length} price{changed.length === 1 ? '' : 's'} changing.</b> Invoices already issued are untouched.
              </div>
            )}

            <div className="sc-modal-actions">
              <button className="btn btn-ghost" onClick={() => { setMode('view'); setF(null); }}>Back</button>
              <button className="btn btn-clay" disabled={busy || !f.effectiveFrom} onClick={save}>{busy ? 'Saving…' : 'Save these prices'}</button>
            </div>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { RateCardEditor });
