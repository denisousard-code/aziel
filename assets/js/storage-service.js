"use strict";

/*
 * =========================================================
 * AZIEL — SERVIÇO DE ARMAZENAMENTO LOCAL
 * =========================================================
 *
 * Responsabilidades:
 *
 * - abrir e versionar o banco IndexedDB do Aziel;
 * - salvar devoluções pendentes e concluídas;
 * - recuperar registros depois que a página for atualizada;
 * - salvar configurações não sensíveis;
 * - registrar eventos básicos de auditoria;
 * - impedir o armazenamento de PDF, senha, token e sessão;
 * - disponibilizar consultas por status, conta, CNPJ e data.
 *
 * IMPORTANTE:
 *
 * O IndexedDB mantém os dados no navegador utilizado.
 * Ele não é um banco corporativo, não sincroniza entre
 * computadores e não substitui um servidor com autenticação.
 *
 * Nesta etapa de desenvolvimento ele será usado para validar
 * a persistência do fluxo antes da criação do backend.
 */


/* =========================================================
   1. CONFIGURAÇÃO DO BANCO
   ========================================================= */

export const CONFIGURACAO_STORAGE_AZIEL = Object.freeze({
    nomeBanco: "aziel-db",

    versaoBanco: 10,

    versaoEstruturaRegistro: 1,

    stores: Object.freeze({
        devolucoes: "devolucoes",
        configuracoes: "configuracoes",
        auditoria: "auditoria",
        entidades: "entidades",
        relatorios: "relatorios",
        presidentesUf: "presidentesUf",
        demandas: "demandas",
        rotinas: "rotinas",
        basesDadosImportadas: "basesDadosImportadas",
        historicoPrestacaoContas: "historicoPrestacaoContas",
        modelosDocumentos: "modelosDocumentos",
        acompanhamentoSaldo: "acompanhamentoSaldo"
    })
});


/*
 * Guarda a promessa da conexão.
 *
 * Assim, várias funções podem utilizar a mesma conexão
 * sem abrir o banco novamente a cada operação.
 */
let promessaConexaoBanco = null;


/* =========================================================
   2. STATUS PADRONIZADOS DA PERSISTÊNCIA
   ========================================================= */

export const STATUS_PROCESSO_STORAGE = Object.freeze({
    AGUARDANDO_CONFIRMACAO:
        "aguardando_confirmacao",

    AGUARDANDO_FLUIG:
        "aguardando_consulta_fluig",

    AGUARDANDO_PROJETO:
        "aguardando_projeto_fluig",

    AGUARDANDO_COMUNICACAO:
        "aguardando_comunicacao_financeiro",

    CONCLUIDA:
        "concluida",

    DESCARTADA:
        "descartada",

    DESCONHECIDA:
        "situacao_desconhecida"
});


/* =========================================================
   3. TIPOS DE EVENTO DE AUDITORIA
   ========================================================= */

export const TIPOS_EVENTO_AUDITORIA = Object.freeze({
    DEVOLUCAO_SALVA:
        "devolucao_salva",

    DEVOLUCAO_ATUALIZADA:
        "devolucao_atualizada",

    DEVOLUCAO_EXCLUIDA:
        "devolucao_excluida",

    CONFIGURACAO_SALVA:
        "configuracao_salva",

    CONFIGURACAO_REMOVIDA:
        "configuracao_removida",

    BANCO_LIMPO:
        "banco_limpo"
});


/* =========================================================
   4. ERRO PERSONALIZADO
   ========================================================= */

export class ErroArmazenamentoAziel extends Error {
    constructor(
        mensagem,
        codigo = "ERRO_ARMAZENAMENTO_AZIEL",
        causa = null
    ) {
        super(mensagem);

        this.name = "ErroArmazenamentoAziel";
        this.codigo = codigo;
        this.causa = causa;
    }
}


/* =========================================================
   5. ABERTURA DO BANCO
   ========================================================= */

/*
 * Abre o IndexedDB e cria as estruturas na primeira execução.
 */
export async function abrirBancoAziel() {
    garantirSuporteIndexedDB();

    if (promessaConexaoBanco) {
        return promessaConexaoBanco;
    }

    /*
     * Pede ao navegador pra tratar esse armazenamento como
     * "persistente" (menos sujeito a ser descartado sob pressão
     * de espaço) — sempre que o banco é aberto pela primeira vez
     * na sessão, não importa qual página fez essa abertura.
     * Antes, esse pedido só acontecia se o usuário passasse pela
     * página de Devoluções primeiro; se ele abrisse o Aziel
     * direto em outra página (ex: Banco de Dados), o navegador
     * nunca era avisado — e dados grandes como os modelos .docx
     * ficavam mais vulneráveis a serem descartados sozinhos.
     */
    solicitarPersistenciaDoStorage().catch(function (erro) {
        console.error(
            "Não foi possível solicitar armazenamento persistente:",
            erro
        );
    });

    promessaConexaoBanco = new Promise(
        function (resolve, reject) {
            const requisicao = indexedDB.open(
                CONFIGURACAO_STORAGE_AZIEL.nomeBanco,
                CONFIGURACAO_STORAGE_AZIEL.versaoBanco
            );

            requisicao.onupgradeneeded = function (evento) {
                const banco = evento.target.result;

                criarEstruturaBanco(
                    banco,
                    evento.oldVersion,
                    evento.newVersion
                );
            };

            requisicao.onsuccess = function () {
                const banco = requisicao.result;

                /*
                 * Quando outra aba atualizar a versão do banco,
                 * esta conexão será encerrada para evitar bloqueio.
                 */
                banco.onversionchange = function () {
                    banco.close();
                    promessaConexaoBanco = null;
                };

                resolve(banco);
            };

            requisicao.onerror = function () {
                promessaConexaoBanco = null;

                reject(
                    new ErroArmazenamentoAziel(
                        "Não foi possível abrir o banco local do Aziel.",
                        "FALHA_ABERTURA_INDEXEDDB",
                        requisicao.error
                    )
                );
            };

            requisicao.onblocked = function () {
                promessaConexaoBanco = null;

                reject(
                    new ErroArmazenamentoAziel(
                        "A atualização do banco foi bloqueada por outra aba do Aziel. Feche as outras abas e tente novamente.",
                        "BANCO_INDEXEDDB_BLOQUEADO"
                    )
                );
            };
        }
    );

    return promessaConexaoBanco;
}


/*
 * Fecha manualmente a conexão atual.
 */
export async function fecharBancoAziel() {
    if (!promessaConexaoBanco) {
        return;
    }

    try {
        const banco = await promessaConexaoBanco;

        banco.close();
    } finally {
        promessaConexaoBanco = null;
    }
}


/*
 * Confirma se o navegador oferece suporte ao IndexedDB.
 */
function garantirSuporteIndexedDB() {
    if (!globalThis.indexedDB) {
        throw new ErroArmazenamentoAziel(
            "Este navegador não oferece suporte ao armazenamento IndexedDB.",
            "INDEXEDDB_NAO_SUPORTADO"
        );
    }
}


/* =========================================================
   6. CRIAÇÃO E VERSIONAMENTO DAS STORES
   ========================================================= */

