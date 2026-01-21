/// <reference lib="deno.ns" />

/**
 * Schedule Batches Edge Function (Cron Job)
 * 
 * This function runs periodically (e.g., every minute) to:
 * 1. Find anchor medications due RIGHT NOW (within last 1 minute)
 * 2. For each anchor user, sweep all pending medications in next 30 minutes
 * 3. Trigger batched calls via the make-call function
 * 
 * Database Schema:
 * - Table: medications (single table)
 * - Status: is_taken (boolean) - false = pending
 * - Time: time (text "HH:MM") - 24-hour format
 * 
 * Cron Setup: Use Supabase pg_cron or external scheduler to call this function
 * Recommended: Every 1 minute for precise timing
 * 
 * Manual trigger: POST /functions/v1/schedule-batches
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuration
const ANCHOR_WINDOW_MINUTES = 1; // How far back to look for anchor meds (triggers)
const SWEEP_WINDOW_MINUTES = 30; // How far ahead to sweep for upcoming meds
const SNOOZE_COOLDOWN_MINUTES = 15; // Minimum gap between calls for same medication
const MAX_RETRY_COUNT = 2; // Maximum number of call attempts per medication per day (2-Strike Rule)

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface Medication {
  id: string;
  name: string;
  dosage: string;
  time: string;       // "HH:MM" format
  user_id: string;
  is_taken: boolean;
  last_called_at: string | null;  // ISO timestamp of last call
  retry_count: number;            // Number of call attempts (0, 1, or 2)
}

interface UserProfile {
  id: string;
  phone: string;
  name: string;
}

interface MedicationItem {
  id: string;       // medication_id for DB update
  name: string;
  logId: string;    // Empty string for medications table (no separate logs)
}

interface UserBatch {
  userId: string;
  userName: string;
  phoneNumber: string;
  medications: MedicationItem[];
}

interface ScheduleResult {
  success: boolean;
  batches_triggered: number;
  total_meds: number;
  errors: string[];
  details: {
    userId: string;
    medicationCount: number;
    status: 'triggered' | 'skipped' | 'error';
    error?: string;
  }[];
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  console.log('🕐 ========================================');
  console.log('🕐 SCHEDULE-BATCHES CRON JOB STARTED');
  console.log('🕐 Timestamp:', new Date().toISOString());
  console.log('🕐 ========================================');

  try {
    const result = await processScheduledMedications();
    
    console.log('✅ Cron job completed:', result);
    
    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('❌ Cron job failed:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: (error as Error).message,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

// ============================================================================
// CORE LOGIC
// ============================================================================

async function processScheduledMedications(): Promise<ScheduleResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase credentials');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const now = new Date();
  const anchorStart = new Date(now.getTime() - ANCHOR_WINDOW_MINUTES * 60 * 1000); // 1 min ago
  const sweepEnd = new Date(now.getTime() + SWEEP_WINDOW_MINUTES * 60 * 1000); // 30 mins ahead
  
  console.log('📅 Time windows:', {
    anchorStart: anchorStart.toISOString(),
    now: now.toISOString(),
    sweepEnd: sweepEnd.toISOString()
  });

  // STEP 1: Find Anchor Medications (due RIGHT NOW)
  const anchorResult = await findAnchorMedications(supabase, anchorStart, now);

  if (!anchorResult || anchorResult.anchorUserIds.size === 0) {
    console.log('📭 No anchor medications found (nothing due right now)');
    return {
      success: true,
      batches_triggered: 0,
      total_meds: 0,
      errors: [],
      details: []
    };
  }

  console.log(`⚓ Found ${anchorResult.anchorCount} anchor medications for ${anchorResult.anchorUserIds.size} users`);

  // STEP 2: Sweep for each anchor user (find ALL their pending meds)
  const { userBatches, userIds } = await sweepUserMedications(
    supabase,
    anchorResult.anchorUserIds,
    anchorStart,
    sweepEnd
  );

  if (userBatches.size === 0) {
    console.log('📭 No medications found in sweep (unexpected)');
    return {
      success: true,
      batches_triggered: 0,
      total_meds: 0,
      errors: [],
      details: []
    };
  }

  console.log(`👥 Grouped into ${userBatches.size} user batches`);

  // ============================================================================
  // STEP 3: Fetch user profiles (phone numbers)
  // ============================================================================
  
  // Try to get user data from auth.users (requires service role)
  const userProfiles = new Map<string, UserProfile>();
  
  for (const userId of userIds) {
    try {
      // Get user from auth.users
      const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(userId);
      
      if (userError || !user) {
        console.warn(`⚠️ Could not fetch user ${userId}:`, userError?.message);
        continue;
      }

      const phone = user.phone || user.user_metadata?.phone;
      const name = user.user_metadata?.name || user.email?.split('@')[0] || 'User';

      if (!phone) {
        console.warn(`⚠️ User ${userId} has no phone number`);
        continue;
      }

      userProfiles.set(userId, {
        id: userId,
        phone: sanitizePhoneNumber(phone),
        name: name,
      });
    } catch (err) {
      console.error(`❌ Error fetching user ${userId}:`, err);
    }
  }

  console.log(`📱 Retrieved ${userProfiles.size} user profiles with phone numbers`);

  // ============================================================================
  // STEP 4: Trigger make-call for each user batch (PARALLEL EXECUTION)
  // ============================================================================
  
  const result: ScheduleResult = {
    success: true,
    batches_triggered: 0,
    total_meds: 0,
    errors: [],
    details: []
  };

  console.log(`🚀 Starting parallel execution for ${userBatches.size} user batches...`);

  // Create array of promises for parallel execution
  const promises = Array.from(userBatches).map(async ([userId, medications]) => {
    const profile = userProfiles.get(userId);
    
    if (!profile) {
      console.warn(`⚠️ Skipping user ${userId} - no profile/phone found`);
      return {
        userId,
        medicationCount: medications.length,
        status: 'skipped' as const,
        error: 'No phone number available'
      };
    }

    console.log(`📞 Triggering batch call for User ${userId} with ${medications.length} meds`);
    console.log(`   Medications: ${medications.map(m => m.name).join(', ')}`);

    try {
      // ============================================================================
      // CRITICAL: Update medication stats BEFORE triggering call (2-Strike Rule)
      // This:
      // 1. Sets last_called_at to prevent duplicate calls for batched meds
      // 2. Increments retry_count (after 2 calls, no more retries)
      // Example: 8:00 batch (A+B) -> sets last_called_at + retry_count=1 for both
      //          8:05 trigger for B -> sees last_called_at=8:00 (5 mins ago) -> SKIPPED
      //          8:15 retry -> sees retry_count=1 < 2 -> CALL, retry_count becomes 2
      //          8:30 retry -> sees retry_count=2 >= 2 -> SKIPPED (2-Strike Rule)
      // ============================================================================
      const medicationIds = medications.map(m => m.id).filter(id => id);
      const updateSuccess = await updateMedicationStats(supabase, medicationIds);

      // ============================================================================
      // CIRCUIT BREAKER: No Database Update = No Twilio Call
      // If we can't update retry_count, we MUST NOT proceed with the call.
      // Otherwise, we risk infinite retry loops and duplicate billing.
      // ============================================================================
      if (!updateSuccess) {
        console.error('🛑 CIRCUIT BREAKER TRIGGERED: Database stats update failed.');
        console.error('🛑 ABORTING CALL for user', userId, '- Preventing potential duplicate billing.');
        console.error('🛑 Medications affected:', medications.map(m => m.name).join(', '));
        return {
          userId,
          medicationCount: medications.length,
          status: 'error' as const,
          error: 'Circuit breaker: DB update failed, call aborted to prevent duplicate billing'
        };
      }

      console.log(`✅ Database stats updated successfully. Proceeding with call...`);

      // Call make-call function (ONLY if DB update succeeded)
      const callResult = await triggerMakeCall(supabaseUrl, supabaseServiceKey, {
        phoneNumber: profile.phone,
        userName: profile.name,
        medications: medications,
      });

      if (callResult.success) {
        console.log(`✅ Call triggered for user ${userId}`);
        return {
          userId,
          medicationCount: medications.length,
          status: 'triggered' as const,
          callSid: callResult.callSid
        };
      } else {
        console.error(`❌ Call failed for user ${userId}:`, callResult.error);
        return {
          userId,
          medicationCount: medications.length,
          status: 'error' as const,
          error: callResult.error
        };
      }
    } catch (err) {
      const errorMsg = (err as Error).message;
      console.error(`❌ Exception triggering call for user ${userId}:`, err);
      return {
        userId,
        medicationCount: medications.length,
        status: 'error' as const,
        error: errorMsg
      };
    }
  });

  // Wait for all calls to complete (parallel execution)
  const results = await Promise.allSettled(promises);

  // Process results
  for (const promiseResult of results) {
    if (promiseResult.status === 'fulfilled') {
      const detail = promiseResult.value;
      result.details.push(detail);

      if (detail.status === 'triggered') {
        result.batches_triggered++;
        result.total_meds += detail.medicationCount;
      } else if (detail.status === 'error') {
        result.errors.push(`User ${detail.userId}: ${detail.error}`);
      }
    } else {
      // Promise was rejected (should not happen with try/catch inside)
      console.error('❌ Unexpected promise rejection:', promiseResult.reason);
      result.errors.push(`Unexpected error: ${promiseResult.reason}`);
    }
  }

  // Mark success as false if there were any errors
  if (result.errors.length > 0) {
    result.success = result.batches_triggered > 0; // Partial success
  }

  console.log(`🏁 Parallel execution completed: ${result.batches_triggered} successful, ${result.errors.length} errors`);

  return result;
}

// ============================================================================
// ANCHOR-BASED QUERY FUNCTIONS
// ============================================================================

/**
 * Find "anchor" medications that should trigger a call RIGHT NOW
 * 
 * Smart Snooze Logic:
 * 1. NEW MEDS: is_taken=false AND last_called_at IS NULL AND time=CurrentTime
 * 2. RETRY MEDS: is_taken=false AND last_called_at IS NOT NULL AND last_called_at < (NOW - 15 mins)
 * 
 * This prevents:
 * - Immediate re-calls if user said "No" (must wait 15 mins)
 * - Duplicate calls for batched meds (8:00 + 8:05 batched, won't re-call at 8:05)
 * 
 * Uses Pakistan timezone for time comparison
 */
