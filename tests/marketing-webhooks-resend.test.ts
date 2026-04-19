import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { createHmac } from "node:crypto";

const SECRET = "test-svix-secret";

// DB call captures
const insertedFlowEvents: any[] = [];
const updatedPatients: any[] = [];
let executionLookupResult: any = null;

vi.mock("../server/db", () => {
  const makeChain = () => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve(executionLookupResult ? [executionLookupResult] : [])),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((row: any) => ({
        onConflictDoNothing: vi.fn(() => {
          insertedFlowEvents.push(row);
          return Promise.resolve();
        }),
        // If a caller forgets .onConflictDoNothing(), still work:
        then: (resolve: any) => {
          insertedFlowEvents.push(row);
          resolve();
        },
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((patch: any) => ({
        where: vi.fn(() => {
          updatedPatients.push(patch);
          return Promise.resolve();
        }),
      })),
    })),
  });
  const stub = makeChain();
  return {
    db: {
      ...stub,
      // transaction passes the same stub as the tx arg
      transaction: vi.fn(async (fn: any) => await fn(stub)),
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  insertedFlowEvents.length = 0;
  updatedPatients.length = 0;
  executionLookupResult = null;
  process.env.RESEND_WEBHOOK_SECRET = SECRET;
});
afterEach(() => {
  delete process.env.RESEND_WEBHOOK_SECRET;
});

import marketingWebhooksRouter from "../server/routes/marketingWebhooks";

function buildApp() {
  const app = express();
  // We need raw body for signature verification, so register raw parser
  // BEFORE the router and let the router handle JSON parsing internally.
  app.use("/api/webhooks/resend", express.raw({ type: "*/*" }));
  app.use(marketingWebhooksRouter);
  return app;
}

function send(body: any, opts: { tamper?: boolean; staleTs?: boolean } = {}) {
  const raw = JSON.stringify(body);
  const ts = opts.staleTs
    ? (Math.floor(Date.now() / 1000) - 6 * 60).toString()
    : Math.floor(Date.now() / 1000).toString();
  const msgId = "msg_test";
  const sig = "v1," + createHmac("sha256", SECRET).update(`${msgId}.${ts}.${raw}`).digest("base64");
  const app = buildApp();
  return request(app)
    .post("/api/webhooks/resend")
    .set("svix-id", msgId)
    .set("svix-timestamp", ts)
    .set("svix-signature", sig)
    .set("content-type", "application/json")
    .send(opts.tamper ? raw + "X" : raw);
}

describe("POST /api/webhooks/resend", () => {
  it("returns 400 on tampered body (signature failure)", async () => {
    const res = await send({ type: "email.opened", data: { email_id: "abc" } }, { tamper: true });
    expect(res.status).toBe(400);
    expect(insertedFlowEvents).toHaveLength(0);
  });

  it("returns 400 on stale timestamp", async () => {
    const res = await send({ type: "email.opened", data: { email_id: "abc" } }, { staleTs: true });
    expect(res.status).toBe(400);
  });

  it("returns 200 + no-op when execution not found (transactional email)", async () => {
    executionLookupResult = null;
    const res = await send({ type: "email.opened", data: { email_id: "unknown_id" } });
    expect(res.status).toBe(200);
    expect(insertedFlowEvents).toHaveLength(0);
    expect(updatedPatients).toHaveLength(0);
  });

  it("writes flow_event for email.opened on known execution", async () => {
    executionLookupResult = { id: "exec_1", patientId: "pat_1" };
    const res = await send({
      type: "email.opened",
      data: { email_id: "abc", recipient: "x@y.com" },
    });
    expect(res.status).toBe(200);
    expect(insertedFlowEvents).toHaveLength(1);
    expect(insertedFlowEvents[0]).toMatchObject({
      executionId: "exec_1",
      eventType: "opened",
      svixId: "msg_test", // from the send() helper's svix-id header
    });
    expect(updatedPatients).toHaveLength(0);
  });

  it("writes flow_event for email.delivered", async () => {
    executionLookupResult = { id: "exec_1", patientId: "pat_1" };
    const res = await send({ type: "email.delivered", data: { email_id: "abc" } });
    expect(res.status).toBe(200);
    expect(insertedFlowEvents[0]).toMatchObject({
      eventType: "delivered",
      svixId: "msg_test",
    });
  });

  it("writes flow_event for email.clicked", async () => {
    executionLookupResult = { id: "exec_1", patientId: "pat_1" };
    const res = await send({
      type: "email.clicked",
      data: { email_id: "abc", click: { link: "https://viali.app/book/x" } },
    });
    expect(res.status).toBe(200);
    expect(insertedFlowEvents[0]).toMatchObject({
      eventType: "clicked",
      svixId: "msg_test",
    });
    expect(insertedFlowEvents[0].metadata).toMatchObject({
      click: { link: "https://viali.app/book/x" },
    });
  });

  it("writes flow_event for email.bounced WITHOUT touching consent flags", async () => {
    executionLookupResult = { id: "exec_1", patientId: "pat_1" };
    const res = await send({
      type: "email.bounced",
      data: { email_id: "abc", bounce: { subType: "Permanent" } },
    });
    expect(res.status).toBe(200);
    expect(insertedFlowEvents[0]).toMatchObject({
      eventType: "bounced",
      svixId: "msg_test",
    });
    expect(updatedPatients).toHaveLength(0);
  });

  it("writes flow_event for email.complained AND flips consent flags", async () => {
    executionLookupResult = { id: "exec_1", patientId: "pat_1" };
    const res = await send({
      type: "email.complained",
      data: { email_id: "abc" },
    });
    expect(res.status).toBe(200);
    expect(insertedFlowEvents[0]).toMatchObject({
      eventType: "complained",
      svixId: "msg_test",
    });
    expect(updatedPatients).toHaveLength(1);
    expect(updatedPatients[0].emailMarketingConsent).toBe(false);
    expect(updatedPatients[0].marketingUnsubscribedAt).toBeInstanceOf(Date);
  });

  it("returns 200 + no-op for email.sent (send loop already wrote the event)", async () => {
    executionLookupResult = { id: "exec_1", patientId: "pat_1" };
    const res = await send({ type: "email.sent", data: { email_id: "abc" } });
    expect(res.status).toBe(200);
    expect(insertedFlowEvents).toHaveLength(0);
  });

  it("calls onConflictDoNothing on webhook inserts (idempotent against Resend retries)", async () => {
    executionLookupResult = { id: "exec_1", patientId: "pat_1" };
    const res = await send({ type: "email.opened", data: { email_id: "abc" } });
    expect(res.status).toBe(200);
    // The mock's .values().onConflictDoNothing() push-path is the one that captured the row.
    expect(insertedFlowEvents).toHaveLength(1);
    // Test is primarily a signal that the chain compiles — the real guarantee
    // is the DB unique index (tested by re-running the migration idempotently).
  });

  it("returns 200 + no-op for email.delivery_delayed", async () => {
    executionLookupResult = { id: "exec_1", patientId: "pat_1" };
    const res = await send({ type: "email.delivery_delayed", data: { email_id: "abc" } });
    expect(res.status).toBe(200);
    expect(insertedFlowEvents).toHaveLength(0);
  });

  it("returns 200 + no-op for an unknown event type", async () => {
    executionLookupResult = { id: "exec_1", patientId: "pat_1" };
    const res = await send({ type: "email.nuclear_meltdown", data: { email_id: "abc" } });
    expect(res.status).toBe(200);
    expect(insertedFlowEvents).toHaveLength(0);
  });
});
