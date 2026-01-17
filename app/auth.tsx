import { useAuth } from '@/contexts/AuthContext';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Step = 'email' | 'otp';

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
    
    // Email errors
    if (message.includes('email') && message.includes('invalid')) {
      return 'Please enter a valid email address.';
    }
    
    return error.message || 'Something went wrong. Please try again or contact support.';
  }
  
  // Generic fallback for non-Error types
  return 'Something went wrong. Please try again or contact support.';
}

export default function AuthScreen() {
  const { sendOTP, verifyOTP } = useAuth();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Synchronous locks to prevent double-submit race conditions
  const sendingRef = useRef(false);
  const verifyingRef = useRef(false);
  
  // Cancellation flag to prevent unmounted setState
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleSendOTP = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    // Prevent double-submit with synchronous lock
    if (sendingRef.current) return;
    sendingRef.current = true;

    setLoading(true);
    try {
      const { error } = await sendOTP(email.trim());

      if (!isMountedRef.current) return;

      if (error) {
        Alert.alert('Error', getUserFriendlyError(error));
        return;
      }

      setStep('otp');
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
    if (!otp.trim() || otp.trim().length <= 5) {
      Alert.alert('Error', 'Please enter your verification code');
      return;
    }

    // Prevent double-submit with synchronous lock
    if (verifyingRef.current) return;
    verifyingRef.current = true;

    setLoading(true);
    try {
      const { error } = await verifyOTP(email.trim(), otp.trim());

      if (!isMountedRef.current) return;

      if (error) {
        Alert.alert('Error', getUserFriendlyError(error));
        return;
      }

      router.replace('/');
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

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Welcome to</Text>
            <Text style={styles.appName}>Senior Pill</Text>
            <Text style={styles.subtitle}>
              Enter your email to save your medications securely.
            </Text>
          </View>

          {step === 'email' ? (
            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={styles.label}>Your Email</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="youremail@example.com"
                  placeholderTextColor="#64748b"
                  style={styles.input}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  returnKeyType="done"
                  onSubmitEditing={handleSendOTP}
                  editable={!loading}
                  accessibilityLabel="Email address input"
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
                  {loading ? 'Sending...' : 'Send Magic Code'}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.form}>
              <View style={styles.emailSentBox}>
                <Text style={styles.emailSentText}>
                  We sent a code to:
                </Text>
                <Text style={styles.emailSentEmail}>{email}</Text>
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
                  setStep('email');
                  setOtp('');
                }}
                disabled={loading}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryButtonText}>Change Email</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
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
    padding: 24,
    paddingTop: 60,
    gap: 32,
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
});
