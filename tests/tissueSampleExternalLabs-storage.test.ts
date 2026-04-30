import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db, pool } from "../server/db";
import { tissueSampleExternalLabs } from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  listTissueSampleLabs,
  createTissueSampleLab,
  updateTissueSampleLab,
  archiveTissueSampleLab,
} from "../server/storage/tissueSampleExternalLabs";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";
const createdIds: string[] = [];

async function cleanup() {
  if (createdIds.length) {
    await db
      .delete(tissueSampleExternalLabs)
      .where(inArray(tissueSampleExternalLabs.id, createdIds))
      .catch(() => {});
    createdIds.length = 0;
  }
}

beforeAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe("createTissueSampleLab + listTissueSampleLabs", () => {
  it("creates a lab and lists it (default ordering: is_default DESC, name ASC)", async () => {
    const a = await createTissueSampleLab({
      hospitalId: TEST_HOSPITAL_ID,
      name: "Beta Lab",
      applicableSampleTypes: null,
      contact: "beta@example.com",
      isDefault: false,
      isArchived: false,
    });
    createdIds.push(a.id);

    const b = await createTissueSampleLab({
      hospitalId: TEST_HOSPITAL_ID,
      name: "Alpha Lab",
      applicableSampleTypes: ["fat"],
      contact: null,
      isDefault: true,
      isArchived: false,
    });
    createdIds.push(b.id);

    const list = await listTissueSampleLabs(TEST_HOSPITAL_ID);
    const ids = list.map((l) => l.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    // Default first.
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
  });

  it("filters by sampleType: universal lab matches every type", async () => {
    const universal = await createTissueSampleLab({
      hospitalId: TEST_HOSPITAL_ID,
      name: "Universal Lab",
      applicableSampleTypes: null,
      contact: null,
      isDefault: false,
      isArchived: false,
    });
    createdIds.push(universal.id);

    const fatOnly = await createTissueSampleLab({
      hospitalId: TEST_HOSPITAL_ID,
      name: "Fat Only Lab",
      applicableSampleTypes: ["fat"],
      contact: null,
      isDefault: false,
      isArchived: false,
    });
    createdIds.push(fatOnly.id);

    const fatList = await listTissueSampleLabs(TEST_HOSPITAL_ID, {
      sampleType: "fat",
    });
    const fatIds = fatList.map((l) => l.id);
    expect(fatIds).toContain(universal.id);
    expect(fatIds).toContain(fatOnly.id);

    const histList = await listTissueSampleLabs(TEST_HOSPITAL_ID, {
      sampleType: "histology",
    });
    const histIds = histList.map((l) => l.id);
    expect(histIds).toContain(universal.id);
    expect(histIds).not.toContain(fatOnly.id);
  });

  it("treats empty array applicableSampleTypes as universal", async () => {
    const empty = await createTissueSampleLab({
      hospitalId: TEST_HOSPITAL_ID,
      name: "Empty-Array Lab",
      applicableSampleTypes: [],
      contact: null,
      isDefault: false,
      isArchived: false,
    });
    createdIds.push(empty.id);

    const fatList = await listTissueSampleLabs(TEST_HOSPITAL_ID, {
      sampleType: "fat",
    });
    expect(fatList.map((l) => l.id)).toContain(empty.id);
  });
});

describe("default singleton invariant", () => {
  it("creating a lab with isDefault=true clears prior defaults that overlap types", async () => {
    const fatDefault = await createTissueSampleLab({
      hospitalId: TEST_HOSPITAL_ID,
      name: "Fat Default A",
      applicableSampleTypes: ["fat"],
      contact: null,
      isDefault: true,
      isArchived: false,
    });
    createdIds.push(fatDefault.id);

    const histDefault = await createTissueSampleLab({
      hospitalId: TEST_HOSPITAL_ID,
      name: "Hist Default",
      applicableSampleTypes: ["histology"],
      contact: null,
      isDefault: true,
      isArchived: false,
    });
    createdIds.push(histDefault.id);

    // New default for fat should clear `fatDefault` but NOT `histDefault`.
    const fatDefaultB = await createTissueSampleLab({
      hospitalId: TEST_HOSPITAL_ID,
      name: "Fat Default B",
      applicableSampleTypes: ["fat", "blood"],
      contact: null,
      isDefault: true,
      isArchived: false,
    });
    createdIds.push(fatDefaultB.id);

    const [a] = await db
      .select()
      .from(tissueSampleExternalLabs)
      .where(eq(tissueSampleExternalLabs.id, fatDefault.id));
    const [b] = await db
      .select()
      .from(tissueSampleExternalLabs)
      .where(eq(tissueSampleExternalLabs.id, histDefault.id));
    const [c] = await db
      .select()
      .from(tissueSampleExternalLabs)
      .where(eq(tissueSampleExternalLabs.id, fatDefaultB.id));

    expect(a.isDefault).toBe(false);
    expect(b.isDefault).toBe(true); // unrelated type — preserved
    expect(c.isDefault).toBe(true);
  });

  it("creating a universal default clears every existing default", async () => {
    const fat = await createTissueSampleLab({
      hospitalId: TEST_HOSPITAL_ID,
      name: "Fat Default",
      applicableSampleTypes: ["fat"],
      contact: null,
      isDefault: true,
      isArchived: false,
    });
    createdIds.push(fat.id);
    const hist = await createTissueSampleLab({
      hospitalId: TEST_HOSPITAL_ID,
      name: "Hist Default",
      applicableSampleTypes: ["histology"],
      contact: null,
      isDefault: true,
      isArchived: false,
    });
    createdIds.push(hist.id);

    const universal = await createTissueSampleLab({
      hospitalId: TEST_HOSPITAL_ID,
      name: "Universal Default",
      applicableSampleTypes: null,
      contact: null,
      isDefault: true,
      isArchived: false,
    });
    createdIds.push(universal.id);

    const rows = await db
      .select()
      .from(tissueSampleExternalLabs)
      .where(
        and(
          eq(tissueSampleExternalLabs.hospitalId, TEST_HOSPITAL_ID),
          eq(tissueSampleExternalLabs.isDefault, true),
        ),
      );
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(universal.id);
  });

  it("update flipping isDefault=true clears overlapping siblings (not self)", async () => {
    const a = await createTissueSampleLab({
      hospitalId: TEST_HOSPITAL_ID,
      name: "Fat Default A",
      applicableSampleTypes: ["fat"],
      contact: null,
      isDefault: true,
      isArchived: false,
    });
    createdIds.push(a.id);

    const b = await createTissueSampleLab({
      hospitalId: TEST_HOSPITAL_ID,
      name: "Fat Default B",
      applicableSampleTypes: ["fat"],
      contact: null,
      isDefault: false,
      isArchived: false,
    });
    createdIds.push(b.id);

    await updateTissueSampleLab(b.id, { isDefault: true });

    const [aAfter] = await db
      .select()
      .from(tissueSampleExternalLabs)
      .where(eq(tissueSampleExternalLabs.id, a.id));
    const [bAfter] = await db
      .select()
      .from(tissueSampleExternalLabs)
      .where(eq(tissueSampleExternalLabs.id, b.id));

    expect(aAfter.isDefault).toBe(false);
    expect(bAfter.isDefault).toBe(true);
  });
});

describe("archiveTissueSampleLab", () => {
  it("sets isArchived=true and isDefault=false", async () => {
    const lab = await createTissueSampleLab({
      hospitalId: TEST_HOSPITAL_ID,
      name: "ToArchive",
      applicableSampleTypes: null,
      contact: null,
      isDefault: true,
      isArchived: false,
    });
    createdIds.push(lab.id);

    const archived = await archiveTissueSampleLab(lab.id);
    expect(archived.isArchived).toBe(true);
    expect(archived.isDefault).toBe(false);
  });

  it("listTissueSampleLabs excludes archived by default", async () => {
    const lab = await createTissueSampleLab({
      hospitalId: TEST_HOSPITAL_ID,
      name: "Hidden",
      applicableSampleTypes: null,
      contact: null,
      isDefault: false,
      isArchived: false,
    });
    createdIds.push(lab.id);
    await archiveTissueSampleLab(lab.id);

    const list = await listTissueSampleLabs(TEST_HOSPITAL_ID);
    expect(list.map((l) => l.id)).not.toContain(lab.id);

    const inclusive = await listTissueSampleLabs(TEST_HOSPITAL_ID, {
      includeArchived: true,
    });
    expect(inclusive.map((l) => l.id)).toContain(lab.id);
  });
});
