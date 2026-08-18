# Casos de Teste do Sistema Aziel

## 1. Identificação do documento

| Informação | Valor |
|---|---|
| Sistema | Aziel — Gestão Operacional e Automação |
| Documento | Casos de Teste |
| Versão do documento | 1.0 |
| Versão do sistema | 0.1.0 |
| Data inicial | 30/07/2026 |
| Módulo | Controle de Devoluções |

---

## 2. Objetivo

Este documento descreve os testes que deverão ser realizados para verificar se o módulo de devoluções do Aziel funciona conforme os requisitos e as regras de negócio.

Cada teste deverá possuir:

- identificador;
- objetivo;
- dados utilizados;
- condições iniciais;
- passos;
- resultado esperado;
- resultado obtido;
- situação.

---

## 3. Situações possíveis

Cada caso de teste poderá possuir uma das seguintes situações:

| Situação | Significado |
|---|---|
| Não executado | O teste ainda não foi realizado |
| Aprovado | O resultado obtido corresponde ao esperado |
| Reprovado | O resultado obtido está incorreto |
| Bloqueado | O teste não pôde ser concluído |
| Em revisão | O resultado precisa ser analisado |

---

## 4. Modelo de caso de teste

```text
Identificador:
Nome:
Objetivo:
Pré-condições:
Dados de entrada:
Passos:
Resultado esperado:
Resultado obtido:
Situação:
Observações:
```

---

# 5. Testes de importação do PDF

## CT-PDF-001 — Selecionar um arquivo PDF válido

### Objetivo

Verificar se o sistema permite selecionar um arquivo PDF digital.

### Pré-condições

- página de importação aberta;
- arquivo PDF disponível no computador.

### Passos

1. Clicar em `Selecionar PDF`.
2. Escolher um arquivo com extensão `.pdf`.
3. Confirmar a seleção.

### Resultado esperado

- o arquivo deverá ser aceito;
- o nome do arquivo deverá aparecer na tela;
- o botão de processamento deverá ser habilitado.

### Situação

Não executado.

---

## CT-PDF-002 — Tentar importar um arquivo que não seja PDF

### Objetivo

Verificar se o sistema bloqueia formatos não suportados.

### Dados de entrada

Exemplo:

```text
planilha.xlsx
```

### Passos

1. Clicar em `Selecionar PDF`.
2. Escolher um arquivo que não seja PDF.

### Resultado esperado

O sistema deverá informar:

```text
Formato não suportado. Selecione um arquivo PDF.
```

O arquivo não deverá ser processado.

### Situação

Não executado.

---

## CT-PDF-003 — PDF sem texto extraível

### Objetivo

Verificar o tratamento de PDF escaneado ou formado apenas por imagem.

### Passos

1. Selecionar um PDF sem texto digital.
2. Iniciar o processamento.

### Resultado esperado

O sistema deverá informar:

```text
Não foi possível extrair o texto deste PDF.
Realize a conferência manual ou utilize outro arquivo.
```

O sistema não deverá considerar o arquivo como extrato sem movimentação.

### Situação

Não executado.

---

# 6. Testes de identificação do extrato

## CT-EXT-001 — Identificar a conta 45.140-1

### Objetivo

Verificar se o sistema identifica corretamente a conta bancária.

### Dados de entrada

PDF contendo:

```text
Conta corrente 45140-1
```

### Resultado esperado

O sistema deverá apresentar:

```text
Conta identificada: 45.140-1
```

### Situação

Não executado.

---

## CT-EXT-002 — Identificar a conta 45.141-X

### Objetivo

Verificar se o sistema identifica corretamente a segunda conta monitorada.

### Dados de entrada

PDF da conta 45.141-X.

### Resultado esperado

O sistema deverá apresentar:

```text
Conta identificada: 45.141-X
```

### Situação

Aguardando arquivo de exemplo.

---

## CT-EXT-003 — Conta não cadastrada

### Objetivo

Verificar o comportamento quando o PDF pertence a outra conta.

### Dados de entrada

Extrato com uma conta diferente das contas monitoradas.

### Resultado esperado

O sistema deverá:

- informar o número encontrado;
- alertar que a conta não está cadastrada;
- solicitar confirmação;
- não registrar automaticamente como uma conta oficial.

