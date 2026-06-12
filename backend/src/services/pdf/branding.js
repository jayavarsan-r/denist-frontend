// backend/src/services/pdf/branding.js
// Single source of truth for the look of every clinical PDF: page geometry, palette,
// the clinic header (logo + name + address + phone + reg no, dentist name + reg no) and
// the footer. Every generator renders through these so all documents share one frame.
const axios = require('axios');

const A4 = 'A4';
const MARGIN = 40;
const COLORS = { primary: '#1C1C1E', muted: '#6E6E73', accent: '#007AFF', hair: '#E5E5EA', faint: '#F2F2F7' };

function contentWidth(doc) { return doc.page.width - MARGIN * 2; }

// Render a missing value as a consistent, honest placeholder (never blank, never invented).
function notSpecified(v) {
  const s = (v == null ? '' : String(v)).trim();
  return s === '' ? 'Not Specified' : s;
}

// Fetch a logo URL into a Buffer pdfkit can embed (PNG/JPEG only). Non-fatal: a broken
// logo must never break the document — returns null and the header omits the image.
async function fetchLogoBuffer(url) {
  if (!url) return null;
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 5000 });
    const ct = (res.headers['content-type'] || '').toLowerCase();
    if (!ct.includes('png') && !ct.includes('jpeg') && !ct.includes('jpg')) return null;
    return Buffer.from(res.data);
  } catch { return null; }
}

// drawHeader(doc, { clinic, dentist, logoBuffer? }) → leaves the cursor below a divider.
// clinic: { name, address, phone, registration_number }
// dentist: { name, registration_number }
function drawHeader(doc, { clinic = {}, dentist = {}, logoBuffer = null }) {
  const W = contentWidth(doc);
  const top = MARGIN;
  let textX = MARGIN;
  if (logoBuffer) {
    try { doc.image(logoBuffer, MARGIN, top, { fit: [48, 48] }); textX = MARGIN + 60; } catch { /* ignore bad image */ }
  }
  doc.fontSize(18).font('Helvetica-Bold').fillColor(COLORS.primary)
    .text(notSpecified(clinic.name), textX, top, { width: W - (textX - MARGIN) - 150 });
  doc.fontSize(9).font('Helvetica').fillColor(COLORS.muted)
    .text([clinic.address, clinic.phone].map((x) => (x || '').trim()).filter(Boolean).join('  ·  ') || 'Not Specified', textX, doc.y + 2);
  if (clinic.registration_number) {
    doc.fontSize(8).fillColor(COLORS.muted).text(`Clinic Reg: ${clinic.registration_number}`, textX, doc.y + 1);
  }
  // right-aligned dentist block (drawn at the same top)
  doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.primary)
    .text(`Dr. ${notSpecified(dentist.name)}`, MARGIN, top, { align: 'right', width: W });
  if (dentist.registration_number) {
    doc.fontSize(8).font('Helvetica').fillColor(COLORS.muted)
      .text(`Reg: ${dentist.registration_number}`, MARGIN, doc.y + 1, { align: 'right', width: W });
  }
  const dividerY = Math.max(doc.y, top + 52) + 6;
  doc.moveTo(MARGIN, dividerY).lineTo(MARGIN + W, dividerY).strokeColor(COLORS.hair).lineWidth(1).stroke();
  doc.y = dividerY + 10;
  doc.x = MARGIN;
}

// drawFooter(doc, { label }) — a thin footer line with the doc label + generated date.
function drawFooter(doc, { label = 'Document' }) {
  const W = contentWidth(doc);
  const y = doc.page.height - MARGIN - 14;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + W, y).strokeColor(COLORS.faint).lineWidth(1).stroke();
  doc.fontSize(8).font('Helvetica').fillColor(COLORS.muted)
    .text(`${label} · Generated ${new Date().toISOString().split('T')[0]}`, MARGIN, y + 4, { width: W, align: 'center' });
}

module.exports = { A4, MARGIN, COLORS, contentWidth, notSpecified, fetchLogoBuffer, drawHeader, drawFooter };
