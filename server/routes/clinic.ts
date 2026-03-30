import { Router } from "express";
import type { Response } from "express";
import { storage, db } from "../storage";
import { isAuthenticated } from "../auth/google";
import { requireWriteAccess, requireStrictHospitalAccess } from "../utils";
import { 
  clinicInvoices, 
  clinicInvoiceItems,
  clinicServices,
  insertClinicInvoiceSchema,
  insertClinicInvoiceItemSchema,
  insertClinicServiceSchema,
  patients,
  items,
  itemCodes,
  units,
  hospitals,
  ProviderTimeOff,
  clinicDayNotes,
} from "@shared/schema";
import { eq, and, desc, sql, max, inArray, or, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { expandRecurringTimeOff, type ExpandedTimeOff } from "../utils/timeoff";
// Cal.com integration is legacy — booking is now native via /book

// Cal.com sync removed — booking is now handled natively via /book

// Helper to get calendar scope based on unit's hasOwnCalendar setting
// Returns { unitId: string | null, hospitalId: string }
// If unit has own calendar: unitId is the actual unit ID, hospitalId is used for context
// If unit shares hospital calendar: unitId is null, hospitalId is used for queries
async function getCalendarScope(unitId: string, hospitalId: string): Promise<{ 
  effectiveUnitId: string | null; 
  effectiveHospitalId: string;
  hasOwnCalendar: boolean;
}> {
  const unit = await storage.getUnit(unitId);
  const hasOwnCalendar = unit?.hasOwnCalendar ?? false;
  
  return {
    effectiveUnitId: hasOwnCalendar ? unitId : null,
    effectiveHospitalId: hospitalId,
    hasOwnCalendar,
  };
}

const router = Router();


// ========================================
// Public (unauthenticated) endpoints — appointment cancel by token
// ========================================

// Get appointment info for cancel confirmation page
router.get('/api/clinic/appointments/cancel-info/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const tokenData = await storage.getAppointmentActionToken(token);

    if (!tokenData) {
      return res.status(404).json({ message: 'Token not found' });
    }

    if (tokenData.used) {
      return res.status(410).json({ message: 'Token already used', alreadyUsed: true });
    }

    if (tokenData.expiresAt && new Date(tokenData.expiresAt) < new Date()) {
      return res.status(410).json({ message: 'Token expired', expired: true });
    }

    const appointment = tokenData.appointment;
    const hospital = tokenData.hospital;
    if (!appointment || !hospital) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    const tz = hospital.timezone || 'Europe/Zurich';
    const lang = (hospital.defaultLanguage as string) || 'de';
    const isGerman = lang === 'de';
    const dateLocale = isGerman ? 'de-CH' : 'en-GB';
    const dateObj = new Date(`${appointment.appointmentDate}T${appointment.startTime}:00`);
    const formattedDate = dateObj.toLocaleDateString(dateLocale, { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // Fetch provider info
    let providerName: string | null = null;
    let providerRole: string | null = null;
    let providerImageUrl: string | null = null;
    if (appointment.providerId) {
      const provider = await storage.getUser(appointment.providerId);
      if (provider) {
        providerName = `${provider.firstName} ${provider.lastName}`;
        providerImageUrl = provider.profileImageUrl ? `/api/public/profile-image/${provider.id}` : null;
      }
      // Get role from hospital roles
      const { userHospitalRoles: rolesTable } = await import("@shared/schema");
      const [role] = await db.select({ role: rolesTable.role, bookingLocation: rolesTable.bookingLocation })
        .from(rolesTable)
        .where(and(
          eq(rolesTable.userId, appointment.providerId),
          eq(rolesTable.hospitalId, hospital.id)
        ))
        .limit(1);
      if (role) {
        providerRole = role.role;
      }
    }

    // Fetch service info if linked
    let serviceName: string | null = null;
    let serviceDescription: string | null = null;
    if (appointment.serviceId) {
      const { clinicServices: servicesTable } = await import("@shared/schema");
      const [service] = await db.select({ name: servicesTable.name, description: servicesTable.description })
        .from(servicesTable)
        .where(eq(servicesTable.id, appointment.serviceId))
        .limit(1);
      if (service) {
        serviceName = service.name;
        serviceDescription = service.description;
      }
    }

    // Build address for Google Maps
    const addressParts = [hospital.companyStreet, hospital.companyPostalCode, hospital.companyCity].filter(Boolean);
    const clinicAddress = addressParts.length > 0 ? addressParts.join(', ') : (hospital.address || null);

    res.json({
      appointmentDate: formattedDate,
      appointmentRawDate: appointment.appointmentDate,
      appointmentTime: appointment.startTime,
      appointmentEndTime: appointment.endTime,
      clinicName: hospital.name,
      clinicAddress,
      clinicPhone: hospital.companyPhone || null,
      patientName: appointment.patient?.firstName || '',
      status: appointment.status,
      language: lang,
      notes: appointment.notes || null,
      // Provider info
      providerName,
      providerRole,
      providerImageUrl,
      // Service info
      serviceName,
      serviceDescription,
      // Video appointment
      isVideoAppointment: appointment.isVideoAppointment || false,
      videoMeetingLink: appointment.videoMeetingLink || null,
      // Fields for manage-appointment page (reschedule + pre-fill)
      bookingToken: hospital.bookingToken || null,
      providerId: appointment.providerId || null,
      patientFirstName: appointment.patient?.firstName || '',
      patientSurname: appointment.patient?.surname || '',
      patientEmail: appointment.patient?.email || null,
      patientPhone: appointment.patient?.phone || null,
      noShowFeeMessage: hospital.noShowFeeMessage || null,
      hidePatientCancel: hospital.hidePatientCancel || false,
    });
  } catch (error) {
    logger.error('Error fetching cancel info:', error);
    res.status(500).json({ message: 'Failed to fetch appointment info' });
  }
});

// Download ICS calendar file for appointment
router.get('/api/clinic/appointments/ics/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const tokenData = await storage.getAppointmentActionToken(token);
    if (!tokenData || !tokenData.appointment || !tokenData.hospital) {
      return res.status(404).json({ message: 'Not found' });
    }

    const appointment = tokenData.appointment;
    const hospital = tokenData.hospital;
    const tz = hospital.timezone || 'Europe/Zurich';

    // Build start/end times
    const startDate = `${appointment.appointmentDate}T${appointment.startTime}:00`;
    const endDate = `${appointment.appointmentDate}T${appointment.endTime}:00`;

    // Format to ICS datetime (YYYYMMDDTHHMMSS)
    const formatICS = (dateStr: string) => dateStr.replace(/[-:]/g, '');

    // Get provider name
    let providerName = '';
    if (appointment.providerId) {
      const provider = await storage.getUser(appointment.providerId);
      if (provider) {
        const { userHospitalRoles: rolesTable } = await import("@shared/schema");
        const [role] = await db.select({ role: rolesTable.role })
          .from(rolesTable)
          .where(and(eq(rolesTable.userId, appointment.providerId), eq(rolesTable.hospitalId, hospital.id)))
          .limit(1);
        const prefix = role?.role === 'doctor' ? 'Dr. ' : '';
        providerName = `${prefix}${provider.firstName} ${provider.lastName}`;
      }
    }

    const addressParts = [hospital.companyStreet, hospital.companyPostalCode, hospital.companyCity].filter(Boolean);
    const location = addressParts.join(', ') || hospital.address || hospital.name;

    const summary = appointment.notes || `Termin bei ${hospital.name}`;
    const description = [
      providerName ? `Arzt: ${providerName}` : '',
      appointment.isVideoAppointment && appointment.videoMeetingLink ? `Video: ${appointment.videoMeetingLink}` : '',
      hospital.companyPhone ? `Tel: ${hospital.companyPhone}` : '',
    ].filter(Boolean).join('\\n');

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Viali//Appointment//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `DTSTART;TZID=${tz}:${formatICS(startDate)}`,
      `DTEND;TZID=${tz}:${formatICS(endDate)}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      `LOCATION:${location}`,
      `UID:${appointment.id}@viali.app`,
      `DTSTAMP:${formatICS(new Date().toISOString().replace(/\.\d{3}Z$/, ''))}Z`,
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'TRIGGER:-PT60M',
      'ACTION:DISPLAY',
      'DESCRIPTION:Terminerinnerung',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="appointment.ics"');
    res.send(ics);
  } catch (error) {
    logger.error('Error generating ICS:', error);
    res.status(500).json({ message: 'Failed to generate calendar file' });
  }
});

// Cancel appointment by token (one-click cancel)
router.post('/api/clinic/appointments/cancel-by-token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ message: 'Token is required' });
    }

    const tokenData = await storage.getAppointmentActionToken(token);
    if (!tokenData) {
      return res.status(404).json({ message: 'Token not found' });
    }

    if (tokenData.used) {
      return res.status(410).json({ message: 'Token already used', alreadyUsed: true });
    }

    if (tokenData.expiresAt && new Date(tokenData.expiresAt) < new Date()) {
      return res.status(410).json({ message: 'Token expired', expired: true });
    }

    const appointment = tokenData.appointment;
    const hospital = tokenData.hospital;
    if (!appointment || !hospital) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (appointment.status !== 'scheduled' && appointment.status !== 'confirmed') {
      return res.status(409).json({ message: 'Appointment cannot be cancelled', status: appointment.status });
    }

    // Cancel the appointment
    const reason = req.body.reason || 'Cancelled by patient';
    await storage.updateClinicAppointment(appointment.id, {
      status: 'cancelled',
      cancellationReason: reason,
    });

    // Mark token as used
    await storage.markAppointmentActionTokenUsed(token);

    // Format date for response using hospital timezone
    const tz = hospital.timezone || 'Europe/Zurich';
    const lang = (hospital.defaultLanguage as string) || 'de';
    const isGerman = lang === 'de';
    const dateLocale = isGerman ? 'de-CH' : 'en-GB';
    const dateObj = new Date(`${appointment.appointmentDate}T${appointment.startTime}:00`);
    const formattedDate = dateObj.toLocaleDateString(dateLocale, { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // Send alert email to clinic staff about the patient cancellation
    const patientName = appointment.patient
      ? `${appointment.patient.firstName || ''} ${appointment.patient.surname || ''}`.trim()
      : 'Patient';
    const clinicEmail = hospital.companyEmail || hospital.externalSurgeryNotificationEmail;
    if (clinicEmail) {
      try {
        const { sendAppointmentPatientCancelledAlertEmail } = await import('../resend');
        await sendAppointmentPatientCancelledAlertEmail(
          clinicEmail,
          patientName,
          hospital.name,
          formattedDate,
          appointment.startTime,
          lang,
        );
      } catch (emailErr) {
        logger.error('Failed to send patient-cancelled alert email to clinic:', emailErr);
      }
    }

    // Log patient-initiated cancellation to patient_messages so it appears in Communication Dialog
    if (appointment.patientId) {
      try {
        const shortDate = dateObj.toLocaleDateString(dateLocale, { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' });
        const cancelMsg = isGerman
          ? `Termin am ${shortDate} um ${appointment.startTime} wurde vom Patienten abgesagt.`
          : `Appointment on ${shortDate} at ${appointment.startTime} was cancelled by the patient.`;
        await storage.createPatientMessage({
          hospitalId: hospital.id,
          patientId: appointment.patientId,
          sentBy: null,
          channel: 'portal',
          recipient: 'portal',
          message: cancelMsg,
          status: 'sent',
          isAutomatic: true,
          messageType: 'appointment_cancellation',
          direction: 'inbound',
        });
      } catch (msgErr) {
        logger.error('Failed to log patient cancellation to patient_messages:', msgErr);
      }
    }

    res.json({
      success: true,
      appointment: {
        date: formattedDate,
        time: appointment.startTime,
        clinicName: hospital.name,
      },
    });
  } catch (error) {
    logger.error('Error cancelling appointment by token:', error);
    res.status(500).json({ message: 'Failed to cancel appointment' });
  }
});


// ========================================
// Public Booking Page API
// ========================================

// 3a: Get booking page data (hospital info + bookable providers)
router.get('/api/public/booking/:bookingToken', async (req, res) => {
  try {
    const hospital = await storage.getHospitalByBookingToken(req.params.bookingToken);
    if (!hospital) {
      return res.status(404).json({ message: 'Booking page not found' });
    }

    const providers = await storage.getPublicBookableProvidersByHospital(hospital.id);

    res.json({
      hospital: {
        name: hospital.name,
        logoUrl: hospital.companyLogoUrl,
        timezone: hospital.timezone,
        language: hospital.defaultLanguage,
        noShowFeeMessage: hospital.noShowFeeMessage || null,
      },
      bookingSettings: hospital.bookingSettings || {},
      providers: providers.map(p => ({
        id: p.userId,
        firstName: p.user.firstName,
        lastName: p.user.lastName,
        profileImageUrl: p.user.profileImageUrl ? `/api/public/profile-image/${p.userId}` : null,
        bookingServiceName: p.bookingServiceName,
        bookingLocation: p.bookingLocation,
        role: p.role || null,
      })),
      enableReferralOnBooking: hospital.enableReferralOnBooking ?? false,
    });
  } catch (error) {
    logger.error('Error fetching booking page data:', error);
    res.status(500).json({ message: 'Failed to load booking page' });
  }
});

// 3b-pre: Get available dates for a provider in a given month (lightweight hint for calendar)
router.get('/api/public/booking/:bookingToken/providers/:providerId/available-dates', async (req, res) => {
  try {
    const hospital = await storage.getHospitalByBookingToken(req.params.bookingToken);
    if (!hospital) {
      return res.status(404).json({ message: 'Booking page not found' });
    }

    const { providerId } = req.params;
    const month = req.query.month as string;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ message: 'Valid month parameter required (YYYY-MM)' });
    }

    // Find the clinic unit for this provider (same logic as slots endpoint)
    const { userHospitalRoles: rolesTable } = await import("@shared/schema");
    const roles = await db
      .select()
      .from(rolesTable)
      .where(and(
        eq(rolesTable.userId, providerId),
        eq(rolesTable.hospitalId, hospital.id),
        eq(rolesTable.isBookable, true),
        eq(rolesTable.publicCalendarEnabled, true)
      ));

    if (roles.length === 0) {
      return res.status(404).json({ message: 'Provider not found' });
    }

    let unitId = roles[0].unitId;
    for (const role of roles) {
      const unit = await storage.getUnit(role.unitId);
      if (unit?.type === 'clinic') {
        unitId = role.unitId;
        break;
      }
    }

    const settings = hospital.bookingSettings as { slotDurationMinutes?: number } | null;
    const slotDuration = settings?.slotDurationMinutes || 30;

    const dates = await storage.getAvailableDatesForMonth(providerId, unitId, hospital.id, month, slotDuration, true);
    res.json({ month, providerId, dates });
  } catch (error) {
    logger.error('Error fetching available dates:', error);
    res.status(500).json({ message: 'Failed to load available dates' });
  }
});

// 3b: Get clinic closures for the booking page
router.get('/api/public/booking/:bookingToken/closures', async (req, res) => {
  try {
    const hospital = await storage.getHospitalByBookingToken(req.params.bookingToken);
    if (!hospital) {
      return res.status(404).json({ message: 'Booking page not found' });
    }

    const today = new Date().toISOString().split('T')[0];
    const oneYearOut = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { getClinicClosuresInRange } = await import("../storage/clinicClosures");
    const closures = await getClinicClosuresInRange(hospital.id, today, oneYearOut);

    res.json(closures.map(c => ({
      startDate: c.startDate,
      endDate: c.endDate,
      name: c.name,
    })));
  } catch (error) {
    logger.error('Error fetching booking closures:', error);
    res.status(500).json({ message: 'Failed to load closures' });
  }
});

// 3b-best: Get the best available provider (earliest next slot), optionally filtered by service code
// Fallback chain:
//   1. If service code → try providers assigned to that service
//   2. If no slot found / no providers assigned / service not found → try ALL bookable providers
//   3. If still no slot → return provider: null
router.get('/api/public/booking/:bookingToken/best-provider', async (req, res) => {
  try {
    const hospital = await storage.getHospitalByBookingToken(req.params.bookingToken);
    if (!hospital) {
      return res.status(404).json({ message: 'Booking page not found' });
    }

    const serviceCode = req.query.service as string | undefined;
    let service: any = null;
    const settings = hospital.bookingSettings as { slotDurationMinutes?: number } | null;
    const allBookable = await storage.getPublicBookableProvidersByHospital(hospital.id);
    const allBookableIds = allBookable.map(p => p.userId);

    if (allBookableIds.length === 0) {
      return res.json({ provider: null, service: null });
    }

    let best: { providerId: string; date: string; startTime: string } | null = null;

    // Step 1: If service code passed, try service-specific providers first
    if (serviceCode) {
      service = await storage.getServiceByCode(hospital.id, serviceCode);
      if (service) {
        const serviceProviderIds = await storage.getProvidersByServiceId(service.id);
        const bookableServiceProviders = serviceProviderIds.filter(id =>
          allBookableIds.includes(id)
        );
        if (bookableServiceProviders.length > 0) {
          const slotDuration = service.durationMinutes || settings?.slotDurationMinutes || 30;
          best = await storage.getBestAvailableProvider(hospital.id, bookableServiceProviders, slotDuration);
        }
      }
      // If service not found, no providers assigned, or no slots → fall through
    }

    // Step 2: Fallback to ALL bookable providers
    if (!best) {
      const slotDuration = settings?.slotDurationMinutes || 30;
      best = await storage.getBestAvailableProvider(hospital.id, allBookableIds, slotDuration);
    }

    if (!best) {
      return res.json({ provider: null, service: service ? { id: service.id, name: service.name, description: service.description, durationMinutes: service.durationMinutes } : null });
    }

    const providerInfo = allBookable.find(p => p.userId === best!.providerId);

    res.json({
      provider: providerInfo ? {
        id: providerInfo.userId,
        firstName: providerInfo.user.firstName,
        lastName: providerInfo.user.lastName,
        profileImageUrl: providerInfo.user.profileImageUrl ? `/api/public/profile-image/${providerInfo.userId}` : null,
        bookingServiceName: providerInfo.bookingServiceName,
        bookingLocation: providerInfo.bookingLocation,
        role: providerInfo.role || null,
      } : null,
      service: service ? {
        id: service.id,
        name: service.name,
        description: service.description,
        durationMinutes: service.durationMinutes,
      } : null,
      nextSlot: { date: best.date, startTime: best.startTime },
    });
  } catch (error) {
    logger.error('Error fetching best provider:', error);
    res.status(500).json({ message: 'Failed to find available provider' });
  }
});

// 3c: Get available slots for a provider on a specific date
router.get('/api/public/booking/:bookingToken/providers/:providerId/slots', async (req, res) => {
  try {
    const hospital = await storage.getHospitalByBookingToken(req.params.bookingToken);
    if (!hospital) {
      return res.status(404).json({ message: 'Booking page not found' });
    }

    const { providerId } = req.params;
    const date = req.query.date as string;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ message: 'Valid date parameter required (YYYY-MM-DD)' });
    }

    // Find the clinic unit for this provider
    const { userHospitalRoles: rolesTable } = await import("@shared/schema");
    const roles = await db
      .select()
      .from(rolesTable)
      .where(and(
        eq(rolesTable.userId, providerId),
        eq(rolesTable.hospitalId, hospital.id),
        eq(rolesTable.isBookable, true),
        eq(rolesTable.publicCalendarEnabled, true)
      ));

    if (roles.length === 0) {
      return res.status(404).json({ message: 'Provider not found' });
    }

    // Prefer a clinic unit, fall back to first bookable role's unit
    let unitId = roles[0].unitId;
    for (const role of roles) {
      const unit = await storage.getUnit(role.unitId);
      if (unit?.type === 'clinic') {
        unitId = role.unitId;
        break;
      }
    }

    const settings = hospital.bookingSettings as { slotDurationMinutes?: number; maxAdvanceDays?: number; minAdvanceHours?: number } | null;
    const slotDuration = settings?.slotDurationMinutes || 30;

    const slots = await storage.getAvailableSlots(providerId, unitId, date, slotDuration, hospital.id, true);

    res.json({
      date,
      providerId,
      slots,
    });
  } catch (error) {
    logger.error('Error fetching booking slots:', error);
    res.status(500).json({ message: 'Failed to load available slots' });
  }
});

// 3c: Create a booking
const bookingSchema = z.object({
  providerId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  firstName: z.string().min(1).max(100),
  surname: z.string().min(1).max(100),
  email: z.string().email().max(255),
  phone: z.string().min(1).max(30),
  notes: z.string().min(1).max(1000),
  // Referral fields
  referralSource: z.enum(["social", "search_engine", "llm", "word_of_mouth", "belegarzt", "other"]).nullish(),
  referralSourceDetail: z.string().max(500).nullish(),
  captureMethod: z.enum(["manual", "utm", "ref", "staff"]).nullish(),
  utmSource: z.string().max(500).nullish(),
  utmMedium: z.string().max(500).nullish(),
  utmCampaign: z.string().max(500).nullish(),
  utmTerm: z.string().max(500).nullish(),
  utmContent: z.string().max(500).nullish(),
  refParam: z.string().max(500).nullish(),
  // Ad platform click IDs
  gclid: z.string().max(500).nullish(),
  gbraid: z.string().max(500).nullish(),
  wbraid: z.string().max(500).nullish(),
  fbclid: z.string().max(500).nullish(),
  ttclid: z.string().max(500).nullish(),
  msclkid: z.string().max(500).nullish(),
  igshid: z.string().max(500).nullish(),
  li_fat_id: z.string().max(500).nullish(),
  twclid: z.string().max(500).nullish(),
  noShowFeeAcknowledged: z.boolean().optional(),
  serviceId: z.string().nullish(),
});

router.post('/api/public/booking/:bookingToken/book', async (req, res) => {
  try {
    const hospital = await storage.getHospitalByBookingToken(req.params.bookingToken);
    if (!hospital) {
      return res.status(404).json({ message: 'Booking page not found' });
    }

    const parsed = bookingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid booking data', errors: parsed.error.errors });
    }

    // Require referral source when hospital has referral enabled and no auto-capture data
    if (hospital.enableReferralOnBooking && !parsed.data.utmSource && !parsed.data.refParam && !parsed.data.referralSource) {
      return res.status(400).json({ message: "Referral source is required" });
    }

    const { providerId, date, startTime, endTime, firstName, surname, email, phone, notes } = parsed.data;

    // Find the clinic unit for this provider
    const { userHospitalRoles: rolesTable } = await import("@shared/schema");
    const roles = await db
      .select()
      .from(rolesTable)
      .where(and(
        eq(rolesTable.userId, providerId),
        eq(rolesTable.hospitalId, hospital.id),
        eq(rolesTable.isBookable, true),
        eq(rolesTable.publicCalendarEnabled, true)
      ));

    if (roles.length === 0) {
      return res.status(404).json({ message: 'Provider not found' });
    }

    let unitId = roles[0].unitId;
    for (const role of roles) {
      const unit = await storage.getUnit(role.unitId);
      if (unit?.type === 'clinic') {
        unitId = role.unitId;
        break;
      }
    }

    const settings = hospital.bookingSettings as { slotDurationMinutes?: number } | null;
    const slotDuration = settings?.slotDurationMinutes || 30;

    // Re-check slot availability right before insert (race condition protection)
    const availableSlots = await storage.getAvailableSlots(providerId, unitId, date, slotDuration, hospital.id);
    const slotAvailable = availableSlots.some(s => s.startTime === startTime && s.endTime === endTime);
    if (!slotAvailable) {
      return res.status(409).json({ message: 'Dieser Termin ist leider nicht mehr verfügbar. Bitte wählen Sie einen anderen Zeitpunkt.', code: 'SLOT_TAKEN' });
    }

    // Find or create patient
    const patient = await storage.findOrCreatePatientForBooking(hospital.id, {
      firstName,
      surname,
      email,
      phone,
    });

    // Create appointment with DB-level race protection via unique partial index
    try {
      const appointment = await storage.createClinicAppointment({
        hospitalId: hospital.id,
        unitId,
        appointmentType: 'external',
        patientId: patient.id,
        providerId,
        appointmentDate: date,
        startTime,
        endTime,
        durationMinutes: slotDuration,
        status: 'scheduled',
        calcomSource: 'local',
        notes: notes || null,
        noShowFeeAcknowledgedAt: parsed.data.noShowFeeAcknowledged ? new Date() : null,
        serviceId: parsed.data.serviceId || null,
      });

      // Save referral event if any referral data present
      if (parsed.data.referralSource || parsed.data.utmSource || parsed.data.refParam || parsed.data.gclid || parsed.data.fbclid || parsed.data.ttclid || parsed.data.msclkid || parsed.data.gbraid || parsed.data.wbraid || parsed.data.igshid || parsed.data.li_fat_id || parsed.data.twclid) {
        const { referralEvents } = await import("@shared/schema");
        // Infer source from click IDs when no explicit source provided
        let inferredSource = parsed.data.referralSource || "other";
        let inferredDetail = parsed.data.referralSourceDetail || null;
        if (!parsed.data.referralSource && !parsed.data.utmSource) {
          if (parsed.data.gclid || parsed.data.gbraid || parsed.data.wbraid) {
            inferredSource = "search_engine"; inferredDetail = "Google Ads";
          } else if (parsed.data.fbclid) {
            inferredSource = "social"; inferredDetail = "Meta Ads";
          } else if (parsed.data.ttclid) {
            inferredSource = "social"; inferredDetail = "TikTok Ads";
          } else if (parsed.data.msclkid) {
            inferredSource = "search_engine"; inferredDetail = "Bing Ads";
          } else if (parsed.data.igshid) {
            inferredSource = "social"; inferredDetail = "Instagram";
          } else if (parsed.data.li_fat_id) {
            inferredSource = "social"; inferredDetail = "LinkedIn Ads";
          } else if (parsed.data.twclid) {
            inferredSource = "social"; inferredDetail = "Twitter/X Ads";
          }
        }
        await db.insert(referralEvents).values({
          hospitalId: hospital.id,
          patientId: patient.id,
          appointmentId: appointment.id,
          source: inferredSource,
          sourceDetail: inferredDetail,
          utmSource: parsed.data.utmSource || null,
          utmMedium: parsed.data.utmMedium || null,
          utmCampaign: parsed.data.utmCampaign || null,
          utmTerm: parsed.data.utmTerm || null,
          utmContent: parsed.data.utmContent || null,
          refParam: parsed.data.refParam || null,
          gclid: parsed.data.gclid || null,
          gbraid: parsed.data.gbraid || null,
          wbraid: parsed.data.wbraid || null,
          fbclid: parsed.data.fbclid || null,
          ttclid: parsed.data.ttclid || null,
          msclkid: parsed.data.msclkid || null,
          igshid: parsed.data.igshid || null,
          li_fat_id: parsed.data.li_fat_id || null,
          twclid: parsed.data.twclid || null,
          captureMethod: parsed.data.captureMethod || "manual",
        });
      }

      // Send confirmation email asynchronously
      (async () => {
        try {
          const tz = hospital.timezone || 'Europe/Zurich';
          const lang = (hospital.defaultLanguage as string) || 'de';
          const isGerman = lang === 'de';
          const dateLocale = isGerman ? 'de-CH' : 'en-GB';
          const dateObj = new Date(`${date}T${startTime}:00`);
          const formattedDate = dateObj.toLocaleDateString(dateLocale, { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' });

          // Generate cancel token
          let manageUrl = '';
          try {
            const crypto = await import('crypto');
            const cancelToken = crypto.randomBytes(32).toString('hex');
            const tokenExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
            await storage.createAppointmentActionToken({
              token: cancelToken,
              appointmentId: appointment.id,
              hospitalId: hospital.id,
              action: 'cancel',
              expiresAt: tokenExpiresAt,
            });
            const baseUrl = process.env.PRODUCTION_URL || 'https://use.viali.app';
            manageUrl = `${baseUrl}/manage-appointment/${cancelToken}`;
          } catch (tokenErr) {
            logger.error('Failed to generate cancel token for booking:', tokenErr);
          }

          const provider = await storage.getUser(providerId);
          const providerName = provider
            ? `${provider.firstName || ''} ${provider.lastName || ''}`.trim()
            : '';
          const noShowFeeMsg = hospital.noShowFeeMessage || '';

          const { sendAppointmentConfirmationEmail } = await import('../resend');
          await sendAppointmentConfirmationEmail(
            email,
            firstName,
            hospital.name,
            formattedDate,
            startTime,
            lang,
            manageUrl,
            providerName,
            '',
            noShowFeeMsg,
            hospital.hidePatientCancel || false,
          );

          // Notify clinic staff about new booking
          const clinicEmail = hospital.companyEmail || (hospital as any).externalSurgeryNotificationEmail;
          if (clinicEmail) {
            try {
              const patientName = `${firstName} ${surname}`.trim();
              const { sendNewBookingAlertEmail } = await import('../resend');
              await sendNewBookingAlertEmail(
                clinicEmail,
                patientName,
                hospital.name,
                formattedDate,
                startTime,
                providerName,
                lang,
              );
            } catch (alertErr) {
              logger.error('Failed to send new booking alert email to clinic:', alertErr);
            }
          }
        } catch (emailErr) {
          logger.error('Failed to send booking confirmation email:', emailErr);
        }
      })();

      res.json({ success: true, appointmentId: appointment.id });
    } catch (dbError: any) {
      // Unique index violation = double booking race condition
      if (dbError?.code === '23505' && dbError?.constraint?.includes('no_double_book')) {
        return res.status(409).json({ message: 'Dieser Termin ist leider nicht mehr verfügbar. Bitte wählen Sie einen anderen Zeitpunkt.', code: 'SLOT_TAKEN' });
      }
      throw dbError;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid data', errors: error.errors });
    }
    logger.error('Error creating booking:', error);
    res.status(500).json({ message: 'Failed to create booking' });
  }
});


// ========================================
// Clinic Services CRUD
// ========================================

// List services for a hospital (optionally filtered by unit)
router.get('/api/clinic/:hospitalId/services', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { unitId, includeShared } = req.query;
    
    let conditions: any[] = [eq(clinicServices.hospitalId, hospitalId)];
    
    if (unitId && typeof unitId === 'string') {
      if (includeShared === 'true') {
        conditions.push(
          or(
            eq(clinicServices.unitId, unitId),
            eq(clinicServices.isShared, true)
          )
        );
      } else {
        conditions.push(eq(clinicServices.unitId, unitId));
      }
    }
    
    const services = await db
      .select({
        id: clinicServices.id,
        hospitalId: clinicServices.hospitalId,
        unitId: clinicServices.unitId,
        name: clinicServices.name,
        description: clinicServices.description,
        price: clinicServices.price,
        durationMinutes: clinicServices.durationMinutes,
        isShared: clinicServices.isShared,
        isInvoiceable: clinicServices.isInvoiceable,
        code: clinicServices.code,
        sortOrder: clinicServices.sortOrder,
        createdAt: clinicServices.createdAt,
        updatedAt: clinicServices.updatedAt,
        unitName: units.name,
      })
      .from(clinicServices)
      .leftJoin(units, eq(clinicServices.unitId, units.id))
      .where(and(...conditions))
      .orderBy(clinicServices.sortOrder, clinicServices.name);

    // Fetch provider IDs for each service
    const servicesWithProviders = await Promise.all(
      services.map(async (s) => ({
        ...s,
        providerIds: await storage.getProvidersByServiceId(s.id),
      }))
    );

    res.json(servicesWithProviders);
  } catch (error) {
    logger.error("Error fetching services:", error);
    res.status(500).json({ message: "Failed to fetch services" });
  }
});

// Get single service
router.get('/api/clinic/:hospitalId/services/:serviceId', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId, serviceId } = req.params;
    
    const result = await db
      .select()
      .from(clinicServices)
      .where(
        and(
          eq(clinicServices.hospitalId, hospitalId),
          eq(clinicServices.id, serviceId)
        )
      )
      .limit(1);
    
    if (result.length === 0) {
      return res.status(404).json({ message: "Service not found" });
    }

    const providerIds = await storage.getProvidersByServiceId(result[0].id);
    res.json({ ...result[0], providerIds });
  } catch (error) {
    logger.error("Error fetching service:", error);
    res.status(500).json({ message: "Failed to fetch service" });
  }
});

// Create service
router.post('/api/clinic/:hospitalId/services', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    
    const { providerIds: providerIdsInput, ...serviceData } = req.body;

    // Validate code format if provided
    if (serviceData.code && !/^[a-z0-9-]+$/.test(serviceData.code)) {
      return res.status(400).json({ message: "Code must be lowercase alphanumeric with hyphens only" });
    }
    if (serviceData.code && serviceData.code.length > 50) {
      return res.status(400).json({ message: "Code must be 50 characters or fewer" });
    }
    // Treat empty string as null
    if (serviceData.code === '') serviceData.code = null;

    const validatedData = insertClinicServiceSchema.parse({
      ...serviceData,
      hospitalId,
    });

    const [service] = await db
      .insert(clinicServices)
      .values(validatedData)
      .returning();

    // Set provider mappings if provided
    if (Array.isArray(providerIdsInput) && providerIdsInput.length > 0) {
      await storage.setServiceProviders(service.id, providerIdsInput);
    }

    const providerIds = await storage.getProvidersByServiceId(service.id);
    res.status(201).json({ ...service, providerIds });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error creating service:", error);
    res.status(500).json({ message: "Failed to create service" });
  }
});

// Update service
router.patch('/api/clinic/:hospitalId/services/:serviceId', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req, res) => {
  try {
    const { hospitalId, serviceId } = req.params;
    
    // Verify service belongs to hospital
    const existing = await db
      .select()
      .from(clinicServices)
      .where(
        and(
          eq(clinicServices.hospitalId, hospitalId),
          eq(clinicServices.id, serviceId)
        )
      )
      .limit(1);
    
    if (existing.length === 0) {
      return res.status(404).json({ message: "Service not found" });
    }
    
    const { name, description, price, durationMinutes, isShared, sortOrder, isInvoiceable, code, providerIds: providerIdsInput } = req.body;

    // Validate code format if provided
    if (code !== undefined && code !== null && code !== '') {
      if (!/^[a-z0-9-]+$/.test(code)) {
        return res.status(400).json({ message: "Code must be lowercase alphanumeric with hyphens only" });
      }
      if (code.length > 50) {
        return res.status(400).json({ message: "Code must be 50 characters or fewer" });
      }
    }

    const updateData: any = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (price !== undefined) updateData.price = price ? price.toString() : null;
    if (durationMinutes !== undefined) updateData.durationMinutes = durationMinutes;
    if (isShared !== undefined) updateData.isShared = isShared;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (isInvoiceable !== undefined) updateData.isInvoiceable = isInvoiceable;
    if (code !== undefined) updateData.code = code === '' ? null : code;

    const [updated] = await db
      .update(clinicServices)
      .set(updateData)
      .where(eq(clinicServices.id, serviceId))
      .returning();

    // Update provider mappings if provided
    if (Array.isArray(providerIdsInput)) {
      await storage.setServiceProviders(serviceId, providerIdsInput);
    }

    const providerIds = await storage.getProvidersByServiceId(serviceId);
    res.json({ ...updated, providerIds });
  } catch (error) {
    logger.error("Error updating service:", error);
    res.status(500).json({ message: "Failed to update service" });
  }
});

// Delete service
router.delete('/api/clinic/:hospitalId/services/:serviceId', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req, res) => {
  try {
    const { hospitalId, serviceId } = req.params;
    
    // Verify service belongs to hospital
    const existing = await db
      .select()
      .from(clinicServices)
      .where(
        and(
          eq(clinicServices.hospitalId, hospitalId),
          eq(clinicServices.id, serviceId)
        )
      )
      .limit(1);
    
    if (existing.length === 0) {
      return res.status(404).json({ message: "Service not found" });
    }
    
    await db
      .delete(clinicServices)
      .where(eq(clinicServices.id, serviceId));
    
    res.status(204).send();
  } catch (error) {
    logger.error("Error deleting service:", error);
    res.status(500).json({ message: "Failed to delete service" });
  }
});

// Bulk move services to another unit
router.post('/api/clinic/:hospitalId/services/bulk-move', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { serviceIds, targetUnitId } = req.body;
    
    if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
      return res.status(400).json({ message: "Service IDs are required" });
    }
    
    if (!targetUnitId) {
      return res.status(400).json({ message: "Target unit ID is required" });
    }
    
    // Verify target unit belongs to same hospital
    const targetUnit = await db
      .select()
      .from(units)
      .where(
        and(
          eq(units.id, targetUnitId),
          eq(units.hospitalId, hospitalId)
        )
      )
      .limit(1);
    
    if (targetUnit.length === 0) {
      return res.status(404).json({ message: "Target unit not found or doesn't belong to this hospital" });
    }
    
    // Update all services
    const result = await db
      .update(clinicServices)
      .set({ unitId: targetUnitId, updatedAt: new Date() })
      .where(
        and(
          eq(clinicServices.hospitalId, hospitalId),
          inArray(clinicServices.id, serviceIds)
        )
      );
    
    res.json({ movedCount: serviceIds.length, targetUnitId });
  } catch (error) {
    logger.error("Error bulk moving services:", error);
    res.status(500).json({ message: "Failed to move services" });
  }
});

// Bulk set billable status for services
router.post('/api/clinic/:hospitalId/services/bulk-set-billable', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { serviceIds, isBillable } = req.body;
    
    if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
      return res.status(400).json({ message: "Service IDs are required" });
    }
    
    if (typeof isBillable !== 'boolean') {
      return res.status(400).json({ message: "isBillable must be a boolean" });
    }
    
    // Update all services
    await db
      .update(clinicServices)
      .set({ isInvoiceable: isBillable, updatedAt: new Date() })
      .where(
        and(
          eq(clinicServices.hospitalId, hospitalId),
          inArray(clinicServices.id, serviceIds)
        )
      );
    
    res.json({ updatedCount: serviceIds.length, isBillable });
  } catch (error) {
    logger.error("Error bulk setting billable status:", error);
    res.status(500).json({ message: "Failed to update billable status" });
  }
});

// Bulk import services from pasted text (tab or comma separated: code, name, description)
router.post('/api/clinic/:hospitalId/services/bulk-import', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { unitId, lines, providerIds } = req.body;

    if (!unitId || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ message: "unitId and non-empty lines array are required" });
    }

    const created: any[] = [];
    const errors: string[] = [];

    for (const line of lines) {
      const { code, name, description } = line;
      if (!name || !name.trim()) {
        errors.push(`Skipped line with empty name${code ? ` (code: ${code})` : ''}`);
        continue;
      }

      const cleanCode = code?.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || null;
      if (cleanCode && cleanCode.length > 50) {
        errors.push(`Skipped "${name}": code exceeds 50 characters`);
        continue;
      }

      try {
        const validatedData = insertClinicServiceSchema.parse({
          hospitalId,
          unitId,
          name: name.trim(),
          description: description?.trim() || null,
          code: cleanCode || null,
        });

        const [service] = await db
          .insert(clinicServices)
          .values(validatedData)
          .returning();

        if (Array.isArray(providerIds) && providerIds.length > 0) {
          await storage.setServiceProviders(service.id, providerIds);
        }

        created.push(service);
      } catch (err: any) {
        errors.push(`Failed to create "${name}": ${err.message}`);
      }
    }

    res.status(201).json({ created: created.length, errors });
  } catch (error) {
    logger.error("Error bulk importing services:", error);
    res.status(500).json({ message: "Failed to bulk import services" });
  }
});

// ========================================
// Invoice Number
// ========================================

// Get next invoice number for a hospital
router.get('/api/clinic/:hospitalId/next-invoice-number', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    const result = await db
      .select({ maxNumber: max(clinicInvoices.invoiceNumber) })
      .from(clinicInvoices)
      .where(eq(clinicInvoices.hospitalId, hospitalId));
    
    const nextNumber = (result[0]?.maxNumber || 0) + 1;
    
    res.json({ nextNumber });
  } catch (error) {
    logger.error("Error getting next invoice number:", error);
    res.status(500).json({ message: "Failed to get next invoice number" });
  }
});

// List all invoices for a hospital
router.get('/api/clinic/:hospitalId/invoices', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { status, patientId } = req.query;
    
    let query = db
      .select({
        id: clinicInvoices.id,
        hospitalId: clinicInvoices.hospitalId,
        invoiceNumber: clinicInvoices.invoiceNumber,
        date: clinicInvoices.date,
        patientId: clinicInvoices.patientId,
        customerName: clinicInvoices.customerName,
        customerAddress: clinicInvoices.customerAddress,
        subtotal: clinicInvoices.subtotal,
        vatRate: clinicInvoices.vatRate,
        vatAmount: clinicInvoices.vatAmount,
        total: clinicInvoices.total,
        comments: clinicInvoices.comments,
        status: clinicInvoices.status,
        createdBy: clinicInvoices.createdBy,
        createdAt: clinicInvoices.createdAt,
        patientFirstName: patients.firstName,
        patientSurname: patients.surname,
      })
      .from(clinicInvoices)
      .leftJoin(patients, eq(clinicInvoices.patientId, patients.id))
      .where(eq(clinicInvoices.hospitalId, hospitalId))
      .orderBy(desc(clinicInvoices.date));
    
    const invoices = await query;
    
    // Apply filters in memory for simplicity
    let filtered = invoices;
    if (status && status !== 'all') {
      filtered = filtered.filter(inv => inv.status === status);
    }
    if (patientId) {
      filtered = filtered.filter(inv => inv.patientId === patientId);
    }
    
    res.json(filtered);
  } catch (error) {
    logger.error("Error fetching invoices:", error);
    res.status(500).json({ message: "Failed to fetch invoices" });
  }
});

// Get single invoice with items
router.get('/api/clinic/:hospitalId/invoices/:invoiceId', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId, invoiceId } = req.params;
    
    // Get invoice
    const invoiceResult = await db
      .select({
        id: clinicInvoices.id,
        hospitalId: clinicInvoices.hospitalId,
        invoiceNumber: clinicInvoices.invoiceNumber,
        date: clinicInvoices.date,
        patientId: clinicInvoices.patientId,
        customerName: clinicInvoices.customerName,
        customerAddress: clinicInvoices.customerAddress,
        subtotal: clinicInvoices.subtotal,
        vatRate: clinicInvoices.vatRate,
        vatAmount: clinicInvoices.vatAmount,
        total: clinicInvoices.total,
        comments: clinicInvoices.comments,
        status: clinicInvoices.status,
        createdBy: clinicInvoices.createdBy,
        createdAt: clinicInvoices.createdAt,
        patientFirstName: patients.firstName,
        patientSurname: patients.surname,
      })
      .from(clinicInvoices)
      .leftJoin(patients, eq(clinicInvoices.patientId, patients.id))
      .where(
        and(
          eq(clinicInvoices.hospitalId, hospitalId),
          eq(clinicInvoices.id, invoiceId)
        )
      )
      .limit(1);
    
    if (invoiceResult.length === 0) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    
    const invoice = invoiceResult[0];
    
    // Get invoice items with item codes (pharmacode, GTIN) and tax data
    const invoiceItems = await db
      .select({
        id: clinicInvoiceItems.id,
        invoiceId: clinicInvoiceItems.invoiceId,
        lineType: clinicInvoiceItems.lineType,
        itemId: clinicInvoiceItems.itemId,
        serviceId: clinicInvoiceItems.serviceId,
        description: clinicInvoiceItems.description,
        quantity: clinicInvoiceItems.quantity,
        unitPrice: clinicInvoiceItems.unitPrice,
        total: clinicInvoiceItems.total,
        taxRate: clinicInvoiceItems.taxRate,
        taxAmount: clinicInvoiceItems.taxAmount,
        itemName: items.name,
        pharmacode: itemCodes.pharmacode,
        gtin: itemCodes.gtin,
      })
      .from(clinicInvoiceItems)
      .leftJoin(items, eq(clinicInvoiceItems.itemId, items.id))
      .leftJoin(itemCodes, eq(items.id, itemCodes.itemId))
      .where(eq(clinicInvoiceItems.invoiceId, invoiceId));
    
    res.json({
      ...invoice,
      items: invoiceItems,
    });
  } catch (error) {
    logger.error("Error fetching invoice:", error);
    res.status(500).json({ message: "Failed to fetch invoice" });
  }
});

// Create invoice schema with items - supports per-line tax
const createInvoiceWithItemsSchema = z.object({
  hospitalId: z.string(),
  patientId: z.string().nullable().optional(),
  customerName: z.string().min(1),
  customerAddress: z.string().nullable().optional(),
  date: z.coerce.date().optional(),
  vatRate: z.coerce.number().default(2.6),
  comments: z.string().nullable().optional(),
  status: z.enum(["draft", "sent", "paid", "cancelled"]).default("draft"),
  items: z.array(z.object({
    lineType: z.enum(["item", "service"]).default("item"),
    itemId: z.string().nullable().optional(),
    serviceId: z.string().nullable().optional(),
    description: z.string().min(1),
    quantity: z.number().int().positive(),
    unitPrice: z.coerce.number().min(0),
    taxRate: z.coerce.number().min(0).max(100).default(0),
  })).min(1),
});

// Create invoice with items
router.post('/api/clinic/:hospitalId/invoices', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;
    
    // Validate input
    const validatedData = createInvoiceWithItemsSchema.parse({
      ...req.body,
      hospitalId,
    });
    
    // Get next invoice number
    const numberResult = await db
      .select({ maxNumber: max(clinicInvoices.invoiceNumber) })
      .from(clinicInvoices)
      .where(eq(clinicInvoices.hospitalId, hospitalId));
    
    const invoiceNumber = (numberResult[0]?.maxNumber || 0) + 1;
    
    // Calculate totals with per-line tax (services are tax-exempt, items have VAT)
    let subtotal = 0;
    let totalTax = 0;
    const itemsWithTotals = validatedData.items.map(item => {
      const lineSubtotal = item.quantity * item.unitPrice;
      const lineTaxRate = item.taxRate || 0;
      const lineTaxAmount = lineSubtotal * (lineTaxRate / 100);
      subtotal += lineSubtotal;
      totalTax += lineTaxAmount;
      return {
        ...item,
        total: lineSubtotal,
        taxAmount: lineTaxAmount,
      };
    });
    
    const vatAmount = totalTax; // VAT is sum of per-line taxes (only items, not services)
    const total = subtotal + vatAmount;
    
    // Create invoice
    const [invoice] = await db
      .insert(clinicInvoices)
      .values({
        hospitalId,
        invoiceNumber,
        date: validatedData.date || new Date(),
        patientId: validatedData.patientId || null,
        customerName: validatedData.customerName,
        customerAddress: validatedData.customerAddress?.trim() || null,
        subtotal: subtotal.toFixed(2),
        vatRate: validatedData.vatRate.toFixed(2),
        vatAmount: vatAmount.toFixed(2),
        total: total.toFixed(2),
        comments: validatedData.comments || null,
        status: validatedData.status,
        createdBy: userId,
      })
      .returning();
    
    // Create invoice items with per-line tax data
    for (const item of itemsWithTotals) {
      await db
        .insert(clinicInvoiceItems)
        .values({
          invoiceId: invoice.id,
          lineType: item.lineType || 'item',
          itemId: item.itemId || null,
          serviceId: item.serviceId || null,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toFixed(2),
          total: item.total.toFixed(2),
          taxRate: (item.taxRate || 0).toFixed(2),
          taxAmount: item.taxAmount.toFixed(2),
        });
    }
    
    res.status(201).json(invoice);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error creating invoice:", error);
    res.status(500).json({ message: "Failed to create invoice" });
  }
});

// Update invoice status
router.patch('/api/clinic/:hospitalId/invoices/:invoiceId', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req, res) => {
  try {
    const { hospitalId, invoiceId } = req.params;
    const { status, comments } = req.body;
    
    // Verify invoice belongs to hospital
    const existing = await db
      .select()
      .from(clinicInvoices)
      .where(
        and(
          eq(clinicInvoices.hospitalId, hospitalId),
          eq(clinicInvoices.id, invoiceId)
        )
      )
      .limit(1);
    
    if (existing.length === 0) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    
    const updateData: any = {};
    if (status) updateData.status = status;
    if (comments !== undefined) updateData.comments = comments;
    
    const [updated] = await db
      .update(clinicInvoices)
      .set(updateData)
      .where(eq(clinicInvoices.id, invoiceId))
      .returning();
    
    res.json(updated);
  } catch (error) {
    logger.error("Error updating invoice:", error);
    res.status(500).json({ message: "Failed to update invoice" });
  }
});

// Delete invoice
router.delete('/api/clinic/:hospitalId/invoices/:invoiceId', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req, res) => {
  try {
    const { hospitalId, invoiceId } = req.params;
    
    // Verify invoice belongs to hospital
    const existing = await db
      .select()
      .from(clinicInvoices)
      .where(
        and(
          eq(clinicInvoices.hospitalId, hospitalId),
          eq(clinicInvoices.id, invoiceId)
        )
      )
      .limit(1);
    
    if (existing.length === 0) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    
    // Items are deleted automatically due to onDelete: 'cascade'
    await db
      .delete(clinicInvoices)
      .where(eq(clinicInvoices.id, invoiceId));
    
    res.status(204).send();
  } catch (error) {
    logger.error("Error deleting invoice:", error);
    res.status(500).json({ message: "Failed to delete invoice" });
  }
});

// Update invoice status
router.patch('/api/clinic/:hospitalId/invoices/:invoiceId/status', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req, res) => {
  try {
    const { hospitalId, invoiceId } = req.params;
    const { status } = req.body;
    
    if (!status || !['draft', 'paid'].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    
    // Verify invoice belongs to hospital
    const existing = await db
      .select()
      .from(clinicInvoices)
      .where(
        and(
          eq(clinicInvoices.hospitalId, hospitalId),
          eq(clinicInvoices.id, invoiceId)
        )
      )
      .limit(1);
    
    if (existing.length === 0) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    
    await db
      .update(clinicInvoices)
      .set({ status })
      .where(eq(clinicInvoices.id, invoiceId));
    
    res.json({ success: true });
  } catch (error) {
    logger.error("Error updating invoice status:", error);
    res.status(500).json({ message: "Failed to update invoice status" });
  }
});

// Get items with patient prices for invoice item picker
router.get('/api/clinic/:hospitalId/items-with-prices', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { unitId } = req.query;
    
    // Build where condition
    const conditions = [eq(items.hospitalId, hospitalId)];
    if (unitId && typeof unitId === 'string') {
      conditions.push(eq(items.unitId, unitId));
    }
    
    const itemsWithPrices = await db
      .select({
        id: items.id,
        name: items.name,
        description: items.description,
        patientPrice: items.patientPrice,
      })
      .from(items)
      .where(and(...conditions))
      .orderBy(items.name);
    
    // Get item codes for all items
    const itemIds = itemsWithPrices.map(item => item.id);
    const codes = itemIds.length > 0 ? await db
      .select({
        itemId: itemCodes.itemId,
        gtin: itemCodes.gtin,
        pharmacode: itemCodes.pharmacode,
      })
      .from(itemCodes)
      .where(inArray(itemCodes.itemId, itemIds)) : [];
    
    // Map codes to items
    const codesMap = new Map(codes.map(c => [c.itemId, c]));
    
    const enrichedItems = itemsWithPrices.map(item => ({
      ...item,
      gtin: codesMap.get(item.id)?.gtin || null,
      pharmacode: codesMap.get(item.id)?.pharmacode || null,
    }));
    
    // Debug log for price issue
    logger.info('Items with prices:', enrichedItems.filter(i => i.patientPrice).map(i => ({ name: i.name, patientPrice: i.patientPrice })));
    
    res.json(enrichedItems);
  } catch (error) {
    logger.error("Error fetching items with prices:", error);
    res.status(500).json({ message: "Failed to fetch items" });
  }
});

// Get all billable items from all hospital units
router.get('/api/clinic/:hospitalId/billable-items', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    // Get all items marked as billable from all units in the hospital
    const billableItems = await db
      .select({
        id: items.id,
        name: items.name,
        description: items.description,
        patientPrice: items.patientPrice,
        unitId: items.unitId,
      })
      .from(items)
      .innerJoin(units, eq(items.unitId, units.id))
      .where(
        and(
          eq(items.hospitalId, hospitalId),
          eq(items.isInvoiceable, true),
          eq(items.status, 'active')
        )
      )
      .orderBy(items.name);
    
    // Get item codes for all items
    const itemIds = billableItems.map(item => item.id);
    const codes = itemIds.length > 0 ? await db
      .select({
        itemId: itemCodes.itemId,
        gtin: itemCodes.gtin,
        pharmacode: itemCodes.pharmacode,
      })
      .from(itemCodes)
      .where(inArray(itemCodes.itemId, itemIds)) : [];
    
    // Get unit names
    const unitIds = Array.from(new Set(billableItems.map(item => item.unitId)));
    const unitData = unitIds.length > 0 ? await db
      .select({ id: units.id, name: units.name })
      .from(units)
      .where(inArray(units.id, unitIds)) : [];
    const unitMap = new Map(unitData.map(u => [u.id, u.name]));
    
    // Map codes and unit names to items
    const codesMap = new Map(codes.map(c => [c.itemId, c]));
    
    const enrichedItems = billableItems.map(item => ({
      ...item,
      gtin: codesMap.get(item.id)?.gtin || null,
      pharmacode: codesMap.get(item.id)?.pharmacode || null,
      unitName: unitMap.get(item.unitId) || null,
    }));
    
    res.json(enrichedItems);
  } catch (error) {
    logger.error("Error fetching billable items:", error);
    res.status(500).json({ message: "Failed to fetch billable items" });
  }
});

// Get all billable services from all hospital units
router.get('/api/clinic/:hospitalId/billable-services', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    // Get all services marked as billable from all units in the hospital
    const billableServices = await db
      .select({
        id: clinicServices.id,
        name: clinicServices.name,
        description: clinicServices.description,
        price: clinicServices.price,
        unitId: clinicServices.unitId,
      })
      .from(clinicServices)
      .innerJoin(units, eq(clinicServices.unitId, units.id))
      .where(
        and(
          eq(clinicServices.hospitalId, hospitalId),
          eq(clinicServices.isInvoiceable, true)
        )
      )
      .orderBy(clinicServices.name);
    
    // Get unit names
    const unitIds = Array.from(new Set(billableServices.map(s => s.unitId)));
    const unitData = unitIds.length > 0 ? await db
      .select({ id: units.id, name: units.name })
      .from(units)
      .where(inArray(units.id, unitIds)) : [];
    const unitMap = new Map(unitData.map(u => [u.id, u.name]));
    
    const enrichedServices = billableServices.map(service => ({
      ...service,
      unitName: unitMap.get(service.unitId) || null,
    }));
    
    res.json(enrichedServices);
  } catch (error) {
    logger.error("Error fetching billable services:", error);
    res.status(500).json({ message: "Failed to fetch billable services" });
  }
});

// Get hospital company data for invoices
router.get('/api/clinic/:hospitalId/company-data', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    const hospital = await storage.getHospital(hospitalId);
    
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }
    
    res.json({
      companyName: (hospital as any).companyName || hospital.name,
      companyStreet: (hospital as any).companyStreet || '',
      companyPostalCode: (hospital as any).companyPostalCode || '',
      companyCity: (hospital as any).companyCity || '',
      companyPhone: (hospital as any).companyPhone || '',
      companyFax: (hospital as any).companyFax || '',
      companyEmail: (hospital as any).companyEmail || '',
      companyLogoUrl: (hospital as any).companyLogoUrl || '',
    });
  } catch (error) {
    logger.error("Error fetching company data:", error);
    res.status(500).json({ message: "Failed to fetch company data" });
  }
});

// Update hospital company data for invoices
router.patch('/api/clinic/:hospitalId/company-data', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;
    
    // Check if user is admin for this hospital
    const hospitals = await storage.getUserHospitals(userId);
    const userHospital = hospitals.find(h => h.id === hospitalId);
    
    if (!userHospital || userHospital.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required to update company data" });
    }
    
    const { 
      companyName, 
      companyStreet, 
      companyPostalCode, 
      companyCity, 
      companyPhone, 
      companyFax, 
      companyEmail,
      companyLogoUrl 
    } = req.body;
    
    // Import hospitals table for direct update
    const { hospitals: hospitalsTable } = await import("@shared/schema");
    
    const [updated] = await db
      .update(hospitalsTable)
      .set({
        companyName: companyName || null,
        companyStreet: companyStreet || null,
        companyPostalCode: companyPostalCode || null,
        companyCity: companyCity || null,
        companyPhone: companyPhone || null,
        companyFax: companyFax || null,
        companyEmail: companyEmail || null,
        companyLogoUrl: companyLogoUrl || null,
        updatedAt: new Date(),
      })
      .where(eq(hospitalsTable.id, hospitalId))
      .returning();
    
    res.json({
      companyName: updated.companyName,
      companyStreet: updated.companyStreet,
      companyPostalCode: updated.companyPostalCode,
      companyCity: updated.companyCity,
      companyPhone: updated.companyPhone,
      companyFax: updated.companyFax,
      companyEmail: updated.companyEmail,
      companyLogoUrl: updated.companyLogoUrl,
    });
  } catch (error) {
    logger.error("Error updating company data:", error);
    res.status(500).json({ message: "Failed to update company data" });
  }
});

// Send invoice via email
router.post('/api/clinic/:hospitalId/invoices/:invoiceId/send-email', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req, res) => {
  try {
    const { hospitalId, invoiceId } = req.params;
    const { email, pdfBase64, language, saveEmailToPatient } = req.body;
    
    if (!email || !pdfBase64) {
      return res.status(400).json({ message: "Email and PDF data are required" });
    }
    
    // Strip data URI prefix if present (data:application/pdf;base64,)
    let cleanPdfBase64 = pdfBase64;
    if (typeof pdfBase64 === 'string' && pdfBase64.includes(',')) {
      cleanPdfBase64 = pdfBase64.split(',').pop() || pdfBase64;
    }
    
    // Get invoice details
    const invoice = await db
      .select()
      .from(clinicInvoices)
      .where(
        and(
          eq(clinicInvoices.hospitalId, hospitalId),
          eq(clinicInvoices.id, invoiceId)
        )
      )
      .limit(1);
    
    if (invoice.length === 0) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    
    // Get hospital/clinic name
    const { hospitals: hospitalsTable } = await import("@shared/schema");
    const hospital = await db
      .select()
      .from(hospitalsTable)
      .where(eq(hospitalsTable.id, hospitalId))
      .limit(1);
    
    const clinicName = hospital[0]?.companyName || hospital[0]?.name || 'Clinic';
    
    // Send email
    const { sendInvoiceEmail } = await import('../resend');
    const result = await sendInvoiceEmail(
      email,
      invoice[0].invoiceNumber,
      invoice[0].customerName,
      invoice[0].total,
      clinicName,
      cleanPdfBase64,
      language || 'de'
    );
    
    if (!result.success) {
      return res.status(500).json({ message: "Failed to send email", error: result.error });
    }
    
    // Update invoice status to 'sent' if it was draft
    if (invoice[0].status === 'draft') {
      await db
        .update(clinicInvoices)
        .set({ status: 'sent' })
        .where(eq(clinicInvoices.id, invoiceId));
    }
    
    // Optionally save email to patient
    if (saveEmailToPatient && invoice[0].patientId) {
      const { patients: patientsTable } = await import("@shared/schema");
      await db
        .update(patientsTable)
        .set({ email })
        .where(eq(patientsTable.id, invoice[0].patientId));
    }
    
    res.json({ success: true, message: "Invoice sent successfully" });
  } catch (error) {
    logger.error("Error sending invoice email:", error);
    res.status(500).json({ message: "Failed to send invoice email" });
  }
});

// Get patient email for invoice
router.get('/api/clinic/:hospitalId/invoices/:invoiceId/patient-email', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId, invoiceId } = req.params;
    
    const invoice = await db
      .select()
      .from(clinicInvoices)
      .where(
        and(
          eq(clinicInvoices.hospitalId, hospitalId),
          eq(clinicInvoices.id, invoiceId)
        )
      )
      .limit(1);
    
    if (invoice.length === 0 || !invoice[0].patientId) {
      return res.json({ email: null });
    }
    
    const { patients: patientsTable } = await import("@shared/schema");
    const patient = await db
      .select({ email: patientsTable.email })
      .from(patientsTable)
      .where(eq(patientsTable.id, invoice[0].patientId))
      .limit(1);
    
    res.json({ email: patient[0]?.email || null });
  } catch (error) {
    logger.error("Error fetching patient email:", error);
    res.status(500).json({ message: "Failed to fetch patient email" });
  }
});

// ========================================
// Appointment notification helper
// ========================================

export async function sendAppointmentNotification(
  appointmentId: string,
  hospitalId: string,
  type: 'confirmation' | 'reschedule' | 'cancellation'
) {
  try {
    const appointment = await storage.getClinicAppointment(appointmentId);
    if (!appointment?.patientId) return;

    const patient = await storage.getPatient(appointment.patientId);
    if (!patient) return;

    const hospital = await storage.getHospital(hospitalId);
    if (!hospital) return;

    let providerName = '';
    if (appointment.providerId) {
      const provider = await storage.getUser(appointment.providerId);
      if (provider) {
        providerName = `${provider.firstName || ''} ${provider.lastName || ''}`.trim();
      }
    }

    const lang = (hospital.defaultLanguage as string) || 'de';
    const isGerman = lang === 'de';
    const tz = hospital.timezone || 'Europe/Zurich';
    const dateLocale = isGerman ? 'de-CH' : 'en-GB';

    // Format date and time using hospital regional settings
    const dateObj = new Date(`${appointment.appointmentDate}T${appointment.startTime}:00`);
    const formattedDate = dateObj.toLocaleDateString(dateLocale, { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' });
    const formattedTime = appointment.startTime;

    const clinicName = hospital.name;
    const patientName = patient.firstName || '';

    // Generate manage link for confirmation and reschedule messages (not cancellation)
    let manageUrl = '';
    if (type !== 'cancellation' && appointment.appointmentType === 'external') {
      try {
        const { randomUUID } = await import('crypto');
        const cancelToken = randomUUID();
        const tokenExpiresAt = new Date(`${appointment.appointmentDate}T${appointment.startTime}:00`);
        await storage.createAppointmentActionToken({
          appointmentId: appointment.id,
          hospitalId,
          token: cancelToken,
          action: 'cancel',
          used: false,
          expiresAt: tokenExpiresAt,
        });
        const baseUrl = process.env.PRODUCTION_URL || 'https://use.viali.app';
        manageUrl = `${baseUrl}/manage-appointment/${cancelToken}`;
      } catch (tokenErr) {
        logger.error('Failed to generate cancel token for appointment notification:', tokenErr);
      }
    }

    // Try SMS first, then email fallback
    let channel: 'sms' | 'email' | null = null;
    let recipient = '';
    let success = false;
    let sentMessageText = '';

    if (patient.phone) {
      const { isSmsConfiguredForHospital, sendSms } = await import('../sms');
      const smsAvailable = await isSmsConfiguredForHospital(hospitalId);
      if (smsAvailable) {
        const manageSuffix = manageUrl
          ? (isGerman ? `\nTermininfo & Verwaltung: ${manageUrl}` : `\nAppointment Info: ${manageUrl}`)
          : '';
        const videoSuffix = (appointment.isVideoAppointment && appointment.videoMeetingLink)
          ? (isGerman ? `\n📹 Video-Termin: ${appointment.videoMeetingLink}` : `\n📹 Video call: ${appointment.videoMeetingLink}`)
          : '';
        const smsMessages: Record<string, { de: string; en: string }> = {
          confirmation: {
            de: `Liebe/r ${patientName}, Ihr Termin bei ${clinicName} am ${formattedDate} um ${formattedTime}${providerName ? ` bei ${providerName}` : ''} wurde bestätigt. Wir freuen uns auf Ihren Besuch!${videoSuffix}${manageSuffix || ' Bei Fragen kontaktieren Sie uns bitte direkt.'}`,
            en: `Dear ${patientName}, your appointment at ${clinicName} on ${formattedDate} at ${formattedTime}${providerName ? ` with ${providerName}` : ''} has been confirmed. We look forward to seeing you!${videoSuffix}${manageSuffix || ' For questions, please contact us directly.'}`,
          },
          reschedule: {
            de: `Liebe/r ${patientName}, Ihr Termin bei ${clinicName} wurde auf den ${formattedDate} um ${formattedTime}${providerName ? ` bei ${providerName}` : ''} verschoben. Wir freuen uns auf Ihren Besuch!${videoSuffix}${manageSuffix || ' Bei Fragen kontaktieren Sie uns bitte direkt.'}`,
            en: `Dear ${patientName}, your appointment at ${clinicName} has been rescheduled to ${formattedDate} at ${formattedTime}${providerName ? ` with ${providerName}` : ''}. We look forward to seeing you!${videoSuffix}${manageSuffix || ' For questions, please contact us directly.'}`,
          },
          cancellation: {
            de: `Ihr Termin am ${formattedDate} um ${formattedTime} bei ${clinicName} wurde abgesagt. Bei Fragen kontaktieren Sie uns bitte direkt.`,
            en: `Your appointment on ${formattedDate} at ${formattedTime} at ${clinicName} has been cancelled. For questions, please contact us directly.`,
          },
        };
        const smsText = smsMessages[type][isGerman ? 'de' : 'en'];

        const result = await sendSms(patient.phone, smsText, hospitalId);
        if (result.success) {
          channel = 'sms';
          recipient = patient.phone;
          success = true;
          sentMessageText = smsText;
        }
      }
    }

    // Email fallback if SMS not sent
    if (!success && patient.email) {
      const { sendAppointmentConfirmationEmail, sendAppointmentRescheduleEmail, sendAppointmentCancellationEmail } = await import('../resend');
      if (type === 'cancellation') {
        const result = await sendAppointmentCancellationEmail(patient.email, patientName, clinicName, formattedDate, formattedTime, lang);
        if (result.success) { channel = 'email'; recipient = patient.email; success = true; sentMessageText = isGerman ? `Terminabsage: ${formattedDate} um ${formattedTime}` : `Appointment cancelled: ${formattedDate} at ${formattedTime}`; }
      } else {
        // For confirmation and reschedule, use versions with manage link + video link
        const videoLink = (appointment.isVideoAppointment && appointment.videoMeetingLink) ? appointment.videoMeetingLink : '';
        const noShowFeeMsg = hospital.noShowFeeMessage || '';
        const hideCancel = hospital.hidePatientCancel || false;
        const result = type === 'reschedule'
          ? await sendAppointmentRescheduleEmail(patient.email, patientName, clinicName, formattedDate, formattedTime, lang, manageUrl, providerName, videoLink, noShowFeeMsg, hideCancel)
          : await sendAppointmentConfirmationEmail(patient.email, patientName, clinicName, formattedDate, formattedTime, lang, manageUrl, providerName, videoLink, noShowFeeMsg, hideCancel);
        if (result.success) { channel = 'email'; recipient = patient.email; success = true; sentMessageText = isGerman ? `[E-Mail] Terminbestätigung: ${formattedDate} um ${formattedTime}` : `[Email] Appointment confirmation: ${formattedDate} at ${formattedTime}`; }
      }
    }

    // Log to patient_messages
    if (success && channel) {
      const messageTypes = { confirmation: 'appointment_confirmation', reschedule: 'appointment_reschedule', cancellation: 'appointment_cancellation' };
      const messageType = messageTypes[type];

      await storage.createPatientMessage({
        hospitalId,
        patientId: patient.id,
        sentBy: null,
        channel,
        recipient,
        message: sentMessageText,
        status: 'sent',
        isAutomatic: true,
        messageType,
      });
    }
  } catch (err) {
    logger.error(`Failed to send appointment ${type} notification for ${appointmentId}:`, err);
  }
}

// ========================================
// Clinic Appointments CRUD
// ========================================

import {
  clinicAppointments,
  providerAvailability,
  providerTimeOff,
  providerAbsences,
  timebutlerConfig,
  insertClinicAppointmentSchema,
  insertProviderAvailabilitySchema,
  insertProviderTimeOffSchema,
  users,
} from "@shared/schema";

// List appointments for entire hospital (shared calendar)
router.get('/api/clinic/:hospitalId/appointments', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { providerId, patientId, startDate, endDate, status, unitId } = req.query;
    
    const appointments = await storage.getClinicAppointmentsByHospital(hospitalId, {
      providerId: providerId as string,
      patientId: patientId as string,
      startDate: startDate as string,
      endDate: endDate as string,
      status: status as string,
      unitId: unitId as string,
    });
    
    res.json(appointments);
  } catch (error) {
    logger.error("Error fetching appointments:", error);
    res.status(500).json({ message: "Failed to fetch appointments" });
  }
});

// List appointments for a unit (legacy endpoint - redirects to hospital query)
router.get('/api/clinic/:hospitalId/units/:unitId/appointments', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { hospitalId, unitId } = req.params;
    const { providerId, patientId, startDate, endDate, status } = req.query;
    
    const appointments = await storage.getClinicAppointments(unitId, {
      providerId: providerId as string,
      patientId: patientId as string,
      startDate: startDate as string,
      endDate: endDate as string,
      status: status as string,
    });
    
    res.json(appointments);
  } catch (error) {
    logger.error("Error fetching appointments:", error);
    res.status(500).json({ message: "Failed to fetch appointments" });
  }
});

// Get single appointment
router.get('/api/clinic/:hospitalId/appointments/:appointmentId', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { appointmentId } = req.params;
    
    const appointment = await storage.getClinicAppointment(appointmentId);
    
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }
    
    res.json(appointment);
  } catch (error) {
    logger.error("Error fetching appointment:", error);
    res.status(500).json({ message: "Failed to fetch appointment" });
  }
});

// Get staff availability for a specific date (for Plan Staff dialog)
router.get('/api/clinic/:hospitalId/staff-availability', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { staffIds, date } = req.query;
    
    if (!date) {
      return res.status(400).json({ message: "Date is required" });
    }
    
    // Parse staffIds - can be comma-separated or array
    let staffIdList: string[] = [];
    if (staffIds) {
      if (Array.isArray(staffIds)) {
        staffIdList = staffIds as string[];
      } else {
        staffIdList = (staffIds as string).split(',').filter(Boolean);
      }
    }
    
    if (staffIdList.length === 0) {
      return res.json({});
    }
    
    const availability = await storage.getMultipleStaffAvailability(staffIdList, hospitalId, date as string);
    res.json(availability);
  } catch (error) {
    logger.error("Error fetching staff availability:", error);
    res.status(500).json({ message: "Failed to fetch staff availability" });
  }
});

// Parse DD.MM.YYYY or YYYY-MM-DD date string to Date object
function parseLeadDate(dateStr: string): Date {
  const dotMatch = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotMatch) {
    return new Date(parseInt(dotMatch[3]), parseInt(dotMatch[2]) - 1, parseInt(dotMatch[1]));
  }
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
  }
  return new Date(); // Fallback to now
}

// Create appointment
router.post('/api/clinic/:hospitalId/units/:unitId/appointments', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId, unitId } = req.params;
    const userId = req.user.id;
    
    // Calculate duration from start and end time
    const { startTime, endTime, providerId, appointmentDate } = req.body;
    let durationMinutes = 30; // default
    if (startTime && endTime) {
      const [startHours, startMins] = startTime.split(':').map(Number);
      const [endHours, endMins] = endTime.split(':').map(Number);
      durationMinutes = (endHours * 60 + endMins) - (startHours * 60 + startMins);
      if (durationMinutes <= 0) {
        return res.status(400).json({ 
          message: 'End time must be after start time',
          code: 'INVALID_TIME_RANGE'
        });
      }
    }
    
    // Validate provider availability before creating appointment (skip for internal meetings)
    if (providerId && appointmentDate && startTime && req.body.appointmentType !== 'internal') {
      // Use getAvailableSlots which handles all edge cases:
      // - Weekly availability schedule
      // - Time off / absences (Timebutler)
      // - Existing surgeries and appointments
      // - Availability windows for windows_required mode
      const availableSlots = await storage.getAvailableSlots(providerId, unitId, appointmentDate, durationMinutes, hospitalId);

      // Check if the requested time slot is available
      const requestedStartTime = startTime;
      const requestedEndTime = endTime || (() => {
        const [h, m] = startTime.split(':').map(Number);
        const endMins = h * 60 + m + durationMinutes;
        return `${String(Math.floor(endMins / 60)).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`;
      })();
      
      // If no slots available at all on this day, provider is not available
      if (availableSlots.length === 0) {
        return res.status(400).json({ 
          message: `Provider is not available on this date. They may be off, have other commitments, or the schedule doesn't allow bookings.`,
          code: 'PROVIDER_NOT_AVAILABLE'
        });
      }
      
      // Merge available slots into continuous ranges, then check if requested time fits
      const [reqStartH, reqStartM] = requestedStartTime.split(':').map(Number);
      const [reqEndH, reqEndM] = requestedEndTime.split(':').map(Number);
      const reqStartMins = reqStartH * 60 + reqStartM;
      const reqEndMins = reqEndH * 60 + reqEndM;

      // Convert slots to minute ranges, sort, and merge overlapping/adjacent ones
      const slotRanges = availableSlots.map(slot => {
        const [sh, sm] = slot.startTime.split(':').map(Number);
        const [eh, em] = slot.endTime.split(':').map(Number);
        return { start: sh * 60 + sm, end: eh * 60 + em };
      }).sort((a, b) => a.start - b.start);

      const mergedRanges: { start: number; end: number }[] = [];
      for (const range of slotRanges) {
        const last = mergedRanges[mergedRanges.length - 1];
        if (last && range.start <= last.end) {
          last.end = Math.max(last.end, range.end);
        } else {
          mergedRanges.push({ ...range });
        }
      }

      const isSlotAvailable = mergedRanges.some(range =>
        reqStartMins >= range.start && reqEndMins <= range.end
      );
      
      if (!isSlotAvailable) {
        // Get the available hours for a helpful error message
        const firstSlot = availableSlots[0];
        const lastSlot = availableSlots[availableSlots.length - 1];
        return res.status(400).json({ 
          message: `The requested time slot is not available. Provider is available from ${firstSlot.startTime} to ${lastSlot.endTime} on this date.`,
          code: 'SLOT_NOT_AVAILABLE'
        });
      }
    }
    
    // Extract referral fields before passing to appointment schema
    const { referralSource, referralSourceDetail, referralCreatedAt, ...appointmentBody } = req.body;

    const validatedData = insertClinicAppointmentSchema.parse({
      ...appointmentBody,
      hospitalId,
      unitId,
      durationMinutes,
      createdBy: userId,
      status: 'confirmed',
    });

    const appointment = await storage.createClinicAppointment(validatedData);

    // Create referral event if staff selected a referral source
    if (referralSource) {
      try {
        const { referralEvents } = await import("@shared/schema");
        if (appointment.patientId) {
          await db.insert(referralEvents).values({
            hospitalId,
            patientId: appointment.patientId,
            appointmentId: appointment.id,
            source: referralSource as "social" | "search_engine" | "llm" | "word_of_mouth" | "belegarzt" | "other",
            sourceDetail: referralSourceDetail || undefined,
            captureMethod: "staff",
            ...(referralCreatedAt ? { createdAt: parseLeadDate(referralCreatedAt) } : {}),
          });
        }
      } catch (err) {
        logger.error(`Failed to create referral event for appointment ${appointment.id}:`, err);
      }
    }

    // Async sync to Cal.com (don't block response)
    (async () => {
      try {
        const { syncSingleAppointment } = await import("../services/calcomSync");
        await syncSingleAppointment(appointment.id);
      } catch (err) {
        logger.error(`Failed to sync appointment ${appointment.id} to Cal.com:`, err);
      }
    })();

    // Async send confirmation notification (don't block response)
    if (appointment.patientId) {
      sendAppointmentNotification(appointment.id, hospitalId, 'confirmation');
    }

    res.status(201).json(appointment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error creating appointment:", error);
    res.status(500).json({ message: "Failed to create appointment" });
  }
});

