<?php
// proxy_iptv.php - Diagnóstico e proxy para servidores IPTV
// Resolve problemas de CORS, timeout, DNS e credenciais

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Max-Age: 86400');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// Carrega servidores.js
$servFile = 'servidores.js';
if (!file_exists($servFile)) {
    echo json_encode(['erro' => 'servidores.js nao encontrado', 'servidores' => []]);
    exit;
}

$conteudo = file_get_contents($servFile);
preg_match('/const\s+meusServidores\s*=\s*\[(.*?)\];/s', $conteudo, $m);
$jsonStr = $m[1] ?? '[]';

// Tentar parsear de forma tolerante
$servidores = [];
if (preg_match_all('/\{[^{}]*\}/', $jsonStr, $blocos)) {
    foreach ($blocos[0] as $bloco) {
        $serv = [];
        if (preg_match('/host\s*:\s*["\']([^"\']+)["\']/', $bloco, $v)) $serv['host'] = $v[1];
        if (preg_match('/user\s*:\s*["\']([^"\']+)["\']/', $bloco, $v)) $serv['user'] = $v[1];
        if (preg_match('/pass\s*:\s*["\']([^"\']+)["\']/', $bloco, $v)) $serv['pass'] = $v[1];
        if (!empty($serv['host'])) $servidores[] = $serv;
    }
}

// Parâmetros
$action = $_GET['action'] ?? '';
$idx = isset($_GET['idx']) ? intval($_GET['idx']) : -1;

if (empty($servidores)) {
    echo json_encode([
        'erro' => 'nenhum_servidor_cadastrado',
        'mensagem' => 'Adicione servidores no admin.php (aba Servidores)',
        'servidores' => []
    ]);
    exit;
}

function testarServidorCompleto($s) {
    $hostOriginal = $s['host'];
    $host = rtrim($hostOriginal, '/');
    
    // Remove porta duplicada e força formato limpo
    $host = preg_replace('#/+$#', '', $host);
    
    // Tenta múltiplos protocolos
    $tentativas = [];
    $urls = [];
    
    // Normaliza - se já tem http:// ou https:// mantém, senão tenta ambos
    if (preg_match('#^https?://#i', $host)) {
        $urls[] = $host;
    } else {
        $urls[] = 'http://' . $host;
        $urls[] = 'https://' . $host;
    }
    
    foreach ($urls as $testHost) {
        $url = $testHost . '/player_api.php?username=' . urlencode($s['user']) . '&password=' . urlencode($s['pass']);
        $inicio = microtime(true);
        
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => false,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (RabeloTV/1.0)',
            CURLOPT_HTTPHEADER => ['Accept: application/json']
        ]);
        
        $resp = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        $errno = curl_errno($ch);
        $time = round((microtime(true) - $inicio) * 1000);
        $info = curl_getinfo($ch);
        $finalUrl = $info['url'] ?? $url;
        curl_close($ch);
        
        $resultado = [
            'host' => $testHost,
            'url_testada' => $url,
            'http' => $httpCode,
            'tempo' => $time,
            'erro_curl' => $err,
            'errno' => $errno,
            'resposta_preview' => substr((string)$resp, 0, 300),
            'resposta_len' => strlen((string)$resp)
        ];
        
        if ($err) {
            $resultado['status'] = 'offline';
            $resultado['motivo'] = mapearErroCurl($errno, $err);
        } elseif ($httpCode === 200 && $resp) {
            $data = json_decode($resp, true);
            if (isset($data['user_info']['auth']) && $data['user_info']['auth'] == 1) {
                $resultado['status'] = 'online';
                $resultado['dados'] = $data;
                $tentativas[] = $resultado;
                break; // Sucesso, sai
            } elseif (isset($data['user_info']['status'])) {
                $resultado['status'] = 'autenticado_inativo';
                $resultado['dados'] = $data;
                $tentativas[] = $resultado;
                break;
            } else {
                $resultado['status'] = 'resposta_invalida';
            }
        } elseif ($httpCode === 401 || $httpCode === 403) {
            $resultado['status'] = 'credenciais_invalidas';
        } elseif ($httpCode === 0) {
            $resultado['status'] = 'sem_resposta';
            $resultado['motivo'] = 'Servidor nao respondeu (timeout ou DNS falhou)';
        } else {
            $resultado['status'] = 'http_' . $httpCode;
        }
        
        $tentativas[] = $resultado;
    }
    
    return [
        'host_original' => $hostOriginal,
        'user' => $s['user'],
        'tentativas' => $tentativas,
        'sucesso' => !empty($tentativas) && in_array($tentativas[count($tentativas)-1]['status'], ['online','autenticado_inativo']),
        'primeiro_status' => $tentativas[0]['status'] ?? 'desconhecido',
        'primeiro_motivo' => $tentativas[0]['motivo'] ?? '',
        'dados' => end($tentativas)['dados'] ?? null
    ];
}

