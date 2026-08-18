"use strict";

/*
 * =========================================================
 * AZIEL — SERVIÇO DE COMUNICAÇÃO COM O FINANCEIRO
 * =========================================================
 *
 * Responsabilidades:
 *
 * - preparar os dados da devolução;
 * - preparar os dados do projeto identificado;
 * - gerar o assunto do e-mail;
 * - gerar o corpo do e-mail;
 * - validar destinatários;
 * - copiar a mensagem;
 * - abrir o cliente de e-mail padrão;
 * - registrar a preparação e o envio da comunicação.
 *
 * Este serviço NÃO:
 *
 * - envia e-mails automaticamente;
 * - armazena senha;
 * - acessa Outlook ou Gmail;
 * - confirma sozinho que o e-mail foi enviado;
 * - grava informações permanentemente.
 */


/* =========================================================
   1. STATUS DA COMUNICAÇÃO
   ========================================================= */

export const STATUS_COMUNICACAO = Object.freeze({
    PENDENTE: "comunicacao_pendente",
    PREPARADA: "comunicacao_preparada",
    ENVIADA: "comunicacao_enviada",
    CANCELADA: "comunicacao_cancelada",
    ERRO: "erro_na_comunicacao"
});


/* =========================================================
   2. CANAIS DE COMUNICAÇÃO
   ========================================================= */

export const CANAIS_COMUNICACAO = Object.freeze({
    EMAIL: "email",
    OUTRO: "outro"
});


/* =========================================================
   3. ERRO PERSONALIZADO
   ========================================================= */

export class ErroServicoComunicacao extends Error {
    constructor(
        mensagem,
        codigo = "ERRO_SERVICO_COMUNICACAO"
    ) {
        super(mensagem);

        this.name = "ErroServicoComunicacao";
        this.codigo = codigo;
    }
}


/* =========================================================
   4. PREPARAÇÃO DOS DADOS
   ========================================================= */

/*
 * Prepara os dados necessários para gerar a comunicação.
 *
 * A movimentação deve:
 *
 * - estar confirmada como devolução;
 * - possuir consulta ao Fluig;
 * - possuir um projeto confirmado.
 */
export function prepararDadosComunicacaoFinanceiro({
    movimentacao,
    conta = null
}) {
    validarMovimentacaoParaComunicacao(
        movimentacao
    );

    const projeto = obterProjetoConfirmadoDaMovimentacao(
        movimentacao
    );

    return {
        codigoDevolucao:
            movimentacao.codigoDevolucao
            || movimentacao.idTemporario
            || null,

        dataMovimentacao:
            movimentacao.dataMovimento
            || null,

        horaMovimentacao:
            movimentacao.hora
            || null,

        conta:
            conta
            || movimentacao.conta
            || null,

        valor:
            Number.isFinite(movimentacao.valor)
                ? movimentacao.valor
                : 0,

        valorFormatado:
            movimentacao.valorFormatado
            || formatarMoedaBrasileira(
                movimentacao.valor
            ),

        cnpj:
            movimentacao.cnpj
            || null,

        cnpjFormatado:
            movimentacao.cnpjFormatado
            || formatarCnpjSimples(
                movimentacao.cnpj
            ),

        origem:
            movimentacao.identificacaoOrigem
            || projeto.instituicao
            || null,

        /*
         * Nome e UF "limpos" da entidade, priorizando a base de
         * consulta (entity-service.js) sobre o texto bruto do
         * extrato ou do Fluig — é o que aparece no e-mail curto
         * para o financeiro.
         */
        entidadeNome:
            (
                movimentacao.entidadeIdentificada
                && movimentacao.entidadeIdentificada.nomeReduzido
            )
            || projeto.instituicao
            || movimentacao.identificacaoOrigem
            || null,

        entidadeUf:
            (
                movimentacao.entidadeIdentificada
                && movimentacao.entidadeIdentificada.uf
            )
            || null,

        documentoBancario:
            movimentacao.documento
            || null,

        observacaoDevolucao:
            normalizarTextoOpcional(
                movimentacao.observacao
            ),

        projeto: {
            idCandidato:
                projeto.idCandidato
                || null,

            idProjeto:
                projeto.idProjeto
                || null,

            paa:
                projeto.paa
                || null,

            nomeProjeto:
                projeto.nomeProjeto
                || null,

            instituicao:
                projeto.instituicao
                || null,

            edital:
                projeto.edital
                || null,

            valor:
                Number.isFinite(projeto.valor)
                    ? projeto.valor
                    : null,

            valorFormatado:
                projeto.valorFormatado
                || (
                    Number.isFinite(projeto.valor)
                        ? formatarMoedaBrasileira(
                            projeto.valor
                        )
                        : null
                ),

            situacao:
                projeto.situacao
                || null,

            observacao:
                projeto.observacao
                || null
        }
    };
}


