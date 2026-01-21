import { useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { MedicationProvider } from '@/contexts/MedicationContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { requestNotificationPermissions, requestNotifeePermissions } from '@/lib/notifications';
import { logger } from '@/lib/logger';
import PermissionBanner from '@/components/PermissionBanner';
import AuthScreen from './auth';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0d9488" />
      </View>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  return <>{children}</>;
}

export const unstable_settings = {
  anchor: '(tabs)',
};

/**
 * Simplified notification observer - only handles permission requests.
 * All alarm/call logic is now server-side (schedule-batches cron job).
 */
function useNotificationObserver() {
  const [showPermissionBanner, setShowPermissionBanner] = useState(false);

  useEffect(() => {
    const initializeNotifications = async () => {
      // Request expo-notifications permissions (for iOS and fallback)
      const granted = await requestNotificationPermissions();
      
      // Also request Notifee permissions for Android
      if (Platform.OS === 'android') {
        await requestNotifeePermissions();
      }
      
      if (!granted) {
        logger.warn('Notification permissions denied, showing banner');
        setShowPermissionBanner(true);
      }
    };

    void initializeNotifications();
  }, []);

  return { showPermissionBanner, setShowPermissionBanner };
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { showPermissionBanner, setShowPermissionBanner } = useNotificationObserver();

  return (
    <AuthProvider>
      <MedicationProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <AuthGuard>
            <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen 
              name="add-medication" 
              options={{ 
                title: 'New Reminder',
                presentation: 'card',
                headerShown: false,
              }} 
            />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
            </Stack>
            <PermissionBanner
              visible={showPermissionBanner}
              onDismiss={() => setShowPermissionBanner(false)}
            />
          </AuthGuard>
          <StatusBar style="auto" />
        </ThemeProvider>
      </MedicationProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#f5f5f4',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
