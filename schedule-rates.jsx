/* global window */
/* ============================================================
   Rate card — editable, versioned by effective date
   The prices in schedule-billing.jsx are the FALLBACK. This layer
   lets the rate card be edited in the app and stored in Supabase
   (`sched_rates`), so a price rise doesn't need a code change.

   Versioning matters for money: an invoice already issued must keep
   the price it was billed at. Each saved card carries an
   `effectiveFrom` date, and a billable entity is priced with the
   card that was in force on ITS date — not today's card.
   Loads AFTER schedule-billing.jsx.
   ============================================================ */

/* Order the editor shows, with the wording each row uses. */
const SR_ROWS = [
  { id: 'scan', label: 'In-person diagnostic MSK ultrasound', note: 'Flat per visit, any number of regions.' },
  { id: 'injection', label: 'US-guided / intra-articular injection', note: 'Includes up to 4 sites in any combination.' },
  { id: 'injection_extra', label: 'Each additional injection site', note: 'Fifth site onward, US-guided or IA.' },
  { id: 'remote_initial', label: 'Remote read — initial', note: 'Per bilateral region.' },
  { id: 'remote_recheck', label: 'Remote read — recheck', note: 'Per region, within the recheck window.' },
  { id: 'remote_nonstudent', label: 'Remote read — non-student', note: 'Per region.' },
  { id: 'remote_unreadable', label: 'Remote read — unreadable study', note: 'Return fee, charged once.' },
  { id: 'rush', label: 'STAT read', note: '24-hour guaranteed turnaround.' },
];

/* Other numbers worth changing without a deploy. */
const SR_SETTINGS = [
  { id: 'injectionIncluded', label: 'Sites included in the injection fee', min: 1, max: 10, suffix: 'sites' },
  { id: 'recheckMonths', label: 'Recheck window', min: 1, max: 24, suffix: 'months' },
  { id: 'termsDays', label: 'Default payment terms', min: 0, max: 90, suffix: 'days (Net)' },
];

/* The built-in card, read from the engine so there's one source of truth. */
function srDefaults() {
  const B = window.SchedBill;
  const amounts = {};
  SR_ROWS.forEach(r => { amounts[r.id] = B.RATES[r.id] ? B.RATES[r.id].amount : 0; });
  return {
    id: 'default',
    effectiveFrom: null,           // null = "since the beginning"
    amounts,
    injectionIncluded: 4,
    recheckMonths: 6,
    termsDays: 15,
    note: 'Built-in rate card',
  };
}

/* Every card, oldest first. Always includes the built-in as the base. */
let SR_CARDS = [];
function srSetCards(list) {
  const cards = (list || []).slice().sort((a, b) => {
    const da = a.effectiveFrom ? new Date(a.effectiveFrom) : new Date(0);
    const db = b.effectiveFrom ? new Date(b.effectiveFrom) : new Date(0);
    return da - db;
  });
  SR_CARDS = [srDefaults(), ...cards.filter(c => c.id !== 'default')];
  srApply();
}
const srCards = () => SR_CARDS.length ? SR_CARDS : [srDefaults()];

/* The card in force on a given date. */
function srCardFor(date) {
  const when = date ? new Date(date) : new Date(window.SCHED.TODAY);
  const list = srCards();
  let chosen = list[0];
  list.forEach(c => {
    if (!c.effectiveFrom) return;
    if (new Date(c.effectiveFrom) <= when) chosen = c;
  });
  return chosen;
}
const srCurrent = () => srCardFor(new Date(window.SCHED.TODAY));

/* Push a card's numbers into the engine so every existing call site
   (lines, totals, documents, the rate-card panel) uses them. */
function srApply(card) {
  const B = window.SchedBill;
  const c = card || srCurrent();
  SR_ROWS.forEach(r => { if (B.RATES[r.id]) B.RATES[r.id].amount = Number(c.amounts[r.id]) || 0; });
  // SB_CFG is mutable by design — the engine reads it live
  if (Number(c.injectionIncluded) > 0) B.CFG.injectionIncluded = Number(c.injectionIncluded);
  if (Number(c.recheckMonths) > 0) B.CFG.recheckMonths = Number(c.recheckMonths);
  if (Number(c.termsDays) >= 0) B.CFG.termsDays = Number(c.termsDays);
  B.ACTIVE_CARD = c;
  return c;
}

/* Price an entity with the card that was in force on its own date, so a
   historical invoice never silently re-prices when rates go up. Restores
   the current card afterwards. */
function srWithCardFor(entityOrDate, fn) {
  const B = window.SchedBill;
  const date = entityOrDate && entityOrDate.kind ? B.entityDate(entityOrDate) : entityOrDate;
  const prev = B.ACTIVE_CARD || srCurrent();
  const want = srCardFor(date);
  if (want.id !== prev.id) srApply(want);
  try { return fn(); } finally { if (want.id !== prev.id) srApply(prev); }
}

/* ---- persistence ---- */
async function srLoad() {
  const Cloud = window.SchedCloud;
  if (!Cloud || !Cloud.configured || !Cloud.loadRates) { srSetCards([]); return srCards(); }
  try { srSetCards(await Cloud.loadRates()); } catch (e) { srSetCards([]); }
  return srCards();
}
async function srSave(card) {
  const Cloud = window.SchedCloud;
  const list = srCards().filter(c => c.id !== 'default' && c.id !== card.id).concat([card]);
  srSetCards(list);
  if (Cloud && Cloud.configured && Cloud.saveRates) await Cloud.saveRates(card);
  return card;
}
async function srRemove(id) {
  const Cloud = window.SchedCloud;
  srSetCards(srCards().filter(c => c.id !== 'default' && c.id !== id));
  if (Cloud && Cloud.configured && Cloud.deleteRates) await Cloud.deleteRates(id);
}

window.SchedRates = {
  ROWS: SR_ROWS, SETTINGS: SR_SETTINGS,
  defaults: srDefaults, cards: srCards, setCards: srSetCards,
  cardFor: srCardFor, current: srCurrent, apply: srApply, withCardFor: srWithCardFor,
  load: srLoad, save: srSave, remove: srRemove,
};
