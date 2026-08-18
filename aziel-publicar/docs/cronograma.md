# Cronograma de Desenvolvimento do Aziel

## 1. Identificação do documento

| Informação | Valor |
|---|---|
| Sistema | Aziel — Gestão Operacional e Automação |
| Documento | Cronograma de Desenvolvimento |
| Versão do documento | 1.1 |
| Versão atual do sistema | 0.2.0 (conforme rodapé de `index.html`; ver nota de auditoria abaixo) |
| Data inicial | 30/07/2026 |
| Módulo inicial | Controle de Devoluções |
| Metodologia | Desenvolvimento por fases e entregas |

---

## 2. Objetivo

Este documento organiza a construção do Aziel em etapas pequenas, testáveis e documentadas.

O cronograma deverá ajudar a:

- manter uma ordem lógica de desenvolvimento;
- evitar a criação simultânea de muitas funcionalidades;
- acompanhar o progresso;
- registrar o que já foi entregue;
- reduzir retrabalho;
- garantir que cada etapa seja testada antes da próxima;
- transformar o projeto em uma trilha prática de aprendizado.

---

## 3. Forma de trabalho

Cada etapa deverá seguir este ciclo:

```text
Entender
   ↓
Documentar
   ↓
Desenvolver
   ↓
Testar
   ↓
Corrigir
   ↓
Registrar
   ↓
Avançar
```

Uma etapa somente deverá ser considerada concluída quando:

- o objetivo estiver claro;
- o código estiver funcionando;
- os testes principais tiverem sido executados;
- os erros conhecidos estiverem registrados;
- a documentação estiver atualizada;
- o usuário entender o que foi desenvolvido.

---

## 4. Critérios de prioridade

As funcionalidades serão priorizadas considerando:

| Critério | Pergunta |
|---|---|
| Frequência | Essa atividade acontece todos os dias? |
| Tempo | Quanto trabalho manual ela consome? |
| Risco | Um erro pode gerar problema operacional? |
| Dependência | Outras funcionalidades precisam dela? |
| Automação | Quanto do processo pode ser automatizado com segurança? |
| Aprendizado | A etapa ajuda a compreender conceitos importantes? |

O módulo de devoluções foi escolhido primeiro porque:

- faz parte da rotina diária;
- envolve conferência repetitiva;
- possui risco de esquecimento;
- utiliza informações estruturadas;
- permite automação parcial;
- não substitui a análise humana.

---

# 5. Visão geral das fases

> **Nota de auditoria (10/08/2026):** esta tabela estava desatualizada.
> O código já implementado ia muito além do que estava registrado aqui.
> Os status abaixo foram corrigidos após leitura linha a linha do código
> e testes com extratos bancários reais. Ver Sessão 008 do diário de
> desenvolvimento para o detalhamento completo.

| Fase | Nome | Resultado principal | Situação |
|---|---|---|---|
| 0 | Levantamento e documentação | Processo entendido e documentado | Concluída |
| 1 | Fundação do sistema | Estrutura visual e navegação | Concluída |
| 2 | Dados e utilitários | Funções básicas reutilizáveis | Concluída |
| 3 | Importação de PDF | Seleção e leitura do extrato | Concluída |
| 4 | Interpretação do extrato | Conta, período e movimentações | Concluída (corrigida em 10/08/2026) |
| 5 | Identificação de devoluções | Créditos e CNPJ candidatos | Concluída (corrigida em 10/08/2026) |
| 6 | Confirmação e histórico | Registro das devoluções | Concluída |
| 7 | Consulta ao Fluig | Controle de projetos candidatos | Concluída |
| 8 | Geração de e-mail | Comunicação ao financeiro | Concluída |
| 9 | Dashboard e rotina diária | Visão das contas e pendências | Parcial — falta filtro por período |
| 10 | Persistência e segurança | Dados armazenados com controle | Parcial — grava em IndexedDB local; falta decidir ambiente autorizado (ver RNF-015) |
| 11 | Indicadores ISO | Rotina mensal organizada | Não iniciada — página `indicadores.html` é um placeholder vazio |
| 12 | Controle do servidor | Pastas e divergências | Não iniciada — página `servidor.html` é um placeholder vazio |
| 13 | Relatórios | Diretoria e MDM8 | Não iniciada — página `relatorios.html` é um placeholder vazio |
| 14 | Integrações futuras | Fluig, e-mail e automações | Não iniciada |

