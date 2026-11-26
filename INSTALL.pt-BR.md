# INSTALL.pt-BR.md

[English](./INSTALL.md) · **Português**

Este guia é escrito para um agente de código. Uma pessoa disse a você: "vá ao repositório do Mimeograph e siga o INSTALL.md". Siga ao pé da letra, em ordem. Origem do Mimeograph: `https://github.com/seatrunk/mimeograph.git`.

## Regras duras

Valem para todo passo. Se um passo quebrar uma delas, pare e pergunte à pessoa.

1. Nada de `curl | sh`, nem de mandar um download direto para um shell, nem de rodar um script que você não leu.
2. Nada de instalação global (`npm -g`, `corepack enable`, `brew`, `apt`, gerenciadores de versão e similares) sem perguntar antes.
3. Nada de segredo. Nunca peça, leia, imprima ou grave tokens, senhas ou arquivos `.env`. Se o git precisar de credencial que você não tem, pare e avise a pessoa.
4. Pergunte à pessoa antes de: sobrescrever ou apagar qualquer arquivo que já existia antes de você começar; criar ou mudar qualquer coisa em `.github/`, em configuração de CI ou em variável de repositório; rodar qualquer `git push` ou criar repositório remoto.
5. Mexa só no diretório de destino e no diretório temporário que você criar. Em mais nada.

Um arquivo que você copiou para o destino nesta execução não é um "arquivo que já existia antes de você começar". Tudo o que já estava no destino antes do passo 4 é.

Todo passo tem um **Pule se** (já feito) e uma **Verificação**. Se a verificação falhar depois de você rodar o passo, pare e mostre à pessoa o comando e a saída. Em algumas ferramentas as variáveis de shell não sobrevivem entre comandos; defina-as de novo em cada comando.

## Passo 1. Escolha o caminho

Pergunte à pessoa qual ela quer:

- **A. Projeto novo**: criar um diretório novo a partir do molde. Continue no passo 2.
- **B. Repositório existente**: adicionar a gaiola a um repositório que já tem arquivos ou histórico.

Se a resposta for **B**: adicionar o Mimeograph a um repositório existente ainda não é suportado. Está na https://github.com/seatrunk/mimeograph/issues/2. Diga isso à pessoa, não faça nenhuma mudança e pare. Não tente improvisar.

Se a pessoa só disser "instale" e o diretório atual já tiver arquivos ou um `.git`, pergunte; não presuma.

## Passo 2. Verifique as ferramentas

```sh
git --version
node -p "process.versions.node.split('.')[0] >= 24"
pnpm --version
```

Verificação: `git` e `pnpm` imprimem uma versão e a linha do `node` imprime `true`.

Se faltar algo ou o Node for anterior ao 24, pare e diga à pessoa o que falta. Não instale por conta própria (regra dura 2); pergunte como ela quer instalar.

## Passo 3. Pergunte o nome e o diretório

Pergunte à pessoa:

- o **nome do projeto**: letras minúsculas, dígitos e hífens, começando por letra. Verificação: `printf '%s' "$NAME" | grep -Eq '^[a-z][a-z0-9-]*$'`;
- o **diretório de destino**, padrão `./$NAME` dentro do diretório atual.

Verifique o destino:

```sh
if [ ! -e "$TARGET" ] || [ -z "$(ls -A "$TARGET")" ]; then echo ok-empty; else echo not-empty; fi
```

- `ok-empty`: continue no passo 4.
- `not-empty` e já contém uma execução anterior deste guia (`$TARGET/sgconfig.yml` existe e `node -p "require('$TARGET/package.json').name"` imprime `$NAME` ou `mimeograph`): pule o passo 4 e continue no passo 5.
- `not-empty` em qualquer outro caso: pare e peça outro diretório à pessoa. Não copie por cima.

## Passo 4. Copie o molde

**Pule se** o passo 3 encontrou uma execução anterior.

```sh
TMP="$(mktemp -d)"
git clone --depth 1 https://github.com/seatrunk/mimeograph.git "$TMP/mimeograph"
mkdir -p "$TARGET"
git -C "$TMP/mimeograph" archive HEAD | tar -x -C "$TARGET"
rm -r "$TMP"
```

`git archive` copia os arquivos sem o histórico do `.git`. Use a branch ou tag que a pessoa indicar com `git clone --depth 1 --branch <ref> ...`; senão, a branch padrão.

Se o `git clone` falhar porque o repositório é privado ou você não tem acesso, pare e avise a pessoa. Não peça tokens (regra dura 3).

Verificação:

```sh
test -f "$TARGET/sgconfig.yml" && test -d "$TARGET/rules/core" && test ! -e "$TARGET/.git" && echo ok
```

## Passo 5. Tire os arquivos que são só do molde

Estes pertencem ao próprio Mimeograph, não ao projeto novo. Em `$TARGET`:

