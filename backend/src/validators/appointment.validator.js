const { z } = require('zod');

const createSchema = z.object({
  patientId:       z.string().uuid('patientId must be a valid UUID'),
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'appointmentDate must be YYYY-MM-DD'),
  appointmentTime: z.string().min(1, 'appointmentTime required'),
  purpose:         z.string().optional().nullable(),
  toothNumber:     z.string().optional().nullable(),
});

const updateSchema = z.object({
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  appointmentTime: z.string().optional(),
  purpose:         z.string().optional().nullable(),
  toothNumber:     z.string().optional().nullable(),
  status:          z.enum(['scheduled', 'completed', 'cancelled', 'no_show', 'suggested']).optional(),
});

module.exports = { createSchema, updateSchema };
