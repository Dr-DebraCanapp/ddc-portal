/* global supabase */
/* ============================================================
   Portal Supabase Adapter
   ------------------------------------------------------------
   When config.js has Supabase credentials, this file
   REPLACES window.PortalDB with a cloud-backed version and
   exposes window.SupabaseAuth for the auth gates.
   When config.js is empty, this file does NOTHING — the
   IndexedDB version from portal-storage.jsx stays in place.
   ============================================================ */

(function () {
  const cfg = (window.PORTAL_CONFIG && window.PORTAL_CONFIG.supabase) || {};
  const url = (cfg.url || '').trim();
  const anonKey = (cfg.anonKey || '').trim();

  if (!url || !anonKey) {
    console.log('[portal] using IndexedDB fallback (Supabase not configured — see SUPABASE_SETUP.md)');
    return;
  }
  if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
    console.error('[portal] Supabase SDK not loaded; check the <script> tag in your HTML.');
    return;
  }

  // Serialized auth lock (in-memory promise-chain mutex).
  // supabase-js defaults to navigator.locks to serialize token access, but
  // that deadlocks getSession() in some embedded/iframe/Safari contexts,
  // hanging sign-in forever. A *no-op* lock fixes the hang but lets
  // concurrent token refreshes RACE during bulk uploads — the refresh token
  // rotates, stragglers reuse the stale one, and the session gets invalidated
  // (silent logout mid-upload). This chain serializes every auth op WITHOUT
  // navigator.locks: it runs immediately when idle (no hang) and queues when
  // busy (no refresh race). Best of both.
  let _authChain = Promise.resolve();
  const serialAuthLock = (_name, _acquireTimeout, fn) => {
    const run = _authChain.then(() => fn());
    _authChain = run.then(() => {}, () => {});
    return run;
  };

  const sb = window.supabase.createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'ddc_supabase_auth',
      lock: serialAuthLock,
    },
  });
  window.__supabase = sb;
  window.PORTAL_BACKEND = 'supabase';
  console.log('[portal] using Supabase backend');

  /* ============================================================
     FIELD MAPPING — DB row (snake_case) ↔ App object (camelCase)
     ============================================================ */
  function rowToCase(r) {
    if (!r) return null;
    return {
      id: r.id,
      patient: r.patient,
      species: r.species,
      breed: r.breed,
      age: r.age,
      sex: r.sex,
      weight: r.weight,
      complaint: r.complaint,
      duration: r.duration,
      medications: r.medications,
      examFindings: r.exam_findings,
      priorImaging: r.prior_imaging,
      submittedBy: r.submitted_by,
      referringVet: r.referring_vet,
      referringClinic: r.referring_clinic,
      referringEmail: r.referring_email,
      submitted: r.submitted,
      status: r.status,
      seeded: r.seeded,
      files: r.files_count || {},
      timeline: r.timeline || [],
      report: r.report || null,
      sites: r.sites || [],
      invoice: r.invoice || null,
      lang: r.lang || 'en',
    };
  }
  function caseToRow(c) {
    return {
      id: c.id,
      patient: c.patient,
      species: c.species,
      breed: c.breed,
      age: c.age,
      sex: c.sex,
      weight: c.weight,
      complaint: c.complaint,
      duration: c.duration,
      medications: c.medications,
      exam_findings: c.examFindings,
      prior_imaging: c.priorImaging,
      submitted_by: c.submittedBy || null,
      referring_vet: c.referringVet,
      referring_clinic: c.referringClinic,
      referring_email: c.referringEmail,
      submitted: c.submitted,
      status: c.status || 'submitted',
      seeded: !!c.seeded,
      files_count: c.files || {},
      timeline: c.timeline || [],
      report: c.report || null,
      sites: c.sites || [],
      invoice: c.invoice || null,
      lang: c.lang || 'en',
      updated_at: new Date().toISOString(),
    };
  }
  function rowToFile(r) {
    return {
      id: r.id,
      caseId: r.case_id,
      kind: r.kind,
      name: r.name,
      type: r.type,
      size: r.size,
      bucketPath: r.bucket_path,
      addedAt: new Date(r.added_at || Date.now()).getTime(),
      // blob is fetched lazily — see getFile()
      blob: null,
    };
  }

  /* ============================================================
     CASES
     ============================================================ */
  async function putCase(c) {
    const row = caseToRow(c);
    if (!row.submitted_by && !row.seeded) {
      // Stamp ownership from the live auth user so RLS insert/upload checks pass.
      try { const { data: { user } } = await sb.auth.getUser(); if (user) row.submitted_by = user.id; } catch (e) {}
    }
    const { error } = await sb.from('cases').upsert(row);
    if (error) throw error;
  }
  async function getCase(id) {
    const { data, error } = await sb.from('cases').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return rowToCase(data);
  }
  async function getAllCases() {
    const { data, error } = await sb.from('cases').select('*').order('submitted', { ascending: false });
    if (error) throw error;
    return (data || []).map(rowToCase);
  }
  async function deleteCase(id) {
    // Cascade in DB handles case_files + annotations; clean up Storage too.
    const { data: files } = await sb.from('case_files').select('bucket_path').eq('case_id', id);
    if (files && files.length) {
      await sb.storage.from('case-files').remove(files.map(f => f.bucket_path));
    }
    const { data: deleted, error } = await sb.from('cases').delete().eq('id', id).select('id');
    if (error) throw error;
    if (!deleted || deleted.length === 0) {
      throw new Error('Delete was blocked by the database (no reviewer delete permission). Run supabase-delete-permissions-migration.sql in Supabase → SQL Editor, then try again.');
    }
  }

  /* ============================================================
     CASE FILES — metadata + storage blobs
     ============================================================ */
  // Proactively validate/refresh the session. Calling getSession() through the
  // serialized auth lock refreshes the token once, safely, BEFORE a big batch —
  // so the access token can't expire-and-race in the middle of bulk uploads.
  async function ensureSession() {
    try {
      const { data } = await sb.auth.getSession();
      return !!(data && data.session);
    } catch (e) { return false; }
  }

  // FAST BULK UPLOAD — fetch the access token ONCE, then upload every file
  // directly to the Storage + PostgREST endpoints with high concurrency.
  // This avoids supabase-js re-fetching/locking a token per file, which was
  // adding ~10s of pure handshake overhead to each (tiny) DICOM.
  async function uploadFiles(caseId, recs, onProgress) {
    const t0 = (performance && performance.now) ? performance.now() : Date.now();
    const { data } = await sb.auth.getSession();
    const token = data && data.session && data.session.access_token;
    if (!token) throw new Error('Your session has expired — please sign in again.');
    const tToken = ((performance && performance.now) ? performance.now() : Date.now()) - t0;
    console.log(`[upload] FAST uploader · ${recs.length} files · token in ${Math.round(tToken)}ms · concurrency ${Math.min(8, recs.length || 1)}`);
    const authH = { apikey: anonKey, Authorization: 'Bearer ' + token };
    const total = recs.length;
    let done = 0, idx = 0;
    const failed = [];
    const uploadOne = async (rec) => {
      const fid = rec.id || `${rec.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const path = `${caseId}/${rec.kind}/${fid}_${rec.name}`;
      const ctype = rec.type || 'application/octet-stream';
      // 1) blob -> Storage. Treat an "already exists" response as success so a
      //    retry (after a transient meta failure) doesn't 400 on the existing blob.
      const up = await fetch(`${url}/storage/v1/object/case-files/${path.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'POST',
        headers: { ...authH, 'x-upsert': 'true', 'Content-Type': ctype, 'cache-control': '3600' },
        body: rec.blob,
      });
      if (!up.ok) {
        const body = await up.text();
        const exists = up.status === 409 || /exist|duplicate/i.test(body);
        if (!exists) throw new Error(`storage ${up.status}: ${body.slice(0, 160)}`);
      }
      // 2) metadata row -> PostgREST (idempotent upsert on primary key)
      const meta = await fetch(`${url}/rest/v1/case_files?on_conflict=id`, {
        method: 'POST',
        headers: { ...authH, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ id: fid, case_id: caseId, kind: rec.kind, name: rec.name, type: rec.type, size: rec.size, bucket_path: path }),
      });
      if (!meta.ok) throw new Error(`meta ${meta.status}: ${(await meta.text()).slice(0, 160)}`);
    };
    const worker = async () => {
      while (idx < recs.length) {
        const rec = recs[idx++];
        const ft = (performance && performance.now) ? performance.now() : Date.now();
        let ok = false, lastErr;
        for (let attempt = 0; attempt < 2 && !ok; attempt++) {
          try { await uploadOne(rec); ok = true; }
          catch (e) { lastErr = e; }
        }
        if (!ok) {
          failed.push({ rec, e: lastErr });
          console.error(`[upload] FAILED ${rec.name} (${Math.round((rec.size || 0) / 1024)}KB):`, lastErr && lastErr.message ? lastErr.message : lastErr);
        }
        done++;
        if (done <= 3 || done % 10 === 0) {
          console.log(`[upload] file ${done}/${total} (${Math.round((rec.size||0)/1024)}KB) in ${Math.round(((performance && performance.now) ? performance.now() : Date.now()) - ft)}ms`);
        }
        if (onProgress) onProgress(done, total);
      }
    };
    await Promise.all(Array.from({ length: Math.min(8, recs.length || 1) }, worker));
    const totalMs = ((performance && performance.now) ? performance.now() : Date.now()) - t0;
    console.log(`[upload] DONE ${total - failed.length}/${total} in ${(totalMs / 1000).toFixed(1)}s (${Math.round(totalMs / total)}ms/file avg)`);
    return { uploaded: total - failed.length, failed };
  }

  async function putFile({ id, caseId, kind, name, type, size, blob }) {
    const path = `${caseId}/${kind}/${id}_${name}`;
    let lastErr;
    // Two attempts: a transient 401/refresh hiccup on the first try is retried
    // after re-validating the session, instead of failing the file outright.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { error: upErr } = await sb.storage.from('case-files').upload(path, blob, {
          cacheControl: '3600',
          upsert: false,
          contentType: type || 'application/octet-stream',
        });
        if (upErr) throw upErr;
        const { error: dbErr } = await sb.from('case_files').upsert({
          id, case_id: caseId, kind, name, type, size, bucket_path: path,
        });
        if (dbErr) throw dbErr;
        return;
      } catch (e) {
        lastErr = e;
        if (attempt === 0) { await ensureSession(); continue; }
      }
    }
    throw lastErr;
  }

  async function getFile(id) {
    const { data: row, error } = await sb.from('case_files').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!row) return null;
    const rec = rowToFile(row);
    const { data: blob, error: dlErr } = await sb.storage.from('case-files').download(row.bucket_path);
    if (dlErr) throw dlErr;
    rec.blob = blob;
    return rec;
  }

  // Returns file metadata + eager-loads blob for each (so viewer + thumbnails work).
  // For very large studies, this can be slow; v2 will lazy-load.
  async function getCaseFiles(caseId) {
    const { data, error } = await sb.from('case_files').select('*').eq('case_id', caseId).order('added_at', { ascending: true });
    if (error) throw error;
    if (!data || data.length === 0) return [];
    const recs = await Promise.all(data.map(async (row) => {
      const rec = rowToFile(row);
      try {
        const { data: blob } = await sb.storage.from('case-files').download(row.bucket_path);
        rec.blob = blob;
      } catch (e) {
        console.warn('[portal] could not download', row.bucket_path, e);
      }
      return rec;
    }));
    return recs;
  }

  async function deleteFile(id) {
    const { data: row } = await sb.from('case_files').select('bucket_path').eq('id', id).maybeSingle();
    if (row) {
      await sb.storage.from('case-files').remove([row.bucket_path]);
    }
    const { error } = await sb.from('case_files').delete().eq('id', id);
    if (error) throw error;
  }
  async function deleteCaseFiles(caseId) {
    const { data: rows } = await sb.from('case_files').select('bucket_path').eq('case_id', caseId);
    if (rows && rows.length) {
      await sb.storage.from('case-files').remove(rows.map(r => r.bucket_path));
    }
    await sb.from('case_files').delete().eq('case_id', caseId);
  }

  /* ============================================================
     ANNOTATIONS (reviewer-only — RLS-enforced)
     ============================================================ */
  async function saveAnnotations(fileId, toolState) {
    const { error } = await sb.from('annotations').upsert({
      file_id: fileId, tool_state: toolState, saved_at: new Date().toISOString(),
    });
    if (error) throw error;
  }
  async function loadAnnotations(fileId) {
    const { data, error } = await sb.from('annotations').select('tool_state').eq('file_id', fileId).maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    return data ? data.tool_state : null;
  }

  /* ============================================================
     APPLICATIONS (vet account requests)
     RLS allows public insert; only reviewers can read/update.
     ============================================================ */
  // Note: sync signature kept for compatibility with existing IndexedDB call sites
  // that use `window.PortalDB.getApplications()` synchronously. In Supabase mode
  // we expose an async version + a cache.
  let _appsCache = [];
  async function refreshApplications() {
    const { data, error } = await sb.from('applications').select('*').order('submitted_at', { ascending: false });
    if (error) { console.warn('[portal] applications fetch failed', error); return []; }
    _appsCache = (data || []).map(r => ({
      id: r.id,
      name: r.name,
      license: r.license,
      clinic: r.clinic,
      email: r.email,
      phone: r.phone,
      country: r.country,
      state: r.state,
      specialty: r.specialty,
      why: r.why,
      submittedAt: r.submitted_at,
      status: r.status,
      approvedAt: r.approved_at,
      declinedAt: r.declined_at,
    }));
    return _appsCache;
  }
  function getApplications() {
    // Cache populated by refreshApplications(); call refresh first in views.
    return _appsCache;
  }
  async function submitApplication(data, token) {
    const useCaptcha = !!(window.PORTAL_CONFIG && window.PORTAL_CONFIG.turnstile && window.PORTAL_CONFIG.turnstile.siteKey);
    if (useCaptcha) {
      // Verified path: Turnstile token checked server-side, row inserted with
      // service_role. Anonymous applicant can't read applications back, so we
      // don't refresh here (refreshApplications would just be RLS-blocked).
      const { data: res, error } = await sb.functions.invoke('public-submit', {
        body: { form: 'application', token, payload: data },
      });
      if (error) throw error;
      if (res && res.error) throw new Error(res.error);
      return;
    }
    const id = `APP-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    const row = {
      id,
      name: data.name,
      license: data.license,
      clinic: data.clinic,
      email: data.email,
      phone: data.phone,
      country: data.country,
      state: data.state,
      specialty: data.specialty,
      why: data.why,
      submitted_at: new Date().toISOString(),
      status: 'pending',
    };
    const { error } = await sb.from('applications').insert(row);
    if (error) throw error;
    await refreshApplications();
    return rowToCase(row); // shape unused, but keep return value consistent
  }
  async function updateApplication(id, patch) {
    const row = {};
    if (patch.status) row.status = patch.status;
    if (patch.status === 'approved') row.approved_at = new Date().toISOString();
    if (patch.status === 'declined') row.declined_at = new Date().toISOString();
    const { error } = await sb.from('applications').update(row).eq('id', id);
    if (error) throw error;
    await refreshApplications();
  }

  /* ============================================================
     ACCOUNTS — in Supabase mode, auth is handled by Supabase.
     addAccount() can't create a user from the browser without the
     service_role key. Instead, we return advisory credentials that
     the practice admin uses in the Supabase Dashboard to create
     the auth user. See SUPABASE_SETUP.md.
     ============================================================ */
  function getAccounts() { return []; }
  function saveAccounts() { /* no-op in cloud mode */ }
  function addAccount({ email }) {
    return {
      email,
      _advisory: 'In cloud mode, create this user in Supabase Dashboard → Authentication → Users → Add user. The trigger will auto-create the profile row with role=vet.',
    };
  }

  /* ============================================================
     REPORTS + TIMELINE
     ============================================================ */
  async function getAllComments() {
    const { data, error } = await sb.from('case_comments').select('case_id, role, ts');
    if (error) { console.warn('[portal] getAllComments failed', error); return []; }
    return data || [];
  }

  async function saveReport(caseId, report) {
    const { error } = await sb.from('cases').update({
      report,
      updated_at: new Date().toISOString(),
    }).eq('id', caseId);
    if (error) throw error;
  }

  /* ============================================================
     CASE COMMENTS — post-report Q&A thread (own table, RLS-guarded)
     ============================================================ */
  async function getComments(caseId) {
    const { data, error } = await sb.from('case_comments')
      .select('*').eq('case_id', caseId).order('ts', { ascending: true });
    if (error) { console.warn('[portal] comments fetch failed', error); return []; }
    return (data || []).map(r => ({
      id: r.id, role: r.role, name: r.name, text: r.text, ts: r.ts,
    }));
  }
  async function addComment(caseId, { role, name, text }) {
    const row = {
      id: `CM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      case_id: caseId,
      role: role || 'vet',
      name: name || 'Unknown',
      text: (text || '').trim(),
      ts: new Date().toISOString(),
    };
    const { error } = await sb.from('case_comments').insert(row);
    if (error) throw error;
    return getComments(caseId);
  }

  async function saveInvoice(caseId, invoice) {
    const { error } = await sb.from('cases').update({
      invoice,
      updated_at: new Date().toISOString(),
    }).eq('id', caseId);
    if (error) throw error;
  }

  async function setInvoicePaid(caseId, paid) {
    const c = await getCase(caseId);
    if (!c || !c.invoice) return null;
    const invoice = { ...c.invoice, status: paid ? 'paid' : 'unpaid', paidAt: paid ? new Date().toISOString() : null };
    const { error } = await sb.from('cases').update({
      invoice, updated_at: new Date().toISOString(),
    }).eq('id', caseId);
    if (error) throw error;
    return invoice;
  }

  function nowLabel() {
    return new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  async function advanceTimeline(caseId, stage) {
    const c = await getCase(caseId);
    if (!c) return null;
    const stageMap = { acknowledged: 1, review: 2, drafted: 3, reported: 4 };
    const idx = stageMap[stage];
    const timeline = (c.timeline || []).slice();
    if (idx !== undefined && timeline[idx]) {
      timeline[idx] = { ...timeline[idx], done: true, ts: nowLabel() };
    }
    const newStatus = stage === 'acknowledged' ? 'acknowledged'
      : stage === 'review' ? 'review'
      : stage === 'drafted' ? 'review'
      : stage === 'reported' ? 'reported'
      : c.status;
    const { error } = await sb.from('cases').update({
      timeline, status: newStatus, updated_at: new Date().toISOString(),
    }).eq('id', caseId);
    if (error) throw error;
    return { ...c, timeline, status: newStatus };
  }

  /* ============================================================
     SEEDED — no-op in cloud mode (SQL handles seeding)
     ============================================================ */
  async function ensureSeeded() {
    // Hydrate applications cache up-front so reviewer.ApplicationsView
    // has data on first render.
    await refreshApplications();
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  // Storage estimate — Supabase doesn't expose quota per-bucket from the client.
  async function storageEstimate() { return { usage: 0, quota: 0 }; }

  /* ============================================================
     INSTALL — replace window.PortalDB
     ============================================================ */
  window.PortalDB = {
    // cases
    putCase, getCase, getAllCases, deleteCase,
    // files
    putFile, getFile, getCaseFiles, deleteFile, deleteCaseFiles,
    // annotations
    saveAnnotations, loadAnnotations,
    // applications (sync getter + async refresh)
    getApplications, refreshApplications, submitApplication, updateApplication,
    // accounts (advisory in cloud mode)
    getAccounts, saveAccounts, addAccount,
    // reports + timeline
    saveReport, advanceTimeline, nowLabel,
    getComments, addComment, getAllComments,
    saveInvoice, setInvoicePaid,
    ensureSession, uploadFiles,
    // misc
    ensureSeeded, downloadBlob, storageEstimate,
    // open DB — unused but kept for parity
    openDB: () => null,
  };

  /* ============================================================
     SUPABASE AUTH WRAPPER
     ------------------------------------------------------------
     Exposes the surface that AuthGate / AdminAuthGate need.
     ============================================================ */
  // Build our app-shaped session from a raw Supabase session/user.
  // Takes the user object directly so we never call sb.auth.getSession()
  // from inside an onAuthStateChange callback (that deadlocks the client).
  async function buildSession(user) {
    if (!user) return null;
    let profile = null;
    try {
      const { data } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
      profile = data;
    } catch (e) {
      console.warn('[portal] profile fetch failed, using auth metadata', e);
    }
    const meta = user.user_metadata || {};
    return {
      userId: user.id,
      email: user.email,
      name: (profile && profile.name) || meta.name || user.email,
      clinic: (profile && profile.clinic) || meta.clinic || '',
      role: (profile && profile.role) || meta.role || 'vet',
    };
  }

  async function getSessionWithProfile() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    return buildSession(session.user);
  }

  async function signIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    // Use the user object signInWithPassword already returned — do NOT call
    // getSession() again here; that path can deadlock against the auth lock.
    const session = await buildSession(data.user);
    return { session };
  }
  async function signOut() {
    await sb.auth.signOut();
  }
  async function signUpVet({ email, password, name, clinic }) {
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { name, clinic, role: 'vet' } },
    });
    if (error) return { error: error.message };
    return { user: data.user };
  }
  function onAuthChange(cb) {
    return sb.auth.onAuthStateChange((_evt, session) => {
      // CRITICAL: defer out of the callback before touching Supabase again.
      // Calling auth/db methods synchronously inside this callback while
      // Supabase holds its internal lock causes a permanent deadlock
      // (sign-in hangs on "Signing in…"). setTimeout escapes the lock scope.
      setTimeout(async () => {
        try { cb(await buildSession(session && session.user)); }
        catch (e) { console.warn('[portal] auth-change handler failed', e); cb(null); }
      }, 0);
    });
  }

  window.SupabaseAuth = {
    getSession: getSessionWithProfile,
    signIn, signOut, signUpVet, onAuthChange,
  };
})();