async function findAnchorMedications(
  supabase: ReturnType<typeof createClient>,
  anchorStart: Date,
  now: Date
): Promise<{ anchorUserIds: Set<string>; anchorCount: number } | null> {
  console.log('⚓ Finding anchor medications (with Smart Snooze)...');
  
  try {
    // Get current time in HH:MM format (Pakistan timezone)
    const nowTime = now.toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Karachi',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    // Calculate cooldown threshold (15 minutes ago)
    const cooldownThreshold = new Date(now.getTime() - SNOOZE_COOLDOWN_MINUTES * 60 * 1000);
    const cooldownISO = cooldownThreshold.toISOString();

    console.log(`⚓ Anchor time: ${nowTime}`);
    console.log(`⚓ Cooldown threshold: ${cooldownISO} (${SNOOZE_COOLDOWN_MINUTES} mins ago)`);
    console.log(`⚓ Max retry count: ${MAX_RETRY_COUNT} (2-Strike Rule)`);

    // ============================================================================
    // CONDITION 1: First Call (never called today, due now)
    // is_taken=false AND retry_count=0 AND time=CurrentTime
    // ============================================================================
    const { data: newMeds, error: newMedsError } = await supabase
      .from('medications')
      .select('id, name, dosage, time, user_id, is_taken, last_called_at, retry_count')
      .eq('time', nowTime)
      .eq('is_taken', false)
      .eq('retry_count', 0)  // Only pick if never called today
      .order('time', { ascending: true });

    if (newMedsError) {
      console.error('❌ New Meds Query Failed:', {
        message: newMedsError.message,
        details: newMedsError.details,
        hint: newMedsError.hint,
        code: newMedsError.code
      });
      return null;
    }

    console.log(`⚓ Condition 1 (First call, retry_count=0): ${newMeds?.length || 0} found`);

    // ============================================================================
    // CONDITION 2: Retry Call (called before, cooldown expired, under limit)
    // is_taken=false AND last_called_at < cooldownThreshold AND retry_count < MAX_RETRY_COUNT
    // ============================================================================
    const { data: retryMeds, error: retryMedsError } = await supabase
      .from('medications')
      .select('id, name, dosage, time, user_id, is_taken, last_called_at, retry_count')
      .eq('is_taken', false)
      .not('last_called_at', 'is', null)
      .lt('last_called_at', cooldownISO)
      .lt('retry_count', MAX_RETRY_COUNT)  // Only pick if called less than 2 times (2-Strike Rule)
      .order('time', { ascending: true });

    if (retryMedsError) {
      console.error('❌ Retry Meds Query Failed:', {
        message: retryMedsError.message,
        details: retryMedsError.details,
        hint: retryMedsError.hint,
        code: retryMedsError.code
      });
      return null;
    }

    console.log(`⚓ Condition 2 (Retry call, retry_count<${MAX_RETRY_COUNT}, cooldown expired): ${retryMeds?.length || 0} found`);

    // Combine both sets of medications
    const allAnchorMeds = [...(newMeds || []), ...(retryMeds || [])];

    if (allAnchorMeds.length === 0) {
      console.log('📭 No anchor medications found (nothing due, all in cooldown, or retry limit reached)');
      return { anchorUserIds: new Set(), anchorCount: 0 };
    }

    // Log medications that are in cooldown (for debugging)
    const { data: cooldownMeds } = await supabase
      .from('medications')
      .select('id, name, time, last_called_at, retry_count')
      .eq('is_taken', false)
      .not('last_called_at', 'is', null)
      .gte('last_called_at', cooldownISO)
      .lt('retry_count', MAX_RETRY_COUNT);  // Only show those that will retry later

    if (cooldownMeds && cooldownMeds.length > 0) {
      console.log(`⏸️ Skipped ${cooldownMeds.length} meds in cooldown (called within ${SNOOZE_COOLDOWN_MINUTES} mins):`);
      for (const med of cooldownMeds) {
        const calledAt = new Date(med.last_called_at);
        const minsAgo = Math.floor((now.getTime() - calledAt.getTime()) / 60000);
        console.log(`   - ${med.name} (${med.time}): called ${minsAgo} mins ago, retry_count=${med.retry_count}`);
      }
    }

    // Log medications that have hit retry limit (2-Strike Rule)
    const { data: limitReachedMeds } = await supabase
      .from('medications')
      .select('id, name, time, retry_count')
      .eq('is_taken', false)
      .gte('retry_count', MAX_RETRY_COUNT);

    if (limitReachedMeds && limitReachedMeds.length > 0) {
      console.log(`🚫 Skipped ${limitReachedMeds.length} meds - retry limit reached (2-Strike Rule):`);
      for (const med of limitReachedMeds) {
        console.log(`   - ${med.name} (${med.time}): retry_count=${med.retry_count} (max ${MAX_RETRY_COUNT})`);
      }
    }

    // Extract unique user IDs from anchor medications
    const anchorUserIds = new Set<string>();
    for (const med of allAnchorMeds as Medication[]) {
      if (med.user_id) {
        anchorUserIds.add(med.user_id);
      }
    }

    console.log(`⚓ Anchor breakdown: ${allAnchorMeds.length} medications from ${anchorUserIds.size} users`);
    console.log(`   - First call: ${newMeds?.length || 0}, Retry: ${retryMeds?.length || 0}`);

    return { anchorUserIds, anchorCount: allAnchorMeds.length };
  } catch (err) {
    console.error('❌ Anchor query exception:', (err as Error).message);
    return null;
  }
}

