# Universal PDF + Native Share Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every clinical document (Case Sheet, Prescription, Invoice/Statement) viewable, downloadable as a branded PDF, and shareable through the device's native OS share sheet, via one shared backend PDF layer and one shared frontend export utility + UI.

**Architecture:** Backend `pdfkit` generators all render through a shared `branding.js` header/footer and are reached via consistent `GET …/pdf` auth-guarded routes. Frontend fetches the authed PDF blob and routes it through one `export.js` util (native: Filesystem + Share/FileOpener; web: navigator.share/anchor) surfaced by a single `<DocumentActions>` component.

**Tech Stack:** Node/Express, pdfkit, Supabase, Jest+supertest; Next.js (static export) + Capacitor (`@capacitor/share`, `@capacitor/filesystem`, `@capacitor-community/file-opener`); Zustand.

**Spec:** `docs/superpowers/specs/2026-06-12-universal-pdf-share-foundation-design.md`

**Scope note:** Lab Prescription generator/route and the Safety Review layer are explicitly out of scope (sub-projects 2 & 3). This plan reserves the registry slot for Lab but does not implement it.

**Conventions in this repo to follow:**
- Backend errors: `next(err)`; routes are thin, services are pure. Migrations are numbered SQL files in `backend/migrations/` applied manually to Supabase (latest is `010`).
- Clinic scoping: patient/case-sheet/payments queries are clinic-scoped via `req.clinicId` (OR legacy `dentist_id`). New routes reuse those scoped queries.
- Frontend services live in `dentai-app/lib/services/`; shared UI in `dentai-app/components/ui/` (one component per file, re-exported from `index.js`).
- Filenames: `<DocType>_<PatientName>_<YYYY-MM-DD>.pdf`, sanitized.

---

## Phase 0 — Capacitor plugins & dependencies

### Task 0.1: Install native share/file plugins

**Files:**
- Modify: `dentai-app/package.json`

- [ ] **Step 1: Install the three plugins (versions must match installed @capacitor/core major)**

Run from `dentai-app/`:
```bash
npm install @capacitor/share @capacitor/filesystem @capacitor-community/file-opener
```

- [ ] **Step 2: Verify they resolve and core major matches**

Run:
```bash
node -e "console.log('core', require('@capacitor/core/package.json').version); console.log('share', require('@capacitor/share/package.json').version); console.log('filesystem', require('@capacitor/filesystem/package.json').version); console.log('file-opener', require('@capacitor-community/file-opener/package.json').version)"
```
Expected: all print versions; `@capacitor/share` and `@capacitor/filesystem` major version equals `@capacitor/core` major. If a peer-dep mismatch error appears, install the matching major (e.g. `@capacitor/share@<major>`).

- [ ] **Step 3: Sync native projects (non-fatal if native folders absent in this checkout)**

Run:
```bash
npx cap sync || echo "cap sync skipped (no native platform added here) — must run before APK build"
```
Expected: either syncs `ios/`+`android/`, or prints the skip note. Either is acceptable for web dev; the APK build pipeline (`npm run build:mobile`) runs `cap sync`.

- [ ] **Step 4: Commit**
```bash
git add dentai-app/package.json dentai-app/package-lock.json
git commit -m "chore: add capacitor share, filesystem, file-opener plugins"
```

---

## Phase 1 — Backend: branding helper + PDF registry + prescription refactor

### Task 1.1: DB migration for clinic/dentist branding fields

**Files:**
- Create: `backend/migrations/011_pdf_branding.sql`

- [ ] **Step 1: Write the migration**
```sql
-- 011_pdf_branding.sql — branding fields for PDF document headers.
-- Apply in Supabase SQL editor (migrations are applied manually in this project).
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS registration_number text;
ALTER TABLE staff   ADD COLUMN IF NOT EXISTS registration_number text;
```

- [ ] **Step 2: Apply to Supabase**

Apply the SQL via the Supabase dashboard SQL editor (this repo has no automated runner). Verify:
```sql
select column_name from information_schema.columns
where table_name='clinics' and column_name in ('logo_url','registration_number');
```
Expected: both rows returned.

- [ ] **Step 3: Commit**
```bash
git add backend/migrations/011_pdf_branding.sql
git commit -m "feat(db): add clinic/dentist branding columns for PDFs"
```

### Task 1.2: Shared PDF branding helper

**Files:**
- Create: `backend/src/services/pdf/branding.js`
- Test: `backend/src/services/pdf/__tests__/branding.test.js`

- [ ] **Step 1: Write the failing test**
```js
const PDFDocument = require('pdfkit');
const { A4, MARGIN, COLORS, notSpecified, drawHeader, drawFooter, contentWidth } = require('../branding');

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
```

- [ ] **Step 2: Run, expect fail**

