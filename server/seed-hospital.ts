/**
 * Hospital Seeding Function
 * 
 * This module provides the seedHospitalData function which populates a hospital with
 * default data from server/seed-data.ts.
 * 
 * IMPORTANT: This function only ADDS missing data - it never replaces or deletes existing data.
 * This ensures that:
 * - New hospitals get all default data automatically
 * - Existing hospitals can fill in missing items without losing customizations
 * - Manual additions/changes are always preserved
 */

import { storage } from "./storage";
import {
  DEFAULT_UNITS,
  DEFAULT_SURGERY_ROOMS,
  DEFAULT_ADMINISTRATION_GROUPS,
  DEFAULT_MEDICATIONS,
} from "./seed-data";

export interface SeedResult {
  unitsCreated: number;
  surgeryRoomsCreated: number;
  adminGroupsCreated: number;
  medicationsCreated: number;
}

export const DEFAULT_ALLERGY_LIST = [
  { id: "penicillin", label: "Penicillin" },
  { id: "latex", label: "Latex" },
  { id: "localAnesthetics", label: "Local Anesthetics" },
  { id: "nsaids", label: "NSAIDs" },
  { id: "opioids", label: "Opioids" },
  { id: "muscleRelaxants", label: "Muscle Relaxants" },
  { id: "contrastMedia", label: "Contrast Media" },
  { id: "eggs", label: "Eggs" },
  { id: "soy", label: "Soy" },
];

export const DEFAULT_MEDICATION_LISTS = {
  anticoagulation: [
    { id: "aspirin", label: "Aspirin" },
    { id: "warfarin", label: "Warfarin" },
    { id: "clopidogrel", label: "Clopidogrel" },
    { id: "rivaroxaban", label: "Rivaroxaban" },
    { id: "apixaban", label: "Apixaban" },
    { id: "heparin", label: "Heparin" },
  ],
  general: [
    { id: "metformin", label: "Metformin" },
    { id: "insulin", label: "Insulin" },
    { id: "levothyroxine", label: "Levothyroxine" },
    { id: "metoprolol", label: "Metoprolol" },
    { id: "lisinopril", label: "Lisinopril" },
    { id: "amlodipine", label: "Amlodipine" },
    { id: "atorvastatin", label: "Atorvastatin" },
    { id: "omeprazole", label: "Omeprazole" },
  ],
};

export const DEFAULT_CHECKLIST_ITEMS = {
  signIn: [
    { id: "patientIdentity", label: "Patient identity confirmed" },
    { id: "surgicalSiteMarked", label: "Surgical site marked" },
    { id: "consentVerified", label: "Consent verified" },
    { id: "anesthesiaEquipment", label: "Anesthesia equipment checked" },
    { id: "pulseOximeter", label: "Pulse oximeter on patient" },
    { id: "allergiesDocumented", label: "Known allergies documented" },
    { id: "difficultAirway", label: "Difficult airway assessment" },
    { id: "bloodLossRisk", label: "Risk of blood loss >500ml" },
  ],
  timeOut: [
    { id: "teamIntroductions", label: "Team introductions complete" },
    { id: "correctPatient", label: "Correct patient confirmed" },
    { id: "correctProcedure", label: "Correct procedure confirmed" },
    { id: "correctSiteSide", label: "Correct site/side confirmed" },
    { id: "criticalEvents", label: "Anticipated critical events discussed" },
    { id: "antibioticsGiven", label: "Antibiotics given (if required)" },
    { id: "imagingDisplayed", label: "Essential imaging displayed" },
  ],
  signOut: [
    { id: "procedureRecorded", label: "Procedure name recorded" },
    { id: "countsCorrect", label: "Instrument/sponge/needle counts correct" },
    { id: "specimenLabeling", label: "Specimen labeling confirmed" },
    { id: "equipmentProblems", label: "Equipment problems addressed" },
    { id: "recoveryConcerns", label: "Key concerns for recovery discussed" },
  ],
};

