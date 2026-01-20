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

interface CallRequestBody {
  phoneNumber: string;
  userName?: string;
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
 */
async function handleInitialCall(req: Request): Promise<Response> {
  try {
    console.log('🎯 handleInitialCall: Starting...');
    const { phoneNumber, userName, medicationName, medicationId, logId } = await req.json() as CallRequestBody;
    console.log('🎯 handleInitialCall: Request body parsed:', { phoneNumber, userName, medicationName, medicationId, logId });

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

    // Build callback URL with context
    const callbackUrl = `${origin}/functions/v1/make-call?flow=process_response&medicationId=${encodeURIComponent(medicationId || '')}&logId=${encodeURIComponent(logId || '')}&userName=${encodeURIComponent(userName || 'User')}&medicationName=${encodeURIComponent(medicationName || 'medication')}`;

    // CRITICAL: Escape ampersands for valid XML
    const xmlSafeCallbackUrl = callbackUrl.replace(/&/g, '&amp;');

    // Debug: Verify the URL is public
    console.log('🔗 Origin:', origin);
    console.log('🔗 Generated callback URL:', callbackUrl);
    console.log('🔗 XML-safe callback URL:', xmlSafeCallbackUrl);

    console.log('🎯 Generating TwiML for flow: initial');
    // Generate TwiML with IVR
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="5" numDigits="1" action="${xmlSafeCallbackUrl}" method="POST" speechTimeout="auto">
    <Say voice="alice">
      Hello! It is time for your medication. Did you take it? Press 1 for Yes, or Press 2 for No.
    </Say>
  </Gather>
  <Say voice="alice">No response received. Please take your medication soon. Goodbye.</Say>
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
      JSON.stringify({ success: true, callSid: call.sid }),
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
 */
async function handleIVRResponse(req: Request, url: URL): Promise<Response> {
  try {
    console.log('🎯 handleIVRResponse: Starting...');
    
    // Get context from query params
    const medicationId = url.searchParams.get('medicationId');
    const logId = url.searchParams.get('logId');
    const userName = escapeXML(url.searchParams.get('userName') || 'there');
    const medicationName = escapeXML(url.searchParams.get('medicationName') || 'medication');

    console.log('🔍 Extracted from URL query params:', { 
      medicationId: medicationId || '(null)',
      logId: logId || '(null)',
      userName,
      medicationName
    });

    // Parse form data from Twilio webhook
    const formData = await req.formData();
    const speechResult = formData.get('SpeechResult')?.toString().toLowerCase() || '';
    const digits = formData.get('Digits')?.toString() || '';

    console.log('📞 IVR Response received:', { speechResult, digits, medicationId, logId });

    // Determine user's response
    const saidYes = speechResult.includes('yes') || speechResult.includes('took') || speechResult.includes('done') || digits === '1';
    const saidNo = speechResult.includes('no') || speechResult.includes('not') || digits === '2';

    let responseTwiml: string;

    if (saidYes) {
      // User confirmed they took medication
      console.log('✅ User confirmed medication taken');

      // Update database if we have the IDs
      if (medicationId || logId) {
        console.log('💾 Triggering database update with:', { medicationId, logId });
        await updateMedicationStatus(medicationId, logId, 'taken');
      } else {
        console.warn('⚠️ Cannot update database - both medicationId and logId are null');
      }

      responseTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">
    Great job ${userName}! I've marked ${medicationName} as taken. Take care and stay healthy!
  </Say>
  <Hangup/>
</Response>`;

    } else if (saidNo) {
      // User said they haven't taken it
      console.log('⚠️ User has not taken medication');

      responseTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">
    Okay ${userName}. Please remember to take your ${medicationName} soon. It's important for your health. Goodbye.
  </Say>
  <Hangup/>
</Response>`;

    } else {
      // Unclear response - ask again (one retry)
      const retryAttempt = url.searchParams.get('retry');
      const origin = Deno.env.get('SUPABASE_URL') || '';
      console.log('🔗 Retry origin:', origin);
      
      if (retryAttempt === '1') {
        // Already retried once, give up
        responseTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">
    I'm having trouble understanding. Please take your ${medicationName} when you can. Goodbye.
  </Say>
  <Hangup/>
</Response>`;
      } else {
        // Retry once - use public URL
        const retryUrl = `${origin}/functions/v1/make-call?flow=process_response&medicationId=${encodeURIComponent(medicationId || '')}&logId=${encodeURIComponent(logId || '')}&userName=${encodeURIComponent(userName)}&medicationName=${encodeURIComponent(medicationName)}&retry=1`;
        
        // CRITICAL: Escape ampersands for valid XML
        const xmlSafeRetryUrl = retryUrl.replace(/&/g, '&amp;');
        
        console.log('🔗 Generated retry URL:', retryUrl);
        console.log('🔗 XML-safe retry URL:', xmlSafeRetryUrl);

        responseTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">I didn't quite catch that.</Say>
  <Gather input="speech dtmf" timeout="5" numDigits="1" action="${xmlSafeRetryUrl}" method="POST" speechTimeout="auto">
    <Say voice="alice">
      Did you take your ${medicationName}?
      Say Yes or press 1.
      Say No or press 2.
    </Say>
  </Gather>
  <Say voice="alice">No response received. Please take your medication soon. Goodbye.</Say>
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
 * Update medication status in database
 * 
 * Schema: medications table has 'is_taken' (boolean) column, NOT 'last_taken_at'
 */
async function updateMedicationStatus(medicationId: string | null, logId: string | null, status: string): Promise<void> {
  try {
    console.log('💾 Attempting DB update:', { medicationId, logId, status });
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.warn('⚠️ Missing Supabase credentials for DB update');
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Prioritize medicationId since logId is often empty
    const targetId = medicationId || logId;
    
    if (!targetId) {
      console.warn('⚠️ No ID available for database update (both medicationId and logId are null)');
      return;
    }

    if (logId) {
      // Update medication log entry (if logs table exists and has logId)
      console.log('💾 Updating medication_logs table...');
      const { error } = await supabase
        .from('medication_logs')
        .update({ status, taken_at: new Date().toISOString() })
        .eq('id', logId);

      if (error) {
        console.error('❌ Failed to update medication log:', error);
      } else {
        console.log('✅ Medication log updated:', { logId, status });
      }
    }
    
    // Always update medications table if we have medicationId
    if (medicationId) {
      console.log('💾 Updating medications table...');
      console.log('💾 Target medication ID:', medicationId);
      
      // CRITICAL: Only update 'is_taken' column (last_taken_at does NOT exist in schema)
      const { error } = await supabase
        .from('medications')
        .update({ is_taken: true })
        .eq('id', medicationId);

      if (error) {
        console.error('❌ Failed to update medication:', {
          error: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
      } else {
        console.log('✅ Medication updated successfully:', { medicationId, is_taken: true });
      }
    }
  } catch (error) {
    console.error('❌ Database update exception:', {
      error: (error as Error).message,
      stack: (error as Error).stack
    });
  }
}
