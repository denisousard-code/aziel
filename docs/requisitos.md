# Requisitos do Sistema Aziel

## 1. Identificação do documento

| Informação | Valor |
|---|---|
| Sistema | Aziel — Gestão Operacional e Automação |
| Documento | Requisitos do Sistema |
| Versão do documento | 1.0 |
| Versão do sistema | 0.1.0 |
| Data inicial | 30/07/2026 |
| Primeiro módulo | Controle de Devoluções |
| Responsável pelo processo | Controladoria |

---

## 2. Objetivo

Este documento descreve o que o sistema Aziel deverá fazer, quais regras deverá respeitar e quais limitações existirão durante as primeiras versões.

O primeiro módulo do sistema será responsável por auxiliar na conferência diária dos extratos bancários das contas monitoradas, identificar possíveis devoluções de saldo de projetos, apoiar a consulta no Fluig e gerar a comunicação ao setor financeiro.

O sistema deverá reduzir tarefas repetitivas sem substituir as decisões que precisam de análise humana.

---

## 3. Problema atual

Diariamente são recebidos extratos bancários em PDF referentes às contas:

- 45.140-1;
- 45.141-X.

Esses extratos precisam ser conferidos para verificar se alguma APAE ou Federação realizou uma devolução de saldo de projeto.

Quando uma possível devolução é encontrada, é necessário:

1. identificar a movimentação bancária;
2. localizar o CNPJ da entidade;
3. pesquisar esse CNPJ no portal Fluig;
4. verificar os projetos encontrados;
5. identificar o projeto correto;
6. registrar o PAA;
7. comunicar o setor financeiro por e-mail.

Em alguns casos, a devolução aparece no extrato antes de o projeto ser enviado para análise no Fluig. Nessa situação, a devolução precisa permanecer pendente para uma nova consulta futura.

---

## 4. Objetivos do módulo de devoluções

O módulo deverá:

- registrar a conferência diária das duas contas;
- importar extratos bancários em PDF;
- identificar a conta e o período do extrato;
- localizar possíveis transferências recebidas;
- extrair os dados das movimentações;
- identificar possíveis CNPJs;
- permitir a confirmação manual da devolução;
- auxiliar na pesquisa do CNPJ no Fluig;
- registrar nenhum, um ou vários projetos encontrados;
- permitir a seleção manual do projeto correto;
- controlar devoluções sem projeto localizado;
- gerar o texto do e-mail para o financeiro;
- manter o histórico das conferências e devoluções;
- evitar registros duplicados.

---

## 5. Usuário do sistema

### USU-001 — Usuário da Controladoria

Na primeira versão, o sistema será utilizado pelo colaborador responsável pela conferência dos extratos e identificação das devoluções.

O usuário poderá:

- importar extratos;
- revisar movimentações;
- confirmar ou descartar possíveis devoluções;
- registrar resultados da consulta no Fluig;
- selecionar projetos;
- gerar textos de e-mail;
- consultar pendências e históricos.

O controle de vários usuários será implementado apenas em uma versão posterior.

---

# 6. Requisitos funcionais

Os requisitos funcionais descrevem as ações que o sistema deverá executar.

## 6.1. Dashboard

### RF-DASH-001 — Exibir resumo diário

O sistema deverá apresentar no painel:

- situação da conta 45.140-1;
- situação da conta 45.141-X;
- extratos ainda não importados;
- movimentações aguardando conferência;
- devoluções aguardando consulta no Fluig;
- devoluções sem projeto localizado;
- e-mails aguardando geração ou envio;
- devoluções concluídas.

### RF-DASH-002 — Exibir resumo mensal

O sistema deverá apresentar:

- quantidade de devoluções identificadas no mês;
- valor total das devoluções identificadas;
- quantidade de devoluções concluídas;
- quantidade de devoluções pendentes;
- quantidade de movimentações descartadas;
- quantidade de projetos ainda não localizados no Fluig.

### RF-DASH-003 — Permitir acesso rápido

O painel deverá possuir atalhos para:

- importar extrato;
- cadastrar devolução manualmente;
- consultar pendências;
- consultar histórico.

---

## 6.2. Importação de extratos

### RF-EXT-001 — Selecionar arquivo PDF

O sistema deverá permitir que o usuário selecione um arquivo PDF armazenado no computador.

### RF-EXT-002 — Validar o tipo do arquivo