// Schema for updating appointments - only allow safe fields
const updateAppointmentSchema = z.object({
  status: z.enum(["scheduled", "confirmed", "arrived", "in_progress", "completed", "cancelled", "no_show"]).optional(),
  appointmentDate: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  notes: z.string().nullable().optional(),
  serviceId: z.string().nullable().optional(),
  providerId: z.string().optional(),
  isVideoAppointment: z.boolean().optional(),
  videoMeetingLink: z.string().nullable().optional(),
});

// Update appointment
router.patch('/api/clinic/:hospitalId/appointments/:appointmentId', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req, res) => {
  try {
    const { hospitalId, appointmentId } = req.params;
    
    const existing = await storage.getClinicAppointment(appointmentId);
    if (!existing) {
      return res.status(404).json({ message: "Appointment not found" });
    }
    
    // Security: Verify appointment belongs to this hospital
    if (existing.hospitalId !== hospitalId) {
      return res.status(403).json({ message: "Access denied to this appointment" });
    }
    
    // Capture before Zod parse strips unknown keys
    const sendNotification = req.body.sendNotification;

    // Validate update payload with Zod schema
    const validatedData = updateAppointmentSchema.parse(req.body);
    
    // Auto-set actual times based on status transitions
    const updateData: any = { ...validatedData };
    const now = new Date();
    
    if (validatedData.status === 'in_progress' && existing.status !== 'in_progress') {
      // Starting the appointment - set actual start time
      updateData.actualStartTime = now;
    }
    
    if (validatedData.status === 'completed' && existing.status !== 'completed') {
      // Completing the appointment - set actual end time
      updateData.actualEndTime = now;
      // Also set actualStartTime if not already set (edge case: direct completion)
      if (!existing.actualStartTime) {
        updateData.actualStartTime = now;
      }
    }
    
    const updated = await storage.updateClinicAppointment(appointmentId, updateData);

    // If time, date, or provider changed, send reschedule notification
    const timeChanged = (validatedData.appointmentDate && validatedData.appointmentDate !== existing.appointmentDate)
      || (validatedData.startTime && validatedData.startTime !== existing.startTime)
      || (validatedData.endTime && validatedData.endTime !== existing.endTime);
    const providerChanged = validatedData.providerId && validatedData.providerId !== existing.providerId;

    if ((timeChanged || providerChanged) && updated.patientId && sendNotification !== false) {
      sendAppointmentNotification(updated.id, hospitalId, 'reschedule');
    }

    // If status changed to cancelled, send cancellation notification
    if (validatedData.status === 'cancelled' && existing.status !== 'cancelled' && updated.patientId) {
      sendAppointmentNotification(updated.id, hospitalId, 'cancellation');
    }

    // Async sync to Cal.com (don't block response)
    (async () => {
      try {
        const { syncSingleAppointment, deleteCalcomBlock } = await import("../services/calcomSync");
        // If cancelled/no_show, delete the busy block; otherwise sync updated time
        if (updated.status === 'cancelled' || updated.status === 'no_show') {
          if (updated.calcomBookingUid) {
            await deleteCalcomBlock(updated.calcomBookingUid, updated.hospitalId);
          }
        } else {
          await syncSingleAppointment(updated.id);
        }
      } catch (err) {
        logger.error(`Failed to sync appointment ${updated.id} to Cal.com:`, err);
      }
    })();
    
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error updating appointment:", error);
    res.status(500).json({ message: "Failed to update appointment" });
  }
});