---

# 6. Fase 0 — Levantamento e documentação

## Objetivo

Compreender o processo real antes de escrever o código.

## Entregas

- [x] Nome do sistema definido.
- [x] Objetivo inicial definido.
- [x] Estrutura de pastas criada.
- [x] README criado.
- [x] Requisitos iniciais documentados.
- [x] Regras de negócio documentadas.
- [x] Casos de teste iniciais documentados.
- [ ] Cronograma concluído.
- [ ] Diário de desenvolvimento criado.
- [ ] Extratos de teste anonimizados organizados.
- [ ] Exemplo da conta 45.141-X analisado.
- [ ] Exemplos de PIX e outras transferências analisados.

## Conceitos estudados

- diferença entre problema e solução;
- requisito funcional;
- requisito não funcional;
- regra de negócio;
- caso de teste;
- escopo;
- documentação de software.

## Critério de conclusão

A fase estará concluída quando o processo inicial de devoluções estiver documentado o suficiente para iniciarmos a interface sem depender de suposições críticas.

---

# 7. Fase 1 — Fundação visual do sistema

## Objetivo

Criar a base visual e estrutural do Aziel.

## Entregas

- [ ] Estrutura principal do `index.html`.
- [ ] Conexão do arquivo CSS.
- [ ] Conexão do arquivo JavaScript.
- [ ] Menu lateral.
- [ ] Cabeçalho.
- [ ] Área principal de conteúdo.
- [ ] Padrão de botões.
- [ ] Padrão de campos.
- [ ] Padrão de tabelas.
- [ ] Padrão de mensagens.
- [ ] Navegação entre as páginas.
- [ ] Layout responsivo básico.

## Páginas iniciais

- Dashboard;
- Devoluções;
- Demandas;
- Rotinas;
- Indicadores;
- Servidor;
- Relatórios.

## Conceitos estudados

### HTML

- estrutura básica;
- elementos semânticos;
- links;
- listas;
- botões;
- formulários;
- tabelas;
- atributos;
- classes e identificadores.

### CSS

- seletores;
- cores;
- tipografia;
- espaçamento;
- bordas;
- Flexbox;
- Grid;
- responsividade;
- variáveis CSS.

### JavaScript

- conexão do arquivo;
- eventos básicos;
- manipulação inicial da página.

## Critério de conclusão

A fase estará concluída quando todas as páginas puderem ser abertas e compartilharem o mesmo padrão visual.

## Versão prevista

```text
0.2.0
```

---

# 8. Fase 2 — Dados e funções utilitárias

## Objetivo

Criar funções pequenas que serão reutilizadas em várias partes do sistema.

## Entregas

- [ ] Formatação de data brasileira.
- [ ] Conversão de data para formato interno.
- [ ] Formatação monetária.
- [ ] Conversão de moeda para número.
- [ ] Limpeza de CNPJ.
- [ ] Formatação de CNPJ.
- [ ] Validação de CNPJ.
- [ ] Geração de identificadores.
- [ ] Cópia de texto para a área de transferência.
- [ ] Exibição de mensagens de sucesso e erro.
- [ ] Organização inicial dos módulos JavaScript.

## Conceitos estudados

- variáveis;
- constantes;
- tipos de dados;
- funções;
- parâmetros;
- retorno;
- condicionais;
- operadores;
- arrays;
- objetos;
- métodos de texto;
- reutilização de código.

## Testes prioritários

- CT-MOV-003;
- CT-CNPJ-001;
- CT-CNPJ-002;
- CT-CNPJ-003;
- CT-CNPJ-004;
- CT-CNPJ-005.

## Critério de conclusão

A fase estará concluída quando as funções utilitárias produzirem os resultados esperados nos testes básicos.

## Versão prevista

```text
0.3.0
```

---

# 9. Fase 3 — Página de importação de PDF

## Objetivo

