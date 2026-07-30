import * as React from 'react'
import { Button, Heading, Text } from '@react-email/components'
import { BrandLayout, styles } from './_brand'

interface SignupEmailProps {
  siteName?: string
  siteUrl?: string
  recipient?: string
  confirmationUrl?: string
}

export const SignupEmail = ({ recipient, confirmationUrl }: SignupEmailProps) => (
  <BrandLayout preview="Confirme seu e-mail na A&S Conccept">
    <Heading style={styles.h1}>Bem-vindo à A&amp;S Conccept</Heading>
    <Text style={styles.text}>
      Sua conta foi criada. Para concluir o cadastro e acessar a nossa curadoria,
      confirme o endereço {recipient ? <strong>{recipient}</strong> : 'de e-mail'}.
    </Text>
    <Button style={styles.button} href={confirmationUrl}>
      Confirmar meu e-mail
    </Button>
    <Text style={{ ...styles.muted, margin: '26px 0 0' }}>
      Se você não criou esta conta, basta ignorar esta mensagem.
    </Text>
  </BrandLayout>
)

export default SignupEmail