/**
 * For each anchor user, sweep ALL their pending medications
 * 
 * This function collects TWO types of meds:
 * 1. FUTURE MEDS: time >= now AND time <= now+30 mins (upcoming meds to batch)
 * 2. RETRY MEDS: Past meds with expired cooldown (last_called_at < NOW - 15 mins)
 * 
 * Uses Pakistan timezone and handles midnight crossover for future meds
 */
async function sweepUserMedications(
  supabase: ReturnType<typeof createClient>,
  anchorUserIds: Set<string>,
  sweepStart: Date,
  sweepEnd: Date
): Promise<{ userBatches: Map<string, MedicationItem[]>; userIds: Set<string> }> {
  console.log(`🧹 Sweeping medications for ${anchorUserIds.size} anchor users...`);
  
  const userBatches = new Map<string, MedicationItem[]>();
  const userIds = new Set<string>();

  // Get time range in HH:MM format (Pakistan timezone)
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

  // Calculate cooldown threshold for retry meds
  const cooldownThreshold = new Date(sweepStart.getTime() - SNOOZE_COOLDOWN_MINUTES * 60 * 1000);
  const cooldownISO = cooldownThreshold.toISOString();

  console.log(`🧹 Sweep time range: ${nowTime} to ${windowEndTime}`);
  console.log(`🧹 Retry cooldown threshold: ${cooldownISO}`);

  // ============================================================================
  // QUERY 1: Future meds (time >= now AND time <= now+30 mins)
  // Only meds that haven't hit retry limit
  // ============================================================================
  let futureMeds: Medication[] = [];
  
  const crossesMidnight = windowEndTime < nowTime;
  
  if (crossesMidnight) {
    console.log('🌙 Detected midnight crossover - using OR query for future meds');
    
    const result = await supabase
      .from('medications')
      .select('id, name, dosage, time, user_id, is_taken, last_called_at, retry_count')
      .eq('is_taken', false)
      .lt('retry_count', MAX_RETRY_COUNT)  // 2-Strike Rule
      .or(`time.gte.${nowTime},time.lte.${windowEndTime}`)
      .order('time', { ascending: true });
    
    if (result.error) {
      console.error('❌ Future Meds Query Failed:', result.error.message);
    } else {
      futureMeds = (result.data || []) as Medication[];
    }
  } else {
    console.log('☀️ Normal time window - using range query for future meds');
    
    const result = await supabase
      .from('medications')
      .select('id, name, dosage, time, user_id, is_taken, last_called_at, retry_count')
      .eq('is_taken', false)
      .lt('retry_count', MAX_RETRY_COUNT)  // 2-Strike Rule
      .gte('time', nowTime)
      .lte('time', windowEndTime)
      .order('time', { ascending: true });
    
    if (result.error) {
      console.error('❌ Future Meds Query Failed:', result.error.message);
    } else {
      futureMeds = (result.data || []) as Medication[];
    }
  }

  console.log(`🧹 Query 1 (Future meds, retry_count<${MAX_RETRY_COUNT}): ${futureMeds.length} found`);

  // ============================================================================
  // QUERY 2: Retry meds (PAST meds with expired cooldown)
  // These are meds where:
  // - is_taken = false (not taken yet)
  // - last_called_at IS NOT NULL (was called before)
  // - last_called_at < cooldownThreshold (cooldown expired, eligible for retry)
  // - time < nowTime (scheduled time is in the past)
  // - retry_count < MAX_RETRY_COUNT (2-Strike Rule)
  // ============================================================================
  let retryMeds: Medication[] = [];
  
  const { data: retryData, error: retryError } = await supabase
    .from('medications')
    .select('id, name, dosage, time, user_id, is_taken, last_called_at, retry_count')
    .eq('is_taken', false)
    .not('last_called_at', 'is', null)
    .lt('last_called_at', cooldownISO)
    .lt('time', nowTime)  // Past meds only (time < now)
    .lt('retry_count', MAX_RETRY_COUNT)  // 2-Strike Rule
    .order('time', { ascending: true });

  if (retryError) {
    console.error('❌ Retry Meds Query Failed:', retryError.message);
  } else {
    retryMeds = (retryData || []) as Medication[];
  }

  console.log(`🧹 Query 2 (Retry meds - past with expired cooldown): ${retryMeds.length} found`);

  // ============================================================================
  // Combine and deduplicate
  // ============================================================================
  const seenIds = new Set<string>();
  const allSweepMeds: Medication[] = [];

  // Add future meds first
  for (const med of futureMeds) {
    if (!seenIds.has(med.id)) {
      seenIds.add(med.id);
      allSweepMeds.push(med);
    }
  }

  // Add retry meds (deduped)
  for (const med of retryMeds) {
    if (!seenIds.has(med.id)) {
      seenIds.add(med.id);
      allSweepMeds.push(med);
    }
  }

  if (allSweepMeds.length === 0) {
    console.log('📭 No medications found in sweep');
    return { userBatches, userIds };
  }

  console.log(`🧹 Combined total: ${allSweepMeds.length} medications (${futureMeds.length} future + ${retryMeds.length} retry, deduped)`);

  // Filter to only include anchor users and group by user_id
  let includedCount = 0;
  for (const med of allSweepMeds) {
    if (!med.user_id) {
      console.warn('⚠️ Skipping medication with missing user_id:', med.id);
      continue;
    }

    const userId = med.user_id;

    // CRITICAL: Only include users who have anchors
    if (!anchorUserIds.has(userId)) {
      continue;
    }

    userIds.add(userId);

    if (!userBatches.has(userId)) {
      userBatches.set(userId, []);
    }

    userBatches.get(userId)!.push({
      id: med.id,
      name: med.name,
      logId: '', // No separate log table
    });

    includedCount++;
  }

  console.log(`🧹 Sweep complete: ${includedCount} medications batched for ${userBatches.size} users`);

  // Log per-user batch sizes
  for (const [userId, meds] of userBatches) {
    console.log(`   User ${userId}: ${meds.length} meds (${meds.map(m => m.name).join(', ')})`);
  }

  return { userBatches, userIds };
}

