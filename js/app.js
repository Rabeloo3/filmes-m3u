let creds = { server: '', user: '', pass: '' };
let currentTab = 'live'; 
let currentItems = [];
let seriesCachedData = {};

window.addEventListener('DOMContentLoaded', () => {
    checkPersistentSession();
    iniciarGuardiãoDeTelaCheia();
});

/* ==========================================================
   GUARDIÃO DE TELA CHEIA COMPATÍVEL (TIZEN / WEBOS / ANDROID)
========================================================== */
function iniciarGuardiãoDeTelaCheia() {
    const doc = document.documentElement;
    
    const requisitarTelaCheia = () => {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            const m = doc.requestFullscreen || doc.webkitRequestFullscreen || doc.msRequestFullscreen;
            if (m) {
                m.call(doc).catch(() => {
                    // Silencia erro de restrição de política de interação nativa da Smart TV
                });
            }
        }
    };

    // Escuta eventos passivos de forma segura sem travar a engine web embarcada
    ['keydown', 'click', 'touchend'].forEach(evt => {
        window.addEventListener(evt, requisitarTelaCheia, { passive: true });
    });

    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
            console.log("[Kiosk Mode] Saída detectada. Aguardando novo comando de controle...");
        }
    });
}