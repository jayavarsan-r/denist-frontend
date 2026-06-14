/**
 * DentAI — clinic-day AI-run logger (Google Apps Script Web App).
 *
 * Receives the small JSON events posted by src/services/sheets-logger.service.js
 * and maintains ONE row per consultation Draft ID in a Google Sheet:
 *
 *   Draft ID | Success | STT | Gemini | Doctor Edit | Notes | Clinic ID | Updated At
 *
 * A `type:"run"` event (fired when the AI pipeline finishes — success or failure)
 * fills Success / STT / Gemini / Notes. A `type:"verify"` event (fired when the
 * doctor confirms the draft) fills the Doctor Edit column on the same row. Either
 * event creates the row if it doesn't exist yet, so order never matters.
 *
 * ── Setup (≈2 min) ─────────────────────────────────────────────────────────
 *  1. Create a Google Sheet. Note its tab name (default below is "Runs").
 *  2. Extensions → Apps Script. Delete the stub and paste this whole file.
 *  3. Set SHEET_ID below to the spreadsheet id (the long token in its URL), OR
 *     leave it blank to use the active spreadsheet the script is bound to.
 *  4. Deploy → New deployment → type "Web app".
 *       Execute as: Me.   Who has access: Anyone.
 *     (The URL is an unguessable secret; treat it like a webhook secret. To add a
 *      shared-secret check, set SHARED_SECRET and send it as ?token= on the URL.)
 *  5. Copy the Web app URL (…/exec) into the backend env var SHEETS_WEBHOOK_URL.
 *
 * No PHI is ever sent here — only ids, timings, counts, and field NAMES.
 */

var SHEET_ID = '';          // '' = use the bound spreadsheet
var SHEET_NAME = 'Runs';
var SHARED_SECRET = '';     // '' = disabled; otherwise require ?token=SHARED_SECRET

var HEADERS = ['Draft ID', 'Success', 'STT', 'Gemini', 'Doctor Edit', 'Notes', 'Clinic ID', 'Updated At'];
var COL = { draftId: 0, success: 1, stt: 2, gemini: 3, doctorEdit: 4, notes: 5, clinicId: 6, updatedAt: 7 };

function doPost(e) {
  try {
    if (SHARED_SECRET && (!e || !e.parameter || e.parameter.token !== SHARED_SECRET)) {
      return _json({ ok: false, error: 'unauthorized' });
    }
    var p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!p.draftId) return _json({ ok: false, error: 'missing draftId' });

    var lock = LockService.getScriptLock();
    lock.waitLock(15000); // serialize upserts so concurrent runs don't double-insert
    try {
      var sheet = _sheet();
      var rowIndex = _findRow(sheet, p.draftId); // 1-based sheet row, or -1
      var row = rowIndex === -1 ? _blankRow(p.draftId) : _readRow(sheet, rowIndex);

      if (p.type === 'verify') {
        row[COL.doctorEdit] = p.doctorEdited
          ? ('Edited: ' + ((p.editedFields || []).join(', ') || '(fields)'))
          : 'No edits';
      } else { // 'run'
        row[COL.success] = p.success ? 'SUCCESS' : 'FAILED';
        row[COL.stt] = _fmtStt(p.stt);
        row[COL.gemini] = _fmtGemini(p.gemini);
        row[COL.notes] = p.notes || '';
      }
      row[COL.clinicId] = p.clinicId || row[COL.clinicId] || '';
      row[COL.updatedAt] = p.ts || new Date().toISOString();

      if (rowIndex === -1) sheet.appendRow(row);
      else sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([row]);
    } finally {
      lock.releaseLock();
    }
    return _json({ ok: true });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

function _sheet() {
  var ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
  return sheet;
}

function _findRow(sheet, draftId) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var ids = sheet.getRange(2, COL.draftId + 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(draftId)) return i + 2; // +2: skip header + 0-index
  }
  return -1;
}

function _readRow(sheet, rowIndex) {
  return sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0];
}

function _blankRow(draftId) {
  var row = new Array(HEADERS.length).fill('');
  row[COL.draftId] = draftId;
  return row;
}

function _fmtStt(s) {
  if (!s) return '';
  var parts = [];
  if (s.duration != null) parts.push(_round(s.duration) + 's');
  if (s.chunks != null) parts.push(s.chunks + ' chunks' + (s.emptyChunks ? (' (' + s.emptyChunks + ' empty)') : ''));
  if (s.transcriptLength != null) parts.push(s.transcriptLength + ' chars');
  if (s.timeMs != null) parts.push(s.timeMs + 'ms');
  return parts.join(' · ');
}

function _fmtGemini(g) {
  if (!g) return '';
  var parts = [];
  if (g.timeMs != null) parts.push(g.timeMs + 'ms');
  if (g.keyUsed != null) parts.push('key#' + g.keyUsed);
  if (g.salvageUsed) parts.push('salvage');
  if (g.droppedFields) parts.push(g.droppedFields + ' dropped');
  return parts.join(' · ');
}

function _round(n) { return Math.round(Number(n) * 10) / 10; }

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
