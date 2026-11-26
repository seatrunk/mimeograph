# Limites

[English](./limits.md) · **Português**

O que a gaiola declaradamente não pega. Fonte: [AGENTS.md](../AGENTS.md), as mensagens em `rules/` e as sondas de contorno em `tests/gate.test.ts`.

## As regras são sintáticas

- As regras ast-grep leem árvores de sintaxe, não tipos nem fluxo de dados. As regras de fronteira só enxergam o texto do especificador de import. Por isso são proibidos especificadores calculados em `import()` / `require()`, `createRequire`, `import.meta.resolve()` e escapes hex/unicode: eles esconderiam o texto. Qualquer outro jeito de carregar código que não esteja nessa lista não é visto.
- O `catch` é julgado pela forma do último statement: ele precisa dar `throw` ou `return` em algo que leve o erro. A regra não confere se quem chama trata o erro, e fallbacks condicionais antes desse último statement são permitidos.
- `useEffect` é reconhecido pelo nome. O código em `src/shared/effects/**` pode usá-lo livremente; nada confere o que esses efeitos fazem.
- As regras sobre nomes de erro nativos e `Promise` confiam que esses nomes não foram sombreados, e a checagem de sombreamento só roda em `src/**`.

## Cobertura

- As regras ast-grep rodam em `src/**`, exceto `no-comments`, que roda em todo arquivo TS/JS do repositório. A pasta `tests/` fica fora das regras de catch, de fronteira e de import.
- Só comentário de TS/JS é bloqueado. Comentários em YAML, JSON, Markdown e outros arquivos não são.
- O Prettier confere os tipos de arquivo que ele suporta; os demais (por exemplo SVG) não são formatados nem conferidos.

## Regras de processo não são mecânicas

O AGENTS.md também diz: sem teste enfraquecido, sem merge nem push na `main`, sem segredo no repositório, Feature Map em `docs/features/` sempre atualizado. O portão não faz cumprir nada disso. Proteja a `main` com branch protection do GitHub e revisão.

## O que o portão não faz

- Não exige teste para cada feature e não avalia a qualidade dos testes; ele roda os testes que existem.
- Não audita dependências em busca de vulnerabilidades e não verifica comportamento em runtime nem segurança.
- As mensagens das regras, o AGENTS.md e `docs/features/` estão em português por enquanto.

## Repositórios existentes

O molde foi feito para ser copiado para um projeto novo. Adicionar a gaiola a um repositório existente ainda não é suportado; veja a [issue #2](https://github.com/seatrunk/mimeograph/issues/2).