Run: `cd backend && npx jest src/services/pdf/__tests__/branding.test.js`
Expected: FAIL — `Cannot find module '../branding'`.

- [ ] **Step 3: Implement `branding.js`**
```js
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
```

- [ ] **Step 4: Run, expect pass**

Run: `cd backend && npx jest src/services/pdf/__tests__/branding.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add backend/src/services/pdf/branding.js backend/src/services/pdf/__tests__/branding.test.js
git commit -m "feat(pdf): shared branding header/footer helper"
```

### Task 1.3: Branding context loader (dedupe clinic/dentist fetch)

**Files:**
- Create: `backend/src/services/pdf/branding.data.js`
- Test: `backend/src/services/pdf/__tests__/branding.data.test.js`

- [ ] **Step 1: Write the failing test (mocks supabase)**
```js
jest.mock('../../../config/supabase', () => {
  const rows = {
    clinics: { id: 'c1', name: 'Acme Dental', address: '12 MG Rd', phone: '044-1', registration_number: 'KA-9' },
    staff: { name: 'Dr Rao', registration_number: 'D-1', clinics: { name: 'Acme Dental', address: '12 MG Rd', phone: '044-1', registration_number: 'KA-9' } },
  };
  const make = (table) => ({
    select() { return this; }, eq() { return this; },
    single: async () => ({ data: rows[table], error: null }),
  });
  return { from: (t) => make(t) };
});
const { loadBrandingContext } = require('../branding.data');

test('loads clinic + dentist branding from req', async () => {
  const ctx = await loadBrandingContext({ clinicId: 'c1', staffId: 's1' });
  expect(ctx.clinic.name).toBe('Acme Dental');
  expect(ctx.dentist.name).toBe('Dr Rao');
  expect(ctx.dentist.registration_number).toBe('D-1');
});
```

- [ ] **Step 2: Run, expect fail**

Run: `cd backend && npx jest src/services/pdf/__tests__/branding.data.test.js`
Expected: FAIL — `Cannot find module '../branding.data'`.

- [ ] **Step 3: Implement `branding.data.js`**
```js
// backend/src/services/pdf/branding.data.js
// Loads the { clinic, dentist } branding block for the requesting user. One query path
// reused by every PDF route so headers are identical and we never duplicate the fetch.
const supabase = require('../../config/supabase');

async function loadBrandingContext(req) {
  let clinic = {};
  let dentist = {};
  if (req.staffId) {
    const { data: staff } = await supabase
      .from('staff')
      .select('name, registration_number, clinics(name, address, phone, registration_number, logo_url)')
      .eq('id', req.staffId)
      .single();
    if (staff) {
      dentist = { name: staff.name, registration_number: staff.registration_number };
      if (staff.clinics) clinic = staff.clinics;
    }
  }
  if ((!clinic || !clinic.name) && req.clinicId) {
    const { data: c } = await supabase
      .from('clinics')
      .select('name, address, phone, registration_number, logo_url')
      .eq('id', req.clinicId)
      .single();
    if (c) clinic = c;
  }
  return { clinic: clinic || {}, dentist: dentist || {} };
}

module.exports = { loadBrandingContext };
```

- [ ] **Step 4: Run, expect pass**

Run: `cd backend && npx jest src/services/pdf/__tests__/branding.data.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/src/services/pdf/branding.data.js backend/src/services/pdf/__tests__/branding.data.test.js
git commit -m "feat(pdf): shared branding context loader"
```

### Task 1.4: Refactor prescription generator onto branding + move into pdf/

**Files:**
- Create: `backend/src/services/pdf/prescription.pdf.js`
- Test: `backend/src/services/pdf/__tests__/prescription.test.js`
- Modify: `backend/src/services/pdf.service.js` (re-export for back-compat)

- [ ] **Step 1: Write the failing test**
```js
const { generatePrescriptionPdf } = require('../prescription.pdf');

test('renders a valid PDF containing patient + medicine', async () => {
  const buf = await generatePrescriptionPdf({
    patient: { name: 'Ravi Kumar', age: 34, gender: 'Male' },
    clinic: { name: 'Acme Dental', address: '12 MG Rd', phone: '044-1' },
    dentist: { name: 'Dr Rao' },
    date: '2026-06-12',
    medicines: [{ name: 'Amoxicillin', dose: '500 mg', frequency: 'Three times daily', meal_timing_slots: { breakfast: true, lunch: true, dinner: true } }],
    instructions: 'Rinse with warm salt water.',
    followUp: 'Review in 5 days',
  });
  expect(buf.slice(0, 5).toString()).toBe('%PDF-');
  expect(buf.length).toBeGreaterThan(1000);
});

test('empty medicines renders without throwing', async () => {
  const buf = await generatePrescriptionPdf({ patient: { name: 'X' }, clinic: {}, dentist: {}, date: '2026-06-12', medicines: [], instructions: '', followUp: null });
  expect(buf.slice(0, 5).toString()).toBe('%PDF-');
});
```

