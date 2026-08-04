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
  // Cloudflare Turnstile — spam protection on the PUBLIC forms
  // (vet application + hospital visit request). Paste the SITE key from
  // Cloudflare → Turnstile. The SECRET key goes in the Supabase Edge Function
  // env (TURNSTILE_SECRET), NEVER here. Blank = captcha off. See TURNSTILE-SETUP.md.
  turnstile: {
    siteKey: '0x4AAAAAAD7d0v65_6WluaZP',
  },
  // Machine translation of student-generated content (homework notes in,
  // Dr. Canapp's feedback out). The static UI + lessons are handled by the
  // dictionary engine (i18n.js) and need no key. This flag only powers the
  // free-text bridge (platform/mt.js -> Supabase `translate` Edge Function).
  // Leave false to pass text through untranslated; set true after running
  // `supabase secrets set GOOGLE_TRANSLATE_KEY=...`. See TRANSLATE-SETUP.md.
  translate: { enabled: false },
  // AI intake review on the scheduler (Schedule.html → schedule-ai.jsx).
  // Reads uploaded referral paperwork/radiographs, auto-fills the patient
  // form and writes a summary + prep flags. Leave enabled:false to use the
  // built-in rule-based keyword read (no network, no key). Set true after
  // `supabase functions deploy ai-intake` +
  // `supabase secrets set ANTHROPIC_API_KEY=...`. See AI-INTAKE-SETUP.md.
  ai: { enabled: false },

  // Sending email from the console — invitations, welcome emails with
  // sign-in details, invoices and statements. Leave enabled:false and every
  // one of those opens a draft in your own mail program instead, which
  // works but sends from your personal address. Set true after
  // `supabase functions deploy send-mail` +
  // `supabase secrets set RESEND_API_KEY=... NOTIFY_EMAIL_FROM="..."`.
  // See EMAIL-SETUP.md.
  mail: { enabled: false },

  // Invoice payment options — these print on every invoice, statement and
  // receipt, and are written into the email draft. Fill in what you actually
  // use; blank entries are simply left off.
  payments: {
    // Where clients sign in to view statements, download PDFs and see payments.
    portalUrl:      'https://portal.drdebracanapp.com',
    checkPayableTo: 'Dr. Debra Canapp',
    checkMailTo:    '',                    // full mailing address; blank hides the post-to line
    // ACH / bank transfer. Leave routing/account blank if you'd rather not put
    // them on a PDF — the note below is used instead.
    achBank:        '',
    achAccountName: 'Dr. Debra Canapp',
    achRouting:     '',
    achAccount:     '',
    achEmailNote:   'Ask us for ACH details if you would like to pay by bank transfer.',
    // Card payments arrive with Stripe; until then leave these blank.
    payEndpoint:    '',
    payOnlineUrl:   '',
    payOnlineName:  'Pay online by card',
  },
};
