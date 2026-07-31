/* global window */
/* ============================================================
   Schedule — intake auto-fill (deterministic fallback)
   Parses a referral/intake document (plain text, or text extracted
   from a PDF via pdf.js) and best-effort maps it onto the patient form.
   No network. This is the fallback when AI review is off.

   PDF text arrives FLATTENED — a whole page can be one "line"
   ("Patient : Feature Species: Canine Breed: Border Collie Sex: F …"),
   so every value is cut at the next label-looking token and then
   validated per field. A value that doesn't look like a name / breed /
   owner is dropped rather than guessed, and reported as not found.
   Returns { fields, matched:[], rejected:[], dense, raw }.
   ============================================================ */

const SCHED_SITE_KEYWORDS = {
  shoulder: ['shoulder', 'supraspinatus', 'infraspinatus', 'biceps', 'scapulohumeral'],
  elbow: ['elbow', 'cubital'],
  carpus: ['carpus', 'carpal', 'wrist'],
  stifle: ['stifle', 'ccl', 'cranial cruciate', 'cruciate', 'meniscus', 'meniscal', 'patella'],
  tarsus: ['tarsus', 'tarsal', 'hock'],
  achilles: ['achilles', 'calcaneal', 'gastrocnemius', 'sdft', 'common calcaneal'],
  iliopsoas: ['iliopsoas', 'psoas'],
  piriformis: ['piriformis'],
};

/* Anything that looks like the START of the next field, so a value
   never swallows the rest of the page. */
const SCHED_LABEL_HEADS = "Birth|Date|Patient|Client|Owner|Referring|Chief|Presenting|Reason|Clinical|Prior|Body|Exam|General|Visit|Study|Last|Next|Recheck|Physical";
const SCHED_NEXT_LABEL = "(?=\\s(?:(?:" + SCHED_LABEL_HEADS + ")\\s)?[A-Z][A-Za-z.&'/\\-]{0,20}\\s*:|\\s*[\\n\\r]|$)";
const SCHED_JUNK = /\b(page\s+\d+\s+of\s+\d+|date\s*:|time\s*:|dob\s*:|birth\s*date\s*:|weight\s*:|color\s*:|species\s*:|breed\s*:|sex\s*:|owner\s*:)\b.*$/i;

function _clip(s, max) {
  const t = String(s || '').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.\-]+$/, '') + '…';
}

/* Raw value for a label: stops at the next label or line end. */
function _raw(text, labels) {
  for (const lab of labels) {
    const re = new RegExp('(?:^|[\\n\\r]|\\s)' + lab + '\\s*[:\\-]\\s*(.+?)' + SCHED_NEXT_LABEL, 'i');
    const m = text.match(re);
    if (m && m[1]) {
      const v = m[1].replace(SCHED_JUNK, '').replace(/\s{2,}/g, ' ').replace(/[|;,\-\s]+$/, '').trim();
      if (v) return v;
    }
  }
  return '';
}

/* ---- per-field validators — reject rather than guess -------- */
const _words = (v) => v.split(/\s+/).filter(Boolean);
const _isProper = (v, maxWords) => {
  const w = _words(v);
  if (!w.length || w.length > maxWords) return false;
  if (/\d/.test(v)) return false;
  if (v.length > 44) return false;
  if (/[:;|]/.test(v)) return false;
  return /[A-Za-z]{2}/.test(v);
};
const V = {
  name: (v) => { const w = _words(v); return _isProper(v, 3) ? w.slice(0, 3).join(' ') : ''; },
  breed: (v) => {
    const cleaned = v.replace(/\b(mix(ed)?|cross)\b/i, m => m).trim();
    return _isProper(cleaned, 4) ? cleaned : '';
  },
  owner: (v) => (_isProper(v, 4) && !/\b(hospital|clinic|veterinary|animal)\b/i.test(v) ? v : ''),
  vet: (v) => {
    const t = v.replace(/^dr\.?\s*/i, 'Dr. ').trim();
    return (_isProper(t.replace(/^Dr\.\s*/, ''), 4) ? t : '');
  },
};

/* Age: accept a stated age, else compute from a date of birth.
   Historical records are dated — age against the record's own date, not today. */
