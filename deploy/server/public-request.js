// Only restore known public hosts, never an arbitrary forwarded host supplied by a client.
export function publicRequest(request, env = process.env) {
    const url = new URL(request.url);
    const hosts = new Set(String(env.PUBLIC_HOSTS || '').split(',').map(host => host.trim()).filter(Boolean));
    let originHost;
    try { originHost = new URL(env.ORIGIN_BASE_URL).hostname; } catch {}
    if (originHost) hosts.add(originHost);
    if (!hosts.has(url.hostname)) return request;
    const publicHost = request.headers.get('x-imgbed-public-host');
    if (url.hostname === originHost && hosts.has(publicHost) && publicHost !== originHost) url.hostname = publicHost;
    if (request.headers.get('x-forwarded-proto') === 'https') url.protocol = 'https:';
    return new Request(url, { method: request.method, headers: request.headers, body: request.body, duplex: 'half' });
}
