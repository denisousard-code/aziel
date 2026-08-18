"use strict";

/*
 * =========================================================
 * AZIEL — SERVIÇO DE ENTIDADES (APAES E FEDERAÇÕES)
 * =========================================================
 *
 * Responsabilidades:
 *
 * - manter uma base local de entidades (nome, CNPJ, tipo, UF,
 *   situação e contas bancárias conhecidas);
 * - permitir cadastrar e atualizar entidades manualmente;
 * - permitir importar entidades em massa a partir de um CSV
 *   exportado do Fluig (ou de qualquer planilha exportada como
 *   CSV com as colunas esperadas);
 * - buscar uma entidade pelo CNPJ extraído de um extrato;
 * - buscar uma entidade pelos dados bancários (banco, agência
 *   e conta), para os casos em que o CNPJ não aparece no
 *   extrato.
 *
 * Este arquivo NÃO decide sozinho qual entidade corresponde a
 * uma devolução: ele só sugere. Assim como a consulta ao Fluig,
 * a confirmação final continua sendo do usuário (RNF-002).
 */


import {
    abrirBancoAziel,
    CONFIGURACAO_STORAGE_AZIEL
} from "./storage-service.js";

import {
    limparCnpj,
    validarCnpj,
    formatarCnpj
} from "./statement-parser.js";


/* =========================================================
   1. ERRO PERSONALIZADO
   ========================================================= */

export class ErroServicoEntidades extends Error {
    constructor(
        mensagem,
        codigo = "ERRO_SERVICO_ENTIDADES",
        causa = null
    ) {
        super(mensagem);

        this.name = "ErroServicoEntidades";
        this.codigo = codigo;
        this.causa = causa;
    }
}


/* =========================================================
   2. TIPOS DE ENTIDADE RECONHECIDOS
   ========================================================= */

export const TIPOS_ENTIDADE = Object.freeze({
    APAE: "apae",
    FEDERACAO: "federacao",
    OUTRA: "outra"
});


/* =========================================================
   3. CADASTRO E ATUALIZAÇÃO
   ========================================================= */

/*
 * Cadastra ou atualiza uma entidade.
 *
 * Como o CNPJ é a chave do registro, cadastrar uma entidade com
 * um CNPJ já existente atualiza o registro em vez de duplicá-lo.
 *
 * dados esperados:
 * {
 *     cnpj: "12.345.678/0001-99" (ou só números),
 *     nome: "Associação de Pais e Amigos dos Excepcionais de ...",
 *     nomeReduzido: "Apae de ...",
 *     tipo: "apae" | "federacao" | "outra",
 *     uf: "DF",
 *     situacao: "ativa" | "inativa" (opcional),
 *     contasBancarias: [
 *         { banco: "001", agencia: "452-9", conta: "45140-1" }
 *     ] (opcional),
 *     observacao: "" (opcional)
 * }
 */
export async function cadastrarEntidade(dados) {
    const entidade = normalizarEntidadeParaSalvar(
        dados
    );

    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.entidades,
        "readwrite"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.entidades
    );

    const existente = await converterRequisicaoEmPromessa(
        store.get(entidade.cnpj)
    );

    const registroFinal = {
        ...entidade,

        criadoEm:
            (existente && existente.criadoEm)
            || entidade.criadoEm,

        atualizadoEm:
            new Date().toISOString()
    };

    await converterRequisicaoEmPromessa(
        store.put(registroFinal)
    );

    await aguardarConclusaoTransacao(
        transacao
    );

    return clonarRegistro(
        registroFinal
    );
}


/*
 * Remove uma entidade da base local pelo CNPJ.
 */
export async function removerEntidade(cnpj) {
    const cnpjLimpo = limparCnpj(cnpj);

    if (!cnpjLimpo) {
        throw new ErroServicoEntidades(
            "Informe um CNPJ válido para remover a entidade.",
            "CNPJ_INVALIDO"
        );
    }

    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.entidades,
        "readwrite"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.entidades
    );

    await converterRequisicaoEmPromessa(
        store.delete(cnpjLimpo)
    );

    await aguardarConclusaoTransacao(
        transacao
    );
}


/* =========================================================
   4. BUSCA POR CNPJ
   ========================================================= */

/*
 * Busca uma entidade pelo CNPJ (aceita formatado ou só números).
 *
 * Retorna null quando o CNPJ é inválido ou não está cadastrado
 * — nunca lança erro nesse caso, já que "não encontrado" é um
 * resultado esperado e comum no dia a dia (RF-FLUIG-010, mesma
 * filosofia aplicada aqui).
 */
