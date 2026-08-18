"use strict";

/*
 * =========================================================
 * AZIEL — RELATÓRIO: APLICAÇÃO DOS TÍTULOS DE CAPITALIZAÇÃO (MDM8)
 * =========================================================
 *
 * Usa o "Relatório MDM8" do Banco de Dados, filtra os projetos
 * com Status = "Fim" (pagos) dentro de um período (mês inicial
 * a mês final) e gera a planilha que a MDM8 pede todo mês:
 * produto de capitalização, PAA, data, unidade atendida,
 * descrição e valor.
 */

import {
    obterBaseDados,
    TIPO_BASE_DADOS
} from "./banco-dados-service.js";

const NOMES_MESES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const COLUNAS_ESPERADAS = [
    "PAA", "Instituição", "Projeto", "Produto", "Descrição",
    "Objetivo", "Data Aprovação", "Valor", "Status"
];

/*
 * Um projeto é considerado pago quando está em qualquer um
 * desses três status — "Fim" é o mais comum, mas "Prestação de
 * contas" e "Comprovação de pagamento" também já representam
 * dinheiro efetivamente pago, só ainda em etapas posteriores do
 * fluxo (comprovação/prestação de contas).
 */
const STATUS_CONSIDERADOS_PAGOS = [
    "Fim",
    "Prestação de contas",
    "Comprovação de pagamento"
];

let registrosFinalizados = [];
let mesesDisponiveis = [];
let ultimaTabulacaoGerada = null;

document.addEventListener("DOMContentLoaded", iniciarSecaoCapitalizacao);


function iniciarSecaoCapitalizacao() {
    const painel = document.getElementById("previaCapitalizacao");

    if (!painel) {
        return;
    }

    document.getElementById("botaoGerarCapitalizacao")
        .addEventListener("click", gerarPreviaDoPeriodo);

    document.getElementById("botaoBaixarCapitalizacao")
        .addEventListener("click", baixarPlanilhaGerada);

    carregarDadosDoBancoDeDados();
}


/* =========================================================
   1. LEITURA DO BANCO DE DADOS
   ========================================================= */

async function carregarDadosDoBancoDeDados() {
    const status = document.getElementById("statusCapitalizacao");

    document.getElementById("previaCapitalizacao").hidden = true;

    try {
        const base = await obterBaseDados(TIPO_BASE_DADOS.RELATORIO_MDM8);

        if (!base) {
            status.innerHTML = (
                "Falta importar o Relatório MDM8 no "
                + "<a href=\"./banco-dados.html\">Banco de Dados</a>."
            );

            status.classList.add("form-field__message--danger");

            return;
        }

        registrosFinalizados = base.registros
            .filter(
                (registro) => STATUS_CONSIDERADOS_PAGOS.includes(
                    String(registro.status || "").trim()
                )
            )
            .map((registro) => ({
                produto: registro.produto || null,
                paa: registro.paa,
                data: registro.dataAprovacao
                    ? new Date(registro.dataAprovacao)
                    : null,
                dataTexto: registro.dataAprovacao
                    ? formatarDataBr(new Date(registro.dataAprovacao))
                    : "Não informada",
                unidade: registro.instituicao || null,
                descricaoProjeto: registro.descricao || "Sem descrição",
                descricaoDetalhada: (
                    registro.objetivo || "Sem descrição detalhada"
                ),
                valor: Number.isFinite(registro.valor) ? registro.valor : 0
            }));

        if (registrosFinalizados.length === 0) {
            throw new ErroRelatorioCapitalizacao(
                "Nenhum projeto pago (Status = \"Fim\", \"Prestação "
                + "de contas\" ou \"Comprovação de pagamento\") foi "
                + "encontrado no Relatório MDM8."
            );
        }

        mesesDisponiveis = obterMesesDisponiveis(registrosFinalizados);

        status.classList.remove("form-field__message--danger");

        status.textContent = (
            `${registrosFinalizados.length} projeto(s) finalizado(s) `
            + `carregado(s) do Banco de Dados, de `
            + `${formatarMesAno(mesesDisponiveis[0])} até `
            + `${formatarMesAno(mesesDisponiveis[mesesDisponiveis.length - 1])}.`
        );

        preencherSeletoresDeMes();

        document.getElementById("previaCapitalizacao").hidden = false;
    } catch (erro) {
        status.textContent = obterMensagemDeErro(erro);
        status.classList.add("form-field__message--danger");
    }
}





/* =========================================================
   2. SELEÇÃO DE PERÍODO
   ========================================================= */

function obterMesesDisponiveis(registros) {
    const chaves = new Set();

    registros.forEach(({ data }) => {
        if (data) {
            chaves.add(
                `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`
            );
        }
    });

    return Array.from(chaves).sort();
}


function preencherSeletoresDeMes() {
    const seletorInicio = document.getElementById(
        "campoMesInicioCapitalizacao"
    );

    const seletorFim = document.getElementById(
        "campoMesFimCapitalizacao"
    );

    seletorInicio.innerHTML = "";
    seletorFim.innerHTML = "";

    mesesDisponiveis.forEach((chave) => {
        [seletorInicio, seletorFim].forEach((seletor) => {
            const opcao = document.createElement("option");

            opcao.value = chave;
            opcao.textContent = formatarMesAno(chave);

            seletor.appendChild(opcao);
        });
    });

    // Por padrão, sugere só o mês mais recente disponível nos dois
    // seletores — o usuário troca o inicial se quiser um intervalo.
    const maisRecente = mesesDisponiveis[mesesDisponiveis.length - 1];

    seletorInicio.value = maisRecente;
    seletorFim.value = maisRecente;
}


