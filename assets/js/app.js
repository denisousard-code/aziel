"use strict";

"use strict";

/*
 * =========================================================
 * AZIEL — CONTROLADOR DE PERSISTÊNCIA
 * =========================================================
 *
 * Este arquivo conecta:
 *
 * - as movimentações interpretadas pelo statement-parser;
 * - os registros persistidos pelo storage-service;
 * - a interface controlada pelo app.js.
 *
 * Responsabilidades:
 *
 * - inicializar o banco local;
 * - carregar registros já salvos;
 * - converter registros do banco para movimentações;
 * - relacionar movimentações reprocessadas com registros antigos;
 * - impedir que o reprocessamento apague etapas avançadas;
 * - salvar alterações feitas pelo usuário;
 * - disponibilizar pendências, concluídas e indicadores;
 * - gerar a próxima numeração DEV-AAAA-NNNN.
 *
 * Este arquivo NÃO:
 *
 * - manipula elementos HTML;
 * - lê arquivos PDF;
 * - acessa o Fluig;
 * - envia e-mails;
 * - salva arquivos, tokens ou senhas.
 */


import {
    abrirBancoAziel,
    verificarArmazenamentoAziel,
    solicitarPersistenciaDoStorage,
    salvarDevolucao,
    listarDevolucoes,
    STATUS_PROCESSO_STORAGE,
    ErroArmazenamentoAziel
} from "./storage-service.js";


/* =========================================================
   1. ESTADO INTERNO DO CONTROLADOR
   ========================================================= */

/*
 * Mantém em memória uma cópia dos registros encontrados
 * no IndexedDB.
 *
 * Essa lista sempre será atualizada depois de uma gravação.
 */
let registrosPersistidos = [];


/*
 * Indica se o controlador já inicializou o banco.
 */
let persistenciaInicializada = false;


/*
 * Evita duas inicializações simultâneas.
 */
let promessaInicializacao = null;


/* =========================================================
   2. CLASSIFICAÇÕES RELEVANTES
   ========================================================= */

/*
 * Somente movimentações relacionadas ao processo de
 * devolução serão enviadas ao banco.
 *
 * Movimentações internas, saldos e aplicações bancárias
 * não precisam ser armazenadas.
 */
const CLASSIFICACOES_PERSISTIVEIS = new Set([
    "alta_possibilidade_devolucao",
    "possivel_devolucao",
    "possivel_devolucao_sem_cnpj",
    "devolucao_confirmada",
    "movimentacao_descartada"
]);


/*
 * Situações operacionais reconhecidas.
 */
const SITUACOES_PERSISTIVEIS = new Set([
    "confirmada",
    "concluida",
    "descartada"
]);


/* =========================================================
   3. ERRO PERSONALIZADO
   ========================================================= */

export class ErroControladorPersistencia extends Error {
    constructor(
        mensagem,
        codigo = "ERRO_CONTROLADOR_PERSISTENCIA",
        causa = null
    ) {
        super(mensagem);

        this.name = "ErroControladorPersistencia";
        this.codigo = codigo;
        this.causa = causa;
    }
}


/* =========================================================
   4. INICIALIZAÇÃO
   ========================================================= */

/*
 * Inicializa o IndexedDB e carrega os registros existentes.
 *
 * solicitarPersistencia:
 *
 * false:
 *     apenas utiliza o armazenamento normal do navegador;
 *
 * true:
 *     solicita ao navegador que evite remover os dados
 *     automaticamente em situações de pouco espaço.
 */
export async function inicializarPersistenciaAziel({
    solicitarPersistencia = false
} = {}) {
    if (persistenciaInicializada) {
        return criarResultadoInicializacao();
    }

    if (promessaInicializacao) {
        return promessaInicializacao;
    }

    promessaInicializacao = executarInicializacao(
        solicitarPersistencia
    );

    try {
        return await promessaInicializacao;
    } finally {
        promessaInicializacao = null;
    }
}


async function executarInicializacao(
    deveSolicitarPersistencia
) {
    try {
        await abrirBancoAziel();

        let persistenciaConcedida = false;

        if (deveSolicitarPersistencia) {
            persistenciaConcedida = await solicitarPersistenciaDoStorage();
        }

        await recarregarRegistrosPersistidos();

        persistenciaInicializada = true;

        const diagnostico = await verificarArmazenamentoAziel();

        return {
            inicializada: true,

            quantidadeRegistros:
                registrosPersistidos.length,

            persistenciaConcedida:
                persistenciaConcedida
                || diagnostico.armazenamentoPersistente,

            diagnostico
        };
    } catch (erro) {
        persistenciaInicializada = false;

        throw converterErroPersistencia(
            erro,
            "Não foi possível inicializar a persistência do Aziel."
        );
    }
}


function criarResultadoInicializacao() {
    return {
        inicializada: true,

        quantidadeRegistros:
            registrosPersistidos.length,

        persistenciaConcedida: null,

        diagnostico: null
    };
}


/* =========================================================
   5. RECARREGAMENTO DOS REGISTROS
   ========================================================= */

/*
 * Busca novamente todos os registros existentes.
 */
export async function recarregarRegistrosPersistidos() {
    try {
        registrosPersistidos = await listarDevolucoes({
            ordem: "desc"
        });

        return obterRegistrosPersistidos();
    } catch (erro) {
        throw converterErroPersistencia(
            erro,
            "Não foi possível carregar os registros salvos."
        );
    }
}


/*
 * Retorna uma cópia da lista.
 *
 * A interface não recebe a referência original para evitar
 * alterações acidentais no estado interno.
 */
export function obterRegistrosPersistidos() {
    return clonarValor(
        registrosPersistidos
    );
}


/* =========================================================
   6. CONVERSÃO PARA MOVIMENTAÇÃO
   ========================================================= */

/*
 * Converte o formato do IndexedDB para o formato utilizado
 * pelo app.js e pelos demais serviços.
 */
export function converterRegistroParaMovimentacao(
    registro
) {
    if (
        !registro
        || typeof registro !== "object"
    ) {
        return null;
    }

    return {
        idPersistencia:
            registro.idPersistencia
            || null,

        idTemporario:
            registro.idTemporario
            || registro.idPersistencia
            || null,

        codigoDevolucao:
            registro.codigoDevolucao
            || null,

        conta:
            registro.conta
            || null,

        agencia:
            registro.agencia
            || null,

        periodo:
            clonarValor(
                registro.periodo
            ),

        /*
         * No parser, a propriedade é dataMovimento.
         * No banco, usamos dataMovimentacao.
         */
        dataMovimento:
            registro.dataMovimentacao
            || null,

        dataMovimentacao:
            registro.dataMovimentacao
            || null,

        hora:
            registro.hora
            || null,

        historico:
            registro.historico
            || null,

        documento:
            registro.documento
            || null,

        valor:
            numeroOuNulo(
                registro.valor
            ),

        valorFormatado:
            registro.valorFormatado
            || formatarMoedaBrasileira(
                registro.valor
            ),

        natureza:
            registro.natureza
            || null,

        cnpj:
            registro.cnpj
            || null,

        cnpjFormatado:
            registro.cnpjFormatado
            || formatarCnpj(
                registro.cnpj
            ),

        cnpjValido:
            Boolean(
                registro.cnpj
            ),

        identificacaoOrigem:
            registro.identificacaoOrigem
            || null,

        classificacao:
            registro.classificacao
            || null,

        classificacaoOriginal:
            registro.classificacaoOriginal
            || null,

        situacaoOperacional:
            registro.situacaoOperacional
            || null,

        statusProcesso:
            registro.statusProcesso
            || STATUS_PROCESSO_STORAGE.DESCONHECIDA,

        statusFluig:
            registro.statusFluig
            || null,

        statusComunicacao:
            registro.statusComunicacao
            || null,

        observacao:
            registro.observacao
            || null,

        motivoDescarte:
            registro.motivoDescarte
            || null,

        justificativaDescarte:
            registro.justificativaDescarte
            || null,

        consultaFluig:
            clonarValor(
                registro.consultaFluig
            ),

        projetoConfirmado:
            clonarValor(
                registro.projetoConfirmado
            ),

        mensagemFinanceiro:
            clonarValor(
                registro.mensagemFinanceiro
            ),

        registroComunicacao:
            clonarValor(
                registro.registroComunicacao
            ),

        entidadeIdentificada:
            clonarValor(
                registro.entidadeIdentificada
            ),

        comprovante:
            clonarValor(
                registro.comprovante
            ),

        dataConfirmacao:
            registro.dataConfirmacao
            || null,

        dataUltimaConsultaFluig:
            registro.dataUltimaConsultaFluig
            || null,

        dataDescarte:
            registro.dataDescarte
            || null,

        dataConclusao:
            registro.dataConclusao
            || null,

        criadoEm:
            registro.criadoEm
            || null,

        atualizadoEm:
            registro.atualizadoEm
            || null
    };
}


/*
 * Retorna todos os registros já convertidos para o formato
 * operacional utilizado pela interface.
 */
export function obterMovimentacoesPersistidas() {
    return registrosPersistidos
        .map(converterRegistroParaMovimentacao)
        .filter(Boolean);
}


/* =========================================================
   7. LOCALIZAÇÃO DE REGISTROS
   ========================================================= */

export function localizarRegistroPersistido(
    identificador
) {
    const id = normalizarTexto(
        identificador
    );

    if (!id) {
        return null;
    }

    const registro = registrosPersistidos.find(
        function (item) {
            return (
                item.idPersistencia === id
                || item.idTemporario === id
                || item.codigoDevolucao === id
            );
        }
    );

    return registro
        ? clonarValor(registro)
        : null;
}


export function localizarMovimentacaoPersistida(
    identificador
) {
    const registro = localizarRegistroPersistido(
        identificador
    );

    return converterRegistroParaMovimentacao(
        registro
    );
}


/* =========================================================
   8. SINCRONIZAÇÃO COM O EXTRATO REPROCESSADO
   ========================================================= */

/*
 * Deve ser chamada depois que o statement-parser interpretar
 * o PDF e antes da atualização da interface.
 *
 * Para cada possível devolução:
 *
 * 1. procura um registro equivalente no banco;
 * 2. se encontrar, recupera a etapa anterior;
 * 3. se não encontrar, cria um novo registro;
 * 4. adiciona idPersistencia na movimentação em memória.
 *
 * Assim, reprocessar o mesmo extrato não faz uma devolução
 * concluída voltar para "aguardando confirmação".
 */
export async function sincronizarInterpretacaoComPersistencia(
    interpretacao
) {
    validarInterpretacao(
        interpretacao
    );

    await garantirInicializacao();

    const contexto = {
        conta:
            interpretacao.conta
            || null,

        agencia:
            interpretacao.agencia
            || null,

        periodo:
            interpretacao.periodo
            || null
    };

    for (const movimentacao of interpretacao.movimentacoes) {
        if (!movimentacaoDeveSerPersistida(movimentacao)) {
            continue;
        }

        adicionarContextoNaMovimentacao(
            movimentacao,
            contexto
        );

        const registroExistente = encontrarRegistroEquivalente(
            movimentacao,
            contexto
        );

        if (registroExistente) {
            mesclarRegistroNaMovimentacao(
                movimentacao,
                registroExistente
            );

            continue;
        }

        const registroSalvo = await salvarDevolucao(
            movimentacao,
            contexto
        );

        mesclarRegistroNaMovimentacao(
            movimentacao,
            registroSalvo
        );
    }

    await recarregarRegistrosPersistidos();

    return interpretacao;
}


/* =========================================================
   9. VERIFICAÇÃO DE MOVIMENTAÇÃO PERSISTÍVEL
   ========================================================= */

export function movimentacaoDeveSerPersistida(
    movimentacao
) {
    if (
        !movimentacao
        || typeof movimentacao !== "object"
    ) {
        return false;
    }

    if (
        movimentacao.idPersistencia
        || movimentacao.codigoDevolucao
        || movimentacao.consultaFluig
        || movimentacao.registroComunicacao
    ) {
        return true;
    }

    if (
        CLASSIFICACOES_PERSISTIVEIS.has(
            movimentacao.classificacao
        )
    ) {
        return true;
    }

    if (
        SITUACOES_PERSISTIVEIS.has(
            movimentacao.situacaoOperacional
        )
    ) {
        return true;
    }

    return false;
}


/* =========================================================
   10. BUSCA DE EQUIVALÊNCIA
   ========================================================= */

function encontrarRegistroEquivalente(
    movimentacao,
    contexto
) {
    /*
     * Primeiro tenta os identificadores diretos.
     */
    const porIdentificador = registrosPersistidos.find(
        function (registro) {
            return (
                movimentacao.idPersistencia
                && registro.idPersistencia
                === movimentacao.idPersistencia
            ) || (
                movimentacao.codigoDevolucao
                && registro.codigoDevolucao
                === movimentacao.codigoDevolucao
            );
        }
    );

    if (porIdentificador) {
        return porIdentificador;
    }

    /*
     * Quando o PDF é reprocessado, o parser cria um novo
     * idTemporario. Por isso utilizamos uma chave baseada
     * nos dados bancários da movimentação.
     */
    const chaveMovimentacao = criarChaveOperacional(
        movimentacao,
        contexto
    );

    if (!chaveMovimentacao) {
        return null;
    }

    return (
        registrosPersistidos.find(
            function (registro) {
                const chaveRegistro = criarChaveOperacional(
                    registro,
                    {
                        conta:
                            registro.conta,

                        agencia:
                            registro.agencia,

                        periodo:
                            registro.periodo
                    }
                );

                return chaveRegistro === chaveMovimentacao;
            }
        )
        || null
    );
}


/*
 * Campos utilizados para reconhecer a mesma movimentação:
 *
 * - conta;
 * - data;
 * - documento;
 * - valor em centavos;
 * - CNPJ;
 * - histórico.
 */
function criarChaveOperacional(
    movimentacao,
    contexto = {}
) {
    if (
        !movimentacao
        || typeof movimentacao !== "object"
    ) {
        return null;
    }

    const conta = normalizarTexto(
        movimentacao.conta
        || contexto.conta
    ) || "";

    const data = normalizarDataIso(
        movimentacao.dataMovimento
        || movimentacao.dataMovimentacao
    ) || "";

    const documento = String(
        movimentacao.documento || ""
    ).replace(
        /\D/g,
        ""
    );

    const valorCentavos = converterValorParaCentavos(
        movimentacao.valor
    );

    const cnpj = String(
        movimentacao.cnpj || ""
    ).replace(
        /\D/g,
        ""
    );

    const historico = String(
        movimentacao.historico || ""
    )
        .trim()
        .toLowerCase()
        .replace(
            /\s+/g,
            " "
        );

    const partes = [
        conta,
        data,
        documento,
        valorCentavos,
        cnpj,
        historico
    ];

    const possuiInformacao = partes.some(
        function (parte) {
            return Boolean(parte);
        }
    );

    return possuiInformacao
        ? partes.join("|")
        : null;
}


/* =========================================================
   11. MESCLAGEM DO REGISTRO
   ========================================================= */

/*
 * Os dados processuais do banco possuem prioridade.
 *
 * Os dados bancários recém-extraídos só serão usados quando
 * o registro persistido não possuir a informação.
 */
function mesclarRegistroNaMovimentacao(
    movimentacao,
    registro
) {
    const persistida = converterRegistroParaMovimentacao(
        registro
    );

    if (!persistida) {
        return movimentacao;
    }

    /*
     * Dados bancários originais recém-lidos.
     */
    const dadosAtuais = {
        dataMovimento:
            movimentacao.dataMovimento,

        hora:
            movimentacao.hora,

        historico:
            movimentacao.historico,

        documento:
            movimentacao.documento,

        valor:
            movimentacao.valor,

        valorFormatado:
            movimentacao.valorFormatado,

        natureza:
            movimentacao.natureza,

        complemento:
            movimentacao.complemento
    };

    /*
     * Aplica todos os dados persistidos, principalmente:
     *
     * - confirmação;
     * - código DEV;
     * - consulta ao Fluig;
     * - projeto;
     * - comunicação;
     * - conclusão.
     */
    Object.assign(
        movimentacao,
        persistida
    );

    /*
     * Preserva o texto bancário recém-extraído quando ele
     * estiver mais completo que o salvo.
     */
    movimentacao.dataMovimento = (
        dadosAtuais.dataMovimento
        || persistida.dataMovimento
    );

    movimentacao.hora = (
        dadosAtuais.hora
        || persistida.hora
    );

    movimentacao.historico = (
        dadosAtuais.historico
        || persistida.historico
    );

    movimentacao.documento = (
        dadosAtuais.documento
        || persistida.documento
    );

    movimentacao.valor = Number.isFinite(
        dadosAtuais.valor
    )
        ? dadosAtuais.valor
        : persistida.valor;

    movimentacao.valorFormatado = (
        dadosAtuais.valorFormatado
        || persistida.valorFormatado
    );

    movimentacao.natureza = (
        dadosAtuais.natureza
        || persistida.natureza
    );

    if (dadosAtuais.complemento) {
        movimentacao.complemento = (
            dadosAtuais.complemento
        );
    }

    return movimentacao;
}


/* =========================================================
   12. PERSISTÊNCIA DE UMA ALTERAÇÃO
   ========================================================= */

/*
 * Deve ser chamada pelo app.js depois de:
 *
 * - confirmar uma devolução;
 * - descartar uma movimentação;
 * - salvar a consulta ao Fluig;
 * - preparar uma mensagem;
 * - concluir a comunicação.
 */
export async function persistirMovimentacao(
    movimentacao,
    contexto = {}
) {
    if (
        !movimentacao
        || typeof movimentacao !== "object"
    ) {
        throw new ErroControladorPersistencia(
            "Nenhuma movimentação válida foi informada.",
            "MOVIMENTACAO_INVALIDA"
        );
    }

    await garantirInicializacao();

    adicionarContextoNaMovimentacao(
        movimentacao,
        contexto
    );

    try {
        const registro = await salvarDevolucao(
            movimentacao,
            {
                conta:
                    contexto.conta
                    || movimentacao.conta
                    || null,

                agencia:
                    contexto.agencia
                    || movimentacao.agencia
                    || null,

                periodo:
                    contexto.periodo
                    || movimentacao.periodo
                    || null
            }
        );

        mesclarRegistroNaMovimentacao(
            movimentacao,
            registro
        );

        await recarregarRegistrosPersistidos();

        return converterRegistroParaMovimentacao(
            registro
        );
    } catch (erro) {
        throw converterErroPersistencia(
            erro,
            "Não foi possível salvar a movimentação."
        );
    }
}


/* =========================================================
   13. LISTAS OPERACIONAIS
   ========================================================= */

export function listarPendenciasPersistidas() {
    const statusPendentes = new Set([
        STATUS_PROCESSO_STORAGE.AGUARDANDO_CONFIRMACAO,
        STATUS_PROCESSO_STORAGE.AGUARDANDO_FLUIG,
        STATUS_PROCESSO_STORAGE.AGUARDANDO_PROJETO,
        STATUS_PROCESSO_STORAGE.AGUARDANDO_COMUNICACAO
    ]);

    return obterMovimentacoesPersistidas().filter(
        function (movimentacao) {
            return statusPendentes.has(
                movimentacao.statusProcesso
            );
        }
    );
}


export function listarConcluidasPersistidas({
    limite = 50
} = {}) {
    const quantidadeLimite = normalizarLimite(
        limite,
        50
    );

    return obterMovimentacoesPersistidas()
        .filter(
            function (movimentacao) {
                return (
                    movimentacao.statusProcesso
                    === STATUS_PROCESSO_STORAGE.CONCLUIDA
                );
            }
        )
        .sort(
            ordenarPorAtualizacaoDecrescente
        )
        .slice(
            0,
            quantidadeLimite
        );
}


export function listarDescartadasPersistidas({
    limite = 50
} = {}) {
    const quantidadeLimite = normalizarLimite(
        limite,
        50
    );

    return obterMovimentacoesPersistidas()
        .filter(
            function (movimentacao) {
                return (
                    movimentacao.statusProcesso
                    === STATUS_PROCESSO_STORAGE.DESCARTADA
                );
            }
        )
        .sort(
            ordenarPorAtualizacaoDecrescente
        )
        .slice(
            0,
            quantidadeLimite
        );
}


/* =========================================================
   14. RESUMO DOS INDICADORES
   ========================================================= */

export function obterResumoPersistido() {
    const resumo = {
        totalRegistros:
            registrosPersistidos.length,

        aguardandoConfirmacao: 0,

        consultasFluigPendentes: 0,

        projetosNaoLocalizados: 0,

        comunicacoesPendentes: 0,

        concluidas: 0,

        concluidasNoMesAtual: 0,

        descartadas: 0
    };

    registrosPersistidos.forEach(
        function (registro) {
            switch (registro.statusProcesso) {
                case STATUS_PROCESSO_STORAGE
                    .AGUARDANDO_CONFIRMACAO:

                    resumo.aguardandoConfirmacao += 1;
                    break;

                case STATUS_PROCESSO_STORAGE
                    .AGUARDANDO_FLUIG:

                    resumo.consultasFluigPendentes += 1;
                    break;

                case STATUS_PROCESSO_STORAGE
                    .AGUARDANDO_PROJETO:

                    resumo.projetosNaoLocalizados += 1;
                    break;

                case STATUS_PROCESSO_STORAGE
                    .AGUARDANDO_COMUNICACAO:

                    resumo.comunicacoesPendentes += 1;
                    break;

                case STATUS_PROCESSO_STORAGE.CONCLUIDA:
                    resumo.concluidas += 1;

                    if (
                        dataPertenceAoMesAtual(
                            registro.dataConclusao
                            || registro
                                .registroComunicacao
                                ?.dataEnvio
                        )
                    ) {
                        resumo.concluidasNoMesAtual += 1;
                    }

                    break;

                case STATUS_PROCESSO_STORAGE.DESCARTADA:
                    resumo.descartadas += 1;
                    break;

                default:
                    break;
            }
        }
    );

    return resumo;
}


/* =========================================================
   15. PRÓXIMO CÓDIGO DE DEVOLUÇÃO
   ========================================================= */

/*
 * Gera a numeração considerando todos os registros salvos,
 * e não apenas o PDF atualmente aberto.
 *
 * Exemplo:
 *
 * DEV-2026-0001
 * DEV-2026-0002
 * DEV-2026-0003
 */
