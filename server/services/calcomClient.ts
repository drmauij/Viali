const CALCOM_API_BASE = 'https://api.cal.com/v2';

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
      console.error(`Cal.com API error: ${response.status}`, errorText);
      throw new Error(`Cal.com API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.data || data;
  }

  async getEventTypes(): Promise<CalcomEventType[]> {
    return this.request<CalcomEventType[]>('/event-types');
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
    title: string
  ): Promise<CalcomBooking> {
    return this.request<CalcomBooking>('/bookings', {
      method: 'POST',
      body: JSON.stringify({
        eventTypeId,
        start,
        attendee: {
          name: 'System Block',
          email: 'system@clinic.local',
          timeZone: 'UTC',
        },
        metadata: {
          isBusyBlock: true,
          blockTitle: title,
        },
      }),
    });
  }
}

export function createCalcomClient(apiKey: string): CalcomClient {
  return new CalcomClient(apiKey);
}
