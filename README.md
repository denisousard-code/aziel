# Aziel — Gestão Operacional e Automação

O Aziel é um sistema criado para organizar, registrar e automatizar processos operacionais relacionados ao trabalho da Controladoria.

O projeto será desenvolvido do zero, com foco em aprendizado, organização do código, documentação e evolução gradual das funcionalidades.

---

## Objetivo

Centralizar atividades que atualmente são realizadas por meio de extratos bancários, planilhas, documentos, pastas do servidor, e-mails e consultas ao Fluig.

O sistema deverá ajudar a reduzir tarefas repetitivas, evitar esquecimentos, manter históricos e facilitar a geração de informações para outros setores.

---

## Módulos planejados

### Dashboard

Exibirá um resumo das atividades e pendências do sistema.

### Devoluções

Permitirá:

- importar extratos bancários em PDF;
- identificar possíveis devoluções;
- extrair CNPJ, data e valor;
- consultar e registrar projetos do Fluig;
- acompanhar casos sem projeto localizado;
- gerar o texto do e-mail para o financeiro;
- manter histórico das devoluções.

### Demandas

Permitirá controlar:

- tarefas;
- prioridades;
- prazos;
- responsáveis;
- dependências;
- status;
- próxima ação.

### Rotinas

Organizará atividades:

- diárias;
- semanais;
- mensais;
- eventuais.

### Indicadores

Centralizará o controle das planilhas e informações utilizadas pelo ISO.

### Servidor

Organizará o controle das pastas e documentos armazenados no servidor.

### Relatórios

Manterá modelos, históricos e dados utilizados em relatórios solicitados pela Diretoria e pela MDM8.

### Entidades

Base de consulta de APAEs e Federações (nome, CNPJ, tipo, UF, situação e contas bancárias conhecidas). Permite cadastro manual ou importação em massa via CSV, e é usada pelo módulo de Devoluções para sugerir automaticamente qual entidade corresponde a um CNPJ identificado num extrato.

---

## Tecnologias iniciais

O projeto começará com:

- HTML;
- CSS;
- JavaScript;
- armazenamento local para testes;
- biblioteca para leitura de arquivos PDF.

Posteriormente, poderão ser adicionados:

- banco de dados;
- autenticação;
- servidor;
- integração com o Fluig;
- automação de e-mails;
- importação automática de documentos.

---

## Estrutura do projeto

```text
aziel/
├── assets/
│   ├── css/
│   ├── images/
│   └── js/
├── docs/
├── pages/
├── samples/
├── tests/
├── index.html
└── README.md