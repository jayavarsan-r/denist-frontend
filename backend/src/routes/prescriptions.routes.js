const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const { extractPrescription } = require('../services/ai.service');
const { generatePrescriptionPdf } = require('../services/pdf.service');

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
      visit_id: visitId || null,
      visit_note_id: visitNoteId || null,
      raw_voice: rawVoice || null,
      medicines: extractedMedicines || [],
      instructions: extractedInstructions || null,
    }).select(`*, patients(name, age, gender, phone)`).single();

    if (error) throw error;
    res.status(201).json({ prescription: { ...data, follow_up: extractedFollowUp } });
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

    // Fetch staff + clinic info for doctor header (only if staffId is available)
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

    if (error || !data) return res.status(404).json({ error: 'Prescription not found' });
    res.json({ prescription: data });
  } catch (err) { next(err); }
});

module.exports = router;
