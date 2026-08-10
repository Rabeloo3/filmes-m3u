const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const cors = require('cors');

const app = express();

// Permite que qualquer site (como o seu painel HTML) acesse a API
app.use(cors());
app.use(express.json());

// Senha de segurança para ninguém invadir sua API
const SENHA_DA_API = "senha_secreta_123"; // Mude para uma senha sua!

// Lista inicial de hosts
let hostsAtivos = [
    {
        url: 'http://7semfronteiras.cc:80',
        user: '234567654',
        pass: '2345643'
    }
];

// Função que verifica se o host está online
async function verificarHost(hostObj) {
    try {
        const authUrl = `${hostObj.url}/player_api.php?username=${hostObj.user}&password=${hostObj.pass}`;
        const response = await axios.get(authUrl, { timeout: 8000 });
        
        if (response.data && response.data.user_info && response.data.user_info.status === 'Active') {
            return true;
        }
        return false;
    } catch (error) {
        return false;
    }
}

// Tarefa Automática (Roda a cada 30 minutos)
cron.schedule('*/30 * * * *', async () => {
    console.log("Verificando a saúde dos hosts...");
    const hostsValidos = [];

    for (const host of hostsAtivos) {
        const isOnline = await verificarHost(host);
        if (isOnline) {
            hostsValidos.push(host);
        } else {
            console.log(`[REMOVIDO] Host expirado ou offline: ${host.url}`);
        }
    }
    hostsAtivos = hostsValidos;
});

// Rota para os sites de filmes consumirem o conteúdo
app.get('/api/get-stream/:id_do_filme', (req, res) => {
    if (hostsAtivos.length === 0) {
        return res.status(503).json({ erro: "Nenhum host disponível no momento." });
    }

    const hostAtual = hostsAtivos[0];
    const { id_do_filme } = req.params;
    
    const urlDoFilme = `${hostAtual.url}/movie/${hostAtual.user}/${hostAtual.pass}/${id_do_filme}.mp4`;
    res.redirect(urlDoFilme);
});

// Rota para você adicionar um novo host (AGORA PROTEGIDA POR SENHA)
app.post('/api/adicionar-host', async (req, res) => {
    const { url, user, pass, senha_api } = req.body;

    // Verifica se a pessoa mandou a senha certa da API
    if (senha_api !== SENHA_DA_API) {
        return res.status(401).json({ erro: "Acesso Negado! Senha da API incorreta." });
    }

    if (!url || !user || !pass) {
        return res.status(400).json({ erro: "Faltam dados. Envie url, user, pass e a senha_api." });
    }

    const novoHost = { url, user, pass };
    const isValid = await verificarHost(novoHost);

    if (isValid) {
        hostsAtivos.push(novoHost);
        res.json({ mensagem: "Host testado e adicionado com sucesso!", total_hosts: hostsAtivos.length });
    } else {
        res.status(400).json({ erro: "Este host está offline ou os dados estão incorretos." });
    }
});

// Inicia a API (process.env.PORT é necessário para servidores em nuvem)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`API rodando na porta ${PORT}`);
});
