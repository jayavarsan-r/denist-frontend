const { z } = require('zod');

// Zod schemas. z.object() STRIPS unknown keys by default — that gives us explicit
// field whitelisting (no more `...req.body` mass assignment) without rejecting
// requests outright. Required fields mirror the old manual `if (!field)` checks.
//
// NOTE: OTP endpoints (send-otp / verify-otp) are intentionally NOT validated here
// to keep the mocked OTP flow byte-for-byte unchanged.

// Permissive UUID: accepts any 8-4-4-4-12 hex id (all real Supabase uuid_generate_v4
// values pass) while still rejecting non-id garbage. Avoids zod's strict RFC-4122
// version/variant enforcement being overly aggressive on legitimate ids.
const uuid = z.string().regex(
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  'Invalid id',
);
const optStr = z.string().trim().optional().nullable();
const phone = z.string().regex(/^\d{10}$/, 'Valid 10-digit phone required');

// ── Patients ──────────────────────────────────────────────────────────────
const createPatient = z.object({
  name: z.string().trim().min(1, 'Name required'),
  phone,
  age: z.coerce.number().int().min(0).max(150).optional().nullable(),
  gender: z.preprocess(
    (val) => (typeof val === 'string' ? val.trim().toLowerCase() : val),
    z.enum(['male', 'female', 'other']).optional().nullable()
  ),
  medical_conditions: optStr,
  allergies: optStr,
  clinical_flags: optStr,
  guardian_name:  optStr,
  guardian_phone: optStr,
});
const updatePatient = createPatient.partial();

// ── Appointments ──────────────────────────────────────────────────────────
const APPOINTMENT_STATUS = ['suggested', 'scheduled', 'completed', 'cancelled', 'no_show'];
const createAppointment = z.object({
  patientId: uuid,
  appointmentDate: z.string().min(1),
  appointmentTime: z.string().optional().nullable(),
  purpose: optStr,
  toothNumber: optStr,
  durationMinutes: z.coerce.number().int().positive().optional().nullable(),
  allowDoubleBook: z.coerce.boolean().optional(),
});
const updateAppointment = z.object({
  appointmentDate: z.string().optional(),
  appointmentTime: z.string().optional().nullable(),
  purpose: optStr,
  toothNumber: optStr,
  sittingNumber: z.coerce.number().int().optional().nullable(),
  durationMinutes: z.coerce.number().int().positive().optional().nullable(),
  status: z.enum(APPOINTMENT_STATUS).optional(),
  notes: optStr,
});
const recurringAppointments = z.object({
  patientId: uuid,
  startDate: z.string().min(1),
  intervalDays: z.coerce.number().int().positive(),
  count: z.coerce.number().int().min(1).max(60),
  purpose: optStr,
  appointmentTime: z.string().optional().nullable(),
  durationMinutes: z.coerce.number().int().positive().optional().nullable(),
  allowDoubleBook: z.coerce.boolean().optional(),
});

// ── Visits ────────────────────────────────────────────────────────────────
const createVisit = z.object({
  patientId: uuid,
  procedureName: optStr,
  toothNumber: optStr,
  status: optStr,
  rawTranscript: optStr,
  notes: optStr,
  medications: optStr,
  nextSteps: optStr,
  followUpDate: z.string().optional().nullable(),
  visitDate: z.string().optional().nullable(),
  cost: z.coerce.number().optional().nullable(),
  currency: optStr,
});
const updateVisit = z.object({}).passthrough(); // controller already field-maps + whitelists

// ── Queue ─────────────────────────────────────────────────────────────────
const addToQueue = z.object({
  patientId: uuid,
  chiefComplaint: optStr,
  visitReason: optStr,
  priority: z.string().optional(),
  assignedDoctor: uuid.optional().nullable(),
  treatmentPlanId: uuid.optional().nullable(),
});
const patchQueue = z.object({
  status: z.string().optional(),
  consultationOutcome: optStr,
  outcomeMetadata: z.any().optional(),
  assignedDoctor: uuid.optional().nullable(),
  priority: z.string().optional(),
  sortOrder: z.coerce.number().int().optional(),
  notes: optStr,
});
const completeConsult = z.object({
  patientId: uuid.optional().nullable(), // defaults from the queue entry in the route
  // Optional: the doctor must be able to finish/checkout even when the AI didn't extract
  // a clear procedure (or was rate-limited). The transaction defaults it to 'Consultation'.
  procedure: optStr,
  diagnosis: optStr,
  toothNumber: optStr,
  toothNumbers: z.array(z.string().trim()).optional().nullable(), // multi-tooth procedure
  totalSittings: z.coerce.number().int().min(1).optional().nullable(),
  estimatedCost: z.coerce.number().optional().nullable(),
  transcript: optStr,
  notes: optStr,
  followUp: optStr, // doctor's recommended follow-up (date YYYY-MM-DD or free text)
});

