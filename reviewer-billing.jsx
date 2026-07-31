/* global React, window */
/* ============================================================
   Reviewer console — remote-read billing on the unified system
   Replaces the old per-case invoice with two things:
     • at finalize, pick the read rate (what this read costs)
     • on the case, show the monthly statement it belongs to
   Nothing is invoiced per case any more: reads accumulate into one
   statement per practice per month, which is where money is taken.
   Loads AFTER billing-accounts.jsx, schedule-billing.jsx and
   billing-entities.jsx on reviewer.html.
   ============================================================ */
const RB_B = () => window.SchedBill;
const RB_S = () => window.SCHED;

/* ---- rate picker shown when a report is finalized ---------- */
function ReadRateModal({ c, onConfirm, onCancel, busy }) {
  const B = RB_B();
  const sites = (c.sites && c.sites.length) ? c.sites : [];
  const [service, setService] = useState(c.visitType === 'recheck' ? 'remote_recheck' : 'remote_initial');
  const [rush, setRush] = useState(!!c.rush);
  const rate = B.RATES[service];
  const perSite = service !== 'remote_unreadable';
  const n = perSite ? Math.max(1, sites.length) : 1;
  const total = rate.amount * n + (rush ? B.RATES.rush.amount : 0);

  return (
    <div className="rv-modal-overlay" onClick={onCancel}>
      <div className="rv-invoice-modal" onClick={ev => ev.stopPropagation()}>
        <div className="rv-section-eyebrow">Finalize &amp; bill</div>
        <h3 className="rv-modal-h">What does this read cost?</h3>
        <p className="rv-modal-sub">
          This read joins <strong>{(c.referringClinic || c.referring_clinic || 'the practice')}</strong>’s statement for
          {' '}{RB_S().MONTHS[new Date().getMonth()]} {new Date().getFullYear()} — one invoice a month, not one per case.
        </p>

        <div className="rb-rates">
          {B.REMOTE_SERVICES.map(id => {
            const r = B.RATES[id];
            return (
              <label key={id} className={`rb-rate ${service === id ? 'on' : ''}`}>
                <input type="radio" name="svc" checked={service === id} onChange={() => setService(id)} />
                <span className="l">{r.label.replace('Remote read — ', '')}</span>
                <span className="a">{RB_S().money(r.amount)}{id !== 'remote_unreadable' ? ' / site' : ''}</span>
              </label>
            );
          })}
        </div>

        <div className="rb-sites">
          {perSite
            ? <React.Fragment><b>{n} bilateral {n === 1 ? 'region' : 'regions'}</b>{sites.length ? ' — ' + sites.join(' · ') : ' — none recorded on the case, billing one region'}</React.Fragment>
            : <React.Fragment><b>Return fee</b> — the study could not be read; billed once, not per region.</React.Fragment>}
        </div>

        <label className="sc-rush" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={rush} onChange={ev => setRush(ev.target.checked)} />
          <span><b>STAT read — {RB_S().money(B.RATES.rush.amount)}</b><br />{c.rush ? 'The referring vet requested this when they submitted.' : 'Expedited at the vet’s or owner’s request.'}<span className="sc-rush-note">24-hour guaranteed turnaround from receipt of a readable study. Only bill this if the request was acknowledged with the practice.</span></span>
        </label>

        <div className="rb-total"><span>This read</span><b>{RB_S().money(total)}</b></div>

        <div className="rv-modal-actions">
          <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="btn btn-clay" onClick={() => onConfirm({ billService: service, rush, billedAmount: total })} disabled={busy}>
            {busy ? 'Delivering…' : <React.Fragment>Finalize &amp; deliver <span className="arrow">→</span></React.Fragment>}
          </button>
        </div>
        <p className="rv-inv-foot">Delivering finalizes the report (no further edits) and adds this read to the practice’s monthly statement. Nothing is sent to them until you issue that statement from Billing.</p>
      </div>
    </div>
  );
}

/* ---- the statement this read belongs to, shown on the case -- */
function CaseBillingBlock({ c, entities, on, role }) {
  const B = RB_B();
  const read = window.SchedEntities.readFromCase(c);
  if (!read.finalizedAt) return null;
  const lines = B.readLines(read);
  const thisRead = lines.reduce((s, l) => s + l.amount, 0);
  const stmt = (entities || []).find(e => e.kind === 'remote' && (e.reads || []).some(r => r.caseId === c.id));

  return (
    <div className="rv-invoice-block">
      <div className="rv-invoice-top">
        <div>
          <div className="rv-section-eyebrow">Billing</div>
          <div className="rv-invoice-num">{stmt && stmt.invoice && stmt.invoice.number ? stmt.invoice.number : 'On the next statement'}</div>
        </div>
        {stmt ? <window.SbStatusPill entity={stmt} /> : <span className="sb-pill draft">Not invoiced</span>}
      </div>

      <div className="rv-invoice-lines">
        {lines.map((l, i) => (
          <div key={i} className="rv-invoice-line">
            <span className="ln">{l.label}{l.detail ? ' · ' + l.detail : ''}</span>
            <span className="amt">{RB_S().money(l.amount)}</span>
          </div>
        ))}
        <div className="rv-invoice-line total"><span className="ln">This read</span><span className="amt">{RB_S().money(thisRead)}</span></div>
      </div>

      {stmt && (
        <div className="rb-stmt-note">
          Part of <strong>{B.title(stmt)}</strong> for {(stmt.account && stmt.account.name) || 'this practice'} — {B.count(stmt)}, {RB_S().money(B.total(stmt))} total
          {B.balance(stmt) > 0 ? `, ${RB_S().money(B.balance(stmt))} outstanding` : ', paid in full'}.
        </div>
      )}

      {role === 'admin' && stmt && (
        <div className="rv-invoice-actions">
          {(!stmt.invoice || !stmt.invoice.issued)
            ? <button className="btn btn-clay btn-sm" onClick={() => on.issueInvoice(stmt)}>Issue this month’s statement</button>
            : <React.Fragment>
                <button className="btn btn-ghost btn-sm" onClick={() => { const w = window.open('', '_blank', 'width=880,height=1040'); if (w) { w.document.write(RB_S().buildInvoiceHTML(stmt)); w.document.close(); } }}>View statement</button>
                {B.balance(stmt) > 0 && <button className="btn btn-clay btn-sm" onClick={() => on.openPayment(stmt)}>Record payment</button>}
              </React.Fragment>}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { ReadRateModal, CaseBillingBlock });
