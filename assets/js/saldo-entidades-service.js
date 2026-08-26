"use strict";

/*
 * =========================================================
 * AZIEL — ACOMPANHAMENTO DE SALDO DAS FEAPAES
 * =========================================================
 *
 * Guarda um retrato por dia dos saldos de todas as entidades
 * (do "Relatório de Saldo de Entidades" do Fluig), pra comparar
 * automaticamente com o retrato do dia anterior e mostrar a
 * diferença.
 *
 * Cada dia SUBSTITUI o retrato daquele mesmo dia (se importar de
 * novo, não duplica) — mas dias diferentes nunca se misturam.
 */

import {
    abrirBancoAziel,
    CONFIGURACAO_STORAGE_AZIEL
} from "./storage-service.js";


export class ErroSaldoEntidades extends Error {
    constructor(mensagem, codigo = "ERRO_SALDO_ENTIDADES") {
        super(mensagem);
        this.name = "ErroSaldoEntidades";
        this.codigo = codigo;
    }
}


/* =========================================================
   1. SALVAR (SUBSTITUI O RETRATO DAQUELE MESMO DIA)
   ========================================================= */

export async function salvarSnapshotDoDia(data, registros) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
        throw new ErroSaldoEntidades(
            `Data inválida: "${data}". Use o formato AAAA-MM-DD.`,
            "DATA_INVALIDA"
        );
    }

    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.acompanhamentoSaldo,
        "readwrite"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.acompanhamentoSaldo
    );

    const registro = {
        data,
        registros,
        importadoEm: new Date().toISOString()
    };

    await converterRequisicaoEmPromessa(
        store.put(registro)
    );

    await aguardarConclusaoTransacao(transacao);

    return registro;
}


/* =========================================================
   2. CONSULTA
   ========================================================= */

export async function obterSnapshotDoDia(data) {
    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.acompanhamentoSaldo,
        "readonly"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.acompanhamentoSaldo
    );

    const resultado = await converterRequisicaoEmPromessa(
        store.get(data)
    );

    await aguardarConclusaoTransacao(transacao);

    return resultado || null;
}


export async function listarTodosOsSnapshots() {
    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.acompanhamentoSaldo,
        "readonly"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.acompanhamentoSaldo
    );

    const resultado = await converterRequisicaoEmPromessa(
        store.getAll()
    );

    await aguardarConclusaoTransacao(transacao);

    return resultado.sort((a, b) => a.data.localeCompare(b.data));
}


/*
 * Acha o retrato mais recente ANTES de uma data (não precisa ser
 * exatamente "ontem" — pode ter passado um fim de semana, ou o
 * usuário ter esquecido de importar um dia).
 */
export async function obterSnapshotAnteriorA(data) {
    const todos = await listarTodosOsSnapshots();

    const anteriores = todos.filter(
        (snapshot) => snapshot.data < data
    );

    if (anteriores.length === 0) {
        return null;
    }

    return anteriores[anteriores.length - 1];
}


/* =========================================================
   3. COMPARAÇÃO
   ========================================================= */

/*
 * Compara o retrato de hoje com o retrato anterior mais recente,
 * devolvendo cada entidade com seu saldo de hoje, o saldo
 * anterior (ou null se não havia registro daquela entidade
 * ainda) e a diferença.
 */
export function compararComAnterior(registrosHoje, registrosAnterior) {
    const mapaAnterior = {};

    (registrosAnterior || []).forEach((registro) => {
        mapaAnterior[registro.codEntidade] = registro;
    });

    return registrosHoje.map((registro) => {
        const anterior = mapaAnterior[registro.codEntidade];

        return {
            ...registro,
            saldoAnterior: anterior ? anterior.saldo : null,
            diferenca: anterior
                ? Math.round((registro.saldo - anterior.saldo) * 100) / 100
                : null
        };
    });
}


/* =========================================================
   4. AUXILIARES DE TRANSAÇÃO INDEXEDDB
   ========================================================= */

function converterRequisicaoEmPromessa(requisicao) {
    return new Promise((resolve, reject) => {
        requisicao.onsuccess = () => resolve(requisicao.result);

        requisicao.onerror = () => reject(
            new ErroSaldoEntidades(
                "Falha ao acessar o acompanhamento de saldo.",
                "FALHA_INDEXEDDB"
            )
        );
    });
}


function aguardarConclusaoTransacao(transacao) {
    return new Promise((resolve, reject) => {
        transacao.oncomplete = () => resolve();

        transacao.onerror = () => reject(
            new ErroSaldoEntidades(
                "A transação com o acompanhamento de saldo falhou.",
                "TRANSACAO_FALHOU"
            )
        );

        transacao.onabort = () => reject(
            new ErroSaldoEntidades(
                "A transação com o acompanhamento de saldo foi "
                + "cancelada.",
                "TRANSACAO_CANCELADA"
            )
        );
    });
}
