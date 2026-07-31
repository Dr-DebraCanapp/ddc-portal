/* global React, window, cornerstone, cornerstoneWADOImageLoader */
/* ============================================================
   Schedule — file & DICOM viewer
   Reuses the Cornerstone stack loaded in Schedule.html (same as the
   reviewer portal) to display DICOM. Images & PDFs render directly.
   A file entry is either a seed string (filename only, "sample") or
   an uploaded object { name, kind, url, file }.
   ============================================================ */

function schedFileName(f) { return typeof f === 'string' ? f : (f && f.name) || 'file'; }
function schedFileKind(f) {
  const name = schedFileName(f).toLowerCase();
  if (/\.(dcm|dicom)$/.test(name)) return 'dicom';
  if (/\.(jpg|jpeg|png|gif|webp|bmp)$/.test(name)) return 'image';
  if (/\.pdf$/.test(name)) return 'pdf';
  if (/\.(mp4|mov|webm|avi)$/.test(name)) return 'video';
  return 'doc';
}
const schedFileHasData = (f) => typeof f !== 'string' && !!(f && (f.url || f.file || f.path || f.external));

function FileIcon({ kind }) {
  const label = { dicom: 'DCM', image: 'IMG', pdf: 'PDF', video: 'VID', doc: 'DOC' }[kind] || 'FILE';
  return <span className="ic">{label}</span>;
}

/* ---- the viewer modal -------------------------------------- */
function FileViewer({ file, onClose }) {
  const { useRef, useEffect, useState } = React;
  const kind = schedFileKind(file);
  const hasData = schedFileHasData(file);
  const name = schedFileName(file);
  const dcmRef = useRef(null);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState(kind === 'dicom' ? 'Loading DICOM…' : '');

  // cloud-stored files carry a storage path — resolve a signed URL on open
  const needsResolve = typeof file !== 'string' && file && file.path && !file.url && !file.file;
  const [remoteUrl, setRemoteUrl] = useState(null);
  useEffect(() => {
    let live = true;
    setRemoteUrl(null);
    if (needsResolve && window.SchedCloud && window.SchedCloud.configured) {
      window.SchedCloud.fileURL(file.path)
        .then(u => { if (live) setRemoteUrl(u); })
        .catch(() => { if (live) { setErr('Could not fetch this file from storage.'); setStatus(''); } });
    }
    return () => { live = false; };
  }, [file]);
  const url = (typeof file !== 'string' && file && file.url) || remoteUrl;

  useEffect(() => {
    if (kind !== 'dicom' || !hasData) return;
    if (!file.file && !url) return; // waiting on the signed URL
    const el = dcmRef.current;
    if (!el || typeof cornerstone === 'undefined') { setErr('DICOM viewer not available.'); return; }
    let enabled = false;
    try {
      cornerstone.enable(el);
      enabled = true;
      const imageId = file.file
        ? cornerstoneWADOImageLoader.wadouri.fileManager.add(file.file)
        : 'wadouri:' + url;
      cornerstone.loadImage(imageId).then((image) => {
        cornerstone.displayImage(el, image);
        setStatus('');
      }).catch((e) => { setErr('Could not decode this DICOM file.'); setStatus(''); });
    } catch (e) { setErr('Could not open the DICOM viewer.'); setStatus(''); }
    // basic wheel zoom
    const onWheel = (ev) => {
      ev.preventDefault();
      if (!enabled) return;
      const vp = cornerstone.getViewport(el); if (!vp) return;
      vp.scale += ev.deltaY < 0 ? 0.15 : -0.15;
      vp.scale = Math.max(0.2, Math.min(8, vp.scale));
      cornerstone.setViewport(el, vp);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => { el.removeEventListener('wheel', onWheel); if (enabled) { try { cornerstone.disable(el); } catch (e) {} } };
  }, [file, kind, hasData, url]);

  let body;
  if (typeof file !== 'string' && file && file.external) {
    body = kind === 'image'
      ? <img className="sc-fv-img" src={file.url} alt={name} />
      : (
        <div className="sc-fv-placeholder">
          <FileIcon kind={kind} />
          <div className="ph-name">{name}</div>
          <p>{file.modality ? file.modality + ' · ' : ''}{file.studyDate || 'linked study'} — hosted by the clinic.<br /><a href={file.url} target="_blank" rel="noopener">Open the linked study ↗</a></p>
        </div>
      );
  } else if (!hasData) {
    body = (
      <div className="sc-fv-placeholder">
        <FileIcon kind={kind} />
        <div className="ph-name">{name}</div>
        <p>This is a sample record. When a referring vet uploads a real file, it opens here — {kind === 'dicom' ? 'DICOM studies in the Cornerstone viewer (zoom / pan / window)' : kind === 'image' ? 'radiographs shown full-size' : kind === 'pdf' ? 'PDFs rendered inline' : 'documents rendered inline'}.</p>
      </div>
    );
  } else if (kind === 'image') {
    body = url ? <img className="sc-fv-img" src={url} alt={name} /> : <div className="sc-fv-status">Fetching…</div>;
  } else if (kind === 'pdf') {
    body = url ? <iframe className="sc-fv-frame" src={url} title={name} /> : <div className="sc-fv-status">Fetching…</div>;
  } else if (kind === 'video') {
    body = url ? <video className="sc-fv-img" src={url} controls /> : <div className="sc-fv-status">Fetching…</div>;
  } else if (kind === 'dicom') {
    body = (
      <div className="sc-fv-dicom">
        <div ref={dcmRef} className="sc-fv-cs" onContextMenu={e => e.preventDefault()} />
        {status && <div className="sc-fv-status">{status}</div>}
        {err && <div className="sc-fv-status err">{err}</div>}
        {!err && <div className="sc-fv-hint">Scroll to zoom</div>}
      </div>
    );
  } else {
    body = <div className="sc-fv-placeholder"><FileIcon kind={kind} /><div className="ph-name">{name}</div><p>{url ? <a href={url} target="_blank" rel="noopener">Open / download this document ↗</a> : 'Fetching…'}</p></div>;
  }

  return (
    <div className="sc-modal-overlay" onClick={onClose}>
      <div className="sc-fv" onClick={e => e.stopPropagation()}>
        <div className="sc-fv-head">
          <div className="sc-fv-title"><FileIcon kind={kind} /><span>{name}</span></div>
          <div className="sc-fv-tools">
            {hasData && kind !== 'dicom' && url && <a className="btn btn-ghost btn-sm" href={url} target="_blank" rel="noopener">Open in new tab</a>}
            <button className="sc-drawer-close" onClick={onClose} aria-label="Close">×</button>
          </div>
        </div>
        <div className="sc-fv-stage">{body}</div>
      </div>
    </div>
  );
}

Object.assign(window, { schedFileName, schedFileKind, schedFileHasData, FileViewer });
