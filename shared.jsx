/* global React, ReactDOM */
const { useState, useEffect, useRef } = React;

/* ========== TWEAKS ========== */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#B16A48",
  "surface": "warm-bone"
}/*EDITMODE-END*/;

function TweaksRoot() {
  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);
  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty('--clay', t.accent);
    r.style.setProperty('--clay-deep', shade(t.accent, -0.18));
    const surfaces = {
      'warm-bone':  ['#F4EFE5','#FBF8F1','#E8E1D2'],
      'sage-bone':  ['#EFEDE2','#F8F6EB','#DCDBC4'],
      'mist':       ['#EEEAE0','#F7F2E7','#DAD3C0'],
    };
    const [p, c, pd] = surfaces[t.surface] || surfaces['warm-bone'];
    r.style.setProperty('--paper', p);
    r.style.setProperty('--cream', c);
    r.style.setProperty('--paper-deep', pd);
  }, [t.accent, t.surface]);

  return (
    <window.TweaksPanel title="Tweaks">
      <window.TweakSection title="Color">
        <window.TweakColor
          label="Accent"
          value={t.accent}
          options={['#B16A48','#8C4F33','#5D6B4D','#1F2A22','#7C8A6C','#2A2A2A']}
          onChange={(v) => setTweak('accent', v)}
        />
        <window.TweakRadio
          label="Surface"
          value={t.surface}
          options={[
            { value: 'warm-bone', label: 'Bone' },
            { value: 'sage-bone', label: 'Sage' },
            { value: 'mist', label: 'Mist' },
          ]}
          onChange={(v) => setTweak('surface', v)}
        />
      </window.TweakSection>
    </window.TweaksPanel>
  );
}
function shade(hex, percent) {
  const c = hex.replace('#','');
  const num = parseInt(c, 16);
  let r = (num >> 16) + Math.round(255 * percent);
  let g = ((num >> 8) & 0xff) + Math.round(255 * percent);
  let b = (num & 0xff) + Math.round(255 * percent);
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return '#' + ((1<<24) + (r<<16) + (g<<8) + b).toString(16).slice(1);
}

/* ========== NAV ========== */
function Nav({ current }) {
  const links = [
    { href: 'index.html',       label: 'Practice',     key: 'home' },
    { href: 'services.html',    label: 'Services',     key: 'services' },
    { href: 'course.html',      label: 'Course',       key: 'course' },
    { href: 'network.html',     label: 'Network',      key: 'network' },
    { href: 'lectures.html',    label: 'Lectures',     key: 'lectures' },
    { href: 'achievements.html',label: 'Achievements', key: 'achievements' },
    { href: 'about.html',       label: 'About',        key: 'about' },
  ];
  return (
    <header className="nav-bar">
      <div className="container nav-inner">
        <a href="index.html" className="nav-brand" aria-label="Dr. Debra Canapp">
          <img src="assets/logo-mark.png" alt="" className="nav-logo" />
          <span>
            <div className="nav-name">Dr. Debra Canapp</div>
            <div className="nav-sub">Veterinary Sports Medicine</div>
          </span>
        </a>
        <nav className="nav-links">
          {links.map(l => (
            <a key={l.key} href={l.href} className={current === l.key ? 'active' : ''}>{l.label}</a>
          ))}
        </nav>
        <div className="nav-right">
          <a href="portal.html" className="nav-portal" aria-label="Portal login — submit a case">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ marginRight: 6 }}>
              <rect x="2.5" y="5.5" width="7" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.1"/>
              <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" stroke="currentColor" strokeWidth="1.1"/>
            </svg>
            Portal login
          </a>
          <span className="nav-divider" aria-hidden="true"></span>
          <a href="mailto:info@drdebracanapp.com" className="btn btn-sm">Contact</a>
        </div>
      </div>
    </header>
  );
}

