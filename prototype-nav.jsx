/* global React, window */
/* Shared top-nav for the prototype pages — makes the menu clickable
   across CaseInbox / Schedule / Invoicing / Applications. */
function PrototypeBar({ active, who = 'Allyson Li', role = 'Admin' }) {
  const items = [
    { key: 'schedule', label: 'Schedule', href: 'Schedule.html' },
    { key: 'apps', label: 'Visit requests', href: 'Applications.html' },
  ];
  return (
    <header className="rv-bar">
      <div className="rv-bar-inner">
        <a href="Schedule.html" className="rv-brand" title="In-person scheduling">
          <img src="assets/logo-mark.png" alt="" onError={e => { e.target.style.display = 'none'; }} />
          <div>
            <div className="rv-brand-name">In-Person Scheduling</div>
            <div className="rv-brand-sub">Dr. Debra Canapp · Traveling MSK Ultrasound</div>
          </div>
        </a>
          <a href="Schedule.html" className={`rv-nav-link ${active === 'schedule' ? 'active' : ''}`}>Schedule</a>
          <a href="Applications.html" className={`rv-nav-link ${active === 'apps' ? 'active' : ''}`}>Visit requests</a>
          <a href="reviewer.html" className="rv-nav-link muted" title="Remote-read referral portal (separate system)">Remote-read portal ↗</a>
        </nav>
        <div className="rv-who">
          <div className="rv-who-meta">
            <div className="rv-who-name">{who}</div>
            <div className="rv-who-role">{role}</div>
          </div>
          <button className="rv-logout">Sign out</button>
        </div>
      </div>
    </header>
  );
}
window.PrototypeBar = PrototypeBar;
