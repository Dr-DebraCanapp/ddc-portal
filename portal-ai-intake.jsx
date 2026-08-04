/* global React, window */
/* ============================================================
   AI intake for referring vets

   The in-person side has had this for a while; the portal did not,
   so vets retyped what was already in their referral letter.

   Same Edge Function, different target. This version fills the
   remote-read submission form: patient, signalment, complaint,
   duration, medications, exam findings, sites, history notes.

   Two rules it follows deliberately:
     · nothing is written to the form until the vet presses Apply
     · a field the vet already filled in is never overwritten
   ============================================================ */
const { useState: paiState } = React;

const PAI_SYSTEM = `You are an intake assistant for a veterinary musculoskeletal (MSK) ultrasound second-opinion service run by Dr. Debra Canapp, DVM, DACVSMR.
A REFERRING VETERINARIAN is submitting ONE patient for a remote read. You read their referral letter, clinic records, exam notes and prior imaging reports, and extract submission-ready information.

Rules:
- Extract only what the documents actually say. Never invent a value. Omit anything absent.
- "complaint" is the presenting problem in the referring vet's own terms: which limb or region, what the owner reports, performance impact.
- "examFindings" is the physical/orthopedic/neurologic exam: palpation, pain response, range of motion, gait, lameness grade.
- "history" is prior imaging interpretations, surgical history, response to treatment, anything relevant a reader should know.
- "sites" are anatomical regions to be evaluated, from this list only: shoulder, elbow, carpus, stifle, tarsus, achilles, iliopsoas, piriformis. Use the singular form.
- "duration" is how long the problem has been present, as written (e.g. "9 days", "3 months").
- Sex must be one of MI, MN, FI, FS if determinable, else omit.
- Species must be one of Canine, Feline, Equine, Other.
- "summary" is two or three sentences for the submitting vet, telling them what you found and what is missing.
- "flags" are things the vet should know before submitting: a required field with no source, an ambiguity, a note that a study looks incomplete.
Return ONLY a JSON object, no prose, no markdown fence.`;

const PAI_SCHEMA = `{
  "fields": {
    "patient": "", "species": "Canine|Feline|Equine|Other", "breed": "", "age": "", "sex": "MI|MN|FI|FS", "weight": "",
    "complaint": "", "duration": "", "medications": "", "examFindings": "", "history": "",
    "sites": ["stifle"]
  },
  "summary": "",
  "flags": [{ "level": "missing|note", "text": "" }],
  "confidence": { "patient": 0.0 }
}`;

const PAI_SITES = ['shoulder', 'elbow', 'carpus', 'stifle', 'tarsus', 'achilles', 'iliopsoas', 'piriformis'];

const PAI_LABELS = {
  patient: 'Patient name', species: 'Species', breed: 'Breed', age: 'Age', sex: 'Sex', weight: 'Weight',
  complaint: 'Presenting complaint', duration: 'Duration', medications: 'Current medications',
  examFindings: 'Exam findings', history: 'History notes', sites: 'Sites for evaluation',
};

/* ---- plumbing ---------------------------------------------- */
function paiEndpoint() {
  const cfg = window.PORTAL_CONFIG || {};
  if (cfg.ai && cfg.ai.endpoint) return cfg.ai.endpoint;
  const url = cfg.supabase && cfg.supabase.url;
  if (url && cfg.ai && cfg.ai.enabled) return url.replace(/\/$/, '') + '/functions/v1/ai-intake';
  return null;
}
const paiConfigured = () => !!paiEndpoint();

const paiKind = (name) => {
  const n = String(name || '').toLowerCase();
  if (/\.(dcm|dicom)$/.test(n)) return 'dicom';
  if (/\.(jpe?g|png|gif|webp|bmp|tiff?)$/.test(n)) return 'image';
  if (/\.pdf$/.test(n)) return 'pdf';
  if (/\.(mp4|mov|avi|webm)$/.test(n)) return 'video';
  if (/\.(txt|csv|md|rtf|docx?)$/.test(n)) return 'doc';
  return 'other';
};

/* .txt straight through; .pdf via pdf.js when the page has loaded it. */
async function paiExtractText(file) {
  if (window.schedExtractText) { try { return await window.schedExtractText(file); } catch (e) { /* fall through */ } }
  const name = (file.name || '').toLowerCase();
  if (/\.(txt|csv|md|rtf)$/.test(name) || (file.type || '').startsWith('text/')) return await file.text();
  if (/\.pdf$/.test(name) && window.pdfjsLib) {
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    let out = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const tc = await (await pdf.getPage(i)).getTextContent();
      let line = '';
      tc.items.forEach(it => {
        line += it.str;
        if (it.hasEOL) { out += line.trim() + '\n'; line = ''; }
        else if (!/\s$/.test(line)) line += ' ';
      });
      out += line.trim() + '\n\n';
    }
    return out;
  }
  return null;
}

