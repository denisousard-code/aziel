"use strict";

/*
 * =========================================================
 * AZIEL — EDITAIS DE CHAMAMENTO (ACRE)
 * =========================================================
 *
 * Gera o edital de chamamento a partir da lista de FEAPAES/APAES
 * participantes (que vem manualmente, passada pelo chefe) e do
 * valor por projeto — usando o modelo oficial como template,
 * preservando texto e formatação.
 *
 * O número do edital é uma numeração sequencial que o próprio
 * usuário controla (diferente do Ofício FNA, que depende do
 * Fluig) — por isso o Aziel pode sugerir o próximo número
 * sozinho, guardando o último usado localmente.
 */

import {
    salvarConfiguracao,
    obterConfiguracao
} from "./storage-service.js";

const CAMINHO_TEMPLATE = "../assets/templates/modelo-edital-acre.docx";

const CHAVE_ULTIMO_NUMERO_EDITAL = "ultimoNumeroEditalAcre";

let contadorParticipantes = 0;


document.addEventListener("DOMContentLoaded", iniciarSecaoEditais);


async function iniciarSecaoEditais() {
    const campoNumero = document.getElementById("campoNumeroEdital");

    if (!campoNumero) {
        return;
    }

    await preencherProximoNumeroSugerido();

    document.getElementById("campoAnoEdital").value = (
        String(new Date().getFullYear())
    );

    document.getElementById("botaoAdicionarParticipante")
        .addEventListener("click", () => adicionarLinhaParticipante());

    document.getElementById("campoValorPorProjetoEdital")
        .addEventListener("input", tratarDigitacaoValor);

    document.getElementById("campoValorPorProjetoEdital")
        .addEventListener("blur", atualizarResumoEdital);

    document.getElementById("botaoGerarEdital")
        .addEventListener("click", gerarEBaixarEdital);

    // Começa com 3 linhas em branco, prontas pra preencher —
    // ele pode adicionar ou remover conforme a lista que recebe.
    adicionarLinhaParticipante();
    adicionarLinhaParticipante();
    adicionarLinhaParticipante();
}


/* =========================================================
   1. NUMERAÇÃO SEQUENCIAL (CONTROLADA LOCALMENTE)
   ========================================================= */

async function preencherProximoNumeroSugerido() {
    const ultimoUsado = await obterConfiguracao(
        CHAVE_ULTIMO_NUMERO_EDITAL,
        null
    );

    const campoNumero = document.getElementById("campoNumeroEdital");

    if (ultimoUsado) {
        campoNumero.value = String(Number(ultimoUsado) + 1);
        campoNumero.placeholder = "";
    }
}


/* =========================================================
   2. PARTICIPANTES (LINHAS DINÂMICAS)
   ========================================================= */

function adicionarLinhaParticipante() {
    contadorParticipantes += 1;

    const tabela = document.getElementById("tabelaParticipantesEdital");

    const tr = document.createElement("tr");

    tr.dataset.linhaId = String(contadorParticipantes);

    const tdNumero = document.createElement("td");

    tdNumero.textContent = String(
        tabela.children.length + 1
    );

    const tdNome = document.createElement("td");

    const campoNome = document.createElement("input");

    campoNome.type = "text";
    campoNome.placeholder = "Ex: Apae de Rio Branco";
    campoNome.className = "table-input";
    campoNome.style.width = "100%";

    tdNome.appendChild(campoNome);

    const tdPresidente = document.createElement("td");

    const campoPresidente = document.createElement("input");

    campoPresidente.type = "text";
    campoPresidente.placeholder = "Nome do presidente";
    campoPresidente.className = "table-input";
    campoPresidente.style.width = "100%";

    tdPresidente.appendChild(campoPresidente);

    const tdRemover = document.createElement("td");

    const botaoRemover = document.createElement("button");

    botaoRemover.type = "button";
    botaoRemover.className = "button button--text";
    botaoRemover.textContent = "Remover";

    botaoRemover.addEventListener("click", () => {
        tr.remove();
        renumerarLinhasParticipantes();
        atualizarResumoEdital();
    });

    tdRemover.appendChild(botaoRemover);

    tr.append(tdNumero, tdNome, tdPresidente, tdRemover);

    tabela.appendChild(tr);

    atualizarResumoEdital();
}


