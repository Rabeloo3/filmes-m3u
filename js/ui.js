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

// ==========================================
// CONTROLE DE TELAS (VIEWS)
// ==========================================
function hideAllViews() {
    ['view-categories', 'view-grid', 'view-details'].forEach(id => {
        const el = document.getElementById(id);
        el.classList.add('hidden');
        el.classList.remove('view-active');
    });
}

function showViewCategories() {
    hideAllViews();
    document.getElementById('view-categories').classList.add('view-active');
    document.getElementById('view-categories').classList.remove('hidden');
    // Foca na primeira categoria automaticamente
    setTimeout(() => { const firstBtn = document.querySelector('#categories-grid button'); if(firstBtn) firstBtn.focus(); }, 100);
}

function showViewGrid() {
    hideAllViews();
    document.getElementById('view-grid').classList.add('view-active');
    document.getElementById('view-grid').classList.remove('hidden');
    document.getElementById('search-channel').value = '';
    // Foca no primeiro item da grade
    setTimeout(() => { const firstBtn = document.querySelector('#channels-grid button'); if(firstBtn) firstBtn.focus(); }, 100);
}

function showViewDetails() {
    hideAllViews();
    document.getElementById('view-details').classList.add('view-active');
    document.getElementById('view-details').classList.remove('hidden');
    setTimeout(() => { const backBtn = document.querySelector('#view-details button'); if(backBtn) backBtn.focus(); }, 100);
}

// ==========================================
// FLUXO PRINCIPAL
// ==========================================
function openFeature(type) {
    currentTab = type; 
    document.getElementById('dashboard-screen').classList.add('hidden'); 
    document.getElementById('inner-app-screen').classList.remove('hidden');
    document.getElementById('navigation-container').style.display = 'block';
    document.getElementById('btn-back-player').classList.add('hidden');
    
    const map = { 'live': 'TV AO VIVO', 'vod': 'FILMES', 'series': 'SÉRIES' }; 
    document.getElementById('categories-title').innerText = map[type];
    
    showViewCategories();
    loadCategories();
}

function backToDashboard() {
    if (clapprPlayer) clapprPlayer.destroy();
    document.getElementById('player-placeholder').style.display = 'flex';
    document.getElementById('inner-app-screen').classList.add('hidden');
    document.getElementById('dashboard-screen').classList.remove('hidden');
    document.querySelector(`[onclick="openFeature('${currentTab}')"]`).focus();
}

function exitPlayerMode() {
    if (clapprPlayer) clapprPlayer.pause();
    document.getElementById('navigation-container').style.display = 'block';
    document.getElementById('btn-back-player').classList.add('hidden');
}

// ==========================================
// CARREGAMENTO DE DADOS
// ==========================================
const defLogo = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM0NzU1NjkiIHN0cm9rZS13aWR0aD0iMiI+PHJlY3QgeD0iMiIgeT0iNyIgd2lkdGg9IjIwIiBoZWlnaHQ9IjE1IiByeD0iMiIgcnk9IjIiPjwvcmVjdD48L3N2Zz4=';

async function loadCategories() {
    let act = currentTab === 'live' ? 'get_live_categories' : (currentTab === 'vod' ? 'get_vod_categories' : 'get_series_categories');
    const grid = document.getElementById('categories-grid'); 
    grid.innerHTML = '<div class="col-span-full text-center text-slate-500 py-12">Buscando categorias...</div>';
    
    try {
        const cats = await fetchWithFallback(`${creds.server}/player_api.php?username=${creds.user}&password=${creds.pass}&action=${act}`);
        grid.innerHTML = '';
        cats.forEach((cat) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'bg-slate-900/60 border border-slate-800 rounded-xl p-6 text-center hover:bg-indigo-600 transition group focus:bg-indigo-600 flex flex-col items-center justify-center h-32 gap-3 shadow-lg';
            
            let icon = 'fa-folder';
            if (currentTab === 'live') icon = 'fa-tv';
            else if (currentTab === 'vod') icon = 'fa-film';
            else if (currentTab === 'series') icon = 'fa-layer-group';

            btn.innerHTML = `
                <i class="fa-solid ${icon} text-3xl text-slate-500 group-hover:text-white group-focus:text-white transition"></i>
                <span class="text-xs font-bold text-slate-300 group-hover:text-white group-focus:text-white truncate w-full uppercase tracking-wide">${cat.category_name}</span>
            `;
            
            btn.onclick = () => { 
                document.getElementById('grid-title').innerText = cat.category_name;
                loadGridData(cat.category_id); 
            };
            grid.appendChild(btn);
        });
    } catch (e) { grid.innerHTML = '<div class="col-span-full text-red-400 text-center py-12">Erro ao listar categorias.</div>'; }
}

