"use strict";

/*
 * =========================================================
 * AZIEL — SERVIÇO DE ROTINAS
 * =========================================================
 *
 * Atividades que se repetem (diária, semanal, mensal ou
 * eventual) — diferente das Demandas, uma rotina não "termina":
 * ela reseta sozinha a cada novo período, sem precisar recriar
 * o card manualmente.
 *
 * O reset é calculado na hora (comparando a data de hoje com a
 * última conclusão registrada), não depende de nenhum job/cron
 * rodando em segundo plano.
 */

import {
    abrirBancoAziel,
    CONFIGURACAO_STORAGE_AZIEL
} from "./storage-service.js";


export class ErroServicoRotinas extends Error {
    constructor(mensagem, codigo = "ERRO_SERVICO_ROTINAS") {
        super(mensagem);
        this.name = "ErroServicoRotinas";
        this.codigo = codigo;
    }
}


export const TIPO_ROTINA = Object.freeze({
    DIARIA: "diaria",
    SEMANAL: "semanal",
    MENSAL: "mensal",
    EVENTUAL: "eventual"
});

export const ROTULOS_TIPO_ROTINA = Object.freeze({
    [TIPO_ROTINA.DIARIA]: "Diária",
    [TIPO_ROTINA.SEMANAL]: "Semanal",
    [TIPO_ROTINA.MENSAL]: "Mensal",
    [TIPO_ROTINA.EVENTUAL]: "Eventual"
});


/* =========================================================
   1. CADASTRO E ATUALIZAÇÃO
   ========================================================= */

export async function cadastrarRotina(dados) {
    const rotina = normalizarRotinaParaSalvar(dados);

    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.rotinas,
        "readwrite"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.rotinas
    );

    const existente = await converterRequisicaoEmPromessa(
        store.get(rotina.id)
    );

    const registroFinal = {
        ...rotina,

        ultimaConclusao:
            rotina.ultimaConclusao !== undefined
                ? rotina.ultimaConclusao
                : ((existente && existente.ultimaConclusao) || null),

        criadoEm:
            (existente && existente.criadoEm)
            || rotina.criadoEm
    };

    await converterRequisicaoEmPromessa(
        store.put(registroFinal)
    );

    await aguardarConclusaoTransacao(transacao);

    return clonarRegistro(registroFinal);
}


export async function marcarRotinaComoConcluida(id) {
    const rotina = await buscarRotinaPorId(id);

    if (!rotina) {
        throw new ErroServicoRotinas(
            "Rotina não encontrada.",
            "ROTINA_NAO_ENCONTRADA"
        );
    }

    return cadastrarRotina({
        ...rotina,
        ultimaConclusao: new Date().toISOString()
    });
}


/*
 * Desfaz a conclusão (útil se marcou sem querer).
 */
export async function desmarcarRotina(id) {
    const rotina = await buscarRotinaPorId(id);

    if (!rotina) {
        throw new ErroServicoRotinas(
            "Rotina não encontrada.",
            "ROTINA_NAO_ENCONTRADA"
        );
    }

    return cadastrarRotina({
        ...rotina,
        ultimaConclusao: null
    });
}


export async function removerRotina(id) {
    if (!id) {
        throw new ErroServicoRotinas(
            "Informe a rotina a ser removida.",
            "ID_AUSENTE"
        );
    }

    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.rotinas,
        "readwrite"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.rotinas
    );

    await converterRequisicaoEmPromessa(
        store.delete(id)
    );

    await aguardarConclusaoTransacao(transacao);
}


/* =========================================================
   2. LISTAGEM
   ========================================================= */

export async function listarRotinas() {
    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.rotinas,
        "readonly"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.rotinas
    );

    const resultado = await converterRequisicaoEmPromessa(
        store.getAll()
    );

    await aguardarConclusaoTransacao(transacao);

    return resultado.map(clonarRegistro);
}


export async function buscarRotinaPorId(id) {
    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.rotinas,
        "readonly"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.rotinas
    );

    const resultado = await converterRequisicaoEmPromessa(
        store.get(id)
    );

    await aguardarConclusaoTransacao(transacao);

    return resultado ? clonarRegistro(resultado) : null;
}


/* =========================================================
   3. CÁLCULO DE STATUS (feito neste período ou não)
   ========================================================= */

/*
 * Devolve { concluidaNoPeriodo, diasRestantes, atrasada } com
 * base no tipo da rotina, no dia-limite (só faz sentido pra
 * mensal) e na data da última conclusão registrada — tudo
 * calculado a partir de "agora", sem guardar esse resultado.
 */
