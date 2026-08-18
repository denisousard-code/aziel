# Diário de Desenvolvimento do Aziel

## 1. Identificação

| Informação | Valor |
|---|---|
| Sistema | Aziel — Gestão Operacional e Automação |
| Documento | Diário de Desenvolvimento |
| Versão inicial do sistema | 0.1.0 |
| Data de início | 30/07/2026 |
| Módulo inicial | Controle de Devoluções |

---

## 2. Objetivo

Este documento será utilizado para registrar a evolução do desenvolvimento do Aziel.

O diário deverá permitir identificar:

- o que foi desenvolvido;
- quais arquivos foram alterados;
- quais conceitos foram estudados;
- quais decisões foram tomadas;
- quais erros foram encontrados;
- como os erros foram corrigidos;
- quais testes foram executados;
- em qual ponto o projeto parou;
- qual será a próxima atividade.

O objetivo é impedir que o desenvolvimento dependa apenas da memória.

---

## 3. Como utilizar este diário

Uma nova entrada deverá ser adicionada sempre que houver uma sessão relevante de desenvolvimento.

Cada sessão deverá registrar:

```text
Data:
Horário aproximado:
Versão do sistema:
Fase:
Objetivo da sessão:
Arquivos alterados:
Atividades realizadas:
Conceitos estudados:
Decisões tomadas:
Problemas encontrados:
Soluções aplicadas:
Testes realizados:
Resultado:
Pendências:
Próximo passo:
```

Não é necessário escrever textos longos em todas as sessões.

O mais importante é deixar claro:

1. onde o desenvolvimento parou;
2. o que ainda precisa ser feito;
3. quais decisões não devem ser esquecidas.

---

## 4. Situações possíveis da sessão

| Situação | Significado |
|---|---|
| Concluída | O objetivo da sessão foi alcançado |
| Parcial | Parte do objetivo foi concluída |
| Bloqueada | Um problema impediu o avanço |
| Em revisão | O resultado precisa ser analisado |
| Cancelada | A atividade deixou de ser necessária |

---

## 5. Padrão para registrar arquivos

Os arquivos deverão ser registrados utilizando o caminho relativo ao projeto.

Exemplo:

```text
docs/requisitos.md
assets/css/style.css
assets/js/app.js
pages/devolucoes.html
```

Evitar registrar apenas:

```text
app.js
```

O caminho completo facilita localizar o arquivo correto quando existirem vários arquivos com nomes parecidos.

---

## 6. Padrão para registrar decisões

Uma decisão deverá informar:

- o que foi decidido;
- por que foi decidido;
- qual impacto terá no sistema.

Exemplo:

```text
Decisão:
A consulta ao Fluig será manual na primeira versão.

Motivo:
Ainda não foi identificada uma API ou dataset autorizado para realizar
a consulta automaticamente.

Impacto:
O Aziel disponibilizará botões para copiar o CNPJ e abrir o Fluig,
mas o usuário registrará manualmente os projetos encontrados.
```

---

## 7. Padrão para registrar problemas

Um problema deverá ser registrado desta forma:

```text
Problema:
Descrição do comportamento incorreto.

Causa:
Motivo identificado, quando conhecido.

Solução:
Alteração realizada.

Resultado:
Funcionou, não funcionou ou precisa de revisão.
```

Exemplo:

```text
Problema:
O sistema considerou o extrato vazio porque encontrou a mensagem
"A CONTA NAO FOI MOVIMENTADA".

Causa:
A regra verificava apenas o rodapé do PDF.

Solução:
A seção de lançamentos deverá ser analisada antes da mensagem do rodapé.

Resultado:
Regra corrigida na documentação.
```

---

## 8. Padrão para registrar testes

Sempre que possível, utilizar o código definido em:

```text
tests/casos-de-teste.md
```

Exemplo:

```text
Teste executado:
CT-CNPJ-003 — Validar CNPJ correto

Entrada:
01280707000161

Resultado esperado:
CNPJ válido

Resultado obtido:
CNPJ válido

Situação:
Aprovado
```

---

# 9. Registro das sessões

## Sessão 001 — Início do projeto Aziel

### Informações

| Campo | Valor |
|---|---|
| Data | 30/07/2026 |
| Versão | 0.1.0 |
| Fase | Fase 0 — Levantamento e documentação |
| Situação | Concluída |

### Objetivo da sessão

Definir a finalidade do sistema e identificar os principais processos de trabalho que poderão ser organizados ou automatizados.

### Atividades realizadas

Foram identificadas as seguintes atividades profissionais:

- conferência diária de extratos bancários;
- identificação de devoluções de saldo de projetos;
- pesquisa de CNPJ e projetos no Fluig;
- comunicação das devoluções ao setor financeiro;
- atualização mensal das planilhas utilizadas pelo ISO;
- análise de projetos e prestações de contas;
- controle de pastas no servidor;
- preparação de relatórios solicitados pela Diretoria e pela MDM8.

### Decisões tomadas

#### Decisão 001 — Criar um sistema específico

