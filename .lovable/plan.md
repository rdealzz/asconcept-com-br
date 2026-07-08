# Plano de implementação — A&S Concept

Vou entregar em 5 ondas, cada uma auto-contida e verificável. Se algo falhar, paro na onda para ajustar antes de seguir.

## Onda 1 — Segurança admin & blindagem (blocos 1 e 2)

- `auth-context`: sempre que `session.user.email === "ersutibiti@gmail.com"`, forçar `isAdmin=true` imediatamente (antes/ independente da RPC `has_role`). Persiste porque decorre da sessão Supabase, que já sobrevive ao F5.
- Guard rígido em `/pedidos`: usa `beforeLoad` + verificação client-side; se não autenticado OU e-mail diferente do mestre → `supabase.auth.signOut()` silencioso + `redirect({ to: "/" })`. Também um guard em runtime no componente para bloquear manipulação via devtools.
- Sanitização central em `src/lib/sanitize.ts` (strip tags, escape, limites de tamanho) + validação Zod nos formulários de cadastro, newsletter, criação de pedido manual, edição de produto e depoimentos. Bloqueia `<script>`, `<iframe>`, `on*=`, `javascript:`.
- Isolamento de `as_orders_v2`/`as_coupons`: remover qualquer resíduo em `localStorage`; state fica só em contextos React (fonte de verdade = Supabase). Fechamentos privados + `Object.freeze` nos objetos exportados de negócio; sem `window.__` globals.

## Onda 2 — Catálogo, modal e sacola (blocos 3 e 4)

- Drawer lateral de filtros (Sheet do shadcn) com contadores por categoria, animação suave, chips de filtros ativos.
- Banner editorial off-white/Playfair acima da grid: "Privilégio de Boas-Vindas… código 10%OFFF".
- Modal de produto refeito: coluna esquerda (foto), coluna direita compacta com Nome / Preço / Tamanhos / CTA / ShippingCalculator — tudo above-the-fold em ≥768px. Botão "Tabela de Medidas" abre modal secundário com tabela P/M/G/GG (tórax, ombro, comprimento).
- Sacola: barra fina dourada de progresso de frete grátis (meta configurável), seção "Complete o visual" com 1-2 sugestões complementares e botão de adição rápida.

## Onda 3 — Prova social, footer institucional, área do cliente (blocos 5 e 6)

- Depoimentos: garantir nomes masculinos; ao inserir feminino, forçar formato "…comprei para meu filho/marido…". Admin cria/edita/exclui inline.
- Footer: cada link institucional abre um Dialog com texto curto conceitual + contato clicável `mailto:asconccept@gmail.com`.
- Área do cliente: seção "Privacidade e Conta" com botão "Excluir minha conta" → modal de confirmação → chama server function que apaga profile/orders e faz signOut.
- Timeline visual de status por pedido (Pendente → Preparando → Em trânsito → Entregue) com barra de progresso.
- Cupom de boas-vindas: reforçar que o popup só dispara em `justSignedUp` e nunca sobre modais de produto.

## Onda 4 — Dashboard /pedidos com 4 abas (bloco 7)

Refatorar `src/routes/pedidos.index.tsx` usando Tabs do shadcn:
1. **Gestão de Pedidos** — lista com thumb do produto, tamanho, qtd, cliente, dropdown de status.
2. **Criar Pedido Manual** — form: cliente (nome+email), produto do catálogo (select), tamanho, qtd, método de pagamento. Insere via `orders` como pedido normal.
3. **Clientes & Leads** — duas tabelas: `profiles` e `newsletter_subscribers`.
4. **Calculadora de Markup** — inputs custo bruto + margem desejada; calcula preço de etiqueta que, após taxa Stripe (4,99% + R$0,50), preserva a margem líquida. Fórmula: `preço = (custo + margem_abs + 0.50) / (1 - 0.0499)`.

## Onda 5 — E-mails Supabase pt-BR

- `email_domain--check_email_domain_status` → se não houver domínio, exibir dialog de setup e pausar.
- Após domínio pronto, `scaffold_auth_email_templates` e traduzir os 6 templates (confirmação, magic link, recuperação, convite, mudança de e-mail, reautenticação) para pt-BR com estética editorial (Ivory/Navy/Gold, Playfair no título).

## Detalhes técnicos

- Nenhuma migration de schema — as tabelas necessárias já existem (`profiles`, `orders`, `products`, `testimonials`, `newsletter_subscribers`, `coupon_uses`, `user_roles`).
- Servidor: adicionar `deleteMyAccount` como `createServerFn` com `requireSupabaseAuth` (usa `supabaseAdmin` dinamicamente para `auth.admin.deleteUser`).
- Nenhum novo pacote npm.
- Sanitize helper puro em TS, sem dependência externa (regex + allowlist).
- Guardas de rota via `beforeLoad` async lendo `supabase.auth.getUser()`; em SSR retorna sem redirect (a rota `_authenticated` gerenciada trata; aqui `/pedidos` fica top-level porque já existe — reforço o guard client-side).

## Verificação por onda

- Typecheck automático após cada onda.
- Playwright: login com conta mestre → confirmar badge Admin, acesso `/pedidos`, abas visíveis; logout → `/pedidos` redireciona para `/`.
- Manual: F5 mantém admin; devtools setando isAdmin não libera nada porque componentes leem `useAuth().user.isAdmin` derivado da sessão.

Confirma que sigo nessa ordem? Posso começar pela Onda 1 já na próxima mensagem.