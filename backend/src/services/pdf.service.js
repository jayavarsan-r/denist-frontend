// backend/src/services/pdf.service.js
const PDFDocument = require('pdfkit');

/**
 * Generate a prescription PDF buffer.
 * @param {object} opts
 * @param {object} opts.patient   - { name, age, gender, phone }
 * @param {object} opts.doctor    - { name, clinic_name, city, phone }
 * @param {string} opts.date      - "YYYY-MM-DD"
 * @param {Array}  opts.medicines - PrescriptionMedicine array (may include meal_timing_slots)
 * @param {string} opts.instructions
 * @param {string|null} opts.followUp
 * @returns {Promise<Buffer>}
 */
async function generatePrescriptionPdf({ patient, doctor, date, medicines, instructions, followUp }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width - 80;
    const PRIMARY = '#1C1C1E';
    const MUTED = '#6E6E73';
    const ACCENT = '#007AFF';
    const CHECK = '✓';
    const UNCHECK = '○';

    // ── HEADER ──
    doc.fontSize(18).font('Helvetica-Bold').fillColor(PRIMARY)
      .text(doctor.clinic_name || 'DentAI Clinic', 40, 40);
    doc.fontSize(9).font('Helvetica').fillColor(MUTED)
      .text([doctor.city, doctor.phone].filter(Boolean).join('  ·  '), 40, doc.y + 2);

    doc.fontSize(9).fillColor(MUTED)
      .text(`Date: ${date}`, 40, 40, { align: 'right' });
    doc.fontSize(10).font('Helvetica-Bold').fillColor(PRIMARY)
      .text(`Dr. ${doctor.name || '—'}`, 40, doc.y + 2, { align: 'right' });

    // divider
    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(40 + W, doc.y).strokeColor('#E5E5EA').stroke();
    doc.moveDown(0.4);

    // ── PATIENT INFO ──
    doc.fontSize(10).font('Helvetica-Bold').fillColor(PRIMARY).text('Patient: ', { continued: true });
    doc.font('Helvetica').text(patient.name || '—', { continued: true });
    doc.text(`    Age: ${patient.age ?? '—'} yrs`, { continued: true });
    doc.text(`    Gender: ${patient.gender ?? '—'}`);
    doc.moveDown(0.3);
    doc.moveTo(40, doc.y).lineTo(40 + W, doc.y).strokeColor('#E5E5EA').stroke();
    doc.moveDown(0.6);

    // ── Rx ──
    doc.fontSize(20).font('Helvetica-Bold').fillColor(PRIMARY).text('Rx', 40, doc.y);
    doc.moveDown(0.4);

    if (!medicines || medicines.length === 0) {
      doc.fontSize(10).font('Helvetica').fillColor(MUTED).text('No medicines prescribed.');
    } else {
      // column widths
      const COL = { name: 170, dose: 75, freq: 115, bf: 35, lunch: 42, din: 42 };
      const xBase = 40 + COL.name + COL.dose + COL.freq;

      // header
      const hY = doc.y;
      doc.fontSize(8).font('Helvetica-Bold').fillColor(MUTED);
      doc.text('Medicine',   40,              hY, { width: COL.name });
      doc.text('Dose',       40 + COL.name,   hY, { width: COL.dose });
      doc.text('Frequency',  40 + COL.name + COL.dose, hY, { width: COL.freq });
      doc.text('BF',         xBase,           hY, { width: COL.bf,   align: 'center' });
      doc.text('Lunch',      xBase + COL.bf,  hY, { width: COL.lunch, align: 'center' });
      doc.text('Dinner',     xBase + COL.bf + COL.lunch, hY, { width: COL.din, align: 'center' });

      doc.moveDown(0.2);
      doc.moveTo(40, doc.y).lineTo(40 + W, doc.y).strokeColor('#E5E5EA').stroke();
      doc.moveDown(0.3);

      for (const med of medicines) {
        const slots = med.meal_timing_slots || deriveSlots(med.timing, med.frequency);
        const mY = doc.y;

        doc.fontSize(10).font('Helvetica-Bold').fillColor(PRIMARY)
          .text(med.name || '—', 40, mY, { width: COL.name });
        doc.fontSize(10).font('Helvetica').fillColor(PRIMARY)
          .text(med.dose || '—', 40 + COL.name, mY, { width: COL.dose });
        doc.text(med.frequency || '—', 40 + COL.name + COL.dose, mY, { width: COL.freq });

        doc.fontSize(12).font('Helvetica')
          .fillColor(slots.breakfast ? ACCENT : '#C7C7CC')
          .text(slots.breakfast ? CHECK : UNCHECK, xBase, mY, { width: COL.bf, align: 'center' });
        doc.fillColor(slots.lunch ? ACCENT : '#C7C7CC')
          .text(slots.lunch ? CHECK : UNCHECK, xBase + COL.bf, mY, { width: COL.lunch, align: 'center' });
        doc.fillColor(slots.dinner ? ACCENT : '#C7C7CC')
          .text(slots.dinner ? CHECK : UNCHECK, xBase + COL.bf + COL.lunch, mY, { width: COL.din, align: 'center' });

        if (med.instructions) {
          doc.fontSize(8).font('Helvetica').fillColor(MUTED)
            .text(med.instructions, 40, doc.y + 2, { width: W });
        }
        doc.moveDown(0.5);
        doc.moveTo(40, doc.y).lineTo(40 + W, doc.y).strokeColor('#F2F2F7').stroke();
        doc.moveDown(0.3);
      }
    }

    doc.moveDown(0.6);

    // ── INSTRUCTIONS ──
    if (instructions) {
      doc.moveTo(40, doc.y).lineTo(40 + W, doc.y).strokeColor('#E5E5EA').stroke();
      doc.moveDown(0.4);
      doc.fontSize(9).font('Helvetica-Bold').fillColor(MUTED).text('INSTRUCTIONS');
      doc.fontSize(10).font('Helvetica').fillColor(PRIMARY).text(instructions, { width: W });
      doc.moveDown(0.4);
    }

    if (followUp) {
      doc.fontSize(9).font('Helvetica-Bold').fillColor(MUTED).text('FOLLOW-UP');
      doc.fontSize(10).font('Helvetica').fillColor(PRIMARY).text(followUp, { width: W });
      doc.moveDown(0.6);
    }

    // ── SIGNATURES ──
    doc.moveTo(40, doc.y).lineTo(40 + W, doc.y).strokeColor('#E5E5EA').stroke();
    doc.moveDown(1.5);
    const sigY = doc.y;
    doc.fontSize(9).font('Helvetica').fillColor(MUTED).text("Doctor's Signature", 40, sigY);
    doc.moveTo(40, sigY + 24).lineTo(200, sigY + 24).strokeColor(PRIMARY).lineWidth(0.5).stroke();
    doc.fontSize(9).fillColor(MUTED).text("Patient's Signature", 350, sigY);
    doc.moveTo(350, sigY + 24).lineTo(520, sigY + 24).strokeColor(PRIMARY).lineWidth(0.5).stroke();

    doc.end();
  });
}

function deriveSlots(timing, frequency) {
  const t = (timing || '').toLowerCase();
  const f = (frequency || '').toLowerCase();
  if (t.includes('bedtime') || t.includes('night') || f.includes('night')) {
    return { breakfast: false, lunch: false, dinner: true };
  }
  if (f.includes('three') || f.includes('tds') || f.includes('3x') || f.includes('thrice')) {
    return { breakfast: true, lunch: true, dinner: true };
  }
  if (f.includes('twice') || f.includes('bd') || f.includes('2x')) {
    return { breakfast: true, lunch: false, dinner: true };
  }
  return { breakfast: true, lunch: false, dinner: false };
}

module.exports = { generatePrescriptionPdf };
