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
    <Heading style={styles.h1}>Suas peças estão em boas mãos</Heading>
    <Text style={styles.text}>
      {customerName ? `${customerName}, ` : ''}o pedido <strong>{orderNumber}</strong> acabou de
      entrar em preparação. Cada peça é conferida, dobrada e embalada à mão — do caimento ao
      acabamento, nada segue adiante sem passar por esse olhar.
    </Text>
    <Text style={styles.muted}>
      Avisaremos assim que ele deixar o ateliê, já com o código de rastreio.
    </Text>
    <Text style={{ ...styles.text, margin: '18px 0 0' }}>
      Com carinho,
      <br />
      Equipe A&amp;S Conccept · The New Era of Heritage
    </Text>
  </BrandLayout>
)

export const template = {
  component: PedidoEmPreparacaoEmail,
  subject: (data) => `Pedido ${data.orderNumber ?? ''} em preparação · A&S Conccept`,
  displayName: 'Pedido em preparação',
  previewData: { orderNumber: 'AS-284731', customerName: 'Alexandre' },
} satisfies TemplateEntry
