/* global React */
/* ============================================================
   Schedule — data layer
   Anchored to a fixed "today" so the calendar always looks lived-in,
   regardless of the machine clock. All money/date helpers live here.
   Exposed on window.SCHED.
   ============================================================ */

const SCHED_TODAY = new Date(2026, 5, 2); // Tue, Jun 2 2026
const d = (y, m, day) => new Date(y, m - 1, day);
const iso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

/* ---- MSK sites (each region = one bilateral site) ----------
   Iliopsoas requires sedation (dorsal recumbency). Mirrors the live
   SitesPicker set: Hips + Biceps/Supraspinatus removed, Piriformis added. */
const SCHED_SITES = [
  { id: 'shoulder', name: 'Shoulder' },
  { id: 'elbow', name: 'Elbow' },
  { id: 'carpus', name: 'Carpus' },
  { id: 'stifle', name: 'Stifle' },
  { id: 'tarsus', name: 'Tarsus' },
  { id: 'achilles', name: 'Common calcaneal (Achilles)' },
  { id: 'iliopsoas', name: 'Iliopsoas', sedation: true },
  { id: 'piriformis', name: 'Piriformis' },
];
const SCHED_SITE = (id) => SCHED_SITES.find(s => s.id === id) || { id, name: id };

/* ---- Rates (no tax) ---------------------------------------- */
/* The rate card lives in schedule-billing.jsx (window.SchedBill.RATES).
   In-person scans are a flat $1,200 with no recheck rate; injections are
   $1,200 for up to 4 sites, +$300 each after; remote reads are $350 /
   $300 recheck within 6 months, +$250 to rush. These aliases keep older
   call sites working. */
const SCHED_RATES = {
  initial: { label: 'Diagnostic MSK ultrasound', amount: 1200 },
  recheck: { label: 'Diagnostic MSK ultrasound', amount: 1200 },
  scan: { label: 'Diagnostic MSK ultrasound', amount: 1200 },
  injection: { label: 'US-guided / intra-articular injection', amount: 1200 },
};
const SCHED_RECHECK_WINDOW_MONTHS = 6;

/* ---- Clinics (hospital accounts) --------------------------- */
/* Each hospital carries its own color for at-a-glance recognition on the calendar. */
const SCHED_CLINICS = [
  { id: 'bowie', name: 'Bowie Animal Hospital', city: 'Bowie', state: 'MD', region: 'md',
    contact: 'Dr. Marina Velez', email: 'frontdesk@bowieah.com', phone: '(301) 555-0142',
    account: 'active', color: '#2A6FDB', mapX: 71, mapY: 50, miles: 28 },
  { id: 'annapolis', name: 'Annapolis Veterinary Hospital', city: 'Annapolis', state: 'MD', region: 'md',
    contact: 'Dr. Theo Brandt', email: 'reception@annapolisvet.com', phone: '(410) 555-0188',
    account: 'active', color: '#1F8A5B', mapX: 78, mapY: 58, miles: 34 },
  { id: 'frederick', name: 'Frederick Animal Health Center', city: 'Frederick', state: 'MD', region: 'md',
    contact: 'Dr. Priya Anand', email: 'office@frederickahc.com', phone: '(301) 555-0119',
    account: 'active', color: '#B8862B', mapX: 58, mapY: 40, miles: 47 },
  { id: 'columbia', name: 'Columbia Pet Clinic', city: 'Columbia', state: 'MD', region: 'md',
    contact: 'Dr. Sam Okafor', email: 'team@columbiapet.com', phone: '(410) 555-0173',
    account: 'active', color: '#8B4A9E', mapX: 66, mapY: 46, miles: 19 },
  { id: 'severna', name: 'Severna Park Veterinary', city: 'Severna Park', state: 'MD', region: 'md',
    contact: 'Dr. Helen Wu', email: 'desk@severnaparkvet.com', phone: '(410) 555-0150',
    account: 'invited', color: '#0E7C8B', mapX: 75, mapY: 52, miles: 31 },
  { id: 'catonsville', name: 'Catonsville Animal Clinic', city: 'Catonsville', state: 'MD', region: 'md',
    contact: 'Dr. Iris Mbeki', email: 'hello@catonsvilleac.com', phone: '(410) 555-0166',
    account: 'active', color: '#C24444', mapX: 68, mapY: 42, miles: 23 },
  { id: 'sanramon', name: 'Bay Area Veterinary Specialists', city: 'San Ramon', state: 'CA', region: 'ca',
    contact: 'Dr. Grace Lindqvist', email: 'referrals@bavs.com', phone: '(925) 555-0101',
    account: 'active', color: '#D9822B', mapX: 16, mapY: 30, miles: 2840 },
  { id: 'peninsula', name: 'Peninsula Animal Hospital', city: 'Palo Alto', state: 'CA', region: 'ca',
    contact: 'Dr. Owen Park', email: 'front@peninsulaah.com', phone: '(650) 555-0124',
    account: 'active', color: '#4C6EA8', mapX: 12, mapY: 38, miles: 2880 },
];
const SCHED_CLINIC = (id) => SCHED_CLINICS.find(c => c.id === id) || null;
const SCHED_CLINIC_COLOR = (id) => { const c = SCHED_CLINIC(id); return c && c.color ? c.color : '#8B9482'; };

/* Curated color palette for hospital assignment (edit anytime) */
const SCHED_PALETTE = ['#2A6FDB', '#1F8A5B', '#B8862B', '#8B4A9E', '#0E7C8B', '#C24444', '#D9822B', '#4C6EA8', '#6B7C5C', '#A65D9E', '#3C7A6B', '#C77D3A'];
const SCHED_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* Per-clinic booking rules: which weekdays they may book, and max cases/day.
   Seeded with light variety; all editable in the clinic profile. */
