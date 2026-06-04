import { apiClient } from '../api/client';

// Backend DB gender check constraint (actual values): 'male' | 'female' | 'other'
const GENDER_MAP = {
  'Male': 'male', 'Female': 'female', 'Other': 'other',
  'male': 'male', 'female': 'female', 'other': 'other',
  'M': 'male', 'F': 'female',
};

/**
 * Normalise frontend patient shape → backend API shape.
 * The DB has a gender check constraint ('M'|'F'|'Other') and only accepts
 * flat string fields for medical_conditions and allergies.
 */
function normaliseForApi(data) {
  // Build medical_conditions string from boolean flags
  const conditions = [];
  if (data.has_diabetes     || data.hasDiabetes)         conditions.push('Diabetes');
  if (data.has_hypertension || data.hasHypertension)     conditions.push('Hypertension');
  if (data.has_heart_condition || data.hasHeartCondition) conditions.push('Heart condition');
  if (data.is_pregnant      || data.isPregnant)           conditions.push('Pregnant');
  if (data.is_on_blood_thinners || data.isOnBloodThinners) conditions.push('Blood thinners');

  // Allergies: always send as comma string
  const allergyArr = Array.isArray(data.allergies)
    ? data.allergies
    : (data.allergies ? [data.allergies] : []);

  // Build clinical_flags: include blood group + boolean risk flags
  const flags = [];
  if (data.blood_group || data.bloodGroup) flags.push(`bg:${data.blood_group || data.bloodGroup}`);
  if (data.has_diabetes || data.hasDiabetes) flags.push('diabetes');
  if (data.has_hypertension || data.hasHypertension) flags.push('hypertension');
  if (data.has_heart_condition || data.hasHeartCondition) flags.push('heart');
  if (data.is_pregnant || data.isPregnant) flags.push('pregnant');
  if (data.is_on_blood_thinners || data.isOnBloodThinners) flags.push('blood_thinners');
  if (data.flags?.hasDiabetes) flags.push('diabetes');
  if (data.flags?.hasHypertension) flags.push('hypertension');
  if (data.flags?.hasHeartCondition) flags.push('heart');
  if (data.flags?.isPregnant) flags.push('pregnant');
  if (data.flags?.isOnBloodThinners) flags.push('blood_thinners');

  return {
    name:               data.name,
    phone:              data.phone,
    age:                data.age     || null,
    gender:             GENDER_MAP[data.gender] || null,
    medical_conditions: conditions.length ? conditions.join(', ') : (data.medical_conditions || ''),
    allergies:          allergyArr.join(', '),
    clinical_flags:     [...new Set(flags), ...(data.clinical_flags || '').split(',').filter(Boolean)].join(','),
  };
}

export async function listPatients(search) {
  const params = search ? { q: search } : {};
  const { data } = await apiClient.get('/api/patients', { params });
  return data;
}

export async function getPatient(id) {
  const { data } = await apiClient.get(`/api/patients/${id}`);
  return data;
}

export async function createPatient(patientData) {
  const { data } = await apiClient.post('/api/patients', normaliseForApi(patientData));
  return data;
}

export async function updatePatient(id, patch) {
  const { data } = await apiClient.put(`/api/patients/${id}`, normaliseForApi(patch));
  return data;
}

export async function getPatientTreatmentPlans(id) {
  const { data } = await apiClient.get(`/api/patients/${id}/treatment-plans`);
  return data;
}

export async function getPatientPrescriptions(id) {
  const { data } = await apiClient.get(`/api/patients/${id}/prescriptions`);
  return data;
}

export async function getPatientXrays(id) {
  const { data } = await apiClient.get(`/api/patients/${id}/xrays`);
  return data;
}

export async function getPatientCaseSheet(id) {
  const { data } = await apiClient.get(`/api/patients/${id}/case-sheet`);
  return data;
}

export async function extractPatientFromTranscript(transcript) {
  const { data } = await apiClient.post('/api/ai/extract-patient', { transcript });
  return data.patient || {};
}

export async function getToothHistory(id) {
  const { data } = await apiClient.get(`/api/patients/${id}/tooth-history`);
  return data; // { patientId, toothMap: [...], generalVisits: [...], totalBilled: number }
}
