/**
 * Medications repository
 * Handles all database operations for medications
 * Separated from context to follow clean architecture principles
 */

import { supabase } from '@/lib/supabase';
import type { Medication, MedicationDraft } from '@/types';
import type { MedicationRow, NewMedicationRow } from '@/types/supabase';

/**
 * Maps database row (snake_case) to domain model (camelCase)
 */
export function mapMedicationRowToModel(row: MedicationRow): Medication {
  return {
    id: row.id,
    name: row.name,
    dosage: row.dosage,
    time: row.time,
    isTaken: row.is_taken,
    user_id: row.user_id,
    created_at: row.created_at,
  };
}

/**
 * Fetch all medications for a user
 */
export async function fetchMedications(userId: string): Promise<Medication[]> {
  const { data, error } = await supabase
    .from('medications')
    .select('*')
    .eq('user_id', userId)
    .order('time', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch medications: ${error.message}`);
  }

  return (data || []).map(mapMedicationRowToModel);
}

/**
 * Insert new medications (one for each time slot)
 */
export async function insertMedications(
  userId: string,
  draft: MedicationDraft
): Promise<Medication[]> {
  const newMedications: NewMedicationRow[] = draft.times.map((time) => ({
    name: draft.name,
    dosage: draft.dosage,
    time: time,
    is_taken: false,
    user_id: userId,
  }));

  const { data, error } = await supabase
    .from('medications')
    .insert(newMedications)
    .select();

  if (error) {
    throw new Error(`Failed to insert medications: ${error.message}`);
  }

  return (data || []).map(mapMedicationRowToModel);
}

/**
 * Update medication taken status
 */
export async function updateMedicationTaken(
  id: string,
  isTaken: boolean
): Promise<void> {
  const { error } = await supabase
    .from('medications')
    .update({ is_taken: isTaken })
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to update medication: ${error.message}`);
  }
}

/**
 * Delete a medication
 */
export async function deleteMedication(id: string): Promise<void> {
  const { error } = await supabase
    .from('medications')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to delete medication: ${error.message}`);
  }
}
