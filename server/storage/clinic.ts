import { db } from "../db";
import { eq, and, desc, asc, sql, lte, gte, inArray, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  users,
  hospitals,
  units,
  surgeries,
  patients,
  userHospitalRoles,
  providerAvailability,
  providerTimeOff,
  providerAbsences,
  providerAvailabilityWindows,
  clinicAppointments,
  clinicServices,
  timebutlerConfig,
  calcomConfig,
  calcomProviderMappings,
  hospitalVonageConfigs,
  scheduledJobs,
  patientQuestionnaireLinks,
  externalWorklogLinks,
  externalWorklogEntries,
  externalSurgeryRequests,
  externalSurgeryRequestDocuments,
  type User,
  type Hospital,
  type Unit,
  type Patient,
  type UserHospitalRole,
  type ClinicProvider,
  type ProviderAvailability,
  type InsertProviderAvailability,
  type ProviderTimeOff,
  type InsertProviderTimeOff,
  type ProviderAvailabilityWindow,
  type InsertProviderAvailabilityWindow,
  type ProviderAbsence,
  type InsertProviderAbsence,
  type ClinicAppointment,
  type InsertClinicAppointment,
  type ClinicService,
  type TimebutlerConfig,
  type InsertTimebutlerConfig,
  type CalcomConfig,
  type InsertCalcomConfig,
  type CalcomProviderMapping,
  type InsertCalcomProviderMapping,
  type HospitalVonageConfig,
  type InsertHospitalVonageConfig,
  type ScheduledJob,
  type InsertScheduledJob,
  type ExternalWorklogLink,
  type InsertExternalWorklogLink,
  type ExternalWorklogEntry,
  type InsertExternalWorklogEntry,
  type ExternalSurgeryRequest,
  type InsertExternalSurgeryRequest,
  type ExternalSurgeryRequestDocument,
  type InsertExternalSurgeryRequestDocument,
} from "@shared/schema";

function roleToClinicProvider(role: UserHospitalRole): ClinicProvider {
  return {
    id: role.id,
    hospitalId: role.hospitalId,
    unitId: role.unitId,
    userId: role.userId,
    isBookable: role.isBookable ?? false,
    availabilityMode: (role.availabilityMode as 'always_available' | 'windows_required') ?? 'always_available',
    createdAt: role.createdAt ?? null,
    updatedAt: null,
  };
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

// ========== CLINIC APPOINTMENT SCHEDULING ==========

export async function getClinicProvidersByHospital(hospitalId: string): Promise<(ClinicProvider & { user: User })[]> {
  const results = await db
    .select({
      role: userHospitalRoles,
      user: users
    })
    .from(userHospitalRoles)
    .innerJoin(users, eq(userHospitalRoles.userId, users.id))
    .where(eq(userHospitalRoles.hospitalId, hospitalId))
    .orderBy(asc(users.lastName), asc(users.firstName));
  
  const userMap = new Map<string, { role: UserHospitalRole; user: User }>();
  for (const r of results) {
    const existing = userMap.get(r.role.userId);
    if (!existing) {
      userMap.set(r.role.userId, { role: r.role, user: r.user });
    } else if (r.role.isBookable && !existing.role.isBookable) {
      userMap.set(r.role.userId, { 
        role: { ...existing.role, isBookable: true }, 
        user: r.user 
      });
    }
  }
  return Array.from(userMap.values()).map(v => ({ 
    ...roleToClinicProvider(v.role), 
    user: v.user 
  }));
}

export async function getBookableProvidersByHospital(hospitalId: string): Promise<(ClinicProvider & { user: User })[]> {
  const results = await db
    .select({
      role: userHospitalRoles,
      user: users
    })
    .from(userHospitalRoles)
    .innerJoin(users, eq(userHospitalRoles.userId, users.id))
    .where(and(
      eq(userHospitalRoles.hospitalId, hospitalId),
      eq(userHospitalRoles.isBookable, true)
    ))
    .orderBy(asc(users.lastName), asc(users.firstName));
  
  const seen = new Set<string>();
  const unique: (ClinicProvider & { user: User })[] = [];
  for (const r of results) {
    if (!seen.has(r.role.userId)) {
      seen.add(r.role.userId);
      unique.push({ ...roleToClinicProvider(r.role), user: r.user });
    }
  }
  return unique;
}

export async function getProviderAvailability(providerId: string, unitId: string | null, hospitalId?: string): Promise<ProviderAvailability[]> {
  if (unitId === null && hospitalId) {
    return await db
      .select()
      .from(providerAvailability)
      .where(and(
        eq(providerAvailability.providerId, providerId),
        eq(providerAvailability.hospitalId, hospitalId),
        isNull(providerAvailability.unitId)
      ))
      .orderBy(asc(providerAvailability.dayOfWeek));
  }
  
  return await db
    .select()
    .from(providerAvailability)
    .where(and(
      eq(providerAvailability.providerId, providerId),
      eq(providerAvailability.unitId, unitId!)
    ))
    .orderBy(asc(providerAvailability.dayOfWeek));
}

export async function setProviderAvailability(providerId: string, unitId: string | null, availability: InsertProviderAvailability[], hospitalId?: string): Promise<ProviderAvailability[]> {
  if (unitId === null && hospitalId) {
    await db
      .delete(providerAvailability)
      .where(and(
        eq(providerAvailability.providerId, providerId),
        eq(providerAvailability.hospitalId, hospitalId),
        isNull(providerAvailability.unitId)
      ));
  } else {
    await db
      .delete(providerAvailability)
      .where(and(
        eq(providerAvailability.providerId, providerId),
        eq(providerAvailability.unitId, unitId!)
      ));
  }
  
  if (availability.length === 0) {
    return [];
  }
  
  const inserted = await db
    .insert(providerAvailability)
    .values(availability.map(a => {
      const { id: _id, ...rest } = a as any;
      return {
        ...rest,
        providerId,
        unitId: unitId ?? undefined,
        hospitalId: unitId === null ? hospitalId : undefined
      };
    }))
    .returning();
  
  return inserted;
}

export async function updateProviderAvailability(id: string, updates: Partial<ProviderAvailability>): Promise<ProviderAvailability> {
  const [updated] = await db
    .update(providerAvailability)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(providerAvailability.id, id))
    .returning();
  return updated;
}

export async function getProviderTimeOff(providerId: string, unitId: string | null, startDate?: string, endDate?: string, hospitalId?: string): Promise<ProviderTimeOff[]> {
  let conditions: any[] = [eq(providerTimeOff.providerId, providerId)];
  
  if (unitId === null && hospitalId) {
    conditions.push(eq(providerTimeOff.hospitalId, hospitalId));
    conditions.push(isNull(providerTimeOff.unitId));
  } else {
    conditions.push(eq(providerTimeOff.unitId, unitId!));
  }
  
  if (startDate) {
    conditions.push(gte(providerTimeOff.endDate, startDate));
  }
  if (endDate) {
    conditions.push(lte(providerTimeOff.startDate, endDate));
  }
  
  return await db
    .select()
    .from(providerTimeOff)
    .where(and(...conditions))
    .orderBy(asc(providerTimeOff.startDate));
}

export async function createProviderTimeOff(timeOff: InsertProviderTimeOff): Promise<ProviderTimeOff> {
  const [created] = await db
    .insert(providerTimeOff)
    .values(timeOff)
    .returning();
  return created;
}

export async function updateProviderTimeOff(id: string, updates: Partial<ProviderTimeOff>): Promise<ProviderTimeOff> {
  const [updated] = await db
    .update(providerTimeOff)
    .set(updates)
    .where(eq(providerTimeOff.id, id))
    .returning();
  return updated;
}

