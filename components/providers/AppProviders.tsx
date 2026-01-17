/**
 * Application providers wrapper
 * Centralizes all context providers for cleaner app/_layout.tsx
 */

import React, { ReactNode } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider } from '@/contexts/AuthContext';
import { MedicationProvider } from '@/contexts/MedicationContext';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <MedicationProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          {children}
        </ThemeProvider>
      </MedicationProvider>
    </AuthProvider>
  );
}
