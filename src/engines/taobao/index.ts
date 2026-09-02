import { AppConfig } from '../../config.js';
import { SearchResult } from '../../types.js';
import { searchBrowserOnlyEngine } from '../browserOnly/browserOnlySearch.js';

export function searchTaobao(
    query: string,
    limit: number,
    options?: { searchMode?: AppConfig['searchMode'] }
): Promise<SearchResult[]> {
    return searchBrowserOnlyEngine('taobao', query, limit, options);
}
