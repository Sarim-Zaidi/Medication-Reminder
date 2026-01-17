import React from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { HomeScreen } from '@/features/medications/components/home/HomeScreen';
import { AppColors } from '@/constants/theme';

export default function HomeTabScreen() {
  // This is now a thin wrapper - all logic is in HomeScreen container
  // Navigation is wired here since it's route-specific
  return (
    <SafeAreaView style={styles.container}>
      <HomeScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.backgroundLight,
  },
});
