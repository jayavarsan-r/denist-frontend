const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { getSignedUrl } = require('../services/storage.service');
const auth = require('../middleware/auth');

router.get('/stats', auth, async (req, res, next) => {
  try {
    const { data: notes } = await supabase
      .from('visit_notes')
      .select('procedure_name, audio_file_size_kb')
      .eq('dentist_id', req.dentistId)
      .not('audio_storage_path', 'is', null);

    const { data: visits } = await supabase
      .from('visits')
      .select('audio_file_size_kb')
      .eq('dentist_id', req.dentistId)
      .not('audio_storage_path', 'is', null);

    const all = [...(notes || []), ...(visits || [])];
    const totalKb = all.reduce((s, r) => s + (r.audio_file_size_kb || 0), 0);

    const { data: vr } = await supabase.from('voice_recordings').select('recording_type, audio_size_kb').eq('dentist_id', req.dentistId);
    const byType = {};
    (vr || []).forEach(r => {
      byType[r.recording_type] = (byType[r.recording_type] || 0) + 1;
    });

    res.json({
      totalRecordings: all.length,
      totalMb: (totalKb / 1024).toFixed(1),
      fromVisitNotes: notes?.length || 0,
      fromVisits: visits?.length || 0,
      byType,
    });
  } catch (err) { next(err); }
});

router.get('/export', auth, async (req, res, next) => {
  try {
    const { format = 'json', includeUrls = 'false', limit = 500, offset = 0 } = req.query;

    const { data } = await supabase
      .from('visit_notes')
      .select('id, created_at, procedure_name, tooth_number, status, raw_transcript, audio_storage_path, audio_file_size_kb')
      .eq('dentist_id', req.dentistId)
      .not('audio_storage_path', 'is', null)
      .not('raw_transcript', 'is', null)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    const records = await Promise.all((data || []).map(async r => {
      const rec = {
        id: r.id, date: r.created_at?.split('T')[0], procedure: r.procedure_name,
        tooth: r.tooth_number, transcript: r.raw_transcript, audio_path: r.audio_storage_path,
        size_kb: r.audio_file_size_kb, audio_url: null,
      };
      if (includeUrls === 'true' && r.audio_storage_path) {
        try { rec.audio_url = await getSignedUrl('voice-notes', r.audio_storage_path, 86400); } catch (_) {}
      }
      return rec;
    }));

    if (format === 'csv') {
      const lines = [
        'id,date,procedure,tooth,transcript,audio_path,size_kb,audio_url',
        ...records.map(r => [
          r.id, r.date,
          `"${(r.procedure || '').replace(/"/g, '""')}"`,
          r.tooth || '',
          `"${(r.transcript || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
          r.audio_path, r.size_kb || '', r.audio_url || '',
        ].join(',')),
      ].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="dental_dataset_${Date.now()}.csv"`);
      return res.send(lines);
    }

    res.json({ total: records.length, records });
  } catch (err) { next(err); }
});

// GET /api/dataset/recordings — list labelled voice recordings
router.get('/recordings', auth, async (req, res, next) => {
  try {
    const { type, limit = 200, offset = 0 } = req.query;
    let query = supabase
      .from('voice_recordings')
      .select('id, recording_type, transcript, audio_path, audio_size_kb, created_at, patient_id')
      .eq('dentist_id', req.dentistId)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
    if (type) query = query.eq('recording_type', type);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ total: data?.length || 0, recordings: data || [] });
  } catch (err) { next(err); }
});

// GET /api/dataset/recordings/export — CSV/JSON export with signed audio URLs
router.get('/recordings/export', auth, async (req, res, next) => {
  try {
    const { type, format = 'json', includeUrls = 'false', limit = 500, offset = 0 } = req.query;
    let query = supabase
      .from('voice_recordings')
      .select('*')
      .eq('dentist_id', req.dentistId)
      .not('transcript', 'is', null)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
    if (type) query = query.eq('recording_type', type);
    const { data, error } = await query;
    if (error) throw error;

    const records = await Promise.all((data || []).map(async r => {
      const rec = {
        id: r.id, type: r.recording_type, date: r.created_at?.split('T')[0],
        transcript: r.transcript, audio_path: r.audio_path,
        size_kb: r.audio_size_kb, audio_url: null,
      };
      if (includeUrls === 'true' && r.audio_path) {
        try { rec.audio_url = await getSignedUrl('voice-notes', r.audio_path, 86400); } catch (_) {}
      }
      return rec;
    }));

    if (format === 'csv') {
      const lines = [
        'id,type,date,transcript,audio_path,size_kb,audio_url',
        ...records.map(r => [
          r.id, r.type, r.date,
          `"${(r.transcript || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
          r.audio_path || '', r.size_kb || '', r.audio_url || '',
        ].join(',')),
      ].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="voice_dataset_${type || 'all'}_${Date.now()}.csv"`);
      return res.send(lines);
    }
    res.json({ total: records.length, records });
  } catch (err) { next(err); }
});

module.exports = router;