/*
 * Valida se a movimentação pode avançar para a etapa
 * de comunicação com o financeiro.
 */
function validarMovimentacaoParaComunicacao(
    movimentacao
) {
    if (
        !movimentacao
        || typeof movimentacao !== "object"
    ) {
        throw new ErroServicoComunicacao(
            "Nenhuma devolução válida foi informada.",
            "DEVOLUCAO_NAO_INFORMADA"
        );
    }

    if (
        movimentacao.situacaoOperacional
        !== "confirmada"
    ) {
        throw new ErroServicoComunicacao(
            "A movimentação ainda não foi confirmada como devolução.",
            "DEVOLUCAO_NAO_CONFIRMADA"
        );
    }

    if (!movimentacao.consultaFluig) {
        throw new ErroServicoComunicacao(
            "A consulta ao Fluig ainda não foi registrada.",
            "CONSULTA_FLUIG_NAO_REGISTRADA"
        );
    }

    const projeto = obterProjetoConfirmadoDaMovimentacao(
        movimentacao
    );

    if (!projeto) {
        throw new ErroServicoComunicacao(
            "Nenhum projeto foi confirmado para esta devolução.",
            "PROJETO_NAO_CONFIRMADO"
        );
    }
}


/*
 * Localiza o projeto selecionado durante a consulta
 * manual assistida no Fluig.
 */