Foi decidido criar um sistema separado do Life OS.

Motivo:

O Aziel será utilizado para processos profissionais e poderá lidar com informações institucionais. Misturar esses dados com o sistema pessoal aumentaria a desorganização e os riscos de segurança.

#### Decisão 002 — Desenvolver do zero

O sistema será desenvolvido de forma didática, organizada e comentada.

Cada etapa deverá incluir:

- planejamento;
- explicação;
- desenvolvimento;
- testes;
- documentação.

#### Decisão 003 — Primeiro módulo

O primeiro módulo será o controle de devoluções de saldo.

Motivo:

- é uma atividade diária;
- possui etapas repetitivas;
- pode gerar pendências;
- permite automação parcial;
- possui exemplos reais disponíveis para estudo.

### Resultado

O escopo inicial do sistema foi definido.

### Próximo passo registrado

Analisar exemplos reais dos extratos e do processo de consulta no Fluig.

---

## Sessão 002 — Mapeamento do processo de devoluções

### Informações

| Campo | Valor |
|---|---|
| Data | 30/07/2026 |
| Versão | 0.1.0 |
| Fase | Fase 0 — Levantamento e documentação |
| Situação | Concluída |

### Objetivo da sessão

Compreender o processo realizado após a identificação de uma entrada de valor no extrato.

### Fluxo identificado

```text
Receber o extrato
        ↓
Localizar uma entrada de valor
        ↓
Identificar o CNPJ
        ↓
Pesquisar o CNPJ no Fluig
        ↓
Verificar os projetos encontrados
        ↓
Selecionar o projeto correto
        ↓
Gerar e enviar o e-mail ao financeiro
```

### Situação alternativa identificada

Foi identificado que uma devolução pode aparecer no extrato antes de o projeto ser enviado para análise no Fluig.

Nesse caso:

```text
Devolução identificada
        ↓
CNPJ pesquisado
        ↓
Nenhum projeto encontrado
        ↓
Registro permanece pendente
        ↓
Nova consulta futura
```

### Decisões tomadas

#### Decisão 004 — Projeto não será obrigatório

Uma devolução poderá ser registrada sem possuir um projeto relacionado.

#### Decisão 005 — Seleção humana do projeto

O Aziel não deverá selecionar automaticamente o projeto apenas pelo:

- CNPJ;
- valor devolvido;
- valor do projeto.

O usuário deverá confirmar o projeto correto.

#### Decisão 006 — Vários projetos candidatos

Uma devolução poderá possuir vários projetos candidatos, mas inicialmente somente um poderá ser confirmado.

### Resultado

O fluxo principal e os fluxos alternativos foram documentados.

### Próximo passo registrado

Analisar a tela de consulta dos projetos no Fluig.

---

## Sessão 003 — Análise da consulta no Fluig

### Informações

| Campo | Valor |
|---|---|
| Data | 30/07/2026 |
| Versão | 0.1.0 |
| Fase | Fase 0 — Levantamento e documentação |
| Situação | Concluída |

### Objetivo da sessão

Identificar como os projetos são pesquisados no Fluig.

### Descobertas

A consulta permite pesquisar diretamente pelo CNPJ no campo geral de pesquisa.

A tabela pode retornar:

- nenhum projeto;
- um projeto;
- vários projetos.

Entre as informações apresentadas estão:

- PAA;
- instituição;
- edital;
- nome do projeto;
- valor;
- etapas do fluxo.

### Decisões tomadas

#### Decisão 007 — CNPJ copiado sem formatação

O Aziel deverá disponibilizar o CNPJ apenas com os 14 números para pesquisa no Fluig.

Exemplo:

```text
01280707000161
```

#### Decisão 008 — Consulta manual na primeira versão

O Aziel deverá:

- exibir o CNPJ;
- permitir copiar;
- abrir o portal Fluig;
- permitir registrar os resultados.

O sistema não deverá automatizar cliques no Fluig na primeira versão.

#### Decisão 009 — Integração futura

Uma futura integração deverá utilizar preferencialmente:

- dataset;
- API;
- exportação oficial.

Automação baseada em cliques na tela deverá ser evitada por ser frágil.

### Resultado

O funcionamento inicial da etapa de consulta no Fluig foi definido.

### Próximo passo registrado

Analisar PDFs reais dos extratos.

---

## Sessão 004 — Análise de extrato sem movimentação

### Informações

| Campo | Valor |
|---|---|
| Data | 30/07/2026 |
| Versão | 0.1.0 |
| Fase | Fase 0 — Levantamento e documentação |
| Situação | Concluída |

### Arquivo analisado

```text
45.140-1-29 e 30-07.pdf
```

### Objetivo da sessão

Verificar a estrutura de um extrato bancário em PDF sem movimentações relevantes.

### Descobertas

O PDF possui texto digital extraível.

Foram identificados:

- agência;
- conta;
- período;
- data de emissão;
- seção de lançamentos;
- saldos;
- investimentos;
- mensagem de conta não movimentada.