export function gerarProximoCodigoDevolucao(
    anoInformado = null
) {
    const ano = normalizarAno(
        anoInformado
    );

    const padrao = new RegExp(
        `^DEV-${ano}-(\\d{4})$`
    );

    const sequencias = registrosPersistidos
        .map(
            function (registro) {
                const correspondencia = String(
                    registro.codigoDevolucao || ""
                ).match(
                    padrao
                );

                return correspondencia
                    ? Number(correspondencia[1])
                    : 0;
            }
        );

    const maiorSequencia = Math.max(
        0,
        ...sequencias
    );

    const novaSequencia = String(
        maiorSequencia + 1
    ).padStart(
        4,
        "0"
    );

    return `DEV-${ano}-${novaSequencia}`;
}


/* =========================================================
   16. CONTEXTO DA MOVIMENTAÇÃO
   ========================================================= */

function adicionarContextoNaMovimentacao(
    movimentacao,
    contexto
) {
    if (!movimentacao.conta && contexto.conta) {
        movimentacao.conta = contexto.conta;
    }

    if (!movimentacao.agencia && contexto.agencia) {
        movimentacao.agencia = contexto.agencia;
    }

    if (!movimentacao.periodo && contexto.periodo) {
        movimentacao.periodo = clonarValor(
            contexto.periodo
        );
    }
}


/* =========================================================
   17. INICIALIZAÇÃO OBRIGATÓRIA
   ========================================================= */

async function garantirInicializacao() {
    if (persistenciaInicializada) {
        return;
    }

    await inicializarPersistenciaAziel();
}


/* =========================================================
   18. VALIDAÇÃO DA INTERPRETAÇÃO
   ========================================================= */

function validarInterpretacao(
    interpretacao
) {
    if (
        !interpretacao
        || typeof interpretacao !== "object"
        || !Array.isArray(
            interpretacao.movimentacoes
        )
    ) {
        throw new ErroControladorPersistencia(
            "O resultado da interpretação bancária é inválido.",
            "INTERPRETACAO_INVALIDA"
        );
    }
}


/* =========================================================
   19. ERROS
   ========================================================= */

function converterErroPersistencia(
    erro,
    mensagemPadrao
) {
    if (erro instanceof ErroControladorPersistencia) {
        return erro;
    }

    if (erro instanceof ErroArmazenamentoAziel) {
        return new ErroControladorPersistencia(
            erro.message,
            erro.codigo,
            erro
        );
    }

    return new ErroControladorPersistencia(
        mensagemPadrao,
        "FALHA_PERSISTENCIA",
        erro
    );
}


/* =========================================================
   20. FUNÇÕES AUXILIARES
   ========================================================= */

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

    const correspondenciaBrasileira = texto.match(
        /^(\d{2})\/(\d{2})\/(\d{4})$/
    );

    if (!correspondenciaBrasileira) {
        return null;
    }

    return (
        correspondenciaBrasileira[3]
        + "-"
        + correspondenciaBrasileira[2]
        + "-"
        + correspondenciaBrasileira[1]
    );
}


function normalizarAno(
    ano
) {
    const numero = Number(
        ano
    );

    if (
        Number.isInteger(numero)
        && numero >= 2000
        && numero <= 9999
    ) {
        return numero;
    }

    return new Date().getFullYear();
}


function normalizarLimite(
    valor,
    valorPadrao
) {
    const numero = Number(
        valor
    );

    return (
        Number.isInteger(numero)
        && numero > 0
    )
        ? numero
        : valorPadrao;
}


function numeroOuNulo(
    valor
) {
    const numero = Number(
        valor
    );

    return Number.isFinite(numero)
        ? numero
        : null;
}


function converterValorParaCentavos(
    valor
) {
    const numero = Number(
        valor
    );

    if (!Number.isFinite(numero)) {
        return "";
    }

    return String(
        Math.round(
            numero * 100
        )
    );
}


function formatarMoedaBrasileira(
    valor
) {
    const numero = Number(
        valor
    );

    if (!Number.isFinite(numero)) {
        return null;
    }

    return numero.toLocaleString(
        "pt-BR",
        {
            style: "currency",
            currency: "BRL"
        }
    );
}


function formatarCnpj(
    valor
) {
    const numeros = String(
        valor || ""
    ).replace(
        /\D/g,
        ""
    );

    if (numeros.length !== 14) {
        return null;
    }

    return numeros.replace(
        /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
        "$1.$2.$3/$4-$5"
    );
}


function ordenarPorAtualizacaoDecrescente(
    primeiro,
    segundo
) {
    const primeiraData = new Date(
        primeiro.dataConclusao
        || primeiro.atualizadoEm
        || primeiro.criadoEm
        || 0
    );

    const segundaData = new Date(
        segundo.dataConclusao
        || segundo.atualizadoEm
        || segundo.criadoEm
        || 0
    );

    return segundaData - primeiraData;
}


function dataPertenceAoMesAtual(
    dataIso
) {
    if (!dataIso) {
        return false;
    }

    const data = new Date(
        dataIso
    );

    if (
        Number.isNaN(
            data.getTime()
        )
    ) {
        return false;
    }

    const hoje = new Date();

    return (
        data.getMonth() === hoje.getMonth()
        && data.getFullYear() === hoje.getFullYear()
    );
}


function clonarValor(
    valor
) {
    if (
        valor === null
        || valor === undefined
    ) {
        return valor;
    }

    if (
        typeof structuredClone
        === "function"
    ) {
        return structuredClone(
            valor
        );
    }

    return JSON.parse(
        JSON.stringify(
            valor
        )
    );
}

/* =========================================================
   AZIEL — CONTROLE PRINCIPAL DA INTERFACE
   =========================================================

   Fluxo completo desta versão:

   PDF
      ↓
   Interpretação bancária
      ↓
   Confirmação da devolução
      ↓
   Consulta manual assistida no Fluig
      ↓
   Identificação do projeto
      ↓
   Comunicação ao setor financeiro
      ↓
   Histórico recente

   Os dados continuam armazenados apenas na memória.
   Ao atualizar a página, os registros serão apagados.
*/


/* =========================================================
   1. ESTADO TEMPORÁRIO DO SISTEMA
   ========================================================= */

let arquivoExtratoSelecionado = null;

let resultadoLeituraAtual = null;
let resultadoInterpretacaoAtual = null;

let moduloInterpretadorAtual = null;
let moduloFluigAtual = null;
let moduloComunicacaoAtual = null;
let moduloEntidadesAtual = null;

let movimentacaoEmRevisaoId = null;
let devolucaoEmConsultaId = null;
let movimentacaoEmComunicacaoId = null;

let temporizadorNotificacao = null;
let contadorProjetosFluig = 0;


/* =========================================================
   2. INICIALIZAÇÃO
   ========================================================= */

async function iniciarAziel() {
    exibirDataAtual();

    iniciarImportacaoExtrato();
    iniciarModalRevisao();
    iniciarModalConsultaFluig();
    iniciarModalComunicacaoFinanceiro();
    iniciarModalDetalheDevolucao();
    iniciarNotificacaoAziel();
    iniciarBuscaHistoricoRecente();
    iniciarBuscaPendencias();
    iniciarCadastroManual();

    /*
     * Conecta ao banco local (IndexedDB) e carrega as devoluções
     * já salvas em sessões anteriores. Se isso falhar (navegador
     * sem suporte, por exemplo), o Aziel continua funcionando
     * normalmente dentro da sessão atual — só não vai lembrar de
     * nada depois de fechar a página.
     */
    try {
        await inicializarPersistenciaAziel({
            solicitarPersistencia: true
        });
    } catch (erro) {
        console.error(
            "Não foi possível inicializar a persistência do Aziel:",
            erro
        );

        exibirNotificacao(
            "warning",
            "Sem memória entre sessões",
            "Não foi possível conectar ao armazenamento local. As devoluções desta sessão não serão salvas ao atualizar a página."
        );
    }

    atualizarHistoricoRecente();
}


/* =========================================================
   3. DATA DO CABEÇALHO
   ========================================================= */

function exibirDataAtual() {
    const elementoData = document.getElementById(
        "dataAtual"
    );

    if (!elementoData) {
        return;
    }

    elementoData.textContent = formatarDataCompleta(
        new Date()
    );
}


function formatarDataCompleta(data) {
    const formatador = new Intl.DateTimeFormat(
        "pt-BR",
        {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric"
        }
    );

    const texto = formatador.format(data);

    return (
        texto.charAt(0).toUpperCase()
        + texto.slice(1)
    );
}


/* =========================================================
   4. IMPORTAÇÃO DO EXTRATO
   ========================================================= */

function iniciarImportacaoExtrato() {
    const elementos = obterElementosImportacao();

    if (!elementos) {
        return;
    }

    elementos.campoArquivo.addEventListener(
        "change",
        function () {
            const arquivo = (
                elementos.campoArquivo.files[0]
            );

            if (!arquivo) {
                return;
            }

            selecionarArquivoExtrato(
                arquivo,
                elementos
            );
        }
    );

    elementos.botaoRemoverArquivo.addEventListener(
        "click",
        function () {
            removerArquivoExtrato(
                elementos
            );
        }
    );

    elementos.botaoProcessarExtrato.addEventListener(
        "click",
        function () {
            processarExtratoSelecionado(
                elementos
            );
        }
    );

    if (elementos.botaoNovaImportacao) {
        elementos.botaoNovaImportacao.addEventListener(
            "click",
            function () {
                elementos.campoArquivo.click();
            }
        );
    }

    iniciarEventosDeArrastarArquivo(
        elementos
    );
}


function obterElementosImportacao() {
    const campoArquivo = document.getElementById(
        "arquivoExtrato"
    );

    if (!campoArquivo) {
        return null;
    }

    const areaUpload = document.querySelector(
        ".upload-area"
    );

    const arquivoSelecionado = document.getElementById(
        "arquivoSelecionado"
    );

    const nomeArquivo = document.getElementById(
        "nomeArquivo"
    );

    const tamanhoArquivo = document.getElementById(
        "tamanhoArquivo"
    );

    const botaoRemoverArquivo = document.getElementById(
        "botaoRemoverArquivo"
    );

    const botaoProcessarExtrato = document.getElementById(
        "botaoProcessarExtrato"
    );

    const botaoNovaImportacao = document.getElementById(
        "botaoNovaImportacao"
    );

    const painelImportacao = campoArquivo.closest(
        ".panel"
    );

    const statusImportacao = painelImportacao
        ? painelImportacao.querySelector(".status")
        : null;

    if (
        !areaUpload
        || !arquivoSelecionado
        || !nomeArquivo
        || !tamanhoArquivo
        || !botaoRemoverArquivo
        || !botaoProcessarExtrato
    ) {
        console.error(
            "A estrutura da área de importação está incompleta."
        );

        return null;
    }

    return {
        campoArquivo,
        areaUpload,
        arquivoSelecionado,
        nomeArquivo,
        tamanhoArquivo,
        botaoRemoverArquivo,
        botaoProcessarExtrato,
        botaoNovaImportacao,
        statusImportacao
    };
}


function selecionarArquivoExtrato(
    arquivo,
    elementos
) {
    if (!validarArquivoPdf(arquivo)) {
        removerArquivoExtrato(
            elementos
        );

        exibirErroImportacao(
            elementos,
            "Formato não suportado. Selecione um arquivo PDF válido."
        );

        return;
    }

    arquivoExtratoSelecionado = arquivo;

    resultadoLeituraAtual = null;
    resultadoInterpretacaoAtual = null;

    moduloInterpretadorAtual = null;
    moduloFluigAtual = null;
    moduloComunicacaoAtual = null;

    elementos.nomeArquivo.textContent = arquivo.name;

    elementos.tamanhoArquivo.textContent = (
        formatarTamanhoArquivo(
            arquivo.size
        )
        + " • PDF"
    );

    elementos.arquivoSelecionado.hidden = false;
    elementos.botaoProcessarExtrato.disabled = false;

    atualizarStatusImportacao(
        elementos.statusImportacao,
        "Arquivo selecionado",
        "status--information"
    );

    limparResultadoProcessamento();
    limparPendenciasTemporarias();
    resetarIndicadoresDaPagina();
    atualizarHistoricoRecente();
}


function removerArquivoExtrato(
    elementos
) {
    arquivoExtratoSelecionado = null;

    resultadoLeituraAtual = null;
    resultadoInterpretacaoAtual = null;

    moduloInterpretadorAtual = null;
    moduloFluigAtual = null;
    moduloComunicacaoAtual = null;

    elementos.campoArquivo.value = "";

    elementos.nomeArquivo.textContent = (
        "Nenhum arquivo selecionado"
    );

    elementos.tamanhoArquivo.textContent = "—";

    elementos.arquivoSelecionado.hidden = true;
    elementos.botaoProcessarExtrato.disabled = true;

    elementos.botaoProcessarExtrato.textContent = (
        "Processar extrato"
    );

    atualizarStatusImportacao(
        elementos.statusImportacao,
        "Aguardando arquivo",
        "status--pending"
    );

    limparResultadoProcessamento();
    limparPendenciasTemporarias();
    resetarIndicadoresDaPagina();
    atualizarHistoricoRecente();
}


function validarArquivoPdf(arquivo) {
    if (!(arquivo instanceof File)) {
        return false;
    }

    const nomeNormalizado = arquivo.name
        .trim()
        .toLowerCase();

    const extensaoValida = (
        nomeNormalizado.endsWith(".pdf")
    );

    const tipoValido = (
        arquivo.type === "application/pdf"
        || arquivo.type === ""
    );

    return (
        extensaoValida
        && tipoValido
        && arquivo.size > 0
    );
}


/* =========================================================
   5. ARRASTAR E SOLTAR O PDF
   ========================================================= */

function iniciarEventosDeArrastarArquivo(
    elementos
) {
    const areaUpload = elementos.areaUpload;

    [
        "dragenter",
        "dragover"
    ].forEach(
        function (nomeEvento) {
            areaUpload.addEventListener(
                nomeEvento,
                function (evento) {
                    prepararEventoDeArquivo(
                        evento
                    );

                    areaUpload.classList.add(
                        "upload-area--dragging"
                    );
                }
            );
        }
    );

    areaUpload.addEventListener(
        "dragleave",
        function (evento) {
            prepararEventoDeArquivo(
                evento
            );

            areaUpload.classList.remove(
                "upload-area--dragging"
            );
        }
    );

    areaUpload.addEventListener(
        "drop",
        function (evento) {
            prepararEventoDeArquivo(
                evento
            );

            areaUpload.classList.remove(
                "upload-area--dragging"
            );

            const arquivo = (
                evento.dataTransfer.files[0]
            );

            if (!arquivo) {
                return;
            }

            const transferencia = new DataTransfer();

            transferencia.items.add(
                arquivo
            );

            elementos.campoArquivo.files = (
                transferencia.files
            );

            selecionarArquivoExtrato(
                arquivo,
                elementos
            );
        }
    );
}


function prepararEventoDeArquivo(
    evento
) {
    evento.preventDefault();
    evento.stopPropagation();
}


/* =========================================================
   6. PROCESSAMENTO DO EXTRATO
   ========================================================= */

async function processarExtratoSelecionado(
    elementos
) {
    if (!arquivoExtratoSelecionado) {
        exibirErroImportacao(
            elementos,
            "Selecione um extrato antes de iniciar o processamento."
        );

        return;
    }

    definirEstadoDeProcessamento(
        elementos,
        true
    );

    try {
        const [
            moduloLeitorPdf,
            moduloInterpretador,
            moduloFluig,
            moduloComunicacao
        ] = await Promise.all([
            import("./pdf-reader.js"),

            import("./statement-parser.js"),

            import("./fluig-service.js"),

            import(
                "./finance-communication-service.js"
            )
        ]);

        const resultadoLeitura = await moduloLeitorPdf
            .lerPdfComoTexto(
                arquivoExtratoSelecionado
            );

        const resultadoInterpretacao = moduloInterpretador
            .interpretarExtratoBancario(
                resultadoLeitura.textoCompleto
            );

        resultadoLeituraAtual = resultadoLeitura;

        resultadoInterpretacaoAtual = (
            resultadoInterpretacao
        );

        moduloInterpretadorAtual = (
            moduloInterpretador
        );

        moduloFluigAtual = moduloFluig;

        moduloComunicacaoAtual = (
            moduloComunicacao
        );

        sincronizarEstruturasInterpretacao(
            resultadoInterpretacaoAtual
        );

        atualizarInterfaceCompleta(
            elementos,
            true
        );

        atualizarStatusImportacao(
            elementos.statusImportacao,
            "Extrato interpretado",
            "status--success"
        );
    } catch (erro) {
        console.error(
            "Falha durante o processamento do extrato:",
            erro
        );

        exibirErroImportacao(
            elementos,
            obterMensagemDoErro(erro)
        );

        atualizarStatusImportacao(
            elementos.statusImportacao,
            "Falha no processamento",
            "status--danger"
        );
    } finally {
        definirEstadoDeProcessamento(
            elementos,
            false
        );
    }
}


function definirEstadoDeProcessamento(
    elementos,
    processando
) {
    elementos.botaoProcessarExtrato.disabled = (
        processando
        || !arquivoExtratoSelecionado
    );

    elementos.botaoProcessarExtrato.textContent = (
        processando
            ? "Processando..."
            : "Processar extrato"
    );

    elementos.areaUpload.setAttribute(
        "aria-busy",
        String(processando)
    );

    if (processando) {
        atualizarStatusImportacao(
            elementos.statusImportacao,
            "Processando extrato...",
            "status--review"
        );
    }
}


function obterMensagemDoErro(erro) {
    const nomesConhecidos = [
        "ErroLeituraPdf",
        "ErroInterpretacaoExtrato",
        "ErroServicoFluig",
        "ErroServicoComunicacao"
    ];

    if (
        erro
        && nomesConhecidos.includes(
            erro.name
        )
        && typeof erro.message === "string"
    ) {
        return erro.message;
    }

    return (
        "Não foi possível realizar a operação. "
        + "Verifique os dados e tente novamente."
    );
}


/* =========================================================
   7. SINCRONIZAÇÃO DOS DADOS
   ========================================================= */

function sincronizarEstruturasInterpretacao(
    interpretacao
) {
    if (!interpretacao) {
        return;
    }

    const classificacoesPossiveis = [
        "alta_possibilidade_devolucao",
        "possivel_devolucao",
        "possivel_devolucao_sem_cnpj"
    ];

    const classificacoesRevisao = [
        "movimentacao_desconhecida",
        "necessita_revisao"
    ];

    interpretacao.possiveisDevolucoes = (
        interpretacao.movimentacoes.filter(
            function (movimentacao) {
                return (
                    classificacoesPossiveis.includes(
                        movimentacao.classificacao
                    )
                    && !movimentacao.situacaoOperacional
                );
            }
        )
    );

    interpretacao.movimentacoesInternas = (
        interpretacao.movimentacoes.filter(
            function (movimentacao) {
                return (
                    movimentacao.classificacao
                    === "movimentacao_interna"
                );
            }
        )
    );

    interpretacao.movimentacoesParaRevisao = (
        interpretacao.movimentacoes.filter(
            function (movimentacao) {
                return (
                    classificacoesRevisao.includes(
                        movimentacao.classificacao
                    )
                    && movimentacao.situacaoOperacional
                    !== "descartada"
                );
            }
        )
    );

    const confirmadas = obterDevolucoesConfirmadas(
        interpretacao
    );

    const concluidas = obterDevolucoesConcluidas(
        interpretacao
    );

    const descartadas = (
        interpretacao.movimentacoes.filter(
            function (movimentacao) {
                return (
                    movimentacao.situacaoOperacional
                    === "descartada"
                );
            }
        )
    );

    interpretacao.resumo.totalMovimentacoes = (
        interpretacao.movimentacoes.length
    );

    interpretacao.resumo.totalPossiveisDevolucoes = (
        interpretacao.possiveisDevolucoes.length
    );

    interpretacao.resumo.totalMovimentacoesInternas = (
        interpretacao.movimentacoesInternas.length
    );

    interpretacao.resumo.totalParaRevisao = (
        interpretacao.movimentacoesParaRevisao.length
    );

    interpretacao.resumo.totalConfirmadas = (
        confirmadas.length
    );

    interpretacao.resumo.totalConcluidas = (
        concluidas.length
    );

    interpretacao.resumo.totalDescartadas = (
        descartadas.length
    );

    interpretacao.resumo.valorPossiveisDevolucoes = (
        somarValoresMovimentacoes(
            interpretacao.possiveisDevolucoes
        )
    );

    interpretacao.semMovimentacoesRelevantes = (
        interpretacao.possiveisDevolucoes.length === 0
        && interpretacao.movimentacoesParaRevisao.length === 0
        && confirmadas.length === 0
    );
}


function obterDevolucoesConfirmadas(
    interpretacao
) {
    if (!interpretacao) {
        return [];
    }

    return interpretacao.movimentacoes.filter(
        function (movimentacao) {
            return [
                "confirmada",
                "concluida"
            ].includes(
                movimentacao.situacaoOperacional
            );
        }
    );
}


function obterDevolucoesConcluidas(
    interpretacao
) {
    if (!interpretacao) {
        return [];
    }

    return interpretacao.movimentacoes.filter(
        function (movimentacao) {
            return (
                movimentacao.situacaoOperacional
                === "concluida"
            );
        }
    );
}


function obterDevolucoesPendentes(
    interpretacao
) {
    return obterDevolucoesConfirmadas(
        interpretacao
    ).filter(
        function (movimentacao) {
            return (
                movimentacao.situacaoOperacional
                !== "concluida"
            );
        }
    );
}


function somarValoresMovimentacoes(
    movimentacoes
) {
    return movimentacoes.reduce(
        function (total, movimentacao) {
            return total + (
                Number.isFinite(
                    movimentacao.valor
                )
                    ? movimentacao.valor
                    : 0
            );
        },
        0
    );
}


/* =========================================================
   8. ATUALIZAÇÃO GERAL DA INTERFACE
   ========================================================= */