### Situação

Não executado.

---

## CT-EXT-004 — Identificar o período do extrato

### Objetivo

Verificar se as datas inicial e final são extraídas corretamente.

### Dados de entrada

```text
Período do extrato de 21/07/2026 até 22/07/2026
```

### Resultado esperado

```text
Data inicial: 21/07/2026
Data final: 22/07/2026
```

Internamente:

```text
2026-07-21
2026-07-22
```

### Situação

Não executado.

---

## CT-EXT-005 — Período inválido

### Objetivo

Verificar o tratamento de datas inconsistentes.

### Dados de entrada

```text
Data inicial: 30/07/2026
Data final: 29/07/2026
```

### Resultado esperado

O processamento deverá receber o status:

```text
Necessita revisão
```

### Situação

Não executado.

---

# 7. Testes com os extratos reais analisados

## CT-REAL-001 — Extrato sem movimentação relevante

### Arquivo de referência

```text
45.140-1-29 e 30-07.pdf
```

### Objetivo

Verificar se o sistema reconhece corretamente um extrato sem lançamentos operacionais.

O arquivo informa a conta `45140-1`, o período de `29/07/2026` a `30/07/2026` e apresenta apenas saldos, investimentos, juros e IOF, sem movimentações bancárias relevantes. :contentReference[oaicite:0]{index=0}

### Pré-condições

- leitor de PDF funcionando;
- conta 45.140-1 cadastrada.

### Passos

1. Importar o arquivo.
2. Processar o PDF.
3. Analisar a seção de lançamentos.
4. Verificar o resultado apresentado.

### Resultado esperado

O sistema deverá identificar:

```text
Conta: 45.140-1
Período: 29/07/2026 a 30/07/2026
Movimentações relevantes: 0
Possíveis devoluções: 0
```

Também deverá apresentar:

```text
Conta conferida.
Nenhuma movimentação relevante encontrada.
```

O sistema não deverá:

- criar uma devolução;
- interpretar saldo como movimentação;
- interpretar investimento como devolução;
- armazenar os saldos da conta.

### Situação

Não executado.

---

## CT-REAL-002 — Transferência recebida com CNPJ

### Arquivo de referência

```text
45.140-1-21 E 22-07.pdf
```

### Objetivo

Verificar se o sistema identifica uma transferência recebida e associa corretamente a linha complementar.

O arquivo possui uma transferência recebida em `21/07/2026`, no valor de `R$ 16.335,74`, documento `612.946.000.059.202` e linha complementar contendo o CNPJ `01.280.707/0001-61`. :contentReference[oaicite:1]{index=1}

### Passos

1. Importar o arquivo.
2. Processar o PDF.
3. Localizar a transferência recebida.
4. Relacionar a linha complementar.
5. Extrair o CNPJ.
6. Validar o CNPJ.
7. Exibir a movimentação para confirmação.

### Resultado esperado

O sistema deverá apresentar:

```text
Conta: 45.140-1
Data: 21/07/2026
Hora: 16:32
Tipo: Transferência recebida
Documento: 612.946.000.059.202
Valor: R$ 16.335,74
Natureza: Crédito
CNPJ sugerido: 01.280.707/0001-61
Situação: Aguardando confirmação
```

O sistema deverá classificar a movimentação como:

```text
Alta possibilidade de devolução
```

A devolução ainda não deverá ser confirmada automaticamente.

### Situação

Não executado.

---

## CT-REAL-003 — Ignorar resgate de investimento

### Objetivo

Verificar se o sistema não confunde resgate de investimento com devolução.

### Dados de entrada

Movimentação presente no extrato:

```text
Resgate BB CDB DI
R$ 13,00 C
```

### Resultado esperado

A movimentação deverá ser classificada como:

```text
Movimentação interna
```

Não deverá aparecer na lista de possíveis devoluções.

### Situação

Não executado.

---

## CT-REAL-004 — Ignorar aplicação automática

### Objetivo

Verificar se o lançamento `BB Rende Fácil` não é tratado como devolução.

### Dados de entrada

```text
BB Rende Fácil
R$ 16.340,24 D
```

### Resultado esperado

