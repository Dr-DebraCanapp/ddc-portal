/* ============================================================
   ACCESS NOTICE — the modal shown when someone signs in at the
   wrong door. Never a dead end: it always sits ON TOP of a live
   sign-in form, and the caller signs the session out first so a
   refresh can't strand them here.
   Exposes: window.AccessNotice
   ============================================================ */
(function () {
  const DEFAULT_LINKS = [
    { href: 'index.html', t: 'Referring veterinarians',
      d: 'Submit a study for a remote read, and collect your report' },
    { href: 'Schedule.html', t: 'Hospitals',
      d: 'Book an in-person visit and add patients to a clinic day' },
  ];

  window.AccessNotice = function AccessNotice({
    eyebrow = 'Wrong door',
    title = "This page is for Dr. Canapp's office.",
    body = "Those credentials work \u2014 they're just not for this page. Here's where you're headed:",
    links,
    onDismiss,
    dismissLabel = 'Try a different sign-in',
  }) {
    const ls = links === undefined ? DEFAULT_LINKS : links;
    return (
      <div className="ax-wrap" onClick={onDismiss}>
        <div className="ax-card" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
          <div className="rv-eyebrow">{eyebrow}</div>
          <h3 className="ax-h">{title}</h3>
          <p className="ax-p">{body}</p>
          {ls && ls.length > 0 && (
            <div className="ax-links">
              {ls.map(l => (
                <a key={l.href} className="ax-link" href={l.href}>
                  <span className="t">{l.t}</span>
                  <span className="d">{l.d}</span>
                </a>
              ))}
            </div>
          )}
          <button className="btn btn-ghost btn-sm ax-dismiss" onClick={onDismiss}>{dismissLabel}</button>
        </div>
      </div>
    );
  };
})();
