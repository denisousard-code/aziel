# Regras de Negócio do Sistema Aziel

## 1. Identificação do documento

| Informação | Valor |
|---|---|
| Sistema | Aziel — Gestão Operacional e Automação |
| Documento | Regras de Negócio |
| Versão do documento | 1.0 |
| Versão do sistema | 0.1.0 |
| Data inicial | 30/07/2026 |
| Primeiro módulo | Controle de Devoluções |
| Área responsável | Controladoria |

---

## 2. Objetivo

Este documento registra as regras que determinam como o Aziel deverá interpretar, classificar e acompanhar os dados do processo de devolução de saldo de projetos.

As regras de negócio representam decisões do processo operacional.

Elas não descrevem apenas o que aparece na tela. Elas definem como o sistema deverá agir diante de diferentes situações.

Exemplo:

> Uma transferência recebida não deverá ser considerada uma devolução definitiva sem confirmação do usuário.

---

# 3. Regras gerais do processo

## RN-GER-001 — Validação humana obrigatória

O Aziel poderá identificar movimentações suspeitas e apresentar sugestões, mas não deverá confirmar automaticamente:

- que uma movimentação é uma devolução;
- qual entidade realizou a devolução;
- qual projeto está relacionado;
- se o e-mail pode ser enviado;
- se uma pendência pode ser encerrada.

Essas decisões deverão ser confirmadas pelo usuário.

---

## RN-GER-002 — Separação entre movimentação e devolução

Uma movimentação bancária e uma devolução são registros diferentes.

A movimentação representa o lançamento encontrado no extrato.

A devolução representa a confirmação de que aquela movimentação está relacionada à devolução de saldo de um projeto.

Portanto:

```text
Movimentação encontrada
        ↓
Análise do usuário
        ↓
Devolução confirmada ou movimentação descartada
```

---

## RN-GER-003 — O projeto não é obrigatório no primeiro registro

Uma devolução poderá ser criada mesmo que nenhum projeto tenha sido localizado no Fluig.

Isso acontece porque a devolução pode aparecer no extrato antes de o projeto ser encaminhado para análise.

Nessa situação, o registro deverá permanecer pendente.

---

## RN-GER-004 — Nenhuma informação relevante deverá ser perdida

Caso o processo não possa ser concluído, o sistema deverá manter:

- movimentação bancária;
- CNPJ encontrado;
- entidade, quando identificada;
- data da consulta;
- resultado da consulta;
- observações;
- próxima ação.

---

## RN-GER-005 — Alterações importantes deverão ser registradas

Mudanças relevantes deverão permanecer no histórico.

Exemplos:

- correção do CNPJ;
- troca do projeto selecionado;
- mudança de status;
- descarte de movimentação;
- reabertura de devolução;
- confirmação de envio ao financeiro.

---

# 4. Regras das contas bancárias

## RN-CON-001 — Contas monitoradas

Inicialmente, o Aziel deverá monitorar:

- conta 45.140-1;
- conta 45.141-X.

---

## RN-CON-002 — Conferência individual

Cada conta deverá possuir sua própria situação diária.

A conferência de uma conta não deverá concluir automaticamente a conferência da outra.

Exemplo:

| Conta | Situação |
|---|---|
| 45.140-1 | Conferida |
| 45.141-X | Pendente |

---

## RN-CON-003 — Conta não reconhecida

Caso o leitor identifique uma conta diferente das contas cadastradas, o sistema deverá:

1. informar o número encontrado;
2. alertar que a conta não está cadastrada;
3. solicitar confirmação;
4. não importar automaticamente como conta oficial.

---

## RN-CON-004 — Exibição da conta

A conta deverá ser exibida com o formato utilizado no processo.

Exemplo:

```text
45.140-1
```

Internamente, o sistema poderá manter somente os caracteres necessários para comparação.

---

# 5. Regras de importação do PDF

## RN-PDF-001 — Formato inicial aceito

Na primeira versão, somente PDFs digitais com texto extraível serão processados automaticamente.

---