async function loadGridData(catId) {
    showViewGrid(); // Muda para a tela 2
    const grid = document.getElementById('channels-grid'); 
    grid.innerHTML = '<div class="text-[11px] text-slate-500 text-center py-12">Carregando catálogo...</div>';
    
    let act = currentTab === 'live' ? 'get_live_streams' : (currentTab === 'vod' ? 'get_vod_streams' : 'get_series');
    try { 
        currentItems = await fetchWithFallback(`${creds.server}/player_api.php?username=${creds.user}&password=${creds.pass}&action=${act}&category_id=${catId}`); 
        renderGrid(currentItems); 
    } catch (e) { grid.innerHTML = '<div class="text-[11px] text-red-400 text-center py-12">Erro ao carregar itens.</div>'; }
}

function renderGrid(items) {
    const grid = document.getElementById('channels-grid'); grid.innerHTML = '';
    if (!Array.isArray(items) || items.length === 0) { grid.innerHTML = '<div class="text-[11px] text-slate-600 text-center py-12">Nenhum conteúdo nesta categoria.</div>'; return; }
    
    if (currentTab === 'live') {
        grid.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';
        items.forEach(item => {
            const btn = document.createElement('button'); btn.type = 'button';
            btn.className = 'channel-item w-full flex items-center gap-4 bg-slate-900/60 border border-slate-800 p-4 rounded-xl cursor-pointer transition text-left hover:bg-slate-800 focus:bg-indigo-600 focus:border-indigo-400 group shadow-md';
            btn.innerHTML = `
                <div class="w-12 h-12 flex items-center justify-center bg-black/40 rounded-lg p-1 shrink-0 border border-white/5"><img src="${item.stream_icon || defLogo}" onerror="this.src='${defLogo}'" class="max-h-full max-w-full object-contain"></div>
                <div class="flex-1 overflow-hidden">
                    <p class="text-sm font-bold text-slate-200 truncate group-focus:text-white">${item.name}</p>
                    <p class="text-[10px] text-emerald-500 font-bold tracking-widest mt-1">AO VIVO</p>
                </div>
            `;
            btn.onclick = () => {
                // TV ao vivo reproduz direto, não precisa de tela de detalhes
                document.getElementById('navigation-container').style.display = 'none';
                document.getElementById('btn-back-player').classList.remove('hidden');
                launchStream(`${creds.server}/live/${creds.user}/${creds.pass}/${item.stream_id}.m3u8`);
            };
            grid.appendChild(btn);
        });
    } else {
        grid.className = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-5';
        items.forEach(item => {
            const btn = document.createElement('button'); btn.type = 'button';
            const posterImg = item.stream_icon || item.cover || defLogo; 
            
            btn.className = 'poster-btn group relative flex flex-col bg-[#0d1527] border border-slate-800/80 rounded-xl overflow-hidden cursor-pointer text-left shadow-lg h-full';
            btn.innerHTML = `
                <div class="w-full aspect-[2/3] bg-slate-950 flex items-center justify-center relative overflow-hidden shrink-0">
                    <img src="${posterImg}" onerror="this.src='${defLogo}'" class="absolute inset-0 w-full h-full object-cover">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity flex items-end p-4">
                        <span class="text-xs font-bold text-cyan-400 drop-shadow-md uppercase tracking-wider"><i class="fa-solid fa-circle-info mr-1"></i> Detalhes</span>
                    </div>
                </div>
                <div class="p-3 flex items-center w-full bg-[#0d1527] flex-grow border-t border-white/[0.02]">
                    <p class="text-[11px] font-bold text-slate-200 line-clamp-2 leading-snug" title="${item.name}">${item.name}</p>
                </div>
            `;
            // VOD e Séries vão para a tela de detalhes
            btn.onclick = () => { openDetails(item); };
            grid.appendChild(btn);
        });
    }
}

