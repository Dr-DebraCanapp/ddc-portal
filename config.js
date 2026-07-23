/* ============================================================
   Portal config — paste your Supabase keys here to enable
   cloud mode. Leave them empty to use the local IndexedDB demo.
   ============================================================
   How to fill these in: see SUPABASE_SETUP.md
   ============================================================ */
window.PORTAL_CONFIG = {
  supabase: {
    // Project URL — Supabase Dashboard → Settings → API → Project URL
    url:     'https://guypabbovyzrzktufodt.supabase.co',
    // anon / public key — Dashboard → Settings → API → anon public
    // (NEVER use the service_role key here)
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1eXBhYmJvdnl6cnprdHVmb2R0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMzQ0NDIsImV4cCI6MjA5NTkxMDQ0Mn0.GjD7hCHFIjRUMtX3jqu_sAOQxNJT26JL03Kyk6bzaqU',
  },

  // Dynamic-content translation (reports, invoices, comments, case history).
  // Flip enabled:true AFTER deploying the `translate` Edge Function with a
  // GOOGLE_TRANSLATE_KEY secret. Off = everything shows its original language
  // (nothing breaks). The referring-vet side translates both ways; Dr. Canapp's
  // reviewer console stays English. See TRANSLATE-SETUP.md.
  translate: {
    enabled: false,
  },

  // Cloudflare Turnstile — spam protection on the PUBLIC forms
  // (vet application + hospital visit request). Paste the SITE key from
  // Cloudflare → Turnstile here. The SECRET key goes in the Supabase Edge
  // Function env (TURNSTILE_SECRET), NEVER here. Blank = captcha off (forms
  // fall back to direct insert). See TURNSTILE-SETUP.md.
  turnstile: {
    siteKey: '0x4AAAAAAD7d0v65_6WluaZP',
  },

  // Invoice payment options.
  // FULL INTEGRATION (pre-filled amount + auto mark-paid): set payEndpoint to
  // your Cloudflare Worker URL (see stripe-worker/README.md). Leave it blank to
  // fall back to a static payOnlineUrl link, or blank both for check-only.
  payments: {
    payEndpoint:    '',                    // e.g. 'https://ddc-pay.<subdomain>.workers.dev'
    payOnlineUrl:   '',                    // fallback static link (only used if payEndpoint blank)
    payOnlineName:  'Pay online by card',  // button label
    checkPayableTo: 'Dr. Debra Canapp',
    checkMailTo:    '',                    // full mailing address; blank hides the mail-to line
  },
};