function criarEstruturaBanco(
    banco,
    versaoAnterior,
    novaVersao
) {
    /*
     * A versão 1 cria a estrutura inicial.
     */
    if (versaoAnterior < 1) {
        criarStoreDevolucoes(banco);
        criarStoreConfiguracoes(banco);
        criarStoreAuditoria(banco);
    }

    /*
     * A versão 2 adiciona a base de consulta de entidades
     * (APAEs e Federações), usada para identificar quem enviou
     * uma transferência a partir do CNPJ ou dos dados bancários.
     */
    if (versaoAnterior < 2) {
        criarStoreEntidades(banco);
    }

    /*
     * A versão 3 adiciona o registro de relatórios (Diretoria/
     * Gestores, MDM8 e Outros) — por enquanto só a estrutura
     * organizacional, sem geração automática ainda.
     */
    if (versaoAnterior < 3) {
        criarStoreRelatorios(banco);
    }

    /*
     * A versão 4 adiciona a lista de presidentes das Federações
     * por UF (do Conselho de Administração), usada para sugerir
     * o destinatário nos ofícios de prestação de contas. É
     * atualizada reimportando a planilha a cada mudança de
     * mandato (normalmente a cada 3 anos).
     */
    if (versaoAnterior < 4) {
        criarStorePresidentesUf(banco);
    }

    /*
     * A versão 5 adiciona o quadro de Demandas (controle pessoal
     * de tarefas, estilo Kanban).
     */
    if (versaoAnterior < 5) {
        criarStoreDemandas(banco);
    }

    /*
     * A versão 6 adiciona as Rotinas (atividades diárias,
     * semanais, mensais ou eventuais que se repetem e resetam
     * sozinhas a cada novo período).
     */
    if (versaoAnterior < 6) {
        criarStoreRotinas(banco);
    }

    /*
     * A versão 7 adiciona o Banco de Dados — os relatórios
     * "mestre" (Relatório de Pagamentos de Projetos, Relatório
     * MDM8, Relatório de Projetos, Controle de Projetos) ficam
     * salvos aqui, importados uma vez, em vez de precisar subir
     * de novo em cada ferramenta.
     */
    if (versaoAnterior < 7) {
        criarStoreBasesDadosImportadas(banco);
    }

    /*
     * A versão 8 adiciona o Histórico da Prestação de Contas —
     * uma marcação por mês/ano (enviado ou não), pra ver o ano
     * inteiro de uma vez.
     */
    if (versaoAnterior < 8) {
        criarStoreHistoricoPrestacaoContas(banco);
    }

    /*
     * A versão 9 adiciona os Modelos de Documentos (os .docx dos
     * ofícios e do edital) — ficam salvos só no navegador, nunca
     * publicados junto com o código do Aziel, já que têm
     * timbre/assinaturas reais.
     */
    if (versaoAnterior < 9) {
        criarStoreModelosDocumentos(banco);
    }

    /*
     * A versão 10 adiciona o Acompanhamento de Saldo — um
     * retrato por dia dos saldos de todas as Feapaes, pra
     * comparar com o dia anterior e ver a diferença.
     */
    if (versaoAnterior < 10) {
        criarStoreAcompanhamentoSaldo(banco);
    }

    console.info(
        `Banco do Aziel atualizado da versão ${versaoAnterior} para ${novaVersao}.`
    );
}


function criarStoreDevolucoes(banco) {
    const nomeStore = (
        CONFIGURACAO_STORAGE_AZIEL
            .stores
            .devolucoes
    );

    if (banco.objectStoreNames.contains(nomeStore)) {
        return;
    }

    const store = banco.createObjectStore(
        nomeStore,
        {
            keyPath: "idPersistencia"
        }
    );

    store.createIndex(
        "codigoDevolucao",
        "codigoDevolucao",
        {
            unique: false
        }
    );

    store.createIndex(
        "statusProcesso",
        "statusProcesso",
        {
            unique: false
        }
    );

    store.createIndex(
        "situacaoOperacional",
        "situacaoOperacional",
        {
            unique: false
        }
    );

    store.createIndex(
        "conta",
        "conta",
        {
            unique: false
        }
    );

    store.createIndex(
        "cnpj",
        "cnpj",
        {
            unique: false
        }
    );

    store.createIndex(
        "dataMovimentacao",
        "dataMovimentacao",
        {
            unique: false
        }
    );

    store.createIndex(
        "atualizadoEm",
        "atualizadoEm",
        {
            unique: false
        }
    );
}


function criarStoreConfiguracoes(banco) {
    const nomeStore = (
        CONFIGURACAO_STORAGE_AZIEL
            .stores
            .configuracoes
    );

    if (banco.objectStoreNames.contains(nomeStore)) {
        return;
    }

    banco.createObjectStore(
        nomeStore,
        {
            keyPath: "chave"
        }
    );
}


function criarStoreAuditoria(banco) {
    const nomeStore = (
        CONFIGURACAO_STORAGE_AZIEL
            .stores
            .auditoria
    );

    if (banco.objectStoreNames.contains(nomeStore)) {
        return;
    }

    const store = banco.createObjectStore(
        nomeStore,
        {
            keyPath: "id",
            autoIncrement: true
        }
    );

    store.createIndex(
        "tipo",
        "tipo",
        {
            unique: false
        }
    );

    store.createIndex(
        "referenciaId",
        "referenciaId",
        {
            unique: false
        }
    );

    store.createIndex(
        "criadoEm",
        "criadoEm",
        {
            unique: false
        }
    );
}


/*
 * Base de consulta de entidades (APAEs e Federações).
 *
 * A chave é o próprio CNPJ (14 dígitos, sem pontuação), já que
 * ele é o identificador natural e único de cada entidade.
 *
 * Contas bancárias ficam guardadas dentro de um array na própria
 * entidade, e não em um índice separado, porque uma entidade pode
 * ter mais de uma conta e o volume de registros é pequeno o
 * suficiente para varrer a lista inteira ao buscar por dados
 * bancários (ver buscarEntidadePorDadosBancarios em
 * entity-service.js).
 */
function criarStoreEntidades(banco) {
    const nomeStore = (
        CONFIGURACAO_STORAGE_AZIEL
            .stores
            .entidades
    );

    if (banco.objectStoreNames.contains(nomeStore)) {
        return;
    }

    const store = banco.createObjectStore(
        nomeStore,
        {
            keyPath: "cnpj"
        }
    );

    store.createIndex(
        "nomeReduzido",
        "nomeReduzido",
        {
            unique: false
        }
    );

    store.createIndex(
        "tipo",
        "tipo",
        {
            unique: false
        }
    );

    store.createIndex(
        "uf",
        "uf",
        {
            unique: false
        }
    );
}


/*
 * Registro de relatórios (Diretoria/Gestores, MDM8 e Outros).
 *
 * Por enquanto guarda só os dados organizacionais de cada
 * relatório (categoria, nome, descrição, status) — a geração
 * automática de cada um vai sendo conectada aqui um a um,
 * conforme cada relatório for definido com o usuário.
 */
function criarStoreRelatorios(banco) {
    const nomeStore = (
        CONFIGURACAO_STORAGE_AZIEL
            .stores
            .relatorios
    );

    if (banco.objectStoreNames.contains(nomeStore)) {
        return;
    }

    const store = banco.createObjectStore(
        nomeStore,
        {
            keyPath: "id"
        }
    );

    store.createIndex(
        "categoria",
        "categoria",
        {
            unique: false
        }
    );

    store.createIndex(
        "atualizadoEm",
        "atualizadoEm",
        {
            unique: false
        }
    );
}


/*
 * Presidentes das Federações por UF (Conselho de Administração).
 * A chave é a própria UF, então reimportar a planilha atualiza
 * o registro em vez de duplicar — é assim que a lista é mantida
 * a cada mudança de mandato.
 */
function criarStorePresidentesUf(banco) {
    const nomeStore = (
        CONFIGURACAO_STORAGE_AZIEL
            .stores
            .presidentesUf
    );

    if (banco.objectStoreNames.contains(nomeStore)) {
        return;
    }

    banco.createObjectStore(
        nomeStore,
        {
            keyPath: "uf"
        }
    );
}


