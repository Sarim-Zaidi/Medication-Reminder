/**
 * Create medication reminders hook
 * Orchestrates medication creation and notification scheduling
 */

import { useState, useRef } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { useMedication } from '@/contexts/MedicationContext';
import { scheduleDailyNotifeeAlarm } from '@/features/notifications/services/notificationsService';
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
      const createdMedications = await addMedication(draft);

      // Schedule notifications for each created medication
      for (const med of createdMedications) {
        const [hourStr, minuteStr] = med.time.split(':');
        const hour = parseInt(hourStr, 10);
        const minute = parseInt(minuteStr, 10);

        await scheduleDailyNotifeeAlarm(
          { medicationId: med.id, name: med.name, dosage: med.dosage },
          hour,
          minute
        );
      }
      
      return true;
    } catch (error) {
      logger.error('Failed to save medication', error);
      
      // Check if this is a permission error
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isPermissionError = errorMessage.toLowerCase().includes('permission');
      
      Alert.alert(
        isPermissionError ? '⚠️ Notifications Disabled' : 'Save Failed',
        isPermissionError 
          ? 'Medication reminders require notification permissions. Please enable notifications in your device settings to receive alerts for your medications.'
          : (errorMessage || 'Could not save your medication. Please try again.'),
        isPermissionError 
          ? [
              { text: 'Cancel', style: 'cancel' },
              { 
                text: 'Open Settings',
                onPress: () => {
                  if (Platform.OS === 'ios') {
                    Linking.openURL('app-settings:');
                  } else {
                    Linking.openSettings();
                  }
                }
              }
            ]
          : [{ text: 'OK' }]
      );
      
      return false;
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  return { createReminders, saving };
}
