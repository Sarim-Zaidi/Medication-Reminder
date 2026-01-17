# Duplicate Alarm Fix - Implementation Summary

## Problem
Multiple alarm screens and sound instances were triggering simultaneously, causing:
- Duplicate alarm screens stacking in navigation
- Multiple audio instances playing over each other
- Sound continuing after clicking "I Took It"

## Root Causes
1. **Two triggers competing**: `useForegroundAlarm` AND notification listener both navigating to alarm
2. **No global lock**: Multiple alarms could trigger before first one closed
3. **Navigation stacking**: Using `router.push` stacked alarm screens
4. **Multiple sound instances**: Each alarm screen created its own Audio.Sound instance
5. **Lock not released**: Alarm lock wasn't reset when dismissing alarm

## Solutions Implemented

### 1. ✅ Singleton Alarm Sound Manager
**File:** `lib/AlarmSoundManager.ts`

- Created singleton class to manage ONE audio instance globally
- Prevents multiple sound instances from playing simultaneously
- Auto-rejects duplicate start requests if already playing
- Centralized stop/start logic

```typescript
alarmSoundManager.start();  // Only one instance can play
alarmSoundManager.stop();   // Stops the singleton
```

---

### 2. ✅ Global Alarm Lock (AlarmContext)
**File:** `contexts/AlarmContext.tsx`

- Global state tracking if alarm is active
- `activateAlarm()` returns false if lock already held
- `deactivateAlarm()` releases the lock
- Only ONE alarm can be active at a time

```typescript
const { isAlarmActive, activateAlarm, deactivateAlarm } = useAlarm();

if (activateAlarm(medicationId)) {
  // Lock acquired - proceed with alarm
} else {
  // Lock held - skip this alarm
}
```

---

### 3. ✅ Disabled Notification Auto-Navigation
**File:** `app/_layout.tsx`

- **BEFORE:** Notification listener called `enqueueAlarmNavigation()`
- **AFTER:** Notification listener only logs (navigation disabled)
- **PRIMARY TRIGGER:** `useForegroundAlarm` (checks every 1 second)

**Why:** Prevents race condition where both triggers navigate simultaneously

---

### 4. ✅ Route Guard in useForegroundAlarm
**File:** `hooks/useForegroundAlarm.ts`

**Guards added:**
```typescript
// Guard 1: Already on alarm screen
if (pathname === '/alarm') return;

// Guard 2: Alarm lock already held
if (isAlarmActive) return;

// Guard 3: Try to acquire lock
const lockAcquired = activateAlarm(medicationId);
if (!lockAcquired) return;
```

**Navigation changed:**
```typescript
// BEFORE
router.push({ pathname: '/alarm', params: {...} });

// AFTER
router.replace({ pathname: '/alarm', params: {...} });
```

**Why `replace`:** Prevents stacking multiple /alarm screens in navigation history

---

### 5. ✅ Lock Release in Alarm Actions
**File:** `features/alarm/hooks/useAlarmActions.ts`

**Updated both handlers:**
```typescript
const handleTaken = async () => {
  await stopSound();           // Stop audio
  await stopSpeech();          // Stop TTS
  deactivateAlarm();          // CRITICAL: Release lock
  // ... rest of logic
};

const handleSnooze = async () => {
  await stopSound();           // Stop audio
  await stopSpeech();          // Stop TTS  
  deactivateAlarm();          // CRITICAL: Release lock
  // ... rest of logic
};
```

**Why:** Ensures lock is released so next alarm can trigger

---

### 6. ✅ Simplified useAlarmSound Hook
**File:** `features/alarm/hooks/useAlarmSound.ts`

**BEFORE:** 120+ lines managing Audio.Sound directly
**AFTER:** 24 lines using singleton

```typescript
export function useAlarmSound() {
  useEffect(() => {
    alarmSoundManager.start();
    return () => alarmSoundManager.stop();
  }, []);

  return { 
    stopSound: () => alarmSoundManager.stop() 
  };
}
```

**Benefits:**
- No multiple instances possible
- Centralized audio management
- Simpler component code

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     App Layout                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ AlarmProvider (Global Lock)                      │  │
│  │  ┌────────────────────────────────────────────┐  │  │
│  │  │ useForegroundAlarm (PRIMARY TRIGGER)      │  │  │
│  │  │  - Checks every 1 second                   │  │  │
│  │  │  - Guards: pathname, isAlarmActive         │  │  │
│  │  │  - Acquires lock before navigating         │  │  │
│  │  │  - Uses router.replace (not push)          │  │  │
│  │  └────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↓
              router.replace('/alarm')
                          ↓
