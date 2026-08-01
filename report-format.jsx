/* global window */
/* ============================================================
   Report formatting — one dictated body, typeset on the way out.
   Dr. Canapp dictates into Talkatoo and pastes the whole report
   into a single field. This turns that plain text into a properly
   set document: headings, paragraphs, lists and labelled regions,
   without her having to fill in separate boxes.

   Recognised, in order:
     · a short line ending in ":"  or in CAPITALS  → heading
     · "Left shoulder: the biceps…"                → labelled paragraph
     · "-", "•", "*" or "1." at line start         → list
     · anything else                               → paragraph
   Blank lines separate blocks; single newlines inside a paragraph
   are kept as line breaks.
   ============================================================ */
(function () {
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const HEADING_WORDS = /^(findings?|impressions?|diagnosis|diagnoses|assessment|recommendations?|plan|technique|history|clinical history|comparison|comments?|conclusions?|summary|discussion|limitations?|sites? (evaluated|examined|imaged)|study|studies|indication|signalment)\b/i;

  const isBullet = (l) => /^([-–—•*·]|\d+[.)])\s+/.test(l);
  const bulletText = (l) => l.replace(/^([-–—•*·]|\d+[.)])\s+/, '');
  const isOrdered = (l) => /^\d+[.)]\s+/.test(l);

  function isHeading(l) {
    if (l.length > 72) return false;
    if (/:$/.test(l)) return true;                                   // "Findings:"
    const letters = l.replace(/[^A-Za-z]/g, '');
    if (letters.length >= 3 && l === l.toUpperCase() && /[A-Z]/.test(l)) return true; // "FINDINGS"
    if (HEADING_WORDS.test(l) && l.split(/\s+/).length <= 4) return true;
    return false;
  }
  const ACRONYMS = /^(mri|ct|us|dicom|stat|roi|rom|ccl|cbc|pt|iv|ia|ap|l|r)$/i;
  function titleCase(s) {
    return s.toLowerCase().split(/(\s+|\/|-)/).map(w => {
      if (!w.trim() || /^[\s/-]+$/.test(w)) return w;
      if (ACRONYMS.test(w)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join('');
  }
  function headingText(l) {
    const t = l.replace(/\s*:\s*$/, '');
    const letters = t.replace(/[^A-Za-z]/g, '');
    // dictated headings often arrive shouting — set them like a document
    return (letters.length >= 3 && t === t.toUpperCase()) ? titleCase(t) : t;
  }

  /* "Left shoulder: the biceps tendon is…" — a short label, then prose. */
  const LABELLED = /^([A-Z][A-Za-z0-9 /&'’-]{1,44}):\s+(\S.*)$/;

  function formatReportBody(text) {
    const raw = String(text || '').replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim();
    if (!raw) return '';
    const out = [];
    raw.split(/\n\s*\n+/).forEach(block => {
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
      let para = [];
      let list = null;      // { ordered, items[] }
      const flushPara = () => {
        if (!para.length) return;
        const joined = para.map(esc).join('<br>');
        const m = para.length === 1 ? para[0].match(LABELLED) : null;
        const lead = m ? m[2].charAt(0).toUpperCase() + m[2].slice(1) : '';
        out.push(m
          ? `<p><strong>${esc(m[1])}.</strong> ${esc(lead)}</p>`
          : `<p>${joined}</p>`);
        para = [];
      };
      const flushList = () => {
        if (!list) return;
        const tag = list.ordered ? 'ol' : 'ul';
        out.push(`<${tag}>${list.items.map(i => `<li>${esc(i)}</li>`).join('')}</${tag}>`);
        list = null;
      };
      lines.forEach(line => {
        if (isBullet(line)) {
          flushPara();
          const ordered = isOrdered(line);
          if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
          list.items.push(bulletText(line));
          return;
        }
        flushList();
        if (isHeading(line)) { flushPara(); out.push(`<h2>${esc(headingText(line))}</h2>`); return; }
        para.push(line);
      });
      flushList();
      flushPara();
    });
    return out.join('\n');
  }

  /* Older reports were three separate boxes. Fold them into one body so
     nothing written before the change is lost or displayed differently. */
  function reportBody(r) {
    if (!r) return '';
    if (r.body && r.body.trim()) return r.body;
    const parts = [];
    if (r.findings && r.findings.trim()) parts.push('Findings:\n' + r.findings.trim());
    if (r.impression && r.impression.trim()) parts.push('Impression / Diagnosis:\n' + r.impression.trim());
    if (r.recommendations && r.recommendations.trim()) parts.push('Recommendations:\n' + r.recommendations.trim());
    return parts.join('\n\n');
  }

  window.formatReportBody = formatReportBody;
  window.reportBody = reportBody;
})();
