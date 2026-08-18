"use strict";

/*
 * =========================================================
 * AZIEL — QUADRO DE DEMANDAS (KANBAN)
 * =========================================================
 */

import {
    cadastrarDemanda,
    atualizarStatusDemanda,
    removerDemanda,
    listarDemandas,
    STATUS_DEMANDA,
    ROTULOS_STATUS_DEMANDA,
    ROTULOS_PRIORIDADE_DEMANDA
} from "./demandas-service.js";

let temporizadorNotificacao = null;

const IDS_LISTA_POR_STATUS = Object.freeze({
    [STATUS_DEMANDA.A_FAZER]: "listaAFazer",
    [STATUS_DEMANDA.EM_ANDAMENTO]: "listaEmAndamento",
    [STATUS_DEMANDA.AGUARDANDO]: "listaAguardando",
    [STATUS_DEMANDA.CONCLUIDA]: "listaConcluida"
});

const IDS_CONTADOR_POR_STATUS = Object.freeze({
    [STATUS_DEMANDA.A_FAZER]: "contadorAFazer",
    [STATUS_DEMANDA.EM_ANDAMENTO]: "contadorEmAndamento",
    [STATUS_DEMANDA.AGUARDANDO]: "contadorAguardando",
    [STATUS_DEMANDA.CONCLUIDA]: "contadorConcluida"
});

/*
 * Ordem de progressão do quadro — usada pelos botões "← Voltar"
 * e "Avançar →" de cada card.
 */
const SEQUENCIA_STATUS = [
    STATUS_DEMANDA.A_FAZER,
    STATUS_DEMANDA.EM_ANDAMENTO,
    STATUS_DEMANDA.AGUARDANDO,
    STATUS_DEMANDA.CONCLUIDA
];


document.addEventListener("DOMContentLoaded", iniciarPaginaDemandas);


