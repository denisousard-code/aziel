"use strict";

/*
 * =========================================================
 * AZIEL — INTERFACE DA PÁGINA DE ENTIDADES
 * =========================================================
 *
 * Responsabilidades:
 *
 * - exibir, filtrar e remover entidades cadastradas;
 * - cadastrar entidades manualmente através do formulário;
 * - importar entidades em massa a partir de um CSV colado ou
 *   selecionado como arquivo;
 * - exibir o relatório de importação (quantas foram importadas,
 *   atualizadas ou tiveram erro).
 *
 * Este arquivo cuida apenas da interface. Toda a lógica de
 * armazenamento, validação e importação está em
 * entity-service.js — este arquivo só chama as funções de lá
 * e atualiza a tela.
 */

import {
    cadastrarEntidade,
    removerEntidade,
    listarEntidades,
    importarEntidadesCsv,
    gerarModeloCsvEntidades,
    TIPOS_ENTIDADE
} from "./entity-service.js";


/* =========================================================
   1. ESTADO DA PÁGINA
   ========================================================= */

let temporizadorNotificacao = null;


/* =========================================================
   2. INICIALIZAÇÃO
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    iniciarPaginaEntidades
);


async function iniciarPaginaEntidades() {
    exibirDataAtual();
    iniciarNotificacao();
    iniciarFormularioCadastro();
    iniciarImportacaoCsv();
    iniciarFiltrosListagem();

    await atualizarListagemEIndicadores();
}


/* =========================================================
   3. DATA DO CABEÇALHO
   ========================================================= */

function exibirDataAtual() {
    const elementoData = document.getElementById(
        "dataAtual"
    );

    if (!elementoData) {
        return;
    }

    const formatador = new Intl.DateTimeFormat(
        "pt-BR",
        {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric"
        }
    );

    const texto = formatador.format(new Date());

    elementoData.textContent = (
        texto.charAt(0).toUpperCase() + texto.slice(1)
    );
}


/* =========================================================
   4. CADASTRO MANUAL
   ========================================================= */

function iniciarFormularioCadastro() {
    const formulario = document.getElementById(
        "formCadastroEntidade"
    );

    if (!formulario) {
        return;
    }

    formulario.addEventListener(
        "submit",
        async function (evento) {
            evento.preventDefault();

            await salvarEntidadeDoFormulario(
                formulario
            );
        }
    );
}


async function salvarEntidadeDoFormulario(formulario) {
    const dados = {
        cnpj: valorDoCampo("campoCnpjEntidade"),
        nome: valorDoCampo("campoNomeEntidade"),
        nomeReduzido: valorDoCampo("campoNomeReduzidoEntidade"),
        tipo: valorDoCampo("campoTipoEntidade"),
        uf: valorDoCampo("campoUfEntidade"),
        situacao: valorDoCampo("campoSituacaoEntidade"),

        contasBancarias: [
            {
                banco: valorDoCampo("campoBancoEntidade"),
                agencia: valorDoCampo("campoAgenciaEntidade"),
                conta: valorDoCampo("campoContaEntidade")
            }
        ]
    };

    try {
        const entidadeSalva = await cadastrarEntidade(
            dados
        );

        exibirNotificacao(
            "success",
            "Entidade salva",
            `${entidadeSalva.nomeReduzido} foi cadastrada na base de entidades.`
        );

        formulario.reset();

        /*
         * O <select> de tipo não tem um valor padrão vazio,
         * então o reset() sozinho pode deixá-lo numa opção
         * diferente da esperada — garantimos "apae" de novo.
         */
        document.getElementById(
            "campoTipoEntidade"
        ).value = "apae";

        await atualizarListagemEIndicadores();
    } catch (erro) {
        exibirNotificacao(
            "error",
            "Não foi possível salvar",
            obterMensagemErro(erro)
        );
    }
}


function valorDoCampo(id) {
    const campo = document.getElementById(id);

    return campo
        ? campo.value.trim()
        : "";
}


/* =========================================================
   5. IMPORTAÇÃO EM MASSA
   ========================================================= */