// Get referral event for an appointment
router.get('/api/clinic/:hospitalId/appointments/:appointmentId/referral', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId, appointmentId } = req.params;
    const { referralEvents } = await import("@shared/schema");
    const [event] = await db
      .select()
      .from(referralEvents)
      .where(and(eq(referralEvents.appointmentId, appointmentId), eq(referralEvents.hospitalId, hospitalId)))
      .limit(1);
    res.json(event || null);
  } catch (error) {
    logger.error("Error fetching referral event:", error);
    res.status(500).json({ message: "Failed to fetch referral event" });
  }
});

// Upsert referral source for an appointment
router.put('/api/clinic/:hospitalId/appointments/:appointmentId/referral', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req, res) => {
  try {
    const { hospitalId, appointmentId } = req.params;
    const { source, sourceDetail } = req.body;

    if (!source || !["social", "search_engine", "llm", "word_of_mouth", "belegarzt", "other"].includes(source)) {
      return res.status(400).json({ message: "Invalid referral source" });
    }

    const existing = await storage.getClinicAppointment(appointmentId);
    if (!existing || existing.hospitalId !== hospitalId) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    const { referralEvents } = await import("@shared/schema");

    // Check if referral event already exists for this appointment
    const [existingEvent] = await db
      .select()
      .from(referralEvents)
      .where(and(eq(referralEvents.appointmentId, appointmentId), eq(referralEvents.hospitalId, hospitalId)))
      .limit(1);

    if (existingEvent) {
      const [updated] = await db
        .update(referralEvents)
        .set({ source, sourceDetail: sourceDetail || null })
        .where(eq(referralEvents.id, existingEvent.id))
        .returning();
      return res.json(updated);
    }

    // Create new referral event
    if (!existing.patientId) {
      return res.status(400).json({ message: "Appointment has no patient" });
    }
    const [created] = await db
      .insert(referralEvents)
      .values({
        hospitalId,
        patientId: existing.patientId,
        appointmentId,
        source: source as any,
        sourceDetail: sourceDetail || null,
        captureMethod: "staff",
      })
      .returning();
    res.json(created);
  } catch (error) {
    logger.error("Error upserting referral event:", error);
    res.status(500).json({ message: "Failed to update referral source" });
  }
});

