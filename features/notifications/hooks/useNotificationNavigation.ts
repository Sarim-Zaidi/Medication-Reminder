/**
 * Notification navigation hook
 * Manages notification permissions, listeners, and navigation to alarm screen
 * Extracted from app/_layout.tsx for better separation of concerns
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useRootNavigationState } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { requestNotificationPermissions } from '@/features/notifications/services/notificationsService';
import { logger } from '@/lib/logger';
import { ROUTES } from '@/constants/config';
import type { MedicationNotificationData, PendingNavigation } from '@/types';

export function useNotificationNavigation() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const isNavigationReady = Boolean(rootNavigationState?.key);
  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  
  const [showPermissionBanner, setShowPermissionBanner] = useState(false);
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const processedNotificationKey = useRef<string | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);

  const enqueueAlarmNavigation = useCallback(
    (notification: Notifications.Notification, source: PendingNavigation['source']) => {
      const data = notification.request.content.data as unknown as MedicationNotificationData;

      if (!data?.medicationId) {
        return;
      }

      // For repeating notifications, include delivery date for deduplication
      const key = `${notification.request.identifier}:${notification.date}`;
      if (processedNotificationKey.current === key) {
        return;
      }
      processedNotificationKey.current = key;

      setPendingNavigation({ data, source });
    },
    []
  );

  // Initialize permissions and listeners
  useEffect(() => {
    const initializeNotifications = async () => {
      const granted = await requestNotificationPermissions();
      
      if (!granted) {
        logger.warn('Notification permissions denied, showing banner');
        setShowPermissionBanner(true);
      }
    };

    void initializeNotifications();

    // Handle notification received while app is foregrounded
    // CRITICAL: Auto-navigate to alarm screen when notification arrives
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      logger.debug('Notification received in foreground - Auto-navigating to alarm', {
        id: notification.request.identifier,
        title: notification.request.content.title,
      });
      
      enqueueAlarmNavigation(notification, 'foreground_auto');
    });

    // Handle notification response (user tapped notification from background)
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      enqueueAlarmNavigation(response.notification, 'background_tap');
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [enqueueAlarmNavigation]);

  // Handle notification tap that launched the app (cold start)
  useEffect(() => {
    if (lastNotificationResponse) {
      enqueueAlarmNavigation(lastNotificationResponse.notification, 'cold_start');
    }
  }, [lastNotificationResponse, enqueueAlarmNavigation]);

  // Execute pending navigation when ready
  useEffect(() => {
    if (!pendingNavigation || !isNavigationReady) {
      return;
    }

    const { data, source } = pendingNavigation;

    logger.debug('Navigating to alarm screen from notification', {
      source,
      medicationId: data.medicationId,
    });

    router.push({
      pathname: ROUTES.ALARM,
      params: {
        medicationId: data.medicationId,
        name: data.name,
        dosage: data.dosage,
      },
    });

    setPendingNavigation(null);
  }, [pendingNavigation, isNavigationReady, router]);

  return { showPermissionBanner, setShowPermissionBanner };
}
