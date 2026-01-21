# CRITICAL FIX: Single Table Schema (medications)

## Problem
The initial implementation assumed a `medication_logs` table with:
- `scheduled_at` (timestamp)
- `status` (text: 'pending' or 'taken')
- Relation to `medications` table

**Reality:** The app only has a single `medications` table with:
- `time` (text: "HH:MM" format)
- `is_taken` (boolean: false = pending)
- No separate logs table

## Changes Made

### 1. Updated Type Definitions
**Before:**
```typescript
interface MedicationLog {
  id: string;
  medication_id: string;
  scheduled_at: string;
  status: string;
  medications: {
    id: string;
    name: string;
    dosage: string;
    user_id: string;
  };
}
```

**After:**
```typescript
interface Medication {
  id: string;
  name: string;
  dosage: string;
  time: string;       // "HH:MM" format
  user_id: string;
  is_taken: boolean;
}
```

### 2. Updated Anchor Query
**Before:**
```typescript
// Query medication_logs with timestamp comparison
const { data: anchorLogs, error: anchorError } = await supabase
  .from('medication_logs')
  .select(`
    id,
    medication_id,
    scheduled_at,
    status,
    medications!inner (
      id,
      name,
      user_id
    )
  `)
  .eq('status', 'pending')
  .gte('scheduled_at', anchorStart.toISOString())
  .lte('scheduled_at', now.toISOString())
```

**After:**
```typescript
// Get current time in Pakistan timezone as HH:MM string
const nowTime = now.toLocaleTimeString('en-GB', {
  timeZone: 'Asia/Karachi',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
}); // Returns "08:00"

// Query medications table with exact time match
const { data: anchorMeds, error: anchorError } = await supabase
  .from('medications')
  .select('id, name, dosage, time, user_id, is_taken')
  .eq('time', nowTime)
  .eq('is_taken', false)
```

### 3. Updated Sweep Query
**Before:**
```typescript
// Query medication_logs with timestamp range
const { data: allSweepLogs, error: sweepError } = await supabase
  .from('medication_logs')
  .select(`...`)
  .eq('status', 'pending')
  .gte('scheduled_at', sweepStart.toISOString())
  .lte('scheduled_at', sweepEnd.toISOString())
```

**After:**
```typescript
// Get time range in Pakistan timezone as HH:MM strings
const nowTime = sweepStart.toLocaleTimeString('en-GB', {
  timeZone: 'Asia/Karachi',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

const windowEndTime = sweepEnd.toLocaleTimeString('en-GB', {
  timeZone: 'Asia/Karachi',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

// Check for midnight crossover
const crossesMidnight = windowEndTime < nowTime;

if (crossesMidnight) {
  // Midnight case: time >= nowTime OR time <= windowEndTime
  const result = await supabase
    .from('medications')
    .select('id, name, dosage, time, user_id, is_taken')
    .eq('is_taken', false)
    .or(`time.gte.${nowTime},time.lte.${windowEndTime}`)
} else {
  // Normal case: time >= nowTime AND time <= windowEndTime
  const result = await supabase
    .from('medications')
    .select('id, name, dosage, time, user_id, is_taken')
    .eq('is_taken', false)
    .gte('time', nowTime)
    .lte('time', windowEndTime)
}
```

### 4. Removed Join/Relation Logic
**Before:**
```typescript
// Extract user_id from nested medications object
for (const log of anchorLogs as MedicationLog[]) {
  if (log.medications?.user_id) {
    anchorUserIds.add(log.medications.user_id);
  }
}
```

**After:**
```typescript
// Direct access to user_id (single table)
for (const med of anchorMeds as Medication[]) {
  if (med.user_id) {
    anchorUserIds.add(med.user_id);
  }
}
```

### 5. Updated logId Field
**Before:**
```typescript
userBatches.get(userId)!.push({
  id: medication.id,
  name: medication.name,
  logId: log.id,  // From medication_logs table
});
```

**After:**
```typescript
userBatches.get(userId)!.push({
  id: med.id,
  name: med.name,
  logId: '',  // No separate log table
});
```

## Key Differences

| Aspect | Before (medication_logs) | After (medications) |
|--------|-------------------------|---------------------|
| Table | `medication_logs` + `medications` | `medications` only |
| Time Format | `scheduled_at` (timestamptz) | `time` (text "HH:MM") |
| Status | `status` ('pending'/'taken') | `is_taken` (boolean) |
| Query Type | Timestamp range | String comparison |
| Relation | FK join required | Single table |
| Timezone | UTC with conversion | Pakistan (Asia/Karachi) |

