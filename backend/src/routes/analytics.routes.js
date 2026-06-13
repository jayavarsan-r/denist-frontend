const router = require('express').Router();
const auth = require('../middleware/auth');
const supabase = require('../config/supabase');
const { ok } = require('../utils/response');

// Dashboard is CLINIC-wide: every staff member (doctor + receptionist) sees the same
// numbers. dentist_id scoping applies only to pre-clinic accounts.
const scoped = (q, req) =>
  (req.clinicId ? q.eq('clinic_id', req.clinicId) : q.eq('dentist_id', req.dentistId));

router.get('/dashboard', auth, async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [{ data: appts }, { data: visits }, { data: followups }, { data: recentAppts }] = await Promise.all([
      scoped(supabase.from('appointments').select('status'), req)
        .eq('appointment_date', today),
      scoped(supabase.from('visits').select('id'), req)
        .eq('visit_date', today),
      scoped(supabase.from('visits').select('*, patients(id, name, phone)'), req)
        .lte('follow_up_date', today)
        .eq('follow_up_done', false)
        .not('follow_up_date', 'is', null),
      scoped(supabase.from('appointments').select('*, patients(id, name, phone)'), req)
        .order('appointment_date', { ascending: false })
        .order('appointment_time', { ascending: false })
        .limit(5),
    ]);

    return ok(res, {
      totalAppointmentsToday: appts?.length || 0,
      upcomingToday: appts?.filter(a => a.status === 'scheduled').length || 0,
      completedToday: visits?.length || 0,
      pendingFollowUps: followups?.length || 0,
      followups: followups || [],
      recentAppointments: recentAppts || [],
    });
  } catch (e) { next(e); }
});

// GET /api/analytics/lab-turnaround — avg days SENT→RECEIVED per lab, last 90 days.
// Backed by the lab_turnaround_stats() SQL function (migration 018).
router.get('/lab-turnaround', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return ok(res, []);
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase.rpc('lab_turnaround_stats', {
      p_clinic_id: req.clinicId,
      p_since: since,
    });
    if (error) throw error;
    return ok(res, data || []);
  } catch (e) { next(e); }
});

// GET /api/analytics/medicine-spend — value of stock dispensed at checkout this month.
router.get('/medicine-spend', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return ok(res, { total_dispensed: 0, month: null });
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('stock_movements')
      .select('qty, inventory_items(price_per_unit)')
      .eq('clinic_id', req.clinicId)
      .eq('direction', 'out')
      .eq('reason', 'dispensed_checkout')
      .gte('created_at', monthStart.toISOString());
    if (error) throw error;

    const total = (data || []).reduce(
      (sum, m) => sum + Number(m.qty) * Number(m.inventory_items?.price_per_unit || 0),
      0,
    );
    return ok(res, { total_dispensed: total, month: monthStart.toISOString() });
  } catch (e) { next(e); }
});

// GET /api/analytics/eod-log — recent end-of-day summaries (from notification_logs).
router.get('/eod-log', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return ok(res, []);
    const limit = Math.min(Number(req.query.limit) || 7, 30);
    const { data, error } = await supabase
      .from('notification_logs')
      .select('id, payload, status, sent_at, created_at')
      .eq('clinic_id', req.clinicId)
      .eq('type', 'eod_summary')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;

    const rows = (data || []).map((r) => ({
      id: r.id,
      summary: r.payload?.components?.[0] || '',
      status: r.status,
      at: r.sent_at || r.created_at,
    }));
    return ok(res, rows);
  } catch (e) { next(e); }
});

module.exports = router;