- [ ] **Step 2: Run, expect fail**

Run: `cd backend && npx jest src/services/pdf/__tests__/prescription.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `prescription.pdf.js`** (ports the existing layout body, but takes `{ patient, clinic, dentist, ... }` and renders the shared header/footer; the medicine table/`deriveSlots` body is copied verbatim from the current `pdf.service.js` lines 55–132)
```js
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
```

- [ ] **Step 4: Run, expect pass**

Run: `cd backend && npx jest src/services/pdf/__tests__/prescription.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Keep old import path working (back-compat shim)**

Replace the body of `backend/src/services/pdf.service.js` with a re-export so existing requires keep working during the route refactor:
```js
// backend/src/services/pdf.service.js — moved into ./pdf/. Kept as a thin re-export so
// existing `require('../services/pdf.service')` callers do not break.
module.exports = require('./pdf/prescription.pdf');
```

- [ ] **Step 6: Run full backend suite**

Run: `cd backend && npx jest`
Expected: PASS (existing tests + new pdf tests).

- [ ] **Step 7: Commit**
```bash
git add backend/src/services/pdf/prescription.pdf.js backend/src/services/pdf/__tests__/prescription.test.js backend/src/services/pdf.service.js
git commit -m "refactor(pdf): prescription generator onto shared branding"
```

### Task 1.5: Case-sheet & invoice generators + registry

**Files:**
- Create: `backend/src/services/pdf/caseSheet.pdf.js`
- Create: `backend/src/services/pdf/invoice.pdf.js`
- Create: `backend/src/services/pdf/index.js`
- Test: `backend/src/services/pdf/__tests__/caseSheet.test.js`
- Test: `backend/src/services/pdf/__tests__/invoice.test.js`

- [ ] **Step 1: Write failing tests**
```js
// __tests__/caseSheet.test.js
const { generateCaseSheetPdf } = require('../caseSheet.pdf');
test('renders case sheet PDF with patient + sections', async () => {
  const buf = await generateCaseSheetPdf({
    clinic: { name: 'Acme Dental' }, dentist: { name: 'Dr Rao' }, date: '2026-06-12',
    caseSheet: {
      patient: { name: 'Ravi Kumar', age: 34, gender: 'Male', phone: '9876543210' },
      visits: [{ visit_date: '2026-06-01', procedure_name: 'Scaling', cost: 1500 }],
      prescriptions: [{ created_at: '2026-06-01', medicines: [{ name: 'Amoxicillin' }] }],
      allTreatmentPlans: [{ procedure_name: 'RCT', status: 'active', estimated_cost: 6000 }],
      summary: { totalBilled: 1500, totalCollected: 1000, pendingAmount: 500 },
    },
  });
  expect(buf.slice(0, 5).toString()).toBe('%PDF-');
  expect(buf.length).toBeGreaterThan(1000);
});

// __tests__/invoice.test.js
const { generateStatementPdf } = require('../invoice.pdf');
test('renders patient statement PDF with balance', async () => {
  const buf = await generateStatementPdf({
    clinic: { name: 'Acme Dental' }, dentist: { name: 'Dr Rao' }, date: '2026-06-12',
    patient: { name: 'Ravi Kumar', phone: '9876543210' },
    payments: [{ payment_date: '2026-06-01', amount: 1000, payment_method: 'cash' }],
    plans: [{ procedure_name: 'RCT', estimated_cost: 6000 }],
  });
  expect(buf.slice(0, 5).toString()).toBe('%PDF-');
  expect(buf.length).toBeGreaterThan(900);
});
```

- [ ] **Step 2: Run, expect fail**

Run: `cd backend && npx jest src/services/pdf/__tests__/caseSheet.test.js src/services/pdf/__tests__/invoice.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `caseSheet.pdf.js`**
```js
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
```

- [ ] **Step 4: Implement `invoice.pdf.js`**
```js
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
```

- [ ] **Step 5: Implement registry `index.js`**
```js
// backend/src/services/pdf/index.js — single entry point mapping docType → generator.
// Lab generator is added here in sub-project 2.
const { generatePrescriptionPdf } = require('./prescription.pdf');
const { generateCaseSheetPdf } = require('./caseSheet.pdf');
const { generateStatementPdf } = require('./invoice.pdf');

const generators = {
  prescription: generatePrescriptionPdf,
  caseSheet: generateCaseSheetPdf,
  statement: generateStatementPdf,
};

