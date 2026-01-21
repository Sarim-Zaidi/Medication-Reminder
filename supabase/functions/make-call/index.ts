/// <reference lib="deno.ns" />

/**
 * Twilio IVR (Interactive Voice Response) Edge Function
 * 
 * IMPORTANT: This function receives webhooks from Twilio which do NOT include
 * Supabase JWT tokens. If you have JWT verification enabled in config.toml,
 * you must either:
 * 1. Set `verify_jwt = false` for this specific function
 * 2. Or use Twilio signature validation instead
 * 
 * This function is hardened with multiple error-handling layers to ensure
 * it NEVER returns HTTP 500 errors to Twilio (which cause "Application Error"
 * announcements). All errors are caught and return valid TwiML with HTTP 200.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface MedicationItem {
  id: string;
  name: string;
  logId?: string;
}

interface CallRequestBody {
  phoneNumber: string;
  userName?: string;
  // New batched format
  medications?: MedicationItem[];
  // Legacy single-medication format (backward compatibility)
  medicationName?: string;
  medicationId?: string;
  logId?: string;
}

interface TwilioCallResponse {
  sid: string;
  [key: string]: unknown;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Escape special XML characters to prevent injection
 */
function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Convert array of medication names to natural spoken string
 * ['Panadol'] -> "Panadol"
 * ['Panadol', 'Insulin'] -> "Panadol and Insulin"
 * ['A', 'B', 'C'] -> "A, B, and C"
 */
function createSpokenList(items: string[]): string {
  if (items.length === 0) return 'your medications';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  
  const lastItem = items[items.length - 1];
  const otherItems = items.slice(0, -1);
  return `${otherItems.join(', ')}, and ${lastItem}`;
}

/**
 * Normalize request body to batch format
 * Supports both new batched format and legacy single-medication format
 */
function normalizeToBatch(body: CallRequestBody): { medications: MedicationItem[], userName: string, phoneNumber: string } {
  const userName = body.userName || 'there';
  const phoneNumber = body.phoneNumber;
  
  // If new batched format is provided
  if (body.medications && Array.isArray(body.medications) && body.medications.length > 0) {
    return { medications: body.medications, userName, phoneNumber };
  }
  
  // Fallback: convert legacy single-medication format to batch
  const singleMed: MedicationItem = {
    id: body.medicationId || '',
    name: body.medicationName || 'your medication',
    logId: body.logId,
  };
  
  return { medications: [singleMed], userName, phoneNumber };
}

/**
 * Detect if request is a Twilio webhook callback
 */
function isTwilioWebhook(url: URL): boolean {
  return url.searchParams.get('flow') === 'process_response';
}

/**
 * Create error response in TwiML format for Twilio webhooks
 * Always returns HTTP 200 to prevent "Application Error" announcements
 */
function createErrorTwiML(message: string): Response {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${escapeXML(message)}</Say>
  <Hangup/>
</Response>`;
  
  return new Response(twiml, {
    headers: { 'Content-Type': 'application/xml' },
    status: 200,
  });
}

/**
 * Create error response in JSON format for app calls
 */
function createErrorJSON(message: string): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    }
  );
}

/**
 * Create Twilio call using direct REST API (zero dependencies)
 */
async function createTwilioCall(
  accountSid: string,
  authToken: string,
  params: {
    to: string;
    from: string;
    twiml: string;
    timeLimit: number;
  }
): Promise<{ sid: string }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;
  
  // Basic Auth: base64(accountSid:authToken)
  const auth = btoa(`${accountSid}:${authToken}`);
  
  const body = new URLSearchParams({
    To: params.to,
    From: params.from,
    Twiml: params.twiml,
    Timeout: params.timeLimit.toString(),
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Twilio API error (${response.status}): ${errorText}`);
  }

  const data = await response.json() as TwilioCallResponse;
  return { sid: data.sid };
}