// Delete appointment
router.delete('/api/clinic/:hospitalId/appointments/:appointmentId', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req, res) => {
  try {
    const { hospitalId, appointmentId } = req.params;
    
    const existing = await storage.getClinicAppointment(appointmentId);
    if (!existing) {
      return res.status(404).json({ message: "Appointment not found" });
    }
    
    // Security: Verify appointment belongs to this hospital
    if (existing.hospitalId !== hospitalId) {
      return res.status(403).json({ message: "Access denied to this appointment" });
    }
    
    // Send cancellation notification before deleting (need appointment data)
    // Skip if already cancelled — patient was already notified during the status change
    if (existing.patientId && existing.status !== 'cancelled') {
      sendAppointmentNotification(appointmentId, hospitalId, 'cancellation');
    }

    // Delete from Cal.com if synced (async, don't block response)
    if (existing.calcomBookingUid) {
      (async () => {
        try {
          const { deleteCalcomBlock } = await import("../services/calcomSync");
          await deleteCalcomBlock(existing.calcomBookingUid!, hospitalId);
        } catch (err) {
          logger.error(`Failed to delete Cal.com block for appointment ${appointmentId}:`, err);
        }
      })();
    }
    
    await storage.deleteClinicAppointment(appointmentId);
    
    res.status(204).send();
  } catch (error) {
    logger.error("Error deleting appointment:", error);
    res.status(500).json({ message: "Failed to delete appointment" });
  }
});

// Get available slots for a provider on a specific date
router.get('/api/clinic/:hospitalId/units/:unitId/providers/:providerId/available-slots', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId, unitId, providerId } = req.params;
    const { date, duration } = req.query;

    if (!date) {
      return res.status(400).json({ message: "Date is required" });
    }

    const durationMinutes = parseInt(duration as string) || 30;

    const slots = await storage.getAvailableSlots(providerId, unitId, date as string, durationMinutes, hospitalId);
    
    res.json(slots);
  } catch (error) {
    logger.error("Error fetching available slots:", error);
    res.status(500).json({ message: "Failed to fetch available slots" });
  }
});

// ========================================
// Clinic Providers Management (Bookable Providers) - Hospital Level
// ========================================

// Get all clinic providers for hospital (includes non-bookable)
router.get('/api/clinic/:hospitalId/clinic-providers', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    const providers = await storage.getClinicProvidersByHospital(hospitalId);
    
    res.json(providers);
  } catch (error) {
    logger.error("Error fetching clinic providers:", error);
    res.status(500).json({ message: "Failed to fetch clinic providers" });
  }
});

// Get bookable providers for hospital (only those with isBookable=true)
// When ?unitId= is provided and that unit has hasOwnCalendar, returns only unit-specific providers
router.get('/api/clinic/:hospitalId/bookable-providers', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const unitId = req.query.unitId as string | undefined;

    if (unitId) {
      const scope = await getCalendarScope(unitId, hospitalId);
      if (scope.hasOwnCalendar) {
        const providers = await storage.getBookableProvidersByUnit(unitId);
        return res.json(providers);
      }
    }

    const providers = await storage.getBookableProvidersByHospital(hospitalId);
    res.json(providers);
  } catch (error) {
    logger.error("Error fetching bookable providers:", error);
    res.status(500).json({ message: "Failed to fetch bookable providers" });
  }
});

// Search hospital users for internal booking (colleague search)
router.get('/api/hospitals/:hospitalId/users', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { search } = req.query;

    const hospitalUsers = await storage.getHospitalUsers(hospitalId);
    
    // Filter by search term if provided
    let filteredUsers = hospitalUsers;
    if (search && typeof search === 'string' && search.length >= 2) {
      const searchLower = search.toLowerCase();
      filteredUsers = hospitalUsers.filter(hu => {
        const firstName = hu.user?.firstName?.toLowerCase() || '';
        const lastName = hu.user?.lastName?.toLowerCase() || '';
        const email = hu.user?.email?.toLowerCase() || '';
        return firstName.includes(searchLower) || 
               lastName.includes(searchLower) || 
               email.includes(searchLower) ||
               `${firstName} ${lastName}`.includes(searchLower);
      });
    }
    
    // Deduplicate by user ID and return user info
    const userMap = new Map<string, any>();
    for (const hu of filteredUsers) {
      if (hu.user && !userMap.has(hu.user.id)) {
        userMap.set(hu.user.id, {
          id: hu.user.id,
          firstName: hu.user.firstName,
          lastName: hu.user.lastName,
          email: hu.user.email,
        });
      }
    }
    
    res.json(Array.from(userMap.values()));
  } catch (error) {
    logger.error("Error fetching hospital users:", error);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

// Get bookable providers for a unit (filters by unit if hasOwnCalendar is enabled)
router.get('/api/clinic/:hospitalId/units/:unitId/bookable-providers', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId, unitId } = req.params;

    const scope = await getCalendarScope(unitId, hospitalId);
    if (scope.hasOwnCalendar) {
      const providers = await storage.getBookableProvidersByUnit(unitId);
      return res.json(providers);
    }

    const providers = await storage.getBookableProvidersByHospital(hospitalId);
    res.json(providers);
  } catch (error) {
    logger.error("Error fetching bookable providers:", error);
    res.status(500).json({ message: "Failed to fetch bookable providers" });
  }
});

// Toggle provider bookable status (hospital level)
// Updates userHospitalRoles.isBookable for all roles of this user in this hospital
router.put('/api/clinic/:hospitalId/clinic-providers/:userId', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId, userId } = req.params;
    const { isBookable, publicCalendarEnabled, bookingServiceName, bookingLocation } = req.body;

    if (typeof isBookable !== 'boolean' && typeof publicCalendarEnabled !== 'boolean' && bookingServiceName === undefined && bookingLocation === undefined) {
      return res.status(400).json({ message: "At least one field to update must be provided" });
    }

    // Import userHospitalRoles to update directly
    const { userHospitalRoles } = await import("@shared/schema");

    // Build update set — conditionally update isBookable and/or publicCalendarEnabled, optionally update service/location
    const updateSet: Record<string, any> = {};
    if (typeof isBookable === 'boolean') updateSet.isBookable = isBookable;
    if (typeof publicCalendarEnabled === 'boolean') updateSet.publicCalendarEnabled = publicCalendarEnabled;
    if (bookingServiceName !== undefined) updateSet.bookingServiceName = bookingServiceName || null;
    if (bookingLocation !== undefined) updateSet.bookingLocation = bookingLocation || null;

    // If turning off isBookable, also turn off publicCalendarEnabled
    if (isBookable === false) updateSet.publicCalendarEnabled = false;

    // Guard: cannot enable publicCalendarEnabled if isBookable is not (being set to) true
    if (updateSet.publicCalendarEnabled === true && updateSet.isBookable !== true) {
      // Check current isBookable in DB
      const [currentRole] = await db
        .select({ isBookable: userHospitalRoles.isBookable })
        .from(userHospitalRoles)
        .where(and(
          eq(userHospitalRoles.hospitalId, hospitalId),
          eq(userHospitalRoles.userId, userId)
        ))
        .limit(1);
      if (!currentRole?.isBookable) {
        return res.status(400).json({ message: "Provider must be bookable before enabling public calendar" });
      }
    }

    // Update all roles for this user in this hospital
    await db
      .update(userHospitalRoles)
      .set(updateSet)
      .where(
        and(
          eq(userHospitalRoles.hospitalId, hospitalId),
          eq(userHospitalRoles.userId, userId)
        )
      );
    
    // If making bookable, create default availability if none exists
    if (isBookable) {
      // Get one of the user's roles to find a unit
      const [role] = await db
        .select()
        .from(userHospitalRoles)
        .where(
          and(
            eq(userHospitalRoles.hospitalId, hospitalId),
            eq(userHospitalRoles.userId, userId)
          )
        )
        .limit(1);
      
      if (role) {
        const existingAvail = await storage.getProviderAvailability(userId, role.unitId);
        if (existingAvail.length === 0) {
          const defaultAvailability = [1, 2, 3, 4, 5].map(dayOfWeek => ({
            providerId: userId,
            unitId: role.unitId,
            dayOfWeek,
            startTime: "08:00",
            endTime: "18:00",
            slotDurationMinutes: 30,
            isActive: true
          }));
          await storage.setProviderAvailability(userId, role.unitId, defaultAvailability);
        }
      }
    }
    
    // Return updated providers list (ClinicProvider format from userHospitalRoles)
    const providers = await storage.getClinicProvidersByHospital(hospitalId);
    const updatedProvider = providers.find(p => p.userId === userId);
    
    res.json(updatedProvider || { userId, isBookable });
  } catch (error) {
    logger.error("Error setting clinic provider bookable status:", error);
    res.status(500).json({ message: "Failed to update provider status" });
  }
});

// ========================================
// Provider Availability Management
// ========================================

// Get provider availability
// Uses shared hospital calendar if unit doesn't have hasOwnCalendar = true
router.get('/api/clinic/:hospitalId/units/:unitId/providers/:providerId/availability', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId, unitId, providerId } = req.params;
    
    // Determine calendar scope based on unit's hasOwnCalendar setting
    const scope = await getCalendarScope(unitId, hospitalId);
    
    const availability = await storage.getProviderAvailability(
      providerId, 
      scope.effectiveUnitId, 
      scope.effectiveHospitalId
    );
    
    res.json(availability);
  } catch (error) {
    logger.error("Error fetching provider availability:", error);
    res.status(500).json({ message: "Failed to fetch availability" });
  }
});

// Get all weekly schedules for a unit (for calendar availability display)
// Uses shared hospital calendar if unit doesn't have hasOwnCalendar = true
router.get('/api/clinic/:hospitalId/units/:unitId/weekly-schedules', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId, unitId } = req.params;
    
    // Determine calendar scope
    const scope = await getCalendarScope(unitId, hospitalId);
    
    // Get all bookable providers for this hospital
    const providers = await storage.getBookableProvidersByHospital(hospitalId);
    
    // Get weekly schedules for all providers
    const schedules: Record<string, any[]> = {};
    
    await Promise.all(providers.map(async (provider) => {
      const availability = await storage.getProviderAvailability(
        provider.userId, 
        scope.effectiveUnitId,
        scope.effectiveHospitalId
      );
      schedules[provider.userId] = availability;
    }));
    
    res.json(schedules);
  } catch (error) {
    logger.error("Error fetching weekly schedules:", error);
    res.status(500).json({ message: "Failed to fetch weekly schedules" });
  }
});

