"use strict";

/*
 * =========================================================
 * AZIEL — INTERPRETADOR DE EXTRATOS BANCÁRIOS
 * =========================================================
 *
 * Responsabilidade deste arquivo:
 *
 * - receber o texto já extraído do PDF;
 * - identificar agência, conta e período;
 * - localizar movimentações bancárias;
 * - relacionar linhas complementares;
 * - converter valores brasileiros em números;
 * - localizar e validar possíveis CNPJs;
 * - classificar possíveis devoluções.
 *
 * Este arquivo NÃO lê o PDF e NÃO altera a interface.
 *
 * pdf-reader.js:
 *     extrai o texto do arquivo.
 *
 * statement-parser.js:
 *     interpreta o texto extraído.
 *
 * app.js:
 *     mostra o resultado na tela.
 */


/* =========================================================
   1. CONFIGURAÇÕES DO INTERPRETADOR
   ========================================================= */

/*
 * Históricos considerados movimentações internas.
 *
 * Mesmo que apareçam como crédito, eles não devem ser
 * classificados automaticamente como devolução.
 */
const HISTORICOS_INTERNOS = [
    "saldo anterior",
    "resgate bb cdb di",
    "bb rende facil",
    "bb rende fácil",
    "invest. resgate autom.",
    "invest resgate autom",
    "aplicacao automatica",
    "aplicação automática",
    "saldo",
    "juros",
    "iof"
];

/*
 * Históricos que podem representar recebimento externo.
 *
 * A confirmação final continuará sendo feita pelo usuário.
 */
const HISTORICOS_RECEBIMENTO_EXTERNO = [
    "transferencia recebida",
    "transferência recebida",
    "pix recebido",
    "deposito recebido",
    "depósito recebido",
    "credito recebido",
    "crédito recebido",

    /*
     * Adicionado após teste com extrato real da conta 45.140-1.
     *
     * O histórico "Recebimento Fornecedor" (código 612 do BB)
     * é a forma como esta conta recebe transferências externas,
     * incluindo devoluções de saldo de projetos. Sem esta entrada,
     * esses créditos caem em "movimentacao_desconhecida" e não
     * aparecem na tabela de pendências nem nos indicadores.
     */
    "recebimento fornecedor"
];

/*
 * Contas inicialmente reconhecidas pelo Aziel.
 *
 * O formato interno é o mesmo utilizado na interface.
 */
const CONTAS_MONITORADAS = [
    "45.140-1",
    "45.141-X"
];


/* =========================================================
   2. ERRO PERSONALIZADO
   ========================================================= */

/*
 * Permite diferenciar um erro de interpretação
 * de outros erros inesperados do JavaScript.
 */
export class ErroInterpretacaoExtrato extends Error {
    constructor(
        mensagem,
        codigo = "ERRO_INTERPRETACAO_EXTRATO"
    ) {
        super(mensagem);

        this.name = "ErroInterpretacaoExtrato";
        this.codigo = codigo;
    }
}


/* =========================================================
   3. FUNÇÃO PRINCIPAL
   ========================================================= */

/*
 * Recebe o texto completo extraído do PDF e devolve
 * uma estrutura organizada com os dados do extrato.
 *
 * Exemplo de retorno:
 *
 * {
 *     agencia: "452-9",
 *     conta: "45.140-1",
 *     periodo: {
 *         inicio: "2026-07-21",
 *         fim: "2026-07-22"
 *     },
 *     movimentacoes: [],
 *     possiveisDevolucoes: [],
 *     resumo: {}
 * }
 */
