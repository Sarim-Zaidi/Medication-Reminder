/**
 * Application configuration constants
 */

export const MAX_FREQUENCY_PER_DAY = 5;
export const MIN_FREQUENCY_PER_DAY = 1;

export const MAX_MEDICATIONS_PER_USER = 50;

/**
 * Route paths (for use in navigation)
 * Keep these centralized but do NOT break Expo Router typed routes
 */
export const ROUTES = {
  TABS: '/(tabs)',
  ALARM: '/alarm',
  ADD_MEDICATION: '/add-medication',
  AUTH: '/auth',
} as const;