serve(async (req) => {
  try {
    // 1. Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    const url = new URL(req.url);
    // If 'flow' param is missing, default to 'initial'
    const flow = url.searchParams.get('flow') || 'initial';
    
    console.log('📞 Flow received:', flow);
    console.log('📞 Request URL:', req.url);

    // ============================================================================
    // FLOW B: Process IVR Response (Twilio webhook callback)
    // ============================================================================
    if (flow === 'process_response') {
      console.log('📞 Routing to: handleIVRResponse');
      return await handleIVRResponse(req, url);
    }

    // ============================================================================
    // FLOW A: Initial Call - Start IVR (default)
    // ============================================================================
    console.log('📞 Routing to: handleInitialCall');
    return await handleInitialCall(req);
    
  } catch (error) {
    // Top-level error handler - prevents "Application Error" from Twilio
    console.error('❌ CRITICAL: Top-level error in make-call function:', {
      error: (error as Error).message,
      stack: (error as Error).stack,
      timestamp: new Date().toISOString()
    });
    
    // Determine response type based on request
    try {
      const url = new URL(req.url);
      if (isTwilioWebhook(url)) {
        // Twilio webhook - return graceful TwiML error (HTTP 200)
        console.log('📞 Returning TwiML error response to Twilio');
        return createErrorTwiML('Sorry, there was an error processing your response. Please take your medication. Goodbye.');
      }
    } catch {
      // If we can't even parse the URL, assume it's a Twilio webhook to be safe
      console.log('📞 URL parsing failed, returning TwiML error to be safe');
      return createErrorTwiML('Sorry, there was an error. Please take your medication. Goodbye.');
    }
    
    // App call - return JSON error
    console.log('📱 Returning JSON error response to app');
    return createErrorJSON((error as Error).message || 'Internal server error');
  }
});

/**
 * FLOW A: Initial Call
 * Creates the outbound call with IVR prompt using zero-dependency approach
 * Supports batched medications (multiple meds in one call)
 */