## RN-PDF-002 — PDF escaneado não é extrato vazio

Caso o PDF não possua texto extraível, o sistema não deverá classificá-lo como sem movimentação.

Deverá informar:

> Não foi possível extrair o texto deste PDF. Realize a conferência manual ou utilize outro arquivo.

---

## RN-PDF-003 — O arquivo original não deverá ser alterado

O Aziel deverá apenas ler o PDF selecionado.

O sistema não deverá:

- editar o arquivo;
- sobrescrever o arquivo;
- remover páginas;
- alterar o nome original automaticamente.

---

## RN-PDF-004 — Processamento por conteúdo

O sistema deverá analisar o conteúdo extraído do PDF, e não apenas o nome do arquivo.

O nome poderá auxiliar na identificação, mas não será considerado fonte definitiva.

---

## RN-PDF-005 — Dados bancários desnecessários deverão ser ignorados

O sistema não deverá guardar como parte da devolução:

- saldo da conta;
- saldo anterior;
- fundos de investimento;
- valores aplicados;
- valores resgatados automaticamente;
- juros;
- IOF;
- nome do usuário que emitiu o extrato;
- endereço bancário com token de sessão.

---

## RN-PDF-006 — Token de sessão deverá ser descartado

Qualquer endereço ou texto contendo token, sessão ou autenticação bancária deverá ser ignorado pelo leitor.

Esses dados não deverão aparecer:

- na interface;
- no histórico;
- no armazenamento;
- nos registros de erro.

---

# 6. Regras de identificação do período

## RN-PER-001 — Período do extrato

O sistema deverá tentar identificar:

- data inicial;
- data final.

---

## RN-PER-002 — Formato interno da data

Internamente, as datas deverão ser armazenadas no padrão:

```text
AAAA-MM-DD
```

Exemplo:

```text
2026-07-21
```

---

## RN-PER-003 — Formato visual da data

Na interface, as datas deverão ser exibidas no padrão brasileiro:

```text
DD/MM/AAAA
```

Exemplo:

```text
21/07/2026
```

---

## RN-PER-004 — Período inválido

Caso a data inicial seja posterior à data final, o sistema deverá classificar o processamento como inconsistente e solicitar revisão.

---

# 7. Regras de leitura das movimentações

## RN-MOV-001 — A seção de lançamentos é a fonte principal

A análise deverá priorizar as linhas localizadas na seção de lançamentos do extrato.

---

## RN-MOV-002 — Uma movimentação pode ocupar várias linhas

O leitor deverá considerar que uma mesma movimentação pode ser apresentada em duas ou mais linhas.

Exemplo:

```text
Transferência recebida — documento — valor

Data, hora, identificação do remetente e CNPJ
```

A linha complementar deverá ser associada à movimentação anterior quando houver compatibilidade.

---

## RN-MOV-003 — Linha complementar não deverá virar nova movimentação

Uma linha contendo apenas:

- hora;
- nome reduzido;
- CNPJ;
- informação complementar;

não deverá ser cadastrada como movimentação separada.

---

## RN-MOV-004 — Crédito e débito deverão ser diferenciados

Os indicadores bancários deverão ser interpretados da seguinte forma:

- `C`: crédito;
- `D`: débito.

---

## RN-MOV-005 — Crédito não significa devolução automaticamente

Nem todo crédito recebido deverá ser considerado devolução.

Exemplos de créditos que podem não representar devolução:

- resgate de investimento;
- transferência interna;
- ajuste bancário;
- estorno;
- rendimento;
- crédito operacional.

---

## RN-MOV-006 — Débito não deverá ser classificado como devolução recebida

Movimentações de débito não deverão ser classificadas como devoluções de saldo recebidas.

---

## RN-MOV-007 — Documento bancário deverá ser preservado

Quando disponível, o número do documento bancário deverá ser armazenado para auxiliar:

- identificação;
- auditoria;
- prevenção de duplicidade;
- conferência posterior.

---

## RN-MOV-008 — Valor deverá ser armazenado como número

O valor não deverá ser armazenado somente como texto formatado.