function iniciarImportacaoCsv() {
    const botaoImportar = document.getElementById(
        "botaoImportarCsv"
    );

    const botaoModelo = document.getElementById(
        "botaoBaixarModeloCsv"
    );

    const campoArquivo = document.getElementById(
        "campoArquivoCsvEntidades"
    );

    if (botaoImportar) {
        botaoImportar.addEventListener(
            "click",
            executarImportacaoCsv
        );
    }

    if (botaoModelo) {
        botaoModelo.addEventListener(
            "click",
            baixarModeloCsv
        );
    }

    /*
     * Selecionar um arquivo já carrega o conteúdo na área de
     * texto, para o usuário poder conferir (ou ajustar) antes
     * de confirmar a importação.
     */
    if (campoArquivo) {
        campoArquivo.addEventListener(
            "change",
            async function () {
                const arquivo = campoArquivo.files[0];

                if (!arquivo) {
                    return;
                }

                const botaoImportar = document.getElementById(
                    "botaoImportarCsv"
                );

                botaoImportar.disabled = true;
                botaoImportar.textContent = "Lendo arquivo...";

                try {
                    const texto = await arquivo.text();

                    document.getElementById(
                        "campoTextoCsvEntidades"
                    ).value = texto;

                    if (pareceHtmlOuNaoCsv(texto)) {
                        exibirNotificacao(
                            "error",
                            "Este arquivo não parece ser um CSV",
                            `"${arquivo.name}" parece ser o relatório bruto exportado do Fluig (HTML), não o CSV. Use o arquivo "entidades-apaes-federacoes.csv" (ou outro CSV gerado a partir dele).`
                        );
                    }
                } catch (erro) {
                    exibirNotificacao(
                        "error",
                        "Não foi possível ler o arquivo",
                        obterMensagemErro(erro)
                    );
                } finally {
                    botaoImportar.disabled = false;
                    botaoImportar.textContent = "Importar entidades";
                }
            }
        );
    }
}


/*
 * Verificação simples para pegar o erro mais comum: o usuário
 * selecionar o relatório bruto do Fluig (que é HTML, não CSV)
 * em vez do CSV já convertido.
 */
function pareceHtmlOuNaoCsv(texto) {
    const inicio = texto.trim().slice(0, 200).toLowerCase();

    return (
        inicio.startsWith("<")
        || inicio.includes("<table")
        || inicio.includes("<!doctype")
        || inicio.includes("<html")
    );
}


async function executarImportacaoCsv() {
    const texto = document.getElementById(
        "campoTextoCsvEntidades"
    ).value.trim();

    if (!texto) {
        exibirNotificacao(
            "warning",
            "Nenhum CSV informado",
            "Cole o conteúdo do CSV ou selecione um arquivo antes de importar."
        );

        return;
    }

    if (pareceHtmlOuNaoCsv(texto)) {
        exibirNotificacao(
            "error",
            "Este conteúdo não parece ser um CSV",
            "Parece ser HTML (por exemplo, o relatório bruto exportado do Fluig), não um CSV. Use o arquivo \"entidades-apaes-federacoes.csv\" ou gere um CSV a partir da sua fonte antes de importar."
        );

        return;
    }

    const separadorSelecionado = document.getElementById(
        "campoSeparadorCsv"
    ).value;

    const separador = separadorSelecionado === "tab"
        ? "\t"
        : separadorSelecionado;

    try {
        const relatorio = await importarEntidadesCsv(
            texto,
            { separador }
        );

        exibirRelatorioImportacao(
            relatorio
        );

        if (relatorio.importadas + relatorio.atualizadas > 0) {
            exibirNotificacao(
                "success",
                "Importação concluída",
                `${relatorio.importadas} nova(s) e ${relatorio.atualizadas} atualizada(s).`
            );
        } else {
            exibirNotificacao(
                "warning",
                "Nenhuma entidade importada",
                "Confira o relatório abaixo para ver o motivo."
            );
        }

        await atualizarListagemEIndicadores();
    } catch (erro) {
        exibirNotificacao(
            "error",
            "Falha na importação",
            obterMensagemErro(erro)
        );
    }
}


