import { useAuth } from '@/contexts/AuthContext';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import PhoneInput from 'react-native-phone-number-input';

type Step = 'PHONE' | 'OTP' | 'NAME';

// Map backend errors to user-friendly messages for seniors
function getUserFriendlyError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    // Network/connection errors
    if (message.includes('fetch') || message.includes('network') || message.includes('connection')) {
      return 'No internet connection. Please check your WiFi or mobile data.';
    }
    
    // OTP-specific errors
    if (message.includes('invalid') && (message.includes('token') || message.includes('otp') || message.includes('code'))) {
      return 'The code you entered is not correct. Please check and try again.';
    }
    if (message.includes('expired') || message.includes('expire')) {
      return 'This code has expired. Please request a new one.';
    }
    if (message.includes('too many') || message.includes('rate limit')) {
      return 'Too many attempts. Please wait a few minutes and try again.';
    }
    
    // Phone errors
    if (message.includes('phone') && message.includes('invalid')) {
      return 'Please enter a valid phone number (e.g., +1 555 123 4567)';
    }
    
    return error.message || 'Something went wrong. Please try again or contact support.';
  }
  
  // Generic fallback for non-Error types
  return 'Something went wrong. Please try again or contact support.';
}

export default function AuthScreen() {
  const { sendOTP, verifyOTP } = useAuth();
  const [step, setStep] = useState<Step>('PHONE');
  const [phone, setPhone] = useState(''); // Full formatted phone with country code (e.g., +923001234567)
  const [phoneValue, setPhoneValue] = useState(''); // Raw phone number without country code
  const [otp, setOtp] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Phone input ref for validation
  const phoneInputRef = useRef<PhoneInput>(null);
  
  // Synchronous locks to prevent double-submit race conditions
  const sendingRef = useRef(false);
  const verifyingRef = useRef(false);
  const savingRef = useRef(false);
  
  // Cancellation flag to prevent unmounted setState
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleSendOTP = async () => {
    // Validate using the phone input library
    const isValid = phoneInputRef.current?.isValidNumber(phoneValue);
    
    if (!phone || !isValid) {
      Alert.alert('Error', 'Please enter a valid phone number');
      return;
    }

    // Prevent double-submit with synchronous lock
    if (sendingRef.current) return;
    sendingRef.current = true;

    setLoading(true);
    try {
      const { error } = await sendOTP(phone.trim());

      if (!isMountedRef.current) return;

      if (error) {
        Alert.alert('Error', getUserFriendlyError(error));
        return;
      }

      setStep('OTP');
    } catch (error) {
      if (!isMountedRef.current) return;
      
      // Handle unexpected errors (network failures, etc.)
      Alert.alert('Error', getUserFriendlyError(error));
      console.error('SendOTP error:', error);
    } finally {
      if (isMountedRef.current) {
        // Always reset loading state to prevent UI deadlock
        setLoading(false);
      }
      sendingRef.current = false;
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp.trim() || otp.trim().length < 6) {
      Alert.alert('Error', 'Please enter your 6-digit verification code');
      return;
    }

    // Prevent double-submit with synchronous lock
    if (verifyingRef.current) return;
    verifyingRef.current = true;

    setLoading(true);
    try {
      const { error, data } = await verifyOTP(phone.trim(), otp.trim());

      if (!isMountedRef.current) return;

      if (error) {
        Alert.alert('Error', getUserFriendlyError(error));
        return;
      }

      // Check profile to see if name exists
      await checkProfile(data?.user?.id);
    } catch (error) {
      if (!isMountedRef.current) return;
      
      // Handle unexpected errors (network failures, etc.)
      Alert.alert('Error', getUserFriendlyError(error));
      console.error('VerifyOTP error:', error);
    } finally {
      if (isMountedRef.current) {
        // Always reset loading state to prevent UI deadlock
        setLoading(false);
      }
      verifyingRef.current = false;
    }
  };

  async function checkProfile(userId: string | undefined) {
    if (!userId) return;
    
    console.log("🔍 Checking Profile for:", userId);

    // Check DB
    const { data, error } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle();
    
    console.log("📄 DB Result:", data);

    // STRICT CHECK:
    // If no row exists (data is null) OR full_name is missing
    if (!data || !data.full_name) {
      console.log("👤 New User detected. Asking for Name...");
      setLoading(false);
      setStep('NAME'); // FORCE NAME STEP
    } else {
      console.log("✅ User found:", data.full_name);
      router.replace('/'); // Only go home if name exists
    }
  }

  const handleSaveName = async () => {
    if (!fullName.trim() || fullName.trim().length < 3) {
      Alert.alert('Error', 'Please enter your full name (at least 3 characters)');
      return;
    }

    // Prevent double-submit with synchronous lock
    if (savingRef.current) return;
    savingRef.current = true;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!isMountedRef.current) return;

      if (!user) {
        Alert.alert('Error', 'User not found. Please try logging in again.');
        return;
      }

      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        full_name: fullName.trim(),
        phone_number: phone.trim(),
        updated_at: new Date().toISOString(),
      });

      if (!isMountedRef.current) return;

      if (error) {
        Alert.alert('Error', getUserFriendlyError(error));
        console.error('Error saving profile:', error);
        return;
      }

      router.replace('/');
    } catch (error) {
      if (!isMountedRef.current) return;
      
      Alert.alert('Error', getUserFriendlyError(error));
      console.error('Exception saving profile:', error);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
      savingRef.current = false;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.scrollContent}>
            {step === 'PHONE' && (
            <View style={styles.header}>
              <Text style={styles.title}>Welcome to</Text>
              <Text style={styles.appName}>Senior Pill</Text>
              <Text style={styles.subtitle}>
                Enter your phone number to receive a verification code
              </Text>
            </View>
          )}

          {step === 'OTP' && (
            <View style={styles.header}>
              <Text style={styles.title}>Check Your Phone</Text>
              <Text style={styles.subtitle}>
                We sent a 6-digit code to {phone}
              </Text>
            </View>
          )}

          {step === 'NAME' && (
            <View style={styles.header}>
              <Text style={styles.title}>One Last Step</Text>
              <Text style={styles.appName}>Senior Pill</Text>
              <Text style={styles.subtitle}>
                What should we call you?
              </Text>
            </View>
          )}

          {step === 'PHONE' ? (
            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={styles.label}>Your Phone Number</Text>
                <PhoneInput
                  ref={phoneInputRef}
                  defaultValue={phoneValue}
                  defaultCode="US"
                  layout="first"
                  onChangeText={(text) => setPhoneValue(text)}
                  onChangeFormattedText={(text) => setPhone(text)}
                  withDarkTheme={false}
                  withShadow
                  autoFocus
                  disabled={loading}
                  containerStyle={styles.phoneContainer}
                  textContainerStyle={styles.phoneTextContainer}
                  textInputStyle={styles.phoneTextInput}
                  codeTextStyle={styles.phoneCodeText}
                  flagButtonStyle={styles.phoneFlagButton}
                  countryPickerButtonStyle={styles.phoneCountryPicker}
                  placeholder="Enter phone number"
                />
              </View>

              <Pressable
                onPress={handleSendOTP}
                disabled={loading}
                style={({ pressed }) => [
                  styles.primaryButton,
                  loading && styles.primaryButtonDisabled,
                  !loading && pressed && styles.primaryButtonPressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ disabled: loading }}
              >
                <Text style={styles.primaryButtonText}>
                  {loading ? 'Sending...' : 'Send Code'}
                </Text>
              </Pressable>
            </View>
          ) : step === 'OTP' ? (
            <View style={styles.form}>
              <View style={styles.emailSentBox}>
                <Text style={styles.emailSentText}>
                  We sent a code to:
                </Text>
                <Text style={styles.emailSentEmail}>{phone}</Text>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Enter Code</Text>
                <TextInput
                  value={otp}
                  onChangeText={setOtp}
                  placeholder="Enter Code"
                  placeholderTextColor="#64748b"
                  style={[styles.input, styles.otpInput]}
                  keyboardType="number-pad"
                  maxLength={10}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleVerifyOTP}
                  editable={!loading}
                  accessibilityLabel="Verification code input"
                />
              </View>

              <Pressable
                onPress={handleVerifyOTP}
                disabled={loading}
                style={({ pressed }) => [
                  styles.primaryButton,
                  loading && styles.primaryButtonDisabled,
                  !loading && pressed && styles.primaryButtonPressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ disabled: loading }}
              >
                <Text style={styles.primaryButtonText}>
                  {loading ? 'Verifying...' : 'Verify & Enter'}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setStep('PHONE');
                  setOtp('');
                }}
                disabled={loading}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryButtonText}>Change Phone</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={styles.label}>Your Full Name</Text>
                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Enter your full name"
                  placeholderTextColor="#64748b"
                  style={styles.input}
                  keyboardType="default"
                  autoCapitalize="words"
                  autoCorrect={false}
                  autoComplete="name"
                  returnKeyType="done"
                  onSubmitEditing={handleSaveName}
                  editable={!loading}
                  accessibilityLabel="Full name input"
                />
              </View>

              <Pressable
                onPress={handleSaveName}
                disabled={loading}
                style={({ pressed }) => [
                  styles.primaryButton,
                  loading && styles.primaryButtonDisabled,
                  !loading && pressed && styles.primaryButtonPressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ disabled: loading }}
              >
                <Text style={styles.primaryButtonText}>
                  {loading ? 'Saving...' : 'Get Started'}
                </Text>
              </Pressable>
            </View>
          )}
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f4',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flex: 1,
    padding: 24,
    paddingTop: 60,
    gap: 32,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#475569',
  },
  appName: {
    fontSize: 36,
    fontWeight: '900',
    color: '#0d9488',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  subtitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 26,
  },
  form: {
    gap: 20,
  },
  field: {
    gap: 10,
  },
  label: {
    marginLeft: 4,
    fontSize: 18,
    fontWeight: '900',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  input: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#CBD5E1',
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 16,
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  otpInput: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 8,
    textAlign: 'center',
  },
  emailSentBox: {
    backgroundColor: '#ccfbf1',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 4,
  },
  emailSentText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f766e',
  },
  emailSentEmail: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0d9488',
  },
  primaryButton: {
    backgroundColor: '#0d9488',
    borderRadius: 16,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonPressed: {
    opacity: 0.9,
  },
  primaryButtonDisabled: {
    backgroundColor: '#CBD5E1',
  },
  primaryButtonText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonPressed: {
    opacity: 0.7,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#64748b',
    textDecorationLine: 'underline',
  },
  // Phone input styles
  phoneContainer: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#CBD5E1',
    borderRadius: 16,
    height: 64,
  },
  phoneTextContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 0,
    paddingHorizontal: 8,
  },
  phoneTextInput: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    height: 60,
  },
  phoneCodeText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  phoneFlagButton: {
    width: 70,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  phoneCountryPicker: {
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
});
