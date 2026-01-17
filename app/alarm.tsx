import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import notifee from '@notifee/react-native';
import { AlarmView } from '@/features/alarm/components/AlarmView';
import { useAlarmSound } from '@/features/alarm/hooks/useAlarmSound';
import { useAlarmSpeech } from '@/features/alarm/hooks/useAlarmSpeech';
import { useAlarmAnimation } from '@/features/alarm/hooks/useAlarmAnimation';
import { useAlarmActions } from '@/features/alarm/hooks/useAlarmActions';
import { logger } from '@/lib/logger';

// Helper to sanitize params that might be string[]
function sanitizeParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) {
    return param[0] || '';
  }
  return param || '';
}

export default function AlarmScreen() {
  const params = useLocalSearchParams<{
    medicationId: string | string[];
    name: string | string[];
    dosage: string | string[];
    notificationId?: string | string[];
  }>();
  
  // Sanitize params to ensure they're strings
  const medicationId = sanitizeParam(params.medicationId);
  const name = sanitizeParam(params.name);
  const dosage = sanitizeParam(params.dosage);
  const notificationId = sanitizeParam(params.notificationId);
  
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Use feature hooks
  const { stopSound } = useAlarmSound();
  const { stopSpeech } = useAlarmSpeech(name, dosage);
  const { animatedButtonStyle } = useAlarmAnimation();
  const { handleTaken, handleSnooze } = useAlarmActions({
    medicationId,
    stopSound,
    stopSpeech,
  });

  // Update clock every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Cancel notification once user has successfully reached alarm screen
  // This ensures the notification is only dismissed after successful navigation
  useEffect(() => {
    const cancelAlarmNotification = async () => {
      if (Platform.OS !== 'android') return;

      try {
        if (notificationId) {
          await notifee.cancelNotification(notificationId);
          logger.debug('Alarm notification cancelled - user reached alarm screen', { notificationId });
        }
      } catch (error) {
        logger.error('Failed to cancel alarm notification', error);
      }
    };

    cancelAlarmNotification();
  }, [notificationId]);

  return (
    <AlarmView
      currentTime={currentTime}
      medicationName={name}
      dosage={dosage}
      onTaken={handleTaken}
      onSnooze={handleSnooze}
      animatedButtonStyle={animatedButtonStyle}
    />
  );
}
