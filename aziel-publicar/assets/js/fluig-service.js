"use strict";

/*
 * =========================================================
 * AZIEL — SERVIÇO DE CONSULTA AO FLUIG
 * =========================================================
 *
 * Responsabilidades deste arquivo:
 *
 * - preparar os dados usados na pesquisa do Fluig;
 * - copiar o CNPJ sem pontuação;
 * - abrir o portal configurado;
 * - registrar resultados de consultas;
 * - organizar projetos candidatos;
 * - permitir a confirmação manual do projeto correto;
 * - definir o próximo status da devolução.
 *
 * Este arquivo NÃO:
 *
 * - acessa automaticamente o Fluig;
 * - armazena usuário ou senha;
 * - executa cliques no portal;
 * - escolhe o projeto automaticamente;
 * - envia dados para servidores externos.
 */

import {
    limparCnpj,
    formatarCnpj,
    validarCnpj,
    converterValorBrasileiroParaNumero,
    formatarMoedaBrasileira
} from "./statement-parser.js";


/* =========================================================
   1. CONFIGURAÇÃO DO PORTAL
   ========================================================= */

/*
 * O endereço será mantido apenas na memória enquanto
 * a página estiver aberta.
 *
 * Não colocaremos senhas, tokens ou dados de sessão aqui.
 */
const configuracaoFluig = {
    urlPortal: ""
};


/* =========================================================
   2. CONSTANTES DO PROCESSO
   ========================================================= */

/*
 * Resultados que o usuário poderá registrar depois
 * de pesquisar o CNPJ no Fluig.
 */
export const RESULTADOS_CONSULTA_FLUIG = Object.freeze({
    NENHUM_PROJETO: "nenhum_projeto",
    UM_PROJETO: "um_projeto",
    VARIOS_PROJETOS: "varios_projetos",
    CONSULTA_NAO_REALIZADA: "consulta_nao_realizada",
    ERRO_NA_CONSULTA: "erro_na_consulta"
});


/*
 * Situações da devolução relacionadas ao Fluig.
 */
export const STATUS_FLUIG = Object.freeze({
    CONSULTA_PENDENTE: "consulta_fluig_pendente",
    AGUARDANDO_PROJETO: "aguardando_projeto_no_fluig",
    UM_PROJETO_ENCONTRADO: "um_projeto_encontrado",
    VARIOS_PROJETOS_ENCONTRADOS: "varios_projetos_encontrados",
    PROJETO_IDENTIFICADO: "projeto_identificado",
    CONSULTA_COM_ERRO: "consulta_com_erro"
});


/* =========================================================
   3. ERRO PERSONALIZADO
   ========================================================= */

/*
 * Permite diferenciar erros esperados do serviço
 * de outros erros inesperados do JavaScript.
 */
export class ErroServicoFluig extends Error {
    constructor(
        mensagem,
        codigo = "ERRO_SERVICO_FLUIG"
    ) {
        super(mensagem);

        this.name = "ErroServicoFluig";
        this.codigo = codigo;
    }
}


/* =========================================================
   4. CONFIGURAÇÃO DO ENDEREÇO
   ========================================================= */

/*
 * Define o endereço do portal durante a sessão atual.
 *
 * Exemplo:
 *
 * configurarUrlPortalFluig(
 *     "https://fluig.exemplo.com/portal"
 * );
 */
export function configurarUrlPortalFluig(url) {
    const urlNormalizada = normalizarUrlPortal(url);

    configuracaoFluig.urlPortal = urlNormalizada;

    return configuracaoFluig.urlPortal;
}


/*
 * Retorna a URL configurada atualmente.
 */
export function obterUrlPortalFluig() {
    return configuracaoFluig.urlPortal;
}


/*
 * Valida e normaliza o endereço do portal.
 */
function normalizarUrlPortal(url) {
    if (
        typeof url !== "string"
        || url.trim().length === 0
    ) {
        throw new ErroServicoFluig(
            "O endereço do portal Fluig não foi informado.",
            "URL_FLUIG_NAO_INFORMADA"
        );
    }

    let urlInterpretada;

    try {
        urlInterpretada = new URL(
            url.trim()
        );
    } catch {
        throw new ErroServicoFluig(
            "O endereço informado para o Fluig é inválido.",
            "URL_FLUIG_INVALIDA"
        );
    }

    const protocoloPermitido = (
        urlInterpretada.protocol === "http:"
        || urlInterpretada.protocol === "https:"
    );

    if (!protocoloPermitido) {
        throw new ErroServicoFluig(
            "O endereço do Fluig deve utilizar HTTP ou HTTPS.",
            "PROTOCOLO_FLUIG_INVALIDO"
        );
    }

    return urlInterpretada.toString();
}


