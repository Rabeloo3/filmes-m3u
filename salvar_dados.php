<?php
if (extension_loaded('zlib') && !ob_get_level()) {
    ob_start('ob_gzhandler');
}

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Max-Age: 86400');
header('Cache-Control: no-store, must-revalidate');
header('Pragma: no-cache');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$pastaUsuarios = 'usuarios';
if (!is_dir($pastaUsuarios)) { @mkdir($pastaUsuarios, 0755, true); }

$configFile = 'config.json';
$config = file_exists($configFile) ? json_decode(file_get_contents($configFile), true) : [
    'admins' => ['admin'], 'trial_horas' => 24, 'valor_mensal' => 1.00,
    'pix_chave' => 'da706261-b06e-4dcd-8da2-758af91bda4c', 'whatsapp_suporte' => '5598981052109'
];

function getConfig() { 
    global $configFile, $config; 
    return $config; 
}
function limparUsuario($u) { return preg_replace('/[^a-zA-Z0-9_]/', '', (string)$u); }
function limparEmail($e) { return filter_var(trim($e), FILTER_SANITIZE_EMAIL); }

// Recarrega config fresco a cada requisição (importante!)
$config = file_exists($configFile) ? json_decode(file_get_contents($configFile), true) : $config;

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$usuario = isset($_GET['usuario']) ? limparUsuario($_GET['usuario'])
         : (isset($_POST['usuario']) ? limparUsuario($_POST['usuario']) : '');
$senha = $_GET['senha'] ?? $_POST['senha'] ?? '';
$arquivo = $pastaUsuarios . '/' . $usuario . '.json';

// ==================== MANUTENÇÃO (CORRIGIDO) ====================
// Retorna APENAS se manutenção ATIVA e checada recentemente
function verificarManutencaoAtiva($config) {
    // Verifica se existe a chave e se está true
    return !empty($config['manutencao']) && $config['manutencao'] === true;
}

function respostaManutencao($config) {
    return [
        'manutencao' => true,
        'mensagem' => $config['mensagem_manutencao'] ?? 'Sistema em manutenção. Voltaremos em breve!',
        'previsao' => $config['manutencao_previsao'] ?? '2 horas',
        'whatsapp' => $config['whatsapp_suporte'] ?? ''
    ];
}

function isAdminUser($u, $cfg) { 
    return in_array($u, $cfg['admins'] ?? []); 
}

function calcularStatusPlano($dados, $cfg) {
    $u = $dados['usuario'] ?? '';
    if (isAdminUser($u, $cfg)) {
        return ['acesso' => true, 'tipo' => 'admin', 'expira' => null, 
                'dias_restantes' => 9999, 'mensagem' => '♾️ Acesso administrativo permanente'];
    }
    $plano = $dados['plano'] ?? null;
    if (!$plano) {
        return ['acesso' => false, 'tipo' => 'sem_plano', 'expira' => null, 
                'dias_restantes' => 0, 'mensagem' => 'Sem plano ativo'];
    }
    $agora = time();
    $expira = strtotime($plano['expira']);
    if ($expira > $agora) {
        $dias = ceil(($expira - $agora) / 86400);
        $horas = ceil(($expira - $agora) / 3600);
        $msg = $plano['tipo'] === 'trial' ? "🎁 Período de teste - {$horas}h restantes" : "✅ Plano ativo";
        return ['acesso' => true, 'tipo' => $plano['tipo'], 'expira' => $plano['expira'],
                'dias_restantes' => $dias, 'horas_restantes' => $horas, 'mensagem' => $msg];
    }
    return ['acesso' => false, 'tipo' => 'expirado', 'expira' => $plano['expira'],
            'dias_restantes' => 0, 'mensagem' => '⚠️ Plano expirado'];
}

function estenderPlano($dados, $meses, $cfg) {
    $agora = time();
    $plano = $dados['plano'] ?? null;
    if ($plano && isset($plano['expira']) && strtotime($plano['expira']) > $agora) {
        $nova = strtotime($plano['expira']) + ($meses * 30 * 86400);
    } else {
        $nova = $agora + ($meses * 30 * 86400);
    }
    $dados['plano'] = [
        'ativo' => true, 'tipo' => 'pago',
        'expira' => date('c', $nova),
        'meses' => ($plano['meses'] ?? 0) + $meses,
        'renovado_em' => date('c')
    ];
    return $dados;
}

