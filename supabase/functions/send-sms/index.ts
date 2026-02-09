// Supabase Edge Function: Send SMS on new registration
// Triggered via Database Webhook on registrations table INSERT

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SOLAPI_API_KEY = Deno.env.get('SOLAPI_API_KEY')!
const SOLAPI_API_SECRET = Deno.env.get('SOLAPI_API_SECRET')!
const SOLAPI_SENDER = Deno.env.get('SOLAPI_SENDER_PHONE')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface Registration {
  id: string
  name: string
  phone: string
}

Deno.serve(async (req) => {
  try {
    const { record } = await req.json() as { record: Registration }
    const { id, name, phone } = record

    // Format message - 입금 안내 내용은 관리자가 수정
    const message =
      `[GILMO'S PEOPLE] ${name}님, 파티 신청이 접수되었습니다.\n\n` +
      `입금 안내:\n` +
      `- 계좌: [은행명] [계좌번호]\n` +
      `- 금액: [금액]원\n` +
      `- 예금주: [예금주명]\n\n` +
      `입금 확인 후 최종 승인 문자를 보내드립니다.`

    // Send SMS via Solapi API
    const timestamp = new Date().toISOString()
    const smsResponse = await fetch('https://api.solapi.com/messages/v4/send-many/detail', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `HMAC-SHA256 apiKey=${SOLAPI_API_KEY}, date=${timestamp}, salt=${crypto.randomUUID()}, signature=`,
      },
      body: JSON.stringify({
        messages: [{
          to: phone,
          from: SOLAPI_SENDER,
          text: message,
          type: 'LMS',
        }],
      }),
    })

    const smsResult = await smsResponse.json()

    // Update registration record
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    await supabase.from('registrations').update({
      sms_sent: true,
      sms_sent_at: new Date().toISOString(),
    }).eq('id', id)

    return new Response(JSON.stringify({ success: true, smsResult }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('SMS send failed:', error)
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
