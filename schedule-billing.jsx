/* global window */
/* ============================================================
   Billing engine — ONE system for both applications
   Works on a "billable entity", which is either:

     • an in-person clinic day
       { kind:'inperson', id, accountId, date, patients[], invoice }
       Batched: every patient seen that day on one invoice.

     • a remote-read monthly statement
       { kind:'remote', id, accountId, period:{y,m}, reads[], invoice }
       Batched: every read finalized for that practice that month.

   Everything downstream — totals, payments, aging, documents, CSV —
   only needs lines + invoice, so both kinds share it all.

   Rate card (no tax):
     In-person diagnostic MSK ultrasound ......... $1,200 flat
     In-person injection (US-guided and/or IA) ... $1,200 incl. up to 4 sites
       each additional site ...................... $300
     Remote read — initial ....................... $350 per bilateral site
     Remote read — recheck (within 6 months) ..... $300 per bilateral site
     Remote read — non-student ................... $500 per bilateral site
     Remote read — unreadable study .............. $100 return fee
     STAT read (24-hour guaranteed turnaround) ... $250
   ============================================================ */

const SB_RATES = {
  scan:            { label: 'Diagnostic MSK ultrasound', amount: 1200, kind: 'inperson' },
  injection:       { label: 'US-guided / intra-articular injection', amount: 1200, kind: 'inperson', includes: 4 },
  injection_extra: { label: 'Additional injection site', amount: 300, kind: 'inperson' },
  remote_initial:  { label: 'Remote read — initial', amount: 350, kind: 'remote' },
  remote_recheck:  { label: 'Remote read — recheck (within 6 mo)', amount: 300, kind: 'remote' },
  remote_nonstudent: { label: 'Remote read — non-student', amount: 500, kind: 'remote' },
  remote_unreadable: { label: 'Remote read — unreadable study (return fee)', amount: 100, kind: 'remote' },
  rush:            { label: 'STAT read — 24-hour turnaround', amount: 250, kind: 'fee' },
};
/* What the reviewer can pick when finalizing a remote read. */
const SB_REMOTE_SERVICES = ['remote_initial', 'remote_recheck', 'remote_nonstudent', 'remote_unreadable'];
/* The disclaimer BODY. Each surface supplies its own heading ("STAT reads." /
   "STAT READS"), so this must read as a sentence on its own. */
const SB_STAT_DISCLAIMER = 'A report is guaranteed within 24 hours of our receiving a readable study. The requesting practice must contact us directly so that we can acknowledge the STAT request — submitting a case marked STAT does not on its own start the 24-hour period. Where a study cannot be read, we notify the practice immediately and the STAT fee is not charged.';
const sbHasStat = (e) => sbLines(e).some(l => l.code === 'rush');
/* Mutable so the rate-card editor can change these without a deploy.
   The engine reads SB_CFG.* everywhere; never copy these into a const. */
const SB_CFG = { injectionIncluded: 4, recheckMonths: 6, termsDays: 15 };

const SB_CHARGE_TYPES = [
  { id: 'travel',     label: 'Travel / mileage',            sign: 1,  hint: 'Long-haul or out-of-region visit' },
  { id: 'afterhours', label: 'After-hours / rush surcharge', sign: 1,  hint: 'Outside normal clinic hours' },
  { id: 'noshow',     label: 'No-show / late cancellation',  sign: 1,  hint: 'Patient not presented, slot held' },
  { id: 'custom',     label: 'Custom line item',            sign: 1,  hint: 'Write your own description, quantity and unit price', custom: true },
  { id: 'extra',      label: 'Other charge',                 sign: 1,  hint: '' },
  { id: 'courtesy',   label: 'Courtesy credit',              sign: -1, hint: 'Goodwill adjustment' },
  { id: 'discount',   label: 'Discount',                     sign: -1, hint: 'Agreed reduction' },
];
const SB_CHARGE = (id) => SB_CHARGE_TYPES.find(c => c.id === id) || { id, label: id, sign: 1 };
const SB_CHARGE_SIGN = (c) => (c && c.sign === -1 ? -1 : (c && c.sign === 1 ? 1 : SB_CHARGE(c && c.type).sign));
const SB_CHARGE_LABEL = (c) => (c && c.label && String(c.label).trim()) || SB_CHARGE(c && c.type).label;
const SB_CHARGE_DETAIL = (c) => {
  if (!c) return '';
  const q = Number(c.qty) || 1, u = Number(c.unit) || 0;
  if (q > 1 && u > 0) return q + ' × ' + window.SCHED.money(u) + (c.note ? ' · ' + c.note : '');
  return c.note || '';
};

