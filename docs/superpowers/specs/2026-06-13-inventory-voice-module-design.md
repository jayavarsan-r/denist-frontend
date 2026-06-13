# Inventory Voice Module — Design Spec

- **Date:** 2026-06-13
- **Status:** Approved (design); pending spec review before implementation plan
- **Author:** Claude + clinic owner
- **Scope:** A multilingual, confirm-gated voice on-ramp for inventory operations (add / restock / adjust / query / reorder), built as an isolated module that reuses the existing inventory CRUD, permissions, auditing, and clinic isolation.

---

## 1. Guiding principle

**Voice suggests. Human confirms. Existing audited workflows execute.**

```
Voice → Extract → Resolve → Review → Confirm → EXISTING CRUD
```

The forbidden path, at any confidence level (even 99%):

```
Voice → Database write
```

Voice is **another input method**, not an "inventory v2." It produces *intent*; it never executes. Every write flows through the existing `/api/inventory/*` endpoints, so permissions, Zod validation, clinic scoping, `stock_movements` auditing, and transactions are unchanged.

---

## 2. Module boundaries (purely additive)

**New artifacts**
- Backend extractor: `aiService.extractInventory(transcript, catalog)` + `ai.controller.extractInventory` + route `POST /api/ai/extract-inventory`.
- Backend resolver: `resolveInventorySpan(clinicId, span, hints)` in `inventory.service.js` — **inventory-agnostic** (medicines *and* consumables/equipment).
- Backend (v1, additive): migration adding `inventory_items.aliases text[]` to power deterministic `alias_match`, seeded with common clinic abbreviations (NaOCl→Sodium Hypochlorite, LA→Lignocaine, GIC→Glass Ionomer Cement, RMGIC→Resin Modified GIC).
- Frontend: `InventoryVoiceSheet` (the entire voice flow lives here), one mic entry point in the inventory page header, one service method (`extractInventory`), registered in `SheetHost`.

**Reused unchanged**
- `POST /api/ai/transcribe` (Sarvam STT, multilingual) and `useTranscription`.
- All `/api/inventory/*` CRUD: `POST /`, `POST /:id/stock-in`, `POST /:id/adjustment`, `GET /low-stock`, `GET /`.
- `resolveMedicineSpan` (kept as-is for checkout dispensing — **not** modified).
- `AddInventorySheet` / `InventoryDetailSheet` and the inventory page behavior.

**Isolation rule:** no voice state is injected into existing inventory screens. The only edit to `app/finance/inventory/page.jsx` is adding a mic button that opens `InventoryVoiceSheet`. Everything else is new files.

---

## 3. Data flow (synchronous — short commands, no pg-boss)

```
mic → record (useAudioRecorder)
    → POST /api/ai/transcribe            (any language → text)
    → POST /api/ai/extract-inventory     (text + clinic catalog → {intent, items[]})
    → resolveInventorySpan() per item    (clinic-scoped match + confidence + reason)
    → InventoryVoiceSheet
         ├─ query / reorder  → read-only ANSWER card (deterministic DB read, no write)
         └─ add/restock/adjust → editable REVIEW card → Confirm → existing CRUD
```

Synchronous (like the existing prescription/patient voice). No `DATABASE_URL`/queue dependency.

---

## 4. Extraction contract — `POST /api/ai/extract-inventory`

**Input:** `{ transcript }`
**LLM:** Gemini, temperature 0, JSON mode, responseSchema. The clinic's catalog (item names + strengths + categories + aliases) is injected into the prompt so spoken words map to *this clinic's* items.

**Output:**
```jsonc
{
  "intent": "add | restock | adjust | query | reorder | unknown",
  "intent_confidence": 0.0,            // CHANGE #1 — visibility into ambiguity
  "items": [                            // CHANGE #5 — multi-item is first-class
    {
      "name_span": "implant kits",
      "strength": null,                 // medicines only; null otherwise
      "unit": null,
      "category": null,                 // medicine | consumable | equipment (hint)
      "qty": 5,                         // restock delta / opening stock
      "set_to_level": null,             // adjust "set to 25" → absolute target
      "price_per_unit": null,
      "low_stock_threshold": null
    }
  ],
  "query": {                            // present only for intent=query
    "kind": "count | exists | low_stock",
    "target_span": "implant kits"       // null for low_stock
  },
  "unclear_spans": []
}
```

