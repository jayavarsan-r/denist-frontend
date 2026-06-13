const router = require('express').Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const requireClinic = require('../middleware/requireClinic');
const requireClinicOwnership = require('../middleware/requireClinicOwnership');
const validate = require('../middleware/validate');
const v = require('../validators');
const { normalisePhone } = require('../providers/whatsapp');

// The clinic's labs (WhatsApp counterparties for the lab case tracker).
router.use(auth, requireClinic);

router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('labs')
      .select('*').eq('clinic_id', req.clinicId).order('name');
    if (error) throw error;
    res.json({ labs: data || [] });
  } catch (e) { next(e); }
});

router.post('/', validate(v.createLab), async (req, res, next) => {
  try {
    const b = req.body;
    const { data, error } = await supabase.from('labs').insert({
      clinic_id: req.clinicId,
      name: b.name,
      phone_numbers: (b.phoneNumbers || []).map(normalisePhone),
      preferred_language: b.preferredLanguage || 'en',
      default_turnaround_days: b.defaultTurnaroundDays || 5,
      notes: b.notes || null,
      consent_logged_at: b.consentLogged ? new Date().toISOString() : null,
    }).select().single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'lab_already_exists' });
      throw error;
    }
    res.status(201).json({ lab: data });
  } catch (e) { next(e); }
});

router.patch('/:id', requireClinicOwnership('labs'), validate(v.updateLab), async (req, res, next) => {
  try {
    const b = req.body;
    const updates = {};
    if (b.name !== undefined) updates.name = b.name;
    if (b.phoneNumbers !== undefined) updates.phone_numbers = b.phoneNumbers.map(normalisePhone);
    if (b.preferredLanguage !== undefined) updates.preferred_language = b.preferredLanguage;
    if (b.automationPaused !== undefined) updates.automation_paused = b.automationPaused;
    if (b.defaultTurnaroundDays !== undefined) updates.default_turnaround_days = b.defaultTurnaroundDays;
    if (b.notes !== undefined) updates.notes = b.notes;
    if (b.consentLogged) updates.consent_logged_at = new Date().toISOString();
    const { data, error } = await supabase.from('labs')
      .update(updates).eq('id', req.params.id).eq('clinic_id', req.clinicId)
      .select().single();
    if (error) throw error;
    res.json({ lab: data });
  } catch (e) { next(e); }
});

module.exports = router;
