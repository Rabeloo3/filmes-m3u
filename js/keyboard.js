/* ==========================================================
   KEYBOARD.JS - MOTOR D-PAD UNIVERSAL (LEGACY SAFE ES5)
========================================================== */

// Bloqueio de ponteiro fantasma de Smart TVs
window.addEventListener('click', function(e) {
    if (e.detail !== 0) { e.preventDefault(); e.stopPropagation(); }
}, true);

// Dicionário Universal de Códigos de Controle Remoto
var MAPA_TECLAS = {
    VOLTAR:  [8, 27, 461, 10009, 88], // 8:Backspc, 27:Esc, 461:webOS, 10009:Tizen, 88:Vewd/Philco
    OK:      [13],
    CIMA:    [38],
    BAIXO:   [40],
    ESQUERDA:[37],
    DIREITA: [39],
    PLAY_PAUSE: [415, 19, 413, 10252]
};

function contem(array, valor) {
    for (var i = 0; i < array.length; i++) { if (array[i] === valor) return true; }
    return false;
}

var AudioEngine = {
    play: function() {
        try {
            var AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            if (!this.ctx) this.ctx = new AudioCtx();
            if (this.ctx.state === 'suspended') { this.ctx.resume(); }
            
            var osc = this.ctx.createOscillator();
            var gain = this.ctx.createGain();
            osc.connect(gain); gain.connect(this.ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(500, this.ctx.currentTime);
            gain.gain.setValueAtTime(0.01, this.ctx.currentTime);
            osc.start(); osc.stop(this.ctx.currentTime + 0.03);
        } catch(e){}
    }
};

window.addEventListener('keydown', function(e) {
    var k = e.keyCode || e.which;
    var keyName = e.key || '';
    
    var elAtivo = document.activeElement;
    var digitando = elAtivo && (elAtivo.tagName === 'INPUT' || elAtivo.tagName === 'TEXTAREA');

    var telaApp = document.getElementById('inner-app-screen');
    var noCatalogo = telaApp && (telaApp.className.indexOf('hidden') === -1);
    var navContainer = document.getElementById('navigation-container');
    var visualizandoVideo = noCatalogo && navContainer && (navContainer.style.display === 'none');

    // 1. COMANDO VOLTAR (BACK)
    if ((contem(MAPA_TECLAS.VOLTAR, k) || keyName === 'Escape' || keyName === 'GoBack') && !digitando) {
        if (e.preventDefault) e.preventDefault();
        
        if (visualizandoVideo) {
            exitPlayerMode();
            setTimeout(function() {
                var grid = document.getElementById('channels-grid');
                var alvo = (grid && grid.querySelector('button')) || document.body;
                alvo.focus();
            }, 150);
            return;
        }
        if (noCatalogo) { typeof backToDashboard === 'function' && backToDashboard(); }
        return;
    }

    // 2. CONTROLES DO PLAYER EM TELA CHEIA
    if (visualizandoVideo && typeof clapprPlayer !== 'undefined' && clapprPlayer) {
        if (contem(MAPA_TECLAS.OK, k)) {
            e.preventDefault();
            clapprPlayer.isPlaying() ? clapprPlayer.pause() : clapprPlayer.play();
            return;
        }
        if (contem(MAPA_TECLAS.DIREITA, k)) { e.preventDefault(); clapprPlayer.seek(clapprPlayer.getCurrentTime() + 10); return; }
        if (contem(MAPA_TECLAS.ESQUERDA, k)) { e.preventDefault(); clapprPlayer.seek(Math.max(0, clapprPlayer.getCurrentTime() - 10)); return; }
        return;
    }

    // 3. NAVEGAÇÃO ESPACIAL NA GRADE
    var isUp = contem(MAPA_TECLAS.CIMA, k) || keyName === 'ArrowUp';
    var isDown = contem(MAPA_TECLAS.BAIXO, k) || keyName === 'ArrowDown';
    var isLeft = contem(MAPA_TECLAS.ESQUERDA, k) || keyName === 'ArrowLeft';
    var isRight = contem(MAPA_TECLAS.DIREITA, k) || keyName === 'ArrowRight';

    if (!isUp && !isDown && !isLeft && !isRight) return;
    if (digitando && (isLeft || isRight)) return;

    if (e.preventDefault) e.preventDefault();

    var todos = document.querySelectorAll('button, input, [tabindex]');
    var focaveis = [];
    for (var i = 0; i < todos.length; i++) {
        var item = todos[i];
        if (!item.disabled && item.offsetWidth > 0 && item.offsetHeight > 0) {
            focaveis.push(item);
        }
    }

    if (!elAtivo || focaveis.length === 0 || elAtivo === document.body) {
        if (focaveis[0]) focaveis[0].focus(); return;
    }

    var rA = elAtivo.getBoundingClientRect();
    var cA = { x: rA.left + rA.width / 2, y: rA.top + rA.height / 2 };
    var melhor = null; var minD = 999999;

    for (var j = 0; j < focaveis.length; j++) {
        var cand = focaveis[j];
        if (cand === elAtivo) continue;
        var rC = cand.getBoundingClientRect();
        var cC = { x: rC.left + rC.width / 2, y: rC.top + rC.height / 2 };

        var valido = false;
        if (isLeft && cC.x < cA.x - 5) valido = true;
        if (isRight && cC.x > cA.x + 5) valido = true;
        if (isUp && cC.y < cA.y - 5) valido = true;
        if (isDown && cC.y > cA.y + 5) valido = true;

        if (valido) {
            var dx = cC.x - cA.x; var dy = cC.y - cA.y;
            var dist = (isLeft || isRight) ? Math.abs(dx) + Math.abs(dy)*3 : Math.abs(dy) + Math.abs(dx)*3;
            if (dist < minD) { minD = dist; melhor = cand; }
        }
    }

    if (melhor) {
        AudioEngine.play();
        melhor.focus();
        try { melhor.scrollIntoView({ block: 'nearest', behavior: 'instant' }); } catch(err) { melhor.scrollIntoView(); }
    }
});