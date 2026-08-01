/* global React, window */
/* ============================================================
   Fee schedule — what a referring practice pays for a remote read.
   Reads the live rate card (sched_rates via SchedRates), so when the
   price list changes in the console this page changes with it. No
   second copy of the numbers to keep in step.
   Loads AFTER schedule-billing.jsx + schedule-rates.jsx.
   ============================================================ */
const { useState: pfUseState, useEffect: pfUseEffect } = React;

const PF_ROWS = [
  { id: 'remote_initial', label: 'Remote read — initial', note: 'Per bilateral region. A first study of that region.' },
  { id: 'remote_recheck', label: 'Remote read — recheck', note: 'Per bilateral region, within the recheck window below.' },
  { id: 'remote_nonstudent', label: 'Remote read — non-student', note: 'Per bilateral region.' },
  { id: 'rush', label: 'STAT read', note: 'Added to the read fee. 24-hour guaranteed turnaround.' },
  { id: 'remote_unreadable', label: 'Unreadable study — return fee', note: 'Charged once, where a study cannot be read.' },
];

function pfAmount(id) {
  const B = window.SchedBill;
  return (B && B.RATES[id] && B.RATES[id].amount) || 0;
}

function PortalFeesView({ onBack, session }) {
  const [, force] = pfUseState(0);
  pfUseEffect(() => {
    let alive = true;
    (async () => {
      if (window.SchedRates && window.SchedRates.load) {
        try { await window.SchedRates.load(); } catch (e) {}
        if (alive) force(n => n + 1);
      }
    })();
    return () => { alive = false; };
  }, []);

  const S = window.SCHED;
  const B = window.SchedBill;
  const card = (B && B.ACTIVE_CARD) || null;
  const effective = card && card.effectiveFrom
    ? new Date(card.effectiveFrom).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
    : null;
  const recheckMonths = (B && B.CFG && B.CFG.recheckMonths) || 6;
  const terms = (B && B.CFG && B.CFG.termsDays) || 15;
  const money = (n) => (S ? S.money(n) : '$' + n);

  const print = () => {
    const w = window.open('', '_blank', 'width=820,height=1040');
    if (!w) return;
    w.document.write(pfSheetHTML({ rows: PF_ROWS, effective, recheckMonths, terms, practice: session && session.clinic }));
    w.document.close();
  };

  return (
    <main className="app-main">
      <div className="pf-head">
        <div>
          <button onClick={onBack} className="pf-back">← Dashboard</button>
          <div className="eb">§ Fee schedule</div>
          <h1 className="pf-h">Remote reads — what a read costs.</h1>
          <p className="pf-sub">
            Current prices, straight from our billing system. Reads are billed per bilateral region —
            both shoulders is one region, both stifles is another. Nothing is charged until a report
            is delivered.
          </p>
        </div>
        <button className="btn btn-clay" onClick={print}>Print / save as PDF</button>
      </div>

      <div className="pf-table">
        {PF_ROWS.map(r => (
          <div key={r.id} className="pf-row">
            <div className="l"><div className="nm">{r.label}</div><div className="nt">{r.note}</div></div>
            <div className="a">{money(pfAmount(r.id))}</div>
          </div>
        ))}
      </div>

      <div className="pf-notes">
        <div className="pf-note">
          <div className="k">Recheck window</div>
          <p>A repeat study of the same region within <strong>{recheckMonths} months</strong> bills at the
          recheck rate. Past that it is an initial read.</p>
        </div>
        <div className="pf-note">
          <div className="k">Turnaround</div>
          <p>A written report is typically returned in <strong>5–7 business days</strong>. A STAT read is
          guaranteed within <strong>24 hours</strong> of our receiving a readable study.</p>
        </div>
        <div className="pf-note">
          <div className="k">Billing</div>
          <p>Reads are batched into <strong>one statement per month</strong> for your practice, payable
          <strong> Net {terms}</strong>. Every statement and payment is in your billing history here.</p>
        </div>
        <div className="pf-note">
          <div className="k">No tax</div>
          <p>Prices are flat, with no tax applied. In-person clinic days are quoted separately.</p>
        </div>
      </div>

      <div className="pf-stat">
        <div className="k">STAT reads</div>
        <p>{(B && B.STAT_DISCLAIMER) || ''}</p>
      </div>

      <p className="pf-foot">
        {effective ? <>These prices took effect {effective}.</> : <>These are our current prices.</>}{' '}
        This page always shows what is in force today — worth a look before you quote a client.
        Questions about a charge: <a href="mailto:info@drdebracanapp.com">info@drdebracanapp.com</a>.
      </p>
    </main>
  );
}

