/**
 * Medication actions hook
 * Provides action handlers for medication operations with error surfacing
 */

import { Alert } from 'react-native';
import { useMedication } from '@/contexts/MedicationContext';

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

  return {
    toggleTaken,
    deleteMedication,
  };
}