// ============================================================================
// OLD QUERY FUNCTIONS (DEPRECATED - Kept for reference)
// ============================================================================

/**
 * @deprecated Use findAnchorMedications and sweepUserMedications instead
 * Query medication_logs table for pending medications
 * Returns null if the table doesn't exist or query fails
 */
async function queryMedicationLogs_DEPRECATED(
  supabase: ReturnType<typeof createClient>,
  now: Date,
  windowEnd: Date
): Promise<{ userBatches: Map<string, MedicationItem[]>; userIds: Set<string> } | null> {
  console.log('📋 Querying medication_logs table...');
  
  try {
    const { data: pendingLogs, error: queryError } = await supabase
      .from('medication_logs')
      .select(`
        id,
        medication_id,
        scheduled_at,
        status,
        medications (
          id,
          name,
          dosage,
          user_id
        )
      `)
      .eq('status', 'pending')
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', windowEnd.toISOString())
      .order('scheduled_at', { ascending: true });

    if (queryError) {
      console.error('❌ Logs Query Failed:', {
        message: queryError.message,
        details: queryError.details,
        hint: queryError.hint,
        code: queryError.code
      });
      return null; // Signal to use fallback
    }

    if (!pendingLogs || pendingLogs.length === 0) {
      console.log('📭 No pending logs found in medication_logs');
      return { userBatches: new Map(), userIds: new Set() };
    }

    console.log(`📋 Found ${pendingLogs.length} pending medication logs`);

    // Group by user_id
    const userBatches = new Map<string, MedicationItem[]>();
    const userIds = new Set<string>();

    for (const log of pendingLogs as MedicationLog[]) {
      const medication = log.medications;
      if (!medication || !medication.user_id) {
        console.warn('⚠️ Skipping log with missing medication data:', log.id);
        continue;
      }

      const userId = medication.user_id;
      userIds.add(userId);

      if (!userBatches.has(userId)) {
        userBatches.set(userId, []);
      }

      userBatches.get(userId)!.push({
        id: medication.id,
        name: medication.name,
        logId: log.id,
      });
    }

    return { userBatches, userIds };
  } catch (err) {
    console.warn('⚠️ medication_logs query exception:', (err as Error).message);
    return null;
  }
}