/* =========================================================
   5. PREPARAÇÃO DOS DADOS DA CONSULTA
   ========================================================= */

/*
 * Recebe uma devolução confirmada e prepara os dados
 * que serão apresentados antes da consulta no Fluig.
 */
export function prepararDadosConsultaFluig(
    devolucao,
    contaRecebimento = null
) {
    validarDevolucaoParaConsulta(
        devolucao
    );

    const cnpjLimpo = limparCnpj(
        devolucao.cnpj || ""
    );

    return {
        codigoDevolucao:
            devolucao.codigoDevolucao
            || devolucao.idTemporario
            || null,

        cnpj: cnpjLimpo || null,

        cnpjFormatado: cnpjLimpo
            ? formatarCnpj(cnpjLimpo)
            : null,

        cnpjValido: cnpjLimpo
            ? validarCnpj(cnpjLimpo)
            : false,

        conta:
            contaRecebimento
            || devolucao.conta
            || null,

        dataMovimentacao:
            devolucao.dataMovimento
            || null,

        hora:
            devolucao.hora
            || null,

        valor:
            Number.isFinite(devolucao.valor)
                ? devolucao.valor
                : null,

        valorFormatado:
            Number.isFinite(devolucao.valor)
                ? formatarMoedaBrasileira(
                    devolucao.valor
                )
                : "R$ 0,00",

        origem:
            devolucao.identificacaoOrigem
            || null,

        documento:
            devolucao.documento
            || null,

        statusFluig:
            devolucao.statusFluig
            || STATUS_FLUIG.CONSULTA_PENDENTE
    };
}


/*
 * Verifica se a devolução possui dados mínimos
 * para iniciar a consulta assistida.
 */
function validarDevolucaoParaConsulta(devolucao) {
    if (
        !devolucao
        || typeof devolucao !== "object"
    ) {
        throw new ErroServicoFluig(
            "Nenhuma devolução válida foi informada.",
            "DEVOLUCAO_NAO_INFORMADA"
        );
    }

    const possuiIdentificador = Boolean(
        devolucao.codigoDevolucao
        || devolucao.idTemporario
    );

    if (!possuiIdentificador) {
        throw new ErroServicoFluig(
            "A devolução não possui um identificador.",
            "DEVOLUCAO_SEM_IDENTIFICADOR"
        );
    }

    if (
        devolucao.situacaoOperacional
        && devolucao.situacaoOperacional !== "confirmada"
    ) {
        throw new ErroServicoFluig(
            "A movimentação ainda não foi confirmada como devolução.",
            "DEVOLUCAO_NAO_CONFIRMADA"
        );
    }
}


/* =========================================================
   6. CÓPIA DO CNPJ
   ========================================================= */

/*
 * Copia o CNPJ somente com os 14 números.
 *
 * Exemplo:
 *
 * Entrada:
 * 01.280.707/0001-61
 *
 * Conteúdo copiado:
 * 01280707000161
 */
export async function copiarCnpjParaPesquisa(cnpj) {
    const cnpjLimpo = limparCnpj(
        cnpj
    );

    if (cnpjLimpo.length !== 14) {
        throw new ErroServicoFluig(
            "O CNPJ precisa possuir 14 números para ser copiado.",
            "CNPJ_INCOMPLETO"
        );
    }

    if (!validarCnpj(cnpjLimpo)) {
        throw new ErroServicoFluig(
            "O CNPJ informado é inválido.",
            "CNPJ_INVALIDO"
        );
    }

    await copiarTextoParaAreaTransferencia(
        cnpjLimpo
    );

    return cnpjLimpo;
}


/*
 * Utiliza a API moderna do navegador e possui
 * um modo alternativo para navegadores incompatíveis.
 */