export async function buscarEntidadePorCnpj(cnpj) {
    const cnpjLimpo = limparCnpj(cnpj);

    if (!cnpjLimpo || !validarCnpj(cnpjLimpo)) {
        return null;
    }

    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.entidades,
        "readonly"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.entidades
    );

    const resultado = await converterRequisicaoEmPromessa(
        store.get(cnpjLimpo)
    );

    await aguardarConclusaoTransacao(
        transacao
    );

    return resultado
        ? clonarRegistro(resultado)
        : null;
}


/* =========================================================
   5. BUSCA POR DADOS BANCÁRIOS
   ========================================================= */

/*
 * Busca uma entidade pelos dados bancários da origem, usada
 * quando o extrato não trouxe um CNPJ reconhecível.
 *
 * dados esperados (todos opcionais, mas pelo menos "conta" ou
 * "agencia" devem ser informados, senão a busca não teria
 * critério suficiente):
 * { banco: "001", agencia: "452-9", conta: "45140-1" }
 *
 * Como o volume de entidades cadastradas tende a ser pequeno
 * (dezenas a poucas centenas), a busca varre todos os registros
 * em vez de manter um índice dedicado — mais simples de manter
 * e rápido o suficiente para esse volume.
 */
export async function buscarEntidadePorDadosBancarios({
    banco: codigoBanco = null,
    agencia = null,
    conta = null
} = {}) {
    const agenciaNormalizada = normalizarDadoBancario(
        agencia
    );

    const contaNormalizada = normalizarDadoBancario(
        conta
    );

    const bancoNormalizado = normalizarDadoBancario(
        codigoBanco
    );

    if (!agenciaNormalizada && !contaNormalizada) {
        return [];
    }

    const entidades = await listarEntidades();

    return entidades.filter(function (entidade) {
        return entidade.contasBancarias.some(
            function (contaBancaria) {
                const bancoConfere = (
                    !bancoNormalizado
                    || normalizarDadoBancario(
                        contaBancaria.banco
                    ) === bancoNormalizado
                );

                const agenciaConfere = (
                    !agenciaNormalizada
                    || normalizarDadoBancario(
                        contaBancaria.agencia
                    ) === agenciaNormalizada
                );

                const contaConfere = (
                    !contaNormalizada
                    || normalizarDadoBancario(
                        contaBancaria.conta
                    ) === contaNormalizada
                );

                return (
                    bancoConfere
                    && agenciaConfere
                    && contaConfere
                );
            }
        );
    });
}


/* =========================================================
   6. LISTAGEM
   ========================================================= */

export async function listarEntidades({
    tipo = null,
    uf = null
} = {}) {
    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.entidades,
        "readonly"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.entidades
    );

    const resultado = await converterRequisicaoEmPromessa(
        store.getAll()
    );

    await aguardarConclusaoTransacao(
        transacao
    );

    return resultado
        .map(clonarRegistro)
        .filter(function (entidade) {
            const tipoConfere = (
                !tipo
                || entidade.tipo === tipo
            );

            const ufConfere = (
                !uf
                || entidade.uf === uf.toUpperCase()
            );

            return tipoConfere && ufConfere;
        });
}


/* =========================================================
   7. IMPORTAÇÃO EM MASSA (CSV)
   ========================================================= */

/*
 * Colunas reconhecidas na importação (aceita variações de
 * acento, maiúsculas/minúsculas e o uso de "_" ou espaço):
 *
 * cnpj            (obrigatória)
 * nome            (obrigatória)
 * nome reduzido   (opcional — usa "nome" se ausente)
 * tipo            (opcional — "apae", "federacao" ou "outra";
 *                  usa "outra" se ausente ou não reconhecido)
 * uf              (opcional)
 * situacao        (opcional)
 * banco           (opcional)
 * agencia         (opcional)
 * conta           (opcional)
 *
 * Ainda não sabemos o formato exato do export do Fluig — este
 * mapeamento cobre os nomes de coluna mais prováveis. Assim que
 * tivermos um export real, ajustamos os apelidos reconhecidos
 * em MAPA_COLUNAS abaixo, sem precisar mudar o resto da função.
 */
const MAPA_COLUNAS = {
    cnpj: ["cnpj"],
    nome: ["nome", "razaosocial", "razaosocial(nome)", "entidade"],
    nomeReduzido: ["nomereduzido", "apelido", "nomefantasia", "sigla"],
    tipo: ["tipo"],
    uf: ["uf", "estado"],
    situacao: ["situacao", "status"],
    banco: ["banco", "codigobanco"],
    agencia: ["agencia"],
    conta: ["conta", "contacorrente"]
};