export async function deleteProviderTimeOff(id: string): Promise<void> {
  await db
    .delete(providerTimeOff)
    .where(eq(providerTimeOff.id, id));
}

export async function getProviderTimeOffsForUnit(unitId: string, startDate?: string, endDate?: string): Promise<ProviderTimeOff[]> {
  let conditions: any[] = [eq(providerTimeOff.unitId, unitId)];
  
  if (startDate) {
    conditions.push(gte(providerTimeOff.endDate, startDate));
  }
  if (endDate) {
    conditions.push(lte(providerTimeOff.startDate, endDate));
  }
  
  return await db
    .select()
    .from(providerTimeOff)
    .where(and(...conditions))
    .orderBy(asc(providerTimeOff.startDate));
}

export async function getProviderTimeOffsForHospital(hospitalId: string, startDate?: string, endDate?: string): Promise<ProviderTimeOff[]> {
  let conditions: any[] = [
    eq(providerTimeOff.hospitalId, hospitalId),
    isNull(providerTimeOff.unitId)
  ];
  
  if (startDate) {
    conditions.push(gte(providerTimeOff.endDate, startDate));
  }
  if (endDate) {
    conditions.push(lte(providerTimeOff.startDate, endDate));
  }
  
  return await db
    .select()
    .from(providerTimeOff)
    .where(and(...conditions))
    .orderBy(asc(providerTimeOff.startDate));
}

export async function updateProviderAvailabilityMode(hospitalId: string, userId: string, mode: 'always_available' | 'windows_required'): Promise<ClinicProvider> {
  const existing = await db
    .select()
    .from(userHospitalRoles)
    .where(
      and(
        eq(userHospitalRoles.hospitalId, hospitalId),
        eq(userHospitalRoles.userId, userId)
      )
    )
    .limit(1);
  
  if (existing.length === 0) {
    throw new Error('Provider not found');
  }
  
  await db
    .update(userHospitalRoles)
    .set({ availabilityMode: mode })
    .where(
      and(
        eq(userHospitalRoles.hospitalId, hospitalId),
        eq(userHospitalRoles.userId, userId)
      )
    );
  
  const [updated] = await db
    .select()
    .from(userHospitalRoles)
    .where(eq(userHospitalRoles.id, existing[0].id));
  
  return roleToClinicProvider(updated);
}

export async function getProviderAvailabilityWindows(providerId: string, unitId: string | null, startDate?: string, endDate?: string, hospitalId?: string): Promise<ProviderAvailabilityWindow[]> {
  let conditions: any[] = [eq(providerAvailabilityWindows.providerId, providerId)];
  
  if (unitId === null && hospitalId) {
    conditions.push(eq(providerAvailabilityWindows.hospitalId, hospitalId));
    conditions.push(isNull(providerAvailabilityWindows.unitId));
  } else {
    conditions.push(eq(providerAvailabilityWindows.unitId, unitId!));
  }
  
  if (startDate) {
    conditions.push(gte(providerAvailabilityWindows.date, startDate));
  }
  if (endDate) {
    conditions.push(lte(providerAvailabilityWindows.date, endDate));
  }
  
  return await db
    .select()
    .from(providerAvailabilityWindows)
    .where(and(...conditions))
    .orderBy(asc(providerAvailabilityWindows.date));
}

export async function getProviderAvailabilityWindowsForUnit(unitId: string, startDate?: string, endDate?: string): Promise<ProviderAvailabilityWindow[]> {
  let conditions: any[] = [eq(providerAvailabilityWindows.unitId, unitId)];
  
  if (startDate) {
    conditions.push(gte(providerAvailabilityWindows.date, startDate));
  }
  if (endDate) {
    conditions.push(lte(providerAvailabilityWindows.date, endDate));
  }
  
  return await db
    .select()
    .from(providerAvailabilityWindows)
    .where(and(...conditions))
    .orderBy(asc(providerAvailabilityWindows.date));
}

export async function getProviderAvailabilityWindowsForHospital(hospitalId: string, startDate?: string, endDate?: string): Promise<ProviderAvailabilityWindow[]> {
  let conditions: any[] = [
    eq(providerAvailabilityWindows.hospitalId, hospitalId),
    isNull(providerAvailabilityWindows.unitId)
  ];
  
  if (startDate) {
    conditions.push(gte(providerAvailabilityWindows.date, startDate));
  }
  if (endDate) {
    conditions.push(lte(providerAvailabilityWindows.date, endDate));
  }
  
  return await db
    .select()
    .from(providerAvailabilityWindows)
    .where(and(...conditions))
    .orderBy(asc(providerAvailabilityWindows.date));
}

export async function createProviderAvailabilityWindow(window: InsertProviderAvailabilityWindow): Promise<ProviderAvailabilityWindow> {
  const [created] = await db
    .insert(providerAvailabilityWindows)
    .values(window)
    .returning();
  return created;
}

export async function updateProviderAvailabilityWindow(id: string, updates: Partial<ProviderAvailabilityWindow>): Promise<ProviderAvailabilityWindow> {
  const [updated] = await db
    .update(providerAvailabilityWindows)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(providerAvailabilityWindows.id, id))
    .returning();
  return updated;
}

export async function deleteProviderAvailabilityWindow(id: string): Promise<void> {
  await db
    .delete(providerAvailabilityWindows)
    .where(eq(providerAvailabilityWindows.id, id));
}

export async function getProviderAbsences(hospitalId: string, startDate?: string, endDate?: string): Promise<ProviderAbsence[]> {
  let conditions = [eq(providerAbsences.hospitalId, hospitalId)];
  
  if (startDate) {
    conditions.push(gte(providerAbsences.endDate, startDate));
  }
  if (endDate) {
    conditions.push(lte(providerAbsences.startDate, endDate));
  }
  
  return await db
    .select()
    .from(providerAbsences)
    .where(and(...conditions))
    .orderBy(asc(providerAbsences.startDate));
}

export async function syncProviderAbsences(hospitalId: string, absences: InsertProviderAbsence[]): Promise<void> {
  for (const absence of absences) {
    await db
      .insert(providerAbsences)
      .values({ ...absence, hospitalId })
      .onConflictDoUpdate({
        target: [providerAbsences.hospitalId, providerAbsences.externalId],
        set: {
          absenceType: absence.absenceType,
          startDate: absence.startDate,
          endDate: absence.endDate,
          isHalfDayStart: absence.isHalfDayStart,
          isHalfDayEnd: absence.isHalfDayEnd,
          syncedAt: new Date(),
        },
      });
  }
}

export async function syncProviderAbsencesForUser(hospitalId: string, userId: string, absences: InsertProviderAbsence[]): Promise<void> {
  await db
    .delete(providerAbsences)
    .where(
      and(
        eq(providerAbsences.hospitalId, hospitalId),
        eq(providerAbsences.providerId, userId),
        sql`${providerAbsences.externalId} LIKE 'ics-%'`
      )
    );
  
  for (const absence of absences) {
    await db
      .insert(providerAbsences)
      .values({ ...absence, hospitalId, syncedAt: new Date() })
      .onConflictDoUpdate({
        target: [providerAbsences.hospitalId, providerAbsences.externalId],
        set: {
          providerId: absence.providerId,
          absenceType: absence.absenceType,
          startDate: absence.startDate,
          endDate: absence.endDate,
          notes: absence.notes,
          syncedAt: new Date(),
        },
      });
  }
}

