import type { ComponentType } from 'react'
import { template as pedidoConfirmado } from './pedido-confirmado'
import { template as pedidoEmPreparacao } from './pedido-em-preparacao'
import { template as pedidoEnviado } from './pedido-enviado'
import { template as pedidoEntregue } from './pedido-entregue'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 *
 * Example:
 *   import { template as welcomeTemplate } from './welcome'
 *   // then add to TEMPLATES: 'welcome': welcomeTemplate
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  'pedido-confirmado': pedidoConfirmado,
  'pedido-em-preparacao': pedidoEmPreparacao,
  'pedido-enviado': pedidoEnviado,
  'pedido-entregue': pedidoEntregue,
}
