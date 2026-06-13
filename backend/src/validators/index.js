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
// Phase 2: complete-consult confirms an AI draft from the Verification Card.
// confirmed_data is the (possibly doctor-edited) extraction in the DraftSchema
// shape, plus optional UI extras (total_sittings, estimated_cost, diagnosis).
// Inner objects are passthrough on purpose: the card edits every field and the
// payload lands in jsonb — the transaction maps only the columns it knows.
const confirmedDataSchema = z.object({
  treatments:    z.array(z.object({}).passthrough()).optional().default([]),
  prescriptions: z.array(z.object({}).passthrough()).optional().default([]),
  follow_up: z.object({
    in_days: z.coerce.number().int().positive().optional().nullable(),
    reason:  optStr,
  }).optional().nullable(),
  lab_case_suggestion: z.object({}).passthrough().optional().nullable(),
  clinical_notes: optStr,
  total_sittings: z.coerce.number().int().min(1).optional().nullable(),
  estimated_cost: z.coerce.number().optional().nullable(),
  diagnosis: optStr,
}).passthrough();

const confirmDraft = z.object({
  draft_id: uuid,
  confirmed_data: confirmedDataSchema,
});

// PATCH /api/consultation-drafts/:id — profile-consult confirm + reject path.
const reviewDraft = z.object({
  status: z.enum(['confirmed', 'rejected']),
  confirmed_data: confirmedDataSchema.optional().nullable(),
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
  metadata: z.record(z.any()).optional(),
});
const updateTreatmentPlan = z.object({
  completedSittings: z.coerce.number().int().optional(),
  collectedAmount: z.coerce.number().optional(),
  status: z.string().optional(),
  estimatedCost: z.coerce.number().optional(),
  notes: optStr,
  metadata: z.record(z.any()).optional(),
});