A movimentação deverá ser ignorada como possível devolução.

### Situação

Não executado.

---

## CT-REAL-005 — Mensagem de conta não movimentada com lançamentos existentes

### Objetivo

Verificar se o sistema não confia apenas na mensagem apresentada no rodapé.

O extrato utilizado possui lançamentos em `21/07/2026`, embora também apresente a mensagem `A CONTA NAO FOI MOVIMENTADA`. :contentReference[oaicite:2]{index=2}

### Resultado esperado

O sistema deverá:

- processar normalmente os lançamentos encontrados;
- identificar a transferência recebida;
- não classificar o extrato inteiro como vazio.

### Situação

Não executado.

---

# 8. Testes de leitura das movimentações

## CT-MOV-001 — Relacionar linha complementar

### Objetivo

Verificar se a linha que contém horário, nome reduzido e CNPJ é associada à transferência anterior.

### Dados de entrada

```text
21/07/2026 ... Transferência recebida ... 16.335,74 C
21/07 16:32 FEDERA 00001280707000161
```

### Resultado esperado

Deverá ser criada apenas uma movimentação contendo:

```text
Data: 21/07/2026
Hora: 16:32
Identificação: FEDERA
CNPJ: 01.280.707/0001-61
Valor: R$ 16.335,74
```

A segunda linha não deverá virar uma nova movimentação.

### Situação

Não executado.

---

## CT-MOV-002 — Diferenciar crédito e débito

### Dados de entrada

```text
16.335,74 C
8,50 D
```

### Resultado esperado

```text
16.335,74 C → crédito
8,50 D → débito
```

### Situação

Não executado.

---

## CT-MOV-003 — Converter valor brasileiro

### Objetivo

Verificar a conversão do valor formatado em número.

### Dados de entrada

```text
16.335,74
```

### Resultado esperado

Valor visual:

```text
R$ 16.335,74
```

Valor interno:

```text
16335.74
```

### Situação

Não executado.

---

## CT-MOV-004 — Valor inválido

### Dados de entrada

```text
16.33X,74
```

### Resultado esperado

A movimentação deverá receber:

```text
Necessita revisão
```

O sistema não deverá assumir um valor.

### Situação

Não executado.

---

# 9. Testes de CNPJ

## CT-CNPJ-001 — Remover prefixo bancário

### Dados de entrada

```text
00001280707000161
```

### Resultado esperado

O sistema deverá identificar como candidato:

```text
01280707000161
```

### Situação

Não executado.

---

## CT-CNPJ-002 — Formatar CNPJ

### Dados de entrada

```text
01280707000161
```

### Resultado esperado

```text
01.280.707/0001-61
```

### Situação

Não executado.

---

## CT-CNPJ-003 — Validar CNPJ correto

### Dados de entrada

```text
01280707000161
```

### Resultado esperado

```text
CNPJ válido
```

### Situação

Não executado.

---

## CT-CNPJ-004 — Rejeitar CNPJ inválido

### Dados de entrada

```text
01280707000162
```

### Resultado esperado

```text
CNPJ inválido
```

O número não deverá ser confirmado automaticamente.

### Situação

Não executado.

---

## CT-CNPJ-005 — Rejeitar números repetidos

### Dados de entrada

```text
00000000000000
```

### Resultado esperado

```text
CNPJ inválido
```

### Situação

Não executado.

---

## CT-CNPJ-006 — Nenhum CNPJ encontrado

### Objetivo

Verificar o comportamento quando uma transferência não possui CNPJ.

### Resultado esperado

A movimentação deverá permanecer com:

```text
Possível devolução sem CNPJ
```

O sistema deverá permitir preenchimento manual.

### Situação

Não executado.

---

## CT-CNPJ-007 — Vários CNPJs encontrados

### Objetivo

Verificar o comportamento quando mais de um CNPJ válido estiver presente.

### Resultado esperado

O sistema deverá:

- listar os candidatos;
- não selecionar automaticamente;
- solicitar confirmação do usuário.

### Situação

Não executado.

---

# 10. Testes de confirmação da devolução

## CT-DEV-001 — Confirmar devolução

### Pré-condições

- movimentação classificada como possível devolução;
- conta, data e valor identificados.

### Passos

