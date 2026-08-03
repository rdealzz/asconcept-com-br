## O que já existe (não será refeito)

Verifiquei o código antes de planejar:
- Botão flutuante de WhatsApp `(41) 99996-4035` já em todas as páginas (`WhatsAppFab` no `__root.tsx`).
- Rodapé já traz e-mail `asconccept@gmail.com` e WhatsApp.
- Seção de depoimentos já existe na home (`Testimonials`, alimentada pela tabela `testimonials`).
- Newsletter já existe e já grava em `newsletter_subscribers` (falta só ir para o rodapé com a chamada dos 10%).
- Busca por nome já existe (`SearchOverlay`) — vou apenas estender para descrição e confirmar.
- Guia de tamanhos existe no modal, mas com medidas erradas — será substituído pela sua tabela.
- Frete grátis já está ativo a partir de **R$ 249,99** no motor real de frete. Vou manter esse valor (mudar para R$ 299 alteraria a cobrança real de frete) e apenas exibi-lo com destaque; me avise se quiser trocar para 299.

---

## 1. Confiança e credibilidade

- **Selo "Compra 100% Segura"** (cadeado) + bandeiras Visa/Master/Elo + Mercado Pago: novo componente `TrustSeals`, usado no rodapé e ao lado do resumo do pedido no checkout, com o texto "Seus dados estão protegidos com criptografia de ponta a ponta".
- **Páginas novas** (rotas reais, linkadas no rodapé): `/trocas` (arrependimento de 7 dias corridos, condições sem uso/etiqueta/embalagem, como solicitar por e-mail ou WhatsApp), `/sobre` (texto "The New Era of Heritage", curadoria e público), `/faq` (acordeon com prazo de entrega, formas de pagamento, trocas, acompanhamento do pedido, autenticidade), `/termos` e `/privacidade` (conteúdo dos modais institucionais promovido a página, mantendo também o modal).
- **Sem CNPJ** em nenhum lugar.
- Depoimentos: manter a seção existente e reforçá-la com o número de destaque "+500 clientes satisfeitos" e estrelas.

## 2. Rodapé: links quebrados

- Removidos (sem conteúdo hoje): Ateliês, Craftsmanship, Sustentabilidade, Concierge, Ajustes, Journal, Lookbook, Revendedores.
- Mantidos com destino real: Nossa História → `/sobre`, Envio → `/faq#entrega`, Trocas → `/trocas`, O Editorial → âncora da home, O Conceito / A Filosofia (modais), Termos → `/termos`, Privacidade → `/privacidade`, FAQ → `/faq`.
- Nova coluna de newsletter no rodapé: "Assine e ganhe 10% na primeira compra" ligada a `newsletter_subscribers`.

## 3. Guia de tamanhos

Tabela corrigida para P 57/53/49/54, M 59/55/51/56, G 61/57/53/58, GG 63/59/55/59 (comprimento/busto/ombro/manga), com a nota sobre medidas com a peça deitada e convite ao WhatsApp. Link "Guia de Tamanhos" ao lado do seletor P/M/G/GG, abrindo o acordeon/modal.

## 4. Vitrine

- Barra fixa no topo e aviso na sacola: "Frete grátis acima de R$ 249,99".
- Filtros por tamanho disponível, faixa de preço e cor (só aparece se houver cor cadastrada) + ordenação Mais recentes / Menor preço / Maior preço.
- Badge "Novidade" para produtos criados nos últimos 15 dias, coexistindo com "Último Item".
- Hover no desktop troca a foto principal pela 2ª da galeria com transição suave.
- Seção "Selecionados para Você" com 4–6 produtos logo abaixo do hero.

## 5. Modal de produto

- **Parcelamento real**: buscado dinamicamente na API de installments do Mercado Pago com o preço do produto, via server function com cache curto — nada de taxas fixas no código. Exibido no card e no modal, ao lado do preço. Se a API falhar, o texto simplesmente não aparece.
- Ícone de **favoritar** (coração) no card e no modal, salvo em `localStorage`.
- Botão **compartilhar**: WhatsApp e copiar link.
- Seção "Você também pode gostar" com 3–4 produtos da mesma categoria.

## 6. Botões e 404

- Variantes de botão com elevação/sombra no hover, `active:scale-[0.98]`, transições de 200–300ms e spinner nos botões assíncronos (adicionar à sacola, finalizar pagamento).
- Página 404 personalizada com identidade da marca ("Essa página não faz parte da nossa coleção") e botões para home/coleção.

## Detalhes técnicos

- Novas rotas em `src/routes/` (`sobre.tsx`, `faq.tsx`, `trocas.tsx`, `termos.tsx`, `privacidade.tsx`), cada uma com `head()` próprio (title, description, og) e adicionadas ao `sitemap.xml`.
- `src/routes/index.tsx` (4.4k linhas) será fatiado: `Footer`, `TrustSeals`, `ProductCard`, filtros e o modal passam para componentes em `src/components/` para não piorar a performance nem a manutenção.
- Parcelamento: `src/lib/installments.functions.ts` (server fn) + `installments.server.ts` chamando `/v1/payment_methods/installments` com a chave pública já configurada; consumido por hook com React Query.
- Nada de mudança em RLS/pagamento; validação server-side de preço permanece intacta.
- Verificação final em desktop e mobile via navegador headless, e publicação ao fim.
