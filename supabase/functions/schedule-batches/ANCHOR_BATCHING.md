# Anchor-Based Batching Logic

## Overview
The `schedule-batches` function now uses **just-in-time anchor-based batching** to trigger medication reminder calls only when medications are actually due, rather than using fixed 30-minute lookahead windows.

## How It Works

### Database Schema
- **Table:** `medications` (single table, no logs table)
- **Status Column:** `is_taken` (boolean) - `false` means pending
- **Time Column:** `time` (text) - HH:MM format (24-hour), e.g., "08:00", "14:30"
- **Timezone:** Pakistan (Asia/Karachi)

### 1. Find Anchors (The Trigger)
**Query:** Find medications due RIGHT NOW (current time in HH:MM format)
```sql
SELECT * FROM medications
WHERE time = '08:00'  -- Current time in HH:MM format
  AND is_taken = false
```

**Purpose:** These are the "anchor" medications that trigger a call. If no anchors are found, the function exits early (no calls triggered).

**Time Conversion:** Uses Pakistan timezone to get current time:
```typescript
const nowTime = new Date().toLocaleTimeString('en-GB', {
  timeZone: 'Asia/Karachi',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
}); // Returns "08:00"
```

### 2. Sweep for Batch Items
**Query:** For each anchor user, find ALL their pending medications in the sweep window
```sql
-- Normal case (no midnight crossover)
SELECT * FROM medications
WHERE is_taken = false
  AND user_id IN (anchor_user_ids)
  AND time >= '08:00'  -- Current time
  AND time <= '08:30'  -- Current time + 30 minutes

-- Midnight crossover case (e.g., 23:50 to 00:20)
SELECT * FROM medications
WHERE is_taken = false
  AND user_id IN (anchor_user_ids)
  AND (time >= '23:50' OR time <= '00:20')
```

**Purpose:** Collect all medications for anchor users, including:
- The anchor medication itself
- Any other medications scheduled in the next 30 minutes

### 3. Trigger Batched Calls
**Action:** Make one call per user with all their medications in a natural list:
- "Please take Aspirin, Vitamin D, and Metformin"

---

## Example Scenarios

### Scenario 1: Normal Operation
**Setup:**
- User has medications at: 8:00 AM, 8:15 AM, 8:30 AM
- Cron runs at: 8:00:30 AM (30 seconds past 8)

**Execution:**
```
⚓ Finding anchor medications (due right now)...
⚓ Anchor breakdown: 1 medications from 1 users
🧹 Sweeping medications for 1 anchor users...
🧹 Found 3 total pending medications in sweep window
🧹 Sweep complete: 3 medications batched for 1 users
   User abc123: 3 meds (Aspirin, Vitamin D, Metformin)
📞 Triggering batch call for User abc123 with 3 meds
```

**Result:** User gets ONE call at 8:00 with all 3 medications

---

### Scenario 2: No Anchors (Nothing Due)
**Setup:**
- User has medications at: 9:00 AM, 10:00 AM
- Cron runs at: 8:30 AM

**Execution:**
```
⚓ Finding anchor medications (due right now)...
📭 No anchor medications found (nothing due right now)
```

**Result:** No calls triggered (nothing due RIGHT NOW)

---

### Scenario 3: User Doesn't Answer (Built-in Retry)
**Setup:**
- User has medication at: 8:00 AM
- Cron runs at: 8:00, user doesn't answer
- Medication stays 'pending'
- Cron runs again at: 8:01

**Execution:**
```
[8:00 run]
⚓ Found 1 anchor medications for 1 users
📞 Triggering batch call... (user doesn't answer)

[8:01 run]
⚓ Found 1 anchor medications for 1 users (same med, still pending)
📞 Triggering batch call... (retry)
```

**Result:** Natural retry behavior every minute until user answers

---

### Scenario 4: User Marks as Taken (Automatic Deduplication)
**Setup:**
- User has medications at: 8:00 AM, 8:15 AM
- Cron runs at: 8:00, user answers and marks taken
- IVR updates medication_logs status to 'taken'
- Cron runs at: 8:15

**Execution:**
```
[8:00 run]
⚓ Found 1 anchor (8:00 med)
🧹 Sweep finds: 8:00 med + 8:15 med
📞 Call triggered with both meds
(User marks 8:00 as taken via IVR)

[8:15 run]
⚓ Finding anchors...
⚓ Anchor breakdown: 1 medications from 1 users (only 8:15 med)
🧹 Sweep finds: only 8:15 med (8:00 is 'taken', excluded)
📞 Call triggered with 8:15 med only
```

