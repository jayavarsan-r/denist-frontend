# Inventory Voice Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a multilingual, confirm-gated voice on-ramp for inventory (add / restock / adjust / query / reorder) that produces *intent* only and routes every write through the existing `/api/inventory/*` CRUD.

**Architecture:** Synchronous `record → /api/ai/transcribe (Sarvam) → /api/ai/extract-inventory (Gemini, clinic catalog injected) → pure resolver → InventoryVoiceSheet → confirm → existing CRUD`. Voice never writes directly. Resolution is a **pure function over an in-memory catalog** (DB-free, heavily testable). Queries/reorder are answered deterministically from the DB, never by the LLM.

**Tech Stack:** Node/Express + Supabase (CommonJS), Gemini 2.5 Flash Lite via `services/ai/providers/gemini.provider`, Sarvam STT, Jest + supertest (backend). Frontend: Next.js 16 + Zustand + CSS-var styling (no Tailwind, **no frontend test runner** — frontend tasks verify via `npm run build` + manual).

**Conventions:**
- All commits end with the trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Work on a feature branch/worktree (set up at execution time via superpowers:using-git-worktrees), not `main`.
- Backend tests live in `backend/tests/phase5/`. Run from `backend/`.
- Spec: `docs/superpowers/specs/2026-06-13-inventory-voice-module-design.md`.

**Shared constants (used across tasks):**
- `INTENT_MIN = 0.75` — below → force manual intent selection.
- `ITEM_MIN = 0.6` — item confidence below this (or `match_reason === 'none'`) → unmatched, must pick/create.
- Quantity sanity: flag when `qty > 1000` **or** `qty > 10 × current_stock`.

---

## File Structure

**Backend — create**
- `backend/migrations/019_inventory_aliases.sql` — adds `inventory_items.aliases text[]` + seeds common abbreviations.
- `backend/src/services/ai/prompts/inventory.prompt.js` — Gemini system instruction (catalog-injected).
- `backend/src/services/inventory-voice.service.js` — orchestrator: catalog fetch → extract → resolve → deterministic answer.
- `backend/tests/phase5/inventory-resolver.test.js`
- `backend/tests/phase5/inventory-prompt.test.js`
- `backend/tests/phase5/inventory-extract.service.test.js`
- `backend/tests/phase5/inventory-voice.service.test.js`
- `backend/tests/phase5/inventory-voice.route.test.js`

**Backend — modify**
- `backend/src/services/inventory.service.js` — add pure `resolveInventorySpan(catalog, span, hints)` (export it).
- `backend/src/services/ai/ai.service.js` — add `extractInventory(transcript, catalog)`.
- `backend/src/services/ai/providers/mock.provider.js` — add `inventory(transcript)`.
- `backend/src/controllers/ai.controller.js` — add `extractInventory`.
- `backend/src/routes/ai.routes.js` — register `POST /extract-inventory` (auth + requireClinic).

**Frontend — create**
- `dentai-app/components/sheets/InventoryVoiceSheet.jsx` — the entire voice flow (idle/listening/transcribing/review/answer/recovery).

**Frontend — modify**
- `dentai-app/lib/services/ai.service.js` — add `extractInventoryCommand(transcript)`.
- `dentai-app/components/SheetHost.jsx` — register `inventoryVoice`.
- `dentai-app/app/finance/inventory/page.jsx` — add a mic button → `openSheet('inventoryVoice', { onSaved: load })`.

---

## Phase 0 — Schema

### Task 1: Aliases column + seed

**Files:**
- Create: `backend/migrations/019_inventory_aliases.sql`

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Verify syntax locally (no live DB needed)**

Run: `grep -c "ADD COLUMN IF NOT EXISTS aliases" backend/migrations/019_inventory_aliases.sql`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/019_inventory_aliases.sql
git commit -m "feat(inventory): add aliases column migration for voice resolver"
```

> **Manual step (owner):** run `019_inventory_aliases.sql` in the Supabase SQL Editor after `018`. The resolver degrades gracefully if the column is absent (alias step simply never matches), so code can ship before the migration runs.

---

## Phase 1 — Backend (extraction + resolution + route)

### Task 2: Pure resolver `resolveInventorySpan`

**Files:**
- Modify: `backend/src/services/inventory.service.js` (add + export `resolveInventorySpan`)
- Test: `backend/tests/phase5/inventory-resolver.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// backend/tests/phase5/inventory-resolver.test.js
const { resolveInventorySpan } = require('../../src/services/inventory.service');

const CATALOG = [
  { id: 'a', name: 'Amoxicillin', strength: '500mg', unit: 'capsule', category: 'medicine', stock_qty: 100, low_stock_threshold: 20, aliases: [] },
  { id: 'a2', name: 'Amoxicillin', strength: '250mg', unit: 'capsule', category: 'medicine', stock_qty: 50, low_stock_threshold: 20, aliases: [] },
  { id: 'g', name: 'Latex Gloves', strength: null, unit: 'box', category: 'consumable', stock_qty: 12, low_stock_threshold: 10, aliases: ['gloves'] },
  { id: 'n', name: 'Sodium Hypochlorite', strength: '3%', unit: 'bottle', category: 'consumable', stock_qty: 8, low_stock_threshold: 5, aliases: ['naocl', 'sodium hypo'] },
  { id: 'z', name: 'Zirconia Block', strength: null, unit: 'piece', category: 'equipment', stock_qty: 4, low_stock_threshold: 2, aliases: [] },
];

