import { AppConfig } from '../../config.js';
import { SearchResult } from '../../types.js';
import { searchBrowserOnlyEngine } from '../browserOnly/browserOnlySearch.js';

export function searchAlibaba(
    query: string,
    limit: number,
    options?: { searchMode?: AppConfig['searchMode'] }
): Promise<SearchResult[]> {
    return searchBrowserOnlyEngine('alibaba', query, limit, options);
}
