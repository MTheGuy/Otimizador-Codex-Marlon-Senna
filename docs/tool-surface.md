# Referência das ferramentas MCP

A implementação atual e seus testes são a autoridade. As declarações em src/main/mcp/surfaces.ts, tools-core.ts e tools-desktop.ts devem permanecer alinhadas a esta referência.

## Conectores

Os nomes públicos usam a identidade de customization/app.config.json.

| Conector | Finalidade | Ferramentas possíveis |
| --- | --- | --- |
| Core | Arquivos aprovados, alterações, terminal, histórico e workers | read, view_image, find, apply_patch, exec_command, write_stdin, session, agents, session_finish |
| Desktop | Tela, janelas, mouse, teclado e área de transferência | observe, computer |

Core existe nas plataformas suportadas. Desktop é opcional em Windows e macOS e não é anunciado nem executado no Linux. Cada conector tem descoberta, permissões e caminho secreto próprios.

Instalações novas começam em STRICT: leitura depende de uma pasta aprovada; escrita, comandos e desktop ficam desativados. Gravação e coordenação de workers continuam disponíveis como recursos, sem conceder acesso adicional ao computador.

A lista anunciada depende dos recursos e das permissões. find oferece pesquisa quando comandos não estão disponíveis. session_finish depende da opção correspondente. Metadados antigos podem permanecer em uma conversa, mas toda chamada verifica a autorização atual.

## Ferramentas Core

### read

Lê caminhos aprovados, lista um nível de diretório, expande padrões limitados e aceita intervalos de linhas. Também pode retornar imagens suportadas. Os limites padrão atuais são 256 KB por arquivo e 512 KB no resultado agregado.

### view_image

Ferramenta dedicada para imagens, separada de read e dependente da permissão de leitura. Transporte e decodificação são limitados.

### find

Pesquisa nomes e texto sem conceder acesso ao shell. É a alternativa quando pesquisa está habilitada e comandos não estão disponíveis na descoberta.

### apply_patch

Aplica alterações de texto no formato V4A. Valida o conjunto de mudanças antes de gravar. Criar, editar, mover e excluir arquivos dependem de permissões distintas.

Exclusão de diretórios e escrita binária arbitrária não são operações ocultas dessa ferramenta.

### exec_command

Executa comandos no shell real e com os privilégios da conta. Uma pasta de trabalho aprovada não restringe o processo a essa pasta.

Aceita cmd para um comando ou cmds para até vinte comandos sequenciais na mesma sessão. O lote compartilha variáveis, ambiente e diretório; cada item informa saída e código de término. Uma falha não interrompe automaticamente os próximos itens, e o resultado global conserva a primeira falha.

A interceptação de apply_patch e o tratamento especial de alguns códigos benignos valem para comando único. Processos longos retornam session_id para continuidade.

### write_stdin

Envia entrada ou consulta a saída de uma sessão existente. Uma entrada chars vazia consulta a saída com espera e orçamento limitados. A consulta pode retornar assim que surgir saída; os dados posteriores ficam disponíveis na próxima chamada.

### session

Disponível quando a gravação está habilitada, com duas ações:

- search lista gravações recentes ou pesquisa títulos, mensagens, erros, comunicações de agentes e dados de ferramentas. Sem query, começa pelas trinta gravações mais recentes.
- read exige session_id explícito. Retorna mensagens autorais, resumos das ferramentas e referências locais para detalhes.

As respostas usam cursores. Mensagens autorais não são resumidas nem cortadas silenciosamente. update_cursor permite pedir só a atividade nova e distingue uma reescrita real de um texto que apenas cresceu.

A pesquisa não adivinha a conversa chamadora. As consultas session permanecem auditáveis, mas não são reproduzidas recursivamente no próprio histórico consultado.

Compact & Resume é uma operação do aplicativo e do navegador. Não existem ferramentas públicas save_handoff ou resume_session.

### agents

Disponível quando a coordenação está habilitada:

- spawn abre workers com contexto compartilhado e tarefas individuais; pode definir model e reasoning_effort.
- message envia uma mensagem ou lote indivisível e reativa um worker adormecido na mesma conversa.
- status informa a execução, os workers e as vagas disponíveis.
- finish entrega o resultado ao principal e coloca o worker em espera.

Prefira reutilizar um worker adequado. Workers em espera conservam sua conversa e liberam a vaga. Reativá-los exige uma vaga disponível.

Modelo e esforço são campos independentes; omiti-los conserva os padrões normais. Um nível de esforço não seleciona outro modelo.

Ao atingir o limite local de contexto, o próximo encerramento pode tornar o worker não reutilizável. Isso não interrompe trabalho em andamento. Workers não executam Compact & Resume: a conversa participa da identidade persistente do agente.

A extensão precisa comprovar a associação entre conversa e agente. O modelo não fornece uma credencial de agente própria. Chamadas sensíveis são recusadas quando a identidade não pode ser confirmada.

### session_finish

Entrega o ponto de conclusão ao mecanismo de continuidade quando habilitado para o fluxo compatível. Planos, instruções aguardando entrega e próximos passos permanecem sob os controles do aplicativo.

## Ferramentas Desktop

### observe

Observa capturas, janelas e controles sem mover o foco. Uma captura de janela pode usar a rota de fundo; a alternativa da tela visível é identificada quando sobreposições podem afetar o resultado.

Observar a tela e controlar mouse ou teclado são permissões diferentes.

### computer

Executa um lote limitado de click_ref, set_value, click, double_click, move, drag, scroll, type, keypress, focus, wait, read_clipboard e write_clipboard.

Ações por coordenadas identificam o quadro e revalidam a geometria da janela antes da entrada física. Referências semânticas pertencem a uma observação limitada e são recusadas quando ficam obsoletas.

O resultado informa etapas concluídas e o índice de uma falha parcial. A condição verify pode acompanhar mudanças de janelas ou controles e capturar o estado resultante.

Cada etapa verifica as permissões atuais de tela, controle e área de transferência. Somente leitura pode preservar observação e impedir ações que alteram estado.

## Invariantes e compatibilidade

- Uma ferramenta anunciada anteriormente não conserva uma permissão revogada.
- Core e Desktop não encaminham ferramentas um do outro.
- O token de um conector não autoriza o outro.
- Somente leitura reduz permissões efetivas sem fingir uma alteração na configuração armazenada.
- Pastas aprovadas não isolam comandos ou controle do desktop.
- Resultados, imagens, dados estruturados e erros têm limites explícitos.

Após trocar a versão, recarregue a extensão descompactada. Quando a lista de ferramentas mudar, atualize ou revise o conector no ChatGPT. O pareamento local é automático, sem código numérico.

Os testes MCP verificam participação nas superfícies, recusas entre conectores, limites, permissões e formatos. A imagem dedicada também possui testes de paridade. Mudanças de contrato devem atualizar implementação, declarações, testes e referência em conjunto.
