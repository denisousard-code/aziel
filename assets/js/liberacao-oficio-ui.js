"use strict";

/*
 * =========================================================
 * AZIEL — OFÍCIO DE LIBERAÇÃO DE RECURSOS
 * =========================================================
 *
 * Gera o Ofício FNA de liberação de recursos, cobrindo os dois
 * casos reais: liberação simples (um valor só) e liberação com
 * adiantamento (recursos complementares, descontados depois de
 * um próximo repasse).
 *
 * Assim como no Ofício de Prestação de Contas, o número do
 * ofício vem do Fluig (protocolo oficial) — o usuário digita
 * manualmente.
 */

import {
    listarPresidentes,
    cadastrarPresidentesPadraoSeNecessario
} from "./presidentes-service.js";

import {
    obterModeloComoArrayBuffer,
    NOME_MODELO
} from "./modelos-documentos-service.js";

const NOMES_ESTADOS = {
    AC: "do Acre", AL: "de Alagoas", AP: "do Amapá", AM: "do Amazonas",
    BA: "da Bahia", CE: "do Ceará", DF: "do Distrito Federal",
    ES: "do Espírito Santo", GO: "de Goiás", MA: "do Maranhão",
    MT: "do Mato Grosso", MS: "do Mato Grosso do Sul",
    MG: "de Minas Gerais", PA: "do Pará", PB: "da Paraíba",
    PR: "do Paraná", PE: "de Pernambuco", PI: "do Piauí",
    RJ: "do Rio de Janeiro", RN: "do Rio Grande do Norte",
    RS: "do Rio Grande do Sul", RO: "de Rondônia",
    RR: "de Roraima", SC: "de Santa Catarina", SP: "de São Paulo",
    SE: "de Sergipe", TO: "do Tocantins"
};

let presidentesCarregados = [];
let temporizadorNotificacao = null;


document.addEventListener("DOMContentLoaded", iniciarPagina);


async function iniciarPagina() {
    exibirDataAtual();
    iniciarNotificacao();

    await cadastrarPresidentesPadraoSeNecessario();

    await preencherSeletorDeUf();

    document.getElementById("campoUf")
        .addEventListener("change", tratarSelecaoUf);

    document.getElementById("campoTemAdiantamento")
        .addEventListener("change", alternarAreaAdiantamento);

    document.getElementById("campoValorPrincipal")
        .addEventListener("input", (e) => {
            e.target.value = aplicarMascaraMoedaSimples(e.target.value);
            atualizarValorTotal();
        });

    document.getElementById("campoValorAdiantamento")
        .addEventListener("input", (e) => {
            e.target.value = aplicarMascaraMoedaSimples(e.target.value);
            atualizarValorTotal();
        });

    document.getElementById("formLiberacao")
        .addEventListener("submit", async (evento) => {
            evento.preventDefault();
            await gerarEBaixarOficio();
        });
}


function exibirDataAtual() {
    const elemento = document.getElementById("dataAtual");

    if (!elemento) {
        return;
    }

    const formatador = new Intl.DateTimeFormat("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric"
    });

    const texto = formatador.format(new Date());

    elemento.textContent = (
        texto.charAt(0).toUpperCase() + texto.slice(1)
    );
}


/* =========================================================
   1. SELEÇÃO DE UF E SUGESTÃO DE PRESIDENTE
   ========================================================= */

async function preencherSeletorDeUf() {
    presidentesCarregados = await listarPresidentes();

    const seletor = document.getElementById("campoUf");

    Object.keys(NOMES_ESTADOS).sort().forEach((uf) => {
        const opcao = document.createElement("option");

        opcao.value = uf;
        opcao.textContent = `${uf} — ${capitalizar(NOMES_ESTADOS[uf].replace(/^(do|da|de) /, ""))}`;

        seletor.appendChild(opcao);
    });
}


function capitalizar(texto) {
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}


function tratarSelecaoUf() {
    const uf = document.getElementById("campoUf").value;

    const area = document.getElementById("areaSugestaoPresidenteLiberacao");

    area.hidden = true;
    area.innerHTML = "";

    document.getElementById("campoDestinatarioCidadeLiberacao").value = "";

    if (!uf) {
        return;
    }

    const presidente = presidentesCarregados.find(
        (p) => p.uf === uf
    );

    if (!presidente) {
        return;
    }

    const texto = document.createElement("span");

    texto.textContent = (
        `Presidente da Federação (${uf}): ${presidente.nome}. `
    );

    const botao = document.createElement("button");

    botao.type = "button";
    botao.className = "button button--text";
    botao.textContent = "Usar como destinatário (Federação)";

    botao.addEventListener("click", () => {
        document.getElementById("campoDestinatarioNomeLiberacao").value = (
            presidente.nome
        );

        document.getElementById("campoDestinatarioCargoLiberacao").value = (
            `Presidente da Federação das Apaes do Estado ${NOMES_ESTADOS[uf]}/${uf}`
        );

        document.getElementById("campoEntidadeBeneficiada").value = (
            `Federação das Apaes do Estado ${NOMES_ESTADOS[uf]}`
        );

        document.getElementById("campoAssuntoLiberacao").value = (
            "Liberação de recursos para projetos sociais das filiadas"
        );
    });

    area.append(texto, botao);
    area.hidden = false;
}


/* =========================================================
   2. VALOR E ADIANTAMENTO
   ========================================================= */

function alternarAreaAdiantamento() {
    const marcado = document.getElementById(
        "campoTemAdiantamento"
    ).checked;

    document.getElementById("areaAdiantamento").hidden = !marcado;

    atualizarValorTotal();
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
    const normalizado = String(valorMascarado || "")
        .replace(/\./g, "")
        .replace(",", ".");

    const numero = Number(normalizado);

    return Number.isFinite(numero) ? numero : 0;
}


