const supabase = require('../config/supabase');

exports.list = async (req, res, next) => {
  try {
    const { patientId } = req.query;
    let query = supabase.from('visits').select('*')
      .eq('dentist_id', req.dentistId).order('visit_date', { ascending: false });
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
    const { data: visit, error } = await supabase.from('visits').select('*').eq('id', req.params.id).single();
    if (error) throw error;
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
    const { data: visit, error } = await supabase.from('visits')
      .update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ visit });
  } catch (e) { next(e); }
};