/* A printable one-pager of the same numbers. */
function pfSheetHTML({ rows, effective, recheckMonths, terms, practice }) {
  const S = window.SCHED, B = window.SchedBill;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const money = (n) => (S ? S.money(n) : '$' + n);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Remote read fee schedule — Dr. Debra Canapp</title>
<style>
@page{margin:18mm}
body{font-family:Georgia,'Times New Roman',serif;color:#1c1a17;margin:0;padding:28px;line-height:1.5}
.eb{font-family:system-ui,-apple-system,sans-serif;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#b16a48;font-weight:600}
h1{font-size:30px;margin:8px 0 6px;letter-spacing:-.01em}
.lede{font-size:13.5px;color:#54504a;margin:0 0 22px;max-width:36em}
table{width:100%;border-collapse:collapse;margin-bottom:22px}
th{font-family:system-ui,-apple-system,sans-serif;font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#7a746c;text-align:left;border-bottom:1px solid #1c1a17;padding:0 0 7px}
th.r,td.r{text-align:right}
td{padding:11px 0;border-bottom:1px solid #e3ddd2;font-size:14px;vertical-align:top}
td .nt{font-size:11.5px;color:#7a746c;margin-top:3px}
td.r{font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:600}
.notes{display:grid;grid-template-columns:1fr 1fr;gap:14px 26px;margin-bottom:20px}
.notes .k{font-family:system-ui,-apple-system,sans-serif;font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#7a746c;font-weight:600;margin-bottom:3px}
.notes p{margin:0;font-size:12.5px;color:#34302b}
.stat{border:1px solid #b16a48;padding:12px 14px;font-size:12px;color:#34302b;margin-bottom:18px}
.stat .k{font-family:system-ui,-apple-system,sans-serif;font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#b16a48;font-weight:600;margin-bottom:4px}
footer{border-top:1px solid #e3ddd2;padding-top:12px;font-size:11px;color:#7a746c}
</style></head><body>
<div class="eb">Dr. Debra Canapp, DVM, DACVSMR · Remote reads</div>
<h1>Fee schedule</h1>
<p class="lede">${practice ? esc(practice) + ' · ' : ''}Reads are billed per bilateral region — both shoulders is one region, both stifles is another. No tax. Nothing is charged until a report is delivered.</p>
<table><thead><tr><th>Service</th><th class="r">Fee</th></tr></thead><tbody>
${rows.map(r => `<tr><td>${esc(r.label)}<div class="nt">${esc(r.note)}</div></td><td class="r">${money(pfAmount(r.id))}</td></tr>`).join('')}
</tbody></table>
<div class="notes">
  <div><div class="k">Recheck window</div><p>A repeat study of the same region within ${recheckMonths} months bills at the recheck rate.</p></div>
  <div><div class="k">Turnaround</div><p>Typically 5–7 business days. STAT reads are guaranteed within 24 hours of a readable study.</p></div>
  <div><div class="k">Billing</div><p>One statement per month for the practice, payable Net ${terms}.</p></div>
  <div><div class="k">In-person</div><p>Traveling clinic days are quoted separately.</p></div>
</div>
<div class="stat"><div class="k">STAT reads</div>${esc((B && B.STAT_DISCLAIMER) || '')}</div>
<footer>${effective ? 'These prices took effect ' + esc(effective) + '. ' : ''}Prices current as of ${new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })} and subject to change. The live schedule is always in the referral portal. · info@DrDebraCanapp.com</footer>
</body></html>`;
}

Object.assign(window, { PortalFeesView, pfSheetHTML });
