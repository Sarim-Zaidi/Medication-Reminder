/**
 * Create medication reminders hook
 * Orchestrates medication creation (DB only - scheduling is server-side)
 */

import { useState, useRef } from 'react';
import { Alert } from 'react-native';
import { useMedication } from '@/contexts/MedicationContext';
import { logger } from '@/lib/logger';
import type { MedicationDraft } from '@/types';

export function useCreateMedicationReminders() {
  const { addMedication } = useMedication();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const createReminders = async (draft: MedicationDraft): Promise<boolean> => {
    // Prevent double-submit with synchronous lock
    if (savingRef.current) return false;
    savingRef.current = true;
    
    setSaving(true);
    try {
      // Create medications in database (one for each time)
      // NOTE: Notifications/calls are now handled server-side by schedule-batches cron job
      await addMedication(draft);
      
      return true;
    } catch (error) {
      logger.error('Failed to save medication', error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      Alert.alert(
        'Save Failed',
        errorMessage || 'Could not save your medication. Please try again.',
        [{ text: 'OK' }]
      );
      
      return false;
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  return { createReminders, saving };
}
