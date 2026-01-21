/**
 * HomeScreen container
 * Orchestrates hooks and renders the Home component
 * Handles profile check for missing name (new users)
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useMedication } from '@/contexts/MedicationContext';
import { useMedicationActions } from '@/features/medications/hooks/useMedicationActions';
import { supabase } from '@/lib/supabase';
import Home from '@/components/Home';
import { ROUTES } from '@/constants/config';

export function HomeScreen() {
  const { medications } = useMedication();
  const { toggleTaken, deleteMedication } = useMedicationActions();

  // Profile state
  const [loading, setLoading] = useState(true);
  const [profileComplete, setProfileComplete] = useState(false);
  const [fullName, setFullName] = useState('');
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userPhone, setUserPhone] = useState<string | null>(null);

  useEffect(() => {
    checkProfile();
  }, []);

  async function checkProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // No user - layout will handle redirect to auth
        setLoading(false);
        return;
      }

      setUserId(user.id);
      setUserPhone(user.phone || null);

      const { data, error } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking profile:', error);
      }

      if (data?.full_name) {
        setProfileComplete(true);
      } else {
        setProfileComplete(false);
      }
    } catch (error) {
      console.error('Exception checking profile:', error);
      // On error, assume profile needs completion
      setProfileComplete(false);
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile() {
    if (!fullName.trim() || fullName.trim().length < 2) {
      Alert.alert('Error', 'Please enter your name (at least 2 characters)');
      return;
    }

    if (!userId) {
      Alert.alert('Error', 'User not found. Please try logging in again.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').upsert({
        id: userId,
        full_name: fullName.trim(),
        phone_number: userPhone,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        console.error('Error saving profile:', error);
        Alert.alert('Error', 'Failed to save your name. Please try again.');
        return;
      }

      setProfileComplete(true);
    } catch (error) {
      console.error('Exception saving profile:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const handleAddClick = () => {
    router.push(ROUTES.ADD_MEDICATION);
  };

  // Scenario A: Loading
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#0d9488" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  // Scenario B: Profile Missing - Show Setup Screen
  if (!profileComplete) {
    return (
      <View style={styles.setupContainer}>
        <View style={styles.setupCard}>
          <Text style={styles.setupTitle}>Welcome!</Text>
          <Text style={styles.setupAppName}>Senior Pill</Text>
          <Text style={styles.setupSubtitle}>
            Let&apos;s get you set up. What should we call you?
          </Text>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Your Name</Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Enter your name"
              placeholderTextColor="#64748b"
              style={styles.input}
              autoCapitalize="words"
              autoCorrect={false}
              autoComplete="name"
              returnKeyType="done"
              onSubmitEditing={saveProfile}
              editable={!saving}
            />
          </View>

          <Pressable
            onPress={saveProfile}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveButton,
              saving && styles.saveButtonDisabled,
              !saving && pressed && styles.saveButtonPressed,
            ]}
          >
            <Text style={styles.saveButtonText}>
              {saving ? 'Saving...' : 'Get Started'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Scenario C: Profile Complete - Show Main Dashboard
  return (
    <Home
      meds={medications}
      onToggleMed={toggleTaken}
      onDeleteMed={deleteMedication}
      onAddClick={handleAddClick}
    />
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f4',
    gap: 16,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#64748b',
  },
  setupContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f4',
    padding: 24,
  },
  setupCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    alignItems: 'center',
    gap: 12,
  },
  setupTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#475569',
  },
  setupAppName: {
    fontSize: 36,
    fontWeight: '900',
    color: '#0d9488',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  setupSubtitle: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 26,
  },
  inputContainer: {
    width: '100%',
    marginTop: 16,
    gap: 10,
  },
  inputLabel: {
    marginLeft: 4,
    fontSize: 16,
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderWidth: 2,
    borderColor: '#CBD5E1',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 14,
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  saveButton: {
    width: '100%',
    marginTop: 16,
    backgroundColor: '#0d9488',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonPressed: {
    opacity: 0.9,
  },
  saveButtonDisabled: {
    backgroundColor: '#CBD5E1',
  },
  saveButtonText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
