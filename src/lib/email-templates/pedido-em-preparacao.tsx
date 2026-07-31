import * as React from 'react'
import { Heading, Text } from '@react-email/components'
import { BrandLayout, BRAND, styles } from './_brand'
import type { TemplateEntry } from './registry'

type Props = { orderNumber?: string; customerName?: string }

const PedidoEmPreparacaoEmail = ({ orderNumber = 'AS-000000', customerName }: Props) => (
  <BrandLayout preview={`O pedido ${orderNumber} está em preparação`}>
    <Text style={{ ...styles.muted, color: BRAND.gold, textTransform: 'uppercase' as const }}>
      Atualização do pedido
    </Text>
    <Heading style={styles.h1}>Seu pedido está em preparação</Heading>
    <Text style={styles.text}>
      {customerName ? `Olá, ${customerName}. ` : ''}Nosso ateliê iniciou a preparação cuidadosa
      das peças do pedido <strong>{orderNumber}</strong>. Cada detalhe está sendo conferido antes
      do envio.
    </Text>
    <Text style={styles.muted}>Você receberá uma nova mensagem assim que o pedido partir.</Text>
  </BrandLayout>
)

export const template = {
  component: PedidoEmPreparacaoEmail,
  subject: (data) => `Pedido ${data.orderNumber ?? ''} em preparação · A&S Conccept`,
  displayName: 'Pedido em preparação',
  previewData: { orderNumber: 'AS-284731', customerName: 'Alexandre' },
} satisfies TemplateEntry