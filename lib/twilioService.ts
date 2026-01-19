import { supabase } from './supabase';
import { logger } from './logger';

interface TriggerCallParams {
  phoneNumber: string;
  userName: string;
  medicationName: string;
}

interface TriggerCallResult {
  success: boolean;
  callSid?: string;
  error?: string;
}

/**
 * Trigger a Twilio voice call via Supabase Edge Function
 */
export async function triggerMedicationCall(params: TriggerCallParams): Promise<TriggerCallResult> {
  console.log('📞 ========================================');
  console.log('📞 TRIGGERING TWILIO CALL');
  console.log('📞 Phone:', params.phoneNumber);
  console.log('📞 User:', params.userName);
  console.log('📞 Medication:', params.medicationName);
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
    logger.debug('Twilio call triggered successfully', { callSid: data?.callSid });
    return { success: true, callSid: data?.callSid };
  } catch (err) {
    console.error('❌ Twilio call exception:', err);
    logger.error('Exception triggering Twilio call', err);
    return { success: false, error: (err as Error).message };
  }
}
