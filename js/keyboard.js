/* ==========================================================
   1. MATAR O MOUSE FÍSICO (Mantendo o "Enter" do teclado vivo)
========================================================== */
window.addEventListener('click', (e) => {
    // No padrão W3C, cliques gerados pela tecla ENTER/ESPAÇO possuem detail === 0.
    // Se for maior que 0, foi gerado por um mouse ou toque na tela.
    if (e.detail !== 0) {
        e.preventDefault();
        e.stopPropagation();
    }
}, { capture: true });

['mousedown', 'mouseup', 'contextmenu', 'dblclick', 'mousemove'].forEach(evt => {
    window.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
    }, { capture: true });
});


/* ==========================================================
   2. TELA CHEIA AUTOMÁTICA (No primeiro toque de tecla)
========================================================== */
let tentouTelaCheia = false;

function expandirTelaCheia() {
    if (tentouTelaCheia || document.fullscreenElement) return;
    
    const doc = document.documentElement;
    const requestFS = doc.requestFullscreen || doc.mozRequestFullScreen || doc.webkitRequestFullScreen || doc.msRequestFullscreen;
    
    if (requestFS) {
        requestFS.call(doc).then(() => {
            tentouTelaCheia = true;
        }).catch(() => {
            // Se o navegador bloquear, tentará novamente na próxima tecla
        });
    }
}


/* ==========================================================
   3. NAVEGAÇÃO ESPACIAL POR SETAS (Seu motor original)
========================================================== */
window.addEventListener('keydown', (e) => {
    expandirTelaCheia(); // Pula pra tela cheia na primeira tecla digitada

    const setas = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (!setas.includes(e.key)) return;

    const atual = document.activeElement;
    if (atual && atual.tagName === 'INPUT' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;

    e.preventDefault();

    const focaveis = Array.from(document.querySelectorAll('button:not([disabled]), input:not([disabled])'))
        .filter(el => el.offsetParent !== null);

    if (!atual || atual === document.body || !focaveis.includes(atual)) {
        if (focaveis.length > 0) focaveis[0].focus(); 
        return;
    }

    const retAtual = atual.getBoundingClientRect();
    const centroAtual = { x: retAtual.left + retAtual.width / 2, y: retAtual.top + retAtual.height / 2 };

    let melhorCandidato = null;
    let menorDistancia = Infinity;

    focaveis.forEach(candidato => {
        if (candidato === atual) return;
        const retCand = candidato.getBoundingClientRect();
        const centroCand = { x: retCand.left + retCand.width / 2, y: retCand.top + retCand.height / 2 };

        let direcaoCerta = false;
        switch (e.key) {
            case 'ArrowLeft':  direcaoCerta = centroCand.x < centroAtual.x - 5; break;
            case 'ArrowRight': direcaoCerta = centroCand.x > centroAtual.x + 5; break;
            case 'ArrowUp':    direcaoCerta = centroCand.y < centroAtual.y - 5; break;
            case 'ArrowDown':  direcaoCerta = centroCand.y > centroAtual.y + 5; break;
        }

        if (direcaoCerta) {
            const dx = centroCand.x - centroAtual.x; 
            const dy = centroCand.y - centroAtual.y;
            const distanciaPonderada = (e.key === 'ArrowLeft' || e.key === 'ArrowRight') 
                ? Math.abs(dx) + Math.abs(dy) * 4 
                : Math.abs(dy) + Math.abs(dx) * 4;

            if (distanciaPonderada < menorDistancia) {
                menorDistancia = distanciaPonderada;
                melhorCandidato = candidato;
            }
        }
    });

    if (melhorCandidato) {
        melhorCandidato.focus();
        melhorCandidato.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
});