export function interpretarExtratoBancario(textoCompleto) {
    validarTextoRecebido(textoCompleto);

    const textoNormalizado = normalizarTextoExtrato(
        textoCompleto
    );

    const linhas = obterLinhasDoTexto(
        textoNormalizado
    );

    const agencia = extrairAgencia(
        textoNormalizado
    );

    const conta = extrairConta(
        textoNormalizado
    );

    const periodo = extrairPeriodo(
        textoNormalizado
    );

    const dataEmissao = extrairDataEmissao(
        textoNormalizado
    );

    const movimentacoes = extrairMovimentacoes(
        linhas,
        periodo
    );

    const possiveisDevolucoes = movimentacoes.filter(
        function (movimentacao) {
            return (
                movimentacao.classificacao
                === "alta_possibilidade_devolucao"
                || movimentacao.classificacao
                === "possivel_devolucao"
                || movimentacao.classificacao
                === "possivel_devolucao_sem_cnpj"
            );
        }
    );

    const movimentacoesInternas = movimentacoes.filter(
        function (movimentacao) {
            return (
                movimentacao.classificacao
                === "movimentacao_interna"
            );
        }
    );

    const movimentacoesParaRevisao = movimentacoes.filter(
        function (movimentacao) {
            return (
                movimentacao.classificacao
                === "movimentacao_desconhecida"
                || movimentacao.classificacao
                === "necessita_revisao"
            );
        }
    );

    const possuiMensagemSemMovimentacao = verificarMensagemSemMovimentacao(
        textoNormalizado
    );

    /*
     * A mensagem "A CONTA NAO FOI MOVIMENTADA" não é usada
     * isoladamente para decidir que o extrato está vazio.
     *
     * Primeiro verificamos as movimentações realmente extraídas.
     */
    const semMovimentacoesRelevantes = (
        possiveisDevolucoes.length === 0
        && movimentacoesParaRevisao.length === 0
    );

    return {
        agencia,

        conta,

        contaMonitorada: CONTAS_MONITORADAS.includes(
            conta
        ),

        periodo,

        dataEmissao,

        movimentacoes,

        possiveisDevolucoes,

        movimentacoesInternas,

        movimentacoesParaRevisao,

        possuiMensagemSemMovimentacao,

        semMovimentacoesRelevantes,

        resumo: {
            totalMovimentacoes: movimentacoes.length,

            totalPossiveisDevolucoes:
                possiveisDevolucoes.length,

            totalMovimentacoesInternas:
                movimentacoesInternas.length,

            totalParaRevisao:
                movimentacoesParaRevisao.length,

            valorPossiveisDevolucoes:
                calcularValorTotal(
                    possiveisDevolucoes
                )
        }
    };
}


/* =========================================================
   4. VALIDAÇÃO E NORMALIZAÇÃO DO TEXTO
   ========================================================= */

/*
 * Verifica se o interpretador recebeu um texto utilizável.
 */
function validarTextoRecebido(textoCompleto) {
    if (
        typeof textoCompleto !== "string"
        || textoCompleto.trim().length === 0
    ) {
        throw new ErroInterpretacaoExtrato(
            "Nenhum texto válido foi informado para interpretação.",
            "TEXTO_NAO_INFORMADO"
        );
    }
}


/*
 * Padroniza algumas diferenças que podem aparecer
 * durante a extração do PDF.
 */
function normalizarTextoExtrato(texto) {
    return texto
        /*
         * Padroniza quebras de linha do Windows e outros sistemas.
         */
        .replace(/\r\n?/g, "\n")

        /*
         * Substitui espaços especiais por espaços comuns.
         */
        .replace(/\u00A0/g, " ")

        /*
         * Remove espaços no início e no final de cada linha.
         */
        .split("\n")
        .map(function (linha) {
            return linha.trim();
        })
        .join("\n")

        /*
         * Limita sequências exageradas de linhas vazias.
         */
        .replace(/\n{3,}/g, "\n\n")

        .trim();
}


/*
 * Separa o texto em linhas e remove linhas completamente vazias.
 */
function obterLinhasDoTexto(texto) {
    return texto
        .split("\n")
        .map(function (linha) {
            return linha.trim();
        })
        .filter(Boolean);
}


/* =========================================================
   5. IDENTIFICAÇÃO DO CABEÇALHO
   ========================================================= */

/*
 * Localiza a agência bancária.
 *
 * Exemplo encontrado:
 * Agência 452-9
 */