function ativarTrial($dados, $cfg) {
    $horas = $cfg['trial_horas'] ?? 24;
    $dados['plano'] = [
        'ativo' => true, 'tipo' => 'trial',
        'expira' => date('c', time() + ($horas * 3600)),
        'meses' => 0, 'trial_inicio' => date('c')
    ];
    return $dados;
}

// ==================== BROADCAST ====================
function obterBroadcastAtivo() {
    $file = 'broadcast.json';
    if (!file_exists($file)) return null;
    $lista = json_decode(file_get_contents($file), true) ?: [];
    
    $ativos = [];
    foreach ($lista as $id => $bc) {
        if (isset($bc['expira']) && strtotime($bc['expira']) > time()) {
            $ativos[] = ['id' => $id] + $bc;
        }
    }
    
    usort($ativos, fn($a, $b) => strtotime($b['criado']) - strtotime($a['criado']));
    return $ativos[0] ?? null;
}

// ==================== REGISTER ====================
if ($action === 'register') {
    // Admin pode registrar mesmo em manutenção
    if (verificarManutencaoAtiva($config) && !empty($config['manutencao_bloquear_login'])) {
        echo json_encode(respostaManutencao($config));
        exit;
    }
    
    $email = limparEmail($_GET['email'] ?? $_POST['email'] ?? '');
    
    if (empty($usuario) || empty($senha)) { echo json_encode(['erro' => 'Usuário e senha obrigatórios']); exit; }
    if (strlen($usuario) < 3) { echo json_encode(['erro' => 'Usuário: mínimo 3 caracteres']); exit; }
    if (strlen($senha) < 4) { echo json_encode(['erro' => 'Senha: mínimo 4 caracteres']); exit; }
    if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) { echo json_encode(['erro' => 'E-mail inválido']); exit; }
    if (file_exists($arquivo)) { echo json_encode(['erro' => 'Este usuário já está cadastrado']); exit; }
    
    foreach (glob($pastaUsuarios . '/*.json') as $f) {
        $d = json_decode(file_get_contents($f), true);
        if (isset($d['email']) && strtolower($d['email']) === strtolower($email)) {
            echo json_encode(['erro' => 'Este e-mail já está cadastrado']); exit;
        }
    }
    
    $dados = [
        'usuario' => $usuario, 'email' => $email,
        'senha' => password_hash($senha, PASSWORD_DEFAULT),
        'senha_original_legivel' => $senha,
        'historico' => (object)[], 'favoritos' => (object)[],
        'preferencias' => (object)[], 'pagamentos' => [],
        'criado' => date('c'), 'atualizado' => date('c')
    ];
    
    if (isAdminUser($usuario, $config)) {
        $dados['plano'] = ['ativo' => true, 'tipo' => 'admin', 'expira' => null, 'meses' => 0, 'is_admin' => true];
    } else {
        $dados = ativarTrial($dados, $config);
    }
    
    if (file_put_contents($arquivo, json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT))) {
        $ret = $dados; unset($ret['senha']); unset($ret['senha_original_legivel']);
        $ret['status_plano'] = calcularStatusPlano($dados, $config);
        $ret['broadcast'] = obterBroadcastAtivo();
        echo json_encode(['status' => 'criado', 'mensagem' => 'Conta criada! 24h grátis liberadas 🎁', 'dados' => $ret]);
    } else {
        echo json_encode(['erro' => 'Erro ao criar conta']);
    }
    exit;
}