const SB_METHODS = [
  { id: 'check', label: 'Check' },
  { id: 'ach', label: 'ACH / bank transfer' },
  { id: 'card', label: 'Credit card' },
  { id: 'cash', label: 'Cash' },
  { id: 'other', label: 'Other' },
];
const SB_METHOD = (id) => SB_METHODS.find(m => m.id === id) || { id, label: id || 'Payment' };

/* ---- lines for one in-person patient ----------------------- */
function sbPatientLines(p) {
  if (!p || p.cancelled) return [];
  const lines = [];
  const svc = p.service || 'scan';
  if (svc === 'injection') {
    const n = Math.max(1, Number(p.injections) || (p.sites || []).length || 1);
    lines.push({
      code: 'injection', who: p.name, label: SB_RATES.injection.label,
      detail: 'includes up to ' + SB_CFG.injectionIncluded + ' sites · ' + n + ' site' + (n === 1 ? '' : 's') + ' treated',
      qty: 1, unit: SB_RATES.injection.amount, amount: SB_RATES.injection.amount,
    });
    const extra = Math.max(0, n - SB_CFG.injectionIncluded);
    if (extra > 0) lines.push({
      code: 'injection_extra', who: p.name, label: SB_RATES.injection_extra.label,
      detail: 'site ' + (SB_CFG.injectionIncluded + 1) + (extra > 1 ? '–' + n : ''),
      qty: extra, unit: SB_RATES.injection_extra.amount, amount: extra * SB_RATES.injection_extra.amount,
    });
  } else {
    lines.push({
      code: 'scan', who: p.name, label: SB_RATES.scan.label,
      detail: (p.sites || []).map(s => window.SCHED.site(s).name).join(', '),
      qty: 1, unit: SB_RATES.scan.amount, amount: SB_RATES.scan.amount,
    });
  }
  if (p.rush) lines.push({ code: 'rush', who: p.name, label: SB_RATES.rush.label, detail: 'requested by ' + (p.rushBy || 'referring vet'), qty: 1, unit: SB_RATES.rush.amount, amount: SB_RATES.rush.amount });
  return lines;
}
const sbPatientTotal = (p) => sbPatientLines(p).reduce((s, l) => s + l.amount, 0);

/* ---- lines for one remote read ----------------------------- */
/* read = { caseId, patient, service, sites[], rush, finalizedAt, lines? }
   `service` is a SB_RATES key; sites are billed per bilateral region. */
function sbReadLines(r) {
  if (!r || r.voided) return [];
  // a read finalized with hand-edited lines keeps exactly what was agreed
  if (r.lines && r.lines.length) {
    return r.lines.map(l => ({
      code: l.code || l.serviceId || 'remote_initial', who: r.patient, label: l.label,
      detail: [l.site, l.note].filter(Boolean).join(' · '), qty: Number(l.qty) || 1,
      unit: Number(l.unit) || Number(l.amount) || 0, amount: Number(l.amount) || 0,
    }));
  }
  const code = SB_REMOTE_SERVICES.includes(r.service) ? r.service : 'remote_initial';
  const rate = SB_RATES[code];
  const out = [];
  if (code === 'remote_unreadable') {
    out.push({ code, who: r.patient, label: rate.label, detail: r.caseId || '', qty: 1, unit: rate.amount, amount: rate.amount });
  } else {
    const sites = (r.sites && r.sites.length) ? r.sites : ['—'];
    sites.forEach(s => out.push({
      code, who: r.patient, label: rate.label,
      detail: [typeof s === 'string' ? s : (s && s.name), r.caseId].filter(Boolean).join(' · '),
      qty: 1, unit: rate.amount, amount: rate.amount,
    }));
  }
  if (r.rush) out.push({ code: 'rush', who: r.patient, label: SB_RATES.rush.label, detail: 'requested by ' + (r.rushBy || 'referring vet'), qty: 1, unit: SB_RATES.rush.amount, amount: SB_RATES.rush.amount });
  return out;
}
const sbReadTotal = (r) => sbReadLines(r).reduce((s, l) => s + l.amount, 0);