O sistema deverá aceitar inicialmente apenas arquivos no formato PDF.

Caso outro formato seja selecionado, deverá informar:

> Formato não suportado. Selecione um arquivo PDF.

### RF-EXT-003 — Ler PDF com texto digital

O sistema deverá extrair o texto de PDFs digitais, sem depender inicialmente de reconhecimento de imagem.

### RF-EXT-004 — Informar falha de leitura

Caso o PDF não possua texto extraível, o sistema deverá informar que o arquivo não pôde ser processado automaticamente.

O arquivo não deverá ser tratado como extrato vazio.

### RF-EXT-005 — Identificar a agência

O sistema deverá tentar identificar a agência bancária apresentada no cabeçalho do extrato.

Exemplo:

- Agência: 452-9.

### RF-EXT-006 — Identificar a conta

O sistema deverá identificar se o extrato pertence a uma das contas monitoradas:

- 45.140-1;
- 45.141-X.

### RF-EXT-007 — Rejeitar conta desconhecida

Caso o número encontrado não corresponda a uma conta cadastrada no Aziel, o sistema deverá solicitar confirmação do usuário antes de continuar.

### RF-EXT-008 — Identificar o período

O sistema deverá extrair:

- data inicial do extrato;
- data final do extrato.

### RF-EXT-009 — Identificar data de emissão

Quando disponível, o sistema deverá extrair a data e o horário em que o extrato foi emitido.

### RF-EXT-010 — Registrar a importação

Cada importação deverá registrar:

- nome do arquivo;
- conta identificada;
- período;
- data e hora da importação;
- resultado do processamento;
- quantidade de movimentações encontradas.

---

## 6.3. Prevenção de duplicidade

### RF-DUP-001 — Identificar extrato já importado

O sistema deverá verificar se o mesmo extrato já foi processado anteriormente.

A primeira validação deverá considerar:

- conta;
- período;
- data de emissão;
- nome do arquivo;
- identificador calculado a partir do conteúdo.

### RF-DUP-002 — Bloquear duplicidade

Caso o mesmo arquivo já tenha sido importado, o sistema não deverá duplicar as movimentações.

Deverá apresentar:

> Este extrato já foi processado anteriormente.

### RF-DUP-003 — Permitir revisão do registro existente

Ao detectar duplicidade, o sistema deverá permitir abrir o processamento realizado anteriormente.

---

## 6.4. Leitura das movimentações

### RF-MOV-001 — Localizar a seção de lançamentos

O sistema deverá analisar prioritariamente o conteúdo localizado na seção de lançamentos do extrato.

### RF-MOV-002 — Extrair dados da movimentação

Para cada movimentação reconhecida, o sistema deverá tentar extrair:

- data;
- hora, quando disponível;
- agência de origem;
- lote;
- código do histórico;
- descrição do histórico;
- documento;
- valor;
- natureza do valor;
- texto complementar.

### RF-MOV-003 — Diferenciar crédito e débito

O sistema deverá identificar se o valor representa:

- crédito;
- débito.

### RF-MOV-004 — Relacionar linhas complementares

Quando uma movimentação ocupar mais de uma linha, o sistema deverá relacionar a linha complementar à movimentação principal.

Exemplo:

- primeira linha: transferência recebida, documento e valor;
- segunda linha: horário, identificação do remetente e CNPJ.

### RF-MOV-005 — Não depender apenas da mensagem do rodapé

O sistema não deverá concluir que o extrato está vazio apenas porque encontrou a mensagem:

> A CONTA NAO FOI MOVIMENTADA

Antes disso, deverá verificar se existem lançamentos reais no período.

### RF-MOV-006 — Identificar extrato sem movimentações

O extrato somente deverá ser classificado como sem movimentação quando nenhuma movimentação bancária relevante for encontrada na seção de lançamentos.

### RF-MOV-007 — Registrar conferência sem movimentação

Quando não houver movimentações, o sistema deverá:

- registrar a conferência da conta;
- informar que nenhuma movimentação foi encontrada;
- concluir a rotina diária daquela conta;
- não criar uma devolução.

---

## 6.5. Classificação das movimentações

### RF-CLA-001 — Identificar possível recebimento externo

O sistema deverá marcar como possível devolução movimentações que apresentem características de recebimento externo, como:

- transferência recebida;
- PIX recebido;
- depósito recebido;
- outra descrição cadastrada como recebimento externo.