### Decisões tomadas

#### Decisão 010 — Não utilizar OCR inicialmente

Como o PDF contém texto selecionável, a primeira versão utilizará extração direta de texto.

#### Decisão 011 — Não armazenar saldos

O Aziel não deverá armazenar:

- saldo da conta;
- saldo anterior;
- fundos;
- valores de investimentos;
- resgates automáticos que não sejam necessários;
- juros;
- IOF.

#### Decisão 012 — Registrar conferência sem movimentação

Mesmo sem movimentações, o sistema deverá registrar que a conta foi conferida.

### Resultado esperado para o arquivo

```text
Conta: 45.140-1
Movimentações relevantes: 0
Possíveis devoluções: 0
Situação: Conta conferida
```

### Próximo passo registrado

Analisar um extrato contendo uma devolução.

---

## Sessão 005 — Análise de extrato com devolução

### Informações

| Campo | Valor |
|---|---|
| Data | 30/07/2026 |
| Versão | 0.1.0 |
| Fase | Fase 0 — Levantamento e documentação |
| Situação | Concluída |

### Arquivo analisado

```text
45.140-1-21 E 22-07.pdf
```

### Objetivo da sessão

Identificar como uma transferência recebida e seu CNPJ aparecem no PDF.

### Movimentação identificada

```text
Data: 21/07/2026
Hora: 16:32
Histórico: Transferência recebida
Documento: 612.946.000.059.202
Valor: R$ 16.335,74
Natureza: Crédito
Texto complementar: FEDERA 00001280707000161
CNPJ candidato: 01.280.707/0001-61
```

### Descobertas

A movimentação ocupa duas linhas:

```text
Linha principal:
data, histórico, documento, valor e natureza

Linha complementar:
hora, identificação resumida e CNPJ
```

### Decisões tomadas

#### Decisão 013 — Associar linhas complementares

O leitor deverá relacionar a linha complementar à movimentação anterior.

Ela não deverá ser cadastrada como uma movimentação separada.

#### Decisão 014 — Validar matematicamente o CNPJ

O número encontrado deverá:

1. ser limpo;
2. ser reduzido a possíveis sequências de 14 dígitos;
3. ter os dígitos verificadores validados;
4. ser apresentado para confirmação.

#### Decisão 015 — Nem todo crédito é devolução

O extrato também possui um resgate de investimento como crédito.

Portanto, o Aziel deverá considerar:

- descrição do histórico;
- origem aparente;
- presença de CNPJ;
- confirmação humana.

#### Decisão 016 — Rodapé não será fonte definitiva

O PDF possui movimentações e também apresenta a mensagem:

```text
A CONTA NAO FOI MOVIMENTADA
```

Essa mensagem não poderá ser utilizada sozinha para classificar o extrato como vazio.

A seção de lançamentos deverá ser analisada primeiro.

### Problema identificado

```text
Problema:
A mensagem de conta não movimentada pode aparecer mesmo quando existem
lançamentos em uma data anterior do período.

Risco:
O sistema poderia ignorar uma devolução real.

Solução definida:
Analisar os lançamentos antes de interpretar a mensagem do rodapé.
```

### Resultado

Os dois primeiros cenários reais de teste foram identificados:

```text
CT-REAL-001 — Extrato sem movimentação relevante
CT-REAL-002 — Transferência recebida com CNPJ
```

### Próximo passo registrado

Criar a estrutura inicial do projeto.

---

## Sessão 006 — Criação da estrutura do projeto

### Informações

| Campo | Valor |
|---|---|
| Data | 30/07/2026 |
| Versão | 0.1.0 |
| Fase | Fase 0 — Levantamento e documentação |
| Situação | Concluída |

### Objetivo da sessão

Criar a estrutura inicial de arquivos e pastas do Aziel.

### Estrutura criada

```text
aziel/
├── assets/
│   ├── css/
│   │   └── style.css
│   ├── images/
│   └── js/
│       └── app.js
├── docs/
│   ├── requisitos.md
│   ├── regras-de-negocio.md
│   ├── cronograma.md
│   └── diario-de-desenvolvimento.md
├── pages/
│   ├── devolucoes.html
│   ├── demandas.html
│   ├── rotinas.html
│   ├── indicadores.html
│   ├── servidor.html
│   └── relatorios.html
├── samples/
│   └── extratos-anonimizados/
├── tests/
│   └── casos-de-teste.md
├── index.html
└── README.md
```

### Problemas encontrados

#### Problema 001 — Pastas compactadas no VS Code

O VS Code apresentava pastas com somente uma subpasta na mesma linha.

Exemplo:

```text
assets/css
```

Causa:

A configuração `Explorer: Compact Folders` estava ativada.

Solução:

Desativar:

```json
"explorer.compactFolders": false
```

#### Problema 002 — Pasta criada como arquivo

`extratos-anonimizados` foi criado inicialmente como arquivo.

Solução:

Excluir o arquivo e criar uma nova pasta dentro de `samples`.

#### Problema 003 — Nome incorreto da pasta assets