function criarStoreDemandas(banco) {
    const nomeStore = (
        CONFIGURACAO_STORAGE_AZIEL
            .stores
            .demandas
    );

    if (banco.objectStoreNames.contains(nomeStore)) {
        return;
    }

    const store = banco.createObjectStore(
        nomeStore,
        {
            keyPath: "id"
        }
    );

    store.createIndex(
        "status",
        "status",
        {
            unique: false
        }
    );

    store.createIndex(
        "atualizadoEm",
        "atualizadoEm",
        {
            unique: false
        }
    );
}


function criarStoreRotinas(banco) {
    const nomeStore = (
        CONFIGURACAO_STORAGE_AZIEL
            .stores
            .rotinas
    );

    if (banco.objectStoreNames.contains(nomeStore)) {
        return;
    }

    banco.createObjectStore(
        nomeStore,
        {
            keyPath: "id"
        }
    );
}


/*
 * Guarda um registro por TIPO de relatório mestre (ex:
 * "pagamentos_projetos", "relatorio_mdm8") — cada importação
 * substitui o registro anterior daquele tipo inteiro, já que
 * cada arquivo é um retrato mais atual do Fluig, não um
 * incremento.
 */
function criarStoreBasesDadosImportadas(banco) {
    const nomeStore = (
        CONFIGURACAO_STORAGE_AZIEL
            .stores
            .basesDadosImportadas
    );

    if (banco.objectStoreNames.contains(nomeStore)) {
        return;
    }

    banco.createObjectStore(
        nomeStore,
        {
            keyPath: "tipo"
        }
    );
}


/*
 * Uma marcação por mês/ano (chave "AAAA-MM") indicando se os
 * ofícios de prestação de contas daquele mês foram enviados.
 */
function criarStoreHistoricoPrestacaoContas(banco) {
    const nomeStore = (
        CONFIGURACAO_STORAGE_AZIEL
            .stores
            .historicoPrestacaoContas
    );

    if (banco.objectStoreNames.contains(nomeStore)) {
        return;
    }

    banco.createObjectStore(
        nomeStore,
        {
            keyPath: "chave"
        }
    );
}


/*
 * Guarda o arquivo .docx de cada modelo (Ofício de Prestação de
 * Contas, Ofício de Liberação de Recursos, Edital do Acre) como
 * Blob — só no navegador, nunca vai junto com o código publicado.
 */
function criarStoreModelosDocumentos(banco) {
    const nomeStore = (
        CONFIGURACAO_STORAGE_AZIEL
            .stores
            .modelosDocumentos
    );

    if (banco.objectStoreNames.contains(nomeStore)) {
        return;
    }

    banco.createObjectStore(
        nomeStore,
        {
            keyPath: "nome"
        }
    );
}


/*
 * Um retrato por dia (chave "AAAA-MM-DD") com o saldo de cada
 * Feapaes/entidade naquele dia — pra comparar dia a dia.
 */
function criarStoreAcompanhamentoSaldo(banco) {
    const nomeStore = (
        CONFIGURACAO_STORAGE_AZIEL
            .stores
            .acompanhamentoSaldo
    );

    if (banco.objectStoreNames.contains(nomeStore)) {
        return;
    }

    banco.createObjectStore(
        nomeStore,
        {
            keyPath: "data"
        }
    );
}


/* =========================================================
   7. DIAGNÓSTICO DO ARMAZENAMENTO
   ========================================================= */

/*
 * Retorna informações sobre a disponibilidade do storage.
 */
export async function verificarArmazenamentoAziel() {
    garantirSuporteIndexedDB();

    const resultado = {
        indexedDBDisponivel: true,
        armazenamentoPersistente: false,
        espacoUtilizado: null,
        espacoDisponivel: null
    };

    if (
        navigator.storage
        && typeof navigator.storage.persisted === "function"
    ) {
        resultado.armazenamentoPersistente = (
            await navigator.storage.persisted()
        );
    }

    if (
        navigator.storage
        && typeof navigator.storage.estimate === "function"
    ) {
        const estimativa = await navigator.storage.estimate();

        resultado.espacoUtilizado = (
            estimativa.usage ?? null
        );

        resultado.espacoDisponivel = (
            estimativa.quota ?? null
        );
    }

    return resultado;
}


/*
 * Solicita ao navegador que evite remover os dados locais
 * automaticamente em situações de pouco espaço.
 *
 * O navegador pode aceitar ou recusar a solicitação.
 */
export async function solicitarPersistenciaDoStorage() {
    if (
        !navigator.storage
        || typeof navigator.storage.persist !== "function"
    ) {
        return false;
    }

    return navigator.storage.persist();
}


/* =========================================================
   8. SALVAMENTO DE UMA DEVOLUÇÃO
   ========================================================= */

/*
 * Salva uma devolução ou atualiza um registro existente.
 *
 * contexto pode conter:
 *
 * {
 *     conta: "45.140-1",
 *     agencia: "452-9",
 *     periodo: {...}
 * }
 */
export async function salvarDevolucao(
    devolucao,
    contexto = {}
) {
    validarObjetoDevolucao(
        devolucao
    );

    const banco = await abrirBancoAziel();

    const impressaoDigital = criarImpressaoDigitalDevolucao(
        devolucao,
        contexto
    );

    let idPersistencia = resolverIdPersistencia(
        devolucao,
        impressaoDigital
    );

    let registroExistente = await buscarDevolucaoPorId(
        idPersistencia
    );

    /*
     * Proteção contra uma possível colisão de hash.
     *
     * Caso dois registros diferentes recebam acidentalmente
     * o mesmo ID, será gerado um identificador aleatório.
     */
    if (
        registroExistente
        && registroExistente.impressaoDigital
        && registroExistente.impressaoDigital
        !== impressaoDigital
    ) {
        idPersistencia = gerarIdAleatorio(
            "DEV-STORAGE"
        );

        registroExistente = null;
    }

    const registro = normalizarDevolucaoParaStorage({
        devolucao,
        contexto,
        idPersistencia,
        impressaoDigital,
        registroExistente
    });

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.devolucoes,
        "readwrite"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.devolucoes
    );

    const requisicao = store.put(
        registro
    );

    await Promise.all([
        converterRequisicaoEmPromessa(
            requisicao
        ),

        aguardarConclusaoTransacao(
            transacao
        )
    ]);

    /*
     * O ID é devolvido para que o app.js possa mantê-lo
     * dentro da movimentação em memória.
     */
    const tipoEvento = registroExistente
        ? TIPOS_EVENTO_AUDITORIA.DEVOLUCAO_ATUALIZADA
        : TIPOS_EVENTO_AUDITORIA.DEVOLUCAO_SALVA;

    await registrarEventoAuditoria({
        tipo: tipoEvento,

        referenciaId:
            registro.idPersistencia,

        descricao:
            registroExistente
                ? "Registro de devolução atualizado."
                : "Registro de devolução criado.",

        detalhes: {
            codigoDevolucao:
                registro.codigoDevolucao,

            statusProcesso:
                registro.statusProcesso
        }
    });

    return clonarRegistro(
        registro
    );
}


/* =========================================================
   9. SALVAMENTO EM LOTE
   ========================================================= */

/*
 * Salva várias devoluções sequencialmente.
 *
 * Retorna os registros normalizados, incluindo
 * seus respectivos IDs de persistência.
 */
export async function salvarDevolucoes(
    devolucoes,
    contexto = {}
) {
    if (!Array.isArray(devolucoes)) {
        throw new ErroArmazenamentoAziel(
            "A lista de devoluções informada é inválida.",
            "LISTA_DEVOLUCOES_INVALIDA"
        );
    }

    const registrosSalvos = [];

    for (const devolucao of devolucoes) {
        const registro = await salvarDevolucao(
            devolucao,
            contexto
        );

        registrosSalvos.push(
            registro
        );
    }

    return registrosSalvos;
}


