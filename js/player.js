/* ==========================================================
   PLAYER.JS - DECODER HÍBRIDO (NATIVE TV ENGINE + CLAPPR)
========================================================== */
var clapprPlayer = null;
var videoElementNativo = null;

function launchStream(url) {
    var placeholder = document.getElementById('player-placeholder');
    if (placeholder) placeholder.style.display = 'none';

    var wrapper = document.getElementById('player-wrapper');
    var navContainer = document.getElementById('navigation-container');
    var btnBack = document.getElementById('btn-back-player');

    destruirPlayersAtivos();

    // TESTE DE ACELERAÇÃO DE HARDWARE DA TV:
    // TVs Samsung (Tizen) e Apple TV decodificam m3u8 nativamente pelo Chip gráfico.
    // Tentar empurrar Clappr via Javascript nelas estoura a memória RAM em 20 minutos.
    var testeVideo = document.createElement('video');
    var suportaHlsNativo = testeVideo.canPlayType('application/vnd.apple.mpegurl') !== '';

    if (suportaHlsNativo) {
        videoElementNativo = document.createElement('video');
        videoElementNativo.style.width = '100%';
        videoElementNativo.style.height = '100%';
        videoElementNativo.style.backgroundColor = '#000';
        videoElementNativo.autoplay = true;
        videoElementNativo.src = url;
        
        wrapper.appendChild(videoElementNativo);
        videoElementNativo.play();
    } else {
        // Fallback para TVs Android / Navegadores genéricos
        clapprPlayer = new Clappr.Player({
            source: url,
            parentId: '#player-wrapper',
            width: '100%',
            height: '100%',
            autoPlay: true,
            playback: { playInline: true }
        });
    }

    if (navContainer) navContainer.style.display = 'none';
    if (btnBack) btnBack.className = btnBack.className.replace('hidden', '');
}

function exitPlayerMode() {
    destruirPlayersAtivos();

    var navContainer = document.getElementById('navigation-container');
    var btnBack = document.getElementById('btn-back-player');

    if (navContainer) navContainer.style.display = 'block';
    if (btnBack && btnBack.className.indexOf('hidden') === -1) {
        btnBack.className += ' hidden';
    }
}

function destruirPlayersAtivos() {
    if (clapprPlayer) {
        try { clapprPlayer.destroy(); } catch(e){}
        clapprPlayer = null;
    }
    if (videoElementNativo) {
        try {
            videoElementNativo.pause();
            videoElementNativo.src = '';
            videoElementNativo.load();
            if (videoElementNativo.parentNode) videoElementNativo.parentNode.removeChild(videoElementNativo);
        } catch(e){}
        videoElementNativo = null;
    }
    var wrapper = document.getElementById('player-wrapper');
    if (wrapper) wrapper.innerHTML = '';
}