A pasta foi criada inicialmente como:

```text
assents
```

Solução:

Renomeada para:

```text
assets
```

### Conceitos estudados

- estrutura de um projeto web;
- diferença entre arquivo e pasta;
- organização por responsabilidade;
- caminhos de arquivos;
- configuração do explorador do VS Code.

### Resultado

A estrutura inicial do Aziel foi criada corretamente.

### Próximo passo registrado

Criar a documentação inicial do projeto.

---

## Sessão 007 — Documentação inicial

### Informações

| Campo | Valor |
|---|---|
| Data | 30/07/2026 |
| Versão | 0.1.0 |
| Fase | Fase 0 — Levantamento e documentação |
| Situação | Em andamento |

### Arquivos criados ou preenchidos

```text
README.md
docs/requisitos.md
docs/regras-de-negocio.md
docs/cronograma.md
docs/diario-de-desenvolvimento.md
tests/casos-de-teste.md
```

### Atividades realizadas

- descrição do objetivo do Aziel;
- definição dos módulos;
- registro dos requisitos funcionais;
- registro dos requisitos não funcionais;
- criação das regras de negócio;
- definição dos casos de teste;
- planejamento das fases;
- criação do diário de desenvolvimento.

### Conceitos estudados

- README;
- requisito funcional;
- requisito não funcional;
- regra de negócio;
- caso de teste;
- cronograma técnico;
- versionamento semântico;
- documentação de decisões.

### Resultado

A maior parte da fundação documental foi concluída.

### Pendências da Fase 0

- organizar os extratos anonimizados de teste;
- analisar um exemplo da conta 45.141-X;
- analisar um exemplo de PIX recebido;
- decidir como os arquivos sensíveis serão protegidos;
- criar o arquivo `.gitignore`;
- atualizar o status da Fase 0 no cronograma.

### Próximo passo

Criar o arquivo `.gitignore` para impedir que extratos, arquivos locais e informações sensíveis sejam enviados por engano para um repositório.

---

## Sessão 008 — Auditoria do código real e correção de bugs no parser

### Informações

| Campo | Valor |
|---|---|
| Data | 10/08/2026 |
| Versão | 0.2.0 |
| Fase | Auditoria (Fases 1 a 9 já implementadas, mas nunca registradas neste diário) |
| Situação | Concluída |

### Observação importante

Entre a Sessão 007 (30/07/2026) e esta sessão, o módulo de Devoluções foi
quase inteiramente construído (Fases 1 a 9 do cronograma) em sessões de
desenvolvimento que não foram registradas neste diário. O resultado é que
o cronograma e este diário ficaram meses "atrasados" em relação ao código
real — o que quase causou retrabalho. **A partir de agora, toda sessão de
desenvolvimento deve ser registrada aqui, mesmo as feitas com outra
ferramenta de IA**, justamente para evitar esse tipo de divergência.

### Objetivo da sessão

Auditar o código real do Aziel comparando com a documentação, e validar
o módulo de Devoluções com extratos bancários reais fornecidos pelo
usuário (não os exemplos fictícios já documentados nas Sessões 004 e 005).

### Arquivos alterados

```text
docs/cronograma.md
docs/diario-de-desenvolvimento.md
assets/js/statement-parser.js
assets/js/pdf-reader.js
```

### Atividades realizadas

- leitura completa de `app.js`, `statement-parser.js`, `pdf-reader.js`,
  `fluig-service.js`, `finance-communication-service.js`,
  `storage-service.js` e `storage-controller.js`;
- comparação do status real de cada arquivo com o `cronograma.md`;
- teste do `statement-parser.js` fora do navegador (Node.js), usando o
  texto de dois extratos bancários reais da conta 45.140-1;
- teste 1: extrato de 06-07/08/2026, sem devolução registrada
  historicamente, mas contendo dois créditos reais de "Recebimento
  Fornecedor" que deveriam ter sido sinalizados para revisão;
- teste 2: extrato de 21-22/07/2026 (mesmo arquivo já citado na
  Sessão 005), contendo uma devolução real confirmada.

### Problemas encontrados

#### Problema 004 — Documentação desatualizada em relação ao código

Descrição:
O `cronograma.md` registrava as Fases 1 a 9 como "não iniciadas", mas o
código já as implementava quase por completo (menos filtro por período
no dashboard).

Causa:
Sessões de desenvolvimento feitas em outra ferramenta de IA não foram
registradas neste diário.

Solução:
Cronograma e diário atualizados nesta sessão para refletir o estado real.

Resultado:
Corrigido.

---

#### Problema 005 — `"Recebimento Fornecedor"` não era reconhecido como possível devolução

Descrição:
O extrato real da conta 45.140-1 usa o histórico `"Recebimento
Fornecedor"` (código BB 612) para créditos externos — incluindo
devoluções de saldo de projeto. A lista `HISTORICOS_RECEBIMENTO_EXTERNO`
só continha `"transferência recebida"`, `"pix recebido"`, `"depósito
recebido"` e `"crédito recebido"`, todos ausentes do extrato real.