function obterProjetoConfirmadoDaMovimentacao(
    movimentacao
) {
    if (
        movimentacao.projetoConfirmado
        && typeof movimentacao.projetoConfirmado
        === "object"
    ) {
        return movimentacao.projetoConfirmado;
    }

    const consulta = movimentacao.consultaFluig;

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
   5. CRIAÇÃO DA MENSAGEM
   ========================================================= */

/*
 * Cria a estrutura completa da mensagem que será
 * apresentada ao usuário.
 */
export function criarMensagemFinanceiro({
    movimentacao,
    conta = null,
    destinatarios = [],
    destinatariosCopia = [],
    assuntoPersonalizado = "",
    observacaoAdicional = ""
}) {
    const dados = prepararDadosComunicacaoFinanceiro({
        movimentacao,
        conta
    });

    const destinatariosNormalizados = normalizarListaEmails(
        destinatarios
    );

    const copiaNormalizada = normalizarListaEmails(
        destinatariosCopia
    );

    const assunto = assuntoPersonalizado.trim()
        || gerarAssuntoEmailFinanceiro(dados);

    const corpo = gerarCorpoEmailFinanceiro({
        dados,
        observacaoAdicional
    });

    return {
        idMensagem:
            gerarIdMensagem(),

        codigoDevolucao:
            dados.codigoDevolucao,

        destinatarios:
            destinatariosNormalizados,

        destinatariosCopia:
            copiaNormalizada,

        assunto,

        corpo,

        dados,

        status:
            STATUS_COMUNICACAO.PREPARADA,

        dataPreparacao:
            new Date().toISOString()
    };
}


/* =========================================================
   6. ASSUNTO DO E-MAIL
   ========================================================= */

/*
 * Exemplo de assunto:
 *
 * Devolução de saldo — PAA 12345 — R$ 16.335,74
 */
export function gerarAssuntoEmailFinanceiro(
    dados
) {
    validarDadosPreparados(
        dados
    );

    const valorSemPrefixo = (
        dados.valorFormatado || "R$ 0,00"
    ).replace(
        /^R\$\s*/,
        ""
    );

    return (
        "Devolução de Saldo (PROJETO) - "
        + valorSemPrefixo
    );
}


/* =========================================================
   7. CORPO DO E-MAIL
   ========================================================= */

export function gerarCorpoEmailFinanceiro({
    dados,
    observacaoAdicional = ""
}) {
    validarDadosPreparados(
        dados
    );

    const linhas = [];

    linhas.push(
        "Prezados(as),"
    );

    linhas.push(
        "Envio a seguir as informações referentes à devolução"
    );

    linhas.push("");

    /*
     * Linha da entidade: "Nome reduzido - UF".
     * Se a UF não estiver disponível, mostra só o nome.
     */
    linhas.push(
        dados.entidadeUf
            ? `${dados.entidadeNome || "Entidade não identificada"} - ${dados.entidadeUf}`
            : (dados.entidadeNome || "Entidade não identificada")
    );

    linhas.push(
        dados.cnpjFormatado || dados.cnpj || "CNPJ não identificado"
    );

    if (dados.projeto.paa) {
        linhas.push(
            "PAA "
            + dados.projeto.paa
            + (
                anoDaMovimentacao(dados.dataMovimentacao)
                    ? "/" + anoDaMovimentacao(dados.dataMovimentacao)
                    : ""
            )
        );
    }

    const observacaoNormalizada = normalizarTextoOpcional(
        observacaoAdicional
    );

    if (observacaoNormalizada) {
        linhas.push("");

        linhas.push(
            observacaoNormalizada
        );
    }

    return linhas.join("\n");
}


/*
 * Extrai o ano de uma data no formato ISO (AAAA-MM-DD),
 * usado para compor "PAA NNNNN/AAAA" no corpo do e-mail.
 */
function anoDaMovimentacao(dataIso) {
    if (
        typeof dataIso !== "string"
        || dataIso.length < 4
    ) {
        return null;
    }

    return dataIso.slice(0, 4);
}


/*
 * Verifica se os dados foram preparados pelo serviço
 * antes da geração da mensagem.
 */
function validarDadosPreparados(dados) {
    if (
        !dados
        || typeof dados !== "object"
        || !dados.projeto
    ) {
        throw new ErroServicoComunicacao(
            "Os dados da comunicação estão incompletos.",
            "DADOS_COMUNICACAO_INCOMPLETOS"
        );
    }
}


/* =========================================================
   8. DESTINATÁRIOS
   ========================================================= */

/*
 * Aceita:
 *
 * - um único e-mail;
 * - vários e-mails em uma lista;
 * - e-mails separados por vírgula ou ponto e vírgula.
 */
export function normalizarListaEmails(
    emails
) {
    let lista = [];

    if (Array.isArray(emails)) {
        lista = emails;
    } else if (typeof emails === "string") {
        lista = emails.split(/[;,]/);
    } else if (
        emails !== null
        && emails !== undefined
    ) {
        throw new ErroServicoComunicacao(
            "A lista de destinatários possui um formato inválido.",
            "LISTA_EMAILS_INVALIDA"
        );
    }

    const emailsNormalizados = lista
        .map(
            function (email) {
                return String(email)
                    .trim()
                    .toLowerCase();
            }
        )
        .filter(Boolean);

    const emailsUnicos = [
        ...new Set(emailsNormalizados)
    ];

    const emailInvalido = emailsUnicos.find(
        function (email) {
            return !validarEmail(email);
        }
    );

    if (emailInvalido) {
        throw new ErroServicoComunicacao(
            `O endereço “${emailInvalido}” é inválido.`,
            "EMAIL_INVALIDO"
        );
    }

    return emailsUnicos;
}


export function validarEmail(email) {
    if (typeof email !== "string") {
        return false;
    }

    const emailNormalizado = email
        .trim()
        .toLowerCase();

    /*
     * Validação simples para impedir erros evidentes.
     *
     * A existência real do endereço somente poderá ser
     * confirmada pelo serviço de e-mail.
     */
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        emailNormalizado
    );
}