1. Clicar em `Confirmar devolução`.
2. Revisar os dados.
3. Confirmar.

### Resultado esperado

O sistema deverá:

- criar um registro de devolução;
- gerar um identificador;
- alterar o status para `Consulta no Fluig pendente`.

Exemplo:

```text
DEV-2026-0001
```

### Situação

Não executado.

---

## CT-DEV-002 — Marcar que não é devolução

### Passos

1. Selecionar uma possível devolução.
2. Clicar em `Não é devolução`.
3. Informar o motivo.
4. Confirmar.

### Resultado esperado

- nenhuma devolução deverá ser criada;
- a movimentação deverá continuar no histórico;
- o motivo deverá ser registrado.

### Situação

Não executado.

---

## CT-DEV-003 — Confirmar devolução sem CNPJ

### Resultado esperado

O sistema deverá permitir a confirmação quando existirem:

- conta;
- data;
- valor;
- movimentação de origem.

O registro deverá indicar que o CNPJ ainda está pendente.

### Situação

Não executado.

---

# 11. Testes da consulta no Fluig

## CT-FLUIG-001 — Copiar CNPJ sem formatação

### Dados de entrada

```text
01.280.707/0001-61
```

### Passos

1. Clicar em `Copiar CNPJ`.

### Resultado esperado

O conteúdo copiado deverá ser:

```text
01280707000161
```

### Situação

Não executado.

---

## CT-FLUIG-002 — Nenhum projeto encontrado

### Passos

1. Realizar a pesquisa no Fluig.
2. Marcar `Nenhum projeto encontrado`.
3. Registrar a data.
4. Salvar.

### Resultado esperado

O status deverá mudar para:

```text
Aguardando projeto no Fluig
```

A devolução deverá continuar aberta.

### Situação

Não executado.

---

## CT-FLUIG-003 — Um projeto encontrado

### Dados de entrada

Exemplo:

```text
PAA: 34199/2026
```

### Resultado esperado

O sistema deverá permitir registrar o projeto, mas deverá exigir confirmação manual antes de relacioná-lo definitivamente à devolução.

### Situação

Não executado.

---

## CT-FLUIG-004 — Vários projetos encontrados

### Dados de entrada

Dois ou mais projetos retornados pelo mesmo CNPJ.

### Resultado esperado

O sistema deverá:

- permitir cadastrar todos os candidatos;
- marcar o status como `Vários projetos encontrados`;
- permitir selecionar somente um projeto confirmado;
- não escolher automaticamente pelo valor.

### Situação

Não executado.

---

## CT-FLUIG-005 — Nova consulta posterior

### Pré-condições

Devolução com status:

```text
Aguardando projeto no Fluig
```

### Passos

1. Abrir a devolução.
2. Realizar uma nova consulta.
3. Registrar o novo resultado.

### Resultado esperado

- a consulta anterior deverá permanecer no histórico;
- a nova consulta deverá ser adicionada;
- o status deverá ser atualizado conforme o resultado.

### Situação

Não executado.

---

# 12. Testes de geração do e-mail

## CT-EMAIL-001 — Gerar assunto

### Dados de entrada

```text
Valor: 16335.74
```

### Resultado esperado

```text
Devolução de Saldo (PROJETO) - R$ 16.335,74
```

### Situação

Não executado.

---

## CT-EMAIL-002 — Gerar corpo completo

### Dados de entrada

```text
Entidade: Feapaes do Pará
UF: PA
CNPJ: 01.280.707/0001-61
PAA: 34199/2026
Valor: R$ 16.335,74
Data: 21/07/2026
Conta: 45.140-1
```

### Resultado esperado

```text
Prezados(as),

Encaminho a seguir as informações referentes à devolução de saldo:

Entidade: Feapaes do Pará - PA
CNPJ: 01.280.707/0001-61
Projeto/PAA: 34199/2026
Valor devolvido: R$ 16.335,74
Data da devolução: 21/07/2026
Conta de recebimento: 45.140-1

Atenciosamente,
Denis Sousa
```

### Situação

Não executado.

---

## CT-EMAIL-003 — Editar o texto antes de copiar

### Resultado esperado

O usuário deverá conseguir alterar:

- assunto;
- corpo;
- observações.

