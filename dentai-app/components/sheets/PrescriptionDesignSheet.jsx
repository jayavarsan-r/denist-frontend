'use client';
import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import Icon from '@/components/icons';
import { SheetHeader, SectionHeader } from '@/components/ui';

function SignaturePad({ value, onChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (value) {
      const img = new Image();
      img.onload = () => {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        ctx.drawImage(img, 0, 0, canvasRef.current.width, canvasRef.current.height);
      };
      img.src = value;
    } else {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, []);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const client = e.touches ? e.touches[0] : e;
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    return {
      x: (client.clientX - rect.left) * scaleX,
      y: (client.clientY - rect.top) * scaleY,
    };
  };

  const onStart = (e) => {
    e.preventDefault();
    drawing.current = true;
    lastPos.current = getPos(e);
  };

  const onMove = (e) => {
    e.preventDefault();
    if (!drawing.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPos.current = pos;
  };

  const onEnd = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (canvasRef.current) onChange(canvasRef.current.toDataURL('image/png'));
  };

  const clear = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    onChange(null);
  };

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Doctor signature</div>
      <div style={{ position: 'relative', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: '#fafafa' }}>
        <canvas
          ref={canvasRef}
          width={600}
          height={180}
          style={{ width: '100%', height: 120, display: 'block', touchAction: 'none', cursor: 'crosshair' }}
          onPointerDown={onStart}
          onPointerMove={onMove}
          onPointerUp={onEnd}
          onPointerLeave={onEnd}
        />
        {!value && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>Draw your signature here</span>
          </div>
        )}
      </div>
      <button onClick={clear} style={{ marginTop: 6, fontSize: 13, color: 'var(--red)', fontWeight: 500 }}>Clear</button>
    </div>
  );
}

function PreviewHeader({ design, clinic }) {
  const doc = design.doctorName || clinic.doctorName || 'Dr. Name';
  const qual = design.qualification || 'BDS';
  const reg = design.regNumber ? `Reg. No: ${design.regNumber}` : '';
  const cname = clinic.clinicName || 'Clinic Name';
  const address = clinic.address || clinic.city || '';
  const phone = design.clinicPhone || clinic.phone || '';

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', background: '#fff', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em' }}>{doc}</div>
          <div style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600 }}>{qual}</div>
          {reg && <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{reg}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{cname}</div>
          {address && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{address}</div>}
          {phone && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{phone}</div>}
        </div>
      </div>
      {design.signatureDataUrl && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border-light)', paddingTop: 8 }}>
          <img src={design.signatureDataUrl} style={{ height: 48, maxWidth: '50%', objectFit: 'contain' }} alt="Signature" />
        </div>
      )}
    </div>
  );
}

function FieldInput({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 15, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' }}
      />
    </div>
  );
}

export default function PrescriptionDesignSheet({ onClose }) {
  const design = useAppStore(s => s.prescriptionDesign);
  const setPrescriptionDesign = useAppStore(s => s.setPrescriptionDesign);
  const hydratePrescriptionDesign = useAppStore(s => s.hydratePrescriptionDesign);
  const showToast = useAppStore(s => s.showToast);
  const clinic = useAppStore(s => s.clinic);

  const [doctorName, setDoctorName] = useState(design.doctorName || clinic.doctorName || '');
  const [qualification, setQualification] = useState(design.qualification || '');
  const [regNumber, setRegNumber] = useState(design.regNumber || '');
  const [clinicPhone, setClinicPhone] = useState(design.clinicPhone || clinic.phone || '');
  const [signature, setSignature] = useState(design.signatureDataUrl || null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { hydratePrescriptionDesign(); }, []);

  const liveDesign = { doctorName, qualification, regNumber, clinicPhone, signatureDataUrl: signature };

  const save = () => {
    setPrescriptionDesign(liveDesign);
    setSaved(true);
    showToast('Prescription design saved');
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ padding: '0 20px 36px' }}>
      <SheetHeader title="Prescription Design" onClose={onClose} />

      <div style={{ marginBottom: 14 }}>
        <div className="t-section" style={{ marginBottom: 8 }}>Preview</div>
        <PreviewHeader design={liveDesign} clinic={clinic} />
      </div>

      <SectionHeader>Doctor details</SectionHeader>
      <div className="card" style={{ padding: '14px 14px 4px', marginBottom: 16 }}>
        <FieldInput label="Doctor name" value={doctorName} onChange={setDoctorName} placeholder="Dr. Ravi Kumar" />
        <FieldInput label="Qualifications" value={qualification} onChange={setQualification} placeholder="BDS, MDS (Orthodontics)" />
        <FieldInput label="Registration no." value={regNumber} onChange={setRegNumber} placeholder="MCI / State reg. number" />
        <FieldInput label="Clinic phone" value={clinicPhone} onChange={setClinicPhone} placeholder="+91 98765 43210" type="tel" />
      </div>

      <SectionHeader>Signature</SectionHeader>
      <div className="card" style={{ padding: '14px', marginBottom: 24 }}>
        <SignaturePad value={signature} onChange={setSignature} />
      </div>

      <button
        onClick={save}
        style={{ width: '100%', background: saved ? 'var(--green)' : 'var(--accent)', color: 'var(--accent-ink)', borderRadius: 14, padding: '15px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background .2s' }}
      >
        {saved ? <><Icon name="check" size={18} color="var(--accent-ink)" /> Saved</> : 'Save design'}
      </button>
    </div>
  );
}
