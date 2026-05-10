import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { db, pool } from "../server/db";
import {
  users,
  externalSurgeryRequests,
  hospitals,
  portalAccessSessions,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

import surgeonPortalRouter from "../server/routes/surgeonPortal";

const createdUserIds: string[] = [];
const createdRequestIds: string[] = [];
const createdSessionTokens: string[] = [];
let createdHospitalId: string;
let portalToken: string;
let praxisUser: { id: string; email: string };
let childUser: { id: string; email: string };
let soloUser: { id: string; email: string };

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(surgeonPortalRouter);

async function makeSession(email: string): Promise<string> {
  const sessionToken = `test-${randomUUID()}`;
  await db.insert(portalAccessSessions).values({
    sessionToken,
    portalType: "surgeon",
    portalToken,
    surgeonEmail: email,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  } as any);
  createdSessionTokens.push(sessionToken);
  return sessionToken;
}

beforeAll(async () => {
  // Create a fresh test hospital with a unique externalSurgeryToken
  portalToken = `tok-praxis-${randomUUID().slice(0, 12)}`;
  const [h] = await db.insert(hospitals).values({
    name: `TestHospital-${randomUUID().slice(0, 6)}`,
    externalSurgeryToken: portalToken,
  } as any).returning();
  createdHospitalId = h.id;

  const ts = Date.now();
  const [p] = await db.insert(users).values({
    email: `praxis-${ts}@test.local`,
    firstName: "P",
    lastName: "X",
    isPraxis: true,
  }).returning();
  praxisUser = { id: p.id, email: p.email! };
  createdUserIds.push(p.id);

  const [c] = await db.insert(users).values({
    email: `child-${ts}@test.local`,
    firstName: "C",
    lastName: "X",
    parentSurgeonId: p.id,
  }).returning();
  childUser = { id: c.id, email: c.email! };
  createdUserIds.push(c.id);

  const [s] = await db.insert(users).values({
    email: `solo-${ts}@test.local`,
    firstName: "S",
    lastName: "X",
  }).returning();
  soloUser = { id: s.id, email: s.email! };
  createdUserIds.push(s.id);
});

afterAll(async () => {
  if (createdRequestIds.length > 0) {
    await db.delete(externalSurgeryRequests).where(inArray(externalSurgeryRequests.id, createdRequestIds));
  }
  if (createdSessionTokens.length > 0) {
    await db.delete(portalAccessSessions).where(inArray(portalAccessSessions.sessionToken, createdSessionTokens));
  }
  if (createdUserIds.length > 0) {
    await db.update(users).set({ parentSurgeonId: null }).where(inArray(users.id, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  if (createdHospitalId) {
    await db.delete(hospitals).where(eq(hospitals.id, createdHospitalId));
  }
  await pool.end();
});

const baseBody = {
  surgeryName: "Test surgery",
  surgeryDurationMinutes: 60,
  withAnesthesia: true,
  wishedDate: "2026-06-01",
  isReservationOnly: false,
  patientFirstName: "Pat",
  patientLastName: "Test",
  patientBirthday: "1990-01-01",
  patientEmail: "pat@test.local",
  patientPhone: "+41000000000",
};

describe("POST /api/surgeon-portal/:token/requests", () => {
  it("solo doctor submits with their own surgeonId", async () => {
    const session = await makeSession(soloUser.email);
    const res = await request(app)
      .post(`/api/surgeon-portal/${portalToken}/requests`)
      .set("Cookie", `portal_session=${session}`)
      .send({ ...baseBody, surgeonId: soloUser.id });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    createdRequestIds.push(res.body.id);

    const [row] = await db.select().from(externalSurgeryRequests)
      .where(eq(externalSurgeryRequests.id, res.body.id));
    expect(row.surgeonId).toBe(soloUser.id);
    expect(row.surgeonEmail).toBe(soloUser.email);
  });

  it("solo doctor cannot submit for a different surgeonId", async () => {
    const session = await makeSession(soloUser.email);
    const res = await request(app)
      .post(`/api/surgeon-portal/${portalToken}/requests`)
      .set("Cookie", `portal_session=${session}`)
      .send({ ...baseBody, surgeonId: childUser.id });
    expect(res.status).toBe(403);
  });

  it("praxis can submit on behalf of a child", async () => {
    const session = await makeSession(praxisUser.email);
    const res = await request(app)
      .post(`/api/surgeon-portal/${portalToken}/requests`)
      .set("Cookie", `portal_session=${session}`)
      .send({ ...baseBody, surgeonId: childUser.id });
    expect(res.status).toBe(201);
    createdRequestIds.push(res.body.id);

    const [row] = await db.select().from(externalSurgeryRequests)
      .where(eq(externalSurgeryRequests.id, res.body.id));
    expect(row.surgeonId).toBe(childUser.id);
    expect(row.surgeonEmail).toBe(childUser.email);
  });

  it("praxis can submit for themselves", async () => {
    const session = await makeSession(praxisUser.email);
    const res = await request(app)
      .post(`/api/surgeon-portal/${portalToken}/requests`)
      .set("Cookie", `portal_session=${session}`)
      .send({ ...baseBody, surgeonId: praxisUser.id });
    expect(res.status).toBe(201);
    createdRequestIds.push(res.body.id);
  });

  it("praxis cannot submit for an unrelated user", async () => {
    const session = await makeSession(praxisUser.email);
    const res = await request(app)
      .post(`/api/surgeon-portal/${portalToken}/requests`)
      .set("Cookie", `portal_session=${session}`)
      .send({ ...baseBody, surgeonId: soloUser.id });
    expect(res.status).toBe(403);
  });

  it("rejects when session is missing", async () => {
    const res = await request(app)
      .post(`/api/surgeon-portal/${portalToken}/requests`)
      .send({ ...baseBody, surgeonId: soloUser.id });
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/surgeon-portal/:token/me", () => {
  it("solo doctor updates own first/last/phone", async () => {
    const session = await makeSession(soloUser.email);
    const res = await request(app)
      .patch(`/api/surgeon-portal/${portalToken}/me`)
      .set("Cookie", `portal_session=${session}`)
      .send({ firstName: "NewFirst", lastName: "NewLast", phone: "+41 79 999 99 99" });
    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe("NewFirst");
    expect(res.body.lastName).toBe("NewLast");
    expect(res.body.phone).toBe("+41 79 999 99 99");
    expect(res.body.email).toBe(soloUser.email);

    const [row] = await db.select().from(users).where(eq(users.id, soloUser.id));
    expect(row.firstName).toBe("NewFirst");
    expect(row.lastName).toBe("NewLast");
    expect(row.phone).toBe("+41 79 999 99 99");
  });

  it("rejects empty firstName with 400", async () => {
    const session = await makeSession(soloUser.email);
    const res = await request(app)
      .patch(`/api/surgeon-portal/${portalToken}/me`)
      .set("Cookie", `portal_session=${session}`)
      .send({ firstName: "", lastName: "Still", phone: null });
    expect(res.status).toBe(400);
  });

  it("rejects unknown keys (email change attempt)", async () => {
    const beforeRow = await db.select().from(users).where(eq(users.id, soloUser.id));
    const beforeEmail = beforeRow[0].email;
    const session = await makeSession(soloUser.email);
    const res = await request(app)
      .patch(`/api/surgeon-portal/${portalToken}/me`)
      .set("Cookie", `portal_session=${session}`)
      .send({
        firstName: "Still",
        lastName: "Same",
        phone: null,
        email: "evil@example.com",
      });
    expect(res.status).toBe(400);
    const [row] = await db.select().from(users).where(eq(users.id, soloUser.id));
    expect(row.email).toBe(beforeEmail);
  });

  it("normalizes empty phone string to null", async () => {
    const session = await makeSession(soloUser.email);
    const res = await request(app)
      .patch(`/api/surgeon-portal/${portalToken}/me`)
      .set("Cookie", `portal_session=${session}`)
      .send({ firstName: "First", lastName: "Last", phone: "" });
    expect(res.status).toBe(200);
    expect(res.body.phone).toBeNull();
  });
});
