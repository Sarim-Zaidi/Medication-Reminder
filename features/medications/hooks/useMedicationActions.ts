/**
 * Medication actions hook
 * Provides action handlers for medication operations with error surfacing
 */

import { Alert } from 'react-native';
import { useMedication } from '@/contexts/MedicationContext';
import { displayAlarmNotification } from '@/features/notifications/services/notificationsService';
import type { Medication } from '@/types';

export function useMedicationActions() {
  const { medications, updateMedicationStatus, deleteMedication: deleteMed } = useMedication();

  const toggleTaken = async (id: string): Promise<void> => {
    const med = medications.find((m) => m.id === id);
    if (!med) return;

    try {
      await updateMedicationStatus(id, !med.isTaken);
    } catch (error) {
      Alert.alert('Error', 'Failed to update medication. Please try again.');
    }
  };

  const deleteMedication = async (id: string): Promise<void> => {
    try {
      await deleteMed(id);
    } catch (error) {
      Alert.alert('Error', 'Failed to delete medication. Please try again.');
    }
  };

  const scheduleTestAlarm = async (medOrFallback?: Medication): Promise<void> => {
    try {
      const testMed = medOrFallback || medications[0] || {
        id: 'test-id',
        name: 'Test Medication',
        dosage: 'Take 2 pills',
        time: '12:00',
        isTaken: false,
      };

      await displayAlarmNotification({
        medicationId: testMed.id,
        name: testMed.name,
        dosage: testMed.dosage,
      });

      Alert.alert('Test Alarm', 'Full-screen alarm displayed immediately!');
    } catch (error) {
      Alert.alert('Error', 'Failed to schedule test notification');
      console.error('Test alarm error:', error);
    }
  };

  return {
    toggleTaken,
    deleteMedication,
    scheduleTestAlarm,
  };
}
