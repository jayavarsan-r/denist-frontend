const express = require('express');
const router = express.Router({ mergeParams: true });
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');

// Verify the visitId in the URL belongs to the current user before touching notes
async function assertVisitOwnership(req, res) {
  let q = supabase.from('visits').select('id').eq('id', req.params.visitId);
  if (req.clinicId) q = q.eq('clinic_id', req.clinicId);
  else q = q.eq('dentist_id', req.dentistId);
  const { data } = await q.single();
  return !!data;
}

router.get('/', auth, async (req, res, next) => {
  try {
    const owned = await assertVisitOwnership(req, res);
    if (!owned) return res.status(403).json({ error: 'Visit not found or access denied' });

    const { data, error } = await supabase
      .from('visit_notes')
      .select('*')
      .eq('visit_id', req.params.visitId)
      .eq('dentist_id', req.dentistId)
      .order('note_number', { ascending: true });

    if (error) throw error;
    res.json({ notes: data || [] });
  } catch (err) { next(err); }
});

router.post('/', auth, async (req, res, next) => {
  try {
    const owned = await assertVisitOwnership(req, res);
    if (!owned) return res.status(403).json({ error: 'Visit not found or access denied' });

    const {
      patientId, rawTranscript, structuredNote, procedureName,
      toothNumber, status, notes, medications, nextSteps, followUpDate, cost,
      audioStoragePath, audioFileSizeKb, audioDurationSec,
    } = req.body;

    const { count } = await supabase
      .from('visit_notes')
      .select('id', { count: 'exact', head: true })
      .eq('visit_id', req.params.visitId);

    const { data, error } = await supabase.from('visit_notes').insert({
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
    }).select().single();

    if (error) throw error;
    res.status(201).json({ note: data });
  } catch (err) { next(err); }
});

module.exports = router;
