"use strict";

/*
 * =========================================================
 * AZIEL — OFÍCIOS DE PENDÊNCIA EM PRESTAÇÃO DE CONTAS
 * =========================================================
 *
 * Lê o "Relatório de Prestação de Contas" exportado do Fluig
 * (um HTML disfarçado de .xls, mesmo formato de outros
 * relatórios do Fluig já usados no Aziel), lista as pendências
 * (sempre excluindo RS e RO) e gera o Ofício FNA em .docx a
 * partir do modelo oficial — preservando timbre, logos e
 * assinaturas, só substituindo os dados variáveis.
 *
 * O número do ofício (Ofício FNA nº) NÃO é gerado aqui — ele
 * vem do Fluig (Processos > Iniciar Solicitações > Protocolo),
 * já que é um número de protocolo oficial emitido pelo próprio
 * sistema. O usuário digita esse número manualmente.
 */

import {
    cadastrarPresidente,
    buscarPresidentePorUf,
    cadastrarPresidentesPadraoSeNecessario
} from "./presidentes-service.js";

import {
    marcarMesComoEnviado,
    desmarcarMes,
    listarHistoricoDoAno
} from "./historico-prestacao-service.js";

import {
    obterModeloComoArrayBuffer,
    NOME_MODELO
} from "./modelos-documentos-service.js";

const UFS_EXCLUIDAS = ["RS", "RO"];

let pendenciasCarregadas = [];
let temporizadorNotificacao = null;


document.addEventListener("DOMContentLoaded", iniciarPagina);


async function iniciarPagina() {
    exibirDataAtual();
    iniciarNotificacao();
    iniciarModalOficio();

    await cadastrarPresidentesPadraoSeNecessario();

    iniciarHistoricoAnual();

    document.getElementById("campoArquivoPendencias")
        .addEventListener("change", tratarSelecaoArquivo);

    const campoArquivoPresidentes = document.getElementById(
        "campoArquivoPresidentes"
    );

    if (campoArquivoPresidentes) {
        campoArquivoPresidentes.addEventListener(
            "change",
            tratarSelecaoArquivoPresidentes
        );
    }
}


/* =========================================================
   0-B. HISTÓRICO ANUAL
   ========================================================= */

const NOMES_MESES_ABREVIADOS = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez"
];


function iniciarHistoricoAnual() {
    const seletorAno = document.getElementById("campoAnoHistorico");

    if (!seletorAno) {
        return;
    }

    const anoAtual = new Date().getFullYear();

    for (let ano = anoAtual + 1; ano >= anoAtual - 3; ano--) {
        const opcao = document.createElement("option");

        opcao.value = String(ano);
        opcao.textContent = String(ano);

        seletorAno.appendChild(opcao);
    }

    seletorAno.value = String(anoAtual);

    seletorAno.addEventListener("change", () => {
        exibirHistoricoDoAno(Number(seletorAno.value));
    });

    exibirHistoricoDoAno(anoAtual);
}


async function exibirHistoricoDoAno(ano) {
    const grade = document.getElementById("gradeHistoricoMeses");

    if (!grade) {
        return;
    }

    const historico = await listarHistoricoDoAno(ano);

    grade.innerHTML = "";

    for (let mes = 1; mes <= 12; mes++) {
        grade.appendChild(
            criarCartaoMes(ano, mes, historico[mes] || null)
        );
    }
}


function criarCartaoMes(ano, mes, registro) {
    const enviado = Boolean(registro?.enviado);

    const cartao = document.createElement("button");

    cartao.type = "button";
    cartao.className = (
        "historico-mes"
        + (enviado ? " historico-mes--enviado" : "")
    );

    const nomeMes = document.createElement("strong");

    nomeMes.textContent = NOMES_MESES_ABREVIADOS[mes - 1];

    const status = document.createElement("span");

    status.textContent = enviado ? "Enviado" : "Pendente";

    cartao.append(nomeMes, status);

    cartao.title = enviado
        ? "Clique para desmarcar"
        : "Clique para marcar como enviado";

    cartao.addEventListener("click", async () => {
        if (enviado) {
            await desmarcarMes(ano, mes);
        } else {
            await marcarMesComoEnviado(ano, mes);
        }

        exibirHistoricoDoAno(ano);
    });

    return cartao;
}


/* =========================================================
   0. IMPORTAÇÃO DE PRESIDENTES POR UF
   ========================================================= */

