/* DentWay — Bill + Prescription sheets */

function BillSheet({ params, onClose }) {
  const app = useApp();
  const existing = params.billId && app.bills.find(b => b.id === params.billId);
  const p = app.patients.find(x => x.id === params.patientId);
  const [items, setItems] = React.useState(existing ? existing.items : []);
  const [discount, setDiscount] = React.useState(existing ? existing.discount : 0);
  const [paid, setPaid] = React.useState(existing ? existing.paid : 0);
  const [method, setMethod] = React.useState('UPI');
  const [desc, setDesc] = React.useState(''); const [qty, setQty] = React.useState('1'); const [price, setPrice] = React.useState('');

  const subtotal = items.reduce((s, it) => s + it.total, 0);
  const total = Math.max(0, subtotal - discount);
  const outstanding = Math.max(0, total - paid);

  const addItem = () => {
    if (!desc || !price) return;
    const q = parseInt(qty) || 1; const up = parseInt(price) || 0;
    setItems([...items, { description: desc, quantity: q, unitPrice: up, total: q * up }]);
    setDesc(''); setQty('1'); setPrice('');
  };
  const addFromProcedures = () => {
    const procs = app.procedures.filter(x => x.patientId === params.patientId);
    setItems([...items, ...procs.map(pr => ({ description: `${pr.type}${pr.tooth ? ' · Tooth ' + pr.tooth : ''}`, quantity: 1, unitPrice: pr.estimatedCost, total: pr.estimatedCost }))]);
  };
  const save = () => {
    const status = outstanding === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    app.saveBill({ id: existing ? existing.id : 'bill' + Date.now(), patientId: params.patientId, patientName: p.name, items, subtotal, discount, total, paid, outstanding, createdAt: existing ? existing.createdAt : DATA.TODAY, status });
    app.showToast(existing ? 'Bill updated' : 'Bill saved');
    onClose();
  };

  const inputBox = { border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 14, outline: 'none', background: '#fff', fontFamily: 'inherit' };

  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title={`Bill · ${p ? p.name : ''}`} onClose={onClose} right={<StatusChip status={outstanding === 0 && total > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid'} />} />

      <SectionHeader right={<button onClick={addFromProcedures} style={{ color: 'var(--blue)', fontSize: 13, fontWeight: 500 }}>Add from procedures →</button>}>Items</SectionHeader>
      <div className="card" style={{ overflow: 'hidden', marginBottom: 12 }}>
        {items.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>No items yet</div>}
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 52, padding: '8px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
            <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{it.description}</div><div className="t-meta">Qty {it.quantity} · {formatCurrency(it.unitPrice)}</div></div>
            <span className="tnum" style={{ fontSize: 15, fontWeight: 600 }}>{formatCurrency(it.total)}</span>
            <button onClick={() => setItems(items.filter((_, j) => j !== i))} style={{ color: 'var(--text-tertiary)', display: 'flex' }}><Icon name="x" size={16} /></button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: items.length ? '1px solid var(--border-light)' : 'none', alignItems: 'center' }}>
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description" style={{ ...inputBox, flex: 1 }} />
          <input value={qty} onChange={e => setQty(e.target.value)} inputMode="numeric" style={{ ...inputBox, width: 38, textAlign: 'center' }} />
          <input value={price} onChange={e => setPrice(e.target.value)} inputMode="numeric" placeholder="₹" style={{ ...inputBox, width: 58 }} />
          <button onClick={addItem} style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--accent)', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="plus" size={18} stroke={2.6} /></button>
        </div>
      </div>

      <div className="card" style={{ padding: '6px 16px', marginBottom: 16 }}>
        {[['Subtotal', formatCurrency(subtotal)]].map(([k, val]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0' }}><span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>{k}</span><span className="tnum" style={{ fontSize: 15, fontWeight: 600 }}>{val}</span></div>)}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0' }}>
          <span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>Discount</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span className="tnum" style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>−₹</span><input value={discount || ''} onChange={e => setDiscount(parseInt(e.target.value) || 0)} inputMode="numeric" placeholder="0" style={{ width: 56, textAlign: 'right', border: 'none', borderBottom: '1px solid var(--border)', outline: 'none', fontSize: 15, fontWeight: 600, fontFamily: 'inherit' }} className="tnum" /></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--border-light)' }}><span style={{ fontSize: 15, fontWeight: 600 }}>Total</span><span className="tnum" style={{ fontSize: 17, fontWeight: 700 }}>{formatCurrency(total)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderTop: '1px solid var(--border-light)' }}>
          <span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>Paid</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span className="tnum" style={{ fontSize: 15, fontWeight: 600, color: '#1E8E3E' }}>₹</span><input value={paid || ''} onChange={e => setPaid(parseInt(e.target.value) || 0)} inputMode="numeric" placeholder="0" style={{ width: 64, textAlign: 'right', border: 'none', borderBottom: '1px solid var(--border)', outline: 'none', fontSize: 15, fontWeight: 600, color: '#1E8E3E', fontFamily: 'inherit' }} className="tnum" /></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0' }}><span style={{ fontSize: 15, fontWeight: 600 }}>Outstanding</span><span className="tnum" style={{ fontSize: 15, fontWeight: 700, color: 'var(--orange)' }}>{formatCurrency(outstanding)}</span></div>
      </div>

      <SectionHeader>Payment method</SectionHeader>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {['Cash', 'UPI', 'Card'].map(m => <SelectPill key={m} label={m} active={method === m} onClick={() => setMethod(m)} />)}
      </div>

      <PrimaryButton onClick={save}>Save bill</PrimaryButton>
      <button onClick={() => app.showToast('Generating PDF…')} style={{ width: '100%', textAlign: 'center', color: 'var(--blue)', fontSize: 15, fontWeight: 500, padding: '14px 0 2px' }}>Print / Share</button>
    </div>
  );
}