### RF-CLA-002 — Ignorar movimentações internas

O sistema não deverá classificar automaticamente como devolução movimentações como:

- saldo anterior;
- saldo;
- resgate de investimento;
- aplicação automática;
- BB Rende Fácil;
- BB CDB DI;
- juros;
- IOF;
- tarifas;
- transferências internas conhecidas.

### RF-CLA-003 — Permitir atualização das classificações

Em versões posteriores, o usuário deverá poder incluir novas descrições nas listas de:

- possíveis recebimentos externos;
- movimentações internas;
- movimentações ignoradas.

### RF-CLA-004 — Exigir confirmação humana

Nenhuma movimentação deverá ser considerada devolução definitiva sem a confirmação do usuário.

### RF-CLA-005 — Permitir descarte

O usuário deverá poder marcar uma movimentação como:

- não é devolução;
- movimentação interna;
- movimentação desconhecida;
- necessita revisão.

### RF-CLA-006 — Exigir motivo do descarte

Ao descartar uma possível devolução, o sistema deverá permitir registrar uma justificativa.

---

## 6.6. Extração e validação de CNPJ

### RF-CNPJ-001 — Localizar sequências numéricas

O sistema deverá procurar possíveis CNPJs no histórico e no texto complementar da movimentação.

### RF-CNPJ-002 — Remover prefixos bancários

Quando o extrato apresentar números adicionais antes do CNPJ, o sistema deverá analisar as sequências possíveis de 14 dígitos.

Exemplo:

- texto encontrado: 00001280707000161;
- CNPJ candidato: 01280707000161.

### RF-CNPJ-003 — Normalizar CNPJ

O sistema deverá guardar o CNPJ com 14 números, sem pontuação.

Exemplo:

- 01280707000161.

### RF-CNPJ-004 — Formatar CNPJ

Na interface, o sistema deverá apresentar o CNPJ formatado.

Exemplo:

- 01.280.707/0001-61.

### RF-CNPJ-005 — Validar dígitos verificadores

O sistema deverá validar matematicamente os dígitos verificadores do CNPJ.

### RF-CNPJ-006 — Apresentar CNPJ como sugestão

Mesmo quando o CNPJ for matematicamente válido, ele deverá ser apresentado como uma sugestão até ser confirmado pelo usuário.

### RF-CNPJ-007 — Tratar CNPJ não encontrado

Caso nenhum CNPJ seja localizado, a movimentação deverá permanecer disponível para preenchimento manual.

### RF-CNPJ-008 — Tratar vários CNPJs candidatos

Caso mais de um CNPJ válido seja encontrado, o sistema deverá solicitar que o usuário selecione o correto.

### RF-CNPJ-009 — Permitir edição manual

O usuário deverá poder corrigir ou informar manualmente o CNPJ.

---

## 6.7. Confirmação da devolução

### RF-DEV-001 — Confirmar possível devolução

O usuário deverá poder confirmar que uma movimentação representa uma devolução de saldo de projeto.

### RF-DEV-002 — Criar registro da devolução

Após a confirmação, o sistema deverá criar um registro contendo:

- identificador da devolução;
- movimentação bancária relacionada;
- conta;
- data;
- valor;
- CNPJ;
- status;
- observações;
- data da confirmação.

### RF-DEV-003 — Gerar identificador

Cada devolução deverá possuir um identificador único.

Exemplo:

- DEV-2026-0001.

### RF-DEV-004 — Permitir cadastro manual

O sistema deverá permitir o cadastro manual de uma devolução quando o leitor não conseguir processar corretamente o PDF.

### RF-DEV-005 — Não obrigar projeto no primeiro registro

O sistema não deverá exigir que um projeto seja informado no momento em que a devolução for criada.

Isso é necessário porque o projeto pode ainda não estar disponível no Fluig.

---

## 6.8. Consulta no Fluig

### RF-FLUIG-001 — Exibir dados para consulta

O sistema deverá apresentar antes da consulta:

- CNPJ;
- valor devolvido;
- data da movimentação;
- conta de recebimento.

### RF-FLUIG-002 — Copiar CNPJ

O sistema deverá possuir um botão para copiar o CNPJ com 14 números, sem pontuação.

### RF-FLUIG-003 — Abrir portal Fluig

O sistema deverá possuir um botão para abrir o endereço configurado do portal Fluig.

