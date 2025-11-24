/**
 * Infusion Track Assignment Utility
 * 
 * Assigns vertical tracks to overlapping infusions so they can be displayed
 * at different heights within the same swimlane.
 */

export type InfusionWithTrack = {
  startTime: number;
  endTime: number | null;
  track: number;
  [key: string]: any;
};

/**
 * Check if two time ranges overlap
 */
function timeRangesOverlap(
  start1: number,
  end1: number | null,
  start2: number,
  end2: number | null,
  maxTime: number
): boolean {
  // Treat null endTime as ongoing (extends to maxTime)
  const effectiveEnd1 = end1 ?? maxTime;
  const effectiveEnd2 = end2 ?? maxTime;
  
  // Two ranges overlap if one starts before the other ends
  return start1 < effectiveEnd2 && start2 < effectiveEnd1;
}

/**
 * Assign tracks to infusions using a greedy algorithm
 * Returns infusions with track numbers assigned (0 = bottom track, 1 = next up, etc.)
 */
export function assignInfusionTracks<T extends { startTime: number; endTime: number | null }>(
  infusions: T[],
  maxTime: number
): (T & { track: number })[] {
  if (infusions.length === 0) return [];
  
  // Sort infusions by start time
  const sorted = [...infusions].sort((a, b) => a.startTime - b.startTime);
  
  // Track assignment: array of { endTime, trackNumber }
  const tracks: { endTime: number; trackNumber: number }[] = [];
  
  const result: (T & { track: number })[] = [];
  
  for (const infusion of sorted) {
    const effectiveEndTime = infusion.endTime ?? maxTime;
    
    // Find the first available track (earliest ending track that doesn't overlap)
    let assignedTrack = -1;
    let earliestEndingTrack = -1;
    let earliestEndTime = Infinity;
    
    for (let i = 0; i < tracks.length; i++) {
      // Check if this track is free (its last infusion ended before this one starts)
      if (tracks[i].endTime <= infusion.startTime) {
        assignedTrack = tracks[i].trackNumber;
        tracks[i].endTime = effectiveEndTime; // Update track's end time
        break;
      }
      
      // Track the earliest ending track in case we need a new one
      if (tracks[i].endTime < earliestEndTime) {
        earliestEndTime = tracks[i].endTime;
        earliestEndingTrack = i;
      }
    }
    
    // If no available track found, create a new one
    if (assignedTrack === -1) {
      assignedTrack = tracks.length;
      tracks.push({
        endTime: effectiveEndTime,
        trackNumber: assignedTrack,
      });
    }
    
    result.push({
      ...infusion,
      track: assignedTrack,
    });
  }
  
  return result;
}

/**
 * Calculate the maximum number of tracks needed for a set of infusions
 */
export function calculateMaxTracks<T extends { startTime: number; endTime: number | null }>(
  infusions: T[],
  maxTime: number
): number {
  if (infusions.length === 0) return 0;
  
  const withTracks = assignInfusionTracks(infusions, maxTime);
  const maxTrack = Math.max(...withTracks.map(inf => inf.track));
  
  return maxTrack + 1; // Convert from 0-indexed to count
}
