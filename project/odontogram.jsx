/* DentWay Odontogram — FDI chart, mathematically positioned on two arches. */

const TOOTH_STATE_STYLE = {
  healthy:    { fill: '#ffffff', stroke: '#D1D1D6', sw: 1.5, num: 'var(--text-secondary)' },
  rct:        { fill: '#1C1C1E', stroke: '#1C1C1E', sw: 1.5, num: '#ffffff' },
  crown:      { fill: 'rgba(191,90,242,0.15)', stroke: '#BF5AF2', sw: 2, num: '#9333C7' },
  extraction: { fill: 'rgba(255,59,48,0.08)', stroke: '#FF3B30', sw: 1.5, num: '#FF3B30' },
  filling:    { fill: 'rgba(0,122,255,0.10)', stroke: '#007AFF', sw: 1.5, num: '#0064D2' },
  implant:    { fill: 'rgba(50,173,230,0.12)', stroke: '#32ADE6', sw: 1.5, num: '#1B86B8' },
  infection:  { fill: '#ffffff', stroke: '#D1D1D6', sw: 1.5, num: 'var(--text-secondary)', badge: true },
  scheduled:  { fill: 'rgba(255,159,10,0.10)', stroke: '#FF9F0A', sw: 1.5, num: '#C77700' },
  selected:   { fill: 'rgba(0,122,255,0.10)', stroke: '#007AFF', sw: 2, num: '#0064D2' },
};

const TOOTH_PATHS = {
  incisor:  'M-4,-11 C-5,-6,-6,2,-5,9 L5,9 C6,2,5,-6,4,-11 Z',
  canine:   'M-4,-13 C-5,-6,-7,1,-6,9 L6,9 C7,1,5,-6,4,-13 Z',
  premolar: 'M-5,-9 C-6,-3,-7,3,-6,9 L6,9 C7,3,6,-3,5,-9 C2,-11,-2,-11,-5,-9 Z',
  molar:    'M-8,-7 C-9,-1,-9,4,-8,10 L8,10 C9,4,9,-1,8,-7 C4,-11,-4,-11,-8,-7 Z',
};
function toothType(n) {
  const u = n % 10;
  if (u === 1 || u === 2) return 'incisor';
  if (u === 3) return 'canine';
  if (u === 4 || u === 5) return 'premolar';
  return 'molar';
}

const UPPER_ORDER = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
const LOWER_ORDER = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];

function computePositions() {
  const pos = {};
  const place = (order, cx, cy, a, b, startDeg, endDeg) => {
    const n = order.length;
    for (let i = 0; i < n; i++) {
      const deg = startDeg + (endDeg - startDeg) * (i / (n - 1));
      const t = deg * Math.PI / 180;
      const x = cx + a * Math.cos(t);
      const y = cy + b * Math.sin(t);
      const tangent = Math.atan2(b * Math.cos(t), -a * Math.sin(t)) * 180 / Math.PI;
      const lx = cx + (a + 20) * Math.cos(t);
      const ly = cy + (b + 20) * Math.sin(t);
      pos[order[i]] = { x, y, rot: tangent, lx, ly };
    }
  };
  // upper arch: bulges up (sin negative), 195deg(left) -> 345deg(right)
  place(UPPER_ORDER, 400, 170, 270, 110, 195, 345);
  // lower arch: bulges down (sin positive), 165deg(left) -> 15deg(right) to align with uppers
  place(LOWER_ORDER, 400, 250, 250, 100, 165, 15);
  return pos;
}

function Odontogram({ teeth = {}, selected = [], onTooth }) {
  const pos = React.useMemo(computePositions, []);
  const sel = new Set(selected);

  const renderTooth = (n) => {
    const p = pos[n];
    const rawState = sel.has(n) ? 'selected' : (teeth[n] || 'healthy');
    const st = TOOTH_STATE_STYLE[rawState] || TOOTH_STATE_STYLE.healthy;
    return (
      <g key={n} onClick={() => onTooth && onTooth(n)} style={{ cursor: 'pointer' }} className="tooth-g">
        <g transform={`translate(${p.x},${p.y}) rotate(${p.rot})`}>
          <path d={TOOTH_PATHS[toothType(n)]} fill={st.fill} stroke={st.stroke} strokeWidth={st.sw} />
          {st.badge && <circle cx={0} cy={-12} r={4} fill="#FF3B30" />}
        </g>
        <text x={p.lx} y={p.ly} textAnchor="middle" dominantBaseline="middle"
          fontSize="9" fontWeight="600" fill="var(--text-tertiary)"
          fontFamily="'Plus Jakarta Sans', sans-serif">{n}</text>
      </g>
    );
  };

  return (
    <svg viewBox="0 0 800 420" width="100%" height="auto" style={{ display: 'block' }}>
      <style>{`.tooth-g path { transition: transform .15s ease; transform-origin: center; } .tooth-g:hover path { transform: scale(1.10); }`}</style>
      {/* arch guides */}
      <ellipse cx="400" cy="170" rx="270" ry="110" fill="rgba(0,0,0,0.015)" />
      <ellipse cx="400" cy="250" rx="250" ry="100" fill="rgba(0,0,0,0.015)" />
      {/* center dividers */}
      <line x1="400" y1="40" x2="400" y2="380" stroke="rgba(0,0,0,0.08)" strokeWidth="1" />
      <line x1="120" y1="210" x2="680" y2="210" stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
      {/* quadrant labels */}
      <text x="40" y="40" fontSize="10" fontWeight="600" fill="var(--text-tertiary)" fontFamily="'Plus Jakarta Sans'">UR · Q1</text>
      <text x="760" y="40" textAnchor="end" fontSize="10" fontWeight="600" fill="var(--text-tertiary)" fontFamily="'Plus Jakarta Sans'">Q2 · UL</text>
      <text x="40" y="392" fontSize="10" fontWeight="600" fill="var(--text-tertiary)" fontFamily="'Plus Jakarta Sans'">LR · Q4</text>
      <text x="760" y="392" textAnchor="end" fontSize="10" fontWeight="600" fill="var(--text-tertiary)" fontFamily="'Plus Jakarta Sans'">Q3 · LL</text>
      {UPPER_ORDER.map(renderTooth)}
      {LOWER_ORDER.map(renderTooth)}
    </svg>
  );
}

Object.assign(window, { Odontogram, TOOTH_STATE_STYLE });