Permitir que o usuário selecione um extrato em PDF e veja o arquivo antes do processamento.

## Entregas

- [ ] Área de seleção de arquivo.
- [ ] Validação da extensão.
- [ ] Exibição do nome do arquivo.
- [ ] Exibição do tamanho.
- [ ] Botão para remover o arquivo.
- [ ] Botão para processar.
- [ ] Estado de carregamento.
- [ ] Mensagens de erro.
- [ ] Biblioteca de leitura de PDF configurada.

## Conceitos estudados

- formulário de arquivo;
- eventos;
- objeto `File`;
- validação;
- programação assíncrona;
- `Promise`;
- `async` e `await`;
- bibliotecas externas.

## Testes prioritários

- CT-PDF-001;
- CT-PDF-002;
- CT-PDF-003.

## Critério de conclusão

A fase estará concluída quando um PDF digital puder ser selecionado e seu texto extraído sem travar a interface.

## Versão prevista

```text
0.4.0
```

---

# 10. Fase 4 — Interpretação do extrato

## Objetivo

Transformar o texto extraído do PDF em dados organizados.

## Entregas

- [ ] Identificação da agência.
- [ ] Identificação da conta.
- [ ] Formatação do número da conta.
- [ ] Identificação do período.
- [ ] Identificação da data de emissão.
- [ ] Localização da seção de lançamentos.
- [ ] Separação das linhas.
- [ ] Identificação de extrato sem movimentação relevante.
- [ ] Tratamento de conta desconhecida.
- [ ] Descarte de tokens e informações sensíveis.

## Estrutura esperada

```javascript
const extrato = {
  conta: "",
  agencia: "",
  periodoInicial: "",
  periodoFinal: "",
  dataEmissao: "",
  movimentacoes: []
};
```

## Conceitos estudados

- leitura e tratamento de texto;
- expressões regulares;
- normalização;
- objetos;
- separação de responsabilidades;
- validação de dados.

## Testes prioritários

- CT-EXT-001;
- CT-EXT-002;
- CT-EXT-003;
- CT-EXT-004;
- CT-EXT-005;
- CT-REAL-001;
- CT-SEG-001;
- CT-SEG-002.

## Critério de conclusão

A fase estará concluída quando o sistema identificar corretamente conta e período nos arquivos de teste.

## Versão prevista

```text
0.5.0
```

---

# 11. Fase 5 — Identificação das movimentações

## Objetivo

Reconhecer os lançamentos bancários e localizar possíveis devoluções.

## Entregas

- [ ] Identificação de linhas principais.
- [ ] Associação de linhas complementares.
- [ ] Extração da data.
- [ ] Extração da hora.
- [ ] Extração do histórico.
- [ ] Extração do documento.
- [ ] Extração do valor.
- [ ] Identificação de crédito e débito.
- [ ] Classificação de movimentações internas.
- [ ] Classificação de possíveis recebimentos externos.
- [ ] Extração de possíveis CNPJs.
- [ ] Nível inicial de confiança.

## Classificações iniciais

- alta possibilidade de devolução;
- possível devolução;
- possível devolução sem CNPJ;
- movimentação interna;
- movimentação desconhecida;
- necessita revisão.

## Conceitos estudados

- percorrer arrays;
- comparação de textos;
- listas de padrões;
- regras condicionais;
- agrupamento de dados;
- algoritmo de classificação.

## Testes prioritários

- CT-REAL-002;
- CT-REAL-003;
- CT-REAL-004;
- CT-REAL-005;
- CT-MOV-001;
- CT-MOV-002;
- CT-MOV-004;
- CT-CNPJ-006;
- CT-CNPJ-007.

## Critério de conclusão

A fase estará concluída quando o extrato real de teste gerar uma possível devolução com os dados corretos.

## Versão prevista

```text
0.6.0
```

---

# 12. Fase 6 — Confirmação e registro da devolução

## Objetivo

Permitir que o usuário confirme ou descarte as movimentações sugeridas.

## Entregas

