# Desenvolvimento e preparação da distribuição

Este documento é destinado à equipe de desenvolvimento. O usuário recebe o instalador pronto e segue o fluxo de baixar, instalar e abrir descrito no README.

## Identidade da entrega

A configuração ativa é `customization/app.config.json`. A entrega 1.0.0 usa o nome **Otimizador Codex - Marlon Senna** e o arquivo **Otimizador-Codex-Marlon-Senna-Setup-x64.exe**. A preparação, validação e publicação desses arquivos são responsabilidade de quem mantém a distribuição.

`appId` e `packageName` identificam a instalação e devem permanecer estáveis entre versões. A preferência de nome exibido nas Configurações do aplicativo instalado é independente da identidade do pacote.

## Ambiente

Use Node.js 22 ou mais recente na cópia do projeto:

```sh
npm ci
npm run doctor
npm run dev
```

Leia `AGENTS.md` e `CONTRIBUTING.md` antes de editar. Durante o trabalho, use os testes próximos da alteração; antes de concluir produção, execute os controles de verificação do projeto.

```sh
npm run typecheck
npm run verify
npm run build
```

## Preparar o instalador

```sh
npm run build:custom
```

O comando sincroniza os metadados, prepara os ícones e reutiliza o empacotamento Windows x64. Os arquivos ficam em `release`. Gerar o pacote não instala nem publica o aplicativo.

Verifique o aplicativo empacotado, os recursos e os módulos nativos antes de declarar a entrega validada. A aprovação do bundle, isoladamente, não comprova o instalador.

As receitas de Windows ARM64, macOS e Linux continuam no projeto. Esses artefatos não foram produzidos nem validados nesta entrega.

## Ferramenta DEV opcional

O comando `npm run customize` abre uma ferramenta interna em loopback para preparar outra identidade de distribuição. Ela não é iniciada pelo aplicativo instalado, não integra o fluxo normal do usuário e não é um requisito para usar o produto.

O [guia interno do personalizador](../customization/README.md) descreve imagens, metadados e controles dessa ferramenta. `Ctrl+C` encerra o servidor DEV; o navegador do usuário deve permanecer sob seu controle.

A ferramenta escuta somente em `127.0.0.1`, usa uma sessão temporária e exige origem local nas gravações. Entradas têm limites de tamanho e caminhos permanecem na cópia do projeto após resolver links simbólicos. Ela usa comandos fixos de empacotamento, sem aceitar comandos arbitrários ou publicar arquivos.

## Publicação

O destino aprovado é `MTheGuy/Otimizador-Codex-Marlon-Senna`. A configuração de publicação serve à distribuição de arquivos para download manual. O aplicativo não contém atualizador interno.

Publicar é uma etapa separada e deve usar os artefatos da versão validada, com seus hashes. Não substitua uma verificação do pacote por um resultado de compilação de outro estado do código.
