const repos = require('../repositories');

function scopeOf(req) {
  return { clinicId: req.clinicId, dentistId: req.dentistId };
}

exports.list = async (req, res, next) => {
  try {
    const { patientId } = req.query;
    const filters = patientId ? { patient_id: patientId } : undefined;
    const data = await repos.visits.findAll(scopeOf(req), { filters });
    res.json({ visits: data });
  } catch (e) { next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const { patientId, procedureName, toothNumber, status, rawTranscript, notes, medications, nextSteps, followUpDate, visitDate, cost, currency } = req.body;
    const visit = await repos.visits.create({
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
    });
    res.status(201).json({ visit });
  } catch (e) { next(e); }
};

exports.getById = async (req, res, next) => {
  try {
    const visit = await repos.visits.findById(req.params.id, scopeOf(req));
    if (!visit) return res.status(404).json({ error: 'Visit not found' });
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
    Object.entries(req.body).forEach(([k, v]) => { updates[fieldMap[k] || k] = v; });
    updates.updated_at = new Date().toISOString();
    // Never allow ownership/soft-delete columns to be overwritten via update.
    delete updates.dentist_id; delete updates.clinic_id; delete updates.patient_id;
    delete updates.id; delete updates.is_deleted;

    const visit = await repos.visits.update(req.params.id, scopeOf(req), updates);
    if (!visit) return res.status(404).json({ error: 'Visit not found' });
    res.json({ visit });
  } catch (e) { next(e); }
};

exports.remove = async (req, res, next) => {
  try {
    await repos.visits.softDelete(req.params.id, scopeOf(req), req.staffId);
    res.json({ success: true });
  } catch (e) { next(e); }
};
