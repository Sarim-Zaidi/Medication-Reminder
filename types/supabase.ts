/**
 * Supabase database row types
 * These match the snake_case columns in the database
 */

export interface MedicationRow {
  id: string;
  name: string;
  dosage: string;
  time: string;
  is_taken: boolean;
  user_id: string;
  created_at?: string;
}

export interface NewMedicationRow {
  name: string;
  dosage: string;
  time: string;
  is_taken: boolean;
  user_id: string;
}
