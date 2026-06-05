const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const validate = require('../middleware/validate');
const v = require('../validators');

function makeJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O,0,I,1
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
async function uniqueJoinCode() {
  let code, exists = true;
  while (exists) {
    code = makeJoinCode();
    const { data } = await supabase.from('clinics').select('id').eq('join_code', code).single();
    exists = !!data;
  }
  return code;
}

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

// POST /api/clinic/regenerate-join-code — explicit replacement for the old
// GET /me side-effect. Doctor/owner only.
router.post('/regenerate-join-code', auth, requireRole('doctor'), async (req, res, next) => {
  try {
    const join_code = await uniqueJoinCode();
    const { data, error } = await supabase.from('clinics')
      .update({ join_code }).eq('id', req.clinicId).select('id, join_code').single();
    if (error) throw error;
    res.json({ clinic: data });
  } catch (e) { next(e); }
});

module.exports = router;