const _bookingSeed = [[2, 4], [1, 3], [3, 5], [2], [4], [1, 5], [2, 3], [4]];
const _maxSeed = [4, 2, 3, 4, 2, 3, 4, 3];
SCHED_CLINICS.forEach((c, i) => {
  if (!c.bookingDays) c.bookingDays = _bookingSeed[i % _bookingSeed.length];
  if (c.maxCasesPerDay == null) c.maxCasesPerDay = _maxSeed[i % _maxSeed.length];
  if (!c.status) c.status = c.account === 'active' ? 'active' : 'pending';
});

/* A clinic that submitted the intake form and is awaiting Allyson's finalization. */
SCHED_CLINICS.push({
  id: 'piedmont', name: 'Piedmont Equine & Canine', city: 'Warrenton', state: 'VA', region: 'md',
  contact: 'Dr. Rachel Considine', email: 'rconsidine@piedmontec.com', phone: '(540) 555-0171',
  account: 'invited', status: 'pending', color: null, bookingDays: [], maxCasesPerDay: 4,
  canSedate: true, mapX: 52, mapY: 44, miles: 58,
  intakeNote: 'Sporting-dog heavy caseload. Full sedation available; quiet exam room with table.',
});

/* ---- Patient factory --------------------------------------- */
let _pid = 0;
function P(o) {
  _pid += 1;
  return {
    id: 'p' + _pid,
    name: o.name, species: o.species || 'Canine', breed: o.breed,
    sex: o.sex, age: o.age,
    owner: o.owner, ownerPhone: o.ownerPhone,
    vet: o.vet,
    sites: o.sites || [],
    visitType: o.visitType || 'initial',
    rate: o.rate || (o.visitType === 'recheck' ? 'recheck' : 'initial'),
    history: o.history || '',
    demeanor: o.demeanor || 'calm',     // calm | anxious | reactive
    fasted: o.fasted !== false,         // confirmed fasted
    notes: o.notes || '',
    files: o.files || [],
    caseId: o.caseId || null,           // links to remote-read case system once reported
    cancelled: o.cancelled || null,     // null | { by: 'admin'|'clinic', reason }
  };
}

/* ---- Clinic days ------------------------------------------- */
/* status: available | booked | submitted | confirmed | completed
   available = published open day, no clinic yet
   booked    = a clinic claimed it & is loading patients
   submitted = clinic submitted its roster — awaiting Allyson Li's approval
   confirmed = approved by Allyson; locked in
   completed = scans done; invoice issued */
