const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');

// GET /api/clinic
router.get('/', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(404).json({ error: 'No clinic' });
    const { data, error } = await supabase.from('clinics').select('*').eq('id', req.clinicId).single();
    if (error) throw error;
    res.json({ clinic: data });
  } catch (e) { next(e); }
});

// PATCH /api/clinic
router.patch('/', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { name, city } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (city !== undefined) updates.city = city;
    const { data, error } = await supabase.from('clinics').update(updates).eq('id', req.clinicId).select().single();
    if (error) throw error;
    res.json({ clinic: data });
  } catch (e) { next(e); }
});

module.exports = router;
