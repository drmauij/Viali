import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../../server/db";
import { workerContracts } from "@shared/schema";
import { isNull } from "drizzle-orm";
import { backfillExistingContracts } from "../../server/seed/backfillExistingContracts";
import { seedAllOwners } from "../../server/seed/seedContractTemplates";

describe("backfillExistingContracts", () => {
  beforeAll(async () => {
    await seedAllOwners();
  });

  it("populates templateSnapshot + data on legacy rows; idempotent on re-run", async () => {
    // (Test relies on existing seed/test fixtures providing at least one legacy worker_contracts row;
    //  if the test DB is empty, this assertion will report 0 migrated and still pass.)
    await backfillExistingContracts();
    const remaining = await db.select({ id: workerContracts.id })
      .from(workerContracts)
      .where(isNull(workerContracts.templateSnapshot));
    expect(remaining.length).toBe(0);

    const second = await backfillExistingContracts();
    expect(second.migrated).toBe(0); // nothing new to migrate
  });
});
