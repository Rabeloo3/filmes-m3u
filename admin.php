<?php
session_start();
header('X-Frame-Options: DENY');

$configFile = 'config.json';
$config = file_exists($configFile) ? json_decode(file_get_contents($configFile), true) : [];

$senhaAdmin = $config['admin_password'] ?? 'rabelo2024';
$logged = !empty($_SESSION['admin_logged']);
$msg = ''; $msgType = '';
$acessoNegado = false;

// Recarrega config fresco sempre (evita cache do OPcache)
$config = file_exists($configFile) ? json_decode(file_get_contents($configFile), true) : [];

$ipBloqueados = $config['ips_bloqueados'] ?? [];
$ip = $_SERVER['REMOTE_ADDR'];
if (in_array($ip, $ipBloqueados)) {
    http_response_code(403);
    die('<h1 style="color:red;text-align:center;margin-top:100px;">🚫 Acesso bloqueado</h1>');
}

$rateFile = sys_get_temp_dir() . '/admin_rate_' . md5($ip);
$tentativas = [];
if (file_exists($rateFile)) {
    $tentativas = json_decode(file_get_contents($rateFile), true) ?: [];
}
$tentativas = array_filter($tentativas, fn($t) => $t > time() - 900);
$bloqueado = count($tentativas) >= 10;

// ==================== LOGIN ====================
if (!$logged && !empty($_POST['password'])) {
    if ($bloqueado) {
        $msg = '❌ Muitas tentativas. Aguarde 15 minutos.';
        $msgType = 'error';
    } elseif ($_POST['password'] === $senhaAdmin) {
        $_SESSION['admin_logged'] = true;
        $_SESSION['admin_login_time'] = time();
        $_SESSION['admin_ip'] = $ip;
        $logged = true;
        logAdminAction('LOGIN', 'Login realizado');
    } else {
        $tentativas[] = time();
        file_put_contents($rateFile, json_encode(array_values($tentativas)));
        $msg = '❌ Senha incorreta (' . (count($tentativas)) . '/10 tentativas)';
        $msgType = 'error';
        logAdminAction('LOGIN_FAIL', 'Tentativa falha de login');
    }
}

if (!empty($_GET['logout'])) {
    logAdminAction('LOGOUT', 'Logout realizado');
    session_destroy();
    header('Location: admin.php');
    exit;
}

function logAdminAction($acao, $detalhes = '') {
    $logFile = 'admin_log.txt';
    $linha = date('Y-m-d H:i:s') . " | " . ($_SERVER['REMOTE_ADDR'] ?? '?') . " | $acao | $detalhes\n";
    @file_put_contents($logFile, $linha, FILE_APPEND);
    if (filesize($logFile) > 500000) {
        $linhas = file($logFile);
        $linhas = array_slice($linhas, -2500);
        file_put_contents($logFile, implode('', $linhas));
    }
}

function formatarMoeda($v) { return 'R$ ' . number_format($v, 2, ',', '.'); }
function formatarData($ts) { return $ts ? date('d/m/Y H:i', $ts) : '-'; }
function formatarDataCompleta($ts) { return $ts ? date('d/m/Y H:i:s', $ts) : '-'; }
function diasRestantes($expira) {
    if (!$expira) return 9999;
    return ceil((strtotime($expira) - time()) / 86400);
}