Exemplo visual:

```text
R$ 16.335,74
```

Exemplo interno:

```text
16335.74
```

---

## RN-MOV-009 — Valores negativos ou inválidos deverão ser revisados

Caso o leitor não consiga interpretar corretamente o valor, a movimentação deverá receber o status:

```text
Necessita revisão
```

---

# 8. Regras para extrato sem movimentação

## RN-SEM-001 — A mensagem do rodapé não é suficiente

A frase:

```text
A CONTA NAO FOI MOVIMENTADA
```

não deverá ser usada isoladamente para concluir que o extrato está vazio.

---

## RN-SEM-002 — Os lançamentos deverão ser analisados primeiro

Antes de classificar o extrato como sem movimentação, o sistema deverá verificar se existem lançamentos reais.

---

## RN-SEM-003 — Itens de saldo não contam como movimentação relevante

Os seguintes itens não deverão impedir a classificação de extrato sem movimentação operacional:

- saldo anterior;
- saldo;
- fundos;
- saldo de investimento;
- juros sem valor;
- IOF sem valor.

---

## RN-SEM-004 — Conferência sem movimentação deverá ser registrada

Mesmo quando não houver movimentação, o sistema deverá registrar que a conta foi conferida.

Resultado esperado:

```text
Conta conferida
Nenhuma movimentação relevante encontrada
```

---

# 9. Regras de classificação de possível devolução

## RN-CLA-001 — Histórico compatível com recebimento externo

Uma movimentação poderá ser classificada como possível devolução quando possuir histórico compatível com recebimento externo.

Exemplos iniciais:

- transferência recebida;
- PIX recebido;
- depósito recebido;
- crédito recebido de terceiro.

---

## RN-CLA-002 — Movimentações internas deverão ser ignoradas

Movimentações com características internas não deverão ser apresentadas como possível devolução.

Exemplos:

- Resgate BB CDB DI;
- BB Rende Fácil;
- aplicação automática;
- saldo anterior;
- saldo;
- juros;
- IOF.

---

## RN-CLA-003 — A presença de CNPJ aumenta a confiança

Quando uma movimentação recebida possuir um CNPJ válido em sua linha complementar, ela poderá receber um nível maior de confiança como possível devolução.

Ainda assim, a confirmação humana continuará obrigatória.

---

## RN-CLA-004 — Movimentação sem CNPJ poderá ser analisada

Uma transferência recebida sem CNPJ não deverá ser automaticamente descartada.

Ela poderá receber o status:

```text
Possível devolução sem CNPJ
```

---

## RN-CLA-005 — Classificação inicial

A classificação inicial poderá ser:

- alta possibilidade de devolução;
- possível devolução;
- movimentação interna;
- movimentação desconhecida;
- necessita revisão.

---

## RN-CLA-006 — Confirmação definitiva

Somente após a ação do usuário a movimentação poderá ser classificada como:

- devolução confirmada;
- não é devolução.

---

# 10. Regras do CNPJ

## RN-CNPJ-001 — Normalização

Antes de ser analisado, o CNPJ deverá ter removidos:

- pontos;
- barras;
- traços;
- espaços;
- letras;
- outros símbolos.

---

## RN-CNPJ-002 — Quantidade de dígitos

Um CNPJ normalizado deverá conter 14 dígitos.

---

## RN-CNPJ-003 — Prefixos adicionais

Quando uma sequência possuir mais de 14 dígitos, o sistema deverá procurar combinações candidatas de 14 dígitos.

Exemplo:

```text
Texto encontrado:
00001280707000161

CNPJ candidato:
01280707000161
```

---

## RN-CNPJ-004 — Validação matemática

Um CNPJ candidato somente deverá ser marcado como válido quando os dígitos verificadores estiverem corretos.

---

## RN-CNPJ-005 — Sequências repetidas são inválidas

CNPJs formados por um único número repetido deverão ser considerados inválidos.

Exemplos:

```text
00000000000000
11111111111111
99999999999999
```

---