Causa:
A lista foi criada a partir de um único extrato de exemplo (Sessão 005),
que usava o histórico `"Transferência recebida"` — um formato diferente
do usado na prática pelo Banco do Brasil para essa conta.

Impacto real:
Os créditos caíam em `movimentacao_desconhecida`, que **não aparece na
tabela de Pendências nem é contado nos indicadores do dashboard** — só
fica visível na tabela bruta de movimentações da página, como "Necessita
revisão". Ou seja, uma devolução real poderia passar despercebida na
conferência diária.

Solução:
`"recebimento fornecedor"` adicionado à lista `HISTORICOS_RECEBIMENTO_EXTERNO`
em `statement-parser.js`.

Resultado:
Corrigido e validado com o extrato real (Teste 1).

---

#### Problema 006 — CNPJ da linha complementar não era reconhecido em um dos dois formatos reais

Descrição:
`interpretarLinhaComplementar` só reconhecia linhas complementares no
formato `DD/MM HH:MM descrição` (com data e hora). O extrato real da
conta 45.140-1 também produz um segundo formato, sem data/hora, em que
a linha complementar começa diretamente com o CNPJ formatado:
`62.388.566/0001-90 FEDERACAO NACIONAL`.

Causa:
A função foi construída a partir de um único exemplo (Sessão 005), sem
considerar variações reais do extrato.

Solução:
`interpretarLinhaComplementar` dividida em dois casos:
`interpretarComplementoComHora` (formato original) e
`interpretarComplementoSemHora` (novo formato — só aceita a linha como
complemento se houver um CNPJ candidato nela, para não confundir com
outras linhas soltas do extrato, como rodapés e observações).

Resultado:
Corrigido e validado com o extrato real (Teste 1).

---

#### Problema 007 — CNPJ pontuado não era reconhecido pela extração de candidatos

Descrição:
`extrairCnpjsCandidatos` só procurava sequências de 14 a 20 dígitos
"grudados" (`/\d{14,20}/g`). O CNPJ do extrato real vem pontuado
(`62.388.566/0001-90`), então nunca era encontrado.

Causa:
A extração foi construída a partir do exemplo original, em que o CNPJ
aparece sem pontuação, concatenado a outros números
(`00001280707000161`).

Solução:
Adicionada uma busca adicional por CNPJ já pontuado
(`/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g`), normalizado e validado antes de
ser somado aos candidatos encontrados pela busca original. A função
`removerSequenciasNumericasLongas` também foi ajustada para remover o
CNPJ pontuado do texto de origem, evitando que o CNPJ aparecesse
duplicado dentro do campo "Origem".

Resultado:
Corrigido e validado com o extrato real (Teste 1).

---

#### Problema 008 — Sanitização de dados sensíveis anulada por código duplicado

Descrição:
Em `pdf-reader.js`, o texto de cada página do PDF era processado pela
função `removerDadosSensiveis`, mas o resultado sanitizado era
descartado por um segundo `paginas.push(...)` logo em seguida, que
inseria o texto **sem sanitização** no lugar. A função
`removerDadosSensiveis` também estava definida no meio do corpo da
função `lerPdfComoTexto`, fora de qualquer padrão do restante do
arquivo.

Causa:
Aparenta ser um resto de uma edição anterior (provavelmente de outra
sessão com IA) que adicionou a etapa de sanitização sem remover o código
antigo que ela deveria substituir.

Impacto real:
O texto completo do extrato — incluindo o nome de quem realizou a
consulta bancária e o endereço do portal — continuava sendo processado
e mantido em memória durante a sessão, contrariando os requisitos
RNF-003 e RNF-004 (minimização de dados sensíveis).

Solução:
Removido o `push` duplicado; `removerDadosSensiveis` movida para junto
das demais funções auxiliares do arquivo, fora do corpo de
`lerPdfComoTexto`.

Resultado:
Corrigido. Validado isoladamente (a função não pôde ser testada dentro
do fluxo completo em Node.js porque `pdf-reader.js` depende da
biblioteca `pdfjs-dist`, carregada via CDN, que só funciona no
navegador).

### Testes realizados

```text
Teste 1 — Extrato 06-07/08/2026 (sem devolução histórica, com dois
créditos reais de "Recebimento Fornecedor")
Resultado esperado: os dois créditos classificados como devolução
possível, com CNPJ da FEDERACAO NACIONAL extraído e validado.
Resultado obtido: alta_possibilidade_devolucao para os dois, CNPJ
62.388.566/0001-90 válido, origem "FEDERACAO NACIONAL".
Situação: Aprovado (após as correções).

Teste 2 — Extrato 21-22/07/2026 (mesmo exemplo da Sessão 005, com uma
devolução real confirmada)
Resultado esperado: a "Transferência recebida" de R$ 16.335,74
classificada como alta possibilidade de devolução, CNPJ
01.280.707/0001-61 válido; nenhuma das demais movimentações
(Resgate BB CDB DI, tarifa) classificada incorretamente como devolução.
Resultado obtido: exatamente como esperado — confirma que as correções
não quebraram o caso original já documentado.
Situação: Aprovado.
```

