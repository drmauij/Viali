import logger from "../logger";
const CALCOM_API_BASE = 'https://api.cal.eu/v2';

export interface CalcomSlot {
  time: string;
  attendees?: number;
}

export interface CalcomAvailability {
  busy: Array<{
    start: string;
    end: string;
  }>;
  timeZone: string;
  dateRanges: Array<{
    start: string;
    end: string;
  }>;
}

export interface CalcomBooking {
  id: number;
  uid: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  attendees: Array<{
    email: string;
    name: string;
    timeZone?: string;
  }>;
  eventTypeId: number;
  status: string;
  metadata?: Record<string, unknown>;
}

export interface CalcomEventType {
  id: number;
  slug: string;
  title: string;
  length: number;
  description?: string;
}

export interface CreateBookingRequest {
  eventTypeId: number;
  start: string;
  attendee: {
    name: string;
    email: string;
    timeZone: string;
    language?: string;
  };
  metadata?: Record<string, unknown>;
  bookingFieldsResponses?: Record<string, string>;
}

export interface CreateOutOfOfficeRequest {
  start: string;
  end: string;
  notes?: string;
  toUserId?: number;
}

export interface ListBookingsParams {
  status?: 'upcoming' | 'recurring' | 'past' | 'cancelled' | 'unconfirmed';
  attendeeEmail?: string;
  eventTypeId?: number;
  afterStart?: string;
  beforeEnd?: string;
  take?: number;
}

export interface RescheduleBookingRequest {
  start: string;
  reschedulingReason?: string;
}

export interface CreateBusyBlockRequest {
  eventTypeId: number;
  start: string;
  end?: string; // If not provided, uses event type duration
  title: string;
  timezone?: string;
  metadata?: {
    sourceType: 'appointment' | 'surgery' | 'timeoff' | 'absence';
    sourceId: string;
    hospitalId?: string;
    patientName?: string;
  };
}

export interface CalcomScheduleAvailability {
  days: string[]; // "Monday", "Tuesday", etc.
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
}

export interface CalcomScheduleOverride {
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
}

export interface CreateScheduleRequest {
  name: string;
  timeZone: string;
  isDefault: boolean;
  availability?: CalcomScheduleAvailability[];
  overrides?: CalcomScheduleOverride[];
}

export interface UpdateScheduleRequest {
  name?: string;
  timeZone?: string;
  availability?: CalcomScheduleAvailability[];
  overrides?: CalcomScheduleOverride[];
  isDefault?: boolean;
}

export interface CalcomSchedule {
  id: number;
  ownerId: number;
  name: string;
  timeZone: string;
  availability: CalcomScheduleAvailability[];
  isDefault: boolean;
  overrides: CalcomScheduleOverride[];
}

