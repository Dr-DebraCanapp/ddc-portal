/* global React, window */
/* ============================================================
   Billing UI — shared by both applications
   PaymentModal  : record a payment (method, date, amount, reference)
   ChargeModal   : add a fee, a credit, or a custom line
   InvoicePanel  : the invoice for ONE billable entity — a clinic day
                   or a monthly remote-read statement. Same component
                   either way; it reads lines from the engine.
   Loads AFTER schedule-billing.jsx and schedule-shared.jsx.
   ============================================================ */
const B = () => window.SchedBill;
const SS = () => window.SCHED;

function SbStatusPill({ entity }) {
  const st = B().status(entity);
  const over = B().daysOverdue(entity);
  return <span className={`sb-pill ${st}`}>{B().STATUS_LABEL[st]}{st === 'overdue' ? ` · ${over}d` : ''}</span>;
}

function SbKindTag({ kind }) {
  return <span className={`sb-kind ${kind}`}>{kind === 'remote' ? 'Remote' : 'In-person'}</span>;
}

/* ---- issue an invoice, today or back-dated ----------------- */
/* Work performed before it reached the system still needs a document
   dated when it was actually billed — the due date follows from it. */
function IssueModal({ entity, onSave, onClose }) {
  const today = SS().iso(new Date(SS().TODAY));
  const [date, setDate] = useState(today);
  const terms = B().termsFor(entity);
  const due = new Date(new Date(date + 'T12:00').getTime() + terms * 86400000);
  const back = date < today;
  return (
    <div className="sc-modal-overlay" onClick={onClose}>
      <div className="sc-modal" onClick={ev => ev.stopPropagation()}>
        <div className="sc-modal-eyebrow">Issue · {B().title(entity)}</div>
        <h2 className="sc-modal-h">{SS().money(B().total(entity))}</h2>
        <p className="sc-modal-sub">
          {(entity.account && entity.account.billTo) || 'This account'} · Net {terms}. The invoice number
          already follows the month the work belongs to; the date below is when the document itself is dated.
        </p>
        <div className="form-row">
          <label className="form-label">Invoice date</label>
          <input className="form-input" type="date" max={today} value={date} onChange={ev => setDate(ev.target.value || today)} />
          <div className="form-help">
            {back
              ? <>Back-dated — due {due.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}, and it will read as overdue if that date has passed. Use this for work you billed before it was entered here.</>
              : <>Due {due.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}.</>}
          </div>
        </div>
        <div className="sc-modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-clay" onClick={() => onSave(entity, date)}>{back ? 'Issue, dated ' + new Date(date + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Issue invoice'}</button>
        </div>
      </div>
    </div>
  );
}

/* ---- record a payment ------------------------------------- */
function PaymentModal({ entity, onSave, onClose }) {
  const bal = B().balance(entity);
  const [f, setF] = useState({ amount: String(bal), method: 'check', date: SS().iso(new Date(SS().TODAY)), ref: '', note: '' });
  const amt = Number(f.amount) || 0;
  const valid = amt > 0 && amt <= bal + 0.5 && !!f.date;
  const inv = entity.invoice || {};
  return (
    <div className="sc-modal-overlay" onClick={onClose}>
      <div className="sc-modal" onClick={ev => ev.stopPropagation()}>
        <div className="sc-modal-eyebrow">Record payment · {inv.number}</div>
        <h2 className="sc-modal-h">{SS().money(bal)} outstanding</h2>
        <p className="sc-modal-sub">{(entity.account && entity.account.billTo) || 'This account'} — {B().title(entity)}. A part payment is fine; the balance stays open and the invoice reads “Part paid”.</p>
        <div className="sc-pat-grid">
          <div className="form-row"><label className="form-label">Amount received<span className="req">*</span></label>
            <input className="form-input" value={f.amount} onChange={ev => setF({ ...f, amount: ev.target.value.replace(/[^\d.]/g, '') })} inputMode="decimal" />
            {amt > bal + 0.5 && <div className="form-help" style={{ color: 'var(--clay-deep)' }}>More than the {SS().money(bal)} outstanding.</div>}
          </div>
          <div className="form-row"><label className="form-label">Method</label>
            <select className="form-select" value={f.method} onChange={ev => setF({ ...f, method: ev.target.value })}>
              {B().METHODS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div className="form-row"><label className="form-label">Date received<span className="req">*</span></label>
            <input className="form-input" type="date" value={f.date} onChange={ev => setF({ ...f, date: ev.target.value })} />
          </div>
          <div className="form-row"><label className="form-label">Reference</label>
            <input className="form-input" value={f.ref} onChange={ev => setF({ ...f, ref: ev.target.value })} placeholder={f.method === 'check' ? 'Check no.' : f.method === 'ach' ? 'Trace / confirmation' : 'Reference'} />
          </div>
        </div>
        <div className="form-row"><label className="form-label">Note</label>
          <input className="form-input" value={f.note} onChange={ev => setF({ ...f, note: ev.target.value })} placeholder="Optional — e.g. short-paid, remainder promised for the 30th" />
        </div>
        <div className="sc-modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-clay" disabled={!valid} onClick={() => onSave(entity, { id: 'pay' + Date.now(), amount: amt, method: f.method, date: f.date, ref: f.ref.trim(), note: f.note.trim() })}>Record {SS().money(amt)}</button>
        </div>
      </div>
    </div>
  );
}

/* ---- add a charge, credit, or custom line ----------------- */
function ChargeModal({ entity, onSave, onClose }) {
  const [f, setF] = useState({ type: 'travel', label: '', qty: '1', unit: '', amount: '', note: '', credit: false });
  const t = B().charge(f.type);
  const isCustom = !!t.custom;
  const sign = isCustom ? (f.credit ? -1 : 1) : t.sign;
  const qty = Math.max(1, Number(f.qty) || 1);
  const unit = Number(f.unit) || 0;
  const amt = isCustom ? Math.round(qty * unit) : (Number(f.amount) || 0);
  const ready = amt > 0 && (isCustom ? !!f.label.trim() : (sign > 0 || !!f.note.trim()));
  return (
    <div className="sc-modal-overlay" onClick={onClose}>
      <div className="sc-modal" onClick={ev => ev.stopPropagation()}>
        <div className="sc-modal-eyebrow">Adjust invoice · {(entity.invoice && entity.invoice.number) || 'draft'}</div>
        <h2 className="sc-modal-h">Add a charge or credit</h2>
        <p className="sc-modal-sub">Scan, injection and read fees come from the rate card automatically. This is for everything else.</p>
        <div className="sc-pat-grid">
          <div className="form-row"><label className="form-label">Type</label>
            <select className="form-select" value={f.type} onChange={ev => setF({ ...f, type: ev.target.value })}>
              {B().CHARGE_TYPES.map(c => <option key={c.id} value={c.id}>{c.label}{c.sign < 0 ? ' (credit)' : ''}</option>)}
            </select>
            {t.hint && <div className="form-help">{t.hint}</div>}
          </div>
          {!isCustom && (
            <div className="form-row"><label className="form-label">Amount<span className="req">*</span></label>
              <input className="form-input" value={f.amount} onChange={ev => setF({ ...f, amount: ev.target.value.replace(/[^\d.]/g, '') })} inputMode="decimal" placeholder="0" />
              <div className="form-help">{sign < 0 ? 'Subtracted from the total.' : 'Added to the total.'}</div>
            </div>
          )}
        </div>
        {isCustom && (
          <React.Fragment>
            <div className="form-row"><label className="form-label">Description<span className="req">*</span></label>
              <input className="form-input" value={f.label} onChange={ev => setF({ ...f, label: ev.target.value })} placeholder="e.g. Sedation drugs supplied · Splint materials · Courier return" maxLength={80} />
              <div className="form-help">This is the wording the hospital sees on the invoice.</div>
            </div>
            <div className="sc-pat-grid">
              <div className="form-row"><label className="form-label">Quantity</label>
                <input className="form-input" type="number" min="1" max="99" value={f.qty} onChange={ev => setF({ ...f, qty: ev.target.value })} />
              </div>
              <div className="form-row"><label className="form-label">Unit price<span className="req">*</span></label>
                <input className="form-input" value={f.unit} onChange={ev => setF({ ...f, unit: ev.target.value.replace(/[^\d.]/g, '') })} inputMode="decimal" placeholder="0" />
              </div>
            </div>
            <div className="sc-fee-preview" style={{ marginTop: 4 }}>
              <div className="line"><span>{f.label.trim() || 'Custom line'}{qty > 1 ? ' × ' + qty : ''}</span><b>{sign < 0 ? '−' : ''}{SS().money(amt)}</b></div>
              <div className="line tot"><span>{sign < 0 ? 'Credited to the account' : 'Added to the invoice'}</span><b>{SS().money(B().total(entity) + sign * amt)}</b></div>
            </div>
            <label className="sc-rush" style={{ marginTop: 12 }}>
              <input type="checkbox" checked={f.credit} onChange={ev => setF({ ...f, credit: ev.target.checked })} />
              <span><b>Make this a credit</b><br />Subtract it from the invoice instead of adding to it.</span>
            </label>
          </React.Fragment>
        )}
        <div className="form-row" style={{ marginTop: isCustom ? 12 : 0 }}>
          <label className="form-label">Note {(!isCustom && sign < 0) && <span className="req">*</span>}</label>
          <input className="form-input" value={f.note} onChange={ev => setF({ ...f, note: ev.target.value })} placeholder={sign < 0 ? 'Why the credit was given — this prints on the invoice' : 'Optional detail, prints under the line'} />
        </div>
        <div className="sc-modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-clay" disabled={!ready} onClick={() => onSave(entity, {
            id: 'chg' + Date.now(), type: f.type, amount: amt, note: f.note.trim(),
            ...(isCustom ? { label: f.label.trim(), qty, unit, sign } : {}),
          })}>{sign < 0 ? 'Apply credit' : 'Add charge'} {amt > 0 ? SS().money(amt) : ''}</button>
        </div>
      </div>
    </div>
  );
}

/* ---- the invoice panel — one entity, either kind ---------- */
function InvoicePanel({ entity, role, on, compact }) {
  const [modal, setModal] = useState(null);
  const inv = entity.invoice;
  const st = B().status(entity);
  const lines = B().lines(entity);
  const subtotal = B().subtotal(entity), total = B().total(entity);
  const paid = B().paid(inv, entity), bal = B().balance(entity);
  const isAdmin = role === 'admin';
  const acct = entity.account || {};
  const cancelled = entity.kind === 'inperson' ? (entity.patients || []).filter(p => p.cancelled) : [];

  if (!lines.length) {
    return <div className="sc-empty" style={{ padding: '28px 18px' }}><div style={{ fontStyle: 'italic' }}>{entity.kind === 'remote' ? 'No finalized reads this month — nothing to bill yet.' : 'No billable patients yet — billing appears once the roster is built.'}</div></div>;
  }
  return (
    <div className="sc-invoice">
      <div className="sc-invoice-meta">
        <span className="sc-invoice-num">{inv && inv.number ? inv.number : 'Not yet invoiced'}</span>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><SbKindTag kind={entity.kind} /><SbStatusPill entity={entity} /></span>
      </div>
      <div className="sb-terms">
        {B().title(entity)} · {B().count(entity)}
        {inv && inv.issued && <React.Fragment> · issued {new Date(inv.issued).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · Net {inv.termsDays || B().TERMS_DAYS} · due {B().due(entity).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</React.Fragment>}
        {st === 'overdue' && <b> · {B().daysOverdue(entity)} days overdue</b>}
      </div>

      <div style={{ padding: '10px 0 0' }}>
        {lines.map((l, i) => {
          const firstForWho = i === 0 || lines[i - 1].who !== l.who;
          return (
            <div key={i} className="sc-invoice-line">
              <div>
                <div className="ln-pat">{firstForWho ? l.who : <span style={{ color: 'var(--ink-4)' }}>↳</span>}</div>
                <div className="ln-svc">{l.label}{l.qty > 1 ? ` × ${l.qty}` : ''}{l.detail ? ' · ' + l.detail : ''}</div>
              </div>
              <div className="amt">{SS().money(l.amount)}</div>
            </div>
          );
        })}
        {cancelled.map(p => (
          <div key={p.id} className="sc-invoice-line cancelled">
            <div><div className="ln-pat">{p.name}</div><div className="ln-svc">Cancelled — not billed</div></div>
            <div className="amt">—</div>
          </div>
        ))}
        {((inv && inv.charges) || []).map(c => {
          const sign = B().chargeSign(c), detail = B().chargeDetail(c);
          return (
            <div key={c.id} className={`sc-invoice-line ${sign < 0 ? 'credit' : ''}`}>
              <div><div className="ln-pat">{B().chargeLabel(c)}</div><div className="ln-svc">{detail || (sign < 0 ? 'Credit' : 'Additional charge')}</div></div>
              <div className="amt">{sign < 0 ? '−' : ''}{SS().money(c.amount)}{isAdmin && <button className="sb-x" title="Remove" onClick={() => on.removeCharge(entity, c.id)}>×</button>}</div>
            </div>
          );
        })}
      </div>

      {(inv && (inv.charges || []).length > 0) && <div className="sb-subline"><span>Services</span><span>{SS().money(subtotal)}</span></div>}
      <div className="sc-invoice-total">
        <span className="lab">{inv && inv.writtenOff ? 'Written off' : `Billed to ${acct.billTo || acct.name || 'account'}`}</span>
        <span className="tot">{SS().money(total)}</span>
      </div>

      {((inv && inv.payments) || []).length > 0 && (
        <div className="sb-payments">
          {inv.payments.map(p => (
            <div key={p.id} className="sb-pay-row">
              <span className="m">{B().method(p.method).label}{p.ref ? ` · ${p.ref}` : ''}</span>
              <span className="d">{new Date(p.date + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              <span className="a">{SS().money(p.amount)}</span>
              {isAdmin && <button className="sb-x" title="Remove" onClick={() => on.removePayment(entity, p.id)}>×</button>}
            </div>
          ))}
          <div className="sb-pay-row bal"><span className="m">{bal > 0 ? 'Balance due' : 'Paid in full'}</span><span className="d" /><span className="a">{SS().money(bal)}</span></div>
        </div>
      )}

      {isAdmin && !compact && (
        <div className="sb-actions">
          {!inv || !inv.issued ? (
            <button className="btn btn-clay btn-sm" onClick={() => setModal('issue')}>Issue invoice</button>
          ) : (
            <React.Fragment>
              <button className="btn btn-ghost btn-sm" onClick={() => { const w = window.open('', '_blank', 'width=880,height=1040'); if (w) { w.document.write(SS().buildInvoiceHTML(entity)); w.document.close(); } }}>View / print</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal('send')}>Email {entity.kind === 'remote' ? 'statement' : 'invoice'}</button>
              {bal > 0 && !inv.writtenOff && <button className="btn btn-clay btn-sm" onClick={() => setModal('pay')}>Record payment</button>}
              {bal === 0 && <button className="btn btn-ghost btn-sm" onClick={() => { const w = window.open('', '_blank', 'width=880,height=1040'); if (w) { w.document.write(SS().buildReceiptHTML(entity)); w.document.close(); } }}>Receipt</button>}
            </React.Fragment>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setModal('charge')}>Add charge / credit</button>
          {inv && inv.issued && bal > 0 && (
            <button className="btn btn-ghost btn-sm sb-danger" onClick={() => on.writeOff(entity, !inv.writtenOff)}>{inv.writtenOff ? 'Reinstate' : 'Write off'}</button>
          )}
        </div>
      )}

      {isAdmin && inv && (inv.audit || []).length > 0 && !compact && (
        <details className="sb-audit">
          <summary>History ({inv.audit.length})</summary>
          {inv.audit.slice().reverse().map((a, i) => (
            <div key={i} className="row"><span className="w">{a.what}</span><span className="t">{new Date(a.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {a.who}</span></div>
          ))}
        </details>
      )}

      {modal === 'issue' && <IssueModal entity={entity} onSave={(en, dt) => { on.issueInvoice(en, dt); setModal(null); }} onClose={() => setModal(null)} />}
      {modal === 'pay' && <PaymentModal entity={entity} onSave={(en, p) => { on.addPayment(en, p); setModal(null); }} onClose={() => setModal(null)} />}
      {modal === 'send' && window.SendInvoiceModal && <window.SendInvoiceModal entity={entity} onClose={() => setModal(null)} />}
      {modal === 'charge' && <ChargeModal entity={entity} onSave={(en, c) => { on.addCharge(en, c); setModal(null); }} onClose={() => setModal(null)} />}
    </div>
  );
}

Object.assign(window, { InvoicePanel, PaymentModal, ChargeModal, IssueModal, SbStatusPill, SbKindTag });