async function tratarSelecaoArquivoPresidentes(evento) {
    const arquivo = evento.target.files[0];

    const status = document.getElementById(
        "statusImportacaoPresidentes"
    );

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

        const presidentes = extrairPresidentesConselho(linhas);

        if (presidentes.length === 0) {
            throw new Error(
                "Não encontrei a seção \"CONSELHO DE ADMINISTRAÇAO\" "
                + "nesse arquivo. Confira se é a planilha certa."
            );
        }

        for (const presidente of presidentes) {
            await cadastrarPresidente(presidente);
        }

        status.textContent = (
            `${presidentes.length} presidente(s) de Federação `
            + "importado(s)/atualizado(s)."
        );

        exibirNotificacao(
            "success",
            "Lista de presidentes atualizada",
            `${presidentes.length} estados atualizados.`
        );
    } catch (erro) {
        status.textContent = obterMensagemDeErro(erro);
        status.classList.add("form-field__message--danger");
    }
}


/*
 * A planilha "PLANILHA GERAL - DIRETORIA E CONSELHO" tem várias
 * seções (Diretoria, Conselho de Administração etc.) na mesma
 * aba. Aqui a gente pega só a seção "CONSELHO DE ADMINISTRAÇAO",
 * que traz um presidente por UF.
 *
 * Atenção: o título geral da planilha ("DIRETORIA EXECUTIVA,
 * CONSELHO FISCAL... E CONSELHO DE ADMINISTRAÇAO") também contém
 * essa frase como parte de um texto maior — por isso a
 * comparação é estrita (== ), não .includes(), pra não disparar
 * a leitura da seção errada, logo na primeira linha.
 */
