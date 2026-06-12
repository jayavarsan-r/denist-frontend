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

module.exports = router;