function atualizarValorTotal() {
    if (!document.getElementById("campoTemAdiantamento").checked) {
        return;
    }

    const principal = converterMascaraParaNumero(
        document.getElementById("campoValorPrincipal").value
    );

    const adiantamento = converterMascaraParaNumero(
        document.getElementById("campoValorAdiantamento").value
    );

    document.getElementById("visualizacaoValorTotal").value = (
        formatarMoeda(principal + adiantamento)
    );
}


function formatarMoeda(valor) {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL"
    }).format(valor || 0);
}


/* =========================================================
   3. VALOR POR EXTENSO
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
        `${numeroPorExtenso(parteReais)} `
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


const NOMES_MESES = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
];


function formatarDataExtenso(data) {
    return (
        `${String(data.getDate()).padStart(2, "0")} de `
        + `${NOMES_MESES[data.getMonth()]} de ${data.getFullYear()}`
    );
}


/* =========================================================
   4. GERAÇÃO DO DOCUMENTO
   ========================================================= */

async function gerarEBaixarOficio() {
    const botao = document.getElementById("botaoGerarLiberacao");

    const numeroOficio = document.getElementById(
        "campoNumeroOficioLiberacao"
    ).value.trim();

    const temAdiantamento = document.getElementById(
        "campoTemAdiantamento"
    ).checked;

    const valorPrincipal = converterMascaraParaNumero(
        document.getElementById("campoValorPrincipal").value
    );

    const valorAdiantamento = temAdiantamento
        ? converterMascaraParaNumero(
            document.getElementById("campoValorAdiantamento").value
        )
        : 0;

    if (valorPrincipal <= 0) {
        exibirNotificacao(
            "warning",
            "Falta o valor",
            "Informe o valor liberado."
        );

        return;
    }

    if (temAdiantamento && valorAdiantamento <= 0) {
        exibirNotificacao(
            "warning",
            "Falta o valor do adiantamento",
            "Informe o valor do adiantamento, ou desmarque a opção."
        );

        return;
    }

    try {
        botao.disabled = true;
        botao.textContent = "Gerando...";

        const bufferTemplate = await obterModeloComoArrayBuffer(
            NOME_MODELO.LIBERACAO_RECURSOS
        );

        if (!bufferTemplate) {
            throw new Error(
                "O modelo do Ofício de Liberação de Recursos ainda não "
                + "foi importado. Vai no Banco de Dados e sobe o "
                + "arquivo .docx dele."
            );
        }

        const zip = new PizZip(bufferTemplate);

        const doc = new window.docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            delimiters: { start: "{{", end: "}}" }
        });

        const generoMasculino = (
            document.getElementById("campoGenero").value === "masculino"
        );

        const entidadeBeneficiada = document.getElementById(
            "campoEntidadeBeneficiada"
        ).value.trim();

        const dadosRenderizacao = {
            NUMERO_OFICIO: numeroOficio,
            ANO: String(new Date().getFullYear()),
            DATA_OFICIO_EXTENSO: formatarDataExtenso(new Date()),
            TRATAMENTO: generoMasculino ? "IImo." : "IIma.",
            SAUDACAO: generoMasculino ? "Senhor," : "Senhora,",
            DESTINATARIO_NOME: document.getElementById(
                "campoDestinatarioNomeLiberacao"
            ).value.trim(),
            DESTINATARIO_CARGO_ENTIDADE: document.getElementById(
                "campoDestinatarioCargoLiberacao"
            ).value.trim(),
            DESTINATARIO_CIDADE_UF: document.getElementById(
                "campoDestinatarioCidadeLiberacao"
            ).value.trim(),
            ASSUNTO: document.getElementById(
                "campoAssuntoLiberacao"
            ).value.trim(),
            VALOR_PRINCIPAL: valorPrincipal.toLocaleString("pt-BR", {
                minimumFractionDigits: 2
            }),
            VALOR_PRINCIPAL_EXTENSO: valorPorExtenso(valorPrincipal),
            ENTIDADE_BENEFICIADA: entidadeBeneficiada,
            TEM_ADIANTAMENTO: temAdiantamento
        };

        if (temAdiantamento) {
            const valorTotal = valorPrincipal + valorAdiantamento;

            dadosRenderizacao.VALOR_ADIANTAMENTO = (
                valorAdiantamento.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2
                })
            );

            dadosRenderizacao.VALOR_ADIANTAMENTO_EXTENSO = (
                valorPorExtenso(valorAdiantamento)
            );

            dadosRenderizacao.VALOR_TOTAL = (
                valorTotal.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2
                })
            );

            dadosRenderizacao.VALOR_TOTAL_EXTENSO = (
                valorPorExtenso(valorTotal)
            );
        }

        doc.render(dadosRenderizacao);

        const blob = doc.getZip().generate({
            type: "blob",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        });

        const nomeArquivo = (
            `Oficio FNA ${numeroOficio.replace(/\//g, "-")} `
            + `- Liberacao de Recursos - ${entidadeBeneficiada}.docx`
        );

        baixarBlob(blob, nomeArquivo);

        exibirNotificacao(
            "success",
            "Ofício gerado",
            `${nomeArquivo} foi baixado.`
        );
    } catch (erro) {
        exibirNotificacao(
            "error",
            "Não foi possível gerar o ofício",
            obterMensagemDeErro(erro)
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


/* =========================================================
   5. ERROS E NOTIFICAÇÃO
   ========================================================= */

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