export async function clearProviderAbsencesForUser(hospitalId: string, userId: string): Promise<void> {
  await db
    .delete(providerAbsences)
    .where(
      and(
        eq(providerAbsences.hospitalId, hospitalId),
        eq(providerAbsences.providerId, userId),
        sql`${providerAbsences.externalId} LIKE 'ics-%'`
      )
    );
}

export async function getTimebutlerConfig(hospitalId: string): Promise<TimebutlerConfig | undefined> {
  const [config] = await db
    .select()
    .from(timebutlerConfig)
    .where(eq(timebutlerConfig.hospitalId, hospitalId));
  return config;
}

export async function upsertTimebutlerConfig(config: InsertTimebutlerConfig): Promise<TimebutlerConfig> {
  const [upserted] = await db
    .insert(timebutlerConfig)
    .values(config)
    .onConflictDoUpdate({
      target: timebutlerConfig.hospitalId,
      set: {
        apiToken: config.apiToken,
        userMapping: config.userMapping,
        isEnabled: config.isEnabled,
        updatedAt: new Date(),
      },
    })
    .returning();
  return upserted;
}

export async function getCalcomConfig(hospitalId: string): Promise<CalcomConfig | undefined> {
  const [config] = await db
    .select()
    .from(calcomConfig)
    .where(eq(calcomConfig.hospitalId, hospitalId));
  return config;
}

export async function upsertCalcomConfig(config: InsertCalcomConfig): Promise<CalcomConfig> {
  const [upserted] = await db
    .insert(calcomConfig)
    .values(config)
    .onConflictDoUpdate({
      target: calcomConfig.hospitalId,
      set: {
        apiKey: config.apiKey,
        webhookSecret: config.webhookSecret,
        ...(config.feedToken ? { feedToken: config.feedToken } : {}),
        isEnabled: config.isEnabled,
        syncBusyBlocks: config.syncBusyBlocks,
        syncTimebutlerAbsences: config.syncTimebutlerAbsences,
        lastSyncAt: config.lastSyncAt,
        lastSyncError: config.lastSyncError,
        updatedAt: new Date(),
      },
    })
    .returning();
  return upserted;
}

export async function getCalcomProviderMappings(hospitalId: string): Promise<CalcomProviderMapping[]> {
  return db
    .select()
    .from(calcomProviderMappings)
    .where(eq(calcomProviderMappings.hospitalId, hospitalId));
}

export async function getCalcomProviderMapping(hospitalId: string, providerId: string): Promise<CalcomProviderMapping | undefined> {
  const [mapping] = await db
    .select()
    .from(calcomProviderMappings)
    .where(and(
      eq(calcomProviderMappings.hospitalId, hospitalId),
      eq(calcomProviderMappings.providerId, providerId)
    ));
  return mapping;
}

export async function upsertCalcomProviderMapping(mapping: InsertCalcomProviderMapping): Promise<CalcomProviderMapping> {
  const [upserted] = await db
    .insert(calcomProviderMappings)
    .values(mapping)
    .onConflictDoUpdate({
      target: [calcomProviderMappings.hospitalId, calcomProviderMappings.providerId],
      set: {
        calcomEventTypeId: mapping.calcomEventTypeId,
        calcomUserId: mapping.calcomUserId,
        calcomScheduleId: mapping.calcomScheduleId,
        isEnabled: mapping.isEnabled,
        updatedAt: new Date(),
      },
    })
    .returning();
  return upserted;
}

export async function deleteCalcomProviderMapping(id: string): Promise<void> {
  await db
    .delete(calcomProviderMappings)
    .where(eq(calcomProviderMappings.id, id));
}

export async function updateCalcomProviderMappingBusyBlocks(id: string, busyBlockMapping: Record<string, string>): Promise<CalcomProviderMapping> {
  const [updated] = await db
    .update(calcomProviderMappings)
    .set({ busyBlockMapping, updatedAt: new Date() })
    .where(eq(calcomProviderMappings.id, id))
    .returning();
  return updated;
}

export async function getHospitalVonageConfig(hospitalId: string): Promise<HospitalVonageConfig | undefined> {
  const [config] = await db
    .select()
    .from(hospitalVonageConfigs)
    .where(eq(hospitalVonageConfigs.hospitalId, hospitalId));
  return config;
}

export async function upsertHospitalVonageConfig(config: InsertHospitalVonageConfig): Promise<HospitalVonageConfig> {
  const [upserted] = await db
    .insert(hospitalVonageConfigs)
    .values(config)
    .onConflictDoUpdate({
      target: hospitalVonageConfigs.hospitalId,
      set: {
        encryptedApiKey: config.encryptedApiKey,
        encryptedApiSecret: config.encryptedApiSecret,
        encryptedFromNumber: config.encryptedFromNumber,
        isEnabled: config.isEnabled,
        updatedAt: new Date(),
      },
    })
    .returning();
  return upserted;
}

export async function updateHospitalVonageTestStatus(hospitalId: string, status: 'success' | 'failed', error?: string): Promise<void> {
  await db
    .update(hospitalVonageConfigs)
    .set({
      lastTestedAt: new Date(),
      lastTestStatus: status,
      lastTestError: error || null,
      updatedAt: new Date(),
    })
    .where(eq(hospitalVonageConfigs.hospitalId, hospitalId));
}

const colleagueUser = alias(users, 'colleague_user');