### Resultado da sessão

Concluída. Documentação atualizada para refletir o estado real do
projeto; 5 bugs encontrados e corrigidos no `statement-parser.js` e no
`pdf-reader.js`; correções validadas com dois extratos bancários reais,
sem regressão no caso de teste original da Sessão 005.

### Pendências

- decidir, junto à Controladoria, se o armazenamento atual em IndexedDB
  (Fase 10) já pode ser usado com dados reais ou se ainda depende da
  definição de ambiente autorizado (RNF-015);
- construir as páginas ainda vazias do menu: `demandas.html`,
  `rotinas.html`, `indicadores.html`, `servidor.html`, `relatorios.html`;
- adicionar filtro por período ao dashboard (Fase 9);
- validar se existem outros formatos de histórico/linha complementar
  além dos dois já mapeados, usando mais extratos reais ao longo dos
  próximos dias.

### Próximo passo

Testar o fluxo completo dentro do navegador (upload do PDF real →
confirmação → consulta ao Fluig → geração do e-mail) para validar as
etapas que não puderam ser testadas fora do navegador nesta sessão.

---

## Sessão 009 — Módulo de Entidades e bug crítico de carregamento no navegador

### Informações

| Campo | Valor |
|---|---|
| Data | 10/08/2026 |
| Versão | 0.3.0 |
| Fase | Novo módulo (Entidades) + correção de bug crítico |
| Situação | Concluída |

### Objetivo da sessão

Criar uma base de consulta de entidades (APAEs e Federações) que permita
identificar automaticamente, pelo CNPJ ou pelos dados bancários, qual
entidade corresponde a uma movimentação do extrato — e importar os dados
reais fornecidos pelo usuário a partir de um relatório do Fluig.

### Arquivos alterados

```text
assets/js/entity-service.js (novo)
assets/js/entidades-ui.js (novo)
assets/js/storage-service.js
assets/js/app.js
pages/entidades.html (novo)
index.html
pages/devolucoes.html
assets/css/styles.css
samples/entidades-apaes-federacoes.csv (novo)
README.md
```

### Atividades realizadas

- criado `entity-service.js`: cadastro, busca por CNPJ, busca por dados
  bancários (banco/agência/conta) e importação em massa via CSV, com
  reconhecimento tolerante de cabeçalhos de coluna;
- criado o store `entidades` no IndexedDB (versão 2 do banco);
- criada a página `entidades.html` e o script `entidades-ui.js`, com
  importação (arquivo ou texto colado), cadastro manual, listagem com
  filtros e remoção;
- conectado ao módulo de Devoluções: ao revisar uma movimentação com
  CNPJ válido, o Aziel agora consulta a base de entidades e sugere o
  nome no campo "Origem" automaticamente;
- extraído e processado o relatório real do Fluig fornecido pelo
  usuário (`Relatório de Todas as Entidades (5).xls`, na verdade um
  HTML malformado, sem tags `<tr>` entre as linhas): 1.405 pagamentos
  entre nov/2023 e ago/2026, agrupados em 301 entidades únicas (279
  APAEs, 21 Federações, 1 outra), todas com CNPJ validado
  matematicamente e conta bancária mais recente identificada;
- gerado `samples/entidades-apaes-federacoes.csv` a partir desses dados
  e testada a importação de ponta a ponta (301 importadas, 0 erro).

### Problemas encontrados

#### Problema 009 — Arquivo selecionado no import não carregava, sem aviso

Descrição:
Ao selecionar um arquivo que não era CSV (o relatório bruto do Fluig,
em HTML), a caixa de texto ficava vazia e nada acontecia ao clicar em
"Importar entidades" — sem nenhuma mensagem explicando o porquê.

Causa:
O código não validava se o conteúdo parecia realmente ser um CSV antes
de tentar importar.

Solução:
Adicionada uma verificação (`pareceHtmlOuNaoCsv`) que detecta conteúdo
HTML e avisa imediatamente com uma notificação clara, tanto ao
selecionar o arquivo quanto ao clicar em importar.

Resultado:
Corrigido.

---

#### Problema 010 — `app.js` não carregava no navegador (CRÍTICO)

Descrição:
Ao abrir a página de Devoluções pelo navegador de verdade (via Live
Server, portanto sem o problema de `file://`), nenhuma funcionalidade
respondia — nem a seleção de arquivo PDF gerava reação visual alguma.
O console do navegador mostrava:

```text
Uncaught SyntaxError: Identifier 'dataPertenceAoMesAtual' has already
been declared (at app.js:7159)
```

Causa:
O arquivo `app.js` tinha a função `dataPertenceAoMesAtual` declarada
duas vezes no nível superior do arquivo — uma vez perto do início
(controlador de persistência) e outra perto do fim (controlador da
interface). Isso é permitido em um script comum (a segunda declaração
simplesmente substitui a primeira, sem erro), mas é proibido quando o
arquivo é carregado como módulo ES (`type="module"`, que é como o
Aziel carrega todos os seus arquivos JavaScript) — nesse caso, o
navegador recusa carregar o arquivo inteiro.

