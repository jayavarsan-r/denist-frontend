const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const multer = require('multer');
const { uploadFile, getSignedUrl, deleteFile } = require('../services/storage.service');
const fs = require('fs');

const upload = multer({ dest: '/tmp/', limits: { fileSize: 20 * 1024 * 1024 } });

router.post('/', auth, upload.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const { patientId, visitId, xrayType, dateTaken, toothNumber, notes, remarks } = req.body;
    if (!patientId) return res.status(400).json({ error: 'patientId required' });

    const storagePath = `${req.dentistId}/${patientId}/${xrayType || 'OPG'}_${Date.now()}`;
    const { storagePath: savedPath, sizeKb } = await uploadFile(req.file.path, 'xrays', storagePath);

    try { fs.unlinkSync(req.file.path); } catch (_) {}

    const { data, error } = await supabase.from('xrays').insert({
      patient_id: patientId,
      dentist_id: req.dentistId,
      visit_id: visitId || null,
      xray_type: xrayType || 'OPG',
      storage_path: savedPath,
      file_size_kb: sizeKb,
      date_taken: dateTaken || new Date().toISOString().split('T')[0],
      tooth_number: toothNumber || null,
      notes: notes || null,
      remarks: remarks || null,
    }).select().single();

    if (error) throw error;
    res.status(201).json({ xray: data });
  } catch (err) {
    if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch (_) {}
    next(err);
  }
});

router.get('/:id/url', auth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('xrays').select('storage_path')
      .eq('id', req.params.id).eq('dentist_id', req.dentistId).single();

    if (error || !data) return res.status(404).json({ error: 'Not found' });
    const url = await getSignedUrl('xrays', data.storage_path, 3600);
    res.json({ url, expiresIn: 3600 });
  } catch (err) { next(err); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('xrays').select('storage_path')
      .eq('id', req.params.id).eq('dentist_id', req.dentistId).single();

    if (error || !data) return res.status(404).json({ error: 'Not found' });
    await deleteFile('xrays', data.storage_path);
    await supabase.from('xrays').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
