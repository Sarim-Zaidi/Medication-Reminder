/**
 * Types for notification system
 */

export interface MedicationNotificationData {
  medicationId: string;
  name: string;
  dosage: string;
}

export type NotificationSource = 'background_tap' | 'cold_start' | 'foreground_auto';

export interface PendingNavigation {
  data: MedicationNotificationData;
  source: NotificationSource;
}