export async function getClinicAppointments(unitId: string, filters?: {
  providerId?: string;
  patientId?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
}): Promise<(ClinicAppointment & { patient?: Patient; provider?: User; service?: ClinicService; colleague?: User })[]> {
  let conditions = [eq(clinicAppointments.unitId, unitId)];
  
  if (filters?.providerId) {
    conditions.push(eq(clinicAppointments.providerId, filters.providerId));
  }
  if (filters?.patientId) {
    conditions.push(eq(clinicAppointments.patientId, filters.patientId));
  }
  if (filters?.startDate) {
    conditions.push(gte(clinicAppointments.appointmentDate, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(clinicAppointments.appointmentDate, filters.endDate));
  }
  if (filters?.status) {
    conditions.push(eq(clinicAppointments.status, filters.status as any));
  }
  
  const results = await db
    .select()
    .from(clinicAppointments)
    .leftJoin(patients, eq(clinicAppointments.patientId, patients.id))
    .leftJoin(users, eq(clinicAppointments.providerId, users.id))
    .leftJoin(clinicServices, eq(clinicAppointments.serviceId, clinicServices.id))
    .leftJoin(colleagueUser, eq(clinicAppointments.internalColleagueId, colleagueUser.id))
    .where(and(...conditions))
    .orderBy(asc(clinicAppointments.appointmentDate), asc(clinicAppointments.startTime));

  return results.map(row => ({
    ...row.clinic_appointments,
    patient: row.patients || undefined,
    provider: row.users || undefined,
    service: row.clinic_services || undefined,
    colleague: row.colleague_user || undefined,
  }));
}

export async function getClinicAppointmentsByHospital(hospitalId: string, filters?: {
  providerId?: string;
  patientId?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  unitId?: string;
}): Promise<(ClinicAppointment & { patient?: Patient; provider?: User; service?: ClinicService; colleague?: User })[]> {
  let conditions = [eq(clinicAppointments.hospitalId, hospitalId)];
  
  if (filters?.unitId) {
    conditions.push(eq(clinicAppointments.unitId, filters.unitId));
  }
  if (filters?.providerId) {
    conditions.push(eq(clinicAppointments.providerId, filters.providerId));
  }
  if (filters?.patientId) {
    conditions.push(eq(clinicAppointments.patientId, filters.patientId));
  }
  if (filters?.startDate) {
    conditions.push(gte(clinicAppointments.appointmentDate, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(clinicAppointments.appointmentDate, filters.endDate));
  }
  if (filters?.status) {
    conditions.push(eq(clinicAppointments.status, filters.status as any));
  }
  
  const results = await db
    .select()
    .from(clinicAppointments)
    .leftJoin(patients, eq(clinicAppointments.patientId, patients.id))
    .leftJoin(users, eq(clinicAppointments.providerId, users.id))
    .leftJoin(clinicServices, eq(clinicAppointments.serviceId, clinicServices.id))
    .leftJoin(colleagueUser, eq(clinicAppointments.internalColleagueId, colleagueUser.id))
    .where(and(...conditions))
    .orderBy(asc(clinicAppointments.appointmentDate), asc(clinicAppointments.startTime));

  return results.map(row => ({
    ...row.clinic_appointments,
    patient: row.patients || undefined,
    provider: row.users || undefined,
    service: row.clinic_services || undefined,
    colleague: row.colleague_user || undefined,
  }));
}

export async function getClinicAppointment(id: string): Promise<(ClinicAppointment & { patient?: Patient; provider?: User; service?: ClinicService; colleague?: User }) | undefined> {
  const [result] = await db
    .select()
    .from(clinicAppointments)
    .leftJoin(patients, eq(clinicAppointments.patientId, patients.id))
    .leftJoin(users, eq(clinicAppointments.providerId, users.id))
    .leftJoin(clinicServices, eq(clinicAppointments.serviceId, clinicServices.id))
    .leftJoin(colleagueUser, eq(clinicAppointments.internalColleagueId, colleagueUser.id))
    .where(eq(clinicAppointments.id, id));

  if (!result) return undefined;

  return {
    ...result.clinic_appointments,
    patient: result.patients || undefined,
    provider: result.users || undefined,
    service: result.clinic_services || undefined,
    colleague: result.colleague_user || undefined,
  };
}

export async function createClinicAppointment(appointment: InsertClinicAppointment): Promise<ClinicAppointment> {
  const [created] = await db
    .insert(clinicAppointments)
    .values(appointment)
    .returning();
  return created;
}

export async function updateClinicAppointment(id: string, updates: Partial<ClinicAppointment>): Promise<ClinicAppointment> {
  const [updated] = await db
    .update(clinicAppointments)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(clinicAppointments.id, id))
    .returning();
  return updated;
}

export async function deleteClinicAppointment(id: string): Promise<void> {
  await db
    .delete(clinicAppointments)
    .where(eq(clinicAppointments.id, id));
}

export async function getAvailableSlots(providerId: string, unitId: string, date: string, durationMinutes: number, hospitalId?: string): Promise<{ startTime: string; endTime: string }[]> {
  const dateObj = new Date(date);
  const dayOfWeek = dateObj.getDay(); // 0-6, Sunday = 0

  // Resolve calendar scope: if unit doesn't have its own calendar, use hospital-level (shared) data
  let effectiveUnitId: string | null = unitId;
  if (hospitalId) {
    const [unit] = await db.select({ hasOwnCalendar: units.hasOwnCalendar }).from(units).where(eq(units.id, unitId)).limit(1);
    if (unit && !unit.hasOwnCalendar) {
      effectiveUnitId = null;
    }
  }

  // Look up provider's availability mode
  let availabilityMode = 'always_available';
  if (hospitalId) {
    const roleResult = await db
      .select({ availabilityMode: userHospitalRoles.availabilityMode })
      .from(userHospitalRoles)
      .where(and(
        eq(userHospitalRoles.userId, providerId),
        eq(userHospitalRoles.hospitalId, hospitalId)
      ))
      .limit(1);
    if (roleResult.length > 0 && roleResult[0].availabilityMode) {
      availabilityMode = roleResult[0].availabilityMode;
    }
  }

  // Query weekly schedule — use effectiveUnitId (null = shared hospital calendar)
  const weeklyConditions = [
    eq(providerAvailability.providerId, providerId),
    eq(providerAvailability.dayOfWeek, dayOfWeek),
    eq(providerAvailability.isActive, true),
  ];
  if (effectiveUnitId === null && hospitalId) {
    weeklyConditions.push(eq(providerAvailability.hospitalId, hospitalId));
    weeklyConditions.push(isNull(providerAvailability.unitId));
  } else {
    weeklyConditions.push(eq(providerAvailability.unitId, effectiveUnitId!));
  }
  const availabilityList = await db
    .select()
    .from(providerAvailability)
    .where(and(...weeklyConditions))
    .orderBy(providerAvailability.startTime);

  // Query availability windows for this specific date
  const windowConditions = [
    eq(providerAvailabilityWindows.providerId, providerId),
    eq(providerAvailabilityWindows.date, date),
  ];
  if (effectiveUnitId === null && hospitalId) {
    windowConditions.push(eq(providerAvailabilityWindows.hospitalId, hospitalId));
    windowConditions.push(isNull(providerAvailabilityWindows.unitId));
  } else if (hospitalId) {
    windowConditions.push(
      or(
        eq(providerAvailabilityWindows.unitId, effectiveUnitId!),
        and(
          eq(providerAvailabilityWindows.hospitalId, hospitalId),
          isNull(providerAvailabilityWindows.unitId)
        )!
      )!
    );
  } else {
    windowConditions.push(eq(providerAvailabilityWindows.unitId, effectiveUnitId!));
  }
  const windowList = await db
    .select()
    .from(providerAvailabilityWindows)
    .where(and(...windowConditions))
    .orderBy(providerAvailabilityWindows.startTime);

  // For windows_required mode, only use windows (ignore weekly schedule)
  // For always_available mode, use weekly schedule + windows
  const useWeeklySchedule = availabilityMode === 'always_available';
  const hasScheduleSources = (useWeeklySchedule && availabilityList.length > 0) || windowList.length > 0;

  if (!hasScheduleSources) {
    return [];
  }

  // Fetch blocking data — time off uses effectiveUnitId too
  const timeOffConditions = [
    eq(providerTimeOff.providerId, providerId),
    lte(providerTimeOff.startDate, date),
    gte(providerTimeOff.endDate, date),
  ];
  if (effectiveUnitId === null && hospitalId) {
    timeOffConditions.push(eq(providerTimeOff.hospitalId, hospitalId));
    timeOffConditions.push(isNull(providerTimeOff.unitId));
  } else {
    timeOffConditions.push(eq(providerTimeOff.unitId, effectiveUnitId!));
  }
  const timeOffList = await db
    .select()
    .from(providerTimeOff)
    .where(and(...timeOffConditions));

  const absenceList = await db
    .select()
    .from(providerAbsences)
    .where(and(
      eq(providerAbsences.providerId, providerId),
      lte(providerAbsences.startDate, date),
      gte(providerAbsences.endDate, date)
    ));

  const surgeryList = await db
    .select()
    .from(surgeries)
    .where(and(
      eq(surgeries.surgeonId, providerId),
      sql`DATE(${surgeries.plannedDate}) = ${date}`
    ));

  const existingAppointments = await db
    .select()
    .from(clinicAppointments)
    .where(and(
      eq(clinicAppointments.providerId, providerId),
      eq(clinicAppointments.appointmentDate, date),
      sql`${clinicAppointments.status} NOT IN ('cancelled', 'no_show')`
    ));

  const hasFullDayOff = timeOffList.some(t => !t.startTime && !t.endTime);
  const hasAbsence = absenceList.length > 0;

  if (hasFullDayOff || hasAbsence) {
    return [];
  }

  // Helper to generate slots from a time range, checking conflicts
  function generateSlots(rangeStart: string, rangeEnd: string, slotDuration: number): { startTime: string; endTime: string }[] {
    const result: { startTime: string; endTime: string }[] = [];
    const startMinutes = timeToMinutes(rangeStart);
    const endMinutes = timeToMinutes(rangeEnd);

    for (let mins = startMinutes; mins + durationMinutes <= endMinutes; mins += slotDuration) {
      const slotStart = minutesToTime(mins);
      const slotEnd = minutesToTime(mins + durationMinutes);

      const conflictsWithTimeOff = timeOffList.some(t => {
        if (!t.startTime || !t.endTime) return false;
        const offStart = timeToMinutes(t.startTime);
        const offEnd = timeToMinutes(t.endTime);
        return mins < offEnd && mins + durationMinutes > offStart;
      });

      const conflictsWithAppointment = existingAppointments.some(a => {
        const apptStart = timeToMinutes(a.startTime);
        const apptEnd = timeToMinutes(a.endTime);
        return mins < apptEnd && mins + durationMinutes > apptStart;
      });

      const conflictsWithSurgery = surgeryList.length > 0;

      if (!conflictsWithTimeOff && !conflictsWithAppointment && !conflictsWithSurgery) {
        result.push({ startTime: slotStart, endTime: slotEnd });
      }
    }
    return result;
  }

  const slots: { startTime: string; endTime: string }[] = [];

  // Generate slots from weekly schedule (always_available mode only)
  if (useWeeklySchedule) {
    for (const availability of availabilityList) {
      const slotDuration = availability.slotDurationMinutes || 30;
      slots.push(...generateSlots(availability.startTime, availability.endTime, slotDuration));
    }
  }

  // Generate slots from availability windows (both modes)
  for (const window of windowList) {
    const slotDuration = window.slotDurationMinutes || 30;
    slots.push(...generateSlots(window.startTime, window.endTime, slotDuration));
  }

  // Deduplicate and sort
  const uniqueSlots = slots
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .filter((slot, index, arr) =>
      index === 0 || slot.startTime !== arr[index - 1].startTime
    );

  return uniqueSlots;
}

export async function getStaffAvailabilityForDate(
  staffId: string,
  hospitalId: string,
  date: string
): Promise<{ busyMinutes: number; busyPercentage: number; status: 'available' | 'warning' | 'busy' | 'absent'; absenceType?: string }> {
  const results = await getMultipleStaffAvailability([staffId], hospitalId, date);
  return results[staffId] || { busyMinutes: 0, busyPercentage: 0, status: 'available' };
}

export async function getMultipleStaffAvailability(
  staffIds: string[],
  hospitalId: string,
  date: string
): Promise<Record<string, { busyMinutes: number; busyPercentage: number; status: 'available' | 'warning' | 'busy' | 'absent'; absenceType?: string; appointments?: Array<{ startTime: string; endTime: string; status: string }>; timeOffBlocks?: Array<{ startTime: string; endTime: string; reason: string }> }>> {
  if (staffIds.length === 0) {
    return {};
  }

  const WORKDAY_MINUTES = 480;
  const dayOfWeek = new Date(date + 'T00:00:00').getDay(); // 0=Sun, 6=Sat

  // 7 batch queries in parallel
  const [clinicProviderRows, absenceRows, timeOffRows, surgeryRows, appointmentRows, availabilityWindowRows, weeklyAvailRows] = await Promise.all([
    // 1. Which staff IDs are providers? (with availability mode)
    db.select({ userId: userHospitalRoles.userId, availabilityMode: userHospitalRoles.availabilityMode, isBookable: userHospitalRoles.isBookable })
      .from(userHospitalRoles)
      .where(and(
        sql`${userHospitalRoles.userId} IN ${staffIds}`,
        eq(userHospitalRoles.hospitalId, hospitalId)
      )),

    // 2. Timebutler-synced absences covering the date
    db.select({
      providerId: providerAbsences.providerId,
      absenceType: providerAbsences.absenceType,
      startDate: providerAbsences.startDate,
      endDate: providerAbsences.endDate,
      isHalfDayStart: providerAbsences.isHalfDayStart,
      isHalfDayEnd: providerAbsences.isHalfDayEnd,
    })
      .from(providerAbsences)
      .where(and(
        sql`${providerAbsences.providerId} IN ${staffIds}`,
        eq(providerAbsences.hospitalId, hospitalId),
        sql`${providerAbsences.startDate} <= ${date}`,
        sql`${providerAbsences.endDate} >= ${date}`
      )),

    // 3. Manual time off covering the date
    db.select({
      providerId: providerTimeOff.providerId,
      startDate: providerTimeOff.startDate,
      endDate: providerTimeOff.endDate,
      startTime: providerTimeOff.startTime,
      endTime: providerTimeOff.endTime,
      reason: providerTimeOff.reason,
    })
      .from(providerTimeOff)
      .where(and(
        sql`${providerTimeOff.providerId} IN ${staffIds}`,
        sql`${providerTimeOff.startDate} <= ${date}`,
        sql`${providerTimeOff.endDate} >= ${date}`
      )),

    // 4. Surgeries scheduled for this date (not cancelled, not suspended)
    db.select({
      surgeonId: surgeries.surgeonId,
    })
      .from(surgeries)
      .where(and(
        sql`${surgeries.surgeonId} IN ${staffIds}`,
        sql`DATE(${surgeries.plannedDate}) = ${date}`,
        sql`${surgeries.status} != 'cancelled'`,
        eq(surgeries.isSuspended, false)
      )),

    // 5. Clinic appointments (existing query)
    db.select({
      providerId: clinicAppointments.providerId,
      durationMinutes: clinicAppointments.durationMinutes,
      startTime: clinicAppointments.startTime,
      endTime: clinicAppointments.endTime,
      appointmentStatus: clinicAppointments.status,
    })
      .from(clinicAppointments)
      .where(and(
        sql`${clinicAppointments.providerId} IN ${staffIds}`,
        eq(clinicAppointments.appointmentDate, date),
        sql`${clinicAppointments.status} NOT IN ('cancelled', 'no_show')`
      )),

    // 6. Provider availability windows for this date
    db.select({ providerId: providerAvailabilityWindows.providerId })
      .from(providerAvailabilityWindows)
      .where(and(
        sql`${providerAvailabilityWindows.providerId} IN ${staffIds}`,
        eq(providerAvailabilityWindows.date, date),
        or(
          eq(providerAvailabilityWindows.hospitalId, hospitalId),
          sql`${providerAvailabilityWindows.unitId} IS NOT NULL`
        )
      )),

    // 7. Weekly recurring availability for this day of week
    db.select({ providerId: providerAvailability.providerId })
      .from(providerAvailability)
      .where(and(
        sql`${providerAvailability.providerId} IN ${staffIds}`,
        eq(providerAvailability.dayOfWeek, dayOfWeek),
        eq(providerAvailability.isActive, true),
        or(
          eq(providerAvailability.hospitalId, hospitalId),
          sql`${providerAvailability.unitId} IS NOT NULL`
        )
      )),
  ]);

  // Build set of provider user IDs and availability mode map
  const providerUserIds = new Set(clinicProviderRows.map(r => r.userId));
  const availabilityModeMap = new Map(clinicProviderRows.map(r => [r.userId, r.availabilityMode]));
  const providersWithWindowsOnDate = new Set(availabilityWindowRows.map(r => r.providerId));
  const providersWithWeeklyAvailability = new Set(weeklyAvailRows.map(r => r.providerId));

  // A user is bookable if ANY of their roles has isBookable=true
  const bookableUserIds = new Set(
    clinicProviderRows.filter(r => r.isBookable).map(r => r.userId)
  );

  const result: Record<string, { busyMinutes: number; busyPercentage: number; status: 'available' | 'warning' | 'busy' | 'absent'; absenceType?: string; appointments?: Array<{ startTime: string; endTime: string; status: string }>; timeOffBlocks?: Array<{ startTime: string; endTime: string; reason: string }> }> = {};

  // Helper: collect appointment details for a staff member (used across all code paths)
  function getStaffAppointmentDetails(staffId: string) {
    const apts = appointmentRows
      .filter(apt => apt.providerId === staffId)
      .map(apt => ({ startTime: apt.startTime || '', endTime: apt.endTime || '', status: apt.appointmentStatus || '' }));
    return apts.length > 0 ? apts : undefined;
  }

  // Helper: collect time-off blocks (partial, with start/end times) for a staff member
  function getStaffTimeOffBlocks(staffId: string) {
    const blocks = timeOffRows
      .filter(t => t.providerId === staffId && t.startTime && t.endTime)
      .map(t => ({ startTime: t.startTime!, endTime: t.endTime!, reason: t.reason || 'Time off' }));
    return blocks.length > 0 ? blocks : undefined;
  }

  for (const staffId of staffIds) {
    // Non-providers: always available, no availability check needed
    if (!providerUserIds.has(staffId)) {
      result[staffId] = { busyMinutes: 0, busyPercentage: 0, status: 'available', appointments: getStaffAppointmentDetails(staffId), timeOffBlocks: getStaffTimeOffBlocks(staffId) };
      continue;
    }

    // Non-bookable providers: always plannable, skip availability checks but still include appointment details for collision warnings
    if (!bookableUserIds.has(staffId)) {
      result[staffId] = { busyMinutes: 0, busyPercentage: 0, status: 'available', appointments: getStaffAppointmentDetails(staffId), timeOffBlocks: getStaffTimeOffBlocks(staffId) };
      continue;
    }

    // Check windows_required: if provider requires availability windows but has neither date-specific windows nor weekly schedule → absent
    if (availabilityModeMap.get(staffId) === 'windows_required' && !providersWithWindowsOnDate.has(staffId) && !providersWithWeeklyAvailability.has(staffId)) {
      result[staffId] = { busyMinutes: WORKDAY_MINUTES, busyPercentage: 100, status: 'absent', absenceType: 'noAvailability', appointments: getStaffAppointmentDetails(staffId), timeOffBlocks: getStaffTimeOffBlocks(staffId) };
      continue;
    }

    let busyMinutes = 0;
    let isAbsent = false;
    let absenceType: string | undefined;

    // Check Timebutler absences
    for (const absence of absenceRows) {
      if (absence.providerId !== staffId) continue;

      const isStartDate = absence.startDate === date;
      const isEndDate = absence.endDate === date;
      const isMiddleDate = !isStartDate && !isEndDate;

      if (isMiddleDate) {
        // Between start and end (exclusive) → full-day absent
        isAbsent = true;
        absenceType = absence.absenceType;
      } else if (isStartDate && absence.isHalfDayStart) {
        // Half-day start → 240min busy
        busyMinutes += 240;
      } else if (isEndDate && absence.isHalfDayEnd) {
        // Half-day end → 240min busy
        busyMinutes += 240;
      } else {
        // Full-day absent
        isAbsent = true;
        absenceType = absence.absenceType;
      }
    }

    // Check manual time off (only if not already fully absent)
    if (!isAbsent) {
      for (const timeOff of timeOffRows) {
        if (timeOff.providerId !== staffId) continue;

        if (!timeOff.startTime || !timeOff.endTime) {
          // Full-day time off (no start/end time)
          isAbsent = true;
          absenceType = timeOff.reason || 'timeOff';
        } else {
          // Partial time off — calculate minutes
          const [startH, startM] = timeOff.startTime.split(':').map(Number);
          const [endH, endM] = timeOff.endTime.split(':').map(Number);
          const minutes = (endH * 60 + endM) - (startH * 60 + startM);
          if (minutes > 0) busyMinutes += minutes;
        }
      }
    }

    if (isAbsent) {
      result[staffId] = { busyMinutes: WORKDAY_MINUTES, busyPercentage: 100, status: 'absent', absenceType, appointments: getStaffAppointmentDetails(staffId), timeOffBlocks: getStaffTimeOffBlocks(staffId) };
      continue;
    }

    // Add surgery minutes (120min per surgery)
    for (const surgery of surgeryRows) {
      if (surgery.surgeonId === staffId) {
        busyMinutes += 120;
      }
    }

    // Add appointment minutes
    for (const apt of appointmentRows) {
      if (apt.providerId === staffId) {
        busyMinutes += apt.durationMinutes || 0;
      }
    }

    // Calculate percentage and status
    const busyPercentage = Math.min(100, Math.round((busyMinutes / WORKDAY_MINUTES) * 100));
    let status: 'available' | 'warning' | 'busy' | 'absent' = 'available';
    if (busyPercentage >= 100) {
      status = 'busy';
    } else if (busyPercentage >= 80) {
      status = 'warning';
    }

    result[staffId] = { busyMinutes, busyPercentage, status, appointments: getStaffAppointmentDetails(staffId), timeOffBlocks: getStaffTimeOffBlocks(staffId) };
  }

  return result;
}

export async function getClinicServices(unitId: string): Promise<ClinicService[]> {
  return await db
    .select()
    .from(clinicServices)
    .where(eq(clinicServices.unitId, unitId))
    .orderBy(asc(clinicServices.sortOrder), asc(clinicServices.name));
}

// ========== SCHEDULED JOBS ==========

export async function getNextScheduledJob(): Promise<ScheduledJob | undefined> {
  const [job] = await db
    .select()
    .from(scheduledJobs)
    .where(and(
      eq(scheduledJobs.status, 'pending'),
      sql`${scheduledJobs.scheduledFor} <= NOW()`
    ))
    .orderBy(asc(scheduledJobs.scheduledFor))
    .limit(1);
  
  return job;
}

export async function createScheduledJob(job: InsertScheduledJob): Promise<ScheduledJob> {
  const [created] = await db
    .insert(scheduledJobs)
    .values(job)
    .returning();
  return created;
}

export async function updateScheduledJob(id: string, updates: Partial<ScheduledJob>): Promise<ScheduledJob> {
  const [updated] = await db
    .update(scheduledJobs)
    .set(updates)
    .where(eq(scheduledJobs.id, id))
    .returning();
  return updated;
}

export async function getLastScheduledJobForHospital(hospitalId: string, jobType: string): Promise<ScheduledJob | undefined> {
  const [job] = await db
    .select()
    .from(scheduledJobs)
    .where(and(
      eq(scheduledJobs.hospitalId, hospitalId),
      eq(scheduledJobs.jobType, jobType as any)
    ))
    .orderBy(desc(scheduledJobs.scheduledFor))
    .limit(1);
  
  return job;
}

export async function getPendingQuestionnaireJobsCount(hospitalId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(scheduledJobs)
    .where(and(
      eq(scheduledJobs.hospitalId, hospitalId),
      eq(scheduledJobs.jobType, 'auto_questionnaire_dispatch'),
      eq(scheduledJobs.status, 'pending')
    ));
  
  return result?.count || 0;
}

export async function getSurgeriesForAutoQuestionnaire(hospitalId: string, daysAhead: number): Promise<Array<{
  surgeryId: string;
  patientId: string;
  patientFirstName: string;
  patientLastName: string;
  patientEmail: string | null;
  patientPhone: string | null;
  patientBirthday: string;
  plannedDate: Date;
  plannedSurgery: string;
  surgeryRoomId: string | null;
  noPreOpRequired: boolean;
  hasQuestionnaireSent: boolean;
  hasExistingQuestionnaire: boolean;
}>> {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysAhead);
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  const surgeryResults = await db
    .select({
      surgeryId: surgeries.id,
      patientId: surgeries.patientId,
      patientFirstName: patients.firstName,
      patientLastName: patients.surname,
      patientEmail: patients.email,
      patientPhone: patients.phone,
      patientBirthday: patients.birthday,
      plannedDate: surgeries.plannedDate,
      plannedSurgery: surgeries.plannedSurgery,
      surgeryRoomId: surgeries.surgeryRoomId,
      noPreOpRequired: surgeries.noPreOpRequired,
    })
    .from(surgeries)
    .innerJoin(patients, eq(patients.id, surgeries.patientId))
    .where(and(
      eq(surgeries.hospitalId, hospitalId),
      gte(surgeries.plannedDate, startOfDay),
      lte(surgeries.plannedDate, endOfDay),
      inArray(surgeries.status, ['planned', 'scheduled', 'confirmed'] as (typeof surgeries.status._.data)[]),
      isNull(surgeries.archivedAt)
    ));

  const surgeryIds = surgeryResults.map(s => s.surgeryId);
  const patientIds = surgeryResults.map(s => s.patientId).filter((id): id is string => id !== null);

  const sentLinks = surgeryIds.length > 0 ? await db
    .select({ surgeryId: patientQuestionnaireLinks.surgeryId, patientId: patientQuestionnaireLinks.patientId })
    .from(patientQuestionnaireLinks)
    .where(and(
      or(
        inArray(patientQuestionnaireLinks.surgeryId, surgeryIds as any),
        inArray(patientQuestionnaireLinks.patientId, patientIds)
      ),
      or(
        eq(patientQuestionnaireLinks.emailSent, true),
        eq(patientQuestionnaireLinks.smsSent, true)
      )
    )) : [];

  const completedLinks = patientIds.length > 0 ? await db
    .select({ patientId: patientQuestionnaireLinks.patientId })
    .from(patientQuestionnaireLinks)
    .where(and(
      eq(patientQuestionnaireLinks.hospitalId, hospitalId),
      inArray(patientQuestionnaireLinks.status, ['submitted', 'reviewed'] as any),
      inArray(patientQuestionnaireLinks.patientId, patientIds)
    )) : [];

  const sentSurgeryIds = new Set(sentLinks.filter(l => l.surgeryId).map(l => l.surgeryId));
  const sentPatientIds = new Set(sentLinks.filter(l => l.patientId).map(l => l.patientId));
  const completedPatientIds = new Set(completedLinks.map(l => l.patientId));

  return surgeryResults.map(s => ({
    ...s,
    hasQuestionnaireSent: sentSurgeryIds.has(s.surgeryId) || sentPatientIds.has(s.patientId),
    hasExistingQuestionnaire: completedPatientIds.has(s.patientId),
  })) as any;
}