// ==========================================
// TELA DE DETALHES AVANÇADA (NÍVEL 3)
// ==========================================
async function openDetails(item) {
    showViewDetails(); // Muda para a tela 3
    
    const posterEl = document.getElementById('details-poster');
    const bgEl = document.getElementById('details-bg');
    const titleEl = document.getElementById('details-title');
    const metaEl = document.getElementById('details-meta');
    const descEl = document.getElementById('details-desc');
    const actBox = document.getElementById('details-actions');
    
    // Reseta visual
    const posterImg = item.stream_icon || item.cover || defLogo;
    posterEl.src = posterImg;
    bgEl.style.backgroundImage = `url('${posterImg}')`;
    titleEl.innerText = item.name;
    descEl.innerText = "Buscando informações do servidor...";
    metaEl.innerHTML = '';
    actBox.innerHTML = '<div class="text-sm text-cyan-400 animate-pulse"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Carregando sistema...</div>';

    try {
        if (currentTab === 'vod') {
            const info = await fetchWithFallback(`${creds.server}/player_api.php?username=${creds.user}&password=${creds.pass}&action=get_vod_info&vod_id=${item.stream_id}`);
            const data = info.info || {};
            
            descEl.innerText = data.description || "Sinopse não disponível para este filme.";
            
            // Metadados do Filme
            let metaHtml = '';
            if(data.releasedate) metaHtml += `<span><i class="fa-regular fa-calendar mr-1"></i> ${data.releasedate}</span>`;
            if(data.rating) metaHtml += `<span class="text-amber-400"><i class="fa-solid fa-star mr-1"></i> ${data.rating}/10</span>`;
            if(data.director) metaHtml += `<span><i class="fa-solid fa-video mr-1"></i> ${data.director}</span>`;
            metaEl.innerHTML = metaHtml;

            // Fundo de melhor qualidade, se existir
            if(data.backdrop_path && data.backdrop_path.length > 0) {
                bgEl.style.backgroundImage = `url('${data.backdrop_path[0]}')`;
            }

            // Botão Assistir Filme
            actBox.innerHTML = `
                <button type="button" id="btn-play-action" class="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 px-8 rounded-xl shadow-[0_0_20px_rgba(99,102,241,0.4)] transition-transform flex items-center justify-center gap-3 w-max focus:ring-4 focus:ring-white">
                    <i class="fa-solid fa-play text-xl"></i> <span>ASSISTIR AGORA</span>
                </button>
            `;
            const playBtn = document.getElementById('btn-play-action');
            playBtn.onclick = () => {
                document.getElementById('navigation-container').style.display = 'none';
                document.getElementById('btn-back-player').classList.remove('hidden');
                launchStream(`${creds.server}/movie/${creds.user}/${creds.pass}/${item.stream_id}.${info.movie_data.container_extension || 'mp4'}`);
            };
            setTimeout(() => playBtn.focus(), 150);

        } else if (currentTab === 'series') {
            const info = await fetchWithFallback(`${creds.server}/player_api.php?username=${creds.user}&password=${creds.pass}&action=get_series_info&series_id=${item.series_id}`);
            const data = info.info || {};
            
            descEl.innerText = data.plot || data.description || "Sinopse não disponível para esta série.";
            
            // Metadados da Série
            let metaHtml = `<span class="bg-indigo-600/30 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30">SÉRIE</span>`;
            if(data.releaseDate) metaHtml += `<span>${data.releaseDate}</span>`;
            if(data.rating) metaHtml += `<span class="text-amber-400"><i class="fa-solid fa-star mr-1"></i> ${data.rating}/10</span>`;
            if(data.genre) metaHtml += `<span>${data.genre}</span>`;
            metaEl.innerHTML = metaHtml;

            if(data.backdrop_path && data.backdrop_path.length > 0) {
                bgEl.style.backgroundImage = `url('${data.backdrop_path[0]}')`;
            }

            // Renderizar Temporadas e Episódios direto na tela de detalhes
            actBox.innerHTML = `
                <div class="w-full bg-black/40 border border-white/10 rounded-2xl overflow-hidden mt-2 flex flex-col md:flex-row shadow-2xl h-64">
                    <div class="w-full md:w-1/3 border-r border-white/5 bg-black/40 overflow-y-auto p-2" id="seasons-list"></div>
                    <div class="w-full md:w-2/3 overflow-y-auto p-2 bg-[#050814]/80" id="episodes-list"></div>
                </div>
            `;
            
            const sBox = document.getElementById('seasons-list');
            const eBox = document.getElementById('episodes-list');
            seriesCachedData = info.episodes || {};
            
            Object.keys(seriesCachedData).forEach((sNum, idx) => {
                const btn = document.createElement('button'); btn.type = 'button'; 
                btn.className = 'w-full text-left px-4 py-3 rounded-xl text-xs font-bold text-slate-400 hover:bg-white/10 focus:bg-indigo-600 focus:text-white transition'; 
                btn.innerText = `Temporada ${sNum}`;
                
                btn.onclick = () => { 
                    sBox.querySelectorAll('button').forEach(b => {
                        b.classList.remove('bg-indigo-600', 'text-white');
                        b.classList.add('text-slate-400');
                    }); 
                    btn.classList.add('bg-indigo-600', 'text-white');
                    btn.classList.remove('text-slate-400');
                    renderEpisodesInDetails(sNum, eBox); 
                };
                sBox.appendChild(btn); 
                
                // Clica e foca na primeira temporada por padrão
                if(idx === 0) { 
                    btn.click(); 
                    setTimeout(() => btn.focus(), 150);
                }
            });
        }
    } catch(e) {
        descEl.innerText = "Erro ao puxar dados extras do servidor.";
    }
}