module.exports = { generators, generatePrescriptionPdf, generateCaseSheetPdf, generateStatementPdf };
```

- [ ] **Step 6: Run, expect pass**

Run: `cd backend && npx jest src/services/pdf`
Expected: PASS (all pdf tests).

- [ ] **Step 7: Commit**
```bash
git add backend/src/services/pdf/caseSheet.pdf.js backend/src/services/pdf/invoice.pdf.js backend/src/services/pdf/index.js backend/src/services/pdf/__tests__/caseSheet.test.js backend/src/services/pdf/__tests__/invoice.test.js
git commit -m "feat(pdf): case-sheet + patient-statement generators and registry"
```

---

## Phase 2 — Backend: routes + branding settings

### Task 2.1: Refactor prescription PDF route onto branding context

**Files:**
- Modify: `backend/src/routes/prescriptions.routes.js` (the `GET /:id/pdf` handler, ~lines 58–105)

- [ ] **Step 1: Replace the handler body** — keep the rx fetch + 404, swap the doctor block for `loadBrandingContext`, and pass `{ clinic, dentist }`:
```js
const { generatePrescriptionPdf } = require('../services/pdf');
const { loadBrandingContext } = require('../services/pdf/branding.data');
// ...
router.get('/:id/pdf', auth, async (req, res, next) => {
  try {
    const { data: rx, error } = await supabase
      .from('prescriptions')
      .select('*, patients(name, age, gender, phone)')
      .eq('id', req.params.id)
      .eq('dentist_id', req.dentistId)
      .single();
    if (error || !rx) return res.status(404).json({ error: 'Prescription not found' });

    const { clinic, dentist } = await loadBrandingContext(req);
    const pdfBuffer = await generatePrescriptionPdf({
      patient: rx.patients || { name: 'Patient' },
      clinic, dentist,
      date: new Date().toISOString().split('T')[0],
      medicines: rx.medicines || [],
      instructions: rx.instructions || '',
      followUp: rx.follow_up || null,
    });

    const fname = `Prescription_${(rx.patients?.name || 'patient').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fname}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (e) { next(e); }
});
```

- [ ] **Step 2: Smoke the route compiles**

Run: `cd backend && node -e "require('./src/routes/prescriptions.routes'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**
```bash
git add backend/src/routes/prescriptions.routes.js
git commit -m "refactor(api): prescription PDF route uses shared branding context"
```

### Task 2.2: Case-sheet & statement PDF routes

**Files:**
- Modify: `backend/src/routes/patients.routes.js` (add two routes near the existing `/:id/case-sheet`)
- Test: `backend/src/routes/__tests__/pdf-routes.test.js`

- [ ] **Step 1: Write failing supertest (auth required + 200 PDF)** — follow the existing supertest setup used by other route tests; mock auth + supabase to return a patient. (If no route-test harness exists yet, assert via a direct handler import instead.) Minimal version:
```js
const request = require('supertest');
// Reuse the app factory the other tests use; if the project exports `app` from server, import it.
// This test asserts the routes are registered and require auth.
const app = require('../../app') || require('../../server');
test('case-sheet pdf requires auth', async () => {
  const res = await request(app).get('/api/patients/00000000-0000-0000-0000-000000000000/case-sheet/pdf');
  expect([401, 403]).toContain(res.status);
});
```
> If the app is not exported for supertest, skip this file and rely on the buffer-level generator tests (Task 1.5) + the manual auth check in Phase 6. Do not block on harness plumbing.

- [ ] **Step 2: Add the routes** in `patients.routes.js` (reuse the same scoped aggregate the `/:id/case-sheet` JSON route builds; factor the aggregate into a helper if the JSON route has it inline). Add near the case-sheet route:
```js
const { generateCaseSheetPdf, generateStatementPdf } = require('../services/pdf');
const { loadBrandingContext } = require('../services/pdf/branding.data');

// GET /api/patients/:id/case-sheet/pdf
router.get('/:id/case-sheet/pdf', async (req, res, next) => {
  try {
    const caseSheet = await buildCaseSheet(req.params.id, req); // same data the JSON route returns
    if (!caseSheet || !caseSheet.patient) return res.status(404).json({ error: 'Patient not found' });
    const { clinic, dentist } = await loadBrandingContext(req);
    const buf = await generateCaseSheetPdf({ clinic, dentist, date: new Date().toISOString().split('T')[0], caseSheet });
    const fname = `CaseSheet_${(caseSheet.patient.name || 'patient').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fname}"`);
    res.setHeader('Content-Length', buf.length);
    res.send(buf);
  } catch (e) { next(e); }
});

// GET /api/patients/:id/statement/pdf
router.get('/:id/statement/pdf', async (req, res, next) => {
  try {
    const scope = (q) => (req.clinicId ? q.or(`clinic_id.eq.${req.clinicId},dentist_id.eq.${req.dentistId}`) : q.eq('dentist_id', req.dentistId));
    const { data: patient } = await supabase.from('patients').select('name, phone').eq('id', req.params.id).maybeSingle();
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    const [{ data: payments }, { data: plans }] = await Promise.all([
      supabase.from('payments').select('payment_date, amount, payment_method').eq('patient_id', req.params.id).order('payment_date', { ascending: false }),
      scope(supabase.from('treatment_plans').select('procedure_name, estimated_cost').eq('patient_id', req.params.id)),
    ]);
    const { clinic, dentist } = await loadBrandingContext(req);
    const buf = await generateStatementPdf({ clinic, dentist, date: new Date().toISOString().split('T')[0], patient, payments: payments || [], plans: plans || [] });
    const fname = `Statement_${(patient.name || 'patient').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fname}"`);
    res.setHeader('Content-Length', buf.length);
    res.send(buf);
  } catch (e) { next(e); }
});
```
> `buildCaseSheet(id, req)`: if the existing `/:id/case-sheet` JSON handler builds the aggregate inline, extract it into a module-level `async function buildCaseSheet(patientId, req) { … return { patient, allTreatmentPlans, visits, prescriptions, xrays, labOrders, summary }; }` and call it from both the JSON route and the PDF route (DRY). Place these PDF routes AFTER `router.use(auth)` and BEFORE `router.get('/:id', …)` so `/:id` doesn't swallow them.

- [ ] **Step 3: Smoke compile**

Run: `cd backend && node -e "require('./src/routes/patients.routes'); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 4: Run jest**

Run: `cd backend && npx jest`
Expected: PASS (skipped harness test is acceptable).

- [ ] **Step 5: Commit**
```bash
git add backend/src/routes/patients.routes.js backend/src/routes/__tests__/pdf-routes.test.js
git commit -m "feat(api): case-sheet + statement PDF routes (clinic-scoped, auth)"
```

### Task 2.3: Clinic/dentist branding settings (logo upload + reg numbers)

**Files:**
- Modify: `backend/src/validators/index.js` (`updateClinic`, staff update schema)
- Modify: `backend/src/routes/clinic.routes.js` (persist `logoUrl`, `registrationNumber`; add logo upload route)

- [ ] **Step 1: Extend validators** — add to `updateClinic`: `logoUrl: z.string().url().optional()`, `registrationNumber: z.string().max(64).optional()`; add `registrationNumber: z.string().max(64).optional()` to the staff update schema.

- [ ] **Step 2: Persist in PATCH /api/clinic** — in the existing handler add:
```js
if (logoUrl !== undefined) updates.logo_url = logoUrl;
if (registrationNumber !== undefined) updates.registration_number = registrationNumber;
```
(destructure `logoUrl, registrationNumber` from `req.body`).

- [ ] **Step 3: Logo upload route** — reuse the existing `storage.service` + multer pattern used by x-ray/photo upload. Add to `clinic.routes.js`:
```js
const multer = require('multer');
const storage = require('../services/storage.service');
const upload = multer({ dest: '/tmp/dental-uploads', limits: { fileSize: 5 * 1024 * 1024 } });

// POST /api/clinic/logo — upload clinic logo (PNG/JPEG), returns { logoUrl }
router.post('/logo', auth, requireRole('doctor'), upload.single('logo'), async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    if (!req.file) return res.status(400).json({ error: 'No logo file (field name "logo")' });
    const ct = (req.file.mimetype || '').toLowerCase();
    if (!ct.includes('png') && !ct.includes('jpeg') && !ct.includes('jpg')) return res.status(400).json({ error: 'Logo must be PNG or JPEG' });
    const uploaded = await storage.uploadFile(req.file.path, 'clinic-logos', `${req.clinicId}/logo`);
    const url = await storage.getPublicUrl ? await storage.getPublicUrl('clinic-logos', uploaded.storagePath) : uploaded.publicUrl;
    await supabase.from('clinics').update({ logo_url: url }).eq('id', req.clinicId);
    res.json({ logoUrl: url });
  } catch (e) { next(e); }
});
```
> Match the actual `storage.service` API used elsewhere (check `uploadFile`/`getPublicUrl`/signed-url helpers in `backend/src/services/storage.service.js` and use the same calls the x-ray upload uses). The logo bucket must be public-read (or store a long-lived signed URL) so the PDF generator's `axios.get(logo_url)` can fetch it.

- [ ] **Step 4: Smoke compile**

Run: `cd backend && node -e "require('./src/routes/clinic.routes'); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 5: Commit**
```bash
git add backend/src/routes/clinic.routes.js backend/src/validators/index.js
git commit -m "feat(api): clinic logo upload + registration-number settings"
```

---

## Phase 3 — Frontend: shared export utility

### Task 3.1: Document registry

**Files:**
- Create: `dentai-app/lib/documents/registry.js`

- [ ] **Step 1: Implement**
```js
// dentai-app/lib/documents/registry.js
// One place that knows each document's PDF endpoint, filename, and share title.
// docType ∈ 'prescription' | 'caseSheet' | 'statement'  (lab added in SP2).
function sanitize(name) { return String(name || 'patient').trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '_') || 'patient'; }
function today() { return new Date().toISOString().split('T')[0]; }