┌─────────────────────────────────────────────────────────┐
│                  Alarm Screen                           │
│  ┌──────────────────────────────────────────────────┐  │
│  │ useAlarmSound()                                  │  │
│  │   → alarmSoundManager.start() (SINGLETON)       │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ useAlarmSpeech() → TTS (separate)               │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ User clicks "I Took It" or "Snooze"             │  │
│  │   → stopSound()                                  │  │
│  │   → stopSpeech()                                 │  │
│  │   → deactivateAlarm() ← RELEASES LOCK           │  │
│  │   → router.replace('/tabs')                     │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Testing Checklist

### ✅ Test 1: Single Alarm Trigger
**Steps:**
1. Set a medication for 1 minute from now
2. Keep app in foreground
3. Wait for alarm

**Expected:**
- ✅ Only ONE "Alarm sound started (singleton instance)" log
- ✅ Only ONE "Foreground alarm triggered (lock acquired)" log
- ✅ Alarm screen appears once
- ✅ Sound plays continuously without overlapping

---

### ✅ Test 2: Immediate Stop
**Steps:**
1. Trigger alarm
2. Click "I Took It" immediately

**Expected:**
- ✅ Sound stops **instantly**
- ✅ "Alarm lock released" log appears
- ✅ Returns to home screen
- ✅ **No sound continues playing**

---

### ✅ Test 3: Multiple Medications Same Time
**Steps:**
1. Set 3 medications for same time
2. Wait for trigger

**Expected:**
- ✅ Only ONE alarm triggers (first one found)
- ✅ Other alarms blocked by lock
- ✅ Logs show "Alarm already active - skipping trigger check"

---

### ✅ Test 4: Back-to-Back Alarms
**Steps:**
1. Trigger alarm
2. Click "I Took It"
3. Immediately trigger another alarm (within 2 seconds)

**Expected:**
- ✅ First alarm dismisses properly
- ✅ Lock is released
- ✅ Second alarm can trigger
- ✅ No sound overlap

---

### ✅ Test 5: Snooze Behavior
**Steps:**
1. Trigger alarm
2. Click "Snooze"

**Expected:**
- ✅ Sound stops immediately
- ✅ Lock is released
- ✅ Returns to home
- ✅ Next alarm can trigger

---

## Files Changed

### Created:
1. `lib/AlarmSoundManager.ts` - Singleton sound manager
2. `contexts/AlarmContext.tsx` - Global alarm lock
3. `DUPLICATE_ALARM_FIX.md` - This document

### Modified:
1. `app/_layout.tsx` - Added AlarmProvider, disabled notification auto-nav
2. `hooks/useForegroundAlarm.ts` - Added lock checks, changed to replace
3. `features/alarm/hooks/useAlarmSound.ts` - Simplified to use singleton
4. `features/alarm/hooks/useAlarmActions.ts` - Added lock release

---

## Key Takeaways

### ✅ DO:
- Use singleton for global resources (audio)
- Use global lock for mutually exclusive operations
- Guard navigation to prevent duplicates
- Use `router.replace` for modal-like screens
- Release locks in ALL code paths (success + error)

### ❌ DON'T:
- Have multiple triggers navigating to same screen
- Create multiple instances of same resource
- Use `router.push` for alarm screens
- Forget to release locks on dismiss
- Allow navigation if already on target route

---

## Logs to Watch

### **Success Pattern:**
```
Foreground alarm triggered (lock acquired) { medicationId: "xyz" }
Alarm sound started (singleton instance)
User clicked I Took It - stopping alarm...
Sound and speech stopped
Alarm lock released
Alarm sound stopped and unloaded (singleton)
```

### **Duplicate Blocked (Good):**
```
Alarm already active - skipping trigger check
```

### **Warning (Investigate):**
```
Alarm sound already playing - ignoring duplicate start request
```

---

## Performance Impact

- **Memory:** Reduced (only one Audio.Sound instance)
- **CPU:** Minimal (lock check is O(1))
- **Navigation:** Improved (no stack buildup)
- **Audio Quality:** Better (no overlapping)

---

## Future Improvements

1. **Auto-snooze timer**: Alarm auto-dismisses after X minutes
2. **Priority queuing**: If multiple alarms due, queue them
3. **Persistent lock**: Survive app restart (SQLite)
4. **Analytics**: Track alarm dismiss rates
5. **Custom intervals**: Different repeat intervals per medication

---

## Rollback Plan

If issues occur:

1. Revert `lib/AlarmSoundManager.ts` changes
2. Restore original `useAlarmSound.ts`
3. Re-enable notification auto-navigation in `_layout.tsx`
4. Remove AlarmProvider and AlarmContext
5. Change `router.replace` back to `router.push`

Git tags for rollback:
- `before-singleton-audio`
- `before-alarm-lock`
