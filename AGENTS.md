# AGENTS.md

## Comandos

- `pnpm check`: gate completo (format, oxlint, ast-grep scan e test, typecheck, knip, test). Falha no primeiro erro.
- `pnpm format`: aplica o Prettier. `pnpm test`: Vitest. `pnpm typecheck`: `tsc --noEmit`.

## Regras duras

- Zero comentários em qualquer arquivo TS/JS do repositório. Única exceção: `/// <reference types="..." />` ou `lib="..."`, sem caminho relativo.
- Sem `any`. Sem `catch` vazio ou que engole o erro. `useEffect` só em `src/shared/effects/**`.
- Sem teste enfraquecido (não apague nem relaxe assert para passar).
- Sem merge e sem push na `main`. Sem segredo no repo.

## Fronteiras de feature

- `src/features/<nome>/index.ts` é a única porta pública da feature.
- Outra feature só por `#features/<nome>`; código comum por `#shared/<arquivo>`.
- Dentro da feature, import relativo só com `./`. `src/shared` não importa feature.

## Regra do 2º erro

Erro apontado 2x em revisão vira regra em `rules/segundo-erro/`, com teste em `rules/__tests__/` e `message` dizendo o caminho certo.

## Feature Map

Toda tela ou fluxo tem um `.md` em `docs/features/` (formato em `docs/features/README.md`). Leia antes de mexer; atualize junto com a mudança.
