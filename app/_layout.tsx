import { useCallback, useEffect, useRef, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRootNavigationState, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, AppState, Platform, StyleSheet, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import notifee, { EventType } from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { MedicationProvider } from '@/contexts/MedicationContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { AlarmProvider } from '@/contexts/AlarmContext';
import { NOTIFEE_CHANNEL_ID, requestNotificationPermissions, requestNotifeePermissions, MedicationNotificationData } from '@/lib/notifications';
import { logger } from '@/lib/logger';
import PermissionBanner from '@/components/PermissionBanner';
import AuthScreen from './auth';
import { useForegroundAlarm } from '@/hooks/useForegroundAlarm';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0d9488" />
      </View>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  return <>{children}</>;
}

// Component to run foreground alarm checks (must be inside MedicationProvider)
function ForegroundAlarmChecker() {
  useForegroundAlarm();
  return null;
}

export const unstable_settings = {
  anchor: '(tabs)',
};

function useNotificationObserver() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const isNavigationReady = Boolean(rootNavigationState?.key);
  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  const [showPermissionBanner, setShowPermissionBanner] = useState(false);
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const processedNotificationKey = useRef<string | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<{
    data: MedicationNotificationData;
    source: 'background_tap' | 'cold_start' | 'foreground_auto';
    notificationId?: string | null;
  } | null>(null);

  const enqueueAlarmNavigation = useCallback(
    (notification: Notifications.Notification, source: 'background_tap' | 'cold_start' | 'foreground_auto') => {
      const data = notification.request.content.data as unknown as MedicationNotificationData;

      if (!data?.medicationId) {
        return;
      }

      // For repeating notifications, `request.identifier` stays the same across days.
      // Include the delivery date so we only dedupe the *same delivered notification*.
      const key = `${notification.request.identifier}:${notification.date}`;
      if (processedNotificationKey.current === key) {
        return;
      }
      processedNotificationKey.current = key;

      setPendingNavigation({ data, source });
    },
    []
  );

  const consumePendingAlarmNavigation = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem('pending_alarm_navigation');
      if (!raw) return;

      await AsyncStorage.removeItem('pending_alarm_navigation');

      const parsed = JSON.parse(raw) as {
        medicationId?: unknown;
        name?: unknown;
        dosage?: unknown;
        notificationId?: unknown;
        timestamp?: unknown;
      };

      if (typeof parsed?.medicationId !== 'string' || parsed.medicationId.length === 0) {
        return;
      }

      const data: MedicationNotificationData = {
        medicationId: parsed.medicationId,
        name: typeof parsed.name === 'string' ? parsed.name : '',
        dosage: typeof parsed.dosage === 'string' ? parsed.dosage : '',
      };

      const notificationId = typeof parsed.notificationId === 'string' ? parsed.notificationId : null;
      const key = notificationId
        ? `notifee:${notificationId}:${typeof parsed.timestamp === 'number' ? parsed.timestamp : ''}`
        : null;

      if (key && processedNotificationKey.current === key) {
        return;
      }
      if (key) {
        processedNotificationKey.current = key;
      }

      setPendingNavigation({ data, source: 'background_tap', notificationId });
    } catch (error) {
      logger.error('Failed to consume pending alarm navigation', error);
    }
  }, [processedNotificationKey, setPendingNavigation]);

  useEffect(() => {
    void consumePendingAlarmNavigation();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void consumePendingAlarmNavigation();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [consumePendingAlarmNavigation]);

  useEffect(() => {
    // Request permissions on mount with proper error handling
    const initializeNotifications = async () => {
      // Request expo-notifications permissions (for iOS and fallback)
      const granted = await requestNotificationPermissions();
      
      // Also request Notifee permissions for Android full-screen alarms
      if (Platform.OS === 'android') {
        await requestNotifeePermissions();
      }
      
      if (!granted) {
        // Critical: Permissions denied - show persistent banner
        logger.warn('Notification permissions denied, showing banner');
        setShowPermissionBanner(true);
      }
    };

    void initializeNotifications();

    // Setup Notifee foreground event handler (Android)
    const unsubscribeNotifee = notifee.onForegroundEvent(({ type, detail }) => {
      const { notification, pressAction } = detail;
      const data = notification?.data as MedicationNotificationData | undefined;

      if (type === EventType.PRESS || type === EventType.ACTION_PRESS) {
        logger.debug('Notifee foreground event', { type, pressAction, data });
        
        if (data?.medicationId) {
          // Navigate to alarm screen
          // NOTE: Don't cancel notification here - let alarm screen handle it
          setPendingNavigation({
            data,
            source: 'background_tap',
            notificationId: notification?.id ?? null,
          });
        }
      }
    });

    // Handle notification received - LOGGING ONLY
    // NOTE: Auto-navigation is DISABLED here to prevent duplicate triggers
    // useForegroundAlarm (checking every 1 second) is the PRIMARY trigger for alarms
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      logger.debug('Notification received in foreground (navigation disabled - using useForegroundAlarm instead)', {
        id: notification.request.identifier,
        title: notification.request.content.title,
      });
      
      // Do NOT navigate here - useForegroundAlarm handles it
      // This prevents duplicate alarm screens
    });

    // Handle notification response (user tapped notification from notification tray)
    // This fires when app is in background/locked and user manually taps
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      logger.debug('User tapped notification - navigating to alarm', {
        id: response.notification.request.identifier,
      });
      enqueueAlarmNavigation(response.notification, 'background_tap');
    });

    return () => {
      // Cleanup expo-notifications listeners
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
      // Cleanup Notifee foreground listener
      unsubscribeNotifee();
    };
  }, [enqueueAlarmNavigation]);

  // Handle notification tap that launched the app (cold start) - expo-notifications
  useEffect(() => {
    if (lastNotificationResponse) {
      enqueueAlarmNavigation(lastNotificationResponse.notification, 'cold_start');
    }

    return undefined;
  }, [lastNotificationResponse, enqueueAlarmNavigation]);

  // Handle Notifee fullScreenAction cold start (when app launches from lock screen)
  useEffect(() => {
    const checkInitialNotification = async () => {
      if (Platform.OS !== 'android') return;

      try {
        const initialNotification = await notifee.getInitialNotification();
        
        if (initialNotification) {
          const { notification, pressAction } = initialNotification;
          const channelId = notification?.android?.channelId;
          const data = notification?.data as MedicationNotificationData | undefined;

          logger.debug('Notifee initial notification (cold start from fullScreenAction)', {
            notificationId: notification?.id,
            channelId,
            pressActionId: pressAction?.id,
            data,
          });

          // Only handle alarm channel notifications
          // NOTE: Don't cancel notification here - let alarm screen handle it
          const isAlarmChannel =
            channelId === NOTIFEE_CHANNEL_ID || channelId === 'medication-alarm' || channelId === 'alarm_critical';

          if (isAlarmChannel && data?.medicationId) {
            setPendingNavigation({
              data,
              source: 'cold_start',
              notificationId: notification?.id ?? null,
            });
          }
        }
      } catch (error) {
        logger.error('Failed to get initial Notifee notification', error);
      }
    };

    checkInitialNotification();
  }, []);

  useEffect(() => {
    if (!pendingNavigation || !isNavigationReady) {
      return;
    }

    const { data, source, notificationId } = pendingNavigation;

    logger.debug('Navigating to alarm screen from notification', {
      source,
      medicationId: data.medicationId,
    });

    const params: Record<string, string> = {
      medicationId: data.medicationId,
      name: data.name,
      dosage: data.dosage,
    };

    if (notificationId) {
      params.notificationId = notificationId;
    }

    const navParams = {
      pathname: '/alarm' as const,
      params,
    };

    // Use replace for cold_start to prevent going back to home
    if (source === 'cold_start') {
      router.replace(navParams);
    } else {
      router.push(navParams);
    }

    setPendingNavigation(null);
  }, [pendingNavigation, isNavigationReady, router]);

  return { showPermissionBanner, setShowPermissionBanner };
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { showPermissionBanner, setShowPermissionBanner } = useNotificationObserver();

  return (
    <AuthProvider>
      <MedicationProvider>
        <AlarmProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <AuthGuard>
              <ForegroundAlarmChecker />
              <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen 
                name="add-medication" 
                options={{ 
                  title: 'New Reminder',
                  presentation: 'card',
                  headerShown: false,
                }} 
              />
              <Stack.Screen 
                name="alarm" 
                options={{ 
                  presentation: 'fullScreenModal',
                  headerShown: false,
                  animation: 'fade',
                }} 
              />
              <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
              </Stack>
              <PermissionBanner
                visible={showPermissionBanner}
                onDismiss={() => setShowPermissionBanner(false)}
              />
            </AuthGuard>
            <StatusBar style="auto" />
          </ThemeProvider>
        </AlarmProvider>
      </MedicationProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#f5f5f4',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