describe('resolveInventorySpan', () => {
  test('exact name (single match)', () => {
    const r = resolveInventorySpan(CATALOG, 'Sodium Hypochlorite');
    expect(r.resolved_item_id).toBe('n');
    expect(r.match_reason).toBe('exact_name');
    expect(r.confidence).toBeGreaterThanOrEqual(0.95);
  });

  test('alias match (NaOCl)', () => {
    const r = resolveInventorySpan(CATALOG, 'NaOCl');
    expect(r.resolved_item_id).toBe('n');
    expect(r.match_reason).toBe('alias_match');
  });

  test('strength disambiguation between duplicate names', () => {
    const r = resolveInventorySpan(CATALOG, 'amoxicillin', { strength: '250mg' });
    expect(r.resolved_item_id).toBe('a2');
    expect(r.match_reason).toBe('strength_match');
  });

  test('ambiguous duplicate names without a hint → candidates, low confidence', () => {
    const r = resolveInventorySpan(CATALOG, 'amoxicillin');
    expect(r.resolved_item_id).toBeNull();
    expect(r.candidates.map((c) => c.id).sort()).toEqual(['a', 'a2']);
    expect(r.confidence).toBeLessThan(0.6);
  });

  test('non-medicine fuzzy/alias match (gloves)', () => {
    const r = resolveInventorySpan(CATALOG, 'gloves');
    expect(r.resolved_item_id).toBe('g');
  });

  test('unknown span → none', () => {
    const r = resolveInventorySpan(CATALOG, 'titanium screws');
    expect(r.resolved_item_id).toBeNull();
    expect(r.match_reason).toBe('none');
    expect(r.confidence).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/phase5/inventory-resolver.test.js`
Expected: FAIL — `resolveInventorySpan is not a function`.

- [ ] **Step 3: Implement the resolver** (append to `backend/src/services/inventory.service.js`, before `module.exports`)

```javascript
// ── Inventory-agnostic voice resolver (pure: catalog in, resolution out) ────────
// Used by the inventory voice module. Distinct from resolveMedicineSpan (which is
// medicine-specific and queries the DB for checkout) — that stays untouched.
const _norm = (s) => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
const _firstWord = (s) => _norm(s).split(' ')[0] || '';
const _slim = (i) => ({ id: i.id, name: i.name, strength: i.strength || null, unit: i.unit || null });

function _resolution(span, item, confidence, reason, candidates = []) {
  return {
    name_span: span,
    resolved_item_id: item ? item.id : null,
    resolved_name: item ? item.name : null,
    confidence,
    match_reason: reason,
    candidates,
    current_stock: item ? Number(item.stock_qty) : null,
    current_unit: item ? item.unit : null,
    current_price: item ? (item.price_per_unit ?? null) : null,
  };
}

// resolveInventorySpan(catalog, span, hints?) — hints: { strength?, category? }
function resolveInventorySpan(catalog, span, hints = {}) {
  const items = Array.isArray(catalog) ? catalog : [];
  const s = _norm(span);
  if (!s) return _resolution(span, null, 0, 'none');

  // 1. exact name
  const exact = items.filter((i) => _norm(i.name) === s);
  if (exact.length === 1) return _resolution(span, exact[0], 0.99, 'exact_name');

  // 2. alias
  const alias = items.filter((i) => (i.aliases || []).some((a) => _norm(a) === s));
  if (alias.length === 1) return _resolution(span, alias[0], 0.95, 'alias_match');

  // candidate pool: substring either way, or shared first word, or alias-substring
  const cand = items.filter((i) => {
    const n = _norm(i.name);
    return n.includes(s) || s.includes(n) || _firstWord(n) === _firstWord(s) ||
      (i.aliases || []).some((a) => _norm(a).includes(s) || s.includes(_norm(a)));
  });
  const pool = exact.length > 1 ? exact : cand;

  // 3. strength disambiguation
  const strHint = _norm(hints.strength || span).match(/\d+\s*(mg|ml|mcg|g|%)/);
  if (pool.length > 1 && strHint) {
    const sh = strHint[0].replace(/\s/g, '');
    const sm = pool.filter((i) => _norm(i.strength).replace(/\s/g, '') === sh);
    if (sm.length === 1) return _resolution(span, sm[0], 0.9, 'strength_match');
  }

  // 4. category narrowing
  if (pool.length > 1 && hints.category) {
    const cm = pool.filter((i) => i.category === hints.category);
    if (cm.length === 1) return _resolution(span, cm[0], 0.8, 'category_match');
  }

  // 5. single fuzzy candidate
  if (cand.length === 1 && exact.length === 0) return _resolution(span, cand[0], 0.7, 'fuzzy_match');

  // ambiguous → no auto-pick; surface candidates for manual selection
  if (pool.length > 1) {
    return _resolution(span, null, 0.4, 'fuzzy_match', pool.slice(0, 5).map(_slim));
  }

  // 6. none
  return _resolution(span, null, 0, 'none');
}
```

Then extend the exports line:

```javascript
module.exports = { recordStockMovement, dispenseMedicinesAtCheckout, resolveMedicineSpan, resolveInventorySpan };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/phase5/inventory-resolver.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/inventory.service.js backend/tests/phase5/inventory-resolver.test.js
git commit -m "feat(inventory): add pure inventory-agnostic voice resolver"
```

---

### Task 3: Inventory extraction prompt

**Files:**
- Create: `backend/src/services/ai/prompts/inventory.prompt.js`
- Test: `backend/tests/phase5/inventory-prompt.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// backend/tests/phase5/inventory-prompt.test.js
const inventoryPrompt = require('../../src/services/ai/prompts/inventory.prompt');

test('prompt injects the catalog and the intent schema rules', () => {
  const p = inventoryPrompt([
    { name: 'Amoxicillin', strength: '500mg', category: 'medicine', aliases: [] },
    { name: 'Latex Gloves', strength: null, category: 'consumable', aliases: ['gloves'] },
  ]);
  expect(typeof p).toBe('string');
  expect(p).toContain('Amoxicillin');
  expect(p).toContain('Latex Gloves');
  expect(p).toContain('intent_confidence');
  expect(p).toContain('set_to_level');
  // language coverage
  expect(p.toLowerCase()).toContain('any');
});

test('empty catalog still returns a valid string', () => {
  expect(typeof inventoryPrompt([])).toBe('string');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest tests/phase5/inventory-prompt.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the prompt**

```javascript
// backend/src/services/ai/prompts/inventory.prompt.js
// Inventory voice extraction — Gemini system instruction. Transcript is the user
// content. The clinic catalog is injected so spoken words map to THIS clinic's
// items. The model CLASSIFIES + EXTRACTS only — it never executes, never invents
// stock numbers, and never decides reorder contents.

module.exports = function inventoryPrompt(catalog = []) {
  const lines = (catalog || []).slice(0, 300).map((i) => {
    const al = (i.aliases || []).length ? ` [aliases: ${i.aliases.join(', ')}]` : '';
    return `- ${i.name}${i.strength ? ` ${i.strength}` : ''} (${i.category || 'item'})${al}`;
  }).join('\n') || '(catalog is empty)';

  return `You are an inventory assistant for an Indian dental clinic. A staff member dictated a short voice note about clinic stock. Classify the intent and extract the items. You DO NOT execute anything and you NEVER output stock numbers from your own knowledge.

The staff may speak in ANY major Indian language (Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi, Odia, English) or a code-mix ("gloves 50 restock pannu", "do composite low hai"). Item names are often English even inside another language. ALWAYS output canonical English names and Arabic numerals.

This clinic's inventory catalog (map spoken words to these items; this includes medicines AND consumables/equipment — gloves, burs, cements, zirconia blocks, impression material, implant kits, etc.):
${lines}

DELTA vs ABSOLUTE (critical):
- "add N", "restock N", "buy N more" → a delta → set "qty".
- "set X to N", "X actually N", "stock count says N", "count is N" → an absolute physical count → intent "adjust" with "set_to_level": N (NOT qty).

INTENTS:
- "add": a NEW item the catalog does not contain (collect unit/price/threshold if spoken).
- "restock": increase an EXISTING item by qty.
- "adjust": set an EXISTING item to an absolute level (physical count / correction).
- "query": a question — "how many X left", "do we have X", "what is low" → fill "query".
- "reorder": "what should I reorder / order this week" → set intent "reorder" (NO items; the system computes the list).
- "unknown": you cannot tell.

Return ONLY valid JSON with this exact schema — no markdown, no prose:

{
  "intent": "add | restock | adjust | query | reorder | unknown",
  "intent_confidence": 0.0,
  "items": [
    {
      "name_span": "the spoken item name, normalised to English",
      "strength": "e.g. 500mg | null",
      "unit": "e.g. capsule | box | bottle | null",
      "category": "medicine | consumable | equipment | null",
      "qty": 0,
      "set_to_level": null,
      "price_per_unit": null,
      "low_stock_threshold": null
    }
  ],
  "query": { "kind": "count | exists | low_stock", "target_span": "X or null" },
  "unclear_spans": []
}

Rules:
- "intent_confidence" reflects YOUR certainty about the intent (0..1). If a phrase like "add 50 implants" is genuinely ambiguous between add/restock/adjust, lower it (e.g. 0.5).
- Support MULTIPLE items in one note ("restock 20 gloves, 10 masks, 5 implant kits" → 3 items).
- Use "qty" for deltas, "set_to_level" for absolute counts. Never both on one item.
- For "query"/"reorder", "items" MUST be []. Omit "query" (or set null) unless intent is "query".
- NEVER guess stock levels, prices, or reorder lists — leave unknown numeric fields null.`;
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npx jest tests/phase5/inventory-prompt.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/ai/prompts/inventory.prompt.js backend/tests/phase5/inventory-prompt.test.js
git commit -m "feat(inventory): add Gemini inventory extraction prompt"
```

---

### Task 4: `extractInventory` in ai.service + mock provider

**Files:**
- Modify: `backend/src/services/ai/ai.service.js`
- Modify: `backend/src/services/ai/providers/mock.provider.js`
- Test: `backend/tests/phase5/inventory-extract.service.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// backend/tests/phase5/inventory-extract.service.test.js
jest.mock('../../src/services/ai/providers/gemini.provider', () => ({
  generate: jest.fn(),
  hasKey: () => true,
}));
const gemini = require('../../src/services/ai/providers/gemini.provider');
const aiService = require('../../src/services/ai/ai.service');

beforeEach(() => gemini.generate.mockReset());

test('extractInventory passes the catalog-injected prompt + transcript and returns parsed JSON', async () => {
  const parsed = { intent: 'restock', intent_confidence: 0.9, items: [{ name_span: 'gloves', qty: 50 }], query: null, unclear_spans: [] };
  gemini.generate.mockResolvedValue(parsed);

  const out = await aiService.extractInventory('restock 50 gloves', [{ name: 'Latex Gloves', category: 'consumable', aliases: ['gloves'] }]);

  expect(out).toEqual(parsed);
  const [systemPrompt, userContent, opts] = gemini.generate.mock.calls[0];
  expect(systemPrompt).toContain('Latex Gloves');
  expect(userContent).toBe('restock 50 gloves');
  expect(opts.temperature).toBe(0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest tests/phase5/inventory-extract.service.test.js`
Expected: FAIL — `aiService.extractInventory is not a function`.

- [ ] **Step 3a: Implement `extractInventory`** (in `backend/src/services/ai/ai.service.js`)

Add the require near the other prompt requires:

```javascript
const inventoryPrompt = require('./prompts/inventory.prompt');
```

Add the function (next to `extractPrescription`):

```javascript
// Inventory voice extraction — classify + extract only (see inventory.prompt.js).
// temperature 0: this is transcription, not creativity.
async function extractInventory(transcript, catalog = []) {
  if (gemini.hasKey()) {
    return gemini.generate(inventoryPrompt(catalog), transcript, { temperature: 0, maxOutputTokens: 800 });
  }
  if (isDev()) { logger.warn('GEMINI_API_KEY missing — mock inventory extraction (dev)'); return mock.inventory(transcript); }
  throw noLlm();
}
```

Add it to the exports object:

```javascript
module.exports = {
  transcribeAudio,
  extractPrescription,
  extractQueueContext,
  parseScheduleIntent,
  extractInventory,
};
```

- [ ] **Step 3b: Add the dev mock** (in `backend/src/services/ai/providers/mock.provider.js`, inside `module.exports = { … }`)

```javascript
  // Dev-only stub for inventory voice when GEMINI_API_KEY is absent.
  inventory(transcript = '') {
    const t = String(transcript).toLowerCase();
    if (t.includes('low') || t.includes('reorder')) {
      return { intent: 'reorder', intent_confidence: 0.9, items: [], query: { kind: 'low_stock', target_span: null }, unclear_spans: [] };
    }
    return {
      intent: 'restock', intent_confidence: 0.8,
      items: [{ name_span: 'gloves', strength: null, unit: 'box', category: 'consumable', qty: 50, set_to_level: null, price_per_unit: null, low_stock_threshold: null }],
      query: null, unclear_spans: [],
    };
  },
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npx jest tests/phase5/inventory-extract.service.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/ai/ai.service.js backend/src/services/ai/providers/mock.provider.js backend/tests/phase5/inventory-extract.service.test.js
git commit -m "feat(inventory): add extractInventory ai-service method + dev mock"
```

---

### Task 5: Orchestrator `parseInventoryCommand`

**Files:**
- Create: `backend/src/services/inventory-voice.service.js`
- Test: `backend/tests/phase5/inventory-voice.service.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// backend/tests/phase5/inventory-voice.service.test.js
jest.mock('../../src/services/ai/ai.service', () => ({ extractInventory: jest.fn() }));
jest.mock('../../src/config/supabase', () => {
  const chain = () => {
    const q = {};
    ['select', 'eq', 'order'].forEach((m) => { q[m] = () => q; });
    q.then = (res) => res({ data: global.__catalog || [], error: null });
    return q;
  };
  return { from: () => chain() };
});

const aiService = require('../../src/services/ai/ai.service');
const { parseInventoryCommand } = require('../../src/services/inventory-voice.service');

const CATALOG = [
  { id: 'g', name: 'Latex Gloves', strength: null, unit: 'box', category: 'consumable', stock_qty: 12, low_stock_threshold: 10, aliases: ['gloves'], price_per_unit: 200 },
  { id: 'c', name: 'Composite', strength: null, unit: 'syringe', category: 'consumable', stock_qty: 3, low_stock_threshold: 5, aliases: [], price_per_unit: 800 },
];

beforeEach(() => { global.__catalog = CATALOG; aiService.extractInventory.mockReset(); });

test('restock intent resolves the item and attaches current_stock', async () => {
  aiService.extractInventory.mockResolvedValue({ intent: 'restock', intent_confidence: 0.9, items: [{ name_span: 'gloves', qty: 50 }], query: null, unclear_spans: [] });
  const out = await parseInventoryCommand('CLINIC', 'restock 50 gloves');
  expect(out.intent).toBe('restock');
  expect(out.items[0].resolved_item_id).toBe('g');
  expect(out.items[0].current_stock).toBe(12);
});

test('query count answers deterministically from the catalog', async () => {
  aiService.extractInventory.mockResolvedValue({ intent: 'query', intent_confidence: 0.95, items: [], query: { kind: 'count', target_span: 'composite' }, unclear_spans: [] });
  const out = await parseInventoryCommand('CLINIC', 'how much composite');
  expect(out.answer.kind).toBe('count');
  expect(out.answer.stock_qty).toBe(3);
});

test('reorder lists low-stock items from the DB, never the LLM', async () => {
  aiService.extractInventory.mockResolvedValue({ intent: 'reorder', intent_confidence: 0.9, items: [], query: null, unclear_spans: [] });
  const out = await parseInventoryCommand('CLINIC', 'what should I reorder');
  expect(out.answer.kind).toBe('low_stock');
  expect(out.answer.items.map((i) => i.id)).toEqual(['c']); // 3 <= 5
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest tests/phase5/inventory-voice.service.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the orchestrator**

```javascript
// backend/src/services/inventory-voice.service.js
// Orchestrates the inventory voice flow: load the clinic catalog → LLM extract →
// pure resolve each item → deterministic answer for query/reorder. Returns intent
// only; it NEVER writes. All writes happen later through /api/inventory/* CRUD.

const supabase = require('../config/supabase');
const aiService = require('./ai/ai.service');
const { resolveInventorySpan } = require('./inventory.service');

const CATALOG_SELECT = 'id, name, strength, unit, category, aliases, stock_qty, low_stock_threshold, price_per_unit';
const slim = (i) => ({ id: i.id, name: i.name, strength: i.strength || null, unit: i.unit || null, stock_qty: Number(i.stock_qty), low_stock_threshold: Number(i.low_stock_threshold) });

async function loadCatalog(clinicId) {
  const { data, error } = await supabase.from('inventory_items')
    .select(CATALOG_SELECT).eq('clinic_id', clinicId).eq('active', true).order('name');
  if (error) throw error;
  return data || [];
}

function lowStock(catalog) {
  return catalog.filter((i) => Number(i.stock_qty) <= Number(i.low_stock_threshold)).map(slim);
}

async function parseInventoryCommand(clinicId, transcript) {
  const catalog = await loadCatalog(clinicId);
  const raw = await aiService.extractInventory(transcript, catalog);

  const items = (raw.items || []).map((it) => {
    const res = resolveInventorySpan(catalog, it.name_span, { strength: it.strength, category: it.category });
    return { ...it, ...res };
  });

  let answer = null;
  const q = raw.query || {};
  if (raw.intent === 'reorder' || q.kind === 'low_stock') {
    answer = { kind: 'low_stock', items: lowStock(catalog) };
  } else if (raw.intent === 'query' && (q.kind === 'count' || q.kind === 'exists')) {
    const res = resolveInventorySpan(catalog, q.target_span, {});
    const item = res.resolved_item_id ? catalog.find((i) => i.id === res.resolved_item_id) : null;
    answer = {
      kind: q.kind,
      resolved_name: res.resolved_name,
      exists: !!item,
      stock_qty: item ? Number(item.stock_qty) : 0,
      unit: item ? item.unit : null,
      confidence: res.confidence,
    };
  }

  return {
    intent: raw.intent || 'unknown',
    intent_confidence: typeof raw.intent_confidence === 'number' ? raw.intent_confidence : 0,
    items,
    query: raw.query || null,
    answer,
    unclear_spans: raw.unclear_spans || [],
  };
}

module.exports = { parseInventoryCommand, loadCatalog };
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npx jest tests/phase5/inventory-voice.service.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/inventory-voice.service.js backend/tests/phase5/inventory-voice.service.test.js
git commit -m "feat(inventory): add parseInventoryCommand orchestrator (resolve + deterministic answers)"
```

---

### Task 6: Controller + route (`POST /api/ai/extract-inventory`)

**Files:**
- Modify: `backend/src/controllers/ai.controller.js`
- Modify: `backend/src/routes/ai.routes.js`
- Test: `backend/tests/phase5/inventory-voice.route.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// backend/tests/phase5/inventory-voice.route.test.js
jest.mock('../../src/middleware/auth', () => (req, _res, next) => { req.clinicId = 'CLINIC_TEST'; req.staffId = 'STAFF_TEST'; next(); });
jest.mock('../../src/middleware/requireClinic', () => (req, _res, next) => next());
jest.mock('../../src/services/inventory-voice.service', () => ({
  parseInventoryCommand: jest.fn(),
}));
jest.mock('../../src/services/audit.service', () => ({ log: jest.fn() }));

const express = require('express');
const request = require('supertest');
const { responseEnvelope } = require('../../src/utils/response');
const errorHandler = require('../../src/middleware/errorHandler');
const aiRoutes = require('../../src/routes/ai.routes');
const voice = require('../../src/services/inventory-voice.service');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(responseEnvelope);
  app.use('/api/ai', aiRoutes);
  app.use(errorHandler);
  return app;
}
const app = buildApp();

test('400 when transcript missing', async () => {
  const res = await request(app).post('/api/ai/extract-inventory').send({});
  expect(res.status).toBe(400);
});

test('200 returns the parsed command for the caller clinic', async () => {
  voice.parseInventoryCommand.mockResolvedValue({ intent: 'restock', intent_confidence: 0.9, items: [], query: null, answer: null, unclear_spans: [] });
  const res = await request(app).post('/api/ai/extract-inventory').send({ transcript: 'restock 50 gloves' });
  expect(res.status).toBe(200);
  expect(res.body.data.intent).toBe('restock');
  expect(voice.parseInventoryCommand).toHaveBeenCalledWith('CLINIC_TEST', 'restock 50 gloves');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest tests/phase5/inventory-voice.route.test.js`
Expected: FAIL — route 404 / handler undefined.

- [ ] **Step 3a: Add the controller** (in `backend/src/controllers/ai.controller.js`)

Add the requires near the top (after the existing requires):

```javascript
const inventoryVoice = require('../services/inventory-voice.service');
const audit = require('../services/audit.service');
```

Add the handler (after `extractPrescription`):

```javascript
// POST /api/ai/extract-inventory — voice → inventory INTENT only (never writes).
// Requires clinic context; resolution is clinic-scoped. The raw transcript is
// recorded in the audit log (debugging) — it is never returned for display.
exports.extractInventory = async (req, res, next) => {
  try {
    const { transcript } = req.body;
    if (!transcript) return res.status(400).json({ error: 'transcript required' });
    const result = await inventoryVoice.parseInventoryCommand(req.clinicId, transcript);
    audit.log({
      clinicId: req.clinicId, staffId: req.staffId, requestId: req.id,
      action: 'VOICE_INVENTORY_PARSE', entityType: 'inventory_voice', entityId: null,
      metadata: { transcript: String(transcript).slice(0, 500), intent: result.intent },
    });
    res.json(result);
  } catch (e) { next(e); }
};
```

- [ ] **Step 3b: Register the route** (in `backend/src/routes/ai.routes.js`)

Add the requireClinic import and the route:

```javascript
const requireClinic = require('../middleware/requireClinic');
```

```javascript
// Inventory voice — clinic context required (resolution is clinic-scoped).
router.post('/extract-inventory', auth, requireClinic, ctrl.extractInventory);
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npx jest tests/phase5/inventory-voice.route.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the whole backend suite (no regressions)**

Run: `cd backend && npm test`
Expected: all suites pass (previous 30 suites/147 tests + 5 new phase5 files green).

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/ai.controller.js backend/src/routes/ai.routes.js backend/tests/phase5/inventory-voice.route.test.js
git commit -m "feat(inventory): add POST /api/ai/extract-inventory route + audit"
```

---

## Phase 2 — Frontend (sheet + wiring)

> **No frontend test runner exists** (dentai-app has no `test` script). Frontend tasks verify with `cd dentai-app && npm run build` (must compile clean) and a manual smoke via `./run.sh`. Logic is covered by the backend tests above.

### Task 7: Frontend service method

**Files:**
- Modify: `dentai-app/lib/services/ai.service.js`

- [ ] **Step 1: Add the method** (append near the other extract helpers)

```javascript
// Inventory voice — transcript → parsed inventory command (intent + resolved items
// + deterministic answer). The interceptor unwraps the { success, data } envelope.
export async function extractInventoryCommand(transcript) {
  const { data } = await apiClient.post('/api/ai/extract-inventory', { transcript });
  return data;
}
```

- [ ] **Step 2: Verify build compiles**

Run: `cd dentai-app && npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add dentai-app/lib/services/ai.service.js
git commit -m "feat(inventory): frontend extractInventoryCommand service"
```

---

### Task 8: `InventoryVoiceSheet`

**Files:**
- Create: `dentai-app/components/sheets/InventoryVoiceSheet.jsx`

This sheet owns the full flow: idle (examples) → listening → transcribing → review (mutations, confirm-gated) / answer (query/reorder) / recovery (unknown). Commit fans out per item through the existing inventory services.

- [ ] **Step 1: Create the sheet**

```jsx
'use client';
import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { SheetHeader, PrimaryButton } from '@/components/ui';
import Icon from '@/components/icons';
import { useAudioRecorder } from '@/lib/hooks/useAudioRecorder';
import { useTranscription } from '@/lib/hooks/useTranscription';
import { extractInventoryCommand } from '@/lib/services/ai.service';
import { createInventoryItem, stockIn, adjustStock } from '@/lib/services/inventory.service';

const INTENT_MIN = 0.75;
const ITEM_MIN = 0.6;
const EXAMPLES = [
  'Add 50 gloves',
  'Restock sodium hypochlorite',
  'Set composite stock to 25',
  'How many implant kits are left?',
  'Show low stock items',
];
const INTENTS = [
  { id: 'restock', label: 'Restock (+)' },
  { id: 'adjust', label: 'Set to (count)' },
  { id: 'add', label: 'Add new' },
];

// Resulting stock for a mutation row, given the (possibly user-edited) values.
function resulting(row) {
  const cur = Number(row.current_stock || 0);
  if (row._intent === 'adjust') return Number(row.set_to_level ?? cur);
  if (row._intent === 'restock') return cur + Number(row.qty || 0);
  return Number(row.qty || 0); // add → opening stock
}
function changeText(row) {
  const cur = Number(row.current_stock || 0);
  const next = resulting(row);
  if (row._intent === 'add') return `opening ${next}`;
  const d = next - cur;
  return `${d >= 0 ? '+' : ''}${d}`;
}
function outOfBounds(row) {
  const n = row._intent === 'adjust' ? Number(row.set_to_level || 0) : Number(row.qty || 0);
  const cur = Number(row.current_stock || 0);
  return n > 1000 || (cur > 0 && n > cur * 10);
}

export default function InventoryVoiceSheet({ params = {}, onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const { isRecording, seconds, startRecording, stopRecording, error: recError } = useAudioRecorder();
  const { transcribe } = useTranscription('inventory');

  const [phase, setPhase] = useState('idle'); // idle | working | review | answer | recovery
  const [intent, setIntent] = useState('restock');
  const [intentConfident, setIntentConfident] = useState(true);
  const [rows, setRows] = useState([]);
  const [answer, setAnswer] = useState(null);
  const [committing, setCommitting] = useState(false);

  const begin = async () => { try { await startRecording(); } catch { /* recError shows */ } };

  const finish = async () => {
    const blob = await stopRecording();
    setPhase('working');
    const { text, warning } = await transcribe(blob);
    if (!text) { setPhase('recovery'); if (warning) showToast(warning); return; }
    try {
      const cmd = await extractInventoryCommand(text);
      if (cmd.intent === 'unknown') { setPhase('recovery'); return; }
      if (cmd.answer) { setAnswer(cmd.answer); setPhase('answer'); return; }
      setIntent(cmd.intent);
      setIntentConfident((cmd.intent_confidence ?? 0) >= INTENT_MIN);
      setRows((cmd.items || []).map((it) => ({ ...it, _intent: cmd.intent })));
      setPhase('review');
    } catch {
      showToast('Could not understand — try again');
      setPhase('recovery');
    }
  };

  const setRow = (i, patch) => setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const canCommit = rows.length > 0 && intentConfident &&
    rows.every((r) => (r._intent === 'add' || r.resolved_item_id) && r.confidence >= ITEM_MIN && !outOfBounds(r));

  const commit = async () => {
    if (!canCommit || committing) return;
    setCommitting(true);
    let okCount = 0;
    for (const r of rows) {
      try {
        if (r._intent === 'add') {
          await createInventoryItem({ category: r.category || 'medicine', name: r.name_span, strength: r.strength || null, unit: r.unit || 'piece', price_per_unit: r.price_per_unit ?? null, stock_qty: Number(r.qty || 0), low_stock_threshold: r.low_stock_threshold ?? 10 });
        } else if (r._intent === 'restock') {
          await stockIn(r.resolved_item_id, Number(r.qty || 0), 'via voice');
        } else { // adjust
          const cur = Number(r.current_stock || 0);
          const target = Number(r.set_to_level ?? cur);
          const delta = target - cur;
          if (delta !== 0) await adjustStock(r.resolved_item_id, { qty: Math.abs(delta), direction: delta >= 0 ? 'in' : 'out', reason: 'adjustment', notes: 'via voice' });
        }
        okCount += 1;
      } catch { /* per-row failure reported in aggregate */ }
    }
    showToast(okCount === rows.length ? 'Inventory updated' : `${okCount}/${rows.length} applied`);
    params.onSaved?.();
    onClose();
  };

  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title="Inventory voice" onClose={onClose} />

      {/* mic */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '8px 0 16px' }}>
        <button
          onClick={isRecording ? finish : begin}
          className="tap"
          style={{ width: 72, height: 72, borderRadius: '50%', background: isRecording ? 'var(--red)' : 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--elevation-2)' }}
        >
          <Icon name={isRecording ? 'stop' : 'mic'} size={28} color="#fff" />
        </button>
        <div className="t-meta">
          {isRecording ? `Listening… ${seconds}s — tap to finish` : phase === 'working' ? 'Understanding…' : 'Tap and speak (any language)'}
        </div>
        {recError && <div style={{ fontSize: 13, color: 'var(--red)', textAlign: 'center' }}>{recError}</div>}
      </div>

      {/* idle examples */}
      {phase === 'idle' && (
        <div className="card" style={{ padding: '12px 14px' }}>
          <div className="t-meta" style={{ marginBottom: 6 }}>Try saying</div>
          {EXAMPLES.map((e) => <div key={e} style={{ fontSize: 14.5, padding: '4px 0' }}>• {e}</div>)}
        </div>
      )}

      {/* recovery (unknown / failed) */}
      {phase === 'recovery' && (
        <div className="card" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>I couldn’t understand that.</div>
          {EXAMPLES.slice(0, 4).map((e) => <div key={e} style={{ fontSize: 14.5, padding: '4px 0', color: 'var(--text-secondary)' }}>• {e}</div>)}
        </div>
      )}

      {/* answer (query / reorder) */}
      {phase === 'answer' && answer && (
        <div className="card" style={{ padding: '12px 14px' }}>
          {answer.kind === 'low_stock' ? (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Low / out of stock ({answer.items.length})</div>
              {answer.items.length === 0 && <div className="t-meta">Everything is above its threshold.</div>}
              {answer.items.map((i) => (
                <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: 14.5, fontWeight: 600 }}>{i.name}{i.strength ? ` ${i.strength}` : ''}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: i.stock_qty <= 0 ? 'var(--red)' : 'var(--amber)' }}>{i.stock_qty} {i.unit || ''}</span>
                </div>
              ))}
            </>
          ) : (
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              {answer.exists ? `${answer.resolved_name}: ${answer.stock_qty} ${answer.unit || ''} in stock` : 'Not in your inventory.'}
            </div>
          )}
        </div>
      )}

      {/* review (mutations) */}
      {phase === 'review' && (
        <>
          {!intentConfident && (
            <div style={{ marginBottom: 10 }}>
              <div className="t-meta" style={{ marginBottom: 6 }}>Not sure what you meant — pick one:</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {INTENTS.map((it) => (
                  <button key={it.id} onClick={() => { setIntent(it.id); setIntentConfident(true); setRows((cur) => cur.map((r) => ({ ...r, _intent: it.id }))); }}
                    style={{ flex: 1, height: 34, borderRadius: 10, fontSize: 13, fontWeight: 600, background: intent === it.id ? 'var(--accent)' : '#fff', color: intent === it.id ? 'var(--accent-ink)' : 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                    {it.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {rows.map((r, i) => {
            const unmatched = r._intent !== 'add' && (!r.resolved_item_id || r.confidence < ITEM_MIN);
            const oob = outOfBounds(r);
            return (
              <div key={i} className="card" style={{ padding: '12px 14px', marginBottom: 10, borderLeft: unmatched || oob ? '3px solid var(--red)' : 'none' }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  {r._intent === 'add' ? `${r.name_span} (new)` : (r.resolved_name || r.name_span)}
                  {r.match_reason && r._intent !== 'add' && <span className="t-meta" style={{ marginLeft: 8 }}>{r.match_reason}</span>}
                </div>

                {unmatched ? (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 13, color: 'var(--red)', marginBottom: 4 }}>No confident match — pick:</div>
                    {(r.candidates || []).map((c) => (
                      <button key={c.id} onClick={() => setRow(i, { resolved_item_id: c.id, resolved_name: c.name, confidence: 0.95, current_stock: c.stock_qty ?? r.current_stock })}
                        style={{ display: 'block', textAlign: 'left', width: '100%', padding: '6px 0', fontSize: 14, fontWeight: 600 }}>
                        {c.name}{c.strength ? ` ${c.strength}` : ''}
                      </button>
                    ))}
                    {(r.candidates || []).length === 0 && <div className="t-meta">Not in inventory — say “add …” to create it first.</div>}
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                    <span className="t-meta">{r._intent === 'add' ? 'Opening' : `Current ${r.current_stock}`}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        value={r._intent === 'adjust' ? (r.set_to_level ?? '') : (r.qty ?? '')}
                        onChange={(e) => { const val = e.target.value.replace(/[^0-9.]/g, ''); setRow(i, r._intent === 'adjust' ? { set_to_level: val } : { qty: val }); }}
                        inputMode="decimal"
                        style={{ width: 64, textAlign: 'right', fontSize: 16, fontWeight: 700, border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px', outline: 'none' }}
                      />
                      <span style={{ fontSize: 13, fontWeight: 700, color: oob ? 'var(--red)' : 'var(--text-secondary)' }}>→ {resulting(r)}</span>
                    </span>
                  </div>
                )}
                {oob && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 6 }}>That’s unusually large — check the number.</div>}
                {!unmatched && r._intent !== 'add' && <div className="t-meta" style={{ marginTop: 4 }}>Change {changeText(r)}</div>}
              </div>
            );
          })}

          <PrimaryButton onClick={commit} disabled={!canCommit || committing}>
            {committing ? 'Applying…' : `Confirm ${rows.length} change${rows.length === 1 ? '' : 's'}`}
          </PrimaryButton>
          {!canCommit && <div className="t-meta" style={{ textAlign: 'center', marginTop: 8 }}>Resolve the flagged rows to confirm.</div>}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build compiles**

Run: `cd dentai-app && npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add dentai-app/components/sheets/InventoryVoiceSheet.jsx
git commit -m "feat(inventory): InventoryVoiceSheet (confirm-gated multilingual voice flow)"
```

---

### Task 9: Register sheet + mic entry point

**Files:**
- Modify: `dentai-app/components/SheetHost.jsx`
- Modify: `dentai-app/app/finance/inventory/page.jsx`

- [ ] **Step 1: Register the sheet** (in `SheetHost.jsx`)

Add the import beside the other inventory sheet imports:

```javascript
import InventoryVoiceSheet from '@/components/sheets/InventoryVoiceSheet';
```

Add to the `SHEETS` map:

```javascript
  inventoryVoice: InventoryVoiceSheet,
```

- [ ] **Step 2: Add the mic button** (in `app/finance/inventory/page.jsx`)

The `NavBar` already has a `right` "Add item" button. Replace its `right` prop with a two-button cluster (mic + Add item):

```jsx
        right={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button onClick={() => openSheet('inventoryVoice', { onSaved: load })} aria-label="Voice" style={{ color: 'var(--blue)', display: 'flex', alignItems: 'center' }}>
              <Icon name="mic" size={20} color="var(--blue)" />
            </button>
            <button onClick={() => openSheet('addInventory', { onSaved: load })} style={{ color: 'var(--blue)', fontSize: 15, fontWeight: 600 }}>
              Add item
            </button>
          </div>
        )}
```

(`Icon` is already imported in this file; `openSheet` and `load` already exist.)

- [ ] **Step 3: Verify build compiles**

Run: `cd dentai-app && npm run build`
Expected: `Compiled successfully`, route `/finance/inventory` present.

- [ ] **Step 4: Manual smoke**

Run: `./run.sh`, open `http://localhost:3000`, log in (phone `1234567891` / OTP `123456`), go to Finance → Inventory → tap the mic. Speak "restock 50 gloves" → confirm the review card shows current → resulting and Confirm writes a movement. (Requires `GEMINI_API_KEY` + `SARVAM_API_KEY`; without them dev falls back to the inventory mock so the flow still renders.)

- [ ] **Step 5: Commit**

```bash
git add dentai-app/components/SheetHost.jsx dentai-app/app/finance/inventory/page.jsx
git commit -m "feat(inventory): register voice sheet + mic entry on inventory page"
```

---

## Self-Review

**Spec coverage:**
- §3 intent_confidence → Task 3 (prompt), Task 5 (passthrough), Task 8 gate (`INTENT_MIN`). ✓
- §5 resolver confidence + match_reason → Task 2. ✓
- §6 multi-item + current→resulting preview + bounds gate → Task 8 (`rows[]`, `resulting()`, `outOfBounds()`). ✓
- §7 deterministic query/reorder (never LLM) → Task 5 (`lowStock`, count/exists from catalog). ✓
- §8 all-India languages + code-mixed + abbreviations → Task 3 prompt + Task 2 alias matching. ✓
- §9 no privileged endpoint (writes via existing CRUD), clinic isolation, audit transcript → Task 6 (audit at parse), Task 8 (commit via existing services). ✓
- §10 examples + recovery-not-error + isolation → Task 8 (`EXAMPLES`, recovery phase, sheet-only). ✓
- §2 aliases column → Task 1. ✓
- §11 testing emphasis (aliases / multilingual / multi-item / absolute-vs-delta) → Tasks 2–6 fixtures. ✓

**Placeholder scan:** no TBD/TODO; every code step shows full code. ✓

**Type consistency:** resolver output keys (`resolved_item_id`, `resolved_name`, `confidence`, `match_reason`, `candidates`, `current_stock`, `current_unit`, `current_price`) are produced in Task 2 and consumed unchanged in Task 5 (`...res`) and Task 8 (`r.resolved_item_id`, `r.confidence`, `r.current_stock`, `r.candidates`). Commit verbs match frontend `inventory.service` signatures: `createInventoryItem(obj)`, `stockIn(id, qty, notes)`, `adjustStock(id, {qty,direction,reason,notes})`. ✓

**Verified:** `adjustStock` `reason` uses `'adjustment'` — the only value the `v.stockAdjust` enum (`adjustment|expired|return|purchase`) accepts that fits a voice correction, matching `InventoryDetailSheet`'s adjust UI. `stockIn` takes `{qty, notes}`; `adjustStock` takes `{qty, direction, reason, notes}`.

---

## Execution Handoff

Build order is Phase 0 → 1 → 2 (the spec's "core → query → reorder" all land together because the backend orchestrator handles every intent; the sheet renders all states in Task 8). Each task is independently testable and committed.
