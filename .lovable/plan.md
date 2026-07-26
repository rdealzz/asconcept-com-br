## Migração Stripe → Mercado Pago (Checkout API / Bricks)

### Observação importante antes de começar
A tabela de pedidos do projeto se chama **`public.orders`** (colunas: `order_number`, `items`, `address`, `subtotal`, `discount`, `shipping_cost`, `total`, `payment_method`, `status`, `stripe_session_id`, `stock_decremented`, `customer_phone`, ...). Não existe `as_orders_v2` no banco. Vou trabalhar sobre `orders` e apenas **acrescentar** colunas de Mercado Pago — se você quiser mesmo renomear/criar `as_orders_v2`, me diga antes, porque isso reescreveria RLS, dashboard admin e e-mails.

---

## 1. Mapa do que hoje depende do Stripe

| Arquivo | Papel hoje | Destino |
|---|---|---|
| `src/lib/stripe.server.ts` | Cliente Stripe via gateway Lovable + verificação de webhook HMAC | **Substituído** por `src/lib/mercadopago.server.ts` (fetch direto na API do MP com `Bearer $MP_ACCESS_TOKEN`, idempotency key, tratamento de erro) |
| `src/lib/stripe.ts` | Carrega `@stripe/stripe-js` com `VITE_PAYMENTS_CLIENT_TOKEN` | **Substituído** por `src/lib/mercadopago.ts` (carrega SDK v2 do MP com a Public Key) |
| `src/lib/checkout.functions.ts` | `placeSecureOrder`, `createStripeHostedSession`, `confirmStripePayment` | Mantém `placeSecureOrder` (pedidos manuais). Novas server functions: `createPendingOrder`, `payWithCardToken`, `createPixPayment`, `getPaymentStatus`. As funções Stripe são removidas |
| `src/routes/api/public/payments/webhook.ts` | Webhook Stripe (`checkout.session.completed` → status + `consume_order_stock`) | **Novo** `src/routes/api/public/payments/mercadopago.ts` com validação de assinatura `x-signature`; o webhook Stripe é removido |
| `src/routes/checkout.tsx` | Etapa 1 (dados) → Etapa 2 redireciona para Stripe | Etapa 2 passa a renderizar Brick de cartão ou tela de Pix, **sem sair do site** |
| `src/routes/sucesso.tsx` | Confirma via `session_id` do Stripe | Passa a confirmar via `order_number` + polling de status do pagamento MP |
| `src/lib/types.ts`, `pedidos.index.tsx`, `pedidos.$id.tsx` | `PaymentMethod = "stripe"`, rótulo "Stripe (Cartão / PIX)" | Novos métodos `"mp_card"` / `"mp_pix"` e rótulos correspondentes; pedidos antigos com `"stripe"` continuam legíveis |
| `package.json` | `stripe`, `@stripe/stripe-js` | Removidos; entra `@mercadopago/sdk-react` (Bricks) |

---

## 2. Card Payment Brick no frontend

- Carregar o SDK oficial e inicializar com a **Public Key de produção** (`VITE_MP_PUBLIC_KEY`), via `initMercadoPago(publicKey, { locale: "pt-BR" })`.
- Renderizar o **Card Payment Brick** na Etapa 2 do checkout, passando `amount` (total já calculado pelo servidor) e `payer.email`.
- O Brick já faz sozinho: detecção de bandeira, consulta de parcelas disponíveis (`installments`), validação de campos e **tokenização** — o número do cartão vai direto do navegador para o Mercado Pago; nosso backend recebe apenas o `token`, `payment_method_id`, `issuer_id` e `installments`. Nenhum PAN/CVV trafega ou é logado no nosso servidor.
- Personalização visual pelo objeto `customization.visual.style`: `theme: "flat"`, `customVariables` (cores ivory/navy/charcoal/dourado lidas dos tokens do design system, `borderRadiusMedium: 0`, `inputBackgroundColor`, `textPrimaryColor`, `baseColor` dourado no botão) + `fontSizeExtraSmall/Medium` para acompanhar a tipografia serifada. O botão de pagar do Brick recebe label em PT-BR; o container fica dentro do mesmo card do resumo, com o mesmo espaçamento das etapas atuais.
- Estados de carregamento/erro tratados com os componentes de UI já existentes (skeleton + toast), sem alerts nativos.

---

## 3. Cobrança Pix dentro do site