## RN-CNPJ-006 — Formatação visual

Um CNPJ válido deverá ser exibido no formato:

```text
00.000.000/0000-00
```

---

## RN-CNPJ-007 — Armazenamento interno

Internamente, o CNPJ deverá ser armazenado apenas com números.

---

## RN-CNPJ-008 — CNPJ válido não confirma a entidade sozinho

Mesmo que o CNPJ seja válido, o sistema deverá permitir a confirmação ou correção pelo usuário.

---

## RN-CNPJ-009 — CNPJ corrigido deverá gerar histórico

Quando o usuário alterar o CNPJ sugerido, o sistema deverá registrar:

- CNPJ anterior;
- CNPJ novo;
- data da alteração;
- motivo, quando informado.

---

# 11. Regras da confirmação da devolução

## RN-DEV-001 — A confirmação cria a devolução

O registro oficial da devolução somente deverá ser criado após a confirmação do usuário.

---

## RN-DEV-002 — Dados mínimos

Para confirmar uma devolução, deverão estar disponíveis:

- conta;
- data da movimentação;
- valor;
- movimentação de origem.

O CNPJ poderá ser preenchido posteriormente quando não estiver disponível.

---

## RN-DEV-003 — Identificador único

Cada devolução deverá receber um código único.

Formato inicial:

```text
DEV-AAAA-NNNN
```

Exemplo:

```text
DEV-2026-0001
```

---

## RN-DEV-004 — Sequência anual

A numeração poderá ser reiniciada a cada ano.

Exemplo:

```text
DEV-2026-0001
DEV-2026-0002
DEV-2027-0001
```

---

## RN-DEV-005 — Uma movimentação não deverá gerar duas devoluções iguais

A mesma movimentação bancária não deverá ser relacionada a mais de uma devolução idêntica.

---

## RN-DEV-006 — Divisão de uma movimentação

Caso uma única movimentação represente mais de um projeto, o sistema não deverá dividir automaticamente o valor.

Esse cenário deverá permanecer como caso de revisão até que a regra seja confirmada.

---

## RN-DEV-007 — Devolução parcial

O valor devolvido poderá ser inferior ao valor total do projeto.

Portanto, o Aziel não deverá exigir igualdade entre:

- valor devolvido;
- valor do projeto.

---

## RN-DEV-008 — O valor não identifica o projeto sozinho

O valor da devolução poderá ser usado como referência, mas não deverá definir automaticamente o projeto correto.

---

# 12. Regras da consulta no Fluig

## RN-FLUIG-001 — Pesquisa pelo CNPJ

O CNPJ deverá ser disponibilizado com 14 números para ser utilizado no campo de pesquisa do portal Fluig.

Exemplo:

```text
95815635000153
```

---

## RN-FLUIG-002 — A consulta inicial será manual

Na primeira versão, o usuário deverá:

1. copiar o CNPJ no Aziel;
2. abrir o Fluig;
3. colar o CNPJ no campo de pesquisa;
4. verificar os resultados;
5. registrar o resultado no Aziel.

---

## RN-FLUIG-003 — Nenhum resultado

Quando nenhum projeto for encontrado, a devolução deverá receber o status:

```text
Aguardando projeto no Fluig
```

---

## RN-FLUIG-004 — Um resultado não significa confirmação automática

Mesmo quando apenas um projeto for encontrado, o usuário deverá confirmar se ele corresponde à devolução.

---

## RN-FLUIG-005 — Vários projetos

Quando o CNPJ retornar vários projetos:

- todos os candidatos relevantes poderão ser registrados;
- nenhum deverá ser selecionado automaticamente;
- o usuário deverá escolher o correto.

---

## RN-FLUIG-006 — Somente um projeto confirmado

Uma devolução poderá possuir vários candidatos, mas somente um projeto deverá ser marcado como confirmado.

Esta regra poderá ser revisada caso seja identificado um processo real em que uma devolução corresponda a vários projetos.

---

## RN-FLUIG-007 — Projeto não enviado para análise

A ausência do projeto no Fluig não invalida a devolução.

