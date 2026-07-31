## Objetivo
Entregar os quatro e-mails de pedido pela infraestrutura nativa do Lovable Cloud, corrigir o cadastro que retorna 429 e remover a pontuação ambígua após o endereço do cliente.

## Diagnóstico confirmado
- O domínio `notify.asconccept.com.br` está verificado, os e-mails de autenticação estão ativos e a fila de produção está saudável.
- E-mails recentes de confirmação de cadastro foram efetivamente enviados pela fila.
- O pagamento aprovado ainda chama diretamente a API antiga do Resend em `payments-core.server.ts`; essa dependência será removida.
- O registro nativo de templates de App emails está vazio, portanto os quatro templates de pedido ainda não aparecem como templates próprios.
- As três atualizações de pedido que falharam chegaram à fila sem versão em texto simples; o provedor respondeu `missing_parameter: text` até esgotar as tentativas.
- O painel altera o status diretamente no navegador e depois tenta disparar um e-mail separado. Isso permite falhas parciais entre atualização e notificação.
- A frase do painel acrescenta um ponto depois do componente que exibe o e-mail. A consulta atual não encontrou pedidos persistidos com ponto final ou espaços no endereço; é pontuação da interface, não corrupção confirmada no banco.
- Os logs de autenticação consultados não preservaram um evento 429 recente. A correção do limite será aplicada de forma preventiva e a interface passará a mostrar a mensagem específica retornada pelo serviço em vez do erro genérico.

## Implementação

### 1. Templates nativos de App emails
- Criar quatro templates React Email em português do Brasil:
  - `pedido-confirmado`: número, itens, total e agradecimento.
  - `pedido-em-preparacao`: confirmação de que o ateliê iniciou o preparo.
  - `pedido-enviado`: informação de envio e código de rastreio quando disponível.
  - `pedido-entregue`: confirmação de entrega e agradecimento final.
- Reutilizar o layout visual já usado nos e-mails de autenticação: banner A&S CONCCEPT, Ivory, Navy, Charcoal e Gold.
- Registrar os quatro templates para que sejam reconhecidos pela área App emails.
- Sempre renderizar HTML e texto simples antes de enfileirar, eliminando a causa `missing_parameter: text`.

### 2. Disparo confiável e idempotente
- Criar um helper server-only para renderizar, registrar e enfileirar e-mails de pedido pelo Lovable Cloud, com destinatário normalizado e chaves de idempotência por `pedido + evento`.
- Remover de `persistPayment` toda chamada direta ao Resend e qualquer dependência de `RESEND_API_KEY`/`MAIL_FROM`.
- Ao Mercado Pago aprovar cartão ou PIX, enfileirar `pedido-confirmado` exatamente uma vez, preservando o controle atual de `mail_sent`.
- Acrescentar controles persistentes para impedir duplicação dos e-mails de preparação, envio e entrega quando webhooks ou ações administrativas forem repetidos.

### 3. Atualização administrativa atômica
- Mover a alteração manual de status para uma função de servidor protegida por autenticação e validação real de administrador.
- Nessa mesma operação, carregar o pedido do banco, atualizar status/rastreio e disparar somente o template correspondente à transição real:
  - `Preparando pedido` → preparação.
  - `Em trânsito`/equivalente → enviado.
  - `Entregue` → entregue.
- Atualizar o contexto e o painel para usar essa função, aguardar sucesso e só então mostrar a confirmação visual.
- Remover o disparo antigo separado de `status_update`, evitando atualização salva sem e-mail ou e-mail com dados desatualizados.

### 4. Cadastro e recuperação de senha
- Elevar o limite horário de e-mails de autenticação para um valor adequado ao volume real, mantendo confirmação de e-mail obrigatória e cadastro público habilitado.
- Preservar os templates nativos já ativos para confirmação e recuperação.
- Mapear explicitamente respostas 429 para uma mensagem clara de limite temporário, mantendo mensagens próprias para conta existente e demais falhas.
- Validar um novo cadastro com e-mail válido e confirmar no registro da fila que o e-mail foi aceito.

### 5. Correção visual do e-mail do cliente
- Remover o ponto imediatamente após `{order.customerEmail}` na frase do painel ou reescrever a frase para não parecer parte do endereço.
- Normalizar e-mails com `trim().toLowerCase()` antes de persistir novos pedidos e antes de qualquer envio.

## Validação
- Confirmar que não restam chamadas a `api.resend.com` nem referências usadas a chaves do Resend no fluxo de pedidos.
- Pré-visualizar os quatro templates e verificar conteúdo, banner e texto simples.
- Simular as quatro transições e confirmar uma única linha final por evento no registro de envio, deduplicada por mensagem.
- Verificar cartão e PIX aprovados, alteração manual de status e rastreio.
- Testar cadastro e recuperação, confirmando que o e-mail entra na fila e que erros 429 recebem mensagem específica.
- Conferir no painel que o endereço do cliente aparece sem pontuação anexada.