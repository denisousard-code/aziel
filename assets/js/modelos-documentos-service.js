"use strict";

/*
 * =========================================================
 * AZIEL — SERVIÇO DE MODELOS DE DOCUMENTOS
 * =========================================================
 *
 * Guarda os arquivos .docx dos modelos (Ofício de Prestação de
 * Contas, Ofício de Liberação de Recursos, Edital do Acre) como
 * Blob, só no navegador — nunca fazem parte do código publicado
 * no GitHub, já que têm timbre e assinaturas reais.
 */

import {
    abrirBancoAziel,
    CONFIGURACAO_STORAGE_AZIEL
} from "./storage-service.js";


export class ErroModelosDocumentos extends Error {
    constructor(mensagem, codigo = "ERRO_MODELOS_DOCUMENTOS") {
        super(mensagem);
        this.name = "ErroModelosDocumentos";
        this.codigo = codigo;
    }
}


export const NOME_MODELO = Object.freeze({
    PRESTACAO_CONTAS: "prestacao_contas",
    LIBERACAO_RECURSOS: "liberacao_recursos",
    EDITAL_ACRE: "edital_acre"
});

export const ROTULOS_MODELO = Object.freeze({
    [NOME_MODELO.PRESTACAO_CONTAS]: "Ofício de Prestação de Contas",
    [NOME_MODELO.LIBERACAO_RECURSOS]: "Ofício de Liberação de Recursos",
    [NOME_MODELO.EDITAL_ACRE]: "Edital de Chamamento (Acre)"
});


/* =========================================================
   1. SALVAR (SUBSTITUI O MODELO ANTERIOR)
   ========================================================= */

export async function salvarModelo(nome, arquivoOuBlob) {
    if (!Object.values(NOME_MODELO).includes(nome)) {
        throw new ErroModelosDocumentos(
            `Nome de modelo inválido: "${nome}".`,
            "NOME_INVALIDO"
        );
    }

    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.modelosDocumentos,
        "readwrite"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.modelosDocumentos
    );

    const registro = {
        nome,
        arquivo: arquivoOuBlob,
        nomeArquivoOriginal: arquivoOuBlob.name || null,
        tamanho: arquivoOuBlob.size,
        atualizadoEm: new Date().toISOString()
    };

    await converterRequisicaoEmPromessa(
        store.put(registro)
    );

    await aguardarConclusaoTransacao(transacao);

    return {
        nome,
        tamanho: registro.tamanho,
        atualizadoEm: registro.atualizadoEm
    };
}


/* =========================================================
   2. CONSULTA
   ========================================================= */

export async function obterModelo(nome) {
    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.modelosDocumentos,
        "readonly"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.modelosDocumentos
    );

    const resultado = await converterRequisicaoEmPromessa(
        store.get(nome)
    );

    await aguardarConclusaoTransacao(transacao);

    return resultado || null;
}


/*
 * Busca o modelo e devolve o ArrayBuffer pronto — é o formato
 * que o docxtemplater/PizZip espera, mesmo formato que antes
 * vinha do fetch() de um arquivo público.
 */
export async function obterModeloComoArrayBuffer(nome) {
    const registro = await obterModelo(nome);

    if (!registro) {
        return null;
    }

    return registro.arquivo.arrayBuffer();
}


export async function listarStatusDeTodosOsModelos() {
    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.modelosDocumentos,
        "readonly"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.modelosDocumentos
    );

    const todos = await converterRequisicaoEmPromessa(
        store.getAll()
    );

    await aguardarConclusaoTransacao(transacao);

    const porNome = {};

    todos.forEach((registro) => {
        porNome[registro.nome] = {
            tamanho: registro.tamanho,
            atualizadoEm: registro.atualizadoEm
        };
    });

    return porNome;
}


/* =========================================================
   3. AUXILIARES DE TRANSAÇÃO INDEXEDDB
   ========================================================= */

function converterRequisicaoEmPromessa(requisicao) {
    return new Promise((resolve, reject) => {
        requisicao.onsuccess = () => resolve(requisicao.result);

        requisicao.onerror = () => reject(
            new ErroModelosDocumentos(
                "Falha ao acessar os modelos de documentos.",
                "FALHA_INDEXEDDB"
            )
        );
    });
}


function aguardarConclusaoTransacao(transacao) {
    return new Promise((resolve, reject) => {
        transacao.oncomplete = () => resolve();

        transacao.onerror = () => reject(
            new ErroModelosDocumentos(
                "A transação com os modelos falhou.",
                "TRANSACAO_FALHOU"
            )
        );

        transacao.onabort = () => reject(
            new ErroModelosDocumentos(
                "A transação com os modelos foi cancelada.",
                "TRANSACAO_CANCELADA"
            )
        );
    });
}
