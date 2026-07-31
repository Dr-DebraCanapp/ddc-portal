/* global React, window */
/* ============================================================
   Schedule — AI intake review
   Reads whatever the clinic sends (referral letters, records PDFs,
   rDVM notes, radiograph images) and returns BOTH:
     • structured fields to auto-fill the patient form
     • a plain-language summary + key points + prep flags for the day sheet
   Runs through the Supabase `ai-intake` Edge Function (Anthropic).
   If that is not configured it falls back to the deterministic
   keyword parser in schedule-intake.jsx so the uploader never dies.
   Loads AFTER schedule-shared.jsx (reuses its hook aliases).
   ============================================================ */

const SCHED_AI_SYSTEM = `You are an intake assistant for a traveling veterinary musculoskeletal (MSK) ultrasound clinic run by Dr. Debra Canapp, DVM, DACVSMR.
You read referral letters, clinic records, rDVM notes and imaging reports for ONE patient and extract booking-ready information.

Rules:
- Extract only what the documents actually say. Never invent an owner, a vet, a breed or a date.
- weight: as written in the record with its unit ("41 kg", "35 lbs"). Never convert.
- occupation: the dog's sport, job or role, chosen from: Companion, Agility, Obedience, Flyball, Dock diving, Herding, Field trial / hunting, Conformation, Racing, Sled / carting, Search & rescue, Service dog, Police / military, Working farm dog, Barn hunt, Lure coursing, Weight pull, Breeding. This changes what Dr. Canapp expects to find — an agility dog's iliopsoas and a field dog's shoulder fail differently. Omit it if the record never says; do not default to Companion.
- sex: give the letter with the neuter status ONLY if the record states it for THIS patient ("spayed", "MN", "is neutered"). If the record gives only the letter, return "M/?" or "F/?" — never assume intact, and never take a neuter statement about another animal in the household.
- Anatomic sites must be chosen from this list only: shoulder, elbow, carpus, stifle, tarsus, achilles, iliopsoas, piriformis. Map synonyms (CCL/cruciate/meniscus -> stifle; hock -> tarsus; common calcaneal/SDFT/gastrocnemius -> achilles; psoas -> iliopsoas; supraspinatus/infraspinatus/biceps -> shoulder; wrist/carpal -> carpus).
- Sedation is REQUIRED for iliopsoas, and likely for reactive/anxious patients. Note it as a prep flag, do not change the sites.
- visitType is "recheck" only if the documents describe a prior scan/procedure being followed up (within ~6 months); otherwise "initial".
- summary: 2-3 sentences a scheduler and Dr. Canapp can read in ten seconds — signalment, the problem, duration, what has already been done.
- mskPoints: the orthopedic / sports-medicine read, 3-8 short bullets. This is the important one — Dr. Canapp is a sports-medicine and rehabilitation specialist scanning soft tissue. Pull anything that changes what she scans or how she interprets it: affected limb(s) and side, lameness grade and gait description, onset and duration, inciting activity and the dog's sport or job, findings on palpation (pain on extension/flexion/stretch, effusion, thickening, instability, crepitus, reduced range of motion), muscle atrophy or asymmetry, prior orthopedic surgery and implants (TPLO, TTA, lateral suture, arthroscopy), prior imaging and what it showed, prior injections or regenerative therapy (PRP, stem cell, IRAP, steroid) with dates, rehabilitation done and the response, current analgesia, and any working diagnosis. Quote figures and dates when the record gives them. Omit a bullet rather than pad it.
- medicalPoints: 2-6 bullets of everything else that belongs in the medical record or affects a sedated scan: systemic and endocrine disease, cardiac or respiratory findings, neoplasia history, drug allergies and sensitivities, current medications and supplements, weight and body condition score, reproductive status, prior anesthetic events, and anything the clinic must know before sedating. Never repeat an mskPoint here.
- keyPoints: leave this empty; use mskPoints and medicalPoints.
- flags: only genuine operational issues. level is "prep" (sedation, fasting, handling, size), "clinical" (something Dr. Canapp should see before scanning) or "missing" (a required booking field the paperwork does not contain).
- confidence: 0-1 per extracted field. Below 0.6 means the scheduler must check it.
Return ONLY a JSON object, no prose, no markdown fence.`;