const SCHED_DAYS = [
  // ---- past (completed) ----
  { id: 'cd-0526', date: d(2026, 5, 26), clinic: 'catonsville', status: 'completed',
    invoice: { number: 'DDC-2605', status: 'paid', issued: d(2026, 5, 26) },
    patients: [
      P({ name: 'Brisket', breed: 'Labrador Retriever', sex: 'M/N', age: '6 yr', owner: 'A. Delgado', ownerPhone: '(410) 555-2231', vet: 'Dr. Iris Mbeki', sites: ['shoulder', 'elbow'], visitType: 'initial', history: 'Intermittent left forelimb lameness, 3 weeks. Sporting dog.', caseId: 'DDC-2026-0419' }),
      P({ name: 'Juno', breed: 'Border Collie', sex: 'F/S', age: '4 yr', owner: 'R. Pham', ownerPhone: '(410) 555-2240', vet: 'Dr. Iris Mbeki', sites: ['iliopsoas'], visitType: 'initial', demeanor: 'anxious', history: 'Agility dog, reluctance to jump. R/O iliopsoas strain.', caseId: 'DDC-2026-0420' }),
    ] },
  { id: 'cd-0601', date: d(2026, 6, 1), clinic: 'columbia', status: 'completed',
    invoice: { number: 'DDC-2606', status: 'unpaid', issued: d(2026, 6, 1) },
    patients: [
      P({ name: 'Maple', breed: 'Golden Retriever', sex: 'F/S', age: '8 yr', owner: 'T. Okonkwo', ownerPhone: '(410) 555-3310', vet: 'Dr. Sam Okafor', sites: ['stifle'], visitType: 'recheck', history: 'Post-op CCL recheck, 10 weeks. Assess for meniscal involvement.', caseId: 'DDC-2026-0431' }),
      P({ name: 'Diesel', breed: 'Belgian Malinois', sex: 'M/I', age: '3 yr', owner: 'K9 Unit — Howard Co.', ownerPhone: '(410) 555-3318', vet: 'Dr. Sam Okafor', sites: ['shoulder', 'iliopsoas'], visitType: 'initial', demeanor: 'reactive', history: 'Working K9, performance decline. Bilateral comparison requested.', caseId: 'DDC-2026-0432' }),
      P({ name: 'Olive', breed: 'French Bulldog', sex: 'F/S', age: '2 yr', owner: 'M. Bianchi', ownerPhone: '(443) 555-3320', vet: 'Dr. Sam Okafor', sites: ['elbow'], visitType: 'initial', history: 'Forelimb lameness; rads inconclusive.', caseId: 'DDC-2026-0433' }),
    ] },

  // ---- today ----
  { id: 'cd-0602', date: d(2026, 6, 2), clinic: 'bowie', status: 'confirmed',
    patients: [
      P({ name: 'Ranger', breed: 'German Shepherd', sex: 'M/N', age: '5 yr', owner: 'J. Castellano', ownerPhone: '(301) 555-4410', vet: 'Dr. Marina Velez', sites: ['iliopsoas', 'piriformis'], visitType: 'initial', demeanor: 'anxious', history: 'Schutzhund prospect; hind-end weakness and reluctance to sit square.', files: ['Ranger_pelvis_VD.dcm', 'Ranger_referral.pdf'] }),
      P({ name: 'Pepper', breed: 'Australian Shepherd', sex: 'F/S', age: '7 yr', owner: 'L. Strand', ownerPhone: '(301) 555-4419', vet: 'Dr. Marina Velez', sites: ['shoulder'], visitType: 'recheck', history: 'Biceps tendinopathy recheck following rest + rehab.', files: ['Pepper_prior_report.pdf'] }),
      P({ name: 'Tank', breed: 'Rottweiler', sex: 'M/N', age: '4 yr', owner: 'D. Friel', ownerPhone: '(443) 555-4421', vet: 'Dr. Marina Velez', sites: ['stifle', 'tarsus'], visitType: 'initial', demeanor: 'calm', history: 'Vague hind-limb lameness; owner reports occasional toe-knuckling.', files: ['Tank_stifle_rads.jpg'] }),
    ] },

  // ---- upcoming ----
  { id: 'cd-0604', date: d(2026, 6, 4), clinic: 'annapolis', status: 'confirmed',
    signoff: { name: 'Dr. Theo Brandt', role: 'referring veterinarian', mode: 'type', data: 'Theo Brandt', at: d(2026, 5, 30).toISOString() },
    patients: [
      P({ name: 'Willow', breed: 'Whippet', sex: 'F/S', age: '3 yr', owner: 'N. Adeyemi', ownerPhone: '(410) 555-5510', vet: 'Dr. Theo Brandt', sites: ['carpus', 'shoulder'], visitType: 'initial', history: 'Lure-coursing dog, acute carpal swelling.' }),
      P({ name: 'Moose', breed: 'Bernese Mountain Dog', sex: 'M/N', age: '6 yr', owner: 'C. Petrov', ownerPhone: '(410) 555-5512', vet: 'Dr. Theo Brandt', sites: ['elbow'], visitType: 'initial', demeanor: 'calm', history: 'Chronic forelimb lameness; OA suspected.' }),
    ] },
  { id: 'cd-0609', date: d(2026, 6, 9), clinic: 'frederick', status: 'submitted',
    submittedBy: 'Dr. Priya Anand', submittedAt: d(2026, 5, 31),
    patients: [
      P({ name: 'Scout', breed: 'Vizsla', sex: 'M/I', age: '2 yr', owner: 'B. Hassan', ownerPhone: '(301) 555-6610', vet: 'Dr. Priya Anand', sites: ['iliopsoas'], visitType: 'initial', demeanor: 'anxious', history: 'Field-trial dog; suspected iliopsoas strain.' }),
      P({ name: 'Birdie', breed: 'English Setter', sex: 'F/S', age: '5 yr', owner: 'G. Ito', ownerPhone: '(301) 555-6618', vet: 'Dr. Priya Anand', sites: ['shoulder'], visitType: 'initial', history: 'Forelimb lameness after fall.' }),
    ] },
  { id: 'cd-0611', date: d(2026, 6, 11), clinic: null, status: 'available', patients: [] },
  { id: 'cd-0616', date: d(2026, 6, 16), clinic: 'columbia', status: 'confirmed',
    patients: [
      P({ name: 'Cooper', breed: 'Labrador Retriever', sex: 'M/N', age: '9 yr', owner: 'F. Romano', ownerPhone: '(410) 555-7710', vet: 'Dr. Sam Okafor', sites: ['stifle'], visitType: 'recheck', history: 'Partial CCL, monitoring progression.' }),
      P({ name: 'Nala', breed: 'Doberman', sex: 'F/S', age: '4 yr', owner: 'S. Okafor', ownerPhone: '(410) 555-7712', vet: 'Dr. Sam Okafor', sites: ['achilles'], visitType: 'initial', history: 'Suspected gastrocnemius / common calcaneal injury.' }),
      P({ name: 'Bruno', breed: 'Cane Corso', sex: 'M/N', age: '3 yr', owner: 'V. Russo', ownerPhone: '(443) 555-7714', vet: 'Dr. Sam Okafor', sites: ['elbow', 'carpus'], visitType: 'initial', demeanor: 'reactive', history: 'Forelimb lameness; needs careful handling.' }),
      P({ name: 'Ivy', breed: 'Jack Russell Terrier', sex: 'F/S', age: '6 yr', owner: 'H. Bauer', ownerPhone: '(410) 555-7719', vet: 'Dr. Sam Okafor', sites: ['iliopsoas', 'piriformis'], visitType: 'initial', demeanor: 'anxious', history: 'Reluctant to jump onto furniture; possible hip/pelvic pain.' }),
    ] },
  { id: 'cd-0618', date: d(2026, 6, 18), clinic: null, status: 'available', reservedFor: 'catonsville', patients: [] },

  // ---- California trip (monthly) ----
  { id: 'cd-0623', date: d(2026, 6, 23), clinic: 'sanramon', status: 'confirmed',
    patients: [
      P({ name: 'Atlas', breed: 'Greyhound', sex: 'M/N', age: '4 yr', owner: 'P. Nakamura', ownerPhone: '(925) 555-8810', vet: 'Dr. Grace Lindqvist', sites: ['tarsus'], visitType: 'initial', history: 'Ex-racer, chronic tarsal lameness.' }),
      P({ name: 'Sage', breed: 'Border Collie', sex: 'F/S', age: '5 yr', owner: 'L. Fontaine', ownerPhone: '(925) 555-8812', vet: 'Dr. Grace Lindqvist', sites: ['iliopsoas', 'piriformis'], visitType: 'initial', demeanor: 'anxious', history: 'Agility champion, hind-end performance loss.' }),
      P({ name: 'Koda', breed: 'Siberian Husky', sex: 'M/I', age: '3 yr', owner: 'R. Castillo', ownerPhone: '(925) 555-8814', vet: 'Dr. Grace Lindqvist', sites: ['stifle'], visitType: 'initial', demeanor: 'reactive', history: 'Acute hind-limb non-weight-bearing.' }),
      P({ name: 'Penny', breed: 'Cocker Spaniel', sex: 'F/S', age: '7 yr', owner: 'D. Abara', ownerPhone: '(925) 555-8819', vet: 'Dr. Grace Lindqvist', sites: ['shoulder'], visitType: 'recheck', history: 'Supraspinatus recheck after shockwave therapy.' }),
    ] },
  { id: 'cd-0624', date: d(2026, 6, 24), clinic: 'peninsula', status: 'confirmed',
    patients: [
      P({ name: 'Finn', breed: 'Labrador Retriever', sex: 'M/N', age: '5 yr', owner: 'E. Sorensen', ownerPhone: '(650) 555-9910', vet: 'Dr. Owen Park', sites: ['elbow'], visitType: 'initial', history: 'Working gundog, forelimb lameness.' }),
      P({ name: 'Luna', breed: 'Australian Cattle Dog', sex: 'F/S', age: '4 yr', owner: 'M. Villanueva', vet: 'Dr. Owen Park', sites: ['iliopsoas'], visitType: 'initial', demeanor: 'anxious', history: 'Herding dog; pelvic-limb stiffness.' }),
      P({ name: 'Bear', breed: 'Newfoundland', sex: 'M/N', age: '6 yr', owner: 'J. Halloran', ownerPhone: '(650) 555-9914', vet: 'Dr. Owen Park', sites: ['stifle', 'tarsus'], visitType: 'initial', demeanor: 'calm', history: 'Large-breed hind-limb lameness, chronic.' }),
    ] },
  { id: 'cd-0625', date: d(2026, 6, 25), clinic: null, status: 'available', patients: [] },

  // ---- end of month ----
  { id: 'cd-0630', date: d(2026, 6, 30), clinic: 'severna', status: 'booked',
    patients: [
      P({ name: 'Gus', breed: 'Weimaraner', sex: 'M/N', age: '4 yr', owner: 'A. Lindgren', ownerPhone: '(410) 555-1210', vet: 'Dr. Helen Wu', sites: ['shoulder', 'elbow'], visitType: 'initial', history: 'Forelimb lameness, sporting dog.' }),
      P({ name: 'Dottie', breed: 'Dalmatian', sex: 'F/S', age: '3 yr', owner: 'C. Mwangi', ownerPhone: '(410) 555-1214', vet: 'Dr. Helen Wu', sites: ['carpus'], visitType: 'initial', history: 'Carpal hyperextension suspected.' }),
    ] },
];

