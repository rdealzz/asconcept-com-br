<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Como este projeto é tocado

O dono do projeto trabalha assim, e a combinação vale para toda sessão:

- **Entregar direto no `main`.** Desenvolva no branch da sessão, mas termine
  sempre com o `main` atualizado (fast-forward, nunca reescrevendo histórico —
  o Lovable depende dele). Quem publica é ele, pelo Lovable; não abra pull
  request a menos que ele peça.
- **Não travar por não conseguir rodar a aplicação.** O ambiente das sessões
  não alcança o registro npm deste projeto, então `bun install` falha e não há
  como subir o dev server nem gerar build. Isso é esperado: não é motivo para
  parar, nem para entregar menos.
- **O que substitui a execução, e é obrigatório antes de mandar para o `main`:**
  - `bunx tsc --noEmit` — ignore os erros de módulo ausente (`TS2307`,
    `TS7031`, `TS7006`, `TS2591`, `TS2688`), que são consequência da instalação
    incompleta; qualquer outro erro nos arquivos tocados é seu e precisa sumir.
  - `bunx eslint --fix <arquivos tocados>` — os arquivos alterados têm de sair
    sem erro. Há erro de formatação pré-existente em arquivos não tocados; não
    é seu, deixe quieto.
  - `bun test src` — a suíte roda normalmente.
- **Dizer o que foi verificado, sem inflar.** Confirme o que os comandos acima
  provam e diga que a conferência visual fica com ele no Lovable. Nada de
  afirmar que "testei na tela".
- **Banco.** As sessões não alcançam o Supabase de produção (é o projeto do
  Lovable Cloud, `asnghszlmnlefjazqldv`, atrás de rede bloqueada). Migração que
  o deploy possa não aplicar precisa de um caminho alternativo no código: ou o
  app se vira sem a coluna, ou o painel mostra o SQL para ele colar no Supabase.
