/**
 * Shared regional block definitions used by:
 * - PatientDetail.tsx (Pre-Op Assessment planning)
 * - PreOpOverview.tsx (display labels)
 * - AnesthesiaDocumentation.tsx (OP record documentation)
 *
 * NOTE on IDs:
 * - This file uses canonical IDs matching the Anesthesia Record (e.g. "interscalene")
 * - Pre-Op Assessment appends "-block" suffix (e.g. "interscalene-block")
 * - Anesthesia Record uses the ID as-is (e.g. "interscalene")
 */

export interface RegionalBlockDef {
  /** Canonical block ID (no suffix). Used as the <option> value in AnesthesiaDocumentation. */
  id: string;
  /** camelCase key matching existing i18n translations (e.g. "adductorCanal" for "adductor-canal") */
  i18nKey: string;
  /** Fallback English label (used when i18n key is missing) */
  fallbackLabel: string;
  /** If true, shown in Pre-Op Assessment for planning. If false, only in Anesthesia Record. */
  preOp: boolean;
}

export interface RegionalBlockGroup {
  /** camelCase group ID matching i18n keys (e.g. "upperExtremity") */
  id: string;
  fallbackLabel: string;
  blocks: RegionalBlockDef[];
}

export const REGIONAL_BLOCK_GROUPS: RegionalBlockGroup[] = [
  {
    id: "upperExtremity",
    fallbackLabel: "Upper Extremity",
    blocks: [
      { id: "interscalene", i18nKey: "interscalene", fallbackLabel: "Interscalene Block", preOp: true },
      { id: "supraclavicular", i18nKey: "supraclavicular", fallbackLabel: "Supraclavicular Block", preOp: true },
      { id: "infraclavicular", i18nKey: "infraclavicular", fallbackLabel: "Infraclavicular Block", preOp: true },
      { id: "axillary", i18nKey: "axillary", fallbackLabel: "Axillary Block", preOp: true },
      { id: "radial", i18nKey: "radial", fallbackLabel: "Radial Nerve Block", preOp: false },
      { id: "median", i18nKey: "median", fallbackLabel: "Median Nerve Block", preOp: false },
      { id: "ulnar", i18nKey: "ulnar", fallbackLabel: "Ulnar Nerve Block", preOp: false },
    ],
  },
  {
    id: "lowerExtremity",
    fallbackLabel: "Lower Extremity",
    blocks: [
      { id: "femoral", i18nKey: "femoral", fallbackLabel: "Femoral Block", preOp: true },
      { id: "sciatic-proximal", i18nKey: "sciaticProximal", fallbackLabel: "Sciatic Block (Proximal)", preOp: true },
      { id: "sciatic", i18nKey: "sciatic", fallbackLabel: "Sciatic Block (Distal / Popliteal)", preOp: true },
      { id: "obturator", i18nKey: "obturator", fallbackLabel: "Nervus Obturatorius Block", preOp: true },
      { id: "saphenous", i18nKey: "saphenous", fallbackLabel: "Nervus Saphenus Block", preOp: true },
      { id: "adductor-canal", i18nKey: "adductorCanal", fallbackLabel: "Adductor Canal Block", preOp: true },
      { id: "fascia-iliaca", i18nKey: "fasciaIliaca", fallbackLabel: "Fascia Iliaca Block", preOp: true },
      { id: "popliteal", i18nKey: "popliteal", fallbackLabel: "Popliteal Block", preOp: true },
      { id: "ankle-block", i18nKey: "ankleBlock", fallbackLabel: "Ankle Block", preOp: true },
    ],
  },
  {
    id: "truncal",
    fallbackLabel: "Trunk",
    blocks: [
      { id: "tap", i18nKey: "tap", fallbackLabel: "Transversus Abdominis Plane Block", preOp: true },
      { id: "ql", i18nKey: "ql", fallbackLabel: "Quadratus Lumborum Block", preOp: true },
      { id: "erector-spinae", i18nKey: "erectorSpinae", fallbackLabel: "Erector Spinae Plane Block", preOp: true },
      { id: "rectus-sheath", i18nKey: "rectusSheath", fallbackLabel: "Rectus Sheath Block", preOp: true },
      { id: "pecs", i18nKey: "pecs", fallbackLabel: "Pectoral Nerve Block", preOp: true },
      { id: "serratus", i18nKey: "serratus", fallbackLabel: "Serratus Plane Block", preOp: true },
      { id: "intercostal", i18nKey: "intercostal", fallbackLabel: "Intercostal Block", preOp: false },
      { id: "paravertebral", i18nKey: "paravertebral", fallbackLabel: "Paravertebral Block", preOp: false },
    ],
  },
  {
    id: "other",
    fallbackLabel: "Other",
    blocks: [
      { id: "penile", i18nKey: "penile", fallbackLabel: "Penile Block", preOp: true },
      { id: "superficial-cervical", i18nKey: "superficialCervical", fallbackLabel: "Superficial Cervical Plexus Block", preOp: false },
      { id: "deep-cervical", i18nKey: "deepCervical", fallbackLabel: "Deep Cervical Plexus Block", preOp: false },
      { id: "stellate-ganglion", i18nKey: "stellateGanglion", fallbackLabel: "Stellate Ganglion Block", preOp: false },
      { id: "other", i18nKey: "other", fallbackLabel: "Other", preOp: false },
    ],
  },
];

/** Flat list of all blocks (useful for label lookups) */
export const ALL_REGIONAL_BLOCKS = REGIONAL_BLOCK_GROUPS.flatMap((g) => g.blocks);

/** Only blocks shown in Pre-Op Assessment (grouped) */
export const PREOP_BLOCK_GROUPS = REGIONAL_BLOCK_GROUPS.map((g) => ({
  ...g,
  blocks: g.blocks.filter((b) => b.preOp),
})).filter((g) => g.blocks.length > 0);