/* ============================================================
   HELPERS
   ============================================================ */
const SCHED_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SCHED_WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* ---- Incoming DICOM studies (auto-sent from clinic modalities) ----
   In production a DICOM receiver (DIMSE C-STORE SCP or DICOMweb STOW-RS)
   accepts these; here they're seeded to demo the routing inbox.
   route: null | 'schedule' | 'remote'  ·  match: patient/case guess */
const SCHED_INCOMING = [
  { id: 'st-1', patient: 'Ranger', modality: 'US', desc: 'MSK Ultrasound — Pelvic Limb', images: 148, from: 'bowie', device: 'GE LOGIQ e', receivedAt: d(2026, 6, 2), matchDay: 'cd-0602', matchName: 'Ranger', route: null, status: 'unrouted' },
  { id: 'st-2', patient: 'Tank', modality: 'CR', desc: 'Radiographs — Stifle / Tarsus', images: 4, from: 'bowie', device: 'IDEXX ImageVue', receivedAt: d(2026, 6, 2), matchDay: 'cd-0602', matchName: 'Tank', route: null, status: 'unrouted' },
  { id: 'st-3', patient: 'ATLAS^K9', modality: 'US', desc: 'Shoulder US — bilateral', images: 92, from: 'frederick', device: 'Sonosite Edge II', receivedAt: d(2026, 5, 31), matchCase: 'CASE-2026-0145', matchName: 'Atlas', route: null, status: 'unrouted' },
  { id: 'st-4', patient: 'Unknown', modality: 'US', desc: 'Study missing patient name', images: 61, from: 'annapolis', device: 'Mindray Vetus', receivedAt: d(2026, 6, 1), route: null, status: 'unrouted' },
];

function schedMoney(n) {
  const v = Math.round(Number(n) || 0);
  return '$' + v.toLocaleString('en-US');
}
/* Price with a hospital's own rates when it has them, so previews and
   calendar totals agree with the invoice. */
