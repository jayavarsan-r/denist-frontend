const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const { extractPrescription } = require('../services/ai.service');
const { generatePrescriptionPdf } = require('../services/pdf.service');
<<<<<<< HEAD
const { parsePagination, pageMeta } = require('../utils/pagination');

// GET /api/prescriptions — clinic-scoped list (paginated, optional ?patientId)
router.get('/', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { from, to, page, limit } = parsePagination(req.query);
    let q = supabase.from('prescriptions')
      .select('*, patients(name, phone)', { count: 'exact' })
      .or(`clinic_id.eq.${req.clinicId},dentist_id.eq.${req.dentistId}`)
      .is('deleted_at', null);
    if (req.query.patientId) q = q.eq('patient_id', req.query.patientId);
    q = q.order('created_at', { ascending: false }).range(from, to);
    const { data, error, count } = await q;
    if (error) throw error;
    res.json({ prescriptions: data || [], pagination: pageMeta({ page, limit }, count) });
  } catch (e) { next(e); }
});
=======
const { ok, okCreated, fail } = require('../utils/response');
>>>>>>> origin/main

router.post('/', auth, async (req, res, next) => {
  try {
    const { patientId, visitId, visitNoteId, rawVoice, medicines, instructions } = req.body;
    if (!patientId) return fail(res, 400, 'VALIDATION_ERROR', 'patientId required');

    let extractedMedicines = medicines;
    let extractedInstructions = instructions;
    let extractedFollowUp = null;

    if (rawVoice && (!medicines || medicines.length === 0)) {
      const extracted = await extractPrescription(rawVoice);
      extractedMedicines = extracted.medicines;
      extractedInstructions = extracted.instructions;
      extractedFollowUp = extracted.followUp || null;
    }

    const { data, error } = await supabase.from('prescriptions').insert({
<<<<<<< HEAD
      patient_id: patientId,
      dentist_id: req.dentistId,
      clinic_id: req.clinicId || null,
      visit_id: visitId || null,
      visit_note_id: visitNoteId || null,
      raw_voice: rawVoice || null,
      medicines: extractedMedicines || [],
      instructions: extractedInstructions || null,
      follow_up: extractedFollowUp || null,
    }).select(`*, patients(name, age, gender, phone)`).single();

    if (error) throw error;
    res.status(201).json({ prescription: data });
=======
      patient_id:    patientId,
      dentist_id:    req.dentistId,
      clinic_id:     req.clinicId || null,
      visit_id:      visitId || null,
      visit_note_id: visitNoteId || null,
      raw_voice:     rawVoice || null,
      medicines:     extractedMedicines || [],
      instructions:  extractedInstructions || null,
      follow_up:     extractedFollowUp || null,
    }).select(`*, patients(name, age, gender, phone)`).single();

    if (error) throw error;
    return okCreated(res, { prescription: data });
  } catch (err) { next(err); }
});

// GET /api/prescriptions?patientId= — list prescriptions for a patient
router.get('/', auth, async (req, res, next) => {
  try {
    const { patientId } = req.query;
    if (!patientId) return fail(res, 400, 'VALIDATION_ERROR', 'patientId query param required');
    const { data, error } = await supabase
      .from('prescriptions')
      .select('id, patient_id, created_at, instructions, follow_up, medicines')
      .eq('patient_id', patientId)
      .eq('dentist_id', req.dentistId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ok(res, { prescriptions: data || [] });
>>>>>>> origin/main
  } catch (err) { next(err); }
});

// GET /api/prescriptions/:id/pdf — stream prescription as PDF
router.get('/:id/pdf', auth, async (req, res, next) => {
  try {
    const { data: rx, error } = await supabase
      .from('prescriptions')
      .select('*, patients(name, age, gender, phone)')
      .eq('id', req.params.id)
      .eq('dentist_id', req.dentistId)
      .single();

    if (error || !rx) return fail(res, 404, 'NOT_FOUND', 'Prescription not found');

    let staff = null;
    if (req.staffId) {
      const { data: staffData } = await supabase
        .from('staff')
        .select('name, clinics(name, city)')
        .eq('id', req.staffId)
        .single();
      staff = staffData;
    }

    const doctor = {
      name: staff?.name || 'Doctor',
      clinic_name: staff?.clinics?.name || 'DentAI Clinic',
      city: staff?.clinics?.city || '',
      phone: '',
    };

    const pdfBuffer = await generatePrescriptionPdf({
      patient: rx.patients || { name: 'Patient', age: null, gender: null, phone: '' },
      doctor,
      date: new Date().toISOString().split('T')[0],
      medicines: rx.medicines || [],
      instructions: rx.instructions || '',
      followUp: rx.follow_up || null,
    });

    const patientName = (rx.patients?.name || 'prescription').replace(/\s+/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${patientName}_prescription.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (e) { next(e); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('prescriptions')
      .select(`*, patients(name, age, gender, phone), dentists(name, clinic_name, phone)`)
      .eq('id', req.params.id)
      .eq('dentist_id', req.dentistId)
      .single();

    if (error || !data) return fail(res, 404, 'NOT_FOUND', 'Prescription not found');
    return ok(res, { prescription: data });
  } catch (err) { next(err); }
});

module.exports = router;
