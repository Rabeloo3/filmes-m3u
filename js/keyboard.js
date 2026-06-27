/* ==========================================================
   KEYBOARD.JS - MODO RADAR DE DIAGNÓSTICO (SAMSUNG TIZEN)
========================================================== */

// 1. CAÇA-FOCO AUTOMÁTICO (Tenta agarrar o primeiro botão a cada 500ms)
var cacaFoco = setInterval(function() {
    var alvo = document.querySelector('input, button');
    if (alvo && alvo.offsetWidth > 0) {
        alvo.focus();
        clearInterval(cacaFoco);
    }
}, 500);

window.addEventListener('click', function(e) {
    if (e.detail !== 0) { e.preventDefault(); e.stopPropagation(); }
}, true);

var MAPA = {
    VOLTAR: [8, 27, 461, 10009, 88],
    OK:     [13],
    CIMA:   [38], BAIXO: [40], ESQ: [37], DIR: [39]
};

function contem(arr, val) {
    for (var i = 0; i < arr.length; i++) { if (arr[i] === val) return true; }
    return false;
}

var motorTecla = function(e) {
    var k = e.keyCode || e.which;
    var n = e.key || '';

    // --- CAIXA DE RADAR NA TELA DA TV ---
    var radar = document.getElementById('radar-samsung');
    if (!radar) {
        radar = document.createElement('div');
        radar.id = 'radar-samsung';
        radar.style.cssText = 'position:fixed;top:10px;left:10px;background:#e11d48;color:#fff;padding:8px 16px;font-size:13px;font-weight:900;z-index:9999999;border-radius:6px;font-family:monospace;';
        document.body.appendChild(radar);
    }
    radar.innerHTML = "TV LEU TECLA: " + k + " (" + n + ")";
    // ------------------------------------

    var elAtivo = document.activeElement;
    var digitando = elAtivo && (elAtivo.tagName === 'INPUT' || elAtivo.tagName === 'TEXTAREA');

    var telaApp = document.getElementById('inner-app-screen');
    var noCatalogo = telaApp && (telaApp.className.indexOf('hidden') === -1);
    var nav = document.getElementById('navigation-container');
    var vendoVideo = noCatalogo && nav && (nav.style.display === 'none');

    // Botão Voltar
    if ((contem(MAPA.VOLTAR, k) || n === 'Escape' || n === 'GoBack') && !digitando) {
        if (e.preventDefault) e.preventDefault();
        if (vendoVideo) { exitPlayerMode(); return; }
        if (noCatalogo) { typeof backToDashboard === 'function' && backToDashboard(); }
        return;
    }

    // Setas Direcionais
    var isUp = contem(MAPA.CIMA, k) || n === 'ArrowUp';
    var isDown = contem(MAPA.BAIXO, k) || n === 'ArrowDown';
    var isLeft = contem(MAPA.ESQ, k) || n === 'ArrowLeft';
    var isRight = contem(MAPA.DIR, k) || n === 'ArrowRight';

    if (!isUp && !isDown && !isLeft && !isRight) return;
    if (digitando && (isLeft || isRight)) return;

    if (e.preventDefault) e.preventDefault();

    var todos = document.querySelectorAll('button, input');
    var focaveis = [];
    for (var i = 0; i < todos.length; i++) {
        var el = todos[i];
        if (!el.disabled && el.offsetWidth > 0 && el.offsetHeight > 0) focaveis.push(el);
    }

    if (!elAtivo || focaveis.length === 0 || elAtivo === document.body) {
        if (focaveis[0]) focaveis[0].focus();
        return;
    }

    var rA = elAtivo.getBoundingClientRect();
    var cA = { x: rA.left + rA.width/2, y: rA.top + rA.height/2 };
    var melhor = null; var minD = 999999;

    for (var j = 0; j < focaveis.length; j++) {
        var cand = focaveis[j];
        if (cand === elAtivo) continue;
        var rC = cand.getBoundingClientRect();
        var cC = { x: rC.left + rC.width/2, y: rC.top + rC.height/2 };

        var val = false;
        if (isLeft && cC.x < cA.x - 5) val = true;
        if (isRight && cC.x > cA.x + 5) val = true;
        if (isUp && cC.y < cA.y - 5) val = true;
        if (isDown && cC.y > cA.y + 5) val = true;

        if (val) {
            var dx = cC.x - cA.x; var dy = cC.y - cA.y;
            var dist = (isLeft || isRight) ? Math.abs(dx) + Math.abs(dy)*3 : Math.abs(dy) + Math.abs(dx)*3;
            if (dist < minD) { minD = dist; melhor = cand; }
        }
    }

    if (melhor) {
        melhor.focus();
        try { melhor.scrollIntoView({block: 'nearest'}); } catch(err){}
    }
};

// Amarra o escutador em duas portas diferentes para garantir que a Samsung ouça
document.addEventListener('keydown', motorTecla, false);
window.addEventListener('keydown', motorTecla, false);