function mapearErroCurl($errno, $msg) {
    $mapa = [
        1 => 'Protocolo nao suportado',
        3 => 'URL mal formatada',
        6 => 'Host nao encontrado (DNS falhou)',
        7 => 'Conexao recusada (servidor offline ou porta errada)',
        28 => 'Timeout - servidor demorou demais para responder',
        35 => 'Erro SSL/TLS no handshake',
        47 => 'Muitas redirecoes',
        52 => 'Resposta vazia do servidor',
        56 => 'Falha ao receber dados (conexao caiu)',
        58 => 'Certificado SSL invalido',
        60 => 'Certificado SSL auto-assinado',
        77 => 'Erro no certificado SSL',
        90 => 'Certificado SSL expirado'
    ];
    return $mapa[$errno] ?? $msg;
}

// ============ DIAGNÓSTICO COMPLETO ============
if ($action === 'diagnostico') {
    $resultados = [];
    foreach ($servidores as $i => $s) {
        $resultados[] = ['idx' => $i] + testarServidorCompleto($s);
    }
    echo json_encode([
        'status' => 'ok',
        'total_servidores' => count($servidores),
        'servidores_online' => count(array_filter($resultados, fn($r) => $r['sucesso'])),
        'resultados' => $resultados
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

// ============ TESTAR TODOS E RETORNAR APENAS ONLINE ============
if ($action === 'listar_online') {
    $online = [];
    foreach ($servidores as $i => $s) {
        $teste = testarServidorCompleto($s);
        if ($teste['sucesso'] && $teste['dados']) {
            $online[] = [
                'idx' => $i,
                'host' => $s['host'],
                'user' => $s['user'],
                'pass' => $s['pass'],
                'dados' => $teste['dados'],
                'protocolo' => $teste['tentativas'][count($teste['tentativas'])-1]['host'] ?? $s['host']
            ];
        }
    }
    
    echo json_encode([
        'status' => $online ? 'ok' : 'erro',
        'servidores_online' => $online,
        'total_testados' => count($servidores),
        'total_online' => count($online),
        'mensagem' => $online 
            ? count($online) . ' servidor(es) online' 
            : 'Nenhum servidor respondeu. Use action=diagnostico para detalhes.'
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

// ============ PROXY GENÉRICO (passa a chamada direto) ============
if ($action === 'proxy') {
    $apiAction = $_GET['api_action'] ?? '';
    $category_id = $_GET['category_id'] ?? '';
    $vod_id = $_GET['vod_id'] ?? '';
    $series_id = $_GET['series_id'] ?? '';
    
    if ($idx < 0 || !isset($servidores[$idx])) {
        echo json_encode(['erro' => 'idx_invalido', 'mensagem' => 'Informe idx valido do servidor']);
        exit;
    }
    
    $s = $servidores[$idx];
    $host = rtrim($s['host'], '/');
    if (!preg_match('#^https?://#i', $host)) $host = 'http://' . $host;
    
    $url = $host . '/player_api.php?username=' . urlencode($s['user']) . '&password=' . urlencode($s['pass']);
    if ($apiAction) $url .= '&action=' . urlencode($apiAction);
    if ($category_id) $url .= '&category_id=' . urlencode($category_id);
    if ($vod_id) $url .= '&vod_id=' . urlencode($vod_id);
    if ($series_id) $url .= '&series_id=' . urlencode($series_id);
    
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_USERAGENT => 'Mozilla/5.0'
    ]);
    
    $resp = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    
    if ($err) {
        echo json_encode(['erro' => 'curl', 'mensagem' => $err, 'url' => $url]);
        exit;
    }
    
    if ($httpCode !== 200) {
        echo json_encode(['erro' => 'http_' . $httpCode, 'mensagem' => "HTTP $httpCode", 'url' => $url]);
        exit;
    }
    
    $data = json_decode($resp, true);
    echo json_encode($data ?: ['erro' => 'json_invalido', 'resposta' => substr($resp, 0, 200)]);
    exit;
}

// Default - só lista
echo json_encode([
    'erro' => 'acao_invalida',
    'acoes_disponiveis' => ['diagnostico', 'listar_online', 'proxy'],
    'servidores_cadastrados' => count($servidores)
]);
?>
