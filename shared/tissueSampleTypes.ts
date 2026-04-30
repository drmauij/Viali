// Per-tissue-type configuration. Source of truth for the tissue & samples
// feature. Imported by both server (validation, code generation) and client
// (UI labels, dropdowns, status pickers).
//
// To enable a type in v1's UI: set enabledInUI=true, fill statuses[] and
// initialStatus, and add the i18n labels to client/src/i18n/locales/{de,en}.json.
// No schema/migration work required — the schema accepts any string for
// sample_type and status; validation lives at the API boundary in this file.

export type TissueSampleType =
  | "fat"
  | "histology"
  | "cytology"
  | "frozen_section"
  | "microbiology"
  | "blood"
  | "bone_marrow"
  | "stem_cell"
  | "oocyte_sperm"
  | "dna_genetics"
  | "stone"
  | "foreign_body"
  | "placenta_cord"
  | "other";

export interface TissueSampleTypeConfig {
  code: string;                          // 'FAT', 'HIST', 'CYT', …
  label: { de: string; en: string };
  statuses: readonly string[];           // allowed statuses, in workflow order
  initialStatus: string;                 // status applied on creation
  supportsReimplant: boolean;
  defaultExternalLab?: string;
  enabledInUI: boolean;                  // v1: true only for 'fat'
}

export const TISSUE_SAMPLE_TYPES: Record<TissueSampleType, TissueSampleTypeConfig> = {
  fat: {
    code: "FAT",
    label: { de: "Eigenfett", en: "Fat" },
    statuses: [
      "Probe entnommen",
      "Versendet an SSCB",
      "Eingelagert bei SSCB",
      "Angefordert zur Reimplantation",
      "Reimplantiert",
      "Vernichtet",
    ],
    initialStatus: "Probe entnommen",
    supportsReimplant: true,
    defaultExternalLab: "Swiss Stem Cells Biotech, Vacallo TI",
    enabledInUI: true,
  },
  histology: {
    code: "HIST",
    label: { de: "Histologie", en: "Histology" },
    statuses: [],
    initialStatus: "",
    supportsReimplant: false,
    enabledInUI: false,
  },
  cytology: {
    code: "CYT",
    label: { de: "Zytologie", en: "Cytology" },
    statuses: [],
    initialStatus: "",
    supportsReimplant: false,
    enabledInUI: false,
  },
  frozen_section: {
    code: "FROZ",
    label: { de: "Schnellschnitt", en: "Frozen Section" },
    statuses: [],
    initialStatus: "",
    supportsReimplant: false,
    enabledInUI: false,
  },
  microbiology: {
    code: "MIC",
    label: { de: "Mikrobiologie", en: "Microbiology" },
    statuses: [],
    initialStatus: "",
    supportsReimplant: false,
    enabledInUI: false,
  },
  blood: {
    code: "BLD",
    label: { de: "Blut", en: "Blood" },
    statuses: [],
    initialStatus: "",
    supportsReimplant: false,
    enabledInUI: false,
  },
  bone_marrow: {
    code: "BM",
    label: { de: "Knochenmark", en: "Bone Marrow" },
    statuses: [],
    initialStatus: "",
    supportsReimplant: false,
    enabledInUI: false,
  },
  stem_cell: {
    code: "SC",
    label: { de: "Stammzellen", en: "Stem Cells" },
    statuses: [],
    initialStatus: "",
    supportsReimplant: true,
    enabledInUI: false,
  },
  oocyte_sperm: {
    code: "RPR",
    label: { de: "Reproduktionsmedizin", en: "Reproductive Cells" },
    statuses: [],
    initialStatus: "",
    supportsReimplant: true,
    enabledInUI: false,
  },
  dna_genetics: {
    code: "DNA",
    label: { de: "Genetik / DNA", en: "DNA / Genetics" },
    statuses: [],
    initialStatus: "",
    supportsReimplant: false,
    enabledInUI: false,
  },
  stone: {
    code: "STN",
    label: { de: "Konkrement", en: "Stone" },
    statuses: [],
    initialStatus: "",
    supportsReimplant: false,
    enabledInUI: false,
  },
  foreign_body: {
    code: "FB",
    label: { de: "Fremdkörper", en: "Foreign Body" },
    statuses: [],
    initialStatus: "",
    supportsReimplant: false,
    enabledInUI: false,
  },
  placenta_cord: {
    code: "PLC",
    label: { de: "Plazenta / Nabelschnur", en: "Placenta / Cord" },
    statuses: [],
    initialStatus: "",
    supportsReimplant: false,
    enabledInUI: false,
  },
  other: {
    code: "OTH",
    label: { de: "Sonstige", en: "Other" },
    statuses: [],
    initialStatus: "",
    supportsReimplant: false,
    enabledInUI: false,
  },
};

export const TISSUE_SAMPLE_TYPE_KEYS = Object.keys(TISSUE_SAMPLE_TYPES) as TissueSampleType[];

export function getTissueSampleTypeConfig(type: string): TissueSampleTypeConfig | null {
  return TISSUE_SAMPLE_TYPES[type as TissueSampleType] ?? null;
}

export function isValidTissueSampleStatus(type: string, status: string): boolean {
  const config = getTissueSampleTypeConfig(type);
  if (!config) return false;
  return config.statuses.includes(status);
}
