import * as React from 'react'
import { Heading, Section, Text } from '@react-email/components'
import { BrandLayout, BRAND, styles } from './_brand'
import type { TemplateEntry } from './registry'

type Props = { orderNumber?: string; customerName?: string; trackingCode?: string }

const PedidoEnviadoEmail = ({ orderNumber = 'AS-000000', customerName, trackingCode }: Props) => (
  <BrandLayout preview={`O pedido ${orderNumber} está a caminho`}>
    <Text style={{ ...styles.muted, color: BRAND.gold, textTransform: 'uppercase' as const }}>
      Atualização do pedido
    </Text>
    <Heading style={styles.h1}>A caminho de você</Heading>
    <Text style={styles.text}>
      {customerName ? `${customerName}, ` : ''}o pedido <strong>{orderNumber}</strong> deixou o
      ateliê e já está a caminho do endereço que você informou. Agora é só a expectativa —
      a melhor parte.
    </Text>
    {trackingCode ? (
      <Section style={{ border: `1px solid ${BRAND.border}`, padding: '18px', margin: '24px 0' }}>
        <Text style={{ ...styles.muted, margin: '0 0 6px', textTransform: 'uppercase' as const }}>
          Código de rastreio
        </Text>
        <Text style={{ ...styles.text, fontFamily: 'Courier, monospace', fontSize: '18px', margin: 0 }}>
          {trackingCode}
        </Text>
      </Section>
    ) : null}
    <Text style={styles.muted}>
      O rastreamento pode levar algumas horas para exibir a primeira movimentação.
    </Text>
    <Text style={{ ...styles.text, margin: '18px 0 0' }}>
      Com carinho,
      <br />
      Equipe A&amp;S Conccept · The New Era of Heritage
    </Text>
  </BrandLayout>
)

export const template = {
  component: PedidoEnviadoEmail,
  subject: (data) => `Pedido ${data.orderNumber ?? ''} enviado · A&S Conccept`,
  displayName: 'Pedido enviado',
  previewData: { orderNumber: 'AS-284731', customerName: 'Alexandre', trackingCode: 'AS123456BR' },
} satisfies TemplateEntry
