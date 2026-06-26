function updateClock() {
    const clockEl = document.getElementById('dashboard-clock');
    setInterval(() => {
        const now = new Date(); let hours = now.getHours(); const minutes = String(now.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM'; hours = hours % 12 || 12;
        const m = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
        clockEl.innerText = `${String(hours).padStart(2, '0')}:${minutes} ${ampm} ${m[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
    }, 1000);
}
updateClock();

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
    document.querySelector(`[onclick="openFeature(\'${currentTab}\')"]`).focus();
}

function toggleMenuOverlay() {
    const menu = document.getElementById('menu-overlay'); const txt = document.getElementById('txt-toggle-menu');
    if (menu.style.transform === 'translateX(-100%)') { menu.style.transform = 'translateX(0)'; txt.innerText = "Ocultar Menu"; } 
    else { menu.style.transform = 'translateX(-100%)'; txt.innerText = "Exibir Menu"; }
}

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
                launchStream(`${creds.server}/live/${creds.user}/${creds.pass}/${item.stream_id}.m3u8`);
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
                    <img src="${posterImg}" onerror="this.src='${defLogo}'" class="object-cover w-full h-full">
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