async function copiarTextoParaAreaTransferencia(texto) {
    if (
        navigator.clipboard
        && typeof navigator.clipboard.writeText === "function"
    ) {
        try {
            await navigator.clipboard.writeText(
                texto
            );

            return;
        } catch (erro) {
            console.warn(
                "A API de clipboard não pôde ser utilizada.",
                erro
            );
        }
    }

    copiarTextoComCampoTemporario(
        texto
    );
}


/*
 * Alternativa para ambientes nos quais a API
 * navigator.clipboard não estiver disponível.
 */
function copiarTextoComCampoTemporario(texto) {
    const campoTemporario = document.createElement(
        "textarea"
    );

    campoTemporario.value = texto;
    campoTemporario.readOnly = true;

    campoTemporario.style.position = "fixed";
    campoTemporario.style.left = "-9999px";
    campoTemporario.style.opacity = "0";

    document.body.appendChild(
        campoTemporario
    );

    campoTemporario.select();
    campoTemporario.setSelectionRange(
        0,
        campoTemporario.value.length
    );

    const copiaRealizada = document.execCommand(
        "copy"
    );

    campoTemporario.remove();

    if (!copiaRealizada) {
        throw new ErroServicoFluig(
            "Não foi possível copiar o CNPJ automaticamente.",
            "FALHA_AO_COPIAR_CNPJ"
        );
    }
}


/* =========================================================
   7. ABERTURA DO PORTAL
   ========================================================= */

/*
 * Abre o endereço configurado em uma nova aba.
 *
 * Esta função deve ser chamada diretamente após
 * um clique do usuário para evitar bloqueio de popup.
 */
export function abrirPortalFluig(
    urlPersonalizada = null
) {
    const urlPortal = urlPersonalizada
        ? normalizarUrlPortal(urlPersonalizada)
        : configuracaoFluig.urlPortal;

    if (!urlPortal) {
        throw new ErroServicoFluig(
            "O endereço do portal Fluig ainda não foi configurado.",
            "URL_FLUIG_NAO_CONFIGURADA"
        );
    }

    const novaJanela = window.open(
        urlPortal,
        "_blank",
        "noopener,noreferrer"
    );

    if (!novaJanela) {
        throw new ErroServicoFluig(
            "O navegador bloqueou a abertura do Fluig. "
            + "Verifique as permissões de pop-up.",
            "POPUP_FLUIG_BLOQUEADO"
        );
    }

    return true;
}


/* =========================================================
   8. CRIAÇÃO DO REGISTRO DA CONSULTA
   ========================================================= */

/*
 * Cria um registro padronizado da consulta manual.
 *
 * Exemplo:
 *
 * criarRegistroConsultaFluig({
 *     devolucaoId: "DEV-2026-0001",
 *     resultado: "um_projeto",
 *     projetos: [...]
 * });
 */
export function criarRegistroConsultaFluig({
    devolucaoId,
    resultado,
    projetos = [],
    observacao = "",
    mensagemErro = "",
    dataConsulta = new Date()
}) {
    validarResultadoConsulta(
        resultado
    );

    if (
        typeof devolucaoId !== "string"
        || devolucaoId.trim().length === 0
    ) {
        throw new ErroServicoFluig(
            "O identificador da devolução não foi informado.",
            "DEVOLUCAO_ID_NAO_INFORMADO"
        );
    }

    const dataNormalizada = normalizarDataConsulta(
        dataConsulta
    );

    const projetosNormalizados = projetos.map(
        function (projeto, indice) {
            return normalizarProjetoCandidato(
                projeto,
                indice
            );
        }
    );

    validarQuantidadeProjetosPorResultado(
        resultado,
        projetosNormalizados
    );

    const statusFluig = obterStatusPorResultadoConsulta(
        resultado
    );

    return {
        idConsulta: gerarIdConsultaFluig(),

        devolucaoId:
            devolucaoId.trim(),

        dataConsulta:
            dataNormalizada.toISOString(),

        resultado,

        statusFluig,

        projetos:
            projetosNormalizados,

        projetoConfirmadoId: null,

        observacao:
            normalizarTextoOpcional(
                observacao
            ),

        mensagemErro:
            resultado
            === RESULTADOS_CONSULTA_FLUIG.ERRO_NA_CONSULTA
                ? normalizarTextoOpcional(
                    mensagemErro
                )
                : null
    };
}


