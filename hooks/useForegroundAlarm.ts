import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useMedication } from '@/contexts/MedicationContext';
import { useAlarm } from '@/contexts/AlarmContext';
import type { Medication } from '@/types';
import { logger } from '@/lib/logger';

const CHECK_INTERVAL_MS = 1_000; // Check every 1 second for immediate alarm triggering

interface TriggeredAlarm {
  medicationId: string;
  timeKey: string; // "HH:mm" format to track which minute was triggered
}

export function useForegroundAlarm() {
  const router = useRouter();
  const pathname = usePathname();
  const { medications, loading } = useMedication();
  const { isAlarmActive, activateAlarm } = useAlarm();
  
  // Track which alarms have already been triggered this minute to prevent duplicates
  const triggeredAlarmsRef = useRef<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const getCurrentTimeKey = useCallback((): string => {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }, []);

  const findDueMedication = useCallback(
    (currentTimeKey: string): Medication | null => {
      // Check in priority order: find the earliest due medication
      const dueMeds = medications.filter((med) => {
        if (med.isTaken) return false;
        
        if (med.time === currentTimeKey) {
          const alarmKey = `${med.id}|${currentTimeKey}`;
          // Skip if already triggered this minute
          if (triggeredAlarmsRef.current.has(alarmKey)) return false;
          return true;
        }
        return false;
      });
      
      // Return first due medication (sorted by time)
      return dueMeds.length > 0 ? dueMeds[0] : null;
    },
    [medications]
  );

  const checkAndTriggerAlarm = useCallback(() => {
    // CRITICAL: Don't check if already on alarm screen
    if (pathname === '/alarm') {
      return;
    }

    // CRITICAL: Don't check if alarm is already active (global lock)
    if (isAlarmActive) {
      logger.debug('Alarm already active - skipping trigger check');
      return;
    }

    // Don't check if medications are still loading
    if (loading || medications.length === 0) {
      return;
    }

    const currentTimeKey = getCurrentTimeKey();
    const dueMedication = findDueMedication(currentTimeKey);

    if (dueMedication) {
      const alarmKey = `${dueMedication.id}|${currentTimeKey}`;
      
      // Mark as triggered to prevent duplicate alarms
      triggeredAlarmsRef.current.add(alarmKey);

      // CRITICAL: Try to acquire global alarm lock
      const lockAcquired = activateAlarm(dueMedication.id);
      if (!lockAcquired) {
        logger.warn('Failed to acquire alarm lock - another alarm is active');
        return;
      }

      logger.debug('Foreground alarm triggered (lock acquired)', {
        medicationId: dueMedication.id,
        name: dueMedication.name,
        time: currentTimeKey,
      });

      // CRITICAL: Use replace instead of push to prevent stacking
      router.replace({
        pathname: '/alarm',
        params: {
          medicationId: dueMedication.id,
          name: dueMedication.name,
          dosage: dueMedication.dosage,
        },
      });
    }

    // Clean up old triggered alarms (older than current minute)
    const keysToRemove: string[] = [];
    triggeredAlarmsRef.current.forEach((key) => {
      const [, timeKey] = key.split('|');
      if (timeKey !== currentTimeKey) {
        keysToRemove.push(key);
      }
    });
    keysToRemove.forEach((key) => triggeredAlarmsRef.current.delete(key));
  }, [pathname, loading, medications, getCurrentTimeKey, findDueMedication, router, isAlarmActive, activateAlarm]);

  // Handle app state changes (foreground/background)
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      // When app comes to foreground, do an immediate check
      if (appStateRef.current !== 'active' && nextAppState === 'active') {
        logger.debug('App became active, checking for due medications');
        checkAndTriggerAlarm();
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [checkAndTriggerAlarm]);

  // Main interval-based checking
  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Do an immediate check on mount
    checkAndTriggerAlarm();

    // Set up interval for continuous checking
    intervalRef.current = setInterval(checkAndTriggerAlarm, CHECK_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [checkAndTriggerAlarm]);

  // Reset triggered alarms when medications change (e.g., user marks as taken)
  useEffect(() => {
    // When a medication is marked as taken, remove it from triggered set
    const currentMedIds = new Set(medications.filter((m) => m.isTaken).map((m) => m.id));
    
    triggeredAlarmsRef.current.forEach((key) => {
      const [medId] = key.split('|');
      if (currentMedIds.has(medId)) {
        triggeredAlarmsRef.current.delete(key);
      }
    });
  }, [medications]);
}
