# Contribuir com o projeto

Mantenha cada mudança focada em um resultado verificável. Preserve os contratos de permissões, identidade das conversas, sessões, recuperação e recursos nativos, salvo quando a tarefa exigir uma alteração específica.

## Ambiente

Use Node.js 22 ou mais recente:

~~~sh
npm ci
npm run doctor
npm run dev
~~~

Leia AGENTS.md antes de editar. A implementação atual e os testes reproduzíveis prevalecem sobre documentação desatualizada.

## Implementação e validação

Reutilize os mecanismos existentes. Escreva código legível e consistente com a arquitetura, comentando apenas decisões ou restrições que não sejam evidentes.

Execute os testes mais próximos da mudança durante o trabalho. Antes de concluir produção, execute npm run typecheck e npm run verify.

Mudanças de empacotamento, recursos ou módulos nativos também exigem compilação e verificação do aplicativo empacotado. Produzir um arquivo para outra plataforma não prova que ele funciona.

## Identidade e distribuição

Edite customization/app.config.json ou use npm run customize. Nomes, imagens e destinos de publicação pertencem à configuração, não aos componentes do produto.

npm run build:custom prepara o instalador Windows x64. Os comandos dist das demais plataformas continuam disponíveis. A publicação é separada da geração; o aplicativo não possui atualizador interno.

## Revisão

Descreva o problema, o comportamento resultante e a validação realizada. Preserve alterações de outras pessoas no mesmo diretório.

Não inclua credenciais, conversas privadas, dados pessoais ou arquivos temporários em commits. Questões de segurança seguem o canal privado descrito em SECURITY.md.
