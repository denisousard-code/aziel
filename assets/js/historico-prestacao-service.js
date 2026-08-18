"use strict";

/*
 * =========================================================
 * AZIEL — HISTÓRICO DA PRESTAÇÃO DE CONTAS
 * =========================================================
 *
 * Guarda, mês a mês, se os ofícios de prestação de contas
 * foram enviados ou não — pra ver o ano inteiro de uma vez.
 * É uma marcação manual (o envio em si acontece fora do
 * Aziel), não algo que o sistema deduz sozinho.
 */

import {
    abrirBancoAziel,
    CONFIGURACAO_STORAGE_AZIEL
} from "./storage-service.js";


export class ErroHistoricoPrestacaoContas extends Error {
    constructor(mensagem, codigo = "ERRO_HISTORICO_PRESTACAO_CONTAS") {
        super(mensagem);
        this.name = "ErroHistoricoPrestacaoContas";
        this.codigo = codigo;
    }
}


function montarChave(ano, mes) {
    return `${ano}-${String(mes).padStart(2, "0")}`;
}


/* =========================================================
   1. MARCAR / DESMARCAR
   ========================================================= */

export async function marcarMesComoEnviado(ano, mes, observacao = "") {
    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.historicoPrestacaoContas,
        "readwrite"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.historicoPrestacaoContas
    );

    const registro = {
        chave: montarChave(ano, mes),
        ano,
        mes,
        enviado: true,
        dataMarcacao: new Date().toISOString(),
        observacao: String(observacao || "").trim() || null
    };

    await converterRequisicaoEmPromessa(
        store.put(registro)
    );

    await aguardarConclusaoTransacao(transacao);

    return registro;
}


export async function desmarcarMes(ano, mes) {
    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.historicoPrestacaoContas,
        "readwrite"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.historicoPrestacaoContas
    );

    await converterRequisicaoEmPromessa(
        store.delete(montarChave(ano, mes))
    );

    await aguardarConclusaoTransacao(transacao);
}


/* =========================================================
   2. CONSULTA
   ========================================================= */

export async function listarHistoricoDoAno(ano) {
    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.historicoPrestacaoContas,
        "readonly"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.historicoPrestacaoContas
    );

    const todos = await converterRequisicaoEmPromessa(
        store.getAll()
    );

    await aguardarConclusaoTransacao(transacao);

    const doAno = todos.filter((registro) => registro.ano === ano);

    const porMes = {};

    doAno.forEach((registro) => {
        porMes[registro.mes] = registro;
    });

    return porMes;
}


/* =========================================================
   3. AUXILIARES DE TRANSAÇÃO INDEXEDDB
   ========================================================= */

function converterRequisicaoEmPromessa(requisicao) {
    return new Promise((resolve, reject) => {
        requisicao.onsuccess = () => resolve(requisicao.result);

        requisicao.onerror = () => reject(
            new ErroHistoricoPrestacaoContas(
                "Falha ao acessar o histórico da prestação de contas.",
                "FALHA_INDEXEDDB"
            )
        );
    });
}


function aguardarConclusaoTransacao(transacao) {
    return new Promise((resolve, reject) => {
        transacao.oncomplete = () => resolve();

        transacao.onerror = () => reject(
            new ErroHistoricoPrestacaoContas(
                "A transação com o histórico falhou.",
                "TRANSACAO_FALHOU"
            )
        );

        transacao.onabort = () => reject(
            new ErroHistoricoPrestacaoContas(
                "A transação com o histórico foi cancelada.",
                "TRANSACAO_CANCELADA"
            )
        );
    });
}
