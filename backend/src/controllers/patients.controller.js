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

    const base = {
      dentist_id: req.dentistId,
      clinic_id: req.clinicId || null,
      name, phone, age, gender, medical_conditions, allergies, clinical_flags,
      guardian_name: guardian_name || null,
      guardian_phone: guardian_phone || null,
    };

    // No clinic context (pre-clinic account): no UHID, single insert.
    if (!req.clinicId) {
      const patient = await repos.patients.create({ ...base, uhid: null });
      return res.status(201).json({ patient });
    }

    // UHID is per-clinic sequential. The clinic lookup and the patient count are
    // INDEPENDENT — run them in parallel instead of back-to-back (each is a separate
    // network round-trip to Supabase; on the deployed box that serialized wait was a
    // big chunk of the 10-15s registration delay reported in the field).
    const [clinicRes, countRes] = await Promise.all([
      supabase.from('clinics').select('name, display_id').eq('id', req.clinicId).single(),
      supabase.from('patients').select('id', { count: 'exact', head: true }).eq('clinic_id', req.clinicId),
    ]);
    const prefix = clinicPrefix(clinicRes.data || {});
    let seq = (countRes.count || 0) + 1;

    // Insert-then-retry-on-conflict against the unique (clinic_id, uhid) partial index
    // (patients_clinic_uhid_uniq). This REPLACES the old read-before-write loop that
    // did up to 5 SEQUENTIAL existence-check round-trips before inserting. The DB
    // index is the source of truth, so we just attempt the insert and only bump the
    // sequence on a real 23505 unique violation — which also closes the race where two
    // concurrent registrations pre-checked the same free UHID and then both inserted it.
    for (let attempt = 0; ; attempt++) {
      try {
        const patient = await repos.patients.create({ ...base, uhid: formatUhid(prefix, seq) });
        return res.status(201).json({ patient });
      } catch (e) {
        // 23505 = unique_violation. Bump the sequence and retry a bounded number of
        // times; anything else (or exhausting retries) propagates to the error handler.
        if (e?.code === '23505' && attempt < 5) { seq++; continue; }
        throw e;
      }
    }
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
