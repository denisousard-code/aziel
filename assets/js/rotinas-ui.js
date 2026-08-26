"use strict";

/*
 * =========================================================
 * AZIEL — ROTINAS
 * =========================================================
 */

import {
    cadastrarRotina,
    marcarRotinaComoConcluida,
    desmarcarRotina,
    removerRotina,
    listarRotinas,
    garantirRotinaPresente,
    calcularStatusRotina,
    TIPO_ROTINA,
    ROTULOS_TIPO_ROTINA
} from "./rotinas-service.js";

let temporizadorNotificacao = null;

const IDS_LISTA_POR_TIPO = Object.freeze({
    [TIPO_ROTINA.DIARIA]: "listaDiarias",
    [TIPO_ROTINA.SEMANAL]: "listaSemanais",
    [TIPO_ROTINA.MENSAL]: "listaMensais",
    [TIPO_ROTINA.EVENTUAL]: "listaEventuais"
});

/*
 * Rotinas padrão, cadastradas automaticamente só na primeira
 * vez que a página é aberta (se ainda não houver nenhuma
 * rotina cadastrada) — evita o usuário ter que digitar essas
 * três de novo manualmente.
 */
const ROTINAS_PADRAO = [
    {
        titulo: "Atualizar planilha do ISO",
        tipo: TIPO_ROTINA.MENSAL,
        diaDoMes: 10
    },
    {
        titulo: "Fazer ofícios de prestação de contas",
        tipo: TIPO_ROTINA.MENSAL,
        diaDoMes: 10
    },
    {
        titulo: "Consultar extrato da conta 45.140-1",
        tipo: TIPO_ROTINA.DIARIA
    },
    {
        titulo: "Consultar extrato da conta 45.141-X",
        tipo: TIPO_ROTINA.DIARIA
    },
    {
        titulo: "Acompanhar saldo das Feapaes",
        tipo: TIPO_ROTINA.DIARIA
    }
];


document.addEventListener("DOMContentLoaded", iniciarPaginaRotinas);


async function iniciarPaginaRotinas() {
    exibirDataAtual();
    iniciarNotificacao();
    iniciarModalRotina();

    document.getElementById("botaoNovaRotina")
        .addEventListener("click", () => abrirModalNovaRotina());

    await cadastrarRotinasPadraoSeNecessario();

    // Adiciona esse item novo mesmo pra quem já tinha outras
    // rotinas cadastradas antes dele existir.
    await garantirRotinaPresente({
        titulo: "Acompanhar saldo das Feapaes",
        tipo: TIPO_ROTINA.DIARIA
    });

    await garantirRotinaPresente({
        titulo: "Consultar extrato da conta 45.141-X",
        tipo: TIPO_ROTINA.DIARIA
    });

    await atualizarListagem();
}


