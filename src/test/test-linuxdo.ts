import { searchLinuxDoWithSearchers } from '../engines/linuxdo/linuxdo.js';
import { SearchResult } from '../types.js';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

function result(url: string, engine: string): SearchResult {
    return {
        title: url,
        url,
        description: '',
        source: new URL(url).hostname,
        engine
    };
}

const calls: string[] = [];
const results = await searchLinuxDoWithSearchers('ChatGPT', 5, 'bing', {
    bing: async (query) => {
        calls.push(`bing:${query}`);
        return [result('https://chatgpt.com/', 'bing')];
    },
    duckduckgo: async (query) => {
        calls.push(`duckduckgo:${query}`);
        return [
            result('https://linux.do/t/topic/123', 'duckduckgo'),
            result('https://check.linux.do/group/example', 'duckduckgo'),
            result('https://example.com/not-linuxdo', 'duckduckgo')
        ];
    },
    brave: async (query) => {
        calls.push(`brave:${query}`);
        return [];
    }
});

assert(calls.length === 2, `expected Bing then DuckDuckGo, got ${calls.join(', ')}`);
assert(calls[0] === 'bing:site:linux.do ChatGPT', 'site query should be passed to the preferred engine');
assert(calls[1] === 'duckduckgo:site:linux.do ChatGPT', 'off-domain preferred results should trigger DuckDuckGo');
assert(results.length === 2, `expected two linux.do results, got ${results.length}`);
assert(results.every((item) => item.source === 'linux.do'), 'result source should be normalized');
assert(results.every((item) => item.engine === 'linuxdo'), 'result engine should be normalized');

const recovered = await searchLinuxDoWithSearchers('Claude', 5, 'bing', {
    bing: async () => { throw new Error('blocked'); },
    duckduckgo: async () => [result('https://linux.do/t/topic/456', 'duckduckgo')],
    brave: async () => []
});

assert(recovered.length === 1, 'a preferred-engine failure should fall back to DuckDuckGo');
console.log('✅ Linux.do search fallback tests passed');
