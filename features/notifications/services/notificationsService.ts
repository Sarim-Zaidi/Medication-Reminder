/**
 * Notifications service
 * Uses @notifee/react-native for full-screen alarm support
 * Falls back to expo-notifications for iOS
 */

import {
  NOTIFICATION_CHANNEL_ID,
  NOTIFICATION_CHANNEL_NAME,
  NOTIFICATION_LIGHT_COLOR,
  NOTIFICATION_SOUND_NAME,
  VIBRATION_PATTERN,
} from '@/constants/notifications';
import { logger } from '@/lib/logger';
import type { MedicationNotificationData } from '@/types';
import notifee, {
  AndroidCategory,
  AndroidImportance,
  AndroidVisibility,
  TimestampTrigger,
  TriggerType,
} from '@notifee/react-native';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// CRITICAL: Change channel ID to force Android to register fresh channel with new settings
export const NOTIFEE_CHANNEL_ID = 'medication-alerts-v3';
const NOTIFEE_SOUND = 'default'; // Use system default for reliability
const ALARM_TIMEOUT_MS = 60000; // Stop ringing after 60s to prevent battery drain

/**
 * Configure notification handler for foreground behavior
 * CRITICAL: This makes notifications intrusive and show as heads-up
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true, // Show alert in foreground
      shouldShowBanner: true, // Show as banner/heads-up
      shouldShowList: true, // Add to notification list
      shouldPlaySound: true, // CRITICAL: Play sound
      shouldSetBadge: false,
      priority: Notifications.AndroidNotificationPriority.MAX, // CRITICAL: MAX priority for heads-up
    }),
  });

  // Register alarm notification category for Android
  // This enables full-screen intent behavior
  if (Platform.OS === 'android') {
    Notifications.setNotificationCategoryAsync('alarm', [
      {
        identifier: 'open',
        buttonTitle: 'Open',
        options: {
          opensAppToForeground: true, // CRITICAL: Bring app to foreground
          isDestructive: false,
          isAuthenticationRequired: false,
        },
      },
    ]).catch((error) => {
      logger.error('Failed to register alarm category', error);
    });
  }

  logger.debug('Notification handler configured for intrusive heads-up alerts');
}

/**
 * Initialize Android notification channel
 */
async function initAndroidAlarmChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
      name: NOTIFICATION_CHANNEL_NAME,
      importance: Notifications.AndroidImportance.MAX, // CRITICAL: MAX importance for heads-up
      vibrationPattern: Array.from(VIBRATION_PATTERN), // [0, 500, 1000, 500, 1000]
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC, // Show on lock screen
      sound: NOTIFICATION_SOUND_NAME,
      lightColor: NOTIFICATION_LIGHT_COLOR,
      bypassDnd: true, // CRITICAL: Bypass Do Not Disturb mode
      enableLights: true,
      enableVibrate: true, // CRITICAL: Enable vibration
      showBadge: true,
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.ALARM, // CRITICAL: Treat as alarm
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
        flags: {
          enforceAudibility: true,
          requestHardwareAudioVideoSynchronization: false,
        },
      },
    });

    logger.debug('Android alarm channel initialized with MAX priority and heads-up configuration');
  }
}

/**
 * Request notification permissions
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    logger.warn('Notification permissions not granted', { status: finalStatus });
    return false;
  }

  await initAndroidAlarmChannel();

  return true;
}

/**
 * Schedule a test notification
 */
export async function scheduleTestNotification(
  data: MedicationNotificationData,
  delaySeconds: number = 5
): Promise<string> {
  const hasPermission = await checkNotificationPermissions();
  if (!hasPermission) {
    throw new Error('Notification permissions not granted. Cannot schedule test notification.');
  }

  await initAndroidAlarmChannel();

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: '💊 Medication Reminder',
      body: `Time to take ${data.name} - ${data.dosage}`,
      data: data as unknown as Record<string, unknown>,
      sound: NOTIFICATION_SOUND_NAME,
      priority: Notifications.AndroidNotificationPriority.MAX,
      sticky: true, // Keep notification visible until dismissed
      autoDismiss: false, // Don't auto-dismiss
      vibrate: Array.from(VIBRATION_PATTERN), // CRITICAL: Force vibration
      ...(Platform.OS === 'android' && {
        channelId: NOTIFICATION_CHANNEL_ID,
        categoryIdentifier: 'alarm', // CRITICAL: Enables full-screen intent
      }),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: delaySeconds,
    },
  });

  return identifier;
}

/**
 * Schedule a daily medication reminder
 */
