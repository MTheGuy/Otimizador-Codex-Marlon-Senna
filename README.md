# Otimizador Codex - Marlon Senna

## Baixar — Windows x64

[Baixar o instalador](https://github.com/MTheGuy/Otimizador-Codex-Marlon-Senna/releases/latest/download/Otimizador-Codex-Marlon-Senna-Setup-x64.exe) · [Última versão e arquivos](https://github.com/MTheGuy/Otimizador-Codex-Marlon-Senna/releases/latest)

Baixe, instale e abra pelo atalho. Não é necessário instalar Node.js ou usar terminal.

## Eficiência, custo e segurança

Este é um aplicativo desktop local que conecta ferramentas MCP ao ChatGPT no Chrome, conserva sessões e permite que uma conversa principal (Prime) coordene auxiliares. Ele não modifica o Codex oficial, as cotas, os preços ou os limites da sua conta.

Compact & Resume pode reduzir a necessidade de reconstruir o contexto de uma tarefa. Isso não garante economia ou maior velocidade: workers e Goal/Loop podem aumentar o trabalho e o consumo; usar OpenRouter pode acrescentar cobrança de API. Ainda não há benchmark comparativo que demonstre economia ou ganho de desempenho desta distribuição.

Instalações novas começam em STRICT, sem pastas aprovadas, em somente leitura e com comandos e desktop desativados. Os perfis exigem escolhas explícitas, e as credenciais armazenadas usam a proteção segura oferecida pelo sistema. Ao habilitar comandos ou desktop, eles usam o acesso real da sua conta: isso não equivale a uma sandbox restrita ao projeto. POWER USER amplia esse alcance e exige cuidado.

O empacotamento atual não configura assinatura de publicador; o Windows pode exibir alertas do SmartScreen. Não há garantia de segurança absoluta. Consulte os limites, a proteção das credenciais e o histórico local de sessões em [SECURITY.md](SECURITY.md).

Evidência disponível: 27 testes dirigidos de personalização, caminhos, acesso HTTP e ícones aprovados. A validação integrada do pacote Windows x64 continua indicada nas [notas da versão](docs/release-notes/v1.0.0.md); testes dirigidos não comprovam segurança total nem desempenho comparativo.

## Instalar

1. Baixe o instalador Windows x64 pelos links acima.
2. Execute o arquivo e siga as etapas em português. Você pode escolher a pasta e criar atalhos.
3. Abra o aplicativo pelo atalho, revise as permissões e aprove somente os projetos necessários.
4. Configure a conexão MCP no aplicativo e adicione Core ao ChatGPT. Desktop é opcional.
5. Abra a pasta da extensão pelo aplicativo. No Chrome, acesse chrome://extensions, ative o modo de desenvolvedor e carregue essa pasta como extensão descompactada. O pareamento local é automático.

É possível abrir o aplicativo sem aprovar pastas. O acesso aos arquivos depende dessa escolha. A desinstalação preserva os dados locais.

O aplicativo desktop possui executável e recursos próprios. A tela inicial apresenta Marlon Senna como padrão; cada pessoa pode trocar esse nome nas Configurações, sem mudar o identificador da instalação.

Novas versões são distribuídas como arquivos para download manual. O aplicativo não oferece atualizador interno.

## Requisitos

- Windows 10 ou 11 para a distribuição Windows x64.
- Chrome 116 ou mais recente para a extensão.
- Conta do ChatGPT com os recursos de conexão MCP necessários disponíveis.
- Internet para o ChatGPT e o túnel configurado.

## Permissões

| Perfil | Acesso |
| --- | --- |
| STRICT | Leitura dos projetos aprovados. Escrita, comandos, tela, controle e área de transferência desativados. |
| BALANCED | Leitura e alteração de arquivos aprovados. Comandos e desktop desativados. |
| POWER USER | Todas as permissões disponíveis na plataforma. |
| CUSTOM | Escolha individual, sem ampliação automática ao selecionar o perfil. |

Somente leitura desativa escrita de arquivos, comandos, controle e escrita na área de transferência. A recusa local já vale mesmo quando o ChatGPT mostra uma lista antiga de ferramentas.

## Sessões e continuidade

O histórico conserva mensagens e resultados das ferramentas. A extensão identifica a conversa e coordena as abas dos workers; a execução das ferramentas locais pertence ao aplicativo. Compact & Resume continua a sessão local em uma conversa nova. Planos, Goal e Loop ficam nos controles de continuidade.

Consulte a [referência das ferramentas](docs/tool-surface.md) e a [política de segurança](SECURITY.md).

## Problemas comuns

- Extensão desconectada: confirme que o aplicativo está aberto e recarregue a extensão correspondente à versão instalada.
- Ferramentas ausentes após mudar permissões: atualize o conector no ChatGPT.
- Conversa não identificada: use a conversa no navegador em que a extensão está conectada.
- Lista de modelos vazia: atualize a lista e use a aba aberta pelo aplicativo. A integração depende da interface do ChatGPT; se necessário, altere temporariamente o idioma dessa interface para inglês, recarregue a aba e tente novamente.
- Arquivo de instalação incorreto: confirme que baixou a versão Windows x64 da página desta distribuição.

Para trabalhar no código ou preparar uma distribuição, consulte a [documentação de desenvolvimento](docs/development.md). Essas etapas não fazem parte da instalação ou do uso normal.
