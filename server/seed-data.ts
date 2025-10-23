/**
 * Seed Data Configuration
 * 
 * This file contains default data that is automatically created when a new hospital is set up.
 * You can edit this file to customize the default locations, surgery rooms, administration groups,
 * and medications that are created for new hospitals.
 * 
 * The seed function will only ADD missing data - it never deletes or replaces existing data.
 * This means you can safely use the "Seed Default Data" button in the admin panel to fill in
 * missing items without losing any customizations.
 */

export interface SeedLocation {
  name: string;
  type: string;
  parentId: null;
}

export interface SeedSurgeryRoom {
  name: string;
  sortOrder: number;
}

export interface SeedAdministrationGroup {
  name: string;
  sortOrder: number;
}

export interface SeedMedication {
  // Item details
  name: string;
  unit: string; // Required: vial, amp, bag, ml, etc.
  trackExactQuantity: boolean;
  
  // Medication configuration
  medicationGroup?: string;
  administrationGroup: string;
  ampuleTotalContent: string;
  defaultDose: string;
  administrationRoute: string;
  administrationUnit: string;
  // Rate control: null = bolus, "free" = free-running infusion, actual unit = rate-controlled pump
  rateUnit?: string | null;
}

/**
 * Default Locations
 * These locations are created for every new hospital
 */
export const DEFAULT_LOCATIONS: SeedLocation[] = [
  {
    name: "Anesthesy",
    type: "anesthesy",
    parentId: null,
  },
  {
    name: "Operating Room (OR)",
    type: "or",
    parentId: null,
  },
  {
    name: "Emergency Room (ER)",
    type: "er",
    parentId: null,
  },
  {
    name: "Intensive Care Unit (ICU)",
    type: "icu",
    parentId: null,
  },
];

/**
 * Default Surgery Rooms
 * These surgery rooms are created for every new hospital
 */
export const DEFAULT_SURGERY_ROOMS: SeedSurgeryRoom[] = [
  { name: "OP1", sortOrder: 0 },
  { name: "OP2", sortOrder: 1 },
  { name: "OP3", sortOrder: 2 },
];

/**
 * Default Administration Groups
 * These groups organize medications in the anesthesia charts
 */
export const DEFAULT_ADMINISTRATION_GROUPS: SeedAdministrationGroup[] = [
  { name: "Infusions", sortOrder: 0 },
  { name: "Pumps", sortOrder: 1 },
  { name: "Bolus", sortOrder: 2 },
  { name: "Short IVs", sortOrder: 3 },
  { name: "Antibiotics", sortOrder: 4 },
];

/**
 * Default Medications
 * These medications are created for every new hospital with complete anesthesia configuration
 */
export const DEFAULT_MEDICATIONS: SeedMedication[] = [
  // INFUSIONS (Free-running infusions)
  {
    name: "Ringer's Lactate",
    unit: "bag",
    trackExactQuantity: true,
    administrationGroup: "Infusions",
    ampuleTotalContent: "1000 ml",
    defaultDose: "500",
    administrationUnit: "ml",
    administrationRoute: "i.v.",
    rateUnit: "free",
  },
  {
    name: "Glucose 5%",
    unit: "bag",
    trackExactQuantity: true,
    administrationGroup: "Infusions",
    ampuleTotalContent: "500 ml",
    defaultDose: "500",
    administrationUnit: "ml",
    administrationRoute: "i.v.",
    rateUnit: "free",
  },

  // PUMPS (Rate-controlled infusions/Perfusors)
  {
    name: "Propofol 1%",
    unit: "vial",
    trackExactQuantity: true,
    medicationGroup: "Hypnotika",
    administrationGroup: "Pumps",
    ampuleTotalContent: "200 mg",
    defaultDose: "150",
    administrationUnit: "mg",
    administrationRoute: "i.v.",
    rateUnit: "mg/kg/h",
  },
  {
    name: "Norepinephrine",
    unit: "amp",
    trackExactQuantity: true,
    medicationGroup: "Catecholamines",
    administrationGroup: "Pumps",
    ampuleTotalContent: "4 mg",
    defaultDose: "0.05",
    administrationUnit: "mg",
    administrationRoute: "i.v.",
    rateUnit: "μg/kg/min",
  },
  {
    name: "Remifentanil",
    unit: "vial",
    trackExactQuantity: true,
    medicationGroup: "Opioide",
    administrationGroup: "Pumps",
    ampuleTotalContent: "5 mg",
    defaultDose: "250",
    administrationUnit: "μg",
    administrationRoute: "i.v.",
    rateUnit: "μg/kg/min",
  },

  // BOLUS (Single injection medications - no rateUnit)
  {
    name: "Fentanyl",
    unit: "amp",
    trackExactQuantity: true,
    medicationGroup: "Opioide",
    administrationGroup: "Bolus",
    ampuleTotalContent: "0.5 mg",
    defaultDose: "100",
    administrationUnit: "μg",
    administrationRoute: "i.v.",
  },
  {
    name: "Rocuronium",
    unit: "vial",
    trackExactQuantity: true,
    medicationGroup: "Muskelrelaxantien",
    administrationGroup: "Bolus",
    ampuleTotalContent: "50 mg",
    defaultDose: "50",
    administrationUnit: "mg",
    administrationRoute: "i.v.",
  },
  {
    name: "Atropine",
    unit: "amp",
    trackExactQuantity: true,
    medicationGroup: "Anticholinergika",
    administrationGroup: "Bolus",
    ampuleTotalContent: "0.5 mg",
    defaultDose: "0.5",
    administrationUnit: "mg",
    administrationRoute: "i.v.",
  },

  // SHORT IVs (Short infusions - no rateUnit)
  {
    name: "Paracetamol",
    unit: "bag",
    trackExactQuantity: true,
    medicationGroup: "Analgetika",
    administrationGroup: "Short IVs",
    ampuleTotalContent: "1000 mg",
    defaultDose: "1000",
    administrationUnit: "mg",
    administrationRoute: "i.v.",
  },
  {
    name: "Metamizole",
    unit: "amp",
    trackExactQuantity: true,
    medicationGroup: "Analgetika",
    administrationGroup: "Short IVs",
    ampuleTotalContent: "2500 mg",
    defaultDose: "1000",
    administrationUnit: "mg",
    administrationRoute: "i.v.",
  },

  // ANTIBIOTICS (no rateUnit)
  {
    name: "Cefazolin",
    unit: "vial",
    trackExactQuantity: true,
    medicationGroup: "Antibiotika",
    administrationGroup: "Antibiotics",
    ampuleTotalContent: "2000 mg",
    defaultDose: "2000",
    administrationUnit: "mg",
    administrationRoute: "i.v.",
  },
  {
    name: "Cefuroxime",
    unit: "vial",
    trackExactQuantity: true,
    medicationGroup: "Antibiotika",
    administrationGroup: "Antibiotics",
    ampuleTotalContent: "1500 mg",
    defaultDose: "1500",
    administrationUnit: "mg",
    administrationRoute: "i.v.",
  },
  {
    name: "Amoxicillin/Clavulanic acid",
    unit: "vial",
    trackExactQuantity: true,
    medicationGroup: "Antibiotika",
    administrationGroup: "Antibiotics",
    ampuleTotalContent: "2200 mg",
    defaultDose: "2200",
    administrationUnit: "mg",
    administrationRoute: "i.v.",
  },
];
