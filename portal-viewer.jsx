/* global React, cornerstone, cornerstoneTools, cornerstoneWADOImageLoader, cornerstoneWebImageLoader */
/* Portal DICOM viewer with integrated measurement + annotation tools */

const { useState: vUseState, useEffect: vUseEffect, useRef: vUseRef, useMemo: vUseMemo } = React;

/* ============================================================
   CUSTOM CALIBRATION (mm/px) — for non-DICOM images
   ============================================================ */
const CALIBRATION_STORE = 'ddc_portal_calibration_v1';
function loadCalibration(fileId) {
  try {
    const all = JSON.parse(localStorage.getItem(CALIBRATION_STORE)) || {};
    return all[fileId] || null;
  } catch { return null; }
}
function saveCalibration(fileId, mmPerPx) {
  try {
    const all = JSON.parse(localStorage.getItem(CALIBRATION_STORE)) || {};
    all[fileId] = mmPerPx;
    localStorage.setItem(CALIBRATION_STORE, JSON.stringify(all));
  } catch (e) {}
}
function clearCalibration(fileId) {
  try {
    const all = JSON.parse(localStorage.getItem(CALIBRATION_STORE)) || {};
    delete all[fileId];
    localStorage.setItem(CALIBRATION_STORE, JSON.stringify(all));
  } catch (e) {}
}

/* ============================================================
   IMAGE ID HELPERS
   ============================================================ */
function imageIdForFile(file) {
  if (!file || !file.blob) return null;
  const t = file.type || '';
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const isDicomByMeta = (
    t === 'application/dicom' ||
    ext === 'dcm' ||
    ext === 'dicom' ||
    file.kind === 'dicom'
  );
  if (isDicomByMeta) {
    return cornerstoneWADOImageLoader.wadouri.fileManager.add(file.blob);
  }
  if (t.startsWith('image/') || ['jpg','jpeg','png','gif','bmp'].includes(ext)) {
    const url = URL.createObjectURL(file.blob);
    return (ext === 'png' ? 'pngimage:' : 'jpegimage:') + url;
  }
  // Last-resort: try DICOM. The loader will reject if it's not actually DICOM
  // and our error UI will surface the message.
  return cornerstoneWADOImageLoader.wadouri.fileManager.add(file.blob);
}

function fileIsViewable(file) {
  if (!file) return false;
  if (!file.name) return file.kind === 'dicom';
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  // Video + proprietary cine formats are NOT cornerstone images, even when
  // they're uploaded into the ultrasound (dicom) bucket.
  if (['mp4','mov','webm','avi','m4v','adi'].includes(ext)) return false;
  if (file.type && file.type.startsWith('video/')) return false;
  if (['dcm','dicom','jpg','jpeg','png','tif','tiff','bmp'].includes(ext)) return true;
  if (file.type && (file.type === 'application/dicom' || file.type.startsWith('image/'))) return true;
  // Files uploaded under the DICOM bucket but with no extension/MIME — treat as DICOM
  if (file.kind === 'dicom') return true;
  return false;
}
function fileIsVideo(file) {
  if (!file) return false;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return ['mp4','mov','webm','avi','m4v'].includes(ext) || (file.type && file.type.startsWith('video/'));
}
// Proprietary ultrasound cine format (e.g. ADI) — can't preview in-browser; offer download.
function fileIsProprietaryCine(file) {
  if (!file || !file.name) return false;
  return (file.name.split('.').pop() || '').toLowerCase() === 'adi';
}
function fileIsPdf(file) {
  if (!file) return false;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return ext === 'pdf' || file.type === 'application/pdf';
}

/* ============================================================
   MEASUREMENT FORMATTING
   ============================================================ */
const TOOL_LABELS = {
  Length: 'Caliper distance',
  Angle: 'Angle',
  EllipticalRoi: 'Ellipse ROI',
  RectangleRoi: 'Rectangle ROI',
  FreehandRoi: 'Freehand area',
  ArrowAnnotate: 'Note',
  Probe: 'Probe',
};

function formatLength(mmOrPx, mmPerPx) {
  if (mmPerPx && typeof mmOrPx === 'number') {
    // It's already in mm; convert to cm
    const cm = mmOrPx / 10;
    return { value: cm.toFixed(2), unit: 'cm' };
  }
  // No spacing → pixels
  return { value: Math.round(mmOrPx), unit: 'px' };
}
function formatArea(mm2OrPx2, mmPerPx) {
  if (mmPerPx && typeof mm2OrPx2 === 'number') {
    const cm2 = mm2OrPx2 / 100;
    return { value: cm2.toFixed(2), unit: 'cm²' };
  }
  return { value: Math.round(mm2OrPx2), unit: 'px²' };
}

/* ---- Robust geometry: compute area/length straight from the shape's
   handle points (image-pixel coordinates) so we never depend on
   cornerstone's cached stats, which can be stale or in the wrong unit. ---- */
function polygonAreaPx(points) {
  if (!Array.isArray(points) || points.length < 3) return null;
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    if (!p1 || !p2) return null;
    a += (p1.x * p2.y) - (p2.x * p1.y);
  }
  return Math.abs(a) / 2;
}
function shapeAreaPx(name, d) {
  try {
    if (name === 'FreehandRoi') {
      return polygonAreaPx(d.handles && d.handles.points);
    }
    const s = d.handles && d.handles.start;
    const e = d.handles && d.handles.end;
    if (!s || !e) return null;
    const w = Math.abs(e.x - s.x);
    const h = Math.abs(e.y - s.y);
    if (name === 'EllipticalRoi') return Math.PI * (w / 2) * (h / 2);
    if (name === 'RectangleRoi') return w * h;
  } catch (e) {}
  return null;
}
/* Convert a pixel area to a formatted real-world measurement. */
function areaFromPx(areaPx, col, row) {
  if (areaPx == null) return null;
  if (col && row) {
    const cm2 = (areaPx * col * row) / 100; // mm² → cm²
    return { value: cm2.toFixed(2), unit: 'cm²' };
  }
  return { value: Math.round(areaPx), unit: 'px²' };
}
function lengthFromHandles(d, col, row) {
  try {
    const s = d.handles && d.handles.start;
    const e = d.handles && d.handles.end;
    if (!s || !e) return null;
    const dxPx = e.x - s.x;
    const dyPx = e.y - s.y;
    if (col && row) {
      const mm = Math.sqrt((dxPx * col) ** 2 + (dyPx * row) ** 2);
      return { value: (mm / 10).toFixed(2), unit: 'cm' };
    }
    return { value: Math.round(Math.sqrt(dxPx * dxPx + dyPx * dyPx)), unit: 'px' };
  } catch (e) { return null; }
}

