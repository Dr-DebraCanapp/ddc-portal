/* global window */
/* ============================================================
   Billable entities — turns what we store into what we bill
     clinic day   → in-person entity (batched per day)
     remote cases → monthly statement per practice (batched per month)
   Both come back in the same shape, so one engine and one set of
   UI components serve the whole business.
   Loads AFTER billing-accounts.jsx and schedule-billing.jsx.
   ============================================================ */

const BE_S = () => window.SCHED;
const BE_A = () => window.SchedAccounts;

/* ---- in-person ------------------------------------------- */
function beDay(day, accounts) {
  return {
    kind: 'inperson',
    id: day.id,
    ref: day.id,
    date: day.date,
    accountId: day.clinic,
    account: BE_A().resolve(accounts, day.clinic),
    patients: day.patients || [],
    invoice: day.invoice || null,
    status: day.status,
    source: day,
  };
}

/* ---- remote reads --------------------------------------- */
/* A case becomes a billable "read" once its report is finalized. */
function beReadFromCase(c) {
  const finalized = c.finalizedAt || c.finalized_at || (c.report && (c.report.signedAt || c.report.signed_at)) || null;
  return {
    caseId: c.id,
    patient: c.patient || 'Untitled patient',
    species: c.species || '',
    breed: c.breed || '',
    service: c.billService || c.bill_service || (c.visitType === 'recheck' || c.visit_type === 'recheck' ? 'remote_recheck' : 'remote_initial'),
    sites: c.sites || [],
    rush: !!(c.rush),
    rushBy: c.rushRequestedBy || c.rush_requested_by || '',
    lines: (c.invoice && c.invoice.lines) || null,
    finalizedAt: finalized,
    practice: c.referringClinic || c.referring_clinic || '',
    vet: c.referringVet || c.referring_vet || '',
    voided: !!c.billVoided,
  };
}
const beBillable = (c) => {
  const r = beReadFromCase(c);
  return !!r.finalizedAt && !r.voided;
};

/* Group finalized reads into one statement per practice per month. */
function beStatements(cases, accounts, statementStore) {
  const groups = new Map();
  (cases || []).filter(beBillable).forEach(c => {
    const r = beReadFromCase(c);
    const dt = new Date(r.finalizedAt);
    const acct = BE_A().resolve(accounts, r.practice);
    const acctId = (acct && acct.id) || 'rp-unassigned';
    const key = acctId + '|' + dt.getFullYear() + '-' + dt.getMonth();
    if (!groups.has(key)) {
      groups.set(key, {
        kind: 'remote',
        id: 'stmt-' + acctId + '-' + dt.getFullYear() + String(dt.getMonth() + 1).padStart(2, '0'),
        ref: key,
        period: { y: dt.getFullYear(), m: dt.getMonth() },
        accountId: acctId,
        account: acct || BE_A().fromPractice(r.practice, c),
        reads: [],
        invoice: null,
      });
    }
    groups.get(key).reads.push(r);
  });
  const out = [...groups.values()];
  // attach any invoice already saved for that statement
  out.forEach(s => {
    const saved = (statementStore || {})[s.id];
    if (saved) s.invoice = saved;
    s.reads.sort((a, b) => new Date(a.finalizedAt) - new Date(b.finalizedAt));
  });
  return out;
}

/* ---- everything billable, one list --------------------- */
function beAll(days, cases, statementStore, overrides) {
  const accounts = BE_A().all(BE_S().CLINICS, cases, overrides);
  const inperson = (days || [])
    .filter(d => (d.patients || []).some(p => !p.cancelled))
    .map(d => beDay(d, accounts));
  const remote = beStatements(cases, accounts, statementStore);
  return { accounts, entities: [...inperson, ...remote] };
}

/* Only the entities that should appear in Billing: already invoiced,
   marked complete, or whose work is done (past clinic day / closed month). */
function beDue(entities, today) {
  const now = today || BE_S().TODAY;
  return (entities || []).filter(e => {
    if (e.invoice) return true;
    if (e.kind === 'remote') return (e.reads || []).length > 0;
    return e.status === 'completed' || new Date(e.date) <= now;
  });
}

/* Every invoice number in play — for the next-number sequence. */
const beNumbers = (entities) => (entities || []).map(e => e.invoice && e.invoice.number).filter(Boolean);

/* Invoices touching one account, both kinds. */
const beForAccount = (entities, accountId) => (entities || []).filter(e => e.accountId === accountId);

/* Everything ever billed for one patient — in-person patients are matched
   by name within a clinic day, remote reads by case. */
function beForPatient(entities, name) {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return [];
  const out = [];
  (entities || []).forEach(e => {
    if (e.kind === 'remote') {
      const reads = (e.reads || []).filter(r => String(r.patient).trim().toLowerCase() === key);
      if (reads.length) out.push({ entity: e, reads, lines: reads.flatMap(window.SchedBill.readLines) });
    } else {
      const pats = (e.patients || []).filter(p => String(p.name).trim().toLowerCase() === key && !p.cancelled);
      if (pats.length) out.push({ entity: e, patients: pats, lines: pats.flatMap(window.SchedBill.patientLines) });
    }
  });
  return out.sort((a, b) => window.SchedBill.entityDate(b.entity) - window.SchedBill.entityDate(a.entity));
}

window.SchedEntities = {
  day: beDay, readFromCase: beReadFromCase, billable: beBillable,
  statements: beStatements, all: beAll, due: beDue, numbers: beNumbers,
  forAccount: beForAccount, forPatient: beForPatient,
};
