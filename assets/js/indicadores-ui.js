"use strict";

/*
 * =========================================================
 * AZIEL — TABULAÇÃO MENSAL DE INDICADORES ISO
 * =========================================================
 *
 * Usa o "Relatório de Pagamentos de Projetos" (Pagamento de
 * Projetos, no Fluig) como fonte de verdade pro valor e a data
 * de cada pagamento — é o relatório que reflete exatamente o
 * que foi pago, parcela por parcela, sem juntar tudo num só mês.
 *
 * Cruza pelo PAA com o "Controle de Projetos" só pra trazer
 * Categoria, Subcategoria, Descrição de Despesas e Quantidade
 * de beneficiários (esses dados não têm relação com valor/data,
 * então tanto faz de qual relatório vêm).
 *
 * Quando um projeto tem mais de uma parcela paga em meses
 * diferentes, a Quantidade de beneficiários é contada em CADA
 * mês pago (não divide, não conta só uma vez) — confirmado
 * diretamente com o usuário.
 *
 * Os dois relatórios vêm do Banco de Dados (importados lá uma
 * vez) — essa página não pede upload, só lê o que já está salvo.
 *
 * Usa a biblioteca SheetJS (carregada via CDN em indicadores.html,
 * disponível globalmente como "XLSX") só pra escrever o .xlsx de
 * saída no final.
 */

import {
    obterBaseDados,
    TIPO_BASE_DADOS
} from "./banco-dados-service.js";


/* =========================================================
   1. TABELAS DE APOIO
   ========================================================= */

const NOMES_ESTADOS = {
    AC: "Acre",
    AL: "Alagoas",
    AP: "Amapá",
    AM: "Amazonas",
    BA: "Bahia",
    CE: "Ceará",
    DF: "Distrito Federal",
    ES: "Espírito Santo",
    GO: "Goiás",
    MA: "Maranhão",
    MT: "Mato Grosso",
    MS: "Mato Grosso do Sul",
    MG: "Minas Gerais",
    PA: "Pará",
    PB: "Paraíba",
    PR: "Paraná",
    PE: "Pernambuco",
    PI: "Piauí",
    RJ: "Rio de Janeiro",
    RN: "Rio Grande do Norte",
    RS: "Rio Grande do Sul",
    RO: "Rondônia",
    RR: "Roraima",
    SC: "Santa Catarina",
    SP: "São Paulo",
    SE: "Sergipe",
    TO: "Tocantins"
};

const NOMES_MESES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const COLUNAS_ESPERADAS_CONTROLE = [
    "PAA",
    "Categoria",
    "Subcategoria",
    "Descrição de Despesas",
    "Quantidade de beneficiários"
];

const CABECALHO_TABULACAO = [
    "Ano",
    "Mês",
    "Estado",
    "Categoria",
    "Sub Categoria",
    "Despesas",
    "Quantidade de beneficiários",
    "Valor"
];


/* =========================================================
   2. ESTADO DA PÁGINA
   ========================================================= */

let pagamentosCarregados = null;
let enriquecimentoPorPaa = null;
let linhasPagasCarregadas = [];
let ultimaTabulacaoGerada = null;
let temporizadorNotificacao = null;


/* =========================================================
   3. INICIALIZAÇÃO
   ========================================================= */

document.addEventListener("DOMContentLoaded", iniciarPaginaIndicadores);


