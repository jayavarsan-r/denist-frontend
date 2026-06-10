const { z } = require('zod');

const createSchema = z.object({
  patientId:       z.string().uuid('patientId must be a valid UUID'),
  amount:          z.number().positive('amount must be a positive number'),
  treatmentPlanId: z.string().uuid().optional().nullable(),
  queueEntryId:    z.string().uuid().optional().nullable(),
  paymentMethod:   z.enum(['cash', 'card', 'upi', 'insurance', 'online']).optional().default('cash'),
  notes:           z.string().optional().nullable(),
  paymentDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

module.exports = { createSchema };
