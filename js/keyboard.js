/* ==========================================================
   1. SISTEMA ANTI-MOUSE
========================================================== */
window.addEventListener('click', (e) => {
    if (e.detail !== 0) { e.preventDefault(); e.stopPropagation(); }
}, { capture: true });

['mousedown', 'mouseup', 'contextmenu', 'dblclick', 'mousemove'].forEach(evt => {
    window.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); }, { capture: true });
});


/* ==========================================================
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
            gain.gain.setValueAtTime(0.015, this.ctx.currentTime); // Volume bem sutil
            gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.035);

            osc.start(); osc.stop(this.ctx.currentTime + 0.035);
        } catch(e) {}
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
   4. TELA CHEIA + TRAVA ANTI-SONO (WakeLock) + TRAVA DE SAÍDA
========================================================== */
let wakeLock = null;
async function ativarModoImersivo() {
    if (!document.fullscreenElement) {
        const doc = document.documentElement;
        const req = doc.requestFullscreen || doc.webkitRequestFullScreen || doc.mozRequestFullScreen;
        if (req) req.call(doc).catch(() => {});
    }
    try {
        if ('wakeLock' in navigator && !wakeLock) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch(e) {}
}

// Previne que o botão "Back" físico da TV feche o aplicativo
history.pushState(null, null, location.href);
window.onpopstate = function () {
    history.pushState(null, null, location.href);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
};


/* ==========================================================
   5. CÉREBRO PRINCIPAL DE NAVEGAÇÃO
========================================================== */
window.addEventListener('keydown', (e) => {
    ativarModoImersivo();

    const elAtivo = document.activeElement;
    const digitando = elAtivo && elAtivo.tagName === 'INPUT';
    const teclaVoltar = ['Escape', 'Backspace', 'GoBack'].includes(e.key) || [27, 8, 10009, 461].includes(e.keyCode);

    const telaApp = document.getElementById('inner-app-screen');
    const navContainer = document.getElementById('navigation-container');
    const btnBackPlayer = document.getElementById('btn-back-player');

    const noCatalogo = telaApp && !telaApp.classList.contains('hidden');
    // Tela limpa de vídeo = catálogo aberto, navegação escondida e botão "voltar do player" visível
    const telaLimpaVideo = noCatalogo
        && navContainer && navContainer.style.display === 'none'
        && btnBackPlayer && !btnBackPlayer.classList.contains('hidden');

    // A. BOTÃO VOLTAR
    if (teclaVoltar && !digitando) {
        e.preventDefault();
        if (telaLimpaVideo) {
            // Sai do player e volta para a grade do catálogo
            if (typeof exitPlayerMode === 'function') exitPlayerMode();
            setTimeout(() => {
                const alvo = document.querySelector('#channels-grid button');
                if (alvo) alvo.focus();
            }, 100);
            return;
        }
        if (noCatalogo) { backToDashboard(); return; }
        return;
    }

    // B. CONTROLES DE MÍDIA (VÍDEO EM TELA CHEIA)
    if (telaLimpaVideo && clapprPlayer) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (clapprPlayer.isPlaying()) { clapprPlayer.pause(); showHUD("Pausado", "fa-solid fa-pause"); }
            else { clapprPlayer.play(); showHUD("Reproduzindo", "fa-solid fa-play"); }
            return;
        }
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            clapprPlayer.seek(clapprPlayer.getCurrentTime() + 10);
            showHUD("+10 Segundos", "fa-solid fa-forward"); return;
        }
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            clapprPlayer.seek(Math.max(0, clapprPlayer.getCurrentTime() - 10));
            showHUD("-10 Segundos", "fa-solid fa-backward"); return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            const nVol = Math.min(100, clapprPlayer.getVolume() + 10);
            clapprPlayer.setVolume(nVol); showHUD(`Volume: ${nVol}%`, "fa-solid fa-volume-high"); return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nVol = Math.max(0, clapprPlayer.getVolume() - 10);
            clapprPlayer.setVolume(nVol); showHUD(`Volume: ${nVol}%`, nVol === 0 ? "fa-solid fa-volume-xmark" : "fa-solid fa-volume-low"); return;
        }
    }

    // C. NAVEGAÇÃO ESPACIAL
    const setas = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (!setas.includes(e.key)) return;
    if (digitando && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;

    e.preventDefault();

    const focaveis = Array.from(document.querySelectorAll('button:not([disabled]), input:not([disabled])')).filter(el => el.offsetParent !== null);
    if (!elAtivo || elAtivo === document.body || !focaveis.includes(elAtivo)) {
        if (focaveis.length > 0) focaveis[0].focus(); return;
    }

    const retA = elAtivo.getBoundingClientRect();
    const centroA = { x: retA.left + retA.width / 2, y: retA.top + retA.height / 2 };
    let melhor = null; let menorDist = Infinity;

    focaveis.forEach(cand => {
        if (cand === elAtivo) return;
        const retC = cand.getBoundingClientRect();
        const centroC = { x: retC.left + retC.width / 2, y: retC.top + retC.height / 2 };

        let ok = false;
        if (e.key === 'ArrowLeft') ok = centroC.x < centroA.x - 5;
        if (e.key === 'ArrowRight') ok = centroC.x > centroA.x + 5;
        if (e.key === 'ArrowUp') ok = centroC.y < centroA.y - 5;
        if (e.key === 'ArrowDown') ok = centroC.y > centroA.y + 5;

        if (ok) {
            const dx = centroC.x - centroA.x; const dy = centroC.y - centroA.y;
            const dist = (e.key === 'ArrowLeft' || e.key === 'ArrowRight') ? Math.abs(dx) + Math.abs(dy) * 4 : Math.abs(dy) + Math.abs(dx) * 4;
            if (dist < menorDist) { menorDist = dist; melhor = cand; }
        }
    });

    if (melhor) {
        AudioEngine.play(); // EMITE O SOM DE CLIQUE NATIVO
        melhor.focus();
        melhor.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
});
