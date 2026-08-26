"use strict";

/*
 * =========================================================
 * AZIEL — ACOMPANHAMENTO DE SALDO DAS FEAPAES
 * =========================================================
 *
 * Lê o "Relatório de Saldo de Entidades" (Todas), exportado do
 * Fluig, guarda o retrato do dia (usando a data de "Gerado em:"
 * do próprio arquivo, não a data do computador) e compara
 * automaticamente com o retrato mais recente anterior.
 */

import {
    salvarSnapshotDoDia,
    obterSnapshotAnteriorA,
    compararComAnterior
} from "./saldo-entidades-service.js";

import {
    garantirRotinaPresente,
    marcarRotinaComoConcluida,
    listarRotinas,
    TIPO_ROTINA
} from "./rotinas-service.js";

let temporizadorNotificacao = null;


document.addEventListener("DOMContentLoaded", iniciarPagina);


function iniciarPagina() {
    exibirDataAtual();
    iniciarNotificacao();

    document.getElementById("campoArquivoSaldo")
        .addEventListener("change", tratarSelecaoArquivo);
}


function exibirDataAtual() {
    const elemento = document.getElementById("dataAtual");

    if (!elemento) {
        return;
    }

    const formatador = new Intl.DateTimeFormat("pt-BR", {
        weekday: "long", day: "2-digit", month: "long", year: "numeric"
    });

    const texto = formatador.format(new Date());

    elemento.textContent = texto.charAt(0).toUpperCase() + texto.slice(1);
}


/* =========================================================
   1. LEITURA DO ARQUIVO
   ========================================================= */

async function tratarSelecaoArquivo(evento) {
    const arquivo = evento.target.files[0];

    const status = document.getElementById("statusSaldo");

    document.getElementById("painelResultadoSaldo").hidden = true;

    if (!arquivo) {
        return;
    }

    status.textContent = "Lendo o arquivo...";
    status.classList.remove("form-field__message--danger");

    try {
        const buffer = await arquivo.arrayBuffer();

        const workbook = XLSX.read(buffer, { type: "array" });

        const planilha = workbook.Sheets[workbook.SheetNames[0]];

        const linhas = XLSX.utils.sheet_to_json(planilha, {
            header: 1,
            raw: true
        });

        const dataGeracao = extrairDataGeracao(linhas);

        if (!dataGeracao) {
            throw new Error(
                "Não encontrei a data de \"Gerado em:\" nesse arquivo. "
                + "Confira se é o \"Relatório de Saldo de Entidades\" "
                + "de verdade."
            );
        }

        const registrosHoje = extrairSaldos(linhas);

        if (registrosHoje.length === 0) {
            throw new Error(
                "Não encontrei nenhum registro de saldo nesse arquivo."
            );
        }

        const snapshotAnterior = await obterSnapshotAnteriorA(
            dataGeracao
        );

        await salvarSnapshotDoDia(dataGeracao, registrosHoje);

        const comparacao = compararComAnterior(
            registrosHoje,
            snapshotAnterior ? snapshotAnterior.registros : []
        );

        status.classList.remove("form-field__message--danger");

        status.textContent = (
            `${registrosHoje.length} entidade(s) salvas pra `
            + `${formatarDataBr(dataGeracao)}.`
        );

        exibirResultado(
            comparacao,
            dataGeracao,
            snapshotAnterior ? snapshotAnterior.data : null
        );

        // Marca a rotina diária como feita automaticamente, já
        // que subir o arquivo aqui É a tarefa em si.
        await garantirRotinaPresente({
            titulo: "Acompanhar saldo das Feapaes",
            tipo: TIPO_ROTINA.DIARIA
        });

        const rotinas = await listarRotinas();

        const rotinaSaldo = rotinas.find(
            (r) => r.titulo === "Acompanhar saldo das Feapaes"
        );

        if (rotinaSaldo) {
            await marcarRotinaComoConcluida(rotinaSaldo.id);
        }

        exibirNotificacao(
            "success",
            "Saldo do dia salvo",
            `Comparação com ${snapshotAnterior ? formatarDataBr(snapshotAnterior.data) : "nenhum dia anterior"} pronta.`
        );
    } catch (erro) {
        status.textContent = obterMensagemDeErro(erro);
        status.classList.add("form-field__message--danger");

        exibirNotificacao(
            "error",
            "Não foi possível processar o arquivo",
            obterMensagemDeErro(erro)
        );
    }
}


/*
 * A data de referência vem do próprio arquivo ("Gerado em:
 * DD/MM/AAAA HH:MM"), não do relógio do computador — assim o
 * retrato fica correto mesmo se o arquivo for processado um
 * pouco depois de exportado.
 */
function extrairDataGeracao(linhas) {
    for (const linha of linhas) {
        const rotulo = String(linha[0] ?? "").trim();

        if (rotulo === "Gerado em:") {
            const texto = String(linha[1] ?? "").trim();

            const correspondencia = texto.match(
                /^(\d{2})\/(\d{2})\/(\d{4})/
            );

            if (correspondencia) {
                const [, dia, mes, ano] = correspondencia;

                return `${ano}-${mes}-${dia}`;
            }
        }
    }

    return null;
}


