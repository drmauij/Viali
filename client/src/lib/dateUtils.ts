import { format as dateFnsFormat } from "date-fns";
import { enGB, enUS, de, fr, es, it, Locale } from "date-fns/locale";

export interface DateFormatConfig {
  locale: string;
  dateFormat: string;
  dateTimeFormat: string;
  timeFormat: string;
}

const DEFAULT_CONFIG: DateFormatConfig = {
  locale: "en-GB",
  dateFormat: "dd/MM/yyyy",
  dateTimeFormat: "dd/MM/yyyy HH:mm",
  timeFormat: "HH:mm",
};

let currentConfig: DateFormatConfig = DEFAULT_CONFIG;

const localeMap: Record<string, Locale> = {
  "en-GB": enGB,
  "en-US": enUS,
  "de": de,
  "de-DE": de,
  "fr": fr,
  "fr-FR": fr,
  "es": es,
  "es-ES": es,
  "it": it,
  "it-IT": it,
};

const getDateFnsLocale = (): Locale => {
  return localeMap[currentConfig.locale] || enGB;
};

export const setDateFormatConfig = (config: Partial<DateFormatConfig>) => {
  currentConfig = { ...currentConfig, ...config };
};

export const getDateFormatConfig = (): DateFormatConfig => {
  return currentConfig;
};

export const formatDate = (date: string | Date | null | undefined): string => {
  if (!date) return "N/A";
  
  try {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return dateFnsFormat(dateObj, currentConfig.dateFormat, { locale: getDateFnsLocale() });
  } catch (error) {
    console.error("Error formatting date:", error);
    return "Invalid date";
  }
};

export const formatDateTime = (date: string | Date | null | undefined): string => {
  if (!date) return "N/A";
  
  try {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return dateFnsFormat(dateObj, currentConfig.dateTimeFormat, { locale: getDateFnsLocale() });
  } catch (error) {
    console.error("Error formatting datetime:", error);
    return "Invalid date";
  }
};

export const formatTime = (date: string | Date | null | undefined): string => {
  if (!date) return "N/A";
  
  try {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return dateFnsFormat(dateObj, currentConfig.timeFormat, { locale: getDateFnsLocale() });
  } catch (error) {
    console.error("Error formatting time:", error);
    return "Invalid time";
  }
};

export const formatDateLong = (date: string | Date | null | undefined): string => {
  if (!date) return "N/A";
  
  try {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return dateFnsFormat(dateObj, "PPP", { locale: getDateFnsLocale() });
  } catch (error) {
    console.error("Error formatting date long:", error);
    return "Invalid date";
  }
};

export const formatDateTimeLong = (date: string | Date | null | undefined): string => {
  if (!date) return "N/A";
  
  try {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return dateFnsFormat(dateObj, "PPp", { locale: getDateFnsLocale() });
  } catch (error) {
    console.error("Error formatting datetime long:", error);
    return "Invalid date";
  }
};

export const formatDateForInput = (date: string | Date | null | undefined): string => {
  if (!date) return "";
  
  try {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return dateObj.toISOString().split("T")[0];
  } catch (error) {
    console.error("Error formatting date for input:", error);
    return "";
  }
};

export const formatDateTimeForInput = (date: string | Date | null | undefined): string => {
  if (!date) return "";
  
  try {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return dateObj.toISOString().slice(0, 16);
  } catch (error) {
    console.error("Error formatting datetime for input:", error);
    return "";
  }
};

export const formatDateHeader = (date: Date): string => {
  try {
    return dateFnsFormat(date, "EEEE, d MMMM yyyy", { locale: getDateFnsLocale() });
  } catch (error) {
    console.error("Error formatting date header:", error);
    return "Invalid date";
  }
};

export const formatMonthYear = (date: Date): string => {
  try {
    return dateFnsFormat(date, "MMMM yyyy", { locale: getDateFnsLocale() });
  } catch (error) {
    console.error("Error formatting month year:", error);
    return "Invalid date";
  }
};

export const formatShortDate = (date: string | Date | null | undefined): string => {
  if (!date) return "N/A";
  
  try {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return dateFnsFormat(dateObj, "PP", { locale: getDateFnsLocale() });
  } catch (error) {
    console.error("Error formatting short date:", error);
    return "Invalid date";
  }
};
