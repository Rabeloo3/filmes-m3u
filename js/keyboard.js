/* ==========================================================
   1. SISTEMA ANTI-MOUSE (BLINDADO PARA MODO KIOSK TV)
========================================================== */
window.addEventListener('click', (e) => {
    if (e.detail !== 0) { e.preventDefault(); e.stopPropagation(); }
}, { capture: true });

['mousedown', 'mouseup', 'contextmenu', 'dblclick', 'mousemove'].forEach(evt => {
    window.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); }, { capture: true });
});

/* ==========================================================
   2. MOTOR DE ÁUDIO SINTÉTICO SEGURO (PROPRIETÁRIO TV SAFE)
========================================================== */
const AudioEngine = {
    ctx: null,
    play() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return; // TV antiga sem suporte a Web Audio API

            if (!this.ctx) this.ctx = new AudioCtx();
            if (this.ctx.state === 'suspended') {
                this.ctx.resume().catch(() => {});
            }
            
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain); 
            gain.connect(this.ctx.destination);
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, this.ctx.currentTime);
            gain.gain.setValueAtTime(0.015, this.ctx.currentTime); 
            gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.035);
            
            osc.start(); 
            osc.stop(this.ctx.currentTime + 0.035);
        } catch(e) {
            // Previne crash em WebKit antigo de Smart TVs
        }
    }
};

/* ==========================================================
   3. HUD DE FEEDBACK VISUAL (OSD - On Screen Display)
========================================================== */
let hudTimer = null;
function showHUD(text, iconClass) {
    let hud = document.getElementById('tv-osd-hud');
    if (!hud) {
        hud = document.createElement('div');
        hud.id = 'tv-osd-hud';
        hud.className = 'fixed top-6 right-6 bg-slate-950/90 border border-sky-400 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2.5 shadow-2xl z-[999999] transition-opacity duration-300 pointer-events-none opacity-0';
        document.body.appendChild(hud);
    }
    hud.innerHTML = `<i class="${iconClass} text-sky-400 text-sm"></i><span>${text}</span>`;
    hud.style.opacity = '1';
    
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => { hud.style.opacity = '0'; }, 1600);
}

