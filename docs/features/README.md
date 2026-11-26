# Feature Map

Um arquivo `.md` por tela ou fluxo, nesta pasta, nomeado em kebab-case (`checkout.md`). O agente lê o mapa antes de mexer e valida a mudança pelo que está descrito aqui.

## Formato

Cada arquivo tem estas seções, nesta ordem:

1. **Rota**: caminho da tela ou nome do fluxo.
2. **Pré-condição de login local**: usuário, papel e como entrar em ambiente local. Sem segredo: aponte para a variável de ambiente.
3. **Seletores**: tabela de elementos com `data-testid` ou papel ARIA.
4. **Como validar headless**: comando exato e o resultado esperado.

## Exemplo preenchido

Ver [example-flow.md](./example-flow.md).
