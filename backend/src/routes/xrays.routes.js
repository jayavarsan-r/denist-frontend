const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const multer = require('multer');
const { uploadFile, getSignedUrl, deleteFile } = require('../services/storage.service');
const { ok, okCreated, fail } = require('../utils/response');
const fs = require('fs');

const upload = multer({ dest: '/tmp/', limits: { fileSize: 20 * 1024 * 1024 } });

const ALLOWED_XRAY_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/dicom'];

router.post('/', auth, upload.single('file'), async (req, res, next) => {
  if (!req.file) return fail(res, 400, 'VALIDATION_ERROR', 'No file uploaded');
  try {
    const { patientId, visitId, xrayType, dateTaken, toothNumber, notes, remarks } = req.body;
    if (!patientId) return fail(res, 400, 'VALIDATION_ERROR', 'patientId required');

    if (!ALLOWED_XRAY_MIMES.includes(req.file.mimetype)) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return fail(res, 400, 'VALIDATION_ERROR', `Invalid file type. Allowed: ${ALLOWED_XRAY_MIMES.join(', ')}`);
    }

    const storagePath = `${req.dentistId}/${patientId}/${xrayType || 'OPG'}_${Date.now()}`;
    const { storagePath: savedPath, sizeKb } = await uploadFile(req.file.path, 'xrays', storagePath);
    try { fs.unlinkSync(req.file.path); } catch (_) {}

    const { data, error } = await supabase.from('xrays').insert({
<<<<<<< HEAD
      patient_id: patientId,
      dentist_id: req.dentistId,
      clinic_id: req.clinicId || null,
      visit_id: visitId || null,
      xray_type: xrayType || 'OPG',
=======
      patient_id:   patientId,
      dentist_id:   req.dentistId,
      visit_id:     visitId || null,
      xray_type:    xrayType || 'OPG',
>>>>>>> origin/main
      storage_path: savedPath,
      file_size_kb: sizeKb,
      date_taken:   dateTaken || new Date().toISOString().split('T')[0],
      tooth_number: toothNumber || null,
      notes:        notes || null,
      remarks:      remarks || null,
    }).select().single();

    if (error) throw error;
    return okCreated(res, { xray: data });
  } catch (err) {
    if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch (_) {}
    next(err);
  }
});

router.get('/:id/url', auth, async (req, res, next) => {
  try {
    // Clinic-wide access: any staff in the clinic can view an x-ray (a receptionist
    // upload must be visible to the doctor). Match by clinic_id OR dentist_id so both
    // newly clinic-stamped rows and legacy dentist-only rows resolve.
    let q = supabase.from('xrays').select('storage_path').eq('id', req.params.id);
    q = req.clinicId
      ? q.or(`clinic_id.eq.${req.clinicId},dentist_id.eq.${req.dentistId}`)
      : q.eq('dentist_id', req.dentistId);
    const { data, error } = await q.single();

    if (error || !data) return fail(res, 404, 'NOT_FOUND', 'X-ray not found');
    const url = await getSignedUrl('xrays', data.storage_path, 3600);
    return ok(res, { url, expiresIn: 3600 });
  } catch (err) { next(err); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('xrays').select('storage_path')
      .eq('id', req.params.id).eq('dentist_id', req.dentistId).single();

    if (error || !data) return fail(res, 404, 'NOT_FOUND', 'X-ray not found');
    await deleteFile('xrays', data.storage_path);
    await supabase.from('xrays').delete().eq('id', req.params.id);
    return ok(res, { success: true });
  } catch (err) { next(err); }
});

module.exports = router;
