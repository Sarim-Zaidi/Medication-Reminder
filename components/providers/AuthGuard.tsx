/**
 * Authentication guard component
 * Extracted from app/_layout.tsx for better separation of concerns
 */

import React, { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import AuthScreen from '@/app/auth';
import { AppColors } from '@/constants/theme';

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={AppColors.primary} />
      </View>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: AppColors.backgroundLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
