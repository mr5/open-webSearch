import { parseBrowserOnlySearchResults } from '../engines/browserOnly/browserOnlySearch.js';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
    if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

function testJdParser(): void {
    const results = parseBrowserOnlySearchResults('jd', `
        <ul id="J_goodsList"><li class="gl-item" data-sku="1001">
          <div class="p-name"><a href="//item.jd.com/1001.html"><em>机械键盘 K8</em></a></div>
          <div class="p-shop"><a>键盘旗舰店</a></div>
        </li></ul>
    `, 'https://search.jd.com/Search?keyword=keyboard');
    assertEqual(results.length, 1, 'JD result count');
    assertEqual(results[0].title, '机械键盘 K8', 'JD title');
    assertEqual(results[0].url, 'https://item.jd.com/1001.html', 'JD URL');
    assertEqual(results[0].source, '键盘旗舰店', 'JD shop');
    assertEqual(results[0].engine, 'jd', 'JD engine');
}

function testTaobaoParserAndDeduplication(): void {
    const results = parseBrowserOnlySearchResults('taobao', `
        <div class="Card--doubleCardWrapper-abc" data-id="2002">
          <a href="https://item.taobao.com/item.htm?id=2002" title="复古台灯"></a>
          <a href="https://item.taobao.com/item.htm?id=2002">duplicate image</a>
          <div class="Title--title-def">复古台灯 暖光</div>
          <div class="ShopInfo--shopName-x">家居好店</div>
        </div>
    `, 'https://s.taobao.com/search?q=lamp');
    assertEqual(results.length, 1, 'Taobao deduplicated result count');
    assertEqual(results[0].title, '复古台灯', 'Taobao title attribute');
    assertEqual(results[0].source, '家居好店', 'Taobao shop');
    assertEqual(results[0].engine, 'taobao', 'Taobao engine');
}

function testAlibabaParser(): void {
    const results = parseBrowserOnlySearchResults('alibaba', `
        <div class="sm-offer-item" data-offer-id="3003">
          <a href="https://detail.1688.com/offer/3003.html"><span class="offer-title">304 不锈钢保温杯</span></a>
          <div class="company-name">源头工厂</div>
        </div>
    `, 'https://s.1688.com/selloffer/offer_search.htm?keywords=cup');
    assertEqual(results.length, 1, 'Alibaba result count');
    assertEqual(results[0].title, '304 不锈钢保温杯', 'Alibaba title');
    assertEqual(results[0].source, '源头工厂', 'Alibaba company');
    assertEqual(results[0].engine, 'alibaba', 'Alibaba engine');
}

function testModernAlibabaParser(): void {
    const results = parseBrowserOnlySearchResults('alibaba', `
        <div class="feeds-wrapper">
          <a class="search-offer-wrapper cardui-normal search-offer-item major-offer"
             href="http://detail.m.1688.com/page/index.html?offerId=4004"></a>
          <div class="offer-img-wrapper">
            <a href="http://detail.m.1688.com/page/index.html?offerId=4004">image</a>
          </div>
          <div class="offer-title-row"><span class="title-text">三模 RGB 无线机械键盘</span></div>
          <div class="offer-desc-row">热插拔客制化套件</div>
          <div class="offer-price-row">¥99.00</div>
          <div class="offer-tag-row">跨境货源</div>
          <div class="offer-shop-row"><span class="desc-text">深圳键盘源头工厂</span></div>
          <a class="search-offer-wrapper cardui-normal search-offer-item major-offer"
             href="http://detail.m.1688.com/page/index.html?offerId=4005"></a>
          <div class="offer-title-row"><span class="title-text">第二件商品</span></div>
          <div class="offer-shop-row">第二家工厂</div>
        </div>
    `, 'https://s.1688.com/selloffer/offer_search.htm?keywords=keyboard');
    assertEqual(results.length, 2, 'Modern Alibaba result count');
    assertEqual(results[0].title, '三模 RGB 无线机械键盘', 'Modern Alibaba title');
    assertEqual(results[0].source, '深圳键盘源头工厂', 'Modern Alibaba company');
    assertEqual(results[0].description, '热插拔客制化套件 ¥99.00 跨境货源', 'Modern Alibaba description');
    assertEqual(results[0].engine, 'alibaba', 'Modern Alibaba engine');
}

function testXiaohongshuParser(): void {
    const results = parseBrowserOnlySearchResults('xiaohongshu', `
        <section class="note-item">
          <a href="/explore/abc123"><div class="cover"></div></a>
          <div class="title"><span>上海周末徒步路线</span></div>
          <div class="footer"><span class="name">山野日记</span></div>
        </section>
    `, 'https://www.xiaohongshu.com/search_result?keyword=hiking');
    assertEqual(results.length, 1, 'Xiaohongshu result count');
    assertEqual(results[0].title, '上海周末徒步路线', 'Xiaohongshu title');
    assertEqual(results[0].url, 'https://www.xiaohongshu.com/explore/abc123', 'Xiaohongshu URL');
    assertEqual(results[0].source, '山野日记', 'Xiaohongshu author');
    assertEqual(results[0].engine, 'xiaohongshu', 'Xiaohongshu engine');
}

function testZhihuParser(): void {
    const results = parseBrowserOnlySearchResults('zhihu', `
        <div class="SearchResult-Card"><div class="ContentItem">
          <h2 class="ContentItem-title"><a href="https://www.zhihu.com/question/123/answer/456">机械键盘轴体怎么选？</a></h2>
          <div class="AuthorInfo-name">键圈指南</div>
          <div class="RichContent-inner">从手感、声音和触发压力分析常见轴体。</div>
        </div></div>
    `, 'https://www.zhihu.com/search?type=content&q=keyboard');
    assertEqual(results.length, 1, 'Zhihu result count');
    assertEqual(results[0].title, '机械键盘轴体怎么选？', 'Zhihu title');
    assertEqual(results[0].source, '键圈指南', 'Zhihu author');
    assertEqual(results[0].engine, 'zhihu', 'Zhihu engine');
}

function testChallengeDetection(): void {
    let threw = false;
    try {
        parseBrowserOnlySearchResults('taobao', '<html><title>安全验证</title><body>请完成滑块验证</body></html>');
    } catch (error) {
        threw = error instanceof Error
            && error.message.includes('verification')
            && (error as Error & { code?: string }).code === 'interaction_required';
    }
    assert(threw, 'browser-only search should reject verification pages');
}

async function testLocalBrowserIsRejected(): Promise<void> {
    const { config } = await import('../config.js');
    const { searchJd } = await import('../engines/jd/index.js');
    const previousBackend = config.browserBackend;
    let rejected = false;
    try {
        config.browserBackend = 'chromium';
        await searchJd('keyboard', 1);
    } catch (error) {
        rejected = (error as { code?: string }).code === 'browser_unavailable'
            && error instanceof Error
            && error.message.includes('BROWSER_BACKEND=external');
    } finally {
        config.browserBackend = previousBackend;
    }
    assert(rejected, 'protected engines should reject local Chromium and require the external worker');
}

async function main(): Promise<void> {
    testJdParser();
    testTaobaoParserAndDeduplication();
    testAlibabaParser();
    testModernAlibabaParser();
    testXiaohongshuParser();
    testZhihuParser();
    testChallengeDetection();
    await testLocalBrowserIsRejected();
    console.log('Browser-only marketplace search tests passed.');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
