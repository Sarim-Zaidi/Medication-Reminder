/**
 * Alarm actions hook
 * Handles taken/snooze navigation and cleanup
 * Resets global alarm lock when dismissing
 */

import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useMedication } from '@/contexts/MedicationContext';
import { useAlarm } from '@/contexts/AlarmContext';
import { logger } from '@/lib/logger';
import { ROUTES } from '@/constants/config';
import { cancelAllNotifeeNotifications } from '@/features/notifications/services/notificationsService';

interface AlarmActionsParams {
  medicationId: string;
  stopSound: () => Promise<void>;
  stopSpeech: () => Promise<void>;
}

export function useAlarmActions({ medicationId, stopSound, stopSpeech }: AlarmActionsParams) {
  const router = useRouter();
  const { updateMedicationStatus } = useMedication();
  const { deactivateAlarm } = useAlarm();

  const handleTaken = async () => {
    try {
      // CRITICAL: Stop sound and speech IMMEDIATELY before anything else
      logger.debug('User clicked I Took It - stopping alarm...');
      await stopSound();
      await stopSpeech();
      logger.debug('Sound and speech stopped');
      
      // CRITICAL: Reset global alarm lock
      deactivateAlarm();
      logger.debug('Alarm lock released');
      
      // Small delay to ensure audio fully stops before navigation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // CRITICAL: Dismiss all notifications before navigating away
      await Notifications.dismissAllNotificationsAsync();
      await cancelAllNotifeeNotifications();
      logger.debug('Notifications dismissed');
      
      if (medicationId) {
        await updateMedicationStatus(medicationId, true);
        logger.debug('Medication marked as taken');
      }
      
      router.replace(ROUTES.TABS);
    } catch (error) {
      logger.error('Error marking medication as taken', error);
      // Still stop sound, release lock, and dismiss notifications even if update fails
      await stopSound().catch(() => {});
      await stopSpeech().catch(() => {});
      deactivateAlarm();
      await Notifications.dismissAllNotificationsAsync().catch(() => {});
      await cancelAllNotifeeNotifications().catch(() => {});
      router.replace(ROUTES.TABS);
    }
  };

  const handleSnooze = async () => {
    try {
      // CRITICAL: Stop sound and speech IMMEDIATELY before anything else
      logger.debug('User clicked Snooze - stopping alarm...');
      await stopSound();
      await stopSpeech();
      logger.debug('Sound and speech stopped');
      
      // CRITICAL: Reset global alarm lock
      deactivateAlarm();
      logger.debug('Alarm lock released');
      
      // Small delay to ensure audio fully stops before navigation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // CRITICAL: Dismiss all notifications before navigating away
      await Notifications.dismissAllNotificationsAsync();
      await cancelAllNotifeeNotifications();
      logger.debug('Notifications dismissed on snooze');
    } catch (error) {
      logger.error('Error stopping alarm on snooze', error);
      // Still stop sound, release lock, and dismiss notifications even if cleanup fails
      await stopSound().catch(() => {});
      await stopSpeech().catch(() => {});
      deactivateAlarm();
      await Notifications.dismissAllNotificationsAsync().catch(() => {});
      await cancelAllNotifeeNotifications().catch(() => {});
    }
    
    router.replace(ROUTES.TABS);
  };

  return { handleTaken, handleSnooze };
}
