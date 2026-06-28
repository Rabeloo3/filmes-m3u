let clapprPlayer = null;

function launchStream(url) {
    document.getElementById('player-placeholder').style.display = 'none'; if (clapprPlayer) clapprPlayer.destroy();
    clapprPlayer = new Clappr.Player({ source: url, parentId: "#player-wrapper", width: '100%', height: '100%', autoPlay: true });
    document.getElementById('menu-overlay').style.transform = 'translateX(-100%)';
    document.getElementById('txt-toggle-menu').innerText = "Exibir Menu";
}

function handleVideoAreaClick() { const menu = document.getElementById('menu-overlay'); if (menu.style.transform === 'translateX(-100%)') toggleMenuOverlay(); }

let mouseHideTimer;
const playerArea = document.getElementById('player-container');

playerArea.addEventListener('mousemove', () => {
    playerArea.style.cursor = 'default';
    clearTimeout(mouseHideTimer);
    
    mouseHideTimer = setTimeout(() => {
        const menu = document.getElementById('menu-overlay');
        // Só esconde a setinha se o menu lateral de canais estiver fechado
        if (menu && menu.style.transform === 'translateX(-100%)') {
            playerArea.style.cursor = 'none';
        }
    }, 2500);
});