export async function getSurgeriesForPreSurgeryReminder(hospitalId: string, hoursAhead: number): Promise<Array<{
  surgeryId: string;
  patientId: string;
  patientFirstName: string;
  patientLastName: string;
  patientEmail: string | null;
  patientPhone: string | null;
  plannedDate: Date;
  admissionTime: Date | null;
  surgeryRoomId: string | null;
  noPreOpRequired: boolean;
  reminderSent: boolean;
}>> {
  const now = new Date();
  
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  
  const dayAfterTomorrow = new Date(tomorrow);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

  const results = await db
    .select({
      surgeryId: surgeries.id,
      patientId: surgeries.patientId,
      patientFirstName: patients.firstName,
      patientLastName: patients.surname,
      patientEmail: patients.email,
      patientPhone: patients.phone,
      plannedDate: surgeries.plannedDate,
      admissionTime: surgeries.admissionTime,
      surgeryRoomId: surgeries.surgeryRoomId,
      noPreOpRequired: surgeries.noPreOpRequired,
      reminderSent: surgeries.reminderSent,
    })
    .from(surgeries)
    .innerJoin(patients, eq(patients.id, surgeries.patientId))
    .where(and(
      eq(surgeries.hospitalId, hospitalId),
      sql`${surgeries.plannedDate} >= ${tomorrow}`,
      sql`${surgeries.plannedDate} < ${dayAfterTomorrow}`,
      eq(surgeries.reminderSent, false),
      sql`${surgeries.status} IN ('planned', 'in-progress')`,
      eq(surgeries.isArchived, false),
      eq(surgeries.isSuspended, false),
    ));

  return results.map(r => ({
    ...r,
    patientId: r.patientId!, // innerJoin guarantees non-null
    reminderSent: r.reminderSent ?? false,
  }));
}

