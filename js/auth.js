// ==========================================
// ARQUIVO: js/auth.js
// ==========================================

async function handleManualLogin(e) {
    // Evita o recarregamento da página ao submeter o formulário
    if (e) e.preventDefault();
    
    // FORÇA A TELA CHEIA NO MOMENTO DO CLIQUE EM "ENTRAR"
    if (typeof requestFullScreen === 'function') {
        requestFullScreen(); 
    }
    
    // Captura os elementos de input (ajuste os IDs conforme seu index.html)
    const serverInput = document.getElementById('server');
    const userInput = document.getElementById('username');
    const passInput = document.getElementById('password');

    if (!serverInput || !userInput || !passInput) {
        console.error("Campos de login não encontrados no HTML.");
        return;
    }

    // Pega os valores digitados
    const server = serverInput.value.trim().replace(/\/$/, '');
    const user = userInput.value.trim();
    const pass = passInput.value.trim();
    
    console.log("Tentando login no servidor:", server);
    
    // Aqui você chama a sua função real de login (provavelmente do api.js)
    // Exemplo: await executeLogin(server, user, pass);
}

function checkPersistentSession() {
    // Aqui vai a sua lógica de auto-login usando localStorage.
    // Lembre-se: a tela cheia NÃO vai funcionar automaticamente aqui, 
    // ela será ativada no keyboard.js ao primeiro toque no controle.
    console.log("Checando sessão salva...");
}

// Associa o evento de submit ao formulário (ajuste o ID do form se necessário)
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', handleManualLogin);
}
