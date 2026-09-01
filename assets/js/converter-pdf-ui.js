"use strict";

/*
 * =========================================================
 * AZIEL — CONVERTER DOCX EM PDF
 * =========================================================
 *
 * Converte um ou vários arquivos .docx em PDF, inteiramente no
 * navegador (nada é enviado pra fora do computador). Usa:
 *
 * - docx-preview: renderiza o .docx como HTML fiel ao Word
 * - html2canvas: captura essa renderização como imagem
 * - jsPDF: monta o PDF a partir das imagens capturadas
 * - JSZip: empacota todos os PDFs num .zip só, pra baixar de
 *   uma vez quando tem mais de um arquivo
 *
 * A imagem é capturada inteira (não por "página" do docx-preview
 * — isso perde conteúdo em alguns documentos) e depois fatiada
 * em pedaços do tamanho de uma página A4. Fatias praticamente em
 * branco (sobra do fim do documento) são descartadas.
 */

let temporizadorNotificacao = null;
let arquivosSelecionados = [];


document.addEventListener("DOMContentLoaded", iniciarPagina);


function iniciarPagina() {
    exibirDataAtual();
    iniciarNotificacao();

    document.getElementById("campoArquivosDocx")
        .addEventListener("change", tratarSelecaoDeArquivos);

    document.getElementById("botaoConverter")
        .addEventListener("click", converterTodosOsArquivos);
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
   1. SELEÇÃO DE ARQUIVOS
   ========================================================= */

function tratarSelecaoDeArquivos(evento) {
    arquivosSelecionados = Array.from(evento.target.files);

    const lista = document.getElementById("listaArquivosSelecionados");

    lista.innerHTML = "";

    arquivosSelecionados.forEach((arquivo) => {
        const item = document.createElement("div");

        item.className = "arquivo-selecionado-item";
        item.dataset.nomeArquivo = arquivo.name;

        const nome = document.createElement("span");

        nome.className = "arquivo-selecionado-item__nome";
        nome.textContent = arquivo.name;

        const status = document.createElement("span");

        status.className = "arquivo-selecionado-item__status";
        status.textContent = "Aguardando";

        item.append(nome, status);
        lista.appendChild(item);
    });

    document.getElementById("botaoConverter").disabled = (
        arquivosSelecionados.length === 0
    );

    document.getElementById("statusConversao").textContent = (
        arquivosSelecionados.length > 0
            ? `${arquivosSelecionados.length} arquivo(s) selecionado(s).`
            : ""
    );
}


/* =========================================================
   2. CONVERSÃO
   ========================================================= */

async function converterTodosOsArquivos() {
    const botao = document.getElementById("botaoConverter");
    const painelProgresso = document.getElementById("painelProgresso");
    const barraProgresso = document.getElementById("barraProgresso");
    const textoProgresso = document.getElementById("textoProgresso");

    botao.disabled = true;
    painelProgresso.hidden = false;

    const zip = new JSZip();
    let sucessos = 0;
    let falhas = 0;

    for (let i = 0; i < arquivosSelecionados.length; i++) {
        const arquivo = arquivosSelecionados[i];

        const percentual = Math.round(
            (i / arquivosSelecionados.length) * 100
        );

        barraProgresso.style.width = `${percentual}%`;
        textoProgresso.textContent = (
            `Convertendo ${i + 1} de ${arquivosSelecionados.length}: `
            + arquivo.name
        );

        atualizarStatusDoItem(arquivo.name, "Convertendo...");

        try {
            const pdfBlob = await converterUmArquivoParaPdf(arquivo);

            const nomePdf = arquivo.name.replace(/\.docx$/i, ".pdf");

            zip.file(nomePdf, pdfBlob);

            atualizarStatusDoItem(arquivo.name, "✓ Convertido", true);
            sucessos += 1;
        } catch (erro) {
            console.error(
                `Erro ao converter "${arquivo.name}":`,
                erro
            );

            atualizarStatusDoItem(
                arquivo.name,
                "Erro na conversão",
                false,
                true
            );
            falhas += 1;
        }
    }

    barraProgresso.style.width = "100%";
    textoProgresso.textContent = "Gerando o .zip pra baixar...";

    if (sucessos > 0) {
        const conteudoZip = await zip.generateAsync({ type: "blob" });

        baixarBlob(
            conteudoZip,
            `ofícios-em-pdf-${new Date().toISOString().slice(0, 10)}.zip`
        );
    }

    painelProgresso.hidden = true;
    botao.disabled = false;

    exibirNotificacao(
        falhas === 0 ? "success" : "warning",
        falhas === 0 ? "Conversão concluída" : "Conversão concluída com avisos",
        `${sucessos} arquivo(s) convertido(s)`
        + (falhas > 0 ? `, ${falhas} com erro (veja a lista acima).` : ".")
    );
}


function atualizarStatusDoItem(nomeArquivo, texto, sucesso = null, erro = false) {
    const item = document.querySelector(
        `.arquivo-selecionado-item[data-nome-arquivo="${CSS.escape(nomeArquivo)}"]`
    );

    if (!item) {
        return;
    }

    item.querySelector(".arquivo-selecionado-item__status").textContent = texto;

    item.classList.remove(
        "arquivo-selecionado-item--concluido",
        "arquivo-selecionado-item--erro"
    );

    if (sucesso) {
        item.classList.add("arquivo-selecionado-item--concluido");
    }

    if (erro) {
        item.classList.add("arquivo-selecionado-item--erro");
    }
}


/*
 * Converte um único arquivo .docx num Blob de PDF.
 */
async function converterUmArquivoParaPdf(arquivo) {
    const areaOculta = document.getElementById("areaRenderizacaoOculta");

    areaOculta.innerHTML = "";

    const buffer = await arquivo.arrayBuffer();

    await window.docx.renderAsync(buffer, areaOculta, null, {
        inWrapper: true,
        breakPages: true
    });

    // Dá um tempo pras imagens (logo, assinaturas) carregarem
    // de verdade antes de capturar.
    await aguardarImagensCarregarem(areaOculta);

    const wrapper = areaOculta.querySelector(".docx-wrapper");

    if (!wrapper) {
        throw new Error(
            "Não consegui interpretar esse arquivo como um .docx válido."
        );
    }

    const canvasCompleto = await window.html2canvas(wrapper, {
        scale: 2,
        useCORS: true,
        windowWidth: wrapper.scrollWidth,
        windowHeight: wrapper.scrollHeight
    });

    areaOculta.innerHTML = "";

    return montarPdfAPartirDoCanvas(canvasCompleto);
}


function aguardarImagensCarregarem(container) {
    const imagens = Array.from(container.querySelectorAll("img"));

    const promessas = imagens.map((img) => {
        if (img.complete) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            img.addEventListener("load", resolve);
            img.addEventListener("error", resolve);
        });
    });

    return Promise.race([
        Promise.all(promessas),
        new Promise((resolve) => setTimeout(resolve, 3000))
    ]);
}