/**
 * Resets the allergies, medications, and checklists to default values.
 * This is a DESTRUCTIVE operation that replaces existing customizations.
 * Preserves all other hospital anesthesia settings (illnessLists, medicationConfigurations, etc.)
 * 
 * @param hospitalId - The hospital ID to reset
 * @returns Object with reset status
 */
export async function resetListsToDefaults(hospitalId: string): Promise<{ success: boolean }> {
  const existingSettings = await storage.getHospitalAnesthesiaSettings(hospitalId);
  
  if (existingSettings) {
    // Preserve all existing settings, only override the specific lists
    await storage.upsertHospitalAnesthesiaSettings({
      ...existingSettings,
      hospitalId,
      allergyList: DEFAULT_ALLERGY_LIST,
      medicationLists: DEFAULT_MEDICATION_LISTS,
      checklistItems: DEFAULT_CHECKLIST_ITEMS,
    });
  } else {
    // No existing settings, create with just defaults
    await storage.upsertHospitalAnesthesiaSettings({
      hospitalId,
      allergyList: DEFAULT_ALLERGY_LIST,
      medicationLists: DEFAULT_MEDICATION_LISTS,
      checklistItems: DEFAULT_CHECKLIST_ITEMS,
    });
  }
  
  return { success: true };
}

/**
 * Seeds a hospital with default data (units, surgery rooms, admin groups, medications)
 * Only creates items that don't already exist - never replaces existing data.
 * 
 * @param hospitalId - The hospital ID to seed
 * @param userId - The user ID to assign as admin (for new hospitals only)
 * @returns Object containing counts of items created
 */