**Prompt rules**
- Input may be any major Indian language or code-mixed speech (see §8); output canonical English field names + Arabic numerals.
- **Delta vs absolute:** delta phrasings ("add N", "restock N") set `qty`; **absolute / physical-count phrasings ("composite actually 12", "stock count says 48 gloves", "set X to N") map to `intent: adjust` with `set_to_level: N`, never a delta.**
- The LLM **classifies and extracts only**. It never decides reorder contents and never returns stock numbers from its own knowledge.
- `intent: reorder` carries no item logic — it is a deterministic trigger (see §7).

**Backend post-processing:** for each item, run `resolveInventorySpan` and attach the resolver block (§5). Rate-limited; audio size cap reused from transcribe.

---

## 5. Resolver — `resolveInventorySpan(clinicId, span, hints)` (CHANGE #2 + inventory-agnostic)

Generalizes the matching strategy of `resolveMedicineSpan` but is **not biased toward medicines** — it must match gloves, masks, burs, composite, cements, zirconia blocks, impression materials, implant kits, etc.

**Strategy (in order), each producing a `match_reason`:**
1. `exact_name` — case-insensitive exact name match.
2. `alias_match` — span ∈ `inventory_items.aliases` (e.g. "NaOCl" → "Sodium Hypochlorite").
3. `strength_match` — multiple name candidates disambiguated by a spoken strength (medicines: "500mg"/"10ml").
4. `category_match` — span maps to a category bucket when a single item dominates.
5. `fuzzy_match` — first-word / prefix / close edit-distance, single confident candidate.
6. `none` — unresolved.

**Output per item:**
```jsonc
{
  "name_span": "...",
  "resolved_item_id": "uuid | null",
  "resolved_name": "...",
  "confidence": 0.0,
  "match_reason": "exact_name | alias_match | strength_match | category_match | fuzzy_match | none",
  "candidates": [ /* when ambiguous: [{id,name,strength}] for manual pick */ ]
}
```

Always filters by `clinicId` — a spoken name can only resolve within the caller's clinic.

---

## 6. Commit path & safety (CHANGE #5 multi-item, "always confirm")

Each mutating item becomes a **review row** showing **current stock · change · resulting stock** (CHANGE: context confirmation) plus the resolved item:

```
Gloves (Consumable)            exact_name ✓
Current 120  ·  +50  ·  Resulting 170
```

- **add** → resulting = opening qty; row also collects unit/price/threshold for the new item.
- **restock** → resulting = `current + qty`.
- **adjust** (incl. physical stock-count: "composite actually 12", "count says 48 gloves") → `set_to_level` is the resulting absolute; change = `set_to_level − current`.

