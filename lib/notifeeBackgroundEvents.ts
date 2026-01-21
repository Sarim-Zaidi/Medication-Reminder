import notifee, { EventType } from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_MEDICATION_ACTION_KEY = 'pending_medication_action';

const globalFlags = globalThis as unknown as {
  __notifeeBackgroundHandlerRegistered?: boolean;
};

/**
 * Notifee background event handler.
 * 
 * NOTE: All alarm/call logic has been moved to the server-side (schedule-batches cron job).
 * This handler now only processes button presses (take/snooze) from notifications.
 */
if (!globalFlags.__notifeeBackgroundHandlerRegistered) {
  globalFlags.__notifeeBackgroundHandlerRegistered = true;

  notifee.onBackgroundEvent(async ({ type, detail }) => {
    const { notification, pressAction } = detail;
    const data = notification?.data as
      | { medicationId?: string; name?: string; dosage?: string }
      | undefined;

    // Button presses (take/snooze) - store for processing when app becomes active
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

    // Notification tap - just dismiss the notification (no alarm screen navigation)
    if (type === EventType.PRESS && notification?.id) {
      await notifee.cancelNotification(notification.id);
    }
  });
}