function iniciarPaginaIndicadores() {
    exibirDataAtual();
    iniciarNotificacao();

    document.getElementById("botaoGerarTabulacao")
        .addEventListener("click", gerarTabulacaoDoMesEscolhido);

    document.getElementById("botaoBaixarTabulacao")
        .addEventListener("click", baixarTabulacaoGerada);

    carregarDadosDoBancoDeDados();
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
   4. LEITURA DO BANCO DE DADOS
   ========================================================= */

async function carregarDadosDoBancoDeDados() {
    const status = document.getElementById("statusImportacaoFluig");

    document.getElementById("painelSelecaoMes").hidden = true;
    document.getElementById("painelResultado").hidden = true;

    try {
        const [basePagamentos, baseControle] = await Promise.all([
            obterBaseDados(TIPO_BASE_DADOS.PAGAMENTOS_PROJETOS),
            obterBaseDados(TIPO_BASE_DADOS.CONTROLE_PROJETOS)
        ]);

        if (!basePagamentos || !baseControle) {
            status.innerHTML = (
                "Falta importar "
                + [
                    !basePagamentos && "o Relatório de Pagamentos de Projetos",
                    !baseControle && "o Controle de Projetos"
                ].filter(Boolean).join(" e ")
                + " no <a href=\"./banco-dados.html\">Banco de Dados</a>."
            );

            status.classList.add("form-field__message--danger");

            return;
        }

        const enriquecimentoPorPaa = {};

        baseControle.registros.forEach((registro) => {
            enriquecimentoPorPaa[registro.paa] = registro;
        });

        linhasPagasCarregadas = basePagamentos.registros
            .filter((pagamento) => pagamento.data)
            .map((pagamento) => {
                const enriquecimento = enriquecimentoPorPaa[pagamento.paa];

                return {
                    paa: pagamento.paa,
                    uf: pagamento.uf,
                    dataPagamento: new Date(pagamento.data),
                    valor: pagamento.valor,
                    categoria: enriquecimento?.categoria || null,
                    subcategoria: enriquecimento?.subcategoria || null,
                    descricao: enriquecimento?.descricaoDespesas || null,
                    beneficiarios: enriquecimento?.beneficiarios || 0,
                    enriquecido: Boolean(enriquecimento)
                };
            });

        if (linhasPagasCarregadas.length === 0) {
            status.textContent = (
                "Nenhum pagamento encontrado no Relatório de Pagamentos "
                + "de Projetos."
            );

            status.classList.add("form-field__message--danger");

            return;
        }

        const semEnriquecimento = linhasPagasCarregadas.filter(
            (l) => !l.enriquecido
        ).length;

        status.classList.remove("form-field__message--danger");

        status.textContent = (
            `${linhasPagasCarregadas.length} pagamento(s) carregado(s) `
            + `do Banco de Dados.`
            + (
                semEnriquecimento > 0
                    ? ` ${semEnriquecimento} sem PAA correspondente no `
                        + "Controle de Projetos (Categoria ficará em branco)."
                    : ""
            )
        );

        preencherSeletorDeMeses();

        document.getElementById("painelSelecaoMes").hidden = false;
    } catch (erro) {
        status.textContent = obterMensagemDeErro(erro);
        status.classList.add("form-field__message--danger");
    }
}





/* =========================================================
   5. SELEÇÃO DE MÊS/ANO
   ========================================================= */

function preencherSeletorDeMeses() {
    const seletor = document.getElementById("campoMesAno");

    seletor.innerHTML = "";

    const combinacoes = new Map();

    linhasPagasCarregadas.forEach(({ dataPagamento }) => {
        const mes = dataPagamento.getMonth() + 1;
        const ano = dataPagamento.getFullYear();
        const chave = `${ano}-${String(mes).padStart(2, "0")}`;

        if (!combinacoes.has(chave)) {
            combinacoes.set(chave, { mes, ano });
        }
    });

    const listaOrdenada = Array.from(combinacoes.values()).sort(
        (a, b) => (b.ano - a.ano) || (b.mes - a.mes)
    );

    listaOrdenada.forEach(({ mes, ano }) => {
        const opcao = document.createElement("option");

        opcao.value = `${ano}-${mes}`;
        opcao.textContent = `${NOMES_MESES[mes - 1]} de ${ano}`;

        seletor.appendChild(opcao);
    });
}


/* =========================================================
   6. GERAÇÃO DA TABULAÇÃO
   ========================================================= */

function gerarTabulacaoDoMesEscolhido() {
    const seletor = document.getElementById("campoMesAno");

    if (!seletor.value) {
        exibirNotificacao(
            "warning",
            "Nenhum mês selecionado",
            "Escolha um mês antes de gerar a tabulação."
        );

        return;
    }

    const [anoTexto, mesTexto] = seletor.value.split("-");

    const ano = Number(anoTexto);
    const mes = Number(mesTexto);

    const linhasDoMes = linhasPagasCarregadas.filter(
        ({ dataPagamento }) => (
            dataPagamento.getMonth() + 1 === mes
            && dataPagamento.getFullYear() === ano
        )
    );

    const linhasTabulacao = linhasDoMes.map((pagamento) => {
        return [
            ano,
            mes,
            formatarEstado(pagamento.uf),
            pagamento.categoria,
            pagamento.subcategoria,
            pagamento.descricao,
            pagamento.beneficiarios || 0,
            pagamento.valor
        ];
    });

    ultimaTabulacaoGerada = {
        mes,
        ano,
        linhas: linhasTabulacao
    };

    exibirResultado(ultimaTabulacaoGerada);
}


function formatarEstado(uf) {
    if (!uf) {
        return null;
    }

    const ufLimpa = String(uf).trim().toUpperCase();
    const nome = NOMES_ESTADOS[ufLimpa];

    return nome ? `(${ufLimpa}) ${nome}` : ufLimpa;
}


function converterValor(valor) {
    if (valor === null || valor === undefined || valor === "") {
        return 0;
    }

    if (typeof valor === "number") {
        return valor;
    }

    const texto = String(valor)
        .replace(/R\$/g, "")
        .trim();

    if (!texto || texto.toLowerCase() === "null") {
        return 0;
    }

    const normalizado = texto
        .replace(/\./g, "")
        .replace(",", ".");

    const numero = Number(normalizado);

    return Number.isFinite(numero) ? numero : 0;
}


/* =========================================================
   7. EXIBIÇÃO DO RESULTADO
   ========================================================= */

function exibirResultado({ mes, ano, linhas }) {
    document.getElementById("tituloResultadoTabulacao").textContent = (
        `3. Conferir e baixar — ${NOMES_MESES[mes - 1]} de ${ano}`
    );

    const totalProjetos = linhas.length;

    const valorTotal = linhas.reduce(
        (total, linha) => total + linha[7],
        0
    );

    const totalBeneficiarios = linhas.reduce(
        (total, linha) => total + (Number(linha[6]) || 0),
        0
    );

    document.getElementById("resumoTotalProjetos").textContent = (
        String(totalProjetos)
    );

    document.getElementById("resumoValorTotal").textContent = (
        formatarMoedaBrasileira(valorTotal)
    );

    document.getElementById("resumoTotalBeneficiarios").textContent = (
        String(totalBeneficiarios)
    );

    const corpoTabela = document.getElementById(
        "tabelaPreviaTabulacao"
    );

    corpoTabela.innerHTML = "";

    if (linhas.length === 0) {
        const linhaVazia = document.createElement("tr");
        const celula = document.createElement("td");

        celula.colSpan = 8;
        celula.className = "data-table__empty";
        celula.textContent = "Nenhum projeto encontrado para esse mês.";

        linhaVazia.appendChild(celula);
        corpoTabela.appendChild(linhaVazia);
    } else {
        linhas.forEach((linha) => {
            const tr = document.createElement("tr");

            const valoresExibidos = [
                linha[0],
                NOMES_MESES[linha[1] - 1],
                linha[2] || "—",
                linha[3] || "—",
                linha[4] || "—",
                linha[5] || "—",
                linha[6],
                formatarMoedaBrasileira(linha[7])
            ];

            valoresExibidos.forEach((valor) => {
                const td = document.createElement("td");

                td.textContent = valor;
                tr.appendChild(td);
            });

            corpoTabela.appendChild(tr);
        });
    }

    document.getElementById("painelResultado").hidden = false;

    document.getElementById("painelResultado").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}


function formatarMoedaBrasileira(valor) {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL"
    }).format(valor || 0);
}


