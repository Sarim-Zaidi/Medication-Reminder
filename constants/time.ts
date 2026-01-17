/**
 * Time-related constants
 */

/**
 * Reset hour for daily medication tracking (3 AM)
 * New day starts at midnight (00:00)
 * From 00:00-02:59: Previous day's missed medications still show as "missed"
 * After 03:00: All medications reset for the new day
 */
export const RESET_HOUR = 3;

/**
 * Interval for foreground alarm checking (10 seconds)
 */
export const CHECK_INTERVAL_MS = 10_000;

/**
 * Default medication times for frequency suggestions
 */
export const DEFAULT_MEDICATION_TIMES = ['08:00', '13:00', '18:00', '21:00', '23:00'] as const;

/**
 * Medication frequency limits (times per day)
 */
export const MIN_FREQUENCY_PER_DAY = 1;
export const MAX_FREQUENCY_PER_DAY = 5;

/**
 * Time period boundaries (hours)
 */
export const TIME_PERIODS = {
  MORNING_START: 5,
  MORNING_END: 12,
  AFTERNOON_START: 12,
  AFTERNOON_END: 17,
  EVENING_START: 17,
  EVENING_END: 21,
} as const;
