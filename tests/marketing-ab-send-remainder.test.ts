import { describe, it, expect, vi, beforeEach } from "vitest";

const capturedExecUpdates: any[] = [];
const capturedEventInserts: any[] = [];
let pendingExecutions: any[] = [];

vi.mock("../server/db", () => {
  const updateSetMock = vi.fn((patch: any) => ({
    where: vi.fn(() => {
      capturedExecUpdates.push(patch);
      return Promise.resolve();
    }),
  }));
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            where: vi.fn(() => Promise.resolve(pendingExecutions)),
          })),
          where: vi.fn(() => Promise.resolve(pendingExecutions)),
        })),
      })),
      update: vi.fn(() => ({ set: updateSetMock })),
      insert: vi.fn(() => ({
        values: vi.fn((row: any) => {
          capturedEventInserts.push(row);
          return Promise.resolve();
        }),
      })),
    },
  };
});

vi.mock("../server/sms", () => ({ sendSms: vi.fn() }));
vi.mock("../server/email", () => ({
  getUncachableResendClient: vi.fn(() => Promise.resolve({
    client: { emails: { send: vi.fn(() => Promise.resolve({ data: { id: "resend_xyz" } })) } },
    fromEmail: "no-reply@test",
  })),
}));
vi.mock("../server/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

beforeEach(() => {
  capturedExecUpdates.length = 0;
  capturedEventInserts.length = 0;
  pendingExecutions = [];
  process.env.MARKETING_UNSUBSCRIBE_SECRET = "test-secret";
});

import { sendRemainderForWinner } from "../server/services/marketingAbSendRemainder";

describe("sendRemainderForWinner", () => {
  it("returns zero count when no pending executions exist", async () => {
    pendingExecutions = [];
    const flow = { id: "f1", hospitalId: "h1", channel: "email", messageTemplate: "unused", name: "demo" } as any;
    const variant = { id: "var_A", label: "A", messageTemplate: "A body", messageSubject: "A subj" } as any;
    const res = await sendRemainderForWinner(flow, variant, { protocol: "https", get: () => "viali.app" } as any);
    expect(res.sentCount).toBe(0);
    expect(res.failedCount).toBe(0);
  });

  it("stamps variant_id on each pending execution when winner is picked", async () => {
    pendingExecutions = [
      { id: "exec_1", patientId: "pat_1", email: "a@b.com", phone: "+41000", firstName: "A", surname: "X" },
      { id: "exec_2", patientId: "pat_2", email: "c@d.com", phone: "+41001", firstName: "C", surname: "Y" },
    ];
    const flow = { id: "f1", hospitalId: "h1", channel: "email", messageTemplate: "unused", name: "demo" } as any;
    const variant = { id: "var_A", label: "A", messageTemplate: "Hi {{vorname}}", messageSubject: "Subj" } as any;

    await sendRemainderForWinner(flow, variant, { protocol: "https", get: () => "viali.app" } as any);

    const variantStamps = capturedExecUpdates.filter((p) => p.variantId === "var_A");
    expect(variantStamps.length).toBe(2);
  });
});
