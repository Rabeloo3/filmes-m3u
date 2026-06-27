/* ==========================================================
   js/keyboard.js - MOTOR DE NAVEGAÇÃO ESPACIAL PARA SMART TVs
   Suporte: Android TV, Tizen (Samsung), WebOS (LG), Roku, FireOS
========================================================== */

// 1. INICIALIZAÇÃO DE HARDWARE (Desbloqueia as setas em TVs LG/Samsung antigas)
window.addEventListener('load', () => {
    if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
        try {
            const teclas = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Return', 'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue'];
            teclas.forEach(t => tizen.tvinputdevice.registerKey(t));
        } catch(e) {}
    }
});

// 2. BLOQUEIO ABSOLUTO DE PONTEIRO (Anti-mouse)
['mousedown', 'mouseup', 'contextmenu', 'dblclick', 'mousemove', 'wheel'].forEach(evt => {
    window.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false, capture: true });
});

// 3. SINTETIZADOR DE ÁUDIO DE CLIQUE (Feedback mecânico de TV)
const AudioEngine = {
    ctx: null,
    play() {
        try {
            if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            if (this.ctx.state === 'suspended') this.ctx.resume();
            
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain); gain.connect(this.ctx.destination);
            
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(440, this.ctx.currentTime);
            gain.gain.setValueAtTime(0.01, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.00001, this.ctx.currentTime + 0.025);
            
            osc.start(); osc.stop(this.ctx.currentTime + 0.025);
        } catch(e) {}
    }
};

// 4. MOTOR DE TELA CHEIA NATIVA
function ativarEcraInteiro() {
    const docEl = document.documentElement;
    const rfs = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
    if (rfs) { try { rfs.call(docEl); } catch(e) {} }
}

const triggerInit = () => {
    ativarEcraInteiro();
    window.removeEventListener('keydown', triggerInit, { capture: true });
};
window.addEventListener('keydown', triggerInit, { capture: true });


// 5. NÚCLEO DE NAVEGAÇÃO ESPACIAL (O Cérebro do Controle Remoto)
window.addEventListener('keydown', (e) => {
    const key = e.key;
    const code = e.keyCode || e.which;

    // Mapeamento Universal de Botões de Voltar (Android, Tizen, WebOS, FireTV)
    const BACK_KEYS = ['Escape', 'Backspace', 'GoBack', 'U+001B', 'BrowserBack'];
    const BACK_CODES = [27, 8, 10009, 461, 65367];

    // Mapeamento Universal de Confirmação (OK / Enter do Controle)
    const OK_KEYS = ['Enter', 'NumpadEnter', 'Select', 'Accept'];
    const OK_CODES = [13, 294, 65360];

    // Mapeamento Direcional Blindado
    let direcao = null;
    if (key === 'ArrowUp' || code === 38) direcao = 'UP';
    if (key === 'ArrowDown' || code === 40) direcao = 'DOWN';
    if (key === 'ArrowLeft' || code === 37) direcao = 'LEFT';
    if (key === 'ArrowRight' || code === 39) direcao = 'RIGHT';

    // A. TRATAMENTO DO BOTÃO VOLTAR / EXIT
    if (BACK_KEYS.includes(key) || BACK_CODES.includes(code)) {
        e.preventDefault();
        
        // Se houver um player tocando, volta pra tela anterior
        const btnVoltarPlayer = document.querySelector('#btn-back-player:not(.hidden) button');
        if (btnVoltarPlayer) {
            btnVoltarPlayer.click();
            return;
        }

        // Lógica nativa de fechar o aplicativo no Tizen (Samsung)
        if (typeof tizen !== 'undefined' && tizen.application) {
            try { tizen.application.getCurrentApplication().exit(); } catch(err) {}
        }
        return;
    }

    // Coleta apenas elementos visíveis e acionáveis na tela ativa no momento
    const focaveis = Array.from(document.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), [tabindex="0"]:not([disabled])'
    )).filter(el => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0 && rect.height > 0;
    });

    let ativo = document.activeElement;

    // Se o foco se perdeu no "vazio" do HTML, resgata para o primeiro elemento seguro
    if (!ativo || ativo === document.body || !focaveis.includes(ativo)) {
        if (focaveis.length > 0) {
            focaveis[0].focus();
            AudioEngine.play();
        }
        return;
    }

    // B. TRATAMENTO DO BOTÃO OK (ENTER)
    if (OK_KEYS.includes(key) || OK_CODES.includes(code)) {
        e.preventDefault();
        AudioEngine.play();
        ativo.click();
        return;
    }

    // C. TRATAMENTO DE NAVEGAÇÃO ESPACIAL (SETAS)
    if (direcao) {
        e.preventDefault(); // Impede a TV de rolar a página sozinha quebrando o layout

        const rA = ativo.getBoundingClientRect();
        const cA = { x: rA.left + rA.width / 2, y: rA.top + rA.height / 2 };

        let melhorCandidato = null;
        let menorDistancia = Infinity;

        focaveis.forEach(cand => {
            if (cand === ativo) return;
            const rC = cand.getBoundingClientRect();
            const cC = { x: rC.left + rC.width / 2, y: rC.top + rC.height / 2 };

            let noQuadrante = false;

            // Divide a tela em 4 cones vetoriais a partir do centro do elemento atual
            if (direcao === 'LEFT' && cC.x < cA.x) noQuadrante = true;
            if (direcao === 'RIGHT' && cC.x > cA.x) noQuadrante = true;
            if (direcao === 'UP' && cC.y < cA.y) noQuadrante = true;
            if (direcao === 'DOWN' && cC.y > cA.y) noQuadrante = true;

            if (noQuadrante) {
                const distZeta = Math.hypot(cC.x - cA.x, cC.y - cA.y);
                
                // Aplica peso matemático: Força a preferência por elementos alinhados no mesmo eixo
                let penalidadeAlinhamento = 1;
                if (direcao === 'LEFT' || direcao === 'RIGHT') {
                    penalidadeAlinhamento += Math.abs(cC.y - cA.y) * 1.8;
                } else {
                    penalidadeAlinhamento += Math.abs(cC.x - cA.x) * 1.8;
                }

                const pontuacaoFinal = distZeta * penalidadeAlinhamento;

                if (pontuacaoFinal < menorDistancia) {
                    menorDistancia = pontuacaoFinal;
                    melhorCandidato = cand;
                }
            }
        });

        if (melhorCandidato) {
            melhorCandidato.focus();
            AudioEngine.play();

            // Garante que contêineres com scroll interno (ex: a grade de filmes) acompanhem o foco
            melhorCandidato.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
        }
    }
});