const router = require('express').Router();
const auth = require('../middleware/auth');
const supabase = require('../config/supabase');

router.get('/dashboard', auth, async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [{ data: appts }, { data: visits }, { data: followups }, { data: recentAppts }] = await Promise.all([
      supabase.from('appointments').select('status')
        .eq('dentist_id', req.dentistId).eq('appointment_date', today),
      supabase.from('visits').select('id')
        .eq('dentist_id', req.dentistId).eq('visit_date', today),
      supabase.from('visits').select('*, patients(id, name, phone)')
        .eq('dentist_id', req.dentistId)
        .lte('follow_up_date', today)
        .eq('follow_up_done', false)
        .not('follow_up_date', 'is', null),
      supabase.from('appointments').select('*, patients(id, name, phone)')
        .eq('dentist_id', req.dentistId)
        .order('appointment_date', { ascending: false })
        .order('appointment_time', { ascending: false })
        .limit(5),
    ]);

    res.json({
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
