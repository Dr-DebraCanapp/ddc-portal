/* ============================================================
   ddc-i18n — lightweight, dependency-free translation layer.
   Works on the static marketing site AND the React portal.

   How it translates (no need to tag every string):
     1. Explicit:  any element with data-i18n="key" — value in the
        dictionary may contain inline HTML (<em>, <br>, etc.).
     2. Automatic: leaf "text block" elements (h1-6, p, li, a, span,
        button, label, th, td, figcaption…) are keyed by their trimmed
        innerHTML; loose text nodes elsewhere are keyed by trimmed text.
   English is the source language and the key. Missing translations
   fall back to English gracefully, so a partially-translated page is
   never broken — just partly English.

   Persistence: choice saved to localStorage AND a cookie scoped to
   .drdebracanapp.com, so the apex site and portal subdomain share it.

   A MutationObserver re-translates dynamically-added nodes (marquee,
   React re-renders), so the portal works the same as the static site.
   ============================================================ */
(function () {
  const LANGS = {
    en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch',
    it: 'Italiano', pt: 'Português', zh: '中文', ja: '日本語', ko: '한국어',
  };
  const RTL = new Set(['ar', 'he', 'fa', 'ur']); // future-proofing; none active yet
  const COOKIE = 'ddc_lang';
  const LS = 'ddc_lang';
  const BASE = (document.currentScript && document.currentScript.src || '')
    .replace(/[^/]*$/, ''); // dir this script lives in, for loading i18n/<lang>.js

  const INLINE = new Set(['EM', 'B', 'I', 'STRONG', 'SMALL', 'SUB', 'SUP', 'MARK', 'U', 'BR', 'WBR', 'CODE']);
  const UNIT = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'LI', 'A', 'BUTTON', 'SPAN', 'FIGCAPTION', 'TH', 'TD', 'LABEL', 'OPTION', 'SUMMARY', 'BLOCKQUOTE', 'CITE', 'DT', 'DD', 'CAPTION', 'LEGEND']);
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'PATH', 'TEXTAREA', 'PRE', 'CODE']);

  window.I18N = window.I18N || { dict: {} };
  window.registerI18n = function (lang, entries) {
    window.I18N.dict[lang] = Object.assign(window.I18N.dict[lang] || {}, entries);
    if (state.lang === lang) apply(); // re-apply if this is the active language
  };

  const state = { lang: 'en', observing: false, writing: false };
  const origUnit = new WeakMap();  // element -> original trimmed innerHTML
  const origText = new WeakMap();  // text node -> original text
  const origAttr = new WeakMap();  // element -> {attr: originalValue}
  // strip editor-injected binding attributes so keys match the source markup
  const norm = (s) => s.replace(/\s*data-(?:om-id|cc-id|dm-ref|comment-anchor)="[^"]*"/g, '');

  function getCookie(n) {
    return document.cookie.split('; ').reduce((a, c) => {
      const [k, v] = c.split('='); return k === n ? decodeURIComponent(v || '') : a;
    }, '');
  }
  function setCookie(n, v) {
    const host = location.hostname;
    // scope to the registrable domain so apex + portal subdomain share it
    const dom = /drdebracanapp\.com$/.test(host) ? '; domain=.drdebracanapp.com' : '';
    document.cookie = `${n}=${encodeURIComponent(v)}; path=/; max-age=31536000; samesite=lax${dom}`;
  }
  function saved() {
    return getCookie(COOKIE) || (function () { try { return localStorage.getItem(LS) || ''; } catch (e) { return ''; } })();
  }
  function persist(lang) {
    setCookie(COOKIE, lang);
    try { localStorage.setItem(LS, lang); } catch (e) {}
  }

  // ---- node collection ----------------------------------------------------
  function isLeafUnit(el) {
    if (!UNIT.has(el.tagName)) return false;
    if (el.hasAttribute('data-i18n')) return false; // handled explicitly
    if (el.closest('[data-no-i18n]')) return false;
    // leaf = contains no nested UNIT element (inline tags are fine)
    for (const d of el.getElementsByTagName('*')) {
      if (UNIT.has(d.tagName)) return false;
    }
    return el.textContent.trim().length > 0;
  }
  function skipEl(el) {
    return SKIP.has(el.tagName) || el.closest('[data-no-i18n]') || el.closest('.ddc-lang') || el.closest('[data-mt-en2vet],[data-mt-vet2en]');
  }

  function collect(root) {
    const explicit = [], units = [], texts = [], attrs = [];
    const push = (el) => {
      // explicit data-i18n
      el.querySelectorAll('[data-i18n]').forEach((n) => { if (!skipEl(n)) explicit.push(n); });
      // leaf units
      const walkEls = el.querySelectorAll(Array.from(UNIT).join(','));
      walkEls.forEach((n) => { if (!skipEl(n) && isLeafUnit(n)) units.push(n); });
      if (el.nodeType === 1 && el.matches('[data-i18n]') && !skipEl(el)) explicit.push(el);
      if (el.nodeType === 1 && isLeafUnit(el) && !skipEl(el)) units.push(el);
      // attributes
      el.querySelectorAll('[placeholder],[aria-label],[title],img[alt]').forEach((n) => {
        if (!skipEl(n)) attrs.push(n);
      });
    };
    push(root === document ? document.body : root);

    // loose text nodes not inside a leaf unit / explicit element
    const tw = document.createTreeWalker(root === document ? document.body : root, NodeFilter.SHOW_TEXT, {
      acceptNode(t) {
        if (!t.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = t.parentElement;
        if (!p || skipEl(p)) return NodeFilter.FILTER_REJECT;
        if (p.closest('[data-i18n]')) return NodeFilter.FILTER_REJECT;
        if (p.closest('[data-mt-en2vet],[data-mt-vet2en]')) return NodeFilter.FILTER_REJECT;
        // inside a leaf unit? its innerHTML is handled as a unit
        let a = p;
        while (a) { if (a.nodeType === 1 && (UNIT.has(a.tagName)) && isLeafUnit(a)) return NodeFilter.FILTER_REJECT; a = a.parentElement; }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let t; while ((t = tw.nextNode())) texts.push(t);
    return { explicit, units, texts, attrs };
  }

  // ---- apply ---------------------------------------------------------------
  const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
  function tr(key) {
    if (state.lang === 'en') return null;
    const d = window.I18N.dict[state.lang];
    if (!d) return null;
    const v = d[key];
    return (v === undefined || v === null) ? null : v;
  }

  function apply(root) {
    root = root || document;
    const { explicit, units, texts, attrs } = collect(root);
    state.writing = true;

    explicit.forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (!origUnit.has(el)) origUnit.set(el, el.innerHTML.trim());
      const en = origUnit.get(el);
      const v = state.lang === 'en' ? en : (tr(key) != null ? tr(key) : en);
      if (el.innerHTML.trim() !== v) el.innerHTML = v;
    });

    units.forEach((el) => {
      if (!origUnit.has(el)) origUnit.set(el, el.innerHTML.trim());
      const en = origUnit.get(el);
      const v = state.lang === 'en' ? en : (tr(norm(en)) != null ? tr(norm(en)) : en);
      if (el.innerHTML.trim() !== v) el.innerHTML = v;
    });

    texts.forEach((t) => {
      if (!origText.has(t)) origText.set(t, t.nodeValue);
      const raw = origText.get(t);
      const key = raw.trim();
      const v = state.lang === 'en' ? raw : (tr(key) != null ? raw.replace(key, tr(key)) : raw);
      if (t.nodeValue !== v) t.nodeValue = v;
    });

    attrs.forEach((el) => {
      let store = origAttr.get(el);
      if (!store) { store = {}; origAttr.set(el, store); }
      ATTRS.forEach((a) => {
        if (!el.hasAttribute(a)) return;
        if (!(a in store)) store[a] = el.getAttribute(a);
        const en = store[a];
        if (!en || !en.trim()) return;
        const v = state.lang === 'en' ? en : (tr(en.trim()) != null ? tr(en.trim()) : en);
        if (el.getAttribute(a) !== v) el.setAttribute(a, v);
      });
    });

    // document title + meta description (once, keyed explicitly)
    if (document.title) {
      if (!state._title) state._title = document.title;
      const v = state.lang === 'en' ? state._title : (tr(state._title) || state._title);
      if (document.title !== v) document.title = v;
    }
    state.writing = false;
  }

  // ---- language files (lazy) ----------------------------------------------
  const loaded = {};
  function loadLang(lang) {
    if (lang === 'en' || window.I18N.dict[lang] || loaded[lang]) return Promise.resolve();
    loaded[lang] = new Promise((res) => {
      const s = document.createElement('script');
      s.src = `${BASE}i18n/${lang}.js`;
      s.onload = () => res();
      s.onerror = () => { console.warn('[i18n] no dictionary for', lang); res(); };
      document.head.appendChild(s);
    });
    return loaded[lang];
  }

  function setLang(lang) {
    if (!LANGS[lang]) lang = 'en';
    state.lang = lang;
    document.documentElement.lang = lang;
    document.documentElement.dir = RTL.has(lang) ? 'rtl' : 'ltr';
    persist(lang);
    document.querySelectorAll('.ddc-lang select').forEach((s) => { if (s.value !== lang) s.value = lang; });
    // let the dynamic-content translator (translate.jsx) re-run for the new language
    try { document.dispatchEvent(new CustomEvent('ddc:langchange', { detail: { lang } })); } catch (e) {}
    loadLang(lang).then(() => apply());
  }
  window.setLanguage = setLang;
  window.ddcI18nRefresh = () => apply();

  // ---- switcher UI ---------------------------------------------------------
  function makeSelect() {
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', 'Choose language');
    Object.keys(LANGS).forEach((k) => {
      const o = document.createElement('option');
      o.value = k; o.textContent = LANGS[k];
      sel.appendChild(o);
    });
    sel.value = state.lang;
    sel.addEventListener('change', () => setLang(sel.value));
    return sel;
  }
  function makeWrap(cls) {
    const wrap = document.createElement('div');
    wrap.className = 'ddc-lang' + (cls ? ' ' + cls : '');
    wrap.setAttribute('data-no-i18n', '');
    wrap.appendChild(makeSelect());
    return wrap;
  }
  function buildSwitcher() {
    injectCSS();
    if (!document.querySelector('.nav-right .ddc-lang, [data-i18n-mount] .ddc-lang')) {
      const mount = document.querySelector('[data-i18n-mount]')
        || document.querySelector('.nav-right')
        || document.body;
      const floating = mount === document.body;
      const wrap = makeWrap(floating ? 'ddc-lang-float' : '');
      if (mount.classList && mount.classList.contains('nav-right')) mount.insertBefore(wrap, mount.firstChild);
      else mount.appendChild(wrap);
    }
    // mobile: the hamburger panel hides .nav-right, so add a copy in its footer
    const foot = document.querySelector('.mnav-foot');
    if (foot && !foot.querySelector('.ddc-lang')) {
      foot.insertBefore(makeWrap('ddc-lang-mobile'), foot.firstChild);
    }
  }
  function injectCSS() {
    if (document.getElementById('ddc-lang-css')) return;
    const s = document.createElement('style');
    s.id = 'ddc-lang-css';
    s.textContent = `.ddc-lang{display:inline-flex;align-items:center}
.ddc-lang select{appearance:none;-webkit-appearance:none;font:inherit;font-size:12px;letter-spacing:.02em;color:currentColor;background:transparent;border:1px solid rgba(120,110,95,.35);border-radius:999px;padding:6px 26px 6px 12px;cursor:pointer;line-height:1;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.4' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center}
.ddc-lang select:hover{border-color:rgba(120,110,95,.6)}
.ddc-lang select option{color:#1a1a1a}
.ddc-lang-float{position:fixed;right:16px;bottom:16px;z-index:9999;background:#fff;border-radius:999px;box-shadow:0 4px 18px rgba(0,0,0,.18)}
.ddc-lang-float select{border-color:rgba(0,0,0,.15)}
.mnav-foot .ddc-lang{order:-1;margin-bottom:4px}
.mnav-foot .ddc-lang select{color:var(--paper,#f4efe5);border-color:rgba(244,239,229,.32);font-size:14px;padding:10px 30px 10px 14px}`;
    document.head.appendChild(s);
  }

  // ---- observer for dynamic content ---------------------------------------
  function observe() {
    if (state.observing) return;
    const mo = new MutationObserver((muts) => {
      if (state.writing || state.lang === 'en') return;
      let hit = false;
      for (const m of muts) { if (m.addedNodes && m.addedNodes.length) { hit = true; break; } }
      if (hit) { clearTimeout(state._t); state._t = setTimeout(() => apply(), 60); }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    state.observing = true;
  }

  // ---- boot ---------------------------------------------------------------
  function boot() {
    state.lang = LANGS[saved()] ? saved() : 'en';
    buildSwitcher();
    document.documentElement.lang = state.lang;
    document.documentElement.dir = RTL.has(state.lang) ? 'rtl' : 'ltr';
    if (state.lang !== 'en') loadLang(state.lang).then(() => apply());
    observe();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
