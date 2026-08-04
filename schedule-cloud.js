/* ============================================================
   Schedule — Supabase cloud layer (window.SchedCloud)
   Requires: config.js (PORTAL_CONFIG) + @supabase/supabase-js v2 UMD.
   No offline fallback: the app refuses to run without a connection.
   ============================================================ */
(function () {
  'use strict';

  const cfg = (window.PORTAL_CONFIG && window.PORTAL_CONFIG.supabase) || {};
  const configured = !!(cfg.url && cfg.anonKey && window.supabase);
  let sb = null;
  if (configured) {
    // Same storageKey as portal-supabase.jsx, or signing in on Schedule /
    // Console would not count on reviewer.html and vice versa.
    sb = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ddc_supabase_auth' },
    });
  }

  /* ---------- row ↔ app-shape transforms ---------- */
  const dateOnly = (d) => {
    const dt = new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  };
  const parseDate = (s) => { // 'YYYY-MM-DD' → local Date (no TZ shift)
    const [y, m, d] = String(s).split('T')[0].split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  function clinicFromRow(r) {
    return {
      id: r.id, name: r.name, city: r.city || '', state: r.state || '', region: r.region || 'md',
      address: r.address || '', contact: r.contact || '', contactRole: r.contact_role || '',
      email: r.email || '', phone: r.phone || '', loginEmail: r.login_email || '',
      color: r.color, bookingDays: r.booking_days || [], maxCasesPerDay: r.max_cases_per_day == null ? 4 : r.max_cases_per_day,
      status: r.status || 'pending', account: r.status === 'active' ? 'active' : 'invited',
      canSedate: r.can_sedate, intakeNote: r.intake_note || '',
      billingKind: r.billing_kind || 'inperson', billTo: r.bill_to || '', billingAttn: r.billing_attn || '',
      billingEmail: r.billing_email || '', billingAddress: r.billing_address || '', termsDays: r.terms_days || null,
      rateOverrides: r.rate_overrides || null,
      miles: r.miles, mapX: r.map_x, mapY: r.map_y,
    };
  }
  function clinicToRow(c) {
    const row = {
      id: c.id, name: c.name, city: c.city || null, state: c.state || null, region: c.region || 'md',
      address: c.address || null, contact: c.contact || null, contact_role: c.contactRole || null,
      email: c.email || null, phone: c.phone || null, login_email: c.loginEmail || null,
      color: c.color || null, booking_days: c.bookingDays || [], max_cases_per_day: c.maxCasesPerDay == null ? 4 : c.maxCasesPerDay,
      status: c.status || 'pending', can_sedate: c.canSedate == null ? null : !!c.canSedate,
      intake_note: c.intakeNote || null, miles: c.miles == null ? null : c.miles,
      billing_kind: c.billingKind || 'inperson', bill_to: c.billTo || null, billing_attn: c.billingAttn || null,
      billing_email: c.billingEmail || null, billing_address: c.billingAddress || null,
      terms_days: c.termsDays == null || c.termsDays === '' ? null : Number(c.termsDays),
      map_x: c.mapX == null ? null : c.mapX, map_y: c.mapY == null ? null : c.mapY,
    };
    // only sent when actually used, so the column being absent (migration not
    // run yet) can't break saving an ordinary hospital profile
    if (c.rateOverrides && Object.keys(c.rateOverrides).length) row.rate_overrides = c.rateOverrides;
    else if (c.rateOverrides === null) row.rate_overrides = null;
    return row;
  }

  function patientFromRow(r) {
    return {
      id: r.id, name: r.name, species: r.species || 'Canine', breed: r.breed || '',
      sex: r.sex || '', age: r.age || '', owner: r.owner_name || '', ownerPhone: r.owner_phone || '',
      vet: r.vet || '', sites: r.sites || [], visitType: r.visit_type || 'initial',
      rate: r.rate || 'initial', history: r.history || '', demeanor: r.demeanor || 'calm',
      fasted: r.fasted !== false, notes: r.notes || '', files: r.files || [],
      weight: r.weight || '', occupation: r.occupation || '',
      service: r.service || 'scan', injections: r.injections || 0, rush: !!r.rush, rushBy: r.rush_by || '',
      studyCode: r.study_code || '',
      aiSummary: r.ai_summary || null,
      caseId: r.case_id || null, cancelled: r.cancelled || null, position: r.position || 0,
    };
  }
  function patientToRow(p, dayId) {
    // strip non-serializable file handles (blob urls / File objects)
    const files = (p.files || []).map(f => ({
      name: f.name, kind: f.kind || null, path: f.path || null, size: f.size || null,
      // linked studies (PACS / shared folder) have no storage object — keep the URL
      ...(f.external ? { external: true, url: f.url || null, modality: f.modality || null, studyDate: f.studyDate || null } : {}),
    }));
    return {
      id: p.id, day_id: dayId, name: p.name || 'Unnamed', species: p.species || 'Canine',
      breed: p.breed || null, sex: p.sex || null, age: p.age || null,
      owner_name: p.owner || null, owner_phone: p.ownerPhone || null, vet: p.vet || null,
      sites: p.sites || [], visit_type: p.visitType || 'initial', rate: p.rate || 'initial',
      history: p.history || null, demeanor: p.demeanor || 'calm', fasted: p.fasted !== false,
      notes: p.notes || null, files, case_id: p.caseId || null,
      weight: p.weight || null, occupation: p.occupation || null,
      service: p.service || 'scan', injections: p.injections || 0, rush: !!p.rush, rush_by: p.rushBy || null,
      study_code: p.studyCode || null,
      ai_summary: p.aiSummary || null,
      cancelled: p.cancelled || null, position: p.position || 0,
    };
  }

  function dayFromRow(r, patients) {
    return {
      id: r.id, date: parseDate(r.date), clinic: r.clinic_id || null,
      status: r.status, reservedFor: r.reserved_for || null,
      submittedBy: r.submitted_by || null,
      submittedAt: r.submitted_at ? new Date(r.submitted_at) : null,
      requestedBy: r.requested_by || null,
      requestedAt: r.requested_at ? new Date(r.requested_at) : null,
      signoff: r.signoff || null,
      invoice: r.invoice ? { ...r.invoice, issued: r.invoice.issued ? new Date(r.invoice.issued) : null } : null,
      patients: (patients || []).sort((a, b) => (a.position - b.position) || String(a.id).localeCompare(String(b.id))),
    };
  }
  function dayToRow(d) {
    return {
      id: d.id, date: dateOnly(d.date), clinic_id: d.clinic || null, status: d.status,
      reserved_for: d.reservedFor || null, submitted_by: d.submittedBy || null,
      submitted_at: d.submittedAt ? new Date(d.submittedAt).toISOString() : null,
      requested_by: d.requestedBy || null,
      requested_at: d.requestedAt ? new Date(d.requestedAt).toISOString() : null,
      signoff: d.signoff || null,
      invoice: d.invoice ? { ...d.invoice, issued: d.invoice.issued ? new Date(d.invoice.issued).toISOString() : null } : null,
    };
  }

  function studyFromRow(r) {
    return {
      id: r.id, patient: r.patient_name || 'Unknown', modality: r.modality || 'US',
      desc: r.description || '', images: r.images || 0, from: r.clinic_id || null,
      device: r.device || '', receivedAt: r.received_at ? new Date(r.received_at) : new Date(),
      matchDay: r.match_day_id || null, matchCase: r.match_case_id || null,
      matchName: r.match_name || null, route: r.route || null, status: r.status || 'unrouted',
      bucketPath: r.bucket_path || null,
      accession: r.accession || '', aeTitle: r.ae_title || '',
      matchedBy: (r.meta && r.meta.matched_by) || null,
    };
  }

  const fail = (e, what) => {
    console.error('[sched-cloud] ' + what, e);
    throw new Error(what + ': ' + (e && (e.message || e.error_description) || 'unknown error'));
  };
  const check = (res, what) => { if (res.error) fail(res.error, what); return res.data; };

  /* ---------- API ---------- */
  const urlCache = new Map(); // path → {url, exp}

  const SchedCloud = {
    configured,
    client: sb,

    /* ---- auth ---- */
    async session() {
      const { data, error } = await sb.auth.getSession();
      if (error) fail(error, 'Auth check failed');
      return data.session || null;
    },
    async profile() {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return null;
      const res = await sb.from('profiles').select('*').eq('id', user.id).single();
      return check(res, 'Could not load your profile');
    },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      return data.session;
    },
    // reload:false is for the wrong-door flow — we clear the session but stay
    // on the page so the notice explaining where to go remains on screen.
    async signOut(reload = true) { await sb.auth.signOut({ scope: 'local' }); if (reload) window.location.reload(); },

    /* Password reset — shared with the portal; the link lands on
       Reset Password.html whichever door they started from. */
    async resetPassword(email, redirectTo) {
      const { error } = await sb.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
      return error ? { error: error.message } : {};
    },
    async updatePassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      return error ? { error: error.message } : {};
    },

    /* ---- loading ---- */
    async loadAll(isAdmin) {
      const [clinics, days, patients, incoming] = await Promise.all([
        sb.from('sched_clinics').select('*').order('name'),
        sb.from('sched_days').select('*').order('date'),
        sb.from('sched_patients').select('*'),
        isAdmin ? sb.from('sched_incoming_studies').select('*').order('received_at', { ascending: false }) : Promise.resolve({ data: [] }),
      ]);
      const cl = check(clinics, 'Could not load clinics').map(clinicFromRow);
      const dayRows = check(days, 'Could not load the calendar');
      check(patients, 'Could not load patients');
      const rawPats = patients.data || [];
      const grouped = {};
      rawPats.forEach(r => { (grouped[r.day_id] = grouped[r.day_id] || []).push(patientFromRow(r)); });
      const ds = dayRows.map(r => dayFromRow(r, grouped[r.id] || []));
      const inc = (incoming.data || []).map(studyFromRow);
      return { clinics: cl, days: ds, incoming: inc };
    },

    /* ---- writes ---- */
    async saveDay(day) {
      check(await sb.from('sched_days').upsert(dayToRow(day)), 'Could not save the clinic day');
    },
    async saveDayDeep(day) {
      await SchedCloud.saveDay(day);
      const rows = (day.patients || []).map((p, i) => patientToRow({ ...p, position: i }, day.id));
      if (rows.length) check(await sb.from('sched_patients').upsert(rows), 'Could not save patients');
    },
    async deleteDay(id) {
      check(await sb.from('sched_days').delete().eq('id', id), 'Could not remove the day');
    },
    async savePatient(dayId, patient) {
      check(await sb.from('sched_patients').upsert(patientToRow(patient, dayId)), 'Could not save the patient');
    },
    async deletePatient(id) {
      check(await sb.from('sched_patients').delete().eq('id', id), 'Could not remove the patient');
    },
    async saveClinic(clinic) {
      check(await sb.from('sched_clinics').upsert(clinicToRow(clinic)), 'Could not save the clinic');
    },
    async saveStudy(st) {
      check(await sb.from('sched_incoming_studies').update({ route: st.route, status: st.status }).eq('id', st.id), 'Could not route the study');
    },

    /* ---- DICOM device registry + inbox ---- */
    async loadDevices() {
      const res = await sb.from('sched_devices').select('*').order('name');
      if (res.error) { if (!/does not exist|schema cache/i.test(res.error.message || '')) console.warn('[sched-cloud] devices:', res.error.message); return []; }
      return (res.data || []).map(r => ({
        id: r.id, clinicId: r.clinic_id || '', name: r.name, aeTitle: r.ae_title,
        ip: r.ip || '', modality: r.modality || '', status: r.status || 'active',
        note: r.note || '', lastSeen: r.last_seen || null,
      }));
    },
    async saveDevice(d) {
      check(await sb.from('sched_devices').upsert({
        id: d.id, clinic_id: d.clinicId || null, name: d.name, ae_title: d.aeTitle,
        ip: d.ip || null, modality: d.modality || null, status: d.status || 'active', note: d.note || null,
      }), 'Could not save the device');
    },
    async deleteDevice(id) {
      check(await sb.from('sched_devices').delete().eq('id', id), 'Could not remove the device');
    },
    /* Studies that arrived but haven't been filed — offered when a patient
       with a matching code or name is being edited. */
    /* ---- alert recipients (text / email) ---- */
    async loadRecipients() {
      const res = await sb.from('notify_recipients').select('*').order('name');
      if (res.error) {
        if (/does not exist|schema cache/i.test(res.error.message || '')) return null;  // migration not run
        throw new Error(res.error.message);
      }
      return res.data || [];
    },
    async saveRecipient(r) {
      const row = {
        id: r.id || 'nr-' + Math.random().toString(36).slice(2, 10),
        name: r.name, phone: r.phone || null, email: r.email || null,
        sms: !!r.sms, email_on: !!r.email_on,
        events: (r.events && r.events.length) ? r.events : ['*'],
        quiet_from: r.quiet_from || null, quiet_to: r.quiet_to || null,
        tz: r.tz || 'America/New_York', active: r.active !== false,
      };
      check(await sb.from('notify_recipients').upsert(row), 'Could not save the recipient');
      return row;
    },
    async deleteRecipient(id) {
      check(await sb.from('notify_recipients').delete().eq('id', id), 'Could not remove the recipient');
    },
    async loadNotifyLog(limit) {
      const res = await sb.from('notify_queue')
        .select('id, event, urgent, title, channel, address, status, last_error, created_at, sent_at, send_after')
        .order('id', { ascending: false }).limit(limit || 25);
      if (res.error) return [];
      return res.data || [];
    },
    async sendTestAlert() {
      const res = await sb.rpc('notify_test');
      if (res.error) throw new Error(res.error.message);
      // Ask the dispatcher to run now rather than waiting for the next minute.
      try {
        const { data: s } = await sb.auth.getSession();
        const token = s && s.session && s.session.access_token;
        const url = cfg.url || '';
        if (token && url) {
          await fetch(url.replace(/\/$/, '') + '/functions/v1/notify-dispatch', {
            method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: '{}',
          });
        }
      } catch (e) { /* cron will pick it up within a minute */ }
    },

    async loadUnroutedStudies() {
      const res = await sb.from('sched_incoming_studies')
        .select('id, patient_name, accession, modality, images, device, clinic_id, bucket_path, received_at')
        .eq('status', 'unrouted').order('received_at', { ascending: false }).limit(50);
      if (res.error) { if (!/does not exist|schema cache|column/i.test(res.error.message || '')) console.warn('[sched-cloud] inbox:', res.error.message); return []; }
      return (res.data || []).map(r => ({
        id: r.id, patientName: r.patient_name, accession: r.accession || '',
        modality: r.modality || '', images: r.images || 0, device: r.device || '',
        clinicId: r.clinic_id || '', bucketPath: r.bucket_path || null, receivedAt: r.received_at,
      }));
    },
    async linkStudyById(studyId, dayId, patient) {
      const res = await sb.from('sched_incoming_studies').select('*').eq('id', studyId).maybeSingle();
      const row = check(res, 'Could not read the study');
      if (!row) return;
      // Re-read the row we just wrote: the in-memory patient's files may be
      // stale by now, and this update overwrites that column wholesale.
      const cur = await sb.from('sched_patients').select('files').eq('id', patient.id).maybeSingle();
      const fresh = { ...patient, files: (cur.data && cur.data.files) || patient.files || [] };
      await SchedCloud.routeStudyToPatient({
        id: row.id, bucketPath: row.bucket_path, patient: row.patient_name,
        desc: row.description, images: row.images,
      }, fresh);
    },

    /* ---- rate cards (editable prices, versioned by date) ---- */
    async loadRates() {
      const res = await sb.from('sched_rates').select('*').order('effective_from', { ascending: true });
      if (res.error) { if (!/does not exist|schema cache/i.test(res.error.message || '')) console.warn('[sched-cloud] rates:', res.error.message); return []; }
      return (res.data || []).map(r => ({
        id: r.id, effectiveFrom: r.effective_from, amounts: r.amounts || {},
        injectionIncluded: r.injection_included == null ? 4 : r.injection_included,
        recheckMonths: r.recheck_months == null ? 6 : r.recheck_months,
        termsDays: r.terms_days == null ? 15 : r.terms_days,
        note: r.note || '',
      }));
    },
    async saveRates(card) {
      check(await sb.from('sched_rates').upsert({
        id: card.id, effective_from: card.effectiveFrom || null, amounts: card.amounts || {},
        injection_included: card.injectionIncluded, recheck_months: card.recheckMonths,
        terms_days: card.termsDays, note: card.note || null,
      }), 'Could not save the rate card');
    },
    async deleteRates(id) {
      check(await sb.from('sched_rates').delete().eq('id', id), 'Could not delete the rate card');
    },

    /* ---- unified billing ---- */
    /* Finalized remote reads, for the monthly statements. */
    async loadBillableCases() {
      const res = await sb.from('cases')
        .select('id, patient, species, breed, sites, status, referring_clinic, referring_vet, referring_email, rush, rush_requested_by, bill_service, bill_voided, finalized_at, invoice')
        .not('finalized_at', 'is', null)
        .order('finalized_at', { ascending: false }).limit(1000);
      if (res.error) { if (!/does not exist|schema cache/i.test(res.error.message || '')) console.warn('[sched-cloud] remote reads for billing:', res.error.message); return []; }
      const rows = res.data || [];
      return rows.map(r => ({
        id: r.id, patient: r.patient, species: r.species, breed: r.breed, sites: r.sites || [],
        referringClinic: r.referring_clinic || '', referringVet: r.referring_vet || '', referringEmail: r.referring_email || '',
        rush: !!r.rush, rushRequestedBy: r.rush_requested_by || '',
        billService: r.bill_service || null, billVoided: !!r.bill_voided,
        finalizedAt: r.finalized_at, invoice: r.invoice || null,
      }));
    },
    /* Statement invoices: one row per account per month. */
    async loadStatements() {
      const res = await sb.from('sched_statements').select('*');
      if (res.error) { if (!/does not exist|schema cache/i.test(res.error.message || '')) console.warn('[sched-cloud] statements:', res.error.message); return {}; }
      const rows = res.data || [];
      const map = {};
      rows.forEach(r => {
        map[r.id] = r.invoice ? { ...r.invoice, issued: r.invoice.issued ? new Date(r.invoice.issued) : null } : null;
      });
      return map;
    },
    async saveStatement(entity) {
      const inv = entity.invoice || null;
      check(await sb.from('sched_statements').upsert({
        id: entity.id,
        account_id: entity.accountId || null,
        account_name: (entity.account && entity.account.name) || null,
        period_year: entity.period.y,
        period_month: entity.period.m,
        invoice: inv ? { ...inv, issued: inv.issued ? new Date(inv.issued).toISOString() : null } : null,
      }), 'Could not save the statement');
    },

    /* Historical remote reads entered by hand, stored beside the statement
       they belong to. Same row as the statement invoice, its own column. */
    async loadManualReads() {
      const res = await sb.from('sched_statements').select('id, manual_reads');
      if (res.error) { if (!/does not exist|schema cache|column/i.test(res.error.message || '')) console.warn('[sched-cloud] manual reads:', res.error.message); return {}; }
      const map = {};
      (res.data || []).forEach(r => { if (r.manual_reads && (r.manual_reads.reads || []).length) map[r.id] = r.manual_reads; });
      return map;
    },
    async saveManualReads(meta) {
      check(await sb.from('sched_statements').upsert({
        id: meta.id,
        account_id: meta.accountId || null,
        account_name: meta.accountName || null,
        period_year: meta.period.y,
        period_month: meta.period.m,
        manual_reads: { reads: meta.reads || [] },
      }), 'Could not save the historical reads');
    },

    /* ---- remote-read interop ---- */
    async loadOpenCases() {
      const res = await sb.from('cases').select('id, patient, status, referring_clinic').order('submitted', { ascending: false }).limit(100);
      return check(res, 'Could not load remote-read cases');
    },
    // File a routed study onto a remote-read case: copy the archive into the
    // case-files bucket + insert a case_files row (visible to the referring vet).
    async routeStudyToCase(study, caseId) {
      if (study.bucketPath) {
        const { data: blob, error: dlErr } = await sb.storage.from('sched-files').download(study.bucketPath);
        if (dlErr) fail(dlErr, 'Could not read the study archive');
        const fileId = 'sf-' + study.id;
        const fname = (study.patient || 'study').replace(/[^\w.\-]+/g, '_') + '_' + study.id + '.zip';
        const path = `${caseId}/dicom/${fileId}_${fname}`;
        const { error: upErr } = await sb.storage.from('case-files').upload(path, blob, { upsert: true, contentType: 'application/zip' });
        if (upErr) fail(upErr, 'Could not copy the study to the case');
        check(await sb.from('case_files').upsert({
          id: fileId, case_id: caseId, kind: 'dicom',
          name: `${study.desc || 'DICOM study'} (${study.images} img, auto-sent)`,
          type: 'application/zip', size: blob.size, bucket_path: path,
        }), 'Could not attach the study to the case');
      }
      check(await sb.from('sched_incoming_studies').update({
        route: 'remote', status: 'routed-remote', match_case_id: caseId,
      }).eq('id', study.id), 'Could not route the study');
    },
    // File a routed study onto a scheduled patient's records.
    async routeStudyToPatient(study, patient) {
      if (study.bucketPath) {
        // The router drops studies in incoming/, which only admins can read.
        // Move it under {dayId}/{patientId}/ so the hospital can open it too —
        // that path prefix IS the storage policy for hospital access.
        const row = await sb.from('sched_patients').select('day_id,files').eq('id', patient.id).maybeSingle();
        const dayId = (row.data && row.data.day_id) || patient.dayId || patient.day_id;
        let path = study.bucketPath;
        let moved = false;
        if (dayId) {
          const dest = `${dayId}/${patient.id}/${Date.now()}_study.zip`;
          const cp = await sb.storage.from('sched-files').copy(study.bucketPath, dest);
          if (!cp.error) { path = dest; moved = true; }
        }
        const base = (row.data && row.data.files) || patient.files || [];
        const files = [...base.map(f => ({ name: f.name, kind: f.kind || null, path: f.path || null, size: f.size || null })),
          { name: `${study.desc || 'DICOM study'}${study.images ? ` (${study.images} img, auto-sent)` : ' (auto-sent)'}.zip`, kind: 'dicom-archive', path, size: null }];
        // .select() so we can see whether a row was actually matched — an
        // update that hits nothing is not an error to PostgREST, and marking
        // the study routed after one would lose it entirely.
        const upd = await sb.from('sched_patients').update({ files }).eq('id', patient.id).select('id');
        check(upd, 'Could not attach the study to the patient');
        if (!upd.data || !upd.data.length) {
          // Nothing was written, so drop the copy we just made and leave the
          // original where it is — the study must stay openable in the inbox.
          if (moved) await sb.storage.from('sched-files').remove([path]);
          throw new Error('That patient record could not be found, so the study was left in the inbox.');
        }
        // Safe to retire the incoming copy only now that a patient row points
        // at the new one.
        if (moved) {
          await sb.storage.from('sched-files').remove([study.bucketPath]);
          try { await sb.from('sched_incoming_studies').update({ bucket_path: path }).eq('id', study.id); } catch (e) { /* row stays routed; path is cosmetic here */ }
        }
      }
      check(await sb.from('sched_incoming_studies').update({
        route: 'schedule', status: 'routed-schedule',
      }).eq('id', study.id), 'Could not route the study');
    },

    /* ---- files ---- */
    // Upload any pending browser File handles on a patient; returns files list with storage paths.
    async uploadPatientFiles(dayId, patientId, files) {
      const out = [];
      for (const f of files || []) {
        if (f.external) { out.push(f); continue; }
        if (f.file instanceof File && !f.path) {
          const safe = f.name.replace(/[^\w.\-]+/g, '_');
          const path = `${dayId}/${patientId}/${Date.now()}_${safe}`;
          const { error } = await sb.storage.from('sched-files').upload(path, f.file, { upsert: true, contentType: f.file.type || 'application/octet-stream' });
          if (error) fail(error, `Could not upload “${f.name}”`);
          out.push({ name: f.name, kind: f.kind, path, size: f.file.size, url: f.url });
        } else {
          out.push(f);
        }
      }
      return out;
    },
    async fileURL(path) {
      const hit = urlCache.get(path);
      if (hit && hit.exp > Date.now()) return hit.url;
      const { data, error } = await sb.storage.from('sched-files').createSignedUrl(path, 3600);
      if (error) fail(error, 'Could not open the file');
      urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 55 * 60 * 1000 });
      return data.signedUrl;
    },

    /* ---- realtime ---- */
    subscribe(onChange) {
      let t = null;
      const ping = () => { clearTimeout(t); t = setTimeout(onChange, 400); };
      const ch = sb.channel('sched-live');
      ['sched_days', 'sched_patients', 'sched_clinics', 'sched_incoming_studies'].forEach(table => {
        ch.on('postgres_changes', { event: '*', schema: 'public', table }, ping);
      });
      ch.subscribe();
      return () => sb.removeChannel(ch);
    },

    /* ---- admin: hospital sign-in accounts ----
       The clinic's status says nothing about whether a login is actually
       attached, so ask rather than infer. */
    async hospitalAccounts(clinicId) {
      const { data, error } = await sb.from('sched_hospital_accounts')
        .select('id,email,name').eq('sched_clinic_id', clinicId);
      if (error) fail(error, 'Could not check the hospital account');
      return data || [];
    },
    async linkHospitalAccount(email, clinicId) {
      const { data, error } = await sb.rpc('sched_link_hospital_account', { p_email: email, p_clinic_id: clinicId });
      if (error) throw new Error(error.message);
      return data;
    },
    async unlinkHospitalAccount(email) {
      const { data, error } = await sb.rpc('sched_unlink_hospital_account', { p_email: email });
      if (error) throw new Error(error.message);
      return data;
    },

    /* ---- admin: create a hospital login (secondary client, keeps admin session) ---- */
    async createHospitalAccount({ email, password, name, clinicId }) {
      return SchedCloud.createUserAccount({ email, password, name, role: 'hospital', extra: { sched_clinic_id: clinicId } });
    },
    /* ---- admin: create a referring-vet login for an approved application ---- */
    async createVetAccount({ email, password, name, clinic }) {
      return SchedCloud.createUserAccount({ email, password, name, role: 'vet', extra: { clinic } });
    },
    /* Signing someone up from the console would normally swap OUR session for
       theirs — a second client with persistSession off avoids that. */
    async createUserAccount({ email, password, name, role, extra }) {
      const alt = window.supabase.createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await alt.auth.signUp({
        email, password,
        options: { data: { name, role, ...(extra || {}) } },
      });
      if (error) throw new Error(error.message);
      return data.user;
    },
  };

  window.SchedCloud = SchedCloud;
})();