function atualizarInterfaceCompleta(
    elementos,
    rolarAteResultado = false
) {
    if (!resultadoInterpretacaoAtual) {
        return;
    }

    sincronizarEstruturasInterpretacao(
        resultadoInterpretacaoAtual
    );

    /*
     * A tabela de resultado do processamento (com a lista de
     * movimentações lidas do PDF) só existe quando há mesmo um
     * PDF por trás — o cadastro manual não tem resultadoLeitura,
     * então pula essa parte, mas continua atualizando o resto
     * (indicadores, pendências, histórico).
     */
    if (resultadoLeituraAtual) {
        exibirResultadoProcessamento(
            resultadoLeituraAtual,
            resultadoInterpretacaoAtual,
            elementos,
            rolarAteResultado
        );
    }

    atualizarContaProcessada(
        resultadoInterpretacaoAtual
    );

    atualizarIndicadoresTemporarios(
        resultadoInterpretacaoAtual
    );

    preencherPendenciasTemporarias(
        resultadoInterpretacaoAtual
    );

    atualizarHistoricoRecente();
}


/* =========================================================
   9. RESULTADO DO PROCESSAMENTO
   ========================================================= */

function exibirResultadoProcessamento(
    resultadoLeitura,
    interpretacao,
    elementos,
    rolarAteResultado = true
) {
    const painelResultado = obterOuCriarPainelResultado(
        elementos
    );

    const apresentacao = obterApresentacaoResultado(
        interpretacao
    );

    painelResultado.classList.remove(
        "pdf-result--error"
    );

    painelResultado.innerHTML = `
        <div class="panel__header">
            <div>
                <h3>Resultado do processamento</h3>

                <p>
                    O PDF foi lido e interpretado pelo Aziel.
                </p>
            </div>

            <span
                class="status ${apresentacao.classe}"
                data-result-status
            ></span>
        </div>

        <div class="pdf-result__summary">
            <div class="pdf-result__item">
                <span>Conta identificada</span>
                <strong data-result="conta"></strong>
            </div>

            <div class="pdf-result__item">
                <span>Agência</span>
                <strong data-result="agencia"></strong>
            </div>

            <div class="pdf-result__item">
                <span>Período</span>
                <strong data-result="periodo"></strong>
            </div>

            <div class="pdf-result__item">
                <span>Aguardando confirmação</span>
                <strong data-result="possiveis"></strong>
            </div>
        </div>

        <div class="pdf-result__content">
            <div class="pdf-result__content-header">
                <h4>Movimentações identificadas</h4>
                <p data-result="resumo"></p>
            </div>

            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Histórico</th>
                            <th>Documento</th>
                            <th>Valor</th>
                            <th>CNPJ</th>
                            <th>Classificação</th>
                        </tr>
                    </thead>

                    <tbody data-result="movimentacoes"></tbody>
                </table>
            </div>
        </div>

        <div
            class="pdf-result__content"
            style="margin-top: 20px;"
        >
            <div class="pdf-result__content-header">
                <h4>Texto extraído do PDF</h4>

                <p>
                    Conteúdo utilizado para interpretar o extrato.
                </p>
            </div>

            <pre
                class="pdf-result__text"
                data-result="texto"
            ></pre>
        </div>
    `;

    painelResultado.querySelector(
        "[data-result-status]"
    ).textContent = apresentacao.texto;

    painelResultado.querySelector(
        '[data-result="conta"]'
    ).textContent = (
        interpretacao.conta
        || "Não identificada"
    );

    painelResultado.querySelector(
        '[data-result="agencia"]'
    ).textContent = (
        interpretacao.agencia
        || "Não identificada"
    );

    painelResultado.querySelector(
        '[data-result="periodo"]'
    ).textContent = formatarPeriodo(
        interpretacao.periodo
    );

    painelResultado.querySelector(
        '[data-result="possiveis"]'
    ).textContent = String(
        interpretacao.resumo
            .totalPossiveisDevolucoes
    );

    painelResultado.querySelector(
        '[data-result="resumo"]'
    ).textContent = criarResumoInterpretacao(
        interpretacao
    );

    painelResultado.querySelector(
        '[data-result="texto"]'
    ).textContent = criarPreviaTexto(
        resultadoLeitura.textoCompleto
    );

    preencherTabelaMovimentacoes(
        painelResultado,
        interpretacao.movimentacoes
    );

    painelResultado.hidden = false;

    if (rolarAteResultado) {
        painelResultado.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }
}


function obterApresentacaoResultado(
    interpretacao
) {
    if (!interpretacao.conta) {
        return {
            texto: "Conta não identificada",
            classe: "status--danger"
        };
    }

    if (!interpretacao.contaMonitorada) {
        return {
            texto: "Conta não cadastrada",
            classe: "status--danger"
        };
    }

    if (
        interpretacao.possiveisDevolucoes.length > 0
    ) {
        return {
            texto: "Revisão necessária",
            classe: "status--review"
        };
    }

    const pendentes = obterDevolucoesPendentes(
        interpretacao
    );

    const concluidas = obterDevolucoesConcluidas(
        interpretacao
    );

    const statusFluig = obterConstantesStatusFluig();

    const projetoNaoLocalizado = pendentes.some(
        function (movimentacao) {
            return (
                movimentacao.statusFluig
                === statusFluig.AGUARDANDO_PROJETO
            );
        }
    );

    const aguardandoConsulta = pendentes.some(
        function (movimentacao) {
            return (
                !movimentacao.statusFluig
                || movimentacao.statusFluig
                === statusFluig.CONSULTA_PENDENTE
            );
        }
    );

    const aguardandoComunicacao = pendentes.some(
        function (movimentacao) {
            return (
                movimentacao.statusFluig
                === statusFluig.PROJETO_IDENTIFICADO
            );
        }
    );

    if (projetoNaoLocalizado) {
        return {
            texto: "Projeto não localizado",
            classe: "status--pending"
        };
    }

    if (aguardandoConsulta) {
        return {
            texto: "Consulta no Fluig pendente",
            classe: "status--pending"
        };
    }

    if (aguardandoComunicacao) {
        return {
            texto: "Comunicação pendente",
            classe: "status--review"
        };
    }

    if (
        interpretacao.movimentacoesParaRevisao.length > 0
    ) {
        return {
            texto: "Existem itens para revisar",
            classe: "status--pending"
        };
    }

    if (concluidas.length > 0) {
        return {
            texto: "Processamento concluído",
            classe: "status--success"
        };
    }

    return {
        texto: "Conferência concluída",
        classe: "status--success"
    };
}


function preencherTabelaMovimentacoes(
    painelResultado,
    movimentacoes
) {
    const corpoTabela = painelResultado.querySelector(
        '[data-result="movimentacoes"]'
    );

    corpoTabela.innerHTML = "";

    if (movimentacoes.length === 0) {
        const linha = document.createElement("tr");

        const celula = document.createElement("td");

        celula.colSpan = 6;
        celula.className = "data-table__empty";

        celula.textContent = (
            "Nenhuma movimentação bancária foi identificada."
        );

        linha.appendChild(celula);
        corpoTabela.appendChild(linha);

        return;
    }

    movimentacoes.forEach(
        function (movimentacao) {
            const linha = document.createElement("tr");

            adicionarCelula(
                linha,
                formatarDataIsoParaBr(
                    movimentacao.dataMovimento
                )
            );

            adicionarCelula(
                linha,
                movimentacao.historico || "—"
            );

            adicionarCelula(
                linha,
                movimentacao.documento || "—"
            );

            adicionarCelula(
                linha,
                movimentacao.valorFormatado || "—"
            );

            adicionarCelula(
                linha,
                movimentacao.cnpjFormatado || "—"
            );

            const celulaStatus = (
                document.createElement("td")
            );

            const status = document.createElement(
                "span"
            );

            const apresentacao = (
                obterApresentacaoClassificacao(
                    movimentacao.classificacao
                )
            );

            status.className = (
                "status "
                + apresentacao.classe
            );

            status.textContent = apresentacao.texto;

            celulaStatus.appendChild(status);
            linha.appendChild(celulaStatus);

            corpoTabela.appendChild(linha);
        }
    );
}


function obterApresentacaoClassificacao(
    classificacao
) {
    const apresentacoes = {
        alta_possibilidade_devolucao: {
            texto: "Alta possibilidade",
            classe: "status--review"
        },

        possivel_devolucao: {
            texto: "Possível devolução",
            classe: "status--review"
        },

        possivel_devolucao_sem_cnpj: {
            texto: "Possível, sem CNPJ",
            classe: "status--pending"
        },

        devolucao_confirmada: {
            texto: "Devolução confirmada",
            classe: "status--success"
        },

        movimentacao_descartada: {
            texto: "Descartada",
            classe: "status--danger"
        },

        movimentacao_interna: {
            texto: "Movimentação interna",
            classe: "status--information"
        },

        movimentacao_desconhecida: {
            texto: "Necessita revisão",
            classe: "status--pending"
        },

        movimentacao_nao_relevante: {
            texto: "Não relevante",
            classe: "status--information"
        },

        necessita_revisao: {
            texto: "Necessita revisão",
            classe: "status--danger"
        }
    };

    return apresentacoes[classificacao] || {
        texto: "Não classificada",
        classe: "status--information"
    };
}


/* =========================================================
   10. CONTAS MONITORADAS
   ========================================================= */

function atualizarContaProcessada(
    interpretacao
) {
    if (!interpretacao.conta) {
        return;
    }

    const itensConta = Array.from(
        document.querySelectorAll(
            ".account-item"
        )
    );

    const itemCorrespondente = itensConta.find(
        function (item) {
            const titulo = item.querySelector(
                "strong"
            );

            return (
                titulo
                && titulo.textContent.includes(
                    interpretacao.conta
                )
            );
        }
    );

    if (!itemCorrespondente) {
        return;
    }

    marcarRotinaDaContaComoFeita(
        interpretacao.conta
    );

    const descricao = itemCorrespondente.querySelector(
        ".account-item__information div > span"
    );

    const status = itemCorrespondente.querySelector(
        ".status"
    );

    if (!descricao || !status) {
        return;
    }

    removerClassesDeStatus(status);

    const possiveis = (
        interpretacao.possiveisDevolucoes.length
    );

    const pendentes = obterDevolucoesPendentes(
        interpretacao
    );

    const concluidas = obterDevolucoesConcluidas(
        interpretacao
    );

    const statusFluig = obterConstantesStatusFluig();

    const naoLocalizadas = pendentes.filter(
        function (movimentacao) {
            return (
                movimentacao.statusFluig
                === statusFluig.AGUARDANDO_PROJETO
            );
        }
    );

    const consultasPendentes = pendentes.filter(
        function (movimentacao) {
            return (
                !movimentacao.statusFluig
                || movimentacao.statusFluig
                === statusFluig.CONSULTA_PENDENTE
            );
        }
    );

    const comunicacoesPendentes = pendentes.filter(
        function (movimentacao) {
            return (
                movimentacao.statusFluig
                === statusFluig.PROJETO_IDENTIFICADO
            );
        }
    );

    if (possiveis > 0) {
        descricao.textContent = criarTextoQuantidade(
            possiveis,
            "possível devolução encontrada",
            "possíveis devoluções encontradas"
        );

        status.textContent = "Revisar";
        status.classList.add("status--review");

        return;
    }

    if (naoLocalizadas.length > 0) {
        descricao.textContent = criarTextoQuantidade(
            naoLocalizadas.length,
            "projeto ainda não localizado no Fluig",
            "projetos ainda não localizados no Fluig"
        );

        status.textContent = "Pendente";
        status.classList.add("status--pending");

        return;
    }

    if (consultasPendentes.length > 0) {
        descricao.textContent = criarTextoQuantidade(
            consultasPendentes.length,
            "devolução aguardando consulta no Fluig",
            "devoluções aguardando consulta no Fluig"
        );

        status.textContent = "Fluig";
        status.classList.add("status--pending");

        return;
    }

    if (comunicacoesPendentes.length > 0) {
        descricao.textContent = criarTextoQuantidade(
            comunicacoesPendentes.length,
            "comunicação ao financeiro pendente",
            "comunicações ao financeiro pendentes"
        );

        status.textContent = "Comunicar";
        status.classList.add("status--review");

        return;
    }

    if (
        interpretacao.movimentacoesParaRevisao.length > 0
    ) {
        descricao.textContent = criarTextoQuantidade(
            interpretacao.movimentacoesParaRevisao.length,
            "movimentação para revisar",
            "movimentações para revisar"
        );

        status.textContent = "Revisar";
        status.classList.add("status--pending");

        return;
    }

    if (concluidas.length > 0) {
        descricao.textContent = criarTextoQuantidade(
            concluidas.length,
            "devolução concluída",
            "devoluções concluídas"
        );

        status.textContent = "Concluída";
        status.classList.add("status--success");

        return;
    }

    descricao.textContent = (
        "Extrato processado sem movimentações pendentes"
    );

    status.textContent = "Conferida";
    status.classList.add("status--success");
}


/*
 * Assim que um extrato é processado com sucesso pra uma conta
 * (não importa se achou devoluções ou não — o que importa é que
 * o extrato foi de fato consultado), marca a rotina diária
 * correspondente como feita. Sem isso, o Dashboard nunca sabia
 * que a conferência já tinha acontecido — eram dois lugares
 * separados que nunca se falavam.
 */
async function marcarRotinaDaContaComoFeita(numeroConta) {
    const TITULOS_ROTINA_POR_CONTA = {
        "45.140-1": "Consultar extrato da conta 45.140-1",
        "45.141-X": "Consultar extrato da conta 45.141-X"
    };

    const tituloRotina = TITULOS_ROTINA_POR_CONTA[numeroConta];

    if (!tituloRotina) {
        return;
    }

    try {
        if (!moduloRotinasAtual) {
            moduloRotinasAtual = await import(
                "./rotinas-service.js"
            );
        }

        await moduloRotinasAtual.garantirRotinaPresente({
            titulo: tituloRotina,
            tipo: moduloRotinasAtual.TIPO_ROTINA.DIARIA
        });

        const rotinas = await moduloRotinasAtual.listarRotinas();

        const rotina = rotinas.find(
            (r) => r.titulo === tituloRotina
        );

        if (rotina) {
            await moduloRotinasAtual.marcarRotinaComoConcluida(
                rotina.id
            );
        }
    } catch (erro) {
        /*
         * Isso é só uma conveniência a mais (atualiza o Dashboard
         * sozinho) — se falhar, a revisão da devolução em si
         * continua funcionando normalmente.
         */
        console.error(
            "Não foi possível marcar a rotina da conta como feita:",
            erro
        );
    }
}


/* =========================================================
   11. INDICADORES
   ========================================================= */

function atualizarIndicadoresTemporarios(
    interpretacao
) {
    const possiveis = (
        interpretacao.possiveisDevolucoes.length
    );

    const pendentes = obterDevolucoesPendentes(
        interpretacao
    );

    const concluidas = obterDevolucoesConcluidas(
        interpretacao
    );

    const statusFluig = obterConstantesStatusFluig();

    const consultasPendentes = pendentes.filter(
        function (movimentacao) {
            return (
                !movimentacao.statusFluig
                || movimentacao.statusFluig
                === statusFluig.CONSULTA_PENDENTE
            );
        }
    ).length;

    const projetosNaoLocalizados = pendentes.filter(
        function (movimentacao) {
            return (
                movimentacao.statusFluig
                === statusFluig.AGUARDANDO_PROJETO
            );
        }
    ).length;

    const comunicadasNoMes = concluidas.filter(
        function (movimentacao) {
            return dataPertenceAoMesAtual(
                movimentacao.dataConclusao
                || movimentacao.registroComunicacao
                    ?.dataEnvio
            );
        }
    ).length;

    atualizarTextoPorId(
        "devolucoesAguardandoConfirmacao",
        String(possiveis)
    );

    atualizarTextoPorId(
        "possiveisDevolucoes",
        String(possiveis)
    );

    atualizarTextoPorId(
        "consultasFluigPendentes",
        String(consultasPendentes)
    );

    atualizarTextoPorId(
        "projetosNaoLocalizados",
        String(projetosNaoLocalizados)
    );

    atualizarTextoPorId(
        "devolucoesComunicadasMes",
        String(comunicadasNoMes)
    );
}


function resetarIndicadoresDaPagina() {
    [
        "devolucoesAguardandoConfirmacao",
        "possiveisDevolucoes",
        "consultasFluigPendentes",
        "projetosNaoLocalizados",
        "devolucoesComunicadasMes"
    ].forEach(
        function (identificador) {
            atualizarTextoPorId(
                identificador,
                "0"
            );
        }
    );
}


function atualizarTextoPorId(
    identificador,
    texto
) {
    const elemento = document.getElementById(
        identificador
    );

    if (elemento) {
        elemento.textContent = texto;
    }
}


/* =========================================================
   12. TABELA DE PENDÊNCIAS
   ========================================================= */

function preencherPendenciasTemporarias(
    interpretacao
) {
    const corpoTabela = document.getElementById(
        "tabelaPendencias"
    );

    if (!corpoTabela) {
        return;
    }

    corpoTabela.innerHTML = "";

    const pendenciasRevisao = (
        interpretacao.possiveisDevolucoes.map(
            function (movimentacao) {
                return {
                    tipo: "revisao",
                    movimentacao
                };
            }
        )
    );

    const pendenciasOperacionais = (
        obterDevolucoesPendentes(
            interpretacao
        ).map(
            function (movimentacao) {
                return {
                    tipo: determinarTipoPendencia(
                        movimentacao
                    ),

                    movimentacao
                };
            }
        )
    );

    const todasPendencias = [
        ...pendenciasRevisao,
        ...pendenciasOperacionais
    ];

    if (todasPendencias.length === 0) {
        inserirLinhaSemPendencias(
            corpoTabela
        );

        return;
    }

    const termoBusca = (
        document.getElementById(
            "pesquisaDevolucoes"
        )?.value
        || ""
    );

    const pendencias = filtrarPendencias(
        todasPendencias,
        termoBusca
    );

    if (pendencias.length === 0) {
        inserirLinhaSemResultadoBuscaPendencias(
            corpoTabela
        );

        return;
    }

    pendencias.forEach(
        function (pendencia) {
            inserirLinhaPendencia(
                corpoTabela,
                interpretacao,
                pendencia
            );
        }
    );
}


/*
 * Filtra por CNPJ, PAA (do projeto já confirmado no Fluig, se
 * houver) ou entidade — mesmo campo de busca aceita qualquer um
 * dos três, sem diferenciar maiúsculas/minúsculas ou acento.
 */
function filtrarPendencias(
    pendencias,
    termoBusca
) {
    const termo = normalizarTextoParaBusca(
        termoBusca
    );

    if (!termo) {
        return pendencias;
    }

    return pendencias.filter(
        function ({ movimentacao }) {
            const camposPesquisaveis = [
                movimentacao.cnpjFormatado,
                movimentacao.cnpj,
                movimentacao.projetoConfirmado?.paa,
                movimentacao.entidadeIdentificada?.nomeReduzido,
                movimentacao.identificacaoOrigem,
                movimentacao.codigoDevolucao
            ];

            return camposPesquisaveis.some(
                function (campo) {
                    return normalizarTextoParaBusca(
                        campo
                    ).includes(
                        termo
                    );
                }
            );
        }
    );
}


function inserirLinhaSemResultadoBuscaPendencias(
    corpoTabela
) {
    const linha = document.createElement("tr");

    const celula = document.createElement("td");

    celula.colSpan = 8;
    celula.className = "data-table__empty";

    celula.textContent = (
        "Nenhuma pendência encontrada para essa busca."
    );

    linha.appendChild(celula);
    corpoTabela.appendChild(linha);
}


function iniciarBuscaPendencias() {
    const campoBusca = document.getElementById(
        "pesquisaDevolucoes"
    );

    const botaoFiltrar = document.getElementById(
        "botaoFiltrarPendencias"
    );

    function aplicarBusca() {
        if (resultadoInterpretacaoAtual) {
            preencherPendenciasTemporarias(
                resultadoInterpretacaoAtual
            );
        }
    }

    if (campoBusca) {
        campoBusca.addEventListener(
            "input",
            aplicarBusca
        );
    }

    if (botaoFiltrar) {
        botaoFiltrar.addEventListener(
            "click",
            aplicarBusca
        );
    }
}


function determinarTipoPendencia(
    movimentacao
) {
    const statusFluig = obterConstantesStatusFluig();

    if (
        movimentacao.statusFluig
        === statusFluig.PROJETO_IDENTIFICADO
    ) {
        return "comunicacao";
    }

    return "fluig";
}


function inserirLinhaPendencia(
    corpoTabela,
    interpretacao,
    pendencia
) {
    const movimentacao = pendencia.movimentacao;

    const linha = document.createElement("tr");

    adicionarCelula(
        linha,
        movimentacao.codigoDevolucao
        || movimentacao.idTemporario
    );

    adicionarCelula(
        linha,
        formatarDataIsoParaBr(
            movimentacao.dataMovimento
        )
    );

    adicionarCelula(
        linha,
        interpretacao.conta || "—"
    );

    adicionarCelula(
        linha,
        movimentacao.cnpjFormatado
        || movimentacao.identificacaoOrigem
        || "Não identificado"
    );

    adicionarCelula(
        linha,
        movimentacao.valorFormatado || "—"
    );

    adicionarCelula(
        linha,
        obterProximaAcaoPendencia(
            pendencia
        )
    );

    const celulaStatus = document.createElement(
        "td"
    );

    const status = document.createElement("span");

    const apresentacao = obterApresentacaoPendencia(
        pendencia
    );

    status.className = (
        "status "
        + apresentacao.classe
    );

    status.textContent = apresentacao.texto;

    celulaStatus.appendChild(status);
    linha.appendChild(celulaStatus);

    const celulaAcoes = document.createElement(
        "td"
    );

    const botao = document.createElement("button");

    botao.type = "button";
    botao.className = "button button--secondary";

    configurarBotaoPendencia(
        botao,
        pendencia
    );

    celulaAcoes.appendChild(botao);
    linha.appendChild(celulaAcoes);

    corpoTabela.appendChild(linha);
}


function obterProximaAcaoPendencia(
    pendencia
) {
    if (pendencia.tipo === "revisao") {
        return "Confirmar se é devolução";
    }

    if (pendencia.tipo === "comunicacao") {
        return "Preparar a comunicação ao setor financeiro";
    }

    return obterProximaAcaoDaMovimentacao(
        pendencia.movimentacao
    );
}


