// Supabase Edge Function: Send SMS on admin approval
// Called manually from admin page when approving a registration

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from 'https://deno.land/std@0.208.0/crypto/mod.ts'
import { encodeHex } from 'https://deno.land/std@0.208.0/encoding/hex.ts'

const SOLAPI_API_KEY = Deno.env.get('SOLAPI_API_KEY')!
const SOLAPI_API_SECRET = Deno.env.get('SOLAPI_API_SECRET')!
const SOLAPI_SENDER = Deno.env.get('SOLAPI_SENDER_PHONE')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface SmsRequest {
  phone: string
  message: string
  registrationId: string
}

// Solapi HMAC-SHA256 인증 헤더 생성
async function getSolapiAuthHeader(): Promise<string> {
  const date = new Date().toISOString()
  const salt = crypto.randomUUID()
  const encoder = new TextEncoder()

  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(SOLAPI_API_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign(
    'HMAC', key, encoder.encode(date + salt)
  )

  return `HMAC-SHA256 apiKey=${SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${encodeHex(new Uint8Array(signature))}`
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const { phone, message, registrationId } = await req.json() as SmsRequest

    if (!phone || !message) {
      return new Response(JSON.stringify({ error: 'phone and message are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // 전화번호에서 숫자만 추출
    const cleanPhone = phone.replace(/\D/g, '')

    const authHeader = await getSolapiAuthHeader()

    // SMS 타입 결정: 90자 이하 SMS, 초과 LMS
    const smsType = message.length > 90 ? 'LMS' : 'SMS'

    const smsResponse = await fetch('https://api.solapi.com/messages/v4/send-many/detail', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify({
        messages: [{
          to: cleanPhone,
          from: SOLAPI_SENDER,
          text: message,
          type: smsType,
        }],
      }),
    })

    const smsResult = await smsResponse.json()
    console.log('SMS result:', JSON.stringify(smsResult))

    // DB에 발송 완료 기록
    if (registrationId) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
      await supabase.from('registrations').update({
        sms_sent: true,
        sms_sent_at: new Date().toISOString(),
      }).eq('id', registrationId)
    }

    return new Response(JSON.stringify({ success: true, smsResult }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (error) {
    console.error('SMS send failed:', error)
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
