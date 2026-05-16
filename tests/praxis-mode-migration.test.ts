import { describe, it, expect, afterAll } from "vitest";
import { db, pool } from "../server/db";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

const MIGRATION = path.resolve(__dirname, "../migrations/0260_praxis_mode.sql");

afterAll(async () => { await pool.end(); });

describe("0260_praxis_mode migration", () => {
  it("applies cleanly and is idempotent on re-run", async () => {
    const ddl = fs.readFileSync(MIGRATION, "utf8");
    await db.execute(sql.raw(ddl));
    await db.execute(sql.raw(ddl));

    const hospitals = await db.execute(sql.raw(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='hospitals' AND column_name='tenant_type'`));
    expect(hospitals.rows.length).toBe(1);

    const rooms = await db.execute(sql.raw(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='surgery_rooms' AND column_name='linked_hospital_id'`));
    expect(rooms.rows.length).toBe(1);

    const surgeries = await db.execute(sql.raw(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='surgeries'
        AND column_name IN ('external_request_id','referral_status','referral_note',
                            'last_clinic_reschedule_at','reschedule_acknowledged_at','reschedule_history')`));
    expect(surgeries.rows.length).toBe(6);

    const reqs = await db.execute(sql.raw(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='external_surgery_requests'
        AND column_name IN ('source_hospital_id','source_surgery_id','patient_snapshot')`));
    expect(reqs.rows.length).toBe(3);

    const qresp = await db.execute(sql.raw(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='patient_questionnaire_responses'
        AND column_name IN ('imported_from_praxis','imported_from_praxis_at','imported_field_sources')`));
    expect(qresp.rows.length).toBe(3);

    const table = await db.execute(sql.raw(`
      SELECT table_name FROM information_schema.tables WHERE table_name='referral_partnerships'`));
    expect(table.rows.length).toBe(1);

    // Verify referral_partnerships constraints (unique + both FKs) exist after first AND second run
    const rpConstraints = await db.execute(sql.raw(`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'referral_partnerships'::regclass
        AND conname IN (
          'referral_partnerships_unique_pair',
          'referral_partnerships_source_hospital_id_hospitals_id_fk',
          'referral_partnerships_destination_hospital_id_hospitals_id_fk'
        )`));
    expect(rpConstraints.rows.length).toBe(3);

    // Verify FKs on surgery_rooms and external_surgery_requests exist after both runs
    const otherConstraints = await db.execute(sql.raw(`
      SELECT conname FROM pg_constraint
      WHERE conname IN (
        'surgery_rooms_linked_hospital_id_hospitals_id_fk',
        'external_surgery_requests_source_hospital_id_hospitals_id_fk'
      )`));
    expect(otherConstraints.rows.length).toBe(2);
  });
});