/* =========================================================
   10. NORMALIZAÇÃO DA DEVOLUÇÃO
   ========================================================= */

function normalizarDevolucaoParaStorage({
    devolucao,
    contexto,
    idPersistencia,
    impressaoDigital,
    registroExistente
}) {
    const agora = new Date().toISOString();

    const conta = normalizarTexto(
        contexto.conta
        || devolucao.conta
    );

    const agencia = normalizarTexto(
        contexto.agencia
        || devolucao.agencia
    );

    const periodo = normalizarPeriodo(
        contexto.periodo
        || devolucao.periodo
    );

    const consultaFluig = normalizarConsultaFluig(
        devolucao.consultaFluig
    );

    const projetoConfirmado = normalizarProjeto(
        devolucao.projetoConfirmado
        || localizarProjetoConfirmado(
            consultaFluig
        )
    );

    const mensagemFinanceiro = normalizarMensagemFinanceiro(
        devolucao.mensagemFinanceiro
    );

    const registroComunicacao = normalizarRegistroComunicacao(
        devolucao.registroComunicacao
    );

    const statusProcesso = determinarStatusProcesso(
        devolucao
    );

    return {
        versaoEstrutura:
            CONFIGURACAO_STORAGE_AZIEL
                .versaoEstruturaRegistro,

        idPersistencia,

        impressaoDigital,

        idTemporario:
            normalizarTexto(
                devolucao.idTemporario
            ),

        codigoDevolucao:
            normalizarTexto(
                devolucao.codigoDevolucao
            ),

        conta,

        agencia,

        periodo,

        dataMovimentacao:
            normalizarDataIso(
                devolucao.dataMovimento
                || devolucao.dataMovimentacao
            ),

        hora:
            normalizarTexto(
                devolucao.hora
            ),

        historico:
            normalizarTexto(
                devolucao.historico
            ),

        documento:
            normalizarTexto(
                devolucao.documento
            ),

        valor:
            normalizarNumero(
                devolucao.valor
            ),

        valorFormatado:
            normalizarTexto(
                devolucao.valorFormatado
            ),

        natureza:
            normalizarTexto(
                devolucao.natureza
            ),

        cnpj:
            normalizarCnpj(
                devolucao.cnpj
            ),

        cnpjFormatado:
            normalizarTexto(
                devolucao.cnpjFormatado
            ),

        identificacaoOrigem:
            normalizarTexto(
                devolucao.identificacaoOrigem
            ),

        classificacao:
            normalizarTexto(
                devolucao.classificacao
            ),

        classificacaoOriginal:
            normalizarTexto(
                devolucao.classificacaoOriginal
            ),

        situacaoOperacional:
            normalizarTexto(
                devolucao.situacaoOperacional
            ),

        statusProcesso,

        statusFluig:
            normalizarTexto(
                devolucao.statusFluig
            ),

        statusComunicacao:
            normalizarTexto(
                devolucao.statusComunicacao
            ),

        observacao:
            normalizarTexto(
                devolucao.observacao
            ),

        motivoDescarte:
            normalizarTexto(
                devolucao.motivoDescarte
            ),

        justificativaDescarte:
            normalizarTexto(
                devolucao.justificativaDescarte
            ),

        consultaFluig,

        projetoConfirmado,

        mensagemFinanceiro,

        registroComunicacao,

        /*
         * Entidade (APAE/Federação) identificada automaticamente
         * pela base de consulta (entity-service.js), a partir do
         * CNPJ do extrato. Guardamos só o essencial — não o
         * registro inteiro da entidade — porque a base de
         * entidades pode mudar (nome corrigido, etc.) e queremos
         * que a devolução reflita o que era verdade no momento em
         * que foi identificada.
         */
        entidadeIdentificada:
            normalizarEntidadeIdentificada(
                devolucao.entidadeIdentificada
            ),

        /*
         * Comprovante da devolução (PDF do banco, print, etc.),
         * anexado manualmente pelo usuário depois da conclusão.
         * Fica gravado como Blob — o IndexedDB armazena isso de
         * forma nativa e eficiente, sem precisar converter para
         * texto (base64), o que só infla o tamanho em ~33%.
         */
        comprovante:
            normalizarComprovante(
                devolucao.comprovante
                || registroExistente?.comprovante
            ),

        dataConfirmacao:
            normalizarDataHoraIso(
                devolucao.dataConfirmacao
            ),

        dataUltimaConsultaFluig:
            normalizarDataHoraIso(
                devolucao.dataUltimaConsultaFluig
            ),

        dataDescarte:
            normalizarDataHoraIso(
                devolucao.dataDescarte
            ),

        dataConclusao:
            normalizarDataHoraIso(
                devolucao.dataConclusao
            ),

        criadoEm:
            registroExistente?.criadoEm
            || agora,

        atualizadoEm:
            agora
    };
}


/* =========================================================
   11. STATUS DO PROCESSO
   ========================================================= */

function determinarStatusProcesso(
    devolucao
) {
    const situacao = String(
        devolucao.situacaoOperacional || ""
    ).trim();

    const statusFluig = String(
        devolucao.statusFluig || ""
    ).trim();

    const statusComunicacao = String(
        devolucao.statusComunicacao || ""
    ).trim();

    if (
        situacao === "concluida"
        || statusComunicacao === "comunicacao_enviada"
    ) {
        return STATUS_PROCESSO_STORAGE.CONCLUIDA;
    }

    if (
        situacao === "descartada"
        || devolucao.classificacao
        === "movimentacao_descartada"
    ) {
        return STATUS_PROCESSO_STORAGE.DESCARTADA;
    }

    if (
        statusFluig === "projeto_identificado"
    ) {
        return (
            STATUS_PROCESSO_STORAGE
                .AGUARDANDO_COMUNICACAO
        );
    }

    if (
        statusFluig
        === "aguardando_projeto_no_fluig"
    ) {
        return (
            STATUS_PROCESSO_STORAGE
                .AGUARDANDO_PROJETO
        );
    }

    if (
        situacao === "confirmada"
        || statusFluig === "consulta_fluig_pendente"
    ) {
        return (
            STATUS_PROCESSO_STORAGE
                .AGUARDANDO_FLUIG
        );
    }

    if (
        devolucao.classificacao
        === "alta_possibilidade_devolucao"

        || devolucao.classificacao
        === "possivel_devolucao"

        || devolucao.classificacao
        === "possivel_devolucao_sem_cnpj"
    ) {
        return (
            STATUS_PROCESSO_STORAGE
                .AGUARDANDO_CONFIRMACAO
        );
    }

    return STATUS_PROCESSO_STORAGE.DESCONHECIDA;
}


/* =========================================================
   12. NORMALIZAÇÃO DO FLUIG
   ========================================================= */

function normalizarConsultaFluig(
    consulta
) {
    if (
        !consulta
        || typeof consulta !== "object"
    ) {
        return null;
    }

    const projetos = Array.isArray(
        consulta.projetos
    )
        ? consulta.projetos
            .map(normalizarProjeto)
            .filter(Boolean)
        : [];

    return {
        idConsulta:
            normalizarTexto(
                consulta.idConsulta
            ),

        devolucaoId:
            normalizarTexto(
                consulta.devolucaoId
            ),

        dataConsulta:
            normalizarDataHoraIso(
                consulta.dataConsulta
            ),

        resultado:
            normalizarTexto(
                consulta.resultado
            ),

        statusFluig:
            normalizarTexto(
                consulta.statusFluig
            ),

        projetoConfirmadoId:
            normalizarTexto(
                consulta.projetoConfirmadoId
            ),

        observacao:
            normalizarTexto(
                consulta.observacao
            ),

        mensagemErro:
            normalizarTexto(
                consulta.mensagemErro
            ),

        dataConfirmacaoProjeto:
            normalizarDataHoraIso(
                consulta.dataConfirmacaoProjeto
            ),

        projetos
    };
}


