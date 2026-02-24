import { db } from "../storage";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { users, userHospitalRoles } from "@shared/schema";
import logger from "../logger";

// ============================================================
// Types
// ============================================================

export interface DuplicatePair {
  user1: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    canLogin: boolean;
    roles: Array<{ unitId: string; role: string }>;
  };
  user2: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    canLogin: boolean;
    roles: Array<{ unitId: string; role: string }>;
  };
  confidence: number;
  reasons: string[];
}

// ============================================================
// Name normalization & similarity
// ============================================================

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\sàáâãäåæçèéêëìíîïðñòóôõöùúûüýþÿ]/g, " ") // Keep letters (including German umlauts) + spaces
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function calculateNameSimilarity(name1: string, name2: string): number {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);

  if (n1 === n2) return 1.0;
  if (!n1 || !n2) return 0;

  // Jaccard word similarity
  const words1 = new Set(n1.split(" ").filter((w) => w.length > 1));
  const words2 = new Set(n2.split(" ").filter((w) => w.length > 1));

  const intersection = new Set(
    Array.from(words1).filter((x) => words2.has(x))
  );
  const union = new Set([...Array.from(words1), ...Array.from(words2)]);
  const jaccard = union.size > 0 ? intersection.size / union.size : 0;

  // Levenshtein character similarity
  const levDist = levenshtein(n1, n2);
  const maxLen = Math.max(n1.length, n2.length);
  const levSim = maxLen > 0 ? 1 - levDist / maxLen : 0;

  return Math.min(1.0, jaccard * 0.6 + levSim * 0.4);
}

function isDummyEmail(email: string | null | undefined): boolean {
  if (!email) return true;
  return email.endsWith("@staff.local") || email.endsWith("@internal.local");
}

// ============================================================
// Duplicate Detection
// ============================================================

export async function findDuplicates(
  hospitalId: string
): Promise<DuplicatePair[]> {
  // 1. Fetch all non-archived users for this hospital via roles
  const roles = await db
    .select({
      userId: userHospitalRoles.userId,
      unitId: userHospitalRoles.unitId,
      role: userHospitalRoles.role,
    })
    .from(userHospitalRoles)
    .where(eq(userHospitalRoles.hospitalId, hospitalId));

  const userIds = [...new Set(roles.map((r) => r.userId))];
  if (userIds.length === 0) return [];

  // Fetch user details for users with roles in this hospital
  const hospitalUsers = await db
    .select()
    .from(users)
    .where(and(isNull(users.archivedAt), inArray(users.id, userIds)));

  if (hospitalUsers.length < 2) return [];

  // Build role map
  const roleMap = new Map<string, Array<{ unitId: string; role: string }>>();
  for (const r of roles) {
    if (!roleMap.has(r.userId)) roleMap.set(r.userId, []);
    roleMap.get(r.userId)!.push({ unitId: r.unitId, role: r.role });
  }

  // 2 & 3. Compare all pairs
  const pairs: DuplicatePair[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < hospitalUsers.length; i++) {
    for (let j = i + 1; j < hospitalUsers.length; j++) {
      const u1 = hospitalUsers[i];
      const u2 = hospitalUsers[j];

      const pairKey = [u1.id, u2.id].sort().join(":");
      if (seen.has(pairKey)) continue;

      const fullName1 = `${u1.firstName ?? ""} ${u1.lastName ?? ""}`.trim();
      const fullName2 = `${u2.firstName ?? ""} ${u2.lastName ?? ""}`.trim();

      if (!fullName1 || !fullName2) continue;

      const reasons: string[] = [];
      let confidence = 0;

      // Normalize for comparison
      const norm1 = normalizeName(fullName1);
      const norm2 = normalizeName(fullName2);

      // Tier 1: Exact normalized name match
      if (norm1 === norm2) {
        confidence = 1.0;
        reasons.push("Exact name match");
      } else {
        // Tier 2: First/Last name swapped
        const normFirst1 = normalizeName(u1.firstName ?? "");
        const normLast1 = normalizeName(u1.lastName ?? "");
        const normFirst2 = normalizeName(u2.firstName ?? "");
        const normLast2 = normalizeName(u2.lastName ?? "");

        if (
          normFirst1 &&
          normLast1 &&
          normFirst2 &&
          normLast2 &&
          normFirst1 === normLast2 &&
          normLast1 === normFirst2
        ) {
          confidence = 0.9;
          reasons.push("First/last name swapped");
        } else {
          // Tier 3: Fuzzy match
          const sim = calculateNameSimilarity(fullName1, fullName2);
          if (sim >= 0.7) {
            confidence = 0.5 + (sim - 0.7) * (0.35 / 0.3); // Scale 0.7-1.0 → 0.5-0.85
            reasons.push(
              `Fuzzy name match (${Math.round(sim * 100)}% similarity)`
            );
          }
        }
      }

      if (confidence === 0) continue;

      // 4. Boost signals
      const u1Dummy = isDummyEmail(u1.email);
      const u2Dummy = isDummyEmail(u2.email);

      if (u1Dummy && u2Dummy) {
        confidence = Math.min(1.0, confidence + 0.1);
        reasons.push("Both have dummy emails");
      } else if (
        (u1Dummy && !u2Dummy) ||
        (!u1Dummy && u2Dummy)
      ) {
        confidence = Math.min(1.0, confidence + 0.05);
        reasons.push("One real, one dummy email");
      }

      // Check for shared role in same unit
      const roles1 = roleMap.get(u1.id) ?? [];
      const roles2 = roleMap.get(u2.id) ?? [];
      const sharedRole = roles1.some((r1) =>
        roles2.some(
          (r2) => r1.unitId === r2.unitId && r1.role === r2.role
        )
      );
      if (sharedRole) {
        confidence = Math.min(1.0, confidence + 0.05);
        reasons.push("Same role in same unit");
      }

      seen.add(pairKey);

      pairs.push({
        user1: {
          id: u1.id,
          firstName: u1.firstName,
          lastName: u1.lastName,
          email: u1.email,
          canLogin: u1.canLogin,
          roles: roles1,
        },
        user2: {
          id: u2.id,
          firstName: u2.firstName,
          lastName: u2.lastName,
          email: u2.email,
          canLogin: u2.canLogin,
          roles: roles2,
        },
        confidence: Math.round(confidence * 100) / 100,
        reasons,
      });
    }
  }

  // 5. Sort by confidence descending
  pairs.sort((a, b) => b.confidence - a.confidence);

  logger.info(
    `[StaffDedup] Found ${pairs.length} duplicate candidates for hospital ${hospitalId}`
  );

  return pairs;
}