function exibirRelatorioImportacao(relatorio) {
    const painel = document.getElementById(
        "relatorioImportacao"
    );

    if (!painel) {
        return;
    }

    const semErros = relatorio.invalidas.length === 0;

    painel.classList.toggle(
        "import-report--empty",
        semErros
    );

    const listaErros = relatorio.invalidas
        .map(function (item) {
            return `<li>Linha ${item.linha}: ${item.motivo}</li>`;
        })
        .join("");

    painel.innerHTML = `
        <p class="import-report__title">
            Resultado da importação
        </p>

        <div class="import-report__summary">
            <span>Linhas processadas: <strong>${relatorio.totalLinhas}</strong></span>
            <span>Novas: <strong>${relatorio.importadas}</strong></span>
            <span>Atualizadas: <strong>${relatorio.atualizadas}</strong></span>
            <span>Com erro: <strong>${relatorio.invalidas.length}</strong></span>
        </div>

        ${
            semErros
                ? ""
                : `<ul class="import-report__errors">${listaErros}</ul>`
        }
    `;

    painel.hidden = false;
}


function baixarModeloCsv() {
    const conteudo = gerarModeloCsvEntidades();

    const arquivo = new Blob(
        [conteudo],
        { type: "text/csv;charset=utf-8" }
    );

    const url = URL.createObjectURL(arquivo);

    const link = document.createElement("a");

    link.href = url;
    link.download = "modelo-entidades-aziel.csv";

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
}


/* =========================================================
   6. LISTAGEM E FILTROS
   ========================================================= */

function iniciarFiltrosListagem() {
    [
        "filtroTipoEntidade",
        "filtroUfEntidade",
        "filtroTextoEntidade"
    ].forEach(function (id) {
        const campo = document.getElementById(id);

        if (!campo) {
            return;
        }

        campo.addEventListener(
            "input",
            atualizarListagemEIndicadores
        );

        campo.addEventListener(
            "change",
            atualizarListagemEIndicadores
        );
    });
}


async function atualizarListagemEIndicadores() {
    const tipoFiltro = document.getElementById(
        "filtroTipoEntidade"
    ).value;

    const ufFiltro = document.getElementById(
        "filtroUfEntidade"
    ).value.trim();

    const textoFiltro = document.getElementById(
        "filtroTextoEntidade"
    ).value.trim().toLowerCase();

    let entidades;

    try {
        entidades = await listarEntidades({
            tipo: tipoFiltro || null,
            uf: ufFiltro || null
        });
    } catch (erro) {
        exibirNotificacao(
            "error",
            "Não foi possível carregar as entidades",
            obterMensagemErro(erro)
        );

        return;
    }

    const entidadesFiltradas = textoFiltro
        ? entidades.filter(function (entidade) {
            return (
                entidade.nome.toLowerCase().includes(textoFiltro)
                || entidade.nomeReduzido.toLowerCase().includes(textoFiltro)
                || entidade.cnpj.includes(textoFiltro.replace(/\D/g, ""))
            );
        })
        : entidades;

    preencherTabela(entidadesFiltradas);
    await atualizarIndicadores();
}


function preencherTabela(entidades) {
    const corpoTabela = document.getElementById(
        "tabelaEntidades"
    );

    if (!corpoTabela) {
        return;
    }

    corpoTabela.innerHTML = "";

    if (entidades.length === 0) {
        const linha = document.createElement("tr");
        const celula = document.createElement("td");

        celula.colSpan = 7;
        celula.className = "data-table__empty";

        celula.textContent = (
            "Nenhuma entidade cadastrada ainda. Cadastre manualmente "
            + "acima ou importe um CSV."
        );

        linha.appendChild(celula);
        corpoTabela.appendChild(linha);

        return;
    }

    entidades
        .sort(function (a, b) {
            return a.nomeReduzido.localeCompare(
                b.nomeReduzido,
                "pt-BR"
            );
        })
        .forEach(function (entidade) {
            corpoTabela.appendChild(
                criarLinhaEntidade(entidade)
            );
        });
}


