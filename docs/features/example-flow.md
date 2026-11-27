# example-flow

Fictional example of the format. Replace it when you create the first real screen.

## Route

`/example`, a flow that shows the double of a typed number (feature `example-b`, which uses `example-a`).

## Local login precondition

User `local-user` with role `viewer`. In the local environment, sign in with `LOCAL_USER_EMAIL` and `LOCAL_USER_PASSWORD` from `.env` (never committed).

## Selectors

| Element       | Selector                       |
| ------------- | ------------------------------ |
| Number field  | `data-testid="example-input"`  |
| Double button | `role=button[name="Dobrar"]`   |
| Result        | `data-testid="example-result"` |

## How to validate headless

1. `pnpm dev` (when the project has a server) and open `/example` with the login above.
2. Fill `example-input` with `3` and trigger the Dobrar button.
3. `example-result` must contain `resultado double=6`.

In the template without UI, the equivalent is `pnpm test`, which exercises `describeDouble(3)`.
