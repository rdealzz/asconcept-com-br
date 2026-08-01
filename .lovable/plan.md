## Parte 1 — Cadastro: falso erro 429 e confirmar senha

**O que já sabemos (verificado no código):** em `src/lib/auth-context.tsx` (linhas 243-250), qualquer erro com status 429 vira a mensagem "Muitas tentativas de cadastro...". O `AuthModal` em `src/routes/index.tsx` (linha 2210) apenas exibe esse texto em vermelho. A causa exata do 429 quando a conta é criada ainda não está confirmada — será o primeiro passo.

1. **Investigar o fluxo real do 429**: ler os logs de autenticação e a fila de e-mails do backend para identificar se o 429 vem do limite de envio de e-mail (`over_email_send_rate_limit`) ou de reenvio/duplo submit, e se o usuário é de fato criado nesses casos.
2. **Verificação de existência da conta antes de decidir a tela**: ao receber 429 no `signUp`, fazer uma sondagem segura (tentativa de login silenciosa com as credenciais informadas, sem expor dados de terceiros) para descobrir se a conta existe:
   - conta existe e ainda não confirmada → tela de sucesso;
   - conta não existe → manter a mensagem de espera atual.
3. **Tela de sucesso do cadastro**: substituir o texto vermelho por um estado dedicado no `AuthModal`, com o mesmo visual editorial do formulário: "Enviamos um e-mail de confirmação para [e-mail]. Verifique sua caixa de entrada (e o spam) e confirme para acessar sua conta." — usado tanto no cadastro normal quanto no cenário 429 confirmado.
4. **Campo "Confirmar senha"**: novo campo abaixo da senha no modo "Criar Conta", com as mesmas bordas inferiores, espaçamento e tipografia dos demais.
5. **Validação em tempo real**: mensagem "As senhas não coincidem." abaixo do campo e botão de envio bloqueado enquanto forem diferentes.

## Parte 2 — E-mails de pedido (App emails)

**Estado verificado:** os 4 templates já existem e estão registrados (`pedido-confirmado`, `pedido-em-preparacao`, `pedido-enviado`, `pedido-entregue`), o disparo automático já está ligado ao pagamento aprovado (`payments-core.server.ts`) e às mudanças manuais de status no admin (`updateStatus` → `adminUpdateOrderStatus` → `admin-orders.server.ts`), com flags de idempotência por pedido. Nenhuma chamada ao Resend restou no código (busca por `RESEND` não retornou resultados).

Portanto, esta parte é verificação e ajuste fino:

6. Confirmar na base de dados que os e-mails enfileirados após aprovação e após mudanças de status saem como enviados (checar o registro de envios e a fila).
7. **Recomendação técnica sobre os itens 1 e 2**: como "Pedido confirmado" e "Pedido em preparação" caem no mesmo status, manter apenas **um** disparo automático nesse momento ("Pedido confirmado", que já contém o resumo do pedido e avisa sobre a preparação) e deixar "Pedido em preparação" disponível como envio manual/opcional — evita dois e-mails seguidos quase idênticos ao cliente.
8. Garantir que o e-mail de "Pedido enviado" leve o código de rastreio quando o admin o informar na mudança para "Em trânsito".
9. Teste de ponta a ponta: pedido de teste → aprovação → "Em trânsito" → "Entregue", conferindo os envios automáticos no registro de e-mails.

## Parte 3 — Modal de produto premium com accordions

No `ProductModal` de `src/routes/index.tsx`:

10. Manter galeria, nome, preço, badge de estoque, seletor de tamanho e botão "Adicionar à Sacola" como estão.
11. Remover a descrição solta acima do seletor de tamanho e mover esse conteúdo para dentro do accordion.
12. Adicionar abaixo do botão de compra 4 seções expansíveis com estilo unificado (cabeçalho de mesma altura, seta que gira, bordas finas, transição suave, múltiplas seções podendo ficar abertas):
    - **Detalhes do Produto** — descrição longa editável pelo admin (campo já existente no cadastro).
    - **Guia de Tamanhos** — tabela estilizada com comprimento, busto, ombro e manga para P/M/G/GG (medidas de referência de mercado).
    - **Formas de Pagamento** — Visa, Mastercard, Elo e PIX na identidade Mercado Pago, com a informação de parcelamento já usada no checkout.
    - **Avaliações do Produto** — 3 a 5 avaliações estáticas por produto (nomes brasileiros, notas 4-5 estrelas, comentários curtos), geradas de forma determinística a partir do produto para não mudarem a cada abertura.
13. Sem seção de "Entrega e Devoluções". Rolagem vertical do modal preservada em desktop e mobile, com o CTA fixo no mobile continuando funcional.
14. Aplicado a todos os produtos do catálogo.

## Detalhes técnicos

- Reaproveitar `src/components/ui/accordion.tsx` (Radix) com classes da paleta atual (navy/dourado/marfim, serifada nos títulos) em vez de criar componente novo.
- A sondagem de existência de conta no cenário 429 não revela dados de outros usuários: usa apenas as credenciais que o próprio visitante acabou de digitar.
- Nenhuma alteração de schema é necessária; os campos de idempotência de e-mail já existem em `orders`.