/* ==========================================================
   4. TRAVA ANTI-SONO (WakeLock)
========================================================== */
let wakeLock = null;
async function requisitarWakeLock() {
    try {
        if ('wakeLock' in navigator && !wakeLock) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch(e) {}
}

history.pushState(null, null, location.href);
window.onpopstate = function () {
    history.pushState(null, null, location.href);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
};

/* ==========================================================
   5. CÉREBRO PRINCIPAL DE NAVEGAÇÃO DIRECENTRAL (D-PAD)
========================================================== */
window.addEventListener('keydown', (e) => {
    requisitarWakeLock();

    const elAtivo = document.activeElement;
    const digitando = elAtivo && (elAtivo.tagName === 'INPUT' || elAtivo.tagName === 'TEXTAREA');
    
    // Mapeamento Universal de Teclas de Retorno de Controles Remotos (Samsung, LG, Android, Roku, Sony)
    const teclaVoltar = ['Escape', 'Backspace', 'GoBack', 'BrowserBack'].includes(e.key) || [27, 8, 10009, 461, 88].includes(e.keyCode);

    const telaApp = document.getElementById('inner-app-screen');
    const noCatalogo = telaApp && !telaApp.classList.contains('hidden');
    const visualizandoVideo = noCatalogo && document.getElementById('navigation-container').style.display === 'none';

    // A. BOTÃO VOLTAR FÍSICO DO CONTROLE
    if (teclaVoltar && !digitando) {
        e.preventDefault();
        if (visualizandoVideo) { 
            exitPlayerMode();
            setTimeout(() => {
                const alvo = document.querySelector('.channel-item:focus') || document.querySelector('#channels-grid button');
                if (alvo) alvo.focus();
            }, 100);
            return; 
        }
        if (noCatalogo) { backToDashboard(); return; }
        return;
    }

    // B. CONTROLES DE MÍDIA DO PLAYER EM TELA CHEIA
    if (visualizandoVideo && typeof clapprPlayer !== 'undefined' && clapprPlayer) {
        if (e.key === 'Enter' || e.key === ' ' || e.keyCode === 13) {
            e.preventDefault();
            if (clapprPlayer.isPlaying()) { clapprPlayer.pause(); showHUD("Pausado", "fa-solid fa-pause"); }
            else { clapprPlayer.play(); showHUD("Reproduzindo", "fa-solid fa-play"); }
            return;
        }
        if (e.key === 'ArrowRight' || e.keyCode === 39) {
            e.preventDefault();
            clapprPlayer.seek(clapprPlayer.getCurrentTime() + 10);
            showHUD("+10 Segundos", "fa-solid fa-forward"); return;
        }
        if (e.key === 'ArrowLeft' || e.keyCode === 37) {
            e.preventDefault();
            clapprPlayer.seek(Math.max(0, clapprPlayer.getCurrentTime() - 10));
            showHUD("-10 Segundos", "fa-solid fa-backward"); return;
        }
        if (e.key === 'ArrowUp' || e.keyCode === 38) {
            e.preventDefault();
            const nVol = Math.min(100, clapprPlayer.getVolume() + 10);
            clapprPlayer.setVolume(nVol); showHUD(`Volume: ${nVol}%`, "fa-solid fa-volume-high"); return;
        }
        if (e.key === 'ArrowDown' || e.keyCode === 40) {
            e.preventDefault();
            const nVol = Math.max(0, clapprPlayer.getVolume() - 10);
            clapprPlayer.setVolume(nVol); showHUD(`Volume: ${nVol}%`, nVol === 0 ? "fa-solid fa-volume-xmark" : "fa-solid fa-volume-low"); return;
        }
    }

    // C. NAVEGAÇÃO ESPACIAL NA INTERFACE
    const setas = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    const codigosSeta = [38, 40, 37, 39];
    const acaoSeta = setas.includes(e.key) || codigosSeta.includes(e.keyCode);
    
    if (!acaoSeta) return;
    if (digitando && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.keyCode === 37 || e.keyCode === 39)) return;

    e.preventDefault();

    // Filtra apenas elementos interativos que estão realmente visíveis na tela atual
    const focaveis = Array.from(document.querySelectorAll('button:not([disabled]), input:not([disabled])')).filter(el => {
        return el.offsetWidth > 0 && el.offsetHeight > 0 && window.getComputedStyle(el).visibility !== 'hidden';
    });

    if (!elAtivo || elAtivo === document.body || !focaveis.includes(elAtivo)) {
        if (focaveis.length > 0) focaveis[0].focus(); return;
    }

    const retA = elAtivo.getBoundingClientRect();
    const centroA = { x: retA.left + retA.width / 2, y: retA.top + retA.height / 2 };
    let melhor = null; 
    let menorDist = Infinity;

    const isLeft = e.key === 'ArrowLeft' || e.keyCode === 37;
    const isRight = e.key === 'ArrowRight' || e.keyCode === 39;
    const isUp = e.key === 'ArrowUp' || e.keyCode === 38;
    const isDown = e.key === 'ArrowDown' || e.keyCode === 40;

    focaveis.forEach(cand => {
        if (cand === elAtivo) return;
        const retC = cand.getBoundingClientRect();
        const centroC = { x: retC.left + retC.width / 2, y: retC.top + retC.height / 2 };

        let ok = false;
        if (isLeft) ok = centroC.x < centroA.x - 4;
        if (isRight) ok = centroC.x > centroA.x + 4;
        if (isUp) ok = centroC.y < centroA.y - 4;
        if (isDown) ok = centroC.y > centroA.y + 4;

        if (ok) {
            const dx = centroC.x - centroA.x; 
            const dy = centroC.y - centroA.y;
            // Algoritmo de peso espacial: prioriza alinhamento direcional estrito
            const dist = (isLeft || isRight) ? Math.abs(dx) + (Math.abs(dy) * 3.5) : Math.abs(dy) + (Math.abs(dx) * 3.5);
            if (dist < menorDist) { 
                menorDist = dist; 
                melhor = cand; 
            }
        }
    });

    if (melhor) {
        AudioEngine.play();
        melhor.focus();
        melhor.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
});