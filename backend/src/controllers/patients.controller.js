const repos = require('../repositories');
const { parsePagination, pageMeta } = require('../utils/pagination');

const LIST_SELECT = '*, visits(id, visit_date, procedure_name, status, follow_up_date), appointments(id, appointment_date, appointment_time, status)';
const DETAIL_SELECT = '*, visits(*), appointments(*)';

function scopeOf(req) {
  return { clinicId: req.clinicId, dentistId: req.dentistId };
}

exports.list = async (req, res, next) => {
  try {
    const { q, page, limit } = req.query;
    const scope = scopeOf(req);
    // Pagination is opt-in (page/limit present) so existing callers that expect the
    // full list keep working; large clinics can page when they choose to.
    const paginated = page !== undefined || limit !== undefined;

    let query = repos.patients.query(scope, LIST_SELECT).order('name');
    if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);

    let meta = null;
    if (paginated) {
      const { from, to, page: p, limit: l } = parsePagination(req.query);
      const total = await repos.patients.count(scope);
      query = query.range(from, to);
      meta = pageMeta({ page: p, limit: l }, total);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(meta ? { patients: data, pagination: meta } : { patients: data });
  } catch (e) { next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const { name, phone, age, gender, medical_conditions, allergies, clinical_flags } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone required' });
    const patient = await repos.patients.create({
      dentist_id: req.dentistId,
      clinic_id: req.clinicId || null,
      name, phone, age, gender, medical_conditions, allergies, clinical_flags,
    });
    res.status(201).json({ patient });
  } catch (e) { next(e); }
};

exports.getById = async (req, res, next) => {
  try {
    const patient = await repos.patients.findById(req.params.id, scopeOf(req), DETAIL_SELECT);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    res.json({ patient });
  } catch (e) { next(e); }
};

exports.update = async (req, res, next) => {
  try {
    // Whitelist editable fields (validator already stripped unknowns; this is belt-and-braces).
    const allowed = ['name', 'phone', 'age', 'gender', 'medical_conditions', 'allergies', 'clinical_flags'];
    const updates = { updated_at: new Date().toISOString() };
    for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];

    const patient = await repos.patients.update(req.params.id, scopeOf(req), updates);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    res.json({ patient });
  } catch (e) { next(e); }
};

exports.remove = async (req, res, next) => {
  try {
    await repos.patients.softDelete(req.params.id, scopeOf(req), req.staffId);
    res.json({ success: true });
  } catch (e) { next(e); }
};