function formatarMesAno(chave) {
    const [ano, mes] = chave.split("-");

    return `${NOMES_MESES[Number(mes) - 1]} de ${ano}`;
}


/* =========================================================
   3. GERAÇÃO DA PRÉVIA
   ========================================================= */

function gerarPreviaDoPeriodo() {
    const chaveInicio = document.getElementById(
        "campoMesInicioCapitalizacao"
    ).value;

    const chaveFim = document.getElementById(
        "campoMesFimCapitalizacao"
    ).value;

    if (chaveInicio > chaveFim) {
        exibirNotificacao(
            "warning",
            "Período inválido",
            "O mês inicial não pode ser depois do mês final."
        );

        return;
    }

    const linhasDoPeriodo = registrosFinalizados.filter(
        ({ data }) => {
            if (!data) {
                return false;
            }

            const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;

            return chave >= chaveInicio && chave <= chaveFim;
        }
    ).sort((a, b) => a.data - b.data);

    ultimaTabulacaoGerada = {
        chaveInicio,
        chaveFim,
        linhas: linhasDoPeriodo
    };

    exibirResultado(ultimaTabulacaoGerada);
}


function exibirResultado({ linhas }) {
    const totalProjetos = linhas.length;

    const valorTotal = linhas.reduce(
        (total, linha) => total + linha.valor,
        0
    );

    document.getElementById(
        "resumoTotalProjetosCapitalizacao"
    ).textContent = String(totalProjetos);

    document.getElementById(
        "resumoValorCapitalizacao"
    ).textContent = formatarMoedaBrasileira(valorTotal);

    const corpoTabela = document.getElementById("tabelaCapitalizacao");

    corpoTabela.innerHTML = "";

    if (linhas.length === 0) {
        const linhaVazia = document.createElement("tr");
        const celula = document.createElement("td");

        celula.colSpan = 7;
        celula.className = "data-table__empty";
        celula.textContent = "Nenhum projeto encontrado nesse período.";

        linhaVazia.appendChild(celula);
        corpoTabela.appendChild(linhaVazia);

        return;
    }

    linhas.forEach((linha) => {
        const tr = document.createElement("tr");

        [
            linha.produto || "—",
            linha.paa,
            linha.dataTexto,
            linha.unidade || "—",
            linha.descricaoProjeto,
            linha.descricaoDetalhada,
            formatarMoedaBrasileira(linha.valor)
        ].forEach((valorCelula) => {
            const td = document.createElement("td");

            td.textContent = valorCelula;
            tr.appendChild(td);
        });

        corpoTabela.appendChild(tr);
    });
}


function formatarDataBr(data) {
    return new Intl.DateTimeFormat("pt-BR").format(data);
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

function baixarPlanilhaGerada() {
    if (!ultimaTabulacaoGerada || ultimaTabulacaoGerada.linhas.length === 0) {
        exibirNotificacao(
            "warning",
            "Nada para baixar",
            "Gere a prévia de um período antes de baixar."
        );

        return;
    }

    const { chaveInicio, chaveFim, linhas } = ultimaTabulacaoGerada;

    const dadosPlanilha = [
        [
            "Produto",
            "PAA",
            "Data de Realização",
            "Unidade Atendida",
            "Descrição do Projeto",
            "Descrição Detalhada",
            "Valor"
        ],
        ...linhas.map((linha) => [
            linha.produto,
            linha.paa,
            linha.data,
            linha.unidade,
            linha.descricaoProjeto,
            linha.descricaoDetalhada,
            linha.valor
        ])
    ];

    const planilha = XLSX.utils.aoa_to_sheet(dadosPlanilha, {
        cellDates: true
    });

    planilha["!cols"] = [
        { wch: 30 },
        { wch: 10 },
        { wch: 16 },
        { wch: 30 },
        { wch: 60 },
        { wch: 60 },
        { wch: 16 }
    ];

    /*
     * Formata a coluna de data (C) como data de verdade, igual
     * ao modelo que a MDM8 espera receber.
     */
    linhas.forEach((linha, indice) => {
        const referenciaCelula = `C${indice + 2}`;

        if (planilha[referenciaCelula] && linha.data) {
            planilha[referenciaCelula].z = "dd/mm/yyyy";
        }
    });

    const workbook = XLSX.utils.book_new();

    const nomeAba = chaveInicio === chaveFim
        ? formatarMesAno(chaveInicio)
        : `${formatarMesAno(chaveInicio)} a ${formatarMesAno(chaveFim)}`;

    XLSX.utils.book_append_sheet(
        workbook,
        planilha,
        nomeAba.slice(0, 31)
    );

    const nomeArquivo = (
        `aplicacao-capitalizacao-${chaveInicio}_a_${chaveFim}.xlsx`
    );

    XLSX.writeFile(workbook, nomeArquivo);

    exibirNotificacao(
        "success",
        "Planilha baixada",
        `${nomeArquivo} — ${linhas.length} linha(s).`
    );
}


/* =========================================================
   5. ERROS E NOTIFICAÇÃO
   ========================================================= */

class ErroRelatorioCapitalizacao extends Error {
    constructor(mensagem) {
        super(mensagem);
        this.name = "ErroRelatorioCapitalizacao";
    }
}


function obterMensagemDeErro(erro) {
    if (erro instanceof ErroRelatorioCapitalizacao) {
        return erro.message;
    }

    return "Não foi possível processar o arquivo. Confira se é um .xlsx válido.";
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

    window.setTimeout(() => {
        notificacao.hidden = true;
    }, 5000);
}
