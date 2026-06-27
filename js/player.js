let clapprPlayer = null;

function launchStream(url) {
    document.getElementById('player-placeholder').style.display = 'none';
    if (clapprPlayer) clapprPlayer.destroy();
    clapprPlayer = new Clappr.Player({ source: url, parentId: "#player-wrapper", width: '100%', height: '100%', autoPlay: true });
}

function handleVideoAreaClick() { /* compat: nada a fazer no layout atual */ }