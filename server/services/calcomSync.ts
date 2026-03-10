import { db } from "../db";
import {
  clinicAppointments,
  surgeries,
  surgeryAssistants,
  patients,
  users,
  calcomProviderMappings,
  calcomConfig,
  providerAvailability,
  providerAvailabilityWindows,
  type CalcomProviderMapping,
  type CalcomConfig,
} from "@shared/schema";
import { eq, and, gte, lte, sql, inArray, isNull } from "drizzle-orm";
import { createCalcomClient, type CalcomClient, type CalcomBooking, type CalcomScheduleAvailability, type CalcomScheduleOverride } from "./calcomClient";
import { updateAssistantCalcomUid } from "../storage/anesthesia";
import logger from "../logger";

/**
 * Convert a local date + time (e.g. "2026-03-11" + "10:00" in Europe/Zurich)
 * to a UTC ISO string (e.g. "2026-03-11T09:00:00Z") as required by Cal.com API.
 */
function localTimeToUtcIso(dateStr: string, timeStr: string, timezone: string): string {
  // Build a reference point at noon UTC on that date to compute TZ offset
  const refDate = new Date(`${dateStr}T12:00:00Z`);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const utcFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const tzParts = formatter.formatToParts(refDate);
  const utcParts = utcFormatter.formatToParts(refDate);
  const getVal = (parts: Intl.DateTimeFormatPart[], type: string) =>
    parseInt(parts.find(p => p.type === type)?.value || '0', 10);

  const offsetHours = getVal(tzParts, 'hour') - getVal(utcParts, 'hour');

  const [h, m] = timeStr.split(':').map(Number);
  const utcH = h - offsetHours;
  // Handle day rollover
  const utcDate = new Date(`${dateStr}T${String(utcH).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
  return utcDate.toISOString();
}

export interface SyncResult {
  synced: number;
  errors: string[];
  details: Array<{
    type: 'appointment' | 'surgery';
    id: string;
    action: 'created' | 'updated' | 'deleted' | 'skipped' | 'unchanged';
    calcomUid?: string;
    error?: string;
  }>;
}

export interface CalcomSyncService {
  syncAppointmentsToCalcom(hospitalId: string, providerId?: string): Promise<SyncResult>;
  syncSurgeriesToCalcom(hospitalId: string, surgeonId?: string): Promise<SyncResult>;
  syncSingleAppointment(appointmentId: string): Promise<{ success: boolean; calcomUid?: string; error?: string }>;
  syncSingleSurgery(surgeryId: string): Promise<{ success: boolean; calcomUid?: string; error?: string }>;
  deleteCalcomBlock(bookingUid: string, hospitalId: string): Promise<boolean>;
  fullSync(hospitalId: string): Promise<{ appointments: SyncResult; surgeries: SyncResult }>;
}

async function getCalcomClientForHospital(hospitalId: string): Promise<{ client: CalcomClient; config: CalcomConfig; timezone: string } | null> {
  const [config] = await db
    .select()
    .from(calcomConfig)
    .where(eq(calcomConfig.hospitalId, hospitalId));

  if (!config?.isEnabled || !config.apiKey) {
    return null;
  }

  // Fetch hospital timezone
  const { hospitals } = await import("@shared/schema");
  const [hospital] = await db.select({ timezone: hospitals.timezone }).from(hospitals).where(eq(hospitals.id, hospitalId));
  const timezone = hospital?.timezone || 'Europe/Zurich';

  return {
    client: createCalcomClient(config.apiKey),
    config,
    timezone,
  };
}

async function getProviderMappings(hospitalId: string, providerId?: string): Promise<CalcomProviderMapping[]> {
  const conditions = [
    eq(calcomProviderMappings.hospitalId, hospitalId),
    eq(calcomProviderMappings.isEnabled, true),
  ];
  
  if (providerId) {
    conditions.push(eq(calcomProviderMappings.providerId, providerId));
  }

  return db
    .select()
    .from(calcomProviderMappings)
    .where(and(...conditions));
}

const DAY_NAMES: Record<number, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

export async function syncAvailabilityToCalcom(
  hospitalId: string,
  providerId: string
): Promise<{ success: boolean; scheduleId?: number; error?: string }> {
  try {
    const calcomSetup = await getCalcomClientForHospital(hospitalId);
    if (!calcomSetup) {
      return { success: false, error: 'Cal.com not configured or enabled' };
    }

    const { client, config, timezone: hospitalTz } = calcomSetup;
    if (!(config as any).syncAvailability) {
      return { success: false, error: 'Availability sync disabled' };
    }

    // Detect account type (organization vs personal) and get default schedule ID
    let orgId = (config as any).orgId ? parseInt((config as any).orgId, 10) : null;
    let isPersonalAccount = false;
    let defaultScheduleId: number | null = null;
    if (!orgId) {
      try {
        const me = await client.getMe();
        if (me.organizationId) {
          orgId = me.organizationId;
          await db
            .update(calcomConfig)
            .set({ orgId: String(orgId) } as any)
            .where(eq(calcomConfig.hospitalId, hospitalId));
        } else {
          isPersonalAccount = true;
          defaultScheduleId = (me as any).defaultScheduleId || null;
          logger.info(`Cal.com personal account (userId=${me.id}, defaultScheduleId=${defaultScheduleId})`);
        }
      } catch (err: any) {
        logger.warn(`Failed to detect Cal.com account type: ${err.message}`);
        isPersonalAccount = true;
      }
    }

    // Get provider mapping
    const [mapping] = await db
      .select()
      .from(calcomProviderMappings)
      .where(
        and(
          eq(calcomProviderMappings.hospitalId, hospitalId),
          eq(calcomProviderMappings.providerId, providerId),
          eq(calcomProviderMappings.isEnabled, true)
        )
      );

    if (!mapping) {
      return { success: false, error: 'No Cal.com mapping for provider' };
    }

    // For org accounts, calcomUserId is required. For personal accounts, it's optional.
    const calcomUserId = mapping.calcomUserId ? parseInt(mapping.calcomUserId, 10) : null;
    if (!isPersonalAccount && !calcomUserId) {
      return { success: false, error: 'No Cal.com user ID configured for provider (required for organization accounts)' };
    }

    // Read provider availability from DB (hospital-level only, not unit-specific)
    const availRows = await db
      .select()
      .from(providerAvailability)
      .where(
        and(
          eq(providerAvailability.providerId, providerId),
          eq(providerAvailability.hospitalId, hospitalId),
          eq(providerAvailability.isActive, true),
          isNull(providerAvailability.unitId)
        )
      );

    // Group time slots by startTime+endTime for compact Cal.com format
    const slotGroups = new Map<string, string[]>();
    for (const row of availRows) {
      const key = `${row.startTime}-${row.endTime}`;
      const dayName = DAY_NAMES[row.dayOfWeek];
      if (!dayName) continue;
      if (!slotGroups.has(key)) {
        slotGroups.set(key, []);
      }
      slotGroups.get(key)!.push(dayName);
    }

    const availability: CalcomScheduleAvailability[] = [];
    for (const [key, days] of slotGroups) {
      const [startTime, endTime] = key.split('-');
      availability.push({ days, startTime, endTime });
    }

    // Read date-specific windows as overrides (next 3 months)
    const now = new Date();
    const threeMonthsLater = new Date();
    threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

    const windowRows = await db
      .select()
      .from(providerAvailabilityWindows)
      .where(
        and(
          eq(providerAvailabilityWindows.providerId, providerId),
          eq(providerAvailabilityWindows.hospitalId, hospitalId),
          isNull(providerAvailabilityWindows.unitId),
          gte(providerAvailabilityWindows.date, now.toISOString().split('T')[0]),
          lte(providerAvailabilityWindows.date, threeMonthsLater.toISOString().split('T')[0])
        )
      );

    const overrides: CalcomScheduleOverride[] = windowRows.map((w) => ({
      date: typeof w.date === 'string' ? w.date : new Date(w.date).toISOString().split('T')[0],
      startTime: w.startTime,
      endTime: w.endTime,
    }));

    // Each provider gets their own schedule in Cal.com.
    // If we already synced this provider before, update their stored schedule.
    // Otherwise, create a new schedule for this provider.
    const existingScheduleId = mapping.calcomScheduleId
      ? parseInt(mapping.calcomScheduleId, 10)
      : null;

    let scheduleId: number = 0;

    // Get provider name for schedule label
    const [provider] = await db
      .select({ firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.id, providerId));
    const providerName = provider
      ? `${provider.firstName || ''} ${provider.lastName || ''}`.trim()
      : 'Provider';

    let needsCreate = !existingScheduleId;

    if (existingScheduleId) {
      // Try to update existing schedule; if it was deleted (404), fall back to create
      try {
        if (isPersonalAccount) {
          const updated = await client.updateSchedule(existingScheduleId, {
            availability,
            overrides,
            timeZone: hospitalTz,
          });
          scheduleId = updated.id;
        } else {
          const updated = await client.updateOrgUserSchedule(
            orgId!,
            calcomUserId!,
            existingScheduleId,
            {
              availability,
              overrides,
              timeZone: hospitalTz,
            }
          );
          scheduleId = updated.id;
        }
        logger.info(`Updated Cal.com schedule ${scheduleId} for provider ${providerId}`);
      } catch (updateError: any) {
        if (updateError.message?.includes('404') || updateError.message?.includes('does not exist')) {
          logger.warn(`Cal.com schedule ${existingScheduleId} no longer exists, creating new one`);
          needsCreate = true;
        } else {
          throw updateError;
        }
      }
    }

    if (needsCreate) {
      // Create a new schedule for this provider (not default — user assigns via Cal.com UI)
      if (isPersonalAccount) {
        const created = await client.createSchedule({
          name: `Viali - ${providerName}`,
          timeZone: hospitalTz,
          isDefault: false,
          availability,
          overrides,
        });
        scheduleId = created.id;
      } else {
        const created = await client.createOrgUserSchedule(orgId!, calcomUserId!, {
          name: `Viali - ${providerName}`,
          timeZone: hospitalTz,
          isDefault: false,
          availability,
          overrides,
        });
        scheduleId = created.id;
      }

      // Store schedule ID in mapping for future updates
      await db
        .update(calcomProviderMappings)
        .set({ calcomScheduleId: String(scheduleId) })
        .where(eq(calcomProviderMappings.id, mapping.id));

      logger.info(`Created Cal.com schedule ${scheduleId} ("Viali - ${providerName}") for provider ${providerId}`);
    }

    // Update sync timestamp
    await db
      .update(calcomProviderMappings)
      .set({ lastSyncAt: new Date(), lastSyncError: null })
      .where(eq(calcomProviderMappings.id, mapping.id));

    logger.info(`Synced availability to Cal.com for provider ${providerId}, scheduleId=${scheduleId}`);
    return { success: true, scheduleId };
  } catch (error: any) {
    logger.error(`Failed to sync availability to Cal.com for provider ${providerId}:`, error);

    // Store error on mapping if possible
    try {
      await db
        .update(calcomProviderMappings)
        .set({ lastSyncError: error.message })
        .where(
          and(
            eq(calcomProviderMappings.hospitalId, hospitalId),
            eq(calcomProviderMappings.providerId, providerId)
          )
        );
    } catch (_) {
      // ignore
    }

    return { success: false, error: error.message };
  }
}

export async function syncAppointmentsToCalcom(hospitalId: string, providerId?: string): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, errors: [], details: [] };

  const calcomSetup = await getCalcomClientForHospital(hospitalId);
  if (!calcomSetup) {
    result.errors.push("Cal.com is not configured or enabled for this hospital");
    return result;
  }

  const { client, config, timezone: hospitalTz } = calcomSetup;

  if (!config.syncBusyBlocks) {
    result.errors.push("Busy block sync is disabled in configuration");
    return result;
  }

  const mappings = await getProviderMappings(hospitalId, providerId);
  if (mappings.length === 0) {
    result.errors.push("No enabled provider mappings found");
    return result;
  }

  const providerIds = mappings.map(m => m.providerId);
  const mappingByProvider = new Map(mappings.map(m => [m.providerId, m]));

  const now = new Date();
  const threeMonthsLater = new Date();
  threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

  const appointments = await db
    .select({
      id: clinicAppointments.id,
      providerId: clinicAppointments.providerId,
      patientId: clinicAppointments.patientId,
      appointmentDate: clinicAppointments.appointmentDate,
      startTime: clinicAppointments.startTime,
      endTime: clinicAppointments.endTime,
      notes: clinicAppointments.notes,
      status: clinicAppointments.status,
      calcomBookingUid: clinicAppointments.calcomBookingUid,
      patientFirstName: patients.firstName,
      patientSurname: patients.surname,
    })
    .from(clinicAppointments)
    .leftJoin(patients, eq(clinicAppointments.patientId, patients.id))
    .where(
      and(
        inArray(clinicAppointments.providerId, providerIds),
        gte(clinicAppointments.appointmentDate, now.toISOString().split('T')[0]),
        lte(clinicAppointments.appointmentDate, threeMonthsLater.toISOString().split('T')[0]),
        sql`${clinicAppointments.status} NOT IN ('cancelled', 'no_show')`
      )
    );

  for (const apt of appointments) {
    const mapping = mappingByProvider.get(apt.providerId!);
    if (!mapping?.calcomEventTypeId) {
      result.details.push({
        type: 'appointment',
        id: apt.id,
        action: 'skipped',
        error: 'No event type ID configured for provider',
      });
      continue;
    }

    try {
      const startDateTime = localTimeToUtcIso(apt.appointmentDate, apt.startTime, hospitalTz);
      const patientName = [apt.patientFirstName, apt.patientSurname].filter(Boolean).join(' ') || 'Patient';
      const title = `Appointment: ${patientName}`;

      const syncResult = await client.syncBusyBlock(
        parseInt(mapping.calcomEventTypeId, 10),
        apt.calcomBookingUid,
        startDateTime,
        title,
        {
          sourceType: 'appointment',
          sourceId: apt.id,
          hospitalId,
          patientName,
        },
        hospitalTz,
      );

      if (syncResult.action !== 'unchanged' && syncResult.uid !== apt.calcomBookingUid) {
        await db
          .update(clinicAppointments)
          .set({ 
            calcomBookingUid: syncResult.uid,
            calcomSyncedAt: new Date(),
          })
          .where(eq(clinicAppointments.id, apt.id));
      } else if (syncResult.action !== 'unchanged') {
        await db
          .update(clinicAppointments)
          .set({ calcomSyncedAt: new Date() })
          .where(eq(clinicAppointments.id, apt.id));
      }

      result.details.push({
        type: 'appointment',
        id: apt.id,
        action: syncResult.action,
        calcomUid: syncResult.uid,
      });

      if (syncResult.action !== 'unchanged') {
        result.synced++;
      }
    } catch (error: any) {
      result.errors.push(`Appointment ${apt.id}: ${error.message}`);
      result.details.push({
        type: 'appointment',
        id: apt.id,
        action: 'skipped',
        error: error.message,
      });
    }
  }

  return result;
}

export async function syncSurgeriesToCalcom(hospitalId: string, surgeonId?: string): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, errors: [], details: [] };

  const calcomSetup = await getCalcomClientForHospital(hospitalId);
  if (!calcomSetup) {
    result.errors.push("Cal.com is not configured or enabled for this hospital");
    return result;
  }

  const { client, config, timezone: hospitalTz } = calcomSetup;

  if (!config.syncBusyBlocks) {
    result.errors.push("Busy block sync is disabled in configuration");
    return result;
  }

  const mappings = await getProviderMappings(hospitalId, surgeonId);
  if (mappings.length === 0) {
    result.errors.push("No enabled provider mappings found");
    return result;
  }

  const providerIds = mappings.map(m => m.providerId);
  const mappingByProvider = new Map(mappings.map(m => [m.providerId, m]));

  const now = new Date();
  const threeMonthsLater = new Date();
  threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

  const surgeryList = await db
    .select({
      id: surgeries.id,
      surgeonId: surgeries.surgeonId,
      patientId: surgeries.patientId,
      plannedDate: surgeries.plannedDate,
      plannedSurgery: surgeries.plannedSurgery,
      status: surgeries.status,
      calcomBusyBlockUid: surgeries.calcomBusyBlockUid,
      patientFirstName: patients.firstName,
      patientSurname: patients.surname,
    })
    .from(surgeries)
    .leftJoin(patients, eq(surgeries.patientId, patients.id))
    .where(
      and(
        inArray(surgeries.surgeonId, providerIds),
        gte(surgeries.plannedDate, now),
        lte(surgeries.plannedDate, threeMonthsLater),
        sql`${surgeries.status} NOT IN ('cancelled', 'completed')`
      )
    );

  for (const surgery of surgeryList) {
    const mapping = mappingByProvider.get(surgery.surgeonId!);
    if (!mapping?.calcomEventTypeId) {
      result.details.push({
        type: 'surgery',
        id: surgery.id,
        action: 'skipped',
        error: 'No event type ID configured for surgeon',
      });
      continue;
    }

    try {
      const startDateTime = surgery.plannedDate?.toISOString() || new Date().toISOString();
      const patientName = [surgery.patientFirstName, surgery.patientSurname].filter(Boolean).join(' ') || (surgery.patientId ? 'Patient' : 'Slot Reserved');
      const title = `Surgery: ${surgery.plannedSurgery || 'Procedure'} - ${patientName}`;

      const syncResult = await client.syncBusyBlock(
        parseInt(mapping.calcomEventTypeId, 10),
        surgery.calcomBusyBlockUid,
        startDateTime,
        title,
        {
          sourceType: 'surgery',
          sourceId: surgery.id,
          hospitalId,
          patientName,
        },
        hospitalTz,
      );

      if (syncResult.action !== 'unchanged' && syncResult.uid !== surgery.calcomBusyBlockUid) {
        await db
          .update(surgeries)
          .set({ 
            calcomBusyBlockUid: syncResult.uid,
            calcomSyncedAt: new Date(),
          })
          .where(eq(surgeries.id, surgery.id));
      } else if (syncResult.action !== 'unchanged') {
        await db
          .update(surgeries)
          .set({ calcomSyncedAt: new Date() })
          .where(eq(surgeries.id, surgery.id));
      }

      result.details.push({
        type: 'surgery',
        id: surgery.id,
        action: syncResult.action,
        calcomUid: syncResult.uid,
      });

      if (syncResult.action !== 'unchanged') {
        result.synced++;
      }
    } catch (error: any) {
      result.errors.push(`Surgery ${surgery.id}: ${error.message}`);
      result.details.push({
        type: 'surgery',
        id: surgery.id,
        action: 'skipped',
        error: error.message,
      });
    }
  }

  return result;
}

export async function syncSingleAppointment(appointmentId: string): Promise<{ success: boolean; calcomUid?: string; error?: string }> {
  const [apt] = await db
    .select({
      id: clinicAppointments.id,
      hospitalId: clinicAppointments.hospitalId,
      providerId: clinicAppointments.providerId,
      appointmentDate: clinicAppointments.appointmentDate,
      startTime: clinicAppointments.startTime,
      notes: clinicAppointments.notes,
      status: clinicAppointments.status,
      calcomBookingUid: clinicAppointments.calcomBookingUid,
      patientFirstName: patients.firstName,
      patientSurname: patients.surname,
    })
    .from(clinicAppointments)
    .leftJoin(patients, eq(clinicAppointments.patientId, patients.id))
    .where(eq(clinicAppointments.id, appointmentId));

  if (!apt) {
    return { success: false, error: 'Appointment not found' };
  }

  if (['cancelled', 'no_show'].includes(apt.status || '')) {
    if (apt.calcomBookingUid) {
      try {
        const calcomSetup = await getCalcomClientForHospital(apt.hospitalId!);
        if (calcomSetup) {
          await calcomSetup.client.deleteBusyBlock(apt.calcomBookingUid);
          await db
            .update(clinicAppointments)
            .set({ calcomBookingUid: null, calcomSyncedAt: new Date() })
            .where(eq(clinicAppointments.id, appointmentId));
        }
      } catch (error: any) {
        logger.error(`Failed to delete Cal.com block for cancelled appointment ${appointmentId}:`, error);
      }
    }
    return { success: true, calcomUid: undefined };
  }

  const calcomSetup = await getCalcomClientForHospital(apt.hospitalId!);
  if (!calcomSetup) {
    return { success: false, error: 'Cal.com not configured' };
  }

  const [mapping] = await db
    .select()
    .from(calcomProviderMappings)
    .where(
      and(
        eq(calcomProviderMappings.hospitalId, apt.hospitalId!),
        eq(calcomProviderMappings.providerId, apt.providerId!),
        eq(calcomProviderMappings.isEnabled, true)
      )
    );

  if (!mapping?.calcomEventTypeId) {
    return { success: false, error: 'No Cal.com mapping for provider' };
  }

  try {
    const startDateTime = localTimeToUtcIso(apt.appointmentDate, apt.startTime, calcomSetup.timezone);
    const patientName = [apt.patientFirstName, apt.patientSurname].filter(Boolean).join(' ') || 'Patient';
    const title = `Appointment: ${patientName}`;

    const syncResult = await calcomSetup.client.syncBusyBlock(
      parseInt(mapping.calcomEventTypeId, 10),
      apt.calcomBookingUid,
      startDateTime,
      title,
      {
        sourceType: 'appointment',
        sourceId: apt.id,
        hospitalId: apt.hospitalId!,
        patientName,
      },
      calcomSetup.timezone,
    );

    if (syncResult.uid !== apt.calcomBookingUid || syncResult.action !== 'unchanged') {
      await db
        .update(clinicAppointments)
        .set({ 
          calcomBookingUid: syncResult.uid,
          calcomSyncedAt: new Date(),
        })
        .where(eq(clinicAppointments.id, appointmentId));
    }

    return { success: true, calcomUid: syncResult.uid };
  } catch (error: any) {
    // Cal.com returns 400 when the slot is already blocked — treat as success
    if (error.message?.includes('already has booking') || error.message?.includes('is not available')) {
      logger.info(`Appointment ${appointmentId} slot already blocked in Cal.com, treating as success`);
      return { success: true, calcomUid: apt.calcomBookingUid || undefined, error: 'Already blocked in Cal.com' };
    }
    return { success: false, error: error.message };
  }
}

export async function syncSingleSurgery(surgeryId: string): Promise<{ success: boolean; calcomUid?: string; error?: string }> {
  const [surgery] = await db
    .select({
      id: surgeries.id,
      hospitalId: surgeries.hospitalId,
      surgeonId: surgeries.surgeonId,
      plannedDate: surgeries.plannedDate,
      plannedSurgery: surgeries.plannedSurgery,
      status: surgeries.status,
      calcomBusyBlockUid: surgeries.calcomBusyBlockUid,
      patientFirstName: patients.firstName,
      patientSurname: patients.surname,
    })
    .from(surgeries)
    .leftJoin(patients, eq(surgeries.patientId, patients.id))
    .where(eq(surgeries.id, surgeryId));

  if (!surgery) {
    return { success: false, error: 'Surgery not found' };
  }

  if (['cancelled', 'completed'].includes(surgery.status || '')) {
    if (surgery.calcomBusyBlockUid) {
      try {
        const calcomSetup = await getCalcomClientForHospital(surgery.hospitalId!);
        if (calcomSetup) {
          await calcomSetup.client.deleteBusyBlock(surgery.calcomBusyBlockUid);
          await db
            .update(surgeries)
            .set({ calcomBusyBlockUid: null, calcomSyncedAt: new Date() })
            .where(eq(surgeries.id, surgeryId));
        }
      } catch (error: any) {
        logger.error(`Failed to delete Cal.com block for cancelled/completed surgery ${surgeryId}:`, error);
      }
    }
    // Also clean up assistant blocks
    const patientName = [surgery.patientFirstName, surgery.patientSurname].filter(Boolean).join(' ') || 'Patient';
    await syncAssistantsForSurgery(surgery, patientName);
    return { success: true, calcomUid: undefined };
  }

  const calcomSetup = await getCalcomClientForHospital(surgery.hospitalId!);
  if (!calcomSetup) {
    return { success: false, error: 'Cal.com not configured' };
  }

  const [mapping] = await db
    .select()
    .from(calcomProviderMappings)
    .where(
      and(
        eq(calcomProviderMappings.hospitalId, surgery.hospitalId!),
        eq(calcomProviderMappings.providerId, surgery.surgeonId!),
        eq(calcomProviderMappings.isEnabled, true)
      )
    );

  if (!mapping?.calcomEventTypeId) {
    return { success: false, error: 'No Cal.com mapping for surgeon' };
  }

  try {
    const startDateTime = surgery.plannedDate?.toISOString() || new Date().toISOString();
    const patientName = [surgery.patientFirstName, surgery.patientSurname].filter(Boolean).join(' ') || 'Patient';
    const title = `Surgery: ${surgery.plannedSurgery || 'Procedure'} - ${patientName}`;

    const syncResult = await calcomSetup.client.syncBusyBlock(
      parseInt(mapping.calcomEventTypeId, 10),
      surgery.calcomBusyBlockUid,
      startDateTime,
      title,
      {
        sourceType: 'surgery',
        sourceId: surgery.id,
        hospitalId: surgery.hospitalId!,
        patientName,
      },
      calcomSetup.timezone,
    );

    if (syncResult.uid !== surgery.calcomBusyBlockUid || syncResult.action !== 'unchanged') {
      await db
        .update(surgeries)
        .set({
          calcomBusyBlockUid: syncResult.uid,
          calcomSyncedAt: new Date(),
        })
        .where(eq(surgeries.id, surgeryId));
    }

    // Sync assistant Cal.com blocks
    await syncAssistantsForSurgery(surgery, patientName);

    return { success: true, calcomUid: syncResult.uid };
  } catch (error: any) {
    // Cal.com returns 400 when the slot is already blocked — treat as success
    if (error.message?.includes('already has booking') || error.message?.includes('is not available')) {
      logger.info(`Surgery ${surgeryId} slot already blocked in Cal.com, treating as success`);
      return { success: true, calcomUid: surgery.calcomBusyBlockUid || undefined, error: 'Already blocked in Cal.com' };
    }
    return { success: false, error: error.message };
  }
}

async function syncAssistantsForSurgery(
  surgery: { id: string; hospitalId: string | null; plannedDate: Date | null; plannedSurgery: string | null; status: string | null },
  patientName: string
): Promise<void> {
  const assistants = await db
    .select({
      userId: surgeryAssistants.userId,
      calcomBusyBlockUid: surgeryAssistants.calcomBusyBlockUid,
    })
    .from(surgeryAssistants)
    .where(eq(surgeryAssistants.surgeryId, surgery.id));

  if (assistants.length === 0) return;

  const isCancelled = ['cancelled', 'completed'].includes(surgery.status || '');
  const calcomSetup = surgery.hospitalId ? await getCalcomClientForHospital(surgery.hospitalId) : null;
  if (!calcomSetup) return;

  for (const assistant of assistants) {
    try {
      if (isCancelled) {
        if (assistant.calcomBusyBlockUid) {
          await calcomSetup.client.deleteBusyBlock(assistant.calcomBusyBlockUid);
          await updateAssistantCalcomUid(surgery.id, assistant.userId, null);
        }
        continue;
      }

      const [mapping] = await db
        .select()
        .from(calcomProviderMappings)
        .where(and(
          eq(calcomProviderMappings.hospitalId, surgery.hospitalId!),
          eq(calcomProviderMappings.providerId, assistant.userId),
          eq(calcomProviderMappings.isEnabled, true)
        ));

      if (!mapping?.calcomEventTypeId) continue;

      const startDateTime = surgery.plannedDate?.toISOString() || new Date().toISOString();
      const title = `Surgery (Assistant): ${surgery.plannedSurgery || 'Procedure'} - ${patientName}`;

      const syncResult = await calcomSetup.client.syncBusyBlock(
        parseInt(mapping.calcomEventTypeId, 10),
        assistant.calcomBusyBlockUid,
        startDateTime,
        title,
        { sourceType: 'surgery', sourceId: surgery.id, hospitalId: surgery.hospitalId!, patientName },
        calcomSetup.timezone,
      );

      if (syncResult.uid !== assistant.calcomBusyBlockUid) {
        await updateAssistantCalcomUid(surgery.id, assistant.userId, syncResult.uid);
      }
    } catch (err) {
      logger.error(`Failed to sync Cal.com block for assistant ${assistant.userId} on surgery ${surgery.id}:`, err);
    }
  }
}

export async function deleteCalcomBlock(bookingUid: string, hospitalId: string): Promise<boolean> {
  try {
    const calcomSetup = await getCalcomClientForHospital(hospitalId);
    if (!calcomSetup) {
      return false;
    }
    
    await calcomSetup.client.deleteBusyBlock(bookingUid);
    return true;
  } catch (error: any) {
    logger.error(`Failed to delete Cal.com block ${bookingUid}:`, error);
    return false;
  }
}

export async function fullSync(hospitalId: string): Promise<{ appointments: SyncResult; surgeries: SyncResult }> {
  const [appointmentResult, surgeryResult] = await Promise.all([
    syncAppointmentsToCalcom(hospitalId),
    syncSurgeriesToCalcom(hospitalId),
  ]);

  return {
    appointments: appointmentResult,
    surgeries: surgeryResult,
  };
}

export const calcomSyncService: CalcomSyncService & { syncAvailabilityToCalcom: typeof syncAvailabilityToCalcom } = {
  syncAppointmentsToCalcom,
  syncSurgeriesToCalcom,
  syncSingleAppointment,
  syncSingleSurgery,
  deleteCalcomBlock,
  fullSync,
  syncAvailabilityToCalcom,
};