async function paiReadFile(file) {
  const name = file.name || 'file';
  const kind = paiKind(name);
  if (kind === 'image' && file.size < 4.5 * 1024 * 1024) {
    const data = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1]);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    return { name, kind, image: { media_type: file.type || 'image/jpeg', data } };
  }
  if (kind === 'dicom' || kind === 'video') return { name, kind, text: null };
  let text = null;
  try { text = await paiExtractText(file); } catch (e) { text = null; }
  return { name, kind, text };
}

async function paiCall(content) {
  const cfg = window.PORTAL_CONFIG || {};
  const key = (cfg.supabase && cfg.supabase.anonKey) || '';
  const res = await fetch(paiEndpoint(), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { authorization: 'Bearer ' + key, apikey: key } : {}) },
    body: JSON.stringify({ system: PAI_SYSTEM, content, max_tokens: 1800 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || ('The AI service returned ' + res.status));
  return data;
}

function paiParseJSON(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < 0) throw new Error('The AI service returned an unexpected response.');
  return JSON.parse(t.slice(a, b + 1));
}

/* Keep only values we can trust into a typed form. */
function paiClean(raw) {
  const f = (raw && raw.fields) || {};
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const one = (v, list) => (list.includes(str(v)) ? str(v) : '');
  return {
    fields: {
      patient: str(f.patient), breed: str(f.breed), age: str(f.age), weight: str(f.weight),
      species: one(f.species, ['Canine', 'Feline', 'Equine', 'Other']),
      sex: one(f.sex, ['MI', 'MN', 'FI', 'FS']),
      complaint: str(f.complaint), duration: str(f.duration), medications: str(f.medications),
      examFindings: str(f.examFindings), history: str(f.history),
      sites: Array.isArray(f.sites) ? f.sites.map(s => String(s).toLowerCase().trim()).filter(s => PAI_SITES.includes(s)) : [],
    },
    summary: str(raw && raw.summary),
    flags: Array.isArray(raw && raw.flags) ? raw.flags.filter(x => x && x.text) : [],
  };
}

/* ---- rule-based read, for when AI is switched off -----------
   Deliberately modest: it lifts labelled fields and named regions and
   says so. Better than the panel vanishing, and it needs no key. */