export const DOCUMENTS = {
  prescription: { endpoint: (id) => `/api/prescriptions/${id}/pdf`, label: 'Prescription', title: 'Prescription' },
  caseSheet:    { endpoint: (id) => `/api/patients/${id}/case-sheet/pdf`, label: 'Case Sheet', title: 'Case Sheet' },
  statement:    { endpoint: (id) => `/api/patients/${id}/statement/pdf`, label: 'Statement', title: 'Statement' },
};

export function docFilename(docType, patientName) {
  const d = DOCUMENTS[docType];
  return `${(d?.label || 'Document').replace(/\s+/g, '')}_${sanitize(patientName)}_${today()}.pdf`;
}
```

- [ ] **Step 2: Commit**
```bash
git add dentai-app/lib/documents/registry.js
git commit -m "feat(docs): document registry (endpoints + filenames)"
```

### Task 3.2: Export utility (fetch / view / share / download)

**Files:**
- Create: `dentai-app/lib/documents/export.js`
- Test: `dentai-app/lib/documents/__tests__/export.web.test.js` (jsdom; web path only — native path is device-gated)

- [ ] **Step 1: Implement `export.js`**
```js
// dentai-app/lib/documents/export.js
import { apiClient } from '@/lib/api/client';
import { Capacitor } from '@capacitor/core';
import { DOCUMENTS, docFilename } from './registry';

