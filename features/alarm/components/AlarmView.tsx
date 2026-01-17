/**
 * Alarm view presentational component
 * Pure UI component that accepts computed props and handlers
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import Animated from 'react-native-reanimated';
import { AppColors } from '@/constants/theme';

interface AlarmViewProps {
  currentTime: Date;
  medicationName: string;
  dosage: string;
  onTaken: () => void;
  onSnooze: () => void;
  animatedButtonStyle: Record<string, unknown>;
}

export function AlarmView({
  currentTime,
  medicationName,
  dosage,
  onTaken,
  onSnooze,
  animatedButtonStyle,
}: AlarmViewProps) {
  const formatTime = (date: Date): string => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    return `${displayHours}:${displayMinutes} ${ampm}`;
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <View style={styles.container}>
      {/* Top Section - Clock */}
      <View style={styles.topSection}>
        <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
        <Text style={styles.dateText}>{formatDate(currentTime)}</Text>
      </View>

      {/* Middle Section - Medication Info */}
      <View style={styles.middleSection}>
        <View style={styles.pillIconContainer}>
          <FontAwesome6 name="pills" size={80} color={AppColors.primaryLight} />
        </View>
        
        <Text style={styles.alertLabel}>MEDICATION REMINDER</Text>
        <Text style={styles.medicationName}>{medicationName || 'Medication'}</Text>
        <Text style={styles.dosageText}>{dosage || 'Take as directed'}</Text>
      </View>

      {/* Bottom Section - Action Buttons */}
      <View style={styles.bottomSection}>
        <Pressable
          onPress={onSnooze}
          style={({ pressed }) => [
            styles.snoozeButton,
            pressed && styles.snoozeButtonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Snooze reminder"
        >
          <FontAwesome6 name="clock-rotate-left" size={24} color={AppColors.danger} />
          <Text style={styles.snoozeButtonText}>SNOOZE</Text>
        </Pressable>

        <Animated.View style={animatedButtonStyle}>
          <Pressable
            onPress={onTaken}
            style={({ pressed }) => [
              styles.takenButton,
              pressed && styles.takenButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Mark medication as taken"
          >
            <FontAwesome6 name="check" size={32} color={AppColors.textLight} />
            <Text style={styles.takenButtonText}>I TOOK IT</Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    paddingHorizontal: 24,
    paddingVertical: 48,
    justifyContent: 'space-between',
  },
  topSection: {
    alignItems: 'center',
    paddingTop: 40,
  },
  timeText: {
    fontSize: 64,
    fontWeight: '200',
    color: AppColors.textLight,
    letterSpacing: 2,
  },
  dateText: {
    fontSize: 18,
    fontWeight: '500',
    color: AppColors.textGray,
    marginTop: 8,
  },
  middleSection: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  pillIconContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(20, 184, 166, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  alertLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: AppColors.textGray,
    letterSpacing: 3,
    marginBottom: 12,
  },
  medicationName: {
    fontSize: 36,
    fontWeight: '800',
    color: AppColors.primaryLight,
    textAlign: 'center',
    marginBottom: 12,
  },
  dosageText: {
    fontSize: 22,
    fontWeight: '600',
    color: AppColors.textMuted,
    textAlign: 'center',
  },
  bottomSection: {
    paddingBottom: 40,
    gap: 20,
  },
  snoozeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: AppColors.danger,
    backgroundColor: 'transparent',
  },
  snoozeButtonPressed: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  snoozeButtonText: {
    fontSize: 20,
    fontWeight: '800',
    color: AppColors.danger,
    letterSpacing: 2,
  },
  takenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 24,
    paddingHorizontal: 40,
    borderRadius: 50,
    backgroundColor: AppColors.success,
    shadowColor: AppColors.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  takenButtonPressed: {
    backgroundColor: AppColors.successDark,
  },
  takenButtonText: {
    fontSize: 24,
    fontWeight: '900',
    color: AppColors.textLight,
    letterSpacing: 2,
  },
});