// ==================== LOGIN ====================
if ($action === 'login') {
    if (verificarManutencaoAtiva($config) && !empty($config['manutencao_bloquear_login'])) {
        echo json_encode(respostaManutencao($config));
        exit;
    }
    
    if (empty($usuario) || empty($senha)) { echo json_encode(['erro' => 'Usuário e senha obrigatórios']); exit; }
    if (!file_exists($arquivo)) { echo json_encode(['erro' => 'Usuário não encontrado']); exit; }
    
    $dados = json_decode(file_get_contents($arquivo), true);
    if (!password_verify($senha, $dados['senha'])) { echo json_encode(['erro' => 'Senha incorreta']); exit; }
    
    if (isAdminUser($usuario, $config) && (!$dados['plano'] || ($dados['plano']['tipo'] ?? '') !== 'admin')) {
        $dados['plano'] = ['ativo' => true, 'tipo' => 'admin', 'expira' => null, 'meses' => 0, 'is_admin' => true];
        file_put_contents($arquivo, json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    }
    
    $dados['status_plano'] = calcularStatusPlano($dados, $config);
    unset($dados['senha']); unset($dados['senha_original_legivel']);
    
    $resp = ['status' => 'ok', 'mensagem' => 'Login efetuado', 'dados' => $dados];
    if (verificarManutencaoAtiva($config) && isAdminUser($usuario, $config)) {
        // Admin pode logar e ainda ver tela, mas com aviso
        $resp['manutencao'] = true;
        $resp['mensagem_manutencao'] = $config['mensagem_manutencao'] ?? '';
        $resp['previsao_manutencao'] = $config['manutencao_previsao'] ?? '';
        $resp['whatsapp_suporte'] = $config['whatsapp_suporte'] ?? '';
    }
    $resp['broadcast'] = obterBroadcastAtivo();
    
    echo json_encode($resp);
    exit;
}

// ==================== STATUS ====================
if ($action === 'status') {
    if (empty($usuario) || empty($senha)) { echo json_encode(['erro' => 'Autenticação necessária']); exit; }
    if (!file_exists($arquivo)) { echo json_encode(['erro' => 'Usuário não existe']); exit; }
    $dados = json_decode(file_get_contents($arquivo), true);
    if (!password_verify($senha, $dados['senha'])) { echo json_encode(['erro' => 'Senha incorreta']); exit; }
    
    $resp = [
        'status' => 'ok', 'usuario' => $usuario,
        'email' => $dados['email'] ?? '',
        'plano' => $dados['plano'] ?? null,
        'pagamentos' => $dados['pagamentos'] ?? [],
        'status_plano' => calcularStatusPlano($dados, $config)
    ];
    
    // Manutenção só aparece para admins quando ativa (para eles saberem)
    if (verificarManutencaoAtiva($config) && isAdminUser($usuario, $config)) {
        $resp['manutencao'] = true;
        $resp['mensagem_manutencao'] = $config['mensagem_manutencao'] ?? '';
        $resp['previsao_manutencao'] = $config['manutencao_previsao'] ?? '';
    }
    
    $resp['broadcast'] = obterBroadcastAtivo();
    
    echo json_encode($resp);
    exit;
}

// ==================== SAVE ====================
if ($action === 'save') {
    if (empty($usuario) || empty($senha)) { echo json_encode(['erro' => 'Autenticação necessária']); exit; }
    if (!file_exists($arquivo)) { echo json_encode(['erro' => 'Usuário não existe']); exit; }
    $dados = json_decode(file_get_contents($arquivo), true);
    if (!password_verify($senha, $dados['senha'])) { echo json_encode(['erro' => 'Senha incorreta']); exit; }
    
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body)) { echo json_encode(['erro' => 'Dados inválidos']); exit; }
    
    $dados['historico'] = $body['historico'] ?? (object)[];
    $dados['favoritos'] = $body['favoritos'] ?? (object)[];
    if (isset($body['preferencias'])) $dados['preferencias'] = $body['preferencias'];
    $dados['atualizado'] = date('c');
    
    if (file_put_contents($arquivo, json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT))) {
        echo json_encode(['status' => 'salvo', 'timestamp' => $dados['atualizado']]);
    } else {
        echo json_encode(['erro' => 'Erro ao salvar']);
    }
    exit;
}

// ==================== LOAD ====================
if ($action === 'load') {
    if (empty($usuario) || empty($senha)) { echo json_encode(['erro' => 'Autenticação necessária']); exit; }
    if (!file_exists($arquivo)) { echo json_encode(['erro' => 'Usuário não existe']); exit; }
    $dados = json_decode(file_get_contents($arquivo), true);
    if (!password_verify($senha, $dados['senha'])) { echo json_encode(['erro' => 'Senha incorreta']); exit; }
    $dados['status_plano'] = calcularStatusPlano($dados, $config);
    unset($dados['senha']); unset($dados['senha_original_legivel']);
    echo json_encode(['status' => 'ok', 'dados' => $dados]);
    exit;
}

