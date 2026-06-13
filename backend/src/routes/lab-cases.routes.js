const router = require('express').Router();
const fs = require('fs');
const multer = require('multer');
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const requireClinic = require('../middleware/requireClinic');
const requireClinicOwnership = require('../middleware/requireClinicOwnership');
const validate = require('../middleware/validate');
const v = require('../validators');
const { transitionLabCase, generateCaseCode } = require('../services/lab-case.service');
const storageService = require('../services/storage.service');
const audit = require('../services/audit.service');

// The NEW lab case tracker (Phase 4) — completely separate from the legacy
// /api/lab-orders routes, which stay untouched for backward compat.
router.use(auth, requireClinic);

const upload = multer({ dest: '/tmp/dental-uploads', limits: { fileSize: 20 * 1024 * 1024 } });

const CASE_SELECT = '*, labs(id, name, phone_numbers, preferred_language, automation_paused), patients(id, name, phone)';

// GET /api/lab-cases — list. ?status=, ?lab_id=, ?patient_id=, ?open=true
router.get('/', async (req, res, next) => {
  try {
    let q = supabase.from('lab_cases').select(CASE_SELECT)
      .eq('clinic_id', req.clinicId)
      .order('created_at', { ascending: false }).limit(200);
    if (req.query.status) q = q.eq('status', req.query.status);
    if (req.query.lab_id) q = q.eq('lab_id', req.query.lab_id);
    if (req.query.patient_id) q = q.eq('patient_id', req.query.patient_id);
    if (req.query.open === 'true') q = q.not('status', 'in', '(FITTED,CANCELLED)');
    const { data, error } = await q;
    if (error) throw error;
    res.json({ cases: data || [] });
  } catch (e) { next(e); }
});

// POST /api/lab-cases — create (DRAFT unless send_now)
router.post('/', validate(v.createLabCase), async (req, res, next) => {
  try {
    const b = req.body;
    const caseCode = await generateCaseCode(req.clinicId);
    const { data, error } = await supabase.from('lab_cases').insert({
      clinic_id: req.clinicId,
      lab_id: b.labId || null,
      patient_id: b.patientId,
      visit_id: b.visitId || null,
      treatment_plan_id: b.treatmentPlanId || null,
      case_code: caseCode,
      case_type: b.caseType,
      tooth_fdi: b.toothFdi || [],
      shade: b.shade || null,
      instructions: b.instructions || null,
      expected_date: b.expectedDate || null,
      status: 'DRAFT',
      created_by: req.staffId || null,
    }).select(CASE_SELECT).single();
    if (error) throw error;

    audit.log({ clinicId: req.clinicId, staffId: req.staffId, requestId: req.id,
      action: 'CREATE', entityType: 'lab_case', entityId: data.id, metadata: { caseCode, caseType: b.caseType } });

    // send_now: straight to SENT (requires a lab) — fires the WhatsApp + timeouts.
    if (b.sendNow && data.lab_id) {
      const sent = await transitionLabCase(data.id, 'SENT', 'reception_manual', null, req.clinicId);
      return res.status(201).json({ case: { ...data, ...sent } });
    }
    res.status(201).json({ case: data });
  } catch (e) { next(e); }
});

// GET /api/lab-cases/:id — detail with events timeline + files + messages
router.get('/:id', requireClinicOwnership('lab_cases'), async (req, res, next) => {
  try {
    const [caseRes, eventsRes, filesRes, messagesRes] = await Promise.all([
      supabase.from('lab_cases').select(CASE_SELECT).eq('id', req.params.id).single(),
      supabase.from('lab_case_events').select('*').eq('lab_case_id', req.params.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('lab_case_files').select('*').eq('lab_case_id', req.params.id).order('created_at', { ascending: false }),
      supabase.from('lab_messages').select('*').eq('lab_case_id', req.params.id).order('created_at', { ascending: false }).limit(50),
    ]);
    if (caseRes.error) throw caseRes.error;

    const files = await Promise.all((filesRes.data || []).map(async (f) => {
      let url = null;
      try { url = await storageService.getSignedUrl('lab-docs', f.storage_path, 3600); } catch { /* bucket may not exist yet */ }
      return { ...f, url };
    }));

    res.json({
      case: caseRes.data,
      events: eventsRes.data || [],
      files,
      messages: messagesRes.data || [],
    });
  } catch (e) { next(e); }
});

// PATCH /api/lab-cases/:id — details only (shade/instructions/expected_date/lab)
router.patch('/:id', requireClinicOwnership('lab_cases'), validate(v.updateLabCase), async (req, res, next) => {
  try {
    const b = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (b.labId !== undefined) updates.lab_id = b.labId;
    if (b.shade !== undefined) updates.shade = b.shade;
    if (b.instructions !== undefined) updates.instructions = b.instructions;
    if (b.expectedDate !== undefined) updates.expected_date = b.expectedDate;
    if (b.toothFdi !== undefined) updates.tooth_fdi = b.toothFdi;
    const { data, error } = await supabase.from('lab_cases')
      .update(updates).eq('id', req.params.id).eq('clinic_id', req.clinicId)
      .select(CASE_SELECT).single();
    if (error) throw error;
    res.json({ case: data });
  } catch (e) { next(e); }
});

// PATCH /api/lab-cases/:id/status — manual status change (reception is always
// able to move a case, forward or backward — the unbreakable manual tracker).
router.patch('/:id/status', requireClinicOwnership('lab_cases'), validate(v.labCaseStatus), async (req, res, next) => {
  try {
    const updated = await transitionLabCase(req.params.id, req.body.status, 'reception_manual', null, req.clinicId);
    res.json({ case: updated });
  } catch (e) {
    if (String(e.message).startsWith('invalid_transition')) return res.status(409).json({ error: e.message });
    next(e);
  }
});

// POST /api/lab-cases/:id/files — upload impression/shade/result photos
router.post('/:id/files', requireClinicOwnership('lab_cases'), upload.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const { storagePath } = await storageService.uploadFile(
      req.file.path, 'lab-docs', `${req.clinicId}/${req.params.id}/${Date.now()}`);
    try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
    const { data, error } = await supabase.from('lab_case_files').insert({
      lab_case_id: req.params.id, clinic_id: req.clinicId,
      storage_path: storagePath, kind: req.body.kind || 'impression_photo', source: 'clinic_upload',
    }).select().single();
    if (error) throw error;
    res.status(201).json({ file: data });
  } catch (e) {
    if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch { /* ignore */ } }
    next(e);
  }
});

// DELETE /api/lab-cases/:id — soft cancel
router.delete('/:id', requireClinicOwnership('lab_cases'), async (req, res, next) => {
  try {
    const updated = await transitionLabCase(req.params.id, 'CANCELLED', 'reception_manual', null, req.clinicId);
    res.json({ case: updated });
  } catch (e) { next(e); }
});

module.exports = router;