const SCHED_AI_SCHEMA = `{
  "patient": { "name": "", "species": "Canine|Feline", "breed": "", "sex": "M/N|M/I|F/S|F/I|M/?|F/?", "age": "", "weight": "", "occupation": "", "owner": "", "vet": "", "visitType": "initial|recheck" },
  "sites": ["stifle"],
  "mskPoints": [""],
  "medicalPoints": [""],
  "history": "",
  "demeanor": "calm|anxious|reactive",
  "fasted": true,
  "summary": "",
  "flags": [{ "level": "prep|clinical|missing", "text": "" }],
  "imaging": [{ "name": "", "modality": "", "date": "", "note": "" }],
  "confidence": { "name": 0.0 },
  "notFound": [""]
}`;

const SCHED_AI_SITES = ['shoulder', 'elbow', 'carpus', 'stifle', 'tarsus', 'achilles', 'iliopsoas', 'piriformis'];

function schedAIEndpoint() {
  const cfg = (window.PORTAL_CONFIG || {});
  if (cfg.ai && cfg.ai.endpoint) return cfg.ai.endpoint;
  const url = cfg.supabase && cfg.supabase.url;
  if (url && cfg.ai && cfg.ai.enabled) return url.replace(/\/$/, '') + '/functions/v1/ai-intake';
  return null;
}
const schedAIConfigured = () => !!schedAIEndpoint();

async function schedAICall(content) {
  const endpoint = schedAIEndpoint();
  const cfg = window.PORTAL_CONFIG || {};
  const key = (cfg.supabase && cfg.supabase.anonKey) || '';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { authorization: 'Bearer ' + key, apikey: key } : {}) },
    body: JSON.stringify({ system: SCHED_AI_SYSTEM, content, max_tokens: 1800 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || ('AI service returned ' + res.status));
  return data;
}

function schedAIParseJSON(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < 0) throw new Error('No JSON in model response');
  return JSON.parse(t.slice(a, b + 1));
}

/* Read a file into what the model can use: text, or a base64 image block. */
async function schedAIReadFile(file) {
  const name = file.name || 'file';
  const kind = window.schedFileKind(name);
  if (kind === 'image' && file.size < 4.5 * 1024 * 1024) {
    const data = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1]);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    const mt = file.type || (/\.png$/i.test(name) ? 'image/png' : 'image/jpeg');
    return { name, kind, image: { media_type: mt, data } };
  }
  if (kind === 'dicom' || kind === 'video') return { name, kind, text: null, note: 'imaging attachment (not text-readable)' };
  let text = null;
  try { text = await window.schedExtractText(file); } catch (e) { text = null; }
  return { name, kind, text };
}

const SCHED_SITES_BULLET = 'Sites named in the paperwork: ';

/* Word-boundary clip so summaries never end mid-word. */
function schedAIClip(s, max) {
  const t = String(s || '').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max), sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.\-]+$/, '') + '\u2026';
}

