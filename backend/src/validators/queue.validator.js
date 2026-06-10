const { z } = require('zod');

const createSchema = z.object({
  patientId:       z.string().uuid('patientId must be a valid UUID'),
  chiefComplaint:  z.string().optional().nullable(),
  visitReason:     z.string().optional().nullable(),
  priority:        z.enum(['normal', 'urgent', 'emergency']).optional().default('normal'),
  assignedDoctor:  z.string().uuid().optional().nullable(),
  treatmentPlanId: z.string().uuid().optional().nullable(),
});

const completeConsultSchema = z.object({
  patientId:     z.string().uuid('patientId must be a valid UUID'),
  procedure:     z.string().min(1, 'procedure required'),
  diagnosis:     z.string().optional().nullable(),
  toothNumber:   z.string().optional().nullable(),
  totalSittings: z.number().int().positive().optional().default(1),
  estimatedCost: z.number().nonnegative().optional().nullable(),
  transcript:    z.string().optional().nullable(),
  notes:         z.string().optional().nullable(),
});

module.exports = { createSchema, completeConsultSchema };
