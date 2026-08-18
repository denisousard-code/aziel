"use strict";

/*
 * =========================================================
 * AZIEL — SERVIÇO DE DEMANDAS
 * =========================================================
 *
 * Controle pessoal de tarefas, estilo Kanban (A fazer / Em
 * andamento / Aguardando / Concluída).
 */

import {
    abrirBancoAziel,
    CONFIGURACAO_STORAGE_AZIEL
} from "./storage-service.js";


export class ErroServicoDemandas extends Error {
    constructor(mensagem, codigo = "ERRO_SERVICO_DEMANDAS") {
        super(mensagem);
        this.name = "ErroServicoDemandas";
        this.codigo = codigo;
    }
}


export const STATUS_DEMANDA = Object.freeze({
    A_FAZER: "a_fazer",
    EM_ANDAMENTO: "em_andamento",
    AGUARDANDO: "aguardando",
    CONCLUIDA: "concluida"
});

export const ROTULOS_STATUS_DEMANDA = Object.freeze({
    [STATUS_DEMANDA.A_FAZER]: "A fazer",
    [STATUS_DEMANDA.EM_ANDAMENTO]: "Em andamento",
    [STATUS_DEMANDA.AGUARDANDO]: "Aguardando",
    [STATUS_DEMANDA.CONCLUIDA]: "Concluída"
});

export const PRIORIDADE_DEMANDA = Object.freeze({
    BAIXA: "baixa",
    MEDIA: "media",
    ALTA: "alta",
    URGENTE: "urgente"
});

export const ROTULOS_PRIORIDADE_DEMANDA = Object.freeze({
    [PRIORIDADE_DEMANDA.BAIXA]: "Baixa",
    [PRIORIDADE_DEMANDA.MEDIA]: "Média",
    [PRIORIDADE_DEMANDA.ALTA]: "Alta",
    [PRIORIDADE_DEMANDA.URGENTE]: "Urgente"
});


/* =========================================================
   1. CADASTRO E ATUALIZAÇÃO
   ========================================================= */

export async function cadastrarDemanda(dados) {
    const demanda = normalizarDemandaParaSalvar(dados);

    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.demandas,
        "readwrite"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.demandas
    );

    const existente = await converterRequisicaoEmPromessa(
        store.get(demanda.id)
    );

    const registroFinal = {
        ...demanda,

        criadoEm:
            (existente && existente.criadoEm)
            || demanda.criadoEm
    };

    await converterRequisicaoEmPromessa(
        store.put(registroFinal)
    );

    await aguardarConclusaoTransacao(transacao);

    return clonarRegistro(registroFinal);
}


export async function atualizarStatusDemanda(
    id,
    novoStatus
) {
    if (!Object.values(STATUS_DEMANDA).includes(novoStatus)) {
        throw new ErroServicoDemandas(
            `Status inválido: "${novoStatus}".`,
            "STATUS_INVALIDO"
        );
    }

    const demanda = await buscarDemandaPorId(id);

    if (!demanda) {
        throw new ErroServicoDemandas(
            "Demanda não encontrada.",
            "DEMANDA_NAO_ENCONTRADA"
        );
    }

    return cadastrarDemanda({
        ...demanda,
        status: novoStatus
    });
}


export async function removerDemanda(id) {
    if (!id) {
        throw new ErroServicoDemandas(
            "Informe a demanda a ser removida.",
            "ID_AUSENTE"
        );
    }

    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.demandas,
        "readwrite"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.demandas
    );

    await converterRequisicaoEmPromessa(
        store.delete(id)
    );

    await aguardarConclusaoTransacao(transacao);
}


/* =========================================================
   2. LISTAGEM
   ========================================================= */

export async function listarDemandas() {
    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.demandas,
        "readonly"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.demandas
    );

    const resultado = await converterRequisicaoEmPromessa(
        store.getAll()
    );

    await aguardarConclusaoTransacao(transacao);

    return resultado
        .map(clonarRegistro)
        .sort(ordenarDemandas);
}


