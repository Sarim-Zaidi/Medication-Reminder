import React from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';

interface PermissionBannerProps {
  visible: boolean;
  onDismiss?: () => void;
}

export default function PermissionBanner({ visible, onDismiss }: PermissionBannerProps) {
  if (!visible) return null;

  const handleOpenSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.banner}>
        <View style={styles.iconContainer}>
          <FontAwesome6 name="bell-slash" size={32} color="#DC2626" solid />
        </View>
        
        <View style={styles.content}>
          <Text style={styles.title}>Notifications Disabled</Text>
          <Text style={styles.description}>
            This app needs notification permissions to remind you about your medications. Without notifications, you will not receive medication reminders.
          </Text>
          
          <View style={styles.actions}>
            <Pressable
              onPress={handleOpenSettings}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
              accessibilityRole="button"
              accessibilityLabel="Open device settings"
            >
              <FontAwesome6 name="gear" size={16} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Open Settings</Text>
            </Pressable>
            
            {onDismiss && (
              <Pressable
                onPress={onDismiss}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
                accessibilityRole="button"
                accessibilityLabel="Dismiss banner"
              >
                <Text style={styles.secondaryButtonText}>Dismiss</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  banner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
    borderWidth: 2,
    borderColor: '#DC2626',
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 4,
  },
  content: {
    flex: 1,
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#DC2626',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  description: {
    fontSize: 16,
    fontWeight: '600',
    color: '#475569',
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'column',
    gap: 10,
    marginTop: 4,
  },
  primaryButton: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryButtonPressed: {
    opacity: 0.9,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonPressed: {
    opacity: 0.7,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
});