export async function fetchDocBlob(docType, id) {
  const def = DOCUMENTS[docType];
  if (!def) throw new Error(`Unknown document type: ${docType}`);
  const res = await apiClient.get(def.endpoint(id), { responseType: 'blob' });
  return res.data; // Blob (application/pdf)
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result).split(',')[1]); // strip data: prefix
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

// Write to the device cache and return a file URI (native only).
async function writeCache(blob, filename) {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const data = await blobToBase64(blob);
  const { uri } = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
  return uri;
}

export async function viewDocument(blob, filename) {
  if (Capacitor.isNativePlatform()) {
    const uri = await writeCache(blob, filename);
    const { FileOpener } = await import('@capacitor-community/file-opener');
    await FileOpener.open({ filePath: uri, contentType: 'application/pdf' });
    return;
  }
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function shareDocument({ blob, filename, title, text, fallbackPhone }) {
  if (Capacitor.isNativePlatform()) {
    const uri = await writeCache(blob, filename);
    const { Share } = await import('@capacitor/share');
    await Share.share({ title, text, files: [uri] });
    return;
  }
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title, text });
    return;
  }
  const phone = (fallbackPhone || '').replace(/\D/g, '').slice(-10);
  window.open(phone ? `https://wa.me/91${phone}` : 'https://wa.me/', '_blank');
}

export async function downloadDocument(blob, filename) {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const data = await blobToBase64(blob);
    await Filesystem.writeFile({ path: filename, data, directory: Directory.Documents });
    return { dir: 'Documents' };
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return { dir: 'downloads' };
}

export { docFilename };
```

- [ ] **Step 2: Write the web-path test** (mock `@capacitor/core` → `isNativePlatform: () => false`; mock `apiClient`)
```js
/** @jest-environment jsdom */
jest.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
jest.mock('@/lib/api/client', () => ({ apiClient: { get: jest.fn(async () => ({ data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }) })) } }));
import { fetchDocBlob } from '../export';

test('fetchDocBlob returns a blob from the registry endpoint', async () => {
  const blob = await fetchDocBlob('prescription', 'rx1');
  expect(blob).toBeInstanceOf(Blob);
});
test('fetchDocBlob rejects unknown type', async () => {
  await expect(fetchDocBlob('nope', 'x')).rejects.toThrow(/Unknown document type/);
});
```

- [ ] **Step 3: Run, expect pass**

Run: `cd dentai-app && npx jest lib/documents/__tests__/export.web.test.js`
Expected: PASS. (If jest isn't configured in `dentai-app`, run from repo root jest config, or mark this test as the web-verification artifact and verify via the running app instead — do not block.)

- [ ] **Step 4: Commit**
```bash
git add dentai-app/lib/documents/export.js dentai-app/lib/documents/__tests__/export.web.test.js
git commit -m "feat(docs): shared fetch/view/share/download export utility"
```

---

## Phase 4 — Frontend: DocumentActions component

### Task 4.1: DocumentActions

**Files:**
- Create: `dentai-app/components/ui/DocumentActions.jsx`
- Modify: `dentai-app/components/ui/index.js`

- [ ] **Step 1: Implement**
```jsx
'use client';
import { useState } from 'react';
import Icon from '@/components/icons';
import { useAppStore } from '@/store/useAppStore';
import { fetchDocBlob, viewDocument, shareDocument, docFilename } from '@/lib/documents/export';
import { DOCUMENTS } from '@/lib/documents/registry';

