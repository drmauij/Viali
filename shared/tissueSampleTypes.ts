// Per-tissue-type configuration. Source of truth for the tissue & samples
// feature. Imported by both server (validation, code generation) and client
// (UI labels, dropdowns, status pickers).
//
// All 14 types ship with a valid status workflow and enabledInUI=true.
// External labs are no longer modeled here — they live per-hospital in the
// `tissue_sample_external_labs` table; the dialog resolves a default at
// runtime from the labs API.

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
  enabledInUI: boolean;
}

export const TISSUE_SAMPLE_TYPES: Record<TissueSampleType, TissueSampleTypeConfig> = {
  fat: {
    code: "FAT",
    label: { de: "Eigenfett", en: "Fat" },
    statuses: [
      "Probe entnommen",
      "Versendet",
      "Eingelagert",
      "Angefordert zur Reimplantation",
      "Reimplantiert",
      "Vernichtet",
    ],
    initialStatus: "Probe entnommen",
    supportsReimplant: true,
    enabledInUI: true,
  },
  histology: {
    code: "HIST",
    label: { de: "Histologie", en: "Histology" },
    statuses: ["Probe entnommen", "Versendet", "Befund eingegangen", "Vernichtet"],
    initialStatus: "Probe entnommen",
    supportsReimplant: false,
    enabledInUI: true,
  },
  cytology: {
    code: "CYT",
    label: { de: "Zytologie", en: "Cytology" },
    statuses: ["Probe entnommen", "Versendet", "Befund eingegangen", "Vernichtet"],
    initialStatus: "Probe entnommen",
    supportsReimplant: false,
    enabledInUI: true,
  },
  frozen_section: {
    code: "FROZ",
    label: { de: "Schnellschnitt", en: "Frozen Section" },
    statuses: ["Probe entnommen", "Verarbeitet", "Befund verfügbar", "Vernichtet"],
    initialStatus: "Probe entnommen",
    supportsReimplant: false,
    enabledInUI: true,
  },
  microbiology: {
    code: "MIC",
    label: { de: "Mikrobiologie", en: "Microbiology" },
    statuses: ["Probe entnommen", "Versendet", "Befund eingegangen", "Vernichtet"],
    initialStatus: "Probe entnommen",
    supportsReimplant: false,
    enabledInUI: true,
  },
  blood: {
    code: "BLD",
    label: { de: "Blut", en: "Blood" },
    statuses: ["Probe entnommen", "Versendet", "Befund eingegangen", "Vernichtet"],
    initialStatus: "Probe entnommen",
    supportsReimplant: false,
    enabledInUI: true,
  },
  bone_marrow: {
    code: "BM",
    label: { de: "Knochenmark", en: "Bone Marrow" },
    statuses: [
      "Probe entnommen",
      "Versendet",
      "Eingelagert",
      "Angefordert zur Reimplantation",
      "Reimplantiert",
      "Vernichtet",
    ],
    initialStatus: "Probe entnommen",
    supportsReimplant: true,
    enabledInUI: true,
  },
  stem_cell: {
    code: "SC",
    label: { de: "Stammzellen", en: "Stem Cells" },
    statuses: [
      "Probe entnommen",
      "Versendet",
      "Eingelagert",
      "Angefordert zur Reimplantation",
      "Reimplantiert",
      "Vernichtet",
    ],
    initialStatus: "Probe entnommen",
    supportsReimplant: true,
    enabledInUI: true,
  },
  oocyte_sperm: {
    code: "RPR",
    label: { de: "Reproduktionsmedizin", en: "Reproductive Cells" },
    statuses: [
      "Probe entnommen",
      "Versendet",
      "Eingelagert",
      "Angefordert zur Reimplantation",
      "Reimplantiert",
      "Vernichtet",
    ],
    initialStatus: "Probe entnommen",
    supportsReimplant: true,
    enabledInUI: true,
  },
  dna_genetics: {
    code: "DNA",
    label: { de: "Genetik / DNA", en: "DNA / Genetics" },
    statuses: ["Probe entnommen", "Versendet", "Befund eingegangen", "Vernichtet"],
    initialStatus: "Probe entnommen",
    supportsReimplant: false,
    enabledInUI: true,
  },
  stone: {
    code: "STN",
    label: { de: "Konkrement", en: "Stone" },
    statuses: ["Probe entnommen", "Versendet", "Befund eingegangen", "Vernichtet"],
    initialStatus: "Probe entnommen",
    supportsReimplant: false,
    enabledInUI: true,
  },
  foreign_body: {
    code: "FB",
    label: { de: "Fremdkörper", en: "Foreign Body" },
    statuses: ["Probe entnommen", "Versendet", "Befund eingegangen", "Vernichtet"],
    initialStatus: "Probe entnommen",
    supportsReimplant: false,
    enabledInUI: true,
  },
  placenta_cord: {
    code: "PLC",
    label: { de: "Plazenta / Nabelschnur", en: "Placenta / Cord" },
    statuses: [
      "Probe entnommen",
      "Versendet",
      "Eingelagert",
      "Angefordert zur Reimplantation",
      "Reimplantiert",
      "Vernichtet",
    ],
    initialStatus: "Probe entnommen",
    supportsReimplant: true,
    enabledInUI: true,
  },
  other: {
    code: "OTH",
    label: { de: "Sonstige", en: "Other" },
    statuses: ["Probe entnommen", "Versendet", "Befund eingegangen", "Vernichtet"],
    initialStatus: "Probe entnommen",
    supportsReimplant: false,
    enabledInUI: true,
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
