import * as cheerio from 'cheerio';
import { AppConfig, checkPlaywrightModeConfiguration, config } from '../../config.js';
import { SearchResult } from '../../types.js';
import { asBrowserUnavailableError } from '../../utils/playwrightClient.js';
import { searchSiteWithBrowserWorker } from '../../utils/browserWorkerClient.js';

export type BrowserOnlySearchEngine = 'jd' | 'taobao' | 'alibaba' | 'xiaohongshu' | 'zhihu';

type BrowserOnlyEngineDefinition = {
    displayName: string;
    buildSearchUrl(query: string): string;
    resultHosts: string[];
    resultPath?: RegExp;
    resultLinkSelectors: string[];
    cardSelectors: string[];
    titleSelectors: string[];
    descriptionSelectors: string[];
    sourceSelectors: string[];
    emptyResultMarkers: string[];
};

const ENGINE_DEFINITIONS: Record<BrowserOnlySearchEngine, BrowserOnlyEngineDefinition> = {
    jd: {
        displayName: 'JD.com',
        buildSearchUrl: (query) => `https://search.jd.com/Search?keyword=${encodeURIComponent(query)}&enc=utf-8`,
        resultHosts: ['item.jd.com'],
        resultLinkSelectors: ['a[href*="//item.jd.com/"]'],
        cardSelectors: ['li.gl-item', '.gl-i-wrap', '[data-sku]'],
        titleSelectors: ['.p-name em', '.p-name a', '[class*="p-name"]'],
        descriptionSelectors: ['.p-name', '.p-commit', '[class*="p-name"]'],
        sourceSelectors: ['.p-shop a', '.p-shop', '[class*="p-shop"]'],
        emptyResultMarkers: ['抱歉，没有找到', '暂无相关商品']
    },
    taobao: {
        displayName: 'Taobao',
        buildSearchUrl: (query) => `https://s.taobao.com/search?q=${encodeURIComponent(query)}`,
        resultHosts: ['item.taobao.com', 'detail.tmall.com', 'detail.tmall.hk'],
        resultLinkSelectors: [
            'a[href*="item.taobao.com/item.htm"]',
            'a[href*="detail.tmall.com/item.htm"]',
            'a[href*="detail.tmall.hk/item.htm"]'
        ],
        cardSelectors: [
            '[data-id]',
            '[class*="Content--contentInner"]',
            '[class*="Card--doubleCardWrapper"]',
            '.item'
        ],
        titleSelectors: ['[class*="Title--title"]', '[class*="title"]', '.title'],
        descriptionSelectors: ['[class*="Title--title"]', '[class*="Info--"]', '.ctx-box'],
        sourceSelectors: ['[class*="ShopInfo--shopName"]', '[class*="shopName"]', '.shopname'],
        emptyResultMarkers: ['没有找到相关的宝贝', '暂无相关商品']
    },
    alibaba: {
        displayName: 'Alibaba (1688)',
        buildSearchUrl: (query) => `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(query)}`,
        resultHosts: ['detail.1688.com', 'detail.m.1688.com'],
        resultPath: /\/(?:offer\/|page\/index\.html)/i,
        resultLinkSelectors: [
            'a[href*="detail.1688.com/offer/"]',
            'a[href*="detail.m.1688.com/page/index.html"]'
        ],
        cardSelectors: [
            '[class*="offer-list-row"]',
            '[class*="offer-item"]',
            '[class*="sm-offer-item"]',
            '[data-offer-id]'
        ],
        titleSelectors: ['[class*="title"]', '.offer-title', '.title'],
        descriptionSelectors: ['[class*="title"]', '[class*="desc"]', '.offer-title'],
        sourceSelectors: ['[class*="company"]', '[class*="shop"]', '.company-name'],
        emptyResultMarkers: ['没有找到相关货源', '暂无相关商品']
    },
    xiaohongshu: {
        displayName: 'Xiaohongshu',
        buildSearchUrl: (query) => `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(query)}&source=web_search_result_notes`,
        resultHosts: ['xiaohongshu.com'],
        resultPath: /\/explore\//i,
        resultLinkSelectors: ['a[href*="/explore/"]'],
        cardSelectors: ['section.note-item', '.note-item', '[class*="note-item"]'],
        titleSelectors: ['.title span', '.title', '[class*="title"]'],
        descriptionSelectors: ['.title', '[class*="title"]'],
        sourceSelectors: ['.author .name', '.footer .name', '[class*="author"] [class*="name"]'],
        emptyResultMarkers: ['没有找到相关笔记', '暂无搜索结果']
    },
    zhihu: {
        displayName: 'Zhihu',
        buildSearchUrl: (query) => `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(query)}`,
        resultHosts: ['zhihu.com', 'zhuanlan.zhihu.com'],
        resultPath: /\/(?:question|p)\//i,
        resultLinkSelectors: [
            'a[href*="/question/"]',
            'a[href*="zhuanlan.zhihu.com/p/"]'
        ],
        cardSelectors: ['.SearchResult-Card', '.ContentItem', '[class*="SearchResult"]'],
        titleSelectors: ['.ContentItem-title', 'h2', '[class*="title"]'],
        descriptionSelectors: ['.RichContent-inner', '.CopyrightRichText-richText', '.ContentItem-meta'],
        sourceSelectors: ['.AuthorInfo-name', '.UserLink-link', '.ContentItem-status'],
        emptyResultMarkers: ['未找到相关结果', '暂无搜索结果']
    }
};