function _recordDate(text) {
  let best = null;
  const re = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/g;
  let m;
  while ((m = re.exec(text))) {
    let y = Number(m[3]);
    const dt = new Date(y, Number(m[1]) - 1, Number(m[2]));
    if (dt.getTime() <= Date.now() && (!best || dt > best)) best = dt;
  }
  return best;
}
function _age(text) {
  const raw = _raw(text, ['age']);
  const m = raw.match(/(\d{1,2})\s*(?:yrs?|years?|y\.?o\.?|y)\b/i) || raw.match(/^(\d{1,2})$/);
  if (m) return m[1] + ' yr';
  const mo = raw.match(/(\d{1,2})\s*(?:mos?|months?)\b/i);
  if (mo) return mo[1] + ' mo';
  const dob = _raw(text, ['birth date', 'date of birth', 'dob']);
  const dm = dob.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (dm) {
    let y = Number(dm[3]); if (y < 100) y += y > 50 ? 1900 : 2000;
    const born = new Date(y, Number(dm[1]) - 1, Number(dm[2]));
    const asOf = _recordDate(text) || new Date();
    const yrs = Math.floor((asOf.getTime() - born.getTime()) / (365.25 * 24 * 3600 * 1000));
    if (yrs >= 0 && yrs < 30) return yrs + ' yr';
  }
  return '';
}

/* Every weight in the record, paired with the visit date it sits under, so a
   multi-visit chart yields the CURRENT weight rather than the first one printed. */
const SCHED_WEIGHT_RE = /(?<![\d.])(\d{1,3}(?:\.\d{1,2})?)\s*(kgs?|kilos?|lbs?|pounds?)\b/gi;
const SCHED_DATE_RE = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi;
const SCHED_MONTH_INDEX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

function _dateStamps(text) {
  const out = [];
  let m;
  SCHED_DATE_RE.lastIndex = 0;
  while ((m = SCHED_DATE_RE.exec(text))) {
    let dt = null;
    if (m[1]) {
      let y = Number(m[3]); if (y < 100) y += y > 50 ? 1900 : 2000;
      dt = new Date(y, Number(m[1]) - 1, Number(m[2]));
    } else if (m[4]) {
      dt = new Date(Number(m[6]), SCHED_MONTH_INDEX[m[4].toLowerCase().slice(0, 3)], Number(m[5]));
    }
    if (dt && !isNaN(dt) && dt.getFullYear() > 1980 && dt.getTime() <= Date.now() + 864e5) out.push({ at: m.index, dt, label: m[0] });
  }
  return out;
}

/* Ignore drug strengths and lab values; only plausible body weights. */
function _latestWeight(text) {
  const stamps = _dateStamps(text);
  const found = [];
  let m;
  SCHED_WEIGHT_RE.lastIndex = 0;
  while ((m = SCHED_WEIGHT_RE.exec(text))) {
    const unit = /^k/i.test(m[2]) ? 'kg' : 'lbs';
    const n = Number(m[1]);
    if (unit === 'kg' && (n < 0.4 || n > 120)) continue;
    if (unit === 'lbs' && (n < 1 || n > 260)) continue;
    let owner = null;
    for (const s of stamps) { if (s.at < m.index) owner = s; else break; }
    found.push({ value: m[1] + ' ' + unit, at: m.index, dt: owner ? owner.dt : null, on: owner ? owner.label : null });
  }
  if (!found.length) return null;
  const dated = found.filter(f => f.dt);
  if (dated.length) { dated.sort((a, b) => (b.dt - a.dt) || (b.at - a.at)); return dated[0]; }
  return found[found.length - 1];
}

/* A referral letter states its reason in one labelled block — that block IS the
   history and must be kept whole (it carries context no keyword cue matches). */
const SCHED_REASON_LABELS = ['reason for referral', 'reason for visit', 'presenting complaint', 'chief complaint', 'presenting problem', 'clinical history', 'complaint'];
function _reasonBlock(text) {
  for (const lab of SCHED_REASON_LABELS) {
    const v = _blockAfter(text, lab, 1200);
    if (v) return v;
  }
  return '';
}

/* History fallback: a multi-visit chart has a "History:" block per visit — take
   the one that actually reads musculoskeletal, not whichever came first
   (usually a vaccine appointment). */
function _history(text) {
  const r = _reasonBlock(text);
  if (r) return r;
  const blocks = _allBlocksAfter(text, 'history', 600);
  if (!blocks.length) return '';
  const score = (b) => SCHED_MSK_CUES.reduce((n, c) => n + (c.test(b) ? 1 : 0), 0);
  const best = blocks.map(b => ({ b, s: score(b) })).sort((a, z) => z.s - a.s)[0];
  return best.s > 0 ? _clip(best.b, 600) : _clip(blocks[0], 600);
}