// Set provider availability (replaces all for this provider/unit)
// Uses shared hospital calendar if unit doesn't have hasOwnCalendar = true
router.put('/api/clinic/:hospitalId/units/:unitId/providers/:providerId/availability', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId, unitId, providerId } = req.params;
    const { availability } = req.body;
    
    if (!Array.isArray(availability)) {
      return res.status(400).json({ message: "Availability must be an array" });
    }
    
    // Determine calendar scope
    const scope = await getCalendarScope(unitId, hospitalId);
    
    const result = await storage.setProviderAvailability(
      providerId, 
      scope.effectiveUnitId, 
      availability,
      scope.effectiveHospitalId
    );
    
    res.json(result);
  } catch (error) {
    logger.error("Error setting provider availability:", error);
    res.status(500).json({ message: "Failed to set availability" });
  }
});

// ========================================
// Provider Time Off Management
// ========================================

// Get provider time off
// Uses shared hospital calendar if unit doesn't have hasOwnCalendar = true
router.get('/api/clinic/:hospitalId/units/:unitId/providers/:providerId/time-off', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId, unitId, providerId } = req.params;
    const { startDate, endDate } = req.query;
    
    // Determine calendar scope
    const scope = await getCalendarScope(unitId, hospitalId);
    
    const timeOff = await storage.getProviderTimeOff(
      providerId, 
      scope.effectiveUnitId, 
      startDate as string, 
      endDate as string,
      scope.effectiveHospitalId
    );
    
    res.json(timeOff);
  } catch (error) {
    logger.error("Error fetching provider time off:", error);
    res.status(500).json({ message: "Failed to fetch time off" });
  }
});

// Create time off
// Uses shared hospital calendar if unit doesn't have hasOwnCalendar = true
router.post('/api/clinic/:hospitalId/units/:unitId/providers/:providerId/time-off', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId, unitId, providerId } = req.params;
    const userId = req.user.id;
    
    // Determine calendar scope
    const scope = await getCalendarScope(unitId, hospitalId);
    
    const validatedData = insertProviderTimeOffSchema.parse({
      ...req.body,
      providerId,
      unitId: scope.effectiveUnitId ?? undefined,
      hospitalId: scope.effectiveUnitId === null ? scope.effectiveHospitalId : undefined,
      createdBy: userId,
    });
    
    const timeOff = await storage.createProviderTimeOff(validatedData);

    // Only send email notifications for vacation and training (skip noisy ones like blocked, sick, etc.)
    if (timeOff.reason === 'vacation' || timeOff.reason === 'training') {
      try {
        const hospitalUsers = await storage.getHospitalUsers(hospitalId);
        const managers = hospitalUsers.filter(u => u.role === 'admin' || u.role === 'manager');
        const provider = await storage.getUser(providerId);
        const hospital = await storage.getHospital(hospitalId);

        if (provider && hospital && managers.length > 0) {
          const { sendTimeOffRequestEmail } = await import('../resend');
          const providerName = `${provider.firstName || ''} ${provider.lastName || ''}`.trim();
          const language = (hospital.defaultLanguage as 'de' | 'en') || 'de';
          const deepLinkUrl = `${process.env.APP_URL || 'https://app.viali.ch'}/business/staff`;

          for (const manager of managers) {
            if (manager.user.email) {
              const managerName = `${manager.user.firstName || ''} ${manager.user.lastName || ''}`.trim();
              await sendTimeOffRequestEmail(
                manager.user.email,
                managerName,
                providerName,
                hospital.name,
                timeOff.startDate,
                timeOff.endDate,
                timeOff.reason || undefined,
                timeOff.isRecurring || false,
                deepLinkUrl,
                language
              );
            }
          }
        }
      } catch (emailError) {
        logger.error("Error sending time-off request notifications:", emailError);
      }
    }

    res.status(201).json(timeOff);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error creating time off:", error);
    res.status(500).json({ message: "Failed to create time off" });
  }
});

// Get all time off for a unit (for calendar display)
// Expands recurring time off into individual occurrences for the requested date range
// Uses shared hospital calendar if unit doesn't have hasOwnCalendar = true
router.get('/api/clinic/:hospitalId/units/:unitId/time-off', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId, unitId } = req.params;
    const { startDate, endDate, expand } = req.query;
    
    // Determine calendar scope
    const scope = await getCalendarScope(unitId, hospitalId);
    
    // Fetch time offs from appropriate scope
    const timeOffs = scope.effectiveUnitId
      ? await storage.getProviderTimeOffsForUnit(
          scope.effectiveUnitId,
          startDate as string | undefined,
          endDate as string | undefined
        )
      : await storage.getProviderTimeOffsForHospital(
          scope.effectiveHospitalId,
          startDate as string | undefined,
          endDate as string | undefined
        );

    // If expand=true and we have date range, expand recurring time off
    if (expand === 'true' && startDate && endDate) {
      const expandedTimeOffs = expandRecurringTimeOff(
        timeOffs,
        startDate as string,
        endDate as string
      );
      return res.json(expandedTimeOffs);
    }

    res.json(timeOffs);
  } catch (error) {
    logger.error("Error fetching time offs for unit:", error);
    res.status(500).json({ message: "Failed to fetch time offs" });
  }
});

// Update time off
router.put('/api/clinic/:hospitalId/time-off/:timeOffId', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req, res) => {
  try {
    const { timeOffId } = req.params;
    const { date, startTime, endTime, reason, notes } = req.body;
    
    const updates: any = {};
    if (date !== undefined) updates.date = date;
    if (startTime !== undefined) updates.startTime = startTime;
    if (endTime !== undefined) updates.endTime = endTime;
    if (reason !== undefined) updates.reason = reason;
    if (notes !== undefined) updates.notes = notes;
    
    const updated = await storage.updateProviderTimeOff(timeOffId, updates);
    
    res.json(updated);
  } catch (error) {
    logger.error("Error updating time off:", error);
    res.status(500).json({ message: "Failed to update time off" });
  }
});

// Delete time off
router.delete('/api/clinic/:hospitalId/time-off/:timeOffId', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req, res) => {
  try {
    const { timeOffId } = req.params;
    
    await storage.deleteProviderTimeOff(timeOffId);
    
    res.status(204).send();
  } catch (error) {
    logger.error("Error deleting time off:", error);
    res.status(500).json({ message: "Failed to delete time off" });
  }
});

// ========================================
// Provider Availability Mode
// ========================================

// Update provider availability mode
router.put('/api/clinic/:hospitalId/providers/:userId/availability-mode', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId, userId } = req.params;
    const { mode } = req.body;
    
    if (!['always_available', 'windows_required'].includes(mode)) {
      return res.status(400).json({ message: "Invalid mode. Must be 'always_available' or 'windows_required'" });
    }
    
    const provider = await storage.updateProviderAvailabilityMode(hospitalId, userId, mode);
    
    res.json(provider);
  } catch (error) {
    logger.error("Error updating provider availability mode:", error);
    res.status(500).json({ message: "Failed to update availability mode" });
  }
});

// ========================================
// Provider Availability Windows (date-specific)
// ========================================

// Get provider availability windows
// Uses shared hospital calendar if unit doesn't have hasOwnCalendar = true
router.get('/api/clinic/:hospitalId/units/:unitId/providers/:providerId/availability-windows', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId, unitId, providerId } = req.params;
    const { startDate, endDate } = req.query;
    
    // Determine calendar scope
    const scope = await getCalendarScope(unitId, hospitalId);
    
    const windows = await storage.getProviderAvailabilityWindows(
      providerId, 
      scope.effectiveUnitId,
      startDate as string | undefined,
      endDate as string | undefined,
      scope.effectiveHospitalId
    );
    
    res.json(windows);
  } catch (error) {
    logger.error("Error fetching provider availability windows:", error);
    res.status(500).json({ message: "Failed to fetch availability windows" });
  }
});

// Get all availability windows for a unit (for calendar display)
// Uses shared hospital calendar if unit doesn't have hasOwnCalendar = true
router.get('/api/clinic/:hospitalId/units/:unitId/availability-windows', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId, unitId } = req.params;
    const { startDate, endDate } = req.query;
    
    // Determine calendar scope
    const scope = await getCalendarScope(unitId, hospitalId);
    
    // Fetch windows from appropriate scope
    const windows = scope.effectiveUnitId
      ? await storage.getProviderAvailabilityWindowsForUnit(
          scope.effectiveUnitId,
          startDate as string | undefined,
          endDate as string | undefined
        )
      : await storage.getProviderAvailabilityWindowsForHospital(
          scope.effectiveHospitalId,
          startDate as string | undefined,
          endDate as string | undefined
        );
    
    res.json(windows);
  } catch (error) {
    logger.error("Error fetching availability windows for unit:", error);
    res.status(500).json({ message: "Failed to fetch availability windows" });
  }
});

// Create availability window
// Uses shared hospital calendar if unit doesn't have hasOwnCalendar = true
router.post('/api/clinic/:hospitalId/units/:unitId/providers/:providerId/availability-windows', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId, unitId, providerId } = req.params;
    const userId = req.user.id;
    
    const { date, startTime, endTime, slotDurationMinutes, notes, isPublic } = req.body;

    if (!date || !startTime || !endTime) {
      return res.status(400).json({ message: "Date, start time, and end time are required" });
    }

    // Determine calendar scope
    const scope = await getCalendarScope(unitId, hospitalId);

    const window = await storage.createProviderAvailabilityWindow({
      providerId,
      unitId: scope.effectiveUnitId ?? undefined,
      hospitalId: scope.effectiveUnitId === null ? scope.effectiveHospitalId : undefined,
      date,
      startTime,
      endTime,
      slotDurationMinutes: slotDurationMinutes || 30,
      notes: notes || null,
      isPublic: isPublic !== undefined ? isPublic : true,
      createdBy: userId,
    });
    
    res.status(201).json(window);
  } catch (error) {
    logger.error("Error creating availability window:", error);
    res.status(500).json({ message: "Failed to create availability window" });
  }
});

// Update availability window
router.put('/api/clinic/:hospitalId/availability-windows/:windowId', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId, windowId } = req.params;
    const { startTime, endTime, slotDurationMinutes, notes, isPublic } = req.body;

    const window = await storage.updateProviderAvailabilityWindow(windowId, {
      startTime,
      endTime,
      slotDurationMinutes,
      notes,
      ...(isPublic !== undefined && { isPublic }),
    });
    
    res.json(window);
  } catch (error) {
    logger.error("Error updating availability window:", error);
    res.status(500).json({ message: "Failed to update availability window" });
  }
});

// Delete availability window
router.delete('/api/clinic/:hospitalId/availability-windows/:windowId', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req, res) => {
  try {
    const { hospitalId, windowId } = req.params;

    await storage.deleteProviderAvailabilityWindow(windowId);
    res.status(204).send();
  } catch (error) {
    logger.error("Error deleting availability window:", error);
    res.status(500).json({ message: "Failed to delete availability window" });
  }
});

// ========================================
// Provider Absences (Timebutler sync)
// ========================================

// Get provider absences
router.get('/api/clinic/:hospitalId/absences', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { startDate, endDate } = req.query;
    
    const absences = await storage.getProviderAbsences(
      hospitalId,
      startDate as string,
      endDate as string
    );
    
    res.json(absences);
  } catch (error) {
    logger.error("Error fetching absences:", error);
    res.status(500).json({ message: "Failed to fetch absences" });
  }
});

// ========================================
// Timebutler Configuration
// ========================================

// Get Timebutler config
router.get('/api/clinic/:hospitalId/timebutler-config', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    const config = await storage.getTimebutlerConfig(hospitalId);
    
    // Don't expose the API token in the response
    if (config) {
      res.json({
        ...config,
        apiToken: config.apiToken ? '********' : null,
        hasApiToken: !!config.apiToken,
      });
    } else {
      res.json(null);
    }
  } catch (error) {
    logger.error("Error fetching Timebutler config:", error);
    res.status(500).json({ message: "Failed to fetch Timebutler config" });
  }
});

// Update Timebutler config
router.put('/api/clinic/:hospitalId/timebutler-config', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { apiToken, userMapping, isEnabled } = req.body;
    
    // Get existing config to preserve token if not changed
    const existing = await storage.getTimebutlerConfig(hospitalId);
    
    const config = await storage.upsertTimebutlerConfig({
      hospitalId,
      apiToken: apiToken === '********' ? existing?.apiToken : apiToken,
      userMapping: userMapping || existing?.userMapping || {},
      isEnabled: isEnabled ?? existing?.isEnabled ?? false,
    });
    
    res.json({
      ...config,
      apiToken: config.apiToken ? '********' : null,
      hasApiToken: !!config.apiToken,
    });
  } catch (error) {
    logger.error("Error updating Timebutler config:", error);
    res.status(500).json({ message: "Failed to update Timebutler config" });
  }
});

// Trigger Timebutler sync
router.post('/api/clinic/:hospitalId/timebutler-sync', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    
    const config = await storage.getTimebutlerConfig(hospitalId);
    
    if (!config?.apiToken || !config.isEnabled) {
      return res.status(400).json({ message: "Timebutler is not configured or enabled" });
    }
    
    // Call Timebutler API
    const currentYear = new Date().getFullYear();
    const response = await fetch('https://timebutler.de/api/v1/absences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `auth=${config.apiToken}&year=${currentYear}`,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      logger.error("Timebutler API error:", errorText);
      
      // Update config with error status
      await storage.upsertTimebutlerConfig({
        hospitalId,
        apiToken: config.apiToken,
        userMapping: config.userMapping,
        isEnabled: config.isEnabled,
        lastSyncAt: new Date(),
        lastSyncStatus: 'failed',
        lastSyncMessage: `API error: ${response.status}`,
      });
      
      return res.status(502).json({ message: "Timebutler API error" });
    }
    
    const csvData = await response.text();
    
    // Parse CSV data
    const lines = csvData.split('\n');
    const headers = lines[0]?.split(';') || [];
    
    // Find column indices - support both English and German headers
    const userIdIdx = headers.findIndex(h => h.toLowerCase() === 'user id' || h.toLowerCase() === 'benutzer id');
    const emailIdx = headers.findIndex(h => h.toLowerCase().includes('email') || h.toLowerCase().includes('e-mail'));
    const startIdx = headers.findIndex(h => 
      h.toLowerCase() === 'from' || 
      h.toLowerCase() === 'von' || 
      h.toLowerCase().includes('start')
    );
    const endIdx = headers.findIndex(h => 
      h.toLowerCase() === 'to' || 
      h.toLowerCase() === 'bis' || 
      h.toLowerCase().includes('end')
    );
    const typeIdx = headers.findIndex(h => h.toLowerCase().includes('type') || h.toLowerCase().includes('art'));
    
    // We need either userId or email for user identification, plus dates
    if ((userIdIdx === -1 && emailIdx === -1) || startIdx === -1 || endIdx === -1) {
      logger.error("Could not parse Timebutler CSV headers:", headers);
      return res.status(500).json({ 
        message: "Could not parse Timebutler response. Expected columns: User ID or Email, From/To dates." 
      });
    }
    
    const absences: any[] = [];
    const userMapping = config.userMapping || {};
    let skippedUnmapped = 0;
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      
      const cols = line.split(';');
      const timebutlerUserId = userIdIdx !== -1 ? cols[userIdIdx]?.trim() : undefined;
      const email = emailIdx !== -1 ? cols[emailIdx]?.trim() : undefined;
      const startDate = cols[startIdx]?.trim();
      const endDate = cols[endIdx]?.trim();
      const absenceType = cols[typeIdx]?.trim() || 'vacation';
      
      if (!startDate || !endDate) continue;
      if (!timebutlerUserId && !email) continue;
      
      // Map Timebutler User ID or email to provider ID
      // userMapping can have entries like { "123": "provider-uuid", "user@email.com": "provider-uuid" }
      const userKey = timebutlerUserId || email || '';
      const providerId = userMapping[userKey] || (email ? userMapping[email] : undefined);
      
      if (!providerId) {
        skippedUnmapped++;
        continue; // Skip unmapped users
      }
      
      absences.push({
        providerId,
        hospitalId,
        absenceType,
        startDate,
        endDate,
        externalId: `tb-${userKey}-${startDate}-${endDate}`,
      });
    }
    
    if (skippedUnmapped > 0) {
      logger.info(`Timebutler sync: Skipped ${skippedUnmapped} unmapped users`);
    }
    
    // Sync absences to database
    if (absences.length > 0) {
      await storage.syncProviderAbsences(hospitalId, absences);
    }
    
    // Update config with success status
    await storage.upsertTimebutlerConfig({
      hospitalId,
      apiToken: config.apiToken,
      userMapping: config.userMapping,
      isEnabled: config.isEnabled,
      lastSyncAt: new Date(),
      lastSyncStatus: 'success',
      lastSyncMessage: `Synced ${absences.length} absences`,
    });
    
    res.json({ 
      success: true, 
      message: `Synced ${absences.length} absences`,
      syncedCount: absences.length,
    });
  } catch (error) {
    logger.error("Error syncing Timebutler:", error);
    res.status(500).json({ message: "Failed to sync Timebutler" });
  }
});

// Sync absences from user's personal Timebutler ICS URL
router.post('/api/clinic/:hospitalId/sync-user-ics/:userId', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId, userId } = req.params;
    const ical = await import('node-ical');
    
    // Get user's ICS URL
    const user = await storage.getUser(userId);
    
    if (!user?.timebutlerIcsUrl) {
      return res.status(400).json({ message: "User has no ICS URL configured" });
    }
    
    // Fetch and parse ICS
    const events = await ical.async.fromURL(user.timebutlerIcsUrl);
    
    const absences: any[] = [];
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, 0, 1);
    const oneYearAhead = new Date(now.getFullYear() + 1, 11, 31);
    
    for (const [key, event] of Object.entries(events)) {
      if ((event as any).type !== 'VEVENT') continue;
      
      const vevent = event as any;
      const startDate = vevent.start;
      const endDate = vevent.end;
      const summary = vevent.summary || 'Absence';
      
      // Skip events outside our date range
      if (!startDate || startDate < oneYearAgo || startDate > oneYearAhead) continue;
      
      // Determine absence type from summary (common German/English patterns)
      let absenceType = 'other';
      const lowerSummary = summary.toLowerCase();
      if (lowerSummary.includes('urlaub') || lowerSummary.includes('vacation') || lowerSummary.includes('holiday')) {
        absenceType = 'vacation';
      } else if (lowerSummary.includes('krank') || lowerSummary.includes('sick')) {
        absenceType = 'sick';
      } else if (lowerSummary.includes('fortbildung') || lowerSummary.includes('training')) {
        absenceType = 'training';
      }
      
      absences.push({
        providerId: userId,
        hospitalId,
        absenceType,
        startDate: startDate instanceof Date ? startDate.toISOString().split('T')[0] : startDate,
        endDate: endDate instanceof Date ? endDate.toISOString().split('T')[0] : endDate,
        externalId: `ics-${userId}-${key}`,
        notes: summary,
      });
    }
    
    // Sync absences to database (clears old ones for this user and inserts new)
    if (absences.length > 0) {
      await storage.syncProviderAbsencesForUser(hospitalId, userId, absences);
    } else {
      // Clear existing absences for this user if no events found
      await storage.clearProviderAbsencesForUser(hospitalId, userId);
    }
    
    res.json({ 
      success: true, 
      message: `Synced ${absences.length} absences from ICS`,
      syncedCount: absences.length,
    });
  } catch (error) {
    logger.error("Error syncing user ICS:", error);
    res.status(500).json({ message: "Failed to sync from ICS URL" });
  }
});

// Queue a Timebutler ICS sync job for the hospital (background worker will process)
router.post('/api/clinic/:hospitalId/queue-ics-sync', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    
    // Create a scheduled job that will run immediately
    await storage.createScheduledJob({
      jobType: 'sync_timebutler_ics',
      hospitalId,
      scheduledFor: new Date(),
      status: 'pending',
    });
    
    res.json({ 
      success: true, 
      message: "Timebutler sync job queued. It will run shortly in the background.",
    });
  } catch (error) {
    logger.error("Error queuing ICS sync:", error);
    res.status(500).json({ message: "Failed to queue sync job" });
  }
});

// Sync all users' ICS URLs for a hospital
router.post('/api/clinic/:hospitalId/sync-all-ics', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const ical = await import('node-ical');
    
    // Get all users with ICS URLs configured for this hospital
    const { userHospitalRoles } = await import("@shared/schema");
    
    const usersWithIcs = await db
      .selectDistinct({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        timebutlerIcsUrl: users.timebutlerIcsUrl,
      })
      .from(users)
      .innerJoin(
        userHospitalRoles,
        and(
          eq(users.id, userHospitalRoles.userId),
          eq(userHospitalRoles.hospitalId, hospitalId)
        )
      )
      .where(sql`${users.timebutlerIcsUrl} IS NOT NULL AND ${users.timebutlerIcsUrl} != ''`);
    
    if (usersWithIcs.length === 0) {
      return res.json({ 
        success: true, 
        message: "No users have ICS URLs configured",
        syncedCount: 0,
        usersProcessed: 0,
      });
    }
    
    let totalSynced = 0;
    let usersProcessed = 0;
    const errors: string[] = [];
    
    for (const user of usersWithIcs) {
      try {
        const events = await ical.async.fromURL(user.timebutlerIcsUrl!);
        
        const absences: any[] = [];
        const now = new Date();
        const oneYearAgo = new Date(now.getFullYear() - 1, 0, 1);
        const oneYearAhead = new Date(now.getFullYear() + 1, 11, 31);
        
        for (const [key, event] of Object.entries(events)) {
          if ((event as any).type !== 'VEVENT') continue;
          
          const vevent = event as any;
          const startDate = vevent.start;
          const endDate = vevent.end;
          const summary = vevent.summary || 'Absence';
          
          if (!startDate || startDate < oneYearAgo || startDate > oneYearAhead) continue;
          
          let absenceType = 'other';
          const lowerSummary = summary.toLowerCase();
          if (lowerSummary.includes('urlaub') || lowerSummary.includes('vacation') || lowerSummary.includes('holiday')) {
            absenceType = 'vacation';
          } else if (lowerSummary.includes('krank') || lowerSummary.includes('sick')) {
            absenceType = 'sick';
          } else if (lowerSummary.includes('fortbildung') || lowerSummary.includes('training')) {
            absenceType = 'training';
          }
          
          absences.push({
            providerId: user.id,
            hospitalId,
            absenceType,
            startDate: startDate instanceof Date ? startDate.toISOString().split('T')[0] : startDate,
            endDate: endDate instanceof Date ? endDate.toISOString().split('T')[0] : endDate,
            externalId: `ics-${user.id}-${key}`,
            notes: summary,
          });
        }
        
        if (absences.length > 0) {
          await storage.syncProviderAbsencesForUser(hospitalId, user.id, absences);
        } else {
          await storage.clearProviderAbsencesForUser(hospitalId, user.id);
        }
        
        totalSynced += absences.length;
        usersProcessed++;
      } catch (userError: any) {
        errors.push(`${user.firstName} ${user.lastName}: ${userError.message}`);
      }
    }
    
    res.json({ 
      success: true, 
      message: `Synced ${totalSynced} absences from ${usersProcessed} users`,
      syncedCount: totalSynced,
      usersProcessed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    logger.error("Error syncing all ICS:", error);
    res.status(500).json({ message: "Failed to sync ICS URLs" });
  }
});

