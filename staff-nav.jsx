/* global React, window */
/* ============================================================
   One staff top bar, identical on every page.

   The old arrangement had four bars with four different names for
   the same four places, so the menu appeared to change under you.
   The rule now:

     top bar    = which part of the practice you are in
     second row = what you are looking at inside it

   The top bar never changes. Nothing is marked as "leaving" with an
   arrow, because it is all one system as far as staff are concerned.
   ============================================================ */

/* Billing and Alerts are hosted inside the scheduling app, hence the
   hash links — Schedule reads the hash on load. */
const STAFF_NAV = [
  { key: 'home', label: 'Home', href: 'Console.html', title: 'Today across both practices' },
  { key: 'remote', label: 'Remote reads', href: 'reviewer.html', title: 'Case inbox, reports, vet applications' },
  { key: 'schedule', label: 'Schedule', href: 'Schedule.html', title: 'Clinic days, hospitals, visit requests' },
  { key: 'imaging', label: 'Imaging', href: 'Schedule.html#imaging', title: 'Studies sent straight from clinic machines — both sides' },
  { key: 'billing', label: 'Billing', href: 'Schedule.html#billing', title: 'Invoices and statements — both sides' },
  { key: 'alerts', label: 'Alerts', href: 'Schedule.html#alerts', title: 'Who gets texted when something needs a human' },
];

/* Second row for the Schedule section. Visit requests is one of its views,
   the same way Vet applications is a view of Remote reads. */
const SCHED_SUBNAV = [
  { key: 'calendar', label: 'Calendar', href: 'Schedule.html' },
  { key: 'clinics', label: 'Hospitals', href: 'Schedule.html#clinics' },
  { key: 'visits', label: 'Visit requests', href: 'Applications.html' },
];

/* Shared second row. onNav returns true to keep it in-page. */
function SubBar({ items, active, onNav, right }) {
  const click = (item) => (e) => { if (onNav && onNav(item.key) === true) e.preventDefault(); };
  return (
    <div className="sc-subbar">
      <div className="sc-subbar-inner">
        <div className="sc-seg">
          {items.map(item => (
            <a key={item.key} href={item.href || '#'} className={active === item.key ? 'active' : ''} onClick={click(item)}>
              {item.label}
              {item.badge ? <span className="sc-tab-badge">{item.badge}</span> : null}
            </a>
          ))}
        </div>
        <div className="sc-subbar-spacer" />
        {right || null}
      </div>
    </div>
  );
}

/* active   — one of the keys above
   onNav    — optional: return true to handle a destination in-page
              instead of navigating (Schedule does this for its own tabs)
   hospital — hospital accounts get the brand only; their navigation is
              the sub-bar, and none of these destinations are theirs */
/* One place decides how a role reads to a human, so no caller can leak the
   raw database value. */
const ROLE_LABEL = {
  reviewer: 'Reviewing Veterinarian',
  admin: 'Practice Administrator',
  hospital: 'Hospital account',
  vet: 'Referring veterinarian',
};
const roleLabel = (r) => {
  const raw = String(r || '');
  if (ROLE_LABEL[raw.toLowerCase()]) return ROLE_LABEL[raw.toLowerCase()];
  return raw;   // already a formatted label
};

function StaffBar({ active, who, role, onNav, hospital, unread, imagingWaiting }) {
  const click = (item) => (e) => {
    if (!onNav) return;
    if (onNav(item.key) === true) e.preventDefault();
  };
  const logout = async () => {
    try {
      if (window.SchedCloud && window.SchedCloud.signOut) await window.SchedCloud.signOut();
      else if (window.SupabaseAuth && window.SupabaseAuth.signOut) await window.SupabaseAuth.signOut();
    } catch (e) { /* signing out locally is enough */ }
    window.location.href = 'Console.html';
  };
  return (
    <header className="rv-bar">
      <div className="rv-bar-inner">
        <a href={hospital ? 'Schedule.html' : 'Console.html'} className="rv-brand" title="Practice console">
          <img src="assets/logo-mark.png" alt="" onError={e => { e.target.style.display = 'none'; }} />
          <div>
            <div className="rv-brand-name">Dr. Debra Canapp</div>
            <div className="rv-brand-sub">{hospital ? 'Hospital scheduling' : 'Practice console'}</div>
          </div>
        </a>
        {!hospital && (
          <nav className="rv-nav">
            {STAFF_NAV.map(item => (
              <a key={item.key} href={item.href} title={item.title}
                 className={`rv-nav-link ${active === item.key ? 'active' : ''}`}
                 onClick={click(item)}>
                {item.label}
                {item.key === 'remote' && unread ? <window.UnreadBadge n={unread} label={`${unread} case${unread === 1 ? '' : 's'} with new vet messages`} /> : null}
                {item.key === 'imaging' && imagingWaiting ? <span className="sc-tab-badge">{imagingWaiting}</span> : null}
              </a>
            ))}
          </nav>
        )}
        <div className="rv-who">
          <div className="rv-who-meta">
            <div className="rv-who-name">{who || 'Signed in'}</div>
            <div className="rv-who-role">{roleLabel(role)}</div>
          </div>
          <button className="rv-logout" onClick={logout}>Sign out</button>
        </div>
      </div>
    </header>
  );
}

/* Older pages call PrototypeBar({ active: 'apps' | 'schedule' }). */
function PrototypeBar({ active, who, role }) {
  const map = { apps: 'schedule', schedule: 'schedule' };
  return <StaffBar active={map[active] || active} who={who} role={role} />;
}

Object.assign(window, { StaffBar, SubBar, PrototypeBar, STAFF_NAV, SCHED_SUBNAV, roleLabel });