function extrairSaldos(linhas) {
    let indiceCabecalho = -1;

    for (let i = 0; i < linhas.length; i++) {
        const textos = (linhas[i] || []).map(
            (valor) => String(valor ?? "").trim()
        );

        if (
            textos.includes("Cod Entidade")
            && textos.includes("Saldo")
        ) {
            indiceCabecalho = i;
            break;
        }
    }

    if (indiceCabecalho === -1) {
        throw new Error(
            "Não encontrei o cabeçalho esperado (\"Cod Entidade\" e "
            + "\"Saldo\")."
        );
    }

    const registros = [];

    for (let i = indiceCabecalho + 1; i < linhas.length; i++) {
        const linha = linhas[i];

        if (!linha || !linha[0]) {
            continue;
        }

        registros.push({
            codEntidade: String(linha[0]).trim(),
            nome: String(linha[1] ?? "").trim(),
            entrada: converterValor(linha[2]),
            saida: converterValor(linha[3]),
            saldo: converterValor(linha[4])
        });
    }

    return registros;
}


function converterValor(valor) {
    if (typeof valor === "number") {
        return valor;
    }

    const texto = String(valor ?? "").replace(/R\$/g, "").trim();

    if (!texto || texto.toLowerCase() === "null") {
        return 0;
    }

    const normalizado = texto.replace(/\./g, "").replace(",", ".");
    const numero = Number(normalizado);

    return Number.isFinite(numero) ? numero : 0;
}


/* =========================================================
   2. EXIBIÇÃO DO RESULTADO
   ========================================================= */

function exibirResultado(comparacao, dataHoje, dataAnterior) {
    document.getElementById("subtituloResultadoSaldo").textContent = (
        dataAnterior
            ? `${formatarDataBr(dataHoje)}, comparado com ${formatarDataBr(dataAnterior)}.`
            : `${formatarDataBr(dataHoje)} — ainda não há um dia anterior pra comparar.`
    );

    const saldoTotalHoje = comparacao.reduce(
        (total, r) => total + r.saldo,
        0
    );

    const variacaoTotal = comparacao.reduce(
        (total, r) => total + (r.diferenca || 0),
        0
    );

    const comDiferenca = comparacao.filter(
        (r) => r.diferenca !== null && r.diferenca !== 0
    );

    document.getElementById("resumoSaldoTotalHoje").textContent = (
        formatarMoeda(saldoTotalHoje)
    );

    document.getElementById("resumoVariacaoTotal").textContent = (
        formatarMoeda(variacaoTotal)
    );

    document.getElementById("resumoQuantidadeComDiferenca").textContent = (
        String(comDiferenca.length)
    );

    const corpoTabela = document.getElementById("tabelaSaldo");

    corpoTabela.innerHTML = "";

    const ordenados = [...comparacao].sort(
        (a, b) => Math.abs(b.diferenca || 0) - Math.abs(a.diferenca || 0)
    );

    ordenados.forEach((registro) => {
        corpoTabela.appendChild(criarLinhaSaldo(registro));
    });

    document.getElementById("painelResultadoSaldo").hidden = false;
}


function criarLinhaSaldo(registro) {
    const tr = document.createElement("tr");

    if (registro.saldoAnterior === null) {
        tr.classList.add("saldo-linha--nova");
    }

    const tdNome = document.createElement("td");

    tdNome.textContent = registro.nome;

    const tdAnterior = document.createElement("td");

    tdAnterior.textContent = registro.saldoAnterior === null
        ? "Sem histórico"
        : formatarMoeda(registro.saldoAnterior);

    const tdHoje = document.createElement("td");

    tdHoje.textContent = formatarMoeda(registro.saldo);

    const tdDiferenca = document.createElement("td");

    if (registro.diferenca === null) {
        tdDiferenca.textContent = "—";
        tdDiferenca.className = "saldo-diferenca--neutra";
    } else if (registro.diferenca === 0) {
        tdDiferenca.textContent = "Sem alteração";
        tdDiferenca.className = "saldo-diferenca--neutra";
    } else {
        const sinal = registro.diferenca > 0 ? "+" : "";

        tdDiferenca.textContent = `${sinal}${formatarMoeda(registro.diferenca)}`;
        tdDiferenca.className = registro.diferenca > 0
            ? "saldo-diferenca--positiva"
            : "saldo-diferenca--negativa";
    }

    tr.append(tdNome, tdAnterior, tdHoje, tdDiferenca);

    return tr;
}


function formatarDataBr(dataIso) {
    const [ano, mes, dia] = dataIso.split("-");

    return `${dia}/${mes}/${ano}`;
}


function formatarMoeda(valor) {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL"
    }).format(valor || 0);
}


/* =========================================================
   3. ERROS E NOTIFICAÇÃO
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
