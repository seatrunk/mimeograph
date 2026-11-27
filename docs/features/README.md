# Feature Map

One `.md` file per screen or flow, in this folder, named in kebab-case (`checkout.md`). The agent reads the map before changing anything and validates the change against what is described here.

## Format

Each file has these sections, in this order:

1. **Route**: path of the screen or name of the flow.
2. **Local login precondition**: user, role and how to sign in to the local environment. No secrets: point to the environment variable.
3. **Selectors**: table of elements with `data-testid` or an ARIA role.
4. **How to validate headless**: exact command and the expected result.

## Filled-in example

See [example-flow.md](./example-flow.md).
