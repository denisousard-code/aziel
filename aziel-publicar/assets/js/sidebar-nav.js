"use strict";

/*
 * =========================================================
 * AZIEL — SUBMENU DA SIDEBAR (RELATÓRIOS)
 * =========================================================
 *
 * Controla o item "Relatórios" do menu, que expande/recolhe
 * pra mostrar as categorias — estilo Fluig. Abre sozinho quando
 * a página atual é uma das categorias, e marca a categoria atual
 * como ativa.
 */

document.addEventListener("DOMContentLoaded", iniciarSubmenuRelatorios);


function iniciarSubmenuRelatorios() {
    const botao = document.getElementById("botaoAccordionRelatorios");
    const submenu = document.getElementById("submenuRelatorios");

    if (!botao || !submenu) {
        return;
    }

    const paginaAtual = window.location.pathname.split("/").pop();

    const linksSubmenu = submenu.querySelectorAll(".sidebar__sublink");

    let algumAtivo = false;

    linksSubmenu.forEach((link) => {
        const hrefPagina = link.getAttribute("href").split("/").pop();

        if (hrefPagina === paginaAtual) {
            link.classList.add("sidebar__sublink--active");
            link.setAttribute("aria-current", "page");
            algumAtivo = true;
        }
    });

    if (algumAtivo) {
        abrirSubmenu(botao, submenu);
    }

    botao.addEventListener("click", () => {
        const estaAberto = botao.getAttribute("aria-expanded") === "true";

        if (estaAberto) {
            fecharSubmenu(botao, submenu);
        } else {
            abrirSubmenu(botao, submenu);
        }
    });
}


function abrirSubmenu(botao, submenu) {
    botao.setAttribute("aria-expanded", "true");
    submenu.hidden = false;
}


function fecharSubmenu(botao, submenu) {
    botao.setAttribute("aria-expanded", "false");
    submenu.hidden = true;
}