function obterApresentacaoPendencia(
    pendencia
) {
    if (pendencia.tipo === "revisao") {
        return {
            texto: "Aguardando confirmação",
            classe: "status--review"
        };
    }

    if (pendencia.tipo === "comunicacao") {
        return {
            texto: "Comunicação pendente",
            classe: "status--review"
        };
    }

    return obterApresentacaoStatusFluig(
        pendencia.movimentacao
    );
}


function configurarBotaoPendencia(
    botao,
    pendencia
) {
    const movimentacao = pendencia.movimentacao;

    if (pendencia.tipo === "revisao") {
        botao.textContent = "Revisar";

        botao.addEventListener(
            "click",
            function () {
                abrirModalRevisao(
                    movimentacao.idTemporario
                );
            }
        );

        return;
    }

    if (pendencia.tipo === "comunicacao") {
        botao.textContent = "Comunicar";

        botao.addEventListener(
            "click",
            function () {
                abrirModalComunicacaoFinanceiro(
                    movimentacao.idTemporario
                );
            }
        );

        return;
    }

    botao.textContent = obterTextoBotaoFluig(
        movimentacao
    );

    botao.addEventListener(
        "click",
        function () {
            abrirModalConsultaFluig(
                movimentacao.idTemporario
            );
        }
    );
}


function obterApresentacaoStatusFluig(
    movimentacao
) {
    const statusFluig = obterConstantesStatusFluig();

    const apresentacoes = {
        [statusFluig.CONSULTA_PENDENTE]: {
            texto: "Consulta pendente",
            classe: "status--pending"
        },

        [statusFluig.AGUARDANDO_PROJETO]: {
            texto: "Projeto não localizado",
            classe: "status--danger"
        },

        [statusFluig.UM_PROJETO_ENCONTRADO]: {
            texto: "Projeto para confirmar",
            classe: "status--review"
        },

        [statusFluig.VARIOS_PROJETOS_ENCONTRADOS]: {
            texto: "Projetos para confirmar",
            classe: "status--review"
        },

        [statusFluig.PROJETO_IDENTIFICADO]: {
            texto: "Projeto identificado",
            classe: "status--success"
        },

        [statusFluig.CONSULTA_COM_ERRO]: {
            texto: "Erro na consulta",
            classe: "status--danger"
        }
    };

    return (
        apresentacoes[
            movimentacao.statusFluig
        ]
        || {
            texto: "Consulta pendente",
            classe: "status--pending"
        }
    );
}


function obterTextoBotaoFluig(
    movimentacao
) {
    const statusFluig = obterConstantesStatusFluig();

    if (
        movimentacao.statusFluig
        === statusFluig.AGUARDANDO_PROJETO
    ) {
        return "Nova consulta";
    }

    if (movimentacao.consultaFluig) {
        return "Revisar consulta";
    }

    return "Consultar";
}


function obterProximaAcaoDaMovimentacao(
    movimentacao
) {
    if (
        moduloFluigAtual
        && movimentacao.statusFluig
    ) {
        return moduloFluigAtual
            .obterProximaAcaoFluig(
                movimentacao.statusFluig
            );
    }

    return "Realizar pesquisa do CNPJ no Fluig";
}


function limparPendenciasTemporarias() {
    const corpoTabela = document.getElementById(
        "tabelaPendencias"
    );

    if (!corpoTabela) {
        return;
    }

    corpoTabela.innerHTML = "";

    inserirLinhaSemPendencias(
        corpoTabela
    );
}


function inserirLinhaSemPendencias(
    corpoTabela
) {
    const linha = document.createElement("tr");

    const celula = document.createElement("td");

    celula.colSpan = 8;
    celula.className = "data-table__empty";

    celula.textContent = (
        "Nenhuma pendência registrada."
    );

    linha.appendChild(celula);
    corpoTabela.appendChild(linha);
}


/* =========================================================
   13. MODAL DE REVISÃO
   ========================================================= */

function iniciarModalRevisao() {
    const elementos = obterElementosModalRevisao();

    if (!elementos) {
        return;
    }

    elementos.formulario.addEventListener(
        "submit",
        function (evento) {
            evento.preventDefault();
        }
    );

    elementos.botaoFechar.addEventListener(
        "click",
        fecharModalRevisao
    );

    elementos.botaoCancelar.addEventListener(
        "click",
        fecharModalRevisao
    );

    elementos.botaoIniciarDescarte.addEventListener(
        "click",
        ativarModoDescarte
    );

    elementos.botaoVoltarRevisao.addEventListener(
        "click",
        voltarParaModoRevisao
    );

    elementos.botaoConfirmarDevolucao.addEventListener(
        "click",
        confirmarDevolucao
    );

    elementos.botaoConfirmarDescarte.addEventListener(
        "click",
        confirmarDescarte
    );

    elementos.campoCnpj.addEventListener(
        "input",
        function () {
            elementos.campoCnpj.value = (
                aplicarMascaraCnpj(
                    elementos.campoCnpj.value
                )
            );

            validarCampoCnpj(
                elementos
            );
        }
    );

    /*
     * Só tem efeito quando o campo está editável (cadastro
     * manual) — em campos somente-leitura, o navegador não gera
     * eventos de digitação.
     */
    elementos.campoValor.addEventListener(
        "input",
        function () {
            elementos.campoValor.value = (
                aplicarMascaraMoeda(
                    elementos.campoValor.value
                )
            );
        }
    );

    elementos.campoValor.addEventListener(
        "blur",
        function () {
            if (elementos.campoValor.value.trim()) {
                elementos.campoValor.value = (
                    normalizarMascaraMoedaNaSaida(
                        elementos.campoValor.value
                    )
                );
            }
        }
    );

    elementos.campoData.addEventListener(
        "input",
        function () {
            elementos.campoData.value = (
                aplicarMascaraData(
                    elementos.campoData.value
                )
            );
        }
    );

    elementos.campoHora.addEventListener(
        "input",
        function () {
            elementos.campoHora.value = (
                aplicarMascaraHora(
                    elementos.campoHora.value
                )
            );
        }
    );

    elementos.modal.addEventListener(
        "click",
        function (evento) {
            if (evento.target === elementos.modal) {
                fecharModalRevisao();
            }
        }
    );

    elementos.modal.addEventListener(
        "close",
        function () {
            movimentacaoEmRevisaoId = null;

            resetarModoModal(
                elementos
            );
        }
    );
}


function obterElementosModalRevisao() {
    const modal = document.getElementById(
        "modalRevisaoMovimentacao"
    );

    if (!modal) {
        return null;
    }

    const elementos = {
        modal,

        formulario: document.getElementById(
            "formRevisaoMovimentacao"
        ),

        campoId: document.getElementById(
            "movimentacaoRevisadaId"
        ),

        statusClassificacao: document.getElementById(
            "revisaoStatusClassificacao"
        ),

        campoCodigo: document.getElementById(
            "revisaoCodigo"
        ),

        campoData: document.getElementById(
            "revisaoData"
        ),

        campoHora: document.getElementById(
            "revisaoHora"
        ),

        campoConta: document.getElementById(
            "revisaoConta"
        ),

        campoHistorico: document.getElementById(
            "revisaoHistorico"
        ),

        campoDocumento: document.getElementById(
            "revisaoDocumento"
        ),

        campoValor: document.getElementById(
            "revisaoValor"
        ),

        campoOrigem: document.getElementById(
            "revisaoOrigem"
        ),

        campoCnpj: document.getElementById(
            "revisaoCnpj"
        ),

        mensagemCnpj: document.getElementById(
            "mensagemCnpj"
        ),

        campoObservacao: document.getElementById(
            "revisaoObservacao"
        ),

        confirmacaoDados: document.getElementById(
            "confirmacaoDadosRevisados"
        ),

        secaoConfirmacao: document.getElementById(
            "secaoConfirmacaoDevolucao"
        ),

        secaoDescarte: document.getElementById(
            "secaoDescarteMovimentacao"
        ),

        campoMotivoDescarte: document.getElementById(
            "motivoDescarte"
        ),

        campoObservacaoDescarte: document.getElementById(
            "observacaoDescarte"
        ),

        mensagemErroDescarte: document.getElementById(
            "mensagemErroDescarte"
        ),

        acoesRevisao: document.getElementById(
            "acoesRevisaoMovimentacao"
        ),

        acoesDescarte: document.getElementById(
            "acoesDescarteMovimentacao"
        ),

        botaoFechar: document.getElementById(
            "botaoFecharModalRevisao"
        ),

        botaoCancelar: document.getElementById(
            "botaoCancelarRevisao"
        ),

        botaoIniciarDescarte: document.getElementById(
            "botaoIniciarDescarte"
        ),

        botaoConfirmarDevolucao: document.getElementById(
            "botaoConfirmarDevolucao"
        ),

        botaoVoltarRevisao: document.getElementById(
            "botaoVoltarRevisao"
        ),

        botaoConfirmarDescarte: document.getElementById(
            "botaoConfirmarDescarte"
        )
    };

    if (
        Object.values(elementos).some(
            function (elemento) {
                return !elemento;
            }
        )
    ) {
        console.error(
            "A estrutura do modal de revisão está incompleta."
        );

        return null;
    }

    return elementos;
}


async function abrirModalRevisao(
    idMovimentacao
) {
    const elementos = obterElementosModalRevisao();

    if (
        !elementos
        || !resultadoInterpretacaoAtual
    ) {
        return;
    }

    const movimentacao = localizarMovimentacaoPorId(
        idMovimentacao
    );

    if (!movimentacao) {
        exibirNotificacao(
            "error",
            "Movimentação não encontrada",
            "Não foi possível localizar o registro selecionado."
        );

        return;
    }

    movimentacaoEmRevisaoId = idMovimentacao;

    /*
     * Restaura o modo padrão (somente leitura) dos campos que o
     * cadastro manual libera para edição — evita que uma sessão
     * de cadastro manual anterior deixe os campos editáveis numa
     * revisão normal, vinda de um extrato.
     */
    [
        elementos.campoData,
        elementos.campoHora,
        elementos.campoConta,
        elementos.campoHistorico,
        elementos.campoDocumento,
        elementos.campoValor
    ].forEach(
        function (campo) {
            campo.readOnly = true;
        }
    );

    elementos.campoId.value = (
        movimentacao.idTemporario
    );

    const apresentacaoClassificacao = obterApresentacaoClassificacao(
        movimentacao.classificacao
    );

    elementos.statusClassificacao.textContent = (
        apresentacaoClassificacao.texto
    );

    elementos.statusClassificacao.className = (
        `status ${apresentacaoClassificacao.classe}`
    );

    elementos.campoCodigo.value = (
        movimentacao.idTemporario
    );

    elementos.campoData.value = formatarDataIsoParaBr(
        movimentacao.dataMovimento
    );

    elementos.campoHora.value = (
        movimentacao.hora || "Não informado"
    );

    elementos.campoConta.value = (
        resultadoInterpretacaoAtual.conta
        || "Não identificada"
    );

    elementos.campoHistorico.value = (
        movimentacao.historico || ""
    );

    elementos.campoDocumento.value = (
        movimentacao.documento || "Não informado"
    );

    elementos.campoValor.value = (
        movimentacao.valorFormatado || "R$ 0,00"
    );

    elementos.campoOrigem.value = (
        movimentacao.identificacaoOrigem || ""
    );

    elementos.campoCnpj.value = aplicarMascaraCnpj(
        movimentacao.cnpjFormatado
        || movimentacao.cnpj
        || ""
    );

    elementos.campoObservacao.value = (
        movimentacao.observacao || ""
    );

    elementos.confirmacaoDados.checked = false;

    resetarModoModal(
        elementos
    );

    validarCampoCnpj(
        elementos
    );

    await sugerirEntidadePorCnpj(
        movimentacao,
        elementos
    );

    await atualizarSugestaoProjetosPrestacaoContas(
        movimentacao
    );

    elementos.modal.showModal();
    elementos.botaoFechar.focus();
}


/*
 * =========================================================
 * SUGESTÃO DE PROJETOS EM PRESTAÇÃO DE CONTAS
 * =========================================================
 *
 * A partir do "Relatório de Projetos" (Banco de Dados), sugere
 * quais projetos da entidade identificada estão na fase de
 * prestação de contas — é comum a devolução vir de um deles.
 * Fica só como sugestão informativa; não preenche nada sozinho
 * (RNF-002).
 *
 * Os dados são buscados do Banco de Dados na primeira vez que
 * são necessários, e reaproveitados pelo resto da sessão.
 */

let projetosPrestacaoContasCarregados = null;
let moduloBancoDadosAtual = null;
let moduloRotinasAtual = null;


async function garantirProjetosPrestacaoContasCarregados() {
    if (projetosPrestacaoContasCarregados) {
        return projetosPrestacaoContasCarregados;
    }

    if (!moduloBancoDadosAtual) {
        moduloBancoDadosAtual = await import(
            "./banco-dados-service.js"
        );
    }

    const base = await moduloBancoDadosAtual.obterBaseDados(
        moduloBancoDadosAtual.TIPO_BASE_DADOS.RELATORIO_PROJETOS
    );

    if (!base) {
        projetosPrestacaoContasCarregados = [];

        return projetosPrestacaoContasCarregados;
    }

    projetosPrestacaoContasCarregados = base.registros.map(
        function (registro) {
            return {
                paa: registro.paa,
                instituicao: registro.instituicao,
                projeto: registro.projeto,
                valor: Number.isFinite(registro.valorProjeto)
                    ? registro.valorProjeto.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2
                    })
                    : "0,00",
                status: registro.status
            };
        }
    );

    return projetosPrestacaoContasCarregados;
}


async function atualizarSugestaoProjetosPrestacaoContas(
    movimentacao
) {
    const area = document.getElementById(
        "listaSugestaoProjetos"
    );

    if (!area) {
        return;
    }

    area.innerHTML = "";

    const entidade = movimentacao
        && movimentacao.entidadeIdentificada;

    if (!entidade || !entidade.nomeReduzido) {
        const aviso = document.createElement("p");

        aviso.className = "form-field__message";
        aviso.textContent = (
            "Identifique o CNPJ da entidade primeiro pra ver os "
            + "projetos dela."
        );

        area.appendChild(aviso);

        return;
    }

    const projetos = await garantirProjetosPrestacaoContasCarregados();

    if (projetos.length === 0) {
        const semDados = document.createElement("p");

        semDados.className = "form-field__message";

        semDados.innerHTML = (
            "Importe o Relatório de Projetos no "
            + "<a href=\"./banco-dados.html\">Banco de Dados</a> pra "
            + "ver sugestões aqui."
        );

        area.appendChild(semDados);

        return;
    }

    const nomeNormalizado = normalizarTextoParaComparacao(
        entidade.nomeReduzido
    );

    const correspondencias = projetos.filter(
        function (projeto) {
            return (
                normalizarTextoParaComparacao(projeto.instituicao)
                    === nomeNormalizado
                && statusEhPrestacaoDeContas(projeto.status)
            );
        }
    );

    if (correspondencias.length === 0) {
        const semResultado = document.createElement("p");

        semResultado.className = "form-field__message";
        semResultado.textContent = (
            `Nenhum projeto de ${entidade.nomeReduzido} está em `
            + "prestação de contas nesse arquivo."
        );

        area.appendChild(semResultado);

        return;
    }

    correspondencias.forEach(function (projeto) {
        area.appendChild(
            criarCardSugestaoProjeto(projeto)
        );
    });
}


function criarCardSugestaoProjeto(projeto) {
    const card = document.createElement("div");

    card.className = "report-card";
    card.style.marginBottom = "8px";

    const titulo = document.createElement("strong");

    titulo.textContent = `PAA ${projeto.paa} — ${projeto.projeto || "Sem nome"}`;

    const valor = document.createElement("p");

    valor.className = "form-field__message";

    valor.textContent = (
        `Valor: R$ ${projeto.valor || "0,00"} · Status: `
        + `${projeto.status || "Não informado"}`
    );

    card.append(titulo, valor);

    return card;
}


/*
 * Compara texto ignorando maiúsculas/minúsculas e acentuação —
 * necessário porque tanto o nome da instituição quanto o status
 * (ex: "Prestação de Contas" vs "Prestação de contas") aparecem
 * com capitalização inconsistente entre exportações do Fluig.
 */
