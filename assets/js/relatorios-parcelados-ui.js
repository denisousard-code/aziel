"use strict";

/*
 * =========================================================
 * AZIEL — PROJETOS PARCELADOS (Diretoria/Gestores)
 * =========================================================
 *
 * Cruza dois relatórios do Banco de Dados:
 *
 * 1. "Relatório de Pagamentos de Projetos" — mostra quanto já
 *    foi pago, em quantas parcelas, por PAA.
 * 2. "Relatório de Projetos" — mostra o Valor Total combinado
 *    de cada PAA (não só o que já foi pago).
 *
 * Um projeto é considerado "parcelado" quando o Valor Total
 * dividido pelo valor de uma parcela paga resulta em mais de 1
 * parcela combinada — mesmo que só 1 tenha sido paga até agora
 * (é assim que a planilha manual já era montada).
 */

import {
    obterBaseDados,
    TIPO_BASE_DADOS
} from "./banco-dados-service.js";

let linhasParceladas = [];

document.addEventListener("DOMContentLoaded", iniciarSecaoParcelados);


function iniciarSecaoParcelados() {
    const painel = document.getElementById("previaParcelados");

    if (!painel) {
        return;
    }

    document.getElementById("botaoBaixarParcelados")
        .addEventListener("click", baixarPlanilhaParcelados);

    carregarDadosDoBancoDeDados();
}


/* =========================================================
   1. LEITURA DO BANCO DE DADOS
   ========================================================= */

async function carregarDadosDoBancoDeDados() {
    const status = document.getElementById("statusParcelados");

    try {
        const [basePagamentos, baseProjetos] = await Promise.all([
            obterBaseDados(TIPO_BASE_DADOS.PAGAMENTOS_PROJETOS),
            obterBaseDados(TIPO_BASE_DADOS.RELATORIO_PROJETOS)
        ]);

        if (!basePagamentos || !baseProjetos) {
            status.innerHTML = (
                "Falta importar "
                + [
                    !basePagamentos && "o Relatório de Pagamentos de Projetos",
                    !baseProjetos && "o Relatório de Projetos"
                ].filter(Boolean).join(" e ")
                + " no <a href=\"./banco-dados.html\">Banco de Dados</a>."
            );

            status.classList.add("form-field__message--danger");

            return;
        }

        status.textContent = "Calculando...";
        status.classList.remove("form-field__message--danger");

        const pagamentosPorPaa = agruparPagamentosPorPaa(
            basePagamentos.registros
        );

        const projetosPorPaa = {};

        baseProjetos.registros.forEach((registro) => {
            if (Number.isFinite(registro.valorProjeto)) {
                projetosPorPaa[registro.paa] = registro.valorProjeto;
            }
        });

        calcularEExibirParcelados(pagamentosPorPaa, projetosPorPaa);
    } catch (erro) {
        status.textContent = obterMensagemDeErro(erro);
        status.classList.add("form-field__message--danger");
    }
}


function agruparPagamentosPorPaa(registros) {
    const resultado = {};

    registros.forEach((registro) => {
        const { paa, nomeEntidade, uf, valor, data } = registro;

        if (!Number.isFinite(valor)) {
            return;
        }

        if (!resultado[paa]) {
            resultado[paa] = {
                entidade: nomeEntidade,
                uf,
                valores: [],
                datas: []
            };
        }

        resultado[paa].valores.push(valor);

        if (data) {
            resultado[paa].datas.push(new Date(data));
        }
    });

    return resultado;
}


/*
 * O ano do projeto é o ano da primeira parcela paga — ancora
 * "de qual ano é esse projeto", mesmo quando ele tem parcelas
 * pagas em anos diferentes.
 */
function obterAnoDaPrimeiraParcela(datas) {
    if (!datas || datas.length === 0) {
        return null;
    }

    const maisAntiga = datas.reduce(
        (menor, data) => (data < menor ? data : menor)
    );

    return maisAntiga.getFullYear();
}


/* =========================================================
   2. CÁLCULO
   ========================================================= */

