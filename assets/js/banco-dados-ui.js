"use strict";

/*
 * =========================================================
 * AZIEL — BANCO DE DADOS
 * =========================================================
 *
 * Importa os relatórios "mestre" uma vez e salva no
 * banco-dados-service, pra que as outras ferramentas do Aziel
 * não precisem pedir upload de novo a cada uso.
 */

import {
    salvarBaseDados,
    obterBaseDados,
    TIPO_BASE_DADOS
} from "./banco-dados-service.js";

import {
    cadastrarPresidente,
    cadastrarPresidentesPadraoSeNecessario,
    listarPresidentes,
    exportarPresidentesComoXlsx
} from "./presidentes-service.js";

import {
    listarEntidades
} from "./entity-service.js";

import {
    salvarModelo,
    listarStatusDeTodosOsModelos,
    NOME_MODELO
} from "./modelos-documentos-service.js";

let temporizadorNotificacao = null;


document.addEventListener("DOMContentLoaded", iniciarPagina);


async function iniciarPagina() {
    exibirDataAtual();
    iniciarNotificacao();

    document.getElementById("campoArquivoPagamentos")
        .addEventListener("change", () => tratarSelecaoArquivo(
            "campoArquivoPagamentos",
            "statusPagamentos",
            TIPO_BASE_DADOS.PAGAMENTOS_PROJETOS,
            lerPagamentosDeProjetos
        ));

    document.getElementById("campoArquivoMdm8")
        .addEventListener("change", () => tratarSelecaoArquivo(
            "campoArquivoMdm8",
            "statusMdm8",
            TIPO_BASE_DADOS.RELATORIO_MDM8,
            lerRelatorioMdm8
        ));

    document.getElementById("campoArquivoRelatorioProjetos")
        .addEventListener("change", () => tratarSelecaoArquivo(
            "campoArquivoRelatorioProjetos",
            "statusRelatorioProjetos",
            TIPO_BASE_DADOS.RELATORIO_PROJETOS,
            lerRelatorioProjetos
        ));

    document.getElementById("campoArquivoControleProjetos")
        .addEventListener("change", () => tratarSelecaoArquivo(
            "campoArquivoControleProjetos",
            "statusControleProjetos",
            TIPO_BASE_DADOS.CONTROLE_PROJETOS,
            lerControleDeProjetos
        ));

    document.getElementById("campoArquivoPresidentes")
        .addEventListener("change", tratarSelecaoArquivoPresidentes);

    iniciarUploadModelosDocumentos();

    const botaoExportarPresidentes = document.getElementById(
        "botaoExportarPresidentesAtuais"
    );

    if (botaoExportarPresidentes) {
        botaoExportarPresidentes.addEventListener(
            "click",
            async () => {
                try {
                    await exportarPresidentesComoXlsx();

                    exibirNotificacao(
                        "success",
                        "Lista exportada",
                        "Guarde esse arquivo em algum lugar seguro pra "
                        + "poder reimportar em outro computador."
                    );
                } catch (erro) {
                    exibirNotificacao(
                        "error",
                        "Não foi possível exportar",
                        erro?.message || "Tente novamente."
                    );
                }
            }
        );
    }

    try {
        await cadastrarPresidentesPadraoSeNecessario();
    } catch (erro) {
        console.error(
            "Não foi possível pré-cadastrar os presidentes padrão:",
            erro
        );
    }

    try {
        await exibirStatusAtualDeTodasAsBases();
    } catch (erro) {
        console.error(
            "Não foi possível exibir o status das bases salvas:",
            erro
        );

        exibirNotificacao(
            "error",
            "Não foi possível carregar o status salvo",
            "Recarregue a página (Ctrl+Shift+R). Se persistir, "
            + "avise o suporte."
        );
    }
}


function exibirDataAtual() {
    const elemento = document.getElementById("dataAtual");

    if (!elemento) {
        return;
    }

    const formatador = new Intl.DateTimeFormat("pt-BR", {
        weekday: "long", day: "2-digit", month: "long", year: "numeric"
    });

    const texto = formatador.format(new Date());

    elemento.textContent = texto.charAt(0).toUpperCase() + texto.slice(1);
}


