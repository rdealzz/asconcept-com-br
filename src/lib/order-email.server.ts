import * as React from 'react'
import { render } from '@react-email/render'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TEMPLATES } from '@/lib/email-templates/registry'

export type OrderEmailKind =
  | 'pedido-confirmado'
  | 'pedido-em-preparacao'
  | 'pedido-enviado'
  | 'pedido-entregue'

type OrderEmailData = {
  orderNumber: string
  customerName?: string
  total?: number
  items?: unknown[]
  trackingCode?: string
}

const SENDER_DOMAIN = 'notify.asconccept.com.br'
const FROM = 'A&S Conccept <noreply@asconccept.com.br>'

export async function enqueueOrderEmail(
  supabase: SupabaseClient,
  kind: OrderEmailKind,
  recipientEmail: string,
  data: OrderEmailData,
) {
  const recipient = recipientEmail.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new Error('E-mail do cliente inválido.')
  }
  const entry = TEMPLATES[kind]
  if (!entry) throw new Error(`Template de e-mail não encontrado: ${kind}`)

  const element = React.createElement(entry.component, data)
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ])
  const subject = typeof entry.subject === 'function' ? entry.subject(data) : entry.subject
  const messageId = crypto.randomUUID()

  const { error: logError } = await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: kind,
    recipient_email: recipient,
    status: 'pending',
  })
  if (logError) throw new Error('Não foi possível registrar o e-mail do pedido.')

  const { error } = await supabase.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      to: recipient,
      from: FROM,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text,
      purpose: 'transactional',
      label: kind,
      idempotency_key: `${kind}:${data.orderNumber}`,
      queued_at: new Date().toISOString(),
    },
  })
  if (error) {
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: kind,
      recipient_email: recipient,
      status: 'failed',
      error_message: 'Failed to enqueue email',
    })
    throw new Error('Não foi possível enfileirar o e-mail do pedido.')
  }
  return messageId
}