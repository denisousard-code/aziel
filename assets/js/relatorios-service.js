"use strict";

/*
 * =========================================================
 * AZIEL — SERVIÇO DE RELATÓRIOS
 * =========================================================
 *
 * Por enquanto, este serviço só organiza os relatórios que a
 * Gestão de Projetos entrega — nome, categoria, descrição e status.
 *
 * A geração automática de cada relatório específico (a partir
 * de relatórios do Fluig, como já foi feito com Indicadores ISO
 * e Entidades) vai sendo conectada aqui um relatório de cada
 * vez, conforme cada um for definido.
 */


import {
    abrirBancoAziel,
    CONFIGURACAO_STORAGE_AZIEL
} from "./storage-service.js";


/* =========================================================
   1. ERRO PERSONALIZADO
   ========================================================= */

export class ErroServicoRelatorios extends Error {
    constructor(
        mensagem,
        codigo = "ERRO_SERVICO_RELATORIOS",
        causa = null
    ) {
        super(mensagem);

        this.name = "ErroServicoRelatorios";
        this.codigo = codigo;
        this.causa = causa;
    }
}


/* =========================================================
   2. CATEGORIAS RECONHECIDAS
   ========================================================= */

export const CATEGORIAS_RELATORIO = Object.freeze({
    DIRETORIA_GESTORES: "diretoria_gestores",
    MDM8: "mdm8",
    OUTROS: "outros",
    ACRE: "acre"
});

export const ROTULOS_CATEGORIA_RELATORIO = Object.freeze({
    [CATEGORIAS_RELATORIO.DIRETORIA_GESTORES]: "Gerente Administrativo",
    [CATEGORIAS_RELATORIO.MDM8]: "MDM8",
    [CATEGORIAS_RELATORIO.OUTROS]: "Outros",
    [CATEGORIAS_RELATORIO.ACRE]: "Acre"
});

export const STATUS_RELATORIO = Object.freeze({
    NAO_AUTOMATIZADO: "nao_automatizado",
    EM_DEFINICAO: "em_definicao",
    PRONTO: "pronto"
});

export const ROTULOS_STATUS_RELATORIO = Object.freeze({
    [STATUS_RELATORIO.NAO_AUTOMATIZADO]: "Ainda manual",
    [STATUS_RELATORIO.EM_DEFINICAO]: "Em definição",
    [STATUS_RELATORIO.PRONTO]: "Automatizado"
});


/* =========================================================
   3. CADASTRO E ATUALIZAÇÃO
   ========================================================= */

/*
 * Cadastra ou atualiza um relatório. Quando "dados.id" já existe
 * na base, atualiza o registro em vez de duplicar.
 *
 * dados esperados:
 * {
 *     id: "uuid-opcional-para-atualizar",
 *     categoria: "diretoria_gestores" | "mdm8" | "outros",
 *     nome: "Nome do relatório",
 *     descricao: "O que esse relatório contém e para quem vai",
 *     status: "nao_automatizado" | "em_definicao" | "pronto",
 *     observacao: "" (opcional)
 * }
 */
export async function cadastrarRelatorio(dados) {
    const relatorio = normalizarRelatorioParaSalvar(dados);

    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.relatorios,
        "readwrite"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.relatorios
    );

    const existente = await converterRequisicaoEmPromessa(
        store.get(relatorio.id)
    );

    const registroFinal = {
        ...relatorio,

        criadoEm:
            (existente && existente.criadoEm)
            || relatorio.criadoEm
    };

    await converterRequisicaoEmPromessa(
        store.put(registroFinal)
    );

    await aguardarConclusaoTransacao(transacao);

    return clonarRegistro(registroFinal);
}


export async function removerRelatorio(id) {
    if (!id) {
        throw new ErroServicoRelatorios(
            "Informe o relatório a ser removido.",
            "ID_AUSENTE"
        );
    }

    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.relatorios,
        "readwrite"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.relatorios
    );

    await converterRequisicaoEmPromessa(
        store.delete(id)
    );

    await aguardarConclusaoTransacao(transacao);
}


/* =========================================================
   4. LISTAGEM
   ========================================================= */

export async function listarRelatorios({
    categoria = null
} = {}) {
    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.relatorios,
        "readonly"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.relatorios
    );

    const resultado = await converterRequisicaoEmPromessa(
        store.getAll()
    );

    await aguardarConclusaoTransacao(transacao);

    return resultado
        .map(clonarRegistro)
        .filter(
            (relatorio) => !categoria || relatorio.categoria === categoria
        )
        .sort(
            (a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR")
        );
}


export async function buscarRelatorioPorId(id) {
    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.relatorios,
        "readonly"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.relatorios
    );

    const resultado = await converterRequisicaoEmPromessa(
        store.get(id)
    );

    await aguardarConclusaoTransacao(transacao);

    return resultado ? clonarRegistro(resultado) : null;
}


/* =========================================================
   5. NORMALIZAÇÃO
   ========================================================= */

function normalizarRelatorioParaSalvar(dados) {
    if (!dados || typeof dados !== "object") {
        throw new ErroServicoRelatorios(
            "Nenhum dado de relatório foi informado.",
            "DADOS_INVALIDOS"
        );
    }

    const nome = String(dados.nome || "").trim();

    if (!nome) {
        throw new ErroServicoRelatorios(
            "Informe o nome do relatório.",
            "NOME_AUSENTE"
        );
    }

    const categoria = Object.values(CATEGORIAS_RELATORIO).includes(
        dados.categoria
    )
        ? dados.categoria
        : CATEGORIAS_RELATORIO.OUTROS;

    const status = Object.values(STATUS_RELATORIO).includes(
        dados.status
    )
        ? dados.status
        : STATUS_RELATORIO.NAO_AUTOMATIZADO;

    const agora = new Date().toISOString();

    return {
        id: dados.id || gerarIdRelatorio(),
        categoria,
        nome,
        descricao: String(dados.descricao || "").trim() || null,
        status,
        observacao: String(dados.observacao || "").trim() || null,
        criadoEm: agora,
        atualizadoEm: agora
    };
}


function gerarIdRelatorio() {
    return (
        "REL-"
        + Date.now().toString(36)
        + "-"
        + Math.random().toString(36).slice(2, 8)
    );
}


/* =========================================================
   6. AUXILIARES DE TRANSAÇÃO INDEXEDDB
   ========================================================= */

function converterRequisicaoEmPromessa(requisicao) {
    return new Promise((resolve, reject) => {
        requisicao.onsuccess = () => resolve(requisicao.result);

        requisicao.onerror = () => reject(
            new ErroServicoRelatorios(
                "Falha ao acessar os relatórios.",
                "FALHA_INDEXEDDB",
                requisicao.error
            )
        );
    });
}


function aguardarConclusaoTransacao(transacao) {
    return new Promise((resolve, reject) => {
        transacao.oncomplete = () => resolve();

        transacao.onerror = () => reject(
            new ErroServicoRelatorios(
                "A transação com os relatórios falhou.",
                "TRANSACAO_FALHOU",
                transacao.error
            )
        );

        transacao.onabort = () => reject(
            new ErroServicoRelatorios(
                "A transação com os relatórios foi cancelada.",
                "TRANSACAO_CANCELADA",
                transacao.error
            )
        );
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
