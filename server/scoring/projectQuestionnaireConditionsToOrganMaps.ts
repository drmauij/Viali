type ConditionEntry = { checked?: boolean; notes?: string };
type Conditions = Record<string, ConditionEntry>;
type ItemList = Array<{ id: string }>;
type IllnessLists = Record<string, ItemList>;
type OrganMaps = Record<string, Record<string, boolean>>;

/**
 * Project the flat `questionnaire.conditions` map into per-organ maps that
 * match the assessment's organ-system shape (heartIllnesses, lungIllnesses,
 * …). Each item is routed by which category list in `hospital.illnessLists`
 * contains its id. Items not found in any list are skipped (defensive — the
 * questionnaire UI sometimes carries legacy ids).
 */
export function projectQuestionnaireConditionsToOrganMaps(
  conditions: Conditions | null | undefined,
  illnessLists: IllnessLists | null | undefined,
): OrganMaps {
  if (!conditions || !illnessLists) return {};

  const idToCategory = new Map<string, string>();
  for (const [category, items] of Object.entries(illnessLists)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (item && typeof item.id === "string") {
        idToCategory.set(item.id, category);
      }
    }
  }

  const result: OrganMaps = {};
  for (const [itemId, entry] of Object.entries(conditions)) {
    const category = idToCategory.get(itemId);
    if (!category) continue; // unknown id — defensive skip
    if (!result[category]) result[category] = {};
    result[category][itemId] = entry?.checked === true;
  }
  return result;
}