/* =========================================================
   1. STATUS ATUAL (AO CARREGAR A PÁGINA)
   ========================================================= */

async function exibirStatusAtualDeTodasAsBases() {
    const mapaStatus = [
        ["statusPagamentos", TIPO_BASE_DADOS.PAGAMENTOS_PROJETOS],
        ["statusMdm8", TIPO_BASE_DADOS.RELATORIO_MDM8],
        ["statusRelatorioProjetos", TIPO_BASE_DADOS.RELATORIO_PROJETOS],
        ["statusControleProjetos", TIPO_BASE_DADOS.CONTROLE_PROJETOS]
    ];

    for (const [idStatus, tipo] of mapaStatus) {
        const base = await obterBaseDados(tipo);

        atualizarTextoDeStatus(idStatus, base);
    }

    const presidentes = await listarPresidentes();

    document.getElementById("statusPresidentes").textContent = (
        presidentes.length > 0
            ? `${presidentes.length} presidente(s) cadastrado(s).`
            : "Nenhum presidente cadastrado ainda."
    );

    const entidades = await listarEntidades();

    document.getElementById("statusEntidades").textContent = (
        entidades.length > 0
            ? `${entidades.length} entidade(s) cadastrada(s).`
            : "Nenhuma entidade cadastrada ainda."
    );

    await exibirStatusDosModelos();
}


/* =========================================================
   1-B. MODELOS DE DOCUMENTOS
   ========================================================= */

const CAMPOS_MODELOS = [
    ["campoModeloPrestacaoContas", NOME_MODELO.PRESTACAO_CONTAS],
    ["campoModeloLiberacaoRecursos", NOME_MODELO.LIBERACAO_RECURSOS],
    ["campoModeloEditalAcre", NOME_MODELO.EDITAL_ACRE]
];


function iniciarUploadModelosDocumentos() {
    CAMPOS_MODELOS.forEach(([idCampo, nomeModelo]) => {
        const campo = document.getElementById(idCampo);

        if (!campo) {
            return;
        }

        campo.addEventListener("change", async () => {
            const arquivo = campo.files[0];

            const status = document.getElementById(
                "statusModelosDocumentos"
            );

            if (!arquivo) {
                return;
            }

            try {
                await salvarModelo(nomeModelo, arquivo);

                status.classList.remove(
                    "form-field__message--danger"
                );

                status.textContent = (
                    `"${ROTULOS_MODELO_LOCAL[nomeModelo]}" salvo `
                    + "com sucesso, só neste navegador."
                );

                exibirNotificacao(
                    "success",
                    "Modelo salvo",
                    `${ROTULOS_MODELO_LOCAL[nomeModelo]} está pronto pra uso.`
                );

                await exibirStatusDosModelos();
            } catch (erro) {
                status.textContent = obterMensagemDeErro(erro);
                status.classList.add(
                    "form-field__message--danger"
                );
            }
        });
    });
}


const ROTULOS_MODELO_LOCAL = {
    [NOME_MODELO.PRESTACAO_CONTAS]: "Ofício de Prestação de Contas",
    [NOME_MODELO.LIBERACAO_RECURSOS]: "Ofício de Liberação de Recursos",
    [NOME_MODELO.EDITAL_ACRE]: "Edital de Chamamento (Acre)"
};


async function exibirStatusDosModelos() {
    const status = document.getElementById("statusModelosDocumentos");

    if (!status) {
        return;
    }

    const salvos = await listarStatusDeTodosOsModelos();

    const partes = CAMPOS_MODELOS.map(([, nomeModelo]) => {
        const info = salvos[nomeModelo];

        return (
            `${ROTULOS_MODELO_LOCAL[nomeModelo]}: `
            + (info ? "✓ salvo" : "não importado")
        );
    });

    status.textContent = partes.join(" · ");
}


function atualizarTextoDeStatus(idElemento, base) {
    const elemento = document.getElementById(idElemento);

    if (!base) {
        elemento.textContent = "Ainda não importado.";
        elemento.classList.remove("form-field__message--danger");

        return;
    }

    const data = new Date(base.atualizadoEm);

    const dataFormatada = new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit"
    }).format(data);

    elemento.textContent = (
        `${base.totalRegistros} registro(s) — atualizado em ${dataFormatada}.`
    );

    elemento.classList.remove("form-field__message--danger");
}


