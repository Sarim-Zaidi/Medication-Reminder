/**
 * Domain types for medications
 */

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  time: string; // HH:mm format
  isTaken: boolean;
  user_id?: string;
  created_at?: string;
}

export interface MedicationDraft {
  name: string;
  dosage: string;
  times: string[]; // Array of times for multiple doses per day
}

export type TimePeriod = 'Morning' | 'Afternoon' | 'Evening';

export interface Greeting {
  text: string;
  emoji: string;
}
