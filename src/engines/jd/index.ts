import { AppConfig } from '../../config.js';
import { SearchResult } from '../../types.js';
import { searchBrowserOnlyEngine } from '../browserOnly/browserOnlySearch.js';

export function searchJd(
    query: string,
    limit: number,
    options?: { searchMode?: AppConfig['searchMode'] }
): Promise<SearchResult[]> {
    return searchBrowserOnlyEngine('jd', query, limit, options);
}
