/**
 * Notification-related constants
 * Extracted from lib/notifications.ts to centralize configuration
 */

export const NOTIFICATION_CHANNEL_ID = 'medication-channel-FINAL-V4';
export const NOTIFICATION_CHANNEL_NAME = 'Medication Alarms';
export const NOTIFICATION_SOUND_NAME = 'custom_alert'; // Without extension

export const VIBRATION_PATTERN = [300, 500, 200, 500] as const;

export const NOTIFICATION_LIGHT_COLOR = '#DC2626';

// Custom alarm sound for full-screen alarm (loops continuously until dismissed)
export const ALARM_RINGTONE_PATH = require('../assets/custom_alert.wav');
