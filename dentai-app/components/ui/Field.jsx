'use client';
import Icon from '@/components/icons';

export default function Field({ label, value, onChange, placeholder, type = 'text', mic, multiline, minHeight = 80, onMic }) {
  const inputStyle = {
    width: '100%', border: 'none', outline: 'none', background: 'transparent',
    fontSize: 17, color: 'var(--text-primary)', fontFamily: 'inherit', resize: 'none',
  };
  return (
    <div style={{ marginBottom: 4 }}>
      {label && <div className="t-section" style={{ marginBottom: 8 }}>{label}</div>}
      <div style={{ display: 'flex', alignItems: multiline ? 'flex-start' : 'center', borderBottom: '1px solid var(--border)', paddingBottom: 8, gap: 8 }}>
        {multiline
          ? <textarea value={value} placeholder={placeholder} onChange={e => onChange && onChange(e.target.value)} style={{ ...inputStyle, minHeight }} />
          : <input type={type} value={value} placeholder={placeholder} onChange={e => onChange && onChange(e.target.value)} style={inputStyle} />}
        {mic && <button onClick={onMic} style={{ color: 'var(--text-secondary)', display: 'flex', flexShrink: 0, marginTop: multiline ? 2 : 0 }}><Icon name="mic" size={18} /></button>}
      </div>
    </div>
  );
}