function _allBlocksAfter(text, label, max) {
  const re = new RegExp('(?:^|[\\n\\r]|\\s)' + label + '\\s*[:\\-]\\s*', 'gi');
  const out = [];
  let m;
  while ((m = re.exec(text)) && out.length < 30) {
    const v = _blockFrom(text.slice(m.index + m[0].length), max);
    if (v) out.push(v);
  }
  return out;
}

function _blockAfter(text, label, max) {
  const re = new RegExp('(?:^|[\\n\\r]|\\s)' + label + '\\s*[:\\-]\\s*', 'i');
  const m = text.match(re);
  if (!m) return '';
  return _blockFrom(text.slice(m.index + m[0].length), max);
}

function _blockFrom(rest, max) {
  // stop at a blank line, the next labelled line, a new dated visit entry,
  // a SOAP section marker, or an invoice line
  const stop = rest.search(/\n\s*\n|\n\s*[A-Z][A-Za-z .&'\/\-]{0,24}\s*:|\n\s*\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}\b|\n\s*[SOAP]\.?\)|\b[OAP]\)\s|\bP\.E\.|\bAssessment\s*:/);
  const block = (stop > 0 ? rest.slice(0, stop) : rest).trim().replace(/[ \t]{2,}/g, ' ').replace(/\n{2,}/g, '\n');
  return block ? _clip(block, max) : '';
}

/* ---- clinically useful extraction from the prose ------------
   Sentence-level scan: pull the sentences that actually matter for an
   MSK ultrasound (ortho / sports med) and, separately, the ones that
   matter for the record and for sedation safety. Deterministic. */
const SCHED_MSK_CUES = [
  /\bgrade\s*[0-5]\s*\/\s*5\b|\blame\w*|\bnon-?weight ?bearing\b|\btoe ?touching\b/i,
  /\b(?:tplo|tta|fho)\b|\blateral suture\b|\bextracapsular\w*|\barthrotom\w*|\barthroscop\w*|\bosteotom\w*|\bimplant\w*|\bplate and screw\w*|\btendon repair\w*/i,
  /\bradiograph\w*|\brads\b|\bx-?ray\w*|\bct\b|\bmri\b|\bultrasound\w*|\bsonograph\w*|\bbone scan\b/i,
  /\bprp\b|\bstem cell\w*|\birap\b|\bacs\b|\bregenerat\w*|\binject\w*|\bhyaluron\w*|\btriamcinolone\b|\bmethylprednisolone\b/i,
  /\brehab\w*|\bunderwater treadmill\b|\bhydrotherap\w*|\bshockwave\w*|\blaser\b|\bacupunctur\w*|\bphysiotherap\w*|\bphysical therap\w*/i,
  /\bagility\b|\bflyball\b|\bdock diving\b|\bherding\b|\bfield trial\w*|\bhunt\w*|\bracing\b|\bobedience\b|\bsport\w*|\bworking dog\b|\bconditioning\b|\bcompet\w*/i,
  /\batroph\w*|\bhypertroph\w*|\bmuscle mass\b|\basymmetr\w*/i,
  /\brange of motion\b|\brom\b|\bcrepitus\b|\beffusion\w*|\bthicken\w*|\bswell\w*|\binstabilit\w*|\bdrawer\b|\bstiff\w*|\bpain on (?:palpation|extension|flexion|stretch|manipulation)\b/i,
  /\bshoulder\w*|\belbow\w*|\bcarp(?:us|al)\w*|\bstifle\w*|\btars(?:us|al)\w*|\bhock\w*|\bachilles\b|\bcalcaneal\b|\biliopsoas\b|\bpsoas\b|\bpiriformis\b|\bsupraspinatus\b|\binfraspinatus\b|\bbiceps\b|\bmenisc\w*|\bcruciate\b|\bccl\b/i,
  /\barthrit\w*|\bosteoarthrit\w*|\boa\b|\bdysplas\w*|\btendinopath\w*|\btendinit\w*|\bdesmopath\w*|\bstrain\w*|\bsprain\w*|\btear\w*|\brupture\w*|\bluxat\w*|\bsublux\w*/i,
  // owner-reported functional loss — the verb must be paired with a movement
  /(?:reluctan\w*|unwilling|hesitan\w*|won'?t|will not|unable to|refus\w*|struggl\w*|difficult\w*|slow)\s+(?:\w+ ){0,3}(?:jump|jumps|jumping|climb\w*|rise|rising|get(?:ting)? up|stand\w*|walk\w*|run\w*|weight ?bear\w*|stair\w*|couch|sofa|car|bed|steps?)\b|\bslip\w*|\bfavou?r\w*\s+(?:the\s+)?(?:left|right|fore|hind|front|rear|limb|leg|paw)|\bholding up (?:the |a )?(?:left|right|fore|hind|front|rear|limb|leg|paw)|\bthree-?legged\b|\blimp\w*|\byelp\w*\s+(?:on|when|after|with)|\bshort\w*\s+stride|\bbunny ?hop\w*|\bsits? crooked\b|\bexercise intoleran\w*|\btires? (?:easily|quickly)\b|\bperformance (?:decline\w*|drop\w*|loss|has declined)\b|\bslow(?:er|ing)?\s+(?:on|after|to rise|getting up)\b/i,
];
const SCHED_MED_CUES = [
  /\bhypothyroid\w*|\bhyperthyroid\w*|\bthyroid\b|\bcushing\w*|\baddison\w*|\bdiabet\w*|\brenal\b|\bkidney\w*|\bhepat\w*|\bliver\b|\bcardiac\b|\bmurmur\w*|\barrhythmi\w*|\bseizure\w*|\bepilep\w*|\bneoplas\w*|\btumou?r\w*|\bmast cell\b|\blymphoma\b|\bcarcinoma\b|\bsarcoma\b/i,
  /\banaesthe\w*|\banesthe\w*|\bsedat\w*|\bacepromazine\b|\bdexmedetomidine\b|\bmdr1\b|\bbrachycephal\w*|\breaction to\b/i,
  /\ballerg\w*|\bsensitiv\w*\s+to\b|\bintoleran\w*/i,
  /\bcarprofen\b|\bmeloxicam\b|\bgabapentin\b|\bfirocoxib\b|\bgalliprant\b|\bprednis\w*|\btramadol\b|\bamantadine\b|\btrazodone\b|\bnsaid\w*|\blibrela\b|\badequan\b|\bsupplement\w*/i,
  /\bspay\w*|\bneuter\w*|\bcastrat\w*|\bintact\b/i,
  /\b\d{1,3}(?:\.\d)?\s*(?:kg|lbs?)\b|\bb\.?c\.?s\.?\s*\d/i,
];

function _sentences(text) {
  const out = [];
  String(text || '').split(/\n+/).forEach(line => {
    const parts = line.replace(/\s{2,}/g, ' ').split(/(?<=[.!?])\s+|\s+(?=[SOAP]\.?\)\s)/);
    parts.forEach((p, idx) => {
      const s = p.trim();
      if (s.length > 14 && s.length < 320 && /[a-z]{4}/i.test(s)) out.push({ text: s, lineStart: idx === 0 });
    });
  });
  return out;
}
/* Text-only view, for callers that don't care about position. */
const _sentenceTexts = (t) => _sentences(t).map(x => x.text);
/* Skip the boilerplate a normal exam sheet is full of. */
const SCHED_NOISE = /^(?:page\s+\d|general assessment|skin\s*-|m\.?m\.?\s|temp\.?\s|crt\b)/i;
const SCHED_ALL_NORMAL = (s) => (s.match(/-\s*N\b/g) || []).length >= 3;
/* a bare header field lifted off a records banner: "Weight: 35 lbs."
   Only banner labels — a short clinical line ("History: Lame on left front.")
   must not be mistaken for letterhead. */
const SCHED_BARE_FIELD = /^(?:weight|wt|colou?r|sex|gender|species|breed|age|dob|date of birth|birth ?date|date|time|patient|client|owner|id|chart|file|account|phone|address|city|clinic|hospital|page|doctor|dvm|rdvm|microchip|rabies tag)\s*:\s*[^.!?]{1,24}\.?$/i;
/* SOAP section markers carry real content — strip the marker, keep the sentence */
const SCHED_SOAP = /^(?:[SOAP]\.?\)|[SOAP]\.?\s*:|R\/O)\s*/i;

/* Two sentences restating the same thing (one is mostly contained in the other). */
function _similar(a, b) {
  const tok = (s) => new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(w => w.length > 2));
  const A = tok(a), B = tok(b);
  const [small, big] = A.size <= B.size ? [A, B] : [B, A];
  if (!small.size) return false;
  let hit = 0;
  small.forEach(w => { if (big.has(w)) hit++; });
  return hit / small.size >= 0.6;
}

