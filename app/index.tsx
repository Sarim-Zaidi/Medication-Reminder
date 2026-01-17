import React from 'react';
import { Redirect } from 'expo-router';

// Note: Notifee background events are registered via `lib/notifications` (loaded on app start).

export default function Index() {
  return <Redirect href="/(tabs)" />;
}
