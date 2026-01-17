/**
 * Structured logging utility
 * In production, these can be sent to a logging service
 * In development, they're printed to console
 */

const isDev = __DEV__;

export const logger = {
  debug: (message: string, data?: unknown) => {
    if (isDev) {
      console.log(`[DEBUG] ${message}`, data !== undefined ? data : '');
    }
  },

  info: (message: string, data?: unknown) => {
    if (isDev) {
      console.log(`[INFO] ${message}`, data !== undefined ? data : '');
    }
    // In production, send to logging service
  },

  warn: (message: string, data?: unknown) => {
    if (isDev) {
      console.warn(`[WARN] ${message}`, data !== undefined ? data : '');
    }
    // In production, send to logging service
  },

  error: (message: string, error?: unknown) => {
    if (isDev) {
      console.error(`[ERROR] ${message}`, error !== undefined ? error : '');
    }
    // In production, send to error tracking service (e.g., Sentry)
  },
};
