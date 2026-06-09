'use client';

/* DentWay Odontogram — FDI chart in a straight-row clinical layout (upper + lower). */

// More saturated fills + thicker strokes so each procedure reads clearly at a glance.
const TOOTH_STATE_STYLE = {
  healthy:    { fill: '#ffffff', stroke: '#C7C7CC', sw: 1.5, num: 'var(--text-secondary)' },
  rct:        { fill: '#1C1C1E', stroke: '#1C1C1E', sw: 2, num: '#ffffff' },
  crown:      { fill: 'rgba(175,82,222,0.40)', stroke: '#AF52DE', sw: 2.2, num: '#7B2CA8' },
  extraction: { fill: 'rgba(255,59,48,0.32)', stroke: '#FF3B30', sw: 2.2, num: '#C0271F' },
  filling:    { fill: 'rgba(0,122,255,0.32)', stroke: '#007AFF', sw: 2.2, num: '#0050B3' },
  implant:    { fill: 'rgba(48,176,199,0.36)', stroke: '#159AAE', sw: 2.2, num: '#0E6F7E' },
  infection:  { fill: 'rgba(255,159,10,0.18)', stroke: '#FF3B30', sw: 2, num: '#C0271F', badge: true },
  scheduled:  { fill: 'rgba(255,159,10,0.34)', stroke: '#FF9F0A', sw: 2.2, num: '#9A6200' },
  selected:   { fill: 'rgba(0,122,255,0.22)', stroke: '#007AFF', sw: 2.6, num: '#0050B3' },
};

// Each tooth = an anatomical crown outline + occlusal-surface detail (cusps/grooves),
// drawn from the biting-surface view like a real dental chart.
const TOOTH_SHAPES = {
  incisor: {
    outline: 'M-4.5,-9 C-5.5,-5,-5.5,5,-4.5,8.5 C-1.5,10,1.5,10,4.5,8.5 C5.5,5,5.5,-5,4.5,-9 C1.5,-10.5,-1.5,-10.5,-4.5,-9 Z',
    detail: 'M-3.4,-6.6 L3.4,-6.6',           // incisal edge
  },
  canine: {
    outline: 'M0,-10.5 C2.6,-9.4,4.6,-6,4.6,-3 C5,2,4.5,6,3.4,8.6 C1.2,9.9,-1.2,9.9,-3.4,8.6 C-4.5,6,-5,2,-4.6,-3 C-4.6,-6,-2.6,-9.4,0,-10.5 Z',
    detail: 'M0,-8.2 L0,5.5',                  // cusp ridge
  },
  premolar: {
    outline: 'M-5.5,-7 C-7,-5,-7,5,-5.5,7.5 C-2.5,9,2.5,9,5.5,7.5 C7,5,7,-5,5.5,-7 C2.5,-9,-2.5,-9,-5.5,-7 Z',
    detail: 'M0,-4.6 L0,4.6 M-2.6,0 L2.6,0',   // central groove + two cusps
  },
  molar: {
    outline: 'M-7.5,-6.5 C-9,-5,-9,5,-7.5,7.5 C-4.5,9.3,4.5,9.3,7.5,7.5 C9,5,9,-5,7.5,-6.5 C4.5,-8.5,-4.5,-8.5,-7.5,-6.5 Z',
    detail: 'M0,-5.4 L0,5.4 M-5.4,0 L5.4,0',   // cross fissure = four cusps
  },
};

function toothType(n) {
  const u = n % 10;
  if (u === 1 || u === 2) return 'incisor';
  if (u === 3) return 'canine';
  if (u === 4 || u === 5) return 'premolar';
  return 'molar';
}

// Straight-row clinical FDI layout (like a dental-software chart): upper arch on top,
// lower arch on the bottom, FDI numbers in the middle band, evenly spaced so every
// tooth + number is legible on a phone.
const UPPER_ROW = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_ROW = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

const VW = 360, MARGIN = 12, GAP = 12;
const COLW = (VW - MARGIN * 2 - GAP) / 16;       // per-tooth column width
const X_FOR = (i) => MARGIN + i * COLW + COLW / 2 + (i >= 8 ? GAP : 0); // midline gap after 8
const MIDX = MARGIN + 8 * COLW + GAP / 2;        // quadrant divider x

export default function Odontogram({ teeth = {}, selected = [], onTooth }) {
  const sel = new Set(selected);

  const renderTooth = (n, i, cy, numY) => {
    const x = X_FOR(i);
    const rawState = sel.has(n) ? 'selected' : (teeth[n] || 'healthy');
    const st = TOOTH_STATE_STYLE[rawState] || TOOTH_STATE_STYLE.healthy;
    const shape = TOOTH_SHAPES[toothType(n)];
    return (
      <g key={n} onClick={() => onTooth && onTooth(n)} style={{ cursor: 'pointer' }} className="tooth-g">
        {/* generous transparent hit area */}
        <rect x={x - COLW / 2} y={cy - 16} width={COLW} height={32} fill="transparent" />
        <g transform={`translate(${x},${cy})`}>
          <path d={shape.outline} fill={st.fill} stroke={st.stroke} strokeWidth={st.sw} strokeLinejoin="round" />
          {shape.detail && <path d={shape.detail} fill="none" stroke={st.stroke} strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />}
          {st.badge && <circle cx={0} cy={-13} r={3.2} fill="#FF3B30" />}
        </g>
        <text x={x} y={numY} textAnchor="middle" dominantBaseline="middle"
          fontSize="10" fontWeight="700" fill="var(--text-secondary)"
          fontFamily="'Plus Jakarta Sans', sans-serif">{n}</text>
      </g>
    );
  };

  return (
    <svg viewBox="0 0 360 150" width="100%" height="auto" style={{ display: 'block' }}>
      <style>{`.tooth-g { transition: opacity .12s ease; } .tooth-g:active { opacity: 0.5; }`}</style>
      {/* quadrant divider + arch midline */}
      <line x1={MIDX} y1="4" x2={MIDX} y2="146" stroke="rgba(0,0,0,0.07)" strokeWidth="1" />
      <line x1="6" y1="75" x2="354" y2="75" stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
      {/* upper arch (teeth at y26, numbers below at y52) */}
      {UPPER_ROW.map((n, i) => renderTooth(n, i, 26, 52))}
      {/* lower arch (numbers above at y98, teeth at y124) */}
      {LOWER_ROW.map((n, i) => renderTooth(n, i, 124, 98))}
    </svg>
  );
}
