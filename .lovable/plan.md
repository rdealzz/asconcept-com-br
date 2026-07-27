## Objetivo
Cadastrar as três credenciais de produção do Mercado Pago no cofre de secrets do backend, para que o checkout (cartão + Pix) e o webhook passem a funcionar com chave real.

## O que será feito

1. **Solicitar os três secrets de uma vez** através do formulário seguro (nunca colados no chat):
   - `MP_ACCESS_TOKEN` — Access Token de produção. Usado no servidor (`src/lib/mercadopago.server.ts`) para criar pagamentos de cartão e Pix. Formato esperado: `APP_USR-...`
   - `MP_PUBLIC_KEY` — Public Key de produção. Entregue ao navegador pela server function `getMpPublicKey` para o Card Brick tokenizar o cartão. Formato: `APP_USR-...`
   - `MP_WEBHOOK_SECRET` — "Assinatura secreta" da notificação, gerada no próprio painel do Mercado Pago ao configurar o webhook. Usada em `verifyMpWebhook` para validar o header `x-signature`.

2. **Onde o usuário encontra cada valor** (instruções que darei junto do formulário):
   - Access Token e Public Key: painel do Mercado Pago → Suas integrações → sua aplicação → Credenciais de **produção**.
   - Webhook secret: na mesma aplicação → Webhooks/Notificações → cadastrar a URL abaixo e copiar a "assinatura secreta" exibida.

3. **URL do webhook a cadastrar no Mercado Pago** (a rota já existe no projeto):
   ```text
   https://asconccept.com.br/api/public/payments/mercadopago
   ```
   Eventos a marcar: **Pagamentos** (`payment`). Modo: produção.

4. **Verificação após o cadastro**
   - Confirmar que os três nomes aparecem na lista de secrets do backend.
   - Conferir que a Public Key chega ao frontend (Card Brick monta sem erro no checkout).
   - Teste real de R$ 1,00 recomendado em seguida: um pedido no cartão e um no Pix, checando se o status do pedido muda para "Preparando pedido" após a confirmação.

## Detalhes técnicos
- Nada é escrito em código: os três valores ficam como variáveis de ambiente do servidor. O `MP_PUBLIC_KEY`, embora publicável, continua sendo lido via `process.env` na server function existente — não é preciso duplicá-lo em `.env`.
- Se o webhook secret ainda não existir no painel, cadastre primeiro a URL acima (a rota já está publicada) e só então preencha o formulário.
