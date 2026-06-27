/* ==========================================================
   0. DESBLOQUEADOR DE HARDWARE (Específico para Samsung Tizen)
========================================================== */
function liberarTeclasTizen() {
    if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
        ['MediaPlay', 'MediaPause', 'MediaStop', 'MediaRewind', 'MediaFastForward',
         '0','1','2','3','4','5','6','7','8','9',
         'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue'].forEach(t => {
            try { tizen.tvinputdevice.registerKey(t); } catch(e){}
        });
    }
}
window.addEventListener('DOMContentLoaded', liberarTeclasTizen);


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
            gain.gain.setValueAtTime(0.015, this.ctx.currentTime); 
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
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        const doc = document.documentElement;
        const req = doc.requestFullscreen || doc.webkitRequestFullScreen || doc.mozRequestFullScreen || doc.msRequestFullscreen;
        if (req) req.call(doc).catch(() => {});
    }
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
   5. CÉREBRO PRINCIPAL DE NAVEGAÇÃO UNIVERSAL
========================================================== */
window.addEventListener('keydown', (e) => {
    ativarModoImersivo();

    const code = e.keyCode || e.which;
    const key = e.key;

    // A. TRADUTOR DE MARCAS (Tizen, webOS, AndroidTV, Roku, Vidaa, Philips, Sony)
    const ehVoltar = ['Escape', 'Backspace', 'GoBack'].includes(key) || [27, 8, 10009, 461].includes(code);
    const ehOk     = key === 'Enter' || code === 13;
    const ehPlay   = key === 'MediaPlayPause' || key === 'Play' || [415, 19, 10252].includes(code);
    const ehPause  = key === 'Pause' || code === 19;
    const ehStop   = key === 'Stop' || code === 413;
    const ehFwd    = key === 'FastForward' || code === 417;
    const ehRew    = key === 'Rewind' || code === 412;

    const elAtivo = document.activeElement;
    const digitando = elAtivo && elAtivo.tagName === 'INPUT';

    const modalSeries = document.getElementById('series-modal');
    const telaApp = document.getElementById('inner-app-screen');
    const menuOverlay = document.getElementById('menu-overlay');

    const modalAberto = modalSeries && !modalSeries.classList.contains('hidden');
    const noCatalogo = telaApp && !telaApp.classList.contains('hidden');
    const telaLimpaVideo = noCatalogo && menuOverlay && menuOverlay.style.transform === 'translateX(-100%)';

    // B. LÓGICA DO BOTÃO VOLTAR
    if (ehVoltar && !digitando) {
        e.preventDefault();
        if (modalAberto) { closeSeriesModal(); return; }
        if (telaLimpaVideo) {
            toggleMenuOverlay();
            setTimeout(() => {
                const alvo = document.querySelector('#channels-grid .bg-smarters-cyan') || document.querySelector('#channels-grid .channel-item');
                if (alvo) alvo.focus();
            }, 100);
            return;
        }
        if (noCatalogo) { backToDashboard(); return; }
        return;
    }

    // C. CONTROLES DE MÍDIA (VÍDEO EM TELA CHEIA)
    if (telaLimpaVideo && typeof clapprPlayer !== 'undefined' && clapprPlayer) {
        
        // Play / Pause (Aceita tanto o 'OK' central quanto os botões físicos dedicados da TV)
        if (ehOk || key === ' ' || ehPlay || ehPause) {
            e.preventDefault();
            if (clapprPlayer.isPlaying()) { clapprPlayer.pause(); showHUD("Pausado", "fa-solid fa-pause"); }
            else { clapprPlayer.play(); showHUD("Reproduzindo", "fa-solid fa-play"); }
            return;
        }
        if (ehStop) {
            e.preventDefault();
            clapprPlayer.stop(); showHUD("Parado", "fa-solid fa-stop"); return;
        }
        if (key === 'ArrowRight' || ehFwd) {
            e.preventDefault();
            clapprPlayer.seek(clapprPlayer.getCurrentTime() + 10);
            showHUD("+10 Segundos", "fa-solid fa-forward"); return;
        }
        if (key === 'ArrowLeft' || ehRew) {
            e.preventDefault();
            clapprPlayer.seek(Math.max(0, clapprPlayer.getCurrentTime() - 10));
            showHUD("-10 Segundos", "fa-solid fa-backward"); return;
        }
        if (key === 'ArrowUp') {
            e.preventDefault();
            const nVol = Math.min(100, clapprPlayer.getVolume() + 10);
            clapprPlayer.setVolume(nVol); showHUD(`Volume: ${nVol}%`, "fa-solid fa-volume-high"); return;
        }
        if (key === 'ArrowDown') {
            e.preventDefault();
            const nVol = Math.max(0, clapprPlayer.getVolume() - 10);
            clapprPlayer.setVolume(nVol); showHUD(`Volume: ${nVol}%`, nVol === 0 ? "fa-solid fa-volume-xmark" : "fa-solid fa-volume-low"); return;
        }
    }

    // D. NAVEGAÇÃO ESPACIAL GEOMÉTRICA
    const setas = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (!setas.includes(key)) return;
    if (digitando && (key === 'ArrowLeft' || key === 'ArrowRight')) return;

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
        if (key === 'ArrowLeft')  ok = centroC.x < centroA.x - 5;
        if (key === 'ArrowRight') ok = centroC.x > centroA.x + 5;
        if (key === 'ArrowUp')    ok = centroC.y < centroA.y - 5;
        if (key === 'ArrowDown')  ok = centroC.y > centroA.y + 5;

        if (ok) {
            const dx = centroC.x - centroA.x; const dy = centroC.y - centroA.y;
            const dist = (key === 'ArrowLeft' || key === 'ArrowRight') ? Math.abs(dx) + Math.abs(dy) * 4 : Math.abs(dy) + Math.abs(dx) * 4;
            if (dist < menorDist) { menorDist = dist; melhor = cand; }
        }
    });

    if (melhor) {
        AudioEngine.play(); 
        melhor.focus();
        melhor.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
});
