/* global dicomParser */
/* ============================================================
   DICOM METADATA + EMBEDDED CALIBRATION READER
   ------------------------------------------------------------
   Ultrasound DICOMs rarely carry top-level PixelSpacing. Their
   real-world scale lives in the Sequence of Ultrasound Regions
   (0018,6011) as PhysicalDeltaX/Y (cm per pixel). This module
   parses the raw dataset straight from the file blob and pulls
   out whatever calibration is embedded, so measurements can be
   auto-scaled to cm / cm² with no manual step.
   ============================================================ */

/* Physical Units enum (PhysicalUnitsXDirection / YDirection) */
const US_UNITS = {
  0: 'none', 1: '%', 2: 'dB', 3: 'cm', 4: 'sec', 5: 'hz',
  6: 'dB/sec', 7: 'cm/sec', 8: 'cm²', 9: 'cm²/sec', 10: 'unitless',
};

/* Parse a DICOM dataset directly from a Blob. Returns null if not DICOM. */
async function parseDataSetFromBlob(blob) {
  try {
    const buf = await blob.arrayBuffer();
    const byteArray = new Uint8Array(buf);
    return dicomParser.parseDicom(byteArray);
  } catch (e) {
    return null; // not a DICOM file (jpg/png/etc.) or unparseable
  }
}

/* Safe accessors */
function _str(ds, tag) { try { const v = ds.string(tag); return v || null; } catch (e) { return null; } }
function _u16(ds, tag) { try { const v = ds.uint16(tag); return (v === undefined ? null : v); } catch (e) { return null; } }
function _u32(ds, tag) { try { const v = ds.uint32(tag); return (v === undefined ? null : v); } catch (e) { return null; } }
function _dbl(ds, tag) { try { const v = ds.double(tag); return (v === undefined || isNaN(v) ? null : v); } catch (e) { return null; } }

/* Read every ultrasound region in the sequence */
function readUltrasoundRegions(ds) {
  if (!ds || !ds.elements) return [];
  const seq = ds.elements.x00186011;
  if (!seq || !seq.items) return [];
  const regions = [];
  seq.items.forEach((item, i) => {
    const r = item.dataSet;
    if (!r) return;
    regions.push({
      index: i,
      unitsX: _u16(r, 'x00186024'),
      unitsY: _u16(r, 'x00186026'),
      deltaX: _dbl(r, 'x0018602c'), // cm / px (horizontal)
      deltaY: _dbl(r, 'x0018602e'), // cm / px (vertical)
      spatialFormat: _u16(r, 'x00186012'),
      dataType: _u16(r, 'x00186014'),
      minX0: _u32(r, 'x00186018'),
      minY0: _u32(r, 'x0018601a'),
      maxX1: _u32(r, 'x0018601c'),
      maxY1: _u32(r, 'x0018601e'),
    });
  });
  return regions;
}

/* Choose the spatial (2-D, cm-calibrated) region — prefer the largest */
function pickSpatialRegion(regions) {
  const cand = regions.filter(r =>
    r.unitsX === 3 && r.unitsY === 3 &&
    typeof r.deltaX === 'number' && r.deltaX > 0 &&
    typeof r.deltaY === 'number' && r.deltaY > 0
  );
  if (!cand.length) return null;
  cand.sort((a, b) => {
    const aa = ((a.maxX1 || 0) - (a.minX0 || 0)) * ((a.maxY1 || 0) - (a.minY0 || 0));
    const bb = ((b.maxX1 || 0) - (b.minX0 || 0)) * ((b.maxY1 || 0) - (b.minY0 || 0));
    return bb - aa;
  });
  return cand[0];
}

/* Parse PixelSpacing-style "a\b" → [row, col] in mm */
function _spacingPair(str) {
  if (!str) return null;
  const parts = String(str).split('\\').map(s => parseFloat(s));
  if (parts.length >= 2 && parts[0] > 0 && parts[1] > 0) return [parts[0], parts[1]];
  if (parts.length === 1 && parts[0] > 0) return [parts[0], parts[0]];
  return null;
}

/* ------------------------------------------------------------
   extractEmbeddedCalibration(dataSet, image)
   Returns { colMmPerPx, rowMmPerPx, source, region?, regions? }
   or null when nothing usable is found.
   source ∈ 'us-region' | 'pixel-spacing' | 'imager-pixel-spacing' | 'dicom-spacing'
   ------------------------------------------------------------ */
function extractEmbeddedCalibration(ds, image) {
  if (ds) {
    // 1) Sequence of Ultrasound Regions (the US case)
    const regions = readUltrasoundRegions(ds);
    const r = pickSpatialRegion(regions);
    if (r) {
      return {
        colMmPerPx: r.deltaX * 10,
        rowMmPerPx: r.deltaY * 10,
        source: 'us-region',
        region: r,
        regions,
      };
    }
    // 2) PixelSpacing (CT / MR / DX)
    const ps = _spacingPair(_str(ds, 'x00280030'));
    if (ps) return { rowMmPerPx: ps[0], colMmPerPx: ps[1], source: 'pixel-spacing', regions };
    // 3) Imager Pixel Spacing (projection radiography)
    const ips = _spacingPair(_str(ds, 'x00181164'));
    if (ips) return { rowMmPerPx: ips[0], colMmPerPx: ips[1], source: 'imager-pixel-spacing', regions };
  }
  // 4) Whatever cornerstone already derived
  if (image && (image.rowPixelSpacing || image.columnPixelSpacing)) {
    const row = image.rowPixelSpacing || image.columnPixelSpacing;
    const col = image.columnPixelSpacing || image.rowPixelSpacing;
    return { rowMmPerPx: row, colMmPerPx: col, source: 'dicom-spacing' };
  }
  return null;
}

/* General header for the info readout */
function readDicomHeader(ds) {
  if (!ds) return null;
  return {
    modality: _str(ds, 'x00080060'),
    manufacturer: _str(ds, 'x00080070'),
    model: _str(ds, 'x00081090'),
    transducerFreq: _str(ds, 'x00185010'),
    transducerData: _str(ds, 'x00185010'),
    studyDate: _str(ds, 'x00080020'),
    bodyPart: _str(ds, 'x00180015'),
    photometric: _str(ds, 'x00280004'),
    rows: _u16(ds, 'x00280010'),
    cols: _u16(ds, 'x00280011'),
    bits: _u16(ds, 'x00280100'),
  };
}

const CAL_SOURCE_LABEL = {
  'us-region': 'DICOM ultrasound region',
  'pixel-spacing': 'DICOM Pixel Spacing',
  'imager-pixel-spacing': 'Imager Pixel Spacing',
  'dicom-spacing': 'DICOM metadata',
  'manual': 'manual calibration',
};

window.PortalDicomMeta = {
  parseDataSetFromBlob,
  extractEmbeddedCalibration,
  readDicomHeader,
  readUltrasoundRegions,
  US_UNITS,
  CAL_SOURCE_LABEL,
};
