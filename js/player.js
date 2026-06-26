let clapprPlayer = null;

function launchStream(url) {
    document.getElementById('player-placeholder').style.display = 'none'; 
    if (clapprPlayer) clapprPlayer.destroy();

    clapprPlayer = new Clappr.Player({ 
        source: url, 
        parentId: "#player-wrapper", 
        width: '100%', 
        height: '100%', 
        autoPlay: true,
        playback: {
            hlsjsConfig: {
                // Intercepta requisições de fragmentos (.ts) do HLS para evitar bloqueio misto
                xhrSetup: function(xhr, segmentUrl) {
                    if (window.location.protocol === 'https:' && segmentUrl.startsWith('http:')) {
                        const proxiedSegment = `https://corsproxy.io/?${encodeURIComponent(segmentUrl)}`;
                        xhr.open('GET', proxiedSegment, true);
                    }
                }
            }
        }
    });

    document.getElementById('menu-overlay').style.transform = 'translateX(-100%)';
    document.getElementById('txt-toggle-menu').innerText = "Exibir Menu";
}

function handleVideoAreaClick() { 
    const menu = document.getElementById('menu-overlay'); 
    if (menu.style.transform === 'translateX(-100%)') toggleMenuOverlay(); 
}