## Time Comparison Logic

### String vs Timestamp
**String comparison works for HH:MM format:**
```typescript
"08:00" < "08:30"  // true
"23:50" < "00:20"  // false (midnight crossover!)
```

**Midnight Crossover Detection:**
```typescript
const crossesMidnight = windowEndTime < nowTime;

if (crossesMidnight) {
  // Use OR logic: time >= "23:50" OR time <= "00:20"
  .or(`time.gte.${nowTime},time.lte.${windowEndTime}`)
} else {
  // Normal range: time >= "08:00" AND time <= "08:30"
  .gte('time', nowTime)
  .lte('time', windowEndTime)
}
```

## Testing Scenarios

### Test 1: Anchor Detection
```sql
-- Insert test medication at current time
INSERT INTO medications (id, name, time, user_id, is_taken)
VALUES ('test-1', 'Test Med', '08:00', 'user-123', false);

-- Should be found when cron runs at 08:00
```

### Test 2: Sweep Batching
```sql
-- Insert medications at different times
INSERT INTO medications (id, name, time, user_id, is_taken)
VALUES 
  ('test-1', 'Med A', '08:00', 'user-123', false),
  ('test-2', 'Med B', '08:15', 'user-123', false),
  ('test-3', 'Med C', '08:30', 'user-123', false);

-- At 08:00, should find all 3 and batch them into one call
```

### Test 3: Midnight Crossover
```sql
-- Insert medications around midnight
INSERT INTO medications (id, name, time, user_id, is_taken)
VALUES 
  ('test-1', 'Med A', '23:50', 'user-123', false),
  ('test-2', 'Med B', '00:10', 'user-123', false);

-- At 23:50, should find both (using OR logic)
```

### Test 4: Already Taken
```sql
-- Insert taken medication
INSERT INTO medications (id, name, time, user_id, is_taken)
VALUES ('test-1', 'Med A', '08:00', 'user-123', true);

-- Should NOT be found (is_taken = true)
```

## Deployment Checklist

1. ✅ Update type definitions (Medication instead of MedicationLog)
2. ✅ Update anchor query (medications table, time string, is_taken boolean)
3. ✅ Update sweep query (medications table, midnight crossover logic)
4. ✅ Remove join/relation logic (single table)
5. ✅ Add Pakistan timezone conversion (toLocaleTimeString)
6. ✅ Test TypeScript compilation (no errors)
7. ⏳ Deploy function to Supabase
8. ⏳ Test with real data in Pakistan timezone
9. ⏳ Verify midnight crossover handling
10. ⏳ Monitor logs for correct anchor detection

## Expected Log Output

### Normal Operation (08:00)
```
⚓ Finding anchor medications (due right now)...
⚓ Anchor time: 08:00
⚓ Anchor breakdown: 2 medications from 1 users
🧹 Sweeping medications for 1 anchor users...
🧹 Sweep time range: 08:00 to 08:30
☀️ Normal time window - using range query
🧹 Found 3 total pending medications in sweep window
🧹 Sweep complete: 3 medications batched for 1 users
   User abc123: 3 meds (Aspirin, Vitamin D, Metformin)
```

### Midnight Crossover (23:50)
```
⚓ Finding anchor medications (due right now)...
⚓ Anchor time: 23:50
⚓ Anchor breakdown: 1 medications from 1 users
🧹 Sweeping medications for 1 anchor users...
🧹 Sweep time range: 23:50 to 00:20
🌙 Detected midnight crossover - using OR query
🧹 Found 2 total pending medications in sweep window
🧹 Sweep complete: 2 medications batched for 1 users
   User abc123: 2 meds (Evening Med, Midnight Med)
```

### No Anchors
```
⚓ Finding anchor medications (due right now)...
⚓ Anchor time: 08:00
📭 No anchor medications found (nothing due right now)
```

## Rollback Plan

If issues arise:
1. Revert to previous commit (before schema changes)
2. Or manually restore old query logic with medication_logs table
3. Re-deploy function

**Note:** Since the app never had medication_logs, there's no risk of breaking existing functionality. This fix makes the function compatible with the actual schema.
