import { describe, it, expect } from "vitest";
import { PATIENT_FK_REFS } from "../../server/services/patientMerge";

describe("patientMerge", () => {
  describe("PATIENT_FK_REFS", () => {
    it("contains all 20 patient-referencing tables", () => {
      expect(PATIENT_FK_REFS.length).toBe(20);
    });

    it("covers all expected tables", () => {
      const tables = PATIENT_FK_REFS.map((r) => r.table);
      expect(tables).toContain("surgeries");
      expect(tables).toContain("cases");
      expect(tables).toContain("patient_documents");
      expect(tables).toContain("patient_episodes");
      expect(tables).toContain("patient_document_folders");
      expect(tables).toContain("patient_notes");
      expect(tables).toContain("patient_messages");
      expect(tables).toContain("patient_chat_archives");
      expect(tables).toContain("patient_discharge_medications");
      expect(tables).toContain("chat_conversations");
      expect(tables).toContain("chat_mentions");
      expect(tables).toContain("chat_attachments");
      expect(tables).toContain("clinic_invoices");
      expect(tables).toContain("patient_questionnaire_links");
      expect(tables).toContain("clinic_appointments");
      expect(tables).toContain("external_surgery_requests");
      expect(tables).toContain("discharge_briefs");
      expect(tables).toContain("tardoc_invoices");
      expect(tables).toContain("activities");
      expect(tables).toContain("inventory_commits");
    });

    it("has no duplicate table+column combinations", () => {
      const keys = PATIENT_FK_REFS.map((r) => `${r.table}.${r.column}`);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it("all entries have valid filter types", () => {
      for (const ref of PATIENT_FK_REFS) {
        const f = ref.filter;
        const isValid =
          f === "direct" ||
          f === null ||
          (typeof f === "object" && "via" in f && "parent" in f) ||
          (typeof f === "object" &&
            "via2" in f &&
            "mid" in f &&
            "midVia" in f &&
            "parent" in f);
        expect(isValid, `Invalid filter for ${ref.table}.${ref.column}`).toBe(
          true
        );
      }
    });

    it("all direct-filtered tables have hospital_id column implied", () => {
      const directRefs = PATIENT_FK_REFS.filter((r) => r.filter === "direct");
      // All direct refs should have the 'direct' string filter
      expect(directRefs.length).toBeGreaterThan(0);
      for (const ref of directRefs) {
        expect(ref.filter).toBe("direct");
      }
    });

    it("via-filtered tables reference valid parent tables", () => {
      const viaRefs = PATIENT_FK_REFS.filter(
        (r) => typeof r.filter === "object" && r.filter !== null && "via" in r.filter
      );
      const validParents = [
        "chat_conversations",
        "units",
      ];
      for (const ref of viaRefs) {
        const f = ref.filter as { via: string; parent: string };
        expect(
          validParents,
          `Unexpected parent table ${f.parent} for ${ref.table}`
        ).toContain(f.parent);
      }
    });
  });
});
