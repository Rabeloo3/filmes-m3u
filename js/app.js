let creds = { server: '', user: '', pass: '' };
let currentTab = 'live'; 
let currentItems = [];
let seriesCachedData = {};

window.addEventListener('DOMContentLoaded', checkPersistentSession);

// ==========================================================
// SINCRONIA MOUSE / TECLADO
// ==========================================================
document.addEventListener('mouseover', (e) => {
    const item = e.target.closest('button:not([disabled]), input:not([disabled])');
    
    if (item && document.activeElement !== item) {
        // Se o usuário estiver digitando na barra de pesquisa, o mouse não rouba o foco
        if (document.activeElement.tagName === 'INPUT' && document.activeElement.type === 'text') {
            return;
        }
        item.focus({ preventScroll: true });
    }
});