```sh
cd "$TARGET"
rm -f README.pt-BR.md INSTALL.md INSTALL.pt-BR.md docs/assets/logo-mark.svg docs/assets/logo-wordmark.svg
if [ -d docs/assets ]; then rmdir docs/assets; fi
```

Mantenha `LICENSE`, `.github/`, `AGENTS.md`, `docs/features/`, `docs/limits*.md` e as features de exemplo. Não edite `.github/workflows/ci.yml` (regra dura 4).

Depois troque o `README.md` por este texto (use `$NAME`):

```md
# <nome>

Construído sobre a gaiola do Mimeograph. Rode `pnpm check` antes de cada commit; o CI roda o mesmo comando. As regras para agentes estão em [AGENTS.md](./AGENTS.md).
```

**Pule se** a primeira linha do `README.md` já for `# $NAME`.

Verificação:

```sh
test ! -e INSTALL.md && test ! -e README.pt-BR.md && test ! -d docs/assets && head -1 README.md
```

O último comando deve imprimir `# ` seguido do nome do projeto.

## Passo 6. Renomeie o projeto

No `package.json`, troque o campo `"name"` de `mimeograph` para `$NAME`. No `AGENTS.md`, troque a primeira linha de `# AGENTS.md (Mimeograph)` para `# AGENTS.md`. Edite só essas duas linhas.

**Pule se** já estiver feito.

Verificação:

```sh
node -p "require('./package.json').name"
head -1 AGENTS.md
```

O primeiro imprime `$NAME`; o segundo imprime `# AGENTS.md`.

## Passo 7. Inicie um repositório git

```sh
git -C "$TARGET" rev-parse --show-toplevel
```

- Falha: rode `git -C "$TARGET" init -b main`.
- Imprime `$TARGET` (caminho resolvido): já feito, pule.
- Imprime outro diretório: `$TARGET` está dentro de outro repositório. Pare e pergunte à pessoa.

Não faça commit e não adicione remote. Isso fica com a pessoa.

Verificação: `git -C "$TARGET" rev-parse --show-toplevel` imprime `$TARGET`.

## Passo 8. Instale as dependências

```sh
cd "$TARGET"
pnpm install --frozen-lockfile
```

Isso baixa pacotes do registro npm e roda o script de instalação do `@ast-grep/cli`, o único permitido em `pnpm-workspace.yaml`. Rodar de novo é seguro.

Verificação: o comando sai com 0 e `test -d node_modules` passa.

## Passo 9. Rode o portão

```sh
cd "$TARGET"
pnpm check
```

Verificação: código de saída 0. Esta é a definição de pronto.

Se falhar:

- Só na etapa do Prettier: rode `pnpm format` e depois `pnpm check` de novo.
- Qualquer outra: não edite `rules/`, `tests/` nem as configurações das ferramentas para passar, e não apague nem enfraqueça teste. Pare e mostre à pessoa a etapa que falhou e a saída.

## Passo 10. Relate à pessoa

Envie uma mensagem curta com estas linhas preenchidas:

```text
Mimeograph instalado em <TARGET>.
- nome do projeto: <NAME>
- pnpm check: verde (saída 0)
- git: iniciado na main, nada commitado, nada enviado, sem remote
- CI: .github/workflows/ci.yml copiado sem mudança. Roda em ubuntu-latest, a menos que a variável de repositório CI_RUNS_ON esteja definida (https://github.com/seatrunk/mimeograph/blob/main/README.pt-BR.md#runner-do-ci)
- licença: LICENSE mantida como copiada (MIT, copyright 2026 seatrunk); decida se o seu projeto precisa de outra
- exemplos: src/features/example-a e example-b e docs/features/example-flow.md mantidos; apague quando tiver a primeira feature real
- falta com você: primeiro commit, remote, push, variável do CI
```

Acrescente qualquer passo que você pulou e o motivo. Depois pare.

## Nota de segurança para pessoas

O que o agente vai fazer:

- perguntar o nome do projeto, o diretório e qual caminho você quer;
- baixar este repositório com `git clone` e nada mais da rede além dos pacotes npm do lockfile;
- criar arquivos só dentro do diretório que você escolheu, rodar `git init` ali, rodar `pnpm install --frozen-lockfile` e `pnpm check`;
- dizer exatamente o que fez e o que sobrou para você.

O que o agente não vai fazer:

- instalar nada globalmente, mandar download direto para um shell, nem pedir ou mexer em tokens, senhas e arquivos `.env`;
- escrever em diretório que já tem arquivos, nem sobrescrever ou apagar o que havia nele;
- mudar CI, definir variáveis ou configurações de repositório, criar repositório remoto, fazer commit ou push;
- aplicar o Mimeograph a um repositório existente (ainda não é suportado, veja a issue #2);
- enfraquecer uma regra ou um teste para deixar o `pnpm check` verde.

Se um agente fizer algo da segunda lista, interrompa-o.