function extrairAgencia(texto) {
    const resultado = texto.match(
        /Ag[eê]ncia\s+(\d{3,4}-[\dXx])/i
    );

    if (!resultado) {
        return null;
    }

    return resultado[1].toUpperCase();
}


/*
 * Localiza e formata a conta bancária.
 *
 * Exemplo encontrado:
 * Conta corrente 45140-1
 *
 * Resultado:
 * 45.140-1
 */
function extrairConta(texto) {
    const resultado = texto.match(
        /Conta\s+corrente\s+(\d{5}-[\dXx])/i
    );

    if (!resultado) {
        return null;
    }

    return formatarContaBancaria(
        resultado[1]
    );
}


/*
 * Formata o número da conta.
 *
 * Entrada:
 * 45140-1
 *
 * Saída:
 * 45.140-1
 */
export function formatarContaBancaria(conta) {
    if (typeof conta !== "string") {
        return null;
    }

    const contaLimpa = conta
        .replace(/\./g, "")
        .replace(/\s+/g, "")
        .toUpperCase();

    const resultado = contaLimpa.match(
        /^(\d{2})(\d{3})-([\dX])$/
    );

    if (!resultado) {
        return conta.trim().toUpperCase();
    }

    return (
        resultado[1]
        + "."
        + resultado[2]
        + "-"
        + resultado[3]
    );
}


/*
 * Localiza o período do extrato.
 *
 * O texto pode aparecer quebrado em várias linhas:
 *
 * Período do
 * de 21 / 07 / 2026 até 22 / 07 / 2026
 * extrato
 */
function extrairPeriodo(texto) {
    const textoEmLinhaUnica = texto
        .replace(/\n/g, " ")
        .replace(/\s+/g, " ");

    const resultado = textoEmLinhaUnica.match(
        /de\s+(\d{2})\s*\/\s*(\d{2})\s*\/\s*(\d{4})\s+at[eé]\s+(\d{2})\s*\/\s*(\d{2})\s*\/\s*(\d{4})/i
    );

    if (!resultado) {
        return {
            inicio: null,
            fim: null
        };
    }

    const dataInicial = [
        resultado[1],
        resultado[2],
        resultado[3]
    ].join("/");

    const dataFinal = [
        resultado[4],
        resultado[5],
        resultado[6]
    ].join("/");

    return {
        inicio: converterDataBrasileiraParaIso(
            dataInicial
        ),

        fim: converterDataBrasileiraParaIso(
            dataFinal
        )
    };
}


/*
 * Localiza a primeira data acompanhada de horário completo.
 *
 * Exemplo:
 * 22/07/2026 08:37:22
 */
function extrairDataEmissao(texto) {
    const resultado = texto.match(
        /(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})/
    );

    if (!resultado) {
        return null;
    }

    return {
        data: converterDataBrasileiraParaIso(
            resultado[1]
        ),

        hora: resultado[2]
    };
}


/* =========================================================
   6. EXTRAÇÃO DAS MOVIMENTAÇÕES
   ========================================================= */

/*
 * Percorre as linhas do extrato e tenta identificar
 * movimentações bancárias.
 */
function extrairMovimentacoes(
    linhas,
    periodo
) {
    const movimentacoes = [];

    linhas.forEach(function (linha) {
        const movimentacao = interpretarLinhaMovimentacao(
            linha
        );

        if (movimentacao) {
            movimentacoes.push(
                movimentacao
            );

            return;
        }

        /*
         * Caso a linha não seja uma movimentação principal,
         * verificamos se ela complementa a movimentação anterior.
         */
        const ultimaMovimentacao = (
            movimentacoes[
                movimentacoes.length - 1
            ]
        );

        if (!ultimaMovimentacao) {
            return;
        }

        const complemento = interpretarLinhaComplementar(
            linha,
            ultimaMovimentacao,
            periodo
        );

        if (!complemento) {
            return;
        }

        aplicarComplementoNaMovimentacao(
            ultimaMovimentacao,
            complemento
        );
    });

    /*
     * A classificação final acontece somente depois
     * de relacionarmos as linhas complementares.
     */
    /*
 * Primeiro classificamos todas as movimentações.
 */
const movimentacoesClassificadas = movimentacoes.map(
    function (movimentacao) {
        return {
            ...movimentacao,

            classificacao:
                classificarMovimentacao(
                    movimentacao
                )
        };
    }
);

/*
 * Alguns PDFs podem apresentar o mesmo conteúdo duas vezes
 * em sua camada interna de texto.
 *
 * Removemos essas repetições antes de gerar os identificadores.
 */
const movimentacoesUnicas = removerMovimentacoesDuplicadas(
    movimentacoesClassificadas
);

/*
 * Os códigos temporários somente são criados depois
 * da remoção das duplicidades.
 */
return movimentacoesUnicas.map(
    function (movimentacao, indice) {
        return {
            idTemporario:
                "MOV-"
                + String(indice + 1)
                    .padStart(4, "0"),

            ...movimentacao
        };
    }
);
}

