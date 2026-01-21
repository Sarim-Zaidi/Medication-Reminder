import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { router } from 'expo-router';
import { useMedication } from '@/contexts/MedicationContext';
import { logger } from '@/lib/logger';

function isValidTime(value: string) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return Boolean(m);
}

export default function AddMedicationScreen() {
  const { addMedication } = useMedication();
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState(1);
  const [times, setTimes] = useState<string[]>(['08:00']);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const canSave = useMemo(() => {
    if (saving) return false;
    const allTimesValid = times.every((t) => isValidTime(t.trim()));
    return name.trim().length > 0 && dosage.trim().length > 0 && allTimesValid && times.length > 0;
  }, [name, dosage, times, saving]);

  const handleFrequencyChange = (delta: number) => {
    const newFrequency = Math.max(1, Math.min(5, frequency + delta));
    setFrequency(newFrequency);
    
    // Adjust times array
    if (newFrequency > times.length) {
      // Add new time slots with smart defaults
      const newTimes = [...times];
      while (newTimes.length < newFrequency) {
        // Suggest times spread throughout the day
        const defaultTimes = ['08:00', '13:00', '18:00', '21:00', '23:00'];
        newTimes.push(defaultTimes[newTimes.length] || '12:00');
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

  const handleSave = async () => {
    if (!canSave) return;
    
    // Prevent double-submit with synchronous lock
    if (savingRef.current) return;
    savingRef.current = true;
    
    setSaving(true);
    try {
      // This will create one database record for each time in the array
      // NOTE: Notifications/calls are now handled server-side by schedule-batches cron job
      await addMedication({
        name: name.trim(),
        dosage: dosage.trim(),
        times: times.map((t) => t.trim()),
      });
      
      router.back();
    } catch (error: any) {
      logger.error('Failed to save medication', error);
      
      // Check if this is a permission error
      const isPermissionError = error?.message?.includes('permission');
      
      Alert.alert(
        isPermissionError ? '⚠️ Notifications Disabled' : 'Save Failed',
        isPermissionError 
          ? 'Medication reminders require notification permissions. Please enable notifications in your device settings to receive alerts for your medications.'
          : (error?.message || 'Could not save your medication. Please try again.'),
        isPermissionError 
          ? [
              { text: 'Cancel', style: 'cancel' },
              { 
                text: 'Open Settings',
                onPress: () => {
                  if (Platform.OS === 'ios') {
                    Linking.openURL('app-settings:');
                  } else {
                    Linking.openSettings();
                  }
                }
              }
            ]
          : [{ text: 'OK' }]
      );
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.topRow}>
            <Pressable
              onPress={handleBack}
              style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <FontAwesome6 name="arrow-left" size={18} color="#0F172A" />
            </Pressable>
            <Text style={styles.title}>New Reminder</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Pill Name</Text>
              <TextInput
                autoFocus
                value={name}
                onChangeText={setName}
                placeholder="e.g. Heart Pill"
                placeholderTextColor="#64748b"
                style={styles.input}
                returnKeyType="next"
                accessibilityLabel="Medication name input"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Dosage</Text>
              <TextInput
                value={dosage}
                onChangeText={setDosage}
                placeholder="e.g. 1 Tablet"
                placeholderTextColor="#64748b"
                style={styles.input}
                returnKeyType="next"
                accessibilityLabel="Dosage input"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>How many times a day?</Text>
              <View style={styles.frequencyRow}>
                <Pressable
                  onPress={() => handleFrequencyChange(-1)}
                  disabled={frequency <= 1}
                  style={({ pressed }) => [
                    styles.frequencyButton,
                    frequency <= 1 && styles.frequencyButtonDisabled,
                    pressed && frequency > 1 && styles.frequencyButtonPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Decrease frequency"
                >
                  <FontAwesome6 name="minus" size={20} color={frequency <= 1 ? '#94a3b8' : '#0F172A'} />
                </Pressable>
                
                <View style={styles.frequencyValueContainer}>
                  <Text style={styles.frequencyValue}>{frequency}</Text>
                </View>
                
                <Pressable
                  onPress={() => handleFrequencyChange(1)}
                  disabled={frequency >= 5}
                  style={({ pressed }) => [
                    styles.frequencyButton,
                    frequency >= 5 && styles.frequencyButtonDisabled,
                    pressed && frequency < 5 && styles.frequencyButtonPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Increase frequency"
                >
                  <FontAwesome6 name="plus" size={20} color={frequency >= 5 ? '#94a3b8' : '#0F172A'} />
                </Pressable>
              </View>
            </View>

            {times.map((time, index) => (
              <View key={index} style={styles.field}>
                <Text style={styles.label}>Dose {index + 1} Time</Text>
                <TextInput
                  value={time}
                  onChangeText={(value) => handleTimeChange(index, value)}
                  placeholder="08:00"
                  placeholderTextColor="#64748b"
                  style={[styles.input, styles.timeInput]}
                  keyboardType="numbers-and-punctuation"
                  returnKeyType={index === times.length - 1 ? 'done' : 'next'}
                  maxLength={5}
                  accessibilityLabel={`Dose ${index + 1} time input, 24-hour format`}
                />
                {!isValidTime(time.trim()) && time.trim().length > 0 ? (
                  <Text style={styles.hint}>Use 24-hour time in HH:mm (e.g. 08:00)</Text>
                ) : null}
              </View>
            ))}

            <View style={styles.actions}>
              <Pressable
                onPress={handleBack}
                disabled={saving}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  saving && styles.secondaryButtonDisabled,
                  !saving && pressed && styles.secondaryButtonPressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ disabled: saving }}
              >
                <Text style={[styles.secondaryButtonText, saving && styles.secondaryButtonTextDisabled]}>
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                onPress={handleSave}
                disabled={!canSave || saving}
                style={({ pressed }) => [
                  styles.saveButton,
                  (!canSave || saving) && styles.saveButtonDisabled,
                  canSave && !saving && pressed && styles.saveButtonPressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSave || saving }}
              >
                {saving ? (
                  <View style={styles.saveButtonContent}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.saveButtonText}>Saving...</Text>
                  </View>
                ) : (
                  <Text style={[styles.saveButtonText, !canSave && styles.saveButtonTextDisabled]}>
                    Save Pill
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
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
    paddingTop: 28,
    gap: 18,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 6,
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonPressed: {
    opacity: 0.9,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  form: {
    gap: 18,
  },
  field: {
    gap: 8,
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  timeInput: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1,
  },
  hint: {
    marginLeft: 4,
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
  },
  frequencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  frequencyButton: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frequencyButtonDisabled: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
  },
  frequencyButtonPressed: {
    backgroundColor: '#E2E8F0',
  },
  frequencyValueContainer: {
    minWidth: 60,
    alignItems: 'center',
  },
  frequencyValue: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0F172A',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 8,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#ffe4e6',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonPressed: {
    backgroundColor: '#fecdd3',
    opacity: 0.95,
  },
  secondaryButtonDisabled: {
    backgroundColor: '#F3F4F6',
    opacity: 0.7,
  },
  secondaryButtonText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#be123c',
    textTransform: 'uppercase',
  },
  secondaryButtonTextDisabled: {
    color: '#9ca3af',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#0d9488',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonPressed: {
    opacity: 0.95,
  },
  saveButtonDisabled: {
    backgroundColor: '#CBD5E1',
  },
  saveButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  saveButtonTextDisabled: {
    color: '#64748b',
  },
});