- [ ] Tela de revisão da movimentação.
- [ ] Botão `Confirmar devolução`.
- [ ] Botão `Não é devolução`.
- [ ] Motivos de descarte.
- [ ] Campo de observação.
- [ ] Geração do código da devolução.
- [ ] Cadastro manual.
- [ ] Controle de status.
- [ ] Histórico inicial.
- [ ] Prevenção de movimentação duplicada.

## Conceitos estudados

- formulários;
- validação;
- criação e alteração de objetos;
- armazenamento de estado;
- eventos;
- confirmação de ações.

## Testes prioritários

- CT-DEV-001;
- CT-DEV-002;
- CT-DEV-003;
- CT-DUP-001;
- CT-DUP-002;
- CT-DUP-003.

## Critério de conclusão

A fase estará concluída quando uma movimentação puder ser confirmada, descartada e consultada no histórico.

## Versão prevista

```text
0.7.0
```

---

# 13. Fase 7 — Consulta e registro do Fluig

## Objetivo

Organizar a consulta manual dos projetos encontrados pelo CNPJ.

## Entregas

- [ ] Exibição do CNPJ sem formatação.
- [ ] Botão para copiar CNPJ.
- [ ] Botão para abrir o Fluig.
- [ ] Registro da data da consulta.
- [ ] Resultado `Nenhum projeto`.
- [ ] Resultado `Um projeto`.
- [ ] Resultado `Vários projetos`.
- [ ] Cadastro de projeto candidato.
- [ ] Seleção do projeto confirmado.
- [ ] Nova consulta futura.
- [ ] Histórico das consultas.
- [ ] Status `Aguardando projeto no Fluig`.

## Conceitos estudados

- relacionamento entre dados;
- arrays de objetos;
- seleção de registros;
- histórico;
- atualização de status;
- abertura de links externos.

## Testes prioritários

- CT-FLUIG-001;
- CT-FLUIG-002;
- CT-FLUIG-003;
- CT-FLUIG-004;
- CT-FLUIG-005.

## Critério de conclusão

A fase estará concluída quando uma devolução puder registrar nenhum, um ou vários projetos e manter o histórico das consultas.

## Versão prevista

```text
0.8.0
```

---

# 14. Fase 8 — Geração do e-mail

## Objetivo

Gerar a comunicação padronizada para o setor financeiro.

## Entregas

- [ ] Modelo do assunto.
- [ ] Modelo do corpo.
- [ ] Formatação automática do valor.
- [ ] Preenchimento dos dados.
- [ ] Edição manual.
- [ ] Botão para copiar assunto.
- [ ] Botão para copiar corpo.
- [ ] Botão para copiar e-mail completo.
- [ ] Confirmação manual de envio.
- [ ] Registro de data e hora.
- [ ] Atualização do status.

## Conceitos estudados

- template string;
- interpolação;
- área de transferência;
- formulários editáveis;
- controle de status.

## Testes prioritários

- CT-EMAIL-001;
- CT-EMAIL-002;
- CT-EMAIL-003;
- CT-EMAIL-004.

## Critério de conclusão

A fase estará concluída quando o e-mail puder ser gerado, editado, copiado e marcado como enviado.

## Versão prevista

```text
0.9.0
```

---

# 15. Fase 9 — Dashboard e rotina diária

## Objetivo

Centralizar o acompanhamento das duas contas e das pendências.

## Entregas

- [ ] Card da conta 45.140-1.
- [ ] Card da conta 45.141-X.
- [ ] Situação diária de cada conta.
- [ ] Possíveis devoluções.
- [ ] Devoluções confirmadas.
- [ ] Projetos não encontrados.
- [ ] E-mails pendentes.
- [ ] Total devolvido no mês.
- [ ] Atalhos rápidos.
- [ ] Filtros por período.
- [ ] Aviso de conta ainda não conferida.

## Conceitos estudados

- cálculo de indicadores;
- filtros;
- atualização da interface;
- componentes visuais;
- agregação de dados.

## Testes prioritários

- CT-ROT-001;
- CT-ROT-002.

## Critério de conclusão

A fase estará concluída quando o usuário conseguir visualizar a situação diária sem precisar consultar cada página separadamente.

## Versão prevista

```text
1.0.0
```

---

# 16. Fase 10 — Persistência, banco de dados e segurança

