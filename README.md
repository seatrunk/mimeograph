# template-dune

Molde de repositório: TypeScript estrito e Node, sem framework de UI, com uma gaiola mecânica que falha o build quando uma regra é violada.

## Usar

1. Crie o projeto a partir deste repositório e rode `pnpm install`.
2. Apague `src/features/example-a`, `src/features/example-b` e `docs/features/example-flow.md` quando tiver a primeira feature real.
3. Rode `pnpm check` antes de cada commit; o CI roda o mesmo comando.

Requer Node >= 24 e pnpm (versão fixada em `packageManager`).

## CI

O CI roda em runner local, não no hospedado do GitHub: `.github/workflows/ci.yml` usa `runs-on: [self-hosted, Linux, X64, chubas]`, por decisão da org `seatrunk` (limite mensal de minutos do GitHub-hosted). Projetos criados a partir do molde registram o runner na chubas com `gh-runner-add <owner/repo>`. Quem usar o molde fora dessa máquina troca o `runs-on` do workflow por um runner próprio ou por `ubuntu-latest`. O job mantém todo o estado dentro de `_work` do runner (store do pnpm, caches e pnpm em `runner.temp`).

## O que a gaiola cobre

- Oxlint para correção e `no-explicit-any`; Prettier só para formatar.
- ast-grep (`rules/`): zero comentários, `useEffect` restrito, `catch` que engole erro, fronteiras entre features.
- knip: export, arquivo ou dependência órfã.
- Vitest: um teste por feature.

Ao adicionar Next.js ou Vite, mantenha `pnpm check` e as regras como estão.

Detalhes para agentes em [AGENTS.md](./AGENTS.md); mapa de telas em [docs/features](./docs/features/README.md).
