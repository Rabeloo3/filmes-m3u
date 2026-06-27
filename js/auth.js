// Função auxiliar de espera (Delay)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function togglePasswordVisibility() {
    const passInput = document.getElementById('password'); 
    const eyeIcon = document.getElementById('password-eye-icon');
    if (passInput.type === 'password') { 
        passInput.type = 'text'; 
        eyeIcon.className = 'fa-solid fa-eye-slash text-sm'; 
    } else { 
        passInput.type = 'password'; 
        eyeIcon.className = 'fa-solid fa-eye text-sm'; 
    }
}

async function handleManualLogin(e) {
    e.preventDefault();
    const server = document.getElementById('server').value.trim().replace(/\/$/, '');
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();
    await executeLogin(server, user, pass);
}

async function executeLogin(server, user, pass) {
    const btn = document.getElementById('btn-login'); 
    const errorBox = document.getElementById('login-error');
    const loadingScreen = document.getElementById('loading-screen');
    const loginScreen = document.getElementById('login-screen');
    const dashboardScreen = document.getElementById('dashboard-screen');
    
    errorBox.classList.add('hidden'); 
    btn.disabled = true;

    try {
        // 1. Marca a hora exata de inicio
        const startTime = Date.now();
        
        // 2. Mostra TELA DE LOADING INSTANTÂNEO com nome RABELO IPTV
        loginScreen.classList.add('hidden');
        loadingScreen.classList.remove('hidden');

        // 3. Processa requisição em segundo plano
        const res = await fetchWithFallback(`${server}/player_api.php?username=${user}&password=${pass}`);
        if (!res || (res.user_info && res.user_info.auth === 0)) {
            throw new Error("Usuário ou senha incorretos.");
        }

        creds = { server, user, pass };
        localStorage.setItem('smarters_web_session', JSON.stringify(creds));

        if (res.user_info.exp_date) {
            const d = new Date(res.user_info.exp_date * 1000); 
            const m = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
            document.getElementById('info-expiration').innerText = `Expiração: ${d.getDate()} de ${m[d.getMonth()]} de ${d.getFullYear()}`;
        } else {
            document.getElementById('info-expiration').innerText = `Expiração: Ilimitado`;
        }
        
        document.getElementById('info-username').innerText = `Conectado: ${user}`;
        
        // 4. Calcula o tempo decorrido e garante os 5 SEGUNDOS MÍNIMOS
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime < 5000) {
            await sleep(5000 - elapsedTime);
        }

        // 5. Libera o dashboard
        loadingScreen.classList.add('hidden');
        dashboardScreen.classList.remove('hidden');

        setTimeout(() => {
            const liveBtn = document.querySelector('[onclick="openFeature(\'live\')"]');
            if(liveBtn) liveBtn.focus();
        }, 200);

    } catch (err) {
        // Se der erro, volta pra tela de login e esconde loading
        loadingScreen.classList.add('hidden');
        loginScreen.classList.remove('hidden');
        errorBox.innerText = err.message || "Erro ao conectar com o servidor."; 
        errorBox.classList.remove('hidden');
    } finally {
        btn.disabled = false; 
    }
}

/* ==========================================================================
   LÓGICA DE SESSÃO PERMANENTE (Carregamento Mínimo 5 Segundos)
========================================================================== */
async function checkPersistentSession() {
    const saved = localStorage.getItem('smarters_web_session');
    const loadingScreen = document.getElementById('loading-screen');
    const loginScreen = document.getElementById('login-screen');
    const dashboardScreen = document.getElementById('dashboard-screen');
    
    if (saved) {
        try {
            const cachedCreds = JSON.parse(saved);
            if (cachedCreds.server && cachedCreds.user && cachedCreds.pass) {
                creds = cachedCreds;

                // 1. Preenche login por trás e ativa loading instantaneamente
                document.getElementById('server').value = creds.server;
                document.getElementById('username').value = creds.user;
                document.getElementById('password').value = creds.pass;
                
                loginScreen.classList.add('hidden');
                loadingScreen.classList.remove('hidden');

                document.getElementById('info-username').innerText = `Conectado: ${creds.user}`;
                document.getElementById('info-expiration').innerText = `Expiração: Verificando...`;
                
                // 2. Registra o tempo
                const startTime = Date.now();

                // 3. Valida a conta no servidor IPTV e aguarda retorno
                await validarSessaoComLoading(creds);

                // 4. Garante que fique 5 segundos rodando o loading, mesmo se validar rápido
                const elapsedTime = Date.now() - startTime;
                if (elapsedTime < 5000) {
                    await sleep(5000 - elapsedTime);
                }
                
                // 5. Finaliza e exibe o dashboard
                loadingScreen.classList.add('hidden');
                dashboardScreen.classList.remove('hidden');

                setTimeout(() => {
                    const liveBtn = document.querySelector('[onclick="openFeature(\'live\')"]');
                    if(liveBtn) liveBtn.focus();
                }, 150);
                return;
            }
        } catch(e) { 
            localStorage.removeItem('smarters_web_session'); 
        }
    }
    
    // Se não tinha nada salvo ou falhou, deixa no login
    loadingScreen.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    document.getElementById('server').focus();
}

async function validarSessaoComLoading(c) {
    try {
        const res = await fetchWithFallback(`${c.server}/player_api.php?username=${c.user}&password=${c.pass}`);
        
        // Se a senha mudou ou conta expirou explicitamente
        if (!res || (res.user_info && res.user_info.auth === 0)) {
            localStorage.removeItem('smarters_web_session');
            alert("Sua conta IPTV expirou ou a senha foi alterada. Por favor, faça login novamente.");
            location.reload();
            return;
        }

        if (res.user_info.exp_date) {
            const d = new Date(res.user_info.exp_date * 1000); 
            const m = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
            document.getElementById('info-expiration').innerText = `Expiração: ${d.getDate()} de ${m[d.getMonth()]} de ${d.getFullYear()}`;
        } else {
            document.getElementById('info-expiration').innerText = `Expiração: Ilimitado`;
        }

    } catch (err) {
        document.getElementById('info-expiration').innerText = `Expiração: Modo Offline`;
    }
}

function logout() {
    if (confirm("Tem certeza que deseja desconectar esta conta?")) {
        if (typeof clapprPlayer !== 'undefined' && clapprPlayer) clapprPlayer.destroy();
        closeSeriesModal(); 
        
        localStorage.removeItem('smarters_web_session');
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
