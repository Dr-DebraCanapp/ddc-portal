/* global React, window */
/* ============================================================
   Billing tab — every invoice in the business, both applications
   Filters by status, by kind (in-person / remote reads) and by
   account. Click an account to see its whole ledger; click an
   invoice to open its panel.
   Loads AFTER schedule-billing-ui.jsx.
   ============================================================ */
const BV = () => window.SchedBill;
const BS = () => window.SCHED;

const SB_FILTERS = [
  { id: 'open', label: 'Outstanding' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'draft', label: 'Not issued' },
  { id: 'paid', label: 'Paid' },
  { id: 'all', label: 'All' },
];
const SB_KINDS = [
  { id: '', label: 'Both' },
  { id: 'inperson', label: 'In-person' },
  { id: 'remote', label: 'Remote reads' },
];

function SbAgingBar({ buckets, total }) {
  const order = ['current', '1-30', '31-60', '61-90', '90+'];
  if (!total) return null;
  return (
    <div className="sb-aging">
      <div className="sb-aging-bar">
        {order.map(k => buckets[k] > 0 && <div key={k} className={`seg ${k}`} style={{ width: (buckets[k] / total * 100) + '%' }} title={`${k}: ${BS().money(buckets[k])}`} />)}
      </div>
      <div className="sb-aging-keys">
        {order.map(k => buckets[k] > 0 && (
          <span key={k} className="sb-aging-key"><i className={`dot ${k}`} />{k === 'current' ? 'Current' : k + ' days'} · {BS().money(buckets[k])}</span>
        ))}
      </div>
    </div>
  );
}

function SbCards({ list }) {
  const outstanding = list.filter(e => ['unpaid', 'partial', 'overdue'].includes(BV().status(e)));
  const totalOut = outstanding.reduce((s, e) => s + BV().balance(e), 0);
  const overdue = outstanding.filter(e => BV().status(e) === 'overdue');
  const totalOverdue = overdue.reduce((s, e) => s + BV().balance(e), 0);
  const notIssued = list.filter(e => ['none', 'draft'].includes(BV().status(e)));
  const uninvoiced = notIssued.reduce((s, e) => s + BV().total(e), 0);
  const collected = list.reduce((s, e) => s + BV().paid(e.invoice, e), 0);
  return (
    <div className="sb-cards">
      <div className="sb-card"><div className="k">Outstanding</div><div className="v">{BS().money(totalOut)}</div><div className="s">{outstanding.length} invoice{outstanding.length === 1 ? '' : 's'}</div></div>
      <div className={`sb-card ${totalOverdue > 0 ? 'warn' : ''}`}><div className="k">Overdue</div><div className="v">{BS().money(totalOverdue)}</div><div className="s">{overdue.length ? `oldest ${Math.max(...overdue.map(e => BV().daysOverdue(e)))} days` : 'nothing past due'}</div></div>
      <div className="sb-card"><div className="k">Not yet invoiced</div><div className="v">{BS().money(uninvoiced)}</div><div className="s">{notIssued.length} batch{notIssued.length === 1 ? '' : 'es'}</div></div>
      <div className="sb-card"><div className="k">Collected</div><div className="v">{BS().money(collected)}</div><div className="s">all time</div></div>
    </div>
  );
}

function SbRow({ e, on, onOpen }) {
  const inv = e.invoice, st = BV().status(e), bal = BV().balance(e);
  const acct = e.account || {};
  return (
    <div className={`sb-trow ${st}`}>
      <div className="num">{inv && inv.number ? inv.number : <span className="muted">— draft —</span>}</div>
      <div><span className="sb-dot" style={{ background: acct.color || '#8B9482' }} />{acct.billTo || acct.name || '—'}</div>
      <div><window.SbKindTag kind={e.kind} /></div>
      <div>{BV().title(e).replace(/^(Clinic day|Remote reads) · /, '')}<div className="sub">{BV().count(e)}</div></div>
      <div>{BV().due(e) ? BV().due(e).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}</div>
      <div className="amt">{BS().money(BV().total(e))}</div>
      <div className="amt">{bal > 0 ? BS().money(bal) : <span className="muted">—</span>}</div>
      <div><window.SbStatusPill entity={e} /></div>
      <div className="acts">
        {(!inv || !inv.issued) && <button className="btn btn-clay btn-sm" onClick={() => on.issueInvoice(e)}>Issue</button>}
        {inv && inv.issued && bal > 0 && !inv.writtenOff && <button className="btn btn-ghost btn-sm" onClick={() => on.openPayment(e)}>Payment</button>}
        <button className="btn btn-ghost btn-sm" onClick={() => onOpen(e)}>Open</button>
      </div>
    </div>
  );
}

