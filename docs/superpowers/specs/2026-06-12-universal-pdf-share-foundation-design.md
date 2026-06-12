# Universal PDF + Native Share Foundation — Design

**Date:** 2026-06-12
**Status:** Approved (design)
**Sub-project 1 of 3** in the "Complete Lab Prescription + Universal PDF & Share System" initiative.
Sub-project 2 = Lab Prescription module (AI voice → structured lab order). Sub-project 3 = AI Prescription Safety Review layer. Both depend on this foundation and are out of scope here.

## Goal

Every clinical document in the app — **Case Sheet, Prescription, Invoice/Statement, Lab Prescription** — can be **Viewed**, **Downloaded** as a professional PDF, and **Shared** through the device's native OS share sheet, via **one consistent UI** and **one shared, production-grade code path**. No screen has bespoke export behavior.

Hard requirement from the user: **consistent, production-level backend integration with no errors.** Concretely: shared helpers (no copy-paste per doc), a single error-handling path, every PDF route auth-guarded and clinic-scoped, and each generator verified to emit a valid PDF before we call it done.

## Non-goals (this sub-project)

- Lab Prescription AI extraction, prompt, and review screen → **Sub-project 2**. The foundation only reserves the registry slot + endpoint pattern so SP2 plugs in cleanly.
- AI Prescription Safety Review → **Sub-project 3**.
- No redesign of existing document *content* beyond routing it through the shared branding header.

## Decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| PDF engine | **Extend `pdfkit`** (already in use; no headless-Chrome dependency; runs on Render free tier). |
| Native share | **Add `@capacitor/share` + `@capacitor/filesystem`** for a true OS share sheet; `cap sync`. |
| Native view/preview | **Add `@capacitor-community/file-opener`** — Android WebView has no PDF renderer, so "View" opens the OS default PDF viewer on both platforms (consistent). |
| Clinic branding | **Add now**: `logo_url` + `registration_number` on clinic, `registration_number` on dentist, logo upload, settings UI. |
| Invoice model | **Per-patient statement** (charges + payments + balance), assembled server-side from `payments` + treatment-plan costs. There is no invoice DB entity. |

## Architecture — three thin layers

### A. Backend PDF layer — `backend/src/services/pdf/`

```
pdf/
  branding.js          # shared A4 setup, margins, fonts, palette, clinic header + footer, "Not Specified" helper
  prescription.pdf.js  # refactor of existing generatePrescriptionPdf onto branding.js
  caseSheet.pdf.js      # new
  invoice.pdf.js        # new (patient statement)
  index.js             # registry: { docType -> generator(data) -> Buffer }  (lab slot added in SP2)
```

- `branding.js` exports `drawHeader(doc, { clinic, dentist })`, `drawFooter(doc, { meta })`, plus page constants (`A4`, margins, colors, font registration). Every generator calls these so all four documents share an identical frame.
- Each generator is a pure function `generateXPdf(data) -> Promise<Buffer>`. No req/res inside; routes own HTTP.
- `index.js` maps a `docType` string to its generator so routes and tests share one entry point.

**Branding data fetch:** a small `pdf/branding.data.js` (or reuse an existing clinic repo) loads `{ clinic, dentist }` for the requesting clinic once per render. Missing fields render **"Not Specified"** — never blank, never invented.

### B. Frontend export utility — `dentai-app/lib/documents/`

```
documents/
  registry.js   # { docType -> { endpoint(id), filename(patientName, date), title } }
  export.js     # fetchDocBlob, viewDocument, shareDocument, downloadDocument
```

- `fetchDocBlob(docType, id)` → `apiClient.get(endpoint, { responseType: 'blob' })` (Bearer auth attached). Single fetch path for all docs.
- `viewDocument(blob, filename)` — native: write to `Filesystem` cache → `FileOpener.open(uri, 'application/pdf')` (OS preview); web: `URL.createObjectURL` + `window.open`, revoke after timeout.
- `shareDocument({ blob, filename, title, text })` — see §2.
- `downloadDocument(blob, filename)` — native: `Filesystem.writeFile` to `Documents` + toast with location; web: anchor-download.
- One try/catch contract: every function resolves to `{ ok: true }` or throws a typed error the UI maps to a single toast. No per-screen error strings.

### C. Consistent UI — `components/ui/DocumentActions.jsx`

- Renders the **PDF icon** (→ `viewDocument`) and **Share icon** (→ `shareDocument`) intended for the **top-right** of any document screen/sheet header.
- Props: `{ docType, id, patientName, disabled }`. It pulls `endpoint/filename/title` from `registry.js`, so a screen never wires URLs by hand.
- Internal `busy` state disables both icons during a fetch and shows a spinner on the active one.
- Exported from `components/ui/index.js` alongside the other primitives.

## 2. Native share (the piece that makes WhatsApp work)

Install `@capacitor/share` + `@capacitor/filesystem` + `@capacitor-community/file-opener`; run `npx cap sync`.