function renderEpisodesInDetails(sNum, container) {
    container.innerHTML = '';
    const eps = seriesCachedData[sNum] || [];
    
    if(eps.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-500 p-4">Nenhum episódio encontrado.</p>';
        return;
    }

    eps.forEach(ep => {
        const btn = document.createElement('button'); btn.type = 'button'; 
        btn.className = 'w-full text-left bg-slate-900/60 mb-1.5 p-3.5 rounded-xl border border-white/5 cursor-pointer flex items-center justify-between hover:bg-white/10 focus:bg-cyan-600 focus:border-cyan-400 transition group'; 
        
        btn.innerHTML = `
            <div class="flex flex-col overflow-hidden pr-2">
                <span class="text-xs font-bold text-slate-200 group-focus:text-white truncate">Episódio ${ep.episode_num}: ${ep.title}</span>
                <span class="text-[10px] text-slate-500 font-medium mt-0.5"><i class="fa-regular fa-clock"></i> Reproduzir agora</span>
            </div>
            <i class="fa-solid fa-play text-slate-600 group-hover:text-cyan-400 group-focus:text-white text-sm shrink-0"></i>
        `;
        
        btn.onclick = () => { 
            document.getElementById('navigation-container').style.display = 'none';
            document.getElementById('btn-back-player').classList.remove('hidden');
            launchStream(`${creds.server}/series/${creds.user}/${creds.pass}/${ep.id}.${ep.container_extension || 'mp4'}`); 
        };
        container.appendChild(btn);
    });
}

function filterChannels() { 
    const t = document.getElementById('search-channel').value.toLowerCase(); 
    renderGrid(currentItems.filter(c => c.name.toLowerCase().includes(t))); 
}
