// Post-build deployment health verification. No real provider credentials needed.
const origin = new URL(process.argv[2] || 'http://127.0.0.1:8080');
const request = path => fetch(new URL(path, origin), { signal: AbortSignal.timeout(5000) });
let ready = false;
for (let attempt = 0; attempt < 30; attempt++) {
    try { ready = (await request('/')).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
}
if (!ready) throw new Error('Server did not become ready');
for (const path of ['/', '/dashboard']) {
    const response = await request(path);
    const html = await response.text();
    if (!response.ok || !/\bid=["']?app(?:["' >])/.test(html)) throw new Error(`SPA unavailable: ${path}`);
    const script = html.match(/\bsrc=["']?([^"' >]*\/js\/app\.[^"' >]+\.js)(?:["' >])/);
    if (!script || !(await request(script[1])).ok) throw new Error('Frontend entry asset unavailable');
}
const statsResponse = await request('/api/siteStats');
const stats = await statsResponse.json();
if (!statsResponse.ok || stats.images !== 0 || !Number.isFinite(stats.visits)) throw new Error('Fresh database statistics are invalid');
const management = await request('/api/manage/list');
if (![401, 403].includes(management.status)) throw new Error('Management must reject unauthenticated access');
console.log('Container health verified: SPA, JS asset, SQLite statistics, and management authentication.');
