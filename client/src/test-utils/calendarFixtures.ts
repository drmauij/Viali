export function mockSurgeryEvent(over: Partial<any> = {}) {
  const start = over.start ?? new Date();
  const end = over.end ?? new Date();
  return {
    id: 1,
    surgeryId: 1,
    start,
    end,
    plannedSurgery: "Test surgery",
    patientName: "Test Patient",
    patientBirthday: "",
    surgeonName: "Dr. Test",
    isCancelled: false,
    isSuspended: false,
    noPreOpRequired: false,
    ambulantQuickCheck: null,
    riskGrade: "green",
    perioperativeRisk: null,
    questionnaireStatus: null,
    preOpAssessmentStatus: null,
    ...over,
  };
}