function criarLinhaEntidade(entidade) {
    const linha = document.createElement("tr");

    adicionarCelula(linha, entidade.nomeReduzido);
    adicionarCelula(linha, entidade.cnpjFormatado || "—");
    adicionarCelula(linha, rotuloTipo(entidade.tipo));
    adicionarCelula(linha, entidade.uf || "—");
    adicionarCelula(linha, entidade.situacao || "—");

    const primeiraConta = entidade.contasBancarias[0];

    adicionarCelula(
        linha,
        primeiraConta
            ? `Ag. ${primeiraConta.agencia || "—"} / Cc. ${primeiraConta.conta || "—"}`
            : "—"
    );

    const celulaAcoes = document.createElement("td");

    const botaoRemover = document.createElement("button");

    botaoRemover.type = "button";
    botaoRemover.className = "button button--text entity-table__remove";
    botaoRemover.textContent = "Remover";

    botaoRemover.addEventListener(
        "click",
        async function () {
            await confirmarRemocaoEntidade(
                entidade
            );
        }
    );

    celulaAcoes.appendChild(botaoRemover);
    linha.appendChild(celulaAcoes);

    return linha;
}


async function confirmarRemocaoEntidade(entidade) {
    const confirmado = window.confirm(
        `Remover "${entidade.nomeReduzido}" da base de entidades?`
    );

    if (!confirmado) {
        return;
    }

    try {
        await removerEntidade(entidade.cnpj);

        exibirNotificacao(
            "success",
            "Entidade removida",
            `${entidade.nomeReduzido} foi removida da base.`
        );

        await atualizarListagemEIndicadores();
    } catch (erro) {
        exibirNotificacao(
            "error",
            "Não foi possível remover",
            obterMensagemErro(erro)
        );
    }
}


function adicionarCelula(linha, texto) {
    const celula = document.createElement("td");

    celula.textContent = texto;
    linha.appendChild(celula);
}


function rotuloTipo(tipo) {
    const rotulos = {
        [TIPOS_ENTIDADE.APAE]: "APAE",
        [TIPOS_ENTIDADE.FEDERACAO]: "Federação",
        [TIPOS_ENTIDADE.OUTRA]: "Outra"
    };

    return rotulos[tipo] || "Outra";
}


/* =========================================================
   7. INDICADORES
   ========================================================= */

async function atualizarIndicadores() {
    const todas = await listarEntidades();

    const totalApaes = todas.filter(
        (e) => e.tipo === TIPOS_ENTIDADE.APAE
    ).length;

    const totalFederacoes = todas.filter(
        (e) => e.tipo === TIPOS_ENTIDADE.FEDERACAO
    ).length;

    const totalComContaBancaria = todas.filter(
        (e) => e.contasBancarias.length > 0
    ).length;

    atualizarTextoPorId("totalEntidades", todas.length);
    atualizarTextoPorId("totalApaes", totalApaes);
    atualizarTextoPorId("totalFederacoes", totalFederacoes);
    atualizarTextoPorId("totalComContaBancaria", totalComContaBancaria);
}


function atualizarTextoPorId(id, valor) {
    const elemento = document.getElementById(id);

    if (elemento) {
        elemento.textContent = String(valor);
    }
}


/* =========================================================
   8. NOTIFICAÇÃO
   ========================================================= */

function iniciarNotificacao() {
    const botaoFechar = document.getElementById(
        "botaoFecharNotificacao"
    );

    if (botaoFechar) {
        botaoFechar.addEventListener(
            "click",
            fecharNotificacao
        );
    }
}


function exibirNotificacao(tipo, titulo, texto) {
    const notificacao = document.getElementById(
        "notificacaoAziel"
    );

    if (!notificacao) {
        console.log(titulo, texto);
        return;
    }

    const icone = document.getElementById(
        "iconeNotificacaoAziel"
    );

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
    const notificacao = document.getElementById(
        "notificacaoAziel"
    );

    if (!notificacao) {
        return;
    }

    notificacao.hidden = true;

    window.clearTimeout(temporizadorNotificacao);
}


/* =========================================================
   9. TRATAMENTO DE ERRO
   ========================================================= */

function obterMensagemErro(erro) {
    if (erro && typeof erro.message === "string") {
        return erro.message;
    }

    return "Não foi possível concluir a operação. Tente novamente.";
}
