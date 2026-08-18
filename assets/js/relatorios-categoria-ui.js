"use strict";

/*
 * =========================================================
 * AZIEL — PÁGINA DE UMA CATEGORIA DE RELATÓRIOS
 * =========================================================
 *
 * Usado pelas três páginas de categoria (Diretoria/Gestores,
 * MDM8 e Outros) — a categoria em si vem do atributo
 * data-categoria na tag <body> de cada página, então este
 * script é o mesmo para as três.
 */

import {
    cadastrarRelatorio,
    removerRelatorio,
    listarRelatorios,
    STATUS_RELATORIO,
    ROTULOS_STATUS_RELATORIO
} from "./relatorios-service.js";


/* =========================================================
   1. ESTADO DA PÁGINA
   ========================================================= */

let temporizadorNotificacao = null;

const CLASSES_STATUS = Object.freeze({
    [STATUS_RELATORIO.NAO_AUTOMATIZADO]: "status--pending",
    [STATUS_RELATORIO.EM_DEFINICAO]: "status--review",
    [STATUS_RELATORIO.PRONTO]: "status--completed"
});


function obterCategoriaDaPagina() {
    return document.body.dataset.categoria || null;
}


/* =========================================================
   2. INICIALIZAÇÃO
   ========================================================= */

document.addEventListener("DOMContentLoaded", iniciarPaginaCategoria);


async function iniciarPaginaCategoria() {
    exibirDataAtual();
    iniciarNotificacao();
    iniciarModalRelatorio();

    const botaoAdicionar = document.getElementById(
        "botaoAdicionarRelatorio"
    );

    if (botaoAdicionar) {
        botaoAdicionar.addEventListener(
            "click",
            () => abrirModalNovoRelatorio()
        );
    }

    await atualizarLista();
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
   3. MODAL DE CRIAR/EDITAR
   ========================================================= */

function obterElementosModalRelatorio() {
    const modal = document.getElementById("modalRelatorio");

    if (!modal) {
        return null;
    }

    return {
        modal,
        formulario: document.getElementById("formRelatorio"),
        titulo: document.getElementById("tituloModalRelatorio"),
        campoId: document.getElementById("campoRelatorioId"),
        campoStatus: document.getElementById("campoRelatorioStatus"),
        campoNome: document.getElementById("campoRelatorioNome"),
        campoDescricao: document.getElementById("campoRelatorioDescricao"),
        campoObservacao: document.getElementById("campoRelatorioObservacao"),
        botaoFechar: document.getElementById("botaoFecharModalRelatorio"),
        botaoCancelar: document.getElementById("botaoCancelarRelatorio")
    };
}


function iniciarModalRelatorio() {
    const elementos = obterElementosModalRelatorio();

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
        await salvarRelatorioDoFormulario(elementos);
    });
}


function abrirModalNovoRelatorio() {
    const elementos = obterElementosModalRelatorio();

    if (!elementos) {
        return;
    }

    elementos.formulario.reset();

    elementos.titulo.textContent = "Novo relatório";
    elementos.campoId.value = "";
    elementos.campoStatus.value = STATUS_RELATORIO.NAO_AUTOMATIZADO;

    elementos.modal.showModal();
    elementos.campoNome.focus();
}


function abrirModalEditarRelatorio(relatorio) {
    const elementos = obterElementosModalRelatorio();

    if (!elementos) {
        return;
    }

    elementos.titulo.textContent = "Editar relatório";
    elementos.campoId.value = relatorio.id;
    elementos.campoStatus.value = relatorio.status;
    elementos.campoNome.value = relatorio.nome || "";
    elementos.campoDescricao.value = relatorio.descricao || "";
    elementos.campoObservacao.value = relatorio.observacao || "";

    elementos.modal.showModal();
    elementos.campoNome.focus();
}


async function salvarRelatorioDoFormulario(elementos) {
    try {
        await cadastrarRelatorio({
            id: elementos.campoId.value || undefined,
            categoria: obterCategoriaDaPagina(),
            status: elementos.campoStatus.value,
            nome: elementos.campoNome.value,
            descricao: elementos.campoDescricao.value,
            observacao: elementos.campoObservacao.value
        });

        elementos.modal.close();

        exibirNotificacao(
            "success",
            "Relatório salvo",
            `"${elementos.campoNome.value}" foi salvo.`
        );

        await atualizarLista();
    } catch (erro) {
        exibirNotificacao(
            "error",
            "Não foi possível salvar",
            obterMensagemDeErro(erro)
        );
    }
}


/* =========================================================
   4. LISTAGEM
   ========================================================= */

async function atualizarLista() {
    const relatorios = await listarRelatorios({
        categoria: obterCategoriaDaPagina()
    });

    const lista = document.getElementById("listaRelatorios");

    if (!lista) {
        return;
    }

    lista.innerHTML = "";

    if (relatorios.length === 0) {
        const vazio = document.createElement("div");

        vazio.className = "report-list__vazio";
        vazio.textContent = (
            "Nenhum relatório cadastrado ainda nessa categoria."
        );

        lista.appendChild(vazio);

        return;
    }

    relatorios.forEach((relatorio) => {
        lista.appendChild(criarCardRelatorio(relatorio));
    });
}


function criarCardRelatorio(relatorio) {
    const card = document.createElement("article");

    card.className = "report-card";

    const cabecalho = document.createElement("div");

    cabecalho.className = "report-card__header";

    const nome = document.createElement("strong");

    nome.textContent = relatorio.nome;

    const status = document.createElement("span");

    status.className = (
        "status "
        + (CLASSES_STATUS[relatorio.status] || "status--pending")
    );

    status.textContent = (
        ROTULOS_STATUS_RELATORIO[relatorio.status] || "Ainda manual"
    );

    cabecalho.append(nome, status);

    const descricao = document.createElement("p");

    descricao.textContent = (
        relatorio.descricao || "Sem descrição ainda."
    );

    const acoes = document.createElement("div");

    acoes.className = "report-card__actions";

    const botaoEditar = document.createElement("button");

    botaoEditar.type = "button";
    botaoEditar.className = "button button--text";
    botaoEditar.textContent = "Editar";

    botaoEditar.addEventListener("click", () => {
        abrirModalEditarRelatorio(relatorio);
    });

    const botaoRemover = document.createElement("button");

    botaoRemover.type = "button";
    botaoRemover.className = "button button--text";
    botaoRemover.textContent = "Remover";

    botaoRemover.addEventListener("click", async () => {
        await confirmarRemocaoRelatorio(relatorio);
    });

    acoes.append(botaoEditar, botaoRemover);

    card.append(cabecalho, descricao, acoes);

    return card;
}


async function confirmarRemocaoRelatorio(relatorio) {
    const confirmado = window.confirm(
        `Remover "${relatorio.nome}"?`
    );

    if (!confirmado) {
        return;
    }

    try {
        await removerRelatorio(relatorio.id);

        exibirNotificacao(
            "success",
            "Relatório removido",
            `"${relatorio.nome}" foi removido.`
        );

        await atualizarLista();
    } catch (erro) {
        exibirNotificacao(
            "error",
            "Não foi possível remover",
            obterMensagemDeErro(erro)
        );
    }
}


/* =========================================================
   5. NOTIFICAÇÃO
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