### RF-FLUIG-004 — Registrar data da consulta

O sistema deverá registrar a data em que o usuário realizou a consulta no Fluig.

### RF-FLUIG-005 — Registrar resultado da consulta

O usuário deverá escolher um dos seguintes resultados:

- nenhum projeto encontrado;
- um projeto encontrado;
- vários projetos encontrados;
- consulta não realizada;
- consulta com erro.

### RF-FLUIG-006 — Registrar projeto candidato

Para cada projeto encontrado, deverá ser possível registrar:

- PAA;
- instituição;
- edital;
- nome do projeto;
- valor do projeto;
- etapa ou fluxo atual;
- observação.

### RF-FLUIG-007 — Permitir vários projetos candidatos

O sistema deverá permitir que uma mesma devolução possua vários projetos candidatos.

### RF-FLUIG-008 — Confirmar projeto manualmente

O sistema não deverá selecionar automaticamente o projeto correto apenas com base no CNPJ ou no valor.

O usuário deverá confirmar o projeto.

### RF-FLUIG-009 — Registrar projeto selecionado

Somente um projeto deverá ser marcado como o projeto confirmado da devolução.

### RF-FLUIG-010 — Registrar ausência de projeto

Caso nenhum projeto seja localizado, a devolução deverá receber o status:

- aguardando projeto no Fluig.

### RF-FLUIG-011 — Permitir nova consulta

Uma devolução sem projeto localizado deverá poder ser consultada novamente posteriormente.

### RF-FLUIG-012 — Manter histórico das consultas

O sistema deverá manter o histórico de:

- datas das consultas;
- resultados;
- projetos encontrados;
- observações;
- alterações realizadas.

---

## 6.9. Entidades

### RF-ENT-001 — Cadastrar entidade

O sistema deverá permitir cadastrar uma entidade contendo:

- nome;
- nome reduzido;
- CNPJ;
- tipo;
- UF;
- situação.

### RF-ENT-002 — Tipos de entidade

Inicialmente, os tipos disponíveis serão:

- APAE;
- Federação;
- outra.

### RF-ENT-003 — Relacionar entidade ao CNPJ

Após a identificação, a devolução poderá ser relacionada a uma entidade cadastrada.

### RF-ENT-004 — Evitar CNPJ duplicado

O sistema deverá alertar quando o usuário tentar cadastrar uma entidade com um CNPJ já existente.

---

## 6.10. Geração do e-mail

### RF-EMAIL-001 — Gerar assunto

Após a identificação do projeto, o sistema deverá gerar o assunto do e-mail.

Modelo inicial:

> Devolução de Saldo (PROJETO) - R$ 16.335,74

### RF-EMAIL-002 — Gerar corpo do e-mail

O sistema deverá gerar um texto contendo, quando disponíveis:

- entidade;
- UF;
- CNPJ;
- PAA;
- valor devolvido;
- data da devolução;
- conta de recebimento;
- observação.

### RF-EMAIL-003 — Permitir edição

O usuário deverá poder editar o assunto e o corpo antes de copiar ou utilizar o texto.

### RF-EMAIL-004 — Copiar conteúdo

O sistema deverá possuir botões para:

- copiar assunto;
- copiar corpo;
- copiar e-mail completo.

### RF-EMAIL-005 — Registrar preparação

O sistema deverá registrar quando o texto do e-mail for gerado.

### RF-EMAIL-006 — Registrar envio manual

Na primeira versão, o usuário deverá informar manualmente que o e-mail foi enviado.

### RF-EMAIL-007 — Registrar data de envio

Ao confirmar o envio, o sistema deverá registrar a data e a hora.

### RF-EMAIL-008 — Não enviar automaticamente na primeira versão

O Aziel não deverá enviar o e-mail automaticamente na primeira versão.

---

## 6.11. Status das devoluções

### RF-STA-001 — Controlar status

As devoluções poderão possuir os seguintes status:

- nova movimentação;
- aguardando confirmação;
- não é devolução;
- entidade não identificada;
- devolução confirmada;
- consulta no Fluig pendente;
- vários projetos encontrados;
- aguardando projeto no Fluig;
- projeto identificado;
- e-mail preparado;
- comunicado ao financeiro;
- necessita revisão;
- concluída.

### RF-STA-002 — Atualizar status conforme o fluxo