/* =========================================================
   REMOÇÃO DE MOVIMENTAÇÕES DUPLICADAS
   ========================================================= */

/*
 * Remove lançamentos repetidos encontrados na camada
 * interna de texto do PDF.
 *
 * O primeiro registro é preservado.
 */
function removerMovimentacoesDuplicadas(
    movimentacoes
) {
    const chavesEncontradas = new Set();

    return movimentacoes.filter(
        function (movimentacao) {
            const chave = criarChaveMovimentacao(
                movimentacao
            );

            if (chavesEncontradas.has(chave)) {
                return false;
            }

            chavesEncontradas.add(chave);

            return true;
        }
    );
}


/*
 * Cria uma assinatura textual para comparar movimentações.
 *
 * Não utilizamos apenas o valor porque duas movimentações
 * diferentes podem possuir o mesmo valor.
 */
function criarChaveMovimentacao(
    movimentacao
) {
    const valorNormalizado = (
        typeof movimentacao.valor === "number"
        && Number.isFinite(movimentacao.valor)
    )
        ? movimentacao.valor.toFixed(2)
        : "";

    const historicoNormalizado = normalizarParaComparacao(
        movimentacao.historico
    ).replace(/\s+/g, "");

    const documentoNormalizado = String(
        movimentacao.documento || ""
    ).replace(/\D/g, "");

    return [
        movimentacao.dataBalancete || "",
        movimentacao.dataMovimento || "",
        movimentacao.agenciaOrigem || "",
        movimentacao.lote || "",
        movimentacao.codigoHistorico || "",
        historicoNormalizado,
        documentoNormalizado,
        valorNormalizado,
        movimentacao.natureza || "",
        movimentacao.cnpj || ""
    ].join("|");
}

/*
 * Interpreta uma linha principal do extrato.
 *
 * Formatos encontrados:
 *
 * 21/07/2026 2946 99021 870 Transferência recebida ...
 *
 * 20/07/2026 21/07/2026 0000 14060 798 Resgate ...
 *
 * A segunda data é opcional.
 */
function interpretarLinhaMovimentacao(linha) {
    const resultadoCabecalho = linha.match(
        /^(\d{2}\/\d{2}\/\d{4})\s+(?:(\d{2}\/\d{2}\/\d{4})\s+)?(\d{4})\s+(\d{5})\s+(\d{3})\s+(.+)$/
    );

    if (!resultadoCabecalho) {
        return null;
    }

    const dataBalancete = resultadoCabecalho[1];

    const dataMovimento = (
        resultadoCabecalho[2]
        || dataBalancete
    );

    const agenciaOrigem = resultadoCabecalho[3];
    const lote = resultadoCabecalho[4];
    const codigoHistorico = resultadoCabecalho[5];
    const restanteDaLinha = resultadoCabecalho[6];

    const dadosFinanceiros = interpretarDadosFinanceiros(
        restanteDaLinha
    );

    /*
     * Algumas linhas podem começar com data e códigos,
     * mas não possuir um valor bancário válido.
     */
    if (!dadosFinanceiros) {
        return null;
    }

    return {
        dataBalancete:
            converterDataBrasileiraParaIso(
                dataBalancete
            ),

        dataMovimento:
            converterDataBrasileiraParaIso(
                dataMovimento
            ),

        hora: null,

        agenciaOrigem,

        lote,

        codigoHistorico,

        historico:
            dadosFinanceiros.historico,

        documento:
            dadosFinanceiros.documento,

        valor:
            dadosFinanceiros.valor,

        valorFormatado:
            formatarMoedaBrasileira(
                dadosFinanceiros.valor
            ),

        natureza:
            dadosFinanceiros.natureza,

        saldoAposMovimentacao:
            dadosFinanceiros.saldo,

        identificacaoOrigem: null,

        textoComplementar: null,

        cnpjBruto: null,

        cnpj: null,

        cnpjFormatado: null,

        cnpjValido: false,

        cnpjsCandidatos: []
    };
}


