'use client';

const CHIP_TONES = {
  neutral: { bg: 'rgba(60,60,67,0.08)', fg: 'var(--text-secondary)' },
  dark:    { bg: 'var(--accent)', fg: 'var(--accent-ink)' },
  amber:   { bg: 'rgba(255,159,10,0.14)', fg: '#C77700' },
  green:   { bg: 'rgba(52,199,89,0.14)', fg: '#1E8E3E' },
  orange:  { bg: 'rgba(255,149,0,0.14)', fg: '#C2580A' },
  red:     { bg: 'rgba(255,59,48,0.12)', fg: 'var(--red)' },
  teal:    { bg: 'rgba(50,173,230,0.16)', fg: '#1B86B8' },
  purple:  { bg: 'rgba(191,90,242,0.14)', fg: '#9333C7' },
  blueOutline: { bg: 'transparent', fg: 'var(--blue)', border: '1px solid var(--blue)' },
};
function Chip({ label, tone = 'neutral', size = 'sm', style }) {
  const t = CHIP_TONES[tone] || CHIP_TONES.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: t.bg, color: t.fg, border: t.border || 'none',
      borderRadius: 99, padding: size === 'lg' ? '5px 12px' : '3px 9px',
      fontSize: size === 'lg' ? 13 : 12, fontWeight: 600, whiteSpace: 'nowrap',
      ...style,
    }}>{label}</span>
  );
}

export default Chip;