export async function markSurgeryReminderSent(surgeryId: string): Promise<void> {
  await db
    .update(surgeries)
    .set({
      reminderSent: true,
      reminderSentAt: new Date(),
    })
    .where(eq(surgeries.id, surgeryId));
}

// ========== EXTERNAL WORKLOG OPERATIONS ==========

export async function getExternalWorklogLinkByToken(token: string): Promise<(ExternalWorklogLink & { unit: Unit; hospital: Hospital }) | undefined> {
  const [result] = await db
    .select()
    .from(externalWorklogLinks)
    .innerJoin(units, eq(units.id, externalWorklogLinks.unitId))
    .innerJoin(hospitals, eq(hospitals.id, externalWorklogLinks.hospitalId))
    .where(eq(externalWorklogLinks.token, token));
  
  if (!result) return undefined;
  
  return {
    ...result.external_worklog_links,
    unit: result.units,
    hospital: result.hospitals,
  };
}

export async function getExternalWorklogLinkByEmail(hospitalId: string, email: string): Promise<ExternalWorklogLink | undefined> {
  const [link] = await db
    .select()
    .from(externalWorklogLinks)
    .where(and(
      eq(externalWorklogLinks.hospitalId, hospitalId),
      eq(externalWorklogLinks.email, email.toLowerCase())
    ));
  return link;
}