/* =========================================================
   2. IMPORTAÇÃO GENÉRICA (UM PADRÃO PRA CADA RELATÓRIO)
   ========================================================= */

async function tratarSelecaoArquivo(idCampo, idStatus, tipo, funcaoLeitura) {
    const arquivo = document.getElementById(idCampo).files[0];

    const status = document.getElementById(idStatus);

    if (!arquivo) {
        return;
    }

    status.textContent = "Lendo o arquivo...";
    status.classList.remove("form-field__message--danger");

    try {
        const registros = await funcaoLeitura(arquivo);

        if (registros.length === 0) {
            throw new Error(
                "Não encontrei nenhum registro nesse arquivo. Confira "
                + "se é o relatório certo."
            );
        }

        const resultado = await salvarBaseDados(tipo, registros);

        atualizarTextoDeStatus(idStatus, resultado);

        exibirNotificacao(
            "success",
            "Importado com sucesso",
            `${resultado.totalRegistros} registro(s) salvos.`
        );
    } catch (erro) {
        status.textContent = obterMensagemDeErro(erro);
        status.classList.add("form-field__message--danger");

        exibirNotificacao(
            "error",
            "Não foi possível importar",
            obterMensagemDeErro(erro)
        );
    }
}


/* =========================================================
   3. LEITURA DE CADA FORMATO
   ========================================================= */

/*
 * O "Relatório de Pagamentos de Projetos" vem como HTML
 * disfarçado de .xls (mesmo formato de outros relatórios do
 * Fluig já lidos no Aziel) — sem <tr> real entre as linhas.
 */
async function lerPagamentosDeProjetos(arquivo) {
    const buffer = await arquivo.arrayBuffer();

    const texto = new TextDecoder("iso-8859-1").decode(buffer);

    const pedacos = texto.split("</tr>");
    const registros = [];

    for (let i = 1; i < pedacos.length; i++) {
        const celulas = [...pedacos[i].matchAll(
            /<td[^>]*>([\s\S]*?)<\/td>/g
        )].map((m) => removerTagsHtml(descodificarEntidadesHtml(m[1])));

        if (celulas.length < 12) {
            continue;
        }

        const [
            paa, dataTexto, nomeEntidade, uf, cnpj, banco,
            agencia, digitoAgencia, conta, digitoConta, parcela, valorTexto
        ] = celulas;

        const valor = converterValor(valorTexto);

        if (valor === null) {
            continue;
        }

        registros.push({
            paa: String(paa).trim(),
            data: converterDataBr(dataTexto),
            nomeEntidade,
            uf,
            cnpj: cnpj.replace(/\D/g, ""),
            banco,
            agencia,
            digitoAgencia,
            conta,
            digitoConta,
            parcela,
            valor
        });
    }

    return registros;
}


async function lerRelatorioMdm8(arquivo) {
    const linhas = await lerPlanilhaComoLinhas(arquivo);

    const indices = localizarIndicesColunas(linhas[1] || linhas[0]);

    const registros = [];

    for (let i = 2; i < linhas.length; i++) {
        const linha = linhas[i];

        if (!linha || !linha[indices.PAA]) {
            continue;
        }

        registros.push({
            paa: String(linha[indices.PAA]).trim(),
            instituicao: linha[indices["Instituição"]] || null,
            projeto: linha[indices.Projeto] || null,
            produto: linha[indices.Produto] || null,
            descricao: linha[indices["Descrição"]] || null,
            objetivo: linha[indices.Objetivo] || null,
            dataAprovacao: converterDataBr(linha[indices["Data Aprovação"]]),
            valor: converterValor(linha[indices.Valor]),
            status: linha[indices.Status] || null
        });
    }

    return registros;
}


