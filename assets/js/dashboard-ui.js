"use strict";

/*
 * =========================================================
 * AZIEL — DASHBOARD
 * =========================================================
 *
 * Preenche os cards e painéis do Dashboard com dados reais —
 * antes eram só números fixos, nunca conectados a nada.
 */

import {
    listarDevolucoes,
    STATUS_PROCESSO_STORAGE
} from "./storage-service.js";

import {
    listarDemandas,
    STATUS_DEMANDA,
    PRIORIDADE_DEMANDA
} from "./demandas-service.js";

import {
    listarRotinas,
    calcularStatusRotina,
    TIPO_ROTINA
} from "./rotinas-service.js";

import {
    obterBaseDados,
    TIPO_BASE_DADOS
} from "./banco-dados-service.js";


document.addEventListener("DOMContentLoaded", iniciarDashboard);


async function iniciarDashboard() {
    try {
        const [devolucoes, demandas, rotinas, basePagamentos] = await Promise.all([
            listarDevolucoes(),
            listarDemandas(),
            listarRotinas(),
            obterBaseDados(TIPO_BASE_DADOS.PAGAMENTOS_PROJETOS)
        ]);

        atualizarCardsResumo(devolucoes);
        atualizarConferenciaDiaria(rotinas);
        atualizarPendenciasRecentes(demandas, rotinas);
        atualizarPagamentosDoAno(basePagamentos);
    } catch (erro) {
        console.error(
            "Não foi possível carregar os dados do Dashboard:",
            erro
        );
    }
}


/* =========================================================
   1. CARDS DE RESUMO
   ========================================================= */

function atualizarCardsResumo(devolucoes) {
    const pendentesPorStatus = contarPorStatus(devolucoes);

    definirTexto(
        "possiveisDevolucoes",
        String(
            (
                pendentesPorStatus[
                    STATUS_PROCESSO_STORAGE.AGUARDANDO_CONFIRMACAO
                ]
                || 0
            )
        )
    );

    definirTexto(
        "aguardandoProjeto",
        String(
            (
                pendentesPorStatus[
                    STATUS_PROCESSO_STORAGE.AGUARDANDO_PROJETO
                ]
                || 0
            )
        )
    );

    definirTexto(
        "valorDevolvidoMes",
        formatarMoeda(
            somarValorConcluidasNoMesAtual(devolucoes)
        )
    );
}


function contarPorStatus(devolucoes) {
    return devolucoes.reduce(
        function (resultado, devolucao) {
            const status = devolucao.statusProcesso;

            resultado[status] = (resultado[status] || 0) + 1;

            return resultado;
        },
        {}
    );
}


function somarValorConcluidasNoMesAtual(devolucoes) {
    const agora = new Date();

    return devolucoes
        .filter(function (devolucao) {
            if (
                devolucao.statusProcesso
                !== STATUS_PROCESSO_STORAGE.CONCLUIDA
            ) {
                return false;
            }

            if (!devolucao.dataConclusao) {
                return false;
            }

            const dataConclusao = new Date(
                devolucao.dataConclusao
            );

            return (
                dataConclusao.getFullYear() === agora.getFullYear()
                && dataConclusao.getMonth() === agora.getMonth()
            );
        })
        .reduce(
            function (total, devolucao) {
                return total + (
                    Number.isFinite(devolucao.valor)
                        ? devolucao.valor
                        : 0
                );
            },
            0
        );
}


/* =========================================================
   2. CONFERÊNCIA DIÁRIA (conta 45.140-1)
   ========================================================= */

function atualizarConferenciaDiaria(rotinas) {
    const listaContas = document.getElementById(
        "listaContasConferencia"
    );

    if (!listaContas) {
        return;
    }

    const itensDiarios = [
        {
            filtro: (r) => r.titulo.includes("45.140-1"),
            idStatus: "statusContaConferencia",
            idDescricao: "descricaoContaConferencia",
            textoFeito: "Extrato já consultado hoje.",
            textoPendente: "Extrato ainda não consultado hoje."
        },
        {
            filtro: (r) => r.titulo.includes("45.141-X"),
            idStatus: "statusConta2Conferencia",
            idDescricao: "descricaoConta2Conferencia",
            textoFeito: "Extrato já consultado hoje.",
            textoPendente: "Extrato ainda não consultado hoje."
        },
        {
            filtro: (r) => r.titulo.toLowerCase().includes("saldo das feapaes"),
            idStatus: "statusSaldoConferencia",
            idDescricao: "descricaoSaldoConferencia",
            textoFeito: "Saldo já consultado hoje.",
            textoPendente: "Ainda não consultado hoje."
        }
    ];

    let concluidos = 0;

    itensDiarios.forEach((item) => {
        const rotina = rotinas.find(
            (r) => r.tipo === TIPO_ROTINA.DIARIA && item.filtro(r)
        );

        if (!rotina) {
            return;
        }

        const status = calcularStatusRotina(rotina);

        if (status.concluidaNoPeriodo) {
            concluidos += 1;
        }

        atualizarItemConferencia(item, status.concluidaNoPeriodo);
    });

    definirTexto(
        "contasConferidas",
        `${concluidos} de ${itensDiarios.length}`
    );
}


function atualizarItemConferencia(item, concluidoHoje) {
    const itemStatus = document.getElementById(item.idStatus);

    const itemDescricao = document.getElementById(item.idDescricao);

    if (itemStatus) {
        itemStatus.textContent = concluidoHoje ? "Conferida" : "Pendente";

        itemStatus.className = (
            "status "
            + (concluidoHoje ? "status--completed" : "status--pending")
        );
    }

    if (itemDescricao) {
        itemDescricao.textContent = concluidoHoje
            ? item.textoFeito
            : item.textoPendente;
    }
}