/*
 * Guarda só o essencial da entidade identificada — nome
 * reduzido, UF e CNPJ — o suficiente para reexibir no histórico
 * sem depender de uma nova consulta à base de entidades.
 */
function normalizarEntidadeIdentificada(
    entidade
) {
    if (
        !entidade
        || typeof entidade !== "object"
    ) {
        return null;
    }

    return {
        nomeReduzido:
            normalizarTexto(
                entidade.nomeReduzido
            ),

        uf:
            normalizarTexto(
                entidade.uf
            ),

        cnpj:
            normalizarCnpj(
                entidade.cnpj
            )
    };
}


/*
 * Normaliza o comprovante da devolução (arquivo anexado
 * manualmente pelo usuário). O conteúdo é mantido como Blob,
 * já que o IndexedDB armazena isso nativamente.
 */
function normalizarComprovante(
    comprovante
) {
    if (
        !comprovante
        || typeof comprovante !== "object"
        || !(comprovante.conteudo instanceof Blob)
    ) {
        return null;
    }

    return {
        nomeArquivo:
            normalizarTexto(
                comprovante.nomeArquivo
            )
            || "comprovante",

        tipoArquivo:
            normalizarTexto(
                comprovante.tipoArquivo
            )
            || comprovante.conteudo.type
            || "application/octet-stream",

        tamanho:
            comprovante.conteudo.size,

        dataAnexo:
            normalizarDataHoraIso(
                comprovante.dataAnexo
            )
            || new Date().toISOString(),

        conteudo:
            comprovante.conteudo
    };
}


function normalizarProjeto(
    projeto
) {
    if (
        !projeto
        || typeof projeto !== "object"
    ) {
        return null;
    }

    return {
        idCandidato:
            normalizarTexto(
                projeto.idCandidato
            ),

        idProjeto:
            normalizarTexto(
                projeto.idProjeto
            ),

        paa:
            normalizarTexto(
                projeto.paa
            ),

        nomeProjeto:
            normalizarTexto(
                projeto.nomeProjeto
            ),

        instituicao:
            normalizarTexto(
                projeto.instituicao
            ),

        edital:
            normalizarTexto(
                projeto.edital
            ),

        valor:
            normalizarNumero(
                projeto.valor
            ),

        valorFormatado:
            normalizarTexto(
                projeto.valorFormatado
            ),

        etapaAtual:
            normalizarTexto(
                projeto.etapaAtual
            ),

        situacao:
            normalizarTexto(
                projeto.situacao
            ),

        observacao:
            normalizarTexto(
                projeto.observacao
            ),

        confirmado:
            projeto.confirmado === true
    };
}


function localizarProjetoConfirmado(
    consulta
) {
    if (
        !consulta
        || !Array.isArray(consulta.projetos)
    ) {
        return null;
    }

    return (
        consulta.projetos.find(
            function (projeto) {
                return projeto.confirmado === true;
            }
        )
        || null
    );
}


/* =========================================================
   13. NORMALIZAÇÃO DA COMUNICAÇÃO
   ========================================================= */

function normalizarMensagemFinanceiro(
    mensagem
) {
    if (
        !mensagem
        || typeof mensagem !== "object"
    ) {
        return null;
    }

    return {
        idMensagem:
            normalizarTexto(
                mensagem.idMensagem
            ),

        codigoDevolucao:
            normalizarTexto(
                mensagem.codigoDevolucao
            ),

        destinatarios:
            normalizarListaTextos(
                mensagem.destinatarios
            ),

        destinatariosCopia:
            normalizarListaTextos(
                mensagem.destinatariosCopia
            ),

        assunto:
            normalizarTexto(
                mensagem.assunto
            ),

        /*
         * O corpo é mantido para permitir retomar uma
         * comunicação preparada e ainda não enviada.
         */
        corpo:
            normalizarTexto(
                mensagem.corpo
            ),

        status:
            normalizarTexto(
                mensagem.status
            ),

        dataPreparacao:
            normalizarDataHoraIso(
                mensagem.dataPreparacao
            )
    };
}


function normalizarRegistroComunicacao(
    registro
) {
    if (
        !registro
        || typeof registro !== "object"
    ) {
        return null;
    }

    return {
        idComunicacao:
            normalizarTexto(
                registro.idComunicacao
            ),

        codigoDevolucao:
            normalizarTexto(
                registro.codigoDevolucao
            ),

        idMensagem:
            normalizarTexto(
                registro.idMensagem
            ),

        canal:
            normalizarTexto(
                registro.canal
            ),

        destinatarios:
            normalizarListaTextos(
                registro.destinatarios
            ),

        destinatariosCopia:
            normalizarListaTextos(
                registro.destinatariosCopia
            ),

        assunto:
            normalizarTexto(
                registro.assunto
            ),

        corpo:
            normalizarTexto(
                registro.corpo
            ),

        status:
            normalizarTexto(
                registro.status
            ),

        observacao:
            normalizarTexto(
                registro.observacao
            ),

        observacaoEnvio:
            normalizarTexto(
                registro.observacaoEnvio
            ),

        dataPreparacao:
            normalizarDataHoraIso(
                registro.dataPreparacao
            ),

        dataEnvio:
            normalizarDataHoraIso(
                registro.dataEnvio
            )
    };
}


/* =========================================================
   14. BUSCA POR IDENTIFICADOR
   ========================================================= */

export async function buscarDevolucaoPorId(
    idPersistencia
) {
    const idNormalizado = normalizarTexto(
        idPersistencia
    );

    if (!idNormalizado) {
        return null;
    }

    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.devolucoes,
        "readonly"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.devolucoes
    );

    const requisicao = store.get(
        idNormalizado
    );

    const resultado = await converterRequisicaoEmPromessa(
        requisicao
    );

    await aguardarConclusaoTransacao(
        transacao
    );

    return resultado
        ? clonarRegistro(resultado)
        : null;
}


/*
 * Busca pelo código DEV-AAAA-NNNN.
 */
export async function buscarDevolucaoPorCodigo(
    codigoDevolucao
) {
    const codigo = normalizarTexto(
        codigoDevolucao
    );

    if (!codigo) {
        return null;
    }

    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.devolucoes,
        "readonly"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.devolucoes
    );

    const indice = store.index(
        "codigoDevolucao"
    );

    const requisicao = indice.get(
        codigo
    );

    const resultado = await converterRequisicaoEmPromessa(
        requisicao
    );

    await aguardarConclusaoTransacao(
        transacao
    );

    return resultado
        ? clonarRegistro(resultado)
        : null;
}


/* =========================================================
   15. LISTAGEM DAS DEVOLUÇÕES
   ========================================================= */

/*
 * Filtros disponíveis:
 *
 * {
 *     statusProcesso,
 *     conta,
 *     cnpj,
 *     dataInicio,
 *     dataFim,
 *     termo,
 *     ordem: "asc" | "desc",
 *     limite
 * }
 */
export async function listarDevolucoes(
    filtros = {}
) {
    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.devolucoes,
        "readonly"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.devolucoes
    );

    const requisicao = store.getAll();

    const registros = await converterRequisicaoEmPromessa(
        requisicao
    );

    await aguardarConclusaoTransacao(
        transacao
    );

    return aplicarFiltrosDevolucoes(
        registros,
        filtros
    ).map(
        clonarRegistro
    );
}


/*
 * Retorna somente registros ainda pendentes.
 */
