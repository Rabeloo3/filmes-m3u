let clapprPlayer = null;

function launchStream(url) {
    const placeholder = document.getElementById('player-placeholder');
    if (placeholder) placeholder.style.display = 'none'; 
    
    // Parada segura para evitar vazamento de buffer de áudio em background
    if (clapprPlayer) {
        try { clapprPlayer.stop(); } catch(e) {}
        try { clapprPlayer.destroy(); } catch(e) {}
        clapprPlayer = null;
    }

    // Identifica com precisão se o link trata-se de Live/HLS ou arquivo direto (MP4/MKV)
    const isHls = url.includes('.m3u8') || url.includes('/live/');

    clapprPlayer = new Clappr.Player({ 
        source: url, 
        parentId: "#player-wrapper", 
        width: '100%', 
        height: '100%', 
        autoPlay: true,
        // Força a engine correta independentemente do proxy mascarar a URL
        mimeType: isHls ? 'application/x-mpegURL' : 'video/mp4',
        playback: {
            playInline: true,
            crossOrigin: 'anonymous',
            hlsjsConfig: {
                debug: false,
                enableWorker: true,
                lowLatencyMode: true,
                // Intercepta requisições de fragmentos (.ts) internas da lista e aplica o proxy
                xhrSetup: function(xhr, segmentUrl) {
                    if (window.location.protocol === 'https:' && segmentUrl.startsWith('http:')) {
                        const proxiedSegment = `https://corsproxy.io/?${encodeURIComponent(segmentUrl)}`;
                        xhr.open('GET', proxiedSegment, true);
                    }
                }
            }
        }
    });

    const menu = document.getElementById('menu-overlay');
    if (menu) menu.style.transform = 'translateX(-100%)';
    
    const txtToggle = document.getElementById('txt-toggle-menu');
    if (txtToggle) txtToggle.innerText = "Exibir Menu";
}

function handleVideoAreaClick() { 
    const menu = document.getElementById('menu-overlay'); 
    if (menu && menu.style.transform === 'translateX(-100%)') toggleMenuOverlay(); 
}