const PAI_LABEL_PATTERNS = [
  ['patient', /\b(?:patient|pet(?:'s)?\s+name|animal)\s*(?:name)?\s*[:\-]\s*(.+)/i],
  ['breed', /\bbreed\s*[:\-]\s*(.+)/i],
  ['age', /\bage\s*[:\-]\s*(.+)/i],
  ['weight', /\b(?:weight|wt)\s*[:\-]\s*(.+)/i],
  ['sex', /\b(?:sex|gender)\s*[:\-]\s*(.+)/i],
  ['duration', /\bduration\s*[:\-]\s*(.+)/i],
  ['medications', /\b(?:medications?|current\s+meds?|meds)\s*[:\-]\s*(.+)/i],
];
const PAI_SECTIONS = [
  ['complaint', /\b(?:presenting\s+complaint|chief\s+complaint|reason\s+for\s+referral|complaint|presenting\s+problem)\s*[:\-]/i],
  ['examFindings', /\b(?:exam(?:ination)?\s+findings|physical\s+exam(?:ination)?|orthoped(?:ic|ic)\s+exam|on\s+exam)\s*[:\-]/i],
  ['history', /\b(?:history|prior\s+imaging|previous\s+imaging|past\s+history|clinical\s+history)\s*[:\-]/i],
];
const PAI_SITE_WORDS = {
  shoulder: /\bshoulders?\b|\bsupraspinatus\b|\bbiceps\b|\binfraspinatus\b/i,
  elbow: /\belbows?\b|\bflexor\s+enthesopathy\b/i,
  carpus: /\bcarp(?:us|i|al)\b|\bwrist\b/i,
  stifle: /\bstifles?\b|\bccl\b|\bcruciate\b|\bmenisc/i,
  tarsus: /\btars(?:us|i|al)\b|\bhocks?\b/i,
  achilles: /\bachilles\b|\bcommon\s+calcanean\b|\bgastrocnemius\b/i,
  iliopsoas: /\biliopsoas\b/i,
  piriformis: /\bpiriformis\b/i,
};

function paiRuleRead(reads) {
  const text = reads.map(r => r.text).filter(Boolean).join('\n\n');
  const fields = { patient: '', species: '', breed: '', age: '', sex: '', weight: '',
    complaint: '', duration: '', medications: '', examFindings: '', history: '', sites: [] };
  if (!text.trim()) {
    return { fields, summary: '', flags: [], engine: 'rules', empty: true };
  }
  const lines = text.split('\n');

  PAI_LABEL_PATTERNS.forEach(([key, re]) => {
    for (const l of lines) {
      const m = l.match(re);
      if (m && m[1] && m[1].trim()) { fields[key] = m[1].trim().slice(0, 120); break; }
    }
  });

  // Sex arrives written a dozen ways; normalise the common ones.
  const sx = fields.sex.toLowerCase();
  if (sx) {
    const neut = /neuter|castrat|\bmn\b|\bcm\b/.test(sx), spay = /spay|\bfs\b/.test(sx);
    if (/^m|male/.test(sx) && !/female/.test(sx)) fields.sex = neut ? 'MN' : 'MI';
    else if (/f|female/.test(sx)) fields.sex = spay ? 'FS' : 'FI';
    else fields.sex = '';
  }
  if (/\b(feline|cat)\b/i.test(text)) fields.species = 'Feline';
  else if (/\b(equine|horse)\b/i.test(text)) fields.species = 'Equine';
  else if (/\b(canine|dog)\b/i.test(text)) fields.species = 'Canine';

  /* Sections: take everything from the heading to the next heading. */
  const headingAt = lines.map(l => PAI_SECTIONS.find(([, re]) => re.test(l)));
  PAI_SECTIONS.forEach(([key, re]) => {
    const start = lines.findIndex(l => re.test(l));
    if (start < 0) return;
    const first = lines[start].replace(re, '').replace(/^[\s:\-]+/, '');
    const body = [first];
    for (let i = start + 1; i < lines.length; i++) {
      if (headingAt[i]) break;
      if (/^\s*[A-Z][A-Za-z /]{2,30}:\s*$/.test(lines[i])) break;
      body.push(lines[i]);
    }
    const v = body.join('\n').trim();
    if (v) fields[key] = v.slice(0, 2000);
  });

  Object.entries(PAI_SITE_WORDS).forEach(([site, re]) => { if (re.test(text)) fields.sites.push(site); });

  const got = Object.entries(fields).filter(([, v]) => (Array.isArray(v) ? v.length : v)).length;
  const flags = [{ level: 'note', text: 'This was a plain keyword read, not a full AI review — check every field carefully, and expect it to have missed things.' }];
  ['patient', 'complaint'].forEach(k => {
    if (!fields[k]) flags.push({ level: 'missing', text: 'No ' + (PAI_LABELS[k] || k).toLowerCase() + ' found — you will need to type that in.' });
  });
  return {
    fields, flags, engine: 'rules',
    summary: got
      ? 'Read ' + reads.length + ' document' + (reads.length === 1 ? '' : 's') + ' and picked out ' + got + ' field' + (got === 1 ? '' : 's') + ' from labelled headings.'
      : 'Nothing recognisable in those documents — the headings may be laid out differently. Please type the details in.',
  };
}

async function paiAnalyze(files) {
  const reads = [];
  for (const f of files) reads.push(await paiReadFile(f));
  const textual = reads.filter(r => r.text && r.text.trim().length > 40);
  const images = reads.filter(r => r.image);
  if (!textual.length && !images.length) {
    const e = new Error('Nothing readable in those files. DICOM clips and videos carry no text — attach the referral letter or exam notes as a PDF, or type the details in.');
    e.soft = true;
    throw e;
  }
  const content = [];
  if (!paiConfigured()) {
    if (!textual.length) {
      const e = new Error('We can only read text from those files right now. Attach the referral letter or exam notes as a PDF or text file, or type the details in.');
      e.soft = true;
      throw e;
    }
    return paiRuleRead(reads);
  }
  textual.forEach(r => content.push({ type: 'text', text: `--- ${r.name} ---\n${String(r.text).slice(0, 60000)}` }));
  images.forEach(r => {
    content.push({ type: 'text', text: `--- ${r.name} (image) ---` });
    content.push({ type: 'image', source: { type: 'base64', media_type: r.image.media_type, data: r.image.data } });
  });
  content.push({ type: 'text', text: `Return JSON in exactly this shape:\n${PAI_SCHEMA}` });
  const data = await paiCall(content);
  const text = data.text || (data.content && data.content[0] && data.content[0].text) || '';
  return { ...paiClean(paiParseJSON(text)), engine: 'ai' };
}

/* ---- the panel the vet sees -------------------------------- */
/* onApply(fields) → returns the list of labels it actually used, so the
   panel can report honestly rather than claiming to have filled things
   the vet had already written. */
function PortalAIIntake({ onApply, onAttach, sitesLabel }) {
  const [queue, setQueue] = paiState([]);
  const [busy, setBusy] = paiState('');
  const [result, setResult] = paiState(null);
  const [err, setErr] = paiState('');
  const [applied, setApplied] = paiState(null);
  const [open, setOpen] = paiState(false);

  const add = (list) => {
    const files = Array.from(list || []);
    if (files.length) { setQueue(q => [...q, ...files]); setResult(null); setApplied(null); setErr(''); }
  };

  const run = async () => {
    if (!queue.length) return;
    setErr(''); setApplied(null);
    setBusy('Reading ' + queue.length + ' file' + (queue.length === 1 ? '' : 's') + '…');
    try {
      const r = await paiAnalyze(queue);
      setResult(r);
    } catch (e) {
      setErr(e.message || String(e));
      if (!e.soft) console.warn('[portal-ai]', e);
    }
    setBusy('');
  };

  const apply = () => {
    const used = onApply(result.fields) || [];
    const attached = onAttach ? (onAttach(queue) || []) : [];
    setApplied({ used, attached });
  };

  const found = result ? Object.entries(result.fields).filter(([k, v]) => (Array.isArray(v) ? v.length : v)) : [];

  return (
    <div className={`pai ${open ? 'open' : ''}`}>
      <button type="button" className="pai-toggle" onClick={() => setOpen(o => !o)}>
        <span className="pai-mark">◑</span>
        <span className="pai-toggle-t">
          <b>Have a referral letter or exam notes? Let us fill this in.</b>
          <em>Drop the paperwork and we'll read it — you check it over before anything is entered.{paiConfigured() ? '' : ' Reads labelled headings.'}</em>
        </span>
        <span className="pai-chev">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="pai-body">
          <label className="pai-drop"
            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('over'); }}
            onDragLeave={e => e.currentTarget.classList.remove('over')}
            onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('over'); add(e.dataTransfer.files); }}>
            <input type="file" multiple hidden onChange={e => { add(e.target.files); e.target.value = ''; }} />
            <span className="pai-drop-t">Drop files here, or click to choose</span>
            <span className="pai-drop-s">Referral letters, exam notes, prior imaging reports — PDF, text, or a photo of a page. These are attached to the case too, so you won't need to add them again.</span>
          </label>

          {!!queue.length && (
            <div className="pai-files">
              {queue.map((f, i) => (
                <span key={i} className="pai-pill">
                  <span className="k">{{ dicom: 'DCM', image: 'IMG', pdf: 'PDF', video: 'VID', doc: 'DOC' }[paiKind(f.name)] || 'FILE'}</span>
                  {f.name}
                  <span className="x" onClick={() => setQueue(q => q.filter((_, x) => x !== i))} title="Remove">×</span>
                </span>
              ))}
            </div>
          )}

          <div className="pai-acts">
            <button type="button" className="btn" onClick={run} disabled={!queue.length || !!busy}>
              {busy || 'Read these documents'}
            </button>
            {!!queue.length && !busy && (
              <button type="button" className="btn btn-ghost" onClick={() => { setQueue([]); setResult(null); setApplied(null); setErr(''); }}>Clear</button>
            )}
          </div>

          {err && <div className="pai-err">{err}</div>}

          {result && (
            <div className="pai-result">
              {result.summary && <p className="pai-summary">{result.summary}</p>}

              {found.length > 0 ? (
                <div className="pai-found">
                  <div className="pai-eyebrow">What we found</div>
                  {found.map(([k, v]) => (
                    <div key={k} className="pai-row">
                      <span className="pai-k">{PAI_LABELS[k] || k}</span>
                      <span className="pai-v">{Array.isArray(v) ? v.map(s => (sitesLabel ? sitesLabel(s) : s)).join(', ') : v}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="pai-summary">Nothing usable came out of those documents — please type the details in.</p>}

              {result.flags.length > 0 && (
                <ul className="pai-flags">
                  {result.flags.map((fl, i) => <li key={i} className={fl.level === 'missing' ? 'miss' : ''}>{fl.text}</li>)}
                </ul>
              )}

              {applied === null ? (
                found.length > 0 && (
                  <div className="pai-acts">
                    <button type="button" className="btn" onClick={apply}>Fill in the form</button>
                    <span className="pai-note">Anything you've already typed is left alone{onAttach ? ', and these files are added to your uploads' : ''}.</span>
                  </div>
                )
              ) : (
                <div className="pai-done">
                  {applied.used.length
                    ? <>Filled in: {applied.used.join(', ')}. Check each one before you continue — you're signing off on this history.</>
                    : <>Nothing was changed — you'd already filled in everything we found.</>}
                  {applied.attached.length > 0 && (
                    <><br />Files attached: {applied.attached.join(', ')}. You'll see them on the upload steps, and can move or remove any of them there.</>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { PortalAIIntake, PAI_LABELS });
