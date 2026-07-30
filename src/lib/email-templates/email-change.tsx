import * as React from 'react'
import { Button, Heading, Text } from '@react-email/components'
import { BrandLayout, styles } from './_brand'

interface EmailChangeEmailProps {
  siteName?: string
  oldEmail?: string
  email?: string
  newEmail?: string
  confirmationUrl?: string
}

export const EmailChangeEmail = ({
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <BrandLayout preview="Confirme seu novo e-mail · A&S Conccept">
    <Heading style={styles.h1}>Confirmar novo e-mail</Heading>
    <Text style={styles.text}>
      Recebemos um pedido para alterar o e-mail da sua conta A&amp;S Conccept de{' '}
      <strong>{oldEmail}</strong> para <strong>{newEmail}</strong>.
    </Text>
    <Button style={styles.button} href={confirmationUrl}>
      Confirmar alteração
    </Button>
    <Text style={{ ...styles.muted, margin: '26px 0 0' }}>
      Se você não fez este pedido, proteja sua conta alterando a senha
      imediatamente.
    </Text>
  </BrandLayout>
)

export default EmailChangeEmail
