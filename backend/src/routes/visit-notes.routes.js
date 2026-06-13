const express = require('express');
const router = express.Router({ mergeParams: true });
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const requireClinicOwnership = require('../middleware/requireClinicOwnership');

// Every route here operates on /api/visits/:visitId/notes — the visit must belong to
// the caller's clinic (404 on mismatch, never revealing the visit exists elsewhere).
router.use(auth, requireClinicOwnership('visits', 'visitId'));

router.get('/', async (req, res, next) => {
  try {
    // No dentist_id filter: notes on a clinic's visit are visible to ALL its staff
    // (the visit itself was clinic-ownership-checked above). Filtering by dentist_id
    // here hid colleagues' notes on shared patients.
    const { data, error } = await supabase
      .from('visit_notes')
      .select('*')
      .eq('visit_id', req.params.visitId)
      .order('note_number', { ascending: true });

    if (error) throw error;
    res.json({ notes: data || [] });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const {
      patientId, rawTranscript, structuredNote, procedureName,
      toothNumber, status, notes, medications, nextSteps, followUpDate, cost,
      audioStoragePath, audioFileSizeKb, audioDurationSec,
    } = req.body;

    const { count } = await supabase
      .from('visit_notes')
      .select('id', { count: 'exact', head: true })
      .eq('visit_id', req.params.visitId);

    const row = {
      visit_id: req.params.visitId,
      patient_id: patientId,
      dentist_id: req.dentistId,
      note_number: (count || 0) + 1,
      raw_transcript: rawTranscript || null,
      structured_note: structuredNote || null,
      procedure_name: procedureName || null,
      tooth_number: toothNumber || null,
      status: status || 'completed',
      notes: notes || null,
      medications: medications || null,
      next_steps: nextSteps || null,
      follow_up_date: followUpDate || null,
      cost: cost ? parseFloat(cost) : null,
      audio_storage_path: audioStoragePath || null,
      audio_file_size_kb: audioFileSizeKb || null,
      audio_duration_sec: audioDurationSec || null,
      audio_uploaded_at: audioStoragePath ? new Date().toISOString() : null,
    };

    // Stamp clinic_id (column added in migration 016) — retry without it on a
    // pre-migration DB so note creation never hard-fails on schema drift.
    let { data, error } = await supabase.from('visit_notes')
      .insert({ ...row, clinic_id: req.clinicId || null }).select().single();
    if (error && /column|schema|does not exist/i.test(error.message || '')) {
      ({ data, error } = await supabase.from('visit_notes').insert(row).select().single());
    }

    if (error) throw error;
    res.status(201).json({ note: data });
  } catch (err) { next(err); }
});

module.exports = router;
