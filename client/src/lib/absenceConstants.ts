export const ABSENCE_COLORS: Record<string, string> = {
  vacation: "bg-purple-100 dark:bg-purple-900/50",
  sick: "bg-red-100 dark:bg-red-900/50",
  training: "bg-blue-100 dark:bg-blue-900/50",
  parental: "bg-pink-100 dark:bg-pink-900/50",
  homeoffice: "bg-teal-100 dark:bg-teal-900/50",
  overtime: "bg-amber-100 dark:bg-amber-900/50",
  blocked: "bg-orange-100 dark:bg-orange-900/50",
  sabbatical: "bg-indigo-100 dark:bg-indigo-900/50",
  default: "bg-gray-100 dark:bg-gray-800/50",
};

export const ABSENCE_ICONS: Record<string, string> = {
  vacation: "\u{1F3D6}\u{FE0F}",
  sick: "\u{1F912}",
  training: "\u{1F4DA}",
  parental: "\u{1F476}",
  homeoffice: "\u{1F3E0}",
  overtime: "\u{23F1}\u{FE0F}",
  blocked: "\u{1F6AB}",
  sabbatical: "\u{2708}\u{FE0F}",
  default: "\u{1F6AB}",
};

export const ABSENCE_TYPE_LABEL_KEYS: Record<string, { key: string; fallback: string }> = {
  vacation: { key: 'appointments.absence.vacation', fallback: 'Vacation' },
  sick: { key: 'appointments.absence.sick', fallback: 'Sick Leave' },
  training: { key: 'appointments.absence.training', fallback: 'Training' },
  parental: { key: 'appointments.absence.parental', fallback: 'Parental Leave' },
  homeoffice: { key: 'appointments.absence.homeoffice', fallback: 'Home Office' },
  overtime: { key: 'appointments.absence.overtime', fallback: 'Overtime Reduction' },
  blocked: { key: 'appointments.absence.blocked', fallback: 'Blocked / Other' },
  sabbatical: { key: 'appointments.absence.sabbatical', fallback: 'Sabbatical' },
  default: { key: 'appointments.absence.default', fallback: 'Absent' },
};