export async function createExternalWorklogLink(data: InsertExternalWorklogLink): Promise<ExternalWorklogLink> {
  const [link] = await db
    .insert(externalWorklogLinks)
    .values({
      ...data,
      email: data.email.toLowerCase(),
    })
    .returning();
  return link;
}

export async function updateExternalWorklogLinkLastAccess(id: string): Promise<void> {
  await db
    .update(externalWorklogLinks)
    .set({ lastAccessedAt: new Date(), updatedAt: new Date() })
    .where(eq(externalWorklogLinks.id, id));
}

export async function getExternalWorklogEntriesByLink(linkId: string): Promise<ExternalWorklogEntry[]> {
  return await db
    .select()
    .from(externalWorklogEntries)
    .where(eq(externalWorklogEntries.linkId, linkId))
    .orderBy(desc(externalWorklogEntries.workDate));
}

export async function getExternalWorklogEntry(id: string): Promise<(ExternalWorklogEntry & { unit: Unit }) | undefined> {
  const [result] = await db
    .select()
    .from(externalWorklogEntries)
    .innerJoin(units, eq(units.id, externalWorklogEntries.unitId))
    .where(eq(externalWorklogEntries.id, id));
  
  if (!result) return undefined;
  
  return {
    ...result.external_worklog_entries,
    unit: result.units,
  };
}

export async function createExternalWorklogEntry(data: InsertExternalWorklogEntry): Promise<ExternalWorklogEntry> {
  const [entry] = await db
    .insert(externalWorklogEntries)
    .values({
      ...data,
      email: data.email.toLowerCase(),
    })
    .returning();
  return entry;
}

