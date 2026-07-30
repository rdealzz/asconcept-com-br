## 1. Rolagem do modal de produto no desktop

O painel interno do modal está com rolagem desativada no desktop, então tudo que passa da altura da tela (tamanhos, calculadora de frete, botões) é cortado sem barra de rolagem.

- Ativar rolagem vertical no desktop, mantendo o comportamento atual do celular.
- Coluna da foto fica fixa (sticky) e a coluna de detalhes rola, para a imagem não sumir enquanto o cliente lê.
- Garantir que o botão de fechar continue sempre visível e que a calculadora de frete seja alcançável.

## 2. Galeria de múltiplas fotos

O editor do admin já acumula até 5 fotos (não substitui) e o banco já tem o campo de galeria. O que falta:

- **Escolher a capa:** botão "Definir como capa" em cada miniatura do admin, movendo a foto para a primeira posição (a capa continua sendo a primeira da lista, mas agora escolhível). Também permitir reordenar por setas.
- **Setas no modal do cliente:** botões ◀ ▶ sobrepostos à foto principal (aparecendo só quando há mais de uma foto), com contador "2/5", suporte a arrastar o dedo no celular e navegação por teclado no desktop. As miniaturas de baixo continuam.
- **Verificação:** conferir, com um produto real, que enviar uma segunda foto realmente adiciona e persiste após recarregar — se algo estiver sendo perdido no salvamento, corrigir junto.

## 3. Erro ao criar conta

Hoje qualquer falha de cadastro vira a mesma mensagem genérica ("Não foi possível concluir o cadastro"), o que esconde a causa. Estrutura do banco (perfis, papéis, gatilho de criação de conta, permissões) foi verificada e está correta.

- Reproduzir um cadastro real contra o servidor de autenticação para capturar o erro exato nos registros do sistema.
- Corrigir a causa encontrada. As hipóteses mais prováveis, todas tratáveis: limite horário de e-mails de autenticação (padrão baixíssimo, gera erro no cadastro), confirmação de e-mail exigida sem remetente ativo, ou validação de senha vazada.
- Ajustar o limite de envio de e-mails de autenticação para um valor compatível com o volume real.
- Passar a exibir mensagens específicas ao usuário (e-mail já cadastrado, senha fraca, limite temporário atingido, etc.) em vez da mensagem única.
- Resultado esperado: cadastro funcionando com qualquer e-mail válido.

## 4. E-mails do Cloud (a parte que realmente falta)

O domínio remetente `notify.asconccept.com.br` está **verificado** e a fila de envio está saudável, mas o projeto nunca teve os modelos de e-mail criados — por isso nada chega.

- **E-mails de autenticação:** criar os modelos de confirmação de cadastro, recuperação de senha, link mágico, convite, troca de e-mail e reautenticação, com a identidade da marca (Ivory, Navy, Charcoal, Gold, tipografia serifada).
- **E-mails do app:** criar a estrutura de envio e os modelos para:
  - Boas-vindas após criar conta
  - Pedido confirmado (pagamento aprovado)
  - Atualização de status do pedido (Preparando, Em trânsito, Entregue)
  - Confirmação de inscrição na newsletter
- **Ligar aos eventos reais:** disparar automaticamente na confirmação de pagamento e na mudança de status feita pelo painel admin, com chave de idempotência para nunca enviar duplicado.
- **Migração do envio atual:** o site hoje envia pedidos por um serviço externo com chave própria; passar esses envios para a infraestrutura de e-mail do Cloud, mantendo o mesmo conteúdo, para tudo sair do domínio verificado da marca.
- Página de descadastro com a identidade visual da marca, exigida pelos rodapés dos e-mails.

## Detalhes técnicos

- `src/routes/index.tsx`: remover `md:overflow-visible` do grid interno do `ProductModal`, tornar a coluna direita rolável (`md:overflow-y-auto`) com a coluna da imagem em `md:sticky`; adicionar controles de navegação da galeria com estado `activeImg`, gesto de swipe e teclas ◀/▶; no `AdminEditModal`, adicionar ação "definir como capa"/reordenar sobre `form.gallery`.
- Autenticação: reprodução do `POST /signup` + leitura dos registros de auth; ajuste de `rate_limit_email_sent` e, se necessário, de confirmação de e-mail; mapeamento de erros em `signUp` de `src/lib/auth-context.tsx`.
- E-mail: modelos React Email em `src/lib/email-templates/` com registro central, rotas de envio/preview/descadastro sob `/lovable/email/*`, envio enfileirado (pgmq) já existente em `src/routes/lovable/email/queue/process.ts`; gatilhos em `src/lib/payments-core.server.ts` (pagamento aprovado) e no fluxo de atualização de status do painel.
- Publicar ao final: a fila de e-mails do ambiente Live só é provisionada no publish.