/* =========================================================
   9. CÓPIA DA MENSAGEM
   ========================================================= */

/*
 * Copia assunto e corpo da mensagem para que possam
 * ser colados no Outlook, Gmail ou outro sistema.
 */
export async function copiarMensagemFinanceiro(
    mensagem
) {
    validarMensagemFinanceiro(
        mensagem
    );

    const conteudo = [
        "ASSUNTO:",
        mensagem.assunto,
        "",
        "MENSAGEM:",
        mensagem.corpo
    ].join("\n");

    await copiarTextoParaAreaTransferencia(
        conteudo
    );

    return true;
}


/*
 * Copia apenas o corpo da mensagem.
 */
export async function copiarCorpoMensagemFinanceiro(
    mensagem
) {
    validarMensagemFinanceiro(
        mensagem
    );

    await copiarTextoParaAreaTransferencia(
        mensagem.corpo
    );

    return true;
}


async function copiarTextoParaAreaTransferencia(
    texto
) {
    if (
        navigator.clipboard
        && typeof navigator.clipboard.writeText
        === "function"
    ) {
        try {
            await navigator.clipboard.writeText(
                texto
            );

            return;
        } catch (erro) {
            console.warn(
                "A API moderna de clipboard não pôde ser utilizada.",
                erro
            );
        }
    }

    copiarTextoComCampoTemporario(
        texto
    );
}


function copiarTextoComCampoTemporario(
    texto
) {
    const campo = document.createElement(
        "textarea"
    );

    campo.value = texto;
    campo.readOnly = true;

    campo.style.position = "fixed";
    campo.style.left = "-9999px";
    campo.style.top = "0";
    campo.style.opacity = "0";

    document.body.appendChild(
        campo
    );

    campo.select();

    campo.setSelectionRange(
        0,
        campo.value.length
    );

    const resultado = document.execCommand(
        "copy"
    );

    campo.remove();

    if (!resultado) {
        throw new ErroServicoComunicacao(
            "Não foi possível copiar a mensagem automaticamente.",
            "FALHA_AO_COPIAR_MENSAGEM"
        );
    }
}


/* =========================================================
   10. ABERTURA DO CLIENTE DE E-MAIL
   ========================================================= */

/*
 * Abre o aplicativo de e-mail padrão do computador.
 *
 * O envio ainda dependerá da ação manual do usuário.
 */
export function abrirMensagemNoClienteEmail(
    mensagem
) {
    validarMensagemFinanceiro(
        mensagem
    );

    if (mensagem.destinatarios.length === 0) {
        throw new ErroServicoComunicacao(
            "Informe ao menos um destinatário antes de abrir o e-mail.",
            "DESTINATARIO_NAO_INFORMADO"
        );
    }

    const urlEmail = criarUrlMailto(
        mensagem
    );

    window.location.href = urlEmail;

    return true;
}


/*
 * Cria um endereço mailto seguro usando
 * codificação de parâmetros.
 */
export function criarUrlMailto(
    mensagem
) {
    validarMensagemFinanceiro(
        mensagem
    );

    const destinatarios = (
        mensagem.destinatarios.join(",")
    );

    const parametros = new URLSearchParams();

    if (mensagem.destinatariosCopia.length > 0) {
        parametros.set(
            "cc",
            mensagem.destinatariosCopia.join(",")
        );
    }

    parametros.set(
        "subject",
        mensagem.assunto
    );

    parametros.set(
        "body",
        mensagem.corpo
    );

    return (
        `mailto:${destinatarios}?${parametros.toString()}`
    );
}


/* =========================================================
   11. REGISTRO DA COMUNICAÇÃO
   ========================================================= */

/*
 * Cria o registro inicial da comunicação preparada.
 */