function calcularEExibirParcelados(pagamentosPorPaa, projetosPorPaa) {
    linhasParceladas = [];

    Object.keys(pagamentosPorPaa).forEach((paa) => {
        const valorTotal = projetosPorPaa[paa];

        if (valorTotal === undefined) {
            return;
        }

        const { entidade, uf, valores, datas } = pagamentosPorPaa[paa];

        const parcelasPagas = valores.length;
        const valorPago = valores.reduce((total, v) => total + v, 0);
        const valorParcela = valorPago / parcelasPagas;

        if (valorParcela === 0) {
            return;
        }

        const qtdParcelas = Math.round(valorTotal / valorParcela);

        if (qtdParcelas <= 1) {
            return;
        }

        linhasParceladas.push({
            entidade,
            uf,
            paa,
            ano: obterAnoDaPrimeiraParcela(datas),
            valorTotal,
            qtdParcelas,
            valorParcela,
            parcelasPagas,
            valorPago,
            valorAberto: valorTotal - valorPago
        });
    });

    linhasParceladas.sort(
        (a, b) => (a.uf || "").localeCompare(b.uf || "") || a.entidade.localeCompare(b.entidade)
    );

    exibirResultado();
}


/* =========================================================
   3. EXIBIÇÃO
   ========================================================= */

function exibirResultado() {
    const status = document.getElementById("statusParcelados");

    status.textContent = (
        `${linhasParceladas.length} projeto(s) parcelado(s) encontrado(s).`
    );

    const valorAbertoTotal = linhasParceladas.reduce(
        (total, l) => total + l.valorAberto,
        0
    );

    document.getElementById("resumoTotalParcelados").textContent = (
        String(linhasParceladas.length)
    );

    document.getElementById("resumoValorAbertoParcelados").textContent = (
        formatarMoedaBrasileira(valorAbertoTotal)
    );

    const corpoTabela = document.getElementById("tabelaParcelados");

    corpoTabela.innerHTML = "";

    if (linhasParceladas.length === 0) {
        const linhaVazia = document.createElement("tr");
        const celula = document.createElement("td");

        celula.colSpan = 10;
        celula.className = "data-table__empty";
        celula.textContent = "Nenhum projeto parcelado encontrado.";

        linhaVazia.appendChild(celula);
        corpoTabela.appendChild(linhaVazia);
    } else {
        linhasParceladas.forEach((linha) => {
            const tr = document.createElement("tr");

            // Só destaca quando o valor em aberto é de verdade —
            // valores de até 1 centavo costumam ser só ruído de
            // arredondamento entre parcelas, não um saldo real.
            if (linha.valorAberto > 0.01) {
                tr.classList.add("parcelado-linha--aberto");
            }

            [
                linha.entidade,
                linha.uf,
                linha.paa,
                linha.ano || "—",
                formatarMoedaBrasileira(linha.valorTotal),
                linha.qtdParcelas,
                formatarMoedaBrasileira(linha.valorParcela),
                linha.parcelasPagas,
                formatarMoedaBrasileira(linha.valorPago),
                formatarMoedaBrasileira(linha.valorAberto)
            ].forEach((valorCelula) => {
                const td = document.createElement("td");

                td.textContent = valorCelula;
                tr.appendChild(td);
            });

            corpoTabela.appendChild(tr);
        });
    }

    document.getElementById("previaParcelados").hidden = false;
}


function formatarMoedaBrasileira(valor) {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL"
    }).format(valor || 0);
}


/* =========================================================
   4. DOWNLOAD
   ========================================================= */

function baixarPlanilhaParcelados() {
    if (linhasParceladas.length === 0) {
        return;
    }

    const dadosPlanilha = [
        [
            "Entidade", "UF", "PAA", "Ano", "Valor Total", "Qte. Parcelas",
            "Valor Parcela", "Parcelas Pagas", "Valor Pago", "Valor em Aberto"
        ],
        ...linhasParceladas.map((l) => [
            l.entidade, l.uf, l.paa, l.ano, l.valorTotal, l.qtdParcelas,
            l.valorParcela, l.parcelasPagas, l.valorPago, l.valorAberto
        ])
    ];

    const planilha = XLSX.utils.aoa_to_sheet(dadosPlanilha);

    planilha["!cols"] = [
        { wch: 40 }, { wch: 6 }, { wch: 10 }, { wch: 8 }, { wch: 16 }, { wch: 14 },
        { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 16 }
    ];

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, planilha, "Projetos Parcelados");

    XLSX.writeFile(workbook, "projetos-parcelados.xlsx");
}


/* =========================================================
   5. ERROS
   ========================================================= */

function obterMensagemDeErro(erro) {
    if (erro && typeof erro.message === "string") {
        return erro.message;
    }

    return "Não foi possível processar o arquivo.";
}