/* Lines that are never clinical narrative: invoice items, lab catalogs,
   assay marketing copy, and fragments left by a bad sentence split. */
const SCHED_INVOICE = /^\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}\s|\bset ?up\b|\(each plate\)|\bqty\b|\bunit price\b|\bsubtotal\b|\binvoice\b|\bstatement\b|\$\s?\d/i;
const SCHED_LAB_BOILER = /\bmore reliable indicator\b|\breference (range|interval)\b|\bsdma\b|\bidexx\b|\bantech\b|\bspecimen\b|\bserum appearance\b|\bdetects (declining|early)\b|\bresults? (pending|received)\b|\bpanel \d\b/i;
const SCHED_CATALOG = (s) => {
  const caps = (s.match(/[A-Z]/g) || []).length, letters = (s.match(/[A-Za-z]/g) || []).length;
  return letters > 12 && caps / letters > 0.5 && (s.match(/,/g) || []).length >= 2;
};
const SCHED_FRAGMENT = /^[a-z]/;
/* A letterhead or form title: no terminal punctuation and either shouty or
   verbless ("BOWIE ANIMAL HOSPITAL — REFERRAL FOR MSK ULTRASOUND"). */
const SCHED_HEADING = (s) => {
  if (/[.!?]$/.test(s)) return false;
  const letters = (s.match(/[A-Za-z]/g) || []).length;
  const caps = (s.match(/[A-Z]/g) || []).length;
  if (letters > 8 && caps / letters > 0.35) return true;
  return !/\b[a-z]{3,}\b/.test(s);
};
/* Non-musculoskeletal anatomy: "no pain on palpation of abdomen", "mammary
   tissue is atrophic" trip the generic cues but are not ortho findings. */
