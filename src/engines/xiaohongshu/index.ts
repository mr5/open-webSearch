import { AppConfig } from '../../config.js';
import { SearchResult } from '../../types.js';
import { searchBrowserOnlyEngine } from '../browserOnly/browserOnlySearch.js';

export function searchXiaohongshu(
    query: string,
    limit: number,
    options?: { searchMode?: AppConfig['searchMode'] }
): Promise<SearchResult[]> {
    return searchBrowserOnlyEngine('xiaohongshu', query, limit, options);
}