function renumerarLinhasParticipantes() {
    const linhas = document.querySelectorAll(
        "#tabelaParticipantesEdital tr"
    );

    linhas.forEach((linha, indice) => {
        linha.children[0].textContent = String(indice + 1);
    });
}


function obterParticipantesPreenchidos() {
    const linhas = document.querySelectorAll(
        "#tabelaParticipantesEdital tr"
    );

    const participantes = [];

    linhas.forEach((linha) => {
        const nome = linha.children[1].querySelector("input").value.trim();
        const presidente = linha.children[2].querySelector("input").value.trim();

        if (nome) {
            participantes.push({
                numero: participantes.length + 1,
                nome,
                presidente: presidente || "Não informado"
            });
        }
    });

    return participantes;
}


/* =========================================================
   3. VALOR E RESUMO
   ========================================================= */

function tratarDigitacaoValor(evento) {
    evento.target.value = aplicarMascaraMoedaSimples(
        evento.target.value
    );

    atualizarResumoEdital();
}


function aplicarMascaraMoedaSimples(valor) {
    const numeros = valor.replace(/\D/g, "");

    if (!numeros) {
        return "";
    }

    const numero = Number(numeros) / 100;

    return numero.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}


function converterMascaraParaNumero(valorMascarado) {
    const normalizado = valorMascarado
        .replace(/\./g, "")
        .replace(",", ".");

    const numero = Number(normalizado);

    return Number.isFinite(numero) ? numero : 0;
}


function atualizarResumoEdital() {
    const quantidade = obterParticipantesPreenchidos().length;

    const valorPorProjeto = converterMascaraParaNumero(
        document.getElementById("campoValorPorProjetoEdital").value
    );

    const valorTotal = quantidade * valorPorProjeto;

    const resumo = document.getElementById("resumoEdital");

    if (quantidade === 0 || valorPorProjeto === 0) {
        resumo.textContent = "";
        return;
    }

    resumo.textContent = (
        `${quantidade} participante(s) × ${formatarMoeda(valorPorProjeto)} `
        + `= ${formatarMoeda(valorTotal)} no total do edital.`
    );
}


function formatarMoeda(valor) {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL"
    }).format(valor || 0);
}


/* =========================================================
   4. VALOR POR EXTENSO
   ========================================================= */

const UNIDADES = [
    "", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
    "dez", "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete",
    "dezoito", "dezenove"
];

const DEZENAS = [
    "", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta",
    "oitenta", "noventa"
];

const CENTENAS = [
    "", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos",
    "seiscentos", "setecentos", "oitocentos", "novecentos"
];


function grupoPorExtenso(numero) {
    if (numero === 0) {
        return "";
    }

    if (numero === 100) {
        return "cem";
    }

    const partes = [];

    const centena = Math.floor(numero / 100);
    const resto = numero % 100;

    if (centena > 0) {
        partes.push(CENTENAS[centena]);
    }

    if (resto > 0) {
        if (resto < 20) {
            partes.push(UNIDADES[resto]);
        } else {
            const dezena = Math.floor(resto / 10);
            const unidade = resto % 10;

            partes.push(
                DEZENAS[dezena] + (unidade > 0 ? ` e ${UNIDADES[unidade]}` : "")
            );
        }
    }

    return partes.join(" e ");
}


