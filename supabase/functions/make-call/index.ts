import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import twilio from "npm:twilio@^4.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // 1. Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 2. Get data from request
    const { phoneNumber, userName, medicationName } = await req.json();

    // 3. Get Twilio secrets from environment
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!accountSid || !authToken || !fromNumber) {
      throw new Error("Missing Twilio secrets in Supabase!");
    }

    // 4. Initialize Twilio client
    const client = twilio(accountSid, authToken);

    // 5. Construct TwiML voice message
    const twiml = `
      <Response>
        <Pause length="1"/>
        <Say voice="alice">
          Hello ${userName || 'User'}.
          This is a reminder to take your ${medicationName || 'Medication'}.
          Please take it now.
        </Say>
        <Hangup/>
      </Response>
    `;

    // 6. Make the call
    const call = await client.calls.create({
      twiml: twiml,
      to: phoneNumber,
      from: fromNumber,
      timeLimit: 45,
    });

    console.log(`Call started: ${call.sid}`);

    return new Response(
      JSON.stringify({ success: true, callSid: call.sid }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('❌ Twilio call creation failed:', {
      error: (error as Error).message,
      phoneNumber,
      userName,
      medicationName,
      timestamp: new Date().toISOString()
    });
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