function extrairPresidentesConselho(linhas) {
    const UF_REGEX = /^[A-Z]{2}$/;

    let dentroDaSecao = false;
    const registros = [];

    for (const linha of linhas) {
        const primeiraColuna = String(linha[0] ?? "").trim();
        const segundaColuna = String(linha[1] ?? "").trim();

        if (
            segundaColuna.toUpperCase().replace(/[ÇC]/g, "C")
            === "CONSELHO DE ADMINISTRACAO"
        ) {
            dentroDaSecao = true;
            continue;
        }

        if (!dentroDaSecao) {
            continue;
        }

        if (segundaColuna && !UF_REGEX.test(primeiraColuna)) {
            if (segundaColuna.toUpperCase() !== "NOME") {
                break;
            }

            continue;
        }

        if (!UF_REGEX.test(primeiraColuna)) {
            continue;
        }

        registros.push({
            uf: primeiraColuna,
            nome: segundaColuna,
            observacao: String(linha[2] ?? "").trim()
        });
    }

    return registros;
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
   1. IMPORTAÇÃO E EXTRAÇÃO
   ========================================================= */

async function tratarSelecaoArquivo(evento) {
    const arquivo = evento.target.files[0];

    const status = document.getElementById("statusImportacaoPendencias");

    document.getElementById("painelListaPendencias").hidden = true;

    if (!arquivo) {
        return;
    }

    status.textContent = "Lendo o arquivo...";
    status.classList.remove("form-field__message--danger");

    try {
        const buffer = await arquivo.arrayBuffer();

        const texto = new TextDecoder("iso-8859-1").decode(
            buffer
        );

        const todas = extrairPendencias(texto);

        if (todas.length === 0) {
            throw new Error(
                "Não encontrei nenhuma pendência nesse arquivo. "
                + "Confira se é o \"Relatório de Prestação de "
                + "Contas\" de verdade."
            );
        }

        pendenciasCarregadas = todas.filter(
            (p) => !UFS_EXCLUIDAS.includes(p.uf)
        );

        const excluidas = todas.length - pendenciasCarregadas.length;

        status.textContent = (
            `${pendenciasCarregadas.length} pendência(s) encontrada(s)`
            + (
                excluidas > 0
                    ? ` (${excluidas} de RS/RO foram excluídas).`
                    : "."
            )
        );

        preencherTabelaPendencias();

        document.getElementById("painelListaPendencias").hidden = false;
    } catch (erro) {
        status.textContent = obterMensagemDeErro(erro);
        status.classList.add("form-field__message--danger");
    }
}


/*
 * O relatório do Fluig vem como HTML "disfarçado" de .xls, sem
 * <tr> entre as linhas de dado — mesmo formato de outros
 * relatórios do Fluig já lidos no Aziel.
 */
function extrairPendencias(textoCompleto) {
    const pedacos = textoCompleto.split("</tr>");
    const registros = [];

    for (let i = 1; i < pedacos.length; i++) {
        const celulas = [...pedacos[i].matchAll(
            /<td[^>]*>([\s\S]*?)<\/td>/g
        )].map(
            (m) => removerTagsHtml(descodificarEntidadesHtml(m[1]))
        );

        if (celulas.length < 8) {
            continue;
        }

        const [
            instituicao, projeto, uf, parcela,
            dataPago, dataPrazo, prazo, valor
        ] = celulas;

        registros.push({
            instituicao,
            projeto,
            uf,
            parcela,
            dataPago,
            dataPrazo,
            prazo,
            valor
        });
    }

    return registros;
}


function descodificarEntidadesHtml(texto) {
    return texto
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ");
}


function removerTagsHtml(texto) {
    return texto.replace(/<[^>]*>/g, "").trim();
}


/* =========================================================
   2. LISTAGEM
   ========================================================= */

function preencherTabelaPendencias() {
    const corpoTabela = document.getElementById("tabelaPendencias");

    corpoTabela.innerHTML = "";

    pendenciasCarregadas.forEach((pendencia, indice) => {
        const tr = document.createElement("tr");

        [
            pendencia.instituicao,
            pendencia.projeto,
            pendencia.uf,
            pendencia.parcela,
            pendencia.dataPago,
            pendencia.dataPrazo,
            pendencia.valor
        ].forEach((valor) => {
            const td = document.createElement("td");

            td.textContent = valor;
            tr.appendChild(td);
        });

        const tdAcoes = document.createElement("td");

        const botaoGerar = document.createElement("button");

        botaoGerar.type = "button";
        botaoGerar.className = "button button--secondary";
        botaoGerar.textContent = "Gerar ofício";

        botaoGerar.addEventListener("click", () => {
            abrirModalOficio(pendencia, indice);
        });

        tdAcoes.appendChild(botaoGerar);
        tr.appendChild(tdAcoes);

        corpoTabela.appendChild(tr);
    });
}


/* =========================================================
   3. DERIVAÇÃO DE CAMPOS
   ========================================================= */

/*
 * Transforma "ASSOCIACAO DE PAIS E AMIGOS DOS EXCEPCIONAIS DE
 * SANTA LUZIA" em "Apae de Santa Luzia" — o usuário ainda pode
 * corrigir manualmente antes de gerar, caso o ofício precise ir
 * pra Federação do estado em vez da APAE (isso varia caso a
 * caso e não dá pra adivinhar sozinho).
 */
function gerarNomeReduzido(nomeCompleto) {
    const padroes = [
        [/^ASSOCIACAO DE PAIS E AMIGOS DOS EXCEPCIONAIS DE (.+)$/i, "Apae de "],
        [/^ASSOCIACAO DE PAIS E AMIGOS DOS EXCEPCIONAIS DO (.+)$/i, "Apae do "],
        [/^ASSOCIACAO DE PAIS E AMIGOS DOS EXCEPCIONAIS DA (.+)$/i, "Apae da "],
        [/^FEDERACAO DAS APAES DO ESTADO DE (.+)$/i, "Feapaes "],
        [/^FEDERACAO DAS APAES DO ESTADO DO (.+)$/i, "Feapaes do "],
        [/^FEDERACAO DAS APAES DO ESTADO DA (.+)$/i, "Feapaes da "]
    ];

    for (const [regex, prefixo] of padroes) {
        const correspondencia = nomeCompleto.match(regex);

        if (correspondencia) {
            return prefixo + capitalizarPalavras(correspondencia[1]);
        }
    }

    return capitalizarPalavras(nomeCompleto);
}


function capitalizarPalavras(texto) {
    return texto
        .toLowerCase()
        .split(" ")
        .map(
            (palavra) => palavra.charAt(0).toUpperCase() + palavra.slice(1)
        )
        .join(" ");
}


/*
 * O campo "Projeto" vem como "7092 - AQUISIÇÃO DE...". O ano
 * usado no "PAA/Ano" é o mesmo ano da Data de Pagamento — foi
 * assim nos exemplos reais conferidos.
 */
function extrairPaaEAno(projeto, dataPago) {
    const correspondencia = projeto.match(/^(\d+)\s*-/);
    const numero = correspondencia ? correspondencia[1] : projeto;
    const ano = dataPago.split("/")[2] || "";

    return `${numero}/${ano}`;
}


/* =========================================================
   4. MODAL DE GERAÇÃO
   ========================================================= */

function obterElementosModalOficio() {
    const modal = document.getElementById("modalOficio");

    if (!modal) {
        return null;
    }

    return {
        modal,
        formulario: document.getElementById("formOficio"),
        subtitulo: document.getElementById("subtituloModalOficio"),
        visualizacaoPaaAno: document.getElementById("visualizacaoPaaAno"),
        visualizacaoValor: document.getElementById("visualizacaoValor"),
        visualizacaoDataPagamento: document.getElementById("visualizacaoDataPagamento"),
        visualizacaoDataPrazo: document.getElementById("visualizacaoDataPrazo"),
        campoNumeroOficio: document.getElementById("campoNumeroOficio"),
        campoGenero: document.getElementById("campoGenero"),
        campoDestinatarioNome: document.getElementById("campoDestinatarioNome"),
        campoDestinatarioCargo: document.getElementById("campoDestinatarioCargo"),
        campoDestinatarioCidade: document.getElementById("campoDestinatarioCidade"),
        campoEntidadePendente: document.getElementById("campoEntidadePendente"),
        botaoFechar: document.getElementById("botaoFecharModalOficio"),
        botaoCancelar: document.getElementById("botaoCancelarOficio")
    };
}


function iniciarModalOficio() {
    const elementos = obterElementosModalOficio();

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
        await gerarEBaixarOficio(elementos);
    });
}