/* ---- lines for a whole entity ------------------------------ */
function sbLinesRaw(e) {
  if (!e) return [];
  if (e.kind === 'remote') return (e.reads || []).flatMap(sbReadLines);
  return (e.patients || []).flatMap(sbPatientLines);
}
/* Price with the rate card that was in force on this entity's own date,
   so a raise never silently re-prices work already invoiced. */
function sbLines(e) {
  const R = window.SchedRates;
  if (!R || !e || !e.kind) return sbLinesRaw(e);
  return R.withCardFor(e, () => sbLinesRaw(e));
}

/* ---- arithmetic -------------------------------------------- */
const sbSubtotal = (e) => sbLines(e).reduce((s, l) => s + l.amount, 0);
function sbChargesTotal(inv) {
  return ((inv && inv.charges) || []).reduce((s, c) => s + (SB_CHARGE_SIGN(c) * (Number(c.amount) || 0)), 0);
}
function sbTotal(e) {
  return Math.max(0, Math.round(sbSubtotal(e) + sbChargesTotal(e && e.invoice)));
}
function sbPaid(inv, e) {
  const rows = ((inv && inv.payments) || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  if (!rows && inv && inv.status === 'paid' && e) return sbSubtotal(e) + sbChargesTotal(inv);
  return rows;
}
const sbBalance = (e) => Math.max(0, sbTotal(e) - sbPaid(e && e.invoice, e));

/* ---- dates and lifecycle ----------------------------------- */
const sbAddDays = (dt, n) => { const x = new Date(dt); x.setDate(x.getDate() + n); return x; };
function sbTermsFor(e) {
  const a = e && e.account;
  const n = a && Number(a.termsDays);
  return n > 0 ? n : SB_CFG.termsDays;
}
function sbDue(e) {
  const inv = e && e.invoice;
  if (!inv || !inv.issued) return null;
  if (inv.due) return new Date(inv.due);
  return sbAddDays(new Date(inv.issued), inv.termsDays || sbTermsFor(e));
}
function sbStatus(e, today) {
  const inv = e && e.invoice;
  if (!inv) return 'none';
  if (inv.writtenOff) return 'written_off';
  const total = sbTotal(e), paid = sbPaid(inv, e);
  if (!inv.issued) return 'draft';
  if (paid >= total && total > 0) return 'paid';
  if (paid > 0) return 'partial';
  const due = sbDue(e);
  if (due && due < (today || window.SCHED.TODAY)) return 'overdue';
  return 'unpaid';
}
const SB_STATUS_LABEL = {
  none: 'Not invoiced', draft: 'Draft', unpaid: 'Unpaid', partial: 'Part paid',
  overdue: 'Overdue', paid: 'Paid', written_off: 'Written off',
};
function sbDaysOverdue(e, today) {
  const due = sbDue(e);
  if (!due) return 0;
  const diff = Math.floor(((today || window.SCHED.TODAY) - due) / 864e5);
  return diff > 0 ? diff : 0;
}
function sbAgeBucket(e, today) {
  const n = sbDaysOverdue(e, today);
  return n <= 0 ? 'current' : n <= 30 ? '1-30' : n <= 60 ? '31-60' : n <= 90 ? '61-90' : '90+';
}

/* ---- numbering: one sequence per billing account per month --- */
/* DDC-BOW-2607-01. In-person hospitals and remote-read practices are
   separate accounts in practice, so a single per-account sequence keeps
   every number unique without needing a kind marker. */
function sbNextNumber(existingNumbers, account, date) {
  const dt = date ? new Date(date) : new Date(window.SCHED.TODAY);
  const yymm = String(dt.getFullYear()).slice(2) + String(dt.getMonth() + 1).padStart(2, '0');
  const stem = 'DDC-' + window.SchedAccounts.code(account) + '-' + yymm;
  let max = 0;
  (existingNumbers || []).forEach(num => {
    if (!num || String(num).indexOf(stem) !== 0) return;
    const seq = Number(String(num).slice(stem.length + 1));
    if (seq > max) max = seq;
  });
  return stem + '-' + String(max + 1).padStart(2, '0');
}

function sbEntry(who, what) { return { at: new Date().toISOString(), who: who || 'admin', what }; }
function sbLogged(inv, who, what) { return { ...inv, audit: [...((inv && inv.audit) || []), sbEntry(who, what)] }; }

/* `issuedAt` back-dates the document — for work invoiced before it was
   entered into the system. Omitted, it issues as of today. */
function sbIssue(existingNumbers, e, who, issuedAt) {
  const issued = issuedAt
    ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(issuedAt)) ? issuedAt + 'T12:00:00' : issuedAt)
    : new Date(window.SCHED.TODAY);
  const backdated = issuedAt && issued < new Date(window.SCHED.TODAY);
  const terms = sbTermsFor(e);
  const prev = e.invoice || {};
  // number by the period the work belongs to, not the day it is billed —
  // a July statement issued in August still reads …-2607-…
  return {
    number: prev.number || sbNextNumber(existingNumbers, e.account, sbEntityDate(e) || issued),
    issued, due: sbAddDays(issued, terms), termsDays: terms,
    charges: prev.charges || [], payments: prev.payments || [],
    writtenOff: false,
    audit: [...(prev.audit || []), sbEntry(who, backdated ? 'Invoice issued, dated ' + issued.toLocaleDateString() + ' (entered later)' : 'Invoice issued')],
  };
}

