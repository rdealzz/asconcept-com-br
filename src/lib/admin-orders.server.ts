import type { SupabaseClient } from '@supabase/supabase-js'
import { enqueueOrderEmail, type OrderEmailKind } from '@/lib/order-email.server'
import type { OrderStatus } from '@/lib/types'

type AdminStatusInput = {
  orderNumber: string
  status: OrderStatus
  trackingCode?: string
}

type OrderRow = {
  order_number: string
  status: string
  customer_email: string
  customer_name: string | null
  tracking_code: string | null
  preparation_mail_sent: boolean
  shipped_mail_sent: boolean
  delivered_mail_sent: boolean
}

const emailForStatus: Partial<Record<OrderStatus, { kind: OrderEmailKind; flag: keyof OrderRow }>> = {
  'Preparando pedido': { kind: 'pedido-em-preparacao', flag: 'preparation_mail_sent' },
  'Em trânsito': { kind: 'pedido-enviado', flag: 'shipped_mail_sent' },
  Entregue: { kind: 'pedido-entregue', flag: 'delivered_mail_sent' },
}

export async function updateAdminOrderStatusCore(
  supabaseAdmin: SupabaseClient,
  input: AdminStatusInput,
) {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select(
      'order_number, status, customer_email, customer_name, tracking_code, preparation_mail_sent, shipped_mail_sent, delivered_mail_sent',
    )
    .eq('order_number', input.orderNumber)
    .maybeSingle()
  if (error || !data) throw new Error('Pedido não encontrado.')
  const order = data as OrderRow
  const trackingCode = input.trackingCode?.trim().toUpperCase() || order.tracking_code

  const { error: updateError } = await supabaseAdmin
    .from('orders')
    .update({
      status: input.status,
      tracking_code: trackingCode || null,
      updated_at: new Date().toISOString(),
    })
    .eq('order_number', input.orderNumber)
  if (updateError) throw new Error('Não foi possível atualizar o pedido.')

  const email = emailForStatus[input.status]
  let emailQueued = false
  if (email && order[email.flag] !== true) {
    await enqueueOrderEmail(supabaseAdmin, email.kind, order.customer_email, {
      orderNumber: order.order_number,
      customerName: order.customer_name ?? undefined,
      trackingCode: trackingCode ?? undefined,
    })
    const { error: flagError } = await supabaseAdmin
      .from('orders')
      .update({ [email.flag]: true })
      .eq('order_number', input.orderNumber)
    if (flagError) throw new Error('O e-mail foi enfileirado, mas seu registro não pôde ser atualizado.')
    emailQueued = true
  }

  return { ok: true, emailQueued, trackingCode: trackingCode ?? undefined }
}