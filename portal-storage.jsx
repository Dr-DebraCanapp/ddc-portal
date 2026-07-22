/* global React */
/* Portal storage — IndexedDB wrapper for blob persistence */

const DB_NAME = 'ddc_portal_v2';
const DB_VERSION = 1;
const STORE_FILES = 'files';
const STORE_CASES = 'cases';
const STORE_ANNOTATIONS = 'annotations';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        const fs = db.createObjectStore(STORE_FILES, { keyPath: 'id' });
        fs.createIndex('byCase', 'caseId');
      }
      if (!db.objectStoreNames.contains(STORE_CASES)) {
        db.createObjectStore(STORE_CASES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_ANNOTATIONS)) {
        db.createObjectStore(STORE_ANNOTATIONS, { keyPath: 'fileId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(storeName, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(storeName, mode).objectStore(storeName);
}

async function putFile({ id, caseId, kind, name, type, size, blob }) {
  const store = await tx(STORE_FILES, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put({ id, caseId, kind, name, type, size, blob, addedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getFile(id) {
  const store = await tx(STORE_FILES);
  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getCaseFiles(caseId) {
  const store = await tx(STORE_FILES);
  const idx = store.index('byCase');
  return new Promise((resolve, reject) => {
    const req = idx.getAll(caseId);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function deleteFile(id) {
  const store = await tx(STORE_FILES, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function deleteCaseFiles(caseId) {
  const files = await getCaseFiles(caseId);
  await Promise.all(files.map(f => deleteFile(f.id)));
}

async function saveAnnotations(fileId, toolState) {
  const store = await tx(STORE_ANNOTATIONS, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put({ fileId, toolState, savedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function loadAnnotations(fileId) {
  const store = await tx(STORE_ANNOTATIONS);
  return new Promise((resolve, reject) => {
    const req = store.get(fileId);
    req.onsuccess = () => resolve(req.result ? req.result.toolState : null);
    req.onerror = () => reject(req.error);
  });
}

async function putCase(c) {
  const store = await tx(STORE_CASES, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(c);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getCase(id) {
  const store = await tx(STORE_CASES);
  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllCases() {
  const store = await tx(STORE_CASES);
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result || []).sort((a, b) => new Date(b.submitted) - new Date(a.submitted)));
    req.onerror = () => reject(req.error);
  });
}

async function deleteCase(id) {
  await deleteCaseFiles(id);
  const store = await tx(STORE_CASES, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Quota check
async function storageEstimate() {
  if (navigator.storage && navigator.storage.estimate) {
    const e = await navigator.storage.estimate();
    return { usage: e.usage || 0, quota: e.quota || 0 };
  }
  return { usage: 0, quota: 0 };
}

// Seed demo cases if none exist
async function ensureSeeded() {
  const cases = await getAllCases();
  if (cases.length > 0) {
    // also seed applications if missing
    if (getApplications().length === 0) seedApplications();
    return;
  }
  const seeds = [
    {
      id: 'CASE-2026-0145',
      patient: 'Atlas',
      species: 'Canine',
      breed: 'Dutch Shepherd',
      age: '3 yrs',
      sex: 'MI',
      weight: '28 kg',
      complaint: 'Acute right shoulder lameness following protection-bite work. Working K9 — handler reports drop in drive on the bite, off-loading right forelimb after sustained pursuit.',
      duration: '9 days',
      referringVet: 'Dr. Sarah Whitlock, DVM',
      referringClinic: 'Frederick County Working Dog Veterinary',
      referringEmail: 'swhitlock@fcwdv.com',
      examFindings: 'Marked discomfort on biceps/supraspinatus palpation. Reduced shoulder flexion ROM. Body condition 5/9. Otherwise NSF.',
      submitted: '2026-05-27T09:14:00Z',
      status: 'submitted',
      seeded: true,
      files: { dicom: 4, rads: 2, history: 1, video: 1 },
      timeline: [
        { t: 'Case submitted', ts: 'May 27 · 9:14 AM', done: true },
        { t: 'Awaiting acknowledgment', ts: 'Pending', done: false },
        { t: 'In review by Dr. Canapp', ts: 'Pending', done: false },
        { t: 'Report drafted', ts: 'Pending', done: false },
        { t: 'Report delivered', ts: 'Pending', done: false },
      ],
    },
    {
      id: 'CASE-2026-0144',
      patient: 'June',
      species: 'Canine',
      breed: 'Labrador Retriever',
      age: '7 yrs',
      sex: 'FS',
      weight: '29 kg',
      complaint: 'Bilateral hindlimb stiffness, worse after rest. Owner reports difficulty rising. Suspected iliopsoas vs. lumbosacral.',
      duration: '3 months',
      referringVet: 'Dr. Mark Reilly, DVM, CCRT',
      referringClinic: 'Bay Area Sports Medicine',
      referringEmail: 'mreilly@basmvet.com',
      examFindings: 'Iliopsoas stretch positive bilaterally, more pronounced on the right. Bunny-hop gait. No spinal pain on palpation.',
      submitted: '2026-05-26T15:42:00Z',
      status: 'submitted',
      seeded: true,
      files: { dicom: 6, rads: 0, history: 2, video: 1 },
      timeline: [
        { t: 'Case submitted', ts: 'May 26 · 3:42 PM', done: true },
        { t: 'Awaiting acknowledgment', ts: 'Pending', done: false },
        { t: 'In review by Dr. Canapp', ts: 'Pending', done: false },
        { t: 'Report drafted', ts: 'Pending', done: false },
        { t: 'Report delivered', ts: 'Pending', done: false },
      ],
    },
    {
      id: 'CASE-2026-0142',
      patient: 'Riggs',
      species: 'Canine',
      breed: 'Belgian Malinois',
      age: '5 yrs',
      sex: 'MN',
      weight: '32 kg',
      complaint: 'Intermittent left forelimb lameness, suspected biceps tendinopathy. Failed 6 weeks NSAID + rest.',
      duration: '4 months',
      referringVet: 'Dr. Helena Park, DVM',
      referringClinic: 'Northgate Veterinary Center',
      referringEmail: 'hpark@northgatevet.com',
      examFindings: 'Painful response on biceps test bilaterally, worse on the left. Mild scapular asymmetry on stance.',
      submitted: '2026-05-18T14:24:00Z',
      status: 'review',
      seeded: true,
      files: { dicom: 3, rads: 2, history: 1, video: 1 },
      timeline: [
        { t: 'Case submitted', ts: 'May 18 · 2:24 PM', done: true },
        { t: 'Acknowledged by reviewer', ts: 'May 18 · 4:11 PM', done: true },
        { t: 'In review by Dr. Canapp', ts: 'May 21 · 9:32 AM', done: true },
        { t: 'Report drafted', ts: 'Pending', done: false },
        { t: 'Report delivered', ts: 'Pending', done: false },
      ],
    },
    {
      id: 'CASE-2026-0138',
      patient: 'Mabel',
      species: 'Canine',
      breed: 'Border Collie',
      age: '8 yrs',
      sex: 'FS',
      weight: '18 kg',
      complaint: 'Chronic right hindlimb lameness; iliopsoas strain suspected. Existing radiographs unremarkable.',
      duration: '6 weeks',
      referringVet: 'Dr. Antonio Suarez, DVM',
      referringClinic: 'Coastal Canine Rehabilitation',
      referringEmail: 'asuarez@coastalcanine.com',
      examFindings: 'Mild discomfort on iliopsoas stretch. Normal stifle, no effusion. Pelvic limb strength symmetrical.',
      submitted: '2026-05-12T10:08:00Z',
      status: 'reported',
      seeded: true,
      files: { dicom: 4, rads: 3, history: 2, video: 2 },
      timeline: [
        { t: 'Case submitted', ts: 'May 12 · 10:08 AM', done: true },
        { t: 'Acknowledged by reviewer', ts: 'May 12 · 11:32 AM', done: true },
        { t: 'In review by Dr. Canapp', ts: 'May 14 · 8:45 AM', done: true },
        { t: 'Report drafted', ts: 'May 16 · 6:18 PM', done: true },
        { t: 'Report delivered', ts: 'May 17 · 9:02 AM', done: true },
      ],
      report: {
        findings: 'Right iliopsoas: marked hypoechoic disruption of the cranial belly with loss of fiber pattern over a ~2.4 cm segment. Mild peri-tendinous edema. Origin and insertion intact.\n\nLeft iliopsoas: normal echogenicity and architecture. No evidence of contralateral injury.\n\nHip joints: no effusion bilaterally. Coxofemoral capsules within normal limits.',
        impression: 'Grade II right iliopsoas muscle-belly strain with active inflammation. No evidence of complete tear or avulsion.',
        recommendations: 'Strict activity restriction × 4 weeks. Recheck ultrasound at 6 weeks to confirm resolution. Consider Class IV laser or shockwave once acute phase resolves. NSAID per practitioner judgement. Gradual return-to-work protocol enclosed.',
        signedBy: 'Debra A. Canapp, DVM, DACVSMR, CCRT, CVA',
        signedAt: '2026-05-16T18:18:00Z',
        finalized: true,
      },
    },
  ];
  for (const s of seeds) await putCase(s);
  if (getApplications().length === 0) seedApplications();
}

function seedApplications() {
  const seedApps = [
    {
      id: 'APP-seed-1',
      name: 'Dr. Priya Ramanathan, DVM',
      license: 'MD-VET-184221',
      clinic: 'Chesapeake Animal Hospital',
      email: 'pramanathan@chesapeakeah.com',
      phone: '+1 410 555 0184',
      country: 'USA',
      state: 'MD',
      specialty: 'Sports Medicine / Rehab',
      why: 'Completed the canine MSK ultrasound course (Spring 2026). Building a sports-medicine arm at our practice and would like access for second-opinion reads on complex shoulder cases.',
      submittedAt: '2026-05-26T11:14:00Z',
      status: 'pending',
    },
    {
      id: 'APP-seed-2',
      name: 'Dr. Ben Holloway, BVSc',
      license: 'UK-RCVS-728114',
      clinic: 'Cotswold Equine & Canine Performance',
      email: 'b.holloway@cecp.co.uk',
      phone: '+44 1453 555 1240',
      country: 'United Kingdom',
      state: 'Gloucestershire',
      specialty: 'Working / Performance Dogs',
      why: 'Working dogs from across the UK and EU come through our practice. Looking for a remote-read pathway to a recognized MSK ultrasound specialist for cases that warrant a second look.',
      submittedAt: '2026-05-25T08:46:00Z',
      status: 'pending',
    },
  ];
  saveApplications(seedApps);
}

// Helper for downloading blobs
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

/* ============================================================
   APPLICATIONS QUEUE (localStorage-backed)
   ============================================================ */
const APPLICATIONS_KEY = 'ddc_portal_applications';
const ACCOUNTS_KEY = 'ddc_portal_accounts';

function getApplications() {
  try { return JSON.parse(localStorage.getItem(APPLICATIONS_KEY)) || []; }
  catch { return []; }
}
function saveApplications(list) {
  localStorage.setItem(APPLICATIONS_KEY, JSON.stringify(list));
}
function submitApplication(data) {
  const apps = getApplications();
  const app = {
    id: `APP-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    submittedAt: new Date().toISOString(),
    status: 'pending',
    ...data,
  };
  apps.unshift(app);
  saveApplications(apps);
  return app;
}
function updateApplication(id, patch) {
  const apps = getApplications();
  const i = apps.findIndex(a => a.id === id);
  if (i >= 0) {
    apps[i] = { ...apps[i], ...patch };
    saveApplications(apps);
    return apps[i];
  }
  return null;
}

function getAccounts() {
  try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY)) || []; }
  catch { return []; }
}
function saveAccounts(list) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
}
function addAccount({ email, password, name, clinic }) {
  const accounts = getAccounts();
  if (accounts.some(a => a.email === email)) return null;
  const acc = { email, password, name, clinic, createdAt: new Date().toISOString() };
  accounts.push(acc);
  saveAccounts(accounts);
  return acc;
}

/* ============================================================
   REPORTS (per-case structured report, stored on case object)
   ============================================================ */
async function saveReport(caseId, report) {
  const c = await getCase(caseId);
  if (!c) return null;
  c.report = { ...report, updatedAt: new Date().toISOString() };
  await putCase(c);
  return c;
}

/* ============================================================
   CASE COMMENTS — post-report Q&A thread (vet ↔ reviewer)
   ============================================================ */
async function getComments(caseId) {
  const c = await getCase(caseId);
  return (c && c.comments) || [];
}
async function addComment(caseId, { role, name, text }) {
  const c = await getCase(caseId);
  if (!c) return null;
  if (!c.comments) c.comments = [];
  c.comments.push({
    id: `CM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    role: role || 'vet',
    name: name || 'Unknown',
    text: (text || '').trim(),
    ts: new Date().toISOString(),
  });
  await putCase(c);
  return c.comments;
}
async function getAllComments() {
  const cases = await getAllCases();
  const out = [];
  cases.forEach(c => (c.comments || []).forEach(cm => out.push({ case_id: c.id, role: cm.role, ts: cm.ts })));
  return out;
}

/* ============================================================
   REPORT FIGURES (annotated image snapshots attached to a case)
   Each figure: { id, dataUrl (PNG base64), caption, sourceName, createdAt }
   ============================================================ */
async function addReportFigure(caseId, figure) {
  const c = await getCase(caseId);
  if (!c) return null;
  c.reportFigures = c.reportFigures || [];
  const fig = {
    id: `FIG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    dataUrl: figure.dataUrl,
    caption: figure.caption || '',
    sourceName: figure.sourceName || '',
    createdAt: new Date().toISOString(),
  };
  c.reportFigures.push(fig);
  await putCase(c);
  return fig;
}
async function getReportFigures(caseId) {
  const c = await getCase(caseId);
  return (c && c.reportFigures) || [];
}
async function updateReportFigure(caseId, figureId, patch) {
  const c = await getCase(caseId);
  if (!c || !c.reportFigures) return null;
  c.reportFigures = c.reportFigures.map(f => f.id === figureId ? { ...f, ...patch } : f);
  await putCase(c);
  return c.reportFigures;
}
async function deleteReportFigure(caseId, figureId) {
  const c = await getCase(caseId);
  if (!c || !c.reportFigures) return null;
  c.reportFigures = c.reportFigures.filter(f => f.id !== figureId);
  await putCase(c);
  return c.reportFigures;
}
async function moveReportFigure(caseId, figureId, dir) {
  const c = await getCase(caseId);
  if (!c || !c.reportFigures) return null;
  const arr = c.reportFigures;
  const i = arr.findIndex(f => f.id === figureId);
  if (i < 0) return arr;
  const j = dir === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= arr.length) return arr;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  c.reportFigures = arr;
  await putCase(c);
  return c.reportFigures;
}

async function saveInvoice(caseId, invoice) {
  const c = await getCase(caseId);
  if (!c) return null;
  c.invoice = invoice;
  await putCase(c);
  return c;
}

async function setInvoicePaid(caseId, paid) {
  const c = await getCase(caseId);
  if (!c || !c.invoice) return null;
  c.invoice = { ...c.invoice, status: paid ? 'paid' : 'unpaid', paidAt: paid ? new Date().toISOString() : null };
  await putCase(c);
  return c.invoice;
}

/* ============================================================
   STATUS / TIMELINE TRANSITIONS (admin-side)
   ============================================================ */
function nowLabel() {
  return new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
async function advanceTimeline(caseId, stage) {
  // stage: 'acknowledged' | 'review' | 'drafted' | 'reported'
  const c = await getCase(caseId);
  if (!c) return null;
  const stageMap = {
    acknowledged: 1, // index in timeline
    review: 2,
    drafted: 3,
    reported: 4,
  };
  const idx = stageMap[stage];
  if (idx === undefined) return c;
  if (c.timeline && c.timeline[idx]) {
    c.timeline[idx].done = true;
    c.timeline[idx].ts = nowLabel();
  }
  c.status = stage === 'acknowledged' ? 'acknowledged'
           : stage === 'review' ? 'review'
           : stage === 'drafted' ? 'review'
           : stage === 'reported' ? 'reported'
           : c.status;
  await putCase(c);
  return c;
}

window.PortalDB = {
  openDB, putFile, getFile, getCaseFiles, deleteFile, deleteCaseFiles,
  saveAnnotations, loadAnnotations,
  putCase, getCase, getAllCases, deleteCase,
  storageEstimate, ensureSeeded, downloadBlob,
  getApplications, submitApplication, updateApplication,
  getAccounts, saveAccounts, addAccount,
  saveReport, advanceTimeline, nowLabel,
  getComments, addComment, getAllComments,
  addReportFigure, getReportFigures, updateReportFigure, deleteReportFigure, moveReportFigure,
  saveInvoice, setInvoicePaid,
  ensureSession: async () => true,
  async uploadFiles(caseId, recs, onProgress) {
    let done = 0; const failed = [];
    for (const rec of recs) {
      try {
        await putFile({
          id: rec.id || `${rec.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          caseId, kind: rec.kind, name: rec.name, type: rec.type, size: rec.size, blob: rec.blob,
        });
      } catch (e) { failed.push({ rec, e }); }
      done++; if (onProgress) onProgress(done, recs.length);
    }
    return { uploaded: recs.length - failed.length, failed };
  },
};
