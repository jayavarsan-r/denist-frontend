const { z } = require('zod');

const createSchema = z.object({
  patientId:       z.string().uuid('patientId must be a valid UUID'),
  chiefComplaint:  z.string().optional().nullable(),
  visitReason:     z.string().optional().nullable(),
  priority:        z.enum(['normal', 'urgent', 'emergency']).optional().default('normal'),
  assignedDoctor:  z.string().uuid().optional().nullable(),
  treatmentPlanId: z.string().uuid().optional().nullable(),
});

// followUp accepts every shape the clients/AI produce: a 'YYYY-MM-DD' date string,
// a number of days from today, or an object { date | inDays/in_days, reason }.
// The transaction service normalises all of these into a concrete appointment date.
const followUpSchema = z.union([
  z.string(),
  z.number(),
  z.object({
    date:    z.string().optional().nullable(),
    inDays:  z.number().optional().nullable(),
    in_days: z.number().optional().nullable(),
    reason:  z.string().optional().nullable(),
  }),
]);

const completeConsultSchema = z.object({
  // Optional: the route defaults patientId from the queue entry itself.
  patientId:     z.string().uuid('patientId must be a valid UUID').optional().nullable(),
  // Optional: the transaction service falls back to a generic 'Consultation' label.
  procedure:     z.string().optional().nullable(),
  diagnosis:     z.string().optional().nullable(),
  toothNumber:   z.string().optional().nullable(),
  toothNumbers:  z.array(z.union([z.string(), z.number()]).transform((t) => String(t))).optional(),
  totalSittings: z.number().int().positive().optional().default(1),
  estimatedCost: z.number().nonnegative().optional().nullable(),
  transcript:    z.string().optional().nullable(),
  notes:         z.string().optional().nullable(),
  followUp:      followUpSchema.optional().nullable(),
  // AI-resolved future visits from the consultation note (followUpAppointments).
  appointments:  z.array(z.object({
    date:    z.string(),
    purpose: z.string().optional().nullable(),
    session: z.number().optional().nullable(),
    sitting: z.number().optional().nullable(),
  })).optional(),
});

module.exports = { createSchema, completeConsultSchema };