/*
 * Interpreta a parte da linha que contém:
 *
 * histórico;
 * documento;
 * valor;
 * natureza;
 * saldo opcional.
 */
function interpretarDadosFinanceiros(texto) {
    const resultado = texto.match(
        /^(.+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+([CD])(?:\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+([CD]))?$/
    );

    if (!resultado) {
        return null;
    }

    let historicoEDocumento = resultado[1].trim();

    const valor = converterValorBrasileiroParaNumero(
        resultado[2]
    );

    const natureza = (
        resultado[3] === "C"
            ? "credito"
            : "debito"
    );

    const saldo = resultado[4]
        ? converterValorBrasileiroParaNumero(
            resultado[4]
        )
        : null;

    /*
     * O último trecho antes do valor pode ser
     * o número do documento bancário.
     */
    const partes = historicoEDocumento.split(/\s+/);

    const ultimoTrecho = partes[
        partes.length - 1
    ];

    const pareceDocumento = (
        /^\d[\d.]*$/.test(ultimoTrecho)
        && ultimoTrecho.length >= 4
    );

    let documento = null;

    if (pareceDocumento) {
        documento = ultimoTrecho;

        partes.pop();

        historicoEDocumento = partes.join(" ");
    }

    return {
        historico:
            historicoEDocumento.trim(),

        documento,

        valor,

        natureza,

        saldo
    };
}


/* =========================================================
   7. LINHA COMPLEMENTAR
   ========================================================= */

/*
 * Interpreta uma linha complementar em um dos dois formatos
 * observados até agora:
 *
 * Formato 1 (com data/hora):
 * 21/07 16:32 FEDERA 00001280707000161
 *
 * Formato 2 (sem data/hora — observado no extrato real da
 * conta 45.140-1, em movimentações "Recebimento Fornecedor"):
 * 62.388.566/0001-90 FEDERACAO NACIONAL
 */
function interpretarLinhaComplementar(
    linha,
    movimentacaoAnterior,
    periodo
) {
    const resultadoComHora = linha.match(
        /^(\d{2})\/(\d{2})\s+(\d{2}:\d{2})\s+(.+)$/
    );

    if (resultadoComHora) {
        return interpretarComplementoComHora(
            resultadoComHora,
            movimentacaoAnterior,
            periodo
        );
    }

    return interpretarComplementoSemHora(
        linha
    );
}


/*
 * Trata o formato original, no qual a linha complementar
 * começa com data e hora.
 */
function interpretarComplementoComHora(
    resultado,
    movimentacaoAnterior,
    periodo
) {
    const dia = resultado[1];
    const mes = resultado[2];
    const hora = resultado[3];
    const descricao = resultado[4].trim();

    const ano = obterAnoParaComplemento(
        movimentacaoAnterior,
        periodo
    );

    const dataComplemento = ano
        ? converterDataBrasileiraParaIso(
            `${dia}/${mes}/${ano}`
        )
        : null;

    /*
     * Evita relacionar uma linha de outro dia
     * com a movimentação anterior por engano.
     */
    if (
        dataComplemento
        && movimentacaoAnterior.dataMovimento
        && dataComplemento
            !== movimentacaoAnterior.dataMovimento
    ) {
        return null;
    }

    return montarComplemento(
        descricao,
        dataComplemento,
        hora
    );
}


/*
 * Trata o formato sem data/hora, no qual a linha complementar
 * apresenta diretamente o CNPJ e o nome da entidade de origem.
 *
 * Como não há data/hora para validar, exigimos que a linha
 * contenha ao menos um CNPJ candidato — do contrário, corremos
 * o risco de tratar qualquer linha solta do extrato (rodapé,
 * observações etc.) como se fosse um complemento de movimentação.
 */
function interpretarComplementoSemHora(
    linha
) {
    const descricao = linha.trim();

    if (!descricao) {
        return null;
    }

    const cnpjsCandidatos = extrairCnpjsCandidatos(
        descricao
    );

    if (cnpjsCandidatos.length === 0) {
        return null;
    }

    return montarComplemento(
        descricao,
        null,
        null
    );
}


/*
 * Monta o objeto de complemento a partir da descrição já
 * identificada, reaproveitado pelos dois formatos suportados.
 */
function montarComplemento(
    descricao,
    dataComplemento,
    hora
) {
    const cnpjsCandidatos = extrairCnpjsCandidatos(
        descricao
    );

    const primeiroCnpj = (
        cnpjsCandidatos[0]
        || null
    );

    const identificacaoOrigem = removerSequenciasNumericasLongas(
        descricao
    );

    return {
        data: dataComplemento,
        hora,
        descricao,
        identificacaoOrigem:
            identificacaoOrigem || null,
        cnpjsCandidatos,
        cnpj: primeiroCnpj
    };
}


/*
 * Obtém o ano da movimentação ou do período.
 */
function obterAnoParaComplemento(
    movimentacao,
    periodo
) {
    if (movimentacao.dataMovimento) {
        return movimentacao.dataMovimento.slice(
            0,
            4
        );
    }

    if (periodo && periodo.inicio) {
        return periodo.inicio.slice(
            0,
            4
        );
    }

    return null;
}


/*
 * Adiciona os dados complementares à movimentação principal.
 */
function aplicarComplementoNaMovimentacao(
    movimentacao,
    complemento
) {
    movimentacao.hora =
        complemento.hora;

    movimentacao.identificacaoOrigem =
        complemento.identificacaoOrigem;

    movimentacao.textoComplementar =
        complemento.descricao;

    movimentacao.cnpjsCandidatos =
        complemento.cnpjsCandidatos;

    if (!complemento.cnpj) {
        return;
    }

    movimentacao.cnpjBruto =
        complemento.descricao;

    movimentacao.cnpj =
        complemento.cnpj;

    movimentacao.cnpjFormatado =
        formatarCnpj(
            complemento.cnpj
        );

    movimentacao.cnpjValido =
        validarCnpj(
            complemento.cnpj
        );
}


/* =========================================================
   8. EXTRAÇÃO E VALIDAÇÃO DO CNPJ
   ========================================================= */

/*
 * Procura sequências de 14 a 20 dígitos.
 *
 * Quando há números adicionais antes do CNPJ,
 * testamos todas as janelas possíveis de 14 dígitos.
 */
export function extrairCnpjsCandidatos(texto) {
    if (typeof texto !== "string") {
        return [];
    }

    const candidatos = new Set();

    /*
     * Formato 1 — CNPJ já pontuado, como aparece na linha
     * complementar de "Recebimento Fornecedor" no extrato real:
     * 62.388.566/0001-90
     *
     * Buscamos esse padrão primeiro porque, uma vez pontuado,
     * ele não é capturado pela busca de dígitos "grudados" abaixo.
     */
    const formatados = texto.match(
        /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g
    );

    if (formatados) {
        formatados.forEach(function (candidatoFormatado) {
            const candidatoLimpo = candidatoFormatado.replace(
                /\D/g,
                ""
            );

            if (validarCnpj(candidatoLimpo)) {
                candidatos.add(candidatoLimpo);
            }
        });
    }

    /*
     * Formato 2 — sequências de dígitos grudados, como no
     * exemplo original de teste (00001280707000161), em que
     * é preciso testar cada janela de 14 dígitos.
     */
    const sequencias = texto.match(
        /\d{14,20}/g
    );

    if (sequencias) {
        sequencias.forEach(function (sequencia) {
            if (sequencia.length === 14) {
                if (validarCnpj(sequencia)) {
                    candidatos.add(sequencia);
                }

                return;
            }

            for (
                let inicio = 0;
                inicio <= sequencia.length - 14;
                inicio += 1
            ) {
                const candidato = sequencia.slice(
                    inicio,
                    inicio + 14
                );

                if (validarCnpj(candidato)) {
                    candidatos.add(candidato);
                }
            }
        });
    }

    return Array.from(candidatos);
}


/*
 * Remove números extensos para obter apenas
 * o nome ou identificação resumida da origem.
 *
 * Entrada:
 * FEDERA 00001280707000161
 *
 * Saída:
 * FEDERA
 */
function removerSequenciasNumericasLongas(texto) {
    return texto
        .replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, "")
        .replace(/\d{14,20}/g, "")
        .replace(/\s+/g, " ")
        .trim();
}


