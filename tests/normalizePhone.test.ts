import { describe, it, expect } from "vitest";
import { normalizePhoneForMatching } from "../server/utils/normalizePhone";

describe("normalizePhoneForMatching", () => {
  describe("Swiss numbers with +41/0041 prefix", () => {
    it("normalizes +41 with spaces", () => {
      expect(normalizePhoneForMatching("+41 79 921 939")).toBe("079921939");
    });

    it("normalizes +41 without spaces", () => {
      expect(normalizePhoneForMatching("+4179921939")).toBe("079921939");
    });

    it("normalizes 0041 with spaces", () => {
      expect(normalizePhoneForMatching("0041 79 921 939")).toBe("079921939");
    });

    it("normalizes 0041 without spaces", () => {
      expect(normalizePhoneForMatching("004179921939")).toBe("079921939");
    });
  });

  describe("Swiss local numbers", () => {
    it("keeps 079 format as-is", () => {
      expect(normalizePhoneForMatching("079 921 939")).toBe("079921939");
    });

    it("keeps 079 without spaces", () => {
      expect(normalizePhoneForMatching("079921939")).toBe("079921939");
    });

    it("handles dashes and parentheses", () => {
      expect(normalizePhoneForMatching("079-921-939")).toBe("079921939");
    });

    it("handles dots", () => {
      expect(normalizePhoneForMatching("079.921.939")).toBe("079921939");
    });
  });

  describe("bare Swiss international prefix (no +)", () => {
    it("normalizes 41... with 11 digits to 0 + local", () => {
      expect(normalizePhoneForMatching("4179921939")).toBe("079921939");
    });

    it("normalizes 41... with spaces", () => {
      expect(normalizePhoneForMatching("41 79 921 939")).toBe("079921939");
    });
  });

  describe("short Swiss mobile (missing leading 0)", () => {
    it("prepends 0 to 8-digit number starting with 7", () => {
      expect(normalizePhoneForMatching("79921939")).toBe("079921939");
    });

    it("prepends 0 to 9-digit number starting with 7", () => {
      expect(normalizePhoneForMatching("799219390")).toBe("0799219390");
    });
  });

  describe("German numbers with +49/0049 prefix", () => {
    it("normalizes +49 with spaces", () => {
      expect(normalizePhoneForMatching("+49 170 1234567")).toBe("+491701234567");
    });

    it("normalizes +49 without spaces", () => {
      expect(normalizePhoneForMatching("+491701234567")).toBe("+491701234567");
    });

    it("normalizes 0049 with spaces", () => {
      expect(normalizePhoneForMatching("0049 170 1234567")).toBe("+491701234567");
    });
  });

  describe("bare German international prefix (no +)", () => {
    it("normalizes 49... with 11+ digits to +49 + local", () => {
      expect(normalizePhoneForMatching("491701234567")).toBe("+491701234567");
    });

    it("normalizes 49... with spaces", () => {
      expect(normalizePhoneForMatching("49 170 1234567")).toBe("+491701234567");
    });
  });

  describe("short/invalid numbers (pass-through)", () => {
    it("returns short number as-is", () => {
      expect(normalizePhoneForMatching("0347474")).toBe("0347474");
    });

    it("returns very short number as-is", () => {
      expect(normalizePhoneForMatching("12345")).toBe("12345");
    });
  });

  describe("matching symmetry", () => {
    it("all Swiss formats for the same number produce the same output", () => {
      const expected = "079921939";
      expect(normalizePhoneForMatching("+41 79 921 939")).toBe(expected);
      expect(normalizePhoneForMatching("0041 79 921 939")).toBe(expected);
      expect(normalizePhoneForMatching("079 921 939")).toBe(expected);
      expect(normalizePhoneForMatching("4179921939")).toBe(expected);
      expect(normalizePhoneForMatching("79921939")).toBe(expected);
    });

    it("all German formats for the same number produce the same output", () => {
      const expected = "+491701234567";
      expect(normalizePhoneForMatching("+49 170 1234567")).toBe(expected);
      expect(normalizePhoneForMatching("0049 170 1234567")).toBe(expected);
      expect(normalizePhoneForMatching("491701234567")).toBe(expected);
    });
  });
});
