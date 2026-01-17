import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { isMedicationMissed } from '@/features/medications/utils/time';

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  time: string; // HH:mm
  isTaken: boolean;
}

interface HomeProps {
  meds: Medication[];
  onToggleMed: (id: string) => void;
  onDeleteMed: (id: string) => void;
  onAddClick: () => void;
  onTestAlarm?: () => void;
}

// Helper function to get consistent pastel color based on medicine name
function getColorForName(name: string): string {
  // Hash the name to get a consistent number
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Array of vibrant pastel colors (NO BLUE)
  const colors = [
    '#FECACA', // Soft Red
    '#FED7AA', // Warm Orange
    '#FDE68A', // Soft Yellow
    '#D9F99D', // Light Lime
    '#A7F3D0', // Mint Green
    '#A5F3FC', // Teal
    '#DDD6FE', // Pastel Purple
    '#FBCFE8', // Pink
    '#FCA5A5', // Coral
    '#FCD34D', // Golden
  ];
  
  // Use absolute value of hash to pick a color
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

// Helper function to get first letter of medicine name
function getInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

// Helper function to get greeting based on time of day
function getGreeting(): { text: string; emoji: string } {
  const hour = new Date().getHours();
  
  if (hour >= 5 && hour < 12) {
    return { text: 'Good Morning', emoji: '🌅' };
  } else if (hour >= 12 && hour < 17) {
    return { text: 'Good Afternoon', emoji: '☀️' };
  } else if (hour >= 17 && hour < 21) {
    return { text: 'Good Evening', emoji: '🌇' };
  } else {
    return { text: 'Good Night', emoji: '🌙' };
  }
}

type TimePeriod = 'Morning' | 'Afternoon' | 'Evening';

// Helper function to get time period from HH:mm string
function getTimePeriod(timeString: string): TimePeriod {
  const hour = parseInt(timeString.split(':')[0], 10);
  
  if (hour >= 5 && hour < 12) {
    return 'Morning';
  } else if (hour >= 12 && hour < 17) {
    return 'Afternoon';
  } else {
    return 'Evening';
  }
}

// Helper function to get current time period
function getCurrentTimePeriod(): TimePeriod {
  const hour = new Date().getHours();
  
  if (hour >= 5 && hour < 12) {
    return 'Morning';
  } else if (hour >= 12 && hour < 17) {
    return 'Afternoon';
  } else {
    return 'Evening';
  }
}

// Helper function to convert 24-hour time to 12-hour AM/PM format
function formatTo12Hour(time: string): string {
  const [hourStr, minuteStr] = time.split(':');
  const hour = parseInt(hourStr, 10);
  const minute = minuteStr;
  
  if (hour === 0) {
    return `12:${minute} AM`;
  } else if (hour < 12) {
    return `${hour.toString().padStart(2, '0')}:${minute} AM`;
  } else if (hour === 12) {
    return `12:${minute} PM`;
  } else {
    return `${(hour - 12).toString().padStart(2, '0')}:${minute} PM`;
  }
}

export default function Home({ meds, onToggleMed, onDeleteMed, onAddClick, onTestAlarm }: HomeProps) {
  const [activeTab, setActiveTab] = useState<TimePeriod>(getCurrentTimePeriod);

  const nextMed = useMemo(() => {
    const untaken = meds.filter((m) => !m.isTaken);
    if (untaken.length === 0) return null;
    
    // First, check for missed pills (past time and not taken)
    const missed = untaken.filter((m) => isMedicationMissed(m.time, m.isTaken));
    if (missed.length > 0) {
      // Return earliest missed pill
      return missed.reduce((prev, curr) => (curr.time < prev.time ? curr : prev));
    }
    
    // If no missed pills, return next upcoming pill
    return untaken.reduce((prev, curr) => (curr.time < prev.time ? curr : prev));
  }, [meds]);

  const isHeroMissed = useMemo(() => {
    if (!nextMed) return false;
    return isMedicationMissed(nextMed.time, nextMed.isTaken);
  }, [nextMed]);

  const displayedMedications = useMemo(() => {
    return meds
      .filter((med) => getTimePeriod(med.time) === activeTab)
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [meds, activeTab]);

  const progressStats = useMemo(() => {
    const taken = meds.filter((m) => m.isTaken).length;
    const total = meds.length;
    const percentage = total > 0 ? (taken / total) * 100 : 0;
    return { taken, total, percentage };
  }, [meds]);

  const greeting = useMemo(() => getGreeting(), []);

  const todayLabel = useMemo(() => {
    try {
      return new Date().toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return new Date().toDateString();
    }
  }, []);

  const renderHeader = () => (
    <>
      <View style={styles.heroSection}>
        <View style={styles.header}>
          <View style={styles.greetingSection}>
            <Text style={styles.greetingText}>
              {greeting.text}! {greeting.emoji}
            </Text>
            <Text style={styles.progressText}>
              You have taken {progressStats.taken} of {progressStats.total} pills today
            </Text>
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBarFill, { width: `${progressStats.percentage}%` }]} />
            </View>
          </View>
          <View>
            <Text style={styles.dateText}>{todayLabel}</Text>
          </View>
        </View>

        {nextMed ? (
          <View style={[styles.nextCard, isHeroMissed && styles.nextCardMissed]}>
            <View style={[styles.upNextBadge, isHeroMissed && styles.missedHeroBadge]}>
              <Text style={[styles.upNextBadgeText, isHeroMissed && styles.missedHeroBadgeText]}>
                {isHeroMissed ? '⚠️ MISSED' : 'UP NEXT'}
              </Text>
            </View>
            <View style={styles.nextRow}>
              <View style={[styles.avatarBox, { backgroundColor: getColorForName(nextMed.name) }]}>
                <Text style={styles.avatarLetter}>{getInitial(nextMed.name)}</Text>
              </View>
              <View style={styles.nextLeft}>
                <Text style={styles.nextName}>{nextMed.name}</Text>
                <Text style={styles.nextDose}>{nextMed.dosage}</Text>
              </View>
              <View>
                <Text style={[styles.nextTime, isHeroMissed && styles.nextTimeMissed]}>
                  {formatTo12Hour(nextMed.time)}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => onToggleMed(nextMed.id)}
              style={({ pressed }) => [
                styles.primaryButton,
                isHeroMissed && styles.primaryButtonMissed,
                pressed && styles.primaryButtonPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Mark medication as taken"
            >
              <FontAwesome6 name="circle-check" size={20} color="#FFFFFF" solid />
              <Text style={styles.primaryButtonText}>I took this pill</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.caughtUpCard}>
            <FontAwesome6 name="circle-check" size={40} color="#34d399" />
            <Text style={styles.caughtUpTitle}>All caught up!</Text>
            <Text style={styles.caughtUpSubtitle}>No more pills scheduled for today.</Text>
          </View>
        )}
      </View>

      <View style={styles.listSectionHeader}>
        <Text style={styles.sectionTitle}>Today&apos;s Schedule</Text>
        <View style={styles.tabContainer}>
          {(['Morning', 'Afternoon', 'Evening'] as TimePeriod[]).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[
                styles.tabButton,
                activeTab === tab && styles.tabButtonActive,
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === tab }}
            >
              <Text
                style={[
                  styles.tabButtonText,
                  activeTab === tab && styles.tabButtonTextActive,
                ]}
              >
                {tab}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </>
  );

  const renderItem = ({ item: med }: { item: Medication }) => {
    const isTaken = med.isTaken;
    const isMissed = isMedicationMissed(med.time, med.isTaken);
    
    const handleDelete = () => {
      Alert.alert(
        'Delete Medication?',
        'Are you sure you want to remove this reminder?',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Yes, Delete',
            style: 'destructive',
            onPress: () => onDeleteMed(med.id),
          },
        ],
        { cancelable: true }
      );
    };

    return (
      <View
        style={[
          styles.itemRow,
          isTaken ? styles.itemRowTaken : (isMissed ? styles.itemRowMissed : styles.itemRowActive),
        ]}
      >
        {isMissed && (
          <View style={styles.missedBadge}>
            <Text style={styles.missedBadgeText}>MISSED</Text>
          </View>
        )}
        <View style={[styles.avatarBoxSmall, { backgroundColor: getColorForName(med.name) }]}>
          <Text style={styles.avatarLetterSmall}>{getInitial(med.name)}</Text>
        </View>
        
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onToggleMed(med.id);
          }}
          style={({ pressed }) => [
            styles.checkButton,
            isTaken ? styles.checkButtonTaken : styles.checkButtonUntaken,
            pressed && styles.checkButtonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={isTaken ? `Mark ${med.name} as not taken` : `Mark ${med.name} as taken`}
        >
          {isTaken ? (
            <FontAwesome6 name="check" size={22} color="#ffffff" />
          ) : (
            <View style={styles.untakenDot} />
          )}
        </Pressable>

        <View style={styles.itemBody}>
          <View style={styles.itemTopRow}>
            <Text style={[styles.itemName, isTaken && styles.itemNameTaken]} numberOfLines={1}>
              {med.name}
            </Text>
            <Text style={styles.itemTime}>{formatTo12Hour(med.time)}</Text>
          </View>

          <View style={styles.itemBottomRow}>
            <Text style={styles.itemDose} numberOfLines={1}>
              {med.dosage}
            </Text>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              style={({ pressed }) => [styles.trashButton, pressed && styles.trashButtonPressed]}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${med.name}`}
            >
              <FontAwesome6 name="trash-can" size={24} color="#dc2626" />
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyBox}>
      <Text style={styles.emptyText}>No meds this {activeTab}</Text>
    </View>
  );

  return (
    <View style={styles.screenContainer}>
      <FlatList
        data={displayedMedications}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.container}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      />

      <View style={styles.bottomButtonsContainer}>
        {onTestAlarm && (
          <Pressable
            onPress={onTestAlarm}
            style={({ pressed }) => [styles.testAlarmButton, pressed && styles.testAlarmButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel="Test alarm in 5 seconds"
          >
            <FontAwesome6 name="bell" size={18} color="#FFFFFF" />
          </Pressable>
        )}
        <Pressable
          onPress={onAddClick}
          style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel="Add new reminder"
        >
          <FontAwesome6 name="plus" size={18} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Add New Reminder</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: '#f5f5f4',
  },
  container: {
    paddingBottom: 100,
    backgroundColor: '#f5f5f4',
  },
  heroSection: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 5,
    marginBottom: 20,
  },
  listSection: {
    paddingHorizontal: 20,
    gap: 12,
  },
  listSectionHeader: {
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 16,
    padding: 4,
    marginTop: 12,
  },
  tabButton: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#0f766e',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tabButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4b5563',
  },
  tabButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: 8,
    marginBottom: 20,
  },
  greetingSection: {
    flex: 1,
    gap: 8,
  },
  greetingText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.3,
  },
  progressText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
    marginTop: 2,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#16A34A',
    borderRadius: 8,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 4,
  },
  nextCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden',
  },
  nextCardMissed: {
    backgroundColor: '#FEE2E2',
    borderWidth: 3,
    borderColor: '#DC2626',
  },
  upNextBadge: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  missedHeroBadge: {
    backgroundColor: '#DC2626',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingVertical: 12,
    paddingHorizontal: 0,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    marginBottom: 16,
    marginTop: -20,
    marginLeft: -20,
    marginRight: -20,
    width: 'auto',
  },
  upNextBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  missedHeroBadgeText: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  nextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  avatarBox: {
    width: 50,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 24,
    fontWeight: '900',
    color: '#1F2937',
  },
  avatarBoxSmall: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetterSmall: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1F2937',
  },
  nextLeft: {
    flex: 1,
  },
  nextName: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0F172A',
  },
  nextDose: {
    marginTop: 2,
    fontSize: 18,
    fontWeight: '800',
    color: '#475569',
  },
  nextTime: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0d9488',
  },
  nextTimeMissed: {
    color: '#DC2626',
  },
  primaryButton: {
    marginTop: 16,
    backgroundColor: '#ea580c',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: '#ea580c',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
  },
  primaryButtonMissed: {
    backgroundColor: '#dc2626',
    shadowColor: '#dc2626',
  },
  primaryButtonPressed: {
    backgroundColor: '#dc2626',
    opacity: 0.95,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  caughtUpCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  caughtUpTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
  },
  caughtUpSubtitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#374151',
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  emptyBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 20,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#475569',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 24,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    position: 'relative',
  },
  itemRowActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  itemRowTaken: {
    backgroundColor: '#DCFCE7',
    borderColor: '#166534',
  },
  itemRowMissed: {
    backgroundColor: '#FEF2F2',
    borderColor: '#DC2626',
  },
  missedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#DC2626',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    zIndex: 10,
  },
  missedBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  itemRowPressed: {
    opacity: 0.7,
  },
  checkButton: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkButtonTaken: {
    backgroundColor: '#16A34A',
  },
  checkButtonUntaken: {
    backgroundColor: '#E2E8F0',
    borderWidth: 2,
    borderColor: '#94A3B8',
  },
  checkButtonPressed: {
    opacity: 0.9,
  },
  untakenDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#475569',
  },
  itemBody: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  itemTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  itemName: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    flex: 1,
  },
  itemNameTaken: {
    textDecorationLine: 'line-through',
    color: '#166534',
  },
  itemTime: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
  },
  itemBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  itemDose: {
    fontSize: 18,
    fontWeight: '800',
    color: '#475569',
    flex: 1,
  },
  trashButton: {
    backgroundColor: '#fee2e2',
    padding: 12,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  trashButtonPressed: {
    backgroundColor: '#fecaca',
    opacity: 0.9,
  },
  bottomButtonsContainer: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    flexDirection: 'row',
    gap: 12,
    zIndex: 10,
  },
  testAlarmButton: {
    backgroundColor: '#f59e0b',
    borderRadius: 22,
    paddingVertical: 18,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  testAlarmButtonPressed: {
    backgroundColor: '#d97706',
  },
  addButton: {
    flex: 1,
    backgroundColor: '#0d9488',
    borderRadius: 22,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  addButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  addButtonText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
});