O registro deverá permanecer aberto para nova consulta.

---

## RN-FLUIG-008 — Nova consulta deverá ser permitida

Uma devolução em espera poderá receber várias consultas ao longo do tempo.

Cada tentativa deverá registrar:

- data;
- resultado;
- observação;
- projetos encontrados.

---

## RN-FLUIG-009 — O resultado anterior não deverá ser apagado

Uma nova consulta não deverá apagar as informações da consulta anterior.

O sistema deverá manter o histórico.

---

## RN-FLUIG-010 — Dados do projeto

Quando disponíveis, poderão ser registrados:

- PAA;
- instituição;
- edital;
- nome do projeto;
- valor;
- etapa atual;
- situação;
- observações.

---

# 13. Regras de entidade

## RN-ENT-001 — Entidade identificada pelo CNPJ

O CNPJ deverá ser a principal chave de identificação da entidade.

---

## RN-ENT-002 — CNPJ único

Duas entidades ativas não deverão possuir o mesmo CNPJ.

---

## RN-ENT-003 — Tipos iniciais

Os tipos iniciais serão:

- APAE;
- Federação;
- outra entidade.

---

## RN-ENT-004 — Entidade poderá ser cadastrada durante o fluxo

Caso o CNPJ ainda não esteja na base, o usuário poderá cadastrar a entidade sem perder os dados da devolução.

---

## RN-ENT-005 — Entidade inativa não deverá ser apagada

Entidades que deixarem de ser utilizadas deverão ser marcadas como inativas, mantendo o histórico das devoluções antigas.

---

# 14. Regras do e-mail ao financeiro

## RN-EMAIL-001 — E-mail somente após identificação suficiente

O e-mail deverá ser preparado quando houver informações suficientes para a comunicação.

O conjunto ideal contém:

- entidade;
- CNPJ;
- PAA;
- valor.

---

## RN-EMAIL-002 — Projeto não encontrado

Caso o projeto ainda não tenha sido localizado, o sistema não deverá gerar automaticamente o e-mail padrão de devolução concluída.

Poderá ser criado futuramente um modelo específico para comunicação de devolução sem projeto identificado.

---

## RN-EMAIL-003 — Assunto inicial

Modelo inicial:

```text
Devolução de Saldo (PROJETO) - R$ 16.335,74
```

---

## RN-EMAIL-004 — Formatação do valor

O valor deverá ser exibido no padrão monetário brasileiro:

```text
R$ 16.335,74
```

---

## RN-EMAIL-005 — Corpo inicial

Modelo inicial:

```text
Prezados(as),

Encaminho a seguir as informações referentes à devolução de saldo:

Entidade: [nome da entidade] - [UF]
CNPJ: [CNPJ]
Projeto/PAA: [PAA]
Valor devolvido: [valor]
Data da devolução: [data]
Conta de recebimento: [conta]

Atenciosamente,
Denis Sousa
```

---

## RN-EMAIL-006 — Edição permitida

O usuário poderá alterar o texto antes de copiar ou enviar.

---

## RN-EMAIL-007 — Envio não será automático

Na primeira versão, o Aziel apenas deverá:

- gerar o texto;
- permitir copiar;
- registrar manualmente o envio.

---

## RN-EMAIL-008 — Marcação de envio

Uma devolução somente deverá receber o status `Comunicado ao financeiro` após confirmação do usuário.

---

## RN-EMAIL-009 — Reabertura

Caso o usuário marque o envio por engano, o registro poderá ser reaberto, mas a alteração deverá permanecer no histórico.

---

# 15. Regras de status

## RN-STA-001 — Status inicial da movimentação

Uma movimentação identificada como possível recebimento deverá iniciar como:

```text
Aguardando confirmação
```

---

## RN-STA-002 — Status após confirmação

Após a confirmação como devolução:

```text
Consulta no Fluig pendente
```

---

## RN-STA-003 — Status quando houver vários projetos

Quando houver vários candidatos sem seleção:

```text
Vários projetos encontrados
```

---

