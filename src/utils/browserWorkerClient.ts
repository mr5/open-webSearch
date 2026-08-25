import { config } from '../config.js';

const MAX_WORKER_RESPONSE_BYTES = 12 * 1024 * 1024;

export type BrowserWorkerRenderResult = {
    html: string;
    finalUrl: string;
    title: string;
    cookieHeader?: string;
    dialogTexts?: string[];
};

export type BrowserWorkerPage = {
    html: string;
    finalUrl: string;
    title: string;
};

type WorkerErrorPayload = {
    detail?: unknown;
};

function getWorkerUrl(pathname: string): URL {
    if (!config.browserWorkerUrl) {
        throw new Error('External browser backend is selected but BROWSER_WORKER_URL is not configured');
    }
    const base = new URL(config.browserWorkerUrl);
    const normalizedBase = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
    base.pathname = `${normalizedBase}${pathname.replace(/^\/+/, '')}`;
    base.search = '';
    base.hash = '';
    return base;
}

function formatWorkerError(status: number, raw: string): string {
    try {
        const payload = JSON.parse(raw) as WorkerErrorPayload;
        if (typeof payload.detail === 'string') {
            return payload.detail;
        }
    } catch {
        // Fall through to the bounded raw body.
    }
    return raw.slice(0, 1000) || `HTTP ${status}`;
}

async function requestWorker<T>(pathname: string, body?: unknown): Promise<T> {
    if (!config.browserWorkerToken) {
        throw new Error('External browser backend is selected but BROWSER_WORKER_TOKEN is not configured');
    }
    const controller = new AbortController();
    const timeoutMs = Math.max(config.playwrightNavigationTimeoutMs + 15000, 30000);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const headers: Record<string, string> = {
            Authorization: `Bearer ${config.browserWorkerToken}`
        };
        if (body !== undefined) {
            headers['Content-Type'] = 'application/json';
        }
        const response = await fetch(getWorkerUrl(pathname), {
            method: body === undefined ? 'GET' : 'POST',
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: controller.signal
        });
        const declaredLength = Number(response.headers.get('content-length') || 0);
        if (Number.isFinite(declaredLength) && declaredLength > MAX_WORKER_RESPONSE_BYTES) {
            throw new Error(`Browser worker response is too large (${declaredLength} bytes)`);
        }
        const raw = await response.text();
        if (Buffer.byteLength(raw, 'utf8') > MAX_WORKER_RESPONSE_BYTES) {
            throw new Error(`Browser worker response exceeded ${MAX_WORKER_RESPONSE_BYTES} bytes`);
        }
        if (!response.ok) {
            throw new Error(`Browser worker request failed (${response.status}): ${formatWorkerError(response.status, raw)}`);
        }
        return JSON.parse(raw) as T;
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(`Browser worker request timed out after ${timeoutMs}ms`);
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

export async function checkBrowserWorker(): Promise<void> {
    const result = await requestWorker<{ status?: string; browser?: string; ready?: boolean }>('health');
    if (result.status !== 'ok' || result.ready !== true || !['nodriver', 'camoufox'].includes(result.browser || '')) {
        throw new Error('Browser worker returned an invalid health response');
    }
}

export async function renderPageWithBrowserWorker(url: string): Promise<BrowserWorkerRenderResult> {
    return requestWorker<BrowserWorkerRenderResult>('render', {
        url,
        timeout_ms: Math.max(config.playwrightNavigationTimeoutMs, 15000)
    });
}

export async function searchBingWithBrowserWorker(query: string, limit: number): Promise<BrowserWorkerPage[]> {
    const result = await requestWorker<{ pages: BrowserWorkerPage[] }>('bing-search', {
        query,
        limit,
        timeout_ms: Math.max(config.playwrightNavigationTimeoutMs, 15000)
    });
    if (!Array.isArray(result.pages)) {
        throw new Error('Browser worker returned an invalid Bing response');
    }
    return result.pages;
}