// ========================================
// Providers (users who can have appointments)
// ========================================

// Get providers for a hospital (all staff members who can receive appointments)
router.get('/api/clinic/:hospitalId/units/:unitId/providers', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { userHospitalRoles } = await import("@shared/schema");
    
    // Get all users with app access (canLogin=true) at this hospital
    const providers = await db
      .selectDistinct({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        profileImageUrl: users.profileImageUrl,
      })
      .from(users)
      .innerJoin(
        userHospitalRoles,
        and(
          eq(users.id, userHospitalRoles.userId),
          eq(userHospitalRoles.hospitalId, hospitalId)
        )
      )
      .where(eq(users.canLogin, true))
      .orderBy(users.lastName, users.firstName);
    
    res.json(providers);
  } catch (error) {
    logger.error("Error fetching providers:", error);
    res.status(500).json({ message: "Failed to fetch providers" });
  }
});

// ========================================
// Provider Surgery Blocks (for blocking calendar time)
// ========================================

// Get all surgeries for a hospital in a date range (for calendar blocking)
router.get('/api/clinic/:hospitalId/all-surgeries', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ message: "startDate and endDate are required" });
    }

    const { surgeries, patients: patientsTable, surgeryAssistants } = await import("@shared/schema");
    
    const start = new Date(startDate as string);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate as string);
    end.setHours(23, 59, 59, 999);
    
    // Fetch all non-cancelled surgeries for the hospital in date range
    const result = await db
      .select({
        id: surgeries.id,
        patientId: surgeries.patientId,
        surgeonId: surgeries.surgeonId,
        surgeon: surgeries.surgeon,
        plannedDate: surgeries.plannedDate,
        plannedSurgery: surgeries.plannedSurgery,
        actualEndTime: surgeries.actualEndTime,
        status: surgeries.status,
        surgeryRoomId: surgeries.surgeryRoomId,
        patientFirstName: patientsTable.firstName,
        patientSurname: patientsTable.surname,
      })
      .from(surgeries)
      .leftJoin(patientsTable, eq(surgeries.patientId, patientsTable.id))
      .where(
        and(
          eq(surgeries.hospitalId, hospitalId),
          sql`${surgeries.plannedDate} >= ${start}`,
          sql`${surgeries.plannedDate} <= ${end}`,
          sql`(${surgeries.status} IS NULL OR ${surgeries.status} NOT IN ('cancelled', 'archived'))`,
          eq(surgeries.isSuspended, false),
          eq(surgeries.isArchived, false)
        )
      )
      .orderBy(surgeries.plannedDate);

    // For surgeries with surgeonId, get surgeon names from users table
    const surgeonIds = result
      .map(s => s.surgeonId)
      .filter((id): id is string => id !== null);
    
    let surgeonMap = new Map<string, { firstName: string; lastName: string }>();
    if (surgeonIds.length > 0) {
      const surgeonData = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(users)
        .where(inArray(users.id, surgeonIds));
      
      surgeonData.forEach(s => {
        surgeonMap.set(s.id, { firstName: s.firstName || '', lastName: s.lastName || '' });
      });
    }
    
    // Fetch assistants for all surgeries in one query
    const surgeryIds = result.map(s => s.id);
    let assistantsBySurgery = new Map<string, { userId: string }[]>();
    if (surgeryIds.length > 0) {
      const assistantRows = await db
        .select({ surgeryId: surgeryAssistants.surgeryId, userId: surgeryAssistants.userId })
        .from(surgeryAssistants)
        .where(inArray(surgeryAssistants.surgeryId, surgeryIds));
      for (const row of assistantRows) {
        const list = assistantsBySurgery.get(row.surgeryId) ?? [];
        list.push({ userId: row.userId });
        assistantsBySurgery.set(row.surgeryId, list);
      }
    }

    // Enrich result with surgeon names and assistants
    const enrichedResult = result.map(surgery => {
      const surgeonInfo = surgery.surgeonId ? surgeonMap.get(surgery.surgeonId) : undefined;
      return {
        ...surgery,
        surgeonFirstName: surgeonInfo?.firstName ?? null,
        surgeonLastName: surgeonInfo?.lastName ?? null,
        assistants: assistantsBySurgery.get(surgery.id) ?? [],
      };
    });

    res.json(enrichedResult);
  } catch (error) {
    logger.error("Error fetching all surgeries:", error);
    res.status(500).json({ message: "Failed to fetch surgeries" });
  }
});

// Get surgeries where providers are assigned as surgeons
router.get('/api/clinic/:hospitalId/provider-surgeries', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { providerIds, startDate, endDate } = req.query;
    
    if (!providerIds || !startDate || !endDate) {
      return res.status(400).json({ message: "providerIds, startDate, and endDate are required" });
    }
    
    const { surgeries, patients: patientsTable } = await import("@shared/schema");
    
    // Parse provider IDs (comma-separated)
    const ids = (providerIds as string).split(',').filter(Boolean);
    
    if (ids.length === 0) {
      return res.json([]);
    }
    
    const start = new Date(startDate as string);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate as string);
    end.setHours(23, 59, 59, 999);
    
    // Get provider names for fallback matching (for legacy data without surgeonId)
    const providerData = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(inArray(users.id, ids));
    
    // Build array of surgeon name patterns for text matching
    const surgeonNamePatterns = providerData.map(p => 
      `${p.firstName} ${p.lastName}`.trim().toLowerCase()
    );
    
    // Fetch surgeries where surgeonId is in the list OR surgeon name matches (for legacy data)
    const result = await db
      .select({
        id: surgeries.id,
        patientId: surgeries.patientId,
        surgeonId: surgeries.surgeonId,
        surgeon: surgeries.surgeon,
        plannedDate: surgeries.plannedDate,
        plannedSurgery: surgeries.plannedSurgery,
        actualEndTime: surgeries.actualEndTime,
        status: surgeries.status,
        surgeryRoomId: surgeries.surgeryRoomId,
        patientFirstName: patientsTable.firstName,
        patientSurname: patientsTable.surname,
      })
      .from(surgeries)
      .leftJoin(patientsTable, eq(surgeries.patientId, patientsTable.id))
      .where(
        and(
          eq(surgeries.hospitalId, hospitalId),
          sql`${surgeries.plannedDate} >= ${start}`,
          sql`${surgeries.plannedDate} <= ${end}`,
          // Only non-cancelled, non-archived, non-suspended surgeries
          sql`(${surgeries.status} IS NULL OR ${surgeries.status} NOT IN ('cancelled', 'archived'))`,
          eq(surgeries.isSuspended, false),
          eq(surgeries.isArchived, false),
          // Match by surgeonId OR by surgeon name (for legacy data)
          or(
            inArray(surgeries.surgeonId, ids),
            sql`LOWER(TRIM(${surgeries.surgeon})) = ANY(${surgeonNamePatterns})`
          )
        )
      )
      .orderBy(surgeries.plannedDate);
    
    // Map surgeon names back to provider IDs for legacy entries
    const providerNameToId = new Map<string, string>();
    providerData.forEach(p => {
      providerNameToId.set(`${p.firstName} ${p.lastName}`.trim().toLowerCase(), p.id);
    });
    
    const enrichedResult = result.map(surgery => {
      // If surgeonId is missing but surgeon name matches, add the provider ID
      if (!surgery.surgeonId && surgery.surgeon) {
        const normalizedName = surgery.surgeon.trim().toLowerCase();
        const matchedProviderId = providerNameToId.get(normalizedName);
        if (matchedProviderId) {
          return { ...surgery, surgeonId: matchedProviderId };
        }
      }
      return surgery;
    });
    
    res.json(enrichedResult);
  } catch (error) {
    logger.error("Error fetching provider surgeries:", error);
    res.status(500).json({ message: "Failed to fetch provider surgeries" });
  }
});

// ========================================
// Sync Status Endpoint
// ========================================

// Get sync status for Timebutler ICS and Cal.com
router.get('/api/clinic/:hospitalId/sync-status', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    // Get last completed/pending jobs for each sync type
    const [timebutlerJob, calcomJob] = await Promise.all([
      storage.getLastScheduledJobForHospital(hospitalId, 'sync_timebutler_ics'),
      storage.getLastScheduledJobForHospital(hospitalId, 'sync_calcom'),
    ]);
    
    res.json({
      timebutler: timebutlerJob ? {
        lastSyncAt: timebutlerJob.completedAt || timebutlerJob.scheduledFor,
        status: timebutlerJob.status,
        error: timebutlerJob.status === 'failed' ? timebutlerJob.error : null,
        successCount: timebutlerJob.successCount,
        failedCount: timebutlerJob.failedCount,
      } : null,
      calcom: calcomJob ? {
        lastSyncAt: calcomJob.completedAt || calcomJob.scheduledFor,
        status: calcomJob.status,
        error: calcomJob.status === 'failed' ? calcomJob.error : null,
        successCount: calcomJob.successCount,
        failedCount: calcomJob.failedCount,
      } : null,
    });
  } catch (error) {
    logger.error("Error fetching sync status:", error);
    res.status(500).json({ message: "Failed to fetch sync status" });
  }
});

// ========================================
// Cal.com Integration
// ========================================

// Get Cal.com config
router.get('/api/clinic/:hospitalId/calcom-config', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    const config = await storage.getCalcomConfig(hospitalId);
    
    if (!config) {
      return res.json({
        hospitalId,
        isEnabled: false,
        apiKey: null,
      });
    }
    
    res.json({
      ...config,
      apiKey: config.apiKey ? '***configured***' : null,
    });
  } catch (error) {
    logger.error("Error fetching Cal.com config:", error);
    res.status(500).json({ message: "Failed to fetch Cal.com config" });
  }
});

// Update Cal.com config
router.put('/api/clinic/:hospitalId/calcom-config', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { apiKey, webhookSecret, isEnabled } = req.body;
    
    const existing = await storage.getCalcomConfig(hospitalId);
    
    const config = await storage.upsertCalcomConfig({
      hospitalId,
      apiKey: apiKey === '***configured***' ? existing?.apiKey : apiKey,
      webhookSecret: webhookSecret === '***configured***' ? existing?.webhookSecret : webhookSecret,
      isEnabled: isEnabled ?? existing?.isEnabled ?? false,
      syncBusyBlocks: false, // Disabled - using ICS subscription instead
      syncTimebutlerAbsences: false, // Disabled - using ICS subscription instead
    });
    
    res.json({
      ...config,
      apiKey: config.apiKey ? '***configured***' : null,
      webhookSecret: config.webhookSecret ? '***configured***' : null,
    });
  } catch (error) {
    logger.error("Error updating Cal.com config:", error);
    res.status(500).json({ message: "Failed to update Cal.com config" });
  }
});

// Get Cal.com provider mappings
router.get('/api/clinic/:hospitalId/calcom-mappings', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const mappings = await storage.getCalcomProviderMappings(hospitalId);
    res.json(mappings);
  } catch (error) {
    logger.error("Error fetching Cal.com mappings:", error);
    res.status(500).json({ message: "Failed to fetch Cal.com mappings" });
  }
});

// Create/update Cal.com provider mapping
router.post('/api/clinic/:hospitalId/calcom-mappings', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { providerId, calcomEventTypeId, calcomUserId, calcomScheduleId, isEnabled } = req.body;
    
    if (!providerId || !calcomEventTypeId) {
      return res.status(400).json({ message: "providerId and calcomEventTypeId are required" });
    }
    
    const mapping = await storage.upsertCalcomProviderMapping({
      hospitalId,
      providerId,
      calcomEventTypeId,
      calcomUserId,
      calcomScheduleId,
      isEnabled: isEnabled ?? true,
    });
    
    res.json(mapping);
  } catch (error) {
    logger.error("Error creating Cal.com mapping:", error);
    res.status(500).json({ message: "Failed to create Cal.com mapping" });
  }
});

// Delete Cal.com provider mapping
router.delete('/api/clinic/:hospitalId/calcom-mappings/:mappingId', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { mappingId } = req.params;
    await storage.deleteCalcomProviderMapping(mappingId);
    res.json({ success: true });
  } catch (error) {
    logger.error("Error deleting Cal.com mapping:", error);
    res.status(500).json({ message: "Failed to delete Cal.com mapping" });
  }
});

// Trigger full Cal.com sync for ALL providers with mappings (push appointments + surgeries as busy blocks)
router.post('/api/clinic/:hospitalId/calcom-sync', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    
    const { fullSync } = await import("../services/calcomSync");
    const result = await fullSync(hospitalId);
    
    const totalSynced = result.appointments.synced + result.surgeries.synced;
    const allErrors = [...result.appointments.errors, ...result.surgeries.errors];
    
    await storage.upsertCalcomConfig({
      hospitalId,
      lastSyncAt: new Date(),
      lastSyncError: allErrors.length > 0 ? allErrors.slice(0, 5).join('; ') : null,
    });
    
    res.json({
      success: true,
      syncedBlocks: totalSynced,
      appointments: result.appointments,
      surgeries: result.surgeries,
      errors: allErrors.slice(0, 10),
    });
  } catch (error: any) {
    logger.error("Error syncing to Cal.com:", error);
    res.status(500).json({ message: "Failed to sync to Cal.com", error: error.message });
  }
});

// Trigger Cal.com sync for a specific provider (push appointments + absences as busy blocks)
router.post('/api/clinic/:hospitalId/calcom-sync/:providerId', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId, providerId } = req.params;
    const { startDate, endDate } = req.body;
    
    const config = await storage.getCalcomConfig(hospitalId);
    if (!config?.isEnabled || !config.apiKey) {
      return res.status(400).json({ message: "Cal.com is not configured or enabled" });
    }
    
    const mapping = await storage.getCalcomProviderMapping(hospitalId, providerId);
    if (!mapping || !mapping.isEnabled) {
      return res.status(400).json({ message: "Provider is not mapped to Cal.com" });
    }
    
    const { createCalcomClient } = await import("../services/calcomClient");
    const calcom = createCalcomClient(config.apiKey);
    
    const syncStartDate = startDate || new Date().toISOString().split('T')[0];
    const syncEndDateObj = new Date();
    syncEndDateObj.setMonth(syncEndDateObj.getMonth() + 3);
    const syncEndDate = endDate || syncEndDateObj.toISOString().split('T')[0];
    
    const blocksCreated: string[] = [];
    const errors: string[] = [];
    
    if (config.syncBusyBlocks) {
      const { clinicAppointments: appts } = await import("@shared/schema");
      
      const appointments = await db
        .select()
        .from(appts)
        .where(
          and(
            eq(appts.providerId, providerId),
            gte(appts.appointmentDate, syncStartDate),
            lte(appts.appointmentDate, syncEndDate),
            sql`${appts.status} NOT IN ('cancelled', 'no_show')`
          )
        );
      
      for (const apt of appointments) {
        try {
          const startDateTime = `${apt.appointmentDate}T${apt.startTime}:00`;
          const endDateTime = `${apt.appointmentDate}T${apt.endTime}:00`;
          
          await calcom.createOutOfOffice({
            start: startDateTime,
            end: endDateTime,
            notes: `Clinic appointment: ${apt.id}`,
          });
          blocksCreated.push(apt.id);
        } catch (err: any) {
          errors.push(`Appointment ${apt.id}: ${err.message}`);
        }
      }
    }
    
    if (config.syncTimebutlerAbsences) {
      const absences = await storage.getProviderAbsences(hospitalId, syncStartDate, syncEndDate);
      const providerAbsences = absences.filter(a => a.providerId === providerId);
      
      for (const absence of providerAbsences) {
        try {
          await calcom.createOutOfOffice({
            start: `${absence.startDate}T00:00:00`,
            end: `${absence.endDate}T23:59:59`,
            notes: `Timebutler: ${absence.absenceType}`,
          });
          blocksCreated.push(`absence-${absence.id}`);
        } catch (err: any) {
          errors.push(`Absence ${absence.id}: ${err.message}`);
        }
      }
    }
    
    await storage.upsertCalcomConfig({
      ...config,
      lastSyncAt: new Date(),
      lastSyncError: errors.length > 0 ? errors.join('; ') : null,
    });
    
    res.json({
      success: true,
      blocksCreated: blocksCreated.length,
      errors,
    });
  } catch (error: any) {
    logger.error("Error syncing to Cal.com:", error);
    res.status(500).json({ message: "Failed to sync to Cal.com", error: error.message });
  }
});

// Cal.com webhook endpoint - GET for verification
router.get('/api/webhooks/calcom/:hospitalId', async (req, res) => {
  res.json({ status: 'ok', message: 'Cal.com webhook endpoint ready' });
});