export class CalcomClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${CALCOM_API_BASE}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'cal-api-version': '2024-08-13',
      ...(options.headers as Record<string, string> || {}),
    };

    if (this.apiKey.startsWith('cal_')) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    } else {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Cal.com API error: ${response.status}`, errorText);
      throw new Error(`Cal.com API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.data || data;
  }

  /**
   * Get the current authenticated user's profile (good for testing API key validity)
   */
  async getMe(): Promise<{ id: number; username: string; email: string; name?: string; organizationId?: number }> {
    return this.request('/me');
  }

  async getEventTypes(username?: string): Promise<CalcomEventType[]> {
    const params = username ? `?username=${encodeURIComponent(username)}` : '';
    return this.request<CalcomEventType[]>(`/event-types${params}`);
  }

  async getAvailability(
    eventTypeId: number,
    startTime: string,
    endTime: string
  ): Promise<CalcomSlot[]> {
    const params = new URLSearchParams({
      eventTypeId: eventTypeId.toString(),
      startTime,
      endTime,
    });
    
    return this.request<CalcomSlot[]>(`/slots?${params.toString()}`);
  }

  async createBooking(booking: CreateBookingRequest): Promise<CalcomBooking> {
    return this.request<CalcomBooking>('/bookings', {
      method: 'POST',
      body: JSON.stringify(booking),
    });
  }

  async cancelBooking(bookingUid: string, cancellationReason?: string): Promise<void> {
    await this.request(`/bookings/${bookingUid}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ cancellationReason }),
    });
  }

  async getBooking(bookingUid: string): Promise<CalcomBooking> {
    return this.request<CalcomBooking>(`/bookings/${bookingUid}`);
  }

  async createOutOfOffice(params: CreateOutOfOfficeRequest): Promise<{ id: number; uuid: string }> {
    return this.request<{ id: number; uuid: string }>('/out-of-office', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async deleteOutOfOffice(outOfOfficeId: number): Promise<void> {
    await this.request(`/out-of-office/${outOfOfficeId}`, {
      method: 'DELETE',
    });
  }

  async listOutOfOffice(userId?: number): Promise<Array<{ id: number; uuid: string; start: string; end: string; notes?: string }>> {
    const params = userId ? `?userId=${userId}` : '';
    return this.request(`/out-of-office${params}`);
  }

  async createBusyBlock(
    eventTypeId: number,
    start: string,
    end: string,
    title: string,
    timezone?: string,
  ): Promise<CalcomBooking> {
    return this.request<CalcomBooking>('/bookings', {
      method: 'POST',
      body: JSON.stringify({
        eventTypeId,
        start,
        attendee: {
          name: 'System Block',
          email: 'system@clinic.local',
          timeZone: timezone || 'Europe/Zurich',
        },
        bookingFieldsResponses: {
          title: title,
        },
        metadata: {
          isBusyBlock: "true",
          blockTitle: title,
        },
      }),
    });
  }

  /**
   * Create a busy block with detailed metadata for tracking sync state
   */
  async createBusyBlockWithMetadata(request: CreateBusyBlockRequest): Promise<CalcomBooking> {
    return this.request<CalcomBooking>('/bookings', {
      method: 'POST',
      body: JSON.stringify({
        eventTypeId: request.eventTypeId,
        start: request.start,
        attendee: {
          name: request.title,
          email: 'system-block@clinic.local',
          timeZone: request.timezone || 'Europe/Zurich',
        },
        bookingFieldsResponses: {
          title: request.title,
        },
        metadata: {
          isBusyBlock: "true",
          blockTitle: request.title,
          ...request.metadata,
        },
      }),
    });
  }

  /**
   * List bookings with filters for reconciliation
   */
  async listBookings(params: ListBookingsParams = {}): Promise<CalcomBooking[]> {
    const searchParams = new URLSearchParams();
    
    if (params.status) searchParams.set('status', params.status);
    if (params.attendeeEmail) searchParams.set('attendeeEmail', params.attendeeEmail);
    if (params.eventTypeId) searchParams.set('eventTypeId', params.eventTypeId.toString());
    if (params.afterStart) searchParams.set('afterStart', params.afterStart);
    if (params.beforeEnd) searchParams.set('beforeEnd', params.beforeEnd);
    if (params.take) searchParams.set('take', params.take.toString());
    
    const query = searchParams.toString();
    return this.request<CalcomBooking[]>(`/bookings${query ? `?${query}` : ''}`);
  }

  /**
   * Reschedule an existing booking to a new time
   */
  async rescheduleBooking(bookingUid: string, request: RescheduleBookingRequest): Promise<CalcomBooking> {
    return this.request<CalcomBooking>(`/bookings/${bookingUid}/reschedule`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Mark a booking as no-show (for missed appointments)
   */
  async markNoShow(bookingUid: string, noShow: boolean = true): Promise<void> {
    await this.request(`/bookings/${bookingUid}/mark-absent`, {
      method: 'POST',
      body: JSON.stringify({ noShow }),
    });
  }

  /**
   * Get all system-created busy blocks (our sync blocks) for a date range
   * Filters by the system email we use for busy blocks
   */
  async getSystemBusyBlocks(afterStart?: string, beforeEnd?: string): Promise<CalcomBooking[]> {
    const bookings = await this.listBookings({
      attendeeEmail: 'system-block@clinic.local',
      status: 'upcoming',
      afterStart,
      beforeEnd,
      take: 500,
    });
    
    return bookings.filter(b => b.metadata?.isBusyBlock);
  }

  /**
   * Delete/cancel a busy block by its UID
   */
  async deleteBusyBlock(bookingUid: string): Promise<void> {
    await this.cancelBooking(bookingUid, 'System block removed');
  }

  /**
   * Sync a single appointment/surgery to Cal.com
   * Creates or updates the busy block
   */
  async syncBusyBlock(
    eventTypeId: number,
    existingUid: string | null,
    start: string,
    title: string,
    metadata: CreateBusyBlockRequest['metadata'],
    timezone?: string,
  ): Promise<{ uid: string; action: 'created' | 'updated' | 'unchanged' }> {
    if (existingUid) {
      // Check if we need to update
      try {
        const existing = await this.getBooking(existingUid);
        
        // If the time hasn't changed, no update needed
        if (existing.startTime === start) {
          return { uid: existingUid, action: 'unchanged' };
        }
        
        // Reschedule to new time
        const rescheduled = await this.rescheduleBooking(existingUid, {
          start,
          reschedulingReason: 'Schedule update from clinic system',
        });
        
        return { uid: rescheduled.uid, action: 'updated' };
      } catch (error: any) {
        // If the booking doesn't exist anymore, create a new one
        if (error.message?.includes('404')) {
          const created = await this.createBusyBlockWithMetadata({
            eventTypeId,
            start,
            title,
            metadata,
            timezone,
          });
          return { uid: created.uid, action: 'created' };
        }
        throw error;
      }
    }

    // Create new busy block
    const created = await this.createBusyBlockWithMetadata({
      eventTypeId,
      start,
      title,
      metadata,
      timezone,
    });
    
    return { uid: created.uid, action: 'created' };
  }

  /**
   * Subscribe to ICS calendar feed URLs in Cal.com.
   * Cal.com API expects { urls: string[] } (array).
   */
  async subscribeToIcsFeed(urls: string[]): Promise<{ id: number; type: string }> {
    return this.request<{ id: number; type: string }>('/calendars/ics-feed/save', {
      method: 'POST',
      body: JSON.stringify({ urls }),
    });
  }

  /**
   * Check connected calendars.
   * Cal.com GET /calendars returns { connectedCalendars: [...], destinationCalendar: {...} }
   * Each entry has: { credentialId, integration: { type, name }, calendars: [...] }
   */
  async getConnectedCalendars(): Promise<Array<{
    credentialId: number;
    integration: { type: string; name: string };
    calendars?: Array<{ externalId: string; name: string; isSelected: boolean; readOnly: boolean }>;
  }>> {
    const result = await this.request<{
      connectedCalendars: Array<{
        credentialId: number;
        integration: { type: string; name: string };
        calendars?: Array<{ externalId: string; name: string; isSelected: boolean; readOnly: boolean }>;
      }>;
    }>('/calendars');
    return result.connectedCalendars || [];
  }

  /**
   * Get all schedules for a user within an organization
   */
  async getOrgUserSchedules(orgId: number, userId: number): Promise<CalcomSchedule[]> {
    return this.request<CalcomSchedule[]>(
      `/organizations/${orgId}/users/${userId}/schedules`
    );
  }

  /**
   * Create a schedule for a user within an organization
   */
  async createOrgUserSchedule(
    orgId: number,
    userId: number,
    schedule: CreateScheduleRequest
  ): Promise<CalcomSchedule> {
    return this.request<CalcomSchedule>(
      `/organizations/${orgId}/users/${userId}/schedules`,
      {
        method: 'POST',
        body: JSON.stringify(schedule),
      }
    );
  }

  /**
   * Update a schedule for a user within an organization
   */
  async updateOrgUserSchedule(
    orgId: number,
    userId: number,
    scheduleId: number,
    schedule: UpdateScheduleRequest
  ): Promise<CalcomSchedule> {
    return this.request<CalcomSchedule>(
      `/organizations/${orgId}/users/${userId}/schedules/${scheduleId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(schedule),
      }
    );
  }

  /**
   * Disconnect an ICS feed calendar credential by its credential ID.
   * Uses POST /calendars/ics-feed/disconnect with { id } body.
   */
  async disconnectCalendarCredential(credentialId: number): Promise<boolean> {
    try {
      await this.request('/calendars/ics-feed/disconnect', {
        method: 'POST',
        body: JSON.stringify({ id: credentialId }),
      });
      logger.info(`Disconnected ICS feed credential ${credentialId}`);
      return true;
    } catch (error: any) {
      logger.warn(`Failed to disconnect credential ${credentialId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Get or create a personal schedule (non-organization).
   * Uses direct /schedules endpoints with the 2024-06-11 API version.
   */
  async getSchedules(): Promise<CalcomSchedule[]> {
    return this.request<CalcomSchedule[]>('/schedules', {
      headers: { 'cal-api-version': '2024-06-11' },
    });
  }

  async createSchedule(schedule: CreateScheduleRequest): Promise<CalcomSchedule> {
    return this.request<CalcomSchedule>('/schedules', {
      method: 'POST',
      headers: { 'cal-api-version': '2024-06-11' },
      body: JSON.stringify(schedule),
    });
  }

  async updateSchedule(scheduleId: number, schedule: UpdateScheduleRequest): Promise<CalcomSchedule> {
    return this.request<CalcomSchedule>(`/schedules/${scheduleId}`, {
      method: 'PATCH',
      headers: { 'cal-api-version': '2024-06-11' },
      body: JSON.stringify(schedule),
    });
  }

  /**
   * Get the currently subscribed ICS feed URLs for a specific credential.
   * Returns the externalIds (URLs) from the connected calendar entry, or null if not found.
   */
  async getIcsFeedUrls(credentialId: number): Promise<string[] | null> {
    try {
      const calendars = await this.getConnectedCalendars();
      const icsCal = calendars.find(c => c.credentialId === credentialId);
      if (!icsCal || !icsCal.calendars) return null;
      return icsCal.calendars.map(c => c.externalId).sort();
    } catch (error: any) {
      logger.warn(`Failed to get ICS feed URLs for credential ${credentialId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Find and disconnect ALL ICS feed credentials.
   * Scans connected calendars for ICS-type integrations and disconnects each.
   */
  async disconnectAllIcsFeeds(): Promise<number> {
    const calendars = await this.getConnectedCalendars();
    const icsCalendars = calendars.filter(
      c => c.integration?.type?.includes('ics') || c.integration?.name?.toLowerCase()?.includes('ics')
    );
    logger.info(`Found ${icsCalendars.length} ICS feed credential(s) to disconnect (out of ${calendars.length} total connected calendars)`);
    let disconnected = 0;
    for (const cal of icsCalendars) {
      const success = await this.disconnectCalendarCredential(cal.credentialId);
      if (success) disconnected++;
    }
    return disconnected;
  }
}

export function createCalcomClient(apiKey: string): CalcomClient {
  return new CalcomClient(apiKey);
}