/*
 * Limpa e formata o CNPJ.
 */
export function formatarCnpj(cnpj) {
    const cnpjLimpo = limparCnpj(
        cnpj
    );

    if (cnpjLimpo.length !== 14) {
        return cnpj;
    }

    return cnpjLimpo.replace(
        /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
        "$1.$2.$3/$4-$5"
    );
}


/*
 * Mantém somente os números do CNPJ.
 */
export function limparCnpj(cnpj) {
    if (
        typeof cnpj !== "string"
        && typeof cnpj !== "number"
    ) {
        return "";
    }

    return String(cnpj).replace(
        /\D/g,
        ""
    );
}


/*
 * Valida matematicamente os dois dígitos
 * verificadores do CNPJ.
 */
export function validarCnpj(cnpj) {
    const numeros = limparCnpj(
        cnpj
    );

    if (numeros.length !== 14) {
        return false;
    }

    /*
     * Sequências com todos os números iguais
     * não representam CNPJs válidos.
     */
    if (/^(\d)\1{13}$/.test(numeros)) {
        return false;
    }

    const base = numeros.slice(
        0,
        12
    );

    const primeiroDigito = calcularDigitoCnpj(
        base,
        [
            5, 4, 3, 2,
            9, 8, 7, 6,
            5, 4, 3, 2
        ]
    );

    const segundoDigito = calcularDigitoCnpj(
        base + primeiroDigito,
        [
            6, 5, 4, 3, 2,
            9, 8, 7, 6,
            5, 4, 3, 2
        ]
    );

    return (
        numeros.endsWith(
            String(primeiroDigito)
            + String(segundoDigito)
        )
    );
}