export async function listarDevolucoesPendentes(
    filtros = {}
) {
    const statusPendentes = new Set([
        STATUS_PROCESSO_STORAGE.AGUARDANDO_CONFIRMACAO,
        STATUS_PROCESSO_STORAGE.AGUARDANDO_FLUIG,
        STATUS_PROCESSO_STORAGE.AGUARDANDO_PROJETO,
        STATUS_PROCESSO_STORAGE.AGUARDANDO_COMUNICACAO
    ]);

    const registros = await listarDevolucoes({
        ...filtros,
        statusProcesso: null
    });

    return registros.filter(
        function (registro) {
            return statusPendentes.has(
                registro.statusProcesso
            );
        }
    );
}


/*
 * Retorna devoluções concluídas.
 */
export async function listarDevolucoesConcluidas({
    limite = 50,
    ordem = "desc"
} = {}) {
    return listarDevolucoes({
        statusProcesso:
            STATUS_PROCESSO_STORAGE.CONCLUIDA,

        limite,
        ordem
    });
}


/*
 * Conta os registros agrupados por status.
 */
export async function contarDevolucoesPorStatus() {
    const registros = await listarDevolucoes();

    return registros.reduce(
        function (resultado, registro) {
            const status = (
                registro.statusProcesso
                || STATUS_PROCESSO_STORAGE.DESCONHECIDA
            );

            resultado[status] = (
                resultado[status] || 0
            ) + 1;

            return resultado;
        },
        {}
    );
}


/* =========================================================
   16. APLICAÇÃO DOS FILTROS
   ========================================================= */

function aplicarFiltrosDevolucoes(
    registros,
    filtros
) {
    const statusProcesso = normalizarTexto(
        filtros.statusProcesso
    );

    const conta = normalizarTexto(
        filtros.conta
    );

    const cnpj = normalizarCnpj(
        filtros.cnpj
    );

    const dataInicio = normalizarDataIso(
        filtros.dataInicio
    );

    const dataFim = normalizarDataIso(
        filtros.dataFim
    );

    const termo = normalizarTexto(
        filtros.termo
    )?.toLowerCase();

    const ordem = filtros.ordem === "asc"
        ? "asc"
        : "desc";

    const limite = normalizarLimite(
        filtros.limite
    );

    let resultado = registros.filter(
        function (registro) {
            if (
                statusProcesso
                && registro.statusProcesso
                !== statusProcesso
            ) {
                return false;
            }

            if (
                conta
                && registro.conta !== conta
            ) {
                return false;
            }

            if (
                cnpj
                && registro.cnpj !== cnpj
            ) {
                return false;
            }

            if (
                dataInicio
                && (
                    !registro.dataMovimentacao
                    || registro.dataMovimentacao
                    < dataInicio
                )
            ) {
                return false;
            }

            if (
                dataFim
                && (
                    !registro.dataMovimentacao
                    || registro.dataMovimentacao
                    > dataFim
                )
            ) {
                return false;
            }

            if (
                termo
                && !registroContemTermo(
                    registro,
                    termo
                )
            ) {
                return false;
            }

            return true;
        }
    );

    resultado.sort(
        function (primeiro, segundo) {
            const dataPrimeiro = (
                primeiro.atualizadoEm || ""
            );

            const dataSegundo = (
                segundo.atualizadoEm || ""
            );

            return ordem === "asc"
                ? dataPrimeiro.localeCompare(
                    dataSegundo
                )
                : dataSegundo.localeCompare(
                    dataPrimeiro
                );
        }
    );

    if (limite !== null) {
        resultado = resultado.slice(
            0,
            limite
        );
    }

    return resultado;
}


function registroContemTermo(
    registro,
    termo
) {
    const projeto = registro.projetoConfirmado || {};

    const camposPesquisaveis = [
        registro.codigoDevolucao,
        registro.idTemporario,
        registro.conta,
        registro.cnpj,
        registro.cnpjFormatado,
        registro.identificacaoOrigem,
        registro.documento,
        projeto.idProjeto,
        projeto.paa,
        projeto.nomeProjeto,
        projeto.instituicao
    ];

    return camposPesquisaveis.some(
        function (campo) {
            return String(
                campo || ""
            )
                .toLowerCase()
                .includes(
                    termo
                );
        }
    );
}


/* =========================================================
   17. EXCLUSÃO DE UMA DEVOLUÇÃO
   ========================================================= */

export async function excluirDevolucao(
    idPersistencia
) {
    const id = normalizarTexto(
        idPersistencia
    );

    if (!id) {
        throw new ErroArmazenamentoAziel(
            "O identificador da devolução não foi informado.",
            "ID_DEVOLUCAO_NAO_INFORMADO"
        );
    }

    const registroExistente = await buscarDevolucaoPorId(
        id
    );

    if (!registroExistente) {
        return false;
    }

    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.devolucoes,
        "readwrite"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.devolucoes
    );

    const requisicao = store.delete(
        id
    );

    await Promise.all([
        converterRequisicaoEmPromessa(
            requisicao
        ),

        aguardarConclusaoTransacao(
            transacao
        )
    ]);

    await registrarEventoAuditoria({
        tipo:
            TIPOS_EVENTO_AUDITORIA
                .DEVOLUCAO_EXCLUIDA,

        referenciaId:
            id,

        descricao:
            "Registro de devolução excluído.",

        detalhes: {
            codigoDevolucao:
                registroExistente.codigoDevolucao
        }
    });

    return true;
}


/* =========================================================
   18. CONFIGURAÇÕES NÃO SENSÍVEIS
   ========================================================= */

/*
 * Exemplos permitidos:
 *
 * salvarConfiguracao(
 *     "urlPortalFluig",
 *     "https://fluig.exemplo.org/portal"
 * );
 *
 * salvarConfiguracao(
 *     "destinatariosFinanceiroPadrao",
 *     ["financeiro@exemplo.org"]
 * );
 *
 * Não use esta função para senha, token ou sessão.
 */
export async function salvarConfiguracao(
    chave,
    valor
) {
    const chaveNormalizada = validarChaveConfiguracao(
        chave
    );

    validarConteudoConfiguracao(
        valor
    );

    const banco = await abrirBancoAziel();

    const registro = {
        chave:
            chaveNormalizada,

        valor:
            sanitizarValorParaStorage(
                valor
            ),

        atualizadoEm:
            new Date().toISOString()
    };

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.configuracoes,
        "readwrite"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.configuracoes
    );

    const requisicao = store.put(
        registro
    );

    await Promise.all([
        converterRequisicaoEmPromessa(
            requisicao
        ),

        aguardarConclusaoTransacao(
            transacao
        )
    ]);

    await registrarEventoAuditoria({
        tipo:
            TIPOS_EVENTO_AUDITORIA
                .CONFIGURACAO_SALVA,

        referenciaId:
            chaveNormalizada,

        descricao:
            "Configuração local salva."
    });

    return clonarRegistro(
        registro
    );
}


export async function obterConfiguracao(
    chave,
    valorPadrao = null
) {
    const chaveNormalizada = validarChaveConfiguracao(
        chave
    );

    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.configuracoes,
        "readonly"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.configuracoes
    );

    const requisicao = store.get(
        chaveNormalizada
    );

    const registro = await converterRequisicaoEmPromessa(
        requisicao
    );

    await aguardarConclusaoTransacao(
        transacao
    );

    return registro
        ? clonarRegistro(registro.valor)
        : valorPadrao;
}


export async function removerConfiguracao(
    chave
) {
    const chaveNormalizada = validarChaveConfiguracao(
        chave
    );

    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.configuracoes,
        "readwrite"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.configuracoes
    );

    const requisicao = store.delete(
        chaveNormalizada
    );

    await Promise.all([
        converterRequisicaoEmPromessa(
            requisicao
        ),

        aguardarConclusaoTransacao(
            transacao
        )
    ]);

    await registrarEventoAuditoria({
        tipo:
            TIPOS_EVENTO_AUDITORIA
                .CONFIGURACAO_REMOVIDA,

        referenciaId:
            chaveNormalizada,

        descricao:
            "Configuração local removida."
    });

    return true;
}


