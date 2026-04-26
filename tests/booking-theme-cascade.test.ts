import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import { hospitalGroups, hospitals } from "@shared/schema";
import { inArray, eq } from "drizzle-orm";
import { randomUUID } from "crypto";

/**
 * Booking theme cascade — Task 2.
 *
 * Rule: a hospital that belongs to a chain (`groupId IS NOT NULL`) ALWAYS
 * surfaces the chain's `bookingTheme`, even if the hospital has its own
 * theme stored. A standalone hospital surfaces its own theme.
 *
 * Both public booking endpoints (`/api/public/booking/:bookingToken` and
 * `/api/public/group-booking/:token`) must include the resolved theme on
 * their response payload.
 */

vi.mock("../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

import clinicRouter from "../server/routes/clinic";

const uniq = () => randomUUID().slice(0, 8);

const GROUP_THEME = {
  bgColor: "#fafafa",
  primaryColor: "#c89b6b",
  secondaryColor: "#4a3727",
  headingFont: "Playfair Display",
  bodyFont: "Inter",
};

const HOSPITAL_THEME = {
  bgColor: "#000000",
  primaryColor: "#111111",
  secondaryColor: "#222222",
  headingFont: "Roboto",
  bodyFont: "Roboto",
};

let groupId: string;
let groupBookingToken: string;
let memberHospitalId: string;
let memberHospitalToken: string;
let standaloneHospitalId: string;
let standaloneHospitalToken: string;

const createdHospitalIds: string[] = [];
const createdGroupIds: string[] = [];

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(clinicRouter);
  return app;
}

beforeAll(async () => {
  groupBookingToken = `theme-grp-${uniq()}`;
  const [g] = await db
    .insert(hospitalGroups)
    .values({
      name: `theme-test-${uniq()}`,
      bookingToken: groupBookingToken,
      bookingTheme: GROUP_THEME,
    } as any)
    .returning();
  groupId = g.id;
  createdGroupIds.push(groupId);

  memberHospitalToken = `theme-member-${uniq()}`;
  const [member] = await db
    .insert(hospitals)
    .values({
      name: `Member-${uniq()}`,
      bookingToken: memberHospitalToken,
      groupId: g.id,
      bookingTheme: HOSPITAL_THEME, // should be ignored: group wins
    } as any)
    .returning();
  memberHospitalId = member.id;
  createdHospitalIds.push(memberHospitalId);

  standaloneHospitalToken = `theme-standalone-${uniq()}`;
  const [standalone] = await db
    .insert(hospitals)
    .values({
      name: `Standalone-${uniq()}`,
      bookingToken: standaloneHospitalToken,
      bookingTheme: HOSPITAL_THEME,
    } as any)
    .returning();
  standaloneHospitalId = standalone.id;
  createdHospitalIds.push(standaloneHospitalId);
});

afterAll(async () => {
  if (createdHospitalIds.length) {
    await db
      .delete(hospitals)
      .where(inArray(hospitals.id, createdHospitalIds))
      .catch(() => {});
  }
  if (createdGroupIds.length) {
    await db
      .delete(hospitalGroups)
      .where(inArray(hospitalGroups.id, createdGroupIds))
      .catch(() => {});
  }
  await pool.end();
});

describe("booking theme cascade — GET /api/public/booking/:bookingToken", () => {
  it("chain member returns the GROUP's theme, not its own", async () => {
    const app = buildApp();
    const res = await request(app).get(
      `/api/public/booking/${memberHospitalToken}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.bookingTheme).toEqual(GROUP_THEME);
  });

  it("standalone hospital returns its OWN theme", async () => {
    const app = buildApp();
    const res = await request(app).get(
      `/api/public/booking/${standaloneHospitalToken}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.bookingTheme).toEqual(HOSPITAL_THEME);
  });
});

describe("booking theme cascade — GET /api/public/group-booking/:token", () => {
  it("group endpoint surfaces the group's theme", async () => {
    const app = buildApp();
    const res = await request(app).get(
      `/api/public/group-booking/${groupBookingToken}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.bookingTheme).toEqual(GROUP_THEME);
  });
});
