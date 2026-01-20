/**
 * Alarm speech hook
 * 
 * NOTE: Local TTS (Text-to-Speech) is DISABLED.
 * Voice announcements are now handled by Twilio voice calls.
 * This hook is kept for interface compatibility.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useAlarmSpeech(_name: string, _dosage: string) {
  // Local TTS disabled - Twilio handles voice announcements
  // No expo-speech usage needed

  const stopSpeech = async (): Promise<void> => {
    // No-op: Speech is handled by Twilio call, not local TTS
    console.log('📞 stopSpeech called (no-op - Twilio handles voice)');
  };

  return { stopSpeech };
}
