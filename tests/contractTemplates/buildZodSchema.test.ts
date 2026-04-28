import { describe, it, expect } from "vitest";
import { buildZodSchema } from "@shared/contractTemplates/buildZodSchema";
import type { VariablesSchema } from "@shared/contractTemplates/types";

const schema: VariablesSchema = {
  simple: [
    { key: "worker.firstName", type: "text",  label: "First", required: true },
    { key: "worker.iban",      type: "iban",  label: "IBAN",  required: true },
    { key: "contract.startDate", type: "date", label: "Start" },
  ],
  selectableLists: [
    { key: "role", label: "Role",
      fields: [{ key: "id", type: "text" }, { key: "rate", type: "money" }],
      options: [{ id: "a", rate: "50" }, { id: "b", rate: "60" }] },
  ],
};

describe("buildZodSchema", () => {
  it("validates a well-formed payload", () => {
    const z = buildZodSchema(schema);
    const result = z.safeParse({
      worker: { firstName: "Anna", iban: "CH9300762011623852957" },
      contract: { startDate: "2026-05-01" },
      role: { id: "a" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const z = buildZodSchema(schema);
    const result = z.safeParse({ worker: {}, role: { id: "a" } });
    expect(result.success).toBe(false);
  });

  it("rejects unknown selectable-list option ids", () => {
    const z = buildZodSchema(schema);
    const result = z.safeParse({
      worker: { firstName: "Anna", iban: "CH9300762011623852957" },
      role: { id: "nope" },
    });
    expect(result.success).toBe(false);
  });

  it("skips auto-source variables (server-injected)", () => {
    const withAuto: VariablesSchema = {
      ...schema,
      simple: [...schema.simple, { key: "company.name", type: "text", label: "Co", source: "auto:hospital.companyName" }],
    };
    const z = buildZodSchema(withAuto);
    const result = z.safeParse({
      worker: { firstName: "Anna", iban: "CH9300762011623852957" },
      role: { id: "a" },
    });
    expect(result.success).toBe(true);
  });
});
