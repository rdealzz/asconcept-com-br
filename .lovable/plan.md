## Objetivo

1. Adicionar a coluna `mail_sent` em `orders`.
2. Atualizar `src/lib/payments-core.server.ts` com o envio único do e-mail de "pedido confirmado".
3. Publicar o site.

## Ponto de atenção (importante)

O arquivo que você anexou é uma versão **anterior** do `payments-core.server.ts`: ele não contém a proteção contra reuso de cupom que já está no projeto hoje (reserva do cupom antes de gravar o pedido, liberação se a gravação falhar ou se o cartão for recusado, e reconfirmação quando o pagamento é aprovado). Essa proteção veio de uma correção de segurança ("coupon_reuse").

Se eu substituir o arquivo literalmente, o cupom de boas-vindas volta a poder ser usado várias vezes pelo mesmo cliente.

**Proposta:** aplicar exatamente a novidade do seu arquivo (o e-mail único) e manter a proteção de cupom que já existe. O resultado é o seu código + as 4 partes de cupom preservadas. Se preferir a substituição literal, é só dizer.

## Passos

### 1. Migração no banco
```sql
alter table public.orders
  add column if not exists mail_sent boolean not null default false;
```
Sem mudança de permissões: `mail_sent` é escrita apenas pelo servidor e a tabela já é lida por dono/admin.

### 2. `src/lib/payments-core.server.ts`
- Em `persistPayment`, ao mudar o status para "Preparando pedido": ler também `customer_email`, `total`, `items`, `mail_sent`; se ainda não enviado, disparar o e-mail via Resend (`orderCreatedTemplate`, `MAIL_FROM`) e marcar `mail_sent = true` só em caso de sucesso. Falhas são apenas logadas.
- Manter, sem alteração, o bloco de cupom existente: `claimCouponUse` antes do insert do pedido, `releaseCouponUse` se o insert falhar, `claimCouponUse` quando o cartão é aprovado e `releaseCouponUse` quando é recusado (inclui o campo `coupon_code` no `loadOwnOrder`).

### 3. Verificação e publicação
- Rodar o typecheck.
- Publicar o site.

## Detalhes técnicos

- O e-mail é enviado dentro de `persistPayment`, então cobre tanto o retorno direto do cartão quanto o webhook e o polling do Pix — daí a necessidade do `mail_sent` como trava de idempotência.
- `RESEND_API_KEY` e `MAIL_FROM` já estão cadastrados nos secrets.
