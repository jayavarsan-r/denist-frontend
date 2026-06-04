const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { ok, fail } = require('../utils/response');

// GET /api/staff — all active staff in this clinic
router.get('/', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return fail(res, 403, 'FORBIDDEN', 'No clinic context');
    const { data, error } = await supabase
      .from('staff')
      .select('id, name, phone, role, status, created_at')
      .eq('clinic_id', req.clinicId)
      .eq('status', 'active')
      .order('role').order('name');
    if (error) throw error;
    return ok(res, { staff: data || [] });
  } catch (e) { next(e); }
});

// GET /api/staff/me
router.get('/me', auth, async (req, res, next) => {
  try {
    if (!req.staffId) return fail(res, 404, 'NOT_FOUND', 'No staff record');
    const { data, error } = await supabase
      .from('staff')
      .select('id, name, phone, role, status, clinic_id, created_at')
      .eq('id', req.staffId).single();
    if (error) throw error;
    return ok(res, { staff: data });
  } catch (e) { next(e); }
});

// PATCH /api/staff/:id — doctor only
router.patch('/:id', auth, requireRole(['doctor']), async (req, res, next) => {
  try {
    if (!req.clinicId) return fail(res, 403, 'FORBIDDEN', 'No clinic context');
    const { name, role } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (role !== undefined && ['doctor', 'receptionist'].includes(role)) updates.role = role;
    if (Object.keys(updates).length === 0) return fail(res, 400, 'VALIDATION_ERROR', 'No valid fields to update');
    const { data, error } = await supabase.from('staff').update(updates)
      .eq('id', req.params.id).eq('clinic_id', req.clinicId).select().single();
    if (error) throw error;
    if (!data) return fail(res, 404, 'NOT_FOUND', 'Staff member not found');
    return ok(res, { staff: data });
  } catch (e) { next(e); }
});

// DELETE /api/staff/:id — doctor only (deactivates, does not hard delete)
router.delete('/:id', auth, requireRole(['doctor']), async (req, res, next) => {
  try {
    if (!req.clinicId) return fail(res, 403, 'FORBIDDEN', 'No clinic context');
    if (req.params.id === req.staffId) return fail(res, 400, 'VALIDATION_ERROR', 'Cannot deactivate yourself');
    const { data, error } = await supabase.from('staff').update({ status: 'inactive' })
      .eq('id', req.params.id).eq('clinic_id', req.clinicId).select().single();
    if (error) throw error;
    if (!data) return fail(res, 404, 'NOT_FOUND', 'Staff member not found');
    return ok(res, { success: true });
  } catch (e) { next(e); }
});

module.exports = router;
