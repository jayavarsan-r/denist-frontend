const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const validate = require('../middleware/validate');
const v = require('../validators');
const audit = require('../services/audit.service');

// GET /api/staff — all active staff in this clinic
router.get('/', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { data, error } = await supabase
      .from('staff')
      .select('id, name, phone, role, status, created_at')
      .eq('clinic_id', req.clinicId)
      .eq('status', 'active')
      .order('role').order('name');
    if (error) throw error;
    res.json({ staff: data || [] });
  } catch (e) { next(e); }
});

// GET /api/staff/me
router.get('/me', auth, async (req, res, next) => {
  try {
    if (!req.staffId) return res.status(404).json({ error: 'No staff record' });
    const { data, error } = await supabase.from('staff').select('*').eq('id', req.staffId).single();
    if (error) throw error;
    res.json({ staff: data });
  } catch (e) { next(e); }
});

// PATCH /api/staff/:id — update a clinic member (doctor/owner only)
router.patch('/:id', auth, requireRole('doctor'), validate(v.updateStaff), async (req, res, next) => {
  try {
    const updates = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.role !== undefined) updates.role = req.body.role;
    if (req.body.status !== undefined) updates.status = req.body.status;
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No updatable fields' });

    const { data, error } = await supabase.from('staff')
      .update(updates).eq('id', req.params.id).eq('clinic_id', req.clinicId).select().maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Staff not found' });
    audit.fromReq(req, { action: 'ROLE_CHANGE', entityType: 'staff', entityId: req.params.id, metadata: updates });
    res.json({ staff: data });
  } catch (e) { next(e); }
});

// DELETE /api/staff/:id — deactivate a member (doctor/owner only). Cannot remove self.
router.delete('/:id', auth, requireRole('doctor'), async (req, res, next) => {
  try {
    if (req.params.id === req.staffId) return res.status(400).json({ error: 'Cannot deactivate yourself' });
    const { data, error } = await supabase.from('staff')
      .update({ status: 'inactive' }).eq('id', req.params.id).eq('clinic_id', req.clinicId).select().maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Staff not found' });
    audit.fromReq(req, { action: 'DELETE', entityType: 'staff', entityId: req.params.id });
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