async function iniciarPaginaDemandas() {
    exibirDataAtual();
    iniciarNotificacao();
    iniciarModalDemanda();

    document.getElementById("botaoNovaDemanda")
        .addEventListener("click", () => abrirModalNovaDemanda());

    await atualizarQuadro();
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
   1. MODAL DE CRIAR/EDITAR
   ========================================================= */

function obterElementosModalDemanda() {
    const modal = document.getElementById("modalDemanda");

    if (!modal) {
        return null;
    }

    return {
        modal,
        formulario: document.getElementById("formDemanda"),
        titulo: document.getElementById("tituloModalDemanda"),
        campoId: document.getElementById("campoDemandaId"),
        campoTitulo: document.getElementById("campoDemandaTitulo"),
        campoPrioridade: document.getElementById("campoDemandaPrioridade"),
        campoPrazo: document.getElementById("campoDemandaPrazo"),
        campoQuemPediu: document.getElementById("campoDemandaQuemPediu"),
        campoDependencia: document.getElementById("campoDemandaDependencia"),
        campoProximaAcao: document.getElementById("campoDemandaProximaAcao"),
        campoDescricao: document.getElementById("campoDemandaDescricao"),
        botaoFechar: document.getElementById("botaoFecharModalDemanda"),
        botaoCancelar: document.getElementById("botaoCancelarDemanda")
    };
}


function iniciarModalDemanda() {
    const elementos = obterElementosModalDemanda();

    if (!elementos) {
        return;
    }

    elementos.botaoFechar.addEventListener("click", () => {
        elementos.modal.close();
    });

    elementos.botaoCancelar.addEventListener("click", () => {
        elementos.modal.close();
    });

    elementos.formulario.addEventListener("submit", async (evento) => {
        evento.preventDefault();
        await salvarDemandaDoFormulario(elementos);
    });
}


function abrirModalNovaDemanda(statusInicial = STATUS_DEMANDA.A_FAZER) {
    const elementos = obterElementosModalDemanda();

    if (!elementos) {
        return;
    }

    elementos.formulario.reset();

    elementos.titulo.textContent = "Nova demanda";
    elementos.campoId.value = "";
    elementos.campoId.dataset.status = statusInicial;
    elementos.campoPrioridade.value = "media";

    elementos.modal.showModal();
    elementos.campoTitulo.focus();
}


function abrirModalEditarDemanda(demanda) {
    const elementos = obterElementosModalDemanda();

    if (!elementos) {
        return;
    }

    elementos.titulo.textContent = "Editar demanda";
    elementos.campoId.value = demanda.id;
    elementos.campoId.dataset.status = demanda.status;
    elementos.campoTitulo.value = demanda.titulo || "";
    elementos.campoPrioridade.value = demanda.prioridade || "media";
    elementos.campoPrazo.value = demanda.prazo || "";
    elementos.campoQuemPediu.value = demanda.quemPediu || "";
    elementos.campoDependencia.value = demanda.dependencia || "";
    elementos.campoProximaAcao.value = demanda.proximaAcao || "";
    elementos.campoDescricao.value = demanda.descricao || "";

    elementos.modal.showModal();
    elementos.campoTitulo.focus();
}


async function salvarDemandaDoFormulario(elementos) {
    try {
        await cadastrarDemanda({
            id: elementos.campoId.value || undefined,
            status: elementos.campoId.dataset.status || STATUS_DEMANDA.A_FAZER,
            titulo: elementos.campoTitulo.value,
            prioridade: elementos.campoPrioridade.value,
            prazo: elementos.campoPrazo.value,
            quemPediu: elementos.campoQuemPediu.value,
            dependencia: elementos.campoDependencia.value,
            proximaAcao: elementos.campoProximaAcao.value,
            descricao: elementos.campoDescricao.value
        });

        elementos.modal.close();

        exibirNotificacao(
            "success",
            "Demanda salva",
            `"${elementos.campoTitulo.value}" foi salva.`
        );

        await atualizarQuadro();
    } catch (erro) {
        exibirNotificacao(
            "error",
            "Não foi possível salvar",
            obterMensagemDeErro(erro)
        );
    }
}


/* =========================================================
   2. QUADRO
   ========================================================= */

async function atualizarQuadro() {
    const todas = await listarDemandas();

    Object.values(STATUS_DEMANDA).forEach((status) => {
        const daColuna = todas.filter((d) => d.status === status);

        preencherColuna(status, daColuna);

        document.getElementById(
            IDS_CONTADOR_POR_STATUS[status]
        ).textContent = String(daColuna.length);
    });
}


function preencherColuna(status, demandas) {
    const lista = document.getElementById(
        IDS_LISTA_POR_STATUS[status]
    );

    if (!lista) {
        return;
    }

    lista.innerHTML = "";

    if (demandas.length === 0) {
        const vazio = document.createElement("div");

        vazio.className = "kanban-column__vazio";
        vazio.textContent = "Nada por aqui.";

        lista.appendChild(vazio);

        return;
    }

    demandas.forEach((demanda) => {
        lista.appendChild(criarCardDemanda(demanda));
    });
}


function criarCardDemanda(demanda) {
    const card = document.createElement("article");

    card.className = `kanban-card kanban-card--${demanda.prioridade}`;

    const titulo = document.createElement("span");

    titulo.className = "kanban-card__titulo";
    titulo.textContent = demanda.titulo;

    card.appendChild(titulo);

    const badges = document.createElement("div");

    badges.className = "kanban-card__badges";

    const badgePrioridade = document.createElement("span");

    badgePrioridade.className = "status status--pending";
    badgePrioridade.textContent = (
        ROTULOS_PRIORIDADE_DEMANDA[demanda.prioridade] || "Média"
    );

    badges.appendChild(badgePrioridade);

    if (demanda.prazo) {
        const vencido = (
            demanda.status !== STATUS_DEMANDA.CONCLUIDA
            && estaVencido(demanda.prazo)
        );

        const badgePrazo = document.createElement("span");

        badgePrazo.className = (
            "kanban-card__prazo"
            + (vencido ? " kanban-card__prazo--vencido" : "")
        );

        badgePrazo.textContent = (
            (vencido ? "Vencido: " : "Prazo: ")
            + formatarDataBr(demanda.prazo)
        );

        badges.appendChild(badgePrazo);
    }

    card.appendChild(badges);

    if (demanda.proximaAcao) {
        card.appendChild(
            criarLinhaCard("Próxima ação", demanda.proximaAcao)
        );
    }

    if (demanda.quemPediu) {
        card.appendChild(
            criarLinhaCard("Pedido por", demanda.quemPediu)
        );
    }

    if (demanda.dependencia) {
        card.appendChild(
            criarLinhaCard("Depende de", demanda.dependencia)
        );
    }

    const acoes = document.createElement("div");

    acoes.className = "kanban-card__acoes";

    const indiceAtual = SEQUENCIA_STATUS.indexOf(demanda.status);

    if (indiceAtual > 0) {
        const botaoVoltar = document.createElement("button");

        botaoVoltar.type = "button";
        botaoVoltar.className = "button button--text";
        botaoVoltar.textContent = "← Voltar";

        botaoVoltar.addEventListener("click", () => {
            moverDemanda(
                demanda,
                SEQUENCIA_STATUS[indiceAtual - 1]
            );
        });

        acoes.appendChild(botaoVoltar);
    }

    if (indiceAtual < SEQUENCIA_STATUS.length - 1) {
        const botaoAvancar = document.createElement("button");

        botaoAvancar.type = "button";
        botaoAvancar.className = "button button--text";
        botaoAvancar.textContent = "Avançar →";

        botaoAvancar.addEventListener("click", () => {
            moverDemanda(
                demanda,
                SEQUENCIA_STATUS[indiceAtual + 1]
            );
        });

        acoes.appendChild(botaoAvancar);
    }

    const botaoEditar = document.createElement("button");

    botaoEditar.type = "button";
    botaoEditar.className = "button button--text";
    botaoEditar.textContent = "Editar";

    botaoEditar.addEventListener("click", () => {
        abrirModalEditarDemanda(demanda);
    });

    acoes.appendChild(botaoEditar);

    const botaoRemover = document.createElement("button");

    botaoRemover.type = "button";
    botaoRemover.className = "button button--text";
    botaoRemover.textContent = "Remover";

    botaoRemover.addEventListener("click", async () => {
        await confirmarRemocaoDemanda(demanda);
    });

    acoes.appendChild(botaoRemover);

    card.appendChild(acoes);

    return card;
}


function criarLinhaCard(rotulo, valor) {
    const p = document.createElement("p");

    p.className = "kanban-card__linha";

    p.innerHTML = `<strong>${rotulo}:</strong> `;
    p.append(valor);

    return p;
}


function estaVencido(prazoTexto) {
    const prazo = new Date(`${prazoTexto}T23:59:59`);

    return prazo.getTime() < Date.now();
}


function formatarDataBr(prazoTexto) {
    const [ano, mes, dia] = prazoTexto.split("-");

    return `${dia}/${mes}/${ano}`;
}


async function moverDemanda(demanda, novoStatus) {
    try {
        await atualizarStatusDemanda(demanda.id, novoStatus);

        await atualizarQuadro();
    } catch (erro) {
        exibirNotificacao(
            "error",
            "Não foi possível mover a demanda",
            obterMensagemDeErro(erro)
        );
    }
}


async function confirmarRemocaoDemanda(demanda) {
    const confirmado = window.confirm(
        `Remover "${demanda.titulo}"?`
    );

    if (!confirmado) {
        return;
    }

    try {
        await removerDemanda(demanda.id);

        exibirNotificacao(
            "success",
            "Demanda removida",
            `"${demanda.titulo}" foi removida.`
        );

        await atualizarQuadro();
    } catch (erro) {
        exibirNotificacao(
            "error",
            "Não foi possível remover",
            obterMensagemDeErro(erro)
        );
    }
}


/* =========================================================
   3. NOTIFICAÇÃO
   ========================================================= */

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


function obterMensagemDeErro(erro) {
    if (erro && typeof erro.message === "string") {
        return erro.message;
    }

    return "Não foi possível concluir a operação. Tente novamente.";
}
