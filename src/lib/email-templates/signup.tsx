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
  <BrandLayout preview="Sua entrada na A&S Conccept começa aqui">
    <Heading style={styles.h1}>Que bom ter você por aqui</Heading>
    <Text style={styles.text}>
      A&amp;S Conccept nasceu de uma ideia simples: peças que atravessam o tempo, escolhidas
      uma a uma. A partir de agora, você faz parte desse círculo.
    </Text>
    <Text style={styles.text}>
      Falta só um gesto para abrir as portas: confirme o endereço{' '}
      {recipient ? <strong>{recipient}</strong> : 'de e-mail'} e sua conta estará pronta.
    </Text>
    <Button style={styles.button} href={confirmationUrl}>
      Confirmar meu e-mail
    </Button>
    <Text style={{ ...styles.muted, margin: '26px 0 0' }}>
      Se não foi você quem criou esta conta, pode ignorar esta mensagem com tranquilidade.
    </Text>
    <Text style={{ ...styles.text, margin: '22px 0 0' }}>
      Com carinho,
      <br />
      Equipe A&amp;S Conccept · The New Era of Heritage
    </Text>
  </BrandLayout>
)

export default SignupEmail
