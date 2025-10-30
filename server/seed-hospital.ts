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
  DEFAULT_LOCATIONS,
  DEFAULT_SURGERY_ROOMS,
  DEFAULT_ADMINISTRATION_GROUPS,
  DEFAULT_MEDICATIONS,
} from "./seed-data";

export interface SeedResult {
  locationsCreated: number;
  surgeryRoomsCreated: number;
  adminGroupsCreated: number;
  medicationsCreated: number;
}

/**
 * Seeds a hospital with default data (locations, surgery rooms, admin groups, medications)
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
    locationsCreated: 0,
    surgeryRoomsCreated: 0,
    adminGroupsCreated: 0,
    medicationsCreated: 0,
  };

  // 1. CREATE LOCATIONS (only if they don't exist)
  const existingLocations = await storage.getLocations(hospitalId);
  const existingLocationNames = new Set(existingLocations.map(l => l.name));

  let anesthesyLocation = existingLocations.find(l => l.name === "Anesthesy");
  let orLocation = existingLocations.find(l => l.name === "Operating Room (OR)");

  for (const locationData of DEFAULT_LOCATIONS) {
    if (!existingLocationNames.has(locationData.name)) {
      const newLocation = await storage.createLocation({
        hospitalId,
        name: locationData.name,
        type: locationData.type,
        parentId: locationData.parentId,
      });
      result.locationsCreated++;

      // Keep references to key locations
      if (locationData.name === "Anesthesy") {
        anesthesyLocation = newLocation;
      } else if (locationData.name === "Operating Room (OR)") {
        orLocation = newLocation;
      }
    }
  }

  // Ensure we have required locations
  if (!anesthesyLocation) {
    throw new Error("Anesthesy location not found - cannot seed medications");
  }
  if (!orLocation) {
    throw new Error("Operating Room location not found - cannot configure surgery module");
  }

  // If this is a new hospital with a user, assign user as admin to Anesthesy location
  if (userId && existingLocations.length === 0) {
    await storage.createUserHospitalRole({
      userId,
      hospitalId,
      unitId: anesthesyLocation.id,
      role: "admin",
    });

    // Configure modules to use appropriate locations
    await storage.updateHospital(hospitalId, {
      anesthesiaLocationId: anesthesyLocation.id,
      surgeryLocationId: orLocation.id, // Doctors in OR location are available as surgeons
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
  const existingItems = await storage.getItems(hospitalId, anesthesyLocation.id);
  const existingItemNames = new Set(existingItems.map(i => i.name));

  for (const medData of DEFAULT_MEDICATIONS) {
    if (!existingItemNames.has(medData.name)) {
      // Create the item
      const newItem = await storage.createItem({
        hospitalId,
        unitId: anesthesyLocation.id,
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
      await storage.updateStockLevel(newItem.id, anesthesyLocation.id, 0);

      result.medicationsCreated++;
    }
  }

  // 5. CREATE HOSPITAL ANESTHESIA SETTINGS (only if they don't exist)
  const existingSettings = await storage.getHospitalAnesthesiaSettings(hospitalId);
  
  if (!existingSettings) {
    await storage.upsertHospitalAnesthesiaSettings({
      hospitalId,
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
