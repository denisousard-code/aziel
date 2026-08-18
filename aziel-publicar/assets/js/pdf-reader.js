"use strict";

/*
 * Importa as ferramentas necessárias da biblioteca PDF.js.
 *
 * getDocument:
 * Abre e processa o documento PDF.
 *
 * GlobalWorkerOptions:
 * Configura o arquivo auxiliar utilizado para processar o PDF
 * sem bloquear a página do sistema.
 */
import {
    getDocument,
    GlobalWorkerOptions
} from "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/build/pdf.mjs";

/*
 * Define o endereço do worker da biblioteca.
 *
 * O worker realiza parte do processamento em uma tarefa separada,
 * evitando que a interface do Aziel fique travada durante a leitura.
 */
GlobalWorkerOptions.workerSrc = (
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/"
    + "build/pdf.worker.mjs"
);

/*
 * Erro personalizado utilizado pelo leitor de PDFs.
 *
 * Criar um tipo próprio de erro facilita diferenciar:
 * - falha esperada na leitura do PDF;
 * - erro inesperado de programação;
 * - problema interno da biblioteca.
 */
export class ErroLeituraPdf extends Error {
    constructor(mensagem, codigo = "ERRO_LEITURA_PDF") {
        super(mensagem);

        this.name = "ErroLeituraPdf";
        this.codigo = codigo;
    }
}

/*
 * Lê um arquivo PDF e devolve seu texto organizado.
 *
 * Retorno esperado:
 *
 * {
 *     nomeArquivo: "extrato.pdf",
 *     tamanhoArquivo: 123456,
 *     numeroPaginas: 1,
 *     paginas: [
 *         {
 *             numero: 1,
 *             texto: "Texto extraído..."
 *         }
 *     ],
 *     textoCompleto: "Texto de todas as páginas..."
 * }
 */
export async function lerPdfComoTexto(arquivo) {
    validarArquivoRecebido(arquivo);

    try {
        /*
         * Converte o arquivo selecionado em dados binários.
         *
         * ArrayBuffer é uma representação do conteúdo bruto
         * do arquivo na memória do navegador.
         */
        const dadosDoArquivo = await arquivo.arrayBuffer();

        /*
         * Entrega os dados do PDF para a biblioteca.
         *
         * getDocument devolve uma tarefa de carregamento.
         * A propriedade "promise" aguarda o documento ficar pronto.
         */
        const documentoPdf = await getDocument({
            data: dadosDoArquivo
        }).promise;

        const paginas = [];

        /*
         * As páginas do PDF.js começam no número 1.
         */
        for (
            let numeroPagina = 1;
            numeroPagina <= documentoPdf.numPages;
            numeroPagina += 1
        ) {
            const pagina = await documentoPdf.getPage(numeroPagina);

            /*
             * Obtém todos os fragmentos de texto encontrados
             * na página atual.
             */
            const conteudoDaPagina = await pagina.getTextContent();

            /*
             * Organiza os fragmentos conforme suas posições
             * horizontais e verticais no PDF.
             */
            const textoDaPagina = organizarItensEmLinhas(
                conteudoDaPagina.items
            );

            /*
             * Remove informações sensíveis e conteúdos
             * desnecessários antes que o texto seja devolvido
             * para a interface.
             */
            const textoSeguroDaPagina = removerDadosSensiveis(
                textoDaPagina
            );

            paginas.push({
                numero: numeroPagina,
                texto: textoSeguroDaPagina
            });
        }

        /*
         * Junta o texto de todas as páginas.
         *
         * A marcação de página será útil quando precisarmos
         * identificar de onde determinada movimentação veio.
         */
        const textoCompleto = paginas
            .map(function (pagina) {
                return [
                    `--- PÁGINA ${pagina.numero} ---`,
                    pagina.texto
                ].join("\n");
            })
            .join("\n\n")
            .trim();

        /*
         * Um PDF escaneado pode abrir normalmente, mas não possuir
         * qualquer texto extraível.
         *
         * Nesse caso, não devemos tratá-lo como extrato vazio.
         */
        if (!possuiTextoUtil(textoCompleto)) {
            throw new ErroLeituraPdf(
                "Não foi possível extrair texto deste PDF. "
                + "O arquivo pode estar escaneado ou ser formado "
                + "apenas por imagens.",
                "PDF_SEM_TEXTO"
            );
        }

        return {
            nomeArquivo: arquivo.name,
            tamanhoArquivo: arquivo.size,
            numeroPaginas: documentoPdf.numPages,
            paginas,
            textoCompleto
        };
    } catch (erro) {
        /*
         * Mantém os erros criados pelo próprio Aziel.
         */
        if (erro instanceof ErroLeituraPdf) {
            throw erro;
        }

        /*
         * Mostra o erro técnico apenas no console.
         *
         * O usuário receberá uma mensagem mais clara,
         * sem detalhes internos da biblioteca.
         */
        console.error(
            "Erro técnico durante a leitura do PDF:",
            erro
        );

        throw new ErroLeituraPdf(
            "Não foi possível ler o arquivo PDF. "
            + "Verifique se o documento está íntegro e tente novamente.",
            "PDF_INVALIDO_OU_CORROMPIDO"
        );
    }
}