// Consistent top-right PDF + Share actions for every document screen.
// Props: { docType, id, patientName, patientPhone, disabled }
export default function DocumentActions({ docType, id, patientName, patientPhone, disabled }) {
  const showToast = useAppStore((s) => s.showToast);
  const [busy, setBusy] = useState(null); // 'view' | 'share' | null
  const def = DOCUMENTS[docType];

  const run = async (kind) => {
    if (busy || disabled || !id) { if (!id) showToast('Still generating…'); return; }
    setBusy(kind);
    try {
      const blob = await fetchDocBlob(docType, id);
      const filename = docFilename(docType, patientName);
      if (kind === 'view') await viewDocument(blob, filename);
      else await shareDocument({ blob, filename, title: def?.title || 'Document', text: `${def?.title || 'Document'}${patientName ? ' — ' + patientName : ''}`, fallbackPhone: patientPhone });
    } catch (e) {
      if (e?.name !== 'AbortError') showToast(kind === 'view' ? "Couldn't open the PDF" : "Couldn't share");
    } finally { setBusy(null); }
  };

  const Btn = ({ kind, name }) => (
    <button onClick={() => run(kind)} disabled={!!busy || disabled} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10, background: 'rgba(60,60,67,0.06)', color: 'var(--accent)', opacity: busy && busy !== kind ? 0.4 : 1 }}>
      {busy === kind
        ? <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(0,0,0,0.2)', borderTopColor: 'var(--accent)', animation: 'spin .7s linear infinite' }} />
        : <Icon name={name} size={19} />}
    </button>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Btn kind="view" name="fileText" />
      <Btn kind="share" name="share" />
    </div>
  );
}
```
> Verify `Icon` names: use existing icons for a document/PDF glyph and a share glyph. Check `dentai-app/components/icons` for the available names (e.g. `fileText`, `file`, `share`, `shareIos`). Substitute the closest existing names; do not invent icon names.

- [ ] **Step 2: Export it**

Add to `dentai-app/components/ui/index.js`:
```js
export { default as DocumentActions } from './DocumentActions';
```

- [ ] **Step 3: Parse-check**

Run: `cd dentai-app && node -e "require('./node_modules/next/dist/compiled/babel/parser.js').parse(require('fs').readFileSync('components/ui/DocumentActions.jsx','utf8'),{sourceType:'module',plugins:['jsx']}); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 4: Commit**
```bash
git add dentai-app/components/ui/DocumentActions.jsx dentai-app/components/ui/index.js
git commit -m "feat(ui): consistent DocumentActions (PDF + Share)"
```

---

## Phase 5 — Wire DocumentActions into the document screens

### Task 5.1: Prescription sheet

**Files:**
- Modify: `dentai-app/components/sheets/PrescriptionSheet.jsx`

- [ ] **Step 1:** Import `DocumentActions` and render it in the `SheetHeader` right slot, keyed by the saved prescription id. Replace the ad-hoc `printPrescription` (the `navigator.share({ url })` bug) so Print/Share both go through `DocumentActions` once an `rxId` exists. Keep "Save" creating the rx; after save, pass that id to `DocumentActions`.
```jsx
import { DocumentActions } from '@/components/ui';
// in render header:
<SheetHeader title="Prescription" onClose={onClose}
  right={<DocumentActions docType="prescription" id={existing?.id || savedRxId} patientName={p?.name} patientPhone={p?.phone} />} />
```
Add a `const [savedRxId, setSavedRxId] = useState(existing?.id || null)` and `setSavedRxId(result.id || result.prescription_id)` inside `save()`. Remove `getPrescriptionPdfUrl` usage.

- [ ] **Step 2: Parse-check + commit**
```bash
cd dentai-app && node -e "require('./node_modules/next/dist/compiled/babel/parser.js').parse(require('fs').readFileSync('components/sheets/PrescriptionSheet.jsx','utf8'),{sourceType:'module',plugins:['jsx']}); console.log('ok')"
git add dentai-app/components/sheets/PrescriptionSheet.jsx
git commit -m "feat(rx): prescription sheet uses DocumentActions (fixes share-of-401-url)"
```