/* =========================================================
   19. PROTEÇÃO DAS CONFIGURAÇÕES
   ========================================================= */

function validarChaveConfiguracao(
    chave
) {
    const chaveNormalizada = normalizarTexto(
        chave
    );

    if (!chaveNormalizada) {
        throw new ErroArmazenamentoAziel(
            "A chave da configuração não foi informada.",
            "CHAVE_CONFIGURACAO_NAO_INFORMADA"
        );
    }

    const padraoProibido = (
        /senha|password|token|secret|segredo|cookie|session|sessao|authorization|autorizacao/i
    );

    if (padraoProibido.test(chaveNormalizada)) {
        throw new ErroArmazenamentoAziel(
            "Credenciais, tokens e dados de sessão não podem ser salvos no armazenamento local.",
            "CONFIGURACAO_SENSIVEL_PROIBIDA"
        );
    }

    return chaveNormalizada;
}


function validarConteudoConfiguracao(
    valor
) {
    const texto = JSON.stringify(
        valor
    );

    if (!texto) {
        return;
    }

    const padroesProibidos = [
        /tokenSessao\s*=/i,
        /authorization\s*:/i,
        /bearer\s+[a-z0-9\-._~+/]+=*/i,
        /jsessionid\s*=/i
    ];

    const possuiConteudoProibido = padroesProibidos.some(
        function (padrao) {
            return padrao.test(
                texto
            );
        }
    );

    if (possuiConteudoProibido) {
        throw new ErroArmazenamentoAziel(
            "O valor informado parece conter token ou dado de sessão e não será armazenado.",
            "CONTEUDO_SENSIVEL_PROIBIDO"
        );
    }
}


/* =========================================================
   20. AUDITORIA
   ========================================================= */

export async function registrarEventoAuditoria({
    tipo,
    referenciaId = null,
    descricao = "",
    detalhes = null
}) {
    const tipoNormalizado = normalizarTexto(
        tipo
    );

    if (!tipoNormalizado) {
        throw new ErroArmazenamentoAziel(
            "O tipo do evento de auditoria não foi informado.",
            "TIPO_AUDITORIA_NAO_INFORMADO"
        );
    }

    const banco = await abrirBancoAziel();

    const registro = {
        tipo:
            tipoNormalizado,

        referenciaId:
            normalizarTexto(
                referenciaId
            ),

        descricao:
            normalizarTexto(
                descricao
            ),

        detalhes:
            sanitizarValorParaStorage(
                detalhes
            ),

        criadoEm:
            new Date().toISOString()
    };

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.auditoria,
        "readwrite"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.auditoria
    );

    const requisicao = store.add(
        registro
    );

    const idGerado = await converterRequisicaoEmPromessa(
        requisicao
    );

    await aguardarConclusaoTransacao(
        transacao
    );

    return {
        ...registro,
        id: idGerado
    };
}


/*
 * Lista eventos de auditoria.
 */
export async function listarEventosAuditoria({
    referenciaId = null,
    tipo = null,
    limite = 100,
    ordem = "desc"
} = {}) {
    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.auditoria,
        "readonly"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.auditoria
    );

    const requisicao = store.getAll();

    let eventos = await converterRequisicaoEmPromessa(
        requisicao
    );

    await aguardarConclusaoTransacao(
        transacao
    );

    const referenciaNormalizada = normalizarTexto(
        referenciaId
    );

    const tipoNormalizado = normalizarTexto(
        tipo
    );

    eventos = eventos.filter(
        function (evento) {
            if (
                referenciaNormalizada
                && evento.referenciaId
                !== referenciaNormalizada
            ) {
                return false;
            }

            if (
                tipoNormalizado
                && evento.tipo
                !== tipoNormalizado
            ) {
                return false;
            }

            return true;
        }
    );

    eventos.sort(
        function (primeiro, segundo) {
            return ordem === "asc"
                ? primeiro.criadoEm.localeCompare(
                    segundo.criadoEm
                )
                : segundo.criadoEm.localeCompare(
                    primeiro.criadoEm
                );
        }
    );

    const limiteNormalizado = normalizarLimite(
        limite
    );

    if (limiteNormalizado !== null) {
        eventos = eventos.slice(
            0,
            limiteNormalizado
        );
    }

    return eventos.map(
        clonarRegistro
    );
}


/* =========================================================
   21. LIMPEZA COMPLETA DO BANCO
   ========================================================= */

/*
 * A confirmação precisa ser escrita exatamente como:
 *
 * APAGAR_DADOS_AZIEL
 *
 * Isso evita uma exclusão acidental durante o desenvolvimento.
 */
export async function limparTodosDadosAziel(
    confirmacao
) {
    if (confirmacao !== "APAGAR_DADOS_AZIEL") {
        throw new ErroArmazenamentoAziel(
            "A confirmação para apagar os dados locais é inválida.",
            "CONFIRMACAO_LIMPEZA_INVALIDA"
        );
    }

    const banco = await abrirBancoAziel();

    const nomesStores = [
        CONFIGURACAO_STORAGE_AZIEL.stores.devolucoes,
        CONFIGURACAO_STORAGE_AZIEL.stores.configuracoes,
        CONFIGURACAO_STORAGE_AZIEL.stores.auditoria
    ];

    const transacao = banco.transaction(
        nomesStores,
        "readwrite"
    );

    nomesStores.forEach(
        function (nomeStore) {
            transacao
                .objectStore(nomeStore)
                .clear();
        }
    );

    await aguardarConclusaoTransacao(
        transacao
    );

    /*
     * O evento é registrado depois da limpeza.
     */
    await registrarEventoAuditoria({
        tipo:
            TIPOS_EVENTO_AUDITORIA
                .BANCO_LIMPO,

        descricao:
            "Todos os dados locais do Aziel foram apagados."
    });

    return true;
}


/* =========================================================
   22. IDENTIFICADOR ESTÁVEL DA DEVOLUÇÃO
   ========================================================= */

/*
 * Cria uma impressão digital usando apenas informações
 * da movimentação.
 *
 * Reprocessar o mesmo extrato tende a gerar o mesmo ID,
 * evitando registros duplicados.
 */
function criarImpressaoDigitalDevolucao(
    devolucao,
    contexto
) {
    const conta = normalizarTexto(
        contexto.conta
        || devolucao.conta
    ) || "";

    const data = normalizarDataIso(
        devolucao.dataMovimento
        || devolucao.dataMovimentacao
    ) || "";

    const documento = String(
        devolucao.documento || ""
    ).replace(
        /\D/g,
        ""
    );

    const valorCentavos = converterValorEmCentavos(
        devolucao.valor
    );

    const cnpj = normalizarCnpj(
        devolucao.cnpj
    ) || "";

    const historico = String(
        devolucao.historico || ""
    )
        .trim()
        .toLowerCase()
        .replace(
            /\s+/g,
            " "
        );

    return [
        conta,
        data,
        documento,
        valorCentavos,
        cnpj,
        historico
    ].join("|");
}


function resolverIdPersistencia(
    devolucao,
    impressaoDigital
) {
    const idExistente = normalizarTexto(
        devolucao.idPersistencia
    );

    if (idExistente) {
        return idExistente;
    }

    /*
     * Caso não haja dados suficientes, usamos um UUID.
     */
    if (
        impressaoDigital.replace(
            /\|/g,
            ""
        ).length === 0
    ) {
        return gerarIdAleatorio(
            "DEV-STORAGE"
        );
    }

    const primeiraParte = criarHashTexto(
        impressaoDigital,
        2166136261
    );

    const segundaParte = criarHashTexto(
        impressaoDigital,
        2246822519
    );

    return (
        "DEV-STORAGE-"
        + primeiraParte
        + segundaParte
    );
}


