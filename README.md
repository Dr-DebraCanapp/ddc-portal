# Marketing site — deploy bundle

Self-contained static redesign of drdebracanapp.com (the public marketing site).
No database, no build step. Fonts + d3/topojson load from CDN; everything else is here.

## Files
- index / services / course / network / lectures / achievements / about  (.html)
- concept-shared.css        shared tokens/nav/footer (network, lectures, achievements, about)
- network.css + network-concept.js   interactive clinician map (d3 + topojson via CDN)
- assets/                   logo + photography

## Publish to Cloudflare Pages (same flow as the portal)
1. dash.cloudflare.com -> Workers & Pages -> Create -> Pages -> Upload assets
2. Project name: ddc-site  ->  Create project
3. Drag the CONTENTS of this folder (index.html at top level) into the upload box -> Deploy
4. Custom domain -> www.drdebracanapp.com (and/or drdebracanapp.com) -> follow the CNAME steps
   Live URL first appears as ddc-site.pages.dev to smoke-test.

## Notes
- "Portal login" links point to https://portal.drdebracanapp.com (the existing portal deploy).
- This is a DIFFERENT Cloudflare project from ddc-portal — the portal/reviewer app stays where it is.
- Supabase is NOT involved in this site; it only backs the portal + reviewer console.
- Contact links are mailto:info@drdebracanapp.com. If you want a real contact form, that's a follow-up.
