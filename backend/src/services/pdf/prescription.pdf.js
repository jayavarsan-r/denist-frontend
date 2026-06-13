// backend/src/services/pdf/prescription.pdf.js
const PDFDocument = require('pdfkit');
const { MARGIN, COLORS, contentWidth, notSpecified, fetchLogoBuffer, drawHeader, drawFooter } = require('./branding');

function deriveSlots(timing, frequency) {
  const t = (timing || '').toLowerCase();
  const f = (frequency || '').toLowerCase();
  if (t.includes('bedtime') || t.includes('night') || f.includes('night')) return { breakfast: false, lunch: false, dinner: true };
  if (f.includes('three') || f.includes('tds') || f.includes('3x') || f.includes('thrice')) return { breakfast: true, lunch: true, dinner: true };
  if (f.includes('twice') || f.includes('bd') || f.includes('2x')) return { breakfast: true, lunch: false, dinner: true };
  return { breakfast: true, lunch: false, dinner: false };
}

async function generatePrescriptionPdf({ patient = {}, clinic = {}, dentist = {}, date, medicines = [], instructions, followUp }) {
  const logoBuffer = await fetchLogoBuffer(clinic.logo_url);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    drawHeader(doc, { clinic, dentist, logoBuffer });
    const W = contentWidth(doc);
    const CHECK = '✓', UNCHECK = '○';

    // Patient line + date
    doc.fontSize(9).fillColor(COLORS.muted).text(`Date: ${date}`, MARGIN, doc.y, { align: 'right', width: W });
    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.primary).text('Patient: ', MARGIN, doc.y, { continued: true });
    doc.font('Helvetica').text(notSpecified(patient.name), { continued: true });
    doc.text(`    Age: ${patient.age ?? 'Not Specified'}`, { continued: true });
    doc.text(`    Gender: ${notSpecified(patient.gender)}`);
    doc.moveDown(0.3);
    doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + W, doc.y).strokeColor(COLORS.hair).stroke();
    doc.moveDown(0.6);

    doc.fontSize(20).font('Helvetica-Bold').fillColor(COLORS.primary).text('Rx', MARGIN, doc.y);
    doc.moveDown(0.4);

    if (!medicines || medicines.length === 0) {
      doc.fontSize(10).font('Helvetica').fillColor(COLORS.muted).text('No medicines prescribed.');
    } else {
      const COL = { name: 170, dose: 75, freq: 115, bf: 35, lunch: 42, din: 42 };
      const xBase = MARGIN + COL.name + COL.dose + COL.freq;
      const hY = doc.y;
      doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.muted);
      doc.text('Medicine', MARGIN, hY, { width: COL.name });
      doc.text('Dose', MARGIN + COL.name, hY, { width: COL.dose });
      doc.text('Frequency', MARGIN + COL.name + COL.dose, hY, { width: COL.freq });
      doc.text('BF', xBase, hY, { width: COL.bf, align: 'center' });
      doc.text('Lunch', xBase + COL.bf, hY, { width: COL.lunch, align: 'center' });
      doc.text('Dinner', xBase + COL.bf + COL.lunch, hY, { width: COL.din, align: 'center' });
      doc.moveDown(0.2);
      doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + W, doc.y).strokeColor(COLORS.hair).stroke();
      doc.moveDown(0.3);
      for (const med of medicines) {
        const slots = med.meal_timing_slots || deriveSlots(med.timing, med.frequency);
        const mY = doc.y;
        doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.primary).text(med.name || '—', MARGIN, mY, { width: COL.name });
        doc.fontSize(10).font('Helvetica').fillColor(COLORS.primary).text(med.dose || '—', MARGIN + COL.name, mY, { width: COL.dose });
        doc.text(med.frequency || '—', MARGIN + COL.name + COL.dose, mY, { width: COL.freq });
        doc.fontSize(12).fillColor(slots.breakfast ? COLORS.accent : '#C7C7CC').text(slots.breakfast ? CHECK : UNCHECK, xBase, mY, { width: COL.bf, align: 'center' });
        doc.fillColor(slots.lunch ? COLORS.accent : '#C7C7CC').text(slots.lunch ? CHECK : UNCHECK, xBase + COL.bf, mY, { width: COL.lunch, align: 'center' });
        doc.fillColor(slots.dinner ? COLORS.accent : '#C7C7CC').text(slots.dinner ? CHECK : UNCHECK, xBase + COL.bf + COL.lunch, mY, { width: COL.din, align: 'center' });
        if (med.instructions) doc.fontSize(8).font('Helvetica').fillColor(COLORS.muted).text(med.instructions, MARGIN, doc.y + 2, { width: W });
        doc.moveDown(0.5);
        doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + W, doc.y).strokeColor(COLORS.faint).stroke();
        doc.moveDown(0.3);
      }
    }

    doc.moveDown(0.6);
    if (instructions) {
      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.muted).text('INSTRUCTIONS');
      doc.fontSize(10).font('Helvetica').fillColor(COLORS.primary).text(instructions, { width: W });
      doc.moveDown(0.4);
    }
    if (followUp) {
      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.muted).text('FOLLOW-UP');
      doc.fontSize(10).font('Helvetica').fillColor(COLORS.primary).text(followUp, { width: W });
    }
    drawFooter(doc, { label: 'Prescription' });
    doc.end();
  });
}

module.exports = { generatePrescriptionPdf, deriveSlots };
