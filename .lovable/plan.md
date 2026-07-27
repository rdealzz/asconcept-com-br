## Configuração do Webhook do Mercado Pago — tudo o que você precisa

### 1. URL de notificação (já existe no projeto)
Use a URL de produção do site:

```text
https://asconccept.com.br/api/public/payments/mercadopago
```

Alternativas equivalentes (caso o painel recuse o domínio próprio):
```text
https://asconcept-com-br.lovable.app/api/public/payments/mercadopago
```

Importante: a rota só responde em produção depois de publicar o site (botão Publish). O endpoint aceita apenas **POST** e é público (não exige login), como o Mercado Pago exige.

### 2. Passo a passo no painel do Mercado Pago
1. Acesse **Seus negócios → Configurações → Suas integrações** e abra a sua aplicação.
2. No menu lateral, clique em **Webhooks / Notificações Webhook**.
3. Em **Modo produção**, cole a URL acima no campo "URL de produção".
4. Em **Eventos**, marque somente **Pagamentos** (`payment`). Não marque Checkout Pro/Merchant Orders — não usamos.
5. Clique em **Salvar**.
6. Após salvar, o painel exibe a **Assinatura secreta** (clique em "Revelar"/olho e copie). É um valor longo, tipo `e8f3...`. Guarde: ele vira o secret `MP_WEBHOOK_SECRET`.
7. Use o botão **Simular** do painel para enviar um teste; a resposta esperada é **200**.

### 3. Credenciais a cadastrar no cofre do app
Assim que tiver os três valores em mãos, eu abro o formulário seguro (você nunca cola no chat):

| Secret | Onde pegar | Formato |
|---|---|---|
| `MP_ACCESS_TOKEN` | Suas integrações → sua aplicação → **Credenciais de produção** → Access Token | `APP_USR-...` |
| `MP_PUBLIC_KEY` | Mesma tela → Public Key | `APP_USR-...` |
| `MP_WEBHOOK_SECRET` | Tela de Webhooks → Assinatura secreta | string hexadecimal longa |

### 4. Como o webhook funciona no site (já implementado)
- Recebe o POST do Mercado Pago e valida o header `x-signature` com HMAC-SHA256 usando `MP_WEBHOOK_SECRET`. Assinatura inválida → resposta 401 (por isso o secret precisa estar exatamente igual ao do painel).
- Consulta o pagamento na API do Mercado Pago e localiza o pedido pelo `external_reference` (o número `AS-xxxxxx`).
- Atualiza `mp_payment_id`, `mp_status` e o `status` do pedido: aprovado → "Preparando pedido"; pendente → "Aguardando Pagamento"; recusado → "Pagamento recusado".
- Em pagamento aprovado, baixa o estoque uma única vez (proteção contra notificação duplicada).

### 5. Checklist de validação depois de configurar
1. Publicar o site (para a URL de produção existir).
2. Cadastrar os 3 secrets.
3. Simular a notificação no painel → esperar 200.
4. Pedido real de R$ 1,00 no cartão → status deve virar "Preparando pedido".
5. Pedido real de R$ 1,00 no Pix → após pagar o QR Code, o status muda sozinho via webhook (além do polling da tela).

### Detalhes técnicos
- Arquivo do endpoint: `src/routes/api/public/payments/mercadopago.ts`; verificação de assinatura em `src/lib/mercadopago.server.ts` (`verifyMpWebhook`).
- O manifesto assinado segue o padrão oficial `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`.
- Nenhuma alteração de código é necessária nesta etapa — apenas publicar, cadastrar os secrets e configurar o painel.
