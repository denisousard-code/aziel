"use strict";

/*
 * =========================================================
 * AZIEL — SERVIÇO DE PRESIDENTES POR UF
 * =========================================================
 *
 * Guarda o presidente do Conselho de Administração (Federação)
 * de cada estado, usado para sugerir o destinatário nos ofícios
 * de prestação de contas.
 *
 * A lista muda a cada mudança de mandato (normalmente a cada 3
 * anos) — a atualização é sempre por reimportação da planilha
 * "PLANILHA GERAL - DIRETORIA E CONSELHO", igual ao Entidades:
 * como a chave é a UF, reimportar substitui em vez de duplicar.
 */

import {
    abrirBancoAziel,
    CONFIGURACAO_STORAGE_AZIEL
} from "./storage-service.js";


export class ErroServicoPresidentes extends Error {
    constructor(mensagem, codigo = "ERRO_SERVICO_PRESIDENTES") {
        super(mensagem);
        this.name = "ErroServicoPresidentes";
        this.codigo = codigo;
    }
}


export async function cadastrarPresidente({
    uf,
    nome,
    observacao = ""
}) {
    const ufLimpa = String(uf || "").trim().toUpperCase();

    if (!ufLimpa || ufLimpa.length !== 2) {
        throw new ErroServicoPresidentes(
            `UF inválida: "${uf}".`,
            "UF_INVALIDA"
        );
    }

    const nomeLimpo = String(nome || "").trim();

    if (!nomeLimpo) {
        throw new ErroServicoPresidentes(
            "Informe o nome do presidente.",
            "NOME_AUSENTE"
        );
    }

    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.presidentesUf,
        "readwrite"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.presidentesUf
    );

    const registro = {
        uf: ufLimpa,
        nome: nomeLimpo,
        observacao: String(observacao || "").trim() || null,
        atualizadoEm: new Date().toISOString()
    };

    await new Promise((resolve, reject) => {
        const requisicao = store.put(registro);
        requisicao.onsuccess = () => resolve();
        requisicao.onerror = () => reject(requisicao.error);
    });

    await new Promise((resolve, reject) => {
        transacao.oncomplete = () => resolve();
        transacao.onerror = () => reject(transacao.error);
    });

    return registro;
}


/*
 * Lista extraída da "PLANILHA GERAL - DIRETORIA E CONSELHO"
 * (seção Conselho de Administração). Usada só na primeira vez
 * que a base ainda está vazia — depois disso, quem manda são os
 * dados salvos (atualizados por reimportação a cada mandato).
 */
const PRESIDENTES_PADRAO = [
    { uf: "AC", nome: "Cecília Maria Garcia Lima Souza", observacao: "FEAPAES AC" },
    { uf: "AL", nome: "Aílson da Rocha Loureiro", observacao: "FEAPAES AL" },
    { uf: "AM", nome: "Sirange Bezerra Rodrigues", observacao: "FEAPAES AM" },
    { uf: "AP", nome: "Abel da Silva Mendes", observacao: "FEAPAES AP" },
    { uf: "BA", nome: "Moana dos Santos Meira Silva", observacao: "FEAPAES BA" },
    { uf: "CE", nome: "Francisco Leitão Moura", observacao: "FEAPAES CE" },
    { uf: "DF", nome: "Erenice Natália  - Representante", observacao: "FEAPAES DF" },
    { uf: "ES", nome: "Maria das Graças Vimercati", observacao: "FEAPAES ES" },
    { uf: "GO", nome: "Albanir Pereira Santana", observacao: "FEAPAES GO" },
    { uf: "MA", nome: "Nadson Barros Silva", observacao: "FEAPAES MA" },
    { uf: "MT", nome: "Silvia Cristina Nogueira Artal", observacao: "FEAPAES MT" },
    { uf: "MS", nome: "Antonio José dos Santos Neto", observacao: "FEAPAES MS" },
    { uf: "MG", nome: "Gláucia Aparecida Costa Boareto", observacao: "FEAPAES MG" },
    { uf: "PA", nome: "Emanoel O' de Almeida Filho", observacao: "FEAPAES PA" },
    { uf: "PB", nome: "Maria da Conceiçao Costa do Rego", observacao: "FEAPAES PB" },
    { uf: "PE", nome: "Maria das Graças Mendes da Silva", observacao: "FEAPAES PE" },
    { uf: "PI", nome: "Vitória Régia Freitas Rego", observacao: "FEAPAES PI" },
    { uf: "PR", nome: "Alexandre Augusto Botareli Cesar", observacao: "FEAPAES PR" },
    { uf: "RJ", nome: "Luis Valério de Sousa Neto", observacao: "FEAPAES RJ" },
    { uf: "RN", nome: "Izabel Tatiana Batista Benevolo Xavier Ferreira de Melo", observacao: "FEAPAES RN" },
    { uf: "RS", nome: "Marco Antonio Moresco", observacao: "FEAPAES RS" },
    { uf: "RO", nome: "Marizete de Paula Assunção", observacao: "FEAPAES RO" },
    { uf: "RR", nome: "Elson Vieira Menzes", observacao: "Apae Boa Vista" },
    { uf: "SC", nome: "Osmar Minatto", observacao: "FEAPAES SC" },
    { uf: "SP", nome: "Cristiany de Castro", observacao: "FEAPAES SP" },
    { uf: "SE", nome: "Mônica Carmélia Marinho de Souza", observacao: "FEAPAES SE" },
    { uf: "TO", nome: "Marciane Machado Silva", observacao: "FEAPAES TO" }
];


/*
 * Cadastra os presidentes padrão só se a base ainda estiver
 * vazia — evita sobrescrever dados que o usuário já atualizou
 * manualmente (por exemplo, depois de uma mudança de mandato).
 */
export async function cadastrarPresidentesPadraoSeNecessario() {
    const existentes = await listarPresidentes();

    if (existentes.length > 0) {
        return;
    }

    for (const presidente of PRESIDENTES_PADRAO) {
        await cadastrarPresidente(presidente);
    }
}


export async function buscarPresidentePorUf(uf) {
    const ufLimpa = String(uf || "").trim().toUpperCase();

    if (!ufLimpa) {
        return null;
    }

    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.presidentesUf,
        "readonly"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.presidentesUf
    );

    const resultado = await new Promise((resolve, reject) => {
        const requisicao = store.get(ufLimpa);
        requisicao.onsuccess = () => resolve(requisicao.result || null);
        requisicao.onerror = () => reject(requisicao.error);
    });

    await new Promise((resolve, reject) => {
        transacao.oncomplete = () => resolve();
        transacao.onerror = () => reject(transacao.error);
    });

    return resultado;
}


export async function listarPresidentes() {
    const banco = await abrirBancoAziel();

    const transacao = banco.transaction(
        CONFIGURACAO_STORAGE_AZIEL.stores.presidentesUf,
        "readonly"
    );

    const store = transacao.objectStore(
        CONFIGURACAO_STORAGE_AZIEL.stores.presidentesUf
    );

    const resultado = await new Promise((resolve, reject) => {
        const requisicao = store.getAll();
        requisicao.onsuccess = () => resolve(requisicao.result || []);
        requisicao.onerror = () => reject(requisicao.error);
    });

    await new Promise((resolve, reject) => {
        transacao.oncomplete = () => resolve();
        transacao.onerror = () => reject(transacao.error);
    });

    return resultado.sort((a, b) => a.uf.localeCompare(b.uf));
}