// Cal.com webhook endpoint (receives booking notifications from Cal.com)
router.post('/api/webhooks/calcom/:hospitalId', async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { triggerEvent, payload } = req.body;
    
    logger.info(`Cal.com webhook received: ${triggerEvent}`, JSON.stringify(payload, null, 2));
    
    // Handle ping test from Cal.com (no triggerEvent or PING event)
    if (!triggerEvent || triggerEvent === 'PING') {
      return res.json({ status: 'ok', message: 'Webhook endpoint ready' });
    }
    
    const config = await storage.getCalcomConfig(hospitalId);
    if (!config?.isEnabled) {
      // Still acknowledge the webhook but don't process
      return res.json({ received: true, processed: false, reason: 'Cal.com integration not enabled' });
    }
    
    if (triggerEvent === 'BOOKING_CREATED' || triggerEvent === 'BOOKING_REQUESTED') {
      const { startTime, endTime, eventTypeId, attendees, metadata } = payload;
      
      const mappings = await storage.getCalcomProviderMappings(hospitalId);
      const mapping = mappings.find(m => m.calcomEventTypeId === String(eventTypeId));
      
      if (!mapping) {
        logger.warn(`No provider mapping found for event type ${eventTypeId}`);
        return res.json({ received: true, processed: false, reason: 'No provider mapping' });
      }
      
      const attendee = attendees?.[0];
      if (!attendee) {
        return res.json({ received: true, processed: false, reason: 'No attendee' });
      }
      
      const startDate = new Date(startTime);
      const endDate = new Date(endTime);
      
      const appointmentDate = startDate.toISOString().split('T')[0];
      const startTimeStr = startDate.toISOString().split('T')[1].substring(0, 5);
      const endTimeStr = endDate.toISOString().split('T')[1].substring(0, 5);
      
      let patientId: string | null = null;
      
      if (attendee.email) {
        const { patients: patientsTable } = await import("@shared/schema");
        const [existingPatient] = await db
          .select()
          .from(patientsTable)
          .where(
            and(
              eq(patientsTable.hospitalId, hospitalId),
              eq(patientsTable.email, attendee.email)
            )
          )
          .limit(1);
        
        if (existingPatient) {
          patientId = existingPatient.id;
        } else {
          const nameParts = (attendee.name || '').split(' ');
          const firstName = nameParts[0] || 'Unknown';
          const surname = nameParts.slice(1).join(' ') || 'Patient';
          
          const [hospital] = await db.select().from(hospitals).where(eq(hospitals.id, hospitalId)).limit(1);
          
          const countResult = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(patients)
            .where(eq(patients.hospitalId, hospitalId));
          const patientCount = countResult[0]?.count || 0;
          
          const [newPatient] = await db
            .insert(patients)
            .values({
              hospitalId,
              firstName,
              surname,
              email: attendee.email,
              patientNumber: `P-${String(patientCount + 1).padStart(5, '0')}`,
              birthday: '1900-01-01',
              sex: 'O',
            })
            .returning();
          
          patientId = newPatient.id;
        }
      }
      
      if (!patientId) {
        return res.json({ received: true, processed: false, reason: 'Could not create/find patient' });
      }

      const { clinicAppointments: appts } = await import("@shared/schema");

      // Dedup: skip if appointment with same Cal.com booking UID already exists
      const [existingAppt] = await db
        .select({ id: appts.id })
        .from(appts)
        .where(eq(appts.calcomBookingUid, payload.uid))
        .limit(1);

      if (existingAppt) {
        logger.info(`Duplicate Cal.com webhook for booking ${payload.uid}, appointment ${existingAppt.id} already exists`);
        return res.json({ received: true, processed: false, reason: 'Appointment already exists for this booking' });
      }

      const { units: unitsTable } = await import("@shared/schema");
      
      const [clinicUnit] = await db
        .select()
        .from(unitsTable)
        .where(
          and(
            eq(unitsTable.hospitalId, hospitalId),
            eq(unitsTable.isClinicModule, true)
          )
        )
        .limit(1);
      
      if (!clinicUnit) {
        return res.json({ received: true, processed: false, reason: 'No clinic unit found' });
      }
      
      const durationMs = endDate.getTime() - startDate.getTime();
      const durationMinutes = Math.round(durationMs / (1000 * 60));
      
      const result = await db
        .insert(appts)
        .values({
          hospitalId,
          unitId: clinicUnit.id,
          patientId,
          providerId: mapping.providerId,
          appointmentDate,
          startTime: startTimeStr,
          endTime: endTimeStr,
          durationMinutes,
          status: 'confirmed',
          notes: `Booked via Cal.com (RetellAI). Booking ID: ${payload.uid}`,
          calcomBookingUid: payload.uid,
          calcomSource: 'calcom',
          calcomSyncedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning();

      if (result.length === 0) {
        logger.info(`Duplicate Cal.com booking ${payload.uid} blocked by unique constraint`);
        return res.json({ received: true, processed: false, reason: 'Appointment already exists for this booking' });
      }

      const appointment = result[0];
      logger.info(`Created appointment ${appointment.id} from Cal.com booking ${payload.uid}`);

      res.json({ received: true, processed: true, appointmentId: appointment.id });
    } else if (triggerEvent === 'BOOKING_RESCHEDULED') {
      const { uid, startTime, endTime } = payload;
      
      if (!uid) {
        return res.json({ received: true, processed: false, reason: 'No booking UID' });
      }
      
      const { clinicAppointments: appts } = await import("@shared/schema");
      
      const [existing] = await db
        .select()
        .from(appts)
        .where(eq(appts.calcomBookingUid, uid))
        .limit(1);
      
      if (!existing) {
        return res.json({ received: true, processed: false, reason: 'Appointment not found for rescheduled booking' });
      }
      
      const newStartDate = new Date(startTime);
      const newEndDate = new Date(endTime);
      const newDurationMs = newEndDate.getTime() - newStartDate.getTime();
      
      await db
        .update(appts)
        .set({
          appointmentDate: newStartDate.toISOString().split('T')[0],
          startTime: newStartDate.toISOString().split('T')[1].substring(0, 5),
          endTime: newEndDate.toISOString().split('T')[1].substring(0, 5),
          durationMinutes: Math.round(newDurationMs / (1000 * 60)),
          calcomSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(appts.id, existing.id));
      
      logger.info(`Rescheduled appointment ${existing.id} from Cal.com booking ${uid}`);
      
      res.json({ received: true, processed: true, appointmentId: existing.id, action: 'rescheduled' });
    } else if (triggerEvent === 'BOOKING_CANCELLED') {
      const { uid } = payload;
      
      if (!uid) {
        return res.json({ received: true, processed: false, reason: 'No booking UID' });
      }
      
      const { clinicAppointments: appts } = await import("@shared/schema");
      
      const [existing] = await db
        .select()
        .from(appts)
        .where(eq(appts.calcomBookingUid, uid))
        .limit(1);
      
      if (!existing) {
        return res.json({ received: true, processed: false, reason: 'Appointment not found for cancelled booking' });
      }
      
      await db
        .update(appts)
        .set({
          status: 'cancelled',
          cancellationReason: 'Cancelled via Cal.com',
          calcomSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(appts.id, existing.id));
      
      logger.info(`Cancelled appointment ${existing.id} from Cal.com booking ${uid}`);
      
      res.json({ received: true, processed: true, appointmentId: existing.id, action: 'cancelled' });
    } else {
      res.json({ received: true, processed: false, reason: `Unknown event: ${triggerEvent}` });
    }
  } catch (error: any) {
    logger.error("Error processing Cal.com webhook:", error);
    res.status(500).json({ message: "Failed to process webhook", error: error.message });
  }
});

// ICS Calendar Feed for Cal.com integration
// This endpoint provides a publicly accessible ICS feed of busy times
// Cal.com subscribes to this to block booked surgery/appointment times
router.get('/api/calendar/:hospitalId/:providerId/feed.ics', async (req, res) => {
  try {
    const { hospitalId, providerId } = req.params;
    const { token } = req.query;
    
    // Verify feed token for security
    const config = await storage.getCalcomConfig(hospitalId);
    if (!config?.feedToken || config.feedToken !== token) {
      return res.status(401).send('Unauthorized');
    }
    
    // Get provider mapping to verify provider is configured
    const mappings = await storage.getCalcomProviderMappings(hospitalId);
    const mapping = mappings.find(m => m.providerId === providerId && m.isEnabled);
    if (!mapping) {
      return res.status(404).send('Provider not found');
    }
    
    // Fetch hospital timezone
    const hospital = await storage.getHospital(hospitalId);
    const tz = hospital?.timezone || 'Europe/Zurich';

    // Date range: from 7 days ago to 6 months ahead
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 6);
    
    const { clinicAppointments, surgeries, users, providerAbsences, providerTimeOff } = await import("@shared/schema");
    
    // Get provider info
    const [provider] = await db.select().from(users).where(eq(users.id, providerId));
    const providerName = provider ? `${provider.firstName || ''} ${provider.lastName || ''}`.trim() || provider.email : 'Provider';

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Sync Timebutler ICS absences for this provider before generating feed
    if (provider?.timebutlerIcsUrl) {
      try {
        const ical = await import('node-ical');
        const events = await ical.async.fromURL(provider.timebutlerIcsUrl);

        const absences: any[] = [];
        const now = new Date();
        const oneYearAgo = new Date(now.getFullYear() - 1, 0, 1);
        const oneYearAhead = new Date(now.getFullYear() + 1, 11, 31);

        for (const [key, event] of Object.entries(events)) {
          if ((event as any).type !== 'VEVENT') continue;

          const vevent = event as any;
          const evtStart = vevent.start;
          const evtEnd = vevent.end;
          const summary = vevent.summary || 'Absence';

          if (!evtStart || evtStart < oneYearAgo || evtStart > oneYearAhead) continue;

          let absenceType = 'other';
          const lowerSummary = summary.toLowerCase();
          if (lowerSummary.includes('urlaub') || lowerSummary.includes('vacation') || lowerSummary.includes('holiday')) {
            absenceType = 'vacation';
          } else if (lowerSummary.includes('krank') || lowerSummary.includes('sick')) {
            absenceType = 'sick';
          } else if (lowerSummary.includes('fortbildung') || lowerSummary.includes('training')) {
            absenceType = 'training';
          }

          // ICS all-day events: DTEND is EXCLUSIVE (the day after the last day)
          const isAllDayEvent = vevent.datetype === 'date' ||
            (evtStart instanceof Date && evtStart.getHours() === 0 && evtStart.getMinutes() === 0);

          let adjustedEndDate = evtEnd;
          if (isAllDayEvent && evtEnd instanceof Date) {
            adjustedEndDate = new Date(evtEnd);
            adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);
          }

          absences.push({
            providerId,
            hospitalId,
            absenceType,
            startDate: evtStart instanceof Date ? evtStart.toISOString().split('T')[0] : evtStart,
            endDate: adjustedEndDate instanceof Date ? adjustedEndDate.toISOString().split('T')[0] : adjustedEndDate,
            externalId: `ics-${providerId}-${key}`,
            notes: summary,
          });
        }

        if (absences.length > 0) {
          await storage.syncProviderAbsencesForUser(hospitalId, providerId, absences);
        } else {
          await storage.clearProviderAbsencesForUser(hospitalId, providerId);
        }
        logger.info(`ICS feed: synced ${absences.length} Timebutler absences for provider ${providerId}`);
      } catch (syncError: any) {
        logger.warn(`ICS feed: failed to sync Timebutler for provider ${providerId}: ${syncError.message}`);
        // Continue with existing DB data even if sync fails
      }
    }
    
    // Get appointments for this provider
    const appointments = await db
      .select()
      .from(clinicAppointments)
      .where(
        and(
          eq(clinicAppointments.providerId, providerId),
          gte(clinicAppointments.appointmentDate, startDateStr),
          lte(clinicAppointments.appointmentDate, endDateStr),
          sql`${clinicAppointments.status} NOT IN ('cancelled', 'no_show')`
        )
      );
    
    // Get surgeries for this surgeon
    const surgeryList = await db
      .select()
      .from(surgeries)
      .where(
        and(
          eq(surgeries.surgeonId, providerId),
          gte(surgeries.plannedDate, startDate),
          lte(surgeries.plannedDate, endDate),
          sql`${surgeries.status} != 'cancelled'`,
          eq(surgeries.isSuspended, false),
          eq(surgeries.isArchived, false)
        )
      );

    // Get absences (Timebutler synced) for this provider
    const absenceList = await db
      .select()
      .from(providerAbsences)
      .where(
        and(
          eq(providerAbsences.providerId, providerId),
          gte(providerAbsences.endDate, startDateStr),
          lte(providerAbsences.startDate, endDateStr)
        )
      );

    // Get time-offs (manually blocked slots) for this provider
    // Include recurring time-offs even if their original dates are outside the range,
    // because expandRecurringTimeOff will generate occurrences within the range
    const timeOffList = await db
      .select()
      .from(providerTimeOff)
      .where(
        and(
          eq(providerTimeOff.providerId, providerId),
          or(
            and(
              gte(providerTimeOff.endDate, startDateStr),
              lte(providerTimeOff.startDate, endDateStr)
            ),
            eq(providerTimeOff.isRecurring, true)
          )
        )
      );

    // Expand recurring time-offs into individual occurrences
    const expandedTimeOffs = expandRecurringTimeOff(timeOffList, startDateStr, endDateStr);

    // Generate ICS content
    const events: string[] = [];
    
    // Add appointments (times stored as local HH:MM, must convert via timezone)
    for (const apt of appointments) {
      const startDt = parseDateInTimezone(apt.appointmentDate, apt.startTime || '09:00', tz);
      const endDt = apt.endTime
        ? parseDateInTimezone(apt.appointmentDate, apt.endTime, tz)
        : new Date(startDt.getTime() + 30 * 60000); // default 30 min
      
      events.push(generateIcsEvent({
        uid: `apt-${apt.id}@viali.app`,
        summary: `Clinic Appointment`,
        start: startDt,
        end: endDt,
        description: apt.notes || '',
        timezone: tz,
      }));
    }
    
    // Add surgeries - plannedDate is a timestamp that includes both date and time
    for (const surgery of surgeryList) {
      const startDt = surgery.plannedDate;
      // Use actual planned end time, fallback to 3h default
      const endDt = surgery.actualEndTime
        ? new Date(surgery.actualEndTime)
        : new Date(startDt.getTime() + 180 * 60000);

      // Add 30min buffer before and after
      const bufferedStart = new Date(startDt.getTime() - 30 * 60000);
      const bufferedEnd = new Date(endDt.getTime() + 30 * 60000);

      events.push(generateIcsEvent({
        uid: `surgery-${surgery.id}@viali.app`,
        summary: `Surgery: ${surgery.plannedSurgery}`,
        start: bufferedStart,
        end: bufferedEnd,
        description: surgery.notes || '',
        timezone: tz,
      }));
    }

    // Add absences (Timebutler: vacation, sick, etc.)
    for (const absence of absenceList) {
      const absStart = new Date(absence.startDate + 'T00:00:00');
      const absEnd = new Date(absence.endDate + 'T00:00:00');

      for (let d = new Date(absStart); d <= absEnd; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const isFirstDay = dateStr === absence.startDate;
        const isLastDay = dateStr === absence.endDate;

        // Half-day logic
        let dayStart = '07:00';
        let dayEnd = '20:00';
        if (isFirstDay && absence.isHalfDayStart) dayStart = '13:00';
        if (isLastDay && absence.isHalfDayEnd) dayEnd = '13:00';

        // Parse time in hospital timezone by using Intl to find the UTC equivalent
        const startDt = parseDateInTimezone(dateStr, dayStart, tz);
        const endDt = parseDateInTimezone(dateStr, dayEnd, tz);

        events.push(generateIcsEvent({
          uid: `absence-${absence.id}-${dateStr}@viali.app`,
          summary: `Absent: ${absence.absenceType}`,
          start: startDt,
          end: endDt,
          description: absence.notes || '',
          timezone: tz,
        }));
      }
    }

    // Add time-offs (manually blocked slots)
    // Both partial-day and full-day blocks must iterate each day in the date range
    for (const timeOff of expandedTimeOffs) {
      const dayStartTime = timeOff.startTime || '07:00';
      const dayEndTime = timeOff.endTime || '20:00';

      const toStart = new Date(timeOff.startDate + 'T00:00:00');
      const toEnd = new Date(timeOff.endDate + 'T00:00:00');

      for (let d = new Date(toStart); d <= toEnd; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const startDt = parseDateInTimezone(dateStr, dayStartTime, tz);
        const endDt = parseDateInTimezone(dateStr, dayEndTime, tz);

        events.push(generateIcsEvent({
          uid: `timeoff-${timeOff.id}-${dateStr}@viali.app`,
          summary: `Blocked: ${timeOff.reason || 'Time off'}`,
          start: startDt,
          end: endDt,
          description: timeOff.notes || '',
          timezone: tz,
        }));
      }
    }

    // VTIMEZONE component (required for proper timezone handling)
    const vtimezone = generateVTimezone(tz);

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Viali//Calendar Feed//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${providerName} - Busy Times`,
      `X-WR-TIMEZONE:${tz}`,
      vtimezone,
      ...events,
      'END:VCALENDAR'
    ].join('\r\n');
    
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="calendar.ics"');
    res.send(icsContent);
  } catch (error: any) {
    logger.error("Error generating ICS feed:", error);
    res.status(500).send('Error generating calendar feed');
  }
});

