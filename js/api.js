async function fetchWithFallback(url) {
    // Lista de proxies, priorizando o seu proxy dedicado do Cloudflare Workers
    const proxies = [
        `https://iptv-proxy.joranmartins3.workers.dev/?${encodeURIComponent(url)}`,
        `https://corsproxy.io/?${encodeURIComponent(url)}`,
        `https://api.allorigins.win/get?url=${encodeURIComponent(url)}&_=${Date.now()}`
    ];
    
    for (let p of proxies) {
        try {
            const res = await fetch(p);
            if (res.ok) {
                const data = await res.json();
                // O AllOrigins retorna os dados dentro da propriedade 'contents', os outros retornam direto
                return p.includes('allorigins') ? JSON.parse(data.contents) : data;
            }
        } catch (err) {
            // Ignora o erro e tenta o próximo proxy da lista
            console.warn(`Falha no proxy: ${p}`, err);
        }
    }
    
    // Se todos os proxies falharem, dispara o erro
    throw new Error("Servidor inacessível ou proxies bloqueados.");
}