async function lerRelatorioProjetos(arquivo) {
    const linhas = await lerPlanilhaComoLinhas(arquivo);

    const indices = localizarIndicesColunas(linhas[1] || linhas[0]);

    const registros = [];

    for (let i = 2; i < linhas.length; i++) {
        const linha = linhas[i];

        if (!linha || !linha[indices.PAA]) {
            continue;
        }

        registros.push({
            paa: String(linha[indices.PAA]).trim(),
            instituicao: linha[indices["Instituição"]] || null,
            projeto: linha[indices.Projeto] || null,
            valorProjeto: converterValor(
                linha[indices["Valor do Projeto"]] ?? linha[indices.Valor]
            ),
            status: linha[indices.Status] || null
        });
    }

    return registros;
}


async function lerControleDeProjetos(arquivo) {
    const buffer = await arquivo.arrayBuffer();

    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

    const linhas = XLSX.utils.sheet_to_json(
        workbook.Sheets[workbook.SheetNames[0]],
        { header: 1, raw: true }
    );

    const indices = localizarIndicesColunas(linhas[1] || linhas[0]);

    const registros = [];

    for (let i = 2; i < linhas.length; i++) {
        const linha = linhas[i];

        if (!linha || !linha[indices.PAA]) {
            continue;
        }

        const dataPagamentoBruta = linha[indices["Data Pagamento"]];

        registros.push({
            paa: String(linha[indices.PAA]).trim(),
            nomeProjeto: linha[indices["Nome do Projeto"]] || null,
            instituicao: linha[indices["Instituição"]] || null,
            uf: linha[indices.UF] || null,
            categoria: linha[indices.Categoria] || null,
            subcategoria: linha[indices.Subcategoria] || null,
            descricaoDespesas: linha[
                indices["Descrição de Despesas"]
            ] || null,
            beneficiarios: linha[
                indices["Quantidade de beneficiários"]
            ] || 0,
            valor: converterValor(linha[indices.Valor]),
            status: linha[indices.Status] || null,
            situacaoFinanceira: linha[
                indices["Situação Financeira"]
            ] || null,
            dataPagamento: (
                dataPagamentoBruta instanceof Date
                    ? dataPagamentoBruta.toISOString()
                    : converterDataBr(dataPagamentoBruta)
            )
        });
    }

    return registros;
}


async function lerPlanilhaComoLinhas(arquivo) {
    const buffer = await arquivo.arrayBuffer();

    const workbook = XLSX.read(buffer, { type: "array" });

    return XLSX.utils.sheet_to_json(
        workbook.Sheets[workbook.SheetNames[0]],
        { header: 1, raw: true }
    );
}


/*
 * Mantém sempre a PRIMEIRA ocorrência de cada nome de coluna —
 * o cabeçalho do Fluig às vezes repete "Projeto" (a segunda é só
 * o botão "Abrir Projeto").
 */
function localizarIndicesColunas(linhaCabecalho) {
    const indices = {};

    (linhaCabecalho || []).forEach((valor, indice) => {
        const nome = String(valor ?? "").trim();

        if (nome && !(nome in indices)) {
            indices[nome] = indice;
        }
    });

    return indices;
}


/* =========================================================
   4. PRESIDENTES (formato diferente, já tinha lógica própria)
   ========================================================= */

async function tratarSelecaoArquivoPresidentes(evento) {
    const arquivo = evento.target.files[0];

    const status = document.getElementById("statusPresidentes");

    if (!arquivo) {
        return;
    }

    status.textContent = "Lendo o arquivo...";
    status.classList.remove("form-field__message--danger");

    try {
        const buffer = await arquivo.arrayBuffer();

        const workbook = XLSX.read(buffer, { type: "array" });

        const linhas = XLSX.utils.sheet_to_json(
            workbook.Sheets[workbook.SheetNames[0]],
            { header: 1, raw: true }
        );

        const presidentes = extrairPresidentesConselho(linhas);

        if (presidentes.length === 0) {
            throw new Error(
                "Não encontrei a seção \"CONSELHO DE ADMINISTRAÇAO\" "
                + "nesse arquivo."
            );
        }

        for (const presidente of presidentes) {
            await cadastrarPresidente(presidente);
        }

        status.textContent = (
            `${presidentes.length} presidente(s) importado(s)/atualizado(s).`
        );

        exibirNotificacao(
            "success",
            "Lista de presidentes atualizada",
            `${presidentes.length} estados atualizados.`
        );
    } catch (erro) {
        status.textContent = obterMensagemDeErro(erro);
        status.classList.add("form-field__message--danger");
    }
}