/* ---- descriptive helpers used by every surface ------------- */
function sbTitle(e) {
  const S = window.SCHED;
  if (!e) return '';
  if (e.kind === 'remote') {
    const d = new Date(e.period.y, e.period.m, 1);
    return 'Remote reads · ' + S.MONTHS[e.period.m] + ' ' + d.getFullYear();
  }
  return 'Clinic day · ' + S.fmtLong(new Date(e.date)) + ', ' + new Date(e.date).getFullYear();
}
function sbCount(e) {
  if (!e) return '';
  if (e.kind === 'remote') { const n = (e.reads || []).filter(r => !r.voided).length; return n + ' read' + (n === 1 ? '' : 's'); }
  const n = (e.patients || []).filter(p => !p.cancelled).length;
  return n + ' patient' + (n === 1 ? '' : 's');
}
const sbEntityDate = (e) => (e && (e.kind === 'remote' ? new Date(e.period.y, e.period.m, 1) : new Date(e.date)));

/* ---- CSV for bookkeeping ---------------------------------- */
function sbCSV(entities) {
  const S = window.SCHED;
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = [['Invoice', 'Type', 'Status', 'Issued', 'Due', 'Billed to', 'Period / clinic date', 'Patient', 'Service', 'Detail', 'Qty', 'Unit', 'Amount', 'Invoice total', 'Paid', 'Balance']];
  (entities || []).filter(e => e.invoice).forEach(e => {
    const inv = e.invoice, st = SB_STATUS_LABEL[sbStatus(e)] || '';
    const total = sbTotal(e), paid = sbPaid(inv, e), bal = sbBalance(e);
    const dueD = sbDue(e);
    const base = [inv.number || '', e.kind === 'remote' ? 'Remote reads' : 'In-person', st,
      inv.issued ? S.iso(new Date(inv.issued)) : '', dueD ? S.iso(dueD) : '',
      (e.account && e.account.billTo) || '', S.iso(sbEntityDate(e))];
    sbLines(e).forEach(l => rows.push([...base, l.who || '', l.label, l.detail, l.qty, l.unit, l.amount, total, paid, bal]));
    (inv.charges || []).forEach(c => {
      const sign = SB_CHARGE_SIGN(c), q = Number(c.qty) || 1, u = Number(c.unit) || Number(c.amount) || 0;
      rows.push([...base, '—', SB_CHARGE_LABEL(c), c.note || '', q, sign * u, sign * c.amount, total, paid, bal]);
    });
  });
  return rows.map(r => r.map(esc).join(',')).join('\n');
}

