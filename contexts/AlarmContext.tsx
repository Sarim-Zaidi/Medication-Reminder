/**
 * Alarm Context
 * Global state to track if alarm is active
 * Prevents multiple alarms from triggering simultaneously
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import { logger } from '@/lib/logger';

interface AlarmContextType {
  isAlarmActive: boolean;
  activateAlarm: (medicationId: string) => boolean;
  deactivateAlarm: () => void;
  getCurrentAlarmMedicationId: () => string | null;
}

const AlarmContext = createContext<AlarmContextType | undefined>(undefined);

export function AlarmProvider({ children }: { children: React.ReactNode }) {
  const [isAlarmActive, setIsAlarmActive] = useState(false);
  const [currentMedicationId, setCurrentMedicationId] = useState<string | null>(null);

  const activateAlarm = useCallback((medicationId: string): boolean => {
    if (isAlarmActive) {
      logger.warn('Alarm already active - ignoring duplicate trigger', {
        currentMedId: currentMedicationId,
        attemptedMedId: medicationId,
      });
      return false; // Lock is held
    }

    setIsAlarmActive(true);
    setCurrentMedicationId(medicationId);
    logger.debug('Alarm activated', { medicationId });
    return true; // Lock acquired
  }, [isAlarmActive, currentMedicationId]);

  const deactivateAlarm = useCallback(() => {
    if (!isAlarmActive) {
      logger.debug('No alarm to deactivate');
      return;
    }

    logger.debug('Alarm deactivated', { medicationId: currentMedicationId });
    setIsAlarmActive(false);
    setCurrentMedicationId(null);
  }, [isAlarmActive, currentMedicationId]);

  const getCurrentAlarmMedicationId = useCallback(() => {
    return currentMedicationId;
  }, [currentMedicationId]);

  return (
    <AlarmContext.Provider
      value={{
        isAlarmActive,
        activateAlarm,
        deactivateAlarm,
        getCurrentAlarmMedicationId,
      }}
    >
      {children}
    </AlarmContext.Provider>
  );
}

export function useAlarm(): AlarmContextType {
  const context = useContext(AlarmContext);
  if (!context) {
    throw new Error('useAlarm must be used within AlarmProvider');
  }
  return context;
}
