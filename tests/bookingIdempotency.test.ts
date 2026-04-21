import { describe, it, expect } from "vitest";
import { hashBookingRequest } from "../server/storage/bookingIdempotency";

describe("hashBookingRequest", () => {
  it("is stable for key order differences", () => {
    const a = { email: "x@y.com", firstName: "A", surname: "B" };
    const b = { surname: "B", firstName: "A", email: "x@y.com" };
    expect(hashBookingRequest(a)).toBe(hashBookingRequest(b));
  });

  it("differs when a field changes", () => {
    expect(hashBookingRequest({ x: 1 })).not.toBe(
      hashBookingRequest({ x: 2 }),
    );
  });

  it("handles nested objects + arrays", () => {
    const a = { a: [1, { y: 2, x: 1 }] };
    const b = { a: [1, { x: 1, y: 2 }] };
    expect(hashBookingRequest(a)).toBe(hashBookingRequest(b));
  });
});