// Helper: parse a date string + time string (HH:MM) in a given timezone into a UTC Date
function parseDateInTimezone(dateStr: string, time: string, timezone: string): Date {
  // Create a date string and use Intl to figure out the offset
  const naive = new Date(`${dateStr}T${time}:00`);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  // Get what UTC time corresponds to this local time by computing the offset
  const utcFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  // Use a reference point to compute offset for this date
  const refDate = new Date(`${dateStr}T12:00:00Z`);
  const tzParts = formatter.formatToParts(refDate);
  const utcParts = utcFormatter.formatToParts(refDate);
  const getVal = (parts: Intl.DateTimeFormatPart[], type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);

  const tzHour = getVal(tzParts, 'hour');
  const utcHour = getVal(utcParts, 'hour');
  const offsetHours = tzHour - utcHour;

  // Apply offset to get approximate UTC time
  const [h, m] = time.split(':').map(Number);
  const result = new Date(`${dateStr}T${String(h - offsetHours).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
  return result;
}

// Helper: generate VTIMEZONE component for ICS
// All EU timezones follow the same DST transition rules (last Sunday of March/October)
function generateVTimezone(timezone: string): string {
  // Compute standard and daylight offsets using Intl
  const winter = new Date('2026-01-15T12:00:00Z'); // January = standard time
  const summer = new Date('2026-07-15T12:00:00Z'); // July = daylight time

  const getOffset = (date: Date): string => {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    });
    const parts = formatter.formatToParts(date);
    const tzName = parts.find(p => p.type === 'timeZoneName')?.value || '+00:00';
    // Extract offset like "GMT+01:00" -> "+0100"
    const match = tzName.match(/GMT([+-]\d{2}):(\d{2})/);
    if (match) return `${match[1]}${match[2]}`;
    // If GMT with no offset, it's UTC
    if (tzName === 'GMT') return '+0000';
    return '+0000';
  };

  const standardOffset = getOffset(winter);
  const daylightOffset = getOffset(summer);

  // If no DST (standard === daylight), emit a minimal VTIMEZONE
  if (standardOffset === daylightOffset) {
    return [
      'BEGIN:VTIMEZONE',
      `TZID:${timezone}`,
      'BEGIN:STANDARD',
      `TZOFFSETFROM:${standardOffset}`,
      `TZOFFSETTO:${standardOffset}`,
      'DTSTART:19700101T000000',
      'END:STANDARD',
      'END:VTIMEZONE',
    ].join('\r\n');
  }

  // EU DST rules: transition last Sunday of March (to daylight) and last Sunday of October (to standard)
  return [
    'BEGIN:VTIMEZONE',
    `TZID:${timezone}`,
    'BEGIN:DAYLIGHT',
    `TZOFFSETFROM:${standardOffset}`,
    `TZOFFSETTO:${daylightOffset}`,
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    `TZOFFSETFROM:${daylightOffset}`,
    `TZOFFSETTO:${standardOffset}`,
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
  ].join('\r\n');
}

// Helper function to generate ICS event with proper timezone handling
function generateIcsEvent(params: {
  uid: string;
  summary: string;
  start: Date;
  end: Date;
  description?: string;
  timezone?: string;
}): string {
  const tz = params.timezone || 'Europe/Zurich';
  
  // Convert UTC Date to target timezone components using Intl.DateTimeFormat
  // This ensures UTC timestamps from the database are correctly displayed in local time
  const formatIcsLocalDate = (date: Date): string => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    
    const parts = formatter.formatToParts(date);
    const get = (type: string) => parts.find(p => p.type === type)?.value || '00';
    
    return `${get('year')}${get('month')}${get('day')}T${get('hour')}${get('minute')}${get('second')}`;
  };
  
  // UTC format for DTSTAMP (required to be in UTC)
  const formatIcsUtcDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  };
  
  const now = new Date();
  
  return [
    'BEGIN:VEVENT',
    `UID:${params.uid}`,
    `DTSTAMP:${formatIcsUtcDate(now)}`,
    `DTSTART;TZID=${tz}:${formatIcsLocalDate(params.start)}`,
    `DTEND;TZID=${tz}:${formatIcsLocalDate(params.end)}`,
    `SUMMARY:${params.summary}`,
    params.description ? `DESCRIPTION:${params.description.replace(/\n/g, '\\n')}` : '',
    'TRANSP:OPAQUE',
    'STATUS:CONFIRMED',
    'END:VEVENT'
  ].filter(Boolean).join('\r\n');
}

// Test Cal.com API connection
router.post('/api/clinic/:hospitalId/calcom-test', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    const config = await storage.getCalcomConfig(hospitalId);
    if (!config?.apiKey) {
      return res.status(400).json({ message: "Cal.com API key not configured" });
    }
    
    const { createCalcomClient } = await import("../services/calcomClient");
    const calcom = createCalcomClient(config.apiKey);
    
    // Test API key validity by getting the authenticated user
    const me = await calcom.getMe();

    // Auto-detect and cache org ID
    if (me.organizationId) {
      try {
        const { calcomConfig: calcomConfigTable } = await import("@shared/schema");
        const { db } = await import("../db");
        const { eq } = await import("drizzle-orm");
        await db
          .update(calcomConfigTable)
          .set({ orgId: String(me.organizationId) } as any)
          .where(eq(calcomConfigTable.hospitalId, hospitalId));
      } catch (e) {
        logger.warn("Could not cache Cal.com org ID:", (e as Error).message);
      }
    }

    // Try to get event types, but don't fail the test if this endpoint isn't available
    let eventTypes: any[] = [];
    try {
      eventTypes = await calcom.getEventTypes(me.username);
    } catch (e) {
      logger.warn("Could not fetch Cal.com event types (non-critical):", (e as Error).message);
    }

    res.json({
      success: true,
      message: "Cal.com API connection successful",
      user: { username: me.username, email: me.email, name: me.name },
      eventTypes,
    });
  } catch (error: any) {
    logger.error("Error testing Cal.com connection:", error);
    res.status(400).json({ 
      success: false, 
      message: "Failed to connect to Cal.com API",
      error: error.message 
    });
  }
});

// Get ICS feed URLs for all mapped providers
router.get('/api/clinic/:hospitalId/calcom-feeds', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    const config = await storage.getCalcomConfig(hospitalId);
    if (!config) {
      return res.status(404).json({ message: "Cal.com not configured" });
    }
    
    // Generate feed token if not exists
    let feedToken = config.feedToken;
    if (!feedToken) {
      feedToken = crypto.randomUUID().replace(/-/g, '');
      await storage.upsertCalcomConfig({
        ...config,
        feedToken,
      });
    }
    
    const mappings = await storage.getCalcomProviderMappings(hospitalId);
    const enabledMappings = mappings.filter(m => m.isEnabled);
    
    // Get base URL from request or environment
    const baseUrl = process.env.PRODUCTION_URL || 'http://localhost:5000';
    
    const feeds = enabledMappings.map(m => ({
      providerId: m.providerId,
      feedUrl: `${baseUrl}/api/calendar/${hospitalId}/${m.providerId}/feed.ics?token=${feedToken}`,
      calcomEventTypeId: m.calcomEventTypeId,
    }));
    
    res.json({
      feedToken,
      feeds,
      isSubscribed: !!config.icsFeedCredentialId,
      subscribedAt: config.icsFeedSubscribedAt?.toISOString() || null,
    });
  } catch (error: any) {
    logger.error("Error getting Cal.com feeds:", error);
    res.status(500).json({ message: "Failed to get feed URLs", error: error.message });
  }
});

// Subscribe ICS feeds to Cal.com
router.post('/api/clinic/:hospitalId/calcom-subscribe-feeds', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { force } = req.body || {};

    const config = await storage.getCalcomConfig(hospitalId);
    if (!config?.apiKey) {
      return res.status(400).json({ message: "Cal.com API key not configured" });
    }

    // Generate feed token if not exists
    let feedToken = config.feedToken;
    if (!feedToken) {
      feedToken = crypto.randomUUID().replace(/-/g, '');
      await storage.upsertCalcomConfig({
        ...config,
        feedToken,
      });
    }

    const mappings = await storage.getCalcomProviderMappings(hospitalId);
    const enabledMappings = mappings.filter(m => m.isEnabled);

    if (enabledMappings.length === 0) {
      return res.status(400).json({ message: "No provider mappings configured" });
    }

    const { createCalcomClient } = await import("../services/calcomClient");
    const calcom = createCalcomClient(config.apiKey);

    // Get base URL - use production URL for Cal.com subscription
    const baseUrl = process.env.APP_BASE_URL || 'https://use.viali.app';

    // Generate the desired feed URLs
    const feedUrls = enabledMappings.map(m =>
      `${baseUrl}/api/calendar/${hospitalId}/${m.providerId}/feed.ics?token=${feedToken}`
    ).sort();

    // If credential already exists, check if URLs have actually changed
    const existingCredentialId = config.icsFeedCredentialId ? Number(config.icsFeedCredentialId) : null;

    if (existingCredentialId) {
      const currentUrls = await calcom.getIcsFeedUrls(existingCredentialId);

      if (currentUrls) {
        // Credential still exists in Cal.com — compare URLs
        const urlsMatch = currentUrls.length === feedUrls.length &&
          currentUrls.every((url, i) => url === feedUrls[i]);

        if (urlsMatch) {
          // URLs match — no need to disconnect/recreate (preserves toggle associations)
          return res.json({
            success: true,
            alreadySubscribed: true,
            message: `ICS feeds already subscribed with same URLs (since ${config.icsFeedSubscribedAt?.toISOString() || 'unknown'}). No changes needed — toggle associations preserved.`,
            credentialId: existingCredentialId,
          });
        }

        // URLs changed — create new subscription first, then disconnect old one
        // This way, if save fails, we don't lose the existing credential
        logger.info(`ICS feed URLs changed for hospital ${hospitalId} — creating new subscription before disconnecting old`);
        const result = await calcom.subscribeToIcsFeed(feedUrls);
        logger.info(`Subscribed ${feedUrls.length} ICS feed(s): new credential ${result.id}`);

        // Now disconnect the old credential
        try {
          await calcom.disconnectCalendarCredential(existingCredentialId);
          logger.info(`Disconnected old ICS feed credential ${existingCredentialId}`);
        } catch (err: any) {
          logger.warn(`Failed to disconnect old credential ${existingCredentialId}: ${err.message}`);
        }

        await storage.upsertCalcomConfig({
          ...config,
          feedToken,
          icsFeedCredentialId: String(result.id),
          icsFeedSubscribedAt: new Date(),
        });

        return res.json({
          success: true,
          message: `Updated ICS feed subscription (URLs changed). NOTE: You may need to re-enable the toggle associations in Cal.com since a new credential was created.`,
          credentialId: result.id,
          feedUrls,
          urlsChanged: true,
        });
      } else {
        // Credential not found in Cal.com (deleted externally?), proceed to create new
        logger.info(`Stored credential ${existingCredentialId} not found in Cal.com for hospital ${hospitalId} — will create new subscription`);
      }
    }

    // No existing credential (or it was deleted externally) — create fresh
    const result = await calcom.subscribeToIcsFeed(feedUrls);
    logger.info(`Subscribed ${feedUrls.length} ICS feed(s): credential ${result.id}`);

    await storage.upsertCalcomConfig({
      ...config,
      feedToken,
      icsFeedCredentialId: String(result.id),
      icsFeedSubscribedAt: new Date(),
    });

    res.json({
      success: true,
      message: `Subscribed ${feedUrls.length} calendar feed(s) to Cal.com`,
      credentialId: result.id,
      feedUrls,
    });
  } catch (error: any) {
    logger.error("Error subscribing ICS feeds to Cal.com:", error);
    res.status(500).json({
      success: false,
      message: "Failed to subscribe feeds to Cal.com",
      error: error.message
    });
  }
});

// ==========================================
// Cal.com Debug Endpoint (temporary)
// ==========================================

router.get('/api/clinic/:hospitalId/calcom-debug', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const config = await storage.getCalcomConfig(hospitalId);
    if (!config?.apiKey) {
      return res.status(400).json({ message: "Cal.com API key not configured" });
    }

    const { createCalcomClient } = await import("../services/calcomClient");
    const calcom = createCalcomClient(config.apiKey);

    const results: Record<string, any> = {};

    // Helper to try an endpoint with a specific API version
    const tryEndpoint = async (endpoint: string, version?: string) => {
      try {
        const headers: Record<string, string> = {};
        if (version) headers['cal-api-version'] = version;
        const url = `https://api.cal.eu/v2${endpoint}`;
        const response = await fetch(url, {
          headers: {
            'Content-Type': 'application/json',
            'cal-api-version': version || '2024-08-13',
            'Authorization': `Bearer ${config!.apiKey}`,
          },
        });
        const text = await response.text();
        try {
          const json = JSON.parse(text);
          return { status: response.status, data: json.data || json };
        } catch {
          return { status: response.status, body: text.substring(0, 200) };
        }
      } catch (err: any) {
        return { error: err.message?.substring(0, 200) };
      }
    };

    // Core endpoints with default API version
    results['/me'] = await tryEndpoint('/me');
    results['/calendars'] = 'skipped (already shown in parsedCalendars)';

    // Try schedules with different API versions
    const scheduleVersions = ['2024-04-15', '2024-06-11', '2024-06-14', '2024-08-13'];
    for (const v of scheduleVersions) {
      results[`/schedules (v${v})`] = await tryEndpoint('/schedules', v);
    }

    // Try to get the default schedule by ID (from /me response)
    const meData = results['/me']?.data;
    if (meData?.defaultScheduleId) {
      for (const v of ['2024-04-15', '2024-06-11']) {
        results[`/schedules/${meData.defaultScheduleId} (v${v})`] = await tryEndpoint(`/schedules/${meData.defaultScheduleId}`, v);
      }
    }

    // Try event-types with different versions
    results['/event-types (v2024-04-15)'] = await tryEndpoint('/event-types', '2024-04-15');
    results['/event-types (v2024-06-14)'] = await tryEndpoint('/event-types', '2024-06-14');

    const mappings = await storage.getCalcomProviderMappings(hospitalId);

    // Parsed connected calendars (compact)
    let parsedCalendars: any = null;
    try {
      parsedCalendars = await calcom.getConnectedCalendars();
    } catch (_) {}

    res.json({
      apiEndpoints: results,
      parsedCalendars: parsedCalendars?.map((c: any) => ({
        credentialId: c.credentialId,
        integrationType: c.integration?.type,
      })),
      providerMappings: mappings.map(m => ({
        providerId: m.providerId,
        calcomEventTypeId: m.calcomEventTypeId,
        calcomUserId: m.calcomUserId,
        calcomScheduleId: m.calcomScheduleId,
        lastSyncAt: m.lastSyncAt,
        lastSyncError: m.lastSyncError,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Manual sync trigger that returns the actual result/error (not fire-and-forget)
router.post('/api/clinic/:hospitalId/calcom-debug-sync', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { providerId } = req.body;

    if (!providerId) {
      return res.status(400).json({ message: "providerId required" });
    }

    const { syncAvailabilityToCalcom } = await import("../services/calcomSync");
    const result = await syncAvailabilityToCalcom(hospitalId, providerId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message, stack: error.stack?.substring(0, 500) });
  }
});

// Test schedule API versions directly
router.get('/api/clinic/:hospitalId/calcom-debug-schedules', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const config = await storage.getCalcomConfig(hospitalId);
    if (!config?.apiKey) {
      return res.status(400).json({ message: "Cal.com API key not configured" });
    }

    const results: Record<string, any> = {};
    const versions = ['2024-04-15', '2024-06-11', '2024-06-14', '2024-08-13'];

    for (const v of versions) {
      try {
        const response = await fetch(`https://api.cal.eu/v2/schedules`, {
          headers: {
            'Content-Type': 'application/json',
            'cal-api-version': v,
            'Authorization': `Bearer ${config.apiKey}`,
          },
        });
        const text = await response.text();
        results[`GET /schedules (v${v})`] = {
          status: response.status,
          body: text.substring(0, 300),
        };
      } catch (err: any) {
        results[`GET /schedules (v${v})`] = { error: err.message };
      }
    }

    // Also try POST to create a test schedule (dry-run: just see if the endpoint exists)
    try {
      const response = await fetch(`https://api.cal.eu/v2/schedules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cal-api-version': '2024-06-11',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          name: '__test_viali_delete_me',
          timeZone: 'Europe/Zurich',
          isDefault: false,
          availability: [{ days: ['Monday'], startTime: '09:00', endTime: '10:00' }],
        }),
      });
      const text = await response.text();
      results['POST /schedules (v2024-06-11)'] = {
        status: response.status,
        body: text.substring(0, 500),
      };
    } catch (err: any) {
      results['POST /schedules (v2024-06-11)'] = { error: err.message };
    }

    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Disconnect a specific ICS feed credential
router.post('/api/clinic/:hospitalId/calcom-debug-disconnect', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { credentialId } = req.body;
    const config = await storage.getCalcomConfig(hospitalId);
    if (!config?.apiKey) {
      return res.status(400).json({ message: "Cal.com API key not configured" });
    }

    const { createCalcomClient } = await import("../services/calcomClient");
    const calcom = createCalcomClient(config.apiKey);

    // Use the known working method: POST /calendars/ics-feed/disconnect { id }
    const success = await calcom.disconnectCalendarCredential(Number(credentialId));
    if (!success) {
      return res.status(500).json({ success: false, message: `Failed to disconnect credential ${credentialId}` });
    }

    // Check what's left after disconnect
    const cals = await calcom.getConnectedCalendars();
    const remaining = cals.map((c: any) => ({ credentialId: c.credentialId, type: c.integration?.type }));

    res.json({ success: true, disconnected: credentialId, remainingCalendars: remaining });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// Hospital Vonage SMS Configuration Routes
// ==========================================

import { encryptCredential, decryptCredential } from "../utils/encryption";
import logger from "../logger";

// Get Vonage SMS configuration for a hospital
router.get('/api/admin/:hospitalId/integrations/vonage', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    
    // Verify user has admin access to this hospital
    const hospitals = await storage.getUserHospitals(req.user.id);
    const hasAdminRole = hospitals.some((h: any) => h.id === hospitalId && h.role === 'admin');
    if (!hasAdminRole) {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    const config = await storage.getHospitalVonageConfig(hospitalId);
    
    if (!config) {
      return res.json({
        hospitalId,
        isEnabled: false,
        hasApiKey: false,
        hasApiSecret: false,
        hasFromNumber: false,
        lastTestedAt: null,
        lastTestStatus: null,
        lastTestError: null,
      });
    }
    
    res.json({
      hospitalId: config.hospitalId,
      isEnabled: config.isEnabled,
      hasApiKey: !!config.encryptedApiKey,
      hasApiSecret: !!config.encryptedApiSecret,
      hasFromNumber: !!config.encryptedFromNumber,
      lastTestedAt: config.lastTestedAt,
      lastTestStatus: config.lastTestStatus,
      lastTestError: config.lastTestError,
    });
  } catch (error) {
    logger.error("Error fetching Vonage config:", error);
    res.status(500).json({ message: "Failed to fetch Vonage configuration" });
  }
});

// Save Vonage SMS configuration for a hospital
router.put('/api/admin/:hospitalId/integrations/vonage', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { apiKey, apiSecret, fromNumber, isEnabled } = req.body;
    
    // Verify user has admin access to this hospital
    const hospitals = await storage.getUserHospitals(req.user.id);
    const hasAdminRole = hospitals.some((h: any) => h.id === hospitalId && h.role === 'admin');
    if (!hasAdminRole) {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    const existing = await storage.getHospitalVonageConfig(hospitalId);
    
    // Encrypt credentials if provided
    const encryptedApiKey = apiKey ? encryptCredential(apiKey) : existing?.encryptedApiKey;
    const encryptedApiSecret = apiSecret ? encryptCredential(apiSecret) : existing?.encryptedApiSecret;
    const encryptedFromNumber = fromNumber ? encryptCredential(fromNumber) : existing?.encryptedFromNumber;
    
    const config = await storage.upsertHospitalVonageConfig({
      hospitalId,
      encryptedApiKey,
      encryptedApiSecret,
      encryptedFromNumber,
      isEnabled: isEnabled ?? existing?.isEnabled ?? true,
    });
    
    res.json({
      hospitalId: config.hospitalId,
      isEnabled: config.isEnabled,
      hasApiKey: !!config.encryptedApiKey,
      hasApiSecret: !!config.encryptedApiSecret,
      hasFromNumber: !!config.encryptedFromNumber,
      lastTestedAt: config.lastTestedAt,
      lastTestStatus: config.lastTestStatus,
      lastTestError: config.lastTestError,
    });
  } catch (error) {
    logger.error("Error saving Vonage config:", error);
    res.status(500).json({ message: "Failed to save Vonage configuration" });
  }
});

// Test Vonage SMS configuration
router.post('/api/admin/:hospitalId/integrations/vonage/test', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { testPhoneNumber } = req.body;
    
    // Verify user has admin access to this hospital
    const hospitals = await storage.getUserHospitals(req.user.id);
    const hasAdminRole = hospitals.some((h: any) => h.id === hospitalId && h.role === 'admin');
    if (!hasAdminRole) {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    const hospital = await storage.getHospital(hospitalId);
    const config = await storage.getHospitalVonageConfig(hospitalId);
    if (!config || !config.encryptedApiKey || !config.encryptedApiSecret || !config.encryptedFromNumber) {
      return res.status(400).json({ message: "Vonage credentials not fully configured" });
    }

    // Decrypt credentials
    const apiKey = decryptCredential(config.encryptedApiKey);
    const apiSecret = decryptCredential(config.encryptedApiSecret);
    const fromNumber = decryptCredential(config.encryptedFromNumber);

    if (!apiKey || !apiSecret || !fromNumber) {
      await storage.updateHospitalVonageTestStatus(hospitalId, 'failed', 'Failed to decrypt credentials');
      return res.status(500).json({ message: "Failed to decrypt credentials" });
    }

    // Test by sending SMS
    const { Vonage } = await import('@vonage/server-sdk');
    const vonage = new Vonage({ apiKey, apiSecret });

    const testNumber = testPhoneNumber || fromNumber;
    const vonageTo = testNumber.replace(/^\+/, '');
    const vonageFrom = fromNumber.replace(/^\+/, '');

    const response = await vonage.sms.send({
      to: vonageTo,
      from: vonageFrom,
      text: `Viali SMS test - ${hospital?.name || 'Unknown'}. Your Vonage integration is working correctly!`,
    });
    
    const firstMessage = response.messages[0];
    
    if (firstMessage.status === '0') {
      await storage.updateHospitalVonageTestStatus(hospitalId, 'success');
      res.json({ 
        success: true, 
        message: "Test SMS sent successfully",
        messageId: firstMessage.messageId,
      });
    } else {
      const errorMsg = firstMessage.errorText || 'Unknown Vonage error';
      await storage.updateHospitalVonageTestStatus(hospitalId, 'failed', errorMsg);
      res.status(400).json({ 
        success: false, 
        message: errorMsg,
      });
    }
  } catch (error: any) {
    logger.error("Error testing Vonage config:", error);
    const errorMsg = error.message || 'Failed to test Vonage configuration';
    
    try {
      const { hospitalId } = req.params;
      await storage.updateHospitalVonageTestStatus(hospitalId, 'failed', errorMsg);
    } catch {}
    
    res.status(500).json({ message: errorMsg });
  }
});

// Delete Vonage SMS configuration
router.delete('/api/admin/:hospitalId/integrations/vonage', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    
    // Verify user has admin access to this hospital
    const hospitals = await storage.getUserHospitals(req.user.id);
    const hasAdminRole = hospitals.some((h: any) => h.id === hospitalId && h.role === 'admin');
    if (!hasAdminRole) {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    // Clear the config by setting everything to null
    await storage.upsertHospitalVonageConfig({
      hospitalId,
      encryptedApiKey: null,
      encryptedApiSecret: null,
      encryptedFromNumber: null,
      isEnabled: false,
    });
    
    res.json({ success: true, message: "Vonage configuration removed" });
  } catch (error) {
    logger.error("Error deleting Vonage config:", error);
    res.status(500).json({ message: "Failed to delete Vonage configuration" });
  }
});

// ==========================================
// ASPSMS SMS Integration
// ==========================================

// Get ASPSMS configuration for a hospital
router.get('/api/admin/:hospitalId/integrations/aspsms', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;

    const hospitals = await storage.getUserHospitals(req.user.id);
    const hasAdminRole = hospitals.some((h: any) => h.id === hospitalId && h.role === 'admin');
    if (!hasAdminRole) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const config = await storage.getHospitalAspsmsConfig(hospitalId);

    if (!config) {
      return res.json({
        hospitalId,
        isEnabled: false,
        hasUserKey: false,
        hasPassword: false,
        originator: null,
        lastTestedAt: null,
        lastTestStatus: null,
        lastTestError: null,
      });
    }

    res.json({
      hospitalId: config.hospitalId,
      isEnabled: config.isEnabled,
      hasUserKey: !!config.encryptedUserKey,
      hasPassword: !!config.encryptedPassword,
      originator: config.originator,
      lastTestedAt: config.lastTestedAt,
      lastTestStatus: config.lastTestStatus,
      lastTestError: config.lastTestError,
    });
  } catch (error) {
    logger.error("Error fetching ASPSMS config:", error);
    res.status(500).json({ message: "Failed to fetch ASPSMS configuration" });
  }
});

// Save ASPSMS configuration for a hospital
router.put('/api/admin/:hospitalId/integrations/aspsms', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { userKey, password, originator, isEnabled } = req.body;

    const hospitals = await storage.getUserHospitals(req.user.id);
    const hasAdminRole = hospitals.some((h: any) => h.id === hospitalId && h.role === 'admin');
    if (!hasAdminRole) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const existing = await storage.getHospitalAspsmsConfig(hospitalId);

    const encryptedUserKey = userKey ? encryptCredential(userKey) : existing?.encryptedUserKey;
    const encryptedPassword = password ? encryptCredential(password) : existing?.encryptedPassword;
    // Originator is plain text (max 11 chars), not encrypted
    const resolvedOriginator = originator !== undefined ? (originator || null) : (existing?.originator || null);

    const config = await storage.upsertHospitalAspsmsConfig({
      hospitalId,
      encryptedUserKey,
      encryptedPassword,
      originator: resolvedOriginator,
      isEnabled: isEnabled ?? existing?.isEnabled ?? true,
    });

    res.json({
      hospitalId: config.hospitalId,
      isEnabled: config.isEnabled,
      hasUserKey: !!config.encryptedUserKey,
      hasPassword: !!config.encryptedPassword,
      originator: config.originator,
      lastTestedAt: config.lastTestedAt,
      lastTestStatus: config.lastTestStatus,
      lastTestError: config.lastTestError,
    });
  } catch (error) {
    logger.error("Error saving ASPSMS config:", error);
    res.status(500).json({ message: "Failed to save ASPSMS configuration" });
  }
});

// Test ASPSMS configuration
router.post('/api/admin/:hospitalId/integrations/aspsms/test', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { testPhoneNumber } = req.body;

    const hospitals = await storage.getUserHospitals(req.user.id);
    const hasAdminRole = hospitals.some((h: any) => h.id === hospitalId && h.role === 'admin');
    if (!hasAdminRole) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const hospital = await storage.getHospital(hospitalId);
    const config = await storage.getHospitalAspsmsConfig(hospitalId);
    if (!config || !config.encryptedUserKey || !config.encryptedPassword) {
      return res.status(400).json({ message: "ASPSMS credentials not fully configured" });
    }

    const userKey = decryptCredential(config.encryptedUserKey);
    const password = decryptCredential(config.encryptedPassword);

    if (!userKey || !password) {
      await storage.updateHospitalAspsmsTestStatus(hospitalId, 'failed', 'Failed to decrypt credentials');
      return res.status(500).json({ message: "Failed to decrypt credentials" });
    }

    const originator = config.originator || hospital?.name?.replace(/[^a-zA-Z0-9]/g, '').substring(0, 11) || 'ViALI';

    // Import normalizePhoneNumber to format the test number
    const { normalizePhoneNumber } = await import('../sms');
    const normalizedNumber = normalizePhoneNumber(testPhoneNumber || '');

    if (!normalizedNumber) {
      return res.status(400).json({ message: "Invalid phone number" });
    }

    // Send test SMS via ASPSMS JSON API
    const response = await fetch('https://json.aspsms.com/SendSimpleTextSMS', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        UserName: userKey,
        Password: password,
        Originator: originator,
        Recipients: [normalizedNumber],
        MessageText: `Viali SMS test - ${hospital?.name || 'Unknown'}. Your ASPSMS integration is working correctly!`,
      }),
    });

    const result = await response.json();

    if (result.StatusCode === '1') {
      await storage.updateHospitalAspsmsTestStatus(hospitalId, 'success');
      res.json({ success: true, message: "Test SMS sent successfully" });
    } else {
      const errorMsg = `ASPSMS error ${result.StatusCode}: ${result.StatusInfo}`;
      await storage.updateHospitalAspsmsTestStatus(hospitalId, 'failed', errorMsg);
      res.status(400).json({ success: false, message: errorMsg });
    }
  } catch (error: any) {
    logger.error("Error testing ASPSMS config:", error);
    const errorMsg = error.message || 'Failed to test ASPSMS configuration';

    try {
      const { hospitalId } = req.params;
      await storage.updateHospitalAspsmsTestStatus(hospitalId, 'failed', errorMsg);
    } catch {}

    res.status(500).json({ message: errorMsg });
  }
});

// Delete ASPSMS configuration
router.delete('/api/admin/:hospitalId/integrations/aspsms', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;

    const hospitals = await storage.getUserHospitals(req.user.id);
    const hasAdminRole = hospitals.some((h: any) => h.id === hospitalId && h.role === 'admin');
    if (!hasAdminRole) {
      return res.status(403).json({ message: "Admin access required" });
    }

    await storage.upsertHospitalAspsmsConfig({
      hospitalId,
      encryptedUserKey: null,
      encryptedPassword: null,
      originator: null,
      isEnabled: false,
    });

    res.json({ success: true, message: "ASPSMS configuration removed" });
  } catch (error) {
    logger.error("Error deleting ASPSMS config:", error);
    res.status(500).json({ message: "Failed to delete ASPSMS configuration" });
  }
});

// Check ASPSMS credits for a hospital
router.get('/api/admin/:hospitalId/integrations/aspsms/credits', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;

    const hospitals = await storage.getUserHospitals(req.user.id);
    const hasAdminRole = hospitals.some((h: any) => h.id === hospitalId && h.role === 'admin');
    if (!hasAdminRole) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const config = await storage.getHospitalAspsmsConfig(hospitalId);
    if (!config || !config.encryptedUserKey || !config.encryptedPassword) {
      return res.status(400).json({ message: "ASPSMS credentials not configured" });
    }

    const userKey = decryptCredential(config.encryptedUserKey);
    const password = decryptCredential(config.encryptedPassword);

    if (!userKey || !password) {
      return res.status(500).json({ message: "Failed to decrypt credentials" });
    }

    const response = await fetch('https://json.aspsms.com/CheckCredits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        UserName: userKey,
        Password: password,
      }),
    });

    const result = await response.json();

    if (result.StatusCode === '1') {
      res.json({ credits: result.Credits, statusInfo: result.StatusInfo });
    } else {
      res.status(400).json({ message: `ASPSMS error: ${result.StatusInfo}` });
    }
  } catch (error) {
    logger.error("Error checking ASPSMS credits:", error);
    res.status(500).json({ message: "Failed to check ASPSMS credits" });
  }
});

// ==========================================
// SMS Provider Selection
// ==========================================

// Set SMS provider preference for a hospital
router.put('/api/admin/:hospitalId/integrations/sms-provider', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { provider } = req.body;

    const hospitals = await storage.getUserHospitals(req.user.id);
    const hasAdminRole = hospitals.some((h: any) => h.id === hospitalId && h.role === 'admin');
    if (!hasAdminRole) {
      return res.status(403).json({ message: "Admin access required" });
    }

    if (!['auto', 'aspsms', 'vonage'].includes(provider)) {
      return res.status(400).json({ message: "Invalid provider. Must be 'auto', 'aspsms', or 'vonage'" });
    }

    await storage.updateHospital(hospitalId, { smsProvider: provider });

    res.json({ success: true, provider });
  } catch (error) {
    logger.error("Error setting SMS provider:", error);
    res.status(500).json({ message: "Failed to set SMS provider" });
  }
});

// Get SMS provider preference for a hospital
router.get('/api/admin/:hospitalId/integrations/sms-provider', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;

    const hospitals = await storage.getUserHospitals(req.user.id);
    const hasAdminRole = hospitals.some((h: any) => h.id === hospitalId && h.role === 'admin');
    if (!hasAdminRole) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const fullHospital = await storage.getHospital(hospitalId);

    res.json({ provider: fullHospital?.smsProvider || 'auto' });
  } catch (error) {
    logger.error("Error fetching SMS provider:", error);
    res.status(500).json({ message: "Failed to fetch SMS provider" });
  }
});

// ========================================
// Clinic Day Notes Endpoints
// ========================================

router.get('/api/clinic/:hospitalId/day-notes/:date', isAuthenticated, requireStrictHospitalAccess, async (req, res) => {
  try {
    const { hospitalId, date } = req.params;

    const [note] = await db
      .select()
      .from(clinicDayNotes)
      .where(
        and(
          eq(clinicDayNotes.hospitalId, hospitalId),
          eq(clinicDayNotes.date, date)
        )
      );

    res.json(note || { notes: '' });
  } catch (error) {
    logger.error("Error fetching clinic day notes:", error);
    res.status(500).json({ message: "Failed to fetch clinic day notes" });
  }
});

router.put('/api/clinic/:hospitalId/day-notes/:date', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId, date } = req.params;
    const { notes } = req.body;
    const userId = req.user.id;

    const [result] = await db
      .insert(clinicDayNotes)
      .values({
        hospitalId,
        date,
        notes: notes ?? '',
        createdBy: userId,
        updatedBy: userId,
      })
      .onConflictDoUpdate({
        target: [clinicDayNotes.hospitalId, clinicDayNotes.date],
        set: {
          notes: notes ?? '',
          updatedBy: userId,
          updatedAt: new Date(),
        },
      })
      .returning();

    res.json(result);
  } catch (error) {
    logger.error("Error saving clinic day notes:", error);
    res.status(500).json({ message: "Failed to save clinic day notes" });
  }
});

export default router;