## RN-STA-004 — Status sem projeto

Quando nenhum projeto for localizado:

```text
Aguardando projeto no Fluig
```

---

## RN-STA-005 — Status após seleção

Quando o projeto correto for confirmado:

```text
Projeto identificado
```

---

## RN-STA-006 — Status após geração do e-mail

Quando o texto do e-mail for preparado:

```text
E-mail preparado
```

---

## RN-STA-007 — Status após comunicação

Quando o envio for confirmado:

```text
Comunicado ao financeiro
```

---

## RN-STA-008 — Conclusão

Uma devolução poderá ser considerada concluída quando:

- estiver confirmada;
- possuir projeto identificado;
- o financeiro tiver sido comunicado;
- não houver pendência operacional aberta.

---

## RN-STA-009 — Necessita revisão

O status `Necessita revisão` deverá ser utilizado quando existir:

- valor inconsistente;
- CNPJ duvidoso;
- conta desconhecida;
- falha na leitura;
- conflito entre informações;
- dúvida sobre o projeto;
- outra situação que impeça o avanço seguro.

---

# 16. Regras de descarte

## RN-DES-001 — Descarte não apaga a movimentação

Ao marcar que uma movimentação não é devolução, o sistema não deverá apagar o registro da importação.

---

## RN-DES-002 — Motivos de descarte

Os motivos iniciais poderão ser:

- movimentação interna;
- resgate de investimento;
- estorno;
- transferência sem relação com projeto;
- lançamento bancário;
- duplicidade;
- outro.

---

## RN-DES-003 — Justificativa para “outro”

Quando o motivo selecionado for `Outro`, deverá ser informada uma observação.

---

## RN-DES-004 — Reversão do descarte

Uma movimentação descartada poderá ser reaberta, mantendo o registro da ação anterior.

---

# 17. Regras de duplicidade

## RN-DUP-001 — Identificação do arquivo

O sistema deverá gerar um identificador baseado no conteúdo do arquivo.

Esse identificador será utilizado para detectar o mesmo PDF, mesmo que o nome seja alterado.

---

## RN-DUP-002 — Critérios auxiliares

Também poderão ser comparados:

- conta;
- período;
- data de emissão;
- documento da movimentação;
- data;
- valor;
- CNPJ.

---

## RN-DUP-003 — Mesmo extrato com nome diferente

Caso o conteúdo seja o mesmo, o sistema deverá considerá-lo duplicado mesmo que o arquivo tenha sido renomeado.

---

## RN-DUP-004 — Extratos do mesmo período podem ser diferentes

Dois arquivos da mesma conta e do mesmo período não deverão ser considerados duplicados automaticamente.

O conteúdo deverá ser comparado.

Isso evita bloquear um extrato emitido novamente com informações atualizadas.

---

## RN-DUP-005 — Movimentação duplicada

Uma movimentação poderá ser considerada duplicada quando possuir a mesma combinação de:

- conta;
- data;
- documento;
- valor;
- natureza.

Quando o documento não estiver disponível, a confirmação deverá ser mais cuidadosa.

---

# 18. Regras de histórico

## RN-HIS-001 — Linha do tempo

Cada devolução deverá manter uma linha do tempo com suas ações principais.

---

## RN-HIS-002 — Data e hora

Cada evento deverá registrar:

- data;
- hora;
- tipo da ação;
- descrição.

---

## RN-HIS-003 — Informação anterior e nova

Quando um campo relevante for alterado, o histórico deverá guardar:

- valor anterior;
- valor novo.

---

## RN-HIS-004 — Histórico não editável diretamente

O usuário não deverá editar manualmente uma linha já registrada no histórico.

Correções deverão gerar um novo evento.

---

# 19. Regras de pendências

## RN-PEN-001 — Toda pendência deverá indicar o motivo

Uma pendência não deverá aparecer somente como “Pendente”.

Ela deverá informar o que está faltando.

Exemplos:

- confirmar movimentação;
- informar CNPJ;
- consultar projeto;
- escolher projeto;
- preparar e-mail;
- confirmar envio.

