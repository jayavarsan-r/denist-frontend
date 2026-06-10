const repos = require('../repositories');
const supabase = require('../config/supabase');
const { parsePagination, pageMeta } = require('../utils/pagination');
const { clinicPrefix, formatUhid } = require('../utils/uhid');

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
    const { name, phone, age, gender, medical_conditions, allergies, clinical_flags,
      guardian_name, guardian_phone } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone required' });

    // UHID is per-clinic sequential with a collision-safe retry against the unique
    // (clinic_id, uhid) index added in migration 010.
    let uhid = null;
    if (req.clinicId) {
      const { data: clinic } = await supabase.from('clinics').select('name, display_id').eq('id', req.clinicId).single();
      const prefix = clinicPrefix(clinic || {});
      const { count } = await supabase.from('patients')
        .select('id', { count: 'exact', head: true }).eq('clinic_id', req.clinicId);
      let seq = (count || 0) + 1;
      for (let attempt = 0; attempt < 5 && !uhid; attempt++) {
        const candidate = formatUhid(prefix, seq);
        const { data, error } = await supabase.from('patients').select('id')
          .eq('clinic_id', req.clinicId).eq('uhid', candidate).maybeSingle();
        if (!error && !data) uhid = candidate; else seq++;
      }
    }

    const patient = await repos.patients.create({
      dentist_id: req.dentistId,
      clinic_id: req.clinicId || null,
      name, phone, age, gender, medical_conditions, allergies, clinical_flags,
      guardian_name: guardian_name || null,
      guardian_phone: guardian_phone || null,
      uhid,
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
    const allowed = ['name', 'phone', 'age', 'gender', 'medical_conditions', 'allergies', 'clinical_flags', 'guardian_name', 'guardian_phone'];
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
