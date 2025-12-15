import { format as dateFnsFormat } from "date-fns";
import { enGB, enUS, de, fr, es, it, Locale } from "date-fns/locale";

/**
 * Convert a string to proper case (first letter of each word capitalized)
 * Handles comma-separated names like "MAURIZIO PAOL, BETTI" => "Maurizio Paol, Betti"
 */
export const toProperCase = (str: string): string => {
  if (!str) return str;
  
  return str
    .split(/(\s+|,)/) // Split by spaces and commas, keeping delimiters
    .map(part => {
      if (part.trim() === '' || part === ',') return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join('');
};

/**
 * Parse flexible date input formats and convert to YYYY-MM-DD format
 * Supports formats like:
 * - 02.07.2027 => 2027-07-02
 * - 2727 => 27.07.2027 (ddMM format, current year assumed)
 * - 270727 => 27.07.2027 (ddMMyy format)
 * - 27072027 => 27.07.2027 (ddMMyyyy format)
 * - 130124 => 13.01.2024 (ddMMyy format)
 * - 13/1/24 => 13.01.2024
 * - 13-1-24 => 13.01.2024
 * Also returns the display format (dd.MM.yyyy) for UI
 */
export const parseFlexibleDate = (input: string): { isoDate: string; displayDate: string } | null => {
  if (!input) return null;
  
  const cleaned = input.trim();
  if (!cleaned) return null;
  
  let day: number, month: number, year: number;
  const currentYear = new Date().getFullYear();
  
  // Try parsing different formats
  // Format: dd.MM.yyyy or dd/MM/yyyy or dd-MM-yyyy
  const separatorMatch = cleaned.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (separatorMatch) {
    day = parseInt(separatorMatch[1], 10);
    month = parseInt(separatorMatch[2], 10);
    year = parseInt(separatorMatch[3], 10);
    if (year < 100) {
      year = year > 50 ? 1900 + year : 2000 + year;
    }
  }
  // Format: ddMMyyyy (8 digits)
  else if (/^\d{8}$/.test(cleaned)) {
    day = parseInt(cleaned.substring(0, 2), 10);
    month = parseInt(cleaned.substring(2, 4), 10);
    year = parseInt(cleaned.substring(4, 8), 10);
  }
  // Format: ddMMyy (6 digits)
  else if (/^\d{6}$/.test(cleaned)) {
    day = parseInt(cleaned.substring(0, 2), 10);
    month = parseInt(cleaned.substring(2, 4), 10);
    year = parseInt(cleaned.substring(4, 6), 10);
    year = year > 50 ? 1900 + year : 2000 + year;
  }
  // Format: ddMM (4 digits) - assume current year
  else if (/^\d{4}$/.test(cleaned)) {
    day = parseInt(cleaned.substring(0, 2), 10);
    month = parseInt(cleaned.substring(2, 4), 10);
    year = currentYear;
  }
  // Format: yyyy-MM-dd (ISO format from date picker)
  else if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    const parts = cleaned.split('-');
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    day = parseInt(parts[2], 10);
  }
  else {
    return null;
  }
  
  // Validate the date
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > 2100) {
    return null;
  }
  
  // Check if the date is valid
  const testDate = new Date(year, month - 1, day);
  if (testDate.getDate() !== day || testDate.getMonth() !== month - 1 || testDate.getFullYear() !== year) {
    return null;
  }
  
  const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const displayDate = `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
  
  return { isoDate, displayDate };
};

/**
 * Format ISO date (YYYY-MM-DD) to display format (dd.MM.yyyy)
 */
export const isoToDisplayDate = (isoDate: string): string => {
  if (!isoDate) return '';
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return isoDate;
  return `${match[3]}.${match[2]}.${match[1]}`;
};

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
