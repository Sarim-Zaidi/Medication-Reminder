/**
 * Home medication logic hook
 * View model for home screen - extracts all domain logic from Home component
 */

import { useMemo, useState } from 'react';
import type { Medication, TimePeriod, Greeting } from '@/types';
import { 
  getGreeting, 
  getCurrentTimePeriod, 
  getTimePeriod, 
  isMedicationMissed,
  formatDateLabel,
} from '../utils/time';

export interface HomeMedicationLogic {
  greeting: Greeting;
  todayLabel: string;
  activeTab: TimePeriod;
  setActiveTab: (tab: TimePeriod) => void;
  displayedMedications: Medication[];
  nextMed: Medication | null;
  isHeroMissed: boolean;
  progressStats: {
    taken: number;
    total: number;
    percentage: number;
  };
}

export function useHomeMedicationLogic(medications: Medication[]): HomeMedicationLogic {
  const [activeTab, setActiveTab] = useState<TimePeriod>(getCurrentTimePeriod);

  const greeting = useMemo(() => getGreeting(), []);

  const todayLabel = useMemo(() => formatDateLabel(new Date()), []);

  const nextMed = useMemo(() => {
    const untaken = medications.filter((m) => !m.isTaken);
    if (untaken.length === 0) return null;

    // First, check for missed pills (past time and not taken)
    const missed = untaken.filter((m) => isMedicationMissed(m.time, m.isTaken));
    if (missed.length > 0) {
      // Return earliest missed pill
      return missed.reduce((prev, curr) => (curr.time < prev.time ? curr : prev));
    }

    // If no missed pills, return next upcoming pill
    return untaken.reduce((prev, curr) => (curr.time < prev.time ? curr : prev));
  }, [medications]);

  const isHeroMissed = useMemo(() => {
    if (!nextMed) return false;
    return isMedicationMissed(nextMed.time, nextMed.isTaken);
  }, [nextMed]);

  const displayedMedications = useMemo(() => {
    return medications
      .filter((med) => getTimePeriod(med.time) === activeTab)
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [medications, activeTab]);

  const progressStats = useMemo(() => {
    const taken = medications.filter((m) => m.isTaken).length;
    const total = medications.length;
    const percentage = total > 0 ? (taken / total) * 100 : 0;
    return { taken, total, percentage };
  }, [medications]);

  return {
    greeting,
    todayLabel,
    activeTab,
    setActiveTab,
    displayedMedications,
    nextMed,
    isHeroMissed,
    progressStats,
  };
}
