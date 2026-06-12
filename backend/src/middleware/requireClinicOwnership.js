const supabase = require('../config/supabase');

// Generic ownership gate for by-id endpoints: verifies the target row belongs to the
// caller's clinic BEFORE the handler runs. Responds 404 on a missing row OR a clinic
// mismatch — never 403, which would reveal that the id exists in another clinic.
// dentist_id matching applies only to pre-clinic accounts (no clinic context) and only
// on tables that have the column (select * so column-less tables like inventory work).
//
//   router.delete('/:id', auth, requireClinicOwnership('xrays'), handler)
//   router.use(auth, requireClinicOwnership('visits', 'visitId'))
module.exports = function requireClinicOwnership(table, idParam = 'id') {
  return async (req, res, next) => {
    try {
      const { data, error } = await supabase.from(table)
        .select('*').eq('id', req.params[idParam]).maybeSingle();
      if (error) throw error;
      const owned = data && (req.clinicId
        ? data.clinic_id === req.clinicId
        : data.dentist_id === req.dentistId);
      if (!owned) return res.status(404).json({ error: 'Not found' });
      next();
    } catch (e) { next(e); }
  };
};