let pendenciaEmEdicao = null;


async function abrirModalOficio(pendencia, indice) {
    const elementos = obterElementosModalOficio();

    if (!elementos) {
        return;
    }

    pendenciaEmEdicao = pendencia;

    elementos.formulario.reset();

    const paaAno = extrairPaaEAno(pendencia.projeto, pendencia.dataPago);
    const nomeReduzido = gerarNomeReduzido(pendencia.instituicao);

    elementos.subtitulo.textContent = (
        `${nomeReduzido} — PAA ${paaAno}`
    );

    elementos.visualizacaoPaaAno.value = paaAno;
    elementos.visualizacaoValor.value = pendencia.valor;
    elementos.visualizacaoDataPagamento.value = pendencia.dataPago;
    elementos.visualizacaoDataPrazo.value = pendencia.dataPrazo;

    elementos.campoGenero.value = "masculino";
    elementos.campoDestinatarioNome.value = "";
    elementos.campoDestinatarioCargo.value = (
        `Presidente da ${nomeReduzido}/${pendencia.uf}`
    );
    elementos.campoDestinatarioCidade.value = `(${pendencia.uf})`;
    elementos.campoEntidadePendente.value = nomeReduzido;

    await exibirSugestaoPresidente(pendencia, nomeReduzido);

    elementos.modal.showModal();

    const conteudoRolavel = elementos.modal.querySelector(
        ".review-modal__content"
    );

    if (conteudoRolavel) {
        conteudoRolavel.scrollTop = 0;
    }

    /*
     * preventScroll evita que o navegador role a tela até esse
     * campo (que fica mais abaixo no formulário) — sem isso, o
     * modal parecia abrir "no meio", já rolado pra baixo.
     */
    elementos.campoDestinatarioNome.focus({
        preventScroll: true
    });
}


/*
 * Mostra um botão de sugestão pra preencher o destinatário com o
 * presidente da Federação do estado, quando a lista de
 * presidentes já foi importada e a UF é encontrada. Não substitui
 * a sugestão padrão (endereçar à própria APAE), já que às vezes
 * o ofício vai direto pra APAE e às vezes pra Federação — é uma
 * decisão que só quem está fazendo o ofício sabe caso a caso.
 */
async function exibirSugestaoPresidente(pendencia, nomeReduzido) {
    const area = document.getElementById("areaSugestaoPresidente");

    if (!area) {
        return;
    }

    area.hidden = true;
    area.innerHTML = "";

    let presidente;

    try {
        presidente = await buscarPresidentePorUf(pendencia.uf);
    } catch {
        return;
    }

    if (!presidente) {
        return;
    }

    const texto = document.createElement("span");

    texto.textContent = (
        `Presidente da Federação (${pendencia.uf}): `
        + `${presidente.nome}. `
    );

    const botao = document.createElement("button");

    botao.type = "button";
    botao.className = "button button--text";
    botao.textContent = "Usar este destinatário";

    botao.addEventListener("click", () => {
        document.getElementById("campoDestinatarioNome").value = (
            presidente.nome
        );

        document.getElementById("campoDestinatarioCargo").value = (
            `Presidente da Federação das Apaes do Estado `
            + `${nomeUfPorExtenso(pendencia.uf)}/${pendencia.uf}`
        );
    });

    area.append(texto, botao);
    area.hidden = false;
}


