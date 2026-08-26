<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

$configFile = 'config.json';
$config = file_exists($configFile) ? json_decode(file_get_contents($configFile), true) : [];

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$usuario = preg_replace('/[^a-zA-Z0-9_]/', '', (string)($_GET['usuario'] ?? $_POST['usuario'] ?? ''));

function registrarLog($msg) {
    @file_put_contents('pagamento_log.txt', date('c') . " | $msg\n", FILE_APPEND);
}

// ==================== GERADOR DE PIX BR CODE (100% LOCAL - SEM API) ====================
function tlv($id, $value) {
    return $id . str_pad(strlen($value), 2, '0', STR_PAD_LEFT) . $value;
}

function crc16Pix($payload) {
    $crc = 0xFFFF;
    for ($i = 0; $i < strlen($payload); $i++) {
        $crc ^= (ord($payload[$i]) << 8);
        for ($j = 0; $j < 8; $j++) {
            if ($crc & 0x8000) {
                $crc = (($crc << 1) ^ 0x1021) & 0xFFFF;
            } else {
                $crc = ($crc << 1) & 0xFFFF;
            }
        }
    }
    return $crc;
}

function gerarPixBRCode($chave, $valor, $nome, $cidade, $txid = '***') {
    $gui = tlv('00', 'br.gov.bcb.pix');
    $chaveField = tlv('01', $chave);
    $merchantInfo = tlv('26', $gui . $chaveField);
    
    $payload = 
        tlv('00', '01') .
        $merchantInfo .
        tlv('52', '0000') .
        tlv('53', '986') .
        tlv('54', number_format($valor, 2, '.', '')) .
        tlv('58', 'BR') .
        tlv('59', substr(removeAcentos($nome), 0, 25)) .
        tlv('60', substr(removeAcentos($cidade), 0, 15)) .
        tlv('62', tlv('05', substr($txid, 0, 25))) .
        '6304';
    
    $crc = crc16Pix($payload);
    return $payload . strtoupper(str_pad(dechex($crc), 4, '0', STR_PAD_LEFT));
}

function removeAcentos($s) {
    $a = ['À'=>'A','Á'=>'A','Â'=>'A','Ã'=>'A','Ä'=>'A','Å'=>'A','È'=>'E','É'=>'E','Ê'=>'E','Ë'=>'E','Ì'=>'I','Í'=>'I','Î'=>'I','Ï'=>'I','Ò'=>'O','Ó'=>'O','Ô'=>'O','Õ'=>'O','Ö'=>'O','Ù'=>'U','Ú'=>'U','Û'=>'U','Ü'=>'U','Ç'=>'C','à'=>'a','á'=>'a','â'=>'a','ã'=>'a','ä'=>'a','å'=>'a','è'=>'e','é'=>'e','ê'=>'e','ë'=>'e','ì'=>'i','í'=>'i','î'=>'i','ï'=>'i','ò'=>'o','ó'=>'o','ô'=>'o','õ'=>'o','ö'=>'o','ù'=>'u','ú'=>'u','û'=>'u','ü'=>'u','ç'=>'c'];
    return strtoupper(strtr($s, $a));
}

// ==================== ANTI-DUPLICAÇÃO ====================
function jaFoiProcessado($corr) {
    $pagFile = 'pagamentos_pendentes.json';
    if (!file_exists($pagFile)) return false;
    $pags = json_decode(file_get_contents($pagFile), true) ?: [];
    return isset($pags[$corr]) && ($pags[$corr]['status'] ?? '') === 'pago';
}