As alterações deverão ser preservadas enquanto o registro estiver aberto.

### Situação

Não executado.

---

## CT-EMAIL-004 — Confirmar envio manual

### Passos

1. Gerar o texto.
2. Copiar o e-mail.
3. Enviar pelo serviço de e-mail.
4. Voltar ao Aziel.
5. Marcar `E-mail enviado`.

### Resultado esperado

O sistema deverá:

- registrar data e hora;
- alterar o status para `Comunicado ao financeiro`;
- adicionar o evento ao histórico.

### Situação

Não executado.

---

# 13. Testes de duplicidade

## CT-DUP-001 — Importar o mesmo PDF duas vezes

### Passos

1. Importar um PDF.
2. Concluir o processamento.
3. Importar novamente o mesmo arquivo.

### Resultado esperado

O sistema deverá informar:

```text
Este extrato já foi processado anteriormente.
```

Nenhuma movimentação deverá ser duplicada.

### Situação

Não executado.

---

## CT-DUP-002 — Mesmo conteúdo com nome diferente

### Passos

1. Importar um PDF.
2. Renomear uma cópia do arquivo.
3. Importar a cópia.

### Resultado esperado

O sistema deverá identificar que o conteúdo já foi processado.

### Situação

Não executado.

---

## CT-DUP-003 — Mesmo período com conteúdo atualizado

### Objetivo

Verificar se dois extratos do mesmo período não são bloqueados apenas por possuírem as mesmas datas.

### Resultado esperado

Caso o conteúdo seja diferente, o sistema deverá permitir a análise e avisar que já existe outro extrato da mesma conta e período.

### Situação

Não executado.

---

# 14. Testes da rotina diária

## CT-ROT-001 — Apenas uma conta conferida

### Dados de entrada

```text
45.140-1: conferida
45.141-X: não conferida
```

### Resultado esperado

O dashboard deverá indicar:

```text
Conta 45.141-X pendente de conferência.
```

### Situação

Não executado.

---

## CT-ROT-002 — Duas contas conferidas

### Resultado esperado

O dashboard deverá indicar:

```text
Conferência diária concluída.
```

### Situação

Não executado.

---

# 15. Testes de segurança

## CT-SEG-001 — Ignorar token bancário

### Objetivo

Verificar se endereços com dados de sessão não são armazenados.

### Dados de entrada

Texto contendo:

```text
tokenSessao=
```

### Resultado esperado

O texto deverá ser ignorado.

Não deverá aparecer:

- na tela;
- no histórico;
- nos dados da devolução;
- em mensagens de erro.

### Situação

Não executado.

---

## CT-SEG-002 — Não armazenar saldo bancário

### Resultado esperado

Os saldos presentes no extrato não deverão fazer parte do registro da devolução.

### Situação

Não executado.

---

# 16. Resumo dos testes prioritários

Os primeiros testes implementados serão:

| Prioridade | Caso | Descrição |
|---|---|---|
| Alta | CT-REAL-001 | Extrato sem movimentação relevante |
| Alta | CT-REAL-002 | Transferência recebida com CNPJ |
| Alta | CT-REAL-005 | Rodapé contraditório |
| Alta | CT-MOV-001 | Linha complementar |
| Alta | CT-CNPJ-003 | Validação do CNPJ |
| Alta | CT-DUP-001 | Arquivo duplicado |
| Média | CT-FLUIG-002 | Projeto não encontrado |
| Média | CT-FLUIG-004 | Vários projetos |
| Média | CT-EMAIL-002 | Corpo do e-mail |

---

# 17. Registro das execuções

| Caso | Data | Resultado obtido | Situação | Observação |
|---|---|---|---|---|
| CT-REAL-001 | — | — | Não executado | Aguardando desenvolvimento |
| CT-REAL-002 | — | — | Não executado | Aguardando desenvolvimento |
| CT-MOV-001 | — | — | Não executado | Aguardando desenvolvimento |
| CT-CNPJ-003 | — | — | Não executado | Aguardando desenvolvimento |

---

# 18. Histórico do documento

| Versão | Data | Alteração |
|---|---|---|
| 1.0 | 30/07/2026 | Criação dos casos de teste iniciais |