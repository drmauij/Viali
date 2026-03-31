# Phone Normalization Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Swiss-only `normalizePhone` function in lead matching with a smarter normalizer that handles bare international prefixes, short Swiss mobile numbers, and German numbers.

**Architecture:** Single function replacement in `server/routes/business.ts`. Extract the function to a shared utility so it can be tested in isolation. Both call sites (lead conversion and referral backfill) already use the same function — no wiring changes needed.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Write tests for the new normalizer

**Files:**
- Create: `tests/normalizePhone.test.ts`

- [ ] **Step 1: Create the test file with all normalization cases**

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/normalizePhone.test.ts`
Expected: FAIL — module `../server/utils/normalizePhone` does not exist yet

- [ ] **Step 3: Commit**

```bash
git add tests/normalizePhone.test.ts
git commit -m "test: add phone normalization test cases"
```

---

### Task 2: Implement the normalizer and make tests pass

**Files:**
- Create: `server/utils/normalizePhone.ts`

- [ ] **Step 1: Create the normalizer function**

```typescript
/**
 * Normalize a phone number for matching purposes.
 * Strips formatting, detects Swiss (+41) and German (+49) prefixes
 * (including bare digits without +), and handles short Swiss mobile numbers.
 *
 * Swiss numbers normalize to local format: 079...
 * German numbers normalize to E.164 format: +49170...
 */
export function normalizePhoneForMatching(phone: string): string {
  // Step 1: Strip formatting characters (spaces, dashes, parentheses, dots)
  let p = phone.replace(/[\s\-\(\)\.]/g, '');

  // Step 2: Handle +41 / 0041 → local Swiss format
  if (p.startsWith('+41')) {
    return '0' + p.slice(3);
  }
  if (p.startsWith('0041')) {
    return '0' + p.slice(4);
  }

  // Step 3: Handle +49 / 0049 → E.164 German format
  if (p.startsWith('+49')) {
    return p; // already in +49 format
  }
  if (p.startsWith('0049')) {
    return '+49' + p.slice(4);
  }

  // Step 4: Handle bare 41... (no +) — Swiss international prefix
  // Swiss numbers: 41 + 9 digits = 11 digits, or 41 + 10 digits = 12 digits
  if (p.startsWith('41') && p.length >= 11 && p.length <= 12) {
    return '0' + p.slice(2);
  }

  // Step 5: Handle bare 49... (no +) — German international prefix
  // German numbers: 49 + 9-11 digits = 11-13 digits
  if (p.startsWith('49') && p.length >= 11 && p.length <= 13) {
    return '+' + p;
  }

  // Step 6: Short Swiss mobile — 8-9 digits starting with 7
  if (p.match(/^7\d{7,8}$/)) {
    return '0' + p;
  }

  // Step 7: Pass-through for everything else
  return p;
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/normalizePhone.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add server/utils/normalizePhone.ts
git commit -m "feat: add normalizePhoneForMatching with Swiss and German support"
```

---

### Task 3: Replace the old normalizer in business routes

**Files:**
- Modify: `server/routes/business.ts:1987-1992` (replace function)
- Modify: `server/routes/business.ts` (add import)

- [ ] **Step 1: Add import at the top of the file**

At the top of `server/routes/business.ts`, add the import alongside other imports:

```typescript
import { normalizePhoneForMatching } from "../utils/normalizePhone";
```

- [ ] **Step 2: Replace the old `normalizePhone` function**

Replace lines 1987-1992:

```typescript
// Normalize phone: strip spaces, dashes, leading +41/0041 → 0
function normalizePhone(phone: string): string {
  let p = phone.replace(/[\s\-\(\)\.]/g, '');
  p = p.replace(/^(\+41|0041)/, '0');
  return p.toLowerCase();
}
```

With:

```typescript
// Phone normalization for matching — see server/utils/normalizePhone.ts
const normalizePhone = normalizePhoneForMatching;
```

This preserves the local `normalizePhone` name used by both call sites (lines 2042, 2082, 2358, 2380) so no other code changes are needed.

- [ ] **Step 3: Run TypeScript check**

Run: `npm run check`
Expected: No errors

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/normalizePhone.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes/business.ts
git commit -m "feat: use normalizePhoneForMatching in lead conversion and referral backfill"
```

---

### Task 4: Verify and clean up

**Files:**
- All modified files

- [ ] **Step 1: Run full TypeScript check**

Run: `npm run check`
Expected: Clean — no errors

- [ ] **Step 2: Run all tests**

Run: `npm run test`
Expected: All pass

- [ ] **Step 3: Commit any fixes**

If anything needed fixing:

```bash
git add -A
git commit -m "fix: address issues from phone normalization integration"
```