export async function seedHospitalData(
  hospitalId: string,
  userId?: string
): Promise<SeedResult> {
  const result: SeedResult = {
    unitsCreated: 0,
    surgeryRoomsCreated: 0,
    adminGroupsCreated: 0,
    medicationsCreated: 0,
  };

  // 1. CREATE UNITS (only if they don't exist)
  const existingUnits = await storage.getUnits(hospitalId);
  const existingUnitNames = new Set(existingUnits.map(l => l.name));

  let anesthesiaUnit = existingUnits.find(l => l.name === "Anesthesia");
  let orUnit = existingUnits.find(l => l.name === "Operating Room (OR)");

  for (const unitData of DEFAULT_UNITS) {
    if (!existingUnitNames.has(unitData.name)) {
      const newUnit = await storage.createUnit({
        hospitalId,
        name: unitData.name,
        type: unitData.type,
        parentId: unitData.parentId,
        isAnesthesiaModule: unitData.name === "Anesthesia",
        isSurgeryModule: unitData.name === "Operating Room (OR)",
      });
      result.unitsCreated++;

      // Keep references to key units
      if (unitData.name === "Anesthesia") {
        anesthesiaUnit = newUnit;
      } else if (unitData.name === "Operating Room (OR)") {
        orUnit = newUnit;
      }
    }
  }

  // Ensure we have required units
  if (!anesthesiaUnit) {
    throw new Error("Anesthesia unit not found - cannot seed medications");
  }
  if (!orUnit) {
    throw new Error("Operating Room unit not found - cannot configure surgery module");
  }

  // If this is a new hospital with a user, assign user as admin to Anesthesia unit
  if (userId && existingUnits.length === 0) {
    await storage.createUserHospitalRole({
      userId,
      hospitalId,
      unitId: anesthesiaUnit.id,
      role: "admin",
    });
  }

  // 2. CREATE SURGERY ROOMS (only if they don't exist)
  const existingSurgeryRooms = await storage.getSurgeryRooms(hospitalId);
  const existingSurgeryRoomNames = new Set(existingSurgeryRooms.map(r => r.name));

  for (const roomData of DEFAULT_SURGERY_ROOMS) {
    if (!existingSurgeryRoomNames.has(roomData.name)) {
      await storage.createSurgeryRoom({
        hospitalId,
        name: roomData.name,
        sortOrder: roomData.sortOrder,
      });
      result.surgeryRoomsCreated++;
    }
  }

  // 3. CREATE ADMINISTRATION GROUPS (only if they don't exist)
  const existingAdminGroups = await storage.getAdministrationGroups(hospitalId);
  const existingAdminGroupNames = new Set(existingAdminGroups.map(g => g.name));

  for (const groupData of DEFAULT_ADMINISTRATION_GROUPS) {
    if (!existingAdminGroupNames.has(groupData.name)) {
      await storage.createAdministrationGroup({
        hospitalId,
        name: groupData.name,
        sortOrder: groupData.sortOrder,
      });
      result.adminGroupsCreated++;
    }
  }

  // 4. CREATE MEDICATIONS (only if they don't exist)
  const existingItems = await storage.getItems(hospitalId, anesthesiaUnit.id);
  const existingItemNames = new Set(existingItems.map(i => i.name));

  for (const medData of DEFAULT_MEDICATIONS) {
    if (!existingItemNames.has(medData.name)) {
      // Create the item
      const newItem = await storage.createItem({
        hospitalId,
        unitId: anesthesiaUnit.id,
        name: medData.name,
        unit: medData.unit,
        trackExactQuantity: medData.trackExactQuantity,
        critical: false,
        controlled: false,
        minThreshold: 0,
        maxThreshold: 100,
        currentUnits: 0,
        packSize: 1,
      });

      // Create medication configuration
      await storage.upsertMedicationConfig({
        itemId: newItem.id,
        medicationGroup: medData.medicationGroup || null,
        administrationGroup: medData.administrationGroup,
        ampuleTotalContent: medData.ampuleTotalContent,
        defaultDose: medData.defaultDose,
        administrationRoute: medData.administrationRoute,
        administrationUnit: medData.administrationUnit,
        rateUnit: medData.rateUnit || null,
      });

      // Create initial stock level (0 quantity)
      await storage.updateStockLevel(newItem.id, anesthesiaUnit.id, 0);

      result.medicationsCreated++;
    }
  }

  // 5. CREATE HOSPITAL ANESTHESIA SETTINGS (only if they don't exist)
  const existingSettings = await storage.getHospitalAnesthesiaSettings(hospitalId);
  
  if (!existingSettings) {
    await storage.upsertHospitalAnesthesiaSettings({
      hospitalId,
      allergyList: [
        { id: "penicillin", label: "Penicillin" },
        { id: "latex", label: "Latex" },
        { id: "localAnesthetics", label: "Local Anesthetics" },
        { id: "nsaids", label: "NSAIDs" },
        { id: "opioids", label: "Opioids" },
        { id: "muscleRelaxants", label: "Muscle Relaxants" },
        { id: "contrastMedia", label: "Contrast Media" },
        { id: "eggs", label: "Eggs" },
        { id: "soy", label: "Soy" },
      ],
      illnessLists: {
        cardiovascular: [
          { id: "htn", label: "Hypertension (HTN)" },
          { id: "chd", label: "Coronary Heart Disease (CHD)" },
          { id: "heartValve", label: "Heart Valve Disease" },
          { id: "arrhythmia", label: "Arrhythmia" },
          { id: "heartFailure", label: "Heart Failure" },
        ],
        pulmonary: [
          { id: "asthma", label: "Asthma" },
          { id: "copd", label: "COPD" },
          { id: "sleepApnea", label: "Sleep Apnea" },
          { id: "pneumoniaHistory", label: "Pneumonia History" },
        ],
        gastrointestinal: [
          { id: "reflux", label: "Reflux" },
          { id: "ibd", label: "Inflammatory Bowel Disease (IBD)" },
          { id: "liverDisease", label: "Liver Disease" },
        ],
        kidney: [
          { id: "ckd", label: "Chronic Kidney Disease (CKD)" },
          { id: "dialysis", label: "Dialysis" },
        ],
        metabolic: [
          { id: "diabetes", label: "Diabetes" },
          { id: "thyroidDisorder", label: "Thyroid Disorder" },
        ],
        neurological: [
          { id: "stroke", label: "Stroke History" },
          { id: "epilepsy", label: "Epilepsy" },
          { id: "parkinsons", label: "Parkinson's Disease" },
          { id: "dementia", label: "Dementia" },
        ],
        psychiatric: [
          { id: "depression", label: "Depression" },
          { id: "anxiety", label: "Anxiety" },
          { id: "psychosis", label: "Psychosis" },
        ],
        skeletal: [
          { id: "arthritis", label: "Arthritis" },
          { id: "osteoporosis", label: "Osteoporosis" },
          { id: "spineDisorders", label: "Spine Disorders" },
        ],
        coagulation: [
          { id: "vte", label: "Venous Thromboembolism (VTE)" },
          { id: "dvt", label: "Deep Vein Thrombosis (DVT)" },
          { id: "pulmonaryEmbolism", label: "Pulmonary Embolism" },
          { id: "hemophilia", label: "Hemophilia" },
          { id: "vonWillebrand", label: "Von Willebrand Disease" },
          { id: "thrombocytopenia", label: "Thrombocytopenia" },
          { id: "factorDeficiency", label: "Factor Deficiency" },
          { id: "anticoagulationTherapy", label: "Anticoagulation Therapy" },
          { id: "bleedingDisorder", label: "Bleeding Disorder" },
        ],
        infectious: [
          { id: "hivAids", label: "HIV/AIDS" },
          { id: "hepatitisB", label: "Hepatitis B" },
          { id: "hepatitisC", label: "Hepatitis C" },
          { id: "tuberculosis", label: "Tuberculosis (TB)" },
          { id: "mrsa", label: "MRSA" },
          { id: "vre", label: "VRE (Vancomycin-resistant Enterococci)" },
          { id: "clostridiumDifficile", label: "Clostridium Difficile (C. diff)" },
          { id: "covid19", label: "COVID-19 History" },
          { id: "influenza", label: "Influenza" },
          { id: "malaria", label: "Malaria" },
        ],
        noxen: [
          { id: "smoking", label: "Smoking" },
          { id: "alcohol", label: "Alcohol" },
          { id: "drugs", label: "Illicit Drugs" },
        ],
        woman: [
          { id: "pregnancy", label: "Pregnancy" },
          { id: "breastfeeding", label: "Breastfeeding" },
          { id: "menopause", label: "Menopause" },
          { id: "gynSurgery", label: "Gynecological Surgery" },
        ],
        children: [
          { id: "prematurity", label: "Prematurity" },
          { id: "developmentalDelay", label: "Developmental Delay" },
          { id: "congenitalAnomalies", label: "Congenital Anomalies" },
          { id: "vaccinationStatus", label: "Vaccination Status" },
        ],
        // Anesthesia & Surgical History section
        anesthesiaHistory: [
          { id: "previousAnesthesiaProblems", label: "Previous Anesthesia Problems" },
          { id: "regionalAnesthesiaComplications", label: "Regional Anesthesia Complications" },
          { id: "localAnesthesiaReactions", label: "Local Anesthesia Reactions" },
          { id: "malignantHyperthermiaFamily", label: "Family History: Malignant Hyperthermia" },
          { id: "anesthesiaProblemsFamily", label: "Family History: Anesthesia Problems" },
          { id: "difficultIntubationHistory", label: "Difficult Intubation History" },
          { id: "prolongedRecovery", label: "Prolonged Recovery from Anesthesia" },
          { id: "postOpNauseaVomiting", label: "Post-operative Nausea/Vomiting" },
        ],
        dental: [
          { id: "looseTeeth", label: "Loose Teeth" },
          { id: "caries", label: "Caries" },
          { id: "paradontosis", label: "Paradontosis" },
          { id: "dentures", label: "Dentures" },
          { id: "bridges", label: "Bridges" },
          { id: "crowns", label: "Crowns" },
          { id: "implants", label: "Dental Implants" },
          { id: "braces", label: "Braces/Orthodontics" },
        ],
        ponvTransfusion: [
          { id: "motionSickness", label: "Motion Sickness" },
          { id: "ponvHistory", label: "Previous PONV (Post-op Nausea/Vomiting)" },
          { id: "transfusionReactions", label: "Transfusion Reactions" },
          { id: "bloodProductAllergy", label: "Blood Product Allergy" },
          { id: "refusesBloodProducts", label: "Refuses Blood Products" },
          { id: "previousTransfusion", label: "Previous Blood Transfusion" },
        ],
      },
      checklistItems: {
        signIn: [
          { id: "patientIdentity", label: "Patient identity confirmed" },
          { id: "surgicalSiteMarked", label: "Surgical site marked" },
          { id: "consentVerified", label: "Consent verified" },
          { id: "anesthesiaEquipment", label: "Anesthesia equipment checked" },
          { id: "pulseOximeter", label: "Pulse oximeter on patient" },
          { id: "allergiesDocumented", label: "Known allergies documented" },
          { id: "difficultAirway", label: "Difficult airway assessment" },
          { id: "bloodLossRisk", label: "Risk of blood loss >500ml" },
        ],
        timeOut: [
          { id: "teamIntroductions", label: "Team introductions complete" },
          { id: "correctPatient", label: "Correct patient confirmed" },
          { id: "correctProcedure", label: "Correct procedure confirmed" },
          { id: "correctSiteSide", label: "Correct site/side confirmed" },
          { id: "criticalEvents", label: "Anticipated critical events discussed" },
          { id: "antibioticsGiven", label: "Antibiotics given (if required)" },
          { id: "imagingDisplayed", label: "Essential imaging displayed" },
        ],
        signOut: [
          { id: "procedureRecorded", label: "Procedure name recorded" },
          { id: "countsCorrect", label: "Instrument/sponge/needle counts correct" },
          { id: "specimenLabeling", label: "Specimen labeling confirmed" },
          { id: "equipmentProblems", label: "Equipment problems addressed" },
          { id: "recoveryConcerns", label: "Key concerns for recovery discussed" },
        ],
      },
    });
  } else {
    // Settings exist - merge any missing illness list categories
    const defaultIllnessLists: Record<string, Array<{ id: string; label: string }>> = {
      anesthesiaHistory: [
        { id: "previousAnesthesiaProblems", label: "Previous Anesthesia Problems" },
        { id: "regionalAnesthesiaComplications", label: "Regional Anesthesia Complications" },
        { id: "localAnesthesiaReactions", label: "Local Anesthesia Reactions" },
        { id: "malignantHyperthermiaFamily", label: "Family History: Malignant Hyperthermia" },
        { id: "anesthesiaProblemsFamily", label: "Family History: Anesthesia Problems" },
        { id: "difficultIntubationHistory", label: "Difficult Intubation History" },
        { id: "prolongedRecovery", label: "Prolonged Recovery from Anesthesia" },
        { id: "postOpNauseaVomiting", label: "Post-operative Nausea/Vomiting" },
      ],
      dental: [
        { id: "looseTeeth", label: "Loose Teeth" },
        { id: "caries", label: "Caries" },
        { id: "paradontosis", label: "Paradontosis" },
        { id: "dentures", label: "Dentures" },
        { id: "bridges", label: "Bridges" },
        { id: "crowns", label: "Crowns" },
        { id: "implants", label: "Dental Implants" },
        { id: "braces", label: "Braces/Orthodontics" },
      ],
      ponvTransfusion: [
        { id: "motionSickness", label: "Motion Sickness" },
        { id: "ponvHistory", label: "Previous PONV (Post-op Nausea/Vomiting)" },
        { id: "transfusionReactions", label: "Transfusion Reactions" },
        { id: "bloodProductAllergy", label: "Blood Product Allergy" },
        { id: "refusesBloodProducts", label: "Refuses Blood Products" },
        { id: "previousTransfusion", label: "Previous Blood Transfusion" },
      ],
    };

    const existingIllnessLists = (existingSettings.illnessLists as Record<string, any>) || {};
    let needsUpdate = false;
    const mergedIllnessLists = { ...existingIllnessLists };

    // Add missing categories (don't overwrite existing ones)
    for (const [category, items] of Object.entries(defaultIllnessLists)) {
      if (!existingIllnessLists[category]) {
        mergedIllnessLists[category] = items;
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      await storage.upsertHospitalAnesthesiaSettings({
        ...existingSettings,
        illnessLists: mergedIllnessLists,
      });
    }
  }

  return result;
}