/* ========== FOOTER ========== */
function Footer() {
  return (
    <footer className="footer" id="contact">
      <div className="container">
        <div className="footer-petowner">
          <div style={{ maxWidth: 680 }}>
            <div className="eyebrow" style={{ color: 'var(--tan)', marginBottom: 12 }}>Are you a pet owner?</div>
            <p className="serif" style={{ fontSize: 'clamp(22px,2.4vw,30px)', lineHeight: 1.25, color: 'var(--paper)', textWrap: 'balance' }}>
              Looking for a musculoskeletal ultrasound for your dog? Find a clinician trained by Dr. Canapp near you.
            </p>
          </div>
          <a href="network.html" className="btn btn-clay" style={{ whiteSpace: 'nowrap' }}>See the network <span className="arrow">→</span></a>
        </div>
        <div className="footer-grid">
          <div className="footer-col">
            <img src="assets/logo-mark.png" alt="Dr. Debra Canapp" style={{height:96, marginBottom:24, filter:'invert(1) brightness(1.4)'}} />
            <p className="body" style={{color:'rgba(244,239,229,0.78)', maxWidth:340}}>
              Veterinary sports medicine and diagnostic musculoskeletal ultrasound.
            </p>
          </div>
          <div className="footer-col">
            <h4>Practice</h4>
            <ul>
              <li><a href="services.html">Services</a></li>
              <li><a href="services.html">Refer a case</a></li>
              <li><a href="services.html">Remote reads</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Education</h4>
            <ul>
              <li><a href="course.html">The Course</a></li>
              <li><a href="course.html">Modules</a></li>
              <li><a href="course.html">Enroll</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Contact</h4>
            <ul>
              <li><a href="mailto:info@drdebracanapp.com">info@drdebracanapp.com</a></li>
              <li style={{marginTop:12}}><a href="#contact">Send a message via the contact form</a></li>
              <li style={{marginTop:12}}><a href="portal.html" style={{color:'var(--tan)'}}>Referral portal · sign in →</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <div>© {new Date().getFullYear()} Dr. Debra A. Canapp</div>
          <div>DVM · CCRT · CVA · Diplomate, ACVSMR</div>
        </div>
      </div>
    </footer>
  );
}

/* ========== Section head helper ========== */
function SectionHead({ label, children }) {
  return (
    <div className="section-head">
      <div className="label">
        <div className="eyebrow">{label}</div>
      </div>
      <div>{children}</div>
    </div>
  );
}

/* ========== Reveal on scroll ========== */
function useReveal(ref) {
  useEffect(() => {
    if (!ref.current) return;
    const els = ref.current.querySelectorAll('.fade-up');
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    els.forEach(el => io.observe(el));
    // Fallback: if IntersectionObserver never reports (offscreen/print/
    // screenshot contexts), reveal anything still hidden so content is
    // never stuck at opacity:0.
    const fallback = setTimeout(() => {
      els.forEach(el => {
        const r = el.getBoundingClientRect();
        if (!el.classList.contains('in') && r.top < window.innerHeight) {
          el.classList.add('in');
          io.unobserve(el);
        }
      });
    }, 1200);
    return () => { clearTimeout(fallback); io.disconnect(); };
  }, [ref]);
}

Object.assign(window, { Nav, Footer, SectionHead, TweaksRoot, useReveal, Marquee, CountUp, PetOwnerNote });

/* ========== Pet-owner pointer strip ========== */
function PetOwnerNote({ surface }) {
  return (
    <section data-screen-label="Pet Owner Note" style={{ background: surface || 'var(--cream)', borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}>
      <div className="container petowner-inner">
        <div className="petowner-text">
          <div className="eyebrow" style={{ color: 'var(--clay)', whiteSpace: 'nowrap' }}>Pet owner?</div>
          <p className="body" style={{ color: 'var(--ink-2)', margin: 0, maxWidth: 720 }}>
            Dr. Canapp works through veterinary referral — but the clinicians she has trained perform MSK ultrasound in their own practices. The network map shows where to find one near you.
          </p>
        </div>
        <a href="network.html" className="btn btn-clay" style={{ whiteSpace: 'nowrap' }}>Find a provider near you <span className="arrow">→</span></a>
      </div>
      <style>{`
        .petowner-inner { display:flex; align-items:center; justify-content:space-between; gap:32px; padding:26px var(--pad); flex-wrap:wrap; }
        .petowner-text { display:flex; align-items:baseline; gap:20px; flex-wrap:wrap; flex:1 1 480px; }
        @media (max-width:680px){ .petowner-text { gap:8px; } }
      `}</style>
    </section>
  );
}

/* ========== Marquee ========== */
function Marquee({ items }) {
  const seq = [...items, ...items];
  return (
    <div className="marquee">
      <div className="marquee-track">
        {seq.map((it, i) => <span key={i} className="marquee-item">{it}</span>)}
      </div>
    </div>
  );
}

/* ========== CountUp ========== */
function CountUp({ to, suffix = '', prefix = '', duration = 1.4 }) {
  const ref = useRef(null);
  const [val, setVal] = React.useState(typeof to === 'number' ? 0 : to);
  useEffect(() => {
    if (typeof to !== 'number' || !ref.current) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          const start = performance.now();
          const tick = (t) => {
            const p = Math.min(1, (t - start) / (duration * 1000));
            const eased = 1 - Math.pow(1 - p, 3);
            setVal(Math.round(to * eased));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          io.disconnect();
        }
      });
    }, { threshold: 0.4 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [to, duration]);
  return <span ref={ref} className="stat-num">{prefix}{val}{suffix}</span>;
}
