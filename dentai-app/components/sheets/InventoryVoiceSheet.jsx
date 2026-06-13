'use client';
import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { SheetHeader, PrimaryButton, VoiceButton } from '@/components/ui';
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

      {/* voice control — the app-wide VoiceButton, consistent with every sheet */}
      <div style={{ padding: '4px 0 16px' }}>
        <VoiceButton
          phase={isRecording ? 'recording' : phase === 'working' ? 'processing' : 'idle'}
          seconds={seconds}
          onTap={isRecording ? finish : begin}
          idleTitle="Inventory voice"
          idleHint="Add, restock, adjust or ask — any language"
          recordingHint="Speak now"
        />
        {recError && <div style={{ fontSize: 13, color: 'var(--red)', textAlign: 'center', marginTop: 8 }}>{recError}</div>}
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
