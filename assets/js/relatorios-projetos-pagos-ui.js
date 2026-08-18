"use strict";

/*
 * =========================================================
 * AZIEL — RELATÓRIO: PROJETOS PAGOS POR ANO (Diretoria/Gestores)
 * =========================================================
 *
 * Usa o "Relatório de Pagamentos de Projetos" (Banco de Dados),
 * agrupa por ano e por estado, e gera uma planilha com uma aba
 * por ano: Estado, Quantidade de Projetos e Valor, com uma
 * linha de Total no final.
 *
 * O mesmo PAA pode aparecer várias vezes se o projeto foi pago
 * em parcelas. Por isso, "Quantidade de Projetos" conta PAAs
 * distintos, e "Valor" soma o valor de todas as parcelas (cada
 * parcela é um pagamento de verdade).
 */

import {
    obterBaseDados,
    TIPO_BASE_DADOS
} from "./banco-dados-service.js";

const NOMES_ESTADOS = {
    AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia",
    CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
    MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul",
    MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná",
    PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro",
    RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia",
    RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe",
    TO: "Tocantins"
};

let dadosPorAno = {};
let registrosDetalhadosPorAno = {};

document.addEventListener("DOMContentLoaded", iniciarSecaoProjetosPagos);


function iniciarSecaoProjetosPagos() {
    const painelPrevia = document.getElementById("previaProjetosPagos");

    if (!painelPrevia) {
        return;
    }

    document.getElementById("campoAnoProjetosPagos")
        .addEventListener("change", exibirTabelaDoAnoSelecionado);

    document.getElementById("botaoBaixarProjetosPagos")
        .addEventListener("click", baixarPlanilhaCompleta);

    carregarDadosDoBancoDeDados();
}


/* =========================================================
   1. LEITURA DO BANCO DE DADOS
   ========================================================= */

async function carregarDadosDoBancoDeDados() {
    const status = document.getElementById("statusProjetosPagos");

    document.getElementById("previaProjetosPagos").hidden = true;

    try {
        const base = await obterBaseDados(
            TIPO_BASE_DADOS.PAGAMENTOS_PROJETOS
        );

        if (!base) {
            status.innerHTML = (
                "Falta importar o Relatório de Pagamentos de Projetos "
                + "no <a href=\"./banco-dados.html\">Banco de Dados</a>."
            );

            status.classList.add("form-field__message--danger");

            return;
        }

        dadosPorAno = agruparPorAnoEEstado(base.registros);

        const anos = Object.keys(dadosPorAno).sort(
            (a, b) => Number(b) - Number(a)
        );

        if (anos.length === 0) {
            throw new Error(
                "Não encontrei nenhuma data válida no Relatório de "
                + "Pagamentos de Projetos."
            );
        }

        status.classList.remove("form-field__message--danger");

        status.textContent = (
            `${base.registros.length} pagamento(s) carregado(s) do `
            + `Banco de Dados, cobrindo ${anos[anos.length - 1]} até `
            + `${anos[0]}.`
        );

        preencherSeletorDeAnos(anos);
        exibirTabelaDoAnoSelecionado();

        document.getElementById("previaProjetosPagos").hidden = false;
    } catch (erro) {
        status.textContent = obterMensagemDeErro(erro);
        status.classList.add("form-field__message--danger");
    }
}



function agruparPorAnoEEstado(registros) {
    const resultado = {};

    registrosDetalhadosPorAno = {};

    registros.forEach((registro) => {
        const { paa, data: dataIso, nomeEntidade, uf, parcela, valor } = registro;

        if (!dataIso || !Number.isFinite(valor)) {
            return;
        }

        const data = new Date(dataIso);

        const ano = data.getFullYear();

        if (!resultado[ano]) {
            resultado[ano] = {};
        }

        if (!resultado[ano][uf]) {
            resultado[ano][uf] = {
                paas: new Set(),
                valor: 0
            };
        }

        resultado[ano][uf].paas.add(paa);
        resultado[ano][uf].valor += valor;

        if (!registrosDetalhadosPorAno[ano]) {
            registrosDetalhadosPorAno[ano] = [];
        }

        registrosDetalhadosPorAno[ano].push({
            paa,
            data,
            dataTexto: formatarDataBrCurta(data),
            uf,
            entidade: nomeEntidade,
            parcela,
            valor
        });
    });

    Object.keys(registrosDetalhadosPorAno).forEach((ano) => {
        registrosDetalhadosPorAno[ano].sort(
            (a, b) => (
                a.uf.localeCompare(b.uf)
                || a.data - b.data
            )
        );
    });

    return resultado;
}


function formatarDataBrCurta(data) {
    return new Intl.DateTimeFormat("pt-BR").format(data);
}


/* =========================================================
   3. EXIBIÇÃO
   ========================================================= */