function numeroPorExtenso(numero) {
    if (numero === 0) {
        return "zero";
    }

    const milhoes = Math.floor(numero / 1000000);
    const milhares = Math.floor((numero % 1000000) / 1000);
    const unidadesGrupo = numero % 1000;

    const partes = [];

    if (milhoes > 0) {
        partes.push(
            milhoes === 1
                ? "um milhão"
                : `${grupoPorExtenso(milhoes)} milhões`
        );
    }

    if (milhares > 0) {
        partes.push(
            milhares === 1
                ? "mil"
                : `${grupoPorExtenso(milhares)} mil`
        );
    }

    if (unidadesGrupo > 0) {
        partes.push(grupoPorExtenso(unidadesGrupo));
    }

    if (partes.length === 1) {
        return partes[0];
    }

    const usaEnoUltimo = (
        unidadesGrupo > 0
        && (unidadesGrupo < 100 || unidadesGrupo % 100 === 0)
    );

    if (usaEnoUltimo) {
        return (
            partes.slice(0, -1).join(", ")
            + " e "
            + partes[partes.length - 1]
        );
    }

    return partes.join(", ");
}


function valorPorExtenso(valor) {
    const valorArredondado = Math.round(valor * 100) / 100;

    const parteReais = Math.floor(valorArredondado);
    const parteCentavos = Math.round(
        (valorArredondado - parteReais) * 100
    );

    const terminaEmMilhao = (
        parteReais >= 1000000
        && parteReais % 1000000 === 0
    );

    const textoReais = (
        `${capitalizar(numeroPorExtenso(parteReais))} `
        + (terminaEmMilhao ? "de " : "")
        + (parteReais === 1 ? "real" : "reais")
    );

    if (parteCentavos === 0) {
        return textoReais;
    }

    const textoCentavos = (
        `${numeroPorExtenso(parteCentavos)} `
        + (parteCentavos === 1 ? "centavo" : "centavos")
    );

    return `${textoReais} e ${textoCentavos}`;
}


function capitalizar(texto) {
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}


/* =========================================================
   5. GERAÇÃO DO DOCUMENTO
   ========================================================= */

async function gerarEBaixarEdital() {
    const botao = document.getElementById("botaoGerarEdital");

    const numeroEdital = document.getElementById(
        "campoNumeroEdital"
    ).value.trim();

    const ano = document.getElementById("campoAnoEdital").value.trim();

    const valorPorProjeto = converterMascaraParaNumero(
        document.getElementById("campoValorPorProjetoEdital").value
    );

    const participantes = obterParticipantesPreenchidos();

    if (!numeroEdital || !ano) {
        alert("Informe o número do edital e o ano.");
        return;
    }

    if (valorPorProjeto <= 0) {
        alert("Informe o valor por projeto.");
        return;
    }

    if (participantes.length === 0) {
        alert("Adicione ao menos um participante.");
        return;
    }

    try {
        botao.disabled = true;
        botao.textContent = "Gerando...";

        const respostaTemplate = await fetch(CAMINHO_TEMPLATE);

        if (!respostaTemplate.ok) {
            throw new Error(
                "Não encontrei o modelo do edital em " + CAMINHO_TEMPLATE
            );
        }

        const bufferTemplate = await respostaTemplate.arrayBuffer();

        const zip = new PizZip(bufferTemplate);

        const doc = new window.docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            delimiters: { start: "{{", end: "}}" }
        });

        doc.render({
            NUMERO_EDITAL: numeroEdital,
            ANO: ano,
            QUANTIDADE_PARTICIPANTES: String(participantes.length),
            VALOR_POR_PROJETO: valorPorProjeto.toLocaleString("pt-BR", {
                minimumFractionDigits: 2
            }),
            VALOR_POR_PROJETO_EXTENSO: valorPorExtenso(valorPorProjeto),
            participantes
        });

        const blob = doc.getZip().generate({
            type: "blob",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        });

        const nomeArquivo = `Edital ${numeroEdital}-${ano}.docx`;

        baixarBlob(blob, nomeArquivo);

        await salvarConfiguracao(
            CHAVE_ULTIMO_NUMERO_EDITAL,
            numeroEdital
        );
    } catch (erro) {
        alert(
            "Não foi possível gerar o edital: "
            + (erro?.message || "erro desconhecido")
        );
    } finally {
        botao.disabled = false;
        botao.textContent = "Gerar e baixar .docx";
    }
}


function baixarBlob(blob, nomeArquivo) {
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = nomeArquivo;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
}