**Result:** Meds marked as 'taken' are automatically excluded from future queries

---

## Benefits Over Previous Logic

1. **No Early Calls**: Only triggers when a med is actually due (not 30 mins early)
2. **Smart Batching**: Still groups nearby meds into one call
3. **Built-in Retry**: If user doesn't answer, next cron run will catch the same med
4. **Automatic Deduplication**: 'pending' status filter prevents duplicate calls for taken meds
5. **Performance**: Only processes users with anchors (not all users)
6. **Reduced Noise**: Users don't get calls for medications that aren't due yet

---

## Configuration

```typescript
const ANCHOR_WINDOW_MINUTES = 1;  // How far back to look for anchor meds (triggers)
const SWEEP_WINDOW_MINUTES = 30;  // How far ahead to sweep for upcoming meds
```

**Recommendation:** Keep `ANCHOR_WINDOW_MINUTES = 1` for precise timing. Increase `SWEEP_WINDOW_MINUTES` if you want to batch more medications together.

---

## Cron Schedule Recommendation

**Current:** Every 1 minute
```sql
SELECT cron.schedule(
  'schedule-batches-cron',
  '* * * * *',  -- Every minute
  $$ ... $$
);
```

**Why:** With anchor-based logic, running every minute provides:
- Precise timing (calls triggered within 1 minute of due time)
- Built-in retry for unanswered calls
- Minimal overhead (exits early if no anchors found)

**Alternative:** Every 5 minutes (less precise, but fewer queries)
```sql
'*/5 * * * *'  -- Every 5 minutes
```
⚠️ With 5-minute intervals, change `ANCHOR_WINDOW_MINUTES = 5` to avoid missing medications.

---

## Database Queries

### Anchor Query Performance
```sql
-- Index recommendation for fast anchor lookups
CREATE INDEX idx_medications_anchor 
ON medications (time, is_taken) 
WHERE is_taken = false;
```

### Sweep Query Performance
```sql
-- Composite index for sweep queries
CREATE INDEX idx_medications_sweep 
ON medications (user_id, time, is_taken) 
WHERE is_taken = false;
```

---

## Testing Checklist

After deployment:
- ✅ Test with single medication due now
- ✅ Test with multiple medications in batch window
- ✅ Test with no anchors (should exit early)
- ✅ Test retry behavior (medication stays pending)
- ✅ Test deduplication (medication marked taken)
- ✅ Test midnight crossover (anchor at 23:59, sweep to 00:29)
- ✅ Verify parallel execution still works
- ✅ Check error logging for both anchor and sweep queries
- ✅ Monitor call volume vs. previous logic
- ✅ Verify no early calls (before scheduled time)

---

## Debugging

### Check Anchor Detection
```sql
-- Manual query to see what anchors would be found at 08:00
SELECT 
  id,
  name,
  time,
  user_id,
  is_taken
FROM medications
WHERE time = '08:00'  -- Replace with current time
  AND is_taken = false
ORDER BY time;
```

### Check Sweep Results
```sql
-- Manual query to see what would be batched for a specific user
-- Example: Current time 08:00, sweep until 08:30
SELECT 
  id,
  name,
  time,
  user_id,
  is_taken
FROM medications
WHERE is_taken = false
  AND user_id = 'USER_ID_HERE'
  AND time >= '08:00'
  AND time <= '08:30'
ORDER BY time;
```

### Check Current Pakistan Time
```sql
-- Get current time in Pakistan timezone
SELECT to_char(NOW() AT TIME ZONE 'Asia/Karachi', 'HH24:MI') as current_time_pk;
```

---

## Migration Notes

### Old Functions (Deprecated)
The following functions are kept for reference but no longer used:
- `queryMedicationLogs_DEPRECATED()`
- `queryMedicationsTable_DEPRECATED()`

These can be removed in a future cleanup once the new logic is proven stable.

### Breaking Changes
None. The function signature and response format remain unchanged. Only the internal logic has changed.

### Rollback Plan
If needed, revert to the previous commit and restore:
1. `const WINDOW_MINUTES = 30`
2. `const USE_MEDICATION_LOGS = true`
3. Replace anchor/sweep logic with old `queryMedicationLogs()` call