function BillingView({ entities, accounts, on, onOpenEntity, onEditRates, onAddPast }) {
  const [filter, setFilter] = useState('open');
  const [kind, setKind] = useState('');
  const [acctId, setAcctId] = useState('');
  const [sel, setSel] = useState(null);

  const due = window.SchedEntities.due(entities);
  const scoped = due.filter(e => (!kind || e.kind === kind) && (!acctId || e.accountId === acctId));

  const rows = scoped.filter(e => {
    const st = BV().status(e);
    if (filter === 'all') return true;
    if (filter === 'open') return ['unpaid', 'partial', 'overdue'].includes(st);
    if (filter === 'overdue') return st === 'overdue';
    if (filter === 'draft') return ['none', 'draft'].includes(st);
    if (filter === 'paid') return ['paid', 'written_off'].includes(st);
    return true;
  }).sort((a, b) => (BV().daysOverdue(b) - BV().daysOverdue(a)) || (BV().entityDate(b) - BV().entityDate(a)));

  const outstanding = scoped.filter(e => ['unpaid', 'partial', 'overdue'].includes(BV().status(e)));
  const buckets = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  outstanding.forEach(e => { buckets[BV().ageBucket(e)] += BV().balance(e); });
  const totalOut = outstanding.reduce((s, e) => s + BV().balance(e), 0);
  const counts = {
    open: outstanding.length,
    overdue: outstanding.filter(e => BV().status(e) === 'overdue').length,
    draft: scoped.filter(e => ['none', 'draft'].includes(BV().status(e))).length,
  };
  const selEntity = sel ? due.find(e => e.id === sel) : null;

  return (
    <React.Fragment>
      <div className="sc-caltools">
        <div className="sc-monthnav"><div className="mo" style={{ minWidth: 0 }}>Billing</div></div>
        <div className="sc-caltools-right" style={{ gap: 8 }}>
          <select className="form-select sb-sel" value={acctId} onChange={ev => setAcctId(ev.target.value)}>
            <option value="">All accounts</option>
            {(accounts || []).map(a => <option key={a.id} value={a.id}>{a.name}{a.kind === 'remote' ? ' (remote)' : a.kind === 'both' ? ' (both)' : ''}</option>)}
          </select>
          {onAddPast && <button className="btn btn-ghost btn-sm" onClick={onAddPast}>Add past work</button>}
          <button className="btn btn-ghost btn-sm" onClick={() => BV().download('ddc-billing-' + BS().iso(new Date(BS().TODAY)) + '.csv', BV().csv(scoped))}>Export CSV</button>
        </div>
      </div>

      <SbCards list={scoped} />
      <SbAgingBar buckets={buckets} total={totalOut} />

      <div className="sb-filters">
        <div className="sc-seg">
          {SB_FILTERS.map(f => <button key={f.id} className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>{f.label}{counts[f.id] ? ` (${counts[f.id]})` : ''}</button>)}
        </div>
        <div className="sc-seg">
          {SB_KINDS.map(k => <button key={k.id} className={kind === k.id ? 'active' : ''} onClick={() => setKind(k.id)}>{k.label}</button>)}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="sc-empty"><div className="eh">Nothing here</div><p>{filter === 'open' ? 'Every invoice is settled.' : filter === 'overdue' ? 'Nothing is past due.' : filter === 'draft' ? 'Everything billable has been invoiced.' : 'Invoices appear once a clinic day is complete or a remote read is finalized.'}</p></div>
      ) : (
        <div className="sb-table">
          <div className="sb-thead"><div>Invoice</div><div>Billed to</div><div>Type</div><div>Covers</div><div>Due</div><div>Total</div><div>Balance</div><div>Status</div><div /></div>
          {rows.map(e => <SbRow key={e.id} e={e} on={on} onOpen={(en) => { setSel(en.id); if (en.kind === 'inperson' && onOpenEntity) onOpenEntity(en); }} />)}
        </div>
      )}

      {selEntity && (
        <div className="sb-drill">
          <div className="sb-drill-h">
            <div>
              <div className="sc-sec-label">{(selEntity.account && selEntity.account.billTo) || 'Invoice'}</div>
              <h3>{BV().title(selEntity)}</h3>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setSel(null)}>Close</button>
          </div>
          <window.InvoicePanel entity={selEntity} role="admin" on={on} />
        </div>
      )}

      <div className="sb-ratecard">
        <div className="rc-head">
          <div className="h">Rate card · one price list, both applications</div>
          {onEditRates && <button className="btn btn-ghost btn-sm" onClick={onEditRates}>Change prices</button>}
        </div>
        <div className="rows">
          {(window.SchedRates ? window.SchedRates.ROWS : []).map(r => (
            <div key={r.id}><span>{r.label}{r.id === 'injection' ? ` — up to ${BV().INJECTION_INCLUDED} sites` : ''}{/remote_(initial|recheck|nonstudent)/.test(r.id) ? ', per bilateral site' : ''}</span><b>{BS().money(BV().RATES[r.id].amount)}</b></div>
          ))}
        </div>
        <div className="n">
          No tax. In-person work is one hospital per day, batched onto a single invoice. Remote reads are batched into a monthly statement per practice. Invoice numbers run in one sequence per account (DDC-BOW-2607-01). Terms Net {BV().TERMS_DAYS} unless an account is set otherwise. A hospital can be given prices of its own — Clinics → edit the hospital → Billing.
          {window.SchedRates && window.SchedRates.current().effectiveFrom && <React.Fragment><br /><br />These prices are in force from {new Date(window.SchedRates.current().effectiveFrom + 'T12:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}{window.SchedRates.current().note ? ' — ' + window.SchedRates.current().note : ''}. Work invoiced before then keeps its original price.</React.Fragment>}
          <br /><br /><b>STAT reads:</b> {BV().STAT_DISCLAIMER}
        </div>
      </div>
    </React.Fragment>
  );
}

/* ---- one account's whole ledger, both kinds --------------- */
function AccountLedger({ account, entities, on, onOpenEntity }) {
  const mine = window.SchedEntities.due(window.SchedEntities.forAccount(entities, account.id))
    .sort((a, b) => BV().entityDate(b) - BV().entityDate(a));
  const bal = mine.reduce((s, e) => s + BV().balance(e), 0);
  const billed = mine.reduce((s, e) => s + BV().total(e), 0);
  const overdue = mine.filter(e => BV().status(e) === 'overdue');
  if (!mine.length) return <div className="sc-empty" style={{ padding: '24px 18px' }}><div style={{ fontStyle: 'italic' }}>Nothing billed to this account yet.</div></div>;
  return (
    <div className="sb-ledger">
      <div className="sb-ledger-sum">
        <div><span className="k">Billed to date</span><b>{BS().money(billed)}</b></div>
        <div><span className="k">Outstanding</span><b className={bal > 0 ? 'due' : ''}>{BS().money(bal)}</b></div>
        {overdue.length > 0 && <div><span className="k">Overdue</span><b className="due">{overdue.length} invoice{overdue.length === 1 ? '' : 's'}</b></div>}
        <div><span className="k">Terms</span><b>Net {account.termsDays || BV().TERMS_DAYS}</b></div>
      </div>
      <div className="sb-table">
        <div className="sb-thead compact"><div>Invoice</div><div>Type</div><div>Covers</div><div>Total</div><div>Balance</div><div>Status</div><div /></div>
        {mine.map(e => {
          const inv = e.invoice, bal2 = BV().balance(e);
          return (
            <div key={e.id} className={`sb-trow compact ${BV().status(e)}`}>
              <div className="num">{inv && inv.number ? inv.number : <span className="muted">— draft —</span>}</div>
              <div><window.SbKindTag kind={e.kind} /></div>
              <div>{BV().title(e).replace(/^(Clinic day|Remote reads) · /, '')}<div className="sub">{BV().count(e)}</div></div>
              <div className="amt">{BS().money(BV().total(e))}</div>
              <div className="amt">{bal2 > 0 ? BS().money(bal2) : <span className="muted">—</span>}</div>
              <div><window.SbStatusPill entity={e} /></div>
              <div className="acts">
                {(!inv || !inv.issued) && <button className="btn btn-clay btn-sm" onClick={() => on.issueInvoice(e)}>Issue</button>}
                {inv && inv.issued && bal2 > 0 && !inv.writtenOff && <button className="btn btn-ghost btn-sm" onClick={() => on.openPayment(e)}>Payment</button>}
                {inv && inv.issued && <button className="btn btn-ghost btn-sm" onClick={() => { const w = window.open('', '_blank', 'width=880,height=1040'); if (w) { w.document.write(BS().buildInvoiceHTML(e)); w.document.close(); } }}>View</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---- everything ever billed for one animal --------------- */
function PatientBillingHistory({ name, entities }) {
  const hits = window.SchedEntities.forPatient(entities, name);
  if (!hits.length) return <div className="sb-pat-empty">Nothing billed for {name} yet.</div>;
  const total = hits.reduce((s, h) => s + h.lines.reduce((x, l) => x + l.amount, 0), 0);
  return (
    <div className="sb-pat-hist">
      <div className="sb-pat-head"><span className="sc-sec-label">Billing history · {name}</span><span className="tot">{BS().money(total)} across {hits.length} visit{hits.length === 1 ? '' : 's'}</span></div>
      {hits.map((h, i) => (
        <div key={i} className="sb-pat-visit">
          <div className="hd">
            <span><window.SbKindTag kind={h.entity.kind} /> {BV().title(h.entity)}</span>
            <span className="r">{h.entity.invoice && h.entity.invoice.number ? h.entity.invoice.number : 'not invoiced'} · <window.SbStatusPill entity={h.entity} /></span>
          </div>
          {h.lines.map((l, j) => (
            <div key={j} className="ln"><span>{l.label}{l.detail ? ' · ' + l.detail : ''}</span><b>{BS().money(l.amount)}</b></div>
          ))}
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { BillingView, SbAgingBar, AccountLedger, PatientBillingHistory });
