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
    // Format as local datetime for input[type="datetime-local"]
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch (error) {
    console.error("Error formatting datetime for input:", error);
    return "";
  }
};

// Convert datetime-local input string to ISO (UTC) for API
export const dateTimeLocalToISO = (localDateTimeString: string): string => {
  // Input format: "2025-11-08T14:00"
  const [datePart, timePart] = localDateTimeString.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  return date.toISOString();
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

/**
 * Calculate elapsed time from a timestamp to now and return human-readable format
 * e.g. "2h 15min", "45min", "3min", "just now"
 */
export const formatElapsedTime = (timestamp: number | Date | null | undefined): string => {
  if (!timestamp) return "";
  
  try {
    const time = typeof timestamp === "number" ? timestamp : timestamp.getTime();
    const now = Date.now();
    const diffMs = now - time;
    
    // Handle future times
    if (diffMs < 0) {
      const absDiff = Math.abs(diffMs);
      const hours = Math.floor(absDiff / (1000 * 60 * 60));
      const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
      
      if (hours > 0) {
        return `in ${hours}h ${minutes}min`;
      } else if (minutes > 0) {
        return `in ${minutes}min`;
      } else {
        return "now";
      }
    }
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}min`;
    } else if (minutes > 0) {
      return `${minutes}min`;
    } else {
      return "just now";
    }
  } catch (error) {
    console.error("Error calculating elapsed time:", error);
    return "";
  }
};