function normalizarTextoParaComparacao(texto) {
    return String(texto || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim()
        .replace(/\s+/g, " ");
}


function statusEhPrestacaoDeContas(status) {
    return normalizarTextoParaComparacao(status).includes(
        "PRESTACAO DE CONTAS"
    );
}


/*
 * Consulta a base local de entidades (APAEs e Federações) pelo
 * CNPJ já identificado na movimentação e, se encontrar uma
 * entidade cadastrada, sugere o nome no campo "Origem" — sem
 * sobrescrever nada que o usuário (ou o próprio extrato) já
 * tenha preenchido ali.
 *
 * Isso nunca decide sozinho qual entidade é a correta: é só uma
 * sugestão que o usuário confirma junto com o resto da revisão
 * (mesmo princípio já aplicado à consulta ao Fluig, RNF-002).
 */
async function sugerirEntidadePorCnpj(
    movimentacao,
    elementos
) {
    const cnpjLimpo = limparNumeros(
        elementos.campoCnpj.value
    );

    if (
        !cnpjLimpo
        || cnpjLimpo.length !== 14
    ) {
        await sugerirEntidadesPorNome(
            movimentacao,
            elementos
        );

        return;
    }

    try {
        if (!moduloEntidadesAtual) {
            moduloEntidadesAtual = await import(
                "./entity-service.js"
            );
        }

        const entidade = await moduloEntidadesAtual
            .buscarEntidadePorCnpj(
                cnpjLimpo
            );

        if (!entidade) {
            await sugerirEntidadesPorNome(
                movimentacao,
                elementos
            );

            return;
        }

        ocultarSugestaoPorNome();

        movimentacao.entidadeIdentificada = entidade;

        atualizarSugestaoProjetosPrestacaoContas(
            movimentacao
        );

        const textoOriginalDoExtrato = elementos
            .campoOrigem
            .value
            .trim();

        /*
         * A entidade encontrada é sempre mais útil do que o
         * fragmento de texto cru extraído do extrato (por exemplo,
         * "FEDERA"), então ela tem prioridade no campo Origem.
         * O texto original fica entre parênteses só como
         * referência, caso o usuário queira conferir.
         */
        elementos.campoOrigem.value = (
            textoOriginalDoExtrato
            && textoOriginalDoExtrato !== entidade.nomeReduzido
        )
            ? `${entidade.nomeReduzido} (extrato: ${textoOriginalDoExtrato})`
            : entidade.nomeReduzido;

        exibirNotificacao(
            "success",
            "Entidade identificada",
            `${entidade.nomeReduzido} (${entidade.uf || "UF não informada"}) já está cadastrada na base de entidades.`
        );
    } catch (erro) {
        /*
         * A base de entidades ainda é opcional — se a consulta
         * falhar por algum motivo, a revisão continua normalmente
         * com preenchimento manual.
         */
        console.error(
            "Não foi possível consultar a base de entidades:",
            erro
        );
    }
}


/*
 * Quando não tem CNPJ (ou o CNPJ do extrato não bate com
 * nenhuma entidade cadastrada), tenta achar candidatos pelo
 * texto truncado da "Identificação da origem" — o banco corta
 * esse texto num tamanho fixo, então comparamos por prefixo, não
 * por igualdade.
 *
 * Nunca escolhe uma entidade sozinho: sempre mostra as opções
 * encontradas pra o usuário confirmar com um clique (pode ser
 * mais de uma, principalmente com nomes de Federação, que
 * costumam começar todos igual).
 */
async function sugerirEntidadesPorNome(
    movimentacao,
    elementos
) {
    const area = document.getElementById(
        "areaSugestaoPorNome"
    );

    if (!area) {
        return;
    }

    const textoOrigem = elementos
        .campoOrigem
        .value
        .trim();

    if (!textoOrigem) {
        ocultarSugestaoPorNome();

        return;
    }

    try {
        if (!moduloEntidadesAtual) {
            moduloEntidadesAtual = await import(
                "./entity-service.js"
            );
        }

        const candidatas = await moduloEntidadesAtual
            .buscarEntidadesPorNomeParcial(
                textoOrigem
            );

        if (candidatas.length === 0) {
            ocultarSugestaoPorNome();

            return;
        }

        const candidatasComPista = await cruzarComValorDoProjeto(
            candidatas,
            movimentacao.valor
        );

        candidatasComPista.sort((a, b) => {
            if (a.pista && !b.pista) return -1;
            if (!a.pista && b.pista) return 1;
            return 0;
        });

        area.innerHTML = "";

        const aviso = document.createElement("span");

        aviso.textContent = (
            candidatas.length === 1
                ? "Essa entidade bate com o nome do extrato:"
                : `${candidatas.length} entidades cadastradas começam `
                    + "com esse mesmo nome — qual delas é?"
        );

        area.appendChild(aviso);

        candidatasComPista.forEach(({ candidata, pista }) => {
            const botao = document.createElement("button");

            botao.type = "button";
            botao.className = "button button--text";
            botao.style.display = "block";
            botao.textContent = (
                `${candidata.nomeReduzido} `
                + `(${candidata.uf || "UF não informada"})`
                + (pista ? ` — ${pista}` : "")
            );

            if (pista) {
                botao.style.fontWeight = "700";
            }

            botao.addEventListener("click", () => {
                movimentacao.entidadeIdentificada = candidata;

                elementos.campoCnpj.value = (
                    candidata.cnpjFormatado || candidata.cnpj
                );

                elementos.campoOrigem.value = (
                    textoOrigem
                    && textoOrigem !== candidata.nomeReduzido
                )
                    ? `${candidata.nomeReduzido} (extrato: ${textoOrigem})`
                    : candidata.nomeReduzido;

                ocultarSugestaoPorNome();

                atualizarSugestaoProjetosPrestacaoContas(
                    movimentacao
                );

                exibirNotificacao(
                    "success",
                    "Entidade selecionada",
                    `${candidata.nomeReduzido} confirmada como origem.`
                );
            });

            area.appendChild(botao);
        });

        area.hidden = false;
    } catch (erro) {
        /*
         * A busca por nome é só uma conveniência a mais — se
         * falhar, a revisão continua normalmente com
         * preenchimento manual.
         */
        console.error(
            "Não foi possível buscar entidades por nome:",
            erro
        );
    }
}


/*
 * Quando o nome sozinho não resolve (várias candidatas, como
 * costuma acontecer com Federação), tenta uma segunda pista:
 * será que alguma delas tem um projeto com esse VALOR exato no
 * "Relatório de Projetos"? Um valor específico como R$ 79,60
 * dificilmente é coincidência entre duas entidades diferentes.
 *
 * Isso é só uma pista a mais (destacada em negrito na lista),
 * não decide nada sozinho — o usuário sempre confirma clicando.
 */
async function cruzarComValorDoProjeto(candidatas, valor) {
    const semPista = candidatas.map((candidata) => (
        { candidata, pista: null }
    ));

    if (!Number.isFinite(valor)) {
        return semPista;
    }

    try {
        if (!moduloBancoDadosAtual) {
            moduloBancoDadosAtual = await import(
                "./banco-dados-service.js"
            );
        }

        const base = await moduloBancoDadosAtual.obterBaseDados(
            moduloBancoDadosAtual.TIPO_BASE_DADOS.RELATORIO_PROJETOS
        );

        if (!base) {
            return semPista;
        }

        return candidatas.map((candidata) => {
            const nomeCandidata = normalizarTextoParaComparacao(
                candidata.nome
            );

            const projetoCorrespondente = base.registros.find(
                (registro) => (
                    normalizarTextoParaComparacao(registro.instituicao)
                        === nomeCandidata
                    && Math.abs(
                        (registro.valorProjeto || 0) - valor
                    ) < 0.01
                )
            );

            return {
                candidata,
                pista: projetoCorrespondente
                    ? `tem o PAA ${projetoCorrespondente.paa} com esse `
                        + "valor exato"
                    : null
            };
        });
    } catch (erro) {
        console.error(
            "Não foi possível cruzar com o Relatório de Projetos:",
            erro
        );

        return semPista;
    }
}


function ocultarSugestaoPorNome() {
    const area = document.getElementById(
        "areaSugestaoPorNome"
    );

    if (!area) {
        return;
    }

    area.hidden = true;
    area.innerHTML = "";
}


/* =========================================================
   CADASTRO MANUAL (SEM EXTRATO)
   ========================================================= */

function iniciarCadastroManual() {
    const botao = document.getElementById(
        "botaoCadastroManual"
    );

    if (!botao) {
        return;
    }

    botao.addEventListener(
        "click",
        abrirCadastroManual
    );
}


/*
 * Abre o modal de revisão pronto para um cadastro do zero, sem
 * depender de um extrato importado — para os casos em que a
 * devolução é conhecida por outro canal (e-mail, ligação etc.)
 * e não há PDF disponível.
 *
 * Reaproveita o mesmo modal e o mesmo fluxo de confirmação da
 * revisão normal — a diferença é que os campos que normalmente
 * vêm prontos do PDF (data, hora, conta, histórico, documento,
 * valor) ficam liberados para digitação.
 */
async function abrirCadastroManual() {
    if (!moduloInterpretadorAtual) {
        try {
            moduloInterpretadorAtual = await import(
                "./statement-parser.js"
            );
        } catch (erro) {
            exibirNotificacao(
                "error",
                "Não foi possível iniciar o cadastro manual",
                obterMensagemDoErro(
                    erro
                )
            );

            return;
        }
    }

    if (!resultadoInterpretacaoAtual) {
        resultadoInterpretacaoAtual = {
            conta: "",
            agencia: null,
            periodo: null,
            contaMonitorada: true,
            movimentacoes: [],
            resumo: {}
        };
    }

    const idTemporario = (
        "MOV-MAN-" + Date.now()
    );

    resultadoInterpretacaoAtual.movimentacoes.push({
        idTemporario,
        dataMovimento: null,
        hora: null,
        historico: "",
        documento: null,
        valor: 0,
        valorFormatado: "",
        identificacaoOrigem: "",
        cnpj: null,
        cnpjFormatado: null,
        cnpjValido: false,
        classificacao: "possivel_devolucao",
        situacaoOperacional: null,
        observacao: "",
        cadastroManual: true
    });

    const elementos = obterElementosModalRevisao();

    if (!elementos) {
        return;
    }

    await abrirModalRevisao(
        idTemporario
    );

    /*
     * abrirModalRevisao acabou de preencher os campos com os
     * valores (vazios) da movimentação recém-criada, incluindo
     * o texto "Não informado" nos campos somente-leitura — aqui
     * a gente libera a edição e limpa esse texto de espera, já
     * que é o usuário quem vai preencher tudo agora.
     */
    [
        elementos.campoData,
        elementos.campoHora,
        elementos.campoConta,
        elementos.campoHistorico,
        elementos.campoDocumento,
        elementos.campoValor
    ].forEach(
        function (campo) {
            campo.readOnly = false;
        }
    );

    elementos.campoData.value = "";
    elementos.campoData.placeholder = "DD/MM/AAAA";

    elementos.campoHora.value = "";
    elementos.campoHora.placeholder = "HH:MM";

    elementos.campoConta.value = (
        resultadoInterpretacaoAtual.conta
        || ""
    );

    elementos.campoConta.placeholder = "Ex: 45.140-1";

    elementos.campoHistorico.value = "";
    elementos.campoHistorico.placeholder = (
        "Ex: Transferência recebida"
    );

    elementos.campoDocumento.value = "";
    elementos.campoDocumento.placeholder = (
        "Número do documento bancário, se houver"
    );

    elementos.campoValor.value = "";
    elementos.campoValor.placeholder = "R$ 0,00";

    elementos.campoOrigem.value = "";
    elementos.campoCnpj.value = "";

    elementos.statusClassificacao.textContent = (
        "Cadastro manual"
    );

    elementos.statusClassificacao.className = (
        "status status--pending"
    );

    elementos.campoHistorico.focus();
}


/*
 * Converte os campos que o cadastro manual libera de volta
 * para o formato que o restante do Aziel espera (data ISO,
 * valor numérico etc.), antes de confirmar a devolução.
 */
function salvarCamposManuaisNaMovimentacao(
    movimentacao,
    elementos
) {
    const dataDigitada = (
        elementos.campoData.value.trim()
    );

    movimentacao.dataMovimento = (
        dataDigitada && moduloInterpretadorAtual
            ? moduloInterpretadorAtual
                .converterDataBrasileiraParaIso(
                    dataDigitada
                )
            : null
    );

    movimentacao.hora = (
        elementos.campoHora.value.trim()
        || null
    );

    const contaDigitada = (
        elementos.campoConta.value.trim()
    );

    if (contaDigitada) {
        resultadoInterpretacaoAtual.conta = (
            contaDigitada
        );
    }

    movimentacao.historico = (
        elementos.campoHistorico.value.trim()
        || "Cadastro manual"
    );

    movimentacao.documento = (
        elementos.campoDocumento.value.trim()
        || null
    );

    const valorNumerico = moduloInterpretadorAtual
        ? moduloInterpretadorAtual
            .converterValorBrasileiroParaNumero(
                elementos.campoValor.value.trim()
            )
        : null;

    movimentacao.valor = valorNumerico || 0;

    movimentacao.valorFormatado = (
        moduloInterpretadorAtual
            ? moduloInterpretadorAtual
                .formatarMoedaBrasileira(
                    movimentacao.valor
                )
            : elementos.campoValor.value.trim()
    );
}


function fecharModalRevisao() {
    const elementos = obterElementosModalRevisao();

    if (
        elementos
        && elementos.modal.open
    ) {
        elementos.modal.close();
    }
}


function ativarModoDescarte() {
    const elementos = obterElementosModalRevisao();

    if (!elementos) {
        return;
    }

    elementos.secaoConfirmacao.hidden = true;
    elementos.secaoDescarte.hidden = false;

    elementos.acoesRevisao.hidden = true;
    elementos.acoesDescarte.hidden = false;

    elementos.mensagemErroDescarte.hidden = true;

    elementos.campoMotivoDescarte.focus();
}


function voltarParaModoRevisao() {
    const elementos = obterElementosModalRevisao();

    if (elementos) {
        resetarModoModal(
            elementos
        );
    }
}


function resetarModoModal(
    elementos
) {
    elementos.secaoConfirmacao.hidden = false;
    elementos.secaoDescarte.hidden = true;

    elementos.acoesRevisao.hidden = false;
    elementos.acoesDescarte.hidden = true;

    elementos.campoMotivoDescarte.value = "";
    elementos.campoObservacaoDescarte.value = "";

    elementos.mensagemErroDescarte.hidden = true;
}


/* =========================================================
   14. CONFIRMAÇÃO E DESCARTE
   ========================================================= */

async function confirmarDevolucao() {
    const elementos = obterElementosModalRevisao();

    if (!elementos) {
        return;
    }

    const movimentacao = localizarMovimentacaoPorId(
        movimentacaoEmRevisaoId
    );

    if (!movimentacao) {
        return;
    }

    if (!elementos.confirmacaoDados.checked) {
        exibirNotificacao(
            "warning",
            "Confirmação necessária",
            "Marque a confirmação de que os dados foram revisados."
        );

        elementos.confirmacaoDados.focus();

        return;
    }

    if (!validarCampoCnpj(elementos)) {
        exibirNotificacao(
            "error",
            "CNPJ inválido",
            "Corrija o CNPJ ou deixe o campo vazio para continuar sem ele."
        );

        elementos.campoCnpj.focus();

        return;
    }

    salvarCamposEditaveisNaMovimentacao(
        movimentacao,
        elementos
    );

    movimentacao.classificacaoOriginal = (
        movimentacao.classificacaoOriginal
        || movimentacao.classificacao
    );

    movimentacao.classificacao = (
        "devolucao_confirmada"
    );

    movimentacao.situacaoOperacional = (
        "confirmada"
    );

    movimentacao.codigoDevolucao = (
        gerarCodigoDevolucaoTemporario(
            movimentacao
        )
    );

    movimentacao.observacao = (
        elementos.campoObservacao.value.trim()
    );

    movimentacao.dataConfirmacao = (
        new Date().toISOString()
    );

    movimentacao.statusFluig = (
        obterConstantesStatusFluig()
            .CONSULTA_PENDENTE
    );

    movimentacao.statusComunicacao = (
        obterConstantesStatusComunicacao()
            .PENDENTE
    );

    try {
        await persistirMovimentacao(
            movimentacao,
            {
                conta:
                    resultadoInterpretacaoAtual
                    && resultadoInterpretacaoAtual.conta,

                periodo:
                    resultadoInterpretacaoAtual
                    && resultadoInterpretacaoAtual.periodo
            }
        );
    } catch (erro) {
        exibirNotificacao(
            "error",
            "Não foi possível salvar a devolução",
            obterMensagemDoErro(erro)
        );

        return;
    }

    fecharModalRevisao();

    atualizarInterfaceSemRolagem();

    exibirNotificacao(
        "success",
        "Devolução confirmada",
        `${movimentacao.codigoDevolucao} foi criada e agora aguarda consulta no Fluig.`
    );
}


function salvarCamposEditaveisNaMovimentacao(
    movimentacao,
    elementos
) {
    if (movimentacao.cadastroManual) {
        salvarCamposManuaisNaMovimentacao(
            movimentacao,
            elementos
        );
    }

    movimentacao.identificacaoOrigem = (
        elementos.campoOrigem.value.trim()
        || null
    );

    const cnpjLimpo = limparNumeros(
        elementos.campoCnpj.value
    );

    if (!cnpjLimpo) {
        movimentacao.cnpj = null;
        movimentacao.cnpjFormatado = null;
        movimentacao.cnpjValido = false;

        return;
    }

    movimentacao.cnpj = cnpjLimpo;

    movimentacao.cnpjFormatado = (
        moduloInterpretadorAtual
            ? moduloInterpretadorAtual.formatarCnpj(
                cnpjLimpo
            )
            : aplicarMascaraCnpj(cnpjLimpo)
    );

    movimentacao.cnpjValido = (
        moduloInterpretadorAtual
            ? moduloInterpretadorAtual.validarCnpj(
                cnpjLimpo
            )
            : false
    );
}


function gerarCodigoDevolucaoTemporario(
    movimentacao
) {
    const ano = movimentacao.dataMovimento
        ? movimentacao.dataMovimento.slice(0, 4)
        : String(new Date().getFullYear());

    const sequenciasExistentes = (
        obterDevolucoesConfirmadas(
            resultadoInterpretacaoAtual
        )
            .map(
                function (devolucao) {
                    const correspondencia = String(
                        devolucao.codigoDevolucao || ""
                    ).match(
                        new RegExp(
                            `^DEV-${ano}-(\\d{4})$`
                        )
                    );

                    return correspondencia
                        ? Number(correspondencia[1])
                        : 0;
                }
            )
    );

    const maiorSequencia = Math.max(
        0,
        ...sequenciasExistentes
    );

    const novaSequencia = String(
        maiorSequencia + 1
    ).padStart(4, "0");

    return `DEV-${ano}-${novaSequencia}`;
}


function confirmarDescarte() {
    const elementos = obterElementosModalRevisao();

    if (!elementos) {
        return;
    }

    const movimentacao = localizarMovimentacaoPorId(
        movimentacaoEmRevisaoId
    );

    if (!movimentacao) {
        return;
    }

    const motivo = elementos
        .campoMotivoDescarte
        .value;

    const justificativa = elementos
        .campoObservacaoDescarte
        .value
        .trim();

    const justificativaObrigatoria = (
        motivo === "outro"
        && justificativa.length === 0
    );

    if (
        !motivo
        || justificativaObrigatoria
    ) {
        elementos.mensagemErroDescarte.textContent = (
            justificativaObrigatoria
                ? "Informe a justificativa para o motivo selecionado."
                : "Informe o motivo do descarte antes de continuar."
        );

        elementos.mensagemErroDescarte.hidden = false;

        if (!motivo) {
            elementos.campoMotivoDescarte.focus();
        } else {
            elementos.campoObservacaoDescarte.focus();
        }

        return;
    }

    movimentacao.classificacaoOriginal = (
        movimentacao.classificacaoOriginal
        || movimentacao.classificacao
    );

    movimentacao.classificacao = (
        "movimentacao_descartada"
    );

    movimentacao.situacaoOperacional = (
        "descartada"
    );

    movimentacao.motivoDescarte = motivo;

    movimentacao.justificativaDescarte = (
        justificativa
    );

    movimentacao.dataDescarte = (
        new Date().toISOString()
    );

    fecharModalRevisao();

    atualizarInterfaceSemRolagem();

    exibirNotificacao(
        "success",
        "Movimentação descartada",
        "O registro foi removido das pendências de devolução."
    );
}


/* =========================================================
   15. VALIDAÇÃO DO CNPJ
   ========================================================= */

function validarCampoCnpj(
    elementos
) {
    const campo = elementos.campoCnpj;
    const mensagem = elementos.mensagemCnpj;

    const cnpjLimpo = limparNumeros(
        campo.value
    );

    campo.classList.remove(
        "input--success",
        "input--danger"
    );

    mensagem.classList.remove(
        "form-field__message--success",
        "form-field__message--danger"
    );

    if (!cnpjLimpo) {
        mensagem.textContent = (
            "CNPJ não informado. O registro poderá continuar sem ele."
        );

        return true;
    }

    if (cnpjLimpo.length !== 14) {
        campo.classList.add(
            "input--danger"
        );

        mensagem.classList.add(
            "form-field__message--danger"
        );

        mensagem.textContent = (
            "O CNPJ deve possuir 14 números."
        );

        return false;
    }

    const valido = (
        moduloInterpretadorAtual
        && moduloInterpretadorAtual.validarCnpj(
            cnpjLimpo
        )
    );

    if (!valido) {
        campo.classList.add(
            "input--danger"
        );

        mensagem.classList.add(
            "form-field__message--danger"
        );

        mensagem.textContent = (
            "CNPJ inválido. Verifique os números informados."
        );

        return false;
    }

    campo.classList.add(
        "input--success"
    );

    mensagem.classList.add(
        "form-field__message--success"
    );

    mensagem.textContent = (
        "CNPJ validado com sucesso."
    );

    return true;
}


function aplicarMascaraCnpj(valor) {
    const numeros = limparNumeros(
        valor
    ).slice(
        0,
        14
    );

    return numeros
        .replace(
            /^(\d{2})(\d)/,
            "$1.$2"
        )
        .replace(
            /^(\d{2})\.(\d{3})(\d)/,
            "$1.$2.$3"
        )
        .replace(
            /\.(\d{3})(\d)/,
            ".$1/$2"
        )
        .replace(
            /(\d{4})(\d)/,
            "$1-$2"
        );
}


/*
 * Aplica a máscara de valor monetário brasileiro (ex: 15000
 * digitado vira 15.000, e 15000,5 vira 15.000,5) enquanto o
 * usuário digita.
 *
 * Diferente de uma máscara "centavos primeiro" (em que cada
 * dígito digitado empurra os centavos), aqui os dígitos digitados
 * são sempre a parte inteira, e os centavos só entram se o
 * usuário digitar a vírgula — é o jeito mais natural de digitar
 * um valor de projeto, que normalmente é um número redondo.
 */
function aplicarMascaraMoeda(valor) {
    const textoLimpo = String(
        valor || ""
    ).replace(
        /[^\d,]/g,
        ""
    );

    if (!textoLimpo) {
        return "";
    }

    const [parteInteiraBruta, ...resto] = textoLimpo.split(",");

    const parteInteira = (
        parteInteiraBruta.replace(/^0+(?=\d)/, "")
        || "0"
    ).replace(
        /\B(?=(\d{3})+(?!\d))/g,
        "."
    );

    if (resto.length === 0) {
        return parteInteira;
    }

    const parteDecimal = resto
        .join("")
        .slice(0, 2);

    return `${parteInteira},${parteDecimal}`;
}


/*
 * Garante duas casas decimais ao sair do campo de valor
 * (ex: "15.000" vira "15.000,00" quando o usuário sai do campo
 * sem ter digitado centavos).
 */
function normalizarMascaraMoedaNaSaida(valor) {
    const textoLimpo = String(
        valor || ""
    ).trim();

    if (!textoLimpo) {
        return "";
    }

    const [parteInteira, parteDecimal] = textoLimpo.split(",");

    const decimalCompleto = (
        parteDecimal || ""
    ).padEnd(
        2,
        "0"
    ).slice(
        0,
        2
    );

    return `${parteInteira},${decimalCompleto}`;
}


/*
 * Aplica a máscara de data brasileira (DD/MM/AAAA) enquanto o
 * usuário digita, inserindo as barras automaticamente.
 */
function aplicarMascaraData(valor) {
    const numeros = limparNumeros(
        valor
    ).slice(
        0,
        8
    );

    return numeros
        .replace(
            /^(\d{2})(\d)/,
            "$1/$2"
        )
        .replace(
            /^(\d{2})\/(\d{2})(\d)/,
            "$1/$2/$3"
        );
}


/*
 * Aplica a máscara de horário (HH:MM) enquanto o usuário digita.
 */
function aplicarMascaraHora(valor) {
    const numeros = limparNumeros(
        valor
    ).slice(
        0,
        4
    );

    return numeros.replace(
        /^(\d{2})(\d)/,
        "$1:$2"
    );
}


function limparNumeros(valor) {
    return String(
        valor || ""
    ).replace(
        /\D/g,
        ""
    );
}


/* =========================================================
   16. MODAL DE CONSULTA AO FLUIG
   ========================================================= */

function iniciarModalConsultaFluig() {
    const elementos = obterElementosModalConsultaFluig();

    if (!elementos) {
        return;
    }

    elementos.formulario.addEventListener(
        "submit",
        function (evento) {
            evento.preventDefault();
        }
    );

    elementos.botaoFechar.addEventListener(
        "click",
        fecharModalConsultaFluig
    );

    elementos.botaoCancelar.addEventListener(
        "click",
        fecharModalConsultaFluig
    );

    elementos.botaoCopiarCnpj.addEventListener(
        "click",
        copiarCnpjDoModalFluig
    );

    elementos.botaoAbrirPortal.addEventListener(
        "click",
        abrirPortalPeloModalFluig
    );

    elementos.campoResultado.addEventListener(
        "change",
        atualizarSecoesResultadoFluig
    );

    elementos.botaoAdicionarProjeto.addEventListener(
        "click",
        function () {
            adicionarProjetoFluig();
        }
    );

    elementos.botaoSalvar.addEventListener(
        "click",
        salvarConsultaFluig
    );

    elementos.modal.addEventListener(
        "click",
        function (evento) {
            if (evento.target === elementos.modal) {
                fecharModalConsultaFluig();
            }
        }
    );

    elementos.modal.addEventListener(
        "close",
        function () {
            devolucaoEmConsultaId = null;

            limparEstadoModalConsultaFluig(
                elementos
            );
        }
    );
}


function obterElementosModalConsultaFluig() {
    const modal = document.getElementById(
        "modalConsultaFluig"
    );

    if (!modal) {
        return null;
    }

    const elementos = {
        modal,

        formulario: document.getElementById(
            "formConsultaFluig"
        ),

        campoDevolucaoId: document.getElementById(
            "consultaFluigDevolucaoId"
        ),

        statusTitulo: document.getElementById(
            "statusConsultaFluig"
        ),

        statusDescricao: document.getElementById(
            "descricaoStatusConsultaFluig"
        ),

        resumoCodigo: document.getElementById(
            "fluigResumoCodigo"
        ),

        resumoData: document.getElementById(
            "fluigResumoData"
        ),

        resumoConta: document.getElementById(
            "fluigResumoConta"
        ),

        resumoValor: document.getElementById(
            "fluigResumoValor"
        ),

        resumoOrigem: document.getElementById(
            "fluigResumoOrigem"
        ),

        campoCnpj: document.getElementById(
            "campoCnpjConsultaFluig"
        ),

        mensagemCopiaCnpj: document.getElementById(
            "mensagemCopiaCnpjFluig"
        ),

        campoUrlPortal: document.getElementById(
            "campoUrlPortalFluig"
        ),

        botaoCopiarCnpj: document.getElementById(
            "botaoCopiarCnpjFluig"
        ),

        botaoAbrirPortal: document.getElementById(
            "botaoAbrirPortalFluig"
        ),

        campoResultado: document.getElementById(
            "resultadoConsultaFluig"
        ),

        secaoNenhumProjeto: document.getElementById(
            "secaoNenhumProjetoFluig"
        ),

        observacaoNenhumProjeto: document.getElementById(
            "observacaoNenhumProjetoFluig"
        ),

        secaoProjetosEncontrados: document.getElementById(
            "secaoProjetosEncontradosFluig"
        ),

        botaoAdicionarProjeto: document.getElementById(
            "botaoAdicionarProjetoFluig"
        ),

        listaProjetos: document.getElementById(
            "listaProjetosFluig"
        ),

        observacaoConsulta: document.getElementById(
            "observacaoConsultaFluig"
        ),

        mensagemErro: document.getElementById(
            "mensagemErroConsultaFluig"
        ),

        botaoFechar: document.getElementById(
            "botaoFecharModalFluig"
        ),

        botaoCancelar: document.getElementById(
            "botaoCancelarConsultaFluig"
        ),

        botaoSalvar: document.getElementById(
            "botaoSalvarConsultaFluig"
        ),

        templateProjeto: document.getElementById(
            "templateProjetoCandidatoFluig"
        )
    };

    if (
        Object.values(elementos).some(
            function (elemento) {
                return !elemento;
            }
        )
    ) {
        console.error(
            "A estrutura do modal de consulta ao Fluig está incompleta."
        );

        return null;
    }

    return elementos;
}


async function abrirModalConsultaFluig(
    idMovimentacao
) {
    const elementos = obterElementosModalConsultaFluig();

    if (
        !elementos
        || !resultadoInterpretacaoAtual
    ) {
        return;
    }

    const movimentacao = localizarMovimentacaoPorId(
        idMovimentacao
    );

    if (!movimentacao) {
        exibirNotificacao(
            "error",
            "Devolução não encontrada",
            "Não foi possível localizar a devolução selecionada."
        );

        return;
    }

    try {
        if (!moduloFluigAtual) {
            moduloFluigAtual = await import(
                "./fluig-service.js"
            );
        }

        const dados = moduloFluigAtual
            .prepararDadosConsultaFluig(
                movimentacao,
                resultadoInterpretacaoAtual.conta
            );

        devolucaoEmConsultaId = idMovimentacao;

        limparEstadoModalConsultaFluig(
            elementos
        );

        preencherResumoModalFluig(
            elementos,
            movimentacao,
            dados
        );

        preencherConsultaFluigExistente(
            elementos,
            movimentacao
        );

        atualizarStatusModalFluig(
            elementos,
            movimentacao
        );

        elementos.modal.showModal();
        elementos.botaoFechar.focus();
    } catch (erro) {
        console.error(
            "Erro ao abrir a consulta ao Fluig:",
            erro
        );

        exibirNotificacao(
            "error",
            "Não foi possível iniciar a consulta",
            obterMensagemDoErro(erro)
        );
    }
}


function preencherResumoModalFluig(
    elementos,
    movimentacao,
    dados
) {
    elementos.campoDevolucaoId.value = (
        movimentacao.idTemporario
    );

    elementos.resumoCodigo.value = (
        dados.codigoDevolucao || "—"
    );

    elementos.resumoData.value = formatarDataIsoParaBr(
        dados.dataMovimentacao
    );

    elementos.resumoConta.value = (
        dados.conta || "Não identificada"
    );

    elementos.resumoValor.value = (
        dados.valorFormatado || "R$ 0,00"
    );

    elementos.resumoOrigem.value = (
        dados.origem
        || movimentacao.identificacaoOrigem
        || "Não identificada"
    );

    elementos.campoCnpj.value = (
        dados.cnpjFormatado || ""
    );

    elementos.campoUrlPortal.value = (
        moduloFluigAtual
            ? moduloFluigAtual.obterUrlPortalFluig()
            : ""
    );
}


function preencherConsultaFluigExistente(
    elementos,
    movimentacao
) {
    const consulta = movimentacao.consultaFluig;

    if (!consulta) {
        return;
    }

    elementos.campoResultado.value = (
        consulta.resultado || ""
    );

    atualizarSecoesResultadoFluig();

    elementos.listaProjetos.innerHTML = "";
    contadorProjetosFluig = 0;

    if (
        consulta.resultado
        === moduloFluigAtual
            .RESULTADOS_CONSULTA_FLUIG
            .NENHUM_PROJETO
    ) {
        elementos.observacaoNenhumProjeto.value = (
            consulta.observacao || ""
        );

        return;
    }

    consulta.projetos.forEach(
        function (projeto) {
            adicionarProjetoFluig(
                projeto,
                projeto.confirmado
            );
        }
    );

    elementos.observacaoConsulta.value = (
        consulta.observacao || ""
    );
}


function atualizarStatusModalFluig(
    elementos,
    movimentacao
) {
    if (
        !movimentacao.statusFluig
        || !moduloFluigAtual
    ) {
        elementos.statusTitulo.textContent = (
            "Consulta pendente"
        );

        elementos.statusDescricao.textContent = (
            "A devolução foi confirmada, mas ainda precisa "
            + "ser relacionada a um projeto no Fluig."
        );

        return;
    }

    const apresentacao = obterApresentacaoStatusFluig(
        movimentacao
    );

    elementos.statusTitulo.textContent = (
        apresentacao.texto
    );

    elementos.statusDescricao.textContent = (
        moduloFluigAtual.obterProximaAcaoFluig(
            movimentacao.statusFluig
        )
    );
}


function fecharModalConsultaFluig() {
    const elementos = obterElementosModalConsultaFluig();

    if (
        elementos
        && elementos.modal.open
    ) {
        elementos.modal.close();
    }
}


function limparEstadoModalConsultaFluig(
    elementos
) {
    elementos.formulario.reset();

    elementos.campoResultado.value = "";

    elementos.secaoNenhumProjeto.hidden = true;

    elementos.secaoProjetosEncontrados.hidden = true;

    elementos.listaProjetos.innerHTML = "";

    elementos.mensagemErro.hidden = true;

    elementos.mensagemErro.textContent = (
        "Revise os dados da consulta antes de continuar."
    );

    elementos.mensagemCopiaCnpj.textContent = (
        "O Aziel copiará somente os 14 números do CNPJ."
    );

    elementos.mensagemCopiaCnpj.classList.remove(
        "form-field__message--success",
        "form-field__message--danger"
    );

    const linhaCopia = elementos.campoCnpj.closest(
        ".fluig-copy-field"
    );

    if (linhaCopia) {
        linhaCopia.classList.remove(
            "fluig-copy-field--success"
        );
    }

    contadorProjetosFluig = 0;
}


/* =========================================================
   17. CNPJ E ABERTURA DO FLUIG
   ========================================================= */

async function copiarCnpjDoModalFluig() {
    const elementos = obterElementosModalConsultaFluig();

    if (
        !elementos
        || !moduloFluigAtual
    ) {
        return;
    }

    try {
        await moduloFluigAtual
            .copiarCnpjParaPesquisa(
                elementos.campoCnpj.value
            );

        elementos.mensagemCopiaCnpj.textContent = (
            "CNPJ copiado. Agora cole o número na pesquisa do Fluig."
        );

        elementos.mensagemCopiaCnpj.classList.remove(
            "form-field__message--danger"
        );

        elementos.mensagemCopiaCnpj.classList.add(
            "form-field__message--success"
        );

        const linhaCopia = elementos.campoCnpj.closest(
            ".fluig-copy-field"
        );

        if (linhaCopia) {
            linhaCopia.classList.add(
                "fluig-copy-field--success"
            );
        }

        exibirNotificacao(
            "success",
            "CNPJ copiado",
            "Os 14 números foram enviados para a área de transferência."
        );
    } catch (erro) {
        elementos.mensagemCopiaCnpj.textContent = (
            obterMensagemDoErro(erro)
        );

        elementos.mensagemCopiaCnpj.classList.remove(
            "form-field__message--success"
        );

        elementos.mensagemCopiaCnpj.classList.add(
            "form-field__message--danger"
        );

        exibirNotificacao(
            "error",
            "Não foi possível copiar o CNPJ",
            obterMensagemDoErro(erro)
        );
    }
}


function abrirPortalPeloModalFluig() {
    const elementos = obterElementosModalConsultaFluig();

    if (
        !elementos
        || !moduloFluigAtual
    ) {
        return;
    }

    try {
        const url = moduloFluigAtual
            .configurarUrlPortalFluig(
                elementos.campoUrlPortal.value
            );

        elementos.campoUrlPortal.value = url;

        abrirUrlSeguraEmNovaAba(
            url
        );

        exibirNotificacao(
            "success",
            "Fluig aberto",
            "O portal foi aberto em uma nova aba."
        );
    } catch (erro) {
        exibirNotificacao(
            "error",
            "Não foi possível abrir o Fluig",
            obterMensagemDoErro(erro)
        );

        elementos.campoUrlPortal.focus();
    }
}


function abrirUrlSeguraEmNovaAba(
    url
) {
    const link = document.createElement("a");

    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    document.body.appendChild(link);

    link.click();
    link.remove();
}


/* =========================================================
   18. PROJETOS ENCONTRADOS NO FLUIG
   ========================================================= */

function atualizarSecoesResultadoFluig() {
    const elementos = obterElementosModalConsultaFluig();

    if (
        !elementos
        || !moduloFluigAtual
    ) {
        return;
    }

    const resultado = elementos.campoResultado.value;

    const resultados = (
        moduloFluigAtual.RESULTADOS_CONSULTA_FLUIG
    );

    elementos.mensagemErro.hidden = true;

    elementos.secaoNenhumProjeto.hidden = true;

    elementos.secaoProjetosEncontrados.hidden = true;

    elementos.botaoAdicionarProjeto.hidden = false;

    if (!resultado) {
        elementos.listaProjetos.innerHTML = "";
        contadorProjetosFluig = 0;

        return;
    }

    if (
        resultado
        === resultados.NENHUM_PROJETO
    ) {
        elementos.secaoNenhumProjeto.hidden = false;

        elementos.listaProjetos.innerHTML = "";

        contadorProjetosFluig = 0;

        return;
    }

    if (
        resultado
        === resultados.UM_PROJETO
    ) {
        elementos.secaoProjetosEncontrados.hidden = false;

        elementos.botaoAdicionarProjeto.hidden = true;

        garantirQuantidadeProjetosFluig(
            1,
            true
        );

        return;
    }

    if (
        resultado
        === resultados.VARIOS_PROJETOS
    ) {
        elementos.secaoProjetosEncontrados.hidden = false;

        elementos.botaoAdicionarProjeto.hidden = false;

        garantirQuantidadeProjetosFluig(
            2,
            false
        );
    }
}


function garantirQuantidadeProjetosFluig(
    quantidadeMinima,
    limitarQuantidade
) {
    const elementos = obterElementosModalConsultaFluig();

    if (!elementos) {
        return;
    }

    let cards = Array.from(
        elementos.listaProjetos.querySelectorAll(
            "[data-projeto-fluig]"
        )
    );

    if (
        limitarQuantidade
        && cards.length > quantidadeMinima
    ) {
        cards.slice(
            quantidadeMinima
        ).forEach(
            function (card) {
                card.remove();
            }
        );
    }

    cards = Array.from(
        elementos.listaProjetos.querySelectorAll(
            "[data-projeto-fluig]"
        )
    );

    while (cards.length < quantidadeMinima) {
        adicionarProjetoFluig();

        cards = Array.from(
            elementos.listaProjetos.querySelectorAll(
                "[data-projeto-fluig]"
            )
        );
    }

    atualizarTitulosProjetosFluig();
}


function adicionarProjetoFluig(
    dadosProjeto = {},
    selecionado = false
) {
    const elementos = obterElementosModalConsultaFluig();

    if (!elementos) {
        return;
    }

    contadorProjetosFluig += 1;

    const fragmento = elementos
        .templateProjeto
        .content
        .cloneNode(true);

    const card = fragmento.querySelector(
        "[data-projeto-fluig]"
    );

    const radio = card.querySelector(
        "[data-campo-projeto-selecionado]"
    );

    const botaoRemover = card.querySelector(
        "[data-botao-remover-projeto]"
    );

    const idCandidato = (
        dadosProjeto.idCandidato
        || (
            `PRJ-LOCAL-${Date.now()}-`
            + contadorProjetosFluig
        )
    );

    card.dataset.idCandidato = idCandidato;

    radio.value = idCandidato;
    radio.checked = Boolean(selecionado);

    card.querySelectorAll(
        "[data-campo-projeto]"
    ).forEach(
        function (campo) {
            const propriedade = (
                campo.dataset.campoProjeto
            );

            const valor = propriedade === "valor"
                ? obterValorProjetoParaCampo(
                    dadosProjeto
                )
                : dadosProjeto[propriedade];

            campo.value = (
                valor === null
                || valor === undefined
                    ? ""
                    : String(valor)
            );

            campo.addEventListener(
                "input",
                function () {
                    card.classList.remove(
                        "fluig-project-card--error"
                    );

                    if (propriedade === "valor") {
                        campo.value = aplicarMascaraMoeda(
                            campo.value
                        );
                    }

                    atualizarTitulosProjetosFluig();
                }
            );

            if (propriedade === "valor") {
                campo.addEventListener(
                    "blur",
                    function () {
                        campo.value = normalizarMascaraMoedaNaSaida(
                            campo.value
                        );
                    }
                );
            }
        }
    );

    radio.addEventListener(
        "change",
        atualizarSelecaoVisualProjetosFluig
    );

    botaoRemover.addEventListener(
        "click",
        function () {
            card.remove();

            atualizarTitulosProjetosFluig();
        }
    );

    elementos.listaProjetos.appendChild(
        fragmento
    );

    atualizarTitulosProjetosFluig();
    atualizarSelecaoVisualProjetosFluig();
}


function obterValorProjetoParaCampo(
    dadosProjeto
) {
    if (
        typeof dadosProjeto.valor === "number"
        && Number.isFinite(
            dadosProjeto.valor
        )
    ) {
        return dadosProjeto.valor.toLocaleString(
            "pt-BR",
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }
        );
    }

    return dadosProjeto.valor || "";
}