---

## RN-PEN-002 — Próxima ação

Uma devolução pendente poderá possuir:

- próxima ação;
- data prevista;
- observação.

---

## RN-PEN-003 — Projeto ainda não disponível

Quando o projeto não estiver no Fluig, a próxima ação sugerida poderá ser:

```text
Realizar nova consulta no Fluig
```

---

## RN-PEN-004 — Pendência encerrada

Uma pendência somente deverá ser encerrada quando a ação que a originou tiver sido resolvida ou formalmente descartada.

---

# 20. Regras de segurança

## RN-SEG-001 — Dados sensíveis

O sistema não deverá armazenar:

- senha bancária;
- senha do Fluig;
- token de sessão;
- cookie de autenticação;
- código de acesso;
- informações de login.

---

## RN-SEG-002 — Extratos reais no projeto

Extratos reais não deverão ser adicionados a repositórios públicos ou compartilhados junto ao código-fonte.

---

## RN-SEG-003 — Arquivos de teste

A pasta:

```text
samples/extratos-anonimizados
```

deverá conter apenas:

- arquivos fictícios;
- arquivos anonimizados;
- arquivos autorizados para teste.

---

## RN-SEG-004 — Uso de dados reais

Dados institucionais reais somente deverão ser utilizados na versão operacional depois da definição de:

- ambiente de execução;
- autenticação;
- controle de acesso;
- armazenamento seguro;
- backup;
- autorização interna.

---

# 21. Fluxo principal da devolução

```text
Importação do PDF
        ↓
Identificação da conta e período
        ↓
Leitura das movimentações
        ↓
Classificação inicial
        ↓
Confirmação do usuário
        ↓
Extração ou preenchimento do CNPJ
        ↓
Consulta manual no Fluig
        ↓
Registro dos projetos encontrados
        ↓
Seleção do projeto correto
        ↓
Geração do e-mail
        ↓
Confirmação do envio
        ↓
Conclusão
```

---

# 22. Fluxos alternativos

## 22.1. Nenhuma movimentação

```text
Importar PDF
      ↓
Nenhuma movimentação relevante
      ↓
Conta marcada como conferida
      ↓
Processamento concluído
```

## 22.2. Movimentação não é devolução

```text
Possível devolução
      ↓
Usuário descarta
      ↓
Motivo registrado
      ↓
Movimentação mantida no histórico
```

## 22.3. CNPJ não encontrado

```text
Transferência recebida
      ↓
CNPJ não localizado
      ↓
Preenchimento manual ou revisão
```

## 22.4. Vários CNPJs

```text
Vários CNPJs válidos encontrados
      ↓
Usuário seleciona o correto
```

## 22.5. Nenhum projeto no Fluig

```text
Devolução confirmada
      ↓
Pesquisa no Fluig
      ↓
Nenhum projeto encontrado
      ↓
Aguardando projeto no Fluig
      ↓
Nova consulta futura
```

## 22.6. Vários projetos

```text
Pesquisa pelo CNPJ
      ↓
Vários projetos encontrados
      ↓
Projetos cadastrados como candidatos
      ↓
Usuário escolhe o correto
```

---

# 23. Pontos ainda não definidos

As regras abaixo ainda precisam de exemplos reais ou decisão operacional:

- tratamento de uma devolução relacionada a mais de um projeto;
- tratamento de várias devoluções para o mesmo projeto;
- prazo ideal para consultar novamente um projeto não encontrado;
- destinatários fixos do e-mail;
- tratamento de PIX sem CNPJ;
- tratamento de devolução feita por pessoa física;
- tratamento de extratos com várias páginas;
- tratamento de estorno de devolução;
- possibilidade de anexar o extrato ao registro;
- prazo de retenção dos registros;
- perfil de outros usuários do sistema.

Esses pontos não deverão ser implementados por suposição.

---

# 24. Histórico do documento

| Versão | Data | Alteração |
|---|---|---|
| 1.0 | 30/07/2026 | Criação das regras iniciais do módulo de devoluções |