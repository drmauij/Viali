import { format as dateFnsFormat } from "date-fns";
import { enGB, Locale } from "date-fns/locale";

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

const getDateFnsLocale = (): Locale => {
  return enGB;
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
    return dateObj.toLocaleDateString(currentConfig.locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch (error) {
    console.error("Error formatting date:", error);
    return "Invalid date";
  }
};

export const formatDateTime = (date: string | Date | null | undefined): string => {
  if (!date) return "N/A";
  
  try {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return dateObj.toLocaleString(currentConfig.locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (error) {
    console.error("Error formatting datetime:", error);
    return "Invalid date";
  }
};

export const formatTime = (date: string | Date | null | undefined): string => {
  if (!date) return "N/A";
  
  try {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return dateObj.toLocaleTimeString(currentConfig.locale, {
      hour: "2-digit",
      minute: "2-digit",
    });
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
