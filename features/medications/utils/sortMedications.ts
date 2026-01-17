/**
 * Medication sorting utilities
 * Extracted from context for reusability
 */

import type { Medication } from '@/types';

/**
 * Sort medications: untaken first (by time), then taken (by time)
 * This is the canonical sorting function used throughout the app
 */
export function sortMedications(medications: Medication[]): Medication[] {
  return medications.slice().sort((a, b) => {
    // First, group by taken status (untaken first)
    if (a.isTaken !== b.isTaken) {
      return a.isTaken ? 1 : -1;
    }
    // Within each group, sort by time
    return a.time.localeCompare(b.time);
  });
}
