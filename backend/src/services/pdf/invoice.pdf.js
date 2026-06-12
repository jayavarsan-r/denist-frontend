// backend/src/services/pdf/invoice.pdf.js — patient statement (charges + payments + balance).
const PDFDocument = require('pdfkit');
const { MARGIN, COLORS, contentWidth, notSpecified, fetchLogoBuffer, drawHeader, drawFooter } = require('./branding');

function money(n) { return `₹${Number(n || 0).toLocaleString('en-IN')}`; }

async function generateStatementPdf({ clinic = {}, dentist = {}, date, patient = {}, payments = [], plans = [] }) {
  const logoBuffer = await fetchLogoBuffer(clinic.logo_url);
  const totalCharged = plans.reduce((s, p) => s + (Number(p.estimated_cost) || 0), 0);
  const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const balance = totalCharged - totalPaid;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const W = contentWidth(doc);

    drawHeader(doc, { clinic, dentist, logoBuffer });
    doc.fontSize(14).font('Helvetica-Bold').fillColor(COLORS.primary).text('Statement', MARGIN, doc.y);
    doc.fontSize(9).font('Helvetica').fillColor(COLORS.muted).text(`Date: ${date}`, MARGIN, doc.y, { align: 'right', width: W });
    doc.moveDown(0.4);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.primary).text('Patient: ', { continued: true });
    doc.font('Helvetica').text(`${notSpecified(patient.name)}   ·   ${notSpecified(patient.phone)}`);

    doc.moveDown(0.6);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.muted).text('CHARGES');
    if (!plans.length) doc.font('Helvetica').fillColor(COLORS.primary).text('Not Specified');
    else plans.forEach((p) => doc.font('Helvetica').fillColor(COLORS.primary).text(`${notSpecified(p.procedure_name)}    ${money(p.estimated_cost)}`, { width: W }));

    doc.moveDown(0.4);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.muted).text('PAYMENTS');
    if (!payments.length) doc.font('Helvetica').fillColor(COLORS.primary).text('Not Specified');
    else payments.forEach((p) => doc.font('Helvetica').fillColor(COLORS.primary).text(`${(p.payment_date || '').slice(0, 10)}    ${money(p.amount)}    ${notSpecified(p.payment_method)}`, { width: W }));

    doc.moveDown(0.6);
    doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + W, doc.y).strokeColor(COLORS.hair).stroke();
    doc.moveDown(0.3);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.primary)
      .text(`Total charged: ${money(totalCharged)}     Paid: ${money(totalPaid)}     Balance: ${money(balance)}`, { width: W, align: 'right' });

    drawFooter(doc, { label: 'Statement' });
    doc.end();
  });
}

module.exports = { generateStatementPdf };
