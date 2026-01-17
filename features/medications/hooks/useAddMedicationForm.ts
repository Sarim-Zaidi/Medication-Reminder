/**
 * Add medication form hook
 * Manages form state, validation, and frequency/time slot logic
 */

import { useState, useMemo } from 'react';
import { DEFAULT_MEDICATION_TIMES, MAX_FREQUENCY_PER_DAY, MIN_FREQUENCY_PER_DAY } from '@/constants/time';
import { isValidTime } from '../utils/time';

export function useAddMedicationForm() {
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState(1);
  const [times, setTimes] = useState<string[]>(['08:00']);

  const canSave = useMemo(() => {
    const allTimesValid = times.every((t) => isValidTime(t.trim()));
    return name.trim().length > 0 && dosage.trim().length > 0 && allTimesValid && times.length > 0;
  }, [name, dosage, times]);

  const handleFrequencyChange = (delta: number) => {
    const newFrequency = Math.max(MIN_FREQUENCY_PER_DAY, Math.min(MAX_FREQUENCY_PER_DAY, frequency + delta));
    setFrequency(newFrequency);
    
    // Adjust times array
    if (newFrequency > times.length) {
      // Add new time slots with smart defaults
      const newTimes = [...times];
      while (newTimes.length < newFrequency) {
        newTimes.push(DEFAULT_MEDICATION_TIMES[newTimes.length] || '12:00');
      }
      setTimes(newTimes);
    } else if (newFrequency < times.length) {
      // Remove excess times
      setTimes(times.slice(0, newFrequency));
    }
  };

  const handleTimeChange = (index: number, value: string) => {
    const newTimes = [...times];
    newTimes[index] = value;
    setTimes(newTimes);
  };

  const getFormData = () => ({
    name: name.trim(),
    dosage: dosage.trim(),
    times: times.map((t) => t.trim()),
  });

  return {
    name,
    setName,
    dosage,
    setDosage,
    frequency,
    times,
    canSave,
    handleFrequencyChange,
    handleTimeChange,
    getFormData,
  };
}