function atualizarTitulosProjetosFluig() {
    const elementos = obterElementosModalConsultaFluig();

    if (!elementos) {
        return;
    }

    const cards = Array.from(
        elementos.listaProjetos.querySelectorAll(
            "[data-projeto-fluig]"
        )
    );

    cards.forEach(
        function (card, indice) {
            const titulo = card.querySelector(
                "[data-titulo-projeto]"
            );

            const paa = obterValorCampoProjeto(
                card,
                "paa"
            );

            const nome = obterValorCampoProjeto(
                card,
                "nomeProjeto"
            );

            const idProjeto = obterValorCampoProjeto(
                card,
                "idProjeto"
            );

            const identificacao = (
                paa
                || nome
                || idProjeto
            );

            titulo.textContent = identificacao
                ? (
                    `Projeto ${indice + 1} — `
                    + identificacao
                )
                : `Projeto candidato ${indice + 1}`;
        }
    );
}


function atualizarSelecaoVisualProjetosFluig() {
    const elementos = obterElementosModalConsultaFluig();

    if (!elementos) {
        return;
    }

    elementos.listaProjetos.querySelectorAll(
        "[data-projeto-fluig]"
    ).forEach(
        function (card) {
            const radio = card.querySelector(
                "[data-campo-projeto-selecionado]"
            );

            card.classList.toggle(
                "fluig-project-card--selected",
                radio.checked
            );
        }
    );
}


function obterValorCampoProjeto(
    card,
    propriedade
) {
    const campo = card.querySelector(
        `[data-campo-projeto="${propriedade}"]`
    );

    return campo
        ? campo.value.trim()
        : "";
}


/* =========================================================
   19. SALVAMENTO DA CONSULTA AO FLUIG
   ========================================================= */

async function salvarConsultaFluig() {
    const elementos = obterElementosModalConsultaFluig();

    if (
        !elementos
        || !moduloFluigAtual
    ) {
        return;
    }

    const movimentacao = localizarMovimentacaoPorId(
        devolucaoEmConsultaId
    );

    if (!movimentacao) {
        return;
    }

    elementos.mensagemErro.hidden = true;

    const resultado = elementos.campoResultado.value;

    if (!resultado) {
        exibirErroNoModalFluig(
            elementos,
            "Informe quantos projetos foram encontrados no Fluig."
        );

        elementos.campoResultado.focus();

        return;
    }

    try {
        let projetos = [];
        let observacao = "";
        let projetoSelecionadoId = null;

        if (
            resultado
            === moduloFluigAtual
                .RESULTADOS_CONSULTA_FLUIG
                .NENHUM_PROJETO
        ) {
            observacao = elementos
                .observacaoNenhumProjeto
                .value
                .trim();
        } else {
            const coleta = coletarProjetosDoModalFluig(
                elementos,
                resultado
            );

            projetos = coleta.projetos;

            projetoSelecionadoId = (
                coleta.projetoSelecionadoId
            );

            observacao = elementos
                .observacaoConsulta
                .value
                .trim();
        }

        let consulta = moduloFluigAtual
            .criarRegistroConsultaFluig({
                devolucaoId: (
                    movimentacao.codigoDevolucao
                    || movimentacao.idTemporario
                ),

                resultado,
                projetos,
                observacao
            });

        if (projetoSelecionadoId) {
            consulta = moduloFluigAtual
                .confirmarProjetoDaConsulta(
                    consulta,
                    projetoSelecionadoId
                );
        }

        movimentacao.consultaFluig = consulta;

        movimentacao.statusFluig = (
            consulta.statusFluig
        );

        movimentacao.dataUltimaConsultaFluig = (
            consulta.dataConsulta
        );

        movimentacao.projetoConfirmado = (
            moduloFluigAtual.obterProjetoConfirmado(
                consulta
            )
        );

        if (movimentacao.projetoConfirmado) {
            movimentacao.statusComunicacao = (
                obterConstantesStatusComunicacao()
                    .PENDENTE
            );
        }

        await persistirMovimentacao(
            movimentacao,
            {
                conta:
                    resultadoInterpretacaoAtual
                    && resultadoInterpretacaoAtual.conta,

                periodo:
                    resultadoInterpretacaoAtual
                    && resultadoInterpretacaoAtual.periodo
            }
        );

        fecharModalConsultaFluig();

        atualizarInterfaceSemRolagem();

        exibirNotificacaoConsultaSalva(
            movimentacao,
            consulta
        );
    } catch (erro) {
        console.error(
            "Erro ao salvar a consulta ao Fluig:",
            erro
        );

        exibirErroNoModalFluig(
            elementos,
            obterMensagemDoErro(erro)
        );
    }
}


function coletarProjetosDoModalFluig(
    elementos,
    resultado
) {
    const cards = Array.from(
        elementos.listaProjetos.querySelectorAll(
            "[data-projeto-fluig]"
        )
    );

    const resultados = (
        moduloFluigAtual.RESULTADOS_CONSULTA_FLUIG
    );

    if (
        resultado === resultados.UM_PROJETO
        && cards.length !== 1
    ) {
        throw new moduloFluigAtual.ErroServicoFluig(
            "A consulta com um projeto deve possuir exatamente um cadastro.",
            "QUANTIDADE_PROJETOS_INCORRETA"
        );
    }

    if (
        resultado === resultados.VARIOS_PROJETOS
        && cards.length < 2
    ) {
        throw new moduloFluigAtual.ErroServicoFluig(
            "Cadastre pelo menos dois projetos para esse resultado.",
            "QUANTIDADE_PROJETOS_INCORRETA"
        );
    }

    let possuiErro = false;

    const projetos = cards.map(
        function (card) {
            card.classList.remove(
                "fluig-project-card--error"
            );

            const projeto = {
                idCandidato:
                    card.dataset.idCandidato,

                idProjeto:
                    obterValorCampoProjeto(
                        card,
                        "idProjeto"
                    ),

                paa:
                    obterValorCampoProjeto(
                        card,
                        "paa"
                    ),

                nomeProjeto:
                    obterValorCampoProjeto(
                        card,
                        "nomeProjeto"
                    ),

                instituicao:
                    obterValorCampoProjeto(
                        card,
                        "instituicao"
                    ),

                edital:
                    obterValorCampoProjeto(
                        card,
                        "edital"
                    ),

                valor:
                    obterValorCampoProjeto(
                        card,
                        "valor"
                    ),

                situacao:
                    obterValorCampoProjeto(
                        card,
                        "situacao"
                    ),

                observacao:
                    obterValorCampoProjeto(
                        card,
                        "observacao"
                    )
            };

            try {
                return moduloFluigAtual
                    .normalizarProjetoCandidato(
                        projeto
                    );
            } catch {
                possuiErro = true;

                card.classList.add(
                    "fluig-project-card--error"
                );

                return projeto;
            }
        }
    );

    if (possuiErro) {
        throw new moduloFluigAtual.ErroServicoFluig(
            "Cada projeto precisa possuir ao menos o ID, PAA ou nome.",
            "PROJETO_INCOMPLETO"
        );
    }

    const radioSelecionado = elementos
        .listaProjetos
        .querySelector(
            "[data-campo-projeto-selecionado]:checked"
        );

    if (!radioSelecionado) {
        throw new moduloFluigAtual.ErroServicoFluig(
            "Selecione qual projeto corresponde à devolução.",
            "PROJETO_NAO_SELECIONADO"
        );
    }

    return {
        projetos,

        projetoSelecionadoId:
            radioSelecionado.value
    };
}


function exibirErroNoModalFluig(
    elementos,
    mensagem
) {
    elementos.mensagemErro.textContent = mensagem;
    elementos.mensagemErro.hidden = false;

    elementos.mensagemErro.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
    });
}


function exibirNotificacaoConsultaSalva(
    movimentacao,
    consulta
) {
    const statusFluig = obterConstantesStatusFluig();

    if (
        consulta.statusFluig
        === statusFluig.PROJETO_IDENTIFICADO
    ) {
        const projeto = movimentacao.projetoConfirmado;

        const identificacao = projeto
            ? (
                projeto.paa
                || projeto.nomeProjeto
                || projeto.idProjeto
            )
            : "Projeto";

        exibirNotificacao(
            "success",
            "Projeto identificado",
            `${identificacao} foi relacionado à devolução ${movimentacao.codigoDevolucao}.`
        );

        return;
    }

    exibirNotificacao(
        "warning",
        "Projeto ainda não localizado",
        "A devolução foi mantida para uma nova consulta no Fluig."
    );
}


/* =========================================================
   20. MODAL DE COMUNICAÇÃO COM O FINANCEIRO
   ========================================================= */

