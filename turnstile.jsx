/* global React */
/* ============================================================
   Cloudflare Turnstile — React widget + loader.
   INERT unless window.PORTAL_CONFIG.turnstile.siteKey is set.
   Exposes: window.TurnstileBox (component), window.turnstileEnabled().
   ============================================================ */
(function () {
  const CFG = (window.PORTAL_CONFIG && window.PORTAL_CONFIG.turnstile) || {};
  window.TURNSTILE_SITEKEY = CFG.siteKey || '';
  window.turnstileEnabled = () => !!window.TURNSTILE_SITEKEY;

  let _loading = null;
  function ensureScript() {
    if (window.turnstile) return Promise.resolve();
    if (_loading) return _loading;
    _loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Turnstile failed to load'));
      document.head.appendChild(s);
    });
    return _loading;
  }

  function TurnstileBox({ onToken }) {
    const hostRef = React.useRef(null);
    const widgetRef = React.useRef(null);
    React.useEffect(() => {
      if (!window.TURNSTILE_SITEKEY) return;
      let cancelled = false;
      ensureScript().then(function render() {
        if (cancelled) return;
        if (!window.turnstile || !hostRef.current) { setTimeout(render, 100); return; }
        widgetRef.current = window.turnstile.render(hostRef.current, {
          sitekey: window.TURNSTILE_SITEKEY,
          callback: (t) => onToken(t),
          'expired-callback': () => onToken(''),
          'error-callback': () => onToken(''),
        });
      }).catch(() => {});
      return () => {
        cancelled = true;
        try { if (widgetRef.current && window.turnstile) window.turnstile.remove(widgetRef.current); } catch (e) {}
      };
    }, []);
    if (!window.TURNSTILE_SITEKEY) return null;
    return React.createElement('div', { style: { margin: '6px 0 18px' } }, React.createElement('div', { ref: hostRef }));
  }

  window.TurnstileBox = TurnstileBox;
})();