Flow in `shareDocument`:
1. Already have the **authed blob** (not a URL — see "existing bug" below).
2. `Capacitor.isNativePlatform()`:
   - **Native:** blob → base64 → `Filesystem.writeFile({ path: filename, data, directory: Directory.Cache })` → `Share.share({ files: [uri], title, text })` → real OS sheet (WhatsApp, Email, Drive, Telegram, Messages, AirDrop).
   - **Web/desktop:** `navigator.canShare({ files })` → `navigator.share({ files })`; else WhatsApp deep-link (`wa.me/<patientPhone>`) or anchor-download fallback.
3. Swallow `AbortError` (user dismissed the sheet); any real failure → one toast.

**Existing bug this fixes:** `PrescriptionSheet.printPrescription` currently calls `navigator.share({ url: pdfUrl })` where `pdfUrl` is an **auth-protected** backend route. External recipients (lab, patient) get a 401 — the file never opens. Sharing the file **bytes** fixes this. The `app/checkout/[id]/CheckoutClient.jsx` `sharePrescription` already proves the blob→File→share pattern on web; the foundation generalizes it and adds the true-native path.

## 3. Clinic branding additions

- **Migration:** `clinics.logo_url text`, `clinics.registration_number text`, `staff.registration_number text` (dentist reg no). Nullable; backfilled as null.
- **Logo upload:** endpoint reusing `storage.service` + Supabase storage (mirrors x-ray/photo upload); returns a `logo_url`. Settings UI in `AccountSettingsSheet` for logo + both registration numbers.
- **Validators:** extend `updateClinic` with `logoUrl`, `registrationNumber`; add `registrationNumber` to the staff update schema.

## 4. Data sources & endpoints per document

All PDF routes follow one pattern: `auth` middleware, clinic-scoped data load, `200 application/pdf` stream with `Content-Disposition: inline; filename="<name>"`, and a typed error on failure.

| Doc | Endpoint | Data source |
|---|---|---|
| Prescription | `GET /api/prescriptions/:id/pdf` *(exists — refactor onto branding)* | prescription row |
| Case Sheet | `GET /api/patients/:id/case-sheet/pdf` *(new)* | existing `getPatientCaseSheet` aggregate (patient, plans, visits, Rx, x-rays, labs, summary) |
| Invoice/Statement | `GET /api/patients/:id/statement/pdf` *(new)* | assembled from `payments` + treatment-plan costs for that patient |
| Lab Prescription | `GET /api/lab-orders/:id/pdf` *(SP2)* | lab order row (registry slot reserved here) |

## 5. Filenames & verification

- Filename: `<DocType>_<PatientName>_<YYYY-MM-DD>.pdf`, sanitized (`/\s+/ → _`, strip non-filename chars).
- **Backend verification (automated):** a node script renders each generator to a Buffer with representative fixture data and asserts (a) buffer begins with `%PDF`, (b) non-trivial length, (c) key strings present (patient name, clinic name, a section header). Run in CI-style before sign-off — same approach used to verify the Gemini paths.
- **Native share (manual gate):** `@capacitor/share` cannot be unit-tested headlessly; verified on a real device/emulator. Web share path is testable via a `navigator.share` mock.
- **Auth check:** confirm each PDF route 401s without a token and 200s with one; confirm the shared file opens for an external recipient (the bug fix).

## 6. Error handling contract (production-level)

- Backend: generators throw typed `AppError`s (`PDF_RENDER_FAILED`, `NOT_FOUND`); routes pass to the existing error middleware → standard `{ success, error }` envelope. No raw 500 HTML.
- Frontend: `export.js` functions throw a normalized error; `DocumentActions` maps any failure to a single toast ("Couldn't generate the PDF" / "Couldn't share"). No screen invents its own copy.
- A document that is still generating (e.g., prescription not yet persisted) yields a clear "still generating…" toast, not a crash.

## 7. Rollout / files touched

**Backend:** `services/pdf/*` (new dir), `routes/prescriptions.routes.js` (refactor), `routes/patients.routes.js` (+case-sheet/pdf, +statement/pdf), migration, `validators/index.js`, clinic/staff repos, logo upload route.
**Frontend:** `lib/documents/*` (new), `components/ui/DocumentActions.jsx` (new) + export, wire into `PrescriptionSheet`, case-sheet view, `BillSheet`, `AccountSettingsSheet`; `package.json` (+3 Capacitor plugins: share, filesystem, file-opener) + `cap sync`.

## 8. Risks

- **Render free tier memory:** pdfkit is light; fine. (Avoiding Puppeteer is the reason.)
- **Logo image format:** pdfkit supports PNG/JPEG only. Upload validates/normalizes to one of these.
- **Native rebuild required:** adding Capacitor plugins means the APK must be rebuilt (`cap sync` + native build) before native share works; web build is unaffected.