function iniciarModalComunicacaoFinanceiro() {
    const elementos = (
        obterElementosModalComunicacaoFinanceiro()
    );

    if (!elementos) {
        return;
    }

    elementos.formulario.addEventListener(
        "submit",
        function (evento) {
            evento.preventDefault();
        }
    );

    elementos.botaoFechar.addEventListener(
        "click",
        fecharModalComunicacaoFinanceiro
    );

    elementos.botaoCancelar.addEventListener(
        "click",
        fecharModalComunicacaoFinanceiro
    );

    elementos.botaoGerarMensagem.addEventListener(
        "click",
        gerarMensagemFinanceiro
    );

    elementos.botaoCopiarMensagem.addEventListener(
        "click",
        copiarMensagemFinanceiro
    );

    elementos.botaoAbrirEmail.addEventListener(
        "click",
        abrirMensagemFinanceiroNoEmail
    );

    elementos.botaoConfirmarEnvio.addEventListener(
        "click",
        confirmarEnvioFinanceiro
    );

    elementos.corpoMensagem.addEventListener(
        "input",
        function () {
            elementos.corpoMensagem.classList.remove(
                "communication-message--error"
            );
        }
    );

    elementos.modal.addEventListener(
        "click",
        function (evento) {
            if (evento.target === elementos.modal) {
                fecharModalComunicacaoFinanceiro();
            }
        }
    );

    elementos.modal.addEventListener(
        "close",
        function () {
            movimentacaoEmComunicacaoId = null;

            limparModalComunicacaoFinanceiro(
                elementos
            );
        }
    );
}


function obterElementosModalComunicacaoFinanceiro() {
    const modal = document.getElementById(
        "modalComunicacaoFinanceiro"
    );

    if (!modal) {
        return null;
    }

    const elementos = {
        modal,

        formulario: document.getElementById(
            "formComunicacaoFinanceiro"
        ),

        campoMovimentacaoId: document.getElementById(
            "comunicacaoMovimentacaoId"
        ),

        statusContainer: modal.querySelector(
            ".communication-status"
        ),

        statusTitulo: document.getElementById(
            "statusComunicacaoFinanceiro"
        ),

        statusDescricao: document.getElementById(
            "descricaoStatusComunicacaoFinanceiro"
        ),

        resumoCodigo: document.getElementById(
            "financeiroResumoCodigo"
        ),

        resumoData: document.getElementById(
            "financeiroResumoData"
        ),

        resumoConta: document.getElementById(
            "financeiroResumoConta"
        ),

        resumoValor: document.getElementById(
            "financeiroResumoValor"
        ),

        resumoCnpj: document.getElementById(
            "financeiroResumoCnpj"
        ),

        resumoDocumento: document.getElementById(
            "financeiroResumoDocumento"
        ),

        resumoOrigem: document.getElementById(
            "financeiroResumoOrigem"
        ),

        projetoPaa: document.getElementById(
            "financeiroProjetoPaa"
        ),

        projetoInstituicao: document.getElementById(
            "financeiroProjetoInstituicao"
        ),

        projetoValor: document.getElementById(
            "financeiroProjetoValor"
        ),

        assunto: document.getElementById(
            "assuntoFinanceiro"
        ),

        observacaoAdicional: document.getElementById(
            "observacaoAdicionalFinanceiro"
        ),

        corpoMensagem: document.getElementById(
            "corpoMensagemFinanceiro"
        ),

        mensagemErro: document.getElementById(
            "mensagemErroComunicacaoFinanceiro"
        ),

        confirmacaoEnvio: document.getElementById(
            "confirmacaoEmailFinanceiroEnviado"
        ),

        observacaoEnvio: document.getElementById(
            "observacaoEnvioFinanceiro"
        ),

        botaoFechar: document.getElementById(
            "botaoFecharModalComunicacao"
        ),

        botaoCancelar: document.getElementById(
            "botaoCancelarComunicacaoFinanceiro"
        ),

        botaoGerarMensagem: document.getElementById(
            "botaoGerarMensagemFinanceiro"
        ),

        botaoCopiarMensagem: document.getElementById(
            "botaoCopiarMensagemFinanceiro"
        ),

        botaoAbrirEmail: document.getElementById(
            "botaoAbrirEmailFinanceiro"
        ),

        botaoConfirmarEnvio: document.getElementById(
            "botaoConfirmarEnvioFinanceiro"
        )
    };

    if (
        Object.values(elementos).some(
            function (elemento) {
                return !elemento;
            }
        )
    ) {
        console.error(
            "A estrutura do modal de comunicação está incompleta."
        );

        return null;
    }

    return elementos;
}


async function abrirModalComunicacaoFinanceiro(
    idMovimentacao
) {
    const elementos = (
        obterElementosModalComunicacaoFinanceiro()
    );

    if (
        !elementos
        || !resultadoInterpretacaoAtual
    ) {
        return;
    }

    const movimentacao = localizarMovimentacaoPorId(
        idMovimentacao
    );

    if (!movimentacao) {
        exibirNotificacao(
            "error",
            "Devolução não encontrada",
            "Não foi possível localizar a devolução selecionada."
        );

        return;
    }

    try {
        if (!moduloComunicacaoAtual) {
            moduloComunicacaoAtual = await import(
                "./finance-communication-service.js"
            );
        }

        const dados = moduloComunicacaoAtual
            .prepararDadosComunicacaoFinanceiro({
                movimentacao,

                conta:
                    resultadoInterpretacaoAtual.conta
            });

        movimentacaoEmComunicacaoId = (
            idMovimentacao
        );

        limparModalComunicacaoFinanceiro(
            elementos
        );

        preencherResumoComunicacao(
            elementos,
            movimentacao,
            dados
        );

        preencherMensagemComunicacaoExistente(
            elementos,
            movimentacao
        );

        elementos.modal.showModal();
        elementos.botaoFechar.focus();
    } catch (erro) {
        console.error(
            "Erro ao abrir a comunicação financeira:",
            erro
        );

        exibirNotificacao(
            "error",
            "Não foi possível preparar a comunicação",
            obterMensagemDoErro(erro)
        );
    }
}


function preencherResumoComunicacao(
    elementos,
    movimentacao,
    dados
) {
    elementos.campoMovimentacaoId.value = (
        movimentacao.idTemporario
    );

    elementos.resumoCodigo.value = (
        dados.codigoDevolucao || "—"
    );

    elementos.resumoData.value = formatarDataIsoParaBr(
        dados.dataMovimentacao
    );

    elementos.resumoConta.value = (
        dados.conta || "Não identificada"
    );

    elementos.resumoValor.value = (
        dados.valorFormatado || "R$ 0,00"
    );

    elementos.resumoCnpj.value = (
        dados.cnpjFormatado || "Não informado"
    );

    elementos.resumoDocumento.value = (
        dados.documentoBancario || "Não informado"
    );

    elementos.resumoOrigem.value = (
        dados.origem || "Não identificada"
    );

    elementos.projetoPaa.value = (
        dados.projeto.paa || "Não informado"
    );

    elementos.projetoInstituicao.value = (
        dados.projeto.instituicao || "Não informada"
    );

    elementos.projetoValor.value = (
        dados.projeto.valorFormatado
        || "Não informado"
    );
}


function preencherMensagemComunicacaoExistente(
    elementos,
    movimentacao
) {
    const mensagem = movimentacao.mensagemFinanceiro;

    if (!mensagem) {
        atualizarStatusComunicacaoModal(
            elementos,
            "pendente"
        );

        return;
    }

    elementos.assunto.value = (
        mensagem.assunto || ""
    );

    elementos.corpoMensagem.value = (
        mensagem.corpo || ""
    );

    elementos.corpoMensagem.classList.add(
        "communication-message--generated"
    );

    atualizarStatusComunicacaoModal(
        elementos,
        "preparada"
    );
}


function atualizarStatusComunicacaoModal(
    elementos,
    estado
) {
    elementos.statusContainer.classList.remove(
        "communication-status--prepared",
        "communication-status--sent"
    );

    if (estado === "preparada") {
        elementos.statusContainer.classList.add(
            "communication-status--prepared"
        );

        elementos.statusTitulo.textContent = (
            "Comunicação preparada"
        );

        elementos.statusDescricao.textContent = (
            "A mensagem foi gerada e está pronta para revisão e envio."
        );

        return;
    }

    if (estado === "enviada") {
        elementos.statusContainer.classList.add(
            "communication-status--sent"
        );

        elementos.statusTitulo.textContent = (
            "Comunicação enviada"
        );

        elementos.statusDescricao.textContent = (
            "O envio foi confirmado e a devolução será arquivada no histórico."
        );

        return;
    }

    elementos.statusTitulo.textContent = (
        "Comunicação pendente"
    );

    elementos.statusDescricao.textContent = (
        "O projeto já foi identificado, mas o setor financeiro ainda precisa ser comunicado."
    );
}


function limparModalComunicacaoFinanceiro(
    elementos
) {
    elementos.formulario.reset();

    elementos.mensagemErro.hidden = true;

    elementos.corpoMensagem.classList.remove(
        "communication-message--generated",
        "communication-message--error"
    );

    atualizarStatusComunicacaoModal(
        elementos,
        "pendente"
    );
}


function fecharModalComunicacaoFinanceiro() {
    const elementos = (
        obterElementosModalComunicacaoFinanceiro()
    );

    if (
        elementos
        && elementos.modal.open
    ) {
        elementos.modal.close();
    }
}


/* =========================================================
   21. GERAÇÃO DA MENSAGEM AO FINANCEIRO
   ========================================================= */

function gerarMensagemFinanceiro() {
    const elementos = (
        obterElementosModalComunicacaoFinanceiro()
    );

    const movimentacao = localizarMovimentacaoPorId(
        movimentacaoEmComunicacaoId
    );

    if (
        !elementos
        || !movimentacao
        || !moduloComunicacaoAtual
    ) {
        return;
    }

    elementos.mensagemErro.hidden = true;

    try {
        const mensagem = criarMensagemDoFormulario(
            elementos,
            movimentacao,
            false
        );

        movimentacao.mensagemFinanceiro = mensagem;

        elementos.assunto.value = mensagem.assunto;

        elementos.corpoMensagem.value = mensagem.corpo;

        elementos.corpoMensagem.classList.remove(
            "communication-message--error"
        );

        elementos.corpoMensagem.classList.add(
            "communication-message--generated"
        );

        atualizarStatusComunicacaoModal(
            elementos,
            "preparada"
        );

        exibirNotificacao(
            "success",
            "Mensagem preparada",
            "Revise o assunto e o corpo antes de realizar o envio."
        );
    } catch (erro) {
        exibirErroComunicacaoFinanceiro(
            elementos,
            obterMensagemDoErro(erro)
        );
    }
}


function criarMensagemDoFormulario(
    elementos,
    movimentacao,
    preservarCorpoAtual
) {
    const mensagem = moduloComunicacaoAtual
        .criarMensagemFinanceiro({
            movimentacao,

            conta:
                resultadoInterpretacaoAtual.conta,

            assuntoPersonalizado:
                elementos.assunto.value,

            observacaoAdicional:
                elementos.observacaoAdicional.value
        });

    const corpoAtual = elementos
        .corpoMensagem
        .value
        .trim();

    if (
        preservarCorpoAtual
        && corpoAtual
    ) {
        mensagem.corpo = corpoAtual;
    }

    return mensagem;
}


/* =========================================================
   22. CÓPIA E ABERTURA DO E-MAIL
   ========================================================= */

async function copiarMensagemFinanceiro() {
    const elementos = (
        obterElementosModalComunicacaoFinanceiro()
    );

    const movimentacao = localizarMovimentacaoPorId(
        movimentacaoEmComunicacaoId
    );

    if (
        !elementos
        || !movimentacao
        || !moduloComunicacaoAtual
    ) {
        return;
    }

    try {
        validarCorpoMensagem(
            elementos
        );

        const mensagem = criarMensagemDoFormulario(
            elementos,
            movimentacao,
            true
        );

        movimentacao.mensagemFinanceiro = mensagem;

        await moduloComunicacaoAtual
            .copiarMensagemFinanceiro(
                mensagem
            );

        atualizarStatusComunicacaoModal(
            elementos,
            "preparada"
        );

        exibirNotificacao(
            "success",
            "Mensagem copiada",
            "O assunto e o corpo foram enviados para a área de transferência."
        );
    } catch (erro) {
        exibirErroComunicacaoFinanceiro(
            elementos,
            obterMensagemDoErro(erro)
        );
    }
}


function abrirMensagemFinanceiroNoEmail() {
    const elementos = (
        obterElementosModalComunicacaoFinanceiro()
    );

    const movimentacao = localizarMovimentacaoPorId(
        movimentacaoEmComunicacaoId
    );

    if (
        !elementos
        || !movimentacao
        || !moduloComunicacaoAtual
    ) {
        return;
    }

    try {
        validarCorpoMensagem(
            elementos
        );

        const mensagem = criarMensagemDoFormulario(
            elementos,
            movimentacao,
            true
        );

        movimentacao.mensagemFinanceiro = mensagem;

        moduloComunicacaoAtual
            .abrirMensagemNoClienteEmail(
                mensagem
            );

        atualizarStatusComunicacaoModal(
            elementos,
            "preparada"
        );

        exibirNotificacao(
            "success",
            "Aplicativo de e-mail aberto",
            "Revise a mensagem no aplicativo e conclua o envio."
        );
    } catch (erro) {
        exibirErroComunicacaoFinanceiro(
            elementos,
            obterMensagemDoErro(erro)
        );
    }
}


/* =========================================================
   23. CONFIRMAÇÃO DO ENVIO
   ========================================================= */

async function confirmarEnvioFinanceiro() {
    const elementos = (
        obterElementosModalComunicacaoFinanceiro()
    );

    const movimentacao = localizarMovimentacaoPorId(
        movimentacaoEmComunicacaoId
    );

    if (
        !elementos
        || !movimentacao
        || !moduloComunicacaoAtual
    ) {
        return;
    }

    elementos.mensagemErro.hidden = true;

    if (!elementos.confirmacaoEnvio.checked) {
        exibirErroComunicacaoFinanceiro(
            elementos,
            "Confirme que a mensagem foi realmente enviada ao setor financeiro."
        );

        elementos.confirmacaoEnvio.focus();

        return;
    }

    try {
        validarCorpoMensagem(
            elementos
        );

        const mensagem = criarMensagemDoFormulario(
            elementos,
            movimentacao,
            true
        );

        const registroPreparado = moduloComunicacaoAtual
            .criarRegistroComunicacao({
                mensagem,

                canal:
                    moduloComunicacaoAtual
                        .CANAIS_COMUNICACAO
                        .EMAIL,

                observacao:
                    elementos.observacaoAdicional
                        .value
                        .trim()
            });

        const registroEnviado = moduloComunicacaoAtual
            .marcarComunicacaoComoEnviada({
                registro:
                    registroPreparado,

                observacaoEnvio:
                    elementos.observacaoEnvio
                        .value
                        .trim()
            });

        movimentacao.mensagemFinanceiro = mensagem;

        movimentacao.registroComunicacao = (
            registroEnviado
        );

        movimentacao.statusComunicacao = (
            registroEnviado.status
        );

        movimentacao.situacaoOperacional = (
            "concluida"
        );

        movimentacao.dataConclusao = (
            registroEnviado.dataEnvio
        );

        await persistirMovimentacao(
            movimentacao,
            {
                conta:
                    resultadoInterpretacaoAtual
                    && resultadoInterpretacaoAtual.conta,

                periodo:
                    resultadoInterpretacaoAtual
                    && resultadoInterpretacaoAtual.periodo
            }
        );

        atualizarStatusComunicacaoModal(
            elementos,
            "enviada"
        );

        fecharModalComunicacaoFinanceiro();

        atualizarInterfaceSemRolagem();

        exibirNotificacao(
            "success",
            "Devolução concluída",
            `${movimentacao.codigoDevolucao} foi comunicada e adicionada ao histórico recente.`
        );
    } catch (erro) {
        exibirErroComunicacaoFinanceiro(
            elementos,
            obterMensagemDoErro(erro)
        );
    }
}




function validarCorpoMensagem(
    elementos
) {
    const assunto = elementos.assunto.value.trim();

    const corpo = elementos.corpoMensagem.value.trim();

    elementos.corpoMensagem.classList.remove(
        "communication-message--error"
    );

    if (!assunto) {
        elementos.assunto.focus();

        throw new moduloComunicacaoAtual
            .ErroServicoComunicacao(
                "Gere ou informe o assunto da mensagem.",
                "ASSUNTO_NAO_INFORMADO"
            );
    }

    if (!corpo) {
        elementos.corpoMensagem.classList.add(
            "communication-message--error"
        );

        elementos.corpoMensagem.focus();

        throw new moduloComunicacaoAtual
            .ErroServicoComunicacao(
                "Gere ou informe o corpo da mensagem.",
                "CORPO_NAO_INFORMADO"
            );
    }
}


function exibirErroComunicacaoFinanceiro(
    elementos,
    mensagem
) {
    elementos.mensagemErro.textContent = mensagem;
    elementos.mensagemErro.hidden = false;

    elementos.mensagemErro.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
    });

    exibirNotificacao(
        "error",
        "Revise a comunicação",
        mensagem
    );
}


/* =========================================================
   24. HISTÓRICO RECENTE
   ========================================================= */

/* =========================================================
   MODAL DE HISTÓRICO COMPLETO
   ========================================================= */

function obterElementosModalDetalheDevolucao() {
    const modal = document.getElementById(
        "modalDetalheDevolucao"
    );

    if (!modal) {
        return null;
    }

    return {
        modal,

        subtitulo: document.getElementById(
            "subtituloModalDetalheDevolucao"
        ),

        conteudo: document.getElementById(
            "conteudoDetalheDevolucao"
        ),

        botaoFechar: document.getElementById(
            "botaoFecharModalDetalheDevolucao"
        ),

        botaoFecharRodape: document.getElementById(
            "botaoFecharDetalheDevolucaoRodape"
        )
    };
}


function iniciarModalDetalheDevolucao() {
    const elementos = obterElementosModalDetalheDevolucao();

    if (!elementos) {
        return;
    }

    elementos.botaoFechar.addEventListener(
        "click",
        function () {
            elementos.modal.close();
        }
    );

    elementos.botaoFecharRodape.addEventListener(
        "click",
        function () {
            elementos.modal.close();
        }
    );
}


/*
 * Abre o modal já mostrando o fluxo completo de UMA devolução
 * específica — nunca uma lista para escolher. É chamado a partir
 * do botão "Ver detalhes" de cada card do histórico recente.
 */
function abrirDetalheDevolucao(
    movimentacao
) {
    const elementos = obterElementosModalDetalheDevolucao();

    if (!elementos || !movimentacao) {
        return;
    }

    elementos.subtitulo.textContent = (
        `Fluxo completo de ${movimentacao.codigoDevolucao || "esta devolução"}.`
    );

    elementos.conteudo.innerHTML = "";

    preencherDetalhesHistorico(
        elementos.conteudo,
        movimentacao
    );

    elementos.modal.showModal();
}




function preencherDetalhesHistorico(
    container,
    movimentacao
) {
    container.appendChild(
        criarSecaoDetalheHistorico(
            "↩",
            "Dados do extrato",
            [
                ["Data", formatarDataIsoParaBr(movimentacao.dataMovimento)],
                ["Hora", movimentacao.hora || "Não informado"],
                ["Conta", movimentacao.conta || "Não informada"],
                ["Valor", movimentacao.valorFormatado || "Não informado"],
                ["CNPJ", movimentacao.cnpjFormatado || "Não informado"],
                ["Origem no extrato", movimentacao.identificacaoOrigem || "Não informado"],
                ["Documento", movimentacao.documento || "Não informado"]
            ]
        )
    );

    if (movimentacao.entidadeIdentificada) {
        container.appendChild(
            criarSecaoDetalheHistorico(
                "⌘",
                "Entidade identificada",
                [
                    ["Nome", movimentacao.entidadeIdentificada.nomeReduzido || "Não informado"],
                    ["UF", movimentacao.entidadeIdentificada.uf || "Não informada"]
                ]
            )
        );
    }

    if (movimentacao.projetoConfirmado) {
        container.appendChild(
            criarSecaoDetalheHistorico(
                "▥",
                "Projeto no Fluig",
                [
                    ["PAA", movimentacao.projetoConfirmado.paa || "Não informado"],
                    ["Instituição", movimentacao.projetoConfirmado.instituicao || "Não informada"],
                    ["Valor do projeto", movimentacao.projetoConfirmado.valorFormatado || "Não informado"]
                ]
            )
        );
    }

    if (movimentacao.mensagemFinanceiro) {
        container.appendChild(
            criarSecaoMensagemHistorico(
                movimentacao.mensagemFinanceiro
            )
        );
    }

    container.appendChild(
        criarSecaoComprovanteHistorico(
            movimentacao
        )
    );

    container.appendChild(
        criarSecaoDetalheHistorico(
            "↻",
            "Linha do tempo",
            [
                ["Confirmada em", formatarDataHoraIso(movimentacao.dataConfirmacao)],
                ["Última consulta ao Fluig", formatarDataHoraIso(movimentacao.dataUltimaConsultaFluig)],
                ["Concluída em", formatarDataHoraIso(movimentacao.dataConclusao)]
            ]
        )
    );
}


/*
 * Monta o cabeçalho padrão (ícone + título) usado em todas as
 * seções de detalhe do histórico.
 */
function criarCabecalhoSecaoHistorico(
    icone,
    titulo
) {
    const cabecalho = document.createElement("div");

    cabecalho.className = (
        "history-full-item__section-header"
    );

    const iconeElemento = document.createElement("span");

    iconeElemento.className = (
        "history-full-item__section-icon"
    );

    iconeElemento.setAttribute(
        "aria-hidden",
        "true"
    );

    iconeElemento.textContent = icone;

    const tituloElemento = document.createElement("h5");

    tituloElemento.textContent = titulo;

    cabecalho.append(
        iconeElemento,
        tituloElemento
    );

    return cabecalho;
}