// ── Payment plans (EMI) ───────────────────────────────────────────────────
const EMI_FREQ = ['monthly', 'weekly', 'biweekly'];
const createPaymentPlan = z.object({
  patientId: uuid,
  treatmentPlanId: uuid.optional().nullable(),
  totalAmount: z.coerce.number().nonnegative(),
  advancePaid: z.coerce.number().nonnegative().optional(),
  emiAmount: z.coerce.number().positive(),
  emiFrequency: z.enum(EMI_FREQ).optional(),
  startDate: z.string().optional().nullable(),
  notes: optStr,
});
const updatePaymentPlan = z.object({
  emiAmount: z.coerce.number().positive().optional(),
  emiFrequency: z.enum(EMI_FREQ).optional(),
  nextDueDate: z.string().optional().nullable(),
  status: z.enum(['active', 'completed', 'defaulted', 'cancelled']).optional(),
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
  registrationNumber: z.string().max(64).optional(),
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

// ── Tooth chart ───────────────────────────────────────────────────────────
const TOOTH_CONDITIONS = ['healthy','caries','infection','rct_initiated','rct_completed',
  'temporary_restoration','permanent_restoration','crown','missing','implant','extraction_advised','mobility'];
const toothChartUpsert = z.object({
  conditions: z.array(z.enum(TOOTH_CONDITIONS)).default([]),
  surfaces: z.any().optional(),
  notes: optStr,
});

// ── Lab cases (Phase 4 — NEW system, separate from lab orders) ────────────
const LAB_CASE_TYPES = ['crown_pfm', 'crown_zirconia', 'bridge', 'denture_full', 'denture_partial', 'aligner', 'inlay_onlay', 'other'];
const LAB_CASE_STATUSES = ['DRAFT', 'SENT', 'ACKNOWLEDGED', 'IN_PROGRESS', 'READY', 'DISPATCHED', 'RECEIVED', 'FITTED', 'ISSUE_RAISED', 'CANCELLED'];
const fdiTooth = z.coerce.number().int().min(11).max(48);
const createLabCase = z.object({
  patientId: uuid,
  labId: uuid.optional().nullable(),
  visitId: uuid.optional().nullable(),
  treatmentPlanId: uuid.optional().nullable(),
  caseType: z.enum(LAB_CASE_TYPES),
  toothFdi: z.array(fdiTooth).optional().default([]),
  shade: optStr,
  instructions: optStr,
  expectedDate: z.string().optional().nullable(),
  sendNow: z.coerce.boolean().optional().default(false),
});
const updateLabCase = z.object({
  labId: uuid.optional().nullable(),
  shade: optStr,
  instructions: optStr,
  expectedDate: z.string().optional().nullable(),
  toothFdi: z.array(fdiTooth).optional(),
});
const labCaseStatus = z.object({ status: z.enum(LAB_CASE_STATUSES) });
const createLab = z.object({
  name: z.string().trim().min(1, 'name required'),
  phoneNumbers: z.array(z.string().trim().min(8)).min(1, 'at least one phone number'),
  preferredLanguage: z.enum(['en', 'ta']).optional(),
  defaultTurnaroundDays: z.coerce.number().int().positive().optional(),
  notes: optStr,
  consentLogged: z.coerce.boolean().optional(),
});
const updateLab = z.object({
  name: z.string().trim().min(1).optional(),
  phoneNumbers: z.array(z.string().trim().min(8)).optional(),
  preferredLanguage: z.enum(['en', 'ta']).optional(),
  automationPaused: z.coerce.boolean().optional(),
  defaultTurnaroundDays: z.coerce.number().int().positive().optional(),
  notes: optStr,
  consentLogged: z.coerce.boolean().optional(),
});
const resolveInboxItem = z.object({
  labCaseId: uuid.optional().nullable(),
  newStatus: z.enum(LAB_CASE_STATUSES).optional().nullable(),
});

// ── Inventory ─────────────────────────────────────────────────────────────
const INVENTORY_CATEGORIES = ['medicine', 'consumable', 'equipment'];
const createInventoryItem = z.object({
  category: z.enum(INVENTORY_CATEGORIES).optional().default('medicine'),
  name: z.string().trim().min(1, 'name required'),
  strength: optStr,
  unit: z.string().trim().min(1).optional().default('tablet'),
  price_per_unit: z.coerce.number().nonnegative().optional().nullable(),
  stock_qty: z.coerce.number().nonnegative().optional().default(0),
  low_stock_threshold: z.coerce.number().nonnegative().optional().default(10),
  notes: optStr,
});
const updateInventoryItem = z.object({
  name: z.string().trim().min(1).optional(),
  strength: optStr,
  unit: z.string().trim().min(1).optional(),
  price_per_unit: z.coerce.number().nonnegative().optional().nullable(),
  low_stock_threshold: z.coerce.number().nonnegative().optional(),
  notes: optStr,
  active: z.coerce.boolean().optional(),
  // stock_qty deliberately absent — stock changes go through stock-in/adjustment
  // so the movements ledger stays the source of truth.
});
const stockIn = z.object({
  qty: z.coerce.number().positive('qty must be positive'),
  notes: optStr,
});
const stockAdjust = z.object({
  qty: z.coerce.number().positive('qty must be positive'),
  direction: z.enum(['in', 'out']),
  reason: z.enum(['adjustment', 'expired', 'return', 'purchase']).optional().default('adjustment'),
  notes: optStr,
});

// ── Staff ─────────────────────────────────────────────────────────────────
const updateStaff = z.object({
  name: z.string().trim().min(1).optional(),
  role: z.enum(['doctor', 'receptionist']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  registrationNumber: z.string().max(64).optional(),
});

// ── Notifications ─────────────────────────────────────────────────────────
const sendNotification = z.object({
  patientId: uuid.optional().nullable(),
  type: z.enum(['prescription', 'appointment_reminder', 'payment_due', 'recall', 'custom']),
  channel: z.enum(['whatsapp', 'sms', 'email']).optional(),
  body: optStr,
  payload: z.any().optional(),
});
const notifyReminder   = z.object({ appointmentId: uuid });
const notifyPaymentDue = z.object({ patientId: uuid, treatmentPlanId: uuid.optional().nullable() });
const notifyRecall     = z.object({ patientId: uuid, dueDate: z.string().min(1), reason: optStr });

module.exports = {
  createPatient, updatePatient,
  createAppointment, updateAppointment, recurringAppointments,
  createVisit, updateVisit,
  addToQueue, patchQueue, confirmDraft, reviewDraft,
  recordPayment,
  createTreatmentPlan, updateTreatmentPlan,
  createPaymentPlan, updatePaymentPlan,
  updateClinic,
  createClinic, joinClinic, lookupClinic,
  updateStaff,
  createLabOrder, updateLabOrder,
  createInventoryItem, updateInventoryItem, stockIn, stockAdjust, INVENTORY_CATEGORIES,
  createLabCase, updateLabCase, labCaseStatus, createLab, updateLab, resolveInboxItem,
  LAB_CASE_TYPES, LAB_CASE_STATUSES,
  sendNotification, notifyReminder, notifyPaymentDue, notifyRecall,
  toothChartUpsert, TOOTH_CONDITIONS,
  APPOINTMENT_STATUS, LAB_STATUS,
};
