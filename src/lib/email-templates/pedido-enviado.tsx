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
    <Heading style={styles.h1}>Seu pedido foi enviado</Heading>
    <Text style={styles.text}>
      {customerName ? `Olá, ${customerName}. ` : ''}As peças do pedido <strong>{orderNumber}</strong>{' '}
      partiram do nosso ateliê e estão a caminho do endereço informado.
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
    <Text style={styles.muted}>O rastreamento pode levar algumas horas para ser atualizado.</Text>
  </BrandLayout>
)

export const template = {
  component: PedidoEnviadoEmail,
  subject: (data) => `Pedido ${data.orderNumber ?? ''} enviado · A&S Conccept`,
  displayName: 'Pedido enviado',
  previewData: { orderNumber: 'AS-284731', customerName: 'Alexandre', trackingCode: 'AS123456BR' },
} satisfies TemplateEntry