const SCHED_NON_MSK = /\babdom\w*|\bmammary\b|\bey(?:e|es)\b|\bear\w*|\bskin\b|\bconjunctiv\w*|\bcorneal?\b|\bbladder\b|\bkidney\w*|\brenal\b|\bliver\b|\bhepat\w*|\bspleen\w*|\blymph\b|\bgum\w*|\bteeth\b|\bdental\b|\banal\b|\bprostat\w*|\buterus\b|\bthyroid\b|\bheart\b|\blung\w*|\bthorax\b|\bthoracic cavity\b|\bintestin\w*|\bstomach\b|\bnasal\b/i;
const SCHED_GAIT = /\blame\w*|\blimp\w*|\bgait\b|\bstride\b|\bweight ?bear\w*|\bstiff\w*|\barthrit\w*|\btendinopath\w*|\bstrain\w*|\bsprain\w*|\btear\w*|\brupture\w*|\batroph\w*|\bcrepitus\b|\beffusion\w*|\brange of motion\b|\breluctan\w*|\bagility\b|\bflyball\b|\bdock diving\b|\bherding\b|\bconditioning\b|\brehab\w*|\bsedation for positioning\b|\btires? (?:easily|quickly)\b|\bperformance (?:declin\w*|drop\w*|loss)\b|\bexercise intoleran\w*|\bslip\w*|\bstair\w*|\bfavou?r\w*|\bsore\w*|\bpain\w*/i;
const SCHED_MSK_ANATOMY = /\bshoulder\w*|\belbow\w*|\bcarp\w*|\bstifle\w*|\btars\w*|\bhock\w*|\bachilles\b|\bcalcaneal\b|\biliopsoas\b|\bpsoas\b|\bpiriformis\b|\bspinatus\b|\bbiceps\b|\bmenisc\w*|\bcruciate\b|\bccl\b|\blimb\w*|\bleg\w*|\bpaw\w*|\bmuscle\w*|\btendon\w*|\bligament\w*|\bjoint\w*|\bhip\w*|\bfore(?:limb|leg)?\b|\bhind\b|\bpelvic\b|\bthigh\w*|\bstride\b|\bgait\b|\bfeet\b|\bfoot\b|\bdigit\w*|\bspine\b|\blumbo\w*/i;

/* Routine husbandry, breeding and preventive-care entries. A 30-page chart is
   mostly this — none of it belongs in an MSK ultrasound history. */