/**
 * @deprecated Use findAnchorMedications and sweepUserMedications instead
 * Query medications table directly (fallback mode)
 * Matches medications by time column within the window
 * Handles midnight crossover (e.g., 23:50 to 00:20)
 */
async function queryMedicationsTable_DEPRECATED(
  supabase: ReturnType<typeof createClient>,
  now: Date,
  windowEnd: Date
): Promise<{ userBatches: Map<string, MedicationItem[]>; userIds: Set<string> }> {
  console.log('📋 Querying medications table directly...');
  
  // Get current time in HH:MM format for comparison
  const nowTime = now.toTimeString().slice(0, 5);  // "HH:MM"
  const windowEndTime = windowEnd.toTimeString().slice(0, 5);
  
  console.log('🕐 Time range:', { nowTime, windowEndTime });

  let medications;
  let queryError;

  // CRITICAL: Check for midnight crossover
  const crossesMidnight = windowEndTime < nowTime;
  
  if (crossesMidnight) {
    console.log('🌙 Detected midnight crossover - using OR query');
    
    // Midnight case: time >= nowTime OR time <= windowEndTime
    // Example: 23:50 to 00:20 → (time >= "23:50" OR time <= "00:20")
    const result = await supabase
      .from('medications')
      .select('id, name, dosage, time, user_id, is_taken')
      .eq('is_taken', false)
      .or(`time.gte.${nowTime},time.lte.${windowEndTime}`)
      .order('time', { ascending: true });
    
    medications = result.data;
    queryError = result.error;
  } else {
    console.log('☀️ Normal time window - using range query');
    
    // Normal case: time >= nowTime AND time <= windowEndTime
    const result = await supabase
      .from('medications')
      .select('id, name, dosage, time, user_id, is_taken')
      .eq('is_taken', false)
      .gte('time', nowTime)
      .lte('time', windowEndTime)
      .order('time', { ascending: true });
    
    medications = result.data;
    queryError = result.error;
  }

  if (queryError) {
    console.error('❌ medications query failed:', {
      message: queryError.message,
      details: queryError.details,
      hint: queryError.hint,
      code: queryError.code
    });
    throw new Error(`Failed to query medications: ${queryError.message}`);
  }

  if (!medications || medications.length === 0) {
    console.log('📭 No pending medications found in time window');
    return { userBatches: new Map(), userIds: new Set() };
  }

  console.log(`📋 Found ${medications.length} pending medications`);

  // Group by user_id
  const userBatches = new Map<string, MedicationItem[]>();
  const userIds = new Set<string>();

  for (const med of medications) {
    if (!med.user_id) {
      console.warn('⚠️ Skipping medication with missing user_id:', med.id);
      continue;
    }

    const userId = med.user_id;
    userIds.add(userId);

    if (!userBatches.has(userId)) {
      userBatches.set(userId, []);
    }

    userBatches.get(userId)!.push({
      id: med.id,
      name: med.name,
      logId: '', // No log ID when querying medications directly
    });
  }

  return { userBatches, userIds };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Update medication stats BEFORE triggering the call (2-Strike Rule)
 * 
 * CRITICAL: Uses individual updates in parallel (Promise.all) to ensure stats are saved
 * 
 * Updates:
 * - last_called_at = NOW() (for cooldown tracking)
 * - retry_count = retry_count + 1 (for 2-Strike Rule)
 * 
 * This ensures that:
 * 1. Batched meds (8:00 + 8:05) won't re-trigger at 8:05 (cooldown active)
 * 2. If user says "No", retry won't happen until cooldown expires
 * 3. After 2 calls (retry_count=2), no more calls are made (2-Strike Rule)
 */
async function updateMedicationStats(
  supabase: ReturnType<typeof createClient>,
  medicationIds: string[]
): Promise<boolean> {
  if (medicationIds.length === 0) {
    console.log('⏰ No medication IDs to update');
    return true;
  }

  console.log(`⏰ Updating medication stats for ${medicationIds.length} medications...`);
  console.log(`⏰ Medication IDs:`, medicationIds);

  try {
    const now = new Date().toISOString();
    
    // Step 1: Fetch current medications to get their retry_count
    const { data: currentMeds, error: fetchError } = await supabase
      .from('medications')
      .select('id, name, retry_count')
      .in('id', medicationIds);

    if (fetchError) {
      console.error('❌ Failed to fetch current medications:', {
        message: fetchError.message,
        details: fetchError.details,
        hint: fetchError.hint,
        code: fetchError.code
      });
      return false;
    }

    if (!currentMeds || currentMeds.length === 0) {
      console.error('❌ No medications found with provided IDs');
      return false;
    }

    console.log(`⏰ Fetched ${currentMeds.length} medications to update`);

    // Step 2: Update each medication individually using Promise.all for parallel execution
    const updatePromises = currentMeds.map(async (med) => {
      const oldRetryCount = med.retry_count || 0;
      const newRetryCount = oldRetryCount + 1;

      console.log(`⏰ Updating ${med.name} (${med.id}): retry_count ${oldRetryCount} -> ${newRetryCount}`);

      const { error: updateError, count } = await supabase
        .from('medications')
        .update({
          last_called_at: now,
          retry_count: newRetryCount
        })
        .eq('id', med.id);

      if (updateError) {
        console.error(`❌ Failed to update ${med.name} (${med.id}):`, {
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
          code: updateError.code
        });
        return { success: false, id: med.id, name: med.name, error: updateError.message };
      }

      console.log(`✅ Updated ${med.name} (${med.id}): retry_count=${newRetryCount}, last_called_at=${now}, rows=${count}`);
      return { success: true, id: med.id, name: med.name, oldRetryCount, newRetryCount };
    });

    // Wait for all updates to complete
    const results = await Promise.all(updatePromises);

    // Check for failures
    const failures = results.filter(r => !r.success);
    const successes = results.filter(r => r.success);

    if (failures.length > 0) {
      console.error(`❌ Failed to update ${failures.length}/${results.length} medications:`);
      for (const failure of failures) {
        console.error(`   - ${failure.name} (${failure.id}): ${failure.error}`);
      }
    }

    if (successes.length > 0) {
      console.log(`✅ Successfully updated ${successes.length}/${results.length} medications`);
    }

    // CRITICAL: Return true ONLY if ALL updates succeeded (for circuit breaker safety)
    // If any update failed, we return false to prevent the call
    // This prevents partial updates from causing billing issues
    if (failures.length > 0) {
      console.error(`🛑 Returning FALSE due to ${failures.length} failed updates (circuit breaker will trigger)`);
      return false;
    }

    return true;
  } catch (err) {
    console.error('❌ Exception updating medication stats:', {
      error: (err as Error).message,
      stack: (err as Error).stack
    });
    return false;
  }
}

/**
 * Sanitize phone number to E.164 format
 */
function sanitizePhoneNumber(phone: string): string {
  let sanitized = phone.trim();
  
  // Handle Pakistan format: 03... → +923...
  if (sanitized.startsWith('03')) {
    sanitized = '+92' + sanitized.substring(1);
  }
  
  // Ensure + prefix
  if (!sanitized.startsWith('+')) {
    sanitized = '+' + sanitized;
  }
  
  return sanitized;
}

/**
 * Trigger the make-call edge function
 * Uses hardened auth with both Authorization and apikey headers
 */
async function triggerMakeCall(
  supabaseUrl: string,
  serviceKey: string,
  payload: {
    phoneNumber: string;
    userName: string;
    medications: MedicationItem[];
  }
): Promise<{ success: boolean; callSid?: string; error?: string }> {
  const makeCallUrl = `${supabaseUrl}/functions/v1/make-call`;
  
  console.log('🔗 Calling make-call at:', makeCallUrl);
  console.log('📦 Payload:', JSON.stringify(payload, null, 2));

  const response = await fetch(makeCallUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': serviceKey, // Hardened auth: both headers
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    return { success: false, error: data.error || `HTTP ${response.status}` };
  }

  return { success: true, callSid: data.callSid };
}