function preencherSeletorDeAnos(anos) {
    const seletor = document.getElementById("campoAnoProjetosPagos");

    seletor.innerHTML = "";

    anos.forEach((ano) => {
        const opcao = document.createElement("option");

        opcao.value = ano;
        opcao.textContent = ano;

        seletor.appendChild(opcao);
    });
}


function exibirTabelaDoAnoSelecionado() {
    const ano = document.getElementById("campoAnoProjetosPagos").value;

    const corpoTabela = document.getElementById("tabelaProjetosPagos");

    corpoTabela.innerHTML = "";

    const linhas = montarLinhasDoAno(ano);

    let totalProjetos = 0;
    let totalValor = 0;

    linhas.forEach(([estado, quantidade, valor]) => {
        const tr = document.createElement("tr");

        [estado, quantidade, formatarMoedaBrasileira(valor)].forEach(
            (valorCelula) => {
                const td = document.createElement("td");

                td.textContent = valorCelula;
                tr.appendChild(td);
            }
        );

        corpoTabela.appendChild(tr);

        totalProjetos += quantidade;
        totalValor += valor;
    });

    const linhaTotal = document.createElement("tr");

    linhaTotal.style.fontWeight = "700";

    [
        "Total",
        String(totalProjetos),
        formatarMoedaBrasileira(totalValor)
    ].forEach((valorCelula) => {
        const td = document.createElement("td");

        td.textContent = valorCelula;
        linhaTotal.appendChild(td);
    });

    corpoTabela.appendChild(linhaTotal);
}


function montarLinhasDoAno(ano) {
    const dadosDoAno = dadosPorAno[ano] || {};

    return Object.keys(dadosDoAno)
        .sort()
        .map((uf) => [
            uf,
            dadosDoAno[uf].paas.size,
            dadosDoAno[uf].valor
        ]);
}


function formatarMoedaBrasileira(valor) {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL"
    }).format(valor || 0);
}


/* =========================================================
   4. DOWNLOAD (TODOS OS ANOS, UMA ABA POR ANO)
   ========================================================= */

function baixarPlanilhaCompleta() {
    const anos = Object.keys(dadosPorAno).sort();

    if (anos.length === 0) {
        return;
    }

    const workbook = XLSX.utils.book_new();

    anos.forEach((ano) => {
        adicionarAbaDetalhada(workbook, ano);
        adicionarAbaResumo(workbook, ano);
    });

    XLSX.writeFile(
        workbook,
        "projetos-pagos-por-ano.xlsx"
    );
}


/*
 * Uma linha por pagamento (cada parcela aparece separada, igual
 * ao extrato de origem) — Nº Projeto, Data de Pagamento, UF,
 * Entidade e Valor Pago.
 */
function adicionarAbaDetalhada(workbook, ano) {
    const registros = registrosDetalhadosPorAno[ano] || [];

    const dadosPlanilha = [
        ["Nº Projeto", "Data de Pagamento", "UF", "Entidade", "Parcela", "Valor Pago"],
        ...registros.map((registro) => [
            registro.paa,
            registro.data,
            registro.uf,
            registro.entidade,
            registro.parcela,
            registro.valor
        ])
    ];

    const planilha = XLSX.utils.aoa_to_sheet(dadosPlanilha, {
        cellDates: true
    });

    planilha["!cols"] = [
        { wch: 12 },
        { wch: 16 },
        { wch: 8 },
        { wch: 45 },
        { wch: 10 },
        { wch: 16 }
    ];

    registros.forEach((_registro, indice) => {
        const referenciaCelula = `B${indice + 2}`;

        if (planilha[referenciaCelula]) {
            planilha[referenciaCelula].z = "dd/mm/yyyy";
        }
    });

    XLSX.utils.book_append_sheet(
        workbook,
        planilha,
        `${ano} - Detalhado`
    );
}


/*
 * Resumo por estado (Estado, Quantidade de Projetos, Valor),
 * com a linha de Total — igual ao formato original pedido.
 */
function adicionarAbaResumo(workbook, ano) {
    const linhas = montarLinhasDoAno(ano);

    const totalProjetos = linhas.reduce(
        (total, linha) => total + linha[1],
        0
    );

    const totalValor = linhas.reduce(
        (total, linha) => total + linha[2],
        0
    );

    const dadosPlanilha = [
        ["Estado", "Quantidade de Projetos", "Valor"],
        ...linhas.map(([uf, quantidade, valor]) => [
            formatarEstado(uf),
            quantidade,
            valor
        ]),
        ["Total", totalProjetos, totalValor]
    ];

    const planilha = XLSX.utils.aoa_to_sheet(dadosPlanilha);

    planilha["!cols"] = [
        { wch: 24 },
        { wch: 22 },
        { wch: 18 }
    ];

    XLSX.utils.book_append_sheet(
        workbook,
        planilha,
        `${ano} - Resumo`
    );
}


function formatarEstado(uf) {
    const nome = NOMES_ESTADOS[uf];

    return nome ? `(${uf}) ${nome}` : uf;
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
