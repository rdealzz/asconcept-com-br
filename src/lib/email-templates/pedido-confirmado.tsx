import * as React from 'react'
import { Heading, Hr, Row, Section, Text } from '@react-email/components'
import { BrandLayout, BRAND, styles } from './_brand'
import type { TemplateEntry } from './registry'

type OrderItem = {
  name?: string
  size?: string
  quantity?: number
  price?: number
}

type Props = {
  orderNumber?: string
  customerName?: string
  total?: number
  items?: OrderItem[]
}

const formatBRL = (value = 0) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const PedidoConfirmadoEmail = ({
  orderNumber = 'AS-000000',
  customerName,
  total = 0,
  items = [],
}: Props) => (
  <BrandLayout preview={`Pagamento aprovado · Pedido ${orderNumber}`}>
    <Text style={{ ...styles.muted, color: BRAND.gold, textTransform: 'uppercase' as const }}>
      Pagamento aprovado
    </Text>
    <Heading style={styles.h1}>Pedido confirmado</Heading>
    <Text style={styles.text}>
      {customerName ? `Olá, ${customerName}. ` : ''}Obrigado por escolher a A&amp;S Conccept.
      O pagamento do pedido <strong>{orderNumber}</strong> foi aprovado e o nosso ateliê dará
      início à preparação das suas peças.
    </Text>
    <Section style={{ margin: '26px 0' }}>
      {items.map((item, index) => (
        <Row key={`${item.name ?? 'item'}-${index}`}>
          <Text style={{ ...styles.text, margin: '0 0 8px' }}>
            {item.quantity ?? 1}× {item.name ?? 'Peça'}
            {item.size ? ` · Tam. ${item.size}` : ''}
            {typeof item.price === 'number' ? ` · ${formatBRL(item.price * (item.quantity ?? 1))}` : ''}
          </Text>
        </Row>
      ))}
      <Hr style={styles.hr} />
      <Text style={{ ...styles.text, fontSize: '17px', margin: 0 }}>
        Total <strong>{formatBRL(total)}</strong>
      </Text>
    </Section>
    <Text style={styles.muted}>Avisaremos por e-mail a cada nova etapa do seu pedido.</Text>
  </BrandLayout>
)

export const template = {
  component: PedidoConfirmadoEmail,
  subject: (data) => `Pedido ${data.orderNumber ?? ''} confirmado · A&S Conccept`,
  displayName: 'Pedido confirmado',
  previewData: {
    orderNumber: 'AS-284731',
    customerName: 'Alexandre',
    total: 749.9,
    items: [{ name: 'Camisa de linho', size: 'M', quantity: 1, price: 749.9 }],
  },
} satisfies TemplateEntry