export async function importarEntidadesCsv(
    textoCsv,
    {
        separador = ";"
    } = {}
) {
    const linhas = textoCsv
        .split(/\r?\n/)
        .map(function (linha) {
            return linha.trim();
        })
        .filter(Boolean);

    if (linhas.length < 2) {
        throw new ErroServicoEntidades(
            "O arquivo precisa ter uma linha de cabeçalho e ao menos uma linha de dados.",
            "CSV_VAZIO"
        );
    }

    const cabecalho = linhas[0]
        .split(separador)
        .map(normalizarNomeColuna);

    const indicesColunas = mapearIndicesColunas(
        cabecalho
    );

    if (indicesColunas.cnpj === -1) {
        throw new ErroServicoEntidades(
            "O arquivo precisa ter uma coluna de CNPJ.",
            "COLUNA_CNPJ_AUSENTE"
        );
    }

    const relatorio = {
        totalLinhas: linhas.length - 1,
        importadas: 0,
        atualizadas: 0,
        invalidas: []
    };

    for (
        let numeroLinha = 1;
        numeroLinha < linhas.length;
        numeroLinha += 1
    ) {
        const colunas = linhas[numeroLinha].split(
            separador
        );

        try {
            const dadosLinha = extrairDadosDaLinha(
                colunas,
                indicesColunas
            );

            const cnpjLimpo = limparCnpj(
                dadosLinha.cnpj
            );

            if (!cnpjLimpo || !validarCnpj(cnpjLimpo)) {
                relatorio.invalidas.push({
                    linha: numeroLinha + 1,
                    motivo: "CNPJ ausente ou inválido"
                });

                continue;
            }

            const jaExistia = Boolean(
                await buscarEntidadePorCnpj(
                    cnpjLimpo
                )
            );

            await cadastrarEntidade(
                dadosLinha
            );

            if (jaExistia) {
                relatorio.atualizadas += 1;
            } else {
                relatorio.importadas += 1;
            }
        } catch (erro) {
            relatorio.invalidas.push({
                linha: numeroLinha + 1,
                motivo: obterMensagemErro(erro)
            });
        }
    }

    return relatorio;
}


function extrairDadosDaLinha(
    colunas,
    indices
) {
    function valorDaColuna(indice) {
        return indice >= 0 && indice < colunas.length
            ? colunas[indice].trim()
            : "";
    }

    const banco = valorDaColuna(indices.banco);
    const agencia = valorDaColuna(indices.agencia);
    const conta = valorDaColuna(indices.conta);

    const contasBancarias = (
        banco || agencia || conta
    )
        ? [{ banco, agencia, conta }]
        : [];

    return {
        cnpj: valorDaColuna(indices.cnpj),
        nome: valorDaColuna(indices.nome),
        nomeReduzido: valorDaColuna(indices.nomeReduzido),
        tipo: valorDaColuna(indices.tipo),
        uf: valorDaColuna(indices.uf),
        situacao: valorDaColuna(indices.situacao),
        contasBancarias
    };
}


function mapearIndicesColunas(cabecalho) {
    const indices = {};
    const colunasUsadas = new Set();

    /*
     * Primeira passada: correspondência exata (depois de
     * normalizar acentos/maiúsculas/separadores). É a mais
     * confiável, então tem prioridade.
     */
    Object.keys(MAPA_COLUNAS).forEach(function (campo) {
        const apelidos = MAPA_COLUNAS[campo];

        const indiceEncontrado = cabecalho.findIndex(
            function (colunaCabecalho, indice) {
                return (
                    !colunasUsadas.has(indice)
                    && apelidos.includes(colunaCabecalho)
                );
            }
        );

        indices[campo] = indiceEncontrado;

        if (indiceEncontrado !== -1) {
            colunasUsadas.add(indiceEncontrado);
        }
    });

    /*
     * Segunda passada: correspondência por conteúdo, para
     * cabeçalhos como "Nº CNPJ" ou "CNPJ da Entidade", que não
     * batem exatamente com o apelido mas o contêm.
     */
    Object.keys(MAPA_COLUNAS).forEach(function (campo) {
        if (indices[campo] !== -1) {
            return;
        }

        const apelidos = MAPA_COLUNAS[campo];

        const indiceEncontrado = cabecalho.findIndex(
            function (colunaCabecalho, indice) {
                return (
                    !colunasUsadas.has(indice)
                    && apelidos.some(
                        function (apelido) {
                            return colunaCabecalho.includes(
                                apelido
                            );
                        }
                    )
                );
            }
        );

        indices[campo] = indiceEncontrado;

        if (indiceEncontrado !== -1) {
            colunasUsadas.add(indiceEncontrado);
        }
    });

    return indices;
}