function extrairPresidentesConselho(linhas) {
    const UF_REGEX = /^[A-Z]{2}$/;

    let dentroDaSecao = false;
    const registros = [];

    for (const linha of linhas) {
        const primeiraColuna = String(linha[0] ?? "").trim();
        const segundaColuna = String(linha[1] ?? "").trim();

        if (
            segundaColuna.toUpperCase().replace(/[ÇC]/g, "C")
            === "CONSELHO DE ADMINISTRACAO"
        ) {
            dentroDaSecao = true;
            continue;
        }

        if (!dentroDaSecao) {
            continue;
        }

        if (segundaColuna && !UF_REGEX.test(primeiraColuna)) {
            if (segundaColuna.toUpperCase() !== "NOME") {
                break;
            }

            continue;
        }

        if (!UF_REGEX.test(primeiraColuna)) {
            continue;
        }

        registros.push({
            uf: primeiraColuna,
            nome: segundaColuna,
            observacao: String(linha[2] ?? "").trim()
        });
    }

    return registros;
}


/* =========================================================
   5. AUXILIARES
   ========================================================= */

function descodificarEntidadesHtml(texto) {
    return texto
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ");
}


function removerTagsHtml(texto) {
    return texto.replace(/<[^>]*>/g, "").trim();
}


function converterValor(valor) {
    if (valor === null || valor === undefined) {
        return null;
    }

    if (typeof valor === "number") {
        return valor;
    }

    const texto = String(valor).replace(/R\$/g, "").trim();

    if (!texto || texto.toLowerCase() === "null") {
        return null;
    }

    const normalizado = texto.replace(/\./g, "").replace(",", ".");
    const numero = Number(normalizado);

    return Number.isFinite(numero) ? numero : null;
}


function converterDataBr(valor) {
    if (!valor) {
        return null;
    }

    if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
        return valor.toISOString();
    }

    const texto = String(valor).trim();

    const correspondencia = texto.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);

    if (!correspondencia) {
        return null;
    }

    const [, dia, mes, anoTexto] = correspondencia;

    const ano = anoTexto.length === 2
        ? 2000 + Number(anoTexto)
        : Number(anoTexto);

    const data = new Date(ano, Number(mes) - 1, Number(dia));

    return Number.isNaN(data.getTime()) ? null : data.toISOString();
}


function obterMensagemDeErro(erro) {
    if (erro && typeof erro.message === "string") {
        return erro.message;
    }

    return "Não foi possível concluir a operação. Tente novamente.";
}


function iniciarNotificacao() {
    const botaoFechar = document.getElementById("botaoFecharNotificacao");

    if (botaoFechar) {
        botaoFechar.addEventListener("click", fecharNotificacao);
    }
}


function exibirNotificacao(tipo, titulo, texto) {
    const notificacao = document.getElementById("notificacaoAziel");

    if (!notificacao) {
        console.log(titulo, texto);
        return;
    }

    const icone = document.getElementById("iconeNotificacaoAziel");
    const tituloElemento = document.getElementById("tituloNotificacaoAziel");
    const textoElemento = document.getElementById("textoNotificacaoAziel");

    notificacao.classList.remove(
        "app-notification--success",
        "app-notification--error",
        "app-notification--warning"
    );

    const configuracoes = {
        success: { classe: "app-notification--success", icone: "✓" },
        error: { classe: "app-notification--error", icone: "!" },
        warning: { classe: "app-notification--warning", icone: "!" }
    };

    const configuracao = configuracoes[tipo] || configuracoes.success;

    notificacao.classList.add(configuracao.classe);

    icone.textContent = configuracao.icone;
    tituloElemento.textContent = titulo;
    textoElemento.textContent = texto;

    notificacao.hidden = false;

    window.clearTimeout(temporizadorNotificacao);

    temporizadorNotificacao = window.setTimeout(fecharNotificacao, 5000);
}


function fecharNotificacao() {
    const notificacao = document.getElementById("notificacaoAziel");

    if (!notificacao) {
        return;
    }

    notificacao.hidden = true;

    window.clearTimeout(temporizadorNotificacao);
}
