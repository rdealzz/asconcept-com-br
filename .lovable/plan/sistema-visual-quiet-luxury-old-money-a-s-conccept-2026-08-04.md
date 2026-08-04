# Sistema visual "Quiet Luxury / Old Money" — A&S Conccept

Aplicar a nova camada visual dos arquivos enviados sobre o site atual, sem tocar em backend, pagamento (Mercado Pago), estoque ou e-mails.

## Ajustes necessários ao brief (o projeto mudou de stack)

Dois pontos do guia não se aplicam literalmente e serão adaptados:

1. **Não existe `tailwind.config.ts`** neste projeto — o Tailwind aqui é configurado por CSS (`src/styles.css`). Todas as chaves de `02-tailwind.config.additions.ts` (cores `asc-*`, fontes, easing, durações, tracking) serão registradas como tokens no `@theme` do `styles.css`, gerando exatamente as mesmas classes (`bg-asc-bg`, `text-asc-gold`, `duration-asc`, `ease-asc`, `tracking-label`...).
2. **A fonte não pode ser carregada por `@import` no CSS** (quebra o build). Cormorant Garamond + Inter serão carregadas por `<link>` no `__root.tsx`, e o token `--font-display` aponta para elas.

Além disso, os componentes enviados são cascas visuais genéricas; o site real tem mais coisas em cada um (busca, favoritos, badges de estoque, atalho de admin, preço no Pix, cupom, frete grátis). Nada disso será removido — a casca nova recebe a lógica existente.

## O que será feito

**Tokens (`src/styles.css` + `__root.tsx`)**
- Adicionar todas as variáveis `--asc-*` (superfícies, tinta, linhas, dourado, estados, espaçamento, easing) e as utilidades `.asc-label` e `.asc-grain`.
- Registrar os tokens no `@theme` para virarem classes Tailwind.
- Alinhar a paleta atual (ivory/navy/charcoal/gold) aos novos valores, para o site inteiro herdar o off-white quente `#FBF9F6` e o dourado `#A9863F` sem precisar reescrever cada página.

**StitchDivider (novo componente)**
- Criado como `src/components/StitchDivider.tsx` e usado com moderação: entre hero e catálogo, na seção de membership e no estado vazio.

**Header**
- Nova aparência: sticky com blur, encolhimento ao rolar, logo com "Conccept" em itálico leve, links com sublinhado dourado animado.
- Mantidos: contador real da sacola, busca, conta/login, atalho de admin, menu hambúrguer mobile, e os links de navegação atuais (âncoras/rotas que existem hoje) — não serão trocados pelas rotas fictícias do arquivo de exemplo (`/moletons`, `/membership`).

**ProductCard + ProductGrid**
- Card sem borda e sem sombra, respiro maior no grid (`gap-x-8 gap-y-20`), troca suave para a segunda foto no hover (usando a galeria que já existe no banco).
- Mantidos: abertura do modal de produto, formatação de preço em BRL, preço no Pix, badge de "Novidade", "Esgotado"/"Última peça", favoritar e ações de admin.

**EmptyState**
- Substitui a mensagem atual de catálogo vazio pelo bloco editorial com StitchDivider e campo "Notifique-me", ligado à mesma tabela de leads/newsletter já usada.

**MembershipSection**
- A seção "Somente por Convite" passa a usar o layout dark do arquivo enviado, com campos de nome e e-mail em linha inferior que acende em dourado no foco.
- `onSubmit` ligado ao insert já existente em `newsletter_subscribers` (mesma função, mesmo tratamento de e-mail duplicado).

**CartDrawer**
- Nova casca do drawer: cabeçalho serifado, linhas divisórias finas, estado vazio como convite editorial.
- Mantidos: itens reais do contexto de carrinho, tamanho/variante, quantidade, remover, cupom, barra de frete grátis, subtotal e o botão que leva ao checkout do Mercado Pago.

## Verificação
Testes em desktop e mobile com navegador headless: home, catálogo, hover do card, drawer da sacola aberto/vazio, seção de membership e estado vazio de categoria — capturando telas nas duas larguras antes de finalizar.
