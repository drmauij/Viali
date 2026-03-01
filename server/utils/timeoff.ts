import { addDays, addWeeks, addMonths, format, parseISO, isBefore, isAfter, getDay } from "date-fns";
import type { ProviderTimeOff } from "@shared/schema";

export interface ExpandedTimeOff extends ProviderTimeOff {
  isExpanded?: boolean;
  originalRuleId?: string;
  expandedDate?: string;
}

// Generate occurrences within the query range for a recurring rule
// For finite rules: generates all from start to honor maxCount
// For infinite rules: jumps to query range start and iterates until queryEnd
export function generateOccurrencesInRange(
  ruleStartDate: Date,
  pattern: string,
  daysOfWeek: number[],
  recurrenceEndDate: Date | null,
  maxCount: number | null,
  queryStart: Date,
  queryEnd: Date
): Date[] {
  const results: Date[] = [];

  // For finite rules, we need to count from the beginning
  if (maxCount !== null) {
    return generateFiniteOccurrences(ruleStartDate, pattern, daysOfWeek, recurrenceEndDate, maxCount, queryStart, queryEnd);
  }

  // For infinite rules, we jump to near the query start and iterate until we pass queryEnd
  if (pattern === 'weekly' || pattern === 'biweekly') {
    const weekInterval = pattern === 'biweekly' ? 2 : 1;

    if (daysOfWeek.length > 0) {
      // Calculate weeks from start to queryStart
      const msPerWeek = 7 * 24 * 60 * 60 * 1000;
      const weeksSinceStart = Math.floor((queryStart.getTime() - ruleStartDate.getTime()) / msPerWeek);
      const alignedWeeks = Math.floor(weeksSinceStart / weekInterval) * weekInterval;
      const startWeekOffset = Math.max(0, alignedWeeks - weekInterval);

      const startDow = getDay(ruleStartDate);
      const initialWeekStart = addDays(ruleStartDate, -startDow);
      let weekStart = addWeeks(initialWeekStart, startWeekOffset);

      // Iterate until we pass queryEnd or recurrenceEndDate
      while (true) {
        if (recurrenceEndDate && isAfter(weekStart, recurrenceEndDate)) break;
        if (isAfter(weekStart, queryEnd)) break;

        for (const dow of daysOfWeek.sort((a, b) => a - b)) {
          const occDate = addDays(weekStart, dow);
          if (isBefore(occDate, ruleStartDate)) continue;
          if (recurrenceEndDate && isAfter(occDate, recurrenceEndDate)) continue;
          if (!isBefore(occDate, queryStart) && !isAfter(occDate, queryEnd)) {
            results.push(occDate);
          }
        }

        weekStart = addWeeks(weekStart, weekInterval);
      }
    } else {
      // Same day each week - calculate first occurrence >= queryStart
      const msPerWeek = 7 * 24 * 60 * 60 * 1000 * weekInterval;
      const weeksSinceStart = Math.floor((queryStart.getTime() - ruleStartDate.getTime()) / msPerWeek);
      const startOffset = Math.max(0, weeksSinceStart - 1);

      let currentDate = addWeeks(ruleStartDate, startOffset * weekInterval);

      while (true) {
        if (recurrenceEndDate && isAfter(currentDate, recurrenceEndDate)) break;
        if (isAfter(currentDate, queryEnd)) break;

        if (!isBefore(currentDate, queryStart)) {
          results.push(currentDate);
        }

        currentDate = addWeeks(currentDate, weekInterval);
      }
    }
  } else if (pattern === 'monthly') {
    // Calculate months from start to queryStart
    const monthsSinceStart = (queryStart.getFullYear() - ruleStartDate.getFullYear()) * 12 +
                             (queryStart.getMonth() - ruleStartDate.getMonth());
    const startOffset = Math.max(0, monthsSinceStart - 1);

    let currentDate = addMonths(ruleStartDate, startOffset);

    while (true) {
      if (recurrenceEndDate && isAfter(currentDate, recurrenceEndDate)) break;
      if (isAfter(currentDate, queryEnd)) break;

      if (!isBefore(currentDate, queryStart)) {
        results.push(currentDate);
      }

      currentDate = addMonths(currentDate, 1);
    }
  } else {
    // Daily - calculate days from start to queryStart
    const msDiff = queryStart.getTime() - ruleStartDate.getTime();
    const daysSinceStart = Math.floor(msDiff / (24 * 60 * 60 * 1000));
    const startOffset = Math.max(0, daysSinceStart - 7);

    let currentDate = addDays(ruleStartDate, startOffset);

    while (true) {
      if (recurrenceEndDate && isAfter(currentDate, recurrenceEndDate)) break;
      if (isAfter(currentDate, queryEnd)) break;

      const dayOfWeek = getDay(currentDate);
      if (daysOfWeek.length === 0 || daysOfWeek.includes(dayOfWeek)) {
        if (!isBefore(currentDate, queryStart)) {
          results.push(currentDate);
        }
      }

      currentDate = addDays(currentDate, 1);
    }
  }

  // Filter to query range
  return results;
}