function schedWithClinicRates(clinicId, fn) {
  const R = window.SchedRates, A = window.SchedAccounts;
  const c = clinicId && window.SCHED && window.SCHED.clinic ? window.SCHED.clinic(clinicId) : null;
  if (!R || !A || !c) return fn();
  const restore = R.applyOverrides(A.fromClinic(c));
  try { return fn(); } finally { R.restore(restore); }
}
function schedRate(p, clinicId) {
  const B = window.SchedBill;
  if (B) return schedWithClinicRates(clinicId, () => B.patientTotal(p));
  return (SCHED_RATES[p.service] || SCHED_RATES.initial).amount;
}
/* Invoice total = services + manual charges/credits. */
function schedDayTotal(day) {
  const B = window.SchedBill;
  if (B) return schedWithClinicRates(day && day.clinic, () => B.total(day));
  return (day.patients || []).reduce((s, p) => s + (p.cancelled ? 0 : schedRate(p)), 0);
}
function schedActive(day) {
  return (day.patients || []).filter(p => !p.cancelled);
}
function schedSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
/* sedation logic — required for iliopsoas (dorsal recumbency) or a reactive/anxious demeanor flag */
function schedSedation(p) {
  const hasIlio = (p.sites || []).some(s => SCHED_SITE(s).sedation);
  if (hasIlio) return { required: true, reason: 'Iliopsoas scan — patient positioned in dorsal recumbency.' };
  if (p.demeanor === 'reactive') return { required: true, reason: 'Flagged reactive on intake — sedation for safe handling.' };
  if (p.demeanor === 'anxious') return { required: false, likely: true, reason: 'Flagged anxious — sedation may be needed; confirm day-of.' };
  return { required: false, reason: '' };
}
/* "F/?" is the internal token for "neuter status not stated" — never print the ?. */
/* Working role / sport — changes what Dr. Canapp expects to find. */
const SCHED_OCCUPATIONS = ['Companion', 'Agility', 'Obedience', 'Flyball', 'Dock diving', 'Herding', 'Field trial / hunting', 'Conformation', 'Racing', 'Sled / carting', 'Search & rescue', 'Service dog', 'Police / military', 'Working farm dog', 'Barn hunt', 'Lure coursing', 'Weight pull', 'Breeding'];

function schedFmtSex(sex, long) {
  const s = String(sex || '').trim();
  if (!s) return '—';
  if (/\/\?$/.test(s)) { const l = s[0].toUpperCase(); return long ? l + ' (status not confirmed)' : l; }
  return s;
}
/* Drop stale "missing field" flags once the field has been filled in. */
function schedLiveFlags(p) {
  const flags = (p && p.aiSummary && p.aiSummary.flags) || [];
  return flags.filter(f => !(f.level === 'missing' && f.field && p[f.field]));
}

function schedFmtLong(dt) {
  return `${SCHED_WD[dt.getDay()]}, ${SCHED_MONTHS[dt.getMonth()]} ${dt.getDate()}`;
}

window.SCHED_OCCUPATIONS = SCHED_OCCUPATIONS;
window.SCHED = {
  TODAY: SCHED_TODAY,
  CLINICS: SCHED_CLINICS, clinic: SCHED_CLINIC, clinicColor: SCHED_CLINIC_COLOR,
  PALETTE: SCHED_PALETTE, WEEKDAYS: SCHED_WEEKDAYS,
  SITES: SCHED_SITES, site: SCHED_SITE,
  RATES: SCHED_RATES,
  DAYS: SCHED_DAYS,
  MONTHS: SCHED_MONTHS, WD: SCHED_WD,
  INCOMING: SCHED_INCOMING,
  money: schedMoney, rate: schedRate, dayTotal: schedDayTotal, active: schedActive,
  withClinicRates: schedWithClinicRates,
  RECHECK_WINDOW_MONTHS: SCHED_RECHECK_WINDOW_MONTHS,
  sameDay: schedSameDay, sedation: schedSedation, fmtLong: schedFmtLong, iso,
  fmtSex: schedFmtSex, liveFlags: schedLiveFlags, occupations: SCHED_OCCUPATIONS,
  makeId: () => 'p' + (++_pid),
  buildInvoiceHTML: schedBuildInvoiceHTML,
  buildReceiptHTML: schedBuildReceiptHTML,
};

/* ---- Invoice document — serves BOTH applications ------------
   Takes a billable entity: an in-person clinic day, or a monthly
   remote-read statement. Lines come from the shared engine, so the
   document never needs to know which kind it is beyond the wording. */
