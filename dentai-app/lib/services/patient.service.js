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

  return {
    name:               data.name,
    phone:              data.phone,
    age:                data.age     || null,
    gender:             GENDER_MAP[data.gender] || 'other',
    medical_conditions: conditions.length ? conditions.join(', ') : (data.medical_conditions || ''),
    allergies:          allergyArr.join(', '),
    clinical_flags:     data.clinical_flags || '',
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
  // For updates only send what changed — but still normalise gender if present
  const normalized = { ...patch };
  if (patch.gender) normalized.gender = GENDER_MAP[patch.gender] || patch.gender;
  if (Array.isArray(patch.allergies)) normalized.allergies = patch.allergies.join(', ');
  const { data } = await apiClient.put(`/api/patients/${id}`, normalized);
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
