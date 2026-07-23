/* ============================================================
   translate.jsx — dynamic-content machine translation for the portal.

   The referring-vet side renders in the vet's chosen language; Dr.
   Canapp's reviewer console stays English. This layer bridges the
   USER-GENERATED content that no static dictionary can cover:

     • Reports, invoices, and Dr. Canapp's comments  →  vet's language
       (mark the value element  data-mt-en2vet)
     • The vet's case history + their comments        →  English
       (mark the value element  data-mt-vet2en  data-mt-lang="<vetLang>")

   Attribute-driven so React views only tag the value elements — this
   file walks them, translates via the `translate` Edge Function (which
   holds the API key server-side), caches results, and re-runs when the
   vet switches language or new content renders.

   INERT until window.PORTAL_CONFIG.translate.enabled is true AND the
   Edge Function is deployed. Until then every string shows its original
   language (graceful fallback — nothing breaks). See TRANSLATE-SETUP.md.
   ============================================================ */
(function () {
  const CFG = (window.PORTAL_CONFIG && window.PORTAL_CONFIG.translate) || {};
  const ENABLED = !!CFG.enabled;
  const sbCfg = (window.PORTAL_CONFIG && window.PORTAL_CONFIG.supabase) || {};

  window.ddcVetLang = function () {
    // same cookie/storage the i18n switcher writes
    const c = document.cookie.split('; ').reduce((a, x) => {
      const [k, v] = x.split('='); return k === 'ddc_lang' ? decodeURIComponent(v || '') : a;
    }, '');
    if (c) return c;
    try { return localStorage.getItem('ddc_lang') || 'en'; } catch (e) { return 'en'; }
  };
  window.ddcTranslateEnabled = () => ENABLED;

  // ---- cache (memory + localStorage) --------------------------------------
  const LS = 'ddc_mt_cache';
  let store = {};
  try { store = JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { store = {}; }
  let saveT = null;
  function persist() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(LS, JSON.stringify(store)); } catch (e) {} }, 400); }
  const keyOf = (text, target, source) => target + '|' + (source || 'auto') + '|' + text;

  let _sb = null;
  function client() {
    if (_sb) return _sb;
    if (!sbCfg.url || !sbCfg.anonKey || !window.supabase) return null;
    _sb = window.__supabase || window.supabase.createClient(sbCfg.url, sbCfg.anonKey);
    return _sb;
  }

  // Translate an array of strings target/source. Returns array (same order).
  async function translateBatch(texts, target, source) {
    if (!ENABLED || !target || target === (source || '')) return texts;
    const out = new Array(texts.length);
    const need = [], needIdx = [];
    texts.forEach((t, i) => {
      if (!t || !t.trim()) { out[i] = t; return; }
      const k = keyOf(t, target, source);
      if (store[k] != null) out[i] = store[k];
      else { need.push(t); needIdx.push(i); }
    });
    if (!need.length) return out;
    const sb = client();
    if (!sb) { needIdx.forEach((i) => { out[i] = texts[i]; }); return out; }
    try {
      const { data, error } = await sb.functions.invoke('translate', {
        body: { q: need, target, source: source || undefined },
      });
      if (error || !data || data.error || !data.translations) throw (error || new Error(data && data.error));
      data.translations.forEach((tr, j) => {
        const i = needIdx[j];
        out[i] = tr;
        store[keyOf(texts[i], target, source)] = tr;
      });
      persist();
    } catch (e) {
      // graceful fallback — show original text
      needIdx.forEach((i) => { out[i] = texts[i]; });
    }
    return out;
  }
  window.ddcTranslate = async (text, target, source) => (await translateBatch([text], target, source))[0];

  // Translate every text node in an arbitrary document (used for the report /
  // invoice popups, which are written into a same-origin blank window).
  window.ddcTranslateDoc = async function (doc, target, source) {
    if (!ENABLED || !doc || !doc.body || !target || target === (source || '')) return;
    const nodes = [];
    const tw = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
      acceptNode(t) {
        if (!t.nodeValue || !t.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = t.parentElement;
        if (!p || SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n; while ((n = tw.nextNode())) nodes.push(n);
    const res = await translateBatch(nodes.map((t) => t.nodeValue.trim()), target, source);
    nodes.forEach((t, i) => {
      const raw = t.nodeValue, trimmed = raw.trim();
      const lead = raw.slice(0, raw.indexOf(trimmed));
      const trail = raw.slice(raw.indexOf(trimmed) + trimmed.length);
      t.nodeValue = lead + (res[i] || trimmed) + trail;
    });
  };

  // ---- DOM scanning -------------------------------------------------------
  const orig = new WeakMap(); // textNode -> original string
  const done = new WeakMap(); // textNode -> "target|source" already applied
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SVG', 'PATH']);

  function collectTextNodes(root) {
    const nodes = [];
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(t) {
        if (!t.nodeValue || !t.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = t.parentElement;
        if (!p || SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n; while ((n = tw.nextNode())) nodes.push(n);
    return nodes;
  }

  async function processRegion(el, target, source) {
    if (!target || target === (source || '')) return;
    const nodes = collectTextNodes(el);
    const texts = nodes.map((t) => {
      if (!orig.has(t)) orig.set(t, t.nodeValue);
      return orig.get(t);
    });
    const tag = target + '|' + (source || '');
    const pending = [], pendingNodes = [];
    nodes.forEach((t, i) => { if (done.get(t) !== tag) { pending.push(texts[i].trim()); pendingNodes.push({ t, raw: texts[i] }); } });
    if (!pending.length) return;
    const res = await translateBatch(pending, target, source);
    pendingNodes.forEach((o, i) => {
      const trimmed = o.raw.trim();
      const lead = o.raw.slice(0, o.raw.indexOf(trimmed));
      const trail = o.raw.slice(o.raw.indexOf(trimmed) + trimmed.length);
      o.t.nodeValue = lead + (res[i] || trimmed) + trail;
      done.set(o.t, tag);
    });
  }

  function scan() {
    const vet = window.ddcVetLang();
    // English → vet's language (report, invoice, reviewer comments)
    if (vet && vet !== 'en') {
      document.querySelectorAll('[data-mt-en2vet]').forEach((el) => { processRegion(el, vet, 'en'); });
    }
    // vet's language → English (case history + vet comments, reviewer side)
    document.querySelectorAll('[data-mt-vet2en]').forEach((el) => {
      const src = el.getAttribute('data-mt-lang') || '';
      if (src && src !== 'en') processRegion(el, 'en', src);
    });
  }
  window.ddcMTScan = scan;

  // initial + observe dynamic renders + language changes
  let t = null;
  function schedule() { clearTimeout(t); t = setTimeout(scan, 80); }
  function boot() {
    if (!ENABLED) return;
    scan();
    const mo = new MutationObserver((muts) => {
      for (const m of muts) { if (m.addedNodes && m.addedNodes.length) { schedule(); return; } }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('ddc:langchange', () => schedule());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
