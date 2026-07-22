/* global React */
/* Reviewer — Referring Veterinarians directory.
   Groups every case by its referring vet, surfaces YTD invoicing per vet,
   drills into each vet's cases + auto-generated invoices, and exports
   billing data in bulk (all vets or a selected subset). */

const { useState: rvUseState, useEffect: rvUseEffect, useMemo: rvUseMemo } = React;

/* ---- helpers ---------------------------------------------------------- */
// A stable key per vet: prefer email (lowercased), else name+clinic.
function vetKey(c) {
  const e = (c.referringEmail || '').trim().toLowerCase();
  if (e) return e;
  return `${(c.referringVet || 'Unknown').trim().toLowerCase()}|${(c.referringClinic || '').trim().toLowerCase()}`;
}
function invoiceYear(inv) {
  if (!inv) return null;
  const d = inv.issuedAt ? new Date(inv.issuedAt) : null;
  return d && !isNaN(d) ? d.getFullYear() : null;
}
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadText(filename, text, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

// Build the per-vet aggregate records from the flat case list.
function buildVets(cases, appsByEmail, year) {
  const map = new Map();
  for (const c of cases) {
    const key = vetKey(c);
    if (!map.has(key)) {
      const email = (c.referringEmail || '').trim();
      const app = email ? appsByEmail[email.toLowerCase()] : null;
      map.set(key, {
        key,
        name: c.referringVet || 'Unknown veterinarian',
        clinic: c.referringClinic || '',
        email,
        phone: (app && app.phone) || '',
        license: (app && app.license) || '',
        location: app ? [app.state, app.country].filter(Boolean).join(', ') : '',
        specialty: (app && app.specialty) || '',
        cases: [],
        casesTotal: 0,
        invoicedYTD: 0,
        paidYTD: 0,
        outstanding: 0,
        lastActivity: null,
      });
    }
    const v = map.get(key);
    v.cases.push(c);
    v.casesTotal += 1;
    const ts = new Date(c.submitted).getTime();
    if (!v.lastActivity || ts > v.lastActivity) v.lastActivity = ts;
    const inv = c.invoice;
    if (inv) {
      const amt = Number(inv.total || 0);
      const paid = inv.status === 'paid';
      if (invoiceYear(inv) === year) {
        v.invoicedYTD += amt;
        if (paid) v.paidYTD += amt;
      }
      if (!paid) v.outstanding += amt; // outstanding is all-time, not just YTD
    }
  }
  return Array.from(map.values()).sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
}

/* ---- main view -------------------------------------------------------- */
function VetsView({ onBack, onOpenCase }) {
  const [cases, setCases] = rvUseState([]);
  const [apps, setApps] = rvUseState([]);
  const [selected, setSelected] = rvUseState({}); // key -> bool
  const [openKey, setOpenKey] = rvUseState(null);
  const [search, setSearch] = rvUseState('');
  const year = new Date().getFullYear();

  const reload = async () => {
    const cs = await window.PortalDB.getAllCases();
    setCases(cs);
    if (window.PortalDB.refreshApplications) { try { await window.PortalDB.refreshApplications(); } catch (e) {} }
    setApps((window.PortalDB.getApplications && window.PortalDB.getApplications()) || []);
  };
  rvUseEffect(() => { reload(); }, []);

  const appsByEmail = rvUseMemo(() => {
    const m = {};
    apps.forEach(a => { if (a.email) m[a.email.toLowerCase()] = a; });
    return m;
  }, [apps]);

  const vets = rvUseMemo(() => buildVets(cases, appsByEmail, year), [cases, appsByEmail, year]);

  const filteredVets = rvUseMemo(() => {
    if (!search.trim()) return vets;
    const q = search.toLowerCase();
    return vets.filter(v =>
      v.name.toLowerCase().includes(q) ||
      v.clinic.toLowerCase().includes(q) ||
      v.email.toLowerCase().includes(q)
    );
  }, [vets, search]);

  const totals = rvUseMemo(() => {
    return vets.reduce((acc, v) => {
      acc.invoiced += v.invoicedYTD;
      acc.paid += v.paidYTD;
      acc.outstanding += v.outstanding;
      return acc;
    }, { invoiced: 0, paid: 0, outstanding: 0 });
  }, [vets]);

  const selectedKeys = Object.keys(selected).filter(k => selected[k]);
  const selectedCount = selectedKeys.length;
  const allVisibleSelected = filteredVets.length > 0 && filteredVets.every(v => selected[v.key]);

  const toggle = (key) => setSelected(s => ({ ...s, [key]: !s[key] }));
  const toggleAll = () => {
    if (allVisibleSelected) {
      setSelected(s => { const n = { ...s }; filteredVets.forEach(v => delete n[v.key]); return n; });
    } else {
      setSelected(s => { const n = { ...s }; filteredVets.forEach(v => { n[v.key] = true; }); return n; });
    }
  };

  // Which vets an export applies to: the selection, or all if nothing picked.
  const exportTargets = () => (selectedCount ? vets.filter(v => selected[v.key]) : vets);

  const exportDetailed = () => {
    const targets = exportTargets();
    const header = ['Referring Vet', 'Clinic', 'Email', 'Phone', 'Invoice #', 'Issue Date',
      'Case ID', 'Patient', 'Service', 'Site', 'Line Amount', 'Invoice Total', 'Status', 'Paid Date'];
    const rows = [header];
    targets.forEach(v => {
      v.cases.filter(c => c.invoice).forEach(c => {
        const inv = c.invoice;
        const issue = inv.issuedAt ? new Date(inv.issuedAt).toLocaleDateString('en-US') : '';
        const paidDate = inv.paidAt ? new Date(inv.paidAt).toLocaleDateString('en-US') : '';
        const lines = inv.lines && inv.lines.length ? inv.lines : [{ label: '', site: '', amount: inv.total }];
        lines.forEach((l, i) => {
          rows.push([
            v.name, v.clinic, v.email, v.phone,
            inv.number || '', issue,
            c.id, c.patient || '',
            l.label || '', l.site || '',
            Number(l.amount || 0).toFixed(2),
            i === 0 ? Number(inv.total || 0).toFixed(2) : '',
            inv.status === 'paid' ? 'Paid' : 'Unpaid',
            paidDate,
          ]);
        });
      });
    });
    const csv = rows.map(r => r.map(csvCell).join(',')).join('\n');
    downloadText(`invoices-detailed-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const exportSummary = () => {
    const targets = exportTargets();
    const header = ['Referring Vet', 'Clinic', 'Email', 'Phone', 'License', 'Total Cases',
      `Invoiced YTD (${year})`, `Paid YTD (${year})`, 'Outstanding (all-time)'];
    const rows = [header];
    targets.forEach(v => {
      rows.push([
        v.name, v.clinic, v.email, v.phone, v.license, v.casesTotal,
        v.invoicedYTD.toFixed(2), v.paidYTD.toFixed(2), v.outstanding.toFixed(2),
      ]);
    });
    const csv = rows.map(r => r.map(csvCell).join(',')).join('\n');
    downloadText(`vet-summary-${year}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const openVet = openKey ? vets.find(v => v.key === openKey) : null;

  if (openVet) {
    return <VetDetail vet={openVet} year={year} onBack={() => setOpenKey(null)}
      onOpenCase={onOpenCase} onChanged={reload} />;
  }

  return (
    <main className="rv-main rv-vets-main">
      <div className="rv-head">
        <div>
          <button onClick={onBack} className="rv-back" style={{ marginBottom: 12 }}>← Inbox</button>
          <div className="rv-eyebrow">Referring veterinarians</div>
          <h2 className="rv-h">Your referral network, by the numbers.</h2>
          <p className="rv-sub">
            {vets.length > 0
              ? <>{vets.length} referring {vets.length === 1 ? 'veterinarian' : 'veterinarians'} · <strong>{window.money(totals.invoiced)}</strong> invoiced in {year} · <strong>{window.money(totals.outstanding)}</strong> outstanding.</>
              : <>No cases yet. Once vets submit and reports are finalized, their invoicing appears here.</>}
          </p>
        </div>
      </div>

      <div className="rv-stats">
        <StatTileV n={vets.length} label="Referring vets" />
        <StatTileV n={window.money(totals.invoiced)} label={`Invoiced YTD (${year})`} />
        <StatTileV n={window.money(totals.paid)} label={`Collected YTD (${year})`} />
        <StatTileV n={window.money(totals.outstanding)} label="Outstanding" tone={totals.outstanding > 0 ? 'urgent' : ''} />
      </div>

      <div className="rv-vets-toolbar">
        <input
          type="search"
          className="rv-search"
          placeholder="Search vets by name, clinic, email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="rv-vets-export">
          <span className="rv-export-label">
            {selectedCount ? `${selectedCount} selected` : 'All vets'}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={exportSummary} disabled={vets.length === 0}>Export summary (CSV)</button>
          <button className="btn btn-clay btn-sm" onClick={exportDetailed} disabled={vets.length === 0}>Export invoices (CSV)</button>
        </div>
      </div>

      {filteredVets.length === 0 ? (
        <div className="rv-empty">
          <div className="rv-empty-h">No vets match</div>
          <p>Try a different search.</p>
        </div>
      ) : (
        <div className="rv-vet-table">
          <div className="rv-vet-thead">
            <div className="rv-vet-check">
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} title="Select all" />
            </div>
            <div>Veterinarian</div>
            <div className="ta-c">Cases</div>
            <div className="ta-r">Invoiced YTD</div>
            <div className="ta-r">Collected</div>
            <div className="ta-r">Outstanding</div>
            <div></div>
          </div>
          {filteredVets.map(v => (
            <div key={v.key} className={`rv-vet-row ${selected[v.key] ? 'is-sel' : ''}`} onClick={() => setOpenKey(v.key)}>
              <div className="rv-vet-check" onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={!!selected[v.key]} onChange={() => toggle(v.key)} />
              </div>
              <div className="rv-vet-id">
                <div className="nm">{v.name}</div>
                <div className="cl">{v.clinic || v.email || '—'}</div>
              </div>
              <div className="ta-c rv-vet-cases">{v.casesTotal}</div>
              <div className="ta-r">{window.money(v.invoicedYTD)}</div>
              <div className="ta-r rv-vet-paid">{window.money(v.paidYTD)}</div>
              <div className={`ta-r ${v.outstanding > 0 ? 'rv-vet-out' : 'dim'}`}>{window.money(v.outstanding)}</div>
              <div className="ta-r rv-open">Open <span className="arrow">→</span></div>
            </div>
          ))}
        </div>
      )}

      <p className="rv-vets-foot">
        Export applies to your current selection — tick specific vets, or leave all unticked to export everyone.
        “Invoiced YTD” counts invoices issued in {year}; “Outstanding” is every unpaid invoice regardless of year.
      </p>
    </main>
  );
}

function StatTileV({ n, label, tone }) {
  return (
    <div className={`rv-stat ${tone || ''}`}>
      <div className="n">{n}</div>
      <div className="l">{label}</div>
    </div>
  );
}

/* ---- per-vet detail --------------------------------------------------- */
function VetDetail({ vet, year, onBack, onOpenCase, onChanged }) {
  const [busy, setBusy] = rvUseState(null);

  const invoicedCases = vet.cases
    .filter(c => c.invoice)
    .sort((a, b) => new Date(b.invoice.issuedAt || b.submitted) - new Date(a.invoice.issuedAt || a.submitted));
  const openCases = vet.cases
    .filter(c => !c.invoice)
    .sort((a, b) => new Date(b.submitted) - new Date(a.submitted));

  const viewInvoice = (c) => {
    const w = window.open('', '_blank', 'width=820,height=1000');
    if (!w) return;
    w.document.write(window.buildInvoiceHTML(c, c.invoice));
    w.document.close();
  };
  const togglePaid = async (c) => {
    setBusy(c.id);
    const nowPaid = !(c.invoice && c.invoice.status === 'paid');
    await window.PortalDB.setInvoicePaid(c.id, nowPaid);
    await onChanged();
    setBusy(null);
  };

  return (
    <main className="rv-main rv-vet-detail">
      <div className="rv-head">
        <div>
          <button onClick={onBack} className="rv-back" style={{ marginBottom: 12 }}>← All referring vets</button>
          <div className="rv-eyebrow">Referring veterinarian</div>
          <h2 className="rv-h">{vet.name}</h2>
          <p className="rv-sub">{vet.clinic}</p>
        </div>
      </div>

      <div className="rv-vet-profile">
        <ProfileCell label="Email">{vet.email ? <a href={`mailto:${vet.email}`}>{vet.email}</a> : '—'}</ProfileCell>
        <ProfileCell label="Phone">{vet.phone || '—'}</ProfileCell>
        <ProfileCell label="License">{vet.license || '—'}</ProfileCell>
        <ProfileCell label="Location">{vet.location || '—'}</ProfileCell>
        <ProfileCell label="Focus">{vet.specialty || '—'}</ProfileCell>
      </div>

      <div className="rv-stats" style={{ marginTop: 4 }}>
        <StatTileV n={vet.casesTotal} label="Total cases" />
        <StatTileV n={window.money(vet.invoicedYTD)} label={`Invoiced YTD (${year})`} />
        <StatTileV n={window.money(vet.paidYTD)} label={`Collected YTD (${year})`} />
        <StatTileV n={window.money(vet.outstanding)} label="Outstanding" tone={vet.outstanding > 0 ? 'urgent' : ''} />
      </div>

      <div className="rv-vet-section">
        <div className="rv-section-eyebrow">Invoices · issued after each report is finalized</div>
        {invoicedCases.length === 0 ? (
          <div className="rv-empty sm"><p>No invoices yet. An invoice is generated automatically when a report is finalized and delivered.</p></div>
        ) : (
          <div className="rv-inv-table">
            <div className="rv-inv-thead">
              <div>Invoice</div>
              <div>Patient / case</div>
              <div>Issued</div>
              <div className="ta-r">Amount</div>
              <div className="ta-c">Status</div>
              <div></div>
            </div>
            {invoicedCases.map(c => (
              <div key={c.id} className="rv-inv-trow">
                <div className="rv-inv-no">{c.invoice.number}</div>
                <div>
                  <div className="rv-inv-pat">{c.patient}</div>
                  <div className="rv-inv-cid">{c.id}</div>
                </div>
                <div className="rv-inv-date">{c.invoice.issuedAt ? new Date(c.invoice.issuedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</div>
                <div className="ta-r rv-inv-amt">{window.money(c.invoice.total)}</div>
                <div className="ta-c">
                  <span className={`rv-pay-pill ${c.invoice.status === 'paid' ? 'paid' : 'unpaid'}`}>
                    {c.invoice.status === 'paid' ? '✓ Paid' : 'Unpaid'}
                  </span>
                </div>
                <div className="ta-r rv-inv-rowacts">
                  <button className="btn btn-ghost btn-xs" onClick={() => viewInvoice(c)}>View</button>
                  <button className={`btn btn-xs ${c.invoice.status === 'paid' ? 'btn-ghost' : 'btn-clay'}`}
                    onClick={() => togglePaid(c)} disabled={busy === c.id}>
                    {busy === c.id ? '…' : (c.invoice.status === 'paid' ? 'Mark unpaid' : 'Mark paid')}
                  </button>
                  {onOpenCase && <button className="btn btn-ghost btn-xs" onClick={() => onOpenCase(c.id)}>Case →</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {openCases.length > 0 && (
        <div className="rv-vet-section">
          <div className="rv-section-eyebrow">In progress · not yet invoiced</div>
          <div className="rv-inv-table">
            {openCases.map(c => (
              <div key={c.id} className="rv-inv-trow open" onClick={() => onOpenCase && onOpenCase(c.id)}>
                <div className="rv-inv-no dim">—</div>
                <div>
                  <div className="rv-inv-pat">{c.patient}</div>
                  <div className="rv-inv-cid">{c.id}</div>
                </div>
                <div className="rv-inv-date">{new Date(c.submitted).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                <div className="ta-r dim">—</div>
                <div className="ta-c"><span className={`status-pill ${c.status}`}>{window.statusLabel(c.status)}</span></div>
                <div className="ta-r rv-open">Open <span className="arrow">→</span></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

function ProfileCell({ label, children }) {
  return (
    <div className="rv-profile-cell">
      <div className="rv-profile-label">{label}</div>
      <div className="rv-profile-val">{children}</div>
    </div>
  );
}

window.VetsView = VetsView;
