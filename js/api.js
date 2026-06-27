async function fetchWithFallback(url) {
    const proxies = [
        `https://corsproxy.io/?${encodeURIComponent(url)}`,
        `https://api.allorigins.win/get?url=${encodeURIComponent(url)}&_=${Date.now()}`
    ];
    for (let p of proxies) {
        try {
            const res = await fetch(p);
            if (res.ok) {
                const data = await res.json();
                return p.includes('allorigins') ? JSON.parse(data.contents) : data;
            }
        } catch (err) {}
    }
    throw new Error("Servidor inacessível.");
}
