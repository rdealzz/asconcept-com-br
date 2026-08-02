## 1. Pedido aprovado entra como "Aguardando Aprovação"

Hoje `mapMpStatus()` em `src/lib/mercadopago.server.ts` converte `approved` → `"Preparando pedido"`, então o pedido pula a primeira etapa.

- `approved` passa a mapear para `"Aguardando Aprovação"`.
- Em `persistPayment` (`src/lib/payments-core.server.ts`), o gatilho de "pagamento aprovado" (baixa de estoque, `consume_order_stock`, e-mail "Pedido confirmado", consumo do cupom) passa a depender do status **do Mercado Pago** (`payment.status === 'approved'`), não do texto do status interno — assim nada quebra com a renomeação.
- `PAID_STATUSES` passa a incluir `"Aguardando Aprovação"` **somente quando** já existe pagamento aprovado registrado (`mp_status = 'approved'`), para não tratar pedidos manuais como pagos.
- O e-mail de confirmação deixa de marcar `preparation_mail_sent = true`, já que "Preparando pedido" volta a ser uma etapa real feita pelo admin (e terá seu próprio e-mail).

### Ordem obrigatória de status
Em `src/lib/admin.functions.ts` / `src/lib/admin-orders.server.ts`, validação server-side: só é permitido avançar exatamente uma etapa por vez na sequência Aguardando Aprovação → Preparando pedido → Em trânsito → Entregue (sem pular nem voltar). No painel (`src/routes/pedidos.index.tsx`), os botões/opções de status fora da próxima etapa ficam desabilitados.

### Boleto
Verificação: hoje o checkout oferece apenas cartão e Pix (não há fluxo de boleto). O webhook `/api/public/payments/mercadopago` já reprocessa qualquer aprovação assíncrona pelo mesmo `persistPayment`, então caso boleto seja ativado no futuro ele seguirá a mesma regra. Nada a alterar além disso — confirmo no relatório final.

## 2. Celular: /pedidos desloga o usuário

Causa raiz encontrada no código: em `src/routes/pedidos.index.tsx` existe um `useEffect` que, para **qualquer** usuário logado que não seja o e-mail master, executa `supabase.auth.signOut()` e redireciona para "/". Ou seja, todo cliente comum que abre "Meus Pedidos" é deslogado por design — no celular é mais visível porque o ícone de pessoa leva direto para essa rota.

Correção:
- Remover o `signOut` automático. A rota passa a servir dois papéis: cliente vê os próprios pedidos; e-mail master vê o painel admin (o conteúdo admin continua gated por e-mail master + RLS/validação server-side, que é onde a segurança realmente está).
- `beforeLoad`: em vez de `getUser()` (chamada de rede que pode correr antes da sessão hidratar em Safari iOS), usar `getSession()` e, quando não houver sessão, renderizar o estado "Entre para ver seus pedidos" em vez de redirecionar — elimina a race condition de sessão em mobile.
- Confirmar que a lista de pedidos do cliente e a página de detalhe (`/pedidos/$id`, status + código de rastreio) funcionam autenticadas.
- Verificação com navegador headless em viewport mobile (Chrome/Android e user-agent Safari iOS) na sessão de teste; logs de diagnóstico temporários em `console.error` nos pontos de checagem de sessão, para captura caso persista.

## 3. Mensagem de confiança no PIX

Em `src/components/PixPanel.tsx`, abaixo do QR Code: card sutil em marfim com borda dourada, ícone de escudo/ⓘ, título "Por que o PIX aparece em outro nome?", o texto fornecido (menção a Erick, fundador; dados não armazenados pela marca; processamento pelo Mercado Pago) em fonte menor, selo/logo do Mercado Pago e link para o WhatsApp já usado no site.

## 4. Reescrita dos textos dos e-mails (preview antes de aplicar)

Templates envolvidos: `signup`, `recovery` (auth) e `pedido-confirmado`, `pedido-em-preparacao`, `pedido-enviado`, `pedido-entregue` (app), todos em `src/lib/email-templates/`. Layout, banner e variáveis dinâmicas (nome, número do pedido, itens, valor, rastreio, botões) permanecem intactos — muda apenas a copy, com tom "The New Era of Heritage", português BR, textos curtos e assinatura consistente.

Como você pediu preview antes de aplicar: na execução eu escrevo os novos textos, gero capturas de cada e-mail renderizado e mostro para aprovação **antes** de qualquer envio real; ajusto conforme seu retorno.

## Detalhes técnicos

Arquivos: `src/lib/mercadopago.server.ts`, `src/lib/payments-core.server.ts`, `src/lib/admin.functions.ts`, `src/lib/admin-orders.server.ts`, `src/routes/pedidos.index.tsx`, `src/routes/pedidos.$id.tsx`, `src/components/PixPanel.tsx`, `src/lib/email-templates/*`. Sem migração de banco necessária.