## Objetivo

Substituir o armazenamento temporário por uma solução adequada ao uso operacional.

## Entregas previstas

- [ ] Avaliar o ambiente autorizado.
- [ ] Definir arquitetura.
- [ ] Definir banco de dados.
- [ ] Criar autenticação.
- [ ] Criar perfis de acesso.
- [ ] Criar backup.
- [ ] Criar registro de usuário.
- [ ] Criar auditoria.
- [ ] Criar política de retenção.
- [ ] Migrar dados do protótipo.
- [ ] Validar autorização interna.

## Risco

Esta fase não deverá ser iniciada apenas por conveniência técnica.

Antes de utilizar dados reais, será necessário definir:

- onde o sistema ficará;
- quem poderá acessar;
- quem administrará;
- quem realizará os backups;
- quais dados poderão ser armazenados;
- quais normas institucionais deverão ser respeitadas.

## Critério de conclusão

A fase estará concluída quando os dados puderem ser usados de forma autorizada, segura e recuperável.

## Versão prevista

```text
1.1.0
```

---

# 17. Fase 11 — Indicadores ISO

## Objetivo

Organizar e automatizar a atualização mensal das planilhas utilizadas nos indicadores.

## Levantamento necessário

- [ ] Receber prints das planilhas.
- [ ] Identificar as fontes.
- [ ] Identificar as colunas.
- [ ] Identificar fórmulas.
- [ ] Identificar indicadores.
- [ ] Identificar responsáveis.
- [ ] Identificar frequência.
- [ ] Identificar formato de entrega.

## Entregas previstas

- checklist mensal;
- importação das bases;
- validação de campos;
- consolidação;
- histórico por competência;
- indicadores;
- exportação.

## Critério de conclusão

A fase estará concluída quando a atualização mensal exigir menos trabalho manual e possuir uma conferência clara.

---

# 18. Fase 12 — Controle de pastas do servidor

## Objetivo

Comparar a estrutura das pastas com as planilhas de controle.

## Levantamento necessário

- [ ] Receber prints das pastas.
- [ ] Receber modelo da planilha.
- [ ] Identificar o padrão dos nomes.
- [ ] Identificar caminhos.
- [ ] Identificar regras de organização.
- [ ] Identificar documentos esperados.
- [ ] Identificar permissões.

## Entregas previstas

- cadastro de pastas;
- vínculo com projetos;
- identificação de pasta ausente;
- identificação de pasta vazia;
- divergência de nomenclatura;
- histórico de conferência;
- relatório de inconsistências.

## Risco

A leitura automática do servidor dependerá das permissões e do ambiente em que o Aziel estiver executando.

---

# 19. Fase 13 — Relatórios da Diretoria e MDM8

## Objetivo

Organizar solicitações recorrentes e reduzir o tempo de preparação dos relatórios.

## Levantamento necessário

Para cada relatório, registrar:

| Campo | Descrição |
|---|---|
| Nome | Nome utilizado internamente |
| Solicitante | Diretoria, MDM8 ou outra área |
| Frequência | Mensal, eventual ou recorrente |
| Fonte | Fluig, planilha, servidor ou outra |
| Filtros | Regras utilizadas |
| Formato | Excel, PDF, e-mail ou painel |
| Prazo | Tempo esperado de entrega |
| Responsável | Pessoa responsável pela preparação |

## Entregas previstas

- catálogo de relatórios;
- modelos;
- filtros salvos;
- histórico de solicitações;
- exportação;
- indicadores de entrega.

---

# 20. Fase 14 — Integrações futuras

## Possibilidades

- consulta a dataset do Fluig;
- consulta a API autorizada;
- atualização automática de projetos;
- leitura dos anexos recebidos por e-mail;
- criação de rascunhos no e-mail;
- processamento em lote;
- alertas de pendências;
- leitura autorizada do servidor.

## Restrições

Nenhuma integração deverá:

- armazenar senha diretamente no código;
- automatizar decisões críticas;
- utilizar acesso sem autorização;
- depender de cliques frágeis quando existir API ou dataset;
- enviar comunicação sem conferência humana.

---

