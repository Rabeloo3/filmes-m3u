/* ==========================================================\
   1. SISTEMA ANTI-MOUSE
========================================================== */
window.addEventListener('click', (e) => {
    if (e.detail !== 0) { e.preventDefault(); e.stopPropagation(); }
}, { capture: true });

['mousedown', 'mouseup', 'contextmenu', 'dblclick', 'mousemove'].forEach(evt => {
    window.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); }, { capture: true });
});

/* ==========================================================\
   2. MOTOR DE ÁUDIO SINTÉTICO (Efeito de clique de TV)
========================================================== */
const AudioEngine = {
    ctx: null,
    play() {
        try {
            if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            if (this.ctx.state === 'suspended') this.ctx.resume();
            
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain); gain.connect(this.ctx.destination);
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, this.ctx.currentTime);
            gain.gain.setValueAtTime(0.015, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.035);
            
            osc.start(); osc.stop(this.ctx.currentTime + 0.035);
        } catch(e) {}
    }
};

/* ==========================================================\
   3. NAVEGAÇÃO ESPACIAL AVANÇADA (100% Controle)
========================================================== */
window.addEventListener('keydown', (e) => {
    const teclasNavegacao = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    const teclasAcao = ['Enter', 'NumpadEnter'];
    const teclasVoltar = ['Escape', 'Backspace'];

    // Obter todos os elementos focáveis e visíveis
    const focaveis = Array.from(document.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex="0"]'))
        .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0 && window.getComputedStyle(el).visibility !== 'hidden');

    let elAtivo = document.activeElement;

    // Se nada estiver focado, foca no primeiro elemento disponível
    if (!elAtivo || elAtivo === document.body || !focaveis.includes(elAtivo)) {
        if (focaveis.length > 0) {
            focaveis[0].focus();
            AudioEngine.play();
        }
        return;
    }

    // Ação: Enter
    if (teclasAcao.includes(e.key)) {
        e.preventDefault();
        elAtivo.click();
        AudioEngine.play();
        return;
    }

    // Ação: Voltar (Escape / Backspace)
    if (teclasVoltar.includes(e.key)) {
        e.preventDefault();
        // Adicione aqui a lógica global de voltar (ex: fechar modais, voltar pra tela anterior)
        const btnVoltar = document.querySelector('#btn-back-player:not(.hidden)');
        if (btnVoltar) btnVoltar.click();
        return;
    }

    // Navegação Direcional
    if (teclasNavegacao.includes(e.key)) {
        e.preventDefault(); // Impede o scroll nativo da página
        
        const retA = elAtivo.getBoundingClientRect();
        const centroA = { x: retA.left + retA.width / 2, y: retA.top + retA.height / 2 };
        
        let melhorCandidato = null;
        let menorPontuacao = Infinity;

        focaveis.forEach(cand => {
            if (cand === elAtivo) return;
            const retC = cand.getBoundingClientRect();
            const centroC = { x: retC.left + retC.width / 2, y: retC.top + retC.height / 2 };

            let valido = false;
            let distPrincipal = 0;
            let distSecundaria = 0;

            // Define o cone de visão para cada direção e calcula as distâncias
            if (e.key === 'ArrowLeft' && centroC.x < centroA.x) {
                valido = true;
                distPrincipal = Math.abs(centroC.x - centroA.x);
                distSecundaria = Math.abs(centroC.y - centroA.y);
            } else if (e.key === 'ArrowRight' && centroC.x > centroA.x) {
                valido = true;
                distPrincipal = Math.abs(centroC.x - centroA.x);
                distSecundaria = Math.abs(centroC.y - centroA.y);
            } else if (e.key === 'ArrowUp' && centroC.y < centroA.y) {
                valido = true;
                distPrincipal = Math.abs(centroC.y - centroA.y);
                distSecundaria = Math.abs(centroC.x - centroA.x);
            } else if (e.key === 'ArrowDown' && centroC.y > centroA.y) {
                valido = true;
                distPrincipal = Math.abs(centroC.y - centroA.y);
                distSecundaria = Math.abs(centroC.x - centroA.x);
            }

            if (valido) {
                // Penaliza a distância secundária para forçar movimentos em linha reta
                const pontuacao = distPrincipal + (distSecundaria * 2.5);
                if (pontuacao < menorPontuacao) {
                    menorPontuacao = pontuacao;
                    melhorCandidato = cand;
                }
            }
        });

        if (melhorCandidato) {
            melhorCandidato.focus();
            AudioEngine.play();
            
            // Faz a tela rolar para manter o elemento focado visível, centralizando suavemente
            melhorCandidato.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }
    }
});
