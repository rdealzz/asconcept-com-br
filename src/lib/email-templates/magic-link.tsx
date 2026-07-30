import * as React from 'react'
import { Button, Heading, Text } from '@react-email/components'
import { BrandLayout, styles } from './_brand'

interface MagicLinkEmailProps {
  siteName?: string
  confirmationUrl?: string
}

export const MagicLinkEmail = ({ confirmationUrl }: MagicLinkEmailProps) => (
  <BrandLayout preview="Seu acesso à A&S Conccept">
    <Heading style={styles.h1}>Seu link de acesso</Heading>
    <Text style={styles.text}>
      Use o botão abaixo para entrar na sua conta A&amp;S Conccept. O link é
      pessoal e expira em pouco tempo.
    </Text>
    <Button style={styles.button} href={confirmationUrl}>
      Entrar na minha conta
    </Button>
    <Text style={{ ...styles.muted, margin: '26px 0 0' }}>
      Se você não solicitou este acesso, ignore esta mensagem.
    </Text>
  </BrandLayout>
)

export default MagicLinkEmail