/*
 * Valida se o resultado faz parte das opções
 * reconhecidas pelo Aziel.
 */
function validarResultadoConsulta(resultado) {
    const resultadosPermitidos = Object.values(
        RESULTADOS_CONSULTA_FLUIG
    );

    if (!resultadosPermitidos.includes(resultado)) {
        throw new ErroServicoFluig(
            "O resultado informado para a consulta é inválido.",
            "RESULTADO_CONSULTA_INVALIDO"
        );
    }
}


/*
 * Mantém coerência entre o resultado e a quantidade
 * de projetos registrados.
 */
function validarQuantidadeProjetosPorResultado(
    resultado,
    projetos
) {
    if (
        resultado === RESULTADOS_CONSULTA_FLUIG.NENHUM_PROJETO
        && projetos.length > 0
    ) {
        throw new ErroServicoFluig(
            "Uma consulta sem projetos não pode possuir candidatos.",
            "CONSULTA_SEM_PROJETO_COM_CANDIDATOS"
        );
    }

    if (
        resultado === RESULTADOS_CONSULTA_FLUIG.UM_PROJETO
        && projetos.length !== 1
    ) {
        throw new ErroServicoFluig(
            "O resultado “um projeto” deve possuir exatamente um candidato.",
            "QUANTIDADE_PROJETOS_INCORRETA"
        );
    }

    if (
        resultado === RESULTADOS_CONSULTA_FLUIG.VARIOS_PROJETOS
        && projetos.length < 2
    ) {
        throw new ErroServicoFluig(
            "O resultado “vários projetos” deve possuir pelo menos dois candidatos.",
            "QUANTIDADE_PROJETOS_INCORRETA"
        );
    }

    const resultadosSemProjetos = [
        RESULTADOS_CONSULTA_FLUIG.CONSULTA_NAO_REALIZADA,
        RESULTADOS_CONSULTA_FLUIG.ERRO_NA_CONSULTA
    ];

    if (
        resultadosSemProjetos.includes(resultado)
        && projetos.length > 0
    ) {
        throw new ErroServicoFluig(
            "Esse resultado de consulta não pode possuir projetos.",
            "RESULTADO_INCOMPATIVEL_COM_PROJETOS"
        );
    }
}


/* =========================================================
   9. PROJETOS CANDIDATOS
   ========================================================= */

/*
 * Padroniza os dados de um projeto encontrado no Fluig.
 *
 * Nenhum projeto será marcado como confirmado
 * automaticamente.
 */
export function normalizarProjetoCandidato(
    projeto,
    indice = 0
) {
    if (
        !projeto
        || typeof projeto !== "object"
    ) {
        throw new ErroServicoFluig(
            "Foi informado um projeto candidato inválido.",
            "PROJETO_CANDIDATO_INVALIDO"
        );
    }

    const valor = normalizarValorProjeto(
        projeto.valor
    );

    const projetoNormalizado = {
        idCandidato:
            projeto.idCandidato
            || gerarIdProjetoCandidato(indice),

        idProjeto:
            normalizarTextoOpcional(
                projeto.idProjeto
            ),

        paa:
            normalizarTextoOpcional(
                projeto.paa
            ),

        instituicao:
            normalizarTextoOpcional(
                projeto.instituicao
            ),

        edital:
            normalizarTextoOpcional(
                projeto.edital
            ),

        nomeProjeto:
            normalizarTextoOpcional(
                projeto.nomeProjeto
            ),

        valor,

        valorFormatado:
            Number.isFinite(valor)
                ? formatarMoedaBrasileira(valor)
                : null,

        etapaAtual:
            normalizarTextoOpcional(
                projeto.etapaAtual
            ),

        situacao:
            normalizarTextoOpcional(
                projeto.situacao
            ),

        observacao:
            normalizarTextoOpcional(
                projeto.observacao
            ),

        confirmado: false
    };

    validarProjetoCandidato(
        projetoNormalizado
    );

    return projetoNormalizado;
}


/*
 * Um projeto precisa possuir ao menos uma identificação
 * suficiente para ser reconhecido posteriormente.
 */
