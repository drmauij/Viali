import { db } from "../db";
import { 
  clinicAppointments, 
  surgeries, 
  patients,
  users,
  calcomProviderMappings,
  calcomConfig,
  type CalcomProviderMapping,
  type CalcomConfig,
} from "@shared/schema";
import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import { createCalcomClient, type CalcomClient, type CalcomBooking } from "./calcomClient";
import logger from "../logger";

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

async function getCalcomClientForHospital(hospitalId: string): Promise<{ client: CalcomClient; config: CalcomConfig } | null> {
  const [config] = await db
    .select()
    .from(calcomConfig)
    .where(eq(calcomConfig.hospitalId, hospitalId));

  if (!config?.isEnabled || !config.apiKey) {
    return null;
  }

  return {
    client: createCalcomClient(config.apiKey),
    config,
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

export async function syncAppointmentsToCalcom(hospitalId: string, providerId?: string): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, errors: [], details: [] };
  
  const calcomSetup = await getCalcomClientForHospital(hospitalId);
  if (!calcomSetup) {
    result.errors.push("Cal.com is not configured or enabled for this hospital");
    return result;
  }

  const { client, config } = calcomSetup;

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
      const startDateTime = `${apt.appointmentDate}T${apt.startTime}:00`;
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
        }
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

  const { client, config } = calcomSetup;

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
      const patientName = [surgery.patientFirstName, surgery.patientSurname].filter(Boolean).join(' ') || 'Patient';
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
        }
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
    const startDateTime = `${apt.appointmentDate}T${apt.startTime}:00`;
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
      }
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
      }
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

    return { success: true, calcomUid: syncResult.uid };
  } catch (error: any) {
    return { success: false, error: error.message };
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

export const calcomSyncService: CalcomSyncService = {
  syncAppointmentsToCalcom,
  syncSurgeriesToCalcom,
  syncSingleAppointment,
  syncSingleSurgery,
  deleteCalcomBlock,
  fullSync,
};