function schedBuildInvoiceHTML(e) {
  const S = window.SCHED, B = window.SchedBill;
  const acct = e.account || {};
  const inv = e.invoice || {};
  const remote = e.kind === 'remote';
  const lines = B.lines(e);
  const total = B.total(e), subtotal = B.subtotal(e);
  const paidAmt = B.paid(inv, e), balance = B.balance(e);
  const paid = balance <= 0 && total > 0;
  const issued = inv.issued ? new Date(inv.issued) : new Date();
  const due = B.due(e);
  const termsDays = inv.termsDays || B.TERMS_DAYS;
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmtD = (dt) => dt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  const rows = lines.map((l, i) => {
    const firstForWho = i === 0 || lines[i - 1].who !== l.who;
    return `
    <tr${firstForWho ? '' : ' class="sub"'}>
      <td>${firstForWho ? `<div class="li-pat">${esc(l.who || '')}</div>` : ''}</td>
      <td class="li-svc">${esc(l.label)}${l.qty > 1 ? ' × ' + l.qty : ''}${l.detail ? `<div class="li-sites">${esc(l.detail)}</div>` : ''}</td>
      <td class="li-amt">${S.money(l.amount)}</td>
    </tr>`;
  }).join('');

  const cancelled = remote ? [] : (e.patients || []).filter(p => p.cancelled);
  const cxRows = cancelled.map(p => `
    <tr class="cx"><td><div class="li-pat">${esc(p.name)}</div></td><td class="li-svc">Cancelled — not billed</td><td class="li-amt">—</td></tr>`).join('');

  const chargeRows = ((inv.charges) || []).map(c => {
    const sign = B.chargeSign(c), label = B.chargeLabel(c), detail = B.chargeDetail(c);
    return `
    <tr class="adj">
      <td><div class="li-pat adj">${sign < 0 ? 'Credit' : 'Charge'}</div></td>
      <td class="li-svc">${esc(label)}${detail ? `<div class="li-sites">${esc(detail)}</div>` : ''}</td>
      <td class="li-amt">${sign < 0 ? '−' : ''}${S.money(c.amount)}</td>
    </tr>`;
  }).join('');

  const payRows = ((inv.payments) || []).map(p => `
    <tr class="pay-line">
      <td></td>
      <td class="li-svc">Payment received — ${esc(B.method(p.method).label)}${p.ref ? ' · ' + esc(p.ref) : ''}<div class="li-sites">${esc(new Date(p.date + 'T12:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }))}</div></td>
      <td class="li-amt">−${S.money(p.amount)}</td>
    </tr>`).join('');

  const refLine = remote
    ? `Remote reads for <strong>${esc(S.MONTHS[e.period.m])} ${e.period.y}</strong> &nbsp;·&nbsp; ${esc(B.count(e))} finalized and delivered`
    : `Clinic day: <strong>${esc(schedFmtLong(new Date(e.date)))}, ${new Date(e.date).getFullYear()}</strong> &nbsp;·&nbsp; ${esc(B.count(e))} seen in person`;

  return `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(inv.number || 'Invoice')} · ${esc(acct.name || 'Account')}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  @page { size: letter; margin: 0.7in; }
  * { box-sizing: border-box; }
  body { font-family: 'Inter', sans-serif; color: #1f231f; max-width: 7.1in; margin: 0 auto; padding: 34px 30px; line-height: 1.5; font-size: 13px; position: relative; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1f231f; padding-bottom: 20px; margin-bottom: 24px; }
  .brand-row { display: flex; align-items: center; gap: 14px; }
  .brand-logo { width: 64px; height: 64px; object-fit: contain; }
  .brand-txt { font-family: 'Cormorant Garamond', serif; font-size: 24px; letter-spacing: -0.01em; line-height: 1.05; }
  .brand-txt .sub { font-family: 'Inter', sans-serif; font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: #8a8f86; margin-top: 6px; font-weight: 600; }
  .brand-txt .em { font-size: 11px; color: #555; margin-top: 6px; }
  .inv-meta { text-align: right; }
  .inv-meta .word { font-family: 'Cormorant Garamond', serif; font-size: 32px; letter-spacing: 0.03em; line-height: 1; }
  .inv-meta .num { font-size: 11px; letter-spacing: 0.14em; color: #b16a48; font-weight: 600; margin-top: 5px; }
  .inv-meta .date { font-size: 11px; color: #555; margin-top: 5px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 20px; }
  .parties h4 { font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase; color: #8a8f86; margin: 0 0 6px; font-weight: 700; }
  .parties p { margin: 0; font-size: 13px; line-height: 1.5; }
  .parties .cdot { display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:6px; vertical-align: middle; }
  .visit-ref { font-size: 11px; color: #555; margin-bottom: 16px; padding: 9px 0; border-top: 1px solid #e6e1d6; border-bottom: 1px solid #e6e1d6; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  thead th { text-align: left; font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: #8a8f86; font-weight: 700; border-bottom: 1.5px solid #1f231f; padding: 0 0 8px; }
  thead th:last-child { text-align: right; }
  tbody td { padding: 11px 0; border-bottom: 1px solid #e6e1d6; vertical-align: top; }
  .li-pat { font-family: 'Cormorant Garamond', serif; font-size: 16px; }
  .li-svc { font-size: 12.5px; }
  .li-sites { font-size: 11px; color: #b16a48; margin-top: 2px; }
  .li-amt { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; font-family: 'Cormorant Garamond', serif; font-size: 16px; }
  tr.sub td { border-bottom: 1px solid #f2eee5; padding-top: 4px; }
  tr.cx td { color: #aaa; }
  tr.cx .li-pat { text-decoration: line-through; font-size: 14px; }
  tr.adj .li-pat.adj { font-family: 'Inter', sans-serif; font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: #8a8f86; font-weight: 700; }
  tr.pay-line td { color: #1f8a5b; }
  .foot-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-top: 6px; }
  .totals { width: 300px; margin-left: auto; }
  .totals .tline { display: flex; justify-content: space-between; font-size: 12px; padding: 4px 0; color: #555; }
  .totals .tline.strong { color: #1f231f; font-weight: 600; border-top: 1px solid #e6e1d6; margin-top: 4px; padding-top: 8px; }
  .totals .grand { display: flex; justify-content: space-between; align-items: baseline; border-top: 2px solid #1f231f; padding-top: 12px; }
  .totals .grand .lab { font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: #8a8f86; font-weight: 700; }
  .totals .grand .val { font-family: 'Cormorant Garamond', serif; font-size: 30px; letter-spacing: -0.02em; }
  .paid-stamp { display: inline-block; margin-top: 4px; padding: 12px 30px; border: 4px solid #1f8a5b; color: #1f8a5b; font-size: 34px; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 800; transform: rotate(-6deg); border-radius: 6px; box-shadow: 0 0 0 2px rgba(31,138,91,0.12) inset; }
  .unpaid-stamp { display: inline-block; margin-top: 4px; padding: 10px 24px; border: 3px solid #c24444; color: #c24444; font-size: 24px; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 800; transform: rotate(-4deg); border-radius: 6px; }
  .wo-stamp { display: inline-block; margin-top: 4px; padding: 10px 24px; border: 3px solid #8a8f86; color: #8a8f86; font-size: 20px; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 800; transform: rotate(-4deg); border-radius: 6px; }
  .pay { margin-top: 26px; padding-top: 16px; border-top: 1px solid #e6e1d6; font-size: 12px; color: #444; }
  .pay strong { color: #1f231f; }
  .pay .how { margin-top: 12px; }
  .pay .how h5 { font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase; color: #8a8f86; margin: 0 0 6px; font-weight: 700; }
  .pay .how ol { margin: 0; padding-left: 18px; }
  .pay .how li { margin-bottom: 4px; line-height: 1.5; }
  .pay .q { margin-top: 12px; color: #777; font-size: 11.5px; }
  .pay .stat-note { margin-top: 12px; padding: 9px 12px; border-left: 3px solid #b16a48; background: #faf7f2; font-size: 11px; line-height: 1.55; color: #555; }
  .pay .stat-note strong { color: #1f231f; }
  footer { margin-top: 22px; font-size: 10px; color: #9a9f96; line-height: 1.6; }
  @media print { .noprint { display: none; } }
  .noprint { text-align: center; margin-bottom: 18px; }
  .noprint button { font: inherit; padding: 9px 18px; background: #1f231f; color: #fff; border: none; cursor: pointer; letter-spacing: 0.04em; }
</style></head><body>
<div class="noprint"><button onclick="window.print()">Print / Save as PDF</button></div>
<div class="top">
  <div class="brand-row">
    <img class="brand-logo" src="assets/logo-mark.png" alt="" onerror="this.style.display='none'">
    <div class="brand-txt">Dr. Debra Canapp<div class="sub">${remote ? 'Remote MSK Ultrasound Reads' : 'In-Person MSK Ultrasound'}</div><div class="em">info@DrDebraCanapp.com</div></div>
  </div>
  <div class="inv-meta">
    <div class="word">${remote ? 'Statement' : 'Invoice'}</div>
    <div class="num">${esc(inv.number || '')}</div>
    <div class="date">${fmtD(issued)}</div>
  </div>
</div>
<div class="parties">
  <div><h4>Billed to</h4><p><span class="cdot" style="background:${acct.color || '#8B9482'}"></span><strong>${esc(acct.billTo || acct.name || 'Account')}</strong><br>${esc(acct.attn || '')}<br>${esc(acct.address || '')}<br>${esc(acct.email || '')}</p></div>
  <div><h4>From</h4><p>Dr. Debra Canapp, DVM, DACVSMR<br>info@DrDebraCanapp.com</p></div>
</div>
<div class="visit-ref">${refLine}</div>
<table>
  <thead><tr><th>${remote ? 'Patient' : 'Patient'}</th><th>Service</th><th>Amount</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="3" style="color:#999">No line items.</td></tr>'}${cxRows}${chargeRows}${payRows}</tbody>
</table>
<div class="foot-row">
  <div>${inv.writtenOff ? '<div class="wo-stamp">Written off</div>' : paid ? '<div class="paid-stamp">Paid</div>' : paidAmt > 0 ? '<div class="unpaid-stamp">Part paid</div>' : '<div class="unpaid-stamp">Unpaid</div>'}</div>
  <div class="totals">
    ${(inv.charges || []).length || paidAmt > 0 ? `<div class="tline"><span>Services</span><span>${S.money(subtotal)}</span></div>` : ''}
    ${(inv.charges || []).length ? `<div class="tline"><span>Adjustments</span><span>${S.money(total - subtotal)}</span></div>` : ''}
    <div class="tline strong"><span>${remote ? 'Statement' : 'Invoice'} total</span><span>${S.money(total)}</span></div>
    ${paidAmt > 0 ? `<div class="tline"><span>Paid to date</span><span>−${S.money(paidAmt)}</span></div>` : ''}
    <div class="grand"><span class="lab">${balance > 0 ? 'Balance due' : 'Balance'}</span><span class="val">${S.money(balance)}</span></div>
  </div>
</div>
<div class="pay">
  <strong>Terms: Net ${termsDays}${due ? ' — payment due ' + fmtD(due) : ''}.</strong>
  <div class="how"><h5>How to pay</h5><ol>${B.payLines(e).map(l => `<li>${esc(l)}</li>`).join('')}</ol></div>
  ${B.hasStat(e) ? `<div class="stat-note"><strong>STAT reads.</strong> ${esc(B.STAT_DISCLAIMER)}</div>` : ''}
  <div class="q">Questions about this ${remote ? 'statement' : 'invoice'}? Reply to the email it came with, or write to info@DrDebraCanapp.com.</div>
</div>
<footer>${remote
  ? 'This statement covers diagnostic musculoskeletal ultrasound studies submitted by the practice named above and read remotely by Dr. Canapp during the period shown. Each read covers one bilateral anatomical region unless otherwise noted. No tax applied.'
  : 'This invoice covers in-person diagnostic musculoskeletal ultrasound and injection procedures performed at the hospital named above, batched for all patients seen on the visit date. Injection fees include up to four ultrasound-guided or intra-articular sites; each additional site is billed separately. No tax applied.'}</footer>
</body></html>`;
}

