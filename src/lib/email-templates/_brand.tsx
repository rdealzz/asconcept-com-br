import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

/**
 * Identidade visual compartilhada dos e-mails da A&S Conccept.
 * Paleta atemporal: Ivory, Navy, Charcoal e Gold.
 */
export const BRAND = {
  name: 'A&S Conccept',
  site: 'https://asconccept.com.br',
  email: 'asconccept@gmail.com',
  whatsapp: '(41) 99996-4035',
  ivory: '#F7F4EF',
  navy: '#1B2A41',
  charcoal: '#2B2B2B',
  gold: '#B99653',
  muted: '#6B6862',
  border: '#E4DED3',
}

export const styles = {
  main: {
    backgroundColor: '#ffffff',
    fontFamily: 'Georgia, "Times New Roman", serif',
    margin: 0,
    padding: '0 0 32px',
  },
  container: {
    maxWidth: '560px',
    margin: '0 auto',
    padding: '0',
  },
  header: {
    backgroundColor: BRAND.navy,
    padding: 0,
    textAlign: 'center' as const,
    fontSize: 0,
    lineHeight: 0,
  },
  banner: {
    display: 'block',
    width: '100%',
    maxWidth: '560px',
    height: 'auto',
    border: 0,
  },
  brand: {
    color: BRAND.ivory,
    fontSize: '22px',
    letterSpacing: '6px',
    textTransform: 'uppercase' as const,
    margin: 0,
  },
  brandRule: {
    color: BRAND.gold,
    fontSize: '10px',
    letterSpacing: '4px',
    textTransform: 'uppercase' as const,
    margin: '10px 0 0',
  },
  card: {
    backgroundColor: BRAND.ivory,
    padding: '40px 32px',
  },
  h1: {
    fontSize: '24px',
    fontWeight: 'normal' as const,
    color: BRAND.charcoal,
    margin: '0 0 18px',
    lineHeight: '1.25',
  },
  text: {
    fontFamily: 'Helvetica, Arial, sans-serif',
    fontSize: '14px',
    color: BRAND.charcoal,
    lineHeight: '1.7',
    margin: '0 0 18px',
  },
  muted: {
    fontFamily: 'Helvetica, Arial, sans-serif',
    fontSize: '12px',
    color: BRAND.muted,
    lineHeight: '1.6',
    margin: '0 0 8px',
  },
  button: {
    display: 'inline-block',
    backgroundColor: BRAND.charcoal,
    color: BRAND.ivory,
    fontFamily: 'Helvetica, Arial, sans-serif',
    fontSize: '11px',
    letterSpacing: '2px',
    textTransform: 'uppercase' as const,
    padding: '16px 34px',
    textDecoration: 'none',
  },
  link: { color: BRAND.navy, textDecoration: 'underline' },
  code: {
    fontFamily: 'Courier, monospace',
    fontSize: '28px',
    letterSpacing: '8px',
    color: BRAND.navy,
    backgroundColor: '#ffffff',
    border: `1px solid ${BRAND.border}`,
    padding: '18px 0',
    textAlign: 'center' as const,
    margin: '0 0 24px',
  },
  hr: { borderColor: BRAND.border, margin: '32px 0 20px' },
  footer: {
    fontFamily: 'Helvetica, Arial, sans-serif',
    fontSize: '11px',
    color: BRAND.muted,
    lineHeight: '1.7',
    margin: 0,
    textAlign: 'center' as const,
  },
}

export function BrandLayout({
  preview,
  children,
}: {
  preview: string
  children: React.ReactNode
}) {
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Img
              src={`${BRAND.site}/email-banner.png`}
              alt="A&S Conccept · Curadoria de Herança"
              width="560"
              style={styles.banner}
            />
          </Section>
          <Section style={styles.card}>{children}</Section>
          <Section style={{ padding: '24px 32px 0' }}>
            <Hr style={styles.hr} />
            <Text style={styles.footer}>
              {BRAND.name} ·{' '}
              <Link href={BRAND.site} style={styles.link}>
                asconccept.com.br
              </Link>
              <br />
              {BRAND.email} · {BRAND.whatsapp}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
