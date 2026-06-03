'use client';
import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import { SheetHeader, Avatar, PrimaryButton, Field } from '@/components/ui';
import { TODAY } from '@/lib/data/patients';

export default function NewLabSheet({ params, onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const patients = usePatientStore((s) => s.patients);
  const addLabOrder = useClinicalStore((s) => s.addLabOrder);
  const [labName, setLabName] = useState(''); const [work, setWork] = useState('');
  const [shade, setShade] = useState('A2'); const [cost, setCost] = useState(''); const [charged, setCharged] = useState('');
  const patient = params.patientId && patients.find(p => p.id === params.patientId);
  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title="New lab order" onClose={onClose} />
      {patient && <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}><Avatar name={patient.name} size={36} /><span style={{ fontSize: 15, fontWeight: 600 }}>{patient.name}</span></div>}
      <div className="card" style={{ padding: 16, marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Lab name" value={labName} onChange={setLabName} placeholder="e.g. City Dental Lab" mic onMic={() => showToast('Listening…')} />
        <Field label="Work description" value={work} onChange={setWork} placeholder="e.g. PFM crown, tooth 36" mic onMic={() => showToast('Listening…')} />
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1 }}><Field label="Shade" value={shade} onChange={setShade} /></div>
          <div style={{ flex: 1 }}><Field label="Lab cost ₹" value={cost} onChange={setCost} type="tel" /></div>
        </div>
        <Field label="Charged to patient ₹" value={charged} onChange={setCharged} type="tel" />
      </div>
      <PrimaryButton onClick={() => { addLabOrder({ id: 'lab' + Date.now(), patientId: params.patientId || 'p1', patientName: patient ? patient.name : 'Patient', procedureId: null, procedureType: 'Crown', toothNumber: null, labName: labName || 'New Lab', workDescription: work, sentDate: TODAY, expectedReturnDate: TODAY, actualReturnDate: null, status: 'sent', costToClinic: parseInt(cost) || 0, chargedToPatient: parseInt(charged) || 0, notes: '', shade, impressionType: 'Digital scan' }); onClose(); showToast('Lab order created'); }}>Create order</PrimaryButton>
    </div>
  );
}