export async function getPendingWorklogEntries(hospitalId: string): Promise<(ExternalWorklogEntry & { unit: Unit })[]> {
  const conditions = [
    eq(externalWorklogEntries.hospitalId, hospitalId),
    eq(externalWorklogEntries.status, 'pending')
  ];

  const results = await db
    .select()
    .from(externalWorklogEntries)
    .innerJoin(units, eq(units.id, externalWorklogEntries.unitId))
    .where(and(...conditions))
    .orderBy(desc(externalWorklogEntries.workDate));
  
  return results.map(r => ({
    ...r.external_worklog_entries,
    unit: r.units,
  }));
}

export async function getAllWorklogEntries(hospitalId: string, filters?: {
  unitId?: string;
  status?: string;
  email?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<(ExternalWorklogEntry & { unit: Unit; countersigner?: User })[]> {
  const conditions = [eq(externalWorklogEntries.hospitalId, hospitalId)];
  
  if (filters?.unitId) {
    conditions.push(eq(externalWorklogEntries.unitId, filters.unitId));
  }
  if (filters?.status) {
    conditions.push(eq(externalWorklogEntries.status, filters.status as any));
  }
  if (filters?.email) {
    conditions.push(eq(externalWorklogEntries.email, filters.email.toLowerCase()));
  }
  if (filters?.dateFrom) {
    conditions.push(gte(externalWorklogEntries.workDate, filters.dateFrom));
  }
  if (filters?.dateTo) {
    conditions.push(lte(externalWorklogEntries.workDate, filters.dateTo));
  }
  
  const results = await db
    .select()
    .from(externalWorklogEntries)
    .innerJoin(units, eq(units.id, externalWorklogEntries.unitId))
    .leftJoin(users, eq(users.id, externalWorklogEntries.countersignedBy))
    .where(and(...conditions))
    .orderBy(desc(externalWorklogEntries.workDate));
  
  return results.map(r => ({
    ...r.external_worklog_entries,
    unit: r.units,
    countersigner: r.users || undefined,
  }));
}

export async function countersignWorklogEntry(id: string, userId: string, signature: string, signerName: string): Promise<ExternalWorklogEntry> {
  const [updated] = await db
    .update(externalWorklogEntries)
    .set({
      status: 'countersigned',
      countersignature: signature,
      countersignedAt: new Date(),
      countersignedBy: userId,
      countersignerName: signerName,
      updatedAt: new Date(),
    })
    .where(eq(externalWorklogEntries.id, id))
    .returning();
  return updated;
}

export async function rejectWorklogEntry(id: string, userId: string, reason: string, signerName: string): Promise<ExternalWorklogEntry> {
  const [updated] = await db
    .update(externalWorklogEntries)
    .set({
      status: 'rejected',
      countersignedBy: userId,
      countersignerName: signerName,
      rejectionReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(externalWorklogEntries.id, id))
    .returning();
  return updated;
}

export async function getWorklogLinksByHospital(hospitalId: string): Promise<(ExternalWorklogLink & { unitName: string })[]> {
  const results = await db
    .select()
    .from(externalWorklogLinks)
    .innerJoin(units, eq(units.id, externalWorklogLinks.unitId))
    .where(eq(externalWorklogLinks.hospitalId, hospitalId))
    .orderBy(desc(externalWorklogLinks.createdAt));
  return results.map(r => ({
    ...r.external_worklog_links,
    unitName: r.units.name,
  }));
}

export async function getExternalWorklogLink(id: string): Promise<ExternalWorklogLink | undefined> {
  const [link] = await db
    .select()
    .from(externalWorklogLinks)
    .where(eq(externalWorklogLinks.id, id));
  return link;
}

export async function deleteExternalWorklogLink(id: string): Promise<void> {
  await db.delete(externalWorklogLinks).where(eq(externalWorklogLinks.id, id));
}

export async function getWorklogWorkers(hospitalId: string): Promise<{ email: string; firstName: string; lastName: string }[]> {
  const rows = await db
    .select({
      email: externalWorklogLinks.email,
      firstName: externalWorklogLinks.firstName,
      lastName: externalWorklogLinks.lastName,
    })
    .from(externalWorklogLinks)
    .where(eq(externalWorklogLinks.hospitalId, hospitalId))
    .orderBy(asc(externalWorklogLinks.lastName), asc(externalWorklogLinks.firstName));

  // Deduplicate by lowercase email (a worker may have links in multiple units)
  const seen = new Set<string>();
  return rows.reduce<{ email: string; firstName: string; lastName: string }[]>((acc, r) => {
    const key = r.email.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      acc.push({ email: r.email, firstName: r.firstName || '', lastName: r.lastName || '' });
    }
    return acc;
  }, []);
}

// ========== EXTERNAL SURGERY REQUESTS ==========

export async function getExternalSurgeryRequests(hospitalId: string, status?: string): Promise<ExternalSurgeryRequest[]> {
  if (status) {
    return await db
      .select()
      .from(externalSurgeryRequests)
      .where(and(
        eq(externalSurgeryRequests.hospitalId, hospitalId),
        eq(externalSurgeryRequests.status, status as typeof externalSurgeryRequests.status._.data)
      ))
      .orderBy(desc(externalSurgeryRequests.createdAt));
  }
  return await db
    .select()
    .from(externalSurgeryRequests)
    .where(eq(externalSurgeryRequests.hospitalId, hospitalId))
    .orderBy(desc(externalSurgeryRequests.createdAt));
}

export async function getExternalSurgeryRequest(id: string): Promise<ExternalSurgeryRequest | undefined> {
  const [request] = await db
    .select()
    .from(externalSurgeryRequests)
    .where(eq(externalSurgeryRequests.id, id));
  return request;
}

export async function getExternalSurgeryRequestByHospitalToken(token: string): Promise<{ hospital: Hospital } | undefined> {
  const [hospital] = await db
    .select()
    .from(hospitals)
    .where(eq(hospitals.externalSurgeryToken, token));
  if (!hospital) return undefined;
  return { hospital };
}

export async function createExternalSurgeryRequest(request: InsertExternalSurgeryRequest): Promise<ExternalSurgeryRequest> {
  const [created] = await db
    .insert(externalSurgeryRequests)
    .values(request)
    .returning();
  return created;
}

export async function updateExternalSurgeryRequest(id: string, updates: Partial<ExternalSurgeryRequest>): Promise<ExternalSurgeryRequest> {
  const [updated] = await db
    .update(externalSurgeryRequests)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(externalSurgeryRequests.id, id))
    .returning();
  return updated;
}

export async function getExternalSurgeryRequestDocuments(requestId: string): Promise<ExternalSurgeryRequestDocument[]> {
  return await db
    .select()
    .from(externalSurgeryRequestDocuments)
    .where(eq(externalSurgeryRequestDocuments.requestId, requestId))
    .orderBy(asc(externalSurgeryRequestDocuments.createdAt));
}

export async function createExternalSurgeryRequestDocument(doc: InsertExternalSurgeryRequestDocument): Promise<ExternalSurgeryRequestDocument> {
  const [created] = await db
    .insert(externalSurgeryRequestDocuments)
    .values(doc)
    .returning();
  return created;
}

export async function getPendingExternalSurgeryRequestsCount(hospitalId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(externalSurgeryRequests)
    .where(and(
      eq(externalSurgeryRequests.hospitalId, hospitalId),
      eq(externalSurgeryRequests.status, 'pending')
    ));
  return result[0]?.count || 0;
}
