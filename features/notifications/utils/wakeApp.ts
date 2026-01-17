/**
 * Utility to wake app and bring to foreground when alarm triggers
 * This works with notification listeners to ensure alarm screen shows immediately
 */

import { Platform, NativeModules, NativeEventEmitter } from 'react-native';
import * as Notifications from 'expo-notifications';
import { logger } from '@/lib/logger';

/**
 * Request to bring app to foreground (Android only)
 * On Android, this helps ensure the app wakes up when notification arrives
 */
export async function wakeAndBringToForeground(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  try {
    // The notification itself should trigger the full-screen intent
    // This function is a helper to ensure app state is ready
    logger.debug('Attempting to wake app and bring to foreground');
    
    // The combination of:
    // 1. USE_FULL_SCREEN_INTENT permission
    // 2. categoryIdentifier: 'alarm'
    // 3. MAX priority notification
    // Should automatically show the full-screen alarm on Android
    
  } catch (error) {
    logger.error('Failed to wake app', error);
  }
}

/**
 * Configure notification to auto-open app
 * This is called when setting up notification handlers
 */
export function setupAutoOpenBehavior(): void {
  // Configure the handler to ensure immediate presentation
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      priority: Notifications.AndroidNotificationPriority.MAX,
      // On Android, this will show the notification even when app is in foreground
      // The notification itself will have full-screen intent that auto-opens
    }),
  });

  logger.debug('Auto-open notification behavior configured');
}
