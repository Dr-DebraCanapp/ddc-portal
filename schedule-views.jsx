/* global React, window */
/* ============================================================
   Schedule — calendar directions
   A) MonthGrid + WeekStrip  → "The Ledger"
   B) AgendaView (+ MiniMonth) → "The Itinerary"
   C) CircuitView (+ Map)      → "The Circuit"
   Hook aliases (useState…) come from schedule-shared.jsx global scope.
   ============================================================ */

const WD_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthMatrix(year, month) {
  const first = new Date(year, month, 1);
  const cur = new Date(year, month, 1 - first.getDay());
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let i = 0; i < 7; i++) { row.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
    weeks.push(row);
  }
  return weeks;
}
const dayOn = (days, dt) => days.find(x => window.SCHED.sameDay(x.date, dt));

/* ---- shared rich day card (agenda + circuit) --------------- */
function DayCard({ day, role, onOpen }) {
  const Sx = window.SCHED;
  const clinic = day.clinic ? Sx.clinic(day.clinic) : null;
  const total = Sx.dayTotal(day);
  const active = Sx.active(day);
  const sedCount = active.filter(p => Sx.sedation(p).required).length;
  return (
    <div className={`sc-daycard ${day.status}`} onClick={() => onOpen(day)}>
      <div className="sc-dc-date">
        <div className="wd">{WD_SHORT[day.date.getDay()]}</div>
        <div className="dn">{day.date.getDate()}</div>
        <div className="mo">{MO_SHORT[day.date.getMonth()]}</div>
      </div>
      <div className="sc-dc-body">
        <div className="sc-dc-clinic">{clinic ? clinic.name : 'Open day'}</div>
        <div className="sc-dc-loc">
          {clinic ? <React.Fragment>{clinic.city}, {clinic.state} · {clinic.miles} mi{clinic.region === 'ca' && ' ✈'}</React.Fragment> : 'Available to book'}
        </div>
        <div className="sc-dc-pats">
          {day.patients.map(p => <window.PatChip key={p.id} p={p} />)}
          {day.patients.length === 0 && <span style={{ fontSize: 12, color: 'var(--ink-3)', fontStyle: 'italic' }}>Awaiting roster</span>}
        </div>
      </div>
      <div className="sc-dc-side">
        <window.SchedPill status={day.status} />
        {active.length > 0 && <div className="sc-dc-amt">{Sx.money(total)}</div>}
        {day.invoice && <span className={`rv-pay-pill ${day.invoice.status === 'paid' ? 'paid' : 'unpaid'}`}>{day.invoice.status === 'paid' ? '✓ Paid' : 'Unpaid'}</span>}
        {sedCount > 0 && <span style={{ fontSize: 11, color: 'var(--clay)', letterSpacing: '0.04em' }}>{sedCount} sedation</span>}
      </div>
    </div>
  );
}

/* ============================================================
   A — MONTH GRID  ("The Ledger")
   ============================================================ */
