const router = require('express').Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const requireClinic = require('../middleware/requireClinic');
const validate = require('../middleware/validate');
const v = require('../validators');
const { transitionLabCase } = require('../services/lab-case.service');

// Reception inbox — tier 4 of the inbound parser plus timeout alerts. The
// unbreakable floor: anything automation couldn't handle lands here for a human.
router.use(auth, requireClinic);

// GET /api/reception/inbox — unresolved items (newest first)
router.get('/inbox', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('reception_inbox_items')
      .select('*').eq('clinic_id', req.clinicId).eq('resolved', false)
      .order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    res.json({ items: data || [] });
  } catch (e) { next(e); }
});

// PATCH /api/reception/inbox/:id/resolve — mark handled. When the item is an
// unresolved lab message, optionally link it to a case and apply a status in
// the same action (body: { labCaseId?, newStatus? }).
router.patch('/inbox/:id/resolve', validate(v.resolveInboxItem), async (req, res, next) => {
  try {
    const { data: item } = await supabase.from('reception_inbox_items')
      .select('*').eq('id', req.params.id).eq('clinic_id', req.clinicId).maybeSingle();
    if (!item) return res.status(404).json({ error: 'Not found' });

    const { labCaseId, newStatus } = req.body;
    if (labCaseId && item.payload?.messageId) {
      await supabase.from('lab_messages')
        .update({ lab_case_id: labCaseId, parse_tier: 'manual', resolved: true })
        .eq('id', item.payload.messageId).eq('clinic_id', req.clinicId);
    }
    if (labCaseId && newStatus) {
      await transitionLabCase(labCaseId, newStatus, 'reception_manual', item.payload?.messageId || null, req.clinicId);
    }

    const { data, error } = await supabase.from('reception_inbox_items')
      .update({ resolved: true, resolved_by: req.staffId || null, resolved_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('clinic_id', req.clinicId).select().single();
    if (error) throw error;
    res.json({ item: data });
  } catch (e) {
    if (String(e.message).startsWith('invalid_transition')) return res.status(409).json({ error: e.message });
    next(e);
  }
});

module.exports = router;
