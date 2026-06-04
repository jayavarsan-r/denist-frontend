const supabase = require('../config/supabase');
const { ok, okCreated, fail } = require('../utils/response');

exports.list = async (req, res, next) => {
  try {
    const { patientId } = req.query;
    let query = supabase.from('visits').select('*')
      .eq('dentist_id', req.dentistId).order('visit_date', { ascending: false });
    if (patientId) query = query.eq('patient_id', patientId);
    const { data, error } = await query;
    if (error) throw error;
    return ok(res, { visits: data });
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
    return okCreated(res, { visit });
  } catch (e) { next(e); }
};

exports.getById = async (req, res, next) => {
  try {
    let q = supabase.from('visits').select('*').eq('id', req.params.id);
    if (req.clinicId) q = q.eq('clinic_id', req.clinicId);
    else q = q.eq('dentist_id', req.dentistId);
    const { data: visit, error } = await q.single();
    if (error || !visit) return fail(res, 404, 'NOT_FOUND', 'Visit not found');
    return ok(res, { visit });
  } catch (e) { next(e); }
};

exports.update = async (req, res, next) => {
  try {
    const { procedure_name, procedureName, tooth_number, toothNumber, status,
            raw_transcript, rawTranscript, notes, medications, next_steps, nextSteps,
            follow_up_date, followUpDate, follow_up_done, followUpDone, visit_date, cost, currency } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (procedure_name !== undefined) updates.procedure_name = procedure_name;
    if (procedureName !== undefined) updates.procedure_name = procedureName;
    if (tooth_number !== undefined) updates.tooth_number = tooth_number;
    if (toothNumber !== undefined) updates.tooth_number = toothNumber;
    if (status !== undefined) updates.status = status;
    if (raw_transcript !== undefined) updates.raw_transcript = raw_transcript;
    if (rawTranscript !== undefined) updates.raw_transcript = rawTranscript;
    if (notes !== undefined) updates.notes = notes;
    if (medications !== undefined) updates.medications = medications;
    if (next_steps !== undefined) updates.next_steps = next_steps;
    if (nextSteps !== undefined) updates.next_steps = nextSteps;
    if (follow_up_date !== undefined) updates.follow_up_date = follow_up_date;
    if (followUpDate !== undefined) updates.follow_up_date = followUpDate;
    if (follow_up_done !== undefined) updates.follow_up_done = follow_up_done;
    if (followUpDone !== undefined) updates.follow_up_done = followUpDone;
    if (visit_date !== undefined) updates.visit_date = visit_date;
    if (cost !== undefined) updates.cost = cost;
    if (currency !== undefined) updates.currency = currency;

    let uq = supabase.from('visits').update(updates).eq('id', req.params.id);
    if (req.clinicId) uq = uq.eq('clinic_id', req.clinicId);
    else uq = uq.eq('dentist_id', req.dentistId);
    const { data: visit, error } = await uq.select().single();
    if (error || !visit) return fail(res, 404, 'NOT_FOUND', 'Visit not found or access denied');
    return ok(res, { visit });
  } catch (e) { next(e); }
};
