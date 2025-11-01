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

  let anesthesyUnit = existingUnits.find(l => l.name === "Anesthesy");
  let orUnit = existingUnits.find(l => l.name === "Operating Room (OR)");

  for (const unitData of DEFAULT_UNITS) {
    if (!existingUnitNames.has(unitData.name)) {
      const newUnit = await storage.createUnit({
        hospitalId,
        name: unitData.name,
        type: unitData.type,
        parentId: unitData.parentId,
      });
      result.unitsCreated++;

      // Keep references to key units
      if (unitData.name === "Anesthesy") {
        anesthesyUnit = newUnit;
      } else if (unitData.name === "Operating Room (OR)") {
        orUnit = newUnit;
      }
    }
  }

  // Ensure we have required units
  if (!anesthesyUnit) {
    throw new Error("Anesthesy unit not found - cannot seed medications");
  }
  if (!orUnit) {
    throw new Error("Operating Room unit not found - cannot configure surgery module");
  }

  // If this is a new hospital with a user, assign user as admin to Anesthesy unit
  if (userId && existingUnits.length === 0) {
    await storage.createUserHospitalRole({
      userId,
      hospitalId,
      unitId: anesthesyUnit.id,
      role: "admin",
    });

    // Configure modules to use appropriate units
    await storage.updateHospital(hospitalId, {
      anesthesiaUnitId: anesthesyUnit.id,
      surgeryUnitId: orUnit.id, // Doctors in OR unit are available as surgeons
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
  const existingItems = await storage.getItems(hospitalId, anesthesyUnit.id);
  const existingItemNames = new Set(existingItems.map(i => i.name));

  for (const medData of DEFAULT_MEDICATIONS) {
    if (!existingItemNames.has(medData.name)) {
      // Create the item
      const newItem = await storage.createItem({
        hospitalId,
        unitId: anesthesyUnit.id,
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
      await storage.updateStockLevel(newItem.id, anesthesyUnit.id, 0);

      result.medicationsCreated++;
    }
  }

  // 5. CREATE HOSPITAL ANESTHESIA SETTINGS (only if they don't exist)
  const existingSettings = await storage.getHospitalAnesthesiaSettings(hospitalId);
  
  if (!existingSettings) {
    await storage.upsertHospitalAnesthesiaSettings({
      hospitalId,
      allergyList: [
        "Penicillin",
        "Latex",
        "Local Anesthetics",
        "NSAIDs",
        "Opioids",
        "Muscle Relaxants",
        "Contrast Media",
        "Eggs",
        "Soy",
      ],
      medicationLists: {
        anticoagulation: [
          "Aspirin",
          "Warfarin",
          "Clopidogrel",
          "Rivaroxaban",
          "Apixaban",
          "Heparin",
        ],
        general: [
          "Metformin",
          "Insulin",
          "Levothyroxine",
          "Metoprolol",
          "Lisinopril",
          "Amlodipine",
          "Atorvastatin",
          "Omeprazole",
        ],
      },
      illnessLists: {
        cardiovascular: [
          "Hypertension",
          "Coronary Artery Disease",
          "Heart Failure",
          "Arrhythmia",
          "Valvular Disease",
          "Cardiomyopathy",
        ],
        pulmonary: [
          "Asthma",
          "COPD",
          "Sleep Apnea",
          "Pulmonary Hypertension",
          "Interstitial Lung Disease",
        ],
        gastrointestinal: [
          "GERD",
          "Hiatal Hernia",
          "Liver Disease",
          "Previous Bowel Surgery",
        ],
        kidney: [
          "Chronic Kidney Disease",
          "Dialysis",
          "Renal Transplant",
        ],
        metabolic: [
          "Diabetes Mellitus",
          "Thyroid Disease",
          "Adrenal Disease",
          "Obesity",
        ],
        neurological: [
          "Seizure Disorder",
          "Stroke/TIA",
          "Neuromuscular Disease",
          "Previous CNS Surgery",
        ],
        psychiatric: [
          "Anxiety Disorder",
          "Depression",
          "PTSD",
        ],
        noxen: [
          "Smoking",
          "Alcohol Abuse",
          "Drug Abuse",
        ],
        woman: [
          "Pregnancy",
          "Previous C-Section",
        ],
        children: [
          "Prematurity",
          "Congenital Heart Disease",
          "Developmental Delay",
        ],
      },
      checklistItems: {
        signIn: [
          "Patient identity confirmed",
          "Surgical site marked",
          "Consent verified",
          "Anesthesia equipment checked",
          "Pulse oximeter on patient",
          "Known allergies documented",
          "Difficult airway assessment",
          "Risk of blood loss >500ml",
        ],
        timeOut: [
          "Team introductions complete",
          "Correct patient confirmed",
          "Correct procedure confirmed",
          "Correct site/side confirmed",
          "Anticipated critical events discussed",
          "Antibiotics given (if required)",
          "Essential imaging displayed",
        ],
        signOut: [
          "Procedure name recorded",
          "Instrument/sponge/needle counts correct",
          "Specimen labeling confirmed",
          "Equipment problems addressed",
          "Key concerns for recovery discussed",
        ],
      },
    });
  }

  return result;
}
