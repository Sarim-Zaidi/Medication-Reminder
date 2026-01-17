# Medication Alarm System

## How It Works

Your app has **two mechanisms** to trigger alarms:

### 1. **Foreground Alarm Checker** (Primary - Automatic)
- Checks **every 1 second** for due medications
- **Automatically opens alarm screen** when medication time hits
- **Works in these scenarios:**
  - ✅ App is open and visible
  - ✅ App is minimized (in recent apps)
  - ❌ **Does NOT work** when app is force-closed or removed from recent apps

### 2. **Scheduled Notifications** (Backup - Requires Tap)
- Scheduled daily for each medication
- Sends notification at exact time
- **Requires user tap** to open alarm screen (Android limitation)
- Works even if app is closed

---

## ✅ Best Experience - Alarm Pops Up Automatically

**For the alarm to pop up automatically without touching anything:**

### **Keep the app running in background**
1. Open the app
2. Press home button (don't swipe away the app)
3. The app stays in recent apps list
4. When medication time hits → **Alarm pops up automatically** 🔔

### **Disable Battery Optimization (IMPORTANT)**
Android kills background apps to save battery. To prevent this:

1. Go to: **Settings → Apps → Medication Reminder**
2. Tap: **Battery → Unrestricted**
3. Or: **Settings → Battery → Battery Optimization → Select app → Don't optimize**

Without this, Android will kill the app and alarms won't auto-pop.

---

## 🔔 What Happens When Alarm Triggers

### When App is Running (Best Experience):
1. ✅ Alarm screen **pops up automatically** (full screen)
2. ✅ Custom alert sound plays **continuously** in a loop
3. ✅ Text-to-speech announces medication **twice**
4. ✅ Vibration pattern triggers
5. ✅ User must tap "I Took It" or "Snooze" to stop alarm

### When App is Closed/Killed:
1. ⚠️ Notification appears in notification tray
2. ⚠️ User must **tap notification** to open alarm
3. ✅ Once opened, sound + speech + vibration work normally

---

## 📱 Android Permissions Required

Already configured in your app:
- ✅ `USE_FULL_SCREEN_INTENT` - Shows alarm over lock screen
- ✅ `SCHEDULE_EXACT_ALARM` - Precise timing for medications
- ✅ `WAKE_LOCK` - Keeps screen on during alarm
- ✅ `POST_NOTIFICATIONS` - Send notifications
- ✅ `VIBRATE` - Vibration patterns

---

## 🎵 Audio Behavior

**Location:** `assets/custom_alert.wav`

**Playback:**
- Loops continuously until dismissed
- Plays at maximum volume
- Works even in silent mode (iOS)
- Stops when user taps "I Took It" or "Snooze"

---

## 🔧 Technical Details

### Alarm Check Interval
- **Frequency:** Every 1 second (CHECK_INTERVAL_MS = 1000)
- **Location:** `hooks/useForegroundAlarm.ts`
- **Deduplication:** Each alarm triggers only once per minute

### Notification Configuration
- **Channel:** `medication-channel-FINAL-V4`
- **Importance:** MAX (highest priority)
- **Category:** `alarm` (enables full-screen intent)
- **Sound:** `custom_alert` (without extension)
- **Priority:** AndroidNotificationPriority.MAX

### Reset Logic (3 AM)
- **00:00 - 02:59:** Yesterday's missed meds show as "MISSED"
- **03:00 onwards:** All medications reset for new day

---

## 🐛 Troubleshooting

### Alarm doesn't pop up automatically:
1. **Check if app is in recent apps** (not force-closed)
2. **Disable battery optimization** (see above)
3. **Ensure notification permissions granted**
4. **Check app isn't in deep sleep mode**

### No sound playing:
1. **Check volume is up**
2. **Verify `custom_alert.wav` exists in `assets/` folder**
3. **Check app has audio permissions**

### Alarm triggers late:
1. **Battery optimization might be delaying checks**
2. **Android may batch alarms to save battery**
3. **Disable optimization for this app**

---

## 🚀 Recommended User Instructions

**For best results, tell users:**

> **Important:** Keep the app running in the background for automatic alarms!
> 
> 1. Don't swipe the app away from recent apps
> 2. Go to Settings → Apps → Medication Reminder → Battery → Unrestricted
> 3. When medication time comes, the alarm will pop up automatically
> 4. You don't need to tap any notification - it just appears!

---

## 🔮 Future Improvements (Require Native Code)

To achieve true "always works" automatic alarms even when app is killed:

1. **Foreground Service** - Keeps app alive permanently
2. **Native AlarmManager** - Android native alarm system
3. **React Native Module** - Custom native implementation

These require expo-dev-client and custom native modules.