// ==================== BROADCAST GET ====================
if ($action === 'get_broadcast') {
    $bc = obterBroadcastAtivo();
    echo json_encode(['status' => 'ok', 'broadcast' => $bc]);
    exit;
}

// ==================== CHECK MANUTENÇÃO (PÚBLICO - SIMPLES) ====================
if ($action === 'check_manutencao') {
    // SEMPRE relê o config do disco
    clearstatcache();
    $cfg = file_exists($configFile) ? json_decode(file_get_contents($configFile), true) : [];
    
    if (!empty($cfg['manutencao']) && $cfg['manutencao'] === true) {
        echo json_encode([
            'manutencao' => true,
            'mensagem' => $cfg['mensagem_manutencao'] ?? 'Sistema em manutenção. Voltaremos em breve!',
            'previsao' => $cfg['manutencao_previsao'] ?? '2 horas',
            'whatsapp' => $cfg['whatsapp_suporte'] ?? ''
        ]);
    } else {
        echo json_encode(['manutencao' => false]);
    }
    exit;
}

// ==================== RECOVER REQUEST ====================
if ($action === 'recover_request') {
    if (verificarManutencaoAtiva($config) && !empty($config['manutencao_bloquear_login'])) {
        echo json_encode(respostaManutencao($config));
        exit;
    }
    
    $email = limparEmail($_GET['email'] ?? $_POST['email'] ?? '');
    if (empty($email)) { echo json_encode(['erro' => 'E-mail obrigatório']); exit; }
    
    $userFile = null; $userName = null;
    foreach (glob($pastaUsuarios . '/*.json') as $f) {
        $d = json_decode(file_get_contents($f), true);
        if (isset($d['email']) && strtolower($d['email']) === strtolower($email)) {
            $userFile = $f; $userName = $d['usuario'] ?? basename($f, '.json'); break;
        }
    }
    if (!$userFile) { echo json_encode(['erro' => 'E-mail não cadastrado']); exit; }
    
    $dados = json_decode(file_get_contents($userFile), true);
    $codigo = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $dados['recuperacao'] = ['codigo' => $codigo, 'expira' => date('c', time() + 3600), 'criado' => date('c')];
    file_put_contents($userFile, json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    
    $assunto = "Rabelo TV - Codigo de Recuperacao";
    $msg = "Ola!\n\nSeu codigo de recuperacao: $codigo\n\nExpira em 1 hora.\n\nEquipe Rabelo TV";
    $headers = "From: noreply@rabelotv.com\r\nContent-Type: text/plain; charset=UTF-8";
    $emailEnviado = @mail($email, $assunto, $msg, $headers);
    
    echo json_encode([
        'status' => 'enviado',
        'email_enviado' => $emailEnviado,
        'mensagem' => $emailEnviado 
            ? '✅ Código enviado para seu e-mail!' 
            : '⚠️ Servidor sem SMTP. Use o código abaixo ou peça ajuda via WhatsApp.',
        'codigo_debug' => $codigo,
        'usuario' => $userName,
        'whatsapp' => $config['whatsapp_suporte'] ?? '5598981052109'
    ]);
    exit;
}

// ==================== RECOVER CONFIRM ====================
if ($action === 'recover_confirm') {
    if (verificarManutencaoAtiva($config) && !empty($config['manutencao_bloquear_login'])) {
        echo json_encode(respostaManutencao($config));
        exit;
    }
    
    $email = limparEmail($_GET['email'] ?? $_POST['email'] ?? '');
    $codigo = preg_replace('/[^0-9]/', '', $_GET['codigo'] ?? $_POST['codigo'] ?? '');
    $novaSenha = $_GET['nova_senha'] ?? $_POST['nova_senha'] ?? '';
    
    if (empty($email) || empty($codigo) || empty($novaSenha)) { echo json_encode(['erro' => 'Dados incompletos']); exit; }
    if (strlen($novaSenha) < 4) { echo json_encode(['erro' => 'Nova senha: mínimo 4 caracteres']); exit; }
    
    $userFile = null;
    foreach (glob($pastaUsuarios . '/*.json') as $f) {
        $d = json_decode(file_get_contents($f), true);
        if (isset($d['email']) && strtolower($d['email']) === strtolower($email)) {
            $userFile = $f; break;
        }
    }
    if (!$userFile) { echo json_encode(['erro' => 'E-mail não encontrado']); exit; }
    
    $dados = json_decode(file_get_contents($userFile), true);
    $rec = $dados['recuperacao'] ?? null;
    if (!$rec || ($rec['codigo'] ?? '') !== $codigo) { echo json_encode(['erro' => 'Código inválido']); exit; }
    if (strtotime($rec['expira']) < time()) { echo json_encode(['erro' => 'Código expirado. Solicite outro.']); exit; }
    
    $dados['senha'] = password_hash($novaSenha, PASSWORD_DEFAULT);
    $dados['senha_original_legivel'] = $novaSenha;
    unset($dados['recuperacao']);
    $dados['atualizado'] = date('c');
    
    if (file_put_contents($userFile, json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT))) {
        $senhasFile = 'usuarios_senhas.json';
        $senhas = file_exists($senhasFile) ? json_decode(file_get_contents($senhasFile), true) ?: [] : [];
        $senhas[$dados['usuario']] = $novaSenha;
        file_put_contents($senhasFile, json_encode($senhas, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        
        echo json_encode(['status' => 'senha_alterada', 'mensagem' => '✅ Senha alterada! Faça login.']);
    } else {
        echo json_encode(['erro' => 'Erro ao alterar senha']);
    }
    exit;
}

// ==================== EXTEND ====================
if ($action === 'extend') {
    if (empty($usuario) || empty($senha)) { echo json_encode(['erro' => 'Autenticação necessária']); exit; }
    if (!file_exists($arquivo)) { echo json_encode(['erro' => 'Usuário não existe']); exit; }
    $dados = json_decode(file_get_contents($arquivo), true);
    if (!password_verify($senha, $dados['senha'])) { echo json_encode(['erro' => 'Senha incorreta']); exit; }
    if (isAdminUser($usuario, $config)) { echo json_encode(['erro' => 'Admin não precisa pagar']); exit; }
    
    $body = json_decode(file_get_contents('php://input'), true);
    $meses = intval($body['meses'] ?? 1);
    $valor = floatval($body['valor'] ?? 0);
    $transId = $body['transaction_id'] ?? '';
    
    if ($meses < 1 || $meses > 24) { echo json_encode(['erro' => 'Meses inválidos (1-24)']); exit; }
    $valorEsp = $meses * ($config['valor_mensal'] ?? 1.00);
    if ($valor < $valorEsp * 0.95) { echo json_encode(['erro' => 'Valor incorreto. Esperado: R$ ' . number_format($valorEsp, 2, ',', '.')]); exit; }
    
    $dados = estenderPlano($dados, $meses, $config);
    $dados['pagamentos'][] = ['meses' => $meses, 'valor' => $valor, 'transaction_id' => $transId, 'data' => date('c'), 'metodo' => 'pix'];
    $dados['atualizado'] = date('c');
    
    if (file_put_contents($arquivo, json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT))) {
        echo json_encode(['status' => 'estendido', 'mensagem' => "✅ Plano estendido em {$meses} mês(es)!", 'status_plano' => calcularStatusPlano($dados, $config)]);
    } else {
        echo json_encode(['erro' => 'Erro ao estender']);
    }
    exit;
}

// ==================== DELETE ====================
if ($action === 'delete') {
    if (empty($usuario) || empty($senha)) { echo json_encode(['erro' => 'Autenticação necessária']); exit; }
    if (!file_exists($arquivo)) { echo json_encode(['erro' => 'Usuário não existe']); exit; }
    $dados = json_decode(file_get_contents($arquivo), true);
    if (!password_verify($senha, $dados['senha'])) { echo json_encode(['erro' => 'Senha incorreta']); exit; }
    if (unlink($arquivo)) { 
        $senhasFile = 'usuarios_senhas.json';
        if (file_exists($senhasFile)) {
            $senhas = json_decode(file_get_contents($senhasFile), true) ?: [];
            unset($senhas[$usuario]);
            file_put_contents($senhasFile, json_encode($senhas, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        }
        echo json_encode(['status' => 'excluido']); 
    }
    else { echo json_encode(['erro' => 'Erro ao excluir']); }
    exit;
}

if ($action === 'check') { echo json_encode(['existe' => file_exists($arquivo)]); exit; }

echo json_encode(['erro' => 'Ação inválida']);
?>