/* =========================================================
   8. DOWNLOAD DA PLANILHA GERADA
   ========================================================= */

function baixarTabulacaoGerada() {
    if (!ultimaTabulacaoGerada) {
        exibirNotificacao(
            "warning",
            "Nada para baixar",
            "Gere a tabulação de um mês antes de baixar."
        );

        return;
    }

    const { mes, ano, linhas } = ultimaTabulacaoGerada;

    const dadosPlanilha = [
        CABECALHO_TABULACAO,
        ...linhas
    ];

    const planilha = XLSX.utils.aoa_to_sheet(dadosPlanilha);

    planilha["!cols"] = [
        { wch: 8 },
        { wch: 6 },
        { wch: 24 },
        { wch: 16 },
        { wch: 55 },
        { wch: 60 },
        { wch: 14 },
        { wch: 16 }
    ];

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
        workbook,
        planilha,
        `Tabulação ${String(mes).padStart(2, "0")}-${ano}`
    );

    const nomeArquivo = (
        `tabulacao-${String(mes).padStart(2, "0")}-${ano}.xlsx`
    );

    XLSX.writeFile(workbook, nomeArquivo);

    exibirNotificacao(
        "success",
        "Planilha baixada",
        `${nomeArquivo} — ${linhas.length} linha(s), pronta para `
        + "colar na planilha online."
    );
}


/* =========================================================
   9. ERROS E NOTIFICAÇÃO
   ========================================================= */

class ErroTabulacao extends Error {
    constructor(mensagem) {
        super(mensagem);
        this.name = "ErroTabulacao";
    }
}


function obterMensagemDeErro(erro) {
    if (erro instanceof ErroTabulacao) {
        return erro.message;
    }

    return "Não foi possível processar o arquivo. Confira se é um .xlsx válido.";
}


function iniciarNotificacao() {
    const botaoFechar = document.getElementById(
        "botaoFecharNotificacao"
    );

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
    const tituloElemento = document.getElementById(
        "tituloNotificacaoAziel"
    );
    const textoElemento = document.getElementById(
        "textoNotificacaoAziel"
    );

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

    temporizadorNotificacao = window.setTimeout(
        fecharNotificacao,
        5000
    );
}


function fecharNotificacao() {
    const notificacao = document.getElementById("notificacaoAziel");

    if (!notificacao) {
        return;
    }

    notificacao.hidden = true;

    window.clearTimeout(temporizadorNotificacao);
}
