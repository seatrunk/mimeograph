# example-flow

Exemplo fictício do formato. Substitua ao criar a primeira tela real.

## Rota

`/example`, fluxo que mostra o dobro de um número digitado (feature `example-b`, que usa `example-a`).

## Pré-condição de login local

Usuário `local-user` com papel `viewer`. Em ambiente local, entre com `LOCAL_USER_EMAIL` e `LOCAL_USER_PASSWORD` do `.env` (nunca commitado).

## Seletores

| Elemento     | Seletor                        |
| ------------ | ------------------------------ |
| Campo número | `data-testid="example-input"`  |
| Botão dobrar | `role=button[name="Dobrar"]`   |
| Resultado    | `data-testid="example-result"` |

## Como validar headless

1. `pnpm dev` (quando o projeto tiver servidor) e abrir `/example` com o login acima.
2. Preencher `example-input` com `3` e acionar o botão Dobrar.
3. `example-result` deve conter `resultado double=6`.

No molde sem UI, o equivalente é `pnpm test`, que exercita `describeDouble(3)`.