// For finite rules, we must count from the beginning to honor maxCount
function generateFiniteOccurrences(
  ruleStartDate: Date,
  pattern: string,
  daysOfWeek: number[],
  recurrenceEndDate: Date | null,
  maxCount: number,
  queryStart: Date,
  queryEnd: Date
): Date[] {
  const allOccurrences: Date[] = [];

  if (pattern === 'weekly' || pattern === 'biweekly') {
    const weekInterval = pattern === 'biweekly' ? 2 : 1;

    if (daysOfWeek.length > 0) {
      const startDow = getDay(ruleStartDate);
      let weekStart = addDays(ruleStartDate, -startDow);

      while (allOccurrences.length < maxCount) {
        if (recurrenceEndDate && isAfter(weekStart, recurrenceEndDate)) break;

        for (const dow of daysOfWeek.sort((a, b) => a - b)) {
          if (allOccurrences.length >= maxCount) break;

          const occDate = addDays(weekStart, dow);
          if (isBefore(occDate, ruleStartDate)) continue;
          if (recurrenceEndDate && isAfter(occDate, recurrenceEndDate)) break;

          allOccurrences.push(occDate);
        }

        weekStart = addWeeks(weekStart, weekInterval);
      }
    } else {
      let currentDate = ruleStartDate;

      while (allOccurrences.length < maxCount) {
        if (recurrenceEndDate && isAfter(currentDate, recurrenceEndDate)) break;
        allOccurrences.push(currentDate);
        currentDate = addWeeks(currentDate, weekInterval);
      }
    }
  } else if (pattern === 'monthly') {
    let currentDate = ruleStartDate;

    while (allOccurrences.length < maxCount) {
      if (recurrenceEndDate && isAfter(currentDate, recurrenceEndDate)) break;
      allOccurrences.push(currentDate);
      currentDate = addMonths(currentDate, 1);
    }
  } else {
    // Daily
    let currentDate = ruleStartDate;

    while (allOccurrences.length < maxCount) {
      if (recurrenceEndDate && isAfter(currentDate, recurrenceEndDate)) break;

      const dayOfWeek = getDay(currentDate);
      if (daysOfWeek.length === 0 || daysOfWeek.includes(dayOfWeek)) {
        allOccurrences.push(currentDate);
      }

      currentDate = addDays(currentDate, 1);
    }
  }

  // Filter to query range
  return allOccurrences.filter(d => !isBefore(d, queryStart) && !isAfter(d, queryEnd));
}

export function expandRecurringTimeOff(
  timeOffs: ProviderTimeOff[],
  rangeStart: string,
  rangeEnd: string
): ExpandedTimeOff[] {
  const results: ExpandedTimeOff[] = [];
  const queryStart = parseISO(rangeStart);
  const queryEnd = parseISO(rangeEnd);

  for (const timeOff of timeOffs) {
    if (!timeOff.isRecurring) {
      results.push(timeOff);
      continue;
    }

    const pattern = timeOff.recurrencePattern || 'weekly';
    const daysOfWeek = timeOff.recurrenceDaysOfWeek || [];
    const recurrenceEndDate = timeOff.recurrenceEndDate ? parseISO(timeOff.recurrenceEndDate) : null;
    const maxCount = timeOff.recurrenceCount || null;
    const ruleStartDate = parseISO(timeOff.startDate);

    // Generate occurrences within the query range
    const occurrences = generateOccurrencesInRange(
      ruleStartDate,
      pattern,
      daysOfWeek,
      recurrenceEndDate,
      maxCount,
      queryStart,
      queryEnd
    );

    // Convert to ExpandedTimeOff objects
    for (const occDate of occurrences) {
      const expandedDate = format(occDate, 'yyyy-MM-dd');
      results.push({
        ...timeOff,
        startDate: expandedDate,
        endDate: expandedDate,
        isExpanded: true,
        originalRuleId: timeOff.id,
        expandedDate,
      });
    }
  }

  return results;
}