/*
 * Calcula um dígito verificador do CNPJ.
 */
function calcularDigitoCnpj(
    base,
    pesos
) {
    const soma = base
        .split("")
        .reduce(
            function (
                acumulador,
                numero,
                indice
            ) {
                return (
                    acumulador
                    + Number(numero)
                    * pesos[indice]
                );
            },
            0
        );

    const resto = soma % 11;

    return resto < 2
        ? 0
        : 11 - resto;
}


/* =========================================================
   9. CLASSIFICAÇÃO DAS MOVIMENTAÇÕES
   ========================================================= */

/*
 * Classifica uma movimentação considerando:
 *
 * - crédito ou débito;
 * - histórico;
 * - presença de CNPJ válido;
 * - padrões internos conhecidos.
 */
function classificarMovimentacao(
    movimentacao
) {
   const historicoNormalizado = normalizarParaComparacao(
    movimentacao.historico
);

/*
 * A versão compacta permite reconhecer históricos
 * apresentados com letras separadas.
 *
 * Exemplo:
 * "S A L D O" passa a ser comparado como "saldo".
 */
const historicoCompacto = historicoNormalizado.replace(
    /\s+/g,
    ""
);

const movimentacaoInterna = HISTORICOS_INTERNOS.some(
    function (historicoInterno) {
        const padraoNormalizado = normalizarParaComparacao(
            historicoInterno
        );

        const padraoCompacto = padraoNormalizado.replace(
            /\s+/g,
            ""
        );

        return (
            historicoNormalizado.includes(
                padraoNormalizado
            )
            || historicoCompacto.includes(
                padraoCompacto
            )
        );
    }
);

    if (movimentacaoInterna) {
        return "movimentacao_interna";
    }

    if (movimentacao.natureza === "debito") {
        return "movimentacao_nao_relevante";
    }

    const recebimentoExterno = HISTORICOS_RECEBIMENTO_EXTERNO.some(
        function (historicoExterno) {
            return historicoNormalizado.includes(
                normalizarParaComparacao(
                    historicoExterno
                )
            );
        }
    );

    if (
        recebimentoExterno
        && movimentacao.cnpjValido
    ) {
        return "alta_possibilidade_devolucao";
    }

    if (
        recebimentoExterno
        && !movimentacao.cnpj
    ) {
        return "possivel_devolucao_sem_cnpj";
    }

    if (recebimentoExterno) {
        return "possivel_devolucao";
    }

    if (movimentacao.natureza === "credito") {
        return "movimentacao_desconhecida";
    }

    return "movimentacao_nao_relevante";
}