// ── Payments ──────────────────────────────────────────────────────────────
const recordPayment = z.object({
  patientId: uuid,
  treatmentPlanId: uuid.optional().nullable(),
  queueEntryId: uuid.optional().nullable(),
  amount: z.coerce.number().positive('amount must be > 0'),
  paymentMethod: z.string().optional(),
  notes: optStr,
  paymentDate: z.string().optional().nullable(),
});

// ── Treatment plans ───────────────────────────────────────────────────────
const createTreatmentPlan = z.object({
  patientId: uuid,
  diagnosis: optStr,
  procedureName: z.string().trim().min(1, 'procedureName required'),
  totalSittings: z.coerce.number().int().min(1).optional(),
  estimatedCost: z.coerce.number().optional(),
  notes: optStr,
  startDate: z.string().optional().nullable(),
  expectedEndDate: z.string().optional().nullable(),
});
const updateTreatmentPlan = z.object({
  completedSittings: z.coerce.number().int().optional(),
  collectedAmount: z.coerce.number().optional(),
  status: z.string().optional(),
  estimatedCost: z.coerce.number().optional(),
  notes: optStr,
});

// ── Clinic ────────────────────────────────────────────────────────────────
const updateClinic = z.object({
  name: z.string().optional(),
  city: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  openTime: z.string().optional(),
  closeTime: z.string().optional(),
  workingDays: z.any().optional(),
});

// ── Auth onboarding (NOT the OTP endpoints) ───────────────────────────────
const createClinic = z.object({
  clinicName: z.string().trim().min(1, 'clinicName required'),
  yourName: z.string().trim().min(1, 'yourName required'),
  city: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
});
const joinClinic = z.object({
  joinCode: z.string().trim().min(1, 'joinCode required'),
  yourName: z.string().trim().min(1, 'yourName required'),
  role: z.enum(['doctor', 'receptionist']),
});
const lookupClinic = z.object({ joinCode: z.string().trim().min(1, 'joinCode required') });

// ── Lab orders ────────────────────────────────────────────────────────────
const LAB_STATUS = ['pending', 'sent', 'received', 'completed'];
const createLabOrder = z.object({
  patientId: uuid,
  treatmentPlanId: uuid.optional().nullable(),
  procedureType: optStr,
  toothNumber: optStr,
  labName: z.string().trim().min(1, 'labName required'),
  workDescription: optStr,
  shade: optStr,
  impressionType: optStr,
  sentDate: z.string().optional().nullable(),
  expectedReturnDate: z.string().optional().nullable(),
  costToClinic: z.coerce.number().optional().nullable(),
  chargedToPatient: z.coerce.number().optional().nullable(),
  status: z.enum(LAB_STATUS).optional(),
  notes: optStr,
});
const updateLabOrder = z.object({
  status: z.enum(LAB_STATUS).optional(),
  actualReturnDate: z.string().optional().nullable(),
  reportUrl: optStr,
  labName: z.string().trim().min(1).optional(),
  procedureType: optStr,
  toothNumber: optStr,
  workDescription: optStr,
  shade: optStr,
  impressionType: optStr,
  expectedReturnDate: z.string().optional().nullable(),
  costToClinic: z.coerce.number().optional().nullable(),
  chargedToPatient: z.coerce.number().optional().nullable(),
  notes: optStr,
});

// ── Staff ─────────────────────────────────────────────────────────────────
const updateStaff = z.object({
  name: z.string().trim().min(1).optional(),
  role: z.enum(['doctor', 'receptionist']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

module.exports = {
  createPatient, updatePatient,
  createAppointment, updateAppointment, recurringAppointments,
  createVisit, updateVisit,
  addToQueue, patchQueue, completeConsult,
  recordPayment,
  createTreatmentPlan, updateTreatmentPlan,
  updateClinic,
  createClinic, joinClinic, lookupClinic,
  updateStaff,
  createLabOrder, updateLabOrder,
  APPOINTMENT_STATUS, LAB_STATUS,
};