Isso explica por que o problema só apareceu neste teste: as sessões
anteriores validaram os arquivos individualmente fora do navegador
(Node.js), chamando funções específicas diretamente — nunca havia sido
testado se o `app.js` completo conseguia ser carregado como módulo real
pelo navegador. A checagem de sintaxe usada até aqui (`node -c`) não
detecta esse tipo de erro, porque não aplica as regras de módulo ES.

Solução:
Removida a segunda declaração duplicada de `dataPertenceAoMesAtual`
(mantida a primeira, perto do início do arquivo). Também foi criado um
processo de verificação mais rigoroso: cada arquivo `.js` do projeto
agora é testado como módulo ES de verdade (usando `import()` dinâmico
do Node.js com um DOM simulado), não apenas com checagem de sintaxe
simples — isso teria detectado o problema antes de chegar ao usuário.

Resultado:
Corrigido e validado: todos os arquivos `.js` do projeto agora carregam
sem erro como módulo ES.

### Lição aprendida

Checagem de sintaxe (`node -c`) não é suficiente para arquivos que
serão carregados como módulo ES no navegador — duplicidade de
declarações no nível superior só é detectada nesse modo. A partir de
agora, qualquer alteração em arquivo `.js` do Aziel deve ser validada
também dessa forma antes de ser entregue.

### Testes realizados

```text
Teste — Importação real do CSV gerado a partir do Fluig
Resultado esperado: 301 entidades importadas, 0 erro.
Resultado obtido: 301 importadas, 0 atualizadas, 0 com erro (111ms).
Situação: Aprovado.

Teste — Busca pelo CNPJ da devolução real (extrato da Sessão 008,
teste 2)
Resultado esperado: encontrar a entidade correspondente.
Resultado obtido: encontrada "Feapaes do Pará" (CNPJ
01.280.707/0001-61), confirmando que a mesma entidade da devolução
real testada anteriormente está na base importada.
Situação: Aprovado.

Teste — Carregamento de todos os arquivos .js como módulo ES
Resultado esperado: nenhum erro de sintaxe/declaração.
Resultado obtido: falha em app.js (Problema 010); corrigido e
revalidado com sucesso.
Situação: Aprovado (após correção).
```

### Resultado da sessão

Concluída. Módulo de Entidades criado, testado e conectado ao fluxo de
Devoluções; base real de 301 entidades do Fluig importada e validada;
bug crítico de carregamento do `app.js` no navegador identificado e
corrigido, com um novo processo de verificação para evitar recorrência.

### Pendências

- ainda falta um export real do Fluig no formato "CNPJ + nome" simples
  (o relatório usado nesta sessão é de pagamentos, o que funcionou bem,
  mas pode não cobrir entidades que nunca receberam um PAA);
- avaliar se o mesmo relatório de pagamentos pode alimentar a
  automação futura dos ofícios de liberação (tem PAA, entidade e
  valor);
- testar o fluxo completo de devolução dentro do navegador até o fim
  (Fluig e e-mail), agora que o `app.js` carrega corretamente.

### Próximo passo

Concluir o teste do fluxo de devolução no navegador (confirmação →
Fluig → e-mail) com o `app.js` corrigido.

---

# 10. Modelo para novas sessões

Copiar o modelo abaixo sempre que uma nova sessão for iniciada.

```markdown
## Sessão XXX — Nome da sessão

### Informações

| Campo | Valor |
|---|---|
| Data | DD/MM/AAAA |
| Versão | 0.0.0 |
| Fase | Nome da fase |
| Situação | Em andamento |

### Objetivo da sessão

Descrever o que deverá ser alcançado.

### Arquivos alterados

```text
caminho/do/arquivo
```

### Atividades realizadas

- atividade;
- atividade;
- atividade.

### Conceitos estudados

- conceito;
- conceito;
- conceito.

### Decisões tomadas

#### Decisão XXX — Nome da decisão

Descrição da decisão.

Motivo:

Descrição do motivo.

Impacto:

Descrição do impacto.

### Problemas encontrados

#### Problema XXX — Nome do problema

Problema:

Descrição.

Causa:

Descrição.

Solução:

Descrição.

Resultado:

Descrição.

### Testes realizados

```text
Identificador:
Resultado esperado:
Resultado obtido:
Situação:
```

### Resultado da sessão

Descrição do resultado geral.

### Pendências

- pendência;
- pendência.

### Próximo passo

Descrever exatamente onde continuar.
```

---

## Sessão 010 — Persistência real, comprovante, histórico completo e auditoria final

### Informações

| Campo | Valor |
|---|---|
| Data | 10/08/2026 |
| Versão | 0.4.0 |
| Fase | Persistência real + módulo de consulta ao histórico |
| Situação | Concluída |

### Objetivo da sessão

