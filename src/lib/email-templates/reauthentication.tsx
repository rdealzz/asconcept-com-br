import * as React from 'react'
import { Heading, Text } from '@react-email/components'
import { BrandLayout, styles } from './_brand'

interface ReauthenticationEmailProps {
  token?: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <BrandLayout preview="Seu código de verificação · A&S Conccept">
    <Heading style={styles.h1}>Código de verificação</Heading>
    <Text style={styles.text}>
      Use o código abaixo para confirmar sua identidade na A&amp;S Conccept:
    </Text>
    <Text style={styles.code}>{token}</Text>
    <Text style={{ ...styles.muted, margin: '10px 0 0' }}>
      O código expira em poucos minutos. Se não foi você, ignore esta mensagem.
    </Text>
  </BrandLayout>
)

export default ReauthenticationEmail
