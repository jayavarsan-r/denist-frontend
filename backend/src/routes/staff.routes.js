const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');

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

module.exports = router;