Conectar a persistência real (o banco já existia, mas não era usado pela
interface — Problema 011), adicionar anexo de comprovante, uma tela de
consulta ao histórico completo com busca, e fechar com uma auditoria
final antes do projeto seguir para ajustes de design em outra
ferramenta.

### Problemas encontrados

#### Problema 011 — Devoluções não eram salvas de verdade (CRÍTICO)

Descrição:
A função `persistirMovimentacao` existia e funcionava, mas nunca era
chamada pela interface. Atualizar a página (F5) apagava todo o
histórico.

Causa:
O controlador de persistência (`storage-service.js` + a camada de
conversão no início do `app.js`) foi construído, mas a integração com a
interface (`confirmarDevolucao`, `salvarConsultaFluig`,
`confirmarEnvioFinanceiro`) nunca foi finalizada.

Solução:
As três funções passaram a chamar `persistirMovimentacao` em cada
etapa. `iniciarAziel()` agora inicializa o banco e carrega o histórico
persistido ao abrir a página.

Resultado:
Corrigido e validado (ver Testes realizados).

---

#### Problema 012 — `storage-controller.js` órfão

Descrição:
O arquivo `storage-controller.js` nunca é importado por nenhuma página
ou script — é uma cópia não utilizada da mesma lógica que já está
embutida no início do `app.js`.

Causa:
Provavelmente sobrou de uma refatoração anterior que moveu esse código
para dentro do `app.js` sem remover o arquivo original.

Solução:
Arquivo removido do projeto.

Resultado:
Corrigido.

---

#### Problema 013 — Dois elementos de interface nunca conectados (não corrigido nesta sessão)

Descrição:
Encontrados na auditoria final, mas **deixados como estão** a pedido do
usuário, que vai levar o projeto para ajustes de design em outra
ferramenta antes de voltar para conectar a lógica:

- `botaoCadastroManual` ("Cadastro manual", perto da importação de PDF);
- `pesquisaDevolucoes` (campo de busca na tabela de Pendências).

Resultado:
Registrado como pendência (ver seção 11).

### Testes realizados

```text
Teste — Fluxo completo automatizado (13 verificações)
1-4. Confirmar devolução → consulta Fluig → conclusão → anexar
     comprovante: todas as etapas persistidas sem erro.
5. Simulação de F5 completo (reimportação do zero): registro
   sobreviveu, status "concluida", entidade identificada preservada,
   comprovante preservado como Blob, mensagem financeiro preservada.
6. Dashboard renderiza o histórico corretamente após o F5.
7. Histórico completo + busca (por PAA e busca sem resultado).
Resultado: 13/13 verificações aprovadas.

Teste — Todos os arquivos .js como módulo ES real
Resultado: todos OK (pdf-reader.js só não roda fora do navegador por
depender de um CDN, o que é esperado).
```

### Resultado da sessão

Concluída. Persistência real conectada e testada de ponta a ponta;
módulo de comprovante e histórico completo com busca adicionados;
arquivo órfão removido; dois elementos de interface sem função
documentados como pendência.

### Próximo passo

Projeto vai para ajustes de design/layout em outra ferramenta de IA.
Quando voltar, fazer uma nova auditoria comparando a estrutura de
`id`s, `class`es e atributos `data-*` do HTML com o que o `app.js`
espera, já que mudanças de design podem quebrar essas referências.

---

# 11. Controle resumido do projeto

| Item | Situação |
|---|---|
| Nome definido | Concluído |
| Estrutura criada | Concluído |
| README | Concluído |
| Requisitos | Concluído |
| Regras de negócio | Concluído |
| Casos de teste | Concluído |
| Cronograma | Concluído |
| Diário de desenvolvimento | Concluído |
| Proteção de arquivos sensíveis | Concluído (corrigido em 10/08/2026 — ver Sessão 008) |
| Fundação visual | Concluído |
| Leitor de PDF | Concluído |
| Módulo de devoluções | Concluído — validado com extratos reais em 10/08/2026 |
| Persistência real (IndexedDB conectado à interface) | Concluído em 10/08/2026 — ver Sessão 010 |
| Comprovante da devolução | Concluído em 10/08/2026 |
| Histórico completo com busca | Concluído em 10/08/2026 |
| Dashboard com filtro por período | Pendente |
| Módulos Demandas / Rotinas / Indicadores / Servidor / Relatórios | Pendente (páginas ainda vazias) |
| Decisão sobre persistência de dados reais (RNF-015) | Pendente |
| Botão "Cadastro manual" (perto da importação de PDF) | Pendente — visível na tela, sem função |
| Campo "Pesquisar devoluções" (tabela de Pendências) | Pendente — visível na tela, sem função |

---

# 12. Histórico do documento

| Versão | Data | Alteração |
|---|---|---|
| 1.0 | 30/07/2026 | Criação do diário e registro das sessões iniciais |
| 1.1 | 10/08/2026 | Adicionada Sessão 008 (auditoria e correção de bugs); controle resumido do projeto atualizado |