**Gates (block Confirm until resolved):**
- `intent_confidence < 0.75` → force manual intent selection (CHANGE #1).
- item `confidence` below threshold **or** `match_reason = none` → amber "unmatched — pick or create" (uses `candidates` picker).
- quantity beyond a sane bound (configurable; default `qty > 1000` or `> 10× current stock`) → red, must edit or acknowledge.

**Commit:** Confirm fans out one existing CRUD call **per item** (`POST /` for add, `/:id/stock-in` for restock, `/:id/adjustment` for adjust). Each is independently transactional and writes a `stock_movements` row tagged `notes: 'via voice'` for traceability. Per-row success/failure is reported; Confirm disables after first tap (idempotency at the UI; backend stays the existing validated endpoint).

---

## 7. Query & reorder — deterministic answers (CHANGE #3, #4 utility)

The LLM classifies intent and extracts a target; **answers come from the DB, never the LLM.**

- `query.kind = count` → resolve `target_span` → answer `resolved_name: stock_qty unit`.
- `query.kind = exists` → resolve → "Yes, N in stock" / "Not in your inventory."
- `query.kind = low_stock` **and** `intent = reorder` → both call the existing `GET /api/inventory/low-stock` rule (`stock_qty ≤ low_stock_threshold`). **Logic decides, not Gemini.**

> **Open decision:** reorder currently reuses `low_stock_threshold` as the reorder point (simplest, predictable, no divergence). A separate `reorder_point` column can be added later if the clinic wants distinct "warn" vs "reorder" levels. Default for v1: reuse `low_stock_threshold`.

Answer card is read-only (no write). The reorder answer can offer "Restock these…" which drops the items into the **review** flow (still confirm-gated).

---

## 8. Multi-language

The module supports **all major Indian languages** (whatever Sarvam covers — Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi, Odia, English, …), **not Tamil-only**. It must also handle:
- **code-mixed speech** ("Tanglish"/"Hinglish" — e.g. "gloves 50 restock pannu", "do composite low hai");
- **clinical abbreviations** ("NaOCl", "LA", "GIC", "RMGIC") via the aliases column.

The extractor prompt: "input may be any Indian language or code-mixed; output canonical English field names + numerals." Matching runs on the resolved English catalog, so language never reaches the DB layer. Tamil + English are merely the most common (Tamil Nadu), not a limit.

---

## 9. Security / production hardening

- **No privileged endpoint.** `extract-inventory` is read-only (returns intent). All writes go through existing `auth` + `requireClinic` + Zod-validated inventory routes → voice gains zero new authority.
- **Clinic isolation.** Resolver + catalog injection filter by `req.clinicId`.
- **Role parity.** Voice respects whatever role rules the inventory routes already enforce; no role logic in the mic. (Confirm current rules during build; if mutations should be receptionist/owner-only, enforce at the route.)
- **Rate limiting** on the extractor (Gemini cost/abuse) + audio size cap (reuse transcribe limits).
- **Audit (two layers):** the user-facing `stock_movements.notes = 'via voice'` (clean, shown in movement history); the **raw transcript** is stored only in the `audit_logs` metadata (`{ source: 'voice', transcript }`) — for debugging, **never shown to users**.
- **Audio privacy** posture identical to existing voice flows.

---

## 10. Frontend UX

- Mic button in the inventory page header (beside "Add item") → opens `InventoryVoiceSheet`.
- Sheet states: **idle (examples) → listening → transcribing → review/answer**.
- **Idle examples** (CHANGE #6), shown multilingually:
  - "Add 50 gloves"
  - "Restock sodium hypochlorite"
  - "Set composite stock to 25"
  - "How many implant kits are left?"
  - "Show low stock items"
- **unknown intent → recovery, not error** (CHANGE): "I couldn't understand that. Try: • Restock 20 gloves • Add zirconia blocks • Show low stock items • How many implant kits are left?"
- Review card uses existing styling (CSS vars, `.card`, `Field`, `.rowtap`).
- Any failure (too short / no match / network) falls back to the manual sheets — voice never traps the user.

---

## 11. Testing (repo style — mocked supabase/Gemini, no live DB)

> **Highest-risk area — test heaviest here.** Architecture/flow is low risk; most real bugs will be **name matching and extraction quality**. Concentrate fixtures on: **aliases/abbreviations** (NaOCl/LA/GIC/RMGIC), **multi-language + code-mixed/English-mixed** speech across several Indian languages, **multi-item** commands, and **absolute vs delta** (physical count) phrasing.

- **Extractor:** transcript fixtures (multiple Indian languages + code-mixed; single + multi-item; delta vs absolute) → correct `intent`, `intent_confidence`, `items[]`, `query`.
- **Resolver:** exact / alias / strength / category / fuzzy / none → correct `match_reason` + `confidence`; ambiguous → `candidates`; clinic isolation. Non-medicine items (gloves, burs, zirconia blocks) resolve as well as medicines.
- **Review→commit:** each item maps to the correct CRUD endpoint + payload; resulting-stock math; multi-item per-row outcomes.
- **Gates:** `intent_confidence < 0.75` blocks; out-of-bound qty blocks; unmatched blocks.
- **Query/reorder:** deterministic answers from DB stubs; LLM never supplies numbers.
- **unknown** → recovery payload, not error.
- Existing 147 backend tests stay green.

---

## 12. Build order (one spec, incremental)

1. **Core mutations** — extractor + resolver + `InventoryVoiceSheet` review card for add/restock/adjust (single + multi-item), with confidence gates and current→resulting preview.
2. **Query intent** — count/exists/low-stock answer card.
3. **Reorder** — deterministic low-stock list with "restock these" → review flow.

Each step is independently testable and shippable.

---

## 13. Non-goals (YAGNI) & future-compatibility

**Not built now:**
- No async/pg-boss pipeline, no multi-turn conversation.
- No new inventory data model beyond the v1 `aliases` column (no `reorder_point`/`critical_threshold` — reuse `low_stock_threshold`).
- No changes to checkout dispensing or `resolveMedicineSpan`.
- No LLM-decided reorder logic.
- No voice-specific permissions (role parity with existing inventory routes; any clinic RBAC is a separate route-level change, not part of this module).

**Future-compatible (architecture must not block, but do not build):**
- Consumption forecasting — "show me what will run out next month." Fits cleanly as another deterministic `query.kind` later; the LLM would only classify, the projection stays in SQL.