async function handleInitialCall(req: Request): Promise<Response> {
  try {
    console.log('🎯 handleInitialCall: Starting...');
    const body = await req.json() as CallRequestBody;
    
    // Normalize to batch format (supports both new and legacy formats)
    const { medications, userName, phoneNumber } = normalizeToBatch(body);
    
    console.log('🎯 handleInitialCall: Normalized batch:', { 
      phoneNumber, 
      userName, 
      medicationCount: medications.length,
      medications: medications.map(m => ({ id: m.id, name: m.name }))
    });

    // Get Twilio credentials
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!accountSid || !authToken || !fromNumber) {
      throw new Error("Missing Twilio credentials");
    }

    // CRITICAL: Use public URL, NOT request URL (which could be localhost)
    const origin = Deno.env.get('SUPABASE_URL');
    if (!origin) {
      throw new Error('SUPABASE_URL environment variable not set');
    }

    // Extract IDs for batch update
    const medicationIds = medications.map(m => m.id).filter(id => id);
    const logIds = medications.map(m => m.logId).filter((id): id is string => !!id);
    const medicationNames = medications.map(m => m.name);
    
    // CRITICAL: Escape medication names for XML safety FIRST
    const safeMedicationNames = medicationNames.map(n => escapeXML(n));
    
    // Create natural spoken list from safe names
    const spokenList = createSpokenList(safeMedicationNames);
    const safeName = escapeXML(userName);
    
    // Determine singular/plural phrasing
    const isBatch = medications.length > 1;
    const themOrIt = isBatch ? 'all of them' : 'it';
    const batchLabel = isBatch ? 'your medications: ' : '';
    
    console.log('🔒 Sanitized values for TwiML:', { safeName, spokenList, isBatch, medicationCount: medications.length });
    console.log('🔒 Medication IDs for callback:', medicationIds);

    // Build callback URL with batched IDs (comma-separated)
    const callbackUrl = `${origin}/functions/v1/make-call?flow=process_response` +
      `&medicationIds=${encodeURIComponent(medicationIds.join(','))}` +
      `&logIds=${encodeURIComponent(logIds.join(','))}` +
      `&userName=${encodeURIComponent(userName)}` +
      `&medicationNames=${encodeURIComponent(medicationNames.join(','))}` +
      `&count=${medications.length}`;

    // CRITICAL: Escape ampersands for valid XML
    const xmlSafeCallbackUrl = callbackUrl.replace(/&/g, '&amp;');

    // Debug: Verify the URL is public
    console.log('🔗 Origin:', origin);
    console.log('🔗 Generated callback URL:', callbackUrl);

    console.log('🎯 Generating TwiML for batched IVR');
    // Generate TwiML with IVR (personalized with medication names)
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="5" numDigits="1" action="${xmlSafeCallbackUrl}" method="POST" speechTimeout="auto">
    <Say voice="alice">
      Hello ${safeName}. It is time to take ${batchLabel}${spokenList}. Did you take ${themOrIt}? Press 1 for Yes, or Press 2 for No.
    </Say>
  </Gather>
  <Say voice="alice">No response received. Please take your medications soon. Goodbye.</Say>
  <Hangup/>
</Response>`;

    console.log('📝 Generated TwiML:', twiml);

    // Make call via Twilio REST API (zero dependencies!)
    console.log('📞 Calling Twilio API to create call...');
    const call = await createTwilioCall(accountSid, authToken, {
      to: phoneNumber,
      from: fromNumber,
      twiml: twiml,
      timeLimit: 120, // 2 minutes max
    });

    console.log(`✅ IVR Call created successfully: ${call.sid}`);
    console.log('✅ Returning success response to app');

    return new Response(
      JSON.stringify({ success: true, callSid: call.sid, medicationCount: medications.length }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('❌ Call creation failed:', {
      error: (error as Error).message,
      stack: (error as Error).stack,
      timestamp: new Date().toISOString()
    });
    
    // Return JSON error for app calls
    return createErrorJSON((error as Error).message || 'Failed to create call');
  }
}

/**
 * FLOW B: Process IVR Response
 * Handles the Twilio webhook callback with user's response
 * Supports batched medication updates
 */
async function handleIVRResponse(req: Request, url: URL): Promise<Response> {
  try {
    console.log('🎯 handleIVRResponse: Starting...');
    
    // Get context from query params (batch format)
    const medicationIdsStr = url.searchParams.get('medicationIds') || '';
    const logIdsStr = url.searchParams.get('logIds') || '';
    const medicationNamesStr = url.searchParams.get('medicationNames') || '';
    const countStr = url.searchParams.get('count') || '1';
    const userName = escapeXML(url.searchParams.get('userName') || 'there');
    
    // Parse comma-separated IDs into arrays
    const medicationIds = medicationIdsStr ? medicationIdsStr.split(',').filter(id => id) : [];
    const logIds = logIdsStr ? logIdsStr.split(',').filter(id => id) : [];
    const medicationNames = medicationNamesStr ? medicationNamesStr.split(',') : [];
    const count = parseInt(countStr, 10) || 1;
    
    // Create spoken list for response
    const spokenList = createSpokenList(medicationNames.map(n => escapeXML(n)));
    const isBatch = count > 1;
    const themOrIt = isBatch ? 'all of them' : 'it';
    const yourMeds = isBatch ? 'your medications' : spokenList;

    console.log('🔍 Extracted from URL query params:', { 
      medicationIds,
      logIds,
      medicationNames,
      count,
      userName,
      isBatch
    });

    // Parse form data from Twilio webhook
    const formData = await req.formData();
    const speechResult = formData.get('SpeechResult')?.toString().toLowerCase() || '';
    const digits = formData.get('Digits')?.toString() || '';

    console.log('📞 IVR Response received:', { speechResult, digits, medicationIds, logIds });

    // Log user input for debugging
    console.log('📞 User pressed:', digits || '(none)');
    console.log('📞 User said:', speechResult || '(none)');

    // Determine user's response
    const saidYes = speechResult.includes('yes') || speechResult.includes('took') || speechResult.includes('done') || digits === '1';
    const saidNo = speechResult.includes('no') || speechResult.includes('not') || digits === '2';

    let responseTwiml: string;

    // ============================================================================
    // CASE 1: User pressed "1" (Yes) - Update DB
    // ============================================================================
    if (saidYes) {
      // User confirmed they took medication(s)
      console.log('✅ User pressed 1 (Yes). Updating DB to mark medications as taken.');
      console.log('✅ Medication IDs to update:', medicationIds);
      console.log('✅ Medication names:', medicationNames);

      // Update database if we have IDs
      if (medicationIds.length > 0) {
        console.log(`💾 Triggering batch database update for ${medicationIds.length} medications`);
        console.log('💾 IDs being sent to update function:', medicationIds);
        await updateMedicationStatusBatch(medicationIds, logIds, 'taken');
        console.log('💾 Update function completed');
      } else {
        console.error('❌ CRITICAL: Cannot update database - no medication IDs available!');
        console.error('❌ This means medications will NOT be marked as taken');
        console.error('❌ medicationIds:', medicationIds);
        console.error('❌ logIds:', logIds);
      }

      const markedMessage = isBatch 
        ? `I've marked ${count} medications as taken` 
        : `I've marked ${spokenList} as taken`;

      responseTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">
    Great job ${userName}! ${markedMessage}. Take care and stay healthy!
  </Say>
  <Hangup/>
</Response>`;

    // ============================================================================
    // CASE 2: User pressed "2" (No) - DO NOT update DB
    // ============================================================================
    } else if (saidNo) {
      // User said they haven't taken it - keep medications as pending
      console.log('⚠️ User pressed 2 (No). Keeping medications as pending.');
      console.log('⚠️ NO database update performed - medications remain untaken.');

      responseTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">
    Okay. I will keep them as pending. Please open the app to mark them when you take them. Goodbye.
  </Say>
  <Hangup/>
</Response>`;

    // ============================================================================
    // CASE 3: Invalid input - Retry or give up
    // ============================================================================
    } else {
      // Unclear response - ask again (one retry)
      const retryAttempt = url.searchParams.get('retry');
      const origin = Deno.env.get('SUPABASE_URL') || '';
      console.log('🔗 Retry origin:', origin);
      
      if (retryAttempt === '1') {
        // Already retried once, give up with "invalid input" message
        console.log('❌ Invalid input after retry. Giving up.');
        responseTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">
    Invalid input. Please take ${yourMeds} when you can. Goodbye.
  </Say>
  <Hangup/>
</Response>`;
      } else {
        // Retry once - use public URL with all batch params
        const retryUrl = `${origin}/functions/v1/make-call?flow=process_response` +
          `&medicationIds=${encodeURIComponent(medicationIds.join(','))}` +
          `&logIds=${encodeURIComponent(logIds.join(','))}` +
          `&userName=${encodeURIComponent(userName)}` +
          `&medicationNames=${encodeURIComponent(medicationNames.join(','))}` +
          `&count=${count}&retry=1`;
        
        // CRITICAL: Escape ampersands for valid XML
        const xmlSafeRetryUrl = retryUrl.replace(/&/g, '&amp;');
        
        console.log('🔗 Generated retry URL:', retryUrl);

        responseTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">I didn't quite catch that.</Say>
  <Gather input="speech dtmf" timeout="5" numDigits="1" action="${xmlSafeRetryUrl}" method="POST" speechTimeout="auto">
    <Say voice="alice">
      Did you take ${themOrIt}?
      Press 1 for Yes.
      Press 2 for No.
    </Say>
  </Gather>
  <Say voice="alice">No response received. Please take your medications soon. Goodbye.</Say>
  <Hangup/>
</Response>`;
      }
    }

    // Return TwiML response
    console.log('📝 Sending TwiML response:', responseTwiml);
    return new Response(responseTwiml, {
      headers: { 'Content-Type': 'application/xml' },
      status: 200,
    });

  } catch (error) {
    console.error('❌ IVR response handling failed:', {
      error: (error as Error).message,
      stack: (error as Error).stack,
      timestamp: new Date().toISOString()
    });
    
    // CRITICAL: Always return valid TwiML to prevent "Application Error"
    return createErrorTwiML('Sorry, there was an error processing your response. Please take your medication. Goodbye.');
  }
}