function enviarBroadcast($titulo, $msg, $imagem = '', $link = '') {
    $file = 'broadcast.json';
    $lista = file_exists($file) ? json_decode(file_get_contents($file), true) ?: [] : [];
    $id = uniqid('bc_');
    $lista[$id] = [
        'titulo' => $titulo, 
        'msg' => $msg, 
        'imagem' => $imagem,
        'link' => $link,
        'criado' => date('c'), 
        'expira' => date('c', time() + 86400 * 7)
    ];
    file_put_contents($file, json_encode($lista, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    return $id;
}

function criarBackup() {
    $backupDir = 'backups';
    if (!is_dir($backupDir)) mkdir($backupDir, 0755, true);
    $nome = 'backup_' . date('Y-m-d_H-i-s') . '.zip';
    $zip = new ZipArchive();
    if ($zip->open("$backupDir/$nome", ZipArchive::CREATE) === TRUE) {
        $zip->addFile('usuarios', 'usuarios');
        $zip->addFile('config.json', 'config.json');
        $zip->addFile('servidores.js', 'servidores.js');
        if (file_exists('pagamentos_pendentes.json')) $zip->addFile('pagamentos_pendentes.json', 'pagamentos_pendentes.json');
        if (file_exists('broadcast.json')) $zip->addFile('broadcast.json', 'broadcast.json');
        $zip->close();
        return $nome;
    }
    return false;
}

function calcularEstatisticasReceita($usuarios) {
    $stats = [
        'hoje' => 0, 'semana' => 0, 'mes' => 0, 'total' => 0,
        'pendente' => 0, 'confirmado' => 0, 'rejeitado' => 0,
        'qtd_hoje' => 0, 'qtd_mes' => 0
    ];
    foreach ($usuarios as $u) {
        $f = "usuarios/{$u['usuario']}.json";
        if (!file_exists($f)) continue;
        $d = json_decode(file_get_contents($f), true);
        foreach ($d['pagamentos'] ?? [] as $p) {
            $ts = strtotime($p['data'] ?? '2000-01-01');
            $v = floatval($p['valor'] ?? 0);
            $stats['total'] += $v;
            $stats['confirmado'] += $v;
            if ($ts > time() - 86400) { $stats['hoje'] += $v; $stats['qtd_hoje']++; }
            if ($ts > time() - 7 * 86400) $stats['semana'] += $v;
            if ($ts > time() - 30 * 86400) { $stats['mes'] += $v; $stats['qtd_mes']++; }
        }
    }
    if (file_exists('pagamentos_pendentes.json')) {
        $pps = json_decode(file_get_contents('pagamentos_pendentes.json'), true) ?: [];
        foreach ($pps as $p) {
            $v = floatval($p['valor'] ?? 0);
            $st = $p['status'] ?? '';
            if ($st === 'aguardando_confirmacao' || $st === 'pendente') $stats['pendente'] += $v;
            elseif ($st === 'rejeitado') $stats['rejeitado'] += $v;
        }
    }
    return $stats;
}

function processarConfirmacaoPagamento($corr, $adminUser = 'admin') {
    $pf = 'pagamentos_pendentes.json';
    if (!file_exists($pf)) return ['ok' => false, 'msg' => 'Arquivo de pagamentos não existe'];
    $pags = json_decode(file_get_contents($pf), true);
    if (!isset($pags[$corr])) return ['ok' => false, 'msg' => 'Pagamento não encontrado'];
    
    $pag = $pags[$corr];
    $usr = $pag['usuario'] ?? '';
    $ms = intval($pag['meses'] ?? 1);
    $vl = floatval($pag['valor'] ?? 0);
    $st = $pag['status'] ?? '';
    
    if ($st === 'pago') return ['ok' => false, 'msg' => 'Este pagamento já foi confirmado'];
    
    $pags[$corr]['status'] = 'pago';
    $pags[$corr]['pago_em'] = date('c');
    $pags[$corr]['confirmado_em'] = date('c');
    $pags[$corr]['confirmado_por'] = $adminUser;
    $pags[$corr]['valor_recebido'] = $vl;
    file_put_contents($pf, json_encode($pags, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    
    $uf = "usuarios/$usr.json";
    if (!file_exists($uf)) return ['ok' => false, 'msg' => "Usuário '$usr' não encontrado"];
    
    $dados = json_decode(file_get_contents($uf), true);
    $agora = time();
    $plano = $dados['plano'] ?? null;
    $nova = ($plano && isset($plano['expira']) && strtotime($plano['expira']) > $agora)
        ? strtotime($plano['expira']) + ($ms * 30 * 86400)
        : $agora + ($ms * 30 * 86400);
    
    $dados['plano'] = [
        'ativo' => true, 'tipo' => 'pago', 'expira' => date('c', $nova),
        'meses' => ($plano['meses'] ?? 0) + $ms, 'renovado_em' => date('c')
    ];
    $dados['pagamentos'][] = [
        'meses' => $ms, 'valor' => $vl,
        'transaction_id' => $corr, 'correlation_id' => $corr,
        'data' => date('c'), 'metodo' => 'pix_selfhosted',
        'confirmado_por' => $adminUser
    ];
    $dados['atualizado'] = date('c');
    file_put_contents($uf, json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    
    $notifFile = 'notificacoes_admin.json';
    if (file_exists($notifFile)) {
        $notifs = json_decode(file_get_contents($notifFile), true) ?: [];
        foreach ($notifs as $id => $n) {
            if (($n['correlation_id'] ?? '') === $corr) {
                $notifs[$id]['lida'] = true;
                $notifs[$id]['resolvida_em'] = date('c');
                $notifs[$id]['resolvida_por'] = $adminUser;
            }
        }
        file_put_contents($notifFile, json_encode($notifs, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    }
    
    return [
        'ok' => true, 'msg' => "✅ Usuário '$usr' teve o plano estendido em {$ms} mês(es)",
        'usuario' => $usr, 'meses' => $ms, 'valor' => $vl,
        'nova_expira' => date('d/m/Y H:i', $nova), 'corr' => $corr
    ];
}

function salvarImagemBroadcast($file) {
    if (!isset($file['tmp_name']) || $file['error'] !== UPLOAD_ERR_OK) return ['erro' => 'Nenhum arquivo enviado'];
    
    $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
    $mime = mime_content_type($file['tmp_name']);
    
    if (!isset($allowed[$mime])) return ['erro' => 'Tipo de arquivo inválido (use JPG, PNG, WebP ou GIF)'];
    
    if ($file['size'] > 5 * 1024 * 1024) return ['erro' => 'Arquivo muito grande (máx 5MB)'];
    
    $dir = 'uploads/broadcast';
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    
    $ext = $allowed[$mime];
    $nome = 'bc_' . uniqid() . '_' . time() . '.' . $ext;
    $path = "$dir/$nome";
    
    if (!move_uploaded_file($file['tmp_name'], $path)) return ['erro' => 'Falha ao salvar arquivo'];
    
    return ['ok' => true, 'arquivo' => $path];
}

function carregarServidores() {
    $file = 'servidores.js';
    if (!file_exists($file)) {
        return ['servidores' => [], 'admins' => [], 'raw' => ''];
    }
    $conteudo = file_get_contents($file);
    
    preg_match('/const\s+meusServidores\s*=\s*(\[[\s\S]*?\n\s*\]);/', $conteudo, $m);
    $servs = [];
    if (!empty($m[1])) {
        $conteudo_obj = $m[1];
        $conteudo_obj = preg_replace_callback('/\'((?:[^\'\\\\]|\\\\.)*)\'/', function($mm) {
            return '"' . str_replace('"', '\\"', $mm[1]) . '"';
        }, $conteudo_obj);
        $conteudo_obj = preg_replace('/(\w+):/', '"$1":', $conteudo_obj);
        $conteudo_obj = preg_replace('/,(\s*[}\]])/', '$1', $conteudo_obj);
        $decoded = json_decode($conteudo_obj, true);
        if (is_array($decoded)) {
            $servs = $decoded;
        } else {
            preg_match_all('/\{([^{}]*)\}/', $m[1], $blocos);
            foreach ($blocos[1] as $bloco) {
                $serv = [];
                preg_match_all('/(\w+)\s*:\s*("[^"]*"|\'[^\']*\'|[^,}\n]+)/', $bloco, $parts);
                for ($i = 0; $i < count($parts[0]); $i++) {
                    $val = trim($parts[2][$i]);
                    if (preg_match('/^"(.*)"$/', $val, $vm)) $val = $vm[1];
                    elseif (preg_match("/^'(.*)'$/", $val, $vm)) $val = $vm[1];
                    $serv[$parts[1][$i]] = $val;
                }
                if (!empty($serv)) $servs[] = $serv;
            }
        }
    }
    
    preg_match('/const\s+ADMIN_USERS\s*=\s*\[([\s\S]*?)\];/', $conteudo, $m2);
    $admins = [];
    if (!empty($m2[1])) {
        preg_match_all('/["\']([^"\']+)["\']/', $m2[1], $matches);
        $admins = $matches[1] ?? [];
    }
    
    return ['servidores' => $servs, 'admins' => $admins, 'raw' => $conteudo];
}

function salvarServidores($servidores, $admins) {
    $file = 'servidores.js';
    
    if (file_exists($file)) {
        $backupDir = 'backups';
        if (!is_dir($backupDir)) mkdir($backupDir, 0755, true);
        copy($file, $backupDir . '/servidores_' . date('Y-m-d_H-i-s') . '.js');
    }
    
    $js = "// Arquivo: servidores.js\n";
    $js .= "// Gerado pelo painel admin em " . date('d/m/Y H:i:s') . "\n";
    $js .= "// Total de servidores: " . count($servidores) . "\n\n";
    $js .= "const meusServidores = [\n";
    foreach ($servidores as $i => $s) {
        $js .= "    {\n";
        $js .= "        host: \"" . addslashes($s['host'] ?? '') . "\",\n";
        $js .= "        user: \"" . addslashes($s['user'] ?? '') . "\",\n";
        $js .= "        pass: \"" . addslashes($s['pass'] ?? '') . "\",\n";
        if (!empty($s['nome'])) $js .= "        nome: \"" . addslashes($s['nome']) . "\",\n";
        if (!empty($s['descricao'])) $js .= "        descricao: \"" . addslashes($s['descricao']) . "\",\n";
        if (!empty($s['regiao'])) $js .= "        regiao: \"" . addslashes($s['regiao']) . "\",\n";
        if (!empty($s['conexoes_max']) && $s['conexoes_max'] != 1) $js .= "        conexoes_max: " . intval($s['conexoes_max']) . ",\n";
        if (!empty($s['prioridade']) && $s['prioridade'] != 5) $js .= "        prioridade: " . intval($s['prioridade']) . ",\n";
        if (!empty($s['url_playlist'])) $js .= "        url_playlist: \"" . addslashes($s['url_playlist']) . "\",\n";
        $js .= "        ativo: " . (!empty($s['ativo']) ? 'true' : 'false') . ",\n";
        $js .= "        padrao: " . (!empty($s['padrao']) ? 'true' : 'false') . "\n";
        $js .= "    }" . ($i < count($servidores) - 1 ? ',' : '') . "\n";
    }
    $js .= "];\n\n";
    $js .= "// Usuários admin (acesso permanente sem pagamento)\n";
    $js .= "const ADMIN_USERS = [" . (count($admins) ? '"' . implode('", "', array_map('addslashes', $admins)) . '"' : '') . "];\n";
    
    return file_put_contents($file, $js);
}

function testarServidor($host, $user, $pass, $detalhado = false) {
    $start = microtime(true);
    $url = rtrim($host, '/') . "/player_api.php?username=" . urlencode($user) . "&password=" . urlencode($pass);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_NOBODY => false,
        CURLOPT_FOLLOWLOCATION => true
    ]);
    $resp = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    $time = round((microtime(true) - $start) * 1000);
    curl_close($ch);
    
    $resultado = [
        'online' => false, 
        'status' => 'offline', 
        'msg' => '', 
        'time' => $time, 
        'http' => $httpCode,
        'expiracao' => null,
        'conexoes' => null,
        'categoria' => null
    ];
    
    if ($err) {
        $resultado['status'] = 'offline';
        $resultado['msg'] = $err;
    } elseif ($httpCode === 200 && $resp) {
        $data = json_decode($resp, true);
        if (isset($data['user_info']['status'])) {
            $status = strtolower($data['user_info']['status']);
            $resultado['status'] = $status === 'active' ? 'active' : 'inactive';
            $resultado['online'] = $status === 'active';
            $resultado['msg'] = 'Status: ' . $data['user_info']['status'];
            if ($detalhado) {
                if (isset($data['user_info']['exp_date'])) $resultado['expiracao'] = $data['user_info']['exp_date'];
                if (isset($data['user_info']['active_cons'])) $resultado['conexoes'] = $data['user_info']['active_cons'];
                if (isset($data['user_info']['max_connections'])) $resultado['max_connections'] = $data['user_info']['max_connections'];
            }
        } elseif (isset($data['user_info']['auth'])) {
            $resultado['status'] = 'auth_error';
            $resultado['msg'] = 'Credenciais inválidas';
        } else {
            $resultado['status'] = 'invalid';
            $resultado['msg'] = 'Resposta inesperada do servidor';
        }
    } else {
        $resultado['status'] = 'offline';
        $resultado['msg'] = "HTTP $httpCode";
    }
    
    return $resultado;
}

function validarHost($host) {
    $host = trim($host);
    if (empty($host)) return false;
    if (!preg_match('#^https?://#i', $host)) {
        $host = 'http://' . $host;
    }
    $host = preg_replace('#/+$#', '', $host);
    if (!filter_var($host, FILTER_VALIDATE_URL)) return false;
    return $host;
}

// ==================== AÇÕES ADMIN ====================
if ($logged && !empty($_GET['action'])) {
    $act = $_GET['action'];
    
    if ($act === 'ver_senha' && !empty($_GET['user'])) {
        $u = preg_replace('/[^a-zA-Z0-9_]/', '', $_GET['user']);
        $f = "usuarios/$u.json";
        if (file_exists($f)) {
            $senhasFile = 'usuarios_senhas.json';
            if (!file_exists($senhasFile)) {
                $senhas = [];
                foreach (glob('usuarios/*.json') as $file) {
                    $dd = json_decode(file_get_contents($file), true);
                    $uu = basename($file, '.json');
                    if (isset($dd['senha_original_legivel'])) {
                        $senhas[$uu] = $dd['senha_original_legivel'];
                    }
                }
                if ($senhas) file_put_contents($senhasFile, json_encode($senhas, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            }
            
            $senhas = file_exists($senhasFile) ? json_decode(file_get_contents($senhasFile), true) ?: [] : [];
            $senhaLegivel = $senhas[$u] ?? null;
            
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode([
                'ok' => true,
                'usuario' => $u,
                'senha_original' => $senhaLegivel,
                'hash' => '***' . substr(md5(file_get_contents($f)), 0, 8),
                'msg' => $senhaLegivel 
                    ? "✅ Senha original de '$u' recuperada" 
                    : "⚠️ Senha original não disponível. Reset para gerar nova.",
                'precisa_reset' => !$senhaLegivel
            ], JSON_UNESCAPED_UNICODE);
        } else {
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['ok' => false, 'msg' => 'Usuário não encontrado']);
        }
        exit;
    }
    
    if ($act === 'extend' && !empty($_GET['user'])) {
        $u = preg_replace('/[^a-zA-Z0-9_]/', '', $_GET['user']);
        $meses = max(1, min(36, intval($_GET['meses'] ?? 1)));
        $f = "usuarios/$u.json";
        if (file_exists($f)) {
            $d = json_decode(file_get_contents($f), true);
            $agora = time();
            $plano = $d['plano'] ?? null;
            $nova = ($plano && isset($plano['expira']) && strtotime($plano['expira']) > $agora) 
                    ? strtotime($plano['expira']) + ($meses * 30 * 86400) 
                    : $agora + ($meses * 30 * 86400);
            $d['plano'] = ['ativo' => true, 'tipo' => 'pago', 'expira' => date('c', $nova), 
                          'meses' => ($plano['meses'] ?? 0) + $meses, 'renovado_em' => date('c')];
            $d['atualizado'] = date('c');
            file_put_contents($f, json_encode($d, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
            $msg = "✅ $u +{$meses}m ({$d['plano']['expira']})";
            $msgType = 'success';
            logAdminAction('EXTEND', "$u +{$meses}m");
        }
    }
    
    if ($act === 'removeplan' && !empty($_GET['user'])) {
        $u = preg_replace('/[^a-zA-Z0-9_]/', '', $_GET['user']);
        $f = "usuarios/$u.json";
        if (file_exists($f)) {
            $d = json_decode(file_get_contents($f), true);
            $d['plano'] = null;
            $d['atualizado'] = date('c');
            file_put_contents($f, json_encode($d, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
            $msg = "⚠️ Plano de $u removido";
            $msgType = 'warning';
            logAdminAction('REMOVE_PLAN', $u);
        }
    }
    
    if ($act === 'admin' && !empty($_GET['user'])) {
        $u = preg_replace('/[^a-zA-Z0-9_]/', '', $_GET['user']);
        $data = carregarServidores();
        if (!in_array($u, $data['admins'])) {
            $data['admins'][] = $u;
            salvarServidores($data['servidores'], $data['admins']);
            $config['admins'] = $data['admins'];
            file_put_contents($configFile, json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            $msg = "👑 $u agora é admin";
            $msgType = 'success';
            logAdminAction('ADD_ADMIN', $u);
        }
    }
    
    if ($act === 'unadmin' && !empty($_GET['user'])) {
        $u = preg_replace('/[^a-zA-Z0-9_]/', '', $_GET['user']);
        $data = carregarServidores();
        $data['admins'] = array_values(array_diff($data['admins'], [$u]));
        salvarServidores($data['servidores'], $data['admins']);
        $config['admins'] = $data['admins'];
        file_put_contents($configFile, json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        $msg = "🔽 $u não é mais admin";
        $msgType = 'warning';
        logAdminAction('REMOVE_ADMIN', $u);
    }
    
    if ($act === 'ban' && !empty($_GET['user'])) {
        $u = preg_replace('/[^a-zA-Z0-9_]/', '', $_GET['user']);
        $f = "usuarios/$u.json";
        if (file_exists($f)) {
            $d = json_decode(file_get_contents($f), true);
            $d['banido'] = true;
            $d['banido_em'] = date('c');
            $d['plano'] = null;
            file_put_contents($f, json_encode($d, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
            $config['banidos'][] = $u;
            file_put_contents($configFile, json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            $msg = "🚫 $u banido";
            $msgType = 'warning';
            logAdminAction('BAN', $u);
        }
    }
    
    if ($act === 'unban' && !empty($_GET['user'])) {
        $u = preg_replace('/[^a-zA-Z0-9_]/', '', $_GET['user']);
        $f = "usuarios/$u.json";
        if (file_exists($f)) {
            $d = json_decode(file_get_contents($f), true);
            unset($d['banido'], $d['banido_em']);
            file_put_contents($f, json_encode($d, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
            $config['banidos'] = array_values(array_diff($config['banidos'] ?? [], [$u]));
            file_put_contents($configFile, json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            $msg = "✅ $u desbanido";
            $msgType = 'success';
            logAdminAction('UNBAN', $u);
        }
    }
    
    if ($act === 'delete' && !empty($_GET['user'])) {
        $u = preg_replace('/[^a-zA-Z0-9_]/', '', $_GET['user']);
        $f = "usuarios/$u.json";
        if (file_exists($f)) {
            unlink($f);
            $msg = "🗑️ $u excluído";
            $msgType = 'warning';
            logAdminAction('DELETE', $u);
        }
    }
    
    if ($act === 'resetpass' && !empty($_GET['user'])) {
        $u = preg_replace('/[^a-zA-Z0-9_]/', '', $_GET['user']);
        $f = "usuarios/$u.json";
        $novaSenha = substr(str_shuffle('abcdefghijkmnpqrstuvwxyz23456789'), 0, 6);
        if (file_exists($f)) {
            $d = json_decode(file_get_contents($f), true);
            $d['senha'] = password_hash($novaSenha, PASSWORD_DEFAULT);
            $d['senha_reset_em'] = date('c');
            file_put_contents($f, json_encode($d, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
            
            $senhasFile = 'usuarios_senhas.json';
            $senhas = file_exists($senhasFile) ? json_decode(file_get_contents($senhasFile), true) ?: [] : [];
            $senhas[$u] = $novaSenha;
            file_put_contents($senhasFile, json_encode($senhas, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            
            $msg = "🔑 Senha de $u resetada: <strong>$novaSenha</strong> (salva para consulta)";
            $msgType = 'success';
            logAdminAction('RESET_PASS', "$u -> $novaSenha");
        }
    }
    
    if ($act === 'confirmpay' && !empty($_GET['corr'])) {
        $corr = preg_replace('/[^a-zA-Z0-9_]/', '', $_GET['corr']);
        $resultado = processarConfirmacaoPagamento($corr, $ip);
        if ($resultado['ok']) {
            $msg = $resultado['msg'] . " | Nova expiração: <strong>{$resultado['nova_expira']}</strong>";
            $msgType = 'success';
            logAdminAction('CONFIRM_PAY', "{$resultado['usuario']} +{$resultado['meses']}m (R$ " . number_format($resultado['valor'], 2, ',', '.') . ") corr=$corr");
        } else {
            $msg = '❌ ' . $resultado['msg'];
            $msgType = 'error';
        }
    }
    
    if ($act === 'confirmpay_ajax' && !empty($_GET['corr'])) {
        header('Content-Type: application/json; charset=utf-8');
        $corr = preg_replace('/[^a-zA-Z0-9_]/', '', $_GET['corr']);
        $resultado = processarConfirmacaoPagamento($corr, $ip);
        if ($resultado['ok']) {
            logAdminAction('CONFIRM_PAY_AJAX', "{$resultado['usuario']} +{$resultado['meses']}m (R$ " . number_format($resultado['valor'], 2, ',', '.') . ") corr=$corr");
        }
        echo json_encode($resultado, JSON_UNESCAPED_UNICODE);
        exit;
    }
    
    if ($act === 'rejectpay' && !empty($_GET['corr'])) {
        $corr = preg_replace('/[^a-zA-Z0-9_]/', '', $_GET['corr']);
        $motivo = substr(trim($_GET['motivo'] ?? ''), 0, 200);
        if (empty($motivo)) $motivo = 'Pagamento não identificado';
        $pf = 'pagamentos_pendentes.json';
        if (file_exists($pf)) {
            $p = json_decode(file_get_contents($pf), true);
            if (isset($p[$corr])) {
                $p[$corr]['status'] = 'rejeitado';
                $p[$corr]['rejeitado_em'] = date('c');
                $p[$corr]['rejeitado_por'] = $ip;
                $p[$corr]['motivo_rejeicao'] = $motivo;
                file_put_contents($pf, json_encode($p, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
                
                $notifFile = 'notificacoes_admin.json';
                if (file_exists($notifFile)) {
                    $notifs = json_decode(file_get_contents($notifFile), true) ?: [];
                    foreach ($notifs as $id => $n) {
                        if (($n['correlation_id'] ?? '') === $corr) {
                            $notifs[$id]['lida'] = true;
                            $notifs[$id]['rejeitada'] = true;
                            $notifs[$id]['motivo_rejeicao'] = $motivo;
                            $notifs[$id]['resolvida_em'] = date('c');
                        }
                    }
                    file_put_contents($notifFile, json_encode($notifs, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
                }
                
                $msg = "❌ Pagamento de {$p[$corr]['usuario']} rejeitado";
                $msgType = 'warning';
                logAdminAction('REJECT_PAY', "$corr - $motivo");
            }
        }
    }
    
    if ($act === 'cancelpay' && !empty($_GET['corr'])) {
        $corr = preg_replace('/[^a-zA-Z0-9_]/', '', $_GET['corr']);
        $pf = 'pagamentos_pendentes.json';
        if (file_exists($pf)) {
            $p = json_decode(file_get_contents($pf), true);
            if (isset($p[$corr])) {
                $p[$corr]['status'] = 'cancelado';
                $p[$corr]['cancelado_em'] = date('c');
                file_put_contents($pf, json_encode($p, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
                $msg = "❌ Pagamento cancelado";
                $msgType = 'warning';
            }
        }
    }
    
    if ($act === 'addservidor' && !empty($_POST)) {
        $host = validarHost($_POST['host'] ?? '');
        $user = trim($_POST['user'] ?? '');
        $pass = trim($_POST['pass'] ?? '');
        $nome = trim($_POST['nome'] ?? '');
        $descricao = trim($_POST['descricao'] ?? '');
        $regiao = trim($_POST['regiao'] ?? '');
        $conexoes_max = max(1, intval($_POST['conexoes_max'] ?? 1));
        $prioridade = max(1, min(10, intval($_POST['prioridade'] ?? 5)));
        $url_playlist = trim($_POST['url_playlist'] ?? '');
        $padrao = !empty($_POST['padrao']);
        $testar_antes = !empty($_POST['testar_antes']);
        
        if (!$host || !$user || !$pass) {
            $msg = "❌ Preencha host, usuário e senha"; $msgType = 'error';
        } else {
            $data = carregarServidores();
            
            foreach ($data['servidores'] as $s) {
                if (($s['host'] ?? '') === $host && ($s['user'] ?? '') === $user) {
                    $msg = "❌ Este servidor já existe (mesmo host+user)"; 
                    $msgType = 'error'; 
                    break;
                }
            }
            
            if (!$msg) {
                $statusInicial = 'nao_testado';
                $tempoInicial = null;
                if ($testar_antes) {
                    $teste = testarServidor($host, $user, $pass, true);
                    $statusInicial = $teste['status'];
                    $tempoInicial = $teste['time'];
                    if ($teste['status'] === 'auth_error') {
                        $msg = "❌ Credenciais inválidas! Servidor não adicionado.";
                        $msgType = 'error';
                    } elseif ($teste['status'] === 'offline') {
                        $msg = "⚠️ Servidor offline ({$teste['msg']}). Adicionado mesmo assim.";
                        $msgType = 'warning';
                    }
                }
                
                if (!$msg || $msgType === 'warning') {
                    if (empty($data['servidores']) || $padrao) {
                        foreach ($data['servidores'] as $k => $s) {
                            $data['servidores'][$k]['padrao'] = false;
                        }
                        $padrao = true;
                    }
                    
                    $novo = [
                        'host' => $host, 'user' => $user, 'pass' => $pass,
                        'nome' => $nome, 'descricao' => $descricao, 'regiao' => $regiao,
                        'conexoes_max' => $conexoes_max, 'prioridade' => $prioridade,
                        'url_playlist' => $url_playlist, 'ativo' => true, 'padrao' => $padrao,
                        'criado_em' => date('c'),
                        'ultimo_teste' => $testar_antes ? date('c') : null,
                        'ultimo_status' => $statusInicial,
                        'ultimo_tempo' => $tempoInicial
                    ];
                    
                    $data['servidores'][] = $novo;
                    salvarServidores($data['servidores'], $data['admins']);
                    
                    if (!$msg) {
                        $msg = "✅ Servidor adicionado com sucesso!";
                        $msgType = 'success';
                    }
                    logAdminAction('ADD_SERVER', "$host ($user)" . ($testar_antes ? " [status: $statusInicial]" : ''));
                }
            }
        }
    }
    
    if ($act === 'editservidor' && !empty($_POST)) {
        $idx = intval($_POST['idx'] ?? -1);
        $host = validarHost($_POST['host'] ?? '');
        $user = trim($_POST['user'] ?? '');
        $pass = trim($_POST['pass'] ?? '');
        $nome = trim($_POST['nome'] ?? '');
        $descricao = trim($_POST['descricao'] ?? '');
        $regiao = trim($_POST['regiao'] ?? '');
        $conexoes_max = max(1, intval($_POST['conexoes_max'] ?? 1));
        $prioridade = max(1, min(10, intval($_POST['prioridade'] ?? 5)));
        $url_playlist = trim($_POST['url_playlist'] ?? '');
        $ativo = !empty($_POST['ativo']);
        $padrao = !empty($_POST['padrao']);
        
        if (!$host || !$user || !$pass) {
            $msg = "❌ Preencha host, usuário e senha"; $msgType = 'error';
        } else {
            $data = carregarServidores();
            if (isset($data['servidores'][$idx])) {
                foreach ($data['servidores'] as $k => $s) {
                    if ($k != $idx && ($s['host'] ?? '') === $host && ($s['user'] ?? '') === $user) {
                        $msg = "❌ Já existe outro servidor com mesmo host+user"; 
                        $msgType = 'error'; 
                        break;
                    }
                }
                
                if (!$msg) {
                    $data['servidores'][$idx] = array_merge($data['servidores'][$idx], [
                        'host' => $host, 'user' => $user, 'pass' => $pass,
                        'nome' => $nome, 'descricao' => $descricao, 'regiao' => $regiao,
                        'conexoes_max' => $conexoes_max, 'prioridade' => $prioridade,
                        'url_playlist' => $url_playlist, 'ativo' => $ativo, 'padrao' => $padrao,
                        'atualizado_em' => date('c')
                    ]);
                    
                    if ($padrao) {
                        foreach ($data['servidores'] as $k => $s) {
                            if ($k != $idx) $data['servidores'][$k]['padrao'] = false;
                        }
                    }
                    
                    salvarServidores($data['servidores'], $data['admins']);
                    $msg = "✅ Servidor atualizado com sucesso!"; 
                    $msgType = 'success';
                    logAdminAction('EDIT_SERVER', $host);
                }
            } else {
                $msg = "❌ Servidor não encontrado"; $msgType = 'error';
            }
        }
    }
    
    if ($act === 'delservidor' && isset($_GET['idx'])) {
        $idx = intval($_GET['idx']);
        $data = carregarServidores();
        if (isset($data['servidores'][$idx])) {
            $rem = $data['servidores'][$idx];
            array_splice($data['servidores'], $idx, 1);
            $temPadrao = false;
            foreach ($data['servidores'] as $s) {
                if (!empty($s['padrao'])) { $temPadrao = true; break; }
            }
            if (!$temPadrao && !empty($data['servidores'])) {
                foreach ($data['servidores'] as $k => $s) {
                    if (!empty($s['ativo'])) {
                        $data['servidores'][$k]['padrao'] = true;
                        break;
                    }
                }
            }
            salvarServidores($data['servidores'], $data['admins']);
            $msg = "🗑️ Servidor removido: " . ($rem['nome'] ?? $rem['host']); 
            $msgType = 'warning';
            logAdminAction('DEL_SERVER', $rem['host']);
        }
    }
    
    if ($act === 'toggleservidor' && isset($_GET['idx'])) {
        $idx = intval($_GET['idx']);
        $data = carregarServidores();
        if (isset($data['servidores'][$idx])) {
            $data['servidores'][$idx]['ativo'] = empty($data['servidores'][$idx]['ativo']);
            if (!$data['servidores'][$idx]['ativo'] && !empty($data['servidores'][$idx]['padrao'])) {
                $data['servidores'][$idx]['padrao'] = false;
                foreach ($data['servidores'] as $k => $s) {
                    if ($k != $idx && !empty($s['ativo'])) {
                        $data['servidores'][$k]['padrao'] = true;
                        break;
                    }
                }
            }
            salvarServidores($data['servidores'], $data['admins']);
            $status = $data['servidores'][$idx]['ativo'] ? 'ativado' : 'desativado';
            $msg = "🔄 Servidor $status"; 
            $msgType = 'success';
            logAdminAction('TOGGLE_SERVER', $data['servidores'][$idx]['host']);
        }
    }
    
    if ($act === 'testservidor' && isset($_GET['idx'])) {
        $idx = intval($_GET['idx']);
        $data = carregarServidores();
        if (isset($data['servidores'][$idx])) {
            $s = $data['servidores'][$idx];
            $result = testarServidor($s['host'], $s['user'], $s['pass'], true);
            if ($result['online']) {
                $msg = "✅ Online ({$result['time']}ms) - {$result['msg']}"; 
                $msgType = 'success';
            } elseif ($result['status'] === 'auth_error') {
                $msg = "🔐 Credenciais inválidas - {$result['msg']}"; 
                $msgType = 'error';
            } else {
                $msg = "❌ {$result['status']} - {$result['msg']} ({$result['time']}ms)"; 
                $msgType = 'error';
            }
            logAdminAction('TEST_SERVER', "{$s['host']} -> {$result['status']}");
            $data['servidores'][$idx]['ultimo_teste'] = date('c');
            $data['servidores'][$idx]['ultimo_status'] = $result['status'];
            $data['servidores'][$idx]['ultimo_tempo'] = $result['time'];
            $data['servidores'][$idx]['ultimo_msg'] = $result['msg'];
            if ($result['expiracao']) $data['servidores'][$idx]['expira_credencial'] = $result['expiracao'];
            if ($result['conexoes'] !== null) $data['servidores'][$idx]['conexoes_ativas'] = $result['conexoes'];
            salvarServidores($data['servidores'], $data['admins']);
        }
    }
    
    if ($act === 'testtodos') {
        $data = carregarServidores();
        $online = 0; $offline = 0; $inativo = 0; $erro = 0; $tempos = [];
        foreach ($data['servidores'] as $k => $s) {
            $r = testarServidor($s['host'], $s['user'], $s['pass'], true);
            $data['servidores'][$k]['ultimo_teste'] = date('c');
            $data['servidores'][$k]['ultimo_status'] = $r['status'];
            $data['servidores'][$k]['ultimo_tempo'] = $r['time'];
            $data['servidores'][$k]['ultimo_msg'] = $r['msg'];
            if ($r['expiracao']) $data['servidores'][$k]['expira_credencial'] = $r['expiracao'];
            if ($r['conexoes'] !== null) $data['servidores'][$k]['conexoes_ativas'] = $r['conexoes'];
            if ($r['online']) { $online++; $tempos[] = $r['time']; }
            elseif ($r['status'] === 'inactive') $inativo++;
            elseif ($r['status'] === 'auth_error') $erro++;
            else $offline++;
        }
        salvarServidores($data['servidores'], $data['admins']);
        $media = $tempos ? round(array_sum($tempos) / count($tempos)) : 0;
        $msg = "🧪 Teste: $online online, $inativo inativos, $erro erros, $offline offline | Latência média: {$media}ms"; 
        $msgType = $offline > 0 || $erro > 0 ? 'warning' : 'success';
        logAdminAction('TEST_ALL', "$online on / $inativo ina / $erro err / $offline off / media {$media}ms");
    }
    
    if ($act === 'moveservidor' && isset($_GET['idx'], $_GET['dir'])) {
        $idx = intval($_GET['idx']);
        $dir = $_GET['dir'] === 'up' ? -1 : 1;
        $data = carregarServidores();
        $newIdx = $idx + $dir;
        if (isset($data['servidores'][$idx]) && isset($data['servidores'][$newIdx])) {
            $temp = $data['servidores'][$idx];
            $data['servidores'][$idx] = $data['servidores'][$newIdx];
            $data['servidores'][$newIdx] = $temp;
            salvarServidores($data['servidores'], $data['admins']);
            $msg = "↕️ Ordem atualizada"; $msgType = 'success';
        }
    }
    
    if ($act === 'clonarservidor' && isset($_GET['idx'])) {
        $idx = intval($_GET['idx']);
        $data = carregarServidores();
        if (isset($data['servidores'][$idx])) {
            $orig = $data['servidores'][$idx];
            $clone = $orig;
            $clone['nome'] = ($orig['nome'] ?? $orig['host']) . ' (cópia)';
            $clone['padrao'] = false;
            $clone['criado_em'] = date('c');
            $clone['ultimo_teste'] = null;
            $clone['ultimo_status'] = null;
            array_splice($data['servidores'], $idx + 1, 0, [$clone]);
            salvarServidores($data['servidores'], $data['admins']);
            $msg = "📋 Servidor clonado! Edite as credenciais."; $msgType = 'success';
            logAdminAction('CLONE_SERVER', $orig['host']);
        }
    }
    
    if ($act === 'addadminlist' && !empty($_POST['admin_user'])) {
        $u = preg_replace('/[^a-zA-Z0-9_]/', '', $_POST['admin_user']);
        if ($u) {
            $data = carregarServidores();
            if (!in_array($u, $data['admins'])) {
                $data['admins'][] = $u;
                salvarServidores($data['servidores'], $data['admins']);
                $config['admins'] = $data['admins'];
                file_put_contents($configFile, json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
                $msg = "👑 $u adicionado como admin"; $msgType = 'success';
                logAdminAction('ADD_ADMIN', $u);
            } else {
                $msg = "⚠️ $u já é admin"; $msgType = 'warning';
            }
        }
    }
    
    if ($act === 'deladminlist' && !empty($_GET['admin'])) {
        $u = preg_replace('/[^a-zA-Z0-9_]/', '', $_GET['admin']);
        $data = carregarServidores();
        $data['admins'] = array_values(array_diff($data['admins'], [$u]));
        salvarServidores($data['servidores'], $data['admins']);
        $config['admins'] = $data['admins'];
        file_put_contents($configFile, json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        $msg = "🔽 $u removido dos admins"; $msgType = 'warning';
        logAdminAction('REMOVE_ADMIN', $u);
    }
    
    if ($act === 'exportservers') {
        $data = carregarServidores();
        header('Content-Type: application/json; charset=utf-8');
        header('Content-Disposition: attachment; filename=servidores_backup_' . date('Y-m-d_H-i-s') . '.json');
        $servsMask = array_map(function($s) {
            $s['pass'] = '******';
            return $s;
        }, $data['servidores']);
        echo json_encode(['servidores' => $servsMask, 'admins' => $data['admins'], 'exportado_em' => date('c')], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        exit;
    }
    
    // ============== CONFIGURAÇÕES (MANUTENÇÃO CORRIGIDA) ==============
    if ($act === 'saveconfig' && !empty($_POST)) {
        clearstatcache();
        $config = file_exists($configFile) ? json_decode(file_get_contents($configFile), true) : [];
        
        $novoConfig = array_merge($config, $_POST);
        
        // CORREÇÃO CRÍTICA: manutencao SEMPRE é boolean puro
        $novoConfig['manutencao'] = !empty($_POST['manutencao']) && $_POST['manutencao'] == '1';
        if (empty($_POST['manutencao'])) {
            $novoConfig['manutencao'] = false;
        }
        $novoConfig['manutencao_bloquear_login'] = !empty($_POST['manutencao_bloquear_login']) && $_POST['manutencao_bloquear_login'] == '1';
        if (empty($_POST['manutencao_bloquear_login'])) {
            $novoConfig['manutencao_bloquear_login'] = false;
        }
        
        $novoConfig['valor_mensal'] = floatval($_POST['valor_mensal'] ?? 1.00);
        $novoConfig['trial_horas'] = intval($_POST['trial_horas'] ?? 24);
        $novoConfig['whatsapp_suporte'] = preg_replace('/[^0-9]/', '', $_POST['whatsapp_suporte'] ?? '');
        $novoConfig['admin_password'] = $_POST['admin_password'] ?? $senhaAdmin;
        $novoConfig['pix_chave'] = trim($_POST['pix_chave'] ?? '');
        $novoConfig['pix_nome'] = substr(trim($_POST['pix_nome'] ?? 'RABELO TV'), 0, 25);
        $novoConfig['pix_cidade'] = substr(trim($_POST['pix_cidade'] ?? 'SAO PAULO'), 0, 15);
        $novoConfig['mensagem_manutencao'] = $_POST['mensagem_manutencao'] ?? 'Estamos em manutenção! Voltaremos em breve.';
        $novoConfig['manutencao_previsao'] = $_POST['manutencao_previsao'] ?? '2 horas';
        
        if (file_put_contents($configFile, json_encode($novoConfig, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE))) {
            clearstatcache();
            $config = $novoConfig;
            
            $status = $novoConfig['manutencao'] ? '⚠️ MODO MANUTENÇÃO ATIVADO' : '✅ MODO MANUTENÇÃO DESATIVADO';
            $msg = "✅ Configurações salvas! " . $status;
            $msgType = $novoConfig['manutencao'] ? 'warning' : 'success';
            logAdminAction('SAVE_CONFIG', $status);
        }
    }
    
    // ============== DESATIVAR MANUTENÇÃO RÁPIDO ==============
    if ($act === 'desativar_manutencao') {
        $config = file_exists($configFile) ? json_decode(file_get_contents($configFile), true) : [];
        $config['manutencao'] = false;
        $config['manutencao_bloquear_login'] = false;
        file_put_contents($configFile, json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        clearstatcache();
        $msg = "✅ MODO MANUTENÇÃO DESATIVADO COM SUCESSO! Os usuários já podem acessar.";
        $msgType = 'success';
        logAdminAction('MANUTENCAO_OFF', '');
        header('Location: admin.php?tab=config&mant=off');
        exit;
    }
    
    // ============== BROADCAST ==============
    if ($act === 'broadcast' && !empty($_POST['titulo'])) {
        $titulo = trim($_POST['titulo']);
        $msgTexto = $_POST['msg'] ?? '';
        $link = trim($_POST['link'] ?? '');
        $imagemPath = '';
        
        if (!empty($_FILES['imagem']) && $_FILES['imagem']['error'] === UPLOAD_ERR_OK) {
            $upResult = salvarImagemBroadcast($_FILES['imagem']);
            if (isset($upResult['ok'])) {
                $imagemPath = $upResult['arquivo'];
            } else {
                $msg = "❌ Erro no upload: " . $upResult['erro'];
                $msgType = 'error';
            }
        }
        
        if (empty($msg)) {
            $id = enviarBroadcast($titulo, $msgTexto, $imagemPath, $link);
            $msg = "📢 Broadcast enviado (ID: $id)" . ($imagemPath ? ' (com imagem)' : '');
            $msgType = 'success';
            logAdminAction('BROADCAST', $titulo . ($imagemPath ? ' [+imagem]' : ''));
        }
    }
    
    if ($act === 'delbroadcast' && !empty($_GET['id'])) {
        $id = preg_replace('/[^a-zA-Z0-9_]/', '', $_GET['id']);
        $file = 'broadcast.json';
        if (file_exists($file)) {
            $lista = json_decode(file_get_contents($file), true) ?: [];
            if (isset($lista[$id])) {
                if (!empty($lista[$id]['imagem']) && file_exists($lista[$id]['imagem'])) {
                    @unlink($lista[$id]['imagem']);
                }
                unset($lista[$id]);
                file_put_contents($file, json_encode($lista, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
                $msg = "🗑️ Broadcast removido";
                $msgType = 'warning';
                logAdminAction('DEL_BROADCAST', $id);
            }
        }
    }
    
    if ($act === 'backup') {
        $arq = criarBackup();
        if ($arq) { $msg = "💾 Backup criado: $arq"; $msgType = 'success'; logAdminAction('BACKUP', $arq); }
    }
    
    if ($act === 'clearlogs') {
        @file_put_contents('webhook_log.txt', '');
        @file_put_contents('admin_log.txt', '');
        $msg = "🧹 Logs limpos"; $msgType = 'success';
    }
    
    if ($act === 'cleanexpired') {
        $pf = 'pagamentos_pendentes.json';
        $removidos = 0;
        if (file_exists($pf)) {
            $p = json_decode(file_get_contents($pf), true);
            foreach ($p as $k => $v) {
                if (isset($v['expira']) && strtotime($v['expira']) < time() - 86400) {
                    unset($p[$k]); $removidos++;
                }
            }
            file_put_contents($pf, json_encode($p, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        }
        $msg = "🧹 $removidos pagamento(s) expirado(s) removido(s)"; $msgType = 'success';
        logAdminAction('CLEAN_EXPIRED', $removidos);
    }
    
    if ($act === 'limpar_notificacoes') {
        if (file_exists('notificacoes_admin.json')) {
            file_put_contents('notificacoes_admin.json', json_encode([], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            $msg = "🧹 Notificações antigas removidas"; $msgType = 'success';
        }
    }
    
    if ($act === 'exportcsv') {
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename=usuarios_' . date('Y-m-d') . '.csv');
        echo "\xEF\xBB\xBF";
        echo "Usuario;Email;Status;Dias Restantes;Expira;Pagamentos;Criado\n";
        foreach (glob('usuarios/*.json') as $f) {
            $d = json_decode(file_get_contents($f), true);
            $u = basename($f, '.json');
            $agora = time();
            $plano = $d['plano'] ?? null;
            $st = in_array($u, $config['admins'] ?? []) ? 'admin' : 
                  ($plano && isset($plano['expira']) ? (strtotime($plano['expira']) > $agora ? $plano['tipo'] : 'expirado') : 'sem_plano');
            $ds = ($st === 'expirado' || $st === 'sem_plano') ? 0 : diasRestantes($plano['expira']);
            $ex = ($plano && isset($plano['expira'])) ? date('d/m/Y H:i', strtotime($plano['expira'])) : '-';
            $pg = count($d['pagamentos'] ?? []);
            $cr = $d['criado'] ?? '';
            echo "$u;{$d['email']};$st;$ds;$ex;$pg;$cr\n";
        }
        exit;
    }
    
    if ($act === 'export_pagamentos_csv') {
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename=pagamentos_' . date('Y-m-d') . '.csv');
        echo "\xEF\xBB\xBF";
        echo "ID;Usuario;Meses;Valor;Status;Criado;Pago_Em;Confirmado_Por;IP;TXID\n";
        if (file_exists('pagamentos_pendentes.json')) {
            foreach (json_decode(file_get_contents('pagamentos_pendentes.json'), true) ?? [] as $c => $p) {
                $pagoEm = $p['pago_em'] ?? $p['confirmado_em'] ?? '';
                $confPor = $p['confirmado_por'] ?? '';
                $ipPg = $p['ip_marcacao'] ?? '';
                $txid = $p['txid'] ?? '';
                echo "$c;{$p['usuario']};{$p['meses']};{$p['valor']};{$p['status']};{$p['criado']};$pagoEm;$confPor;$ipPg;$txid\n";
            }
        }
        exit;
    }
}

// ==================== CARREGAR DADOS ====================
if ($logged) {
    clearstatcache();
    $config = file_exists($configFile) ? json_decode(file_get_contents($configFile), true) : [];
    
    $users = [];
    $stats = [
        'total' => 0, 'ativos' => 0, 'trial' => 0, 'expirados' => 0, 
        'admins' => 0, 'banidos' => 0, 'receita_mes' => 0, 'receita_total' => 0
    ];
    
    foreach (glob('usuarios/*.json') as $f) {
        $d = json_decode(file_get_contents($f), true);
        $usr = basename($f, '.json');
        $agora = time();
        $plano = $d['plano'] ?? null;
        $st = 'sem_plano'; $ex = null; $ds = 0; $meses = 0;
        
        if (in_array($usr, $config['admins'] ?? [])) { 
            $st = 'admin'; $stats['admins']++; 
        } elseif (!empty($d['banido'])) {
            $st = 'banido'; $stats['banidos']++;
        } elseif ($plano && isset($plano['expira'])) {
            $ex = strtotime($plano['expira']);
            $meses = $plano['meses'] ?? 0;
            if ($ex > $agora) {
                $st = $plano['tipo'] ?? 'pago';
                $ds = ceil(($ex - $agora) / 86400);
                if ($st === 'trial') $stats['trial']++;
                else $stats['ativos']++;
            } else { 
                $st = 'expirado'; $stats['expirados']++;
            }
        } else { $stats['expirados']++; }
        
        $stats['total']++;
        $pags = $d['pagamentos'] ?? [];
        foreach ($pags as $p) {
            $stats['receita_total'] += floatval($p['valor'] ?? 0);
            if (isset($p['data']) && strtotime($p['data']) > time() - 30 * 86400) {
                $stats['receita_mes'] += floatval($p['valor'] ?? 0);
            }
        }
        
        $users[] = [
            'usuario' => $usr, 'email' => $d['email'] ?? '', 'status' => $st,
            'dias' => $ds, 'meses' => $meses, 'expira' => $ex, 'criado' => $d['criado'] ?? '',
            'pags' => count($pags), 'ultimo_pag' => !empty($pags) ? end($pags) : null,
            'banido' => !empty($d['banido'])
        ];
    }
    
    usort($users, fn($a, $b) => strtotime($b['criado'] ?? '2000-01-01') - strtotime($a['criado'] ?? '2000-01-01'));
    
    $pagsPend = [];
    if (file_exists('pagamentos_pendentes.json')) {
        foreach (json_decode(file_get_contents('pagamentos_pendentes.json'), true) ?? [] as $c => $p) {
            $pagsPend[] = ['corr' => $c] + $p;
        }
    }
    usort($pagsPend, fn($a, $b) => strtotime($b['criado'] ?? '2000-01-01') - strtotime($a['criado'] ?? '2000-01-01'));
    
    $logs = [];
    if (file_exists('admin_log.txt')) {
        $logs = array_slice(array_reverse(file('admin_log.txt')), 0, 50);
    }
    
    $broadcasts = [];
    if (file_exists('broadcast.json')) {
        $b = json_decode(file_get_contents('broadcast.json'), true) ?: [];
        foreach ($b as $id => $d) {
            if (strtotime($d['expira']) > time()) $broadcasts[$id] = $d;
        }
        uasort($broadcasts, fn($a, $b) => strtotime($b['criado']) - strtotime($a['criado']));
    }
    
    $backups = [];
    if (is_dir('backups')) {
        $backups = array_reverse(glob('backups/*.zip'));
        $servBackups = array_reverse(glob('backups/servidores_*.js'));
    }
    
    $servData = carregarServidores();
    $servidores = $servData['servidores'];
    
    $servResumo = [
        'total' => count($servidores), 'ativos' => 0, 'inativos' => 0, 'padrao' => 0,
        'online' => 0, 'offline' => 0, 'inative' => 0, 'auth_error' => 0, 'nao_testado' => 0,
        'latencia_media' => 0, 'latencia_min' => null, 'latencia_max' => null,
        'com_regiao' => 0, 'regioes' => []
    ];
    
    $tempos = [];
    foreach ($servidores as $s) {
        if (!empty($s['ativo'])) $servResumo['ativos']++;
        else $servResumo['inativos']++;
        if (!empty($s['padrao'])) $servResumo['padrao']++;
        
        $st = $s['ultimo_status'] ?? 'nao_testado';
        if ($st === 'active' || $st === 'online') $servResumo['online']++;
        elseif ($st === 'inactive' || $st === 'inative') $servResumo['inative']++;
        elseif ($st === 'auth_error') $servResumo['auth_error']++;
        elseif ($st === 'offline' || $st === 'invalid') $servResumo['offline']++;
        else $servResumo['nao_testado']++;
        
        if (!empty($s['ultimo_tempo']) && $st === 'active') {
            $tempos[] = intval($s['ultimo_tempo']);
        }
        
        if (!empty($s['regiao'])) {
            $servResumo['com_regiao']++;
            $r = $s['regiao'];
            if (!isset($servResumo['regioes'][$r])) $servResumo['regioes'][$r] = 0;
            $servResumo['regioes'][$r]++;
        }
    }
    
    if ($tempos) {
        $servResumo['latencia_media'] = round(array_sum($tempos) / count($tempos));
        $servResumo['latencia_min'] = min($tempos);
        $servResumo['latencia_max'] = max($tempos);
    }
    
    $aba = $_GET['tab'] ?? 'dashboard';
    $busca = $_GET['q'] ?? '';
    $filtroStatus = $_GET['status'] ?? 'todos';
    
    if ($busca) {
        $users = array_filter($users, fn($u) => 
            stripos($u['usuario'], $busca) !== false || 
            stripos($u['email'], $busca) !== false
        );
    }
    
    $receitaStats = calcularEstatisticasReceita($users);
    
    $notifPendentes = 0;
    if (file_exists('notificacoes_admin.json')) {
        $allN = json_decode(file_get_contents('notificacoes_admin.json'), true) ?: [];
        $notifPendentes = count(array_filter($allN, fn($n) => !($n['lida'] ?? false)));
    }
    
    $verifPendentes = array_values(array_filter($pagsPend, fn($p) => ($p['status'] ?? '') === 'aguardando_confirmacao'));
    
    $pagsFiltrados = $pagsPend;
    if ($filtroStatus !== 'todos') {
        $pagsFiltrados = array_values(array_filter($pagsPend, fn($p) => ($p['status'] ?? '') === $filtroStatus));
    }
}
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Admin - Rabelo TV</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #060913; color: #e0e0e0; font-family: -apple-system, system-ui, sans-serif; min-height: 100vh; }

.admin-wrap { display: flex; min-height: 100vh; }
.sidebar { width: 240px; background: rgba(10,15,30,0.95); border-right: 1px solid rgba(255,255,255,0.08); padding: 20px 0; position: fixed; height: 100vh; overflow-y: auto; }
.main { flex: 1; margin-left: 240px; padding: 24px; max-width: 100%; }
.sidebar-brand { color: #00e5ff; font-weight: 900; font-size: 1.2rem; padding: 0 20px 20px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; gap: 8px; }
.nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 20px; color: #aaa; cursor: pointer; border-left: 3px solid transparent; transition: 0.2s; text-decoration: none; font-size: 0.9rem; }
.nav-item:hover { background: rgba(255,255,255,0.03); color: white; }
.nav-item.active { background: rgba(0,229,255,0.1); color: #00e5ff; border-left-color: #00e5ff; }
.nav-icon { font-size: 1.1rem; width: 20px; text-align: center; }
.nav-badge { background: #ff2a5f; color: white; padding: 1px 7px; border-radius: 50px; font-size: 0.7rem; margin-left: auto; font-weight: 700; }
.nav-badge.warn { background: #ffb800; color: #000; }
.nav-badge.success { background: #00ff88; color: #000; }
.nav-section { color: #555; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1px; padding: 15px 20px 5px; font-weight: 700; }

.card { background: rgba(10,15,30,0.85); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 24px; margin-bottom: 20px; }
.card h2 { font-size: 1.3rem; margin-bottom: 16px; color: white; display: flex; align-items: center; gap: 8px; }
.card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 20px; }
.stat-card { background: rgba(10,15,30,0.85); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 18px; }
.stat-label { color: #888; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px; }
.stat-value { font-size: 2rem; font-weight: 900; color: #00e5ff; margin-top: 4px; }
.stat-value.success { color: #00ff88; }
.stat-value.warning { color: #ffb800; }
.stat-value.danger { color: #ff2a5f; }
.stat-value.neutral { color: #aaa; }
.stat-sub { font-size: 0.75rem; color: #666; margin-top: 2px; }

.msg { padding: 12px 16px; border-radius: 10px; margin-bottom: 16px; font-size: 0.9rem; }
.msg.success { background: rgba(0,255,136,0.1); border: 1px solid #00ff88; color: #00ff88; }
.msg.error { background: rgba(255,42,95,0.1); border: 1px solid #ff2a5f; color: #ff2a5f; }
.msg.warning { background: rgba(255,184,0,0.1); border: 1px solid #ffb800; color: #ffb800; }

table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
th { color: #00e5ff; font-size: 0.75rem; text-transform: uppercase; padding: 10px 8px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.08); position: sticky; top: 0; background: rgba(10,15,30,0.95); }
td { padding: 10px 8px; border-bottom: 1px solid rgba(255,255,255,0.04); }
tr:hover td { background: rgba(0,229,255,0.03); }
tr.highlight td { background: rgba(0,229,255,0.08); }
.table-wrap { overflow-x: auto; max-height: 70vh; overflow-y: auto; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); }

.badge { display: inline-block; padding: 3px 10px; border-radius: 50px; font-size: 0.72rem; font-weight: 800; text-transform: uppercase; }
.badge.admin { background: #00e5ff; color: #000; }
.badge.pago, .badge.trial { background: #00ff88; color: #000; }
.badge.trial { background: #ffb800; }
.badge.expirado, .badge.sem_plano, .badge.banido { background: #ff2a5f; color: white; }
.badge.pendente { background: #ffb800; color: #000; }
.badge.aguardando_confirmacao { background: #00bfff; color: #000; animation: pulse 1.5s infinite; }
.badge.cancelado, .badge.expirado { background: #666; color: #aaa; }
.badge.rejeitado { background: #ff2a5f; color: white; }
.badge.online, .badge.active { background: #00ff88; color: #000; }
.badge.offline, .badge.inactive, .badge.invalid { background: #ff2a5f; color: white; }
.badge.padrao { background: #ffd700; color: #000; }
.badge.auth_error { background: #ff2a5f; color: white; }
.badge.nao_testado { background: #444; color: #aaa; }
.badge.ativo { background: #00ff88; color: #000; }
.badge.inativo { background: #666; color: white; }

button, .btn { background: #00e5ff; color: #000; border: none; padding: 8px 14px; border-radius: 50px; font-weight: 700; cursor: pointer; font-size: 0.8rem; transition: 0.2s; display: inline-flex; align-items: center; gap: 4px; text-decoration: none; }
button:hover, .btn:hover { transform: translateY(-1px); box-shadow: 0 4px 15px rgba(0,229,255,0.3); }
button.danger, .btn.danger { background: #ff2a5f; color: white; }
button.warning, .btn.warning { background: #ffb800; color: #000; }
button.success, .btn.success { background: #00ff88; color: #000; }
button.ghost { background: transparent; border: 1px solid rgba(255,255,255,0.2); color: #aaa; }
button.ghost:hover { border-color: #00e5ff; color: white; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
button.big, .btn.big { padding: 10px 20px; font-size: 0.9rem; }
.btn-group { display: inline-flex; gap: 4px; flex-wrap: wrap; }

input, select, textarea { width: 100%; padding: 10px 14px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: white; font-family: inherit; font-size: 0.9rem; }
input:focus, select:focus, textarea:focus { border-color: #00e5ff; outline: none; }
label { display: block; color: #aaa; font-size: 0.8rem; margin-bottom: 4px; margin-top: 12px; }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.form-row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
.help { font-size: 0.75rem; color: #666; margin-top: 4px; }
.checkbox-row { display: flex; align-items: center; gap: 8px; padding: 8px 0; }
.checkbox-row input { width: auto; }

.login-box { max-width: 400px; margin: 100px auto; padding: 40px; background: rgba(10,15,30,0.95); border-radius: 20px; border: 1px solid rgba(0,229,255,0.2); }
.login-box h1 { color: #00e5ff; margin-bottom: 20px; text-align: center; }

.topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
.topbar h1 { font-size: 1.5rem; }
.search-box { display: flex; gap: 8px; align-items: center; }
.search-box input { width: 250px; }

.modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 1000; align-items: center; justify-content: center; padding: 20px; }
.modal.active { display: flex; }
.modal-content { background: rgba(15,20,35,0.98); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; max-width: 500px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 24px; }
.modal-large { max-width: 700px; }
.modal h2 { color: #00e5ff; margin-bottom: 16px; }

.bar-chart { display: flex; align-items: flex-end; height: 200px; gap: 4px; margin-top: 16px; }
.bar { flex: 1; background: linear-gradient(180deg, #00e5ff, #0088aa); border-radius: 6px 6px 0 0; min-height: 4px; position: relative; transition: 0.3s; }
.bar:hover { opacity: 0.8; }
.bar-label { position: absolute; bottom: -22px; left: 0; right: 0; text-align: center; font-size: 0.7rem; color: #888; }
.bar-value { position: absolute; top: -22px; left: 0; right: 0; text-align: center; font-size: 0.75rem; font-weight: 700; }

.servidor-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 16px; margin-bottom: 12px; transition: 0.2s; }
.servidor-card.inativo { opacity: 0.5; background: rgba(255,255,255,0.01); }
.servidor-card.padrao { border-color: #ffd700; box-shadow: 0 0 15px rgba(255,215,0,0.2); }
.servidor-info { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px; }
.servidor-info-item { font-size: 0.8rem; }
.servidor-info-item .label { color: #888; font-size: 0.7rem; text-transform: uppercase; }
.servidor-info-item .value { color: white; font-weight: 600; word-break: break-all; }
.servidor-actions { display: flex; gap: 6px; flex-wrap: wrap; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.05); }

.resumo-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.resumo-item { background: rgba(0,0,0,0.3); padding: 12px; border-radius: 10px; text-align: center; }
.resumo-item .num { font-size: 1.8rem; font-weight: 900; }
.resumo-item .lbl { color: #888; font-size: 0.75rem; text-transform: uppercase; margin-top: 4px; }

.regiao-pill { display: inline-block; background: rgba(0,229,255,0.15); color: #00e5ff; padding: 3px 10px; border-radius: 50px; font-size: 0.72rem; margin: 2px; }
.admin-list-item { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(255,255,255,0.03); border-radius: 8px; margin-bottom: 4px; }
.admin-list-item .user { color: #00e5ff; font-weight: 700; }

.filter-tabs { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.filter-tab { padding: 8px 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 50px; color: #aaa; cursor: pointer; font-size: 0.85rem; font-weight: 600; transition: 0.2s; text-decoration: none; }
.filter-tab:hover { color: white; border-color: #00e5ff; }
.filter-tab.active { background: #00e5ff; color: #000; border-color: #00e5ff; }
.filter-tab .count { background: rgba(0,0,0,0.3); padding: 1px 8px; border-radius: 50px; font-size: 0.7rem; margin-left: 6px; }

.pay-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 16px; margin-bottom: 12px; transition: 0.2s; }
.pay-card.urgente { border-color: #00bfff; box-shadow: 0 0 12px rgba(0,191,255,0.15); animation: pulse 2s infinite; }
.pay-card.pago { border-color: rgba(0,255,136,0.3); opacity: 0.7; }
.pay-card.rejeitado { border-color: rgba(255,42,95,0.3); opacity: 0.6; }
.pay-card.processando { opacity: 0.6; pointer-events: none; }
.pay-card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.pay-card-user { font-size: 1.1rem; font-weight: 800; color: white; }
.pay-card-valor { font-size: 1.6rem; font-weight: 900; color: #00ff88; }
.pay-card-info { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; font-size: 0.8rem; }
.pay-card-info-item { background: rgba(0,0,0,0.3); padding: 8px 12px; border-radius: 8px; }
.pay-card-info-item .label { color: #888; font-size: 0.7rem; text-transform: uppercase; }
.pay-card-info-item .value { color: white; font-weight: 600; word-break: break-all; }
.pay-card-actions { display: flex; gap: 6px; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.05); flex-wrap: wrap; }
.pay-card-actions button { flex: 1; min-width: 120px; justify-content: center; }

.confirm-box { text-align: center; padding: 10px 0; }
.confirm-box .icon { font-size: 4rem; margin-bottom: 12px; }
.confirm-box h3 { color: #00ff88; font-size: 1.4rem; margin-bottom: 12px; }
.confirm-box .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
.confirm-box .info-row .label { color: #888; }
.confirm-box .info-row .value { color: white; font-weight: 700; }
.confirm-box .alerta { background: rgba(255,184,0,0.1); border: 1px solid #ffb800; padding: 12px; border-radius: 10px; margin: 12px 0; color: #ffb800; font-size: 0.88rem; }
.confirm-box .confirm-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 16px; }

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
.btn-spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(0,0,0,0.3); border-top-color: #000; border-radius: 50%; animation: spin 0.7s linear infinite; vertical-align: middle; }

.bc-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 14px; margin-bottom: 12px; }
.bc-card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 8px; }
.bc-card-title { font-size: 1rem; font-weight: 800; color: white; }
.bc-card-img { width: 100%; max-height: 200px; object-fit: cover; border-radius: 8px; margin: 8px 0; }
.bc-card-msg { color: #ddd; font-size: 0.88rem; margin: 8px 0; line-height: 1.5; }
.bc-card-link { display: inline-block; color: #00e5ff; text-decoration: none; font-size: 0.85rem; margin-top: 6px; }
.bc-card-meta { font-size: 0.72rem; color: #666; margin-top: 8px; }
.bc-card-actions { display: flex; gap: 6px; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.05); }

.senha-box { text-align: center; padding: 10px 0; }
.senha-box .senha-valor { font-size: 2rem; font-weight: 900; color: #00ff88; font-family: monospace; padding: 18px; background: rgba(0,0,0,0.4); border-radius: 10px; letter-spacing: 4px; margin: 16px 0; user-select: all; word-break: break-all; }

@media (max-width: 900px) {
    .sidebar { width: 60px; }
    .sidebar-brand span, .nav-item span:not(.nav-icon):not(.nav-badge) { display: none; }
    .nav-item { justify-content: center; padding: 12px 0; }
    .main { margin-left: 60px; padding: 16px; }
    .form-row, .form-row-3 { grid-template-columns: 1fr; }
    .servidor-info { grid-template-columns: 1fr; }
    .search-box input { width: 150px; }
    .pay-card-info { grid-template-columns: 1fr; }
}
</style>
</head>
<body>
<?php if ($bloqueado && !$logged): ?>
<div class="login-box">
    <h1>🔒 Bloqueado</h1>
    <p style="text-align:center;color:#ff2a5f;">Muitas tentativas. Aguarde 15 minutos.</p>
</div>
<?php elseif (!$logged): ?>
<div class="login-box">
    <h1>🔐 Painel Admin</h1>
    <?php if ($msg): ?><div class="msg <?=$msgType?>"><?=$msg?></div><?php endif; ?>
    <form method="post">
        <label>Senha de Acesso</label>
        <input type="password" name="password" placeholder="Digite a senha" autofocus required>
        <p class="help">Tentativas: <?=count($tentativas)?>/10 • IP: <?=$ip?></p>
        <button type="submit" style="width:100%;margin-top:20px;padding:12px;">🔓 Entrar</button>
    </form>
</div>
<?php else: ?>

<div class="admin-wrap">
    <aside class="sidebar">
        <div class="sidebar-brand">🔧 <span>Admin Panel</span></div>
        
        <div class="nav-section"><span>Principal</span></div>
        <a href="?tab=dashboard" class="nav-item <?=$aba==='dashboard'?'active':''?>">
            <span class="nav-icon">📊</span> <span>Dashboard</span>
        </a>
        <a href="?tab=users" class="nav-item <?=$aba==='users'?'active':''?>">
            <span class="nav-icon">👥</span> <span>Usuários</span>
            <span class="nav-badge"><?=$stats['total']?></span>
        </a>
        <a href="?tab=verificacoes" class="nav-item <?=$aba==='verificacoes'?'active':''?>">
            <span class="nav-icon">🔔</span> <span>Verificações</span>
            <?php if (count($verifPendentes) > 0): ?><span class="nav-badge"><?=count($verifPendentes)?></span><?php endif; ?>
        </a>
        <a href="?tab=payments" class="nav-item <?=$aba==='payments'?'active':''?>">
            <span class="nav-icon">💰</span> <span>Pagamentos</span>
            <?php 
            $pendentes = count(array_filter($pagsPend, fn($p) => in_array($p['status'] ?? '', ['pendente', 'aguardando_confirmacao'])));
            if ($pendentes > 0): ?><span class="nav-badge"><?=$pendentes?></span><?php endif; ?>
        </a>
        <a href="?tab=servers" class="nav-item <?=$aba==='servers'?'active':''?>">
            <span class="nav-icon">📡</span> <span>Servidores</span>
            <span class="nav-badge"><?=count($servidores)?></span>
        </a>
        
        <div class="nav-section"><span>Gestão</span></div>
        <a href="?tab=reports" class="nav-item <?=$aba==='reports'?'active':''?>">
            <span class="nav-icon">📈</span> <span>Relatórios</span>
        </a>
        <a href="?tab=broadcast" class="nav-item <?=$aba==='broadcast'?'active':''?>">
            <span class="nav-icon">📢</span> <span>Broadcast</span>
            <?php if (count($broadcasts) > 0): ?><span class="nav-badge success"><?=count($broadcasts)?></span><?php endif; ?>
        </a>
        <a href="?tab=logs" class="nav-item <?=$aba==='logs'?'active':''?>">
            <span class="nav-icon">📋</span> <span>Logs</span>
        </a>
        
        <div class="nav-section"><span>Sistema</span></div>
        <a href="?tab=config" class="nav-item <?=$aba==='config'?'active':''?>">
            <span class="nav-icon">⚙️</span> <span>Configurações</span>
        </a>
        <a href="?tab=maintenance" class="nav-item <?=$aba==='maintenance'?'active':''?>">
            <span class="nav-icon">🛠️</span> <span>Manutenção</span>
        </a>
        <a href="?tab=support" class="nav-item <?=$aba==='support'?'active':''?>">
            <span class="nav-icon">💬</span> <span>Suporte</span>
        </a>
        
        <div style="margin-top:auto; padding: 20px;">
            <a href="?logout=1" class="nav-item" style="color:#ff2a5f;">
                <span class="nav-icon">🚪</span> <span>Sair</span>
            </a>
        </div>
    </aside>

    <main class="main">
        <?php if ($msg): ?><div class="msg <?=$msgType?>"><?=$msg?></div><?php endif; ?>

        <?php if ($aba === 'dashboard'): ?>
            <div class="topbar">
                <h1>📊 Dashboard</h1>
                <div style="color:#888;font-size:0.85rem;">Atualizado: <?=date('d/m/Y H:i')?></div>
            </div>
            
            <?php if (!empty($config['manutencao'])): ?>
            <div class="msg warning" style="font-size:1rem;">
                ⚠️ <strong>MODO MANUTENÇÃO ATIVO!</strong> Os usuários estão vendo a tela de manutenção.
                <a href="?action=desativar_manutencao&tab=dashboard" class="danger" style="margin-left:10px;text-decoration:none;padding:6px 14px;border-radius:50px;display:inline-block;">🚨 DESATIVAR AGORA</a>
            </div>
            <?php endif; ?>
            
            <div class="card-grid">
                <div class="stat-card"><div class="stat-label">👥 Total</div><div class="stat-value"><?=$stats['total']?></div></div>
                <div class="stat-card"><div class="stat-label">✅ Ativos</div><div class="stat-value success"><?=$stats['ativos']?></div></div>
                <div class="stat-card"><div class="stat-label">🎁 Trial</div><div class="stat-value warning"><?=$stats['trial']?></div></div>
                <div class="stat-card"><div class="stat-label">⚠️ Expirados</div><div class="stat-value danger"><?=$stats['expirados']?></div></div>
                <div class="stat-card"><div class="stat-label">👑 Admins</div><div class="stat-value"><?=$stats['admins']?></div></div>
                <div class="stat-card"><div class="stat-label">📡 Servidores</div><div class="stat-value"><?=count($servidores)?></div></div>
                <div class="stat-card"><div class="stat-label">💰 30 dias</div><div class="stat-value success"><?=formatarMoeda($stats['receita_mes'])?></div></div>
                <div class="stat-card"><div class="stat-label">💎 Total</div><div class="stat-value success"><?=formatarMoeda($stats['receita_total'])?></div></div>
            </div>
            
            <div class="card">
                <h2>🔔 Verificações Pendentes (<?=count($verifPendentes)?>)</h2>
                <?php if (empty($verifPendentes)): ?>
                    <p style="color:#888;text-align:center;padding:20px;">✅ Nenhum pagamento aguardando confirmação</p>
                <?php else: ?>
                    <p style="color:#ffb800;margin-bottom:12px;">⚠️ <strong><?=count($verifPendentes)?> usuário(s)</strong> clicaram em "Já Paguei".</p>
                    <a href="?tab=verificacoes" class="btn success big">🔔 Verificar Agora</a>
                <?php endif; ?>
            </div>

        <?php elseif ($aba === 'users'): ?>
            <div class="topbar">
                <h1>👥 Usuários (<?=count($users)?>)</h1>
                <div class="search-box">
                    <form method="get" style="display:flex;gap:8px;">
                        <input type="hidden" name="tab" value="users">
                        <input type="text" name="q" placeholder="Buscar..." value="<?=htmlspecialchars($busca)?>">
                        <button type="submit">🔍</button>
                    </form>
                    <a href="?action=exportcsv" class="btn success">📥 CSV</a>
                </div>
            </div>
            
            <div class="card">
                <div class="table-wrap">
                <table>
                    <thead><tr><th>Usuário</th><th>E-mail</th><th>Status</th><th>Dias</th><th>Expira</th><th>Pag.</th><th>Ações</th></tr></thead>
                    <tbody>
                    <?php foreach ($users as $u): ?>
                        <tr>
                            <td><strong><?=$u['usuario']?></strong></td>
                            <td style="font-size:0.78rem;color:#888;"><?=$u['email']?></td>
                            <td><span class="badge <?=$u['status']?>"><?=$u['status']?></span></td>
                            <td><?=$u['dias'] >= 9999 ? '∞' : $u['dias']?></td>
                            <td style="font-size:0.78rem;"><?=formatarData($u['expira'])?></td>
                            <td><?=$u['pags']?></td>
                            <td>
                                <div class="btn-group">
                                    <button onclick="if(confirm('+1m?'))location.href='?action=extend&user=<?=urlencode($u['usuario'])?>&meses=1&tab=users'">+1m</button>
                                    <button onclick="if(confirm('+3m?'))location.href='?action=extend&user=<?=urlencode($u['usuario'])?>&meses=3&tab=users'">+3m</button>
                                    <button onclick="if(confirm('+12m?'))location.href='?action=extend&user=<?=urlencode($u['usuario'])?>&meses=12&tab=users'">+12m</button>
                                    <button class="ghost" onclick="abrirModalUser('<?=$u['usuario']?>','<?=$u['email']?>')">⚙️</button>
                                </div>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
                </div>
            </div>
            
            <div class="modal" id="modalUser">
                <div class="modal-content">
                    <h2 style="color:#00e5ff;margin-bottom:16px;" id="modalUserTitle">⚙️ Ações</h2>
                    <div id="modalUserBody"></div>
                    <button class="ghost" onclick="document.getElementById('modalUser').classList.remove('active')" style="width:100%;margin-top:16px;">Fechar</button>
                </div>
            </div>
        <?php elseif ($aba === 'payments'): ?>
            <div class="topbar">
                <h1>💰 Lista de Pagamentos (<?=count($pagsPend)?>)</h1>
                <div class="btn-group">
                    <a href="?action=export_pagamentos_csv" class="btn ghost">📥 Exportar CSV</a>
                    <a href="?action=cleanexpired&tab=payments" class="btn warning" onclick="return confirm('Limpar pagamentos expirados há mais de 24h?')">🧹 Limpar Expirados</a>
                </div>
            </div>
            
            <div class="card-grid">
                <div class="stat-card"><div class="stat-label">💰 Hoje</div><div class="stat-value success"><?=formatarMoeda($receitaStats['hoje'])?></div><div class="stat-sub"><?=$receitaStats['qtd_hoje']?> pagamento(s)</div></div>
                <div class="stat-card"><div class="stat-label">📅 7 dias</div><div class="stat-value success"><?=formatarMoeda($receitaStats['semana'])?></div></div>
                <div class="stat-card"><div class="stat-label">📆 30 dias</div><div class="stat-value success"><?=formatarMoeda($receitaStats['mes'])?></div><div class="stat-sub"><?=$receitaStats['qtd_mes']?> pagamento(s)</div></div>
                <div class="stat-card"><div class="stat-label">⏳ Pendentes</div><div class="stat-value warning"><?=formatarMoeda($receitaStats['pendente'])?></div></div>
                <div class="stat-card"><div class="stat-label">💎 Total Geral</div><div class="stat-value success"><?=formatarMoeda($receitaStats['total'])?></div></div>
            </div>
            
            <div class="filter-tabs">
                <?php 
                $statusCounts = [
                    'todos' => count($pagsPend),
                    'aguardando_confirmacao' => count(array_filter($pagsPend, fn($p) => ($p['status'] ?? '') === 'aguardando_confirmacao')),
                    'pendente' => count(array_filter($pagsPend, fn($p) => ($p['status'] ?? '') === 'pendente')),
                    'pago' => count(array_filter($pagsPend, fn($p) => ($p['status'] ?? '') === 'pago')),
                    'rejeitado' => count(array_filter($pagsPend, fn($p) => ($p['status'] ?? '') === 'rejeitado')),
                    'expirado' => count(array_filter($pagsPend, fn($p) => ($p['status'] ?? '') === 'expirado'))
                ];
                $filtroLabels = [
                    'todos' => '📊 Todos',
                    'aguardando_confirmacao' => '🔔 Aguardando Confirmação',
                    'pendente' => '⏳ Pendentes',
                    'pago' => '✅ Pagos',
                    'rejeitado' => '❌ Rejeitados',
                    'expirado' => '⏰ Expirados'
                ];
                foreach ($filtroLabels as $k => $lbl): ?>
                    <a href="?tab=payments&status=<?=$k?>" class="filter-tab <?=$filtroStatus===$k?'active':''?>">
                        <?=$lbl?> <span class="count"><?=$statusCounts[$k]?></span>
                    </a>
                <?php endforeach; ?>
            </div>
            
            <div class="card">
                <h2>💸 Lista de Pagamentos (<?=count($pagsFiltrados)?>)</h2>
                <?php if (empty($pagsFiltrados)): ?>
                    <p style="color:#888;text-align:center;padding:40px;">Nenhum pagamento neste filtro</p>
                <?php else: foreach ($pagsFiltrados as $p):
                    $status = $p['status'] ?? '';
                    $cardClass = '';
                    if ($status === 'aguardando_confirmacao') $cardClass = 'urgente';
                    elseif ($status === 'pago') $cardClass = 'pago';
                    elseif ($status === 'rejeitado' || $status === 'cancelado') $cardClass = 'rejeitado';
                    $meses = intval($p['meses'] ?? 1); ?>
                        <div class="pay-card <?=$cardClass?>" id="pay-card-<?=htmlspecialchars($p['corr'])?>">
                            <div class="pay-card-header">
                                <div>
                                    <div class="pay-card-user">👤 <?=htmlspecialchars($p['usuario'])?></div>
                                </div>
                                <div style="text-align:right;">
                                    <div class="pay-card-valor"><?=formatarMoeda($p['valor'])?></div>
                                </div>
                            </div>
                            <?php if (in_array($status, ['pendente', 'aguardando_confirmacao'])): ?>
                            <div class="pay-card-actions">
                                <button class="success big" id="btn-conf-<?=htmlspecialchars($p['corr'])?>" onclick="confirmarPagamentoDireto('<?=$p['corr']?>', '<?=htmlspecialchars($p['usuario'])?>', <?=$meses?>, <?=floatval($p['valor'])?>, this)">
                                    ✓ Confirmar e Liberar <?=formatarMoeda($p['valor'])?>
                                </button>
                                <a href="?action=rejectpay&corr=<?=urlencode($p['corr'])?>&motivo=Pagamento%20nao%20identificado&tab=payments" class="danger" onclick="return confirm('Rejeitar este pagamento?')">✕ Rejeitar</a>
                            </div>
                            <?php endif; ?>
                        </div>
                    <?php endforeach; endif; ?>
            </div>

        <?php elseif ($aba === 'verificacoes'): ?>
            <div class="topbar">
                <h1>🔔 Verificações de Pagamento (<?=count($verifPendentes)?>)</h1>
            </div>
            <div class="card">
                <?php if (empty($verifPendentes)): ?>
                    <p style="color:#00ff88;text-align:center;padding:40px;font-size:1.1rem;">✅ Nenhuma verificação pendente.</p>
                <?php else: foreach ($verifPendentes as $p):
                    $meses = intval($p['meses'] ?? 1); ?>
                        <div class="pay-card urgente" id="pay-card-<?=htmlspecialchars($p['corr'])?>">
                            <div class="pay-card-header">
                                <div><div class="pay-card-user">👤 <?=htmlspecialchars($p['usuario'])?></div></div>
                                <div class="pay-card-valor"><?=formatarMoeda($p['valor'])?></div>
                            </div>
                            <div class="pay-card-actions">
                                <button class="success big" onclick="confirmarPagamentoDireto('<?=$p['corr']?>', '<?=htmlspecialchars($p['usuario'])?>', <?=$meses?>, <?=floatval($p['valor'])?>, this)">✓ Confirmar Pagamento</button>
                                <a href="?action=rejectpay&corr=<?=urlencode($p['corr'])?>&motivo=Pagamento%20nao%20identificado&tab=verificacoes" class="danger" onclick="return confirm('Rejeitar?')">✕ Rejeitar</a>
                            </div>
                        </div>
                    <?php endforeach; endif; ?>
            </div>

        <?php elseif ($aba === 'servers'): ?>
            <div class="topbar">
                <h1>📡 Servidores IPTV (<?=count($servidores)?>)</h1>
                <div class="btn-group">
                    <a href="?action=testtodos&tab=servers" class="btn success">🧪 Testar Todos</a>
                    <button onclick="document.getElementById('modalAddServer').classList.add('active')" class="btn">➕ Adicionar</button>
                </div>
            </div>
            
            <div class="card">
                <h2>📊 Resumo</h2>
                <div class="resumo-grid">
                    <div class="resumo-item"><div class="num" style="color:#00e5ff;"><?=$servResumo['total']?></div><div class="lbl">Total</div></div>
                    <div class="resumo-item"><div class="num" style="color:#00ff88;"><?=$servResumo['ativos']?></div><div class="lbl">Ativados</div></div>
                    <div class="resumo-item"><div class="num" style="color:#00ff88;"><?=$servResumo['online']?></div><div class="lbl">🟢 Online</div></div>
                    <div class="resumo-item"><div class="num" style="color:#ff2a5f;"><?=$servResumo['offline']?></div><div class="lbl">🔴 Offline</div></div>
                    <div class="resumo-item"><div class="num" style="color:#00e5ff;"><?=$servResumo['latencia_media']?>ms</div><div class="lbl">Latência</div></div>
                </div>
            </div>
            
            <div class="card">
                <h2>📋 Lista</h2>
                <?php foreach ($servidores as $idx => $s):
                    $ativo = !empty($s['ativo']);
                    $padrao = !empty($s['padrao']);
                    $ultStatus = $s['ultimo_status'] ?? 'nao_testado'; ?>
                    <div class="servidor-card <?=!$ativo?'inativo':''?> <?=$padrao?'padrao':''?>">
                        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px;flex-wrap:wrap;gap:10px;">
                            <div style="flex:1;min-width:200px;">
                                <h3 style="font-size:1.05rem;margin-bottom:4px;"><?=htmlspecialchars($s['nome'] ?? 'Servidor ' . ($idx+1))?></h3>
                            </div>
                            <div>
                                <?php if ($ultStatus === 'active' || $ultStatus === 'online'): ?><span class="badge online">🟢 ONLINE</span>
                                <?php elseif ($ultStatus === 'inactive'): ?><span class="badge inactive">🟡 INATIVO</span>
                                <?php else: ?><span class="badge offline">🔴 <?=strtoupper($ultStatus)?></span><?php endif; ?>
                            </div>
                        </div>
                        <div class="servidor-info">
                            <div class="servidor-info-item"><div class="label">Host</div><div class="value"><?=htmlspecialchars($s['host'])?></div></div>
                            <div class="servidor-info-item"><div class="label">Usuário</div><div class="value"><?=htmlspecialchars($s['user'])?></div></div>
                            <div class="servidor-info-item"><div class="label">Senha</div><div class="value">••••••••</div></div>
                        </div>
                        <div class="servidor-actions">
                            <a href="?action=testservidor&idx=<?=$idx?>&tab=servers" class="btn success">🧪 Testar</a>
                            <a href="?action=toggleservidor&idx=<?=$idx?>&tab=servers" class="btn warning"><?=$ativo?'⏸️':'▶️'?></a>
                            <a href="?action=delservidor&idx=<?=$idx?>&tab=servers" class="btn danger" onclick="return confirm('Excluir?')">🗑️</a>
                        </div>
                    </div>
                <?php endforeach; ?>
            </div>
            
            <div class="modal" id="modalAddServer">
                <div class="modal-content modal-large">
                    <h2 style="color:#00e5ff;margin-bottom:16px;">➕ Adicionar Servidor</h2>
                    <form method="post" action="?action=addservidor&tab=servers">
                        <div class="form-row">
                            <div><label>Nome</label><input type="text" name="nome" placeholder="Ex: Principal"></div>
                            <div><label>Região</label><input type="text" name="regiao" placeholder="Ex: Brasil"></div>
                        </div>
                        <label>Host *</label><input type="text" name="host" placeholder="http://servidor.com" required>
                        <div class="form-row">
                            <div><label>Usuário *</label><input type="text" name="user" required></div>
                            <div><label>Senha *</label><input type="text" name="pass" required></div>
                        </div>
                        <div class="form-row-3">
                            <div><label>Conexões</label><input type="number" name="conexoes_max" value="1"></div>
                            <div><label>Prioridade</label><input type="number" name="prioridade" value="5"></div>
                            <div><label>URL Playlist</label><input type="text" name="url_playlist"></div>
                        </div>
                        <div class="checkbox-row"><input type="checkbox" name="testar_antes" value="1" checked><label style="margin:0;">🧪 Testar antes</label></div>
                        <div class="btn-group" style="margin-top:20px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                            <button type="button" class="ghost" onclick="document.getElementById('modalAddServer').classList.remove('active')">Cancelar</button>
                            <button type="submit" class="success">💾 Adicionar</button>
                        </div>
                    </form>
                </div>
            </div>

        <?php elseif ($aba === 'broadcast'): ?>
            <div class="topbar">
                <h1>📢 Broadcast (<?=count($broadcasts)?> ativo(s))</h1>
                <button onclick="document.getElementById('modalBroadcast').classList.add('active')" class="btn success">➕ Novo</button>
            </div>
            
            <div class="card">
                <h2>📢 Criar Broadcast</h2>
                <p class="help" style="margin-bottom:16px;">💡 Pop-up flutuante na tela inicial com imagem + título + mensagem + link opcional.</p>
                <button onclick="document.getElementById('modalBroadcast').classList.add('active')" class="success big">📢 Criar Novo Broadcast</button>
            </div>
            
            <div class="card">
                <h2>📋 Ativos (<?=count($broadcasts)?>)</h2>
                <?php if (empty($broadcasts)): ?>
                    <p style="color:#888;text-align:center;padding:40px;">Nenhum broadcast ativo</p>
                <?php else: foreach ($broadcasts as $bcId => $bc): ?>
                    <div class="bc-card">
                        <div class="bc-card-header">
                            <div class="bc-card-title"><?=htmlspecialchars($bc['titulo'])?></div>
                            <span class="badge ativo">ATIVO</span>
                        </div>
                        <?php if (!empty($bc['imagem']) && file_exists($bc['imagem'])): ?>
                            <img src="<?=htmlspecialchars($bc['imagem'])?>" class="bc-card-img" alt="">
                        <?php endif; ?>
                        <?php if (!empty($bc['msg'])): ?>
                            <div class="bc-card-msg"><?=nl2br(htmlspecialchars($bc['msg']))?></div>
                        <?php endif; ?>
                        <div class="bc-card-meta">📅 <?=formatarData(strtotime($bc['criado']))?> | ⏰ Expira: <?=formatarData(strtotime($bc['expira']))?></div>
                        <div class="bc-card-actions">
                            <a href="?action=delbroadcast&id=<?=urlencode($bcId)?>&tab=broadcast" class="btn danger" onclick="return confirm('Remover?')">🗑️ Remover</a>
                        </div>
                    </div>
                <?php endforeach; endif; ?>
            </div>
            
            <div class="modal" id="modalBroadcast">
                <div class="modal-content modal-large">
                    <h2 style="color:#00e5ff;margin-bottom:16px;">📢 Novo Broadcast</h2>
                    <form method="post" action="?action=broadcast&tab=broadcast" enctype="multipart/form-data">
                        <label>Título *</label>
                        <input type="text" name="titulo" placeholder="Ex: 🎉 Promoção!" required>
                        <label>Mensagem</label>
                        <textarea name="msg" rows="4" placeholder="Mensagem..."></textarea>
                        <label>📸 Imagem (opcional)</label>
                        <input type="file" name="imagem" accept="image/jpeg,image/png,image/webp,image/gif">
                        <p class="help">💡 JPG/PNG/WebP. Máx 5MB.</p>
                        <label>🔗 Link (opcional)</label>
                        <input type="url" name="link" placeholder="https://...">
                        <div class="btn-group" style="margin-top:20px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                            <button type="button" class="ghost" onclick="document.getElementById('modalBroadcast').classList.remove('active')">Cancelar</button>
                            <button type="submit" class="success">📢 Enviar</button>
                        </div>
                    </form>
                </div>
            </div>

        <?php elseif ($aba === 'config'): ?>
            <div class="topbar"><h1>⚙️ Configurações</h1></div>
            
            <?php if (!empty($config['manutencao'])): ?>
            <div class="msg warning" style="font-size:1rem;">
                ⚠️ <strong>MODO MANUTENÇÃO ATIVO!</strong> Prev: <?=htmlspecialchars($config['manutencao_previsao'] ?? '2 horas')?>
                <br><br>
                <a href="?action=desativar_manutencao&tab=config" class="danger big" style="text-decoration:none;display:inline-block;">🚨 DESATIVAR MANUTENÇÃO AGORA</a>
            </div>
            <?php endif; ?>
            
            <form method="post" action="?action=saveconfig&tab=config">
                <div class="card">
                    <h2>💰 Pagamento e Pix</h2>
                    <div class="form-row">
                        <div><label>Valor Mensal (R$)</label><input type="number" name="valor_mensal" step="0.01" value="<?=$config['valor_mensal'] ?? 1.00?>" required></div>
                        <div><label>Trial (horas)</label><input type="number" name="trial_horas" value="<?=$config['trial_horas'] ?? 24?>" required></div>
                    </div>
                    <label>Chave Pix</label><input type="text" name="pix_chave" value="<?=htmlspecialchars($config['pix_chave'] ?? '')?>" required>
                    <div class="form-row">
                        <div><label>Nome</label><input type="text" name="pix_nome" value="<?=htmlspecialchars($config['pix_nome'] ?? 'RABELO TV')?>" maxlength="25" required></div>
                        <div><label>Cidade</label><input type="text" name="pix_cidade" value="<?=htmlspecialchars($config['pix_cidade'] ?? 'SAO PAULO')?>" maxlength="15" required></div>
                    </div>
                </div>
                <div class="card">
                    <h2>📞 Suporte</h2>
                    <label>WhatsApp</label><input type="text" name="whatsapp_suporte" value="<?=$config['whatsapp_suporte'] ?? ''?>" required>
                </div>
                <div class="card">
                    <h2>🔐 Segurança</h2>
                    <label>Senha Admin</label><input type="text" name="admin_password" value="<?=htmlspecialchars($senhaAdmin)?>" required>
                </div>
                <div class="card" style="<?=!empty($config['manutencao'])?'border-color:#ffb800;border-width:2px;':''?>">
                    <h2>🚧 <?=!empty($config['manutencao'])?'⚠️ MODO MANUTENÇÃO ATIVO':'Manutenção'?></h2>
                    <p class="help" style="margin-bottom:14px;">Quando ativo, novos logins são bloqueados. Admins sempre acessam.</p>
                    
                    <div class="checkbox-row">
                        <input type="checkbox" name="manutencao" value="1" id="cfg_manutencao" <?=!empty($config['manutencao'])?'checked':''?>>
                        <label for="cfg_manutencao" style="margin:0;font-weight:700;color:#ffb800;">🔧 Ativar Modo Manutenção</label>
                    </div>
                    
                    <label>Mensagem para os usuários</label>
                    <textarea name="mensagem_manutencao" rows="3"><?=htmlspecialchars($config['mensagem_manutencao'] ?? 'Estamos em manutenção! Voltaremos dentro de 2 horas.')?></textarea>
                    
                    <label>⏰ Previsão de Retorno</label>
                    <input type="text" name="manutencao_previsao" value="<?=htmlspecialchars($config['manutencao_previsao'] ?? '2 horas')?>" placeholder="Ex: 2 horas">
                    
                    <p class="help">💡 <strong>Como testar:</strong> marque → Salvar → abra o site em aba anônima. Desmarque → Salvar → recarregue (Ctrl+F5).</p>
                </div>
                <button type="submit" style="width:100%;padding:14px;">💾 Salvar Configurações</button>
            </form>

        <?php elseif ($aba === 'maintenance'): ?>
            <div class="topbar"><h1>🛠️ Manutenção</h1></div>
            <div class="card">
                <h2>💾 Backup</h2>
                <a href="?action=backup" class="btn success">📦 Criar Backup Completo</a>
                <?php if (!empty($backups)): ?>
                <h3 style="margin-top:20px;font-size:1rem;">Backups disponíveis</h3>
                <div class="table-wrap"><table>
                    <thead><tr><th>Arquivo</th><th>Tamanho</th><th>Data</th></tr></thead>
                    <tbody>
                    <?php foreach (array_slice($backups, 0, 10) as $b): ?>
                        <tr>
                            <td style="font-family:monospace;font-size:0.8rem;"><?=basename($b)?></td>
                            <td><?=round(filesize($b)/1024, 1)?> KB</td>
                            <td><?=date('d/m/Y H:i', filemtime($b))?></td>
                        </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table></div>
                <?php endif; ?>
            </div>

        <?php elseif ($aba === 'support'): ?>
            <div class="topbar"><h1>💬 Suporte</h1></div>
            <div class="card">
                <h2>📱 Templates WhatsApp</h2>
                <div class="form-row">
                    <div>
                        <h3 style="font-size:0.95rem;margin-bottom:8px;">👋 Boas-vindas</h3>
                        <textarea readonly rows="3">Bem-vindo à Rabelo TV! 🎬 24h grátis.</textarea>
                    </div>
                    <div>
                        <h3 style="font-size:0.95rem;margin-bottom:8px;">💰 Recebido</h3>
                        <textarea readonly rows="3">Recebi seu pagamento! ✅ Plano ativado.</textarea>
                    </div>
                </div>
            </div>
        <?php endif; ?>
    </main>
</div>

<div class="modal" id="modalSenha">
    <div class="modal-content">
        <div class="senha-box">
            <h3 style="color:#00e5ff;">🔑 Senha</h3>
            <div id="senha_disponivel" style="display:none;">
                <div class="senha-valor" id="senha_valor">-----</div>
                <button class="success big" onclick="copiarSenha()" style="width:100%;">📋 Copiar</button>
            </div>
            <div id="senha_indisponivel" style="display:none;">
                <p style="background:rgba(255,184,0,0.1);border:1px solid #ffb800;padding:14px;border-radius:10px;margin:12px 0;color:#ffb800;">⚠️ Senha original indisponível. Use "Resetar Senha".</p>
                <a id="reset_link" href="#" class="warning big" style="width:100%;text-decoration:none;justify-content:center;display:flex;">🔑 Resetar</a>
            </div>
            <button class="ghost" onclick="fecharModal('modalSenha')" style="width:100%;margin-top:16px;">Fechar</button>
        </div>
    </div>
</div>

<?php endif; ?>

<script>
let corrParaConfirmar = null;
function $(id) { return document.getElementById(id); }
function fecharModal(id) { document.getElementById(id).classList.remove('active'); }

function confirmarPagamentoDireto(corr, usuario, meses, valor, btn) {
    if (!corr) { alert('❌ ID do pagamento não encontrado'); return; }
    if (!confirm(`✅ Confirmar e LIBERAR?\n\n👤 ${usuario}\n📅 ${meses} mês(es)\n💰 R$ ${valor.toFixed(2)}\n\n⚠️ Plano será estendido automaticamente.`)) return;
    
    const card = document.getElementById('pay-card-' + corr);
    if (card) card.classList.add('processando');
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner"></span> Liberando...';
    
    fetch('?action=confirmpay_ajax&corr=' + encodeURIComponent(corr) + '&tab=payments', {method: 'GET', credentials: 'same-origin'})
    .then(r => r.json())
    .then(data => {
        if (data.ok) {
            btn.className = 'success big';
            btn.innerHTML = '✓ LIBERADO! Recarregando...';
            setTimeout(() => location.reload(), 1200);
        } else {
            alert('❌ Erro: ' + (data.msg || 'desconhecido'));
            if (card) card.classList.remove('processando');
            btn.disabled = false;
            btn.innerHTML = originalHTML;
        }
    })
    .catch(err => {
        alert('❌ Erro: ' + err.message);
        if (card) card.classList.remove('processando');
        btn.disabled = false;
        btn.innerHTML = originalHTML;
    });
}

function abrirModalUser(user, email) {
    document.getElementById('modalUserTitle').innerHTML = '⚙️ ' + user;
    document.getElementById('modalUserBody').innerHTML = `
        <p><strong>Usuário:</strong> ${user}</p>
        <p><strong>E-mail:</strong> ${email || '-'}</p>
        <hr style="margin:16px 0;border-color:rgba(255,255,255,0.1);">
        <button class="success big" onclick="verSenhaUsuario('${user}')" style="width:100%;margin-bottom:8px;">🔑 Ver Senha</button>
        <div class="btn-group" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <button class="success" onclick="location.href='?action=extend&user=${encodeURIComponent(user)}&meses=1&tab=users'">+1m</button>
            <button class="success" onclick="location.href='?action=extend&user=${encodeURIComponent(user)}&meses=3&tab=users'">+3m</button>
            <button class="success" onclick="location.href='?action=extend&user=${encodeURIComponent(user)}&meses=12&tab=users'">+12m</button>
            <button class="warning" onclick="if(confirm('Resetar?'))location.href='?action=resetpass&user=${encodeURIComponent(user)}&tab=users'">🔑 Reset</button>
            <button class="warning" onclick="if(confirm('Remover?'))location.href='?action=removeplan&user=${encodeURIComponent(user)}&tab=users'">🚫 Plano</button>
            <button class="danger" onclick="if(confirm('Banir?'))location.href='?action=ban&user=${encodeURIComponent(user)}&tab=users'">⛔ Banir</button>
            <button class="danger" onclick="if(confirm('Excluir?'))location.href='?action=delete&user=${encodeURIComponent(user)}&tab=users'">🗑️ Excluir</button>
            <button class="ghost" onclick="if(confirm('Admin?'))location.href='?action=admin&user=${encodeURIComponent(user)}&tab=users'">👑 Admin</button>
        </div>
    `;
    document.getElementById('modalUser').classList.add('active');
}

function verSenhaUsuario(user) {
    const btn = event.target;
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner"></span>';
    fetch('?action=ver_senha&user=' + encodeURIComponent(user), {credentials: 'same-origin'})
    .then(r => r.json())
    .then(data => {
        btn.disabled = false; btn.innerHTML = originalHTML;
        if (!data.ok) { alert('❌ ' + (data.msg || 'Erro')); return; }
        if (data.senha_original) {
            $('senha_disponivel').style.display = 'block';
            $('senha_indisponivel').style.display = 'none';
            $('senha_valor').textContent = data.senha_original;
        } else {
            $('senha_disponivel').style.display = 'none';
            $('senha_indisponivel').style.display = 'block';
            $('reset_link').href = '?action=resetpass&user=' + encodeURIComponent(user) + '&tab=users';
        }
        document.getElementById('modalSenha').classList.add('active');
    })
    .catch(err => { btn.disabled = false; btn.innerHTML = originalHTML; alert('❌ ' + err.message); });
}

function copiarSenha() {
    const senha = $('senha_valor').textContent;
    navigator.clipboard.writeText(senha).then(() => {
        event.target.innerHTML = '✅ Copiado!';
        event.target.disabled = true;
        setTimeout(() => { event.target.innerHTML = '📋 Copiar'; event.target.disabled = false; }, 2000);
    });
}

setTimeout(() => {
    document.querySelectorAll('.msg').forEach(m => {
        m.style.transition = 'opacity 0.5s';
        setTimeout(() => m.style.opacity = '0', 6000);
        setTimeout(() => m.remove(), 7000);
    });
}, 100);

document.querySelector('a[href*="logout"]')?.addEventListener('click', e => { if (!confirm('Sair?')) e.preventDefault(); });

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
});
</script>
</body>
</html>