function criarHashTexto(
    texto,
    semente
) {
    let hash = semente >>> 0;

    for (
        let indice = 0;
        indice < texto.length;
        indice += 1
    ) {
        hash ^= texto.charCodeAt(
            indice
        );

        hash = Math.imul(
            hash,
            16777619
        );
    }

    return (
        hash >>> 0
    )
        .toString(16)
        .padStart(8, "0");
}


function gerarIdAleatorio(
    prefixo
) {
    if (
        globalThis.crypto
        && typeof globalThis.crypto.randomUUID
        === "function"
    ) {
        return (
            prefixo
            + "-"
            + globalThis.crypto.randomUUID()
        );
    }

    return (
        prefixo
        + "-"
        + Date.now()
        + "-"
        + Math.random()
            .toString(16)
            .slice(2)
    );
}


/* =========================================================
   23. SANITIZAÇÃO DE VALORES
   ========================================================= */

/*
 * Remove objetos que não devem ser salvos, como:
 *
 * - File;
 * - Blob;
 * - funções;
 * - texto bruto do PDF;
 * - tokens;
 * - senhas;
 * - informações de sessão.
 */
function sanitizarValorParaStorage(
    valor,
    visitados = new WeakSet()
) {
    if (
        valor === null
        || valor === undefined
    ) {
        return null;
    }

    if (
        typeof valor === "string"
        || typeof valor === "number"
        || typeof valor === "boolean"
    ) {
        return valor;
    }

    if (valor instanceof Date) {
        return valor.toISOString();
    }

    if (
        typeof File !== "undefined"
        && valor instanceof File
    ) {
        return null;
    }

    if (
        typeof Blob !== "undefined"
        && valor instanceof Blob
    ) {
        return null;
    }

    if (typeof valor === "function") {
        return null;
    }

    if (typeof valor !== "object") {
        return null;
    }

    if (visitados.has(valor)) {
        return null;
    }

    visitados.add(valor);

    if (Array.isArray(valor)) {
        return valor
            .map(
                function (item) {
                    return sanitizarValorParaStorage(
                        item,
                        visitados
                    );
                }
            )
            .filter(
                function (item) {
                    return item !== null;
                }
            );
    }

    const resultado = {};

    const padraoChaveProibida = (
        /senha|password|token|secret|segredo|cookie|session|sessao|authorization|textoCompleto|textoExtraido|conteudoPdf|arquivoPdf|arquivoExtrato/i
    );

    Object.entries(valor).forEach(
        function ([
            chave,
            conteudo
        ]) {
            if (
                padraoChaveProibida.test(
                    chave
                )
            ) {
                return;
            }

            resultado[chave] = (
                sanitizarValorParaStorage(
                    conteudo,
                    visitados
                )
            );
        }
    );

    return resultado;
}


/* =========================================================
   24. FUNÇÕES DE NORMALIZAÇÃO
   ========================================================= */

function validarObjetoDevolucao(
    devolucao
) {
    if (
        !devolucao
        || typeof devolucao !== "object"
        || Array.isArray(devolucao)
    ) {
        throw new ErroArmazenamentoAziel(
            "Nenhuma devolução válida foi informada.",
            "DEVOLUCAO_INVALIDA"
        );
    }
}


function normalizarTexto(
    valor
) {
    if (
        valor === null
        || valor === undefined
    ) {
        return null;
    }

    const texto = String(
        valor
    ).trim();

    return texto.length > 0
        ? texto
        : null;
}


function normalizarNumero(
    valor
) {
    if (
        typeof valor === "number"
        && Number.isFinite(valor)
    ) {
        return valor;
    }

    if (
        typeof valor === "string"
        && valor.trim()
    ) {
        const valorNormalizado = valor
            .replace(
                /R\$\s*/gi,
                ""
            )
            .replace(
                /\./g,
                ""
            )
            .replace(
                ",",
                "."
            );

        const numero = Number(
            valorNormalizado
        );

        return Number.isFinite(numero)
            ? numero
            : null;
    }

    return null;
}


function converterValorEmCentavos(
    valor
) {
    const numero = normalizarNumero(
        valor
    );

    if (numero === null) {
        return "";
    }

    return String(
        Math.round(
            numero * 100
        )
    );
}


function normalizarCnpj(
    valor
) {
    const numeros = String(
        valor || ""
    ).replace(
        /\D/g,
        ""
    );

    return numeros.length === 14
        ? numeros
        : null;
}


function normalizarDataIso(
    valor
) {
    if (
        typeof valor !== "string"
        || !valor.trim()
    ) {
        return null;
    }

    const texto = valor.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
        return texto;
    }

    const correspondenciaBr = texto.match(
        /^(\d{2})\/(\d{2})\/(\d{4})$/
    );

    if (correspondenciaBr) {
        return (
            correspondenciaBr[3]
            + "-"
            + correspondenciaBr[2]
            + "-"
            + correspondenciaBr[1]
        );
    }

    return null;
}


function normalizarDataHoraIso(
    valor
) {
    if (!valor) {
        return null;
    }

    const data = valor instanceof Date
        ? valor
        : new Date(valor);

    if (
        Number.isNaN(
            data.getTime()
        )
    ) {
        return null;
    }

    return data.toISOString();
}


function normalizarPeriodo(
    periodo
) {
    if (
        !periodo
        || typeof periodo !== "object"
    ) {
        return null;
    }

    return {
        inicio:
            normalizarDataIso(
                periodo.inicio
            ),

        fim:
            normalizarDataIso(
                periodo.fim
            )
    };
}


function normalizarListaTextos(
    valores
) {
    if (!Array.isArray(valores)) {
        return [];
    }

    return valores
        .map(normalizarTexto)
        .filter(Boolean);
}


function normalizarLimite(
    valor
) {
    if (
        valor === null
        || valor === undefined
        || valor === ""
    ) {
        return null;
    }

    const numero = Number(
        valor
    );

    if (
        !Number.isInteger(numero)
        || numero < 1
    ) {
        return null;
    }

    return numero;
}


/* =========================================================
   25. PROMESSAS DO INDEXEDDB
   ========================================================= */

function converterRequisicaoEmPromessa(
    requisicao
) {
    return new Promise(
        function (resolve, reject) {
            requisicao.onsuccess = function () {
                resolve(
                    requisicao.result
                );
            };

            requisicao.onerror = function () {
                reject(
                    new ErroArmazenamentoAziel(
                        "Uma operação no banco local do Aziel falhou.",
                        "OPERACAO_INDEXEDDB_FALHOU",
                        requisicao.error
                    )
                );
            };
        }
    );
}


function aguardarConclusaoTransacao(
    transacao
) {
    return new Promise(
        function (resolve, reject) {
            transacao.oncomplete = function () {
                resolve();
            };

            transacao.onerror = function () {
                reject(
                    new ErroArmazenamentoAziel(
                        "A transação do banco local falhou.",
                        "TRANSACAO_INDEXEDDB_FALHOU",
                        transacao.error
                    )
                );
            };

            transacao.onabort = function () {
                reject(
                    new ErroArmazenamentoAziel(
                        "A transação do banco local foi cancelada.",
                        "TRANSACAO_INDEXEDDB_CANCELADA",
                        transacao.error
                    )
                );
            };
        }
    );
}


/* =========================================================
   26. CLONAGEM DOS REGISTROS
   ========================================================= */

function clonarRegistro(
    registro
) {
    if (
        registro === null
        || registro === undefined
    ) {
        return registro;
    }

    if (
        typeof structuredClone
        === "function"
    ) {
        return structuredClone(
            registro
        );
    }

    return JSON.parse(
        JSON.stringify(
            registro
        )
    );
}