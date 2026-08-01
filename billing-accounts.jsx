/* global window */
/* ============================================================
   Billing accounts — WHO gets billed
   One registry for both applications:
     • in-person hospitals  (Dr. Canapp travels to them; sched_clinics)
     • remote-read practices (their vets scan and send images in)
   The two populations don't overlap in practice, but an account can be
   marked 'both' if one ever does.

   An account carries the billing entity: who the invoice is addressed to,
   where it goes, and the payment terms. Set once when the account is
   created; every invoice for that account inherits it.
   ============================================================ */

const BA_KINDS = [
  { id: 'inperson', label: 'In-person clinic days', hint: 'Dr. Canapp travels to them and scans on site' },
  { id: 'remote', label: 'Remote reads', hint: 'Their vets scan and send images in for reading' },
  { id: 'both', label: 'Both', hint: 'Rare — on-site clinics and remote reads' },
];

/* Resolve a billing account from anything we hold:
   an in-person clinic id, or a remote-read case's referring practice. */
function baFromClinic(c) {
  if (!c) return null;
  return {
    id: c.id,
    kind: c.billingKind || 'inperson',
    name: c.name,
    // who the invoice is addressed to — falls back to the practice itself
    billTo: c.billTo || c.name,
    attn: c.billingAttn || c.contact || '',
    email: c.billingEmail || c.email || '',
    address: c.billingAddress || [c.city, c.state].filter(Boolean).join(', '),
    termsDays: Number(c.termsDays) > 0 ? Number(c.termsDays) : 15,
    // prices agreed with this hospital specifically; blank rows fall back to the card
    rates: (c.rateOverrides && Object.keys(c.rateOverrides).length) ? c.rateOverrides : null,
    color: c.color || '#8B9482',
    source: 'clinic',
  };
}

/* A remote-read practice we only know from the cases it sends. */
function baFromPractice(name, sample) {
  const clean = String(name || '').trim() || 'Unassigned practice';
  return {
    id: 'rp-' + clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    kind: 'remote',
    name: clean,
    billTo: clean,
    attn: (sample && (sample.referringVet || sample.referring_vet)) || '',
    email: (sample && (sample.referringEmail || sample.referring_email)) || '',
    address: '',
    termsDays: 15,
    color: '#4C6EA8',
    source: 'practice',
  };
}

/* Every account we can bill, in-person + remote, de-duplicated.
   `overrides` lets a remote practice be pinned to a real clinic record
   (same organisation reached both ways) or given its own billing entity. */
function baAll(clinics, cases, overrides) {
  const out = [];
  const byId = new Map();
  (clinics || []).forEach(c => {
    const a = baFromClinic(c);
    if (a) { out.push(a); byId.set(a.id, a); }
  });
  const seen = new Set();
  (cases || []).forEach(c => {
    const nm = c.referringClinic || c.referring_clinic;
    if (!nm) return;
    const key = String(nm).trim().toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    // already an in-person hospital under the same name? bill them as one account
    const match = out.find(a => a.name.trim().toLowerCase() === key);
    if (match) { if (match.kind === 'inperson') match.kind = 'both'; return; }
    const a = baFromPractice(nm, c);
    const ov = (overrides || {})[a.id];
    out.push(ov ? { ...a, ...ov } : a);
    byId.set(a.id, a);
  });
  return out;
}

function baResolve(accounts, idOrName) {
  if (!idOrName) return null;
  const key = String(idOrName).trim().toLowerCase();
  return (accounts || []).find(a => a.id === idOrName)
    || (accounts || []).find(a => a.name.trim().toLowerCase() === key)
    || null;
}

/* 3-letter code for invoice numbers: BOW, ANN, RIV… */
function baCode(account) {
  const src = (account && account.name) || 'GEN';
  const words = String(src).replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean);
  let code = words.length >= 3 ? words.slice(0, 3).map(w => w[0]).join('')
    : words.length === 2 ? (words[0].slice(0, 2) + words[1][0])
    : String(src).replace(/[^A-Za-z]/g, '').slice(0, 3);
  return code.toUpperCase().padEnd(3, 'X').slice(0, 3);
}

window.SchedAccounts = {
  KINDS: BA_KINDS,
  fromClinic: baFromClinic, fromPractice: baFromPractice,
  all: baAll, resolve: baResolve, code: baCode,
};
