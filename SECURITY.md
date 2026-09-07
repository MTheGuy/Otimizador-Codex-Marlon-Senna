# Segurança

## Relatar um problema

Use o canal privado configurado para este repositório. Quando disponível, utilize Security → Report a vulnerability no GitHub.

Inclua uma reprodução pequena, versão do aplicativo, sistema, arquitetura e estado da extensão. Remova credenciais, URLs secretas de túneis, conversas e arquivos pessoais antes de compartilhar evidências.

## Limites do aplicativo

- Ferramentas de arquivo validam caminhos nas pastas explicitamente aprovadas.
- Instalações novas começam em STRICT, com leitura e sem pastas aprovadas. Escrita, comandos e desktop ficam desativados.
- Configurações existentes mantêm escolhas explícitas; ausência de configuração não concede acesso adicional.
- Somente leitura desativa escrita de arquivos, comandos, controle do desktop e escrita na área de transferência.
- Comandos usam os privilégios reais da conta. A pasta de trabalho não isola o processo.
- Tela, mouse, teclado e área de transferência têm alcance sobre o desktop. No macOS, também dependem das permissões do sistema.
- MCP escuta em loopback e usa caminhos secretos. O acesso externo depende do túnel configurado.
- A ponte da extensão é separada e não possui rotas de arquivos, comandos ou alteração de permissões.
- Credenciais usam os mecanismos seguros do Electron e do sistema.
- Sessões são histórico local detalhado. A gravação pode ser desativada e não usa a mesma criptografia das credenciais.

Verificações de caminhos são controles do aplicativo, não uma máquina virtual ou isolamento imposto pelo sistema. Processos que têm acesso à mesma conta continuam dentro desse limite de confiança.

## Verificação

Mudanças em permissões, identidade, processos e desktop precisam de evidência reproduzível e de um caso negativo relevante. Preserve as recusas quando uma identidade ou permissão não puder ser comprovada.
