let creds = { server: '', user: '', pass: '' };
let clapprPlayer = null;
let currentTab = 'live'; 
let currentItems = [];
let seriesCachedData = {};

function updateClock() {
    const clockEl = document.getElementById('dashboard-clock');
    setInterval(() => {
        const now = new Date(); let hours = now.getHours(); const minutes = String(now.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM'; hours = hours % 12 || 12;
        const m = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
        if (clockEl) clockEl.innerText = `${String(hours).padStart(2, '0')}:${minutes} ${ampm} ${m[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
    }, 1000);
}
updateClock();

async function fetchWithFallback(url) {
    const proxies = [
        `https://corsproxy.io/?${encodeURIComponent(url)}`,
        `https://api.allorigins.win/get?url=${encodeURIComponent(url)}&_=${Date.now()}`
    ];
    for (let p of proxies) {
        try {
            const res = await fetch(p);
            if (res.ok) {
                const data = await res.json();
                return p.includes('allorigins') ? JSON.parse(data.contents) : data;
            }
        } catch (err) {}
    }
    throw new Error("Servidor inacessível.");
}

function togglePasswordVisibility() {
    const passInput = document.getElementById('password'); const eyeIcon = document.getElementById('password-eye-icon');
    if (passInput && eyeIcon) {
        if (passInput.type === 'password') { passInput.type = 'text'; eyeIcon.className = 'fa-solid fa-eye-slash text-sm'; } 
        else { passInput.type = 'password'; eyeIcon.className = 'fa-solid fa-eye text-sm'; }
    }
}

async function handleManualLogin(e) {
    e.preventDefault();
    const server = document.getElementById('server').value.trim().replace(/\/$/, '');
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();
    await executeLogin(server, user, pass, false);
}

async function executeLogin(server, user, pass, isAutoLogin) {
    const btn = document.getElementById('btn-login'); const errorBox = document.getElementById('login-error'); const subtitle = document.getElementById('login-status-subtitle');
    errorBox.classList.add('hidden'); btn.disabled = true;
    
    if (isAutoLogin) { subtitle.innerHTML = `<span class="text-indigo-400 font-bold">Sessão detectada!</span> Reconectando...`; btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Entrando...`; } 
    else btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Autenticando...`;

    try {
        const res = await fetchWithFallback(`${server}/player_api.php?username=${user}&password=${pass}`);
        if (!res || (res.user_info && res.user_info.auth === 0)) throw new Error("Usuário ou senha incorretos.");

        creds = { server, user, pass };
        localStorage.setItem('smarters_web_session', JSON.stringify(creds));

        if (res.user_info.exp_date) {
            const d = new Date(res.user_info.exp_date * 1000); const m = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
            document.getElementById('info-expiration').innerText = `Expiração: ${d.getDate()} de ${m[d.getMonth()]} de ${d.getFullYear()}`;
        } else document.getElementById('info-expiration').innerText = `Expiração: Ilimitado`;
        
        document.getElementById('info-username').innerText = `Conectado: ${user}`;
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('dashboard-screen').classList.remove('hidden');

        setTimeout(() => {
            const el = document.querySelector('[onclick="openFeature(\'live\')"]');
            if (el) el.focus();
        }, 200);

    } catch (err) {
        if (isAutoLogin) { localStorage.removeItem('smarters_web_session'); subtitle.innerText = "Acesse usando suas credenciais Xtream API"; }
        errorBox.innerText = err.message || "Erro ao conectar com o servidor."; errorBox.classList.remove('hidden');
    } finally {
        btn.disabled = false; btn.innerHTML = `<span>Entrar no Servidor</span><i class="fa-solid fa-arrow-right text-xs"></i>`;
    }
}

function checkPersistentSession() {
    const saved = localStorage.getItem('smarters_web_session');
    if (saved) {
        try {
            const cachedCreds = JSON.parse(saved);
            if (cachedCreds.server && cachedCreds.user) {
                document.getElementById('server').value = cachedCreds.server;
                document.getElementById('username').value = cachedCreds.user;
                document.getElementById('password').value = cachedCreds.pass;
                executeLogin(cachedCreds.server, cachedCreds.user, cachedCreds.pass, true);
            }
        } catch(e) { localStorage.removeItem('smarters_web_session'); }
    } else {
        const srv = document.getElementById('server');
        if (srv) srv.focus();
    }
}

function logout() {
    if (confirm("Tem certeza que deseja desconectar esta conta?")) {
        if (clapprPlayer) clapprPlayer.destroy();
        closeSeriesModal(); localStorage.removeItem('smarters_web_session');
        creds = { server: '', user: '', pass: '' };
        document.getElementById('inner-app-screen').classList.add('hidden');
        document.getElementById('dashboard-screen').classList.add('hidden');
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('login-form').reset();
        document.getElementById('password').type = 'password';
        document.getElementById('password-eye-icon').className = 'fa-solid fa-eye text-sm';
        document.getElementById('server').focus();
    }
}

function openFeature(type) {
    currentTab = type; document.getElementById('dashboard-screen').classList.add('hidden'); document.getElementById('inner-app-screen').classList.remove('hidden');
    const menu = document.getElementById('menu-overlay'); menu.style.transform = 'translateX(0)'; document.getElementById('txt-toggle-menu').innerText = "Ocultar Menu";
    const map = { 'live': 'TV AO VIVO', 'vod': 'FILMES', 'series': 'SÉRIES' }; document.getElementById('inner-view-title').innerText = map[type];
    loadCategories();
}

function backToDashboard() {
    if (clapprPlayer) clapprPlayer.destroy();
    document.getElementById('player-placeholder').style.display = 'flex';
    document.getElementById('inner-app-screen').classList.add('hidden');
    document.getElementById('dashboard-screen').classList.remove('hidden');
    const el = document.querySelector(`[onclick="openFeature(\'${currentTab}\')"]`);
    if (el) el.focus();
}

function toggleMenuOverlay() {
    const menu = document.getElementById('menu-overlay'); const txt = document.getElementById('txt-toggle-menu');
    if (menu.style.transform === 'translateX(-100%)') { menu.style.transform = 'translateX(0)'; txt.innerText = "Ocultar Menu"; } 
    else { menu.style.transform = 'translateX(-100%)'; txt.innerText = "Exibir Menu"; }
}

function handleVideoAreaClick() { const menu = document.getElementById('menu-overlay'); if (menu.style.transform === 'translateX(-100%)') toggleMenuOverlay(); }

async function loadCategories() {
    let act = currentTab === 'live' ? 'get_live_categories' : (currentTab === 'vod' ? 'get_vod_categories' : 'get_series_categories');
    const list = document.getElementById('categories-list'); list.innerHTML = '<div class="text-[11px] text-slate-500 text-center py-6">Carregando...</div>';
    try {
        const cats = await fetchWithFallback(`${creds.server}/player_api.php?username=${creds.user}&password=${creds.pass}&action=${act}`);
        list.innerHTML = '';
        cats.forEach((cat, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cat-item w-full flex items-center justify-between px-4 py-3 text-xs font-bold text-slate-300 cursor-pointer transition text-left focus:bg-smarters-cyan hover:bg-white/5';
            btn.innerHTML = `<span class="truncate pr-2">${cat.category_name.toUpperCase()}</span><span class="text-[10px] text-slate-500 font-medium">#</span>`;
            btn.onclick = () => { document.querySelectorAll('.cat-item').forEach(el => el.classList.remove('bg-smarters-cyan', 'text-white')); btn.classList.add('bg-smarters-cyan', 'text-white'); loadGridData(cat.category_id); };
            list.appendChild(btn); if(idx === 0) { btn.click(); btn.focus(); }
        });
    } catch (e) { list.innerHTML = '<div class="text-[11px] text-red-400 text-center py-4">Erro ao listar.</div>'; }
}

async function loadGridData(catId) {
    const grid = document.getElementById('channels-grid'); grid.innerHTML = '<div class="text-[11px] text-slate-500 text-center py-12">Buscando...</div>';
    let act = currentTab === 'live' ? 'get_live_streams' : (currentTab === 'vod' ? 'get_vod_streams' : 'get_series');
    try { currentItems = await fetchWithFallback(`${creds.server}/player_api.php?username=${creds.user}&password=${creds.pass}&action=${act}&category_id=${catId}`); renderGrid(currentItems); } 
    catch (e) { grid.innerHTML = '<div class="text-[11px] text-red-400 text-center py-12">Erro ao carregar itens.</div>'; }
}

function renderGrid(items) {
    const grid = document.getElementById('channels-grid'); grid.innerHTML = '';
    if (!Array.isArray(items) || items.length === 0) { grid.innerHTML = '<div class="text-[11px] text-slate-600 text-center py-12">Nenhum conteúdo.</div>'; return; }
    const defLogo = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%23475569" stroke-width="2"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect></svg>';

    if (currentTab === 'live') {
        grid.className = 'divide-y divide-white/[0.04] flex flex-col';
        items.forEach(item => {
            const btn = document.createElement('button'); btn.type = 'button';
            btn.className = 'channel-item w-full flex items-center gap-3 px-4 py-2.5 cursor-pointer transition text-left hover:bg-white/[0.02]';
            btn.innerHTML = `
                <div class="w-7 h-7 flex items-center justify-center bg-slate-950/40 rounded p-0.5 shrink-0 border border-white/[0.03]"><img src="${item.stream_icon || defLogo}" onerror="this.src='${defLogo}'" class="max-h-full max-w-full object-contain"></div>
                <div class="truncate flex-1"><p class="text-xs font-bold text-slate-200 truncate">${item.name}</p><p class="text-[10px] text-slate-500 font-medium truncate mt-0.5">AO VIVO</p></div>
            `;
            btn.onclick = () => {
                document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('bg-smarters-cyan')); btn.classList.add('bg-smarters-cyan');
                
                const urlPadrao = `${creds.server}/live/${creds.user}/${creds.pass}/${item.stream_id}.m3u8`;
                const fallbackXUI = `${creds.server}/${creds.user}/${creds.pass}/${item.stream_id}.m3u8`;
                const fallbackTS = `${creds.server}/live/${creds.user}/${creds.pass}/${item.stream_id}.ts`;

                launchStream(urlPadrao, [fallbackXUI, fallbackTS]);
            };
            grid.appendChild(btn);
        });
    } else {
        grid.className = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-3';
        items.forEach(item => {
            const btn = document.createElement('button'); btn.type = 'button';
            const posterImg = item.stream_icon || item.cover || defLogo;
            
            btn.className = 'channel-item poster-btn group relative flex flex-col bg-[#0d1527] border border-slate-800/80 rounded-xl overflow-hidden cursor-pointer text-left shadow-lg';
            btn.innerHTML = `
                <div class="w-full aspect-[2/3] bg-slate-950 flex items-center justify-center relative overflow-hidden">
                    <img src="${posterImg}" onerror="this.src='${defLogo}'" class="w-full h-full object-cover">
                    <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent opacity-0 group-hover:opacity-90 transition-opacity flex items-end p-2"><span class="text-[10px] font-bold text-cyan-400"><i class="fa-solid fa-play mr-1"></i> Reproduzir</span></div>
                </div>
                <div class="p-2 flex flex-col justify-between flex-1 w-full bg-[#0d1527]">
                    <p class="text-[11px] font-bold text-slate-200 line-clamp-2 leading-tight">${item.name}</p>
                </div>
            `;
            btn.onclick = () => {
                if (currentTab === 'vod') launchStream(`${creds.server}/movie/${creds.user}/${creds.pass}/${item.stream_id}.${item.container_extension || 'mp4'}`);
                else openSeriesModal(item.series_id, item.name);
            };
            grid.appendChild(btn);
        });
    }
}

function launchStream(url, fallbacks = []) {
    document.getElementById('player-placeholder').style.display = 'none'; 
    if (clapprPlayer) clapprPlayer.destroy();

    let tentativaAtual = 0;
    const listaUrls = [url, ...fallbacks];

    function tentarReproduzir(streamUrl) {
        clapprPlayer = new Clappr.Player({ 
            source: streamUrl, 
            parentId: "#player-wrapper", 
            width: '100%', 
            height: '100%', 
            autoPlay: true,
            mimeType: streamUrl.includes('.m3u8') ? 'application/x-mpegURL' : undefined,
            playback: {
                hlsjsConfig: {
                    liveSyncDurationCount: 7,
                    loader: Clappr.HLS.HLSJS.DefaultConfig.loader
                }
            }
        });

        clapprPlayer.on(Clappr.Events.PLAYER_ERROR, () => {
            tentativaAtual++;
            if (tentativaAtual < listaUrls.length) {
                console.warn(`[Auto-Fallback] Falha na rota ${tentativaAtual}. Tentando alternativa: ${listaUrls[tentativaAtual]}`);
                if (clapprPlayer) clapprPlayer.destroy();
                tentarReproduzir(listaUrls[tentativaAtual]);
            } else {
                console.error("[Erro] O servidor recusou todas as rotas de transmissão.");
                const ph = document.getElementById('player-placeholder');
                if (ph) {
                    ph.style.display = 'flex';
                    ph.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-5xl text-red-500"></i><p class="text-xs font-bold text-red-400 uppercase mt-2">Erro: Transmissão Indisponível ou Formato Incompatível</p>`;
                }
            }
        });
    }

    tentarReproduzir(listaUrls[0]);

    const menu = document.getElementById('menu-overlay');
    if (menu) menu.style.transform = 'translateX(-100%)';
    const txt = document.getElementById('txt-toggle-menu');
    if (txt) txt.innerText = "Exibir Menu";
}

async function openSeriesModal(sId, sName) {
    document.getElementById('modal-series-title').innerText = sName; const sBox = document.getElementById('modal-seasons-box'); const eBox = document.getElementById('modal-episodes-box');
    sBox.innerHTML = '...'; eBox.innerHTML = ''; document.getElementById('series-modal').classList.remove('hidden');
    try {
        const info = await fetchWithFallback(`${creds.server}/player_api.php?username=${creds.user}&password=${creds.pass}&action=get_series_info&series_id=${sId}`);
        seriesCachedData = info.episodes || {}; sBox.innerHTML = '';
        Object.keys(seriesCachedData).forEach((sNum, idx) => {
            const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'w-full text-left px-3 py-1.5 rounded text-xs font-bold text-slate-400 hover:bg-white/5'; btn.innerText = `Temporada ${sNum}`;
            btn.onclick = () => { sBox.querySelectorAll('button').forEach(b => b.className = 'w-full text-left px-3 py-1.5 rounded text-xs font-bold text-slate-400 hover:bg-white/5'); btn.className = 'w-full text-left px-3 py-1.5 rounded text-xs font-black bg-indigo-600 text-white'; renderEpisodes(sNum); };
            sBox.appendChild(btn); if(idx === 0) { btn.click(); btn.focus(); }
        });
    } catch(e) { sBox.innerHTML = 'Erro'; }
}

function renderEpisodes(sNum) {
    const box = document.getElementById('modal-episodes-box'); box.innerHTML = '';
    (seriesCachedData[sNum] || []).forEach(ep => {
        const btn = document.createElement('button'); btn.type = 'button'; 
        btn.className = 'w-full text-left bg-slate-900/60 p-2.5 rounded border border-white/[0.03] font-bold cursor-pointer truncate text-slate-300 text-xs block hover:bg-white/5'; 
        btn.innerText = ep.title || `Episódio ${ep.episode_num}`;
        btn.onclick = () => { closeSeriesModal(); launchStream(`${creds.server}/series/${creds.user}/${creds.pass}/${ep.id}.${ep.container_extension || 'mp4'}`); };
        box.appendChild(btn);
    });
}

function closeSeriesModal() { document.getElementById('series-modal').classList.add('hidden'); document.getElementById('search-channel').focus(); }
function filterChannels() { const t = document.getElementById('search-channel').value.toLowerCase(); renderGrid(currentItems.filter(c => c.name.toLowerCase().includes(t))); }

window.addEventListener('keydown', (e) => {
    const setas = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (!setas.includes(e.key)) return;

    const atual = document.activeElement;
    if (atual && atual.tagName === 'INPUT' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;

    e.preventDefault();

    const focaveis = Array.from(document.querySelectorAll('button:not([disabled]), input:not([disabled])'))
        .filter(el => el.offsetParent !== null);

    if (!atual || atual === document.body || !focaveis.includes(atual)) {
        if (focaveis.length > 0) focaveis[0].focus(); return;
    }

    const retAtual = atual.getBoundingClientRect();
    const centroAtual = { x: retAtual.left + retAtual.width / 2, y: retAtual.top + retAtual.height / 2 };

    let melhorCandidato = null;
    let menorDistancia = Infinity;

    focaveis.forEach(candidato => {
        if (candidato === atual) return;
        const retCand = candidato.getBoundingClientRect();
        const centroCand = { x: retCand.left + retCand.width / 2, y: retCand.top + retCand.height / 2 };

        let direcaoCerta = false;
        switch (e.key) {
            case 'ArrowLeft':  direcaoCerta = centroCand.x < centroAtual.x - 5; break;
            case 'ArrowRight': direcaoCerta = centroCand.x > centroAtual.x + 5; break;
            case 'ArrowUp':    direcaoCerta = centroCand.y < centroAtual.y - 5; break;
            case 'ArrowDown':  direcaoCerta = centroCand.y > centroAtual.y + 5; break;
        }

        if (direcaoCerta) {
            const dx = centroCand.x - centroAtual.x; const dy = centroCand.y - centroAtual.y;
            const distanciaPonderada = (e.key === 'ArrowLeft' || e.key === 'ArrowRight') 
                ? Math.abs(dx) + Math.abs(dy) * 4 
                : Math.abs(dy) + Math.abs(dx) * 4;

            if (distanciaPonderada < menorDistancia) {
                menorDistancia = distanciaPonderada;
                melhorCandidato = candidato;
            }
        }
    });

    if (melhorCandidato) {
        melhorCandidato.focus();
        melhorCandidato.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
});

window.addEventListener('DOMContentLoaded', checkPersistentSession);