export function criarRegistroComunicacao({
    mensagem,
    canal = CANAIS_COMUNICACAO.EMAIL,
    observacao = ""
}) {
    validarMensagemFinanceiro(
        mensagem
    );

    validarCanalComunicacao(
        canal
    );

    return {
        idComunicacao:
            gerarIdComunicacao(),

        codigoDevolucao:
            mensagem.codigoDevolucao,

        idMensagem:
            mensagem.idMensagem,

        canal,

        destinatarios:
            [...mensagem.destinatarios],

        destinatariosCopia:
            [...mensagem.destinatariosCopia],

        assunto:
            mensagem.assunto,

        corpo:
            mensagem.corpo,

        observacao:
            normalizarTextoOpcional(
                observacao
            ),

        status:
            STATUS_COMUNICACAO.PREPARADA,

        dataPreparacao:
            mensagem.dataPreparacao
            || new Date().toISOString(),

        dataEnvio:
            null
    };
}


/*
 * Marca manualmente que a comunicação foi enviada.
 *
 * O Aziel não tem como confirmar sozinho que o e-mail
 * saiu efetivamente do Outlook ou Gmail.
 */
export function marcarComunicacaoComoEnviada({
    registro,
    observacaoEnvio = ""
}) {
    validarRegistroComunicacao(
        registro
    );

    return {
        ...registro,

        status:
            STATUS_COMUNICACAO.ENVIADA,

        observacaoEnvio:
            normalizarTextoOpcional(
                observacaoEnvio
            ),

        dataEnvio:
            new Date().toISOString()
    };
}


/*
 * Cancela uma comunicação preparada.
 */
export function cancelarComunicacao({
    registro,
    motivo
}) {
    validarRegistroComunicacao(
        registro
    );

    const motivoNormalizado = normalizarTextoOpcional(
        motivo
    );

    if (!motivoNormalizado) {
        throw new ErroServicoComunicacao(
            "Informe o motivo do cancelamento.",
            "MOTIVO_CANCELAMENTO_NAO_INFORMADO"
        );
    }

    return {
        ...registro,

        status:
            STATUS_COMUNICACAO.CANCELADA,

        motivoCancelamento:
            motivoNormalizado,

        dataCancelamento:
            new Date().toISOString()
    };
}


/* =========================================================
   12. VALIDAÇÕES DA MENSAGEM
   ========================================================= */

function validarMensagemFinanceiro(
    mensagem
) {
    if (
        !mensagem
        || typeof mensagem !== "object"
    ) {
        throw new ErroServicoComunicacao(
            "Nenhuma mensagem válida foi informada.",
            "MENSAGEM_NAO_INFORMADA"
        );
    }

    if (
        typeof mensagem.assunto !== "string"
        || mensagem.assunto.trim().length === 0
    ) {
        throw new ErroServicoComunicacao(
            "O assunto da mensagem não foi informado.",
            "ASSUNTO_NAO_INFORMADO"
        );
    }

    if (
        typeof mensagem.corpo !== "string"
        || mensagem.corpo.trim().length === 0
    ) {
        throw new ErroServicoComunicacao(
            "O corpo da mensagem não foi informado.",
            "CORPO_NAO_INFORMADO"
        );
    }

    if (!Array.isArray(mensagem.destinatarios)) {
        throw new ErroServicoComunicacao(
            "A lista de destinatários é inválida.",
            "DESTINATARIOS_INVALIDOS"
        );
    }

    if (!Array.isArray(mensagem.destinatariosCopia)) {
        throw new ErroServicoComunicacao(
            "A lista de destinatários em cópia é inválida.",
            "DESTINATARIOS_COPIA_INVALIDOS"
        );
    }
}


function validarRegistroComunicacao(
    registro
) {
    if (
        !registro
        || typeof registro !== "object"
        || !registro.idComunicacao
    ) {
        throw new ErroServicoComunicacao(
            "O registro da comunicação é inválido.",
            "REGISTRO_COMUNICACAO_INVALIDO"
        );
    }
}