- Aba/segmento "Pix" na Etapa 2 (só aparece quando `PIX_ENABLED` estiver `true`; hoje está `false` — reativo junto nesta migração, já que o Pix passa a ser do MP e não do Stripe).
- Ao confirmar, o frontend chama `createPixPayment` (server function). O backend cria um pagamento MP com `payment_method_id: "pix"` e retorna `qr_code_base64`, `qr_code` (copia-e-cola), `payment_id` e validade.
- Tela própria estilizada: QR em moldura ivory com borda dourada, botão "Copiar código", contador de expiração, aviso de confirmação automática e link para o pedido. Polling leve (`getPaymentStatus` a cada ~5s, com backoff e limite) para avançar para a tela de sucesso assim que o webhook marcar como pago.
- O desconto de 5% no Pix volta a ser exibido apenas quando a flag estiver ativa, e continua recalculado no servidor.

---

## 4. Backend: criação do pagamento

Fluxo em duas chamadas, para o preço nunca vir do cliente:

1. `createPendingOrder` (autenticada): revalida produtos/preços no banco, recalcula frete (`quoteShipping`), cupom (`AVAILABLE_COUPONS` + `coupon_uses`) e desconto Pix, grava o pedido em `orders` com status `"Aguardando Pagamento"` e devolve `{ orderNumber, total }`.
2. `payWithCardToken` ou `createPixPayment` (autenticadas): releem o pedido pelo `order_number` (conferindo `user_id`), montam o `POST /v1/payments` no MP com `transaction_amount` vindo **do banco**, `description`, `payer` (nome, e-mail, CPF quando informado), `external_reference: orderNumber`, `notification_url` do webhook e header `X-Idempotency-Key`. Salvam `mp_payment_id` e `mp_status` no pedido.
   - Cartão: resposta imediata `approved` / `in_process` / `rejected` → mensagem amigável por `status_detail` (saldo, CVV, recusa do banco).
   - Pix: retorna dados do QR Code.

Migração SQL: adicionar `mp_payment_id text`, `mp_status text`, `installments int` a `public.orders` (+ índice em `mp_payment_id`), mantendo `stripe_session_id` para o histórico.

---

## 5. Confirmação assíncrona (webhook)

- Rota pública `src/routes/api/public/payments/mercadopago.ts`.
- Valida o header `x-signature` (HMAC SHA-256 sobre `id` + `request-id` + `ts` com `MP_WEBHOOK_SECRET`), rejeitando com 401 quando não confere; nunca confia no corpo.
- Consulta `GET /v1/payments/{id}` com o Access Token (fonte da verdade) e mapeia: `approved` → `"Preparando pedido"` + `consume_order_stock` (protegido por `stock_decremented`, então é idempotente) + e-mail transacional; `pending`/`in_process` → mantém "Aguardando Pagamento"; `rejected`/`cancelled` → `"Pagamento recusado"`.
- Cartão normalmente já chega aprovado na criação, e o webhook só confirma. Pix depende exclusivamente do webhook + polling da tela de QR.
- Após a primeira publicação, cadastro a URL do webhook no painel do Mercado Pago (te passo a URL exata).

---

## 6. Secrets e chaves

| Onde | Valor |
|---|---|
| Secrets do backend | `MP_ACCESS_TOKEN` (produção, `APP_USR-...`), `MP_WEBHOOK_SECRET` |
| Frontend (`.env`, pode ser público) | `VITE_MP_PUBLIC_KEY` (`APP_USR-...`) |
| Removidos | `STRIPE_LIVE_API_KEY`, `STRIPE_SANDBOX_API_KEY`, `PAYMENTS_*_WEBHOOK_SECRET`, `VITE_PAYMENTS_CLIENT_TOKEN` |

Vou pedir o Access Token e o webhook secret pelo formulário seguro na hora certa — não cole nada no chat.

---

## Ordem de execução e estimativa

| Etapa | Escopo | Prompts |
|---|---|---|
| 1 | Migração SQL + secrets + `mercadopago.server.ts` + server functions (`createPendingOrder`, `payWithCardToken`, `createPixPayment`, `getPaymentStatus`) | 1 |
| 2 | Card Payment Brick na Etapa 2 do checkout, com estilo old money | 1 |
| 3 | Tela de Pix (QR + copia-e-cola + polling) | 1 |
| 4 | Webhook MP + status/estoque/e-mails + `sucesso.tsx` | 1 |
| 5 | Limpeza total do Stripe (arquivos, deps, rótulos no admin) | 1 |
| 6 | Teste real ponta-a-ponta (pedido de R$ 1,00) e ajustes | 1–2 |

**Total: 5 a 7 prompts.** Recomendo etapas 1–4 em sequência antes de remover o Stripe, para não ficar sem checkout em nenhum momento.

---

### Decisões que preciso de você
1. Confirmar que trabalhamos sobre `orders` (não criar `as_orders_v2`).
2. Parcelamento: máximo de parcelas (ex.: até 12x) e quem paga os juros — cliente (padrão do MP) ou loja.
3. CPF do pagador no checkout: o Mercado Pago costuma exigir para Pix. Adiciono campo CPF com máscara na Etapa 1?
