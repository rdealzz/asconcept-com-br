import * as React from 'react'
import { Button, Heading, Text } from '@react-email/components'
import { BrandLayout, styles } from './_brand'

interface RecoveryEmailProps {
  siteName?: string
  confirmationUrl?: string
}

export const RecoveryEmail = ({ confirmationUrl }: RecoveryEmailProps) => (
  <BrandLayout preview="Redefinição de senha · A&S Conccept">
    <Heading style={styles.h1}>Redefinir sua senha</Heading>
    <Text style={styles.text}>
      Recebemos um pedido para redefinir a senha da sua conta A&amp;S Conccept.
      Clique abaixo para escolher uma nova senha.
    </Text>
    <Button style={styles.button} href={confirmationUrl}>
      Criar nova senha
    </Button>
    <Text style={{ ...styles.muted, margin: '26px 0 0' }}>
      Se você não solicitou a alteração, ignore este e-mail — sua senha atual
      permanece inalterada.
    </Text>
  </BrandLayout>
)

export default RecoveryEmail
