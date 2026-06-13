-- 019_inventory_aliases.sql
-- Inventory voice module — deterministic alias matching (NaOCl → Sodium Hypochlorite, …).
-- Run in the Supabase SQL Editor, after 018. Idempotent.

ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS aliases text[] DEFAULT '{}';

-- Seed common clinic abbreviations onto existing items (per name, all clinics).
UPDATE inventory_items SET aliases = ARRAY['naocl','sodium hypo']
  WHERE aliases = '{}' AND name ILIKE 'sodium hypochlorite%';
UPDATE inventory_items SET aliases = ARRAY['la','lignocaine','lox']
  WHERE aliases = '{}' AND (name ILIKE 'lignocaine%' OR name ILIKE 'lidocaine%');
UPDATE inventory_items SET aliases = ARRAY['gic']
  WHERE aliases = '{}' AND name ILIKE 'glass ionomer%';
UPDATE inventory_items SET aliases = ARRAY['rmgic']
  WHERE aliases = '{}' AND name ILIKE 'resin modified%';
