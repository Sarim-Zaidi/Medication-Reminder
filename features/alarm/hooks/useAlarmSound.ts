/**
 * Alarm sound hook
 * 
 * NOTE: Custom audio playback is DISABLED.
 * Sound is now handled by Twilio voice calls.
 * This hook is kept for interface compatibility.
 */

export function useAlarmSound() {
  // Custom audio playback disabled - Twilio handles the call
  // No expo-av usage needed

  const stopSound = async (): Promise<void> => {
    // No-op: Sound is handled by Twilio call, not local playback
    console.log('📞 stopSound called (no-op - Twilio handles audio)');
  };

  return { stopSound };
}
