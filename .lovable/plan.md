## O que encontrei

O problema não são as chaves do Mercado Pago — elas estão salvas (`MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`, `MP_WEBHOOK_SECRET`) e a API respondeu com sucesso nos testes. A página `/checkout` existe e o servidor a entrega com HTTP 200. O que quebra é o próprio código da página, em dois pontos:

**1. O checkout se auto-expulsa antes do carrinho carregar (causa principal)**

Em `src/routes/checkout.tsx` existe um efeito que faz `navigate({ to: "/" })` quando `items.length === 0`. Só que os itens do carrinho são restaurados do `localStorage` dentro de um efeito do `CartProvider` (`src/lib/cart-context.tsx`), que roda **depois** do efeito da página filha. Ou seja: ao abrir `/checkout` diretamente, dar F5 ou voltar pelo histórico, a página vê o carrinho vazio por um instante e manda o usuário de volta para a home — parecendo que "o checkout não carrega".

**2. A sessão pode ficar travada em "carregando" para sempre**

Em `src/lib/auth-context.tsx`, o `setLoading(false)` só é chamado **depois** de `await hydrateSession(...)`. Se qualquer consulta dentro dela falhar (perfil, verificação de admin, e-mail de boas-vindas), a promessa rejeita e `loading` nunca vira `false`. Como o checkout renderiza apenas um spinner enquanto `loading` for verdadeiro, a tela fica girando indefinidamente.

## O que vou fazer

1. **Aguardar a hidratação do carrinho antes de qualquer redirecionamento**
   - Expor um sinal `hydrated` no `CartProvider` (estado real, não `useRef`).
   - No `/checkout`, só considerar "carrinho vazio" depois que `hydrated` for verdadeiro.

2. **Nunca travar a sessão**
   - Envolver a hidratação da sessão em `try/finally`, garantindo `setLoading(false)` sempre.
   - Isolar a chamada de e-mail de boas-vindas para que uma falha nela não derrube o login.

3. **Trocar o redirecionamento silencioso por uma tela clara**
   - Sacola vazia: mostrar "Sua sacola está vazia" com botão para a coleção, em vez de jogar o usuário para a home sem explicação.
   - Sem login: mostrar aviso com botão "Entrar", em vez de redirecionar + abrir modal (que já causou erro de portal antes).

4. **Blindar o formulário de cartão**
   - No `CardBrick`, aguardar o SDK global do Mercado Pago já carregado no HTML, com mensagem de erro visível e opção de tentar de novo caso a chave pública não chegue.
   - Mostrar mensagem explícita se o pagamento por cartão ficar indisponível, em vez de spinner infinito.

5. **Validar de ponta a ponta**
   - Abrir `/checkout` no navegador de teste (acesso direto e F5) e conferir que a Etapa 1 renderiza, o CEP calcula o frete, e a Etapa 2 monta o formulário de cartão e o painel Pix.

## Detalhes técnicos

- `src/lib/cart-context.tsx`: `hydrated` passa de `useRef` para estado exposto no contexto.
- `src/routes/checkout.tsx`: guarda de rota reescrita (sem `navigate` no efeito), estados de "vazio" e "sem login" renderizados.
- `src/lib/auth-context.tsx`: `try/finally` no bootstrap da sessão.
- `src/components/CardBrick.tsx`: espera pelo `window.MercadoPago` já injetado em `__root.tsx` e trata erro de chave.
- Nenhuma alteração de banco de dados, de secrets ou da lógica de preço/cupom no servidor.
