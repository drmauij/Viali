import { db } from "../db";
import { eq, and, asc, isNull } from "drizzle-orm";
import {
  users,
  userHospitalRoles,
  units,
  type User,
  type UpsertUser,
  type UserHospitalRole,
  type Unit,
} from "@shared/schema";

export async function getUser(id: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}

export async function upsertUser(userData: UpsertUser): Promise<User> {
  const [user] = await db
    .insert(users)
    .values(userData)
    .onConflictDoUpdate({
      target: users.email, // Use email as conflict target for OIDC re-login
      set: {
        // Don't update id - it's referenced by foreign keys
        firstName: userData.firstName,
        lastName: userData.lastName,
        profileImageUrl: userData.profileImageUrl,
        updatedAt: new Date(),
      },
    })
    .returning();
  return user;
}

export async function getHospitalUsers(hospitalId: string): Promise<(UserHospitalRole & { user: User; unit: Unit })[]> {
  const results = await db
    .select()
    .from(userHospitalRoles)
    .innerJoin(users, eq(userHospitalRoles.userId, users.id))
    .innerJoin(units, eq(userHospitalRoles.unitId, units.id))
    .where(
      and(
        eq(userHospitalRoles.hospitalId, hospitalId),
        isNull(users.archivedAt) // Filter out archived users
      )
    )
    .orderBy(asc(users.email));
  
  return results.map(row => ({
    ...row.user_hospital_roles,
    user: row.users,
    unit: row.units,
  }));
}

export async function createUserHospitalRole(data: Omit<UserHospitalRole, 'id' | 'createdAt'>): Promise<UserHospitalRole> {
  const [newRole] = await db
    .insert(userHospitalRoles)
    .values(data)
    .returning();
  return newRole;
}

export async function updateUserHospitalRole(id: string, updates: Partial<UserHospitalRole>): Promise<UserHospitalRole> {
  const [updated] = await db
    .update(userHospitalRoles)
    .set(updates)
    .where(eq(userHospitalRoles.id, id))
    .returning();
  return updated;
}

export async function deleteUserHospitalRole(id: string): Promise<void> {
  await db.delete(userHospitalRoles).where(eq(userHospitalRoles.id, id));
}

export async function getUserHospitalRoleById(id: string): Promise<UserHospitalRole | undefined> {
  const [role] = await db.select().from(userHospitalRoles).where(eq(userHospitalRoles.id, id));
  return role;
}

export async function searchUserByEmail(email: string): Promise<User | undefined> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return user;
}

export async function findUserByEmailAndName(email: string, firstName: string, lastName: string): Promise<User | undefined> {
  const [user] = await db
    .select()
    .from(users)
    .where(and(
      eq(users.email, email),
      eq(users.firstName, firstName),
      eq(users.lastName, lastName)
    ))
    .limit(1);
  return user;
}

export async function createUser(userData: { email: string; firstName: string; lastName: string; phone?: string; staffType?: 'internal' | 'external'; canLogin?: boolean }): Promise<User> {
  const nanoid = (await import('nanoid')).nanoid;
  
  const [newUser] = await db
    .insert(users)
    .values({
      id: nanoid(),
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName,
      phone: userData.phone || null,
      staffType: userData.staffType || 'internal',
      canLogin: userData.canLogin ?? true,
      profileImageUrl: null,
    })
    .returning();
  return newUser;
}

export async function createUserWithPassword(email: string, password: string, firstName: string, lastName: string): Promise<User> {
  const bcrypt = await import('bcrypt');
  const hashedPassword = await bcrypt.hash(password, 10);
  const nanoid = (await import('nanoid')).nanoid;
  
  const [newUser] = await db
    .insert(users)
    .values({
      id: nanoid(),
      email,
      passwordHash: hashedPassword,
      firstName,
      lastName,
      profileImageUrl: null,
    })
    .returning();
  return newUser;
}

export async function updateUser(userId: string, updates: Partial<User>): Promise<User> {
  const [updated] = await db
    .update(users)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return updated;
}

export async function updateUserPassword(userId: string, newPassword: string): Promise<void> {
  const bcrypt = await import('bcrypt');
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  
  await db
    .update(users)
    .set({ passwordHash: hashedPassword, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function deleteUser(userId: string): Promise<void> {
  await db.delete(users).where(eq(users.id, userId));
}
