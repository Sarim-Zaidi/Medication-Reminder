/**
 * Alarm speech hook
 * Manages text-to-speech announcement for medication reminders
 */

import { useEffect, useRef } from 'react';
import * as Speech from 'expo-speech';
import { logger } from '@/lib/logger';

export function useAlarmSpeech(name: string, dosage: string) {
  const isSpeakingRef = useRef(false);

  useEffect(() => {
    const speakAnnouncement = async () => {
      if (isSpeakingRef.current) return;
      
      isSpeakingRef.current = true;
      const message = `It is time to take ${name || 'your medication'}. ${dosage || ''}`;
      
      try {
        // Speak the message twice for emphasis
        await Speech.speak(message, {
          language: 'en-US',
          pitch: 1.0,
          rate: 0.9,
        });
        
        // Wait a moment between announcements
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Speak again
        await Speech.speak(message, {
          language: 'en-US',
          pitch: 1.0,
          rate: 0.9,
          onDone: () => {
            isSpeakingRef.current = false;
            logger.debug('TTS completed');
          },
          onStopped: () => {
            isSpeakingRef.current = false;
            logger.debug('TTS stopped');
          },
          onError: () => {
            isSpeakingRef.current = false;
            logger.debug('TTS error');
          },
        });
      } catch (error) {
        logger.error('Speech error', error);
        isSpeakingRef.current = false;
      }
    };

    speakAnnouncement();

    return () => {
      Speech.stop();
      isSpeakingRef.current = false;
    };
  }, [name, dosage]);

  const stopSpeech = async (): Promise<void> => {
    try {
      await Speech.stop();
      isSpeakingRef.current = false;
      logger.debug('Speech stopped manually');
    } catch (error) {
      logger.error('Error stopping speech', error);
    }
  };

  return { stopSpeech };
}
