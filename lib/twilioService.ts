import { supabase } from './supabase';
import { logger } from './logger';

// New batched medication format
interface MedicationItem {
  id: string;
  name: string;
  logId?: string;
}

// Supports both legacy single-medication and new batched format
interface TriggerCallParams {
  phoneNumber: string;
  userName: string;
  // New batched format (preferred)
  medications?: MedicationItem[];
  // Legacy single-medication format (backward compatible)
  medicationName?: string;
  medicationId?: string;
  logId?: string;
}

interface TriggerCallResult {
  success: boolean;
  callSid?: string;
  medicationCount?: number;
  error?: string;
}

/**
 * Trigger a Twilio voice call via Supabase Edge Function
 * Supports batched medications (multiple meds in one call)
 */
export async function triggerMedicationCall(params: TriggerCallParams): Promise<TriggerCallResult> {
  // Determine if batched or legacy format
  const isBatched = params.medications && params.medications.length > 0;
  const medCount = isBatched ? params.medications!.length : 1;
  const medNames = isBatched 
    ? params.medications!.map(m => m.name).join(', ')
    : params.medicationName || 'unknown';

  console.log('📞 ========================================');
  console.log('📞 TRIGGERING TWILIO CALL');
  console.log('📞 Phone:', params.phoneNumber);
  console.log('📞 User:', params.userName);
  console.log('📞 Format:', isBatched ? 'BATCHED' : 'LEGACY');
  console.log('📞 Medication Count:', medCount);
  console.log('📞 Medications:', medNames);
  console.log('📞 ========================================');

  try {
    const { data, error } = await supabase.functions.invoke('make-call', {
      body: params,
    });

    if (error) {
      console.error('❌ Twilio call failed:', error);
      logger.error('Failed to trigger Twilio call', error);
      return { success: false, error: error.message };
    }

    console.log('✅ Twilio call initiated successfully!');
    console.log('✅ Call SID:', data?.callSid);
    console.log('✅ Medication count:', data?.medicationCount);
    logger.debug('Twilio call triggered successfully', { 
      callSid: data?.callSid,
      medicationCount: data?.medicationCount
    });
    return { 
      success: true, 
      callSid: data?.callSid,
      medicationCount: data?.medicationCount
    };
  } catch (err) {
    console.error('❌ Twilio call exception:', err);
    logger.error('Exception triggering Twilio call', err);
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Convenience function to trigger a batched medication call
 */
export async function triggerBatchedMedicationCall(
  phoneNumber: string,
  userName: string,
  medications: MedicationItem[]
): Promise<TriggerCallResult> {
  return triggerMedicationCall({
    phoneNumber,
    userName,
    medications,
  });
}
