import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Medication, MedicationDraft } from '@/types';
import { sortMedications } from '@/features/medications/utils/sortMedications';
import * as medicationsRepository from '@/features/medications/services/medicationsRepository';

interface MedicationContextType {
  medications: Medication[];
  addMedication: (med: MedicationDraft) => Promise<Medication[]>;
  updateMedicationStatus: (id: string, isTaken: boolean) => Promise<void>;
  deleteMedication: (id: string) => Promise<void>;
  loading: boolean;
  error: string | null;
}

const MedicationContext = createContext<MedicationContextType | undefined>(undefined);

export function MedicationProvider({ children }: { children: ReactNode }) {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Load medications from repository on mount
  useEffect(() => {
    let cancelled = false;

    const loadMedications = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          // User not logged in, keep medications empty
          if (!cancelled && isMountedRef.current) {
            setMedications([]);
            setLoading(false);
          }
          return;
        }

        const medications = await medicationsRepository.fetchMedications(user.id);

        if (!cancelled && isMountedRef.current) {
          setMedications(sortMedications(medications));
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        console.error('Unexpected error loading medications:', err);
        if (!cancelled && isMountedRef.current) {
          setError('An unexpected error occurred.');
          setLoading(false);
        }
      }
    };

    loadMedications();

    return () => {
      cancelled = true;
    };
  }, []);

  const addMedication = async (newMed: MedicationDraft): Promise<Medication[]> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      const created = await medicationsRepository.insertMedications(user.id, newMed);

      if (isMountedRef.current) {
        setMedications((prev) => sortMedications([...prev, ...created]));
        return created;
      }

      return [];
    } catch (err) {
      console.error('Error adding medication:', err);
      throw err;
    }
  };

  const updateMedicationStatus = async (id: string, isTaken: boolean) => {
    const med = medications.find((m) => m.id === id);
    if (!med) return;

    try {

      // Optimistically update UI and re-sort to move taken items to bottom
      if (isMountedRef.current) {
        setMedications((prev) => {
          const updated = prev.map((m) => (m.id === id ? { ...m, isTaken } : m));
          return sortMedications(updated);
        });
      }

      await medicationsRepository.updateMedicationTaken(id, isTaken);
    } catch (err) {
      console.error('Error updating medication:', err);
      // Revert optimistic update with proper sorting
      if (isMountedRef.current) {
        setMedications((prev) => {
          const reverted = prev.map((m) => (m.id === id ? { ...m, isTaken: med.isTaken } : m));
          return sortMedications(reverted);
        });
      }
      throw err;
    }
  };

  const deleteMedication = async (id: string) => {
    const backup = medications;

    try {
      // Optimistically remove from UI
      if (isMountedRef.current) {
        setMedications((prev) => prev.filter((m) => m.id !== id));
      }

      await medicationsRepository.deleteMedication(id);
    } catch (err) {
      console.error('Error deleting medication:', err);
      // Restore backup
      if (isMountedRef.current) {
        setMedications(backup);
      }
      throw err;
    }
  };

  return (
    <MedicationContext.Provider
      value={{
        medications,
        addMedication,
        updateMedicationStatus,
        deleteMedication,
        loading,
        error,
      }}
    >
      {children}
    </MedicationContext.Provider>
  );
}

export function useMedication() {
  const context = useContext(MedicationContext);
  if (context === undefined) {
    throw new Error('useMedication must be used within a MedicationProvider');
  }
  return context;
}