/*
 * Remove acentos e padroniza o texto para comparação.
 */
function normalizarParaComparacao(texto) {
    if (typeof texto !== "string") {
        return "";
    }

    return texto
        .normalize("NFD")
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}


/* =========================================================
   10. DATAS
   ========================================================= */

/*
 * Converte:
 *
 * 21/07/2026
 *
 * para:
 *
 * 2026-07-21
 */
export function converterDataBrasileiraParaIso(
    dataBrasileira
) {
    if (typeof dataBrasileira !== "string") {
        return null;
    }

    const resultado = dataBrasileira.match(
        /^(\d{2})\/(\d{2})\/(\d{4})$/
    );

    if (!resultado) {
        return null;
    }

    const dia = resultado[1];
    const mes = resultado[2];
    const ano = resultado[3];

    return `${ano}-${mes}-${dia}`;
}


/* =========================================================
   11. VALORES MONETÁRIOS
   ========================================================= */

/*
 * Converte:
 *
 * 16.335,74
 *
 * para:
 *
 * 16335.74
 */
export function converterValorBrasileiroParaNumero(
    valor
) {
    if (typeof valor !== "string") {
        return null;
    }

    const valorNormalizado = valor
        .replace(/\./g, "")
        .replace(",", ".")
        .replace(/[^\d.-]/g, "");

    const numero = Number(
        valorNormalizado
    );

    return Number.isFinite(numero)
        ? numero
        : null;
}


/*
 * Formata um número no padrão monetário brasileiro.
 */
export function formatarMoedaBrasileira(
    valor
) {
    if (
        typeof valor !== "number"
        || !Number.isFinite(valor)
    ) {
        return "R$ 0,00";
    }

    return valor.toLocaleString(
        "pt-BR",
        {
            style: "currency",
            currency: "BRL"
        }
    );
}


/*
 * Soma os valores das movimentações recebidas.
 */
function calcularValorTotal(
    movimentacoes
) {
    return movimentacoes.reduce(
        function (
            total,
            movimentacao
        ) {
            const valor = (
                typeof movimentacao.valor
                === "number"
                    ? movimentacao.valor
                    : 0
            );

            return total + valor;
        },
        0
    );
}


/* =========================================================
   12. MENSAGEM DE CONTA NÃO MOVIMENTADA
   ========================================================= */

/*
 * A frase é registrada apenas como informação complementar.
 *
 * Ela não substitui a leitura das movimentações.
 */
function verificarMensagemSemMovimentacao(
    texto
) {
    const textoNormalizado = normalizarParaComparacao(
        texto
    );

    return textoNormalizado.includes(
        "a conta nao foi movimentada"
    );
}