function criarSecaoDetalheHistorico(
    icone,
    titulo,
    pares
) {
    const secao = document.createElement("div");

    secao.className = "history-full-item__section";

    secao.appendChild(
        criarCabecalhoSecaoHistorico(
            icone,
            titulo
        )
    );

    const grade = document.createElement("div");

    grade.className = (
        "history-full-item__field-grid"
    );

    pares.forEach(
        function ([rotulo, valor]) {
            const campo = document.createElement("div");

            campo.className = (
                "history-full-item__field"
            );

            const rotuloElemento = document.createElement(
                "span"
            );

            rotuloElemento.className = (
                "history-full-item__field-label"
            );

            rotuloElemento.textContent = rotulo;

            const valorElemento = document.createElement(
                "span"
            );

            valorElemento.className = (
                "history-full-item__field-value"
            );

            valorElemento.textContent = valor;

            campo.append(
                rotuloElemento,
                valorElemento
            );

            grade.appendChild(
                campo
            );
        }
    );

    secao.appendChild(
        grade
    );

    return secao;
}


function criarSecaoMensagemHistorico(
    mensagem
) {
    const secao = document.createElement("div");

    secao.className = "history-full-item__section";

    secao.appendChild(
        criarCabecalhoSecaoHistorico(
            "✉",
            "Mensagem enviada ao financeiro"
        )
    );

    const assunto = document.createElement("p");

    assunto.className = (
        "history-full-item__message-meta"
    );

    assunto.innerHTML = (
        `<strong>Assunto:</strong> `
        + (mensagem.assunto || "Não informado")
    );

    const corpo = document.createElement("div");

    corpo.className = "history-full-item__message";
    corpo.textContent = mensagem.corpo || "";

    secao.append(
        assunto,
        corpo
    );

    return secao;
}


function criarSecaoComprovanteHistorico(
    movimentacao
) {
    const secao = document.createElement("div");

    secao.className = "history-full-item__section";

    secao.appendChild(
        criarCabecalhoSecaoHistorico(
            "▣",
            "Comprovante"
        )
    );

    if (movimentacao.comprovante) {
        const botaoVer = document.createElement("button");

        botaoVer.type = "button";
        botaoVer.className = "button button--text";
        botaoVer.textContent = (
            `Ver ${movimentacao.comprovante.nomeArquivo || "comprovante"}`
        );

        botaoVer.addEventListener(
            "click",
            function () {
                visualizarComprovante(
                    movimentacao.comprovante
                );
            }
        );

        secao.appendChild(
            botaoVer
        );
    } else {
        const semComprovante = document.createElement("p");

        semComprovante.className = (
            "history-full-item__message-meta"
        );

        semComprovante.textContent = (
            "Nenhum comprovante anexado."
        );

        secao.appendChild(
            semComprovante
        );
    }

    return secao;
}


function iniciarBuscaHistoricoRecente() {
    const campoBusca = document.getElementById(
        "buscaHistoricoRecente"
    );

    if (!campoBusca) {
        return;
    }

    campoBusca.addEventListener(
        "input",
        function () {
            atualizarHistoricoRecente(
                campoBusca.value
            );
        }
    );
}


/*
 * Filtra por valor (formatado ou número puro), instituição
 * (entidade identificada, instituição do projeto ou origem do
 * extrato) e número do PAA — tudo em um único campo de busca,
 * sem diferenciar maiúsculas/minúsculas ou acento.
 */
function filtrarHistoricoRecente(
    lista,
    termoBusca
) {
    const termo = normalizarTextoParaBusca(
        termoBusca
    );

    if (!termo) {
        return lista;
    }

    return lista.filter(
        function (movimentacao) {
            const camposPesquisaveis = [
                movimentacao.valorFormatado,
                String(movimentacao.valor ?? ""),
                movimentacao.entidadeIdentificada?.nomeReduzido,
                movimentacao.projetoConfirmado?.instituicao,
                movimentacao.identificacaoOrigem,
                movimentacao.projetoConfirmado?.paa,
                movimentacao.codigoDevolucao
            ];

            return camposPesquisaveis.some(
                function (campo) {
                    return normalizarTextoParaBusca(
                        campo
                    ).includes(
                        termo
                    );
                }
            );
        }
    );
}


function normalizarTextoParaBusca(
    valor
) {
    return String(valor || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}


function atualizarHistoricoRecente(
    termoBusca
) {
    const painel = obterPainelHistoricoRecente();

    if (!painel) {
        return;
    }

    /*
     * Quando chamada sem argumento (por exemplo, depois de
     * anexar um comprovante), preserva o que já estava digitado
     * na busca, em vez de limpar o filtro sem avisar o usuário.
     */
    const termoReal = termoBusca !== undefined
        ? termoBusca
        : (
            document.getElementById(
                "buscaHistoricoRecente"
            )?.value
            || ""
        );

    painel.querySelectorAll(
        ".history-list-aziel, .empty-state"
    ).forEach(
        function (elemento) {
            elemento.remove();
        }
    );

    /*
     * A lista vem do controlador de persistência (registros
     * salvos no IndexedDB), não mais só do PDF processado nesta
     * sessão — assim, o histórico sobrevive a um F5. Sem limite
     * prático, já que a lista tem rolagem própria.
     */
    const todasConcluidas = listarConcluidasPersistidas({
        limite: 1000
    });

    const concluidas = filtrarHistoricoRecente(
        todasConcluidas,
        termoReal
    );

    if (todasConcluidas.length === 0) {
        painel.appendChild(
            criarEstadoVazioHistorico()
        );

        return;
    }

    if (concluidas.length === 0) {
        const semResultado = document.createElement(
            "div"
        );

        semResultado.className = "empty-state";

        semResultado.innerHTML = (
            "<p>Nenhum resultado para essa busca.</p>"
        );

        painel.appendChild(
            semResultado
        );

        return;
    }

    const lista = document.createElement("div");

    lista.className = "history-list-aziel";

    lista.style.display = "flex";
    lista.style.flexDirection = "column";
    lista.style.gap = "14px";

    concluidas.forEach(
        function (movimentacao) {
            lista.appendChild(
                criarRegistroHistorico(
                    movimentacao
                )
            );
        }
    );

    painel.appendChild(lista);
}


function obterPainelHistoricoRecente() {
    const paineis = Array.from(
        document.querySelectorAll(".panel")
    );

    return (
        paineis.find(
            function (painel) {
                const titulo = painel.querySelector(
                    "h3"
                );

                return (
                    titulo
                    && titulo.textContent
                        .trim()
                        .toLowerCase()
                        .includes(
                            "histórico recente"
                        )
                );
            }
        )
        || null
    );
}


function criarEstadoVazioHistorico() {
    const estado = document.createElement("div");

    estado.className = "empty-state";

    const icone = document.createElement("div");

    icone.className = "empty-state__icon";
    icone.setAttribute("aria-hidden", "true");
    icone.textContent = "↪";

    const titulo = document.createElement("h4");

    titulo.textContent = (
        "Nenhuma devolução processada"
    );

    const descricao = document.createElement("p");

    descricao.textContent = (
        "Os registros concluídos aparecerão aqui depois que "
        + "a comunicação ao financeiro for confirmada."
    );

    estado.append(
        icone,
        titulo,
        descricao
    );

    return estado;
}


function criarRegistroHistorico(
    movimentacao
) {
    const registro = document.createElement("article");

    registro.className = "communication-record";

    const informacoes = document.createElement("div");

    informacoes.className = (
        "communication-record__information"
    );

    const titulo = document.createElement("strong");

    const projeto = movimentacao.projetoConfirmado;

    const identificacaoProjeto = projeto
        ? (
            projeto.paa
            || projeto.nomeProjeto
            || projeto.idProjeto
            || "Projeto identificado"
        )
        : "Projeto identificado";

    titulo.textContent = (
        `${movimentacao.codigoDevolucao} — `
        + identificacaoProjeto
    );

    const detalhes = document.createElement("p");

    detalhes.textContent = [
        movimentacao.valorFormatado || "Valor não informado",

        movimentacao.cnpjFormatado
        || movimentacao.identificacaoOrigem
        || "Origem não identificada",

        `Comunicada em ${formatarDataHoraIso(
            movimentacao.dataConclusao
        )}`
    ].join(" • ");

    informacoes.append(
        titulo,
        detalhes
    );

    const status = document.createElement("span");

    status.className = (
        "status status--completed"
    );

    status.textContent = "Concluída";

    const areaComprovante = criarAreaComprovante(
        movimentacao
    );

    const ladoDireito = document.createElement("div");

    ladoDireito.className = "history-card__side";

    ladoDireito.append(
        status,
        areaComprovante
    );

    registro.className += " history-card";

    registro.append(
        informacoes,
        ladoDireito
    );

    return registro;
}


/*
 * Monta a área de comprovante de um card do histórico: um botão
 * para anexar (quando ainda não existe) ou os botões de ver e
 * trocar (quando já existe um comprovante salvo).
 */
function criarAreaComprovante(
    movimentacao
) {
    const area = document.createElement("div");

    area.className = "history-card__actions";

    const botaoVerDetalhes = document.createElement("button");

    botaoVerDetalhes.type = "button";
    botaoVerDetalhes.className = "button button--text";
    botaoVerDetalhes.textContent = "Ver detalhes";

    botaoVerDetalhes.addEventListener(
        "click",
        function () {
            abrirDetalheDevolucao(
                movimentacao
            );
        }
    );

    area.appendChild(
        botaoVerDetalhes
    );

    const campoArquivo = document.createElement("input");

    campoArquivo.type = "file";
    campoArquivo.accept = "application/pdf,image/*";
    campoArquivo.hidden = true;

    campoArquivo.addEventListener(
        "change",
        async function () {
            const arquivo = campoArquivo.files[0];

            if (!arquivo) {
                return;
            }

            await anexarComprovante(
                movimentacao,
                arquivo
            );
        }
    );

    area.appendChild(
        campoArquivo
    );

    if (movimentacao.comprovante) {
        const botaoVer = document.createElement("button");

        botaoVer.type = "button";
        botaoVer.className = "button button--text";
        botaoVer.textContent = "Ver comprovante";

        botaoVer.addEventListener(
            "click",
            function () {
                visualizarComprovante(
                    movimentacao.comprovante
                );
            }
        );

        const botaoTrocar = document.createElement("button");

        botaoTrocar.type = "button";
        botaoTrocar.className = "button button--text";
        botaoTrocar.textContent = "Trocar";

        botaoTrocar.addEventListener(
            "click",
            function () {
                campoArquivo.click();
            }
        );

        area.append(
            botaoVer,
            botaoTrocar
        );
    } else {
        const botaoAnexar = document.createElement("button");

        botaoAnexar.type = "button";
        botaoAnexar.className = "button button--text";
        botaoAnexar.textContent = "Anexar comprovante";

        botaoAnexar.addEventListener(
            "click",
            function () {
                campoArquivo.click();
            }
        );

        area.appendChild(
            botaoAnexar
        );
    }

    return area;
}


/*
 * Salva o arquivo selecionado como comprovante da devolução,
 * atualizando o registro já existente no IndexedDB (não cria um
 * registro novo, porque a movimentação já tem idPersistencia).
 */
async function anexarComprovante(
    movimentacao,
    arquivo
) {
    const LIMITE_TAMANHO_BYTES = 15 * 1024 * 1024; // 15 MB

    if (arquivo.size > LIMITE_TAMANHO_BYTES) {
        exibirNotificacao(
            "error",
            "Arquivo muito grande",
            "O comprovante precisa ter no máximo 15 MB."
        );

        return;
    }

    try {
        const movimentacaoAtualizada = {
            ...movimentacao,

            comprovante: {
                nomeArquivo: arquivo.name,
                tipoArquivo: arquivo.type,
                dataAnexo: new Date().toISOString(),
                conteudo: arquivo
            }
        };

        await persistirMovimentacao(
            movimentacaoAtualizada,
            {
                conta: movimentacao.conta,
                agencia: movimentacao.agencia,
                periodo: movimentacao.periodo
            }
        );

        exibirNotificacao(
            "success",
            "Comprovante anexado",
            `"${arquivo.name}" foi salvo junto com ${movimentacao.codigoDevolucao}.`
        );

        atualizarHistoricoRecente();
    } catch (erro) {
        exibirNotificacao(
            "error",
            "Não foi possível anexar o comprovante",
            obterMensagemDoErro(erro)
        );
    }
}


/*
 * Abre o comprovante em uma nova aba (funciona bem para PDF e
 * imagens, que é o que o campo de anexo aceita).
 */
function visualizarComprovante(
    comprovante
) {
    if (
        !comprovante
        || !comprovante.conteudo
    ) {
        return;
    }

    const url = URL.createObjectURL(
        comprovante.conteudo
    );

    window.open(
        url,
        "_blank"
    );

    /*
     * O URL fica válido enquanto a aba estiver aberta; liberamos
     * a memória depois de um tempo generoso, sem depender do
     * usuário fechar a aba.
     */
    setTimeout(
        function () {
            URL.revokeObjectURL(
                url
            );
        },
        60000
    );
}


/* =========================================================
   25. LOCALIZAÇÃO DE MOVIMENTAÇÕES
   ========================================================= */

function localizarMovimentacaoPorId(
    idMovimentacao
) {
    if (
        !resultadoInterpretacaoAtual
        || !idMovimentacao
    ) {
        return null;
    }

    return (
        resultadoInterpretacaoAtual.movimentacoes.find(
            function (movimentacao) {
                return (
                    movimentacao.idTemporario
                    === idMovimentacao
                );
            }
        )
        || null
    );
}


/* =========================================================
   26. PAINEL DE ERRO E RESULTADO
   ========================================================= */

function exibirErroImportacao(
    elementos,
    mensagem
) {
    const painelResultado = obterOuCriarPainelResultado(
        elementos
    );

    painelResultado.classList.add(
        "pdf-result--error"
    );

    painelResultado.innerHTML = `
        <div class="pdf-result__error">
            <span
                class="pdf-result__error-icon"
                aria-hidden="true"
            >
                !
            </span>

            <div>
                <h3>Não foi possível processar o extrato</h3>
                <p data-pdf-error-message></p>
            </div>
        </div>
    `;

    painelResultado.querySelector(
        "[data-pdf-error-message]"
    ).textContent = mensagem;

    painelResultado.hidden = false;
}


function obterOuCriarPainelResultado(
    elementos
) {
    let painelResultado = document.getElementById(
        "resultadoLeituraPdf"
    );

    if (painelResultado) {
        return painelResultado;
    }

    painelResultado = document.createElement(
        "section"
    );

    painelResultado.id = "resultadoLeituraPdf";

    painelResultado.className = (
        "panel pdf-result"
    );

    painelResultado.hidden = true;

    const gridDevolucoes = elementos
        .campoArquivo
        .closest(
            ".devolucoes-grid"
        );

    if (gridDevolucoes) {
        gridDevolucoes.insertAdjacentElement(
            "afterend",
            painelResultado
        );

        return painelResultado;
    }

    const painelImportacao = elementos
        .campoArquivo
        .closest(
            ".panel"
        );

    if (painelImportacao) {
        painelImportacao.insertAdjacentElement(
            "afterend",
            painelResultado
        );
    }

    return painelResultado;
}


function limparResultadoProcessamento() {
    const painelResultado = document.getElementById(
        "resultadoLeituraPdf"
    );

    if (painelResultado) {
        painelResultado.remove();
    }
}


/* =========================================================
   27. NOTIFICAÇÕES
   ========================================================= */

function iniciarNotificacaoAziel() {
    const botaoFechar = document.getElementById(
        "botaoFecharNotificacao"
    );

    if (!botaoFechar) {
        return;
    }

    botaoFechar.addEventListener(
        "click",
        fecharNotificacao
    );
}


function exibirNotificacao(
    tipo,
    titulo,
    texto
) {
    const notificacao = document.getElementById(
        "notificacaoAziel"
    );

    if (!notificacao) {
        console.log(
            titulo,
            texto
        );

        return;
    }

    const icone = document.getElementById(
        "iconeNotificacaoAziel"
    );

    const tituloElemento = document.getElementById(
        "tituloNotificacaoAziel"
    );

    const textoElemento = document.getElementById(
        "textoNotificacaoAziel"
    );

    notificacao.classList.remove(
        "app-notification--success",
        "app-notification--error",
        "app-notification--warning"
    );

    const configuracoes = {
        success: {
            classe: "app-notification--success",
            icone: "✓"
        },

        error: {
            classe: "app-notification--error",
            icone: "!"
        },

        warning: {
            classe: "app-notification--warning",
            icone: "!"
        }
    };

    const configuracao = (
        configuracoes[tipo]
        || configuracoes.success
    );

    notificacao.classList.add(
        configuracao.classe
    );

    icone.textContent = configuracao.icone;
    tituloElemento.textContent = titulo;
    textoElemento.textContent = texto;

    notificacao.hidden = false;

    window.clearTimeout(
        temporizadorNotificacao
    );

    temporizadorNotificacao = window.setTimeout(
        fecharNotificacao,
        5000
    );
}


function fecharNotificacao() {
    const notificacao = document.getElementById(
        "notificacaoAziel"
    );

    if (!notificacao) {
        return;
    }

    notificacao.hidden = true;

    window.clearTimeout(
        temporizadorNotificacao
    );
}


/* =========================================================
   28. CONSTANTES AUXILIARES
   ========================================================= */

function obterConstantesStatusFluig() {
    if (moduloFluigAtual) {
        return moduloFluigAtual.STATUS_FLUIG;
    }

    return {
        CONSULTA_PENDENTE:
            "consulta_fluig_pendente",

        AGUARDANDO_PROJETO:
            "aguardando_projeto_no_fluig",

        UM_PROJETO_ENCONTRADO:
            "um_projeto_encontrado",

        VARIOS_PROJETOS_ENCONTRADOS:
            "varios_projetos_encontrados",

        PROJETO_IDENTIFICADO:
            "projeto_identificado",

        CONSULTA_COM_ERRO:
            "consulta_com_erro"
    };
}


function obterConstantesStatusComunicacao() {
    if (moduloComunicacaoAtual) {
        return moduloComunicacaoAtual
            .STATUS_COMUNICACAO;
    }

    return {
        PENDENTE:
            "comunicacao_pendente",

        PREPARADA:
            "comunicacao_preparada",

        ENVIADA:
            "comunicacao_enviada",

        CANCELADA:
            "comunicacao_cancelada",

        ERRO:
            "erro_na_comunicacao"
    };
}


/* =========================================================
   29. FUNÇÕES AUXILIARES
   ========================================================= */

function atualizarInterfaceSemRolagem() {
    const elementosImportacao = (
        obterElementosImportacao()
    );

    if (elementosImportacao) {
        atualizarInterfaceCompleta(
            elementosImportacao,
            false
        );
    }
}


function adicionarCelula(
    linha,
    texto
) {
    const celula = document.createElement("td");

    celula.textContent = texto;

    linha.appendChild(celula);
}


function criarResumoInterpretacao(
    interpretacao
) {
    const resumo = interpretacao.resumo;

    return (
        `${resumo.totalMovimentacoes} movimentação(ões), `
        + `${resumo.totalPossiveisDevolucoes} aguardando confirmação, `
        + `${resumo.totalConfirmadas || 0} confirmada(s), `
        + `${resumo.totalConcluidas || 0} concluída(s), `
        + `${resumo.totalDescartadas || 0} descartada(s), `
        + `${resumo.totalMovimentacoesInternas} interna(s) e `
        + `${resumo.totalParaRevisao} item(ns) para revisão.`
    );
}


function formatarPeriodo(periodo) {
    if (
        !periodo
        || !periodo.inicio
        || !periodo.fim
    ) {
        return "Não identificado";
    }

    return (
        formatarDataIsoParaBr(
            periodo.inicio
        )
        + " a "
        + formatarDataIsoParaBr(
            periodo.fim
        )
    );
}


function formatarDataIsoParaBr(
    dataIso
) {
    if (
        typeof dataIso !== "string"
        || !/^\d{4}-\d{2}-\d{2}$/.test(
            dataIso
        )
    ) {
        return "—";
    }

    const [
        ano,
        mes,
        dia
    ] = dataIso.split("-");

    return `${dia}/${mes}/${ano}`;
}


function formatarDataHoraIso(
    dataIso
) {
    if (!dataIso) {
        return "data não informada";
    }

    const data = new Date(
        dataIso
    );

    if (
        Number.isNaN(
            data.getTime()
        )
    ) {
        return "data não informada";
    }

    return new Intl.DateTimeFormat(
        "pt-BR",
        {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }
    ).format(data);
}



function formatarTamanhoArquivo(
    tamanhoEmBytes
) {
    if (tamanhoEmBytes === 0) {
        return "0 bytes";
    }

    const unidades = [
        "bytes",
        "KB",
        "MB",
        "GB"
    ];

    const base = 1024;

    const indiceCalculado = Math.floor(
        Math.log(tamanhoEmBytes)
        / Math.log(base)
    );

    const indiceUnidade = Math.min(
        indiceCalculado,
        unidades.length - 1
    );

    const tamanhoConvertido = (
        tamanhoEmBytes
        / Math.pow(
            base,
            indiceUnidade
        )
    );

    const casas = indiceUnidade === 0
        ? 0
        : 2;

    return (
        tamanhoConvertido.toLocaleString(
            "pt-BR",
            {
                minimumFractionDigits: 0,
                maximumFractionDigits: casas
            }
        )
        + " "
        + unidades[indiceUnidade]
    );
}


function criarPreviaTexto(
    textoCompleto
) {
    const limiteCaracteres = 6000;

    if (
        textoCompleto.length
        <= limiteCaracteres
    ) {
        return textoCompleto;
    }

    return (
        textoCompleto.slice(
            0,
            limiteCaracteres
        )
        + "\n\n[Prévia limitada pelo Aziel]"
    );
}


function criarTextoQuantidade(
    quantidade,
    singular,
    plural
) {
    return (
        quantidade
        + " "
        + (
            quantidade === 1
                ? singular
                : plural
        )
    );
}


/* =========================================================
   30. STATUS DA IMPORTAÇÃO
   ========================================================= */

function atualizarStatusImportacao(
    elementoStatus,
    texto,
    classeNova
) {
    if (!elementoStatus) {
        return;
    }

    removerClassesDeStatus(
        elementoStatus
    );

    elementoStatus.classList.add(
        classeNova
    );

    elementoStatus.textContent = texto;
}


function removerClassesDeStatus(
    elemento
) {
    elemento.classList.remove(
        "status--pending",
        "status--success",
        "status--review",
        "status--danger",
        "status--information",
        "status--completed"
    );
}


/* =========================================================
   31. EXECUÇÃO
   ========================================================= */

iniciarAziel();