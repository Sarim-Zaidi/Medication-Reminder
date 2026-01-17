/**
 * Notifications module
 * Re-exports from the centralized notifications service
 * This file is kept for backwards compatibility with existing imports
 */

import { configureNotificationHandler, initNotifeeAlarmChannel } from '@/features/notifications/services/notificationsService';
import { Platform } from 'react-native';

import './notifeeBackgroundEvents';

// Configure notification handler on module load
configureNotificationHandler();

// Initialize Notifee channel on Android
if (Platform.OS === 'android') {
  initNotifeeAlarmChannel();
}

// Re-export everything from the service
export * from '@/features/notifications/services/notificationsService';
export type { MedicationNotificationData } from '@/types';