/* =========================================================
   3. PENDÊNCIAS RECENTES (Demandas + Rotinas)
   ========================================================= */

function atualizarPendenciasRecentes(demandas, rotinas) {
    const painel = document.getElementById(
        "listaPendenciasRecentes"
    );

    const estadoVazio = document.getElementById(
        "estadoVazioPendencias"
    );

    if (!painel) {
        return;
    }

    const itens = [];

    demandas
        .filter(
            (d) => d.status !== STATUS_DEMANDA.CONCLUIDA
                && (
                    d.prioridade === PRIORIDADE_DEMANDA.URGENTE
                    || d.prioridade === PRIORIDADE_DEMANDA.ALTA
                )
        )
        .forEach((d) => {
            itens.push({
                titulo: d.titulo,
                origem: "Demanda",
                destaque: d.prioridade === PRIORIDADE_DEMANDA.URGENTE
            });
        });

    rotinas.forEach((r) => {
        const status = calcularStatusRotina(r);

        if (!status.concluidaNoPeriodo && status.atrasada) {
            itens.push({
                titulo: r.titulo,
                origem: "Rotina atrasada",
                destaque: true
            });
        }
    });

    painel.innerHTML = "";

    if (itens.length === 0) {
        if (estadoVazio) {
            estadoVazio.hidden = false;
        }

        return;
    }

    if (estadoVazio) {
        estadoVazio.hidden = true;
    }

    itens.slice(0, 6).forEach((item) => {
        painel.appendChild(criarLinhaPendencia(item));
    });
}


/* =========================================================
   4. PAGAMENTOS DE PROJETOS NO ANO (Banco de Dados)
   ========================================================= */

function atualizarPagamentosDoAno(basePagamentos) {
    const anoAtual = new Date().getFullYear();

    definirTexto("anoAtualPagamentos", String(anoAtual));

    if (!basePagamentos) {
        const secao = document.getElementById("secaoPagamentosAno");

        if (secao) {
            secao.innerHTML = "";

            const aviso = document.createElement("p");

            aviso.className = "form-field__message";

            aviso.innerHTML = (
                "Importe o Relatório de Pagamentos de Projetos no "
                + "<a href=\"./pages/banco-dados.html\">Banco de Dados</a> "
                + "pra ver esses números."
            );

            secao.appendChild(aviso);
        }

        return;
    }

    const pagamentosDoAno = basePagamentos.registros.filter(
        (registro) => (
            registro.data
            && new Date(registro.data).getFullYear() === anoAtual
        )
    );

    const paasDistintos = new Set(
        pagamentosDoAno.map((registro) => registro.paa)
    );

    const valorTotalAno = pagamentosDoAno.reduce(
        (total, registro) => total + (
            Number.isFinite(registro.valor) ? registro.valor : 0
        ),
        0
    );

    definirTexto("quantidadeProjetosPagosAno", String(paasDistintos.size));
    definirTexto("valorPagoAno", formatarMoeda(valorTotalAno));

    const valorPorUf = {};

    pagamentosDoAno.forEach((registro) => {
        const uf = registro.uf || "—";

        valorPorUf[uf] = (
            (valorPorUf[uf] || 0)
            + (Number.isFinite(registro.valor) ? registro.valor : 0)
        );
    });

    const ufsComPagamento = Object.entries(valorPorUf);

    if (ufsComPagamento.length === 0) {
        definirTexto("estadoQueMaisPagou", "—");
        definirTexto("estadoQueMenosPagou", "—");

        return;
    }

    const ordenadoPorValor = ufsComPagamento.sort(
        (a, b) => b[1] - a[1]
    );

    const [ufQueMaisPagou, valorQueMaisPagou] = ordenadoPorValor[0];

    const [ufQueMenosPagou, valorQueMenosPagou] = (
        ordenadoPorValor[ordenadoPorValor.length - 1]
    );

    definirTexto("estadoQueMaisPagou", ufQueMaisPagou);
    definirTexto("valorEstadoQueMaisPagou", formatarMoeda(valorQueMaisPagou));

    definirTexto("estadoQueMenosPagou", ufQueMenosPagou);
    definirTexto("valorEstadoQueMenosPagou", formatarMoeda(valorQueMenosPagou));
}


function criarLinhaPendencia(item) {
    const linha = document.createElement("div");

    linha.className = "account-item";

    const informacao = document.createElement("div");

    informacao.className = "account-item__information";

    const icone = document.createElement("span");

    icone.className = "account-item__icon";
    icone.setAttribute("aria-hidden", "true");
    icone.textContent = "!";

    const textos = document.createElement("div");

    const titulo = document.createElement("strong");

    titulo.textContent = item.titulo;

    const origem = document.createElement("span");

    origem.textContent = item.origem;

    textos.append(titulo, origem);

    informacao.append(icone, textos);

    const status = document.createElement("span");

    status.className = (
        "status "
        + (item.destaque ? "status--danger" : "status--pending")
    );

    status.textContent = item.origem;

    linha.append(informacao, status);

    return linha;
}


/* =========================================================
   5. AUXILIARES
   ========================================================= */

function definirTexto(id, texto) {
    const elemento = document.getElementById(id);

    if (elemento) {
        elemento.textContent = texto;
    }
}


function formatarMoeda(valor) {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL"
    }).format(valor || 0);
}
