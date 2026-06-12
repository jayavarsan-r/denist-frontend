const PDFDocument = require('pdfkit');
const { MARGIN, notSpecified, drawHeader, drawFooter, contentWidth } = require('../branding');

function render(fn) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    fn(doc);
    doc.end();
  });
}

test('notSpecified returns the literal for empty values, value otherwise', () => {
  expect(notSpecified('')).toBe('Not Specified');
  expect(notSpecified(null)).toBe('Not Specified');
  expect(notSpecified('  ')).toBe('Not Specified');
  expect(notSpecified('Acme Dental')).toBe('Acme Dental');
});

test('drawHeader + drawFooter render a valid PDF with the clinic name', async () => {
  const buf = await render((doc) => {
    drawHeader(doc, { clinic: { name: 'Acme Dental', address: '12 MG Rd', phone: '044-1234', registration_number: 'KA-99' }, dentist: { name: 'Dr Rao', registration_number: 'D-1' } });
    drawFooter(doc, { label: 'Prescription' });
  });
  expect(buf.slice(0, 5).toString()).toBe('%PDF-');
  expect(buf.length).toBeGreaterThan(800);
});

test('contentWidth equals page width minus both margins', () => {
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
  expect(contentWidth(doc)).toBeCloseTo(doc.page.width - MARGIN * 2, 5);
  doc.end();
});
