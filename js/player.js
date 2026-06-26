/**
 * player.js - Configuração completa do Clappr com Engine HLS e Proxy Privado
 */

let clapprPlayer = null;
const WORKER_URL = "https://iptv-proxy.joranmartins3.workers.dev/?url=";

function launchStream(url) {
    const placeholder = document.getElementById('player-placeholder');
    if (placeholder) placeholder.style.display = 'none'; 
    
    // Parada segura: destroi a instância anterior para limpar o buffer de memória
    if (clapprPlayer) {
        try { clapprPlayer.stop(); } catch(e) {}
        try { clapprPlayer.destroy(); } catch(e) {}
        clapprPlayer = null;
    }

    // Identifica se é HLS (Live/M3U8) ou VOD (MP4/MKV)
    const isHls = url.includes('.m3u8') || url.includes('/live/');

    clapprPlayer = new Clappr.Player({ 
        source: url, 
        parentId: "#player-wrapper", 
        width: '100%', 
        height: '100%', 
        autoPlay: true,
        // Força o tipo de MIME correto para evitar erro de decodificação
        mimeType: isHls ? 'application/x-mpegURL' : 'video/mp4',
        playback: {
            playInline: true,
            crossOrigin: 'anonymous',
            hlsjsConfig: {
                debug: false,
                enableWorker: true,
                lowLatencyMode: true,
                // Intercepta fragmentos de vídeo e redireciona pelo seu Worker (CORS Fix)
                xhrSetup: function(xhr, segmentUrl) {
                    if (window.location.protocol === 'https:' && segmentUrl.startsWith('http:')) {
                        xhr.open('GET', WORKER_URL + encodeURIComponent(segmentUrl), true);
                    }
                }
            }
        }
    });

    // Ajustes de interface
    const menu = document.getElementById('menu-overlay');
    if (menu) menu.style.transform = 'translateX(-100%)';
    
    const txtToggle = document.getElementById('txt-toggle-menu');
    if (txtToggle) txtToggle.innerText = "Exibir Menu";
}

// Função para fechar o menu ao clicar na área do vídeo
function handleVideoAreaClick() { 
    const menu = document.getElementById('menu-overlay'); 
    if (menu && menu.style.transform === 'translateX(-100%)') toggleMenuOverlay(); 
}