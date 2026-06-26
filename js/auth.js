function togglePasswordVisibility() {
    const passInput = document.getElementById('password'); const eyeIcon = document.getElementById('password-eye-icon');
    if (passInput.type === 'password') { passInput.type = 'text'; eyeIcon.className = 'fa-solid fa-eye-slash text-sm'; } 
    else { passInput.type = 'password'; eyeIcon.className = 'fa-solid fa-eye text-sm'; }
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

        setTimeout(() => document.querySelector('[onclick="openFeature(\'live\')"]').focus(), 200);

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
        document.getElementById('server').focus();
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
