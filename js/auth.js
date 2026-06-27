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
    
    errorBox.classList.add('hidden'); 
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Autenticando...`;

    try {
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
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('dashboard-screen').classList.remove('hidden');

        setTimeout(() => {
            const liveBtn = document.querySelector('[onclick="openFeature(\'live\')"]');
            if(liveBtn) liveBtn.focus();
        }, 200);

    } catch (err) {
        errorBox.innerText = err.message || "Erro ao conectar com o servidor."; 
        errorBox.classList.remove('hidden');
    } finally {
        btn.disabled = false; 
        btn.innerHTML = `<span>Entrar no Servidor</span><i class="fa-solid fa-arrow-right text-xs"></i>`;
    }
}

/* ==========================================================================
   NOVA LÓGICA DE SESSÃO PERMANENTE (ABERTURA INSTANTÂNEA)
========================================================================== */
function checkPersistentSession() {
    const saved = localStorage.getItem('smarters_web_session');
    
    if (saved) {
        try {
            const cachedCreds = JSON.parse(saved);
            if (cachedCreds.server && cachedCreds.user && cachedCreds.pass) {
                creds = cachedCreds;

                // 1. Preenche os campos de login invisivelmente por trás
                document.getElementById('server').value = creds.server;
                document.getElementById('username').value = creds.user;
                document.getElementById('password').value = creds.pass;

                // 2. LIBERA O PAINEL NA HORA (Sem esperar a internet carregar)
                document.getElementById('info-username').innerText = `Conectado: ${creds.user}`;
                document.getElementById('info-expiration').innerText = `Expiração: Verificando...`;
                
                document.getElementById('login-screen').classList.add('hidden');
                document.getElementById('dashboard-screen').classList.remove('hidden');

                setTimeout(() => {
                    const liveBtn = document.querySelector('[onclick="openFeature(\'live\')"]');
                    if(liveBtn) liveBtn.focus();
                }, 150);

                // 3. Valida silenciosamente se a conta ainda existe no servidor IPTV
                validarSessaoSilenciosa(creds);
                return;
            }
        } catch(e) { 
            localStorage.removeItem('smarters_web_session'); 
        }
    }
    
    // Se não tinha nada salvo, coloca o cursor no campo de Servidor
    document.getElementById('server').focus();
}

async function validarSessaoSilenciosa(c) {
    try {
        const res = await fetchWithFallback(`${c.server}/player_api.php?username=${c.user}&password=${c.pass}`);
        
        // Só desloga se o servidor responder explicitamente que a senha mudou (auth === 0)
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
        // Se a internet falhar ou o proxy cair, ELE NÃO DESLOGA MAIS O USUÁRIO!
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