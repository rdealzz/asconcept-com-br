import * as React from 'react'
import { render } from '@react-email/render'
import { parseEmailWebhookPayload } from '@lovable.dev/email-js'
import { WebhookError, verifyWebhookRequest } from '@lovable.dev/webhooks-js'
import { createFileRoute } from '@tanstack/react-router'
import { SignupEmail } from '@/lib/email-templates/signup'
import { InviteEmail } from '@/lib/email-templates/invite'
import { MagicLinkEmail } from '@/lib/email-templates/magic-link'
import { RecoveryEmail } from '@/lib/email-templates/recovery'
import { EmailChangeEmail } from '@/lib/email-templates/email-change'
import { ReauthenticationEmail } from '@/lib/email-templates/reauthentication'

const EMAIL_SUBJECTS: Record<string, string> = {
  signup: 'Confirme seu e-mail · A&S Conccept',
  invite: 'Você foi convidado · A&S Conccept',
  magiclink: 'Seu link de acesso · A&S Conccept',
  recovery: 'Redefinição de senha · A&S Conccept',
  email_change: 'Confirme seu novo e-mail · A&S Conccept',
  reauthentication: 'Seu código de verificação · A&S Conccept',
}

// Template mapping
const EMAIL_TEMPLATES: Record<string, React.ComponentType<any>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
}

// Configuration
const SITE_NAME = "A&S Conccept"
const SENDER_DOMAIN = "notify.asconccept.com.br"
const ROOT_DOMAIN = "asconccept.com.br"
const FROM_DOMAIN = "asconccept.com.br"

function redactEmail(email: string | null | undefined): string {
  if (!email) return '***'
  const [localPart, domain] = email.split('@')
  if (!localPart || !domain) return '***'
  return `${localPart[0]}***@${domain}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Route = (createFileRoute("/lovable/email/auth/webhook") as any)({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const apiKey = process.env.LOVABLE_API_KEY

        if (!apiKey) {
          console.error('LOVABLE_API_KEY not configured')
          return Response.json(
            { error: 'Server configuration error' },
            { status: 500 }
          )
        }

        // Verify signature + timestamp, then parse payload.
        let payload: any
        let run_id = ''
        try {
          const verified = await verifyWebhookRequest({
            req: request,
            secret: apiKey,
            parser: parseEmailWebhookPayload,
          })
          payload = verified.payload
          run_id = payload.run_id
        } catch (error) {
          if (error instanceof WebhookError) {
            switch (error.code) {
              case 'invalid_signature':
              case 'missing_timestamp':
              case 'invalid_timestamp':
              case 'stale_timestamp':
                console.error('Invalid webhook signature', { error: error.message })
                return Response.json(
                  { error: 'Invalid signature' },
                  { status: 401 }
                )
              case 'invalid_payload':
              case 'invalid_json':
                console.error('Invalid webhook payload', { error: error.message })
                return Response.json(
                  { error: 'Invalid webhook payload' },
                  { status: 400 }
                )
            }
          }

          console.error('Webhook verification failed', { error })
          return Response.json(
            { error: 'Invalid webhook payload' },
            { status: 400 }
          )
        }

        if (!run_id) {
          console.error('Webhook payload missing run_id')
          return Response.json(
            { error: 'Invalid webhook payload' },
            { status: 400 }
          )
        }

        if (payload.version !== '1') {
          console.error('Unsupported payload version', { version: payload.version, run_id })
          return Response.json(
            { error: `Unsupported payload version: ${payload.version}` },
            { status: 400 }
          )
        }

        // The email action type is in payload.data.action_type (e.g., "signup", "recovery")
        // payload.type is the hook event type ("auth")
        const emailType = payload.data.action_type
        console.log('Received auth event', {
          emailType,
          email_redacted: redactEmail(payload.data.email),
          run_id,
        })

        // Daqui para baixo a assinatura já foi conferida e o pedido é legítimo.
        //
        // O Auth trata QUALQUER resposta não-2xx deste hook como falha de envio
        // e desfaz a transação inteira do /signup — o visitante recebe um 500
        // genérico e a conta NÃO chega a existir. Ou seja: um soluço da fila de
        // e-mail (chave de serviço no formato novo, pgmq indisponível, template
        // que não renderiza) derrubava o cadastro de todo mundo, não só o
        // e-mail. Por isso, a partir daqui nada devolve erro: a falha é
        // registrada em email_send_log com status 'failed' e respondemos 200.
        // A conta é criada, e o visitante pede um novo link de confirmação pela
        // própria tela de cadastro (`supabase.auth.resend`).
        const messageId = crypto.randomUUID()
        const recipient = payload.data.email

        const logFailure = async (reason: string) => {
          try {
            const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
            await supabaseAdmin.from('email_send_log').insert({
              message_id: messageId,
              template_name: emailType,
              recipient_email: recipient,
              status: 'failed',
              error_message: reason,
            })
          } catch (logError) {
            console.error('Failed to record auth email failure', { error: logError, run_id })
          }
        }

        try {
          const EmailTemplate = EMAIL_TEMPLATES[emailType]
          if (!EmailTemplate) {
            console.error('Unknown email type', { emailType, run_id })
            await logFailure(`Unknown email type: ${emailType}`)
            return Response.json({ success: true, queued: false })
          }

          // Build template props from payload.data (HookData structure)
          const templateProps = {
            siteName: SITE_NAME,
            siteUrl: `https://${ROOT_DOMAIN}`,
            recipient,
            confirmationUrl: payload.data.url,
            token: payload.data.token,
            email: recipient,
            oldEmail: payload.data.old_email,
            newEmail: payload.data.new_email,
          }

          // Render React Email to HTML and plain text
          const element = React.createElement(EmailTemplate, templateProps)
          const html = await render(element)
          const text = await render(element, { plainText: true })

          // Enqueue email for async processing by the dispatcher (process-email-queue).
          // Usamos o cliente de serviço compartilhado: ele já remove o
          // `Authorization: Bearer` quando a chave é do formato novo
          // (`sb_secret_…`), que o PostgREST recusa como JWT. Montar um
          // createClient cru aqui fazia toda chamada de serviço voltar 401.
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

          // Log pending BEFORE enqueue so we have a record even if enqueue crashes
          await supabaseAdmin.from('email_send_log').insert({
            message_id: messageId,
            template_name: emailType,
            recipient_email: recipient,
            status: 'pending',
          })

          const { error: enqueueError } = await supabaseAdmin.rpc('enqueue_email', {
            queue_name: 'auth_emails',
            payload: {
              run_id,
              message_id: messageId,
              to: recipient,
              from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
              sender_domain: SENDER_DOMAIN,
              subject: EMAIL_SUBJECTS[emailType] || 'Notification',
              html,
              text,
              purpose: 'transactional',
              label: emailType,
              queued_at: new Date().toISOString(),
            },
          })

          if (enqueueError) {
            console.error('Failed to enqueue auth email', { error: enqueueError, run_id, emailType })
            await logFailure('Failed to enqueue email')
            return Response.json({ success: true, queued: false })
          }
        } catch (error) {
          console.error('Auth email hook failed', { error, run_id, emailType })
          await logFailure('Auth email hook threw before enqueue')
          return Response.json({ success: true, queued: false })
        }

        console.log('Auth email enqueued', {
          emailType,
          email_redacted: redactEmail(recipient),
          run_id,
        })

        return Response.json({ success: true, queued: true })
      },
    },
  },
})