/**
 * Update medication status in database (BATCH version)
 * 
 * Uses .in() to update multiple records at once
 * Schema: medications table has 'is_taken' (boolean) column
 * 
 * IMPORTANT: Only medications table exists (no separate logs table)
 */
async function updateMedicationStatusBatch(
  medicationIds: string[], 
  logIds: string[], 
  status: string
): Promise<void> {
  try {
    console.log('💾 Attempting batch DB update:', { medicationIds, logIds, status });
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.warn('⚠️ Missing Supabase credentials for DB update');
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // CRITICAL: Only medications table exists (no medication_logs table)
    // Update medications table with ALL IDs in the batch
    if (medicationIds.length > 0) {
      console.log(`💾 Batch updating ${medicationIds.length} medications to is_taken=true...`);
      console.log('💾 Medication IDs being updated:', medicationIds);
      
      // Update all medications in one query using .in()
      const { error, count } = await supabase
        .from('medications')
        .update({ is_taken: true })
        .in('id', medicationIds);

      if (error) {
        console.error('❌ Failed to batch update medications:', {
          error: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          medicationIds: medicationIds
        });
      } else {
        console.log(`✅ SUCCESS: ${count || medicationIds.length} medications marked as taken`);
        console.log('✅ Updated medication IDs:', medicationIds);
      }
    } else {
      console.warn('⚠️ No medication IDs provided for database update');
      console.warn('⚠️ This means medications will NOT be marked as taken!');
    }
  } catch (error) {
    console.error('❌ Database batch update exception:', {
      error: (error as Error).message,
      stack: (error as Error).stack
    });
  }
}
