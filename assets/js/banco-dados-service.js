"use strict";

/*
 * =========================================================
 * AZIEL — SERVIÇO DE BANCO DE DADOS
 * =========================================================
 *
 * Guarda os relatórios "mestre" — os que alimentam várias
 * ferramentas do Aziel — importados uma vez e reaproveitados,
 * em vez de precisar subir de novo em cada tela.
 *
 * Cada importação SUBSTITUI o conteúdo anterior daquele tipo
 * (não soma nem faz upsert linha a linha): o relatório do Fluig
 * é sempre um retrato completo e mais atual, não um incremento.
 */

import {
    abrirBancoAziel,
    CONFIGURACAO_STORAGE_AZIEL
} from "./storage-service.js";


export class ErroBancoDados extends Error {
    constructor(mensagem, codigo = "ERRO_BANCO_DADOS") {
        super(mensagem);
        this.name = "ErroBancoDados";
        this.codigo = codigo;
    }
}


export const TIPO_BASE_DADOS = Object.freeze({
    PAGAMENTOS_PROJETOS: "pagamentos_projetos",
    RELATORIO_MDM8: "relatorio_mdm8",
    RELATORIO_PROJETOS: "relatorio_projetos",
    CONTROLE_PROJETOS: "controle_projetos"
});

export const ROTULOS_BASE_DADOS = Object.freeze({
    [TIPO_BASE_DADOS.PAGAMENTOS_PROJETOS]: "Relatório de Pagamentos de Projetos",
    [TIPO_BASE_DADOS.RELATORIO_MDM8]: "Relatório MDM8",
    [TIPO_BASE_DADOS.RELATORIO_PROJETOS]: "Relatório de Projetos",
    [TIPO_BASE_DADOS.CONTROLE_PROJETOS]: "Controle de Projetos"
});


/* =========================================================
   1. SALVAR (SUBSTITUI O CONTEÚDO ANTERIOR)
   ========================================================= */

export async function salvarBaseDados(tipo, registros) {
    if (!Object.values(TIPO_BASE_DADOS).includes(tipo)) {
        throw new ErroBancoDados(
            `Tipo de base de dados inválido: "${tipo}".`,
            "TIPO_INVALIDO"
        );
    }

    if (!Array.isArray(registros)) {
        throw new ErroBancoDados(
            "Os registros precisam ser uma lista.",
            "REGISTROS_INVALIDOS"
        );
    }

    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.basesDadosImportadas,
        "readwrite"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.basesDadosImportadas
    );

    const registro = {
        tipo,
        registros,
        totalRegistros: registros.length,
        atualizadoEm: new Date().toISOString()
    };

    await converterRequisicaoEmPromessa(
        store.put(registro)
    );

    await aguardarConclusaoTransacao(transacao);

    return {
        tipo,
        totalRegistros: registro.totalRegistros,
        atualizadoEm: registro.atualizadoEm
    };
}


/* =========================================================
   2. CONSULTA
   ========================================================= */

export async function obterBaseDados(tipo) {
    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.basesDadosImportadas,
        "readonly"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.basesDadosImportadas
    );

    const resultado = await converterRequisicaoEmPromessa(
        store.get(tipo)
    );

    await aguardarConclusaoTransacao(transacao);

    return resultado || null;
}


export async function listarTodasAsBases() {
    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.basesDadosImportadas,
        "readonly"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.basesDadosImportadas
    );

    const resultado = await converterRequisicaoEmPromessa(
        store.getAll()
    );

    await aguardarConclusaoTransacao(transacao);

    const porTipo = {};

    resultado.forEach((base) => {
        porTipo[base.tipo] = {
            totalRegistros: base.totalRegistros,
            atualizadoEm: base.atualizadoEm
        };
    });

    return porTipo;
}


export async function removerBaseDados(tipo) {
    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.basesDadosImportadas,
        "readwrite"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.basesDadosImportadas
    );

    await converterRequisicaoEmPromessa(
        store.delete(tipo)
    );

    await aguardarConclusaoTransacao(transacao);
}


/* =========================================================
   3. AUXILIARES DE TRANSAÇÃO INDEXEDDB
   ========================================================= */

function converterRequisicaoEmPromessa(requisicao) {
    return new Promise((resolve, reject) => {
        requisicao.onsuccess = () => resolve(requisicao.result);

        requisicao.onerror = () => reject(
            new ErroBancoDados(
                "Falha ao acessar o Banco de Dados.",
                "FALHA_INDEXEDDB"
            )
        );
    });
}


function aguardarConclusaoTransacao(transacao) {
    return new Promise((resolve, reject) => {
        transacao.oncomplete = () => resolve();

        transacao.onerror = () => reject(
            new ErroBancoDados(
                "A transação com o Banco de Dados falhou.",
                "TRANSACAO_FALHOU"
            )
        );

        transacao.onabort = () => reject(
            new ErroBancoDados(
                "A transação com o Banco de Dados foi cancelada.",
                "TRANSACAO_CANCELADA"
            )
        );
    });
}