export async function scheduleMedicationReminder(
  title: string,
  body: string,
  hour: number,
  minute: number,
  data: MedicationNotificationData
): Promise<string> {
  const hasPermission = await checkNotificationPermissions();
  if (!hasPermission) {
    throw new Error('Notification permissions not granted. Cannot schedule medication reminder.');
  }

  // Validate hour and minute ranges
  const hours = Math.floor(Number(hour));
  const minutes = Math.floor(Number(minute));

  if (isNaN(hours) || hours < 0 || hours > 23) {
    throw new Error(`Invalid hour: ${hour}. Hour must be between 0 and 23.`);
  }
  if (isNaN(minutes) || minutes < 0 || minutes > 59) {
    throw new Error(`Invalid minute: ${minute}. Minute must be between 0 and 59.`);
  }

  await initAndroidAlarmChannel();

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: `💊 ${title}`,
      body: body,
      data: data as unknown as Record<string, unknown>,
      sound: NOTIFICATION_SOUND_NAME,
      priority: Notifications.AndroidNotificationPriority.MAX,
      sticky: true, // Keep notification visible until dismissed
      autoDismiss: false, // Don't auto-dismiss
      vibrate: Array.from(VIBRATION_PATTERN), // CRITICAL: Force vibration
      ...(Platform.OS === 'android' && {
        channelId: NOTIFICATION_CHANNEL_ID,
        categoryIdentifier: 'alarm', // CRITICAL: Enables full-screen intent
      }),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: hours,
      minute: minutes,
    },
  });

  return identifier;
}

/**
 * Cancel a scheduled notification
 */
export async function cancelNotification(identifier: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(identifier);
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Get all scheduled notifications
 */
export async function getAllScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
  return await Notifications.getAllScheduledNotificationsAsync();
}

/**
 * Check notification permissions
 */
export async function checkNotificationPermissions(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

// ============================================================================
// NOTIFEE FUNCTIONS - Full Screen Intent Alarm Support (Android)
// ============================================================================

/**
 * Initialize Notifee alarm channel for Android
 * Creates/updates channel with HIGH importance for trigger event support
 */
export async function initNotifeeAlarmChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    // CRITICAL: Force create new high-priority channel
    console.log('🔔 ========================================');
    console.log('🔔 Creating HIGH-PRIORITY channel:', NOTIFEE_CHANNEL_ID);
    console.log('🔔 ========================================');

    await notifee.createChannel({
      id: NOTIFEE_CHANNEL_ID,
      name: 'Medication Alerts',
      importance: AndroidImportance.HIGH, // CRITICAL: HIGH for trigger events
      sound: 'default', // CRITICAL: Use system default sound
      vibration: true, // CRITICAL: Enable vibration
      vibrationPattern: [300, 500, 200, 500],
      lights: true,
      lightColor: NOTIFICATION_LIGHT_COLOR,
      bypassDnd: true, // Bypass Do Not Disturb
      visibility: AndroidVisibility.PUBLIC,
    });

    console.log('✅ Channel created successfully with HIGH importance');
    logger.debug('Notifee alarm channel initialized/updated');
  } catch (error) {
    logger.error('Failed to create Notifee channel', error);
  }
}

/**
 * Request Notifee permissions
 */
export async function requestNotifeePermissions(): Promise<boolean> {
  try {
    const settings = await notifee.requestPermission();
    const granted = settings.authorizationStatus >= 1;
    if (granted) {
      await initNotifeeAlarmChannel();
    }
    return granted;
  } catch (error) {
    logger.error('Failed to request Notifee permissions', error);
    return false;
  }
}

/**
 * Display an immediate full-screen alarm notification (Android)
 * This will wake the device and show the app UI
 * 
 * CRITICAL FIXES for Android throttling:
 * 1. Cancel ALL previous notifications first
 * 2. Use unique notification ID (timestamp-based)
 * 3. Recreate channel to ensure proper importance
 * 4. Set ongoing=true, autoCancel=false, category=ALARM
 */
