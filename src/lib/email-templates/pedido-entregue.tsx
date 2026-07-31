import * as React from 'react'
import { Heading, Text } from '@react-email/components'
import { BrandLayout, BRAND, styles } from './_brand'
import type { TemplateEntry } from './registry'

type Props = { orderNumber?: string; customerName?: string }

const PedidoEntregueEmail = ({ orderNumber = 'AS-000000', customerName }: Props) => (
  <BrandLayout preview={`Pedido ${orderNumber} entregue`}>
    <Text style={{ ...styles.muted, color: BRAND.gold, textTransform: 'uppercase' as const }}>
      Entrega concluída
    </Text>
    <Heading style={styles.h1}>Seu pedido foi entregue</Heading>
    <Text style={styles.text}>
      {customerName ? `Olá, ${customerName}. ` : ''}A entrega do pedido <strong>{orderNumber}</strong>{' '}
      foi concluída. Esperamos que cada peça acompanhe muitos momentos especiais.
    </Text>
    <Text style={styles.text}>Obrigado por fazer parte da A&amp;S Conccept.</Text>
  </BrandLayout>
)

export const template = {
  component: PedidoEntregueEmail,
  subject: (data) => `Pedido ${data.orderNumber ?? ''} entregue · A&S Conccept`,
  displayName: 'Pedido entregue',
  previewData: { orderNumber: 'AS-284731', customerName: 'Alexandre' },
} satisfies TemplateEntry