# Ferramenta DEV interna de personalização

Este guia é destinado à equipe de desenvolvimento. O usuário recebe o instalador pronto; não precisa configurar marca, compilar o aplicativo ou executar esta ferramenta.

O personalizador é opcional, não é iniciado pelo aplicativo instalado e não integra seu fluxo normal. Ele serve à preparação de uma distribuição completa, incluindo nome do produto, ícones, extensão e instalador. A preferência de nome exibido no aplicativo é independente e mantém o identificador da instalação.

Execute `npm run customize` na pasta do projeto. A tela abre no navegador e funciona somente neste computador.

1. Edite o nome, a versão, as descrições e as imagens.
2. Clique em **Salvar configuração**.
3. Clique em **Verificar projeto** e resolva eventuais pendências.
4. Clique em **GERAR INSTALADOR**. O arquivo Windows x64 ficará na pasta `release`.

A configuração ativa é `customization/app.config.json`. O botão **Usar modelo neutro** preenche um exemplo editável; ele só é aplicado após salvar. Para encerrar a tela local, use `Ctrl+C` no terminal que a abriu.

Imagens devem ser PNG, JPEG ou WebP estáticas, com até 4 MB e 16 milhões de pixels. A tela copia as imagens escolhidas para `customization/assets`. Caminhos escritos diretamente no arquivo são relativos à pasta `customization`; caminhos externos e links que saem dela são recusados. Campos vazios usam a marca neutra; logo e ícone da extensão herdam o ícone do aplicativo quando não têm imagem própria.

`appId` e `packageName` identificam a instalação e seus dados. Mantenha-os estáveis nas próximas versões da mesma distribuição. As chaves de configuração, nomes de ferramentas e protocolos são técnicos e permanecem estáveis.

O repositório de publicação é usado apenas para distribuir arquivos e permitir downloads manuais. Gerar um instalador não publica arquivos e não instala o aplicativo automaticamente.

Também é possível usar:

- `npm run customize:apply`: validar e sincronizar a identidade nos metadados.
- `npm run doctor`: verificar a configuração e as dependências sem modificá-las.
- `npm run build`: compilar o aplicativo.
- `npm run build:custom`: gerar o instalador Windows x64 com a configuração atual.

Os ícones são preparados antes de compilar e empacotar. O empacotamento conserva os recursos, módulos nativos e extensão do aplicativo, com caches e arquivos temporários dentro da cópia do projeto.