O sistema deverá atualizar o status de acordo com as ações realizadas.

### RF-STA-003 — Permitir correção controlada

O usuário deverá poder corrigir o status, mas o sistema deverá registrar a alteração no histórico.

---

## 6.12. Pendências

### RF-PEN-001 — Listar pendências

O sistema deverá possuir uma página que apresente:

- devoluções aguardando confirmação;
- devoluções sem CNPJ;
- consultas no Fluig pendentes;
- devoluções sem projeto localizado;
- vários projetos aguardando seleção;
- e-mails ainda não enviados;
- registros que necessitam revisão.

### RF-PEN-002 — Filtrar pendências

O usuário deverá poder filtrar por:

- período;
- conta;
- status;
- entidade;
- CNPJ;
- valor;
- PAA.

### RF-PEN-003 — Registrar próxima ação

Cada pendência deverá permitir registrar:

- próxima ação;
- data prevista;
- observação.

---

## 6.13. Histórico

### RF-HIS-001 — Exibir histórico de devoluções

O sistema deverá permitir consultar todas as devoluções registradas.

### RF-HIS-002 — Pesquisar registros

O histórico deverá aceitar pesquisa por:

- identificador;
- entidade;
- CNPJ;
- PAA;
- valor;
- data;
- conta;
- status.

### RF-HIS-003 — Exibir linha do tempo

Cada devolução deverá apresentar uma linha do tempo contendo:

- criação;
- confirmação;
- consultas no Fluig;
- seleção do projeto;
- geração do e-mail;
- envio ao financeiro;
- alterações relevantes.

### RF-HIS-004 — Não apagar histórico silenciosamente

Registros utilizados no processo não deverão ser excluídos sem confirmação e justificativa.

Em versões futuras, poderá ser utilizado o arquivamento em vez da exclusão definitiva.

---

## 6.14. Rotina diária das contas

### RF-ROT-001 — Controlar as duas contas

O sistema deverá controlar diariamente a conferência das contas:

- 45.140-1;
- 45.141-X.

### RF-ROT-002 — Apresentar situação por conta

Cada conta poderá apresentar:

- não conferida;
- extrato importado;
- sem movimentação;
- movimentação encontrada;
- devolução pendente;
- conferência concluída.

### RF-ROT-003 — Alertar conta não conferida

Caso apenas uma das duas contas tenha sido processada, o painel deverá indicar qual conta ainda está pendente.

### RF-ROT-004 — Registrar conclusão diária

O sistema deverá registrar a conclusão da conferência de cada conta e período.

---

# 7. Requisitos não funcionais

Os requisitos não funcionais descrevem como o sistema deverá funcionar.

## RNF-001 — Facilidade de uso

A interface deverá utilizar textos claros e evitar termos técnicos desnecessários para o usuário operacional.

## RNF-002 — Validação humana

O sistema deverá apresentar sugestões, mas decisões críticas deverão ser confirmadas pelo usuário.

## RNF-003 — Segurança dos dados

O sistema não deverá armazenar:

- senhas bancárias;
- senhas do Fluig;
- tokens;
- cookies de sessão;
- endereços bancários com códigos de sessão;
- informações que não sejam necessárias ao processo.

## RNF-004 — Minimização dos dados

O Aziel deverá guardar apenas os dados necessários para identificar e acompanhar as devoluções.

Saldos bancários e valores de investimentos não deverão ser armazenados quando não forem necessários.

## RNF-005 — Arquivos de desenvolvimento

Extratos reais não deverão ser enviados para repositórios públicos.

Os testes do projeto deverão utilizar arquivos anonimizados ou fictícios.

## RNF-006 — Compatibilidade

A primeira versão deverá funcionar nos navegadores modernos utilizados no ambiente de trabalho.

Prioridade inicial:

- Google Chrome;
- Microsoft Edge.

## RNF-007 — Responsividade

O sistema deverá funcionar principalmente em computadores, mas não deverá quebrar visualmente em telas menores.

## RNF-008 — Desempenho

O processamento de um extrato simples deverá apresentar resposta ao usuário sem travar a interface.

## RNF-009 — Mensagens de erro

Os erros deverão ser apresentados com linguagem compreensível, informando:

- o que aconteceu;
- o que o usuário pode fazer;
- se algum dado foi salvo.

## RNF-010 — Rastreabilidade

Alterações relevantes deverão registrar:

- data;
- hora;
- ação;
- registro alterado.

O responsável será incluído quando o sistema possuir autenticação.

## RNF-011 — Organização do código

O código deverá ser separado por responsabilidade e utilizar nomes descritivos.

## RNF-012 — Comentários úteis

Os comentários deverão explicar:

- regras de negócio;
- decisões técnicas;
- trechos complexos.

Os comentários não deverão apenas repetir o nome da função ou da variável.

## RNF-013 — Documentação

Cada módulo deverá possuir:

- requisitos;
- regras de negócio;
- casos de teste;
- registro das alterações.

## RNF-014 — Evolução gradual

O sistema deverá ser desenvolvido por etapas, evitando a implementação simultânea de todos os módulos.

## RNF-015 — Armazenamento inicial

Na fase de protótipo, os dados poderão ser armazenados localmente para aprendizado e testes.

Dados institucionais reais somente deverão ser utilizados após definição de:

- ambiente autorizado;
- autenticação;
- banco de dados;
- backup;
- controle de acesso.

---

# 8. Funcionalidades fora da primeira versão

As seguintes funcionalidades não fazem parte da primeira entrega:

- envio automático de e-mail;
- acesso automático à caixa de entrada;
- download automático dos extratos;
- login de vários usuários;
- banco de dados em servidor;
- integração direta com o Banco do Brasil;
- integração direta com o Fluig;
- leitura de PDF escaneado;
- reconhecimento de imagens;
- análise automática de projetos;
- análise automática de prestações de contas;
- escolha automática do projeto correto;
- leitura automática de pastas do servidor.

Essas funcionalidades poderão ser avaliadas depois que o fluxo básico estiver validado.

---

# 9. Critérios de aceitação da primeira versão do módulo

A primeira versão será considerada funcional quando conseguir:

- importar um PDF digital;
- identificar a conta 45.140-1 ou 45.141-X;
- identificar o período do extrato;
- reconhecer um extrato sem movimentações;
- reconhecer uma transferência recebida;
- relacionar a linha complementar à transferência;
- extrair o valor recebido;
- extrair e validar um possível CNPJ;
- ignorar saldos, aplicações e resgates internos;
- solicitar confirmação da devolução;
- copiar o CNPJ para pesquisa;
- registrar nenhum, um ou vários projetos;
- permitir a seleção manual do projeto;
- gerar o assunto e o corpo do e-mail;
- registrar o envio manual;
- impedir a duplicação do mesmo extrato;
- manter a devolução no histórico.

---

# 10. Casos já identificados

## Caso 1 — Extrato sem lançamentos

Resultado esperado:

- extrato processado;
- nenhuma movimentação real encontrada;
- nenhuma devolução criada;
- conta marcada como conferida.

## Caso 2 — Transferência recebida com CNPJ

Resultado esperado:

- transferência localizada;
- valor extraído;
- linha complementar relacionada;
- CNPJ sugerido;
- movimentação aguardando confirmação.

## Caso 3 — Mensagem de conta não movimentada com lançamentos anteriores

Resultado esperado:

- o sistema não deve considerar o extrato vazio apenas por causa da mensagem do rodapé;
- os lançamentos reais devem ser processados normalmente.

## Caso 4 — Um CNPJ com vários projetos no Fluig

Resultado esperado:

- todos os candidatos podem ser registrados;
- nenhum projeto é selecionado automaticamente;
- o usuário confirma o projeto correto.

## Caso 5 — Projeto ainda não disponível no Fluig

Resultado esperado:

- devolução continua aberta;
- status alterado para aguardando projeto no Fluig;
- nova consulta permitida posteriormente.

---

# 11. Pendências de levantamento

Ainda será necessário confirmar:

- formato dos extratos da conta 45.141-X;
- exemplos de movimentações via PIX;
- exemplos com várias devoluções no mesmo PDF;
- exemplos com mais de uma página;
- textos utilizados em outras modalidades de recebimento;
- endereço do portal Fluig que será configurado;
- destinatários padrão do e-mail;
- campos obrigatórios dos relatórios futuros;
- regras das planilhas utilizadas pelo ISO;
- estrutura das pastas controladas no servidor.

---

# 12. Histórico do documento

| Versão | Data | Alteração |
|---|---|---|
| 1.0 | 30/07/2026 | Criação dos requisitos iniciais do módulo de devoluções |