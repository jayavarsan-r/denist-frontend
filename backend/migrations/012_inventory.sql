-- 012_inventory.sql
-- Phase 3: inventory module — medicine price list + stock ledger.
--
-- BEFORE APPLYING, check the live DB for pre-existing tables (adapt instead of
-- recreating if they exist):
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public' AND table_name IN ('inventory_items','stock_movements');
--
-- The voice worker resolves spoken medicine spans against inventory_items —
-- price/stock then appear on the Verification Card (Phase 2 already plumbed the
-- resolved_* fields through; they populate the moment this table has rows).

-- ── inventory_items ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           uuid NOT NULL REFERENCES public.clinics(id),
  category            text NOT NULL DEFAULT 'medicine',
  -- 'medicine' | 'consumable' | 'equipment'
  name                text NOT NULL,
  strength            text,           -- '500mg', '10ml', null for consumables
  unit                text NOT NULL DEFAULT 'tablet',
  -- 'tablet' | 'capsule' | 'strip' | 'bottle' | 'vial' | 'piece' | 'box' | 'ml' | 'g' | 'tube' | 'pack'
  price_per_unit      numeric(10,2),
  stock_qty           numeric(10,2) NOT NULL DEFAULT 0,
  low_stock_threshold numeric(10,2) NOT NULL DEFAULT 10,
  active              boolean NOT NULL DEFAULT true,
  notes               text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE (clinic_id, name, strength)
);

CREATE INDEX IF NOT EXISTS idx_inventory_clinic   ON public.inventory_items(clinic_id);
CREATE INDEX IF NOT EXISTS idx_inventory_category ON public.inventory_items(clinic_id, category);
CREATE INDEX IF NOT EXISTS idx_inventory_active   ON public.inventory_items(clinic_id, active);

-- Trigram index speeds the worker's ILIKE resolution. Wrapped so a project
-- without pg_trgm (or without privileges to create extensions) still migrates.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS idx_inventory_name_trgm
    ON public.inventory_items USING gin(name gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm unavailable — skipping trigram index (ILIKE still works, just slower)';
END $$;

-- ── stock_movements (append-only ledger) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid NOT NULL REFERENCES public.clinics(id),
  item_id       uuid NOT NULL REFERENCES public.inventory_items(id),
  direction     text NOT NULL CHECK (direction IN ('in', 'out')),
  qty           numeric(10,2) NOT NULL CHECK (qty > 0),
  reason        text NOT NULL,
  -- 'purchase' | 'dispensed_checkout' | 'expired' | 'adjustment' | 'return'
  reference_id  uuid,           -- visit_id when reason = 'dispensed_checkout'
  notes         text,
  created_by    uuid REFERENCES public.staff(id),
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movements_item   ON public.stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_movements_clinic ON public.stock_movements(clinic_id, created_at DESC);

-- ── Seed common dental medicines for clinics that have none yet ──────────────
INSERT INTO public.inventory_items
  (clinic_id, category, name, strength, unit, price_per_unit, stock_qty, low_stock_threshold)
SELECT c.id, 'medicine', med.name, med.strength, med.unit, med.price, med.initial_stock, med.low_threshold
FROM public.clinics c
CROSS JOIN (VALUES
  ('Amoxicillin',             '500mg', 'capsule', 4.00,   100, 20),
  ('Amoxicillin',             '250mg', 'capsule', 2.50,   50,  10),
  ('Metronidazole',           '400mg', 'tablet',  2.00,   100, 20),
  ('Metronidazole',           '200mg', 'tablet',  1.50,   50,  10),
  ('Ibuprofen',               '400mg', 'tablet',  1.50,   100, 20),
  ('Ibuprofen',               '200mg', 'tablet',  1.00,   50,  10),
  ('Paracetamol',             '500mg', 'tablet',  1.00,   100, 20),
  ('Diclofenac',              '50mg',  'tablet',  3.00,   50,  10),
  ('Clindamycin',             '300mg', 'capsule', 12.00,  50,  10),
  ('Pantoprazole',            '40mg',  'tablet',  5.00,   50,  10),
  ('Cetirizine',              '10mg',  'tablet',  2.00,   50,  10),
  ('Prednisolone',            '5mg',   'tablet',  3.00,   30,  5),
  ('Chlorhexidine Mouthwash', '0.2%',  'bottle',  80.00,  20,  5),
  ('Betadine Mouthwash',      '2%',    'bottle',  75.00,  20,  5),
  ('Lignocaine Gel',          '2%',    'tube',    120.00, 10,  3),
  ('Eugenol',                 NULL,    'bottle',  200.00, 5,   2),
  ('Zinc Oxide',              NULL,    'pack',    150.00, 5,   2),
  ('GIC Cement',              NULL,    'pack',    350.00, 5,   2),
  ('Calcium Hydroxide',       NULL,    'pack',    250.00, 5,   2),
  ('Temporary Cement',        NULL,    'pack',    180.00, 5,   2)
) AS med(name, strength, unit, price, initial_stock, low_threshold)
WHERE NOT EXISTS (
  SELECT 1 FROM public.inventory_items i WHERE i.clinic_id = c.id AND i.category = 'medicine'
)
ON CONFLICT (clinic_id, name, strength) DO NOTHING;
