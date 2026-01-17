import notifee, { EventType } from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_ALARM_NAVIGATION_KEY = 'pending_alarm_navigation';
const PENDING_MEDICATION_ACTION_KEY = 'pending_medication_action';

const globalFlags = globalThis as unknown as {
  __notifeeBackgroundHandlerRegistered?: boolean;
};

if (!globalFlags.__notifeeBackgroundHandlerRegistered) {
  globalFlags.__notifeeBackgroundHandlerRegistered = true;

  notifee.onBackgroundEvent(async ({ type, detail }) => {
    const { notification, pressAction } = detail;
    const data = notification?.data as
      | { medicationId?: string; name?: string; dosage?: string }
      | undefined;

    // Button presses (take/snooze)
    if (type === EventType.ACTION_PRESS && pressAction) {
      if ((pressAction.id === 'take' || pressAction.id === 'snooze') && data?.medicationId) {
        await AsyncStorage.setItem(
          PENDING_MEDICATION_ACTION_KEY,
          JSON.stringify({
            action: pressAction.id,
            medicationId: data.medicationId,
            timestamp: Date.now(),
          })
        );
      }

      if (notification?.id) {
        await notifee.cancelNotification(notification.id);
      }

      return;
    }

    // Notification tap / full-screen press (request navigation once app is active)
    if (type === EventType.PRESS && data?.medicationId) {
      await AsyncStorage.setItem(
        PENDING_ALARM_NAVIGATION_KEY,
        JSON.stringify({
          medicationId: data.medicationId,
          name: data.name ?? '',
          dosage: data.dosage ?? '',
          notificationId: notification?.id ?? null,
          timestamp: Date.now(),
        })
      );
    }
  });
}
