const { z } = require('zod');

const createSchema = z.object({
  name:               z.string().min(1, 'Name required'),
  phone:              z.string().regex(/^\d{10}$/, 'Phone must be exactly 10 digits'),
  age:                z.number().int().positive().optional().nullable(),
  gender:             z.enum(['Male', 'Female', 'Other']).optional().nullable(),
  medical_conditions: z.any().optional().nullable(),
  allergies:          z.any().optional().nullable(),
  clinical_flags:     z.any().optional().nullable(),
});

const updateSchema = createSchema.partial();

module.exports = { createSchema, updateSchema };
