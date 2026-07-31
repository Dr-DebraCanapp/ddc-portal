/* global React, window */
/* ============================================================
   Portal (referring vet) — their own statements
   Remote reads are batched into one statement per month, so a vet
   sees the statement a case belongs to, plus their whole billing
   history and every payment recorded against it.
   Loads AFTER billing-accounts.jsx / schedule-billing.jsx /
   billing-entities.jsx on portal.html (index.html when deployed).
   ============================================================ */
const PB_B = () => window.SchedBill;
const PB_S = () => window.SCHED;

/* Statements belonging to this vet's practice. */
function pbMine(cases, practice, stmts) {
  if (!window.SchedEntities) return [];
  const { entities } = window.SchedEntities.all([], cases || [], stmts || {});
  const key = String(practice || '').trim().toLowerCase();
  return entities
    .filter(e => e.kind === 'remote' && String((e.account && e.account.name) || '').trim().toLowerCase() === key)
    .sort((a, b) => PB_B().entityDate(b) - PB_B().entityDate(a));
}

/* ---- the statement one case sits on ----------------------- */
function PortalCaseBilling({ c, statements }) {
  const B = PB_B();
  const stmt = (statements || []).find(s => (s.reads || []).some(r => r.caseId === c.id));
  if (!stmt) return null;
  const read = (stmt.reads || []).find(r => r.caseId === c.id);
  const myLines = B.readLines(read);
  const mine = myLines.reduce((s, l) => s + l.amount, 0);
  const issued = stmt.invoice && stmt.invoice.issued;
  const bal = B.balance(stmt);
  return (
    <div className="portal-invoice">
      <div className="pi-top">
        <div>
          <div className="pi-eyebrow">Billing</div>
          <div className="pi-num">{issued ? stmt.invoice.number : 'On your next statement'}</div>
        </div>
        <span className={`pi-pill ${!issued ? 'unpaid' : bal <= 0 ? 'paid' : 'unpaid'}`}>{!issued ? 'Not yet billed' : bal <= 0 ? '✓ Paid' : 'Due'}</span>
      </div>
      <div className="pi-lines">
        {myLines.map((l, i) => (
          <div key={i} className="pi-line"><span>{l.label}{l.detail ? ' · ' + l.detail : ''}</span><span>{PB_S().money(l.amount)}</span></div>
        ))}
        <div className="pi-line total"><span>This read</span><span>{PB_S().money(mine)}</span></div>
      </div>
      <p className="pi-note">
        Included in <strong>{B.title(stmt)}</strong> — {B.count(stmt)}, {PB_S().money(B.total(stmt))} total.
        {issued ? (bal > 0 ? ` ${PB_S().money(bal)} outstanding, due ${B.due(stmt).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}.` : ' Paid in full — thank you.') : ' Reads are billed together once a month.'}
      </p>
      {issued && (
        <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }}
          onClick={() => { const w = window.open('', '_blank', 'width=880,height=1040'); if (w) { w.document.write(PB_S().buildInvoiceHTML(stmt)); w.document.close(); } }}>
          View / download statement
        </button>
      )}
    </div>
  );
}

/* ---- the practice's whole billing history ----------------- */
function PortalBillingHistory({ statements }) {
  const B = PB_B();
  const list = statements || [];
  if (!list.length) return null;
  const outstanding = list.reduce((s, e) => s + B.balance(e), 0);
  const paid = list.reduce((s, e) => s + B.paid(e.invoice, e), 0);
  return (
    <section className="pb-hist">
      <div className="pb-hist-head">
        <div>
          <div className="pi-eyebrow">Billing</div>
          <h3>Statements &amp; payments</h3>
          <p>Your reads are batched into one statement a month. Everything you have been billed, and everything received.</p>
        </div>
        <div className="pb-hist-sum">
          <div><span className="k">Outstanding</span><b className={outstanding > 0 ? 'due' : ''}>{PB_S().money(outstanding)}</b></div>
          <div><span className="k">Paid to date</span><b>{PB_S().money(paid)}</b></div>
        </div>
      </div>

      {list.map(e => {
        const inv = e.invoice, issued = inv && inv.issued;
        const bal = B.balance(e);
        return (
          <div key={e.id} className={`pb-stmt ${!issued ? 'draft' : bal > 0 ? 'due' : 'paid'}`}>
            <div className="pb-stmt-top">
              <div>
                <div className="num">{issued ? inv.number : 'Not yet billed'}</div>
                <div className="per">{B.title(e)} · {B.count(e)}</div>
              </div>
              <div className="right">
                <div className="amt">{PB_S().money(B.total(e))}</div>
                {issued && <div className="sub">{bal > 0 ? PB_S().money(bal) + ' outstanding · due ' + B.due(e).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Paid in full'}</div>}
              </div>
            </div>

            <div className="pb-reads">
              {(e.reads || []).map(r => (
                <div key={r.caseId} className="pb-read"><span>{r.patient} <em>{r.caseId}</em></span><b>{PB_S().money(B.readTotal(r))}</b></div>
              ))}
            </div>

            {((inv && inv.payments) || []).length > 0 && (
              <div className="pb-pays">
                {inv.payments.map(p => (
                  <div key={p.id} className="pb-pay">
                    <span>{B.method(p.method).label}{p.ref ? ' · ' + p.ref : ''}</span>
                    <span className="d">{new Date(p.date + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <b>{PB_S().money(p.amount)}</b>
                  </div>
                ))}
              </div>
            )}

            {issued && (
              <div className="pb-stmt-acts">
                <button className="btn btn-ghost btn-sm" onClick={() => { const w = window.open('', '_blank', 'width=880,height=1040'); if (w) { w.document.write(PB_S().buildInvoiceHTML(e)); w.document.close(); } }}>View statement</button>
                {bal <= 0 && <button className="btn btn-ghost btn-sm" onClick={() => { const w = window.open('', '_blank', 'width=880,height=1040'); if (w) { w.document.write(PB_S().buildReceiptHTML(e)); w.document.close(); } }}>Receipt</button>}
              </div>
            )}
          </div>
        );
      })}
      {outstanding > 0 && (() => {
        const owing = list.filter(e => B.balance(e) > 0);
        const pay = B.payLines(owing[0] || list[0], { inPortal: true, accountWide: owing.length > 1 });
        return (
          <div className="pb-how">
            <div className="pi-eyebrow">How to pay</div>
            <ol>{pay.map((l, i) => <li key={i}>{l}</li>)}</ol>
          </div>
        );
      })()}
      <p className="pb-foot">Questions about a statement? Reply to the email it came with, or write to info@DrDebraCanapp.com.</p>
    </section>
  );
}

Object.assign(window, { pbMine, PortalCaseBilling, PortalBillingHistory });
