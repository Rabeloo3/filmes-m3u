window.addEventListener('keydown', (e) => {
    const setas = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (!setas.includes(e.key)) return;

    const atual = document.activeElement;
    if (atual && atual.tagName === 'INPUT' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return; // Permite andar no texto

    e.preventDefault();

    const focaveis = Array.from(document.querySelectorAll('button:not([disabled]), input:not([disabled])'))
        .filter(el => el.offsetParent !== null);

    if (!atual || atual === document.body || !focaveis.includes(atual)) {
        if (focaveis.length > 0) focaveis[0].focus(); return;
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
            const dx = centroCand.x - centroAtual.x; const dy = centroCand.y - centroAtual.y;
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
