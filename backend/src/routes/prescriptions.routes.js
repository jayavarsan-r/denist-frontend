const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const { extractPrescription } = require('../services/ai.service');
const { generatePrescriptionPdf } = require('../services/pdf');
const { loadBrandingContext } = require('../services/pdf/branding.data');
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

router.post('/', auth, async (req, res, next) => {
  try {
    const { patientId, visitId, visitNoteId, rawVoice, medicines, instructions } = req.body;

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

    if (error || !rx) return res.status(404).json({ error: 'Prescription not found' });

    const { clinic, dentist } = await loadBrandingContext(req);
    const pdfBuffer = await generatePrescriptionPdf({
      patient: rx.patients || { name: 'Patient', age: null, gender: null, phone: '' },
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

router.get('/:id', auth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('prescriptions')
      .select(`*, patients(name, age, gender, phone), dentists(name, clinic_name, phone)`)
      .eq('id', req.params.id)
      .eq('dentist_id', req.dentistId)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Prescription not found' });
    res.json({ prescription: data });
  } catch (err) { next(err); }
});

module.exports = router;