export function calcularStatusRotina(rotina, agora = new Date()) {
    const ultimaConclusao = rotina.ultimaConclusao
        ? new Date(rotina.ultimaConclusao)
        : null;

    if (rotina.tipo === TIPO_ROTINA.EVENTUAL) {
        return {
            concluidaNoPeriodo: Boolean(ultimaConclusao),
            diasRestantes: null,
            atrasada: false
        };
    }

    if (rotina.tipo === TIPO_ROTINA.DIARIA) {
        const concluidaHoje = (
            ultimaConclusao
            && mesmoDia(ultimaConclusao, agora)
        );

        return {
            concluidaNoPeriodo: Boolean(concluidaHoje),
            diasRestantes: 0,
            atrasada: !concluidaHoje && agora.getHours() >= 12
        };
    }

    if (rotina.tipo === TIPO_ROTINA.SEMANAL) {
        const inicioSemana = obterInicioDaSemana(agora);

        const concluidaNaSemana = (
            ultimaConclusao
            && ultimaConclusao >= inicioSemana
        );

        return {
            concluidaNoPeriodo: Boolean(concluidaNaSemana),
            diasRestantes: null,
            atrasada: false
        };
    }

    // Mensal
    const concluidaNoMes = (
        ultimaConclusao
        && ultimaConclusao.getFullYear() === agora.getFullYear()
        && ultimaConclusao.getMonth() === agora.getMonth()
    );

    const diaLimite = rotina.diaDoMes || null;

    let diasRestantes = null;
    let atrasada = false;

    if (diaLimite && !concluidaNoMes) {
        const dataLimite = new Date(
            agora.getFullYear(),
            agora.getMonth(),
            diaLimite,
            23,
            59,
            59
        );

        const diferencaMs = dataLimite.getTime() - agora.getTime();

        diasRestantes = Math.ceil(
            diferencaMs / (1000 * 60 * 60 * 24)
        );

        atrasada = diasRestantes < 0;
    }

    return {
        concluidaNoPeriodo: Boolean(concluidaNoMes),
        diasRestantes,
        atrasada
    };
}


function mesmoDia(dataA, dataB) {
    return (
        dataA.getFullYear() === dataB.getFullYear()
        && dataA.getMonth() === dataB.getMonth()
        && dataA.getDate() === dataB.getDate()
    );
}


/*
 * Início da semana (domingo, 00:00) que contém a data informada.
 */
function obterInicioDaSemana(data) {
    const inicio = new Date(data);

    inicio.setDate(
        inicio.getDate() - inicio.getDay()
    );

    inicio.setHours(0, 0, 0, 0);

    return inicio;
}


/* =========================================================
   4. NORMALIZAÇÃO
   ========================================================= */

function normalizarRotinaParaSalvar(dados) {
    if (!dados || typeof dados !== "object") {
        throw new ErroServicoRotinas(
            "Nenhum dado de rotina foi informado.",
            "DADOS_INVALIDOS"
        );
    }

    const titulo = String(dados.titulo || "").trim();

    if (!titulo) {
        throw new ErroServicoRotinas(
            "Informe o título da rotina.",
            "TITULO_AUSENTE"
        );
    }

    const tipo = Object.values(TIPO_ROTINA).includes(dados.tipo)
        ? dados.tipo
        : TIPO_ROTINA.MENSAL;

    const diaDoMes = (
        tipo === TIPO_ROTINA.MENSAL
        && dados.diaDoMes
        && Number(dados.diaDoMes) >= 1
        && Number(dados.diaDoMes) <= 31
    )
        ? Number(dados.diaDoMes)
        : null;

    const agora = new Date().toISOString();

    return {
        id: dados.id || gerarIdRotina(),
        titulo,
        descricao: String(dados.descricao || "").trim() || null,
        tipo,
        diaDoMes,
        ultimaConclusao: dados.ultimaConclusao,
        criadoEm: agora,
        atualizadoEm: agora
    };
}


function gerarIdRotina() {
    return (
        "ROT-"
        + Date.now().toString(36)
        + "-"
        + Math.random().toString(36).slice(2, 8)
    );
}


/* =========================================================
   5. AUXILIARES DE TRANSAÇÃO INDEXEDDB
   ========================================================= */

function converterRequisicaoEmPromessa(requisicao) {
    return new Promise((resolve, reject) => {
        requisicao.onsuccess = () => resolve(requisicao.result);

        requisicao.onerror = () => reject(
            new ErroServicoRotinas(
                "Falha ao acessar as rotinas.",
                "FALHA_INDEXEDDB"
            )
        );
    });
}


function aguardarConclusaoTransacao(transacao) {
    return new Promise((resolve, reject) => {
        transacao.oncomplete = () => resolve();

        transacao.onerror = () => reject(
            new ErroServicoRotinas(
                "A transação com as rotinas falhou.",
                "TRANSACAO_FALHOU"
            )
        );

        transacao.onabort = () => reject(
            new ErroServicoRotinas(
                "A transação com as rotinas foi cancelada.",
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
