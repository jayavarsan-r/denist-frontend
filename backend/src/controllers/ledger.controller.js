const repos = require('../repositories');

function scopeOf(req) {
  return { clinicId: req.clinicId, dentistId: req.dentistId };
}

// GET /api/ledger — clinic-scoped manual income/expense entries.
// Optional filters: ?type=income|expense, ?from=YYYY-MM-DD, ?to=YYYY-MM-DD
exports.list = async (req, res, next) => {
  try {
    const { type, from, to } = req.query;
    let q = repos.ledger.query(scopeOf(req)).order('entry_date', { ascending: false });
    if (type) q = q.eq('type', type);
    if (from) q = q.gte('entry_date', from);
    if (to)   q = q.lte('entry_date', to);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ ledgerEntries: data || [] });
  } catch (e) { next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const { type, category, description, amount, entryDate, patientId, labCaseId } = req.body;
    const entry = await repos.ledger.create({
      clinic_id: req.clinicId,
      created_by: req.staffId || null,
      type, category,
      description: description || null,
      amount,
      entry_date: entryDate || new Date().toISOString().split('T')[0],
      patient_id: patientId || null,
      lab_case_id: labCaseId || null,
    });
    res.status(201).json({ entry });
  } catch (e) { next(e); }
};

exports.update = async (req, res, next) => {
  try {
    const map = { entryDate: 'entry_date', patientId: 'patient_id', labCaseId: 'lab_case_id' };
    const updates = { updated_at: new Date().toISOString() };
    for (const [k, val] of Object.entries(req.body)) updates[map[k] || k] = val;
    delete updates.clinic_id; delete updates.id; delete updates.created_by;
    const entry = await repos.ledger.update(req.params.id, scopeOf(req), updates);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    res.json({ entry });
  } catch (e) { next(e); }
};

exports.remove = async (req, res, next) => {
  try {
    await repos.ledger.softDelete(req.params.id, scopeOf(req), req.staffId);
    res.json({ success: true });
  } catch (e) { next(e); }
};
