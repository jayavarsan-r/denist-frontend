'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import Icon from '@/components/icons';
import { Chip, PrimaryButton } from '@/components/ui';

function BrandMark({ size = 80 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.28, background: 'var(--accent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--elevation-2)',
    }}>
      <Icon name="tooth" size={size * 0.56} color="var(--accent-ink)" stroke={1.7} />
    </div>
  );
}

/* hero compositions ----------------------------------------------------- */
function HeroWelcome() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
      <BrandMark size={92} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em' }}>DentWay</span>
        <span className="t-meta" style={{ letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: 11, fontWeight: 600 }}>Clinical copilot</span>
      </div>
    </div>
  );
}

function HeroVoice() {
  const bars = [16, 30, 12, 38, 22, 44, 18, 34, 26, 40, 14, 30];
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--accent)', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="mic" size={22} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 48, flex: 1 }}>
          {bars.map((h, i) => (
            <div key={i} style={{ flex: 1, background: 'var(--accent)', borderRadius: 3, '--peak': h + 'px', height: h, animation: `wave ${0.7 + (i % 4) * 0.18}s ease-in-out ${i * 0.06}s infinite` }} />
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--text-tertiary)' }}><Icon name="chevDown" size={20} /></div>
      <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[['Procedure', 'RCT · Tooth 36'], ['Next visit', 'Cleaning & shaping'], ['Prescribed', 'Ibuprofen 400mg · BD']].map(([k, v], i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="t-meta">{k}</span>
            <span style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>{v}<Icon name="check" size={14} color="var(--green)" stroke={2.6} /></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeroLayers() {
  const layers = [
    { t: 'Treatment plan', s: 'RCT + Crown · Tooth 36', tone: 'neutral', icon: 'stethoscope' },
    { t: 'Procedure', s: 'Root canal · 4 visits', tone: 'amber', icon: 'tooth' },
    { t: 'Visit', s: 'Today · 9:30 AM', tone: 'teal', icon: 'clock' },
  ];
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 0 }}>
      {layers.map((l, i) => (
        <div key={i} style={{ paddingLeft: i * 26 }}>
          <div className="card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, marginBottom: i < 2 ? 10 : 0 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(60,60,67,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)', flexShrink: 0 }}>
              <Icon name={l.icon} size={20} stroke={1.8} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{l.t}</div>
              <div className="t-meta">{l.s}</div>
            </div>
            {i < 2 && <Icon name="chevDown" size={16} color="var(--text-tertiary)" />}
          </div>
        </div>
      ))}
    </div>
  );
}

function HeroFinance() {
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="card" style={{ padding: 20 }}>
        <div className="t-section" style={{ marginBottom: 6 }}>Net profit · this month</div>
        <div className="tnum" style={{ fontSize: 36, fontWeight: 700, color: '#1E8E3E', letterSpacing: '-0.02em' }}>₹42,300</div>
        <div style={{ display: 'flex', gap: 18, marginTop: 14 }}>
          <div><div className="t-meta">Revenue</div><div className="tnum" style={{ fontSize: 16, fontWeight: 600, color: '#1E8E3E' }}>₹73,800</div></div>
          <div><div className="t-meta">Lab costs</div><div className="tnum" style={{ fontSize: 16, fontWeight: 600, color: 'var(--orange)' }}>−₹5,500</div></div>
          <div><div className="t-meta">Margin</div><div className="tnum" style={{ fontSize: 16, fontWeight: 600 }}>57%</div></div>
        </div>
      </div>
      <div className="card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(50,173,230,0.14)', color: '#1B86B8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="flask" size={18} /></div>
        <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Lab orders tracked end-to-end</div>
        <Chip label="2 active" tone="teal" />
      </div>
    </div>
  );
}

const ONB_PAGES = [
  { hero: HeroWelcome, title: 'A calmer way to run the chair', body: 'DentWay stays out of your way. One screen, one job, intelligence in the background — so you can keep your eyes on the patient.' },
  { hero: HeroVoice, title: 'Speak. It structures itself.', body: 'Dictate what you did and DentWay files the notes, the prescription, and the next visit. No forms, no typing between patients.' },
  { hero: HeroLayers, title: 'Plan, procedure, visit — connected', body: 'Every appointment knows which procedure it advances and which plan it belongs to. Progress tracks itself across visits.' },
  { hero: HeroFinance, title: 'Your practice, accounted for', body: 'Lab costs, margins, and outstanding balances are reconciled as you work. The numbers are always current.' },
];

function Onboarding({ onDone }) {
  const [page, setPage] = React.useState(0);
  const last = page === ONB_PAGES.length - 1;
  const next = () => last ? onDone() : setPage(p => p + 1);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
      {/* skip */}
      <div style={{ paddingTop: 58, padding: '58px 20px 0', display: 'flex', justifyContent: 'flex-end', height: 90, flexShrink: 0 }}>
        <button onClick={onDone} style={{ color: 'var(--text-secondary)', fontSize: 15, fontWeight: 500, opacity: last ? 0 : 1 }}>Skip</button>
      </div>

      {/* hero + copy */}
      <div className="scroll" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 28px' }}>
        <div key={page} className="page-in" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ minHeight: 270, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 36 }}>
            {React.createElement(ONB_PAGES[page].hero)}
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.15, margin: '0 0 14px', textWrap: 'pretty' }}>{ONB_PAGES[page].title}</h1>
          <p style={{ fontSize: 16, lineHeight: 1.5, color: 'var(--text-secondary)', margin: 0, textWrap: 'pretty' }}>{ONB_PAGES[page].body}</p>
        </div>
      </div>

      {/* dots + cta */}
      <div style={{ flexShrink: 0, padding: '20px 28px 40px' }}>
        <div style={{ display: 'flex', gap: 7, justifyContent: 'center', marginBottom: 22 }}>
          {ONB_PAGES.map((_, i) => (
            <div key={i} style={{ height: 7, borderRadius: 4, transition: 'all .3s ease', width: i === page ? 22 : 7, background: i === page ? 'var(--accent)' : 'rgba(60,60,67,0.2)' }} />
          ))}
        </div>
        <PrimaryButton onClick={next}>{last ? 'Get started' : 'Continue'}</PrimaryButton>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const setStarted = useAppStore((s) => s.setStarted);
  const handleDone = () => {
    setStarted(true);
    router.push('/roles');
  };
  return <Onboarding onDone={handleDone} />;
}