const SCHED_NOT_CLINICAL = /\bmicrochip\w*|\bpupp(?:y|ies)\b|\bwhelp\w*|\bbreed(?:ing)?\s|\blitter\b|\bpregnan\w*|\bpreg\.?\b|\bgestation\w*|\bestrus\b|\bin heat\b|\bsemen\b|\binseminat\w*|\bprogesterone\b|\bvaccin\w*|\btit(?:re|er)\b|\bdeworm\w*|\bdrontal\b|\bheartworm\b|\bflea\b|\btick preventive\b|\bnail trim\w*|\banal gland\w*|\bgroom\w*|\bboarding\b|\bdental cleaning\b|\bfecal\b|\bstool sample\b|\bno health concerns\b|\bannual (?:exam|visit|wellness)\b/i;

/* Sentences about a housemate or another animal are not this patient's record. */
const SCHED_OTHER_ANIMAL = /\b(?:housemate|sibling|littermate)s?\b|\b(?:other|another|second)\s+(?:dog|dogs|cat|cats|pet|pets|animal|animals)\b|\bother animals\b|\b(?:dogs|cats|pets|animals) in (?:the )?(?:house|home)\b/i;

function _pickSentences(text, cues, max) {
  const out = [];
  for (const part of _sentences(text)) {
    const raw = part.text;
    const s = raw.replace(SCHED_SOAP, '').trim();
    if (s.length < 14) continue;
    if (SCHED_NOISE.test(s) || SCHED_ALL_NORMAL(s) || SCHED_BARE_FIELD.test(s)) continue;
    if ((part.lineStart && SCHED_FRAGMENT.test(raw)) || SCHED_INVOICE.test(s) || SCHED_LAB_BOILER.test(s) || SCHED_CATALOG(s)) continue;
    if (SCHED_HEADING(s)) continue;
    // a demographics banner: two or more "Label: value" pairs on one line
    if ((s.match(/[A-Za-z][A-Za-z ]{0,18}:\s/g) || []).length >= 2) continue;
    if (cues === SCHED_MSK_CUES) {
      if (SCHED_NOT_CLINICAL.test(s)) continue;
      // "radiograph"/"ultrasound"/"injection" alone is not a finding — it needs
      // musculoskeletal anatomy or a gait complaint alongside it
      if (!SCHED_MSK_ANATOMY.test(s) && !SCHED_GAIT.test(s)) continue;
    }
    if (SCHED_OTHER_ANIMAL.test(s)) continue;
    if (!cues.some(c => c.test(s))) continue;
    // only for the ortho list: a non-MSK organ sentence needs MSK anatomy to qualify
    if (cues === SCHED_MSK_CUES && SCHED_NON_MSK.test(s) && !SCHED_MSK_ANATOMY.test(s)) continue;
    const v = _clip(s.replace(/^[-–•\s]+/, '').replace(/^[A-Za-z][A-Za-z .&'\/\-]{0,26}:\s*/, ''), 220);
    if (v.length < 14 || out.some(o => o === v || _similar(o, v))) continue;
    out.push(v[0].toUpperCase() + v.slice(1));
    if (out.length >= max) break;
  }
  return out;
}

function schedParseIntake(rawText) {
  const text = (rawText || '').replace(/\r/g, '');
  const matched = [], rejected = [];
  const fields = {};
  const take = (key, labels, label) => {
    const raw = _raw(text, labels);
    if (!raw) { rejected.push(label); return; }
    const clean = V[key] ? V[key](raw) : raw;
    if (clean) { fields[key] = clean; matched.push(label); }
    else rejected.push(label); // found the label but the value wasn't usable
  };

  take('name', ['patient name', 'patient', 'pet name', 'animal name', 'name of patient'], 'Patient name');
  take('breed', ['breed'], 'Breed');
  take('owner', ['owner name', 'owner', 'client name', 'client'], 'Owner');
  take('vet', ['referring dvm', 'referring veterinarian', 'referring vet', 'rdvm'], 'Referring DVM');

  // lines/sentences about THIS patient only (no housemate / other-animal mentions).
  // Split on lines AND sentence ends so short banner lines survive the filter.
  const ownText = text.split(/\n+|(?<=[.!?])\s+/).filter(s => s.trim() && !SCHED_OTHER_ANIMAL.test(s)).join(' ');

  // weight — a chart carries one per visit; take the most recently recorded.
  const w = _latestWeight(ownText);
  if (w) { fields.weight = w.value; matched.push(w.on ? 'Weight (most recent, ' + w.on + ')' : 'Weight'); }
  else rejected.push('Weight');

  // occupation / sport
  const OCC = [
    [/\bagility\b/i, 'Agility'], [/\bobedience\b|\brally\b/i, 'Obedience'], [/\bflyball\b/i, 'Flyball'],
    [/\bdock ?div\w*|\bdock ?jump\w*/i, 'Dock diving'], [/\bherd\w*|\bsheepdog\b|\bstock dog\b/i, 'Herding'],
    [/\bfield trial\w*|\bhunt(?:ing)? (?:dog|test)\b|\bgun ?dog\b|\bretriev\w* trial/i, 'Field trial / hunting'],
    [/\bconformation\b|\bshow dog\b|\bshow ring\b/i, 'Conformation'],
    [/\blure cours\w*/i, 'Lure coursing'],
    [/\bracing\b|\brace dog\b/i, 'Racing'],
    [/\bsled\b|\bmushing\b|\bcarting\b|\bskijor\w*/i, 'Sled / carting'],
    [/\bsearch (?:and|&) rescue\b|\bsar dog\b/i, 'Search & rescue'],
    [/\bservice dog\b|\bassistance dog\b|\bguide dog\b|\btherapy dog\b/i, 'Service dog'],
    [/\bpolice (?:dog|k9)\b|\bk-?9\b|\bmilitary working dog\b|\bdetection dog\b|\bschutzhund\b|\bipo\b/i, 'Police / military'],
    [/\bfarm dog\b|\bworking farm\b|\branch dog\b/i, 'Working farm dog'],
    [/\bbarn hunt\b/i, 'Barn hunt'], [/\bweight pull\w*/i, 'Weight pull'],
    [/\bbrood bitch\b|\bstud dog\b|\bbreeding (?:program|bitch|male)\b/i, 'Breeding'],
    [/\bcompanion (?:dog|animal)\b|\bpet dog\b|\bfamily pet\b/i, 'Companion'],
  ];
  const occLabel = _raw(text, ['occupation', 'sport', 'discipline', 'activity', 'job', 'work']);
  const occHay = (occLabel + ' ' + ownText);
  for (const [re, label] of OCC) {
    if (re.test(occHay)) { fields.occupation = label; matched.push('Occupation'); break; }
  }
  if (!fields.occupation) rejected.push('Occupation');

  const age = _age(text);
  if (age) { fields.age = age; matched.push('Age'); } else rejected.push('Age');

  // species
  const sp = _raw(text, ['species']);
  if (/fel|cat/i.test(sp)) { fields.species = 'Feline'; matched.push('Species'); }
  else if (/can|dog/i.test(sp)) { fields.species = 'Canine'; matched.push('Species'); }
  else if (/\bcanine\b|\bdog\b/i.test(text)) { fields.species = 'Canine'; matched.push('Species'); }
  else if (/\bfeline\b|\bcat\b/i.test(text)) { fields.species = 'Feline'; matched.push('Species'); }

  // sex — letter from the sex field; neuter status only from a cue about THIS
  // patient (the sex field itself, an explicit token, or a self-referential
  // sentence). Never inferred from "other dog in house is neutered".
  const sexField = (_raw(text, ['sex', 'gender']) || '').slice(0, 40);
  const token = (text.match(/\b(MN|MI|FS|FI)\b/) || [])[0] || '';
  const SEX_PHRASE = /\b(?:spayed|neutered|castrated|intact)\s+(?:female|male)\b|\b(?:female|male)\s+(?:spayed|neutered|castrated|intact)\b|\b(?:is|was|has been)\s+(?:spayed|neutered|castrated|intact)\b|\bovariohysterectom\w*|\bohe\b/i;
  let phrase = '';
  for (const sent of _sentenceTexts(text)) {
    const m = sent.match(SEX_PHRASE);
    if (m && !SCHED_OTHER_ANIMAL.test(sent)) { phrase = m[0]; break; }
  }
  // short self-referential statements the sentence filter drops ("Is spayed.")
  if (!phrase) {
    const m2 = text.match(/(?:^|[\n.]\s*)(?:is|was|has been)\s+(spayed|neutered|castrated|intact)\b/i);
    if (m2) phrase = m2[1];
  }
  const sexSrc = (sexField + ' ' + token + ' ' + phrase).toLowerCase();
  let letter = '';
  if (/\bf\b|female|\bfs\b|\bfi\b/.test(sexSrc)) letter = 'F';
  else if (/\bm\b|male|\bmn\b|\bmi\b/.test(sexSrc)) letter = 'M';
  if (letter) {
    let status = '';
    if (/intact|\bfi\b|\bmi\b/.test(sexSrc)) status = letter === 'F' ? 'I' : 'I';
    else if (/spay|neuter|castrat|ovariohysterectom|\bohe\b|\bfs\b|\bmn\b/.test(sexSrc)) status = letter === 'F' ? 'S' : 'N';
    fields.sex = letter + '/' + (status || '?');
    matched.push(status ? 'Sex' : 'Sex (neuter status not stated)');
  }

  // visit type — only an explicit recheck of a previous ULTRASOUND counts
  if (/\brecheck\b[^.]{0,40}\b(scan|ultrasound|us)\b|\b(scan|ultrasound)\b[^.]{0,40}\brecheck\b|\bfollow[\s-]?up\s+(scan|ultrasound)\b/i.test(text)) {
    fields.visitType = 'recheck'; matched.push('Visit type');
  }

  const hist = _history(text);
  if (hist && (SCHED_GAIT.test(hist) || (SCHED_MSK_ANATOMY.test(hist) && !SCHED_NOT_CLINICAL.test(hist)))) { fields.history = hist; matched.push('Clinical history'); }
  else rejected.push('Clinical history');

  // sites — keyword scan
  const hay = text.toLowerCase();
  const sites = [];
  Object.entries(SCHED_SITE_KEYWORDS).forEach(([id, kws]) => { if (kws.some(k => hay.includes(k))) sites.push(id); });
  if (sites.length) { fields.sites = sites; matched.push('Sites (' + sites.length + ')'); }

  // demeanor / fasting cues — must be about temperament, not the diet
  const temp = _raw(text, ['temperament', 'demeanor', 'behaviour', 'behavior']) || '';
  const cue = (temp + ' ' + (hist || '')).toLowerCase();
  if (/\breactive\b|\baggress/.test(cue)) { fields.demeanor = 'reactive'; matched.push('Demeanor'); }
  else if (/\banxious\b|\bnervous\b|\bfractious\b/.test(cue)) { fields.demeanor = 'anxious'; matched.push('Demeanor'); }

  if (/\bfasted\b|\bnpo\b|\bwithh(e|o)ld(ing)? food\b/i.test(text)) { fields.fasted = true; matched.push('Fasting'); }

  // dense, flattened records (multi-page PDF exports) — the rule read is thin here
  const dense = text.length > 6000 || (text.split('\n').length < 12 && text.length > 2500);

  const ortho = _pickSentences(text, SCHED_MSK_CUES, 10);
  const medical = _pickSentences(text, SCHED_MED_CUES, 6).filter(s => !ortho.includes(s));

  // The history field is what Dr. Canapp reads before scanning. A referral's
  // reason block is kept whole and extended with any ortho finding it omits;
  // a records chart (no reason block) is summarised from the ortho findings.
  const reasonRaw = _reasonBlock(text);
  const reasonIsMSK = reasonRaw && (SCHED_MSK_ANATOMY.test(reasonRaw) || SCHED_GAIT.test(reasonRaw)) && !SCHED_NOT_CLINICAL.test(reasonRaw.slice(0, 120));
  const reason = reasonIsMSK ? reasonRaw : '';
  if (ortho.length || reason) {
    const base = reason || '';
    const norm = (s) => s.replace(/\u2026$/, '').replace(/\s+/g, ' ').trim();
    const have = norm(base).toLowerCase();
    const add = ortho.filter(o => !have.includes(norm(o).toLowerCase().slice(0, 40)));
    const text2 = base ? [base, ...add].join(' ') : add.join(' ');
    if (text2.trim()) {
      const h = text2.trim();
      fields.history = _clip(h[0].toUpperCase() + h.slice(1), 1600);
      if (!matched.includes('Clinical history')) matched.push('Clinical history');
      const ri = rejected.indexOf('Clinical history');
      if (ri >= 0) rejected.splice(ri, 1);
    }
  }

  return { fields, matched, rejected, dense, ortho, medical, raw: text };
}

/* Extract text from a File: .txt directly; .pdf via pdf.js if available. */
async function schedExtractText(file) {
  const name = (file.name || '').toLowerCase();
  if (/\.(txt|csv|md|rtf)$/.test(name) || (file.type || '').startsWith('text/')) {
    return await file.text();
  }
  if (/\.pdf$/.test(name) && window.pdfjsLib) {
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    let out = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      // keep line structure: pdf.js gives an EOL hint per item
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

window.schedParseIntake = schedParseIntake;
window.schedExtractText = schedExtractText;
window.schedClipText = _clip;
