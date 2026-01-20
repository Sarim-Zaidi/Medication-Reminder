import notifee, { EventType } from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { triggerMedicationCall } from './twilioService';
import { supabase } from './supabase';

const PENDING_ALARM_NAVIGATION_KEY = 'pending_alarm_navigation';
const PENDING_MEDICATION_ACTION_KEY = 'pending_medication_action';
const LAST_CALL_TRIGGER_KEY = 'last_call_trigger_timestamp';

const globalFlags = globalThis as unknown as {
  __notifeeBackgroundHandlerRegistered?: boolean;
};

function sanitizePhoneNumber(phone: string): string {
  let sanitized = phone.trim();
  
  // Handle Pakistan format: 03... → +923...
  if (sanitized.startsWith('03')) {
    sanitized = '+92' + sanitized.substring(1);
  }
  
  // Ensure + prefix
  if (!sanitized.startsWith('+')) {
    sanitized = '+' + sanitized;
  }
  
  return sanitized;
}

if (!globalFlags.__notifeeBackgroundHandlerRegistered) {
  globalFlags.__notifeeBackgroundHandlerRegistered = true;

  notifee.onBackgroundEvent(async ({ type, detail }) => {
    const { notification, pressAction } = detail;
    const data = notification?.data as
      | { medicationId?: string; name?: string; dosage?: string }
      | undefined;

    // Handle DELIVERED event - trigger Twilio call when notification fires
    if (type === EventType.DELIVERED) {
      console.log('🔔 ========================================');
      console.log('🔔 NOTIFICATION DELIVERED - TRIGGERING CALL');
      console.log('🔔 Medication:', data?.name);
      console.log('🔔 ========================================');

      try {
        // Check debounce - prevent duplicate calls within 60 seconds
        const lastTriggerStr = await AsyncStorage.getItem(LAST_CALL_TRIGGER_KEY);
        const lastTriggerTime = lastTriggerStr ? parseInt(lastTriggerStr, 10) : 0;
        const now = Date.now();
        
        if (now - lastTriggerTime < 60000) {
          console.log('⏳ Call debounced - less than 60s since last trigger');
          console.log('⏳ Time since last trigger:', Math.floor((now - lastTriggerTime) / 1000), 'seconds');
          return;
        }

        // Get user session for phone number
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          const phoneNumber = session.user.phone || session.user.user_metadata?.phone;
          const userName = session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User';

          if (phoneNumber && data?.name) {
            const sanitizedPhone = sanitizePhoneNumber(phoneNumber);
            console.log('📞 Original phone:', phoneNumber);
            console.log('📞 Sanitized phone:', sanitizedPhone);
            console.log('📞 Medication ID:', data?.medicationId);
            
            await triggerMedicationCall({
              phoneNumber: sanitizedPhone,
              userName,
              medicationName: data.name,
              medicationId: data?.medicationId, // Pass for IVR database update
            });
            
            // Update last trigger timestamp after successful call
            await AsyncStorage.setItem(LAST_CALL_TRIGGER_KEY, now.toString());
            console.log('✅ Last trigger timestamp updated');
          } else {
            console.warn('⚠️ Missing phone number or medication name');
            console.warn('⚠️ Phone:', phoneNumber);
            console.warn('⚠️ Medication:', data?.name);
          }
        } else {
          console.warn('⚠️ No user session available - cannot make call');
        }
      } catch (error) {
        console.error('❌ Error in DELIVERED handler:', error);
      }

      return;
    }

    // Button presses (take/snooze)
    if (type === EventType.ACTION_PRESS && pressAction) {
      if ((pressAction.id === 'take' || pressAction.id === 'snooze') && data?.medicationId) {
        await AsyncStorage.setItem(
          PENDING_MEDICATION_ACTION_KEY,
          JSON.stringify({
            action: pressAction.id,
            medicationId: data.medicationId,
            timestamp: Date.now(),
          })
        );
      }

      if (notification?.id) {
        await notifee.cancelNotification(notification.id);
      }

      return;
    }

    // Notification tap / full-screen press (request navigation once app is active)
    if (type === EventType.PRESS && data?.medicationId) {
      await AsyncStorage.setItem(
        PENDING_ALARM_NAVIGATION_KEY,
        JSON.stringify({
          medicationId: data.medicationId,
          name: data.name ?? '',
          dosage: data.dosage ?? '',
          notificationId: notification?.id ?? null,
          timestamp: Date.now(),
        })
      );
    }
  });
}