export async function displayAlarmNotification(
  data: MedicationNotificationData
): Promise<string> {
  if (Platform.OS !== 'android') {
    // Fall back to expo-notifications on iOS
    return scheduleTestNotification(data, 1);
  }

  // 1. CRITICAL: Kill ALL previous notifications to clear any stuck state
  await notifee.cancelAllNotifications();
  logger.debug('All previous notifications cleared before new alarm');

  // 2. Recreate channel fresh to ensure HIGH importance is applied
  await initNotifeeAlarmChannel();

  // 3. Generate unique notification ID to prevent Android coalescing
  const notificationId = String(Date.now());

  // DEBUG: Aggressive logging for troubleshooting
  console.log('🚨 ========================================');
  console.log('🚨 DISPLAYING ALARM NOTIFICATION');
  console.log('🚨 Channel:', NOTIFEE_CHANNEL_ID);
  console.log('🚨 Notification ID:', notificationId);
  console.log('🚨 Medication:', data.name, '-', data.dosage);
  console.log('🚨 Sound:', NOTIFEE_SOUND);
  console.log('🚨 ========================================');

  // 4. Display with all critical flags
  try {
    await notifee.displayNotification({
      id: notificationId,
      title: '💊 MEDICATION TIME!',
      body: `Time to take ${data.name} - ${data.dosage}`,
      data: { ...data } as Record<string, string>,
      android: {
        channelId: NOTIFEE_CHANNEL_ID,
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
        sound: 'default',
        timeoutAfter: ALARM_TIMEOUT_MS,
        actions: [
          { title: 'Take Now', pressAction: { id: 'take' } },
          { title: 'Snooze', pressAction: { id: 'snooze' } },
        ],
      },
    });

    console.log('✅ Notification Request Sent Successfully');
    logger.debug('Notifee alarm displayed with unique ID', { notificationId, data });
    return notificationId;
  } catch (error) {
    console.error('❌ FAILED TO DISPLAY NOTIFICATION:', error);
    logger.error('Failed to display alarm notification', error);
    throw error;
  }
}

/**
 * Schedule a Notifee alarm for a specific timestamp (Android)
 * 
 * CRITICAL: Does NOT cancel all notifications - only cancels the specific
 * notification being rescheduled to avoid wiping other medications.
 * 
 * Uses deterministic ID: medicationId_timestamp for collision handling.
 */
export async function scheduleNotifeeAlarm(
  data: MedicationNotificationData,
  timestamp: number
): Promise<string> {
  if (Platform.OS !== 'android') {
    // Calculate delay for iOS fallback
    const delayMs = timestamp - Date.now();
    const delaySeconds = Math.max(1, Math.floor(delayMs / 1000));
    return scheduleTestNotification(data, delaySeconds);
  }

  // 1. Ensure channel exists (does NOT wipe notifications)
  await initNotifeeAlarmChannel();

  // 2. Generate deterministic unique ID based on medication + timestamp
  // This allows us to overwrite the same alarm without affecting others
  const notificationId = `${data.medicationId}_${timestamp}`;

  // 3. Cancel ONLY this specific notification if it exists (safe overwrite)
  try {
    await notifee.cancelNotification(notificationId);
    logger.debug('Cancelled existing notification for overwrite', { notificationId });
  } catch {
    // Notification didn't exist, that's fine
  }

  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp,
    alarmManager: {
      allowWhileIdle: true,
    },
  };

  // DEBUG: Log scheduling details
  console.log('⏰ ========================================');
  console.log('⏰ SCHEDULING TRIGGER NOTIFICATION');
  console.log('⏰ Channel:', NOTIFEE_CHANNEL_ID);
  console.log('⏰ Notification ID:', notificationId);
  console.log('⏰ Medication:', data.name);
  console.log('⏰ Trigger Time:', new Date(timestamp).toLocaleString());
  console.log('⏰ ========================================');

  await notifee.createTriggerNotification(
    {
      id: notificationId,
      title: '💊 MEDICATION TIME!',
      body: `Time to take ${data.name} - ${data.dosage}`,
      data: { ...data } as Record<string, string>,
      android: {
        channelId: NOTIFEE_CHANNEL_ID,
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
        sound: 'default',
        timeoutAfter: ALARM_TIMEOUT_MS,
        actions: [
          { title: 'Take Now', pressAction: { id: 'take' } },
          { title: 'Snooze', pressAction: { id: 'snooze' } },
        ],
      },
    },
    trigger
  );

  logger.debug('Notifee alarm scheduled', { notificationId, timestamp, medicationId: data.medicationId });
  return notificationId;
}

/**
 * Schedule a daily Notifee alarm (Android)
 */
export async function scheduleDailyNotifeeAlarm(
  data: MedicationNotificationData,
  hour: number,
  minute: number
): Promise<string> {
  const now = new Date();
  const scheduledTime = new Date();
  scheduledTime.setHours(hour, minute, 0, 0);

  // If time has passed today, schedule for tomorrow
  if (scheduledTime.getTime() <= now.getTime()) {
    scheduledTime.setDate(scheduledTime.getDate() + 1);
  }

  return scheduleNotifeeAlarm(data, scheduledTime.getTime());
}

/**
 * Cancel a Notifee notification
 */
export async function cancelNotifeeNotification(notificationId: string): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    await notifee.cancelNotification(notificationId);
    logger.debug('Notifee notification cancelled', { notificationId });
  } catch (error) {
    logger.error('Failed to cancel Notifee notification', error);
  }
}

/**
 * Cancel all Notifee notifications
 */
export async function cancelAllNotifeeNotifications(): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    await notifee.cancelAllNotifications();
    logger.debug('All Notifee notifications cancelled');
  } catch (error) {
    logger.error('Failed to cancel all Notifee notifications', error);
  }
}