/* ============================================================
   CINE BAR — playback controls for multi-frame DICOM loops
   ============================================================ */
const CINE_SPEEDS = [7, 15, 24, 30, 60];
function CineBar({ frameIdx, frameCount, playing, setPlaying, fps, setFps, onScrub, onStep, prefetch }) {
  const pct = prefetch ? Math.round((prefetch.loaded / prefetch.total) * 100) : 100;
  return (
    <div className="cine-bar">
      <button className="cine-btn cine-play" onClick={() => setPlaying(!playing)}
              title={playing ? 'Pause (space)' : 'Play (space)'}>
        {playing ? '❚❚' : '▶'}
      </button>
      <button className="cine-btn" onClick={() => onStep(-1)} title="Previous frame (←)">‹</button>
      <button className="cine-btn" onClick={() => onStep(1)} title="Next frame (→)">›</button>
      <input
        className="cine-scrub"
        type="range"
        min="0"
        max={frameCount - 1}
        value={frameIdx}
        onChange={(e) => onScrub(parseInt(e.target.value, 10))}
        aria-label="Cine frame"
      />
      <div className="cine-count">{frameIdx + 1} / {frameCount}</div>
      <label className="cine-fps">
        <select value={fps} onChange={(e) => setFps(parseInt(e.target.value, 10))} aria-label="Playback speed">
          {CINE_SPEEDS.map(s => <option key={s} value={s}>{s} fps</option>)}
        </select>
      </label>
      {prefetch && (
        <div className="cine-prefetch" title="Decoding the rest of the clip">
          <div className="cine-prefetch-fill" style={{width: pct + '%'}} />
          <span>{pct}%</span>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   VIEWER COMPONENT
   ============================================================ */
/* Single-letter tool shortcuts. Deliberately avoids the arrow keys, which
   step through the images. */
const VIEWER_KEYS = {
  v: 'Pan', z: 'Zoom', w: 'Wwwc',
  c: 'Length', f: 'FreehandRoi', e: 'EllipticalRoi', r: 'RectangleRoi', g: 'Angle', p: 'Probe',
  a: 'ArrowAnnotate', x: 'Eraser',
};

function DicomViewer({ caseId, files, initialFileIndex = 0, onClose }) {
  const [idx, setIdx] = vUseState(initialFileIndex);
  const [tool, setTool] = vUseState('Pan');
  const [imageInfo, setImageInfo] = vUseState(null);
  const [loadError, setLoadError] = vUseState(null);
  const [loading, setLoading] = vUseState(false);
  const [annotationSaved, setAnnotationSaved] = vUseState(false);
  const [measurements, setMeasurements] = vUseState([]);
  const [calibrating, setCalibrating] = vUseState(false);
  const [calSource, setCalSource] = vUseState(null); // 'us-region' | 'pixel-spacing' | 'manual' | ...
  const [calDetail, setCalDetail] = vUseState(null);  // { colMmPerPx, rowMmPerPx, region }
  const [dicomHeader, setDicomHeader] = vUseState(null);
  const [showHeader, setShowHeader] = vUseState(false);
  const [hasEmbedded, setHasEmbedded] = vUseState(false);
  /* --- Cine loop (multi-frame DICOM) --- */
  const [frameCount, setFrameCount] = vUseState(1);
  const [frameIdx, setFrameIdx] = vUseState(0);
  const [playing, setPlaying] = vUseState(false);
  const [fps, setFps] = vUseState(30);
  const [prefetch, setPrefetch] = vUseState(null); // { loaded, total }
  const [videoError, setVideoError] = vUseState(false);
  const framesRef = vUseRef(null);   // array of per-frame imageIds
  const frameSeqRef = vUseRef(0);    // guards out-of-order frame renders
  const elementRef = vUseRef(null);
  const videoRef = vUseRef(null);
  const annotationDebounce = vUseRef(null);
  const pixelSpacingRef = vUseRef(null);
  const spacingPairRef = vUseRef(null); // { col, row } mm/px — handles non-square pixels
  const embeddedCalRef = vUseRef(null); // { col, row, source } from the file itself

  const file = files[idx];
  const isImage = fileIsViewable(file);
  const isVideo = fileIsVideo(file);
  const isPdf = fileIsPdf(file);
  const isCine = frameCount > 1;
  // One object URL per file, not one per render.
  const blobUrl = vUseMemo(
    () => (file && file.blob && (isVideo || isPdf) ? URL.createObjectURL(file.blob) : null),
    [file && file.id, isVideo, isPdf]
  );
  vUseEffect(() => {
    setVideoError(false);
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [blobUrl]);

  /* --- Rebuild measurements list from cornerstone tool state --- */
  const rebuildMeasurements = () => {
    if (!elementRef.current) return;
    const mmPerPx = pixelSpacingRef.current;
    const pair = spacingPairRef.current || (mmPerPx ? { col: mmPerPx, row: mmPerPx } : null);
    const col = pair && pair.col;
    const row = pair && pair.row;
    const toolStateManager = cornerstoneTools.getElementToolStateManager(elementRef.current);
    const all = [];
    try {
      const imageId = cornerstone.getEnabledElement(elementRef.current).image && cornerstone.getEnabledElement(elementRef.current).image.imageId;
      if (!imageId) { setMeasurements([]); return; }
      const toolNames = ['Length','Angle','EllipticalRoi','RectangleRoi','FreehandRoi','ArrowAnnotate','Probe'];
      toolNames.forEach(name => {
        const state = toolStateManager.get(elementRef.current, name);
        if (state && state.data) {
          state.data.forEach(d => {
            const m = { tool: name, uuid: d.uuid || d._id || Math.random().toString(36).slice(2), data: d };
            if (name === 'Length') {
              // Compute distance from handles so it always reflects current calibration
              const f = lengthFromHandles(d, col, row);
              if (f) { m.value = f.value; m.unit = f.unit; }
              else {
                const lenMm = (d.length !== undefined) ? d.length : (d.cachedStats && d.cachedStats.length);
                if (typeof lenMm === 'number') { const g = formatLength(lenMm, mmPerPx); m.value = g.value; m.unit = g.unit; }
              }
            } else if (name === 'Angle') {
              const rad = (d.rAngle !== undefined) ? d.rAngle : (d.cachedStats && d.cachedStats.angle);
              if (typeof rad === 'number') {
                m.value = rad.toFixed(1); m.unit = '°';
              }
            } else if (name === 'FreehandRoi' || name === 'EllipticalRoi' || name === 'RectangleRoi') {
              // Compute area directly from the shape geometry + known mm/px.
              const areaPx = shapeAreaPx(name, d);
              const f = areaFromPx(areaPx, col, row);
              if (f) {
                m.value = f.value; m.unit = f.unit;
              } else {
                // Fallback to cornerstone's cached area (assumed mm²)
                const areaMm2 = d.cachedStats && d.cachedStats.area;
                if (typeof areaMm2 === 'number') { const g = formatArea(areaMm2, mmPerPx); m.value = g.value; m.unit = g.unit; }
              }
              const mean = d.cachedStats && d.cachedStats.mean;
              m.extra = (mean !== undefined && mean !== null) ? `Mean ${mean.toFixed(1)} HU` : null;
            } else if (name === 'Probe') {
              const mo = d.cachedStats && d.cachedStats.moPixelLut !== undefined ? d.cachedStats.moPixelLut : null;
              const sp = d.cachedStats && d.cachedStats.storedPixelLut !== undefined ? d.cachedStats.storedPixelLut : null;
              m.value = (mo !== null && mo !== undefined) ? mo.toFixed(1) : (sp !== null ? sp : '—');
              m.unit = 'HU';
            } else if (name === 'ArrowAnnotate') {
              m.value = d.text || '—';
              m.unit = '';
            }
            all.push(m);
          });
        }
      });
    } catch (e) {
      console.warn(e);
    }
    setMeasurements(all);
  };

  /* --- Initialize cornerstone element + load image --- */
  vUseEffect(() => {
    if (!isImage || !elementRef.current || !window.__cornerstone_ready) return;
    const el = elementRef.current;

    try { cornerstone.enable(el); } catch (e) {}

    let imageId;
    try {
      imageId = imageIdForFile(file);
    } catch (e) {
      setLoadError(`Could not prepare "${file.name}" for viewing: ${e && e.message ? e.message : e}`);
      return;
    }
    if (!imageId) {
      setLoadError(`Could not build an image ID for "${file.name}". Unsupported file format.`);
      return;
    }

    setLoadError(null);
    setLoading(true);
    setPlaying(false);
    setFrameIdx(0);
    setFrameCount(1);
    setPrefetch(null);
    framesRef.current = null;

    let cancelled = false;

    (async () => {
      /* ---- Parse the raw DICOM FIRST ----------------------------------
         A cine loop is one DICOM file containing N frames. We need
         NumberOfFrames before loading, because each frame is a separate
         cornerstone image ( "...?frame=N" ). Previously we loaded the bare
         image ID, which always resolves to frame 0 — so every clip opened
         as a single still and there was nothing to play. */
      let dataSet = null;
      if (window.PortalDicomMeta && file && file.blob && !(file.type || '').startsWith('image/')) {
        dataSet = await window.PortalDicomMeta.parseDataSetFromBlob(file.blob);
      }
      if (cancelled) return;

      const frameInfo = (dataSet && window.PortalDicomMeta.readFrameInfo)
        ? window.PortalDicomMeta.readFrameInfo(dataSet)
        : null;
      const nFrames = (frameInfo && frameInfo.numberOfFrames) || 1;
      const ids = nFrames > 1
        ? Array.from({ length: nFrames }, (_, i) => `${imageId}?frame=${i}`)
        : [imageId];
      framesRef.current = ids;
      setFrameCount(nFrames);
      if (frameInfo && frameInfo.fps) {
        setFps(Math.min(60, Math.max(1, Math.round(frameInfo.fps))));
      }

      let image;
      try {
        image = await cornerstone.loadAndCacheImage(ids[0]);
      } catch (err) {
        if (cancelled) return;
        setLoading(false);
        const msg = (err && (err.message || err.error || (typeof err === 'string' ? err : ''))) || 'Could not load image.';
        console.error('[viewer] failed to load image', file && file.name, err);
        setLoadError(msg);
        setImageInfo({ error: msg });
        return;
      }
      if (cancelled) return;
      setLoading(false);
      cornerstone.displayImage(el, image);

      /* Register the frame list as a cornerstone stack so the scroll wheel
         steps through frames as well as the cine bar. */
      try {
        cornerstoneTools.addStackStateManager(el, ['stack']);
        cornerstoneTools.addToolState(el, 'stack', { currentImageIdIndex: 0, imageIds: ids });
      } catch (e) {}

      const header = dataSet ? window.PortalDicomMeta.readDicomHeader(dataSet) : null;
      const embedded = window.PortalDicomMeta
        ? window.PortalDicomMeta.extractEmbeddedCalibration(dataSet, image)
        : null;
      const manual = loadCalibration(file.id);

      // Remember the file's own embedded scale so the user can always revert to it
      embeddedCalRef.current = (embedded && embedded.colMmPerPx)
        ? { col: embedded.colMmPerPx, row: embedded.rowMmPerPx || embedded.colMmPerPx, source: embedded.source }
        : null;
      setHasEmbedded(!!embeddedCalRef.current);

      /* Precedence: a deliberate manual calibration overrides the embedded one,
         otherwise auto-apply whatever the file carries. */
      let colSp = null, rowSp = null, source = null, detail = null;
      if (manual) {
        colSp = rowSp = manual;
        source = 'manual';
        detail = { colMmPerPx: manual, rowMmPerPx: manual };
      } else if (embedded && embedded.colMmPerPx) {
        colSp = embedded.colMmPerPx;
        rowSp = embedded.rowMmPerPx || embedded.colMmPerPx;
        source = embedded.source;
        detail = { colMmPerPx: colSp, rowMmPerPx: rowSp, region: embedded.region };
      }

      if (colSp) {
        image.columnPixelSpacing = colSp;
        image.rowPixelSpacing = rowSp;
        cornerstone.updateImage(el);
      }
      pixelSpacingRef.current = colSp;
      spacingPairRef.current = colSp ? { col: colSp, row: rowSp || colSp } : null;
      setCalSource(source);
      setCalDetail(detail);
      setDicomHeader(header);

      setImageInfo({
        width: image.width,
        height: image.height,
        ww: Math.round(image.windowWidth),
        wc: Math.round(image.windowCenter),
        spacing: colSp,
        spacingRow: rowSp,
        source,
        frames: nFrames,
        fps: frameInfo && frameInfo.fps,
        bitsAllocated: image.color ? null : (image.bitsAllocated || 8),
        isDicom: !!dataSet,
      });

      // Enable tools (idempotent)
      const tools = [
        ['Wwwc', cornerstoneTools.WwwcTool],
        ['Pan', cornerstoneTools.PanTool],
        ['Zoom', cornerstoneTools.ZoomTool],
        ['Length', cornerstoneTools.LengthTool],
        ['Angle', cornerstoneTools.AngleTool],
        ['EllipticalRoi', cornerstoneTools.EllipticalRoiTool],
        ['RectangleRoi', cornerstoneTools.RectangleRoiTool],
        ['ArrowAnnotate', cornerstoneTools.ArrowAnnotateTool],
        ['FreehandRoi', cornerstoneTools.FreehandRoiTool],
        ['Eraser', cornerstoneTools.EraserTool],
        ['Probe', cornerstoneTools.ProbeTool],
        ['StackScroll', cornerstoneTools.StackScrollMouseWheelTool],
      ];
      tools.forEach(([name, ToolClass]) => {
        if (ToolClass && !cornerstoneTools.getToolForElement(el, name)) {
          cornerstoneTools.addToolForElement(el, ToolClass);
        }
      });
      cornerstoneTools.setToolActiveForElement(el, tool, { mouseButtonMask: 1 });
      cornerstoneTools.setToolActiveForElement(el, 'Pan', { mouseButtonMask: 4 });
      cornerstoneTools.setToolActiveForElement(el, 'Zoom', { mouseButtonMask: 2 });
      cornerstoneTools.setToolActiveForElement(el, 'StackScroll', {});

      // Load saved annotations
      const savedState = await window.PortalDB.loadAnnotations(file.id);
      if (savedState) {
        try {
          cornerstoneTools.globalImageIdSpecificToolStateManager.restoreToolState(savedState);
          cornerstone.updateImage(el);
        } catch (e) { console.warn('Could not restore annotations', e); }
      }

      setTimeout(rebuildMeasurements, 250);

      /* ---- Decode the rest of the clip in the background ----------------
         Playback off an undecoded clip stutters badly, so we warm the
         cache frame by frame and show progress. Playback is allowed before
         it finishes; it just gets smoother as it fills. */
      if (ids.length > 1) {
        setPrefetch({ loaded: 1, total: ids.length });
        (async () => {
          for (let i = 1; i < ids.length; i++) {
            if (cancelled) return;
            try { await cornerstone.loadAndCacheImage(ids[i]); } catch (e) { /* skip bad frame */ }
            if (cancelled) return;
            setPrefetch({ loaded: i + 1, total: ids.length });
          }
          if (!cancelled) setPrefetch(null);
        })();
      }
    })().catch(err => {
      if (cancelled) return;
      setLoading(false);
      const msg = (err && (err.message || err.error || (typeof err === 'string' ? err : ''))) || 'Could not load image.';
      console.error('[viewer] failed to load image', file && file.name, err);
      setLoadError(msg);
      setImageInfo({ error: msg });
    });

    /* Every frame arrives as a fresh cornerstone image object, so the
       calibration has to be stamped onto each one or measurements silently
       revert to the file's raw spacing mid-clip. */
    const onNewImage = (e) => {
      const img = e && e.detail && e.detail.image;
      const pair = spacingPairRef.current;
      if (img && pair) {
        img.columnPixelSpacing = pair.col;
        img.rowPixelSpacing = pair.row;
      }
      const list = framesRef.current;
      if (img && list && list.length > 1) {
        const i = list.indexOf(img.imageId);
        if (i >= 0) setFrameIdx(i);
      }
    };
    el.addEventListener('cornerstonenewimage', onNewImage);

    const onMeasurement = () => {
      setAnnotationSaved(false);
      if (annotationDebounce.current) clearTimeout(annotationDebounce.current);
      annotationDebounce.current = setTimeout(async () => {
        try {
          const state = cornerstoneTools.globalImageIdSpecificToolStateManager.saveToolState();
          await window.PortalDB.saveAnnotations(file.id, state);
          setAnnotationSaved(true);
          setTimeout(() => setAnnotationSaved(false), 1800);
        } catch (e) { console.warn(e); }
      }, 500);
      rebuildMeasurements();
    };
    el.addEventListener('cornerstonetoolsmeasurementadded', onMeasurement);
    el.addEventListener('cornerstonetoolsmeasurementmodified', onMeasurement);
    el.addEventListener('cornerstonetoolsmeasurementremoved', onMeasurement);
    el.addEventListener('cornerstoneimagerendered', rebuildMeasurements);

    return () => {
      cancelled = true;
      el.removeEventListener('cornerstonenewimage', onNewImage);
      el.removeEventListener('cornerstonetoolsmeasurementadded', onMeasurement);
      el.removeEventListener('cornerstonetoolsmeasurementmodified', onMeasurement);
      el.removeEventListener('cornerstonetoolsmeasurementremoved', onMeasurement);
      el.removeEventListener('cornerstoneimagerendered', rebuildMeasurements);
      try { cornerstone.disable(el); } catch (e) {}
    };
  }, [idx, file && file.id, isImage]);

  /* --- Cine loop playback ------------------------------------------------
     Show one frame. displayImage keeps the current viewport, so zoom, pan
     and window/level hold steady while the clip runs. */
  const showFrame = async (i) => {
    const el = elementRef.current;
    const ids = framesRef.current;
    if (!el || !ids || !ids[i]) return;
    const seq = ++frameSeqRef.current;
    try {
      const img = await cornerstone.loadAndCacheImage(ids[i]);
      if (seq !== frameSeqRef.current || !elementRef.current) return; // superseded
      const pair = spacingPairRef.current;
      if (pair) { img.columnPixelSpacing = pair.col; img.rowPixelSpacing = pair.row; }
      cornerstone.displayImage(el, img);
      const stack = cornerstoneTools.getToolState(el, 'stack');
      if (stack && stack.data && stack.data[0]) stack.data[0].currentImageIdIndex = i;
    } catch (e) { /* a single undecodable frame shouldn't stop the clip */ }
  };

  vUseEffect(() => {
    if (!isCine) return;
    showFrame(frameIdx);
  }, [frameIdx, isCine]);

  vUseEffect(() => {
    if (!playing || !isCine) return;
    const iv = setInterval(() => {
      setFrameIdx(i => (i + 1) % frameCount);
    }, Math.max(16, Math.round(1000 / (fps || 30))));
    return () => clearInterval(iv);
  }, [playing, fps, frameCount, isCine]);

  // Drawing a measurement while the clip runs is a lost cause — pause first.
  vUseEffect(() => {
    if (playing && tool !== 'Pan' && tool !== 'Zoom' && tool !== 'Wwwc') setPlaying(false);
  }, [tool]);

  const stepFrame = (n) => {
    setPlaying(false);
    setFrameIdx(i => Math.min(frameCount - 1, Math.max(0, i + n)));
  };

  /* --- Switch active tool --- */
  vUseEffect(() => {
    if (!isImage || !elementRef.current) return;
    try {
      cornerstoneTools.setToolActiveForElement(elementRef.current, tool, { mouseButtonMask: 1 });
    } catch (e) {}
  }, [tool, isImage, idx]);

  /* --- Keyboard: arrows step through the images, letters pick a tool ------
     Opens on Pan so a click never draws by accident; a measuring tool is
     always a deliberate choice. */
  vUseEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (typing) return;
      const step = (n) => {
        e.preventDefault();
        setIdx(i => Math.min(files.length - 1, Math.max(0, i + n)));
      };
      // On a cine loop, ← / → scrub frames (what a sonographer expects);
      // ↑ / ↓ still move between files.
      if (isCine && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        return stepFrame(e.key === 'ArrowRight' ? 1 : -1);
      }
      if (isCine && e.key === ' ') {
        e.preventDefault();
        return setPlaying(p => !p);
      }
      switch (e.key) {
        case 'ArrowRight': case 'ArrowDown': case 'PageDown': return step(1);
        case 'ArrowLeft': case 'ArrowUp': case 'PageUp': return step(-1);
        case 'Home': e.preventDefault(); return setIdx(0);
        case 'End': e.preventDefault(); return setIdx(files.length - 1);
        case 'Escape': e.preventDefault(); return setTool('Pan');
        case '[': e.preventDefault(); return rotate(-90);
        case ']': e.preventDefault(); return rotate(90);
        case 'h': case 'H': e.preventDefault(); return flip('h');
        case 'j': case 'J': e.preventDefault(); return flip('v');
        default: break;
      }
      const key = VIEWER_KEYS[e.key.toLowerCase()];
      if (key) { e.preventDefault(); setTool(key); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [files.length, isCine, frameCount]);

  /* --- Actions --- */
  const nudgeViewport = (fn) => {
    const el = elementRef.current;
    if (!el) return;
    try {
      const vp = cornerstone.getViewport(el);
      if (!vp) return;
      fn(vp);
      cornerstone.setViewport(el, vp);
    } catch (e) {}
  };
  // Radiographs often arrive on their side. Rotation is a viewport change,
  // so measurements and annotations rotate with the image and stay valid.
  const rotate = (deg) => nudgeViewport(vp => { vp.rotation = ((vp.rotation || 0) + deg + 360) % 360; });
  const flip = (axis) => nudgeViewport(vp => {
    if (axis === 'h') vp.hflip = !vp.hflip; else vp.vflip = !vp.vflip;
  });

  const resetView = () => {
    if (elementRef.current) { try { cornerstone.reset(elementRef.current); } catch (e) {} }
  };
  const clearAll = async () => {
    if (!file) return;
    if (!confirm('Clear all measurements & annotations on this image?')) return;
    if (elementRef.current) {
      const tsm = cornerstoneTools.globalImageIdSpecificToolStateManager;
      tsm.clear(elementRef.current);
      cornerstone.updateImage(elementRef.current);
      await window.PortalDB.saveAnnotations(file.id, {});
      setMeasurements([]);
    }
  };
  const removeMeasurement = (m) => {
    if (!elementRef.current) return;
    try {
      const toolStateManager = cornerstoneTools.getElementToolStateManager(elementRef.current);
      const state = toolStateManager.get(elementRef.current, m.tool);
      if (state && state.data) {
        const i = state.data.findIndex(d => (d.uuid || d._id) === m.uuid);
        if (i >= 0) state.data.splice(i, 1);
        cornerstone.updateImage(elementRef.current);
        rebuildMeasurements();
      }
    } catch (e) { console.warn(e); }
  };
  const downloadAnnotated = async () => {
    if (!elementRef.current) return;
    try {
      const canvas = elementRef.current.querySelector('canvas');
      if (!canvas) return;
      canvas.toBlob((blob) => {
        if (blob) window.PortalDB.downloadBlob(blob, `${file.name.replace(/\.[^.]+$/, '')}_annotated.png`);
      });
    } catch (e) { console.warn(e); }
  };

  /* --- Calibration --- */
  const startCalibration = () => {
    setCalibrating(true);
    setTool('Length');
  };
  const applyCalibration = (knownCm) => {
    if (!elementRef.current || !knownCm || isNaN(parseFloat(knownCm))) return;
    const km = parseFloat(knownCm);
    const toolStateManager = cornerstoneTools.getElementToolStateManager(elementRef.current);
    const state = toolStateManager.get(elementRef.current, 'Length');
    if (!state || !state.data || state.data.length === 0) {
      alert('Draw a line on the image first using the caliper, then enter the known distance.');
      return;
    }
    // Use the last line drawn
    const lastLine = state.data[state.data.length - 1];
    const dx = lastLine.handles.end.x - lastLine.handles.start.x;
    const dy = lastLine.handles.end.y - lastLine.handles.start.y;
    const pxDist = Math.sqrt(dx*dx + dy*dy);
    const mmPerPx = (km * 10) / pxDist; // mm per pixel
    saveCalibration(file.id, mmPerPx);
    pixelSpacingRef.current = mmPerPx;
    spacingPairRef.current = { col: mmPerPx, row: mmPerPx };
    setCalSource('manual');
    setCalDetail({ colMmPerPx: mmPerPx, rowMmPerPx: mmPerPx });
    // Patch the displayed image
    const ee = cornerstone.getEnabledElement(elementRef.current);
    if (ee && ee.image) {
      ee.image.rowPixelSpacing = mmPerPx;
      ee.image.columnPixelSpacing = mmPerPx;
    }
    // Remove the calibration line itself (so it doesn't clutter)
    state.data.pop();
    cornerstone.updateImage(elementRef.current);
    setCalibrating(false);
    rebuildMeasurements();
  };

  /* Revert to the file's embedded scale, discarding any manual calibration */
  const useEmbeddedCalibration = () => {
    const emb = embeddedCalRef.current;
    if (!emb) return;
    clearCalibration(file.id);
    pixelSpacingRef.current = emb.col;
    spacingPairRef.current = { col: emb.col, row: emb.row || emb.col };
    setCalSource(emb.source);
    setCalDetail({ colMmPerPx: emb.col, rowMmPerPx: emb.row || emb.col });
    const ee = cornerstone.getEnabledElement(elementRef.current);
    if (ee && ee.image) {
      ee.image.columnPixelSpacing = emb.col;
      ee.image.rowPixelSpacing = emb.row || emb.col;
      cornerstone.updateImage(elementRef.current);
    }
    rebuildMeasurements();
  };

  const hasSpacing = !!pixelSpacingRef.current;
  const manualOverridingEmbedded = calSource === 'manual' && hasEmbedded;

  return (
    <div className="viewer-shell viewer-shell-with-panel">
      <div className="viewer-bar">
        <button className="vbar-btn" onClick={onClose}>← Back to case</button>
        <div className="viewer-fileinfo">
          <div className="viewer-fname">{file.name}</div>
          <div className="viewer-fmeta">
            {idx + 1} of {files.length}
            {files.length > 1 ? ' · ← → to step' : ''}
            {imageInfo && imageInfo.width ? ` · ${imageInfo.width} × ${imageInfo.height}px` : ''}
            {isCine ? ` · cine loop, ${frameCount} frames` : ''}
            {imageInfo && imageInfo.spacing ?
              ` · ${imageInfo.spacing.toFixed(4)} mm/px · calibrated from ${(window.PortalDicomMeta && window.PortalDicomMeta.CAL_SOURCE_LABEL[imageInfo.source]) || 'file'}`
              : ' · uncalibrated'}
          </div>
        </div>
        <div className="viewer-pager">
          <button className="vbar-btn icon" onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0} title="Previous image (←)">‹</button>
          <button className="vbar-btn icon" onClick={() => setIdx(Math.min(files.length - 1, idx + 1))} disabled={idx >= files.length - 1} title="Next image (→)">›</button>
        </div>
      </div>

      {isImage ? (
        <Toolbar
          active={tool}
          setActive={setTool}
          onReset={resetView}
          onRotate={rotate}
          onFlip={flip}
          onClearAnnotations={clearAll}
          onDownload={downloadAnnotated}
          onStartCalibration={startCalibration}
          hasSpacing={hasSpacing}
        />
      ) : (
        // Placeholder keeps the grid rows aligned (bar / toolbar / stage / strip)
        // so non-image files (PDF, video) don't shift the stage into the
        // toolbar's tiny row and collapse to a strip.
        <div className="viewer-toolbar-empty" />
      )}

      <div className={`viewer-stage-wrap ${isImage ? '' : 'no-panel'}`}>
        <div className="viewer-stage">
          {isImage && (
            <div ref={elementRef} className="viewer-canvas" onContextMenu={(e) => e.preventDefault()} />
          )}
          {isImage && loading && !loadError && (
            <div className="viewer-loading">
              <div className="vload-spinner"></div>
              <div className="vload-text">Decoding {file.name}…</div>
              <div className="vload-sub">Compressed DICOMs may take a moment on first load.</div>
            </div>
          )}
          {isImage && loadError && (
            <div className="viewer-error">
              <div className="verr-eb">Could not display image</div>
              <div className="verr-name">{file.name}</div>
              <div className="verr-msg">{loadError}</div>
              <div className="verr-hint">
                Common causes: unsupported DICOM transfer syntax, corrupt file, or a non-imaging DICOM
                (structured report / encapsulated PDF). You can still download the file and open it in your local viewer.
              </div>
              <div className="verr-actions">
                <button className="btn btn-clay" onClick={() => window.PortalDB.downloadBlob(file.blob, file.name)}>
                  Download file <span className="arrow">↓</span>
                </button>
              </div>
            </div>
          )}
          {isVideo && !videoError && (
            <video ref={videoRef} src={blobUrl} controls playsInline
                   onError={() => setVideoError(true)}
                   style={{maxWidth:'100%', maxHeight:'100%', background:'#000'}} />
          )}
          {isVideo && videoError && (
            <div className="viewer-unsupported">
              <div className="serif" style={{fontSize:24}}>This clip won’t play in the browser</div>
              <div style={{marginTop:8, fontSize:14, color:'#9aa39d', maxWidth:460}}>
                The browser can’t decode this video format — AVI and some MOV files are
                common causes. Download it to play locally, or ask the clinic to re-export
                the loop as DICOM or MP4.
              </div>
              <div style={{marginTop:6, fontSize:13, color:'#7d857f'}}>{file.name}</div>
              <button className="btn btn-clay" style={{marginTop:24}}
                      onClick={() => window.PortalDB.downloadBlob(file.blob, file.name)}>
                Download file <span className="arrow">↓</span>
              </button>
            </div>
          )}
          {isPdf && (
            <iframe src={blobUrl}
                    style={{width:'100%', height:'100%', border:'none', background:'#fff'}}
                    title={file.name} />
          )}
          {!isImage && !isVideo && !isPdf && (
            <div className="viewer-unsupported">
              <div className="serif" style={{fontSize:24}}>{fileIsProprietaryCine(file) ? 'Cine loop — download to view' : 'Preview not available'}</div>
              <div style={{marginTop:8, fontSize:14, color:'#9aa39d'}}>
                {fileIsProprietaryCine(file)
                  ? 'This is a proprietary ultrasound cine file (.adi). Download it to open in your ultrasound software.'
                  : file.name}
              </div>
              {fileIsProprietaryCine(file) && <div style={{marginTop:6, fontSize:13, color:'#7d857f'}}>{file.name}</div>}
              <button className="btn btn-clay" style={{marginTop:24}}
                      onClick={() => window.PortalDB.downloadBlob(file.blob, file.name)}>
                Download file <span className="arrow">↓</span>
              </button>
            </div>
          )}

          {isImage && annotationSaved && <div className="ann-saved">✓ Saved</div>}
          {isImage && isCine && !loadError && (
            <CineBar
              frameIdx={frameIdx}
              frameCount={frameCount}
              playing={playing}
              setPlaying={setPlaying}
              fps={fps}
              setFps={setFps}
              prefetch={prefetch}
              onScrub={(i) => { setPlaying(false); setFrameIdx(i); }}
              onStep={stepFrame}
            />
          )}
          {calibrating && (
            <CalibrationPrompt onApply={applyCalibration} onCancel={() => setCalibrating(false)} />
          )}
        </div>

        {isImage && (
          <MeasurementsPanel
            measurements={measurements}
            hasSpacing={hasSpacing}
            calSource={calSource}
            calDetail={calDetail}
            hasEmbedded={hasEmbedded}
            manualOverridingEmbedded={manualOverridingEmbedded}
            embeddedCal={embeddedCalRef.current}
            onUseEmbedded={useEmbeddedCalibration}
            dicomHeader={dicomHeader}
            showHeader={showHeader}
            setShowHeader={setShowHeader}
            onRemove={removeMeasurement}
            onClearAll={clearAll}
            onStartCalibration={startCalibration}
          />
        )}
      </div>

      <div className="viewer-strip">
        {files.map((f, i) => (
          <button key={f.id} className={`strip-thumb ${i === idx ? 'active' : ''}`} onClick={() => setIdx(i)}>
            <div className="strip-fmt">{(f.name.split('.').pop() || '').toUpperCase()}</div>
            <div className="strip-name">{f.name}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   MEASUREMENTS PANEL
   ============================================================ */
function MeasurementsPanel({ measurements, hasSpacing, calSource, calDetail, hasEmbedded, manualOverridingEmbedded, embeddedCal, onUseEmbedded, dicomHeader, showHeader, setShowHeader, onRemove, onClearAll, onStartCalibration }) {
  const grouped = {
    'Caliper distance': measurements.filter(m => m.tool === 'Length'),
    'Freehand area': measurements.filter(m => m.tool === 'FreehandRoi'),
    'Ellipse ROI': measurements.filter(m => m.tool === 'EllipticalRoi'),
    'Rectangle ROI': measurements.filter(m => m.tool === 'RectangleRoi'),
    'Angle': measurements.filter(m => m.tool === 'Angle'),
    'Probe': measurements.filter(m => m.tool === 'Probe'),
    'Notes': measurements.filter(m => m.tool === 'ArrowAnnotate'),
  };

  const sourceLabel = (window.PortalDicomMeta && calSource)
    ? window.PortalDicomMeta.CAL_SOURCE_LABEL[calSource] || 'file'
    : 'file';
  const autoEmbedded = calSource && calSource !== 'manual';

  return (
    <aside className="meas-panel">
      <div className="meas-head">
        <div className="meas-title">Measurements</div>
        <div className="meas-count">{measurements.length}</div>
      </div>

      {/* ---- Calibration status ---- */}
      {!hasSpacing && (
        <div className="meas-warn">
          <div className="meas-warn-h">No embedded scale found</div>
          <p className="meas-warn-p">This file carries no DICOM pixel-spacing or ultrasound-region calibration. Measurements stay in pixels until you set the scale by hand.</p>
          <button className="meas-cal-btn" onClick={onStartCalibration}>Calibrate scale →</button>
        </div>
      )}
      {hasSpacing && (
        <div className={`meas-cal-ok ${autoEmbedded ? 'auto' : 'manual'}`}>
          <span className="cal-dot"></span>
          <div className="cal-ok-body">
            <div className="cal-ok-h">
              {autoEmbedded ? 'Auto-calibrated' : 'Manually calibrated'}
            </div>
            <div className="cal-ok-sub">
              from {sourceLabel}
              {calDetail && calDetail.colMmPerPx ?
                ` · ${calDetail.colMmPerPx.toFixed(4)}${calDetail.rowMmPerPx && Math.abs(calDetail.rowMmPerPx - calDetail.colMmPerPx) > 1e-6 ? ` × ${calDetail.rowMmPerPx.toFixed(4)}` : ''} mm/px`
                : ''}
            </div>
          </div>
          <button className="cal-reset" onClick={onStartCalibration} title="Override with a manual calibration">Override</button>
        </div>
      )}

      {/* ---- Manual override is hiding the file's own scale ---- */}
      {manualOverridingEmbedded && embeddedCal && (
        <div className="cal-revert">
          <div className="cal-revert-h">This file has its own embedded scale</div>
          <p className="cal-revert-p">
            You're using a manual calibration. The scanner embedded a scale of{' '}
            <strong>{embeddedCal.col.toFixed(4)} mm/px</strong> in this file — use it for measurements that match the machine's own.
          </p>
          <button className="cal-revert-btn" onClick={onUseEmbedded}>Use the file's embedded scale →</button>
        </div>
      )}

      {/* ---- DICOM header readout ---- */}
      {dicomHeader && (
        <div className="dcm-info">
          <button className="dcm-info-toggle" onClick={() => setShowHeader(!showHeader)}>
            <span>File information</span>
            <span className="dcm-chev">{showHeader ? '▾' : '▸'}</span>
          </button>
          {showHeader && (
            <div className="dcm-info-body">
              {[
                ['Modality', dicomHeader.modality],
                ['Manufacturer', dicomHeader.manufacturer],
                ['Model', dicomHeader.model],
                ['Body part', dicomHeader.bodyPart],
                ['Matrix', dicomHeader.cols && dicomHeader.rows ? `${dicomHeader.cols} × ${dicomHeader.rows}` : null],
                ['Photometric', dicomHeader.photometric],
                ['Transducer', dicomHeader.transducerData],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="dcm-row">
                  <span className="dcm-k">{k}</span>
                  <span className="dcm-v">{v}</span>
                </div>
              ))}
              {calDetail && calDetail.region && (
                <div className="dcm-row">
                  <span className="dcm-k">US region Δ</span>
                  <span className="dcm-v">{calDetail.region.deltaX} × {calDetail.region.deltaY} cm/px</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="meas-list">
        {measurements.length === 0 && (
          <div className="meas-empty">
            Draw on the image to start measuring.
            <ul>
              <li>Pick <strong>Caliper</strong> for distance</li>
              <li>Pick <strong>Freehand area</strong> for cm²</li>
            </ul>
          </div>
        )}
        {Object.entries(grouped).map(([label, items]) => items.length > 0 && (
          <div key={label} className="meas-group">
            <div className="meas-group-label">{label} · {items.length}</div>
            {items.map((m, i) => (
              <div key={m.uuid} className="meas-row">
                <div className="meas-idx">{String(i + 1).padStart(2, '0')}</div>
                <div className="meas-val">
                  <span className="meas-num">{m.value}</span>
                  <span className="meas-unit">{m.unit}</span>
                  {m.extra && <span className="meas-extra">{m.extra}</span>}
                </div>
                <button className="meas-rm" onClick={() => onRemove(m)} title="Remove">×</button>
              </div>
            ))}
          </div>
        ))}
      </div>

      {measurements.length > 0 && (
        <div className="meas-foot">
          <button className="meas-foot-btn" onClick={onClearAll}>Clear all</button>
        </div>
      )}
    </aside>
  );
}

/* ============================================================
   CALIBRATION PROMPT (overlay)
   ============================================================ */
function CalibrationPrompt({ onApply, onCancel }) {
  const [val, setVal] = vUseState('');
  return (
    <div className="cal-overlay">
      <div className="cal-card">
        <div className="cal-eb">Set scale</div>
        <h3 className="cal-h">Calibrate this image</h3>
        <ol className="cal-steps">
          <li>The <strong>Caliper</strong> tool is now active.</li>
          <li>Draw a line across an object of known length (e.g. ultrasound ruler tick).</li>
          <li>Enter that line's known length in <strong>cm</strong> below and apply.</li>
        </ol>
        <div className="cal-input-row">
          <input type="number" step="0.01" min="0.01"
                 value={val} onChange={e => setVal(e.target.value)}
                 placeholder="1.00" autoFocus />
          <span>cm</span>
          <button className="btn btn-clay" onClick={() => onApply(val)}>Apply calibration</button>
          <button className="vbar-btn" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   TOOLBAR
   ============================================================ */
function Toolbar({ active, setActive, onReset, onRotate, onFlip, onClearAnnotations, onDownload, onStartCalibration, hasSpacing }) {
  const groups = [
    {
      label: 'Navigate',
      tools: [
        { id: 'Pan', label: 'Pan', glyph: '✥', key: 'V', help: 'Drag to move the image' },
        { id: 'Zoom', label: 'Zoom', glyph: '⊕', key: 'Z', help: 'Drag up/down to zoom' },
        { id: 'Wwwc', label: 'W/L', glyph: '◐', key: 'W', help: 'Window / Level — adjust contrast' },
      ],
    },
    {
      label: 'Measure',
      tools: [
        { id: 'Length', label: 'Caliper', glyph: '—', key: 'C', help: 'Linear distance (cm with calibration)' },
        { id: 'FreehandRoi', label: 'Freehand area', glyph: '◌', key: 'F', help: 'Trace any shape → area in cm²' },
        { id: 'EllipticalRoi', label: 'Ellipse', glyph: '◯', key: 'E', help: 'Elliptical area + mean intensity' },
        { id: 'RectangleRoi', label: 'Rectangle', glyph: '◻', key: 'R', help: 'Rectangular area + mean intensity' },
        { id: 'Angle', label: 'Angle', glyph: '∠', key: 'G', help: '3-point angle' },
        { id: 'Probe', label: 'Probe', glyph: '•', key: 'P', help: 'Single-pixel value' },
      ],
    },
    {
      label: 'Annotate',
      tools: [
        { id: 'ArrowAnnotate', label: 'Arrow + Text', glyph: '➜', key: 'A', help: 'Arrow with label' },
        { id: 'Eraser', label: 'Eraser', glyph: '✕', key: 'X', help: 'Remove an annotation' },
      ],
    },
  ];

  return (
    <div className="viewer-toolbar">
      {groups.map((g) => (
        <div key={g.label} className="tool-group">
          <span className="tool-group-label">{g.label}</span>
          <div className="tool-buttons">
            {g.tools.map(t => (
              <button key={t.id} onClick={() => setActive(t.id)}
                      className={`tool-btn ${active === t.id ? 'active' : ''}`}
                      title={`${t.label} — ${t.help} (${t.key})`}>
                <span className="tool-glyph">{t.glyph}</span>
                <span className="tool-label">{t.label}</span>
                <span className="tool-key">{t.key}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="tool-group">
        <span className="tool-group-label">Orient</span>
        <div className="tool-buttons">
          <button className="tool-btn" onClick={() => onRotate(-90)} title="Rotate left 90° ([)">
            <span className="tool-glyph">↶</span>
            <span className="tool-label">Rotate left</span>
            <span className="tool-key">[</span>
          </button>
          <button className="tool-btn" onClick={() => onRotate(90)} title="Rotate right 90° (])">
            <span className="tool-glyph">↷</span>
            <span className="tool-label">Rotate right</span>
            <span className="tool-key">]</span>
          </button>
          <button className="tool-btn" onClick={() => onFlip('h')} title="Flip horizontally (H)">
            <span className="tool-glyph">⇄</span>
            <span className="tool-label">Flip H</span>
            <span className="tool-key">H</span>
          </button>
          <button className="tool-btn" onClick={() => onFlip('v')} title="Flip vertically (J)">
            <span className="tool-glyph">⇅</span>
            <span className="tool-label">Flip V</span>
            <span className="tool-key">J</span>
          </button>
        </div>
      </div>
      <div className="tool-group tool-group-actions">
        <span className="tool-group-label">Actions</span>
        <div className="tool-buttons">
          <button className="tool-btn" onClick={onStartCalibration} title="Set scale: draw a line of known length, enter the length in cm">
            <span className="tool-glyph">⇔</span>
            <span className="tool-label">{hasSpacing ? 'Re-calibrate' : 'Calibrate'}</span>
          </button>
          <button className="tool-btn" onClick={onReset} title="Reset view">
            <span className="tool-glyph">↺</span>
            <span className="tool-label">Reset</span>
          </button>
          <button className="tool-btn" onClick={onClearAnnotations} title="Clear all measurements">
            <span className="tool-glyph">⊘</span>
            <span className="tool-label">Clear</span>
          </button>
          <button className="tool-btn" onClick={onDownload} title="Download annotated PNG">
            <span className="tool-glyph">↓</span>
            <span className="tool-label">PNG</span>
          </button>
        </div>
      </div>
    </div>
  );
}

window.DicomViewer = DicomViewer;
window.fileIsViewable = fileIsViewable;
window.fileIsVideo = fileIsVideo;
window.fileIsPdf = fileIsPdf;
