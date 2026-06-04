const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const validate = require('../middleware/validate');
const v = require('../validators');

// GET /api/clinic
router.get('/', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(404).json({ error: 'No clinic' });
    const { data, error } = await supabase.from('clinics').select('*').eq('id', req.clinicId).single();
    if (error) throw error;
    res.json({ clinic: data });
  } catch (e) { next(e); }
});

// PATCH /api/clinic — clinic settings are doctor/owner managed (not reception)
router.patch('/', auth, requireRole('doctor'), validate(v.updateClinic), async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { name, city, address, phone, openTime, closeTime, workingDays } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (city !== undefined) updates.city = city;
    if (address !== undefined) updates.address = address;
    if (phone !== undefined) updates.phone = phone;
    if (openTime !== undefined) updates.open_time = openTime;
    if (closeTime !== undefined) updates.close_time = closeTime;
    if (workingDays !== undefined) updates.working_days = workingDays;
    if (Object.keys(updates).length === 0) return res.json({ clinic: null });
    const { data, error } = await supabase.from('clinics').update(updates).eq('id', req.clinicId).select().single();
    if (error) throw error;
    res.json({ clinic: data });
  } catch (e) { next(e); }
});

module.exports = router;
