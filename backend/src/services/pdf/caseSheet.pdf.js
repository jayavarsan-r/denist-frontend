// backend/src/services/pdf/caseSheet.pdf.js
const PDFDocument = require('pdfkit');
const { MARGIN, COLORS, contentWidth, notSpecified, fetchLogoBuffer, drawHeader, drawFooter } = require('./branding');

function section(doc, title) {
  doc.moveDown(0.6);
  doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.muted).text(title.toUpperCase(), MARGIN, doc.y);
  doc.moveTo(MARGIN, doc.y + 1).lineTo(MARGIN + contentWidth(doc), doc.y + 1).strokeColor(COLORS.hair).stroke();
  doc.moveDown(0.3);
}
function line(doc, text) { doc.fontSize(10).font('Helvetica').fillColor(COLORS.primary).text(text, MARGIN, doc.y, { width: contentWidth(doc) }); }
function money(n) { return `₹${Number(n || 0).toLocaleString('en-IN')}`; }

async function generateCaseSheetPdf({ clinic = {}, dentist = {}, date, caseSheet = {} }) {
  const logoBuffer = await fetchLogoBuffer(clinic.logo_url);
  const p = caseSheet.patient || {};
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    drawHeader(doc, { clinic, dentist, logoBuffer });
    doc.fontSize(14).font('Helvetica-Bold').fillColor(COLORS.primary).text('Case Sheet', MARGIN, doc.y);
    doc.fontSize(9).font('Helvetica').fillColor(COLORS.muted).text(`Date: ${date}`, MARGIN, doc.y, { align: 'right', width: contentWidth(doc) });

    section(doc, 'Patient');
    line(doc, `${notSpecified(p.name)}   ·   Age: ${p.age ?? 'Not Specified'}   ·   ${notSpecified(p.gender)}   ·   ${notSpecified(p.phone)}`);

    section(doc, 'Treatment Plans');
    const plans = caseSheet.allTreatmentPlans || [];
    if (!plans.length) line(doc, 'Not Specified');
    else plans.forEach((pl) => line(doc, `• ${notSpecified(pl.procedure_name)} — ${notSpecified(pl.status)} — ${money(pl.estimated_cost)}`));

    section(doc, 'Visits');
    const visits = caseSheet.visits || [];
    if (!visits.length) line(doc, 'Not Specified');
    else visits.forEach((v) => line(doc, `• ${v.visit_date || ''}  ${notSpecified(v.procedure_name)}  ${v.cost != null ? money(v.cost) : ''}`));

    section(doc, 'Prescriptions');
    const rxs = caseSheet.prescriptions || [];
    if (!rxs.length) line(doc, 'Not Specified');
    else rxs.forEach((r) => line(doc, `• ${(r.created_at || '').slice(0, 10)}  ${(Array.isArray(r.medicines) ? r.medicines.map((m) => m.name).filter(Boolean).join(', ') : '') || 'Not Specified'}`));

    const s = caseSheet.summary || {};
    section(doc, 'Summary');
    line(doc, `Billed: ${money(s.totalBilled)}    Collected: ${money(s.totalCollected)}    Pending: ${money(s.pendingAmount)}`);

    drawFooter(doc, { label: 'Case Sheet' });
    doc.end();
  });
}

module.exports = { generateCaseSheetPdf };
