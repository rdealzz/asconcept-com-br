import * as React from 'react'
import { Button, Heading, Text } from '@react-email/components'
import { BrandLayout, styles } from './_brand'

interface InviteEmailProps {
  siteName?: string
  siteUrl?: string
  confirmationUrl?: string
}

export const InviteEmail = ({ confirmationUrl }: InviteEmailProps) => (
  <BrandLayout preview="Você foi convidado para a A&S Conccept">
    <Heading style={styles.h1}>Um convite para a A&amp;S Conccept</Heading>
    <Text style={styles.text}>
      Você foi convidado a criar sua conta e acessar nossa curadoria de peças
      atemporais. Aceite o convite abaixo para começar.
    </Text>
    <Button style={styles.button} href={confirmationUrl}>
      Aceitar convite
    </Button>
    <Text style={{ ...styles.muted, margin: '26px 0 0' }}>
      Se você não esperava este convite, pode ignorar esta mensagem.
    </Text>
  </BrandLayout>
)

export default InviteEmail