const NOMES_ESTADOS = {
    AC: "do Acre", AL: "de Alagoas", AP: "do Amapá", AM: "do Amazonas",
    BA: "da Bahia", CE: "do Ceará", DF: "do Distrito Federal",
    ES: "do Espírito Santo", GO: "de Goiás", MA: "do Maranhão",
    MT: "do Mato Grosso", MS: "do Mato Grosso do Sul",
    MG: "de Minas Gerais", PA: "do Pará", PB: "da Paraíba",
    PR: "do Paraná", PE: "de Pernambuco", PI: "do Piauí",
    RJ: "do Rio de Janeiro", RN: "do Rio Grande do Norte",
    RR: "de Roraima", SC: "de Santa Catarina", SP: "de São Paulo",
    SE: "de Sergipe", TO: "do Tocantins"
};


function nomeUfPorExtenso(uf) {
    return NOMES_ESTADOS[uf] || `do estado ${uf}`;
}


/* =========================================================
   5. GERAÇÃO DO DOCUMENTO
   ========================================================= */

async function gerarEBaixarOficio(elementos) {
    const status = { desabilitarBotao: true };

    const botaoGerar = document.getElementById("botaoGerarOficio");

    try {
        botaoGerar.disabled = true;
        botaoGerar.textContent = "Gerando...";

        const bufferTemplate = await obterModeloComoArrayBuffer(
            NOME_MODELO.PRESTACAO_CONTAS
        );

        if (!bufferTemplate) {
            throw new Error(
                "O modelo do Ofício de Prestação de Contas ainda não "
                + "foi importado. Vai no Banco de Dados e sobe o "
                + "arquivo .docx dele."
            );
        }

        const zip = new PizZip(bufferTemplate);

        const doc = new window.docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            delimiters: { start: "{{", end: "}}" }
        });

        const generoMasculino = (
            elementos.campoGenero.value === "masculino"
        );

        const paaAno = extrairPaaEAno(
            pendenciaEmEdicao.projeto,
            pendenciaEmEdicao.dataPago
        );

        doc.render({
            NUMERO_OFICIO: elementos.campoNumeroOficio.value.trim(),
            DATA_OFICIO_EXTENSO: formatarDataExtenso(new Date()),
            TRATAMENTO: generoMasculino ? "IImo." : "IIma.",
            SAUDACAO: generoMasculino ? "Senhor," : "Senhora,",
            DESTINATARIO_NOME: elementos.campoDestinatarioNome.value.trim(),
            DESTINATARIO_CARGO_ENTIDADE: elementos.campoDestinatarioCargo.value.trim(),
            DESTINATARIO_CIDADE_UF: elementos.campoDestinatarioCidade.value.trim(),
            ENTIDADE_PENDENTE: elementos.campoEntidadePendente.value.trim(),
            PAA_ANO: paaAno,
            DATA_PAGAMENTO: pendenciaEmEdicao.dataPago,
            DATA_PRAZO: pendenciaEmEdicao.dataPrazo,
            PARCELA: pendenciaEmEdicao.parcela,
            VALOR: pendenciaEmEdicao.valor
        });

        const blob = doc.getZip().generate({
            type: "blob",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        });

        const nomeArquivo = (
            `Oficio FNA ${elementos.campoNumeroOficio.value.trim().replace(/\//g, "-")} `
            + `- ${elementos.campoEntidadePendente.value.trim()}.docx`
        );

        baixarBlob(blob, nomeArquivo);

        elementos.modal.close();

        exibirNotificacao(
            "success",
            "Ofício gerado",
            `${nomeArquivo} foi baixado.`
        );
    } catch (erro) {
        exibirNotificacao(
            "error",
            "Não foi possível gerar o ofício",
            obterMensagemDeErro(erro)
        );
    } finally {
        botaoGerar.disabled = false;
        botaoGerar.textContent = "Gerar e baixar .docx";
    }
}


function baixarBlob(blob, nomeArquivo) {
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = nomeArquivo;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
}


const NOMES_MESES = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
];


function formatarDataExtenso(data) {
    return (
        `${String(data.getDate()).padStart(2, "0")} de `
        + `${NOMES_MESES[data.getMonth()]} de ${data.getFullYear()}`
    );
}


/* =========================================================
   6. ERROS E NOTIFICAÇÃO
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
