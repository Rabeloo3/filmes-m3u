// ==========================================
// ARQUIVO: js/app.js
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    console.log("Aplicativo iniciado e pronto para interações.");
    // Coloque aqui outras inicializações do seu app, se houver.
});

// ==========================================
// MODO TELA CHEIA (FULLSCREEN)
// ==========================================
function requestFullScreen() {
    const doc = document.documentElement;
    // Verifica se já não estamos em tela cheia
    if (!document.fullscreenElement && !document.mozFullScreenElement &&
        !document.webkitFullscreenElement && !document.msFullscreenElement) {
        
        try {
            if (doc.requestFullscreen) { 
                doc.requestFullscreen(); 
            } else if (doc.msRequestFullscreen) { 
                doc.msRequestFullscreen(); 
            } else if (doc.mozRequestFullScreen) { 
                doc.mozRequestFullScreen(); 
            } else if (doc.webkitRequestFullscreen) { 
                doc.webkitRequestFullscreen(); 
            }
        } catch (err) {
            console.warn("A tela cheia foi bloqueada pelo navegador neste momento.");
        }
    }
}
