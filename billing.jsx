/* global window */
/* ============================================================
   Billing — shared price list + printable Report & Invoice HTML.
   Loaded by BOTH reviewer.html and portal.html so the reviewer can
   generate them and the referring vet can view/download them.
   Exposes: window.SERVICES, window.makeInvoiceNumber,
            window.buildInvoiceHTML, window.buildReportHTML
   ============================================================ */
(function () {
  // Dr. Canapp's price list (from the practice). Each read covers one
  // bilateral site (left + right of the region).
  window.SERVICES = [
    { id: 'initial',    label: 'MSK Ultrasound Remote Read — Initial',     note: '1 bilateral site',  amount: 350 },
    { id: 'recheck',    label: 'MSK Ultrasound Remote Read — Recheck',     note: '1 bilateral site',  amount: 300 },
    { id: 'nonstudent', label: 'MSK Ultrasound Remote Read — Non-student', note: '1 bilateral site',  amount: 500 },
    { id: 'unreadable', label: 'MSK Ultrasound Remote Read — Unreadable',  note: 'Return fee',        amount: 100 },
  ];

  window.PRACTICE = {
    name: 'Dr. Debra Canapp',
    tagline: 'Veterinary Sports Medicine — Diagnostic MSK Ultrasound',
    email: 'info@DrDebraCanapp.com',
    terms: 'Payment due upon receipt.',
  };

  // Payment options printed on every invoice. Fill these in from config.js
  // (window.PORTAL_CONFIG.payments) once the practice has a Stripe/PayPal link
  // and a check-mailing address. Anything left blank is simply omitted.
  const _pcfg = (window.PORTAL_CONFIG && window.PORTAL_CONFIG.payments) || {};
  window.PAYMENTS = {
    // Full integration: Cloudflare Worker endpoint that builds a pre-filled
    // Stripe Checkout Session per invoice. When set, the “Pay online” button
    // links to `${payEndpoint}/pay?case=<caseId>` and the amount is pre-filled.
    payEndpoint:   _pcfg.payEndpoint   || '',
    // Fallback: a static hosted payment link (Stripe Payment Link, PayPal.me).
    // Used only if payEndpoint is blank. Vet types the amount.
    payOnlineUrl:  _pcfg.payOnlineUrl  || '',
    payOnlineName: _pcfg.payOnlineName || 'Pay online by card',
    // Check instructions.
    checkPayableTo: _pcfg.checkPayableTo || 'Dr. Debra Canapp',
    checkMailTo:    _pcfg.checkMailTo    || '', // full mailing address, blank = hidden
  };

  window.money = function (n) {
    return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Derive a stable invoice number from the case id (CASE-2026-0143 → INV-2026-0143)
  window.makeInvoiceNumber = function (c) {
    const m = String((c && c.id) || '').match(/(\d{4})\D*(\d+)\s*$/);
    if (m) return 'INV-' + m[1] + '-' + m[2].padStart(4, '0');
    const d = new Date();
    return 'INV-' + d.getFullYear() + '-' + String(Math.floor(Math.random() * 9000) + 1000);
  };

  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const para = (s) => esc(s).split(/\n\n+/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');

  // Payment-methods block for the printable invoice. Renders an online-pay
  // card (only if a link is configured) and a pay-by-check card side by side.
  function payMethodsHTML(inv, total, c) {
    const pay = window.PAYMENTS || {};
    const amt = window.money(total);
    let onlineCard = '';
    // Preferred: full integration — link to the Worker, which pre-fills the
    // exact amount and auto-marks the invoice paid on success.
    if (pay.payEndpoint && c && c.id) {
      const base = pay.payEndpoint.replace(/\/+$/, '');
      const href = `${base}/pay?case=${encodeURIComponent(c.id)}`;
      onlineCard = `<div class="pay-method">
        <h5>Pay online</h5>
        <p>Pay ${esc(amt)} securely by card — the amount is filled in for you.</p>
        <a class="pay-btn" href="${esc(href)}" target="_blank" rel="noopener">${esc(pay.payOnlineName || 'Pay online by card')} →</a>
      </div>`;
    } else if (pay.payOnlineUrl) {
      // Fallback: static payment link (vet types the amount).
      const sep = pay.payOnlineUrl.indexOf('?') >= 0 ? '&' : '?';
      const href = pay.payOnlineUrl + sep + 'client_reference_id=' + encodeURIComponent(inv.number || '');
      onlineCard = `<div class="pay-method">
        <h5>Pay online</h5>
        <p>Fast, secure card payment for ${esc(amt)}.</p>
        <a class="pay-btn" href="${esc(href)}" target="_blank" rel="noopener">${esc(pay.payOnlineName || 'Pay online by card')} →</a>
        <div class="pay-online-line">${esc(pay.payOnlineUrl)}</div>
      </div>`;
    }
    const checkCard = `<div class="pay-method">
      <h5>Pay by check</h5>
      <p>Make checks payable to <strong>${esc(pay.checkPayableTo || window.PRACTICE.name)}</strong>.${
        pay.checkMailTo ? `<br>Mail to:<br>${esc(pay.checkMailTo).replace(/\n/g, '<br>')}` : ''
      }<br>Reference invoice ${esc(inv.number || '')}.</p>
    </div>`;
    return `<div class="pay-methods">${onlineCard}${checkCard}</div>
      <div style="margin-top:14px;font-size:11px;color:#777;">Questions about this invoice? ${esc(window.PRACTICE.email)}</div>`;
  }

  /* ---------------- INVOICE ---------------- */
  window.buildInvoiceHTML = function (c, invoice) {
    const inv = invoice || c.invoice || {};
    const lines = inv.lines || [];
    const total = inv.total != null ? inv.total : lines.reduce((s, l) => s + Number(l.amount || 0), 0);
    const issued = inv.issuedAt ? new Date(inv.issuedAt) : new Date();
    const paid = inv.status === 'paid';
    const P = window.PRACTICE;
    const rows = lines.map(l => `
      <tr>
        <td>
          <div class="li-label">${esc(l.label)}</div>
          ${l.site ? `<div class="li-site">${esc(l.site)}</div>` : ''}
        </td>
        <td class="li-note">${esc(l.note || '')}</td>
        <td class="li-amt">${window.money(l.amount)}</td>
      </tr>`).join('');

    return `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(inv.number || 'Invoice')} · ${esc(c.patient || '')}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  @page { size: letter; margin: 0.85in; }
  * { box-sizing: border-box; }
  body { font-family: 'Inter', sans-serif; color: #1f1f1f; max-width: 7in; margin: 0 auto; padding: 40px 28px; line-height: 1.55; font-size: 13px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1f1f1f; padding-bottom: 20px; margin-bottom: 26px; }
  .brand { font-family: 'Cormorant Garamond', serif; font-size: 25px; letter-spacing: -0.01em; line-height: 1.05; }
  .brand .sub { font-family: 'Inter', sans-serif; font-size: 9.5px; letter-spacing: 0.16em; text-transform: uppercase; color: #888; margin-top: 6px; font-weight: 500; }
  .brand .em { font-size: 11px; color: #555; margin-top: 8px; }
  .inv-meta { text-align: right; }
  .inv-meta .word { font-family: 'Cormorant Garamond', serif; font-size: 30px; letter-spacing: 0.04em; }
  .inv-meta .num { font-size: 11px; letter-spacing: 0.14em; color: #b16a48; font-weight: 600; margin-top: 4px; }
  .inv-meta .date { font-size: 11px; color: #555; margin-top: 6px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 26px; }
  .parties h4 { font-size: 9.5px; letter-spacing: 0.2em; text-transform: uppercase; color: #888; margin: 0 0 6px; font-weight: 600; }
  .parties p { margin: 0; font-size: 13px; line-height: 1.5; }
  .patient-ref { font-size: 11px; color: #555; margin-bottom: 18px; padding: 10px 0; border-top: 1px solid #e6e1d6; border-bottom: 1px solid #e6e1d6; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
  thead th { text-align: left; font-size: 9.5px; letter-spacing: 0.16em; text-transform: uppercase; color: #888; font-weight: 600; border-bottom: 1.5px solid #1f1f1f; padding: 0 0 8px; }
  thead th:last-child { text-align: right; }
  tbody td { padding: 12px 0; border-bottom: 1px solid #e6e1d6; vertical-align: top; }
  .li-label { font-weight: 500; }
  .li-site { font-size: 11px; color: #b16a48; margin-top: 3px; letter-spacing: 0.02em; }
  .li-note { font-size: 11.5px; color: #777; }
  .li-amt { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .totals { display: flex; justify-content: flex-end; }
  .totals table { width: 280px; }
  .totals td { border: none; padding: 4px 0; }
  .totals .grand td { border-top: 1.5px solid #1f1f1f; padding-top: 10px; font-family: 'Cormorant Garamond', serif; font-size: 22px; }
  .totals .grand td:last-child { text-align: right; }
  .pay { margin-top: 30px; padding-top: 18px; border-top: 1px solid #e6e1d6; font-size: 12px; color: #444; }
  .pay strong { color: #1f1f1f; }
  .pay-methods { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 16px; }
  .pay-method { padding: 14px 16px; border: 1px solid #e6e1d6; border-radius: 3px; background: #fbf9f4; }
  .pay-method h5 { margin: 0 0 6px; font-size: 9.5px; letter-spacing: 0.16em; text-transform: uppercase; color: #888; font-weight: 600; }
  .pay-method p { margin: 0; font-size: 12px; line-height: 1.5; }
  .pay-btn { display: inline-block; margin-top: 4px; padding: 9px 18px; background: #b16a48; color: #fff !important; text-decoration: none; font-size: 12px; font-weight: 600; letter-spacing: 0.03em; border-radius: 3px; }
  .pay-online-line { margin-top: 3px; font-size: 11px; color: #777; word-break: break-all; }
  @media (max-width: 520px) { .pay-methods { grid-template-columns: 1fr; } }
  @media print { .pay-btn { border: 1.5px solid #b16a48; color: #b16a48 !important; background: #fff; } }
  .stamp { display: inline-block; margin-top: 10px; padding: 4px 12px; border: 2px solid #1f8a5b; color: #1f8a5b; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 600; transform: rotate(-3deg); }
  footer { margin-top: 28px; font-size: 10.5px; color: #999; line-height: 1.6; }
  @media print { .noprint { display: none; } }
  .noprint { text-align: center; margin-bottom: 18px; }
  .noprint button { font: inherit; padding: 9px 18px; background: #1f1f1f; color: #fff; border: none; cursor: pointer; letter-spacing: 0.04em; }
</style></head><body>
<div class="noprint"><button onclick="window.print()">Print / Save as PDF</button></div>
<div class="top">
  <div class="brand">${esc(P.name)}<div class="sub">${esc(P.tagline)}</div><div class="em">${esc(P.email)}</div></div>
  <div class="inv-meta">
    <div class="word">Invoice</div>
    <div class="num">${esc(inv.number || '')}</div>
    <div class="date">${issued.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</div>
    ${paid ? '<div class="stamp">Paid</div>' : ''}
  </div>
</div>
<div class="parties">
  <div><h4>Billed to</h4><p>${esc(c.referringVet || '—')}<br>${esc(c.referringClinic || '')}<br>${esc(c.referringEmail || '')}</p></div>
  <div><h4>From</h4><p>${esc(P.name)}<br>${esc(P.email)}</p></div>
</div>
<div class="patient-ref">Re: <strong>${esc(c.patient || '—')}</strong> &nbsp;·&nbsp; ${esc(c.species || '')} ${c.breed ? '· ' + esc(c.breed) : ''} &nbsp;·&nbsp; Case ${esc(c.id || '')}</div>
<table>
  <thead><tr><th>Service</th><th>Detail</th><th>Amount</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="3" style="color:#999">No line items.</td></tr>'}</tbody>
</table>
<div class="totals"><table>
  <tr class="grand"><td>Total due</td><td>${window.money(total)}</td></tr>
</table></div>
<div class="pay">
  <strong>${esc(P.terms)}</strong> &nbsp;Please reference invoice ${esc(inv.number || '')} with payment.
  ${payMethodsHTML(inv, total, c)}
</div>
<footer>
  This invoice covers remote second-opinion diagnostic interpretation of musculoskeletal ultrasound and associated imaging for the patient named above. Each read covers one bilateral anatomical site unless otherwise noted.
</footer>
</body></html>`;
  };

  /* ---------------- REPORT ---------------- */
  window.buildReportHTML = function (c, r) {
    const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    const sites = (c.sites && c.sites.length) ? c.sites.join(' · ') : '';
    const figs = (c.reportFigures || []);
    const figuresHTML = figs.length ? `<section class="figures"><h2>Annotated Images</h2><div class="fig-grid">${figs.map((f, i) => `<figure class="fig"><img src="${f.dataUrl}" alt="Figure ${i + 1}"/><figcaption><span class="fig-n">Figure ${i + 1}</span>${f.caption ? ' — ' + esc(f.caption) : ''}</figcaption></figure>`).join('')}</div></section>` : '';
    return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(c.id)} · ${esc(c.patient)} — Diagnostic Report</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  @page { size: letter; margin: 0.85in 0.85in 1in; }
  body { font-family: 'Inter', sans-serif; color: #1f1f1f; max-width: 7in; margin: 0 auto; padding: 36px 24px; line-height: 1.55; font-size: 13px; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1f1f1f; padding-bottom: 18px; margin-bottom: 28px; }
  header .brand { font-family: 'Cormorant Garamond', serif; font-size: 24px; letter-spacing: -0.01em; }
  header .brand .sub { font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #888; margin-top: 4px; font-weight: 500; }
  header .meta { text-align: right; font-size: 11px; color: #555; }
  h1 { font-family: 'Cormorant Garamond', serif; font-size: 30px; letter-spacing: -0.015em; margin: 0 0 6px; line-height: 1.1; }
  .sig { font-size: 12px; color: #555; }
  .pid { font-size: 9.5px; letter-spacing: 0.2em; text-transform: uppercase; color: #b16a48; font-weight: 500; margin-top: 16px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 28px 0; padding: 16px 0; border-top: 1px solid #ddd; border-bottom: 1px solid #ddd; }
  .grid h4 { font-size: 9.5px; letter-spacing: 0.2em; text-transform: uppercase; color: #888; margin: 0 0 4px; font-weight: 500; }
  .grid div p { margin: 0; font-size: 13px; }
  h2 { font-family: 'Cormorant Garamond', serif; font-size: 20px; margin: 28px 0 8px; letter-spacing: -0.01em; }
  section p { margin: 0 0 12px; }
  .draft-stamp { position: fixed; top: 40%; left: 0; right: 0; text-align: center; font-family: 'Cormorant Garamond', serif; font-size: 120px; color: rgba(177,106,72,0.10); transform: rotate(-18deg); pointer-events: none; letter-spacing: 0.2em; font-style: italic; }
  footer { margin-top: 40px; padding-top: 18px; border-top: 1px solid #ddd; font-size: 10.5px; color: #888; line-height: 1.6; }
  .sigblock { margin-top: 36px; padding-top: 24px; border-top: 1px solid #1f1f1f; }
  .sigblock .name { font-family: 'Cormorant Garamond', serif; font-size: 19px; }
  .sigblock .role { font-size: 10.5px; letter-spacing: 0.16em; text-transform: uppercase; color: #888; margin-top: 6px; font-weight: 500; }
  .figures { margin-top: 28px; }
  .fig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 4px; }
  .fig { margin: 0; break-inside: avoid; }
  .fig img { width: 100%; height: auto; display: block; background: #000; border: 1px solid #ddd; border-radius: 2px; }
  .fig figcaption { font-size: 11px; color: #555; margin-top: 6px; line-height: 1.45; }
  .fig figcaption .fig-n { color: #b16a48; font-weight: 600; letter-spacing: 0.02em; }
  @media print { .fig { page-break-inside: avoid; } }
  @media print { .draft-stamp { color: rgba(177,106,72,0.18); } .noprint { display:none; } }
  .noprint { text-align: center; margin-bottom: 18px; }
  .noprint button { font: inherit; padding: 9px 18px; background: #1f1f1f; color: #fff; border: none; cursor: pointer; letter-spacing: 0.04em; }
</style></head><body>
<div class="noprint"><button onclick="window.print()">Print / Save as PDF</button></div>
${r.draft ? '<div class="draft-stamp">DRAFT</div>' : ''}
<header>
  <div class="brand">Dr. Debra Canapp<div class="sub">Veterinary Sports Medicine — Diagnostic MSK Ultrasound</div></div>
  <div class="meta">Report date: ${date}<br>Case ID: ${esc(c.id)}</div>
</header>
<h1>${esc(c.patient)}</h1>
<div class="sig">${esc(c.species)} · ${esc(c.breed)} · ${esc(c.age)} · ${esc(c.sex)} · ${esc(c.weight)}</div>
<div class="pid">Diagnostic musculoskeletal ultrasound · Second-opinion read</div>
<div class="grid">
  <div><h4>Referring veterinarian</h4><p>${esc(c.referringVet || '—')}<br>${esc(c.referringClinic || '')}</p></div>
  <div><h4>Submitted</h4><p>${new Date(c.submitted).toLocaleString()}</p></div>
  <div><h4>Presenting complaint</h4><p>${esc(c.complaint || '—')}</p></div>
  <div><h4>Sites evaluated</h4><p>${sites ? esc(sites) : '—'}</p></div>
</div>
<section><h2>Findings</h2>${para(r.findings) || '<p><em>—</em></p>'}</section>
<section><h2>Impression / Diagnosis</h2>${para(r.impression) || '<p><em>—</em></p>'}</section>
<section><h2>Recommendations</h2>${para(r.recommendations) || '<p><em>—</em></p>'}</section>
${figuresHTML}
<div class="sigblock">
  <div class="name">Debra A. Canapp, DVM, DACVSMR, CCRT, CVA</div>
  <div class="role">Diplomate, American College of Veterinary Sports Medicine &amp; Rehabilitation</div>
</div>
<footer>
  This report represents a second-opinion interpretation based on the imaging and history provided by the referring veterinarian. It is not a substitute for in-person clinical examination. Diagnostic conclusions assume image quality and acquisition protocol consistent with the canine MSK ultrasound technique.
</footer>
</body></html>`;
  };
})();
