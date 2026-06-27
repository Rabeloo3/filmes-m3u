let creds = { server: '', user: '', pass: '' };
let currentTab = 'live'; 
let currentItems = [];
let seriesCachedData = {};

window.addEventListener('DOMContentLoaded', () => checkPersistentSession());

/* ==========================================================
   GUARDIÃO DE TELA CHEIA (MODO KIOSK PERMANENTE)
========================================================== */
function forcarTelaCheia() {
    const doc = document.documentElement;
    
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        const entrarTelaCheia = doc.requestFullscreen || doc.webkitRequestFullscreen || doc.msRequestFullscreen;
        
        if (entrarTelaCheia) {
            entrarTelaCheia.call(doc).catch(() => {
                // Navegador bloqueou por falta de interação física prévia; ignora silenciosamente.
            });
        }
    }
}

// 1. Força a tela cheia no primeiro clique, toque ou botão do controle remoto
['keydown', 'click', 'touchstart'].forEach(evento => {
    window.addEventListener(evento, forcarTelaCheia, { capture: true, passive: true });
});

// 2. Se o usuário conseguir sair (ex: apertando ESC), reativa a armadilha na próxima ação
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        console.warn("[Kiosk Mode] Saída da tela cheia detectada. Reativando no próximo comando...");
    }
});