/* Deterministic fallback so the uploader still works with AI off. */
function schedAIFallback(reads) {
  const text = reads.map(r => r.text).filter(Boolean).join('\n\n');
  const parsed = window.schedParseIntake(text || '');
  const { fields, matched, rejected, dense } = parsed;
  const keyPoints = [];
  if (fields.sites && fields.sites.length) keyPoints.push(SCHED_SITES_BULLET + fields.sites.map(s => window.SCHED.site(s).name).join(', ') + '.');
  if (fields.visitType) keyPoints.push(fields.visitType === 'recheck' ? 'Reads as a recheck of a prior scan.' : 'Reads as an initial scan.');
  if (fields.demeanor && fields.demeanor !== 'calm') keyPoints.push('Temperament noted as ' + fields.demeanor + ' — plan handling.');
  const flags = [];
  if ((fields.sites || []).includes('iliopsoas')) flags.push({ level: 'prep', text: 'Iliopsoas requested — sedation required (dorsal recumbency).' });
  ['name', 'breed', 'owner', 'vet'].forEach(k => { if (!fields[k]) flags.push({ level: 'missing', field: k, text: 'No ' + k + ' found in the documents — enter it manually.' }); });
  if (dense && !schedAIConfigured()) flags.push({ level: 'missing', text: 'These are dense multi-page records. The rule-based read only skims them — turn on AI review for a reliable extraction.' });
  return {
    fields, matched, keyPoints, flags,
    mskPoints: parsed.ortho || [], medicalPoints: parsed.medical || [],
    summary: text
      ? 'Rule-based read of ' + reads.length + ' document' + (reads.length === 1 ? '' : 's') + '. ' + (fields.history ? schedAIClip(fields.history.replace(/\s*\n\s*/g, ' '), 320) : 'No history block was labelled in the paperwork — read the attachment before the visit.')
      : 'No readable text in the uploads. Files are attached to the patient; enter the details manually.',
    imaging: reads.filter(r => r.kind === 'image' || r.kind === 'dicom').map(r => ({ name: r.name, modality: r.kind === 'dicom' ? 'DICOM' : 'Radiograph', date: '', note: '' })),
    confidence: {}, notFound: rejected || [], engine: 'rules',
  };
}

/* Main entry: File[] -> review object. */
async function schedAIReview(files, onProgress) {
  const reads = [];
  for (const file of files) {
    onProgress && onProgress(file.name, 'reading');
    reads.push(await schedAIReadFile(file));
    onProgress && onProgress(file.name, 'read');
  }
  if (!schedAIConfigured()) return schedAIFallback(reads);

  const content = [];
  const docs = reads.filter(r => r.text && r.text.trim());
  reads.filter(r => r.image).forEach(r => {
    content.push({ type: 'text', text: 'Image attachment: ' + r.name + ' (likely a radiograph or a photographed form).' });
    content.push({ type: 'image', source: { type: 'base64', media_type: r.image.media_type, data: r.image.data } });
  });
  docs.forEach(r => content.push({ type: 'text', text: '<document name="' + r.name + '">\n' + r.text.slice(0, 60000) + '\n</document>' }));
  const unread = reads.filter(r => !r.text && !r.image).map(r => r.name);
  if (unread.length) content.push({ type: 'text', text: 'Also attached but not machine-readable here: ' + unread.join(', ') + '.' });
  if (!content.length) return schedAIFallback(reads);
  content.push({ type: 'text', text: 'Extract the intake for this one patient. Respond with ONLY a JSON object in exactly this shape:\n' + SCHED_AI_SCHEMA });

  onProgress && onProgress(null, 'thinking');
  let out;
  try {
    const data = await schedAICall(content);
    out = schedAIParseJSON(data.text || data.content || '');
  } catch (e) {
    const fb = schedAIFallback(reads);
    fb.warning = 'AI review unavailable (' + (e.message || e) + ') — fell back to the rule-based read.';
    return fb;
  }

  const p = out.patient || {};
  const fields = {};
  const put = (k, v) => { if (v != null && String(v).trim() !== '') fields[k] = String(v).trim(); };
  put('name', p.name); put('breed', p.breed); put('owner', p.owner); put('vet', p.vet); put('age', p.age); put('weight', p.weight); put('occupation', p.occupation);
  if (p.species) fields.species = /fel|cat/i.test(p.species) ? 'Feline' : 'Canine';
  if (p.sex && /^(M|F)\/(N|I|S|\?)$/i.test(String(p.sex).trim())) fields.sex = String(p.sex).trim().toUpperCase();
  if (p.visitType === 'recheck' || p.visitType === 'initial') fields.visitType = p.visitType;
  put('history', out.history);
  if (['calm', 'anxious', 'reactive'].includes(out.demeanor)) fields.demeanor = out.demeanor;
  if (typeof out.fasted === 'boolean') fields.fasted = out.fasted;
  const sites = (out.sites || []).map(s => String(s).toLowerCase()).filter(s => SCHED_AI_SITES.includes(s));
  if (sites.length) fields.sites = Array.from(new Set(sites));

  return {
    fields,
    matched: Object.keys(fields),
    summary: out.summary || '',
    keyPoints: (out.keyPoints || []).filter(Boolean).slice(0, 8),
    mskPoints: (out.mskPoints || []).filter(Boolean).slice(0, 8),
    medicalPoints: (out.medicalPoints || []).filter(Boolean).slice(0, 6),
    flags: (out.flags || []).filter(f => f && f.text).slice(0, 8),
    imaging: (out.imaging || []).filter(i => i && (i.name || i.note)),
    confidence: out.confidence || {},
    notFound: out.notFound || [],
    engine: 'ai',
  };
}