const FREQ_OPTIONS = ['OD', 'BD', 'TDS', 'SOS', 'HS'];

function PrescriptionSheet({ params, onClose }) {
  const app = useApp();
  const existing = params.rxId && app.prescriptions.find(r => r.id === params.rxId);
  const p = app.patients.find(x => x.id === params.patientId);
  const [meds, setMeds] = React.useState(existing ? existing.medicines : []);
  const [instructions, setInstructions] = React.useState(existing ? existing.instructions : '');
  const [followUp, setFollowUp] = React.useState(existing ? existing.followUpDays : 7);
  const [phase, setPhase] = React.useState('idle');
  const [expanded, setExpanded] = React.useState(null);

  const addMed = (name) => { if (meds.some(m => m.name === name)) { setMeds(meds.filter(m => m.name !== name)); return; } setMeds([...meds, { name, dosage: '1 tab', frequency: 'BD', duration: '5 days', notes: '' }]); };
  const updateMed = (i, patch) => setMeds(meds.map((m, j) => j === i ? { ...m, ...patch } : m));
  const dictate = () => { setPhase('recording'); setTimeout(() => { setMeds([{ name: 'Amoxicillin 500mg', dosage: '1 cap', frequency: 'TDS', duration: '5 days', notes: '', uncertain: false }, { name: 'Ibuprofen 400mg', dosage: '1 tab', frequency: 'BD', duration: '3 days', notes: 'After food', uncertain: true }]); setPhase('idle'); }, 2600); };
  const save = () => { app.saveRx({ id: existing ? existing.id : 'rx' + Date.now(), patientId: params.patientId, patientName: p.name, date: existing ? existing.date : DATA.TODAY, medicines: meds, instructions, followUpDays: followUp }); app.showToast('Prescription saved'); onClose(); };

  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title="Prescription" onClose={onClose} />
      <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>{p ? p.name : ''}</span>
        <span className="t-meta">{formatDate(DATA.TODAY)}</span>
      </div>

      <SectionHeader right={<button onClick={dictate} style={{ color: phase === 'recording' ? 'var(--red)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 500 }}><Icon name="mic" size={16} />{phase === 'recording' ? 'Listening…' : 'Dictate'}</button>}>Medicines</SectionHeader>
      <div className="card" style={{ overflow: 'hidden', marginBottom: 12 }}>
        {meds.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>Add medicines below or dictate</div>}
        {meds.map((m, i) => (
          <div key={i} style={{ borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
            <div onClick={() => setExpanded(expanded === i ? null : i)} style={{ minHeight: 60, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', cursor: 'pointer' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>{m.name}{m.uncertain && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)' }} />}</div>
                <div className="t-meta">{m.dosage} · {m.frequency} · {m.duration}{m.notes ? ' · ' + m.notes : ''}</div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); setMeds(meds.filter((_, j) => j !== i)); }} style={{ color: 'var(--text-tertiary)', display: 'flex' }}><Icon name="x" size={16} /></button>
            </div>
            {expanded === i && (
              <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={m.dosage} onChange={e => updateMed(i, { dosage: e.target.value })} placeholder="Dosage" style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
                  <input value={m.duration} onChange={e => updateMed(i, { duration: e.target.value })} placeholder="Duration" style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
                </div>
                <div style={{ display: 'flex', gap: 6 }}>{FREQ_OPTIONS.map(f => <button key={f} onClick={() => updateMed(i, { frequency: f })} style={{ flex: 1, height: 32, borderRadius: 8, fontSize: 13, fontWeight: 600, background: m.frequency === f ? 'var(--accent)' : '#fff', color: m.frequency === f ? 'var(--accent-ink)' : 'var(--text-secondary)', border: m.frequency === f ? 'none' : '1px solid var(--border)' }}>{f}</button>)}</div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="noscroll-x" style={{ display: 'flex', gap: 8, marginBottom: 18, paddingBottom: 2 }}>
        {DATA.FREQUENT_MEDICINES.map(name => <SelectPill key={name} label={name} active={meds.some(m => m.name === name)} onClick={() => addMed(name)} />)}
      </div>

      <Field label="Instructions" multiline value={instructions} onChange={setInstructions} placeholder="Special instructions (after food, avoid spicy food)…" mic minHeight={50} onMic={() => app.showToast('Listening…')} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 20px' }}>
        <span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>Review after</span>
        <input value={followUp || ''} onChange={e => setFollowUp(parseInt(e.target.value) || null)} inputMode="numeric" style={{ width: 48, textAlign: 'center', border: '1px solid var(--border)', borderRadius: 8, padding: '6px', fontSize: 15, outline: 'none', fontFamily: 'inherit' }} className="tnum" />
        <span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>days</span>
      </div>

      <PrimaryButton onClick={save}>Save</PrimaryButton>
      <button onClick={() => app.showToast('Generating prescription…')} style={{ width: '100%', textAlign: 'center', color: 'var(--blue)', fontSize: 15, fontWeight: 500, padding: '14px 0 2px' }}>Print / Share</button>
    </div>
  );
}

Object.assign(window, { BillSheet, PrescriptionSheet });
