'use client';

const CHIP_TONES = {
  neutral:     { bg: 'rgba(60,60,67,0.08)',   fg: 'var(--text-secondary)' },
  dark:        { bg: 'var(--accent)',          fg: 'var(--accent-ink)' },
  green:       { bg: 'rgba(39,201,63,0.14)',   fg: '#15892D' },      // new patient / done
  amber:       { bg: 'rgba(254,188,46,0.20)',  fg: '#8A5F00' },      // pending / billing
  orange:      { bg: 'rgba(254,188,46,0.20)',  fg: '#8A5F00' },
  red:         { bg: 'rgba(255,95,87,0.14)',   fg: '#C0392B' },      // urgent / alert
  blue:        { bg: 'rgba(0,122,255,0.12)',   fg: 'var(--blue)' },  // existing / appointment
  teal:        { bg: 'rgba(50,173,230,0.16)',  fg: '#1B86B8' },
  purple:      { bg: 'rgba(191,90,242,0.14)',  fg: '#9333C7' },
  blueOutline: { bg: 'transparent',            fg: 'var(--blue)', border: '1px solid var(--blue)' },
  // semantic aliases
  new:         { bg: 'rgba(39,201,63,0.14)',   fg: '#15892D' },
  returning:   { bg: 'rgba(0,122,255,0.12)',   fg: 'var(--blue)' },
  urgent:      { bg: 'rgba(255,95,87,0.14)',   fg: '#C0392B' },
  pending:     { bg: 'rgba(254,188,46,0.20)',  fg: '#8A5F00' },
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