function normalizarNomeColuna(nome) {
    return nome
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}


/*
 * Gera um modelo de CSV para facilitar a exportação a partir
 * do Fluig ou de qualquer outra planilha.
 */
export function gerarModeloCsvEntidades() {
    return (
        "cnpj;nome;nome_reduzido;tipo;uf;situacao;banco;agencia;conta\n"
        + "12.345.678/0001-99;Associação de Pais e Amigos dos Excepcionais de Exemplo;Apae de Exemplo;apae;DF;ativa;001;452-9;45140-1"
    );
}


/* =========================================================
   8. NORMALIZAÇÃO
   ========================================================= */

function normalizarEntidadeParaSalvar(dados) {
    if (!dados || typeof dados !== "object") {
        throw new ErroServicoEntidades(
            "Nenhum dado de entidade foi informado.",
            "DADOS_INVALIDOS"
        );
    }

    const cnpjLimpo = limparCnpj(dados.cnpj);

    if (!cnpjLimpo || !validarCnpj(cnpjLimpo)) {
        throw new ErroServicoEntidades(
            `CNPJ inválido: "${dados.cnpj || ""}".`,
            "CNPJ_INVALIDO"
        );
    }

    const nome = String(dados.nome || "").trim();

    if (!nome) {
        throw new ErroServicoEntidades(
            "Informe o nome da entidade.",
            "NOME_AUSENTE"
        );
    }

    const tipoInformado = normalizarNomeColuna(
        String(dados.tipo || "")
    );

    const tipo = Object.values(TIPOS_ENTIDADE).includes(
        tipoInformado
    )
        ? tipoInformado
        : TIPOS_ENTIDADE.OUTRA;

    return {
        cnpj: cnpjLimpo,
        cnpjFormatado: formatarCnpj(cnpjLimpo),
        nome,

        nomeReduzido:
            String(dados.nomeReduzido || "").trim()
            || nome,

        tipo,

        uf:
            String(dados.uf || "").trim().toUpperCase()
            || null,

        situacao:
            String(dados.situacao || "").trim()
            || null,

        contasBancarias: normalizarContasBancarias(
            dados.contasBancarias
        ),

        observacao:
            String(dados.observacao || "").trim()
            || null,

        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString()
    };
}


function normalizarContasBancarias(contas) {
    if (!Array.isArray(contas)) {
        return [];
    }

    return contas
        .filter(function (conta) {
            return (
                conta
                && (conta.banco || conta.agencia || conta.conta)
            );
        })
        .map(function (conta) {
            return {
                banco: String(conta.banco || "").trim(),
                agencia: String(conta.agencia || "").trim(),
                conta: String(conta.conta || "").trim()
            };
        });
}


function normalizarDadoBancario(valor) {
    if (!valor) {
        return "";
    }

    return String(valor)
        .replace(/[^\dA-Za-z]/g, "")
        .toUpperCase();
}


/* =========================================================
   9. AUXILIARES DE TRANSAÇÃO INDEXEDDB
   ========================================================= */

function converterRequisicaoEmPromessa(requisicao) {
    return new Promise(function (resolve, reject) {
        requisicao.onsuccess = function () {
            resolve(requisicao.result);
        };

        requisicao.onerror = function () {
            reject(
                new ErroServicoEntidades(
                    "Falha ao acessar a base de entidades.",
                    "FALHA_INDEXEDDB",
                    requisicao.error
                )
            );
        };
    });
}


function aguardarConclusaoTransacao(transacao) {
    return new Promise(function (resolve, reject) {
        transacao.oncomplete = function () {
            resolve();
        };

        transacao.onerror = function () {
            reject(
                new ErroServicoEntidades(
                    "A transação com a base de entidades falhou.",
                    "TRANSACAO_FALHOU",
                    transacao.error
                )
            );
        };

        transacao.onabort = function () {
            reject(
                new ErroServicoEntidades(
                    "A transação com a base de entidades foi cancelada.",
                    "TRANSACAO_CANCELADA",
                    transacao.error
                )
            );
        };
    });
}


function clonarRegistro(registro) {
    if (!registro) {
        return registro;
    }

    return typeof structuredClone === "function"
        ? structuredClone(registro)
        : JSON.parse(JSON.stringify(registro));
}


function obterMensagemErro(erro) {
    if (erro instanceof ErroServicoEntidades) {
        return erro.message;
    }

    return "Erro inesperado ao processar a linha.";
}