/*
 * Fatia a imagem completa (alta) em páginas A4, descartando
 * fatias praticamente em branco (sobra do fim do documento,
 * comum quando o conteúdo real termina antes do fim da última
 * "página" renderizada).
 */
function montarPdfAPartirDoCanvas(canvasCompleto) {
    const { jsPDF } = window.jspdf;

    const pdf = new jsPDF({ unit: "pt", format: "a4" });

    const larguraPdf = pdf.internal.pageSize.getWidth();
    const alturaPdf = pdf.internal.pageSize.getHeight();

    const escala = canvasCompleto.width / larguraPdf;
    const alturaFatiaPx = alturaPdf * escala;

    const totalFatias = Math.ceil(
        canvasCompleto.height / alturaFatiaPx
    );

    for (let i = 0; i < totalFatias; i++) {
        const alturaDestaFatia = Math.min(
            alturaFatiaPx,
            canvasCompleto.height - i * alturaFatiaPx
        );

        const canvasFatia = document.createElement("canvas");

        canvasFatia.width = canvasCompleto.width;
        canvasFatia.height = alturaDestaFatia;

        const ctx = canvasFatia.getContext("2d");

        ctx.drawImage(
            canvasCompleto,
            0, i * alturaFatiaPx, canvasCompleto.width, alturaDestaFatia,
            0, 0, canvasCompleto.width, alturaDestaFatia
        );

        const imgData = canvasFatia.toDataURL("image/jpeg", 0.92);
        const alturaImgNoPdf = (
            canvasFatia.height * larguraPdf
        ) / canvasFatia.width;

        if (i > 0) {
            pdf.addPage();
        }

        pdf.addImage(imgData, "JPEG", 0, 0, larguraPdf, alturaImgNoPdf);
    }

    return pdf.output("blob");
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

    temporizadorNotificacao = window.setTimeout(fecharNotificacao, 6000);
}


function fecharNotificacao() {
    const notificacao = document.getElementById("notificacaoAziel");

    if (!notificacao) {
        return;
    }

    notificacao.hidden = true;

    window.clearTimeout(temporizadorNotificacao);
}