function processarPagamentoConfirmado($corr, $origem = 'admin') {
    if (jaFoiProcessado($corr)) {
        return ['status' => 'ja_processado', 'corr' => $corr];
    }
    
    $parts = explode('_', $corr);
    $user = $parts[0] ?? '';
    $meses = 1;
    foreach ($parts as $p) {
        if (preg_match('/^m(\d+)$/', $p, $m)) { $meses = intval($m[1]); break; }
    }
    
    if (empty($user)) {
        return ['erro' => 'usuario_invalido_no_corr'];
    }
    
    $userFile = 'usuarios/' . $user . '.json';
    if (!file_exists($userFile)) {
        return ['erro' => 'usuario_nao_encontrado', 'usuario' => $user];
    }
    
    $dados = json_decode(file_get_contents($userFile), true);
    $agora = time();
    $plano = $dados['plano'] ?? null;
    
    if ($plano && isset($plano['expira']) && strtotime($plano['expira']) > $agora) {
        $nova = strtotime($plano['expira']) + ($meses * 30 * 86400);
    } else {
        $nova = $agora + ($meses * 30 * 86400);
    }
    
    $valor = 0;
    $pagFile = 'pagamentos_pendentes.json';
    if (file_exists($pagFile)) {
        $pags = json_decode(file_get_contents($pagFile), true);
        if (isset($pags[$corr])) $valor = floatval($pags[$corr]['valor'] ?? 0);
    }
    
    $dados['plano'] = [
        'ativo' => true, 'tipo' => 'pago',
        'expira' => date('c', $nova),
        'meses' => ($plano['meses'] ?? 0) + $meses,
        'renovado_em' => date('c')
    ];
    $dados['pagamentos'][] = [
        'meses' => $meses, 'valor' => $valor,
        'transaction_id' => $corr, 'correlation_id' => $corr,
        'data' => date('c'), 'metodo' => 'pix_selfhosted_' . $origem
    ];
    $dados['atualizado'] = date('c');
    
    if (!file_put_contents($userFile, json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT))) {
        return ['erro' => 'falha_salvar_usuario'];
    }
    
    if (file_exists($pagFile)) {
        $pags = json_decode(file_get_contents($pagFile), true);
        if (isset($pags[$corr])) {
            $pags[$corr]['status'] = 'pago';
            $pags[$corr]['pago_em'] = date('c');
            $pags[$corr]['processado_em'] = date('c');
            $pags[$corr]['confirmado_por'] = $origem;
            file_put_contents($pagFile, json_encode($pags, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        }
    }
    
    // Marcar notificação como resolvida
    $notifFile = 'notificacoes_admin.json';
    if (file_exists($notifFile)) {
        $notifs = json_decode(file_get_contents($notifFile), true) ?: [];
        foreach ($notifs as $id => $n) {
            if (($n['correlation_id'] ?? '') === $corr) {
                $notifs[$id]['lida'] = true;
                $notifs[$id]['resolvida_em'] = date('c');
                $notifs[$id]['resolvida_por'] = $origem;
            }
        }
        file_put_contents($notifFile, json_encode($notifs, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    }
    
    registrarLog("PROCESSADO | user=$user | meses=$meses | valor=$valor | origem=$origem | expira=" . date('c', $nova));
    
    return [
        'status' => 'processado', 'usuario' => $user, 'meses' => $meses,
        'nova_expira' => date('c', $nova), 'valor' => $valor, 'corr' => $corr
    ];
}

// ==================== VALIDAÇÕES ====================
$acoesSemUsuario = ['check_all', 'limpar_expirados', 'admin_listar_pendentes', 'criar_admin_token'];
if (!in_array($action, $acoesSemUsuario)) {
    if (empty($usuario)) { echo json_encode(['erro' => 'Usuário obrigatório']); exit; }
    $userFile = 'usuarios/' . $usuario . '.json';
    if (!file_exists($userFile)) { echo json_encode(['erro' => 'Usuário não encontrado']); exit; }
}

// ==================== CRIAR COBRANÇA ====================
if ($action === 'criar') {
    $meses = max(1, min(24, intval($_GET['meses'] ?? 1)));
    $valor = $meses * ($config['valor_mensal'] ?? 1.00);
    
    $chave = trim($config['pix_chave'] ?? '');
    if (empty($chave)) {
        echo json_encode(['erro' => 'Chave Pix não configurada. Configure em config.json (pix_chave, pix_nome, pix_cidade)']);
        exit;
    }
    
    $nomeRecebedor = $config['pix_nome'] ?? 'RABELO TV';
    $cidade = $config['pix_cidade'] ?? 'SAO PAULO';
    $txid = 'R' . substr(md5($usuario . time() . rand()), 0, 12);
    $txid = substr(preg_replace('/[^A-Za-z0-9]/', '', $txid), 0, 25);
    $correlationID = $usuario . '_m' . $meses . '_' . time() . '_' . bin2hex(random_bytes(3));
    
    try {
        $brCode = gerarPixBRCode($chave, $valor, $nomeRecebedor, $cidade, $txid);
    } catch (Exception $e) {
        registrarLog("ERRO_GERAR_PIX | user=$usuario | " . $e->getMessage());
        echo json_encode(['erro' => 'Falha ao gerar BR Code Pix: ' . $e->getMessage()]);
        exit;
    }
    
    $pagFile = 'pagamentos_pendentes.json';
    $pags = file_exists($pagFile) ? json_decode(file_get_contents($pagFile), true) : [];
    $pags[$correlationID] = [
        'usuario' => $usuario,
        'meses' => $meses,
        'valor' => $valor,
        'status' => 'pendente',
        'criado' => date('c'),
        'expira' => date('c', time() + 3600),
        'brcode' => $brCode,
        'txid' => $txid,
        'chave_pix' => substr($chave, 0, 6) . '***'
    ];
    file_put_contents($pagFile, json_encode($pags, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    
    registrarLog("CRIAR | user=$usuario | meses=$meses | valor=$valor | txid=$txid");
    
    echo json_encode([
        'status' => 'criado',
        'correlationID' => $correlationID,
        'brCode' => $brCode,
        'valor' => $valor,
        'meses' => $meses,
        'expira' => date('c', time() + 3600),
        'whatsapp' => $config['whatsapp_suporte'] ?? '5598981052109',
        'instrucoes' => "1. Copie o código Pix abaixo\n2. Abra o app do seu banco\n3. Vá em Pix → Copia e Cola\n4. Confirme o pagamento de R$ " . number_format($valor, 2, ',', '.') . "\n5. Volte aqui e clique em '✅ Já Paguei'"
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ==================== USUÁRIO MARCA COMO PAGO ====================
if ($action === 'marcar_pago') {
    $corr = $_GET['correlationID'] ?? '';
    if (empty($corr)) { echo json_encode(['erro' => 'ID obrigatório']); exit; }
    
    $pagFile = 'pagamentos_pendentes.json';
    if (!file_exists($pagFile)) { echo json_encode(['erro' => 'Pagamento não encontrado']); exit; }
    
    $pags = json_decode(file_get_contents($pagFile), true);
    if (!isset($pags[$corr])) { echo json_encode(['erro' => 'Pagamento não encontrado']); exit; }
    
    // SEGURANÇA: pagamento deve pertencer ao usuário
    if (($pags[$corr]['usuario'] ?? '') !== $usuario) {
        registrarLog("SEGURANCA_TENTATIVA | user=$usuario tentou marcar corr=$corr de outro");
        echo json_encode(['erro' => 'Este pagamento não é seu']);
        exit;
    }
    
    if (($pags[$corr]['status'] ?? '') === 'pago') {
        echo json_encode(['status' => 'ja_pago', 'mensagem' => '✅ Pagamento já foi confirmado!']);
        exit;
    }
    
    if (($pags[$corr]['status'] ?? '') === 'rejeitado') {
        echo json_encode(['erro' => 'Este pagamento foi rejeitado pelo administrador. Tente novamente.']);
        exit;
    }
    
    $pags[$corr]['status'] = 'aguardando_confirmacao';
    $pags[$corr]['marcado_pago_em'] = date('c');
    $pags[$corr]['marcado_por'] = $usuario;
    $pags[$corr]['ip_marcacao'] = $_SERVER['REMOTE_ADDR'] ?? 'desconhecido';
    
    file_put_contents($pagFile, json_encode($pags, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    
    // Criar notificação para admin
    $notifFile = 'notificacoes_admin.json';
    $notifs = file_exists($notifFile) ? json_decode(file_get_contents($notifFile), true) : [];
    $notifId = 'PAG_' . time() . '_' . bin2hex(random_bytes(3));
    $notifs[$notifId] = [
        'tipo' => 'pagamento_pendente',
        'usuario' => $usuario,
        'correlation_id' => $corr,
        'meses' => $pags[$corr]['meses'],
        'valor' => $pags[$corr]['valor'],
        'criado' => date('c'),
        'lida' => false,
        'mensagem' => "💰 $usuario diz que pagou R$ " . number_format($pags[$corr]['valor'], 2, ',', '.') . " por {$pags[$corr]['meses']} mês(es). Verificar extrato!"
    ];
    file_put_contents($notifFile, json_encode($notifs, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    
    registrarLog("MARCADO_PAGO | user=$usuario | corr=$corr");
    
    $ws = $config['whatsapp_suporte'] ?? '5598981052109';
    $msg = "Paguei R$ " . number_format($pags[$corr]['valor'], 2, ',', '.') . " via Pix (" . $pags[$corr]['meses'] . " mês/meses). Aguardo confirmação. ID: $corr";
    echo json_encode([
        'status' => 'aguardando_confirmacao',
        'mensagem' => '✅ Notificação enviada! O administrador irá verificar seu pagamento em alguns minutos.',
        'whatsapp' => $ws,
        'whatsapp_link' => "https://wa.me/$ws?text=" . urlencode($msg)
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ==================== VERIFICAR STATUS ====================
if ($action === 'verificar') {
    $corr = $_GET['correlationID'] ?? '';
    if (empty($corr)) { echo json_encode(['erro' => 'ID obrigatório']); exit; }
    
    if (jaFoiProcessado($corr)) {
        echo json_encode([
            'status' => 'pago',
            'pago' => true,
            'mensagem' => '✅ Pagamento confirmado! Plano ativado.'
        ]);
        exit;
    }
    
    $pagFile = 'pagamentos_pendentes.json';
    $pags = file_exists($pagFile) ? json_decode(file_get_contents($pagFile), true) : [];
    $local = $pags[$corr] ?? null;
    
    if (!$local) {
        echo json_encode(['erro' => 'Pagamento não encontrado']);
        exit;
    }
    
    $status = $local['status'] ?? 'pendente';
    
    if ($status === 'pago') {
        $resultado = processarPagamentoConfirmado($corr, 'verificacao');
        echo json_encode([
            'status' => 'pago',
            'pago' => true,
            'processado' => $resultado,
            'mensagem' => '🎉 Pagamento confirmado! Plano ativado.'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
    
    $mensagens = [
        'pendente' => '⏳ Aguardando você pagar via Pix. Use o código abaixo no seu banco.',
        'aguardando_confirmacao' => '⏳ Você marcou como pago. Aguardando o administrador confirmar (geralmente alguns minutos).',
        'rejeitado' => '❌ Pagamento rejeitado. Entre em contato com o suporte.',
        'expirado' => '⏰ Este Pix expirou (1h). Gere um novo.'
    ];
    
    echo json_encode([
        'status' => $status,
        'pago' => false,
        'local' => [
            'status' => $status,
            'valor' => $local['valor'] ?? 0,
            'meses' => $local['meses'] ?? 1,
            'criado' => $local['criado'] ?? '',
            'expira' => $local['expira'] ?? ''
        ],
        'mensagem' => $mensagens[$status] ?? 'Status: ' . $status
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ==================== HISTÓRICO DO USUÁRIO ====================
if ($action === 'historico') {
    $pagFile = 'pagamentos_pendentes.json';
    $pagsUsuario = [];
    if (file_exists($pagFile)) {
        $pags = json_decode(file_get_contents($pagFile), true) ?: [];
        foreach ($pags as $corr => $p) {
            if (($p['usuario'] ?? '') === $usuario) {
                $pagsUsuario[] = ['corr' => $corr] + $p;
            }
        }
    }
    usort($pagsUsuario, fn($a, $b) => strtotime($b['criado'] ?? '2000') - strtotime($a['criado'] ?? '2000'));
    
    echo json_encode([
        'status' => 'ok',
        'pagamentos' => $pagsUsuario
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ==================== ADMIN: LISTAR PENDENTES ====================
if ($action === 'admin_listar_pendentes') {
    $token = $_GET['token'] ?? '';
    $senhaEsperada = $config['admin_password'] ?? 'rabelo2024';
    if ($token !== md5($senhaEsperada . 'pagamentos')) {
        echo json_encode(['erro' => 'acesso_negado']);
        exit;
    }
    
    $pagFile = 'pagamentos_pendentes.json';
    $pags = file_exists($pagFile) ? json_decode(file_get_contents($pagFile), true) : [];
    
    $pendentes = [];
    foreach ($pags as $corr => $p) {
        if (in_array($p['status'] ?? '', ['aguardando_confirmacao', 'pendente'])) {
            $pendentes[] = ['corr' => $corr] + $p;
        }
    }
    usort($pendentes, fn($a, $b) => strtotime($b['marcado_pago_em'] ?? $b['criado'] ?? '2000') - strtotime($a['marcado_pago_em'] ?? $a['criado'] ?? '2000'));
    
    echo json_encode(['status' => 'ok', 'pendentes' => $pendentes], JSON_UNESCAPED_UNICODE);
    exit;
}

// ==================== CHECK_ALL (compatibilidade) ====================
if ($action === 'check_all') {
    $pagFile = 'pagamentos_pendentes.json';
    if (!file_exists($pagFile)) {
        echo json_encode(['status' => 'ok', 'verificados' => 0, 'processados' => 0, 'msg' => 'sem_pagamentos']);
        exit;
    }
    
    $pags = json_decode(file_get_contents($pagFile), true) ?: [];
    $alterado = false;
    $expirados = 0;
    
    foreach ($pags as $corr => $pag) {
        if (($pag['status'] ?? '') === 'pago') continue;
        if (isset($pag['expira']) && strtotime($pag['expira']) < time() - 86400) {
            $pags[$corr]['status'] = 'expirado';
            $pags[$corr]['expirado_em'] = date('c');
            $expirados++;
            $alterado = true;
        }
    }
    
    if ($alterado) {
        file_put_contents($pagFile, json_encode($pags, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    }
    
    echo json_encode(['status' => 'ok', 'expirados' => $expirados]);
    exit;
}

// ==================== LIMPAR EXPIRADOS ====================
if ($action === 'limpar_expirados') {
    $pagFile = 'pagamentos_pendentes.json';
    if (!file_exists($pagFile)) { echo json_encode(['status' => 'ok', 'removidos' => 0]); exit; }
    
    $pags = json_decode(file_get_contents($pagFile), true) ?: [];
    $removidos = 0;
    foreach ($pags as $corr => $p) {
        if (($p['status'] ?? '') === 'expirado' || 
            (isset($p['expira']) && strtotime($p['expira']) < time() - 7 * 86400)) {
            unset($pags[$corr]);
            $removidos++;
        }
    }
    file_put_contents($pagFile, json_encode($pags, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    echo json_encode(['status' => 'ok', 'removidos' => $removidos]);
    exit;
}

// ==================== SIMULAR (teste local) ====================
if ($action === 'simular') {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $permitido = ($ip === '127.0.0.1' || $ip === '::1');
    if (!$permitido) {
        http_response_code(403);
        echo json_encode(['erro' => 'acao_nao_permitida']);
        exit;
    }
    
    $corr = $_GET['correlationID'] ?? '';
    if (empty($corr)) { echo json_encode(['erro' => 'correlationID obrigatório']); exit; }
    
    $resultado = processarPagamentoConfirmado($corr, 'simulacao');
    echo json_encode(['status' => 'simulado', 'resultado' => $resultado]);
    exit;
}

// ==================== STATUS USUÁRIO (debug) ====================
if ($action === 'status_usuario') {
    $userFile = 'usuarios/' . $usuario . '.json';
    if (!file_exists($userFile)) { echo json_encode(['erro' => 'nao_encontrado']); exit; }
    $dados = json_decode(file_get_contents($userFile), true);
    unset($dados['senha']);
    
    $pagFile = 'pagamentos_pendentes.json';
    $pagsUsuario = [];
    if (file_exists($pagFile)) {
        $pags = json_decode(file_get_contents($pagFile), true) ?: [];
        foreach ($pags as $corr => $p) {
            if (($p['usuario'] ?? '') === $usuario) {
                $pagsUsuario[] = ['corr' => $corr] + $p;
            }
        }
    }
    
    echo json_encode([
        'status' => 'ok',
        'usuario' => $usuario,
        'plano' => $dados['plano'] ?? null,
        'total_pagamentos' => count($dados['pagamentos'] ?? []),
        'pagamentos_pendentes' => $pagsUsuario
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

echo json_encode(['erro' => 'Ação inválida', 'acoes' => ['criar', 'marcar_pago', 'verificar', 'historico', 'status_usuario']]);
?>