function validarProjetoCandidato(projeto) {
    const possuiIdentificacao = Boolean(
        projeto.idProjeto
        || projeto.paa
        || projeto.nomeProjeto
    );

    if (!possuiIdentificacao) {
        throw new ErroServicoFluig(
            "Informe ao menos o ID, PAA ou nome do projeto.",
            "PROJETO_SEM_IDENTIFICACAO"
        );
    }
}


/*
 * Converte o valor do projeto em número.
 */
function normalizarValorProjeto(valor) {
    if (
        typeof valor === "number"
        && Number.isFinite(valor)
    ) {
        return valor;
    }

    if (
        typeof valor === "string"
        && valor.trim().length > 0
    ) {
        return converterValorBrasileiroParaNumero(
            valor
        );
    }

    return null;
}


/* =========================================================
   10. CONFIRMAÇÃO DO PROJETO
   ========================================================= */

/*
 * Marca manualmente um único projeto como confirmado.
 *
 * A função devolve uma nova estrutura e preserva
 * o registro anterior recebido como parâmetro.
 */
export function confirmarProjetoDaConsulta(
    consulta,
    idCandidato
) {
    validarConsultaExistente(
        consulta
    );

    if (
        typeof idCandidato !== "string"
        || idCandidato.trim().length === 0
    ) {
        throw new ErroServicoFluig(
            "Nenhum projeto candidato foi selecionado.",
            "PROJETO_NAO_SELECIONADO"
        );
    }

    const projetoExiste = consulta.projetos.some(
        function (projeto) {
            return (
                projeto.idCandidato === idCandidato
            );
        }
    );

    if (!projetoExiste) {
        throw new ErroServicoFluig(
            "O projeto selecionado não pertence a esta consulta.",
            "PROJETO_CANDIDATO_NAO_ENCONTRADO"
        );
    }

    const projetosAtualizados = consulta.projetos.map(
        function (projeto) {
            return {
                ...projeto,

                confirmado:
                    projeto.idCandidato
                    === idCandidato
            };
        }
    );

    return {
        ...consulta,

        projetos:
            projetosAtualizados,

        projetoConfirmadoId:
            idCandidato,

        statusFluig:
            STATUS_FLUIG.PROJETO_IDENTIFICADO,

        dataConfirmacaoProjeto:
            new Date().toISOString()
    };
}


/*
 * Verifica se o registro possui a estrutura mínima
 * de uma consulta do Fluig.
 */
function validarConsultaExistente(consulta) {
    if (
        !consulta
        || typeof consulta !== "object"
        || !Array.isArray(consulta.projetos)
    ) {
        throw new ErroServicoFluig(
            "O registro da consulta ao Fluig é inválido.",
            "CONSULTA_FLUIG_INVALIDA"
        );
    }
}


/*
 * Retorna o projeto que foi confirmado.
 */
export function obterProjetoConfirmado(
    consulta
) {
    validarConsultaExistente(
        consulta
    );

    return (
        consulta.projetos.find(
            function (projeto) {
                return projeto.confirmado;
            }
        )
        || null
    );
}


/* =========================================================
   11. STATUS E PRÓXIMA AÇÃO
   ========================================================= */

/*
 * Define o status da devolução conforme
 * o resultado registrado.
 */
export function obterStatusPorResultadoConsulta(
    resultado
) {
    const relacaoStatus = {
        [RESULTADOS_CONSULTA_FLUIG.NENHUM_PROJETO]:
            STATUS_FLUIG.AGUARDANDO_PROJETO,

        [RESULTADOS_CONSULTA_FLUIG.UM_PROJETO]:
            STATUS_FLUIG.UM_PROJETO_ENCONTRADO,

        [RESULTADOS_CONSULTA_FLUIG.VARIOS_PROJETOS]:
            STATUS_FLUIG.VARIOS_PROJETOS_ENCONTRADOS,

        [RESULTADOS_CONSULTA_FLUIG.CONSULTA_NAO_REALIZADA]:
            STATUS_FLUIG.CONSULTA_PENDENTE,

        [RESULTADOS_CONSULTA_FLUIG.ERRO_NA_CONSULTA]:
            STATUS_FLUIG.CONSULTA_COM_ERRO
    };

    return (
        relacaoStatus[resultado]
        || STATUS_FLUIG.CONSULTA_PENDENTE
    );
}


/*
 * Gera uma orientação para a próxima ação operacional.
 */