/* ---- Payment receipt — either kind --------------------------- */
function schedBuildReceiptHTML(e) {
  const S = window.SCHED, B = window.SchedBill;
  const acct = e.account || {};
  const inv = e.invoice || {};
  const remote = e.kind === 'remote';
  const total = B.total(e);
  const payments = inv.payments || [];
  const paidAmt = B.paid(inv, e);
  const last = payments.length ? payments[payments.length - 1] : null;
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmtD = (dt) => dt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const payRows = payments.map(p => `
    <tr>
      <td>${esc(fmtD(new Date(p.date + 'T12:00')))}</td>
      <td>${esc(B.method(p.method).label)}${p.ref ? '<div class="ref">' + esc(p.ref) + '</div>' : ''}</td>
      <td class="amt">${S.money(p.amount)}</td>
    </tr>`).join('');
  const covers = remote
    ? `the remote musculoskeletal ultrasound reads completed in ${esc(S.MONTHS[e.period.m])} ${e.period.y}`
    : `the clinic held ${esc(schedFmtLong(new Date(e.date)))}, ${new Date(e.date).getFullYear()}`;

  return `<!doctype html><html><head><meta charset="utf-8">
<title>Receipt · ${esc(inv.number || '')}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  @page { size: letter; margin: 0.7in; }
  * { box-sizing: border-box; }
  body { font-family: 'Inter', sans-serif; color: #1f231f; max-width: 7.1in; margin: 0 auto; padding: 34px 30px; line-height: 1.5; font-size: 13px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1f231f; padding-bottom: 20px; margin-bottom: 24px; }
  .brand-row { display: flex; align-items: center; gap: 14px; }
  .brand-logo { width: 64px; height: 64px; object-fit: contain; }
  .brand-txt { font-family: 'Cormorant Garamond', serif; font-size: 24px; line-height: 1.05; }
  .brand-txt .sub { font-family: 'Inter', sans-serif; font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: #8a8f86; margin-top: 6px; font-weight: 600; }
  .meta { text-align: right; }
  .meta .word { font-family: 'Cormorant Garamond', serif; font-size: 32px; letter-spacing: 0.03em; line-height: 1; }
  .meta .num { font-size: 11px; letter-spacing: 0.14em; color: #b16a48; font-weight: 600; margin-top: 5px; }
  .thanks { font-family: 'Cormorant Garamond', serif; font-size: 22px; margin: 0 0 6px; }
  .lede { color: #555; margin: 0 0 22px; font-size: 13px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 22px; }
  .parties h4 { font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase; color: #8a8f86; margin: 0 0 6px; font-weight: 700; }
  .parties p { margin: 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
  thead th { text-align: left; font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: #8a8f86; font-weight: 700; border-bottom: 1.5px solid #1f231f; padding: 0 0 8px; }
  thead th:last-child { text-align: right; }
  tbody td { padding: 10px 0; border-bottom: 1px solid #e6e1d6; vertical-align: top; }
  .amt { text-align: right; font-variant-numeric: tabular-nums; font-family: 'Cormorant Garamond', serif; font-size: 16px; }
  .ref { font-size: 11px; color: #888; margin-top: 2px; }
  .settled { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-top: 8px; }
  .stamp { display: inline-block; padding: 12px 30px; border: 4px solid #1f8a5b; color: #1f8a5b; font-size: 30px; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 800; transform: rotate(-6deg); border-radius: 6px; }
  .totals { width: 300px; margin-left: auto; }
  .totals .tline { display: flex; justify-content: space-between; font-size: 12px; padding: 4px 0; color: #555; }
  .totals .grand { display: flex; justify-content: space-between; align-items: baseline; border-top: 2px solid #1f231f; padding-top: 12px; margin-top: 4px; }
  .totals .grand .lab { font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: #8a8f86; font-weight: 700; }
  .totals .grand .val { font-family: 'Cormorant Garamond', serif; font-size: 30px; }
  footer { margin-top: 26px; padding-top: 16px; border-top: 1px solid #e6e1d6; font-size: 10px; color: #9a9f96; line-height: 1.6; }
  @media print { .noprint { display: none; } }
  .noprint { text-align: center; margin-bottom: 18px; }
  .noprint button { font: inherit; padding: 9px 18px; background: #1f231f; color: #fff; border: none; cursor: pointer; letter-spacing: 0.04em; }
</style></head><body>
<div class="noprint"><button onclick="window.print()">Print / Save as PDF</button></div>
<div class="top">
  <div class="brand-row">
    <img class="brand-logo" src="assets/logo-mark.png" alt="" onerror="this.style.display='none'">
    <div class="brand-txt">Dr. Debra Canapp<div class="sub">${remote ? 'Remote MSK Ultrasound Reads' : 'In-Person MSK Ultrasound'}</div></div>
  </div>
  <div class="meta">
    <div class="word">Receipt</div>
    <div class="num">${esc(inv.number || '')}</div>
    <div style="font-size:11px;color:#555;margin-top:5px">${esc(last ? fmtD(new Date(last.date + 'T12:00')) : fmtD(new Date()))}</div>
  </div>
</div>
<p class="thanks">Thank you — paid in full.</p>
<p class="lede">This confirms payment received against ${remote ? 'statement' : 'invoice'} ${esc(inv.number || '')}, covering ${covers}.</p>
<div class="parties">
  <div><h4>Received from</h4><p><strong>${esc(acct.billTo || acct.name || 'Account')}</strong><br>${esc(acct.attn || '')}<br>${esc(acct.address || '')}</p></div>
  <div><h4>Received by</h4><p>Dr. Debra Canapp, DVM, DACVSMR<br>info@DrDebraCanapp.com</p></div>
</div>
<table>
  <thead><tr><th>Date</th><th>Method</th><th>Amount</th></tr></thead>
  <tbody>${payRows || '<tr><td colspan="3" style="color:#999">No payments recorded.</td></tr>'}</tbody>
</table>
<div class="settled">
  <div><div class="stamp">Paid</div></div>
  <div class="totals">
    <div class="tline"><span>${remote ? 'Statement' : 'Invoice'} total</span><span>${S.money(total)}</span></div>
    <div class="tline"><span>Total received</span><span>${S.money(paidAmt)}</span></div>
    <div class="grand"><span class="lab">Balance</span><span class="val">${S.money(Math.max(0, total - paidAmt))}</span></div>
  </div>
</div>
<footer>Retain this receipt for your records. No tax applied.${(B && B.payCfg().portalUrl) ? ' Every statement and payment on your account is available any time at ' + esc(B.payCfg().portalUrl) + '.' : ''}</footer>
</body></html>`;
}
