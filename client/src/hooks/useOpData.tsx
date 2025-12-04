import { useQuery } from "@tanstack/react-query";
import {
  useInstallations,
  useGeneralTechnique,
  useAirwayManagement,
  useNeuraxialBlocks,
  usePeripheralBlocks,
} from "@/lib/anesthesiaDocumentation";

interface UseOpDataParams {
  surgeryId: string;
  activeHospitalId: string;
  recordId?: string;
}

export function useOpData({ surgeryId, activeHospitalId, recordId }: UseOpDataParams) {
  // Core data queries
  const { data: surgery, isLoading: isSurgeryLoading, error: surgeryError } = useQuery<any>({
    queryKey: [`/api/anesthesia/surgeries/${surgeryId}`],
    enabled: !!surgeryId,
  });

  // Fetch anesthesia record - by recordId if provided, otherwise by surgeryId
  const { data: anesthesiaRecord, isLoading: isRecordLoading } = useQuery<any>({
    queryKey: recordId 
      ? [`/api/anesthesia/records/${recordId}`]
      : [`/api/anesthesia/records/surgery/${surgeryId}`],
    enabled: !!surgeryId || !!recordId,
  });

  const { data: preOpAssessment, isLoading: isPreOpLoading } = useQuery<any>({
    queryKey: [`/api/anesthesia/preop/surgery/${surgeryId}`],
    enabled: !!surgeryId,
  });

  const { data: patient, isLoading: isPatientLoading, error: patientError } = useQuery<any>({
    queryKey: [`/api/patients/${surgery?.patientId}`],
    enabled: !!surgery?.patientId,
  });

  const { data: anesthesiaSettings } = useQuery<any>({
    queryKey: [`/api/anesthesia/settings/${activeHospitalId}`],
    enabled: !!activeHospitalId,
  });

  const { data: hospitalUsers = [] } = useQuery<any[]>({
    queryKey: [`/api/admin/${activeHospitalId}/users`],
    enabled: !!activeHospitalId,
  });

  // Timeline and vitals data
  const { data: vitalsData = [], isLoading: isVitalsLoading, isError: isVitalsError, status: vitalsStatus } = useQuery<any[]>({
    queryKey: [`/api/anesthesia/vitals/${anesthesiaRecord?.id}`],
    enabled: !!anesthesiaRecord?.id,
  });

  const { data: medicationsData = [], isLoading: isMedicationsLoading, isError: isMedicationsError, status: medicationsStatus } = useQuery<any[]>({
    queryKey: [`/api/anesthesia/medications/${anesthesiaRecord?.id}`],
    enabled: !!anesthesiaRecord?.id,
  });

  const { data: eventsData = [], isLoading: isEventsLoading, isError: isEventsError, status: eventsStatus } = useQuery<any[]>({
    queryKey: [`/api/anesthesia/events/${anesthesiaRecord?.id}`],
    enabled: !!anesthesiaRecord?.id,
  });

  const { data: anesthesiaItems = [], isLoading: isAnesthesiaItemsLoading, isError: isAnesthesiaItemsError, status: anesthesiaItemsStatus } = useQuery<any[]>({
    queryKey: [`/api/anesthesia/items/${activeHospitalId}`],
    enabled: !!activeHospitalId,
  });

  const { data: clinicalSnapshot, isLoading: isClinicalSnapshotLoading, isError: isClinicalSnapshotError, status: clinicalSnapshotStatus } = useQuery<any>({
    queryKey: [`/api/anesthesia/vitals/snapshot/${anesthesiaRecord?.id}`],
    enabled: !!anesthesiaRecord?.id,
  });

  const { data: staffMembers = [], isLoading: isStaffLoading, isError: isStaffError, status: staffStatus } = useQuery<any[]>({
    queryKey: [`/api/anesthesia/staff/${anesthesiaRecord?.id}`],
    enabled: !!anesthesiaRecord?.id,
  });

  const { data: positions = [], isLoading: isPositionsLoading, isError: isPositionsError, status: positionsStatus } = useQuery<any[]>({
    queryKey: [`/api/anesthesia/positions/${anesthesiaRecord?.id}`],
    enabled: !!anesthesiaRecord?.id,
  });

  // Documentation hooks
  const { data: installationsData = [] } = useInstallations(anesthesiaRecord?.id || "");
  const { data: generalTechniqueData } = useGeneralTechnique(anesthesiaRecord?.id || "");
  const { data: airwayManagementData } = useAirwayManagement(anesthesiaRecord?.id || "");
  const { data: neuraxialBlocksData = [] } = useNeuraxialBlocks(anesthesiaRecord?.id || "");
  const { data: peripheralBlocksData = [] } = usePeripheralBlocks(anesthesiaRecord?.id || "");

  // Inventory data
  const { data: inventoryUsage = [] } = useQuery<any[]>({
    queryKey: [`/api/anesthesia/inventory/${anesthesiaRecord?.id}`],
    enabled: !!anesthesiaRecord?.id,
  });

  const { data: inventoryCommits = [] } = useQuery<any[]>({
    queryKey: [`/api/anesthesia/inventory/${anesthesiaRecord?.id}/commits`],
    enabled: !!anesthesiaRecord?.id,
  });

  const { data: inventoryItems = [] } = useQuery<any[]>({
    queryKey: [`/api/anesthesia/items/${activeHospitalId}`],
    enabled: !!activeHospitalId,
  });

  // Inventory items and folders (for controlled items dialog)
  const { data: items = [] } = useQuery<any[]>({
    queryKey: [`/api/items/${activeHospitalId}`],
    enabled: !!activeHospitalId,
  });

  const { data: folders = [] } = useQuery<any[]>({
    queryKey: [`/api/folders/${activeHospitalId}`],
    enabled: !!activeHospitalId,
  });

  // Compute loading states
  const isCoreDataLoading = isSurgeryLoading || isRecordLoading || isPatientLoading;
  const isTimelineDataLoading = isVitalsLoading || isMedicationsLoading || isEventsLoading || isStaffLoading || isPositionsLoading;
  const isAllDataLoading = isCoreDataLoading || isTimelineDataLoading || isAnesthesiaItemsLoading;

  return {
    // Core data
    surgery,
    anesthesiaRecord,
    preOpAssessment,
    patient,
    anesthesiaSettings,
    hospitalUsers,

    // Timeline and vitals data
    vitalsData,
    medicationsData,
    eventsData,
    anesthesiaItems,
    clinicalSnapshot,
    staffMembers,
    positions,

    // Documentation data
    installationsData,
    generalTechniqueData,
    airwayManagementData,
    neuraxialBlocksData,
    peripheralBlocksData,

    // Inventory data
    inventoryUsage,
    inventoryCommits,
    inventoryItems,
    items,
    folders,

    // Loading states
    isSurgeryLoading,
    isRecordLoading,
    isPreOpLoading,
    isPatientLoading,
    isVitalsLoading,
    isMedicationsLoading,
    isEventsLoading,
    isAnesthesiaItemsLoading,
    isClinicalSnapshotLoading,
    isStaffLoading,
    isPositionsLoading,
    isCoreDataLoading,
    isTimelineDataLoading,
    isAllDataLoading,

    // Error states
    surgeryError,
    patientError,
    isVitalsError,
    isMedicationsError,
    isEventsError,
    isAnesthesiaItemsError,
    isClinicalSnapshotError,
    isStaffError,
    isPositionsError,

    // Status flags
    vitalsStatus,
    medicationsStatus,
    eventsStatus,
    anesthesiaItemsStatus,
    clinicalSnapshotStatus,
    staffStatus,
    positionsStatus,
  };
}