async function cadastrarRotinasPadraoSeNecessario() {
    const existentes = await listarRotinas();

    if (existentes.length > 0) {
        return;
    }

    for (const rotina of ROTINAS_PADRAO) {
        await cadastrarRotina(rotina);
    }
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

function obterElementosModalRotina() {
    const modal = document.getElementById("modalRotina");

    if (!modal) {
        return null;
    }

    return {
        modal,
        formulario: document.getElementById("formRotina"),
        titulo: document.getElementById("tituloModalRotina"),
        campoId: document.getElementById("campoRotinaId"),
        campoTitulo: document.getElementById("campoRotinaTitulo"),
        campoTipo: document.getElementById("campoRotinaTipo"),
        campoDiaDoMes: document.getElementById("campoRotinaDiaDoMes"),
        containerDiaDoMes: document.getElementById("campoDiaDoMesContainer"),
        campoDescricao: document.getElementById("campoRotinaDescricao"),
        botaoFechar: document.getElementById("botaoFecharModalRotina"),
        botaoCancelar: document.getElementById("botaoCancelarRotina")
    };
}


function iniciarModalRotina() {
    const elementos = obterElementosModalRotina();

    if (!elementos) {
        return;
    }

    elementos.botaoFechar.addEventListener("click", () => {
        elementos.modal.close();
    });

    elementos.botaoCancelar.addEventListener("click", () => {
        elementos.modal.close();
    });

    elementos.campoTipo.addEventListener("change", () => {
        atualizarVisibilidadeDiaDoMes(elementos);
    });

    elementos.formulario.addEventListener("submit", async (evento) => {
        evento.preventDefault();
        await salvarRotinaDoFormulario(elementos);
    });
}


function atualizarVisibilidadeDiaDoMes(elementos) {
    elementos.containerDiaDoMes.hidden = (
        elementos.campoTipo.value !== TIPO_ROTINA.MENSAL
    );
}


function abrirModalNovaRotina() {
    const elementos = obterElementosModalRotina();

    if (!elementos) {
        return;
    }

    elementos.formulario.reset();

    elementos.titulo.textContent = "Nova rotina";
    elementos.campoId.value = "";
    elementos.campoTipo.value = TIPO_ROTINA.MENSAL;
    elementos.campoDiaDoMes.value = "10";

    atualizarVisibilidadeDiaDoMes(elementos);

    elementos.modal.showModal();
    elementos.campoTitulo.focus();
}


function abrirModalEditarRotina(rotina) {
    const elementos = obterElementosModalRotina();

    if (!elementos) {
        return;
    }

    elementos.titulo.textContent = "Editar rotina";
    elementos.campoId.value = rotina.id;
    elementos.campoTitulo.value = rotina.titulo || "";
    elementos.campoTipo.value = rotina.tipo || TIPO_ROTINA.MENSAL;
    elementos.campoDiaDoMes.value = rotina.diaDoMes || "";
    elementos.campoDescricao.value = rotina.descricao || "";

    atualizarVisibilidadeDiaDoMes(elementos);

    elementos.modal.showModal();
    elementos.campoTitulo.focus();
}


async function salvarRotinaDoFormulario(elementos) {
    try {
        await cadastrarRotina({
            id: elementos.campoId.value || undefined,
            titulo: elementos.campoTitulo.value,
            tipo: elementos.campoTipo.value,
            diaDoMes: elementos.campoDiaDoMes.value,
            descricao: elementos.campoDescricao.value
        });

        elementos.modal.close();

        exibirNotificacao(
            "success",
            "Rotina salva",
            `"${elementos.campoTitulo.value}" foi salva.`
        );

        await atualizarListagem();
    } catch (erro) {
        exibirNotificacao(
            "error",
            "Não foi possível salvar",
            obterMensagemDeErro(erro)
        );
    }
}


/* =========================================================
   2. LISTAGEM
   ========================================================= */

async function atualizarListagem() {
    const todas = await listarRotinas();

    Object.values(TIPO_ROTINA).forEach((tipo) => {
        const daListaTipo = todas.filter((r) => r.tipo === tipo);

        preencherLista(tipo, daListaTipo);
    });
}


function preencherLista(tipo, rotinas) {
    const lista = document.getElementById(
        IDS_LISTA_POR_TIPO[tipo]
    );

    if (!lista) {
        return;
    }

    lista.innerHTML = "";

    if (rotinas.length === 0) {
        const vazio = document.createElement("div");

        vazio.className = "rotina-lista__vazio";
        vazio.textContent = "Nenhuma rotina cadastrada aqui ainda.";

        lista.appendChild(vazio);

        return;
    }

    rotinas.forEach((rotina) => {
        lista.appendChild(criarCardRotina(rotina));
    });
}


function criarCardRotina(rotina) {
    const status = calcularStatusRotina(rotina);

    const card = document.createElement("article");

    card.className = "rotina-card";

    if (status.concluidaNoPeriodo) {
        card.classList.add("rotina-card--concluida");
    } else if (status.atrasada) {
        card.classList.add("rotina-card--atrasada");
    }

    const info = document.createElement("div");

    info.className = "rotina-card__info";

    const titulo = document.createElement("span");

    titulo.className = "rotina-card__titulo";
    titulo.textContent = rotina.titulo;

    info.appendChild(titulo);

    const detalhe = document.createElement("p");

    detalhe.className = "rotina-card__detalhe";

    if (status.atrasada) {
        detalhe.classList.add("rotina-card__detalhe--atrasada");
    }

    detalhe.textContent = descreverStatus(rotina, status);

    info.appendChild(detalhe);

    if (rotina.descricao) {
        const descricao = document.createElement("p");

        descricao.className = "rotina-card__detalhe";
        descricao.textContent = rotina.descricao;

        info.appendChild(descricao);
    }

    card.appendChild(info);

    const acoes = document.createElement("div");

    acoes.className = "rotina-card__acoes";

    const botaoConcluir = document.createElement("button");

    botaoConcluir.type = "button";
    botaoConcluir.className = "button button--primary";
    botaoConcluir.textContent = status.concluidaNoPeriodo
        ? "Desmarcar"
        : "Marcar como feito";

    botaoConcluir.addEventListener("click", async () => {
        await alternarConclusaoRotina(rotina, status.concluidaNoPeriodo);
    });

    acoes.appendChild(botaoConcluir);

    const botaoEditar = document.createElement("button");

    botaoEditar.type = "button";
    botaoEditar.className = "button button--text";
    botaoEditar.textContent = "Editar";

    botaoEditar.addEventListener("click", () => {
        abrirModalEditarRotina(rotina);
    });

    acoes.appendChild(botaoEditar);

    const botaoRemover = document.createElement("button");

    botaoRemover.type = "button";
    botaoRemover.className = "button button--text";
    botaoRemover.textContent = "Remover";

    botaoRemover.addEventListener("click", async () => {
        await confirmarRemocaoRotina(rotina);
    });

    acoes.appendChild(botaoRemover);

    card.appendChild(acoes);

    return card;
}


function descreverStatus(rotina, status) {
    if (status.concluidaNoPeriodo) {
        if (rotina.tipo === TIPO_ROTINA.DIARIA) {
            return "Feito hoje.";
        }

        if (rotina.tipo === TIPO_ROTINA.SEMANAL) {
            return "Feito esta semana.";
        }

        if (rotina.tipo === TIPO_ROTINA.MENSAL) {
            return "Feito este mês.";
        }

        return "Feito.";
    }

    if (rotina.tipo === TIPO_ROTINA.DIARIA) {
        return status.atrasada
            ? "Ainda não feito hoje."
            : "Pendente hoje.";
    }

    if (rotina.tipo === TIPO_ROTINA.MENSAL) {
        if (status.diasRestantes === null) {
            return "Pendente este mês.";
        }

        if (status.atrasada) {
            return (
                `Atrasado — venceu há `
                + `${Math.abs(status.diasRestantes)} dia(s).`
            );
        }

        if (status.diasRestantes === 0) {
            return "Vence hoje.";
        }

        return `Faltam ${status.diasRestantes} dia(s).`;
    }

    if (rotina.tipo === TIPO_ROTINA.SEMANAL) {
        return "Pendente esta semana.";
    }

    return "Pendente.";
}


async function alternarConclusaoRotina(rotina, estavaConcluida) {
    try {
        if (estavaConcluida) {
            await desmarcarRotina(rotina.id);
        } else {
            await marcarRotinaComoConcluida(rotina.id);
        }

        await atualizarListagem();
    } catch (erro) {
        exibirNotificacao(
            "error",
            "Não foi possível atualizar",
            obterMensagemDeErro(erro)
        );
    }
}


async function confirmarRemocaoRotina(rotina) {
    const confirmado = window.confirm(
        `Remover "${rotina.titulo}"?`
    );

    if (!confirmado) {
        return;
    }

    try {
        await removerRotina(rotina.id);

        exibirNotificacao(
            "success",
            "Rotina removida",
            `"${rotina.titulo}" foi removida.`
        );

        await atualizarListagem();
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
