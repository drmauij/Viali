/**
 * Shared role constants used by both server middlewares and client UI gating.
 *
 * Keep this file free of server-only (DB, Drizzle) or browser-only imports so
 * both runtimes can consume it.
 */

// The order of this list is cosmetic (used for display / listing). It is NOT
// a privilege ranking — in particular, `group_admin`'s position here is
// orthogonal to the standard hospital-admin hierarchy. Callers that need a
// true hierarchy must use their own ranking (see `getUserRole` preference
// order in `server/utils/accessControl.ts`).
export const ROLE_HIERARCHY = [
  "admin",
  "manager",
  "doctor",
  "nurse",
  "staff",
  "marketing",
  "group_admin",
  "guest",
] as const;

export type UserRole = (typeof ROLE_HIERARCHY)[number];

// Roles that can write (mutate) resources at a hospital. `group_admin` is
// write-capable because it's the multi-location chain-level admin (Patrick /
// chain CEO or CMO in the spec): they run the group catalog and marketing
// from any hospital in their group.
export const WRITE_ROLES: UserRole[] = [
  "admin",
  "manager",
  "doctor",
  "nurse",
  "staff",
  "marketing",
  "group_admin",
];

// Roles that can only read.
export const READ_ONLY_ROLES: UserRole[] = ["guest"];

export function canWriteRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return (WRITE_ROLES as readonly string[]).includes(role);
}
