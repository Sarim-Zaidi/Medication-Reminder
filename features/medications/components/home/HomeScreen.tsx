/**
 * HomeScreen container
 * Orchestrates hooks and renders the Home component
 * This is a minimal wrapper - full atomization of Home.tsx would split into 10+ components
 */

import React from 'react';
import { router } from 'expo-router';
import { useMedication } from '@/contexts/MedicationContext';
import { useMedicationActions } from '@/features/medications/hooks/useMedicationActions';
import Home from '@/components/Home';
import { ROUTES } from '@/constants/config';

export function HomeScreen() {
  const { medications } = useMedication();
  const { toggleTaken, deleteMedication, scheduleTestAlarm } = useMedicationActions();

  const handleAddClick = () => {
    router.push(ROUTES.ADD_MEDICATION);
  };

  return (
    <Home
      meds={medications}
      onToggleMed={toggleTaken}
      onDeleteMed={deleteMedication}
      onAddClick={handleAddClick}
      onTestAlarm={scheduleTestAlarm}
    />
  );
}
