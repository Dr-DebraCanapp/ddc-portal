/* global React, window */
/* Shared staff top-bar for the pages that don't carry their own
   (Applications). Same shape as the Schedule bar so moving between
   them doesn't feel like a different product. */
function PrototypeBar({ active, who = '', role = 'Admin' }) {
  const logout = async () => {
    try { if (window.SchedCloud && window.SchedCloud.signOut) await window.SchedCloud.signOut(); } catch (e) {}
    window.location.href = 'Console.html';
  };
  return (
    <header className="rv-bar">
      <div className="rv-bar-inner">
        <a href="Console.html" className="rv-brand" title="Admin console">
          <img src="assets/logo-mark.png" alt="" onError={e => { e.target.style.display = 'none'; }} />
          <div>
            <div className="rv-brand-name">In-Person Scheduling</div>
            <div className="rv-brand-sub">Dr. Debra Canapp · Traveling MSK Ultrasound</div>
          </div>
        </a>
        <nav className="rv-nav">
          <a href="Console.html" className="rv-nav-link">⌂ Console</a>
          <a href="Schedule.html" className={`rv-nav-link ${active === 'schedule' ? 'active' : ''}`}>Schedule</a>
          <a href="Applications.html" className={`rv-nav-link ${active === 'apps' ? 'active' : ''}`}>Visit requests</a>
          <a href="reviewer.html" className="rv-nav-link muted" title="Remote-read referral portal">Remote reads ↗</a>
        </nav>
        <div className="rv-who">
          <div className="rv-who-meta">
            <div className="rv-who-name">{who || 'Signed in'}</div>
            <div className="rv-who-role">{role}</div>
          </div>
          <button className="rv-logout" onClick={logout}>Sign out</button>
        </div>
      </div>
    </header>
  );
}
window.PrototypeBar = PrototypeBar;