const BLOCKED_PAGE_MARKERS = [
    '请输入验证码',
    '滑块验证',
    '安全验证',
    '访问过于频繁',
    '操作太频繁',
    '异常访问',
    'verify you are human',
    'captcha',
    'access denied'
];

function normalizeText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function truncate(value: string, maxLength = 500): string {
    return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function matchesHostname(hostname: string, allowedHosts: string[]): boolean {
    const normalized = hostname.toLowerCase();
    return allowedHosts.some((host) => normalized === host || normalized.endsWith(`.${host}`));
}

function normalizeResultUrl(rawUrl: string, searchUrl: string): string {
    try {
        const parsed = new URL(rawUrl, searchUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return '';
        }
        parsed.hash = '';
        return parsed.toString();
    } catch {
        return '';
    }
}

function findFirstText(root: cheerio.Cheerio, selectors: string[]): string {
    for (const selector of selectors) {
        const text = normalizeText(root.find(selector).first().text());
        if (text) {
            return text;
        }
    }
    return '';
}

function analyzeBrowserPage(html: string, finalUrl: string, definition: BrowserOnlyEngineDefinition): {
    blocked: boolean;
    empty: boolean;
    reason: string;
} {
    const $ = cheerio.load(html);
    const title = normalizeText($('title').first().text());
    const sample = normalizeText(`${title} ${$('body').text()}`).slice(0, 20000).toLowerCase();
    const matchedMarker = BLOCKED_PAGE_MARKERS.find((marker) => sample.includes(marker.toLowerCase()));
    let blockedUrl = false;
    try {
        const parsedFinalUrl = new URL(finalUrl);
        blockedUrl = /(?:captcha|verify|punish|sec\.|passport\.|(?:^|\.)login\.)/i.test(parsedFinalUrl.hostname)
            || /\/(?:captcha|verify|punish|login)(?:[/?#]|$)/i.test(parsedFinalUrl.pathname);
    } catch {
        blockedUrl = false;
    }
    const empty = definition.emptyResultMarkers.some((marker) => sample.includes(marker.toLowerCase()));
    return {
        blocked: Boolean(matchedMarker || blockedUrl),
        empty,
        reason: matchedMarker || (blockedUrl ? `redirected to ${finalUrl}` : '')
    };
}

function interactionRequiredMessage(definition: BrowserOnlyEngineDefinition, reason: string): string {
    const visibilityHint = config.browserBackend === 'chromium' && config.playwrightHeadless
        ? ' If the local browser is headless, restart with PLAYWRIGHT_HEADLESS=false (or connect an interactive WS/CDP browser) first.'
        : '';
    return `${definition.displayName} requires user interaction (${reason}). Please complete login or the verification challenge in the connected browser tab, then retry the search; the browser profile will preserve the session.${visibilityHint}`;
}

function interactionRequiredError(definition: BrowserOnlyEngineDefinition, reason: string): Error {
    const error = new Error(interactionRequiredMessage(definition, reason));
    (error as Error & { code?: string }).code = 'interaction_required';
    return error;
}

export function parseBrowserOnlySearchResults(
    engine: BrowserOnlySearchEngine,
    html: string,
    searchUrl = ENGINE_DEFINITIONS[engine].buildSearchUrl('test')
): SearchResult[] {
    const definition = ENGINE_DEFINITIONS[engine];
    const pageState = analyzeBrowserPage(html, searchUrl, definition);
    if (pageState.blocked) {
        throw interactionRequiredError(definition, pageState.reason);
    }

    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const seenUrls = new Set<string>();
    const cardSelector = definition.cardSelectors.join(',');

    $(definition.resultLinkSelectors.join(',')).each((_, element) => {
        const link = $(element);
        const url = normalizeResultUrl(link.attr('href') || '', searchUrl);
        if (!url || seenUrls.has(url)) {
            return;
        }

        const parsedUrl = new URL(url);
        if (!matchesHostname(parsedUrl.hostname, definition.resultHosts)
            || (definition.resultPath && !definition.resultPath.test(parsedUrl.pathname))) {
            return;
        }

        let modernAlibabaTitle = '';
        let modernAlibabaDescription = '';
        let modernAlibabaSource = '';
        if (engine === 'alibaba' && parsedUrl.hostname === 'detail.m.1688.com') {
            // Current 1688 search pages render each offer as an empty marker link followed
            // by sibling rows. Nested image links repeat the URL and must not become cards.
            if (!link.hasClass('search-offer-wrapper') || !link.parent().hasClass('feeds-wrapper')) {
                return;
            }
            const offerRows = link.nextUntil('a.search-offer-wrapper');
            modernAlibabaTitle = normalizeText(offerRows.filter('.offer-title-row').first().text());
            modernAlibabaDescription = normalizeText([
                offerRows.filter('.offer-desc-row').first().text(),
                offerRows.filter('.offer-price-row').first().text(),
                offerRows.filter('.offer-tag-row').first().text()
            ].filter(Boolean).join(' '));
            modernAlibabaSource = normalizeText(offerRows.filter('.offer-shop-row').first().text());
        }

        const card = link.closest(cardSelector);
        const root = card.length > 0 ? card : link.parent();
        const title = normalizeText(
            modernAlibabaTitle
            || link.attr('title')
            || findFirstText(root, definition.titleSelectors)
            || link.text()
        );
        if (!title) {
            return;
        }

        let description = modernAlibabaDescription || findFirstText(root, definition.descriptionSelectors);
        if (!description) {
            description = normalizeText(root.text());
        }
        const source = modernAlibabaSource
            || findFirstText(root, definition.sourceSelectors)
            || parsedUrl.hostname;

        seenUrls.add(url);
        results.push({
            title: truncate(title, 240),
            url,
            description: truncate(description || title),
            source: truncate(source, 160),
            engine
        });
    });

    return results;
}

export async function searchBrowserOnlyEngine(
    engine: BrowserOnlySearchEngine,
    query: string,
    limit: number,
    _options?: { searchMode?: AppConfig['searchMode'] }
): Promise<SearchResult[]> {
    const definition = ENGINE_DEFINITIONS[engine];
    if (config.browserBackend !== 'external') {
        throw asBrowserUnavailableError(
            new Error('Set BROWSER_BACKEND=external and configure BROWSER_WORKER_URL plus BROWSER_WORKER_TOKEN. Local Chromium is intentionally disabled for this anti-bot-protected engine.'),
            `${definition.displayName} search requires the external browser worker`
        );
    }

    const availability = checkPlaywrightModeConfiguration(config);
    if (!availability.available) {
        throw asBrowserUnavailableError(
            new Error(availability.reason || 'No browser backend is configured'),
            `${definition.displayName} search requires the external browser worker`
        );
    }

    console.error(`🔎 ${definition.displayName} external browser search: ${query}`);
    const page = await searchSiteWithBrowserWorker(engine, query, limit);
    const pageState = analyzeBrowserPage(page.html, page.finalUrl, definition);
    if (page.interactionRequired || pageState.blocked) {
        throw interactionRequiredError(definition, pageState.reason || 'the external browser reported that login or verification is required');
    }
    const results = parseBrowserOnlySearchResults(engine, page.html, page.finalUrl).slice(0, limit);
    if (results.length === 0 && !pageState.empty) {
        throw interactionRequiredError(definition, 'the external browser page returned no usable results; login or additional verification may be required');
    }
    return results;
}
