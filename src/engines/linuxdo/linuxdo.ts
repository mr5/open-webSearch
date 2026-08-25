import { SearchResult } from '../../types.js';
import { config } from '../../config.js';
import { searchBing } from '../bing/index.js';
import { searchDuckDuckGo } from '../duckduckgo/index.js';
import { searchBrave } from '../brave/brave.js';

type LinuxDoSearchEngine = 'bing' | 'duckduckgo' | 'brave';
type SearchFunction = (query: string, limit: number) => Promise<SearchResult[]>;
type LinuxDoSearchers = Record<LinuxDoSearchEngine, SearchFunction>;

const defaultSearchers: LinuxDoSearchers = {
    bing: searchBing,
    duckduckgo: searchDuckDuckGo,
    brave: searchBrave
};

function filterLinuxDoResults(results: SearchResult[], limit: number): SearchResult[] {
    return results
        .filter((result) => {
            try {
                const url = new URL(result.url);
                return url.hostname === 'linux.do' || url.hostname.endsWith('.linux.do');
            } catch {
                return false;
            }
        })
        .slice(0, limit)
        .map((result) => ({
            ...result,
            source: 'linux.do',
            engine: 'linuxdo'
        }));
}

function resolvePreferredEngine(defaultEngine: string): LinuxDoSearchEngine {
    if (defaultEngine === 'bing' || defaultEngine === 'duckduckgo' || defaultEngine === 'brave') {
        return defaultEngine;
    }
    return 'duckduckgo';
}

export async function searchLinuxDoWithSearchers(
    query: string,
    limit: number,
    defaultEngine: string,
    searchers: LinuxDoSearchers
): Promise<SearchResult[]> {
    const siteQuery = `site:linux.do ${query}`;
    const preferredEngine = resolvePreferredEngine(defaultEngine);
    const engineOrder = [...new Set<LinuxDoSearchEngine>([
        preferredEngine,
        'duckduckgo',
        'bing',
        'brave'
    ])];

    for (const engine of engineOrder) {
        try {
            console.error(`🔍 Searching linux.do with "${query}" using ${engine} engine`);
            const filteredResults = filterLinuxDoResults(
                await searchers[engine](siteQuery, limit),
                limit
            );
            if (filteredResults.length > 0) {
                return filteredResults;
            }
            console.error(`🔄 ${engine} returned no linux.do results, trying the next engine...`);
        } catch (error: any) {
            console.error(`❌ Linux.do search failed using ${engine}:`, error.message || error);
        }
    }

    return [];
}

export async function searchLinuxDo(query: string, limit: number): Promise<SearchResult[]> {
    return searchLinuxDoWithSearchers(query, limit, config.defaultSearchEngine, defaultSearchers);
}
