import { config } from '../config.js';
import {
    __setBrowserHtmlFetcherForTests,
    fetchWebContent,
    requiresExternalBrowserForUrl
} from '../engines/web/fetchWebContent.js';
import { __setDnsLookupForTests } from '../utils/urlSafety.js';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
    assert(requiresExternalBrowserForUrl('https://item.jd.com/1.html'), 'JD should require external browser');
    assert(requiresExternalBrowserForUrl('https://item.taobao.com/item.htm?id=1'), 'Taobao should require external browser');
    assert(requiresExternalBrowserForUrl('https://detail.1688.com/offer/1.html'), '1688 should require external browser');
    assert(requiresExternalBrowserForUrl('https://www.xiaohongshu.com/explore/1'), 'Xiaohongshu should require external browser');
    assert(requiresExternalBrowserForUrl('https://www.zhihu.com/question/1'), 'Zhihu should require external browser');
    assert(!requiresExternalBrowserForUrl('https://example.com/'), 'unrelated sites should keep normal routing');

    const previousBackend = config.browserBackend;
    const previousWorkerUrl = config.browserWorkerUrl;
    const previousWorkerToken = config.browserWorkerToken;
    __setDnsLookupForTests(async () => [{ address: '93.184.216.34' }]);

    try {
        config.browserBackend = 'chromium';
        let localRejected = false;
        try {
            await fetchWebContent('https://www.zhihu.com/question/1', 5000, { renderMode: 'request' });
        } catch (error) {
            localRejected = (error as { code?: string }).code === 'browser_unavailable';
        }
        assert(localRejected, 'protected fetches should reject local Chromium before any direct request');

        config.browserBackend = 'external';
        config.browserWorkerUrl = 'http://127.0.0.1:8765';
        config.browserWorkerToken = 'test-token';
        let browserCalls = 0;
        __setBrowserHtmlFetcherForTests(async (url) => {
            browserCalls += 1;
            return {
                html: `<html><head><title>Zhihu</title></head><body><main>${'Rendered answer content '.repeat(12)}</main></body></html>`,
                finalUrl: url,
                title: 'Zhihu'
            };
        });
        const result = await fetchWebContent('https://www.zhihu.com/question/1', 5000, { renderMode: 'request' });
        assert(browserCalls === 1, 'protected fetch should force exactly one external browser render');
        assert(result.retrievalMethod === 'browser-html', 'protected fetch should override request mode');
        assert(result.content.includes('Rendered answer content'), 'protected fetch should extract rendered content');
    } finally {
        config.browserBackend = previousBackend;
        config.browserWorkerUrl = previousWorkerUrl;
        config.browserWorkerToken = previousWorkerToken;
        __setBrowserHtmlFetcherForTests();
        __setDnsLookupForTests();
    }

    console.log('External-browser-only routing tests passed.');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