/* ============================================================
   INTAKE REVIEW PANEL — the uploader + the AI read-out
   Props: onApply(fields, review, attachments)
   ============================================================ */
const SCHED_AI_LABELS = {
  name: 'Patient name', breed: 'Breed', species: 'Species', sex: 'Sex', age: 'Age',
  weight: 'Weight', occupation: 'Occupation', owner: 'Owner', vet: 'Referring DVM', visitType: 'Visit type', history: 'Clinical history',
  demeanor: 'Demeanor', fasted: 'Fasting', sites: 'Sites',
};

function SchedIntakeReview({ onApply }) {
  const [queue, setQueue] = useState([]);      // File[]
  const [busy, setBusy] = useState('');        // status line
  const [review, setReview] = useState(null);
  const [applied, setApplied] = useState(null); // string[] of field labels
  const [drag, setDrag] = useState(false);
  const aiOn = schedAIConfigured();

  const add = (list) => setQueue(q => [...q, ...Array.from(list).filter(f => !q.some(x => x.name === f.name && x.size === f.size))]);
  const drop = (e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files && e.dataTransfer.files.length) add(e.dataTransfer.files); };

  const run = async () => {
    if (!queue.length) return;
    setReview(null); setApplied(null);
    setBusy(aiOn ? 'Reading the documents…' : 'Parsing…');
    let r;
    try {
      r = await schedAIReview(queue, (nm, st) => setBusy(st === 'thinking' ? 'Reviewing and summarising…' : 'Reading ' + (nm || '') + '…'));
    } catch (e) {
      setBusy(''); setReview({ error: String(e.message || e) }); return;
    }
    const attachments = queue.map(file => ({ name: file.name, kind: window.schedFileKind(file.name), url: URL.createObjectURL(file), file }));
    const usedLabels = onApply(r.fields, r, attachments) || [];
    setApplied(usedLabels);
    setReview(r); setBusy(''); setQueue([]);
  };

  return (
    <React.Fragment>
      <div
        className={`sc-ai-drop ${drag ? 'over' : ''}`}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={drop}
      >
        <div className="sc-ai-head">
          <div>
            <div className="ti">Upload everything you have on this patient</div>
            <div className="sub">Referral letter, records, rDVM notes, imaging reports, radiographs — add as many as you like and we'll read them together as one patient. Drop them here or browse; every file stays attached to this patient's record.</div>
          </div>
          <span className={`sc-ai-badge ${aiOn ? 'on' : ''}`}>{aiOn ? 'AI review on' : 'Rule-based read'}</span>
        </div>
        {queue.length > 0 && (
          <div className="sc-files-row" style={{ marginTop: 12 }}>
            {queue.map((f, i) => (
              <span key={i} className="sc-filepill upload">
                <span className="ic">{{ dicom: 'DCM', image: 'IMG', pdf: 'PDF', video: 'VID', doc: 'DOC' }[window.schedFileKind(f.name)] || 'FILE'}</span>{f.name}
                <span className="rm" onClick={() => setQueue(q => q.filter((_, x) => x !== i))} title="Remove">×</span>
              </span>
            ))}
          </div>
        )}
        <div className="sc-ai-actions">
          <label className="sc-upload-btn">
            <input type="file" multiple accept=".pdf,.txt,.csv,.md,.rtf,.doc,.docx,.jpg,.jpeg,.png,.webp,.gif,.dcm" onChange={e => { add(e.target.files); e.target.value = ''; }} style={{ display: 'none' }} />
            + Add documents
          </label>
          <button className="btn btn-clay btn-sm" disabled={!queue.length || !!busy} onClick={run}>
            {busy ? busy : `Review ${queue.length || ''} & auto-fill`}
          </button>
        </div>
      </div>

      {review && review.error && <div className="sc-intake-result err">{review.error}</div>}
      {review && !review.error && (
        <div className="sc-ai-card">
          <div className="sc-ai-card-head">
            <span className="eyebrow">{review.engine === 'ai' ? 'AI intake summary' : 'Rule-based intake read'}</span>
            <span className="note">Draft — check every field before saving.</span>
          </div>
          {review.warning && <div className="sc-intake-result err" style={{ margin: '0 0 10px' }}>{review.warning}</div>}
          {review.summary && <p className="sc-ai-summary">{review.summary}</p>}
          <window.SchedAISections r={review} />
          {review.flags && review.flags.length > 0 && (
            <div className="sc-ai-flags">
              {review.flags.map((fl, i) => <span key={i} className={`sc-ai-flag ${fl.level}`}><b>{fl.level}</b>{fl.text}</span>)}
            </div>
          )}
          <div className="sc-ai-applied">
            {applied && applied.length
              ? <React.Fragment><b>Auto-filled:</b> {applied.join(', ')}.</React.Fragment>
              : <React.Fragment><b>Nothing auto-filled</b> — the form was already complete or nothing could be read.</React.Fragment>}
            {review.confidence && Object.keys(review.confidence).filter(k => review.confidence[k] < 0.6).length > 0 && (
              <div className="low">Low confidence, please verify: {Object.keys(review.confidence).filter(k => review.confidence[k] < 0.6).map(k => SCHED_AI_LABELS[k] || k).join(', ')}.</div>
            )}
            {review.notFound && review.notFound.length > 0 && <div className="low">Not in the paperwork: {review.notFound.join(', ')}.</div>}
          </div>
        </div>
      )}
    </React.Fragment>
  );
}

/* Shared renderer: the ortho read and the records read. */
function SchedAISections({ r }) {
  const msk = (r.mskPoints && r.mskPoints.length ? r.mskPoints : (r.keyPoints || []));
  const med = r.medicalPoints || [];
  if (!msk.length && !med.length) return null;
  return (
    <React.Fragment>
      {msk.length > 0 && (
        <div className="sc-ai-sec">
          <div className="h">Orthopedic &amp; sports medicine</div>
          <ul className="sc-ai-points">{msk.map((k, i) => <li key={i}>{k}</li>)}</ul>
        </div>
      )}
      {med.length > 0 && (
        <div className="sc-ai-sec">
          <div className="h">For the medical record</div>
          <ul className="sc-ai-points">{med.map((k, i) => <li key={i}>{k}</li>)}</ul>
        </div>
      )}
    </React.Fragment>
  );
}

Object.assign(window, { schedAIReview, schedAIConfigured, SchedIntakeReview, SchedAISections, SCHED_AI_LABELS });
