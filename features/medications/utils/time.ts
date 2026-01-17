/**
 * Time-related utilities for medications
 * Pure functions extracted from components
 */

import { RESET_HOUR, TIME_PERIODS } from '@/constants/time';
import type { Greeting, TimePeriod } from '@/types';

/**
 * Get greeting based on current time of day
 */
export function getGreeting(): Greeting {
  const hour = new Date().getHours();
  
  if (hour >= TIME_PERIODS.MORNING_START && hour < TIME_PERIODS.MORNING_END) {
    return { text: 'Good Morning', emoji: '🌅' };
  } else if (hour >= TIME_PERIODS.AFTERNOON_START && hour < TIME_PERIODS.AFTERNOON_END) {
    return { text: 'Good Afternoon', emoji: '☀️' };
  } else if (hour >= TIME_PERIODS.EVENING_START && hour < TIME_PERIODS.EVENING_END) {
    return { text: 'Good Evening', emoji: '🌇' };
  } else {
    return { text: 'Good Night', emoji: '🌙' };
  }
}

/**
 * Get time period from HH:mm string
 */
export function getTimePeriod(timeString: string): TimePeriod {
  const hour = parseInt(timeString.split(':')[0], 10);
  
  if (hour >= TIME_PERIODS.MORNING_START && hour < TIME_PERIODS.MORNING_END) {
    return 'Morning';
  } else if (hour >= TIME_PERIODS.AFTERNOON_START && hour < TIME_PERIODS.AFTERNOON_END) {
    return 'Afternoon';
  } else {
    return 'Evening';
  }
}

/**
 * Get current time period
 */
export function getCurrentTimePeriod(): TimePeriod {
  const hour = new Date().getHours();
  
  if (hour >= TIME_PERIODS.MORNING_START && hour < TIME_PERIODS.MORNING_END) {
    return 'Morning';
  } else if (hour >= TIME_PERIODS.AFTERNOON_START && hour < TIME_PERIODS.AFTERNOON_END) {
    return 'Afternoon';
  } else {
    return 'Evening';
  }
}

/**
 * Convert 24-hour time to 12-hour AM/PM format
 */
export function formatTo12Hour(time: string): string {
  const [hourStr, minuteStr] = time.split(':');
  const hour = parseInt(hourStr, 10);
  const minute = minuteStr;
  
  if (hour === 0) {
    return `12:${minute} AM`;
  } else if (hour < 12) {
    return `${hour.toString().padStart(2, '0')}:${minute} AM`;
  } else if (hour === 12) {
    return `12:${minute} PM`;
  } else {
    return `${(hour - 12).toString().padStart(2, '0')}:${minute} PM`;
  }
}

/**
 * Check if medication is missed based on time and reset hour logic
 * 
 * Reset time is 3 AM - new day starts at midnight (00:00)
 * 
 * Rules:
 * - If current time is before reset (00:00-02:59):
 *   - Meds scheduled before reset (00:00-02:59): Check if time has passed (today's early morning meds)
 *   - Meds scheduled after reset (03:00-23:59): These are from YESTERDAY, show as MISSED
 * - If current time is after reset (03:00-23:59):
 *   - Normal comparison: med is missed if current time > med time (all meds are for today)
 */
export function isMedicationMissed(timeString: string, isTaken: boolean): boolean {
  if (isTaken) return false;
  
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinutes = now.getMinutes();
  
  const [hourStr, minuteStr] = timeString.split(':');
  const medHour = parseInt(hourStr, 10);
  const medMinutes = parseInt(minuteStr, 10);
  
  // If we're before reset time (early morning 00:00-02:59)
  if (currentHour < RESET_HOUR) {
    // Medication times before reset hour (00:00-02:59) are for today, check if time has passed
    if (medHour < RESET_HOUR) {
      const currentTotalMinutes = currentHour * 60 + currentMinutes;
      const medTotalMinutes = medHour * 60 + medMinutes;
      return currentTotalMinutes > medTotalMinutes;
    }
    // Medication times after reset hour (03:00-23:59) are from YESTERDAY
    // Show as MISSED until 3 AM reset time
    return true;
  }
  
  // After reset time (03:00+): All medications reset for the new day
  // Normal comparison: med is missed if current time > med time
  const currentTotalMinutes = currentHour * 60 + currentMinutes;
  const medTotalMinutes = medHour * 60 + medMinutes;
  return currentTotalMinutes > medTotalMinutes;
}

/**
 * Format date for display
 */
export function formatDateLabel(date: Date): string {
  try {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return date.toDateString();
  }
}

/**
 * Validate time format (HH:mm)
 */
export function isValidTime(value: string): boolean {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return Boolean(m);
}
