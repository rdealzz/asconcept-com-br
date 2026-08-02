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
    <Heading style={styles.h1}>Chegou. Agora é história sua</Heading>
    <Text style={styles.text}>
      {customerName ? `${customerName}, ` : ''}a entrega do pedido <strong>{orderNumber}</strong>{' '}
      foi concluída. Que essas peças acompanhem encontros, viagens e dias comuns — e envelheçam
      bem com você.
    </Text>
    <Text style={styles.text}>
      Se quiser, marque a A&amp;S Conccept nas suas redes: adoramos ver a curadoria ganhando vida
      fora do ateliê. E quando quiser somar uma nova peça,{' '}
      <a href={BRAND.site} style={styles.link}>
        nossa vitrine
      </a>{' '}
      está sempre por perto.
    </Text>
    <Text style={{ ...styles.text, margin: '18px 0 0' }}>
      Com carinho,
      <br />
      Equipe A&amp;S Conccept · The New Era of Heritage
    </Text>
  </BrandLayout>
)

export const template = {
  component: PedidoEntregueEmail,
  subject: (data) => `Pedido ${data.orderNumber ?? ''} entregue · A&S Conccept`,
  displayName: 'Pedido entregue',
  previewData: { orderNumber: 'AS-284731', customerName: 'Alexandre' },
} satisfies TemplateEntry
