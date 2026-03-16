export const queryKeys = {
  auth: {
    user: () => ["/api/auth/user"] as const,
    preferences: () => ["/api/user/preferences"] as const,
  },
  patients: {
    detail: (patientId: string) => [`/api/patients/${patientId}`] as const,
    list: (hospitalId: string) => [`/api/patients/${hospitalId}`] as const,
    episodes: (patientId: string) => [`/api/patients/${patientId}/episodes`] as const,
    documents: (patientId: string) => [`/api/patients/${patientId}/documents`] as const,
  },
  anesthesia: {
    surgery: (surgeryId: string) => [`/api/anesthesia/surgeries/${surgeryId}`] as const,
    surgeries: (hospitalId: string, startDate: string, endDate: string) =>
      [`/api/anesthesia/surgeries`, hospitalId, startDate, endDate] as const,
    record: (recordId: string) => [`/api/anesthesia/records/${recordId}`] as const,
    recordBySurgery: (surgeryId: string) => [`/api/anesthesia/records/surgery/${surgeryId}`] as const,
    vitals: (recordId: string) => [`/api/anesthesia/vitals/snapshot/${recordId}`] as const,
    medications: (recordId: string) => [`/api/anesthesia/medications/${recordId}`] as const,
    events: (recordId: string) => [`/api/anesthesia/events/${recordId}`] as const,
    staff: (recordId: string) => [`/api/anesthesia/staff/${recordId}`] as const,
    positions: (recordId: string) => [`/api/anesthesia/positions/${recordId}`] as const,
    items: (hospitalId: string) => [`/api/anesthesia/items/${hospitalId}`] as const,
    settings: (hospitalId: string) => [`/api/anesthesia/settings/${hospitalId}`] as const,
    preop: (surgeryId: string) => [`/api/anesthesia/preop/surgery/${surgeryId}`] as const,
    airway: (recordId: string) => [`/api/anesthesia/${recordId}/airway`] as const,
    neuraxialBlocks: (recordId: string) => [`/api/anesthesia/${recordId}/neuraxial-blocks`] as const,
    peripheralBlocks: (recordId: string) => [`/api/anesthesia/${recordId}/peripheral-blocks`] as const,
    generalTechnique: (recordId: string) => [`/api/anesthesia/${recordId}/general-technique`] as const,
    installations: (recordId: string) => ["/api/anesthesia/installations", recordId] as const,
  },
  inventory: {
    items: (hospitalId: string, unitId?: string, filter?: string) => {
      const params = unitId ? `?unitId=${unitId}${filter === 'archived' ? '&includeArchived=true' : ''}` : '';
      return [`/api/items/${hospitalId}${params}`, unitId, filter] as const;
    },
    folders: (hospitalId: string, unitId?: string) => {
      const params = unitId ? `?unitId=${unitId}` : '';
      return [`/api/folders/${hospitalId}${params}`, unitId] as const;
    },
    vendors: (hospitalId: string, unitId?: string) => [`/api/vendors/${hospitalId}`, unitId] as const,
    openItems: (hospitalId: string, unitId?: string) => [`/api/orders/open-items/${hospitalId}`, unitId] as const,
  },
  orders: {
    list: (hospitalId: string, status?: string, unitId?: string) => [`/api/orders/${hospitalId}`, status, unitId] as const,
  },
  clinic: {
    bookableProviders: (hospitalId: string, unitId?: string) => [`/api/clinic/${hospitalId}/bookable-providers`, unitId] as const,
    providers: (hospitalId: string) => [`/api/clinic/${hospitalId}/clinic-providers`] as const,
    unitProviders: (hospitalId: string, unitId: string) => [`/api/clinic/${hospitalId}/units/${unitId}/providers`] as const,
    availability: (hospitalId: string, unitId: string, providerId: string) =>
      [`/api/clinic/${hospitalId}/units/${unitId}/providers/${providerId}/availability`] as const,
    surgeries: (hospitalId: string, start: string, end: string) =>
      [`/api/clinic/${hospitalId}/all-surgeries`, start, end] as const,
  },
  admin: {
    users: (hospitalId: string) => [`/api/admin/${hospitalId}/users`] as const,
    staffDuplicates: (hospitalId: string) => [`/api/admin/${hospitalId}/staff-duplicates`] as const,
  },
  hospitals: {
    todos: (hospitalId: string) => ['/api/hospitals', hospitalId, 'todos'] as const,
    usersByModule: (hospitalId: string) => ['/api/hospitals', hospitalId, 'users-by-module'] as const,
  },
  chat: {
    conversations: (hospitalId: string) => ['/api/chat', hospitalId, 'conversations'] as const,
    messages: (conversationId: string) => ['/api/chat/conversations', conversationId, 'messages'] as const,
    notifications: (hospitalId: string) => ['/api/chat', hospitalId, 'notifications'] as const,
  },
  patientChat: {
    conversations: (hospitalId: string) => ['/api/patient-chat', hospitalId, 'conversations'] as const,
    unreadCount: (hospitalId: string) => ['/api/patient-chat', hospitalId, 'unread-count'] as const,
  },
  staffPool: {
    day: (hospitalId: string, dateString: string) => [`/api/staff-pool/${hospitalId}`, dateString] as const,
    range: (hospitalId: string, start: string, end: string) => [`/api/staff-pool/${hospitalId}/range`, start, end] as const,
  },
  billing: {
    status: (hospitalId: string) => [`/api/billing/${hospitalId}/status`] as const,
  },
  controlled: {
    log: (hospitalId: string, unitId?: string) => [`/api/controlled/log/${hospitalId}`, unitId] as const,
    checks: (hospitalId: string) => [`/api/controlled/checks/${hospitalId}`] as const,
  },
  checklists: {
    pending: (hospitalId: string, unitId?: string) => {
      const params = unitId ? `?unitId=${unitId}` : '';
      return [`/api/checklists/pending/${hospitalId}${params}`, unitId] as const;
    },
    history: (hospitalId: string, unitId?: string) => {
      const params = unitId ? `?unitId=${unitId}` : '';
      return [`/api/checklists/history/${hospitalId}${params}`, unitId] as const;
    },
  },
  dischargeBriefs: {
    detail: (briefId: string) => [`/api/discharge-briefs/${briefId}`] as const,
    templates: (hospitalId: string) => [`/api/discharge-brief-templates/${hospitalId}`] as const,
  },
  episodes: {
    documents: (episodeId: string) => [`/api/episodes/${episodeId}/documents`] as const,
    folders: (episodeId: string) => [`/api/episodes/${episodeId}/folders`] as const,
    surgeries: (episodeId: string) => [`/api/episodes/${episodeId}/surgeries`] as const,
    notes: (episodeId: string) => [`/api/episodes/${episodeId}/notes`] as const,
  },
  surgeonChecklists: {
    templates: (hospitalId: string) => [`/api/surgeon-checklists/templates`, hospitalId] as const,
    matrix: (templateId: string, hospitalId: string) => [`/api/surgeon-checklists/matrix`, templateId, hospitalId] as const,
  },
} as const;
