import * as React from 'react'
import { Button, Heading, Text } from '@react-email/components'
import { BrandLayout, styles } from './_brand'

interface RecoveryEmailProps {
  siteName?: string
  confirmationUrl?: string
}

export const RecoveryEmail = ({ confirmationUrl }: RecoveryEmailProps) => (
  <BrandLayout preview="Sua nova senha A&S Conccept está a um clique">
    <Heading style={styles.h1}>Vamos recuperar seu acesso</Heading>
    <Text style={styles.text}>
      Acontece com todo mundo. Recebemos um pedido para redefinir a senha da sua conta
      A&amp;S Conccept — o botão abaixo leva você direto à criação de uma nova senha.
    </Text>
    <Button style={styles.button} href={confirmationUrl}>
      Criar nova senha
    </Button>
    <Text style={{ ...styles.muted, margin: '26px 0 0' }}>
      Este link é pessoal e tem validade limitada. Se não foi você quem pediu, ignore este
      e-mail: sua senha atual continua exatamente como está.
    </Text>
    <Text style={{ ...styles.text, margin: '22px 0 0' }}>
      Com carinho,
      <br />
      Equipe A&amp;S Conccept · The New Era of Heritage
    </Text>
  </BrandLayout>
)

export default RecoveryEmail
