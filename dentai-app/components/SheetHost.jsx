'use client';
import { useAppStore } from '@/store/useAppStore';
import { BottomSheet } from '@/components/ui';
import AccountSettingsSheet from '@/components/sheets/AccountSettingsSheet';
import WalkInSheet from '@/components/sheets/WalkInSheet';
import NewPatientSheet from '@/components/sheets/NewPatientSheet';
import FilterSheet from '@/components/sheets/FilterSheet';
import ProcedureDetailSheet from '@/components/sheets/ProcedureDetailSheet';
import ToothDetailSheet from '@/components/sheets/ToothDetailSheet';
import BillSheet from '@/components/sheets/BillSheet';
import PrescriptionSheet from '@/components/sheets/PrescriptionSheet';
import NewLabSheet from '@/components/sheets/NewLabSheet';
import LabDetailSheet from '@/components/sheets/LabDetailSheet';
import AddEntrySheet from '@/components/sheets/AddEntrySheet';
import NewVisitSheet from '@/components/sheets/NewVisitSheet';
import EditPatientSheet from '@/components/sheets/EditPatientSheet';
import ApptPeekSheet from '@/components/sheets/ApptPeekSheet';
import EndVisitSheet from '@/components/sheets/EndVisitSheet';
import CheckInSheet from '@/components/sheets/CheckInSheet';
import RemoveQueueSheet from '@/components/sheets/RemoveQueueSheet';
import QueueActionsSheet from '@/components/sheets/QueueActionsSheet';
import VisitRecordSheet from '@/components/sheets/VisitRecordSheet';
import PrescriptionDesignSheet from '@/components/sheets/PrescriptionDesignSheet';
import PhotoViewerSheet from '@/components/sheets/PhotoViewerSheet';
import TreatmentPlanSheet from '@/components/sheets/TreatmentPlanSheet';
import PatientPickerSheet from '@/components/sheets/PatientPickerSheet';
import PatientConsultSheet from '@/components/sheets/PatientConsultSheet';
import ConsultRecordSheet from '@/components/sheets/ConsultRecordSheet';
import AddInventorySheet from '@/components/sheets/AddInventorySheet';
import InventoryDetailSheet from '@/components/sheets/InventoryDetailSheet';
import NewLabCaseSheet from '@/components/sheets/NewLabCaseSheet';
import LabCaseDetailSheet from '@/components/sheets/LabCaseDetailSheet';
import InventoryVoiceSheet from '@/components/sheets/InventoryVoiceSheet';

const SHEETS = {
  account: AccountSettingsSheet,
  walkin: WalkInSheet,
  newPatient: NewPatientSheet,
  filter: FilterSheet,
  procedure: ProcedureDetailSheet,
  tooth: ToothDetailSheet,
  bill: BillSheet,
  rx: PrescriptionSheet,
  newLab: NewLabSheet,
  labDetail: LabDetailSheet,
  addEntry: AddEntrySheet,
  newVisit: NewVisitSheet,
  editPatient: EditPatientSheet,
  apptPeek: ApptPeekSheet,
  endVisit: EndVisitSheet,
  checkin: CheckInSheet,
  removeQueue: RemoveQueueSheet,
  queueActions: QueueActionsSheet,
  visitRecord: VisitRecordSheet,
  prescriptionDesign: PrescriptionDesignSheet,
  photoViewer: PhotoViewerSheet,
  treatmentPlan: TreatmentPlanSheet,
  patientPicker: PatientPickerSheet,
  patientConsult: PatientConsultSheet,
  consultRecord: ConsultRecordSheet,
  addInventory: AddInventorySheet,
  inventoryDetail: InventoryDetailSheet,
  newLabCase: NewLabCaseSheet,
  labCaseDetail: LabCaseDetailSheet,
  inventoryVoice: InventoryVoiceSheet,
};

export default function SheetHost() {
  const activeSheet = useAppStore((s) => s.activeSheet);
  const closeSheet = useAppStore((s) => s.closeSheet);

  if (!activeSheet) return null;
  const SheetComp = SHEETS[activeSheet.name];
  if (!SheetComp) return null;

  return (
    <BottomSheet open onClose={closeSheet} dismissable={activeSheet.name !== 'endVisit'}>
      <SheetComp params={activeSheet.params} onClose={closeSheet} />
    </BottomSheet>
  );
}
