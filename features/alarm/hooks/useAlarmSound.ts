/**
 * Alarm sound hook
 * Uses singleton AlarmSoundManager to prevent multiple instances
 */

import { useEffect } from 'react';
import { alarmSoundManager } from '@/lib/AlarmSoundManager';

export function useAlarmSound() {
  useEffect(() => {
    // Start singleton alarm sound
    alarmSoundManager.start();

    // Cleanup: Stop sound on unmount
    return () => {
      alarmSoundManager.stop();
    };
  }, []);

  const stopSound = async (): Promise<void> => {
    await alarmSoundManager.stop();
  };

  return { stopSound };
}