# 21. Marcos do projeto

## Marco 1 — Fundação documental

Inclui:

- README;
- requisitos;
- regras de negócio;
- testes;
- cronograma;
- diário de desenvolvimento.

Status:

```text
Em andamento
```

---

## Marco 2 — Primeira interface

Inclui:

- menu;
- dashboard inicial;
- páginas;
- identidade visual;
- navegação.

Status:

```text
Não iniciado
```

---

## Marco 3 — Primeiro PDF lido

Inclui:

- seleção do arquivo;
- extração de texto;
- identificação da conta;
- identificação do período.

Status:

```text
Não iniciado
```

---

## Marco 4 — Primeira devolução identificada

Inclui:

- transferência recebida;
- valor;
- documento;
- linha complementar;
- CNPJ.

Status:

```text
Não iniciado
```

---

## Marco 5 — Fluxo completo de devolução

Inclui:

- confirmação;
- consulta no Fluig;
- projeto;
- e-mail;
- histórico.

Status:

```text
Não iniciado
```

---

## Marco 6 — Aziel 1.0

Inclui:

- rotina diária das duas contas;
- leitor validado;
- devoluções;
- pendências;
- histórico;
- geração do e-mail;
- dashboard funcional.

Status:

```text
Não iniciado
```

---

# 22. Registro de progresso

| Fase | Início | Conclusão | Situação | Observação |
|---|---|---|---|---|
| Fase 0 | 30/07/2026 | 30/07/2026 | Concluída | Documentação inicial |
| Fase 1 | ~30/07/2026 | anterior a 10/08/2026 | Concluída | Fundação visual (`index.html`, `styles.css`, navegação) |
| Fase 2 | ~30/07/2026 | anterior a 10/08/2026 | Concluída | Utilitários (CNPJ, moeda, datas) |
| Fase 3 | ~30/07/2026 | anterior a 10/08/2026 | Concluída | Importação de PDF (`pdf-reader.js`) |
| Fase 4 | ~30/07/2026 | 10/08/2026 | Concluída | Interpretação — corrigidos 3 bugs de reconhecimento na auditoria |
| Fase 5 | ~30/07/2026 | 10/08/2026 | Concluída | Movimentações — classificação corrigida na auditoria |
| Fase 6 | ~30/07/2026 | anterior a 10/08/2026 | Concluída | Confirmação e histórico |
| Fase 7 | ~30/07/2026 | anterior a 10/08/2026 | Concluída | Fluig |
| Fase 8 | ~30/07/2026 | anterior a 10/08/2026 | Concluída | E-mail |
| Fase 9 | ~30/07/2026 | — | Parcial | Dashboard — falta filtro por período |

---

# 23. Controle das versões previstas

| Versão | Entrega principal |
|---|---|
| 0.1.0 | Estrutura e documentação |
| 0.2.0 | Fundação visual |
| 0.3.0 | Utilitários |
| 0.4.0 | Seleção e leitura do PDF |
| 0.5.0 | Identificação do extrato |
| 0.6.0 | Identificação das movimentações |
| 0.7.0 | Confirmação e histórico |
| 0.8.0 | Consulta e projetos do Fluig |
| 0.9.0 | Geração do e-mail |
| 1.0.0 | Primeiro módulo operacional completo |

---

# 24. Alterações no cronograma

O cronograma poderá ser alterado quando:

- surgir uma nova regra de negócio;
- um arquivo real apresentar estrutura diferente;
- uma funcionalidade depender de autorização;
- um teste revelar um problema de arquitetura;
- uma prioridade operacional mudar;
- uma integração não estiver disponível.

Toda alteração importante deverá ser registrada neste documento e no diário de desenvolvimento.

---

# 25. Histórico do documento

| Versão | Data | Alteração |
|---|---|---|
| 1.0 | 30/07/2026 | Criação do cronograma inicial do Aziel |
| 1.1 | 10/08/2026 | Auditoria: status das Fases 0 a 9 corrigido para refletir o código real (estava registrado como "não iniciado" apesar de já implementado); versão do sistema corrigida de 0.1.0 para 0.2.0; ver Sessão 008 do diário de desenvolvimento |