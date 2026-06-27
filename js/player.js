let clapprPlayer = null;

function launchStream(url) {
    const placeholder = document.getElementById('player-placeholder');
    if (placeholder) placeholder.style.display = 'none'; 
    
    if (clapprPlayer) {
        try { clapprPlayer.destroy(); } catch(e) {}
    }

    // Configuração otimizada com aceleração de hardware para TVs embarcadas
    clapprPlayer = new Clappr.Player({ 
        source: url, 
        parentId: "#player-wrapper", 
        width: '100%', 
        height: '100%', 
        autoPlay: true,
        playback: {
            playInline: true,
            recycleVideo: true
        }
    });

    const navContainer = document.getElementById('navigation-container');
    if (navContainer) navContainer.style.display = 'none';

    const btnBack = document.getElementById('btn-back-player');
    if (btnBack) btnBack.classList.remove('hidden');
}

function exitPlayerMode() {
    if (clapprPlayer) {
        try { clapprPlayer.pause(); } catch(e) {}
    }
    const navContainer = document.getElementById('navigation-container');
    if (navContainer) navContainer.style.display = 'block';

    const btnBack = document.getElementById('btn-back-player');
    if (btnBack) btnBack.classList.add('hidden');
}