<p align="center"><img src="docs/assets/logo-wordmark.svg" alt="Mimeograph" width="520"></p>

[English](./README.md) · **Português**

> Copie a gaiola, não os erros.

O Mimeograph é um molde de repositório: TypeScript estrito em Node, sem framework de UI, e uma gaiola mecânica que falha o build quando uma regra é violada. Você copia a gaiola para um projeto novo uma vez, e toda mudança depois, de pessoa ou de agente de código, passa pelo mesmo portão.

## O que a gaiola bloqueia

`pnpm check` roda, em ordem, e para na primeira falha:

- **Prettier** (só formatação) e **Oxlint** (correção, `no-explicit-any`, sem sombreamento, sem ciclo de import).
- **Regras ast-grep** em `rules/`:
  - qualquer comentário em TS/JS (exceto `/// <reference types|lib="..." />`);
  - `catch` que engole o erro em vez de relançar ou retornar;
  - `useEffect` e similares fora de `src/shared/effects/**`;
  - fronteiras de feature: import só por `#features/<nome>`, sem `..` dentro de uma feature, `src/shared` nunca importa feature;
  - especificadores calculados em `import()` / `require()`, escapes hex/unicode em string e sombreamento de nomes de erro nativos, que escondem texto das regras acima.
- **Testes das regras ast-grep**, `tsc --noEmit` (estrito), **knip** (export, arquivo e dependência órfãos) e **Vitest**, que inclui sondas de ataque tentando contornar as regras.

As regras e os docs que as explicam estão em [AGENTS.md](./AGENTS.md) e [docs/features](./docs/features/README.md). As mensagens das regras estão em português.

## Início rápido

Com um agente de código: diga _"vá a https://github.com/seatrunk/mimeograph e siga o INSTALL.pt-BR.md"_. O guia para agentes é o [INSTALL.pt-BR.md](./INSTALL.pt-BR.md); ele pergunta antes de sobrescrever arquivos, mudar o CI ou fazer push.

À mão (Node >= 24 e pnpm; a versão do pnpm está fixada em `packageManager`):

```sh
git clone https://github.com/seatrunk/mimeograph.git
cd mimeograph
pnpm install --frozen-lockfile
pnpm check
```

Apague `src/features/example-a`, `src/features/example-b` e `docs/features/example-flow.md` quando tiver a primeira feature real. Rode `pnpm check` antes de cada commit; o CI roda o mesmo comando.

## Runner do CI

`.github/workflows/ci.yml` usa:

```yaml
runs-on: ${{ fromJSON(vars.CI_RUNS_ON || '"ubuntu-latest"') }}
```

Sem a variável de repositório `CI_RUNS_ON`, o CI roda em `ubuntu-latest`. Para usar um runner próprio (self-hosted), defina a variável com uma lista JSON de labels do runner:

```sh
gh variable set CI_RUNS_ON --repo <dono>/<repo> --body '["self-hosted","Linux","X64","meu-runner"]'
```

Ou no GitHub: Settings, Secrets and variables, Actions, Variables. O valor precisa ser JSON válido e as labels precisam bater com um runner online; senão os jobs falham ou ficam esperando para sempre. Não conecte runner próprio a repositório público que você não controla.

## Limites

A gaiola é sintática e cobre o que lista, nada além. Veja em [docs/limits.pt-BR.md](./docs/limits.pt-BR.md) o que as regras declaradamente não pegam.

## Licença

[MIT](./LICENSE), copyright 2026 seatrunk.
