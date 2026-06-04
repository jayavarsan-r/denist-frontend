const { z } = require('zod');

const updateSchema = z.object({
  name:        z.string().min(1).optional(),
  city:        z.string().optional().nullable(),
  address:     z.string().optional().nullable(),
  phone:       z.string().regex(/^\d{10}$/).optional().nullable(),
  openTime:    z.string().optional().nullable(),
  closeTime:   z.string().optional().nullable(),
  workingDays: z.array(z.string()).optional().nullable(),
});

module.exports = { updateSchema };