function sbDownload(name, text, mime) {
  const blob = new Blob([text], { type: mime || 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

/* ---- how to pay: one wording, used everywhere -------------- */
function sbPayCfg() {
  const p = (window.PORTAL_CONFIG && window.PORTAL_CONFIG.payments) || {};
  return {
    portalUrl: p.portalUrl || '',
    checkTo: p.checkPayableTo || 'Dr. Debra Canapp',
    checkMailTo: p.checkMailTo || '',
    achBank: p.achBank || '', achName: p.achAccountName || '', achRouting: p.achRouting || '', achAccount: p.achAccount || '',
    achEmailNote: p.achEmailNote || '',
    payOnlineUrl: p.payOnlineUrl || '', payEndpoint: p.payEndpoint || '', payOnlineName: p.payOnlineName || 'Pay online by card',
  };
}
/* Ordered list of ways to pay, as plain strings. */
/* opts.inPortal  — the reader is already signed in, so don't tell them to sign in
   opts.accountWide — a summary of several invoices, so don't cite one number */
function sbPayLines(e, opts) {
  const o = opts || {};
  const c = sbPayCfg();
  const inv = (e && e.invoice) || {};
  const ref = (inv.number && !o.accountWide) ? ' Reference ' + inv.number + '.' : ' Reference the invoice number you are paying.';
  const out = [];
  if (o.inPortal) {
    out.push('Online — open any statement above to download a PDF; every payment we record appears here.');
  } else if (c.portalUrl) {
    out.push('Online — sign in at ' + c.portalUrl + ' to view this ' + (e && e.kind === 'remote' ? 'statement' : 'invoice') + ', download a PDF, and see every payment recorded against your account.');
  }
  out.push('Check — payable to ' + c.checkTo + '.' + ref + (c.checkMailTo ? ' Post to ' + c.checkMailTo + '.' : ''));
  if (c.achRouting || c.achAccount || c.achBank) {
    out.push('ACH / bank transfer — ' + [c.achName, c.achBank, c.achRouting ? 'routing ' + c.achRouting : '', c.achAccount ? 'account ' + c.achAccount : ''].filter(Boolean).join(' · ') + '.' + ref);
  } else if (c.achEmailNote) {
    out.push('ACH / bank transfer — ' + c.achEmailNote);
  }
  if (c.payOnlineUrl || c.payEndpoint) out.push('Card — ' + (c.payOnlineUrl || 'ask us for a payment link') + '.');
  return out;
}

/* ---- email draft ------------------------------------------ */
function sbEmailBody(e, attaching) {
  const S = window.SCHED;
  const a = e.account || {};
  const inv = e.invoice || {};
  const due = sbDue(e);
  const remote = e.kind === 'remote';
  const doc = remote ? 'statement' : 'invoice';
  const what = remote
    ? `the remote MSK ultrasound reads completed for ${a.name || 'your practice'} in ${S.MONTHS[e.period.m]} ${e.period.y}`
    : `the diagnostic musculoskeletal ultrasound clinic held at ${a.name || 'your hospital'} on ${new Date(e.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`;
  const pay = sbPayLines(e);
  return [
    `Hello ${a.attn || 'there'},`, '',
    attaching
      ? `Please find ${doc} ${inv.number || ''} attached, covering ${what}.`
      : `${doc.charAt(0).toUpperCase() + doc.slice(1)} ${inv.number || ''} is ready, covering ${what}.`,
    '',
    `${remote ? 'Reads' : 'Patients seen'}: ${sbCount(e)}`,
    `${doc.charAt(0).toUpperCase() + doc.slice(1)} total: ${S.money(sbTotal(e))}`,
    `Balance due: ${S.money(sbBalance(e))}`,
    `Terms: Net ${inv.termsDays || SB_CFG.termsDays}${due ? ' — due ' + due.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : ''}`,
    '', 'HOW TO PAY', ...pay.map((l, i) => `${i + 1}. ${l}`),
    ...(sbHasStat(e) ? ['', 'STAT READS', SB_STAT_DISCLAIMER] : []),
    '', 'With thanks,', 'Dr. Debra Canapp, DVM, DACVSMR', 'info@DrDebraCanapp.com',
  ].join('\n');
}

/* Open the client's mail app with everything written. `attaching` only
   changes the wording — a web page cannot attach a file to a mail draft,
   so the caller saves the PDF first and the user attaches it. */
function sbEmailInvoice(e, attaching) {
  const a = e.account || {};
  const inv = e.invoice || {};
  const remote = e.kind === 'remote';
  const subject = `${remote ? 'Statement' : 'Invoice'} ${inv.number || ''} — Dr. Debra Canapp, DVM, DACVSMR`;
  window.location.href = `mailto:${encodeURIComponent(a.email || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(sbEmailBody(e, attaching))}`;
}

/* Open the document in a print window so the user can save it as a PDF.
   Returns the window so a caller can chain the email draft after it. */
function sbOpenDocument(e, kind) {
  const S = window.SCHED;
  const html = kind === 'receipt' ? S.buildReceiptHTML(e) : S.buildInvoiceHTML(e);
  const w = window.open('', '_blank', 'width=880,height=1040');
  if (w) { w.document.write(html); w.document.close(); }
  return w;
}

window.SchedBill = {
  RATES: SB_RATES, REMOTE_SERVICES: SB_REMOTE_SERVICES,
  CHARGE_TYPES: SB_CHARGE_TYPES, charge: SB_CHARGE,
  METHODS: SB_METHODS, method: SB_METHOD, payCfg: sbPayCfg, payLines: sbPayLines,
  chargeSign: SB_CHARGE_SIGN, chargeLabel: SB_CHARGE_LABEL, chargeDetail: SB_CHARGE_DETAIL,
  CFG: SB_CFG,
  STATUS_LABEL: SB_STATUS_LABEL, STAT_DISCLAIMER: SB_STAT_DISCLAIMER, hasStat: sbHasStat,
  patientLines: sbPatientLines, patientTotal: sbPatientTotal,
  readLines: sbReadLines, readTotal: sbReadTotal, lines: sbLines,
  subtotal: sbSubtotal, chargesTotal: sbChargesTotal, total: sbTotal,
  paid: sbPaid, balance: sbBalance,
  status: sbStatus, daysOverdue: sbDaysOverdue, ageBucket: sbAgeBucket, due: sbDue,
  nextNumber: sbNextNumber, termsFor: sbTermsFor,
  issue: sbIssue, entry: sbEntry, logged: sbLogged, addDays: sbAddDays,
  title: sbTitle, count: sbCount, entityDate: sbEntityDate,
  csv: sbCSV, download: sbDownload, email: sbEmailInvoice, emailBody: sbEmailBody, openDocument: sbOpenDocument,
};

/* Live views onto the mutable config, so UI code reading
   SchedBill.INJECTION_INCLUDED / TERMS_DAYS / RECHECK_MONTHS always sees
   the active rate card rather than a stale copy. */
Object.defineProperties(window.SchedBill, {
  INJECTION_INCLUDED: { get: () => SB_CFG.injectionIncluded, enumerable: true },
  RECHECK_MONTHS: { get: () => SB_CFG.recheckMonths, enumerable: true },
  TERMS_DAYS: { get: () => SB_CFG.termsDays, enumerable: true },
});
