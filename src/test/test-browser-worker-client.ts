import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const expectedToken = 'test-browser-worker-token-1234567890';

async function run(): Promise<void> {
    const receivedPaths: string[] = [];
    const server = createServer((request, response) => {
        if (request.headers.authorization !== `Bearer ${expectedToken}`) {
            response.writeHead(401, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ detail: 'invalid bearer token' }));
            return;
        }
        receivedPaths.push(request.url || '');
        response.writeHead(200, { 'Content-Type': 'application/json' });
        if (request.url === '/health') {
            response.end(JSON.stringify({ status: 'ok', browser: 'nodriver', ready: true }));
            return;
        }
        if (request.url === '/render') {
            response.end(JSON.stringify({
                html: '<html>ok</html>',
                finalUrl: 'https://example.com/',
                title: 'Example',
                cookieHeader: 'session=test'
            }));
            return;
        }
        if (request.url === '/bing-search') {
            response.end(JSON.stringify({
                pages: [{ html: '<html>bing</html>', finalUrl: 'https://www.bing.com/search', title: 'Bing' }]
            }));
            return;
        }
        response.end(JSON.stringify({ detail: 'unknown route' }));
    });

    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });

    try {
        const address = server.address() as AddressInfo;
        process.env.OPEN_WEBSEARCH_QUIET_STARTUP = 'true';
        process.env.BROWSER_BACKEND = 'external';
        process.env.BROWSER_WORKER_URL = `http://127.0.0.1:${address.port}`;
        process.env.BROWSER_WORKER_TOKEN = expectedToken;

        const {
            checkBrowserWorker,
            renderPageWithBrowserWorker,
            searchBingWithBrowserWorker
        } = await import('../utils/browserWorkerClient.js');

        await checkBrowserWorker();
        const rendered = await renderPageWithBrowserWorker('https://example.com/');
        if (rendered.title !== 'Example' || rendered.cookieHeader !== 'session=test') {
            throw new Error(`unexpected render response: ${JSON.stringify(rendered)}`);
        }
        const pages = await searchBingWithBrowserWorker('example', 10);
        if (pages.length !== 1 || pages[0].title !== 'Bing') {
            throw new Error(`unexpected Bing response: ${JSON.stringify(pages)}`);
        }
        if (receivedPaths.join(',') !== '/health,/render,/bing-search') {
            throw new Error(`unexpected worker request paths: ${receivedPaths.join(',')}`);
        }
        console.log('✅ external browser worker client authenticates and validates responses');
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
    }
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