function MonthGrid({ days, year, month, role, onOpen, onPublish }) {
  const Sx = window.SCHED;
  const weeks = monthMatrix(year, month);
  return (
    <div className="sc-cal">
      <div className="sc-weekrow">{WD_SHORT.map(w => <div key={w} className="wd">{w}</div>)}</div>
      <div className="sc-grid">
        {weeks.flat().map((dt, i) => {
          const inMonth = dt.getMonth() === month;
          const isToday = Sx.sameDay(dt, Sx.TODAY);
          const day = dayOn(days, dt);
          const wknd = dt.getDay() === 0 || dt.getDay() === 6;
          const isPast = dt < Sx.TODAY && !isToday;
          const clinic = day && day.clinic ? Sx.clinic(day.clinic) : null;
          return (
            <div key={i} className={`sc-cell ${inMonth ? '' : 'other'} ${isToday ? 'today' : ''}`}>
              <div className="dnum">
                <span className="n">{dt.getDate()}</span>
                {isToday && <span className="wknd" style={{ color: 'var(--clay)' }}>Today</span>}
              </div>
              {day && day.status === 'available' && (
                <button className={`sc-avail ${day.reservedFor ? 'reserved' : ''}`} onClick={() => onOpen(day)}
                  style={day.reservedFor ? { '--hcolor': Sx.clinicColor(day.reservedFor) } : null}>
                  {day.reservedFor
                    ? <span className="hold"><span className="hsw" style={{ background: Sx.clinicColor(day.reservedFor) }} />Held · {Sx.clinic(day.reservedFor).name.replace(/ (Hospital|Veterinary|Animal|Clinic|Center|Specialists).*$/, '')}</span>
                    : <>Open day {role === 'admin' && <span className="x" title="published">✦</span>}</>}
                </button>
              )}
              {day && day.status !== 'available' && (
                <button className={`sc-ev ${day.status} ${clinic && clinic.region === 'ca' ? 'ca' : ''}`} onClick={() => onOpen(day)}
                  style={clinic ? { '--hcolor': clinic.color } : null}>
                  <span className="ev-clinic"><span className="ev-sw" style={{ background: clinic ? clinic.color : 'var(--ink-4)' }} />{clinic ? clinic.name.replace(/ (Hospital|Veterinary|Animal|Clinic|Center|Specialists).*$/, '') : 'Clinic day'}</span>
                  <span className="ev-meta">
                    <span className="sc-pdots">{Sx.active(day).slice(0, 4).map((p, k) => <i key={k} />)}</span>
                    {Sx.active(day).length} pt{Sx.active(day).length === 1 ? '' : 's'} · {Sx.money(Sx.dayTotal(day))}
                  </span>
                  {clinic && <span className="ev-loc">{clinic.city}, {clinic.state}{clinic.region === 'ca' ? ' ✈' : ''}</span>}
                </button>
              )}
              {!day && inMonth && !wknd && !isPast && role === 'admin' && (
                <button className="sc-open-btn" onClick={() => onPublish(dt)}>+ open this day</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---- Week strip -------------------------------------------- */
function WeekStrip({ days, anchor, role, onOpen, onPublish }) {
  const Sx = window.SCHED;
  const start = new Date(anchor); start.setDate(anchor.getDate() - anchor.getDay());
  const cols = Array.from({ length: 7 }, (_, i) => { const x = new Date(start); x.setDate(start.getDate() + i); return x; });
  return (
    <div className="sc-week">
      {cols.map((dt, i) => {
        const isToday = Sx.sameDay(dt, Sx.TODAY);
        const day = dayOn(days, dt);
        const clinic = day && day.clinic ? Sx.clinic(day.clinic) : null;
        const wknd = dt.getDay() === 0 || dt.getDay() === 6;
        const isPast = dt < Sx.TODAY && !isToday;
        return (
          <div key={i} className={`wcol ${isToday ? 'today' : ''}`}>
            <div className="whead"><div className="wd">{WD_SHORT[dt.getDay()]}</div><div className="wn">{dt.getDate()}</div></div>
            <div className="wbody">
              {day && day.status === 'available' && (
                <button className={`sc-avail ${day.reservedFor ? 'reserved' : ''}`} onClick={() => onOpen(day)}
                  style={day.reservedFor ? { '--hcolor': Sx.clinicColor(day.reservedFor) } : null}>
                  {day.reservedFor
                    ? <span className="hold"><span className="hsw" style={{ background: Sx.clinicColor(day.reservedFor) }} />Held · {Sx.clinic(day.reservedFor).name}</span>
                    : 'Open day'}
                </button>
              )}
              {day && day.status !== 'available' && (
                <button className={`sc-ev ${day.status} ${clinic && clinic.region === 'ca' ? 'ca' : ''}`} onClick={() => onOpen(day)}
                  style={clinic ? { '--hcolor': clinic.color } : null}>
                  <span className="ev-clinic"><span className="ev-sw" style={{ background: clinic ? clinic.color : 'var(--ink-4)' }} />{clinic ? clinic.name : 'Clinic day'}</span>
                  <span className="ev-meta"><span className="sc-pdots">{Sx.active(day).map((p, k) => <i key={k} />)}</span>{Sx.active(day).length} pts · {Sx.money(Sx.dayTotal(day))}</span>
                  {clinic && <span className="ev-loc">{clinic.city}, {clinic.state}</span>}
                </button>
              )}
              {!day && !wknd && !isPast && role === 'admin' && <button className="sc-open-btn" style={{ opacity: 1 }} onClick={() => onPublish(dt)}>+ open this day</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   B — MINI MONTH (rail nav)
   ============================================================ */
function MiniMonth({ days, year, month, onPrev, onNext, onPick }) {
  const Sx = window.SCHED;
  const weeks = monthMatrix(year, month);
  return (
    <div className="sc-mini">
      <div className="sc-mini-head">
        <button onClick={onPrev} aria-label="Previous month">‹</button>
        <div className="mo">{Sx.MONTHS[month]} {year}</div>
        <button onClick={onNext} aria-label="Next month">›</button>
      </div>
      <div className="sc-mini-grid">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => <div key={i} className="mwd">{w}</div>)}
        {weeks.flat().map((dt, i) => {
          const inMonth = dt.getMonth() === month;
          const isToday = Sx.sameDay(dt, Sx.TODAY);
          const day = dayOn(days, dt);
          return (
            <div key={i} className={`sc-mini-cell ${inMonth ? '' : 'other'} ${isToday ? 'today' : ''}`} onClick={() => day && onPick(day)} style={{ cursor: day ? 'pointer' : 'default' }}>
              {dt.getDate()}
              {day && <span className={`mdot ${day.status}`} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   B — AGENDA  ("The Itinerary")
   ============================================================ */
function AgendaView({ days, role, onOpen, year, month, setMonth }) {
  const Sx = window.SCHED;
  const sorted = [...days].sort((a, b) => a.date - b.date);
  const upcoming = sorted.filter(x => x.date >= Sx.TODAY || Sx.sameDay(x.date, Sx.TODAY));
  const past = sorted.filter(x => x.date < Sx.TODAY && !Sx.sameDay(x.date, Sx.TODAY)).reverse();

  // rail metrics
  const openCount = days.filter(x => x.status === 'available').length;
  const confirmedPts = days.filter(x => x.date >= Sx.TODAY).reduce((s, x) => s + Sx.active(x).length, 0);
  const outstanding = days.reduce((s, x) => s + (x.invoice && x.invoice.status !== 'paid' ? Sx.dayTotal(x) : 0), 0);

  // group upcoming by month
  const groups = [];
  upcoming.forEach(day => {
    const key = `${day.date.getFullYear()}-${day.date.getMonth()}`;
    let g = groups.find(x => x.key === key);
    if (!g) { g = { key, label: `${Sx.MONTHS[day.date.getMonth()]} ${day.date.getFullYear()}`, items: [] }; groups.push(g); }
    g.items.push(day);
  });

  return (
    <div className="sc-split">
      <div className="sc-rail">
        <MiniMonth days={days} year={year} month={month}
          onPrev={() => setMonth(month === 0 ? [year - 1, 11] : [year, month - 1])}
          onNext={() => setMonth(month === 11 ? [year + 1, 0] : [year, month + 1])}
          onPick={onOpen} />
        <div className="sc-railblock">
          <h4>At a glance</h4>
          <div className="sc-railrow"><span>Upcoming clinic days</span><span className="v">{upcoming.filter(x => x.status !== 'completed').length}</span></div>
          <div className="sc-railrow"><span>Patients booked</span><span className="v">{confirmedPts}</span></div>
          <div className="sc-railrow"><span>Open days to fill</span><span className="v clay">{openCount}</span></div>
          <div className="sc-railrow"><span>Outstanding</span><span className="v clay">{Sx.money(outstanding)}</span></div>
        </div>
      </div>

      <div className="sc-agenda">
        {groups.map(g => (
          <React.Fragment key={g.key}>
            <div className="sc-month-sep">{g.label}</div>
            {g.items.map(day => <DayCard key={day.id} day={day} role={role} onOpen={onOpen} />)}
          </React.Fragment>
        ))}
        {past.length > 0 && (
          <React.Fragment>
            <div className="sc-month-sep">Earlier</div>
            {past.map(day => <DayCard key={day.id} day={day} role={role} onOpen={onOpen} />)}
          </React.Fragment>
        )}
        {upcoming.length === 0 && <div className="sc-empty"><div className="eh">No upcoming days</div><p>Publish an open day to get started.</p></div>}
      </div>
    </div>
  );
}

/* ============================================================
   C — CIRCUIT  (map / travel-forward)
   ============================================================ */
function CircuitView({ days, role, onOpen }) {
  const Sx = window.SCHED;
  const upcoming = [...days].filter(x => x.date >= Sx.TODAY || Sx.sameDay(x.date, Sx.TODAY)).sort((a, b) => a.date - b.date);

  // group into trips: CA days = one trip; MD days grouped together
  const md = upcoming.filter(x => { const c = x.clinic ? Sx.clinic(x.clinic) : null; return !c || c.region === 'md'; });
  const ca = upcoming.filter(x => { const c = x.clinic ? Sx.clinic(x.clinic) : null; return c && c.region === 'ca'; });

  // map pins from clinics that appear in upcoming
  const pinDays = upcoming.filter(x => x.clinic);
  const seen = {};
  const pins = [];
  pinDays.forEach(x => { const c = Sx.clinic(x.clinic); if (c && !seen[c.id]) { seen[c.id] = true; pins.push({ c, status: x.status }); } });

  return (
    <div className="sc-circuit">
      <div>
        <div className="sc-trip">
          <div className="sc-trip-head">
            <span className="ttl">Maryland circuit</span>
            <span className="meta">Home base · day trips</span>
          </div>
          {md.length === 0 ? <div className="sc-empty" style={{ padding: '28px 18px' }}>No Maryland days scheduled.</div>
            : md.map(day => <DayCard key={day.id} day={day} role={role} onOpen={onOpen} />)}
        </div>

        {ca.length > 0 && (
          <div className="sc-trip">
            <div className="sc-trip-head">
              <span className="ttl">California ✈</span>
              <span className="meta far">Monthly trip · {ca.length} clinic day{ca.length === 1 ? '' : 's'}</span>
            </div>
            {ca.map(day => <DayCard key={day.id} day={day} role={role} onOpen={onOpen} />)}
          </div>
        )}
      </div>

      <div className="sc-map" aria-label="Clinic locations map">
        <div className="sc-map-grid" />
        <div className="sc-map-label">Clinic locations</div>
        {pins.map(({ c, status }, i) => (
          <div key={i} className={`sc-pin ${status === 'completed' ? 'completed' : ''}`} style={{ left: c.mapX + '%', top: c.mapY + '%' }} title={`${c.name} — ${c.city}, ${c.state}`}>
            <span className="dot" />
            <span className="lbl">{c.city}, {c.state}</span>
          </div>
        ))}
        <div className="sc-map-note">// schematic — drop a real map (Mapbox / Google) here at build time.<br />MD cluster ≈ 20–45 mi · CA trip ≈ 2,800 mi (monthly)</div>
      </div>
    </div>
  );
}

Object.assign(window, { DayCard, MonthGrid, WeekStrip, MiniMonth, AgendaView, CircuitView });
