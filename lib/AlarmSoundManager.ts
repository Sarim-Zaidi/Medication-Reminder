/**
 * Singleton Alarm Sound Manager
 * Ensures only ONE alarm sound instance can play at a time
 * Prevents multiple overlapping alarms
 */

import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { logger } from './logger';
import { ALARM_RINGTONE_PATH } from '@/constants/notifications';

class AlarmSoundManager {
  private static instance: AlarmSoundManager;
  private sound: Audio.Sound | null = null;
  private isStopped: boolean = false;
  private isConfigured: boolean = false;

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): AlarmSoundManager {
    if (!AlarmSoundManager.instance) {
      AlarmSoundManager.instance = new AlarmSoundManager();
    }
    return AlarmSoundManager.instance;
  }

  private async configureAudio(): Promise<void> {
    if (this.isConfigured) return;

    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true, // CRITICAL: Allow background playback
        shouldDuckAndroid: false, // Don't lower volume when TTS speaks
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        playThroughEarpieceAndroid: false, // Use speaker, not earpiece
        allowsRecordingIOS: false, // We don't need recording
      });
      this.isConfigured = true;
      logger.debug('Audio mode configured for alarm');
    } catch (error) {
      logger.error('Failed to configure audio mode', error);
    }
  }

  private async playSound(sound: Audio.Sound): Promise<void> {
    try {
      await sound.setPositionAsync(0);
      await sound.playAsync();
    } catch (error) {
      logger.error('Error playing sound', error);
    }
  }

  public async start(): Promise<void> {
    // If already playing, don't start again
    if (this.sound && !this.isStopped) {
      logger.warn('Alarm sound already playing - ignoring duplicate start request');
      return;
    }

    // Stop any existing sound first
    await this.stop();

    // CRITICAL: Reset flag AFTER stop() completes
    this.isStopped = false;

    try {
      await this.configureAudio();

      // Load the alarm sound - DO NOT auto-play (prevents race condition)
      const { sound } = await Audio.Sound.createAsync(
        ALARM_RINGTONE_PATH,
        {
          isLooping: false,
          volume: 1.0,
          shouldPlay: false, // CRITICAL: Don't auto-play during load
        }
      );

      // CRITICAL: Check if stopped during load
      if (this.isStopped) {
        logger.debug('Stop requested during load - aborting playback');
        await sound.unloadAsync();
        return;
      }

      this.sound = sound;

      // Set up playback status listener for manual looping
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;

        // When audio finishes, replay after gap
        if (status.didJustFinish && !this.isStopped) {
          logger.debug('Audio completed, replaying after 300ms...');
          setTimeout(() => {
            if (!this.isStopped && this.sound) {
              this.playSound(this.sound);
            }
          }, 300);
        }
      });

      // CRITICAL: Final check before playing
      if (this.isStopped) {
        logger.debug('Stop requested before play - aborting');
        await sound.unloadAsync();
        this.sound = null;
        return;
      }

      // Now safe to play
      await this.playSound(sound);

      logger.debug('Alarm sound started (singleton instance)');
    } catch (error) {
      logger.error('Failed to load or play alarm sound', error);
    }
  }

  public async stop(): Promise<void> {
    // Set flag first to prevent replays
    this.isStopped = true;

    if (this.sound) {
      try {
        const sound = this.sound;

        // Remove status update listener
        sound.setOnPlaybackStatusUpdate(null);

        // Stop playback
        await sound.stopAsync();

        // Unload from memory
        await sound.unloadAsync();

        this.sound = null;
        logger.debug('Alarm sound stopped and unloaded (singleton)');
      } catch (error) {
        logger.error('Error stopping sound', error);
        this.sound = null;
      }
    }
  }

  public isPlaying(): boolean {
    return this.sound !== null && !this.isStopped;
  }
}

// Export singleton instance
export const alarmSoundManager = AlarmSoundManager.getInstance();