function validarCanalComunicacao(
    canal
) {
    const canaisPermitidos = Object.values(
        CANAIS_COMUNICACAO
    );

    if (!canaisPermitidos.includes(canal)) {
        throw new ErroServicoComunicacao(
            "O canal de comunicação informado é inválido.",
            "CANAL_COMUNICACAO_INVALIDO"
        );
    }
}


/* =========================================================
   13. PRÓXIMA AÇÃO
   ========================================================= */

export function obterProximaAcaoComunicacao(
    status
) {
    const proximasAcoes = {
        [STATUS_COMUNICACAO.PENDENTE]:
            "Preparar comunicação ao setor financeiro",

        [STATUS_COMUNICACAO.PREPARADA]:
            "Enviar a comunicação e confirmar o envio",

        [STATUS_COMUNICACAO.ENVIADA]:
            "Arquivar a devolução no histórico",

        [STATUS_COMUNICACAO.CANCELADA]:
            "Revisar o cancelamento da comunicação",

        [STATUS_COMUNICACAO.ERRO]:
            "Corrigir o problema da comunicação"
    };

    return (
        proximasAcoes[status]
        || "Revisar a situação da comunicação"
    );
}


/* =========================================================
   14. RESUMO DA COMUNICAÇÃO
   ========================================================= */

export function criarResumoComunicacao(
    registro
) {
    validarRegistroComunicacao(
        registro
    );

    return {
        idComunicacao:
            registro.idComunicacao,

        codigoDevolucao:
            registro.codigoDevolucao,

        canal:
            registro.canal,

        status:
            registro.status,

        destinatarios:
            [...registro.destinatarios],

        assunto:
            registro.assunto,

        dataPreparacao:
            registro.dataPreparacao,

        dataEnvio:
            registro.dataEnvio,

        proximaAcao:
            obterProximaAcaoComunicacao(
                registro.status
            )
    };
}


/* =========================================================
   15. IDENTIFICADORES
   ========================================================= */

function gerarIdMensagem() {
    return (
        "MSG-"
        + criarIdentificadorTemporal()
    );
}


function gerarIdComunicacao() {
    return (
        "COM-"
        + criarIdentificadorTemporal()
    );
}


function criarIdentificadorTemporal() {
    const agora = new Date();

    const partes = [
        agora.getFullYear(),

        String(
            agora.getMonth() + 1
        ).padStart(2, "0"),

        String(
            agora.getDate()
        ).padStart(2, "0"),

        String(
            agora.getHours()
        ).padStart(2, "0"),

        String(
            agora.getMinutes()
        ).padStart(2, "0"),

        String(
            agora.getSeconds()
        ).padStart(2, "0"),

        String(
            agora.getMilliseconds()
        ).padStart(3, "0"),

        String(
            Math.floor(Math.random() * 100)
        ).padStart(2, "0")
    ];

    return partes.join("");
}


/* =========================================================
   16. FUNÇÕES AUXILIARES
   ========================================================= */

function formatarMoedaBrasileira(
    valor
) {
    const valorNumerico = Number(valor);

    if (!Number.isFinite(valorNumerico)) {
        return "R$ 0,00";
    }

    return valorNumerico.toLocaleString(
        "pt-BR",
        {
            style: "currency",
            currency: "BRL"
        }
    );
}


function formatarCnpjSimples(
    cnpj
) {
    const numeros = String(
        cnpj || ""
    )
        .replace(/\D/g, "")
        .slice(0, 14);

    if (numeros.length !== 14) {
        return null;
    }

    return numeros.replace(
        /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
        "$1.$2.$3/$4-$5"
    );
}


function formatarDataIsoParaBr(
    dataIso
) {
    if (
        typeof dataIso !== "string"
        || !/^\d{4}-\d{2}-\d{2}$/.test(dataIso)
    ) {
        return "Não informada";
    }

    const [
        ano,
        mes,
        dia
    ] = dataIso.split("-");

    return `${dia}/${mes}/${ano}`;
}


function normalizarTextoOpcional(
    valor
) {
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


function valorOuNaoInformado(
    valor
) {
    const texto = normalizarTextoOpcional(
        valor
    );

    return texto || "Não informado";
}