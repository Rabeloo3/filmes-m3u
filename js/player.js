let clapprPlayer = null;

/**
 * Modificada para contornar o bloqueio de Mixed Content (HTTP em HTTPS)
 * Você precisa de um serviço proxy em seu servidor ou um serviço externo configurado.
 */
function launchStream(url) {
    document.getElementById('player-placeholder').style.display = 'none'; 
    if (clapprPlayer) clapprPlayer.destroy();

    // SUBSTITUA A URL ABAIXO PELO SEU ENDPOINT DE PROXY
    // Exemplo: 'https://seu-servidor.com/proxy.php?url=' + encodeURIComponent(url)
    const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url); 

    console.log("Tentando reproduzir via proxy:", proxyUrl);

    clapprPlayer = new Clappr.Player({ 
        source: proxyUrl, // O player agora consome a versão segura (proxy)
        parentId: "#player-wrapper", 
        width: '100%', 
        height: '100%', 
        autoPlay: true 
    });
    
    document.getElementById('menu-overlay').style.transform = 'translateX(-100%)';
    document.getElementById('txt-toggle-menu').innerText = "Exibir Menu";
}

function handleVideoAreaClick() { 
    const menu = document.getElementById('menu-overlay'); 
    if (menu.style.transform === 'translateX(-100%)') toggleMenuOverlay(); 
}