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

// Controla as mensagens dinâmicas e a animação da barra de progresso premium
async function runVisualLoadingEngine(durationMs) {
    const bar = document.getElementById('loading-bar');
    const txt = document.getElementById('loading-text');

    const phrases = [
        "A estabelecer ligação segura...",
        "A autenticar conta com o servidor...",
        "A carregar lista de canais...",
        "A mapear catálogo de Filmes...",
        "A atualizar as Séries recentes...",
        "Quase pronto, a preparar painel..."
    ];

    bar.style.width = '0%';
    let start = Date.now();
    let phraseIdx = 0;

    txt.innerText = phrases[phraseIdx];

    // Atualiza a barra a cada 50 milissegundos para ficar ultra fluida
    while (Date.now() - start < durationMs) {
        let elapsed = Date.now() - start;
        let percentage = Math.min((elapsed / durationMs) * 100, 98); // Trava em 98% até a API responder por completo
        bar.style.width = `${percentage}%`;

        // Troca de frases a cada 1.2 segundos
        let currentPhraseStep = Math.floor(elapsed / 1200);
        if (currentPhraseStep > phraseIdx && phrases[currentPhraseStep]) {
            phraseIdx = currentPhraseStep;
            txt.style.opacity = 0;
            await sleep(150);
            txt.innerText = phrases[phraseIdx];
            txt.style.opacity = 1;
        }
        await sleep(50);
    }

    // Conclusão imediata
    bar.style.width = '100%';
    txt.innerText = "Sistema carregado!";
    await sleep(200);
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
        const startTime = Date.now();

        // 1. Ativa a tela de loading instantaneamente
        loadingScreen.classList.remove('fade-out');
        loadingScreen.classList.remove('hidden');
        loginScreen.classList.add('hidden');

        // Dispara a animação visual em paralelo com a requisição da API
        const loadingVisualPromise = runVisualLoadingEngine(5000);

        // 2. Faz o pedido à API por baixo dos panos
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

        // 3. Garante que os efeitos visuais e o tempo de 5s terminaram
        await loadingVisualPromise;
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime < 5000) {
            await sleep(5000 - elapsedTime);
        }

        // 4. Fade-Out Premium antes de ocultar completamente
        loadingScreen.classList.add('fade-out');
        dashboardScreen.classList.remove('hidden');

        setTimeout(() => {
            loadingScreen.classList.add('hidden');
            const liveBtn = document.querySelector('[onclick="openFeature(\'live\')"]');
            if (liveBtn) liveBtn.focus();
        }, 600); // tempo exato da transição do fade-out

    } catch (err) {
        loadingScreen.classList.add('hidden');
        loginScreen.classList.remove('hidden');
        errorBox.innerText = err.message || "Erro ao conectar com o servidor.";
        errorBox.classList.remove('hidden');
    } finally {
        btn.disabled = false;
    }
}

/* ==========================================================================
   LÓGICA DE RETORNO AUTOMÁTICO (Auto-Login ao Ligar no outro dia)
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

                document.getElementById('server').value = creds.server;
                document.getElementById('username').value = creds.user;
                document.getElementById('password').value = creds.pass;

                // Ativa instantaneamente o loading na inicialização da TV
                loadingScreen.classList.remove('fade-out');
                loadingScreen.classList.remove('hidden');
                loginScreen.classList.add('hidden');

                document.getElementById('info-username').innerText = `Conectado: ${creds.user}`;
                document.getElementById('info-expiration').innerText = `Expiração: Verificando...`;

                const startTime = Date.now();
                const loadingVisualPromise = runVisualLoadingEngine(5000);

                // Valida os dados salvos em background
                await validarSessaoComLoading(creds);

                // Aguarda fechar os 5 segundos mínimos
                await loadingVisualPromise;
                const elapsedTime = Date.now() - startTime;
                if (elapsedTime < 5000) {
                    await sleep(5000 - elapsedTime);
                }

                // Saída fluida com esmaecimento
                loadingScreen.classList.add('fade-out');
                dashboardScreen.classList.remove('hidden');

                setTimeout(() => {
                    loadingScreen.classList.add('hidden');
                    const liveBtn = document.querySelector('[onclick="openFeature(\'live\')"]');
                    if (liveBtn) liveBtn.focus();
                }, 600);
                return;
            }
        } catch (e) {
            localStorage.removeItem('smarters_web_session');
        }
    }

    loadingScreen.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    document.getElementById('server').focus();
}

async function validarSessaoComLoading(c) {
    try {
        const res = await fetchWithFallback(`${c.server}/player_api.php?username=${c.user}&password=${c.pass}`);
        if (!res || (res.user_info && res.user_info.auth === 0)) {
            localStorage.removeItem('smarters_web_session');
            alert("Sua conta expirou ou os dados mudaram. Faça o login novamente.");
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