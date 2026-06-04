const supabase = require('../config/supabase');

// Scope a visit query to the caller: clinic-wide when clinic context exists
// (all staff see the clinic's visits), else fall back to the owning dentist.
// The OR covers legacy rows created before clinic_id stamping (null clinic_id).
function scopeQuery(query, req) {
  if (req.clinicId) {
    return query.or(`clinic_id.eq.${req.clinicId},dentist_id.eq.${req.dentistId}`);
  }
  return query.eq('dentist_id', req.dentistId);
}

exports.list = async (req, res, next) => {
  try {
    const { patientId } = req.query;
    let query = supabase.from('visits').select('*').order('visit_date', { ascending: false });
    query = scopeQuery(query, req);
    if (patientId) query = query.eq('patient_id', patientId);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ visits: data });
  } catch (e) { next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const { patientId, procedureName, toothNumber, status, rawTranscript, notes, medications, nextSteps, followUpDate, visitDate, cost, currency } = req.body;
    const { data: visit, error } = await supabase.from('visits').insert({
      patient_id: patientId,
      dentist_id: req.dentistId,
      clinic_id: req.clinicId || null,
      procedure_name: procedureName,
      tooth_number: toothNumber,
      status: status || 'completed',
      raw_transcript: rawTranscript,
      notes,
      medications,
      next_steps: nextSteps,
      follow_up_date: followUpDate,
      visit_date: visitDate || new Date().toISOString().split('T')[0],
      cost: cost != null ? parseFloat(cost) : null,
      currency: currency || 'INR',
    }).select().single();
    if (error) throw error;
    res.status(201).json({ visit });
  } catch (e) { next(e); }
};

exports.getById = async (req, res, next) => {
  try {
    let q = supabase.from('visits').select('*').eq('id', req.params.id);
    q = scopeQuery(q, req);
    const { data: visit, error } = await q.single();
    if (error || !visit) return res.status(404).json({ error: 'Visit not found' });
    res.json({ visit });
  } catch (e) { next(e); }
};

exports.update = async (req, res, next) => {
  try {
    const fieldMap = {
      procedureName: 'procedure_name',
      toothNumber: 'tooth_number',
      followUpDate: 'follow_up_date',
      followUpDone: 'follow_up_done',
      nextSteps: 'next_steps',
      rawTranscript: 'raw_transcript',
    };
    const updates = {};
    Object.entries(req.body).forEach(([k, v]) => {
      updates[fieldMap[k] || k] = v;
    });
    updates.updated_at = new Date().toISOString();
    // Never allow ownership/soft-delete columns to be overwritten via update
    delete updates.dentist_id; delete updates.clinic_id; delete updates.patient_id;
    delete updates.id; delete updates.is_deleted;
    let uq = supabase.from('visits').update(updates).eq('id', req.params.id);
    uq = scopeQuery(uq, req);
    const { data: visit, error } = await uq.select().single();
    if (error || !visit) return res.status(404).json({ error: 'Visit not found' });
    res.json({ visit });
  } catch (e) { next(e); }
};