/*
 * Ordena por prioridade (urgente primeiro) e, dentro da mesma
 * prioridade, por prazo mais próximo primeiro — demandas sem
 * prazo ficam por último dentro do grupo de prioridade.
 */
function ordenarDemandas(a, b) {
    const ordemPrioridade = {
        [PRIORIDADE_DEMANDA.URGENTE]: 0,
        [PRIORIDADE_DEMANDA.ALTA]: 1,
        [PRIORIDADE_DEMANDA.MEDIA]: 2,
        [PRIORIDADE_DEMANDA.BAIXA]: 3
    };

    const diferencaPrioridade = (
        (ordemPrioridade[a.prioridade] ?? 9)
        - (ordemPrioridade[b.prioridade] ?? 9)
    );

    if (diferencaPrioridade !== 0) {
        return diferencaPrioridade;
    }

    if (a.prazo && b.prazo) {
        return a.prazo.localeCompare(b.prazo);
    }

    if (a.prazo) {
        return -1;
    }

    if (b.prazo) {
        return 1;
    }

    return 0;
}


export async function buscarDemandaPorId(id) {
    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.demandas,
        "readonly"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.demandas
    );

    const resultado = await converterRequisicaoEmPromessa(
        store.get(id)
    );

    await aguardarConclusaoTransacao(transacao);

    return resultado ? clonarRegistro(resultado) : null;
}


/* =========================================================
   3. NORMALIZAÇÃO
   ========================================================= */

function normalizarDemandaParaSalvar(dados) {
    if (!dados || typeof dados !== "object") {
        throw new ErroServicoDemandas(
            "Nenhum dado de demanda foi informado.",
            "DADOS_INVALIDOS"
        );
    }

    const titulo = String(dados.titulo || "").trim();

    if (!titulo) {
        throw new ErroServicoDemandas(
            "Informe o título da demanda.",
            "TITULO_AUSENTE"
        );
    }

    const status = Object.values(STATUS_DEMANDA).includes(dados.status)
        ? dados.status
        : STATUS_DEMANDA.A_FAZER;

    const prioridade = Object.values(PRIORIDADE_DEMANDA).includes(
        dados.prioridade
    )
        ? dados.prioridade
        : PRIORIDADE_DEMANDA.MEDIA;

    const agora = new Date().toISOString();

    return {
        id: dados.id || gerarIdDemanda(),
        titulo,
        descricao: String(dados.descricao || "").trim() || null,
        prioridade,
        prazo: String(dados.prazo || "").trim() || null,
        quemPediu: String(dados.quemPediu || "").trim() || null,
        dependencia: String(dados.dependencia || "").trim() || null,
        proximaAcao: String(dados.proximaAcao || "").trim() || null,
        status,
        criadoEm: agora,
        atualizadoEm: agora
    };
}


function gerarIdDemanda() {
    return (
        "DEM-"
        + Date.now().toString(36)
        + "-"
        + Math.random().toString(36).slice(2, 8)
    );
}


/* =========================================================
   4. AUXILIARES DE TRANSAÇÃO INDEXEDDB
   ========================================================= */

function converterRequisicaoEmPromessa(requisicao) {
    return new Promise((resolve, reject) => {
        requisicao.onsuccess = () => resolve(requisicao.result);

        requisicao.onerror = () => reject(
            new ErroServicoDemandas(
                "Falha ao acessar as demandas.",
                "FALHA_INDEXEDDB"
            )
        );
    });
}


function aguardarConclusaoTransacao(transacao) {
    return new Promise((resolve, reject) => {
        transacao.oncomplete = () => resolve();

        transacao.onerror = () => reject(
            new ErroServicoDemandas(
                "A transação com as demandas falhou.",
                "TRANSACAO_FALHOU"
            )
        );

        transacao.onabort = () => reject(
            new ErroServicoDemandas(
                "A transação com as demandas foi cancelada.",
                "TRANSACAO_CANCELADA"
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