### Task 5.2: Case sheet + statement entry points

**Files:**
- Modify: `dentai-app/app/patients/[id]/PatientProfileClient.jsx` (Overview header or an actions row)

- [ ] **Step 1:** Add a `DocumentActions` for the case sheet (and statement) on the patient profile. Place a small actions row under the patient header:
```jsx
import { DocumentActions } from '@/components/ui';
// near the patient header:
<div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Case sheet</span>
  <DocumentActions docType="caseSheet" id={p.id} patientName={p.name} patientPhone={p.phone} />
  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Statement</span>
  <DocumentActions docType="statement" id={p.id} patientName={p.name} patientPhone={p.phone} />
</div>
```

- [ ] **Step 2: Parse-check + commit**
```bash
cd dentai-app && node -e "require('./node_modules/next/dist/compiled/babel/parser.js').parse(require('fs').readFileSync('app/patients/[id]/PatientProfileClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']}); console.log('ok')"
git add "dentai-app/app/patients/[id]/PatientProfileClient.jsx"
git commit -m "feat(patient): case-sheet + statement export actions"
```

### Task 5.3: Clinic branding settings UI

**Files:**
- Modify: `dentai-app/components/sheets/AccountSettingsSheet.jsx`
- Modify: `dentai-app/lib/services/clinic.service.js` (or wherever clinic update lives) — add `updateClinicLogo(file)` + pass `logoUrl`/`registrationNumber` through the existing clinic update.

- [ ] **Step 1:** Add a logo file input + two text fields (clinic registration number, dentist registration number) in the clinic section of `AccountSettingsSheet`, wired to the clinic update service. Logo upload posts multipart to `POST /api/clinic/logo`:
```js
export async function uploadClinicLogo(file) {
  const fd = new FormData();
  fd.append('logo', file);
  const { data } = await apiClient.post('/api/clinic/logo', fd);
  return data; // { logoUrl }
}
```

- [ ] **Step 2: Parse-check + commit**
```bash
git add dentai-app/components/sheets/AccountSettingsSheet.jsx dentai-app/lib/services/clinic.service.js
git commit -m "feat(settings): clinic logo upload + registration numbers"
```

---

## Phase 6 — Verification

### Task 6.1: Backend PDF + auth verification

- [ ] **Step 1: All generators render valid PDFs**

Run: `cd backend && npx jest src/services/pdf`
Expected: PASS (branding, prescription, caseSheet, invoice).

- [ ] **Step 2: Full suite green**

Run: `cd backend && npx jest`
Expected: PASS.

- [ ] **Step 3: Manual auth + content check (server running)**

With the local backend running and a valid token, run:
```bash
curl -s -o /tmp/cs.pdf -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/patients/$PID/case-sheet/pdf
head -c 5 /tmp/cs.pdf   # expect %PDF-
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/patients/$PID/case-sheet/pdf   # expect 401/403 (no token)
```
Expected: `200` + `%PDF-` with token; `401`/`403` without.

### Task 6.2: Native share — on-device gate

- [ ] **Step 1:** Build the APK (`cd dentai-app && npm run build:mobile`), install on a device/emulator.
- [ ] **Step 2:** Open a patient → tap **Share** on Case Sheet → the OS share sheet appears → send to WhatsApp → confirm the PDF arrives and opens for the recipient. Repeat **PDF/view** → confirm the OS PDF preview opens.
- [ ] **Step 3:** This manual pass is the acceptance gate for native sharing (cannot be unit-tested headlessly).

### Task 6.3: Final commit / branch

- [ ] **Step 1:** Ensure all phase commits are present; the foundation is independently shippable (every existing document is now viewable/shareable; Lab slot reserved for SP2).

---

## Self-review notes (gaps surfaced for the implementer)

- **`buildCaseSheet` extraction (Task 2.2):** the existing `/:id/case-sheet` JSON route currently builds its aggregate inline. Extract it to a shared function so the PDF route reuses the exact same data — do not duplicate the query.
- **`storage.service` API (Task 2.3):** confirm the real method names (`uploadFile`, signed vs public URL) against `backend/src/services/storage.service.js` and the x-ray upload usage; the logo URL must be fetchable by the backend (`axios.get`) at render time, so use a public bucket or a long-lived signed URL.
- **Icon names (Task 4.1):** confirm `fileText`/`share` exist in `components/icons`; substitute the nearest real names.
- **dentai-app jest config:** if the frontend has no jest runner, the two web tests are optional — verify those paths via the running app instead; never block the foundation on frontend test plumbing.
- **Prescription route scope:** left as `dentist_id`-scoped (unchanged) to avoid behavior change; case-sheet/statement routes are clinic-scoped to match the rest of the app.