export function obterProximaAcaoFluig(statusFluig) {
    const proximasAcoes = {
        [STATUS_FLUIG.CONSULTA_PENDENTE]:
            "Realizar pesquisa do CNPJ no Fluig",

        [STATUS_FLUIG.AGUARDANDO_PROJETO]:
            "Realizar nova consulta no Fluig posteriormente",

        [STATUS_FLUIG.UM_PROJETO_ENCONTRADO]:
            "Confirmar se o projeto encontrado corresponde à devolução",

        [STATUS_FLUIG.VARIOS_PROJETOS_ENCONTRADOS]:
            "Selecionar manualmente o projeto correto",

        [STATUS_FLUIG.PROJETO_IDENTIFICADO]:
            "Preparar a comunicação ao setor financeiro",

        [STATUS_FLUIG.CONSULTA_COM_ERRO]:
            "Corrigir o problema e repetir a consulta"
    };

    return (
        proximasAcoes[statusFluig]
        || "Revisar a situação da devolução"
    );
}


/* =========================================================
   12. RESUMO DA CONSULTA
   ========================================================= */

/*
 * Produz um resumo textual que poderá ser usado
 * pela interface ou pelo histórico.
 */
export function criarResumoConsultaFluig(
    consulta
) {
    validarConsultaExistente(
        consulta
    );

    const quantidadeProjetos = consulta.projetos.length;

    const projetoConfirmado = obterProjetoConfirmado(
        consulta
    );

    return {
        idConsulta:
            consulta.idConsulta,

        dataConsulta:
            consulta.dataConsulta,

        resultado:
            consulta.resultado,

        statusFluig:
            consulta.statusFluig,

        quantidadeProjetos,

        projetoConfirmado:
            projetoConfirmado
            ? (
                projetoConfirmado.paa
                || projetoConfirmado.nomeProjeto
                || projetoConfirmado.idProjeto
            )
            : null,

        proximaAcao:
            obterProximaAcaoFluig(
                consulta.statusFluig
            )
    };
}


/* =========================================================
   13. IDENTIFICADORES
   ========================================================= */

/*
 * Gera um identificador temporário da consulta.
 *
 * Exemplo:
 * CON-2026-0803123301
 */
function gerarIdConsultaFluig() {
    const agora = new Date();

    const ano = agora.getFullYear();

    const mes = String(
        agora.getMonth() + 1
    ).padStart(2, "0");

    const dia = String(
        agora.getDate()
    ).padStart(2, "0");

    const hora = String(
        agora.getHours()
    ).padStart(2, "0");

    const minuto = String(
        agora.getMinutes()
    ).padStart(2, "0");

    const segundo = String(
        agora.getSeconds()
    ).padStart(2, "0");

    const aleatorio = String(
        Math.floor(Math.random() * 100)
    ).padStart(2, "0");

    return (
        `CON-${ano}-${mes}${dia}`
        + `${hora}${minuto}${segundo}${aleatorio}`
    );
}


/*
 * Gera um identificador temporário para cada
 * projeto candidato.
 */
function gerarIdProjetoCandidato(indice) {
    const sequencia = String(
        indice + 1
    ).padStart(3, "0");

    const momento = Date.now().toString().slice(-6);

    return `PRJ-${momento}-${sequencia}`;
}


/* =========================================================
   14. FUNÇÕES AUXILIARES
   ========================================================= */

function normalizarTextoOpcional(valor) {
    if (
        valor === null
        || valor === undefined
    ) {
        return null;
    }

    const texto = String(valor).trim();

    return texto.length > 0
        ? texto
        : null;
}


function normalizarDataConsulta(dataConsulta) {
    if (dataConsulta instanceof Date) {
        if (
            Number.isNaN(
                dataConsulta.getTime()
            )
        ) {
            throw new ErroServicoFluig(
                "A data da consulta é inválida.",
                "DATA_CONSULTA_INVALIDA"
            );
        }

        return dataConsulta;
    }

    const dataConvertida = new Date(
        dataConsulta
    );

    if (
        Number.isNaN(
            dataConvertida.getTime()
        )
    ) {
        throw new ErroServicoFluig(
            "A data da consulta é inválida.",
            "DATA_CONSULTA_INVALIDA"
        );
    }

    return dataConvertida;
}