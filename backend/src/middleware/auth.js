const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');

module.exports = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.dentistId = decoded.dentistId;

    // V3: if token already carries clinic context, use it directly
    if (decoded.staffId && decoded.clinicId) {
      req.staffId  = decoded.staffId;
      req.clinicId = decoded.clinicId;
      req.role     = decoded.role || 'doctor';
      return next();
    }

    // Backward compat: old tokens only have dentistId — look up staff record
    if (decoded.dentistId) {
      const { data: staffRow } = await supabase
        .from('staff')
        .select('id, clinic_id, role, status')
        .eq('dentist_id', decoded.dentistId)
        .eq('status', 'active')
        .single();

      if (staffRow) {
        req.staffId  = staffRow.id;
        req.clinicId = staffRow.clinic_id;
        req.role     = staffRow.role;
      }
      // If no staff row yet (DB migration not run), fall back gracefully
    }

    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};
