const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { ok, fail } = require('../utils/response');

// GET /api/clinic
router.get('/', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return fail(res, 404, 'NOT_FOUND', 'No clinic');
    // Exclude join_code from general staff view — only owner should share it explicitly
    const { data, error } = await supabase.from('clinics')
      .select('id, name, city, address, phone, open_time, close_time, working_days, display_id, owner_staff_id')
      .eq('id', req.clinicId).single();
    if (error) throw error;
    return ok(res, { clinic: data });
  } catch (e) { next(e); }
});

// PATCH /api/clinic — doctor only
router.patch('/', auth, requireRole(['doctor']), async (req, res, next) => {
  try {
    if (!req.clinicId) return fail(res, 403, 'FORBIDDEN', 'No clinic context');
    const { name, city, address, phone, openTime, closeTime, workingDays } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (city !== undefined) updates.city = city;
    if (address !== undefined) updates.address = address;
    if (phone !== undefined) updates.phone = phone;
    if (openTime !== undefined) updates.open_time = openTime;
    if (closeTime !== undefined) updates.close_time = closeTime;
    if (workingDays !== undefined) updates.working_days = workingDays;
    if (Object.keys(updates).length === 0) return fail(res, 400, 'VALIDATION_ERROR', 'No valid fields to update');
    const { data, error } = await supabase.from('clinics').update(updates).eq('id', req.clinicId).select().single();
    if (error) throw error;
    return ok(res, { clinic: data });
  } catch (e) { next(e); }
});

// POST /api/clinic/regenerate-join-code — doctor only
// Replaces the side-effect that was previously in GET /api/auth/me
router.post('/regenerate-join-code', auth, requireRole(['doctor']), async (req, res, next) => {
  try {
    if (!req.clinicId) return fail(res, 403, 'FORBIDDEN', 'No clinic context');
    const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data, error } = await supabase.from('clinics')
      .update({ join_code: newCode }).eq('id', req.clinicId)
      .select('join_code').single();
    if (error) throw error;
    return ok(res, { joinCode: data.join_code });
  } catch (e) { next(e); }
});

module.exports = router;
