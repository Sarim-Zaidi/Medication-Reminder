import { useCallback, useEffect } from 'react';
import notifee, {
  AndroidCategory,
  AndroidImportance,
  AndroidVisibility,
  TimestampTrigger,
  TriggerType,
} from '@notifee/react-native';
import { logger } from '@/lib/logger';
import type { MedicationNotificationData } from '@/types';

const ALARM_CHANNEL_ID = 'medication-alarm';
const ALARM_SOUND = 'alarm_sound';

export function useAlarmNotifee() {
  const createAlarmChannel = useCallback(async () => {
    try {
      await notifee.createChannel({
        id: ALARM_CHANNEL_ID,
        name: 'Medication Alarms',
        importance: AndroidImportance.HIGH,
        sound: ALARM_SOUND,
        vibration: true,
        vibrationPattern: [0, 500, 200, 500],
        lights: true,
        lightColor: '#DC2626',
        bypassDnd: true,
      });
      logger.debug('Notifee alarm channel created');
    } catch (error) {
      logger.error('Failed to create alarm channel', error);
    }
  }, []);

  // Create channel on mount
  useEffect(() => {
    createAlarmChannel();
  }, [createAlarmChannel]);

  const displayAlarm = useCallback(async (data: MedicationNotificationData) => {
    try {
      const notificationId = await notifee.displayNotification({
        title: '💊 Medication Reminder',
        body: `Time to take ${data.name} - ${data.dosage}`,
        data: { ...data } as Record<string, string>,
        android: {
          channelId: ALARM_CHANNEL_ID,
          category: AndroidCategory.ALARM,
          importance: AndroidImportance.HIGH,
          visibility: AndroidVisibility.PUBLIC,
          pressAction: {
            id: 'default',
            launchActivity: 'default',
          },
          fullScreenAction: {
            id: 'default',
            launchActivity: 'default',
          },
          ongoing: true,
          loopSound: true,
          autoCancel: false,
          asForegroundService: false,
          sound: ALARM_SOUND,
          actions: [
            {
              title: 'Take Now',
              pressAction: { id: 'take' },
            },
            {
              title: 'Snooze',
              pressAction: { id: 'snooze' },
            },
          ],
        },
      });

      logger.debug('Alarm notification displayed', { notificationId, data });
      return notificationId;
    } catch (error) {
      logger.error('Failed to display alarm notification', error);
      throw error;
    }
  }, []);

  const scheduleAlarm = useCallback(
    async (data: MedicationNotificationData, timestamp: number): Promise<string> => {
      try {
        const trigger: TimestampTrigger = {
          type: TriggerType.TIMESTAMP,
          timestamp,
          alarmManager: {
            allowWhileIdle: true,
          },
        };

        const notificationId = await notifee.createTriggerNotification(
          {
            title: '💊 Medication Reminder',
            body: `Time to take ${data.name} - ${data.dosage}`,
            data: { ...data } as Record<string, string>,
            android: {
              channelId: ALARM_CHANNEL_ID,
              category: AndroidCategory.ALARM,
              importance: AndroidImportance.HIGH,
              visibility: AndroidVisibility.PUBLIC,
              pressAction: {
                id: 'default',
                launchActivity: 'default',
              },
              fullScreenAction: {
                id: 'default',
                launchActivity: 'default',
              },
              ongoing: true,
              loopSound: true,
              autoCancel: false,
              asForegroundService: false,
              sound: ALARM_SOUND,
              actions: [
                {
                  title: 'Take Now',
                  pressAction: { id: 'take' },
                },
                {
                  title: 'Snooze',
                  pressAction: { id: 'snooze' },
                },
              ],
            },
          },
          trigger
        );

        logger.debug('Alarm scheduled', { notificationId, timestamp, data });
        return notificationId;
      } catch (error) {
        logger.error('Failed to schedule alarm', error);
        throw error;
      }
    },
    []
  );

  const scheduleDailyAlarm = useCallback(
    async (
      data: MedicationNotificationData,
      hour: number,
      minute: number
    ): Promise<string> => {
      const now = new Date();
      const scheduledTime = new Date();
      scheduledTime.setHours(hour, minute, 0, 0);

      // If time has passed today, schedule for tomorrow
      if (scheduledTime.getTime() <= now.getTime()) {
        scheduledTime.setDate(scheduledTime.getDate() + 1);
      }

      return scheduleAlarm(data, scheduledTime.getTime());
    },
    [scheduleAlarm]
  );

  const cancelAlarm = useCallback(async (notificationId: string) => {
    try {
      await notifee.cancelNotification(notificationId);
      logger.debug('Alarm cancelled', { notificationId });
    } catch (error) {
      logger.error('Failed to cancel alarm', error);
    }
  }, []);

  const cancelAllAlarms = useCallback(async () => {
    try {
      await notifee.cancelAllNotifications();
      logger.debug('All alarms cancelled');
    } catch (error) {
      logger.error('Failed to cancel all alarms', error);
    }
  }, []);

  const getScheduledAlarms = useCallback(async () => {
    try {
      return await notifee.getTriggerNotifications();
    } catch (error) {
      logger.error('Failed to get scheduled alarms', error);
      return [];
    }
  }, []);

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    try {
      const settings = await notifee.requestPermission();
      const granted = settings.authorizationStatus >= 1;
      logger.debug('Notification permissions', { granted, settings });
      return granted;
    } catch (error) {
      logger.error('Failed to request permissions', error);
      return false;
    }
  }, []);

  return {
    createAlarmChannel,
    displayAlarm,
    scheduleAlarm,
    scheduleDailyAlarm,
    cancelAlarm,
    cancelAllAlarms,
    getScheduledAlarms,
    requestPermissions,
  };
}

export { ALARM_CHANNEL_ID };