/*
 * Remove informações que não são necessárias para o processo
 * e que podem conter dados sensíveis.
 */
function removerDadosSensiveis(texto) {
    return texto
        /*
         * Remove linhas contendo endereço do portal bancário,
         * incluindo possíveis tokens de sessão.
         */
        .replace(
            /^.*https?:\/\/.*(?:tokenSessao|autoatendimento).*$/gim,
            ""
        )

        /*
         * Remove qualquer token de sessão que apareça isoladamente.
         */
        .replace(
            /tokenSessao\s*=\s*[^\s&]+/gi,
            "[TOKEN REMOVIDO]"
        )

        /*
         * Remove a identificação de quem emitiu o extrato,
         * pois ela não é necessária para identificar a devolução.
         */
        .replace(
            /^.*Transação efetuada com sucesso por:.*$/gim,
            ""
        )

        /*
         * Elimina excesso de linhas vazias causado pelas remoções.
         */
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}


/*
 * Verifica se o valor recebido realmente representa
 * um arquivo PDF válido para a tentativa de leitura.
 */
function validarArquivoRecebido(arquivo) {
    if (!(arquivo instanceof File)) {
        throw new ErroLeituraPdf(
            "Nenhum arquivo válido foi informado.",
            "ARQUIVO_NAO_INFORMADO"
        );
    }

    const nomeNormalizado = arquivo.name
        .trim()
        .toLowerCase();

    const possuiExtensaoPdf = nomeNormalizado.endsWith(".pdf");

    const possuiTipoPermitido = (
        arquivo.type === "application/pdf"
        || arquivo.type === ""
    );

    if (!possuiExtensaoPdf || !possuiTipoPermitido) {
        throw new ErroLeituraPdf(
            "Formato não suportado. Selecione um arquivo PDF.",
            "FORMATO_NAO_SUPORTADO"
        );
    }

    if (arquivo.size === 0) {
        throw new ErroLeituraPdf(
            "O arquivo selecionado está vazio.",
            "ARQUIVO_VAZIO"
        );
    }
}

/*
 * Organiza os fragmentos de texto da página em linhas.
 *
 * O PDF não funciona como um arquivo de texto comum.
 * Cada palavra ou trecho pode possuir coordenadas próprias.
 *
 * Exemplo simplificado:
 *
 * "Transferência" → posição X: 200, posição Y: 500
 * "recebida"      → posição X: 280, posição Y: 500
 * "16.335,74"     → posição X: 500, posição Y: 500
 *
 * Como os três itens possuem posição vertical semelhante,
 * eles fazem parte da mesma linha.
 */
function organizarItensEmLinhas(itens) {
    const linhas = [];
    const toleranciaVertical = 2;

    itens.forEach(function (item) {
        const texto = obterTextoDoItem(item);

        if (!texto) {
            return;
        }

        /*
         * No PDF.js:
         *
         * transform[4] representa aproximadamente a posição horizontal.
         * transform[5] representa aproximadamente a posição vertical.
         */
        const posicaoHorizontal = item.transform[4];
        const posicaoVertical = item.transform[5];

        const linhaExistente = linhas.find(function (linha) {
            return (
                Math.abs(
                    linha.posicaoVertical - posicaoVertical
                ) <= toleranciaVertical
            );
        });

        if (linhaExistente) {
            linhaExistente.itens.push({
                texto,
                posicaoHorizontal
            });

            return;
        }

        linhas.push({
            posicaoVertical,
            itens: [
                {
                    texto,
                    posicaoHorizontal
                }
            ]
        });
    });

    /*
     * Em PDFs, valores maiores no eixo vertical normalmente
     * aparecem mais próximos do topo da página.
     *
     * Por isso, ordenamos do maior para o menor.
     */
    linhas.sort(function (linhaA, linhaB) {
        return (
            linhaB.posicaoVertical
            - linhaA.posicaoVertical
        );
    });

    return linhas
        .map(function (linha) {
            /*
             * Dentro de cada linha, ordenamos os textos
             * da esquerda para a direita.
             */
            linha.itens.sort(function (itemA, itemB) {
                return (
                    itemA.posicaoHorizontal
                    - itemB.posicaoHorizontal
                );
            });

            return linha.itens
                .map(function (item) {
                    return item.texto;
                })
                .join(" ")
                .replace(/\s+/g, " ")
                .trim();
        })
        .filter(Boolean)
        .join("\n");
}

/*
 * Obtém e normaliza o texto de um item da página.
 */
function obterTextoDoItem(item) {
    if (
        !item
        || typeof item.str !== "string"
    ) {
        return "";
    }

    return item.str
        .replace(/\s+/g, " ")
        .trim();
}

/*
 * Verifica se o resultado contém algum texto realmente útil.
 *
 * Removemos as marcações internas de página antes de validar,
 * pois elas foram adicionadas pelo próprio Aziel.
 */
function possuiTextoUtil(textoCompleto) {
    const textoSemMarcadores = textoCompleto
        .replace(/--- PÁGINA \d+ ---/g, "")
        .trim();

    return textoSemMarcadores.length > 0;
}