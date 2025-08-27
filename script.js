const DEFAULT_SYMBOL = 'BTCUSDT';
const BINANCE_REST_PRICE = (sym) => `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(sym)}`;

function $qs(s) { return document.querySelector(s); }

async function fetchPrice(sym) {
    try {
        const res = await fetch(BINANCE_REST_PRICE(sym));
        if (!res.ok) throw new Error('Price fetch failed');
        const data = await res.json();
        $qs('#price').textContent = parseFloat(data.lastPrice).toLocaleString();
        const ch = parseFloat(data.priceChangePercent);
        const chEl = $qs('#change');
        chEl.textContent = (ch>=0?'+':'') + ch.toFixed(2) + '%  ·  vol: ' + Number(data.volume).toFixed(0);
        chEl.style.color = ch>=0 ? '#34d399' : '#fb7185';
        $qs('#last-updated').textContent = '';
    } catch(err) {
        console.error(err);
        $qs('#price').textContent = '—';
        $qs('#change').textContent = 'Price unavailable';
    }
}

function createTradingViewWidget(sym) {
    const symbolForTV = 'BINANCE:' + sym.replace(/USDT$/,'USDT');
    const container = $qs('#tradingview-widget');
    container.innerHTML = '';
    const widget = document.createElement('div');
    widget.id = 'tv-lightweight';
    container.appendChild(widget);

    const existingScript = document.querySelector('script[src="https://s3.tradingview.com/tv.js"]');
    if (existingScript) existingScript.remove();

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/tv.js';
    script.onload = () => {
        try {
            new TradingView.widget({
                "width": "100%",
                "height": 420,
                "symbol": symbolForTV,
                "interval": "60",
                "timezone": "Etc/UTC",
                "theme": "dark",
                "style": "1",
                "locale": "en",
                "toolbar_bg": "#f1f3f6",
                "enable_publishing": false,
                "allow_symbol_change": true,
                "container_id": "tv-lightweight"
            });
        } catch(e) {
            console.error('TV widget error', e);
            container.innerHTML = '<div class="p-6 text-center text-sm text-red-400">Chart failed to load.</div>';
        }
    };
    document.body.appendChild(script);
}

let allNewsItems = [];
let currentIndex = 0;
const pageSize = 8;
let isLoading = false;

async function fetchNews() {
    const cacheKey = 'topcryptosnews_news_cache';
    const cacheExpiryKey = 'topcryptosnews_news_cache_expiry';
    const now = Date.now();
    const cacheExpiry = localStorage.getItem(cacheExpiryKey);
    const cached = localStorage.getItem(cacheKey);

    if (cached && cacheExpiry && now < parseInt(cacheExpiry,10)) {
        renderNews(JSON.parse(cached));
        return;
    }

    const feeds = [
        'https://www.coindesk.com/arc/outboundfeeds/rss/',
        'https://news.bitcoin.com/feed/',
        'https://cointelegraph.com/rss'
    ];

    const items = [];
    for (const feed of feeds) {
        try {
            const proxy = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(feed);
            const resp = await fetch(proxy);
            if (!resp.ok) continue;
            const txt = await resp.text();
            const parser = new DOMParser();
            const xml = parser.parseFromString(txt, 'application/xml');
            const xmlItems = Array.from(xml.querySelectorAll('item')).slice(0,6);
            for (const it of xmlItems) {
                const title = it.querySelector('title') ? it.querySelector('title').textContent : 'No title';
                const link = it.querySelector('link') ? it.querySelector('link').textContent : '#';
                const desc = it.querySelector('description') ? it.querySelector('description').textContent : '';
                let img = null;
                const media = it.getElementsByTagName('media:content');
                if (media && media.length) img = media[0].getAttribute('url');
                if (!img) {
                    const enc = it.querySelector('enclosure[url]');
                    if (enc) img = enc.getAttribute('url');
                }
                if (!img) {
                    const m = desc.match(/<img[^>]+src="([^">]+)"/i);
                    if (m) img = m[1];
                }
                items.push({title, link, desc, img, source: new URL(feed).hostname});
            }
        } catch(e) {
            console.warn('feed failed', feed, e);
        }
    }

    localStorage.setItem(cacheKey, JSON.stringify(items));
    localStorage.setItem(cacheExpiryKey, (now + 600000).toString());

    allNewsItems = items;
    renderNews(allNewsItems);
}

function renderNews(items, append = false) {
    const list = $qs('#newsList');
    if (!append) {
        list.innerHTML = '';
        currentIndex = 0;
    }

    const slice = items.slice(currentIndex, currentIndex + pageSize);
    slice.forEach(it => {
        const card = document.createElement('a');
        card.className = 'news-card block bg-gray-900 p-3 rounded hover:shadow-md flex gap-3';
        card.href = it.link;
        card.target = '_blank';
        card.rel = 'noopener noreferrer';
        card.innerHTML = `
            <div class="flex-1">
                <div class="text-sm font-semibold mb-1">${escapeHtml(it.title)}</div>
                <div class="text-gray-400 text-xs truncate-2">${escapeHtml(stripHtml(it.desc)).slice(0,220)}</div>
                <div class="text-xs text-gray-500 mt-2">${it.source}</div>
            </div>
            ${it.img ? `<div class="hidden sm:block"><img src="${it.img}" alt="" /></div>` : ''}
        `;
        list.appendChild(card);
    });

    currentIndex += slice.length;
    isLoading = false;
}

function stripHtml(htmlStr) {
    const tmp = document.createElement('div');
    tmp.innerHTML = htmlStr;
    return tmp.textContent || tmp.innerText || '';
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function renderCandleDiagram(count) {
    const svg = document.getElementById('candleDiagram');
    svg.innerHTML = '';

    const width = 1000;
    const height = 70;
    const candleWidth = Math.min(80, width / count - 4);
    const spacing = 4;
    const totalWidth = count * (candleWidth + spacing);

    svg.setAttribute('viewBox', `0 0 ${totalWidth} ${height}`);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '0');
    line.setAttribute('y1', '50');
    line.setAttribute('x2', totalWidth);
    line.setAttribute('y2', '50');
    line.setAttribute('stroke', '#4b5563');
    line.setAttribute('stroke-width', '3');
    svg.appendChild(line);

    for(let i = 0; i < count; i++) {
        const x = i * (candleWidth + spacing);
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', 20);
        rect.setAttribute('width', candleWidth);
        rect.setAttribute('height', 40);
        rect.setAttribute('fill', i === count - 1 ? '#34d399' : '#2563eb');
        svg.appendChild(rect);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x + candleWidth / 2);
        text.setAttribute('y', 65);
        text.setAttribute('fill', i === count - 1 ? '#34d399' : '#9ca3af');
        text.setAttribute('font-weight', i === count - 1 ? 'bold' : 'normal');
        text.setAttribute('font-family', 'monospace');
        text.setAttribute('font-size', '12');
        text.setAttribute('text-anchor', 'middle');
        text.textContent = `#${count - i}${i === count - 1 ? ' (Latest)' : ''}`;
        svg.appendChild(text);
    }
}

function showPrediction(result) {
    const container = $qs('#predictionResult');
    container.innerHTML = '';
    if (!result) {
        container.innerHTML = `<p class="text-gray-400">No data to analyze.</p>`;
        return;
    }

    if (!result.patterns.length) {
        container.innerHTML = `<p class="text-gray-400">No clear candlestick pattern found on analyzed candles.</p><p>${result.explanation}</p>`;
        return;
    }

    const sentimentColors = {
        'Bullish': 'green',
        'Bearish': 'red',
        'Neutral': 'yellow',
        'Slightly Bullish': 'lime',
        'Slightly Bearish': 'orange'
    };

    const overallColor = sentimentColors[result.overallSentiment] || 'gray';

    const allPatternsHTML = result.patterns.map(p => 
        `<details class="mb-2 bg-gray-700 rounded p-2">
            <summary class="font-semibold cursor-pointer">${p.name} - <span class="text-${sentimentColors[p.sentiment] || 'gray'}-400">${p.sentiment}</span></summary>
            <p class="mt-1 text-xs text-gray-300">${p.description}</p>
        </details>`).join('');

    container.innerHTML = `
        <p><strong>Overall Prediction:</strong> <span class="text-${overallColor}-400">${result.overallSentiment}</span></p>
        <p class="mb-2 text-xs text-gray-400"><em>${result.explanation}</em></p>
        <hr class="border-gray-600 mb-2"/>
        <details class="bg-gray-800 rounded p-2">
            <summary class="cursor-pointer font-semibold text-sm mb-2">📊 Show/Hide Detected Patterns</summary>
            <div class="mt-2">
                ${allPatternsHTML}
            </div>
        </details>
    `;
}

document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('scroll', () => {
        if (isLoading) return;
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 200) {
            if (currentIndex < allNewsItems.length) {
                isLoading = true;
                renderNews(allNewsItems, true);
            }
        }
    });

    const symbolInput = $qs('#symbolInput');
    const predictorSymbol = $qs('#predictorSymbol');
    const intervalSelect = $qs('#intervalSelect');
    const analyzeBtn = $qs('#analyzeBtn');
    const candleCountSelect = $qs('#candleCountSelect');
    const quickBtns = document.querySelectorAll('.quick-btn');
    const predictorQuickBtns = document.querySelectorAll('.predictor-quick-btn');

    quickBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const sym = btn.dataset.symbol;
            symbolInput.value = sym;
            updateChart(sym);
        });
    });

    predictorQuickBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            predictorSymbol.value = btn.dataset.symbol;
        });
    });

    analyzeBtn.addEventListener('click', async () => {
        const sym = predictorSymbol.value.trim().toUpperCase() || DEFAULT_SYMBOL;
        const interval = intervalSelect.value;
        const candleCount = parseInt(candleCountSelect.value, 10) || 10;
        $qs('#predictionResult').innerHTML = '<p>Analyzing pattern...</p>';
        try {
            const response = await fetch('https://cryptopredictorbackend.onrender.com/api/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol: sym, interval, candleCount })
            });
            if (!response.ok) throw new Error('Prediction fetch failed');
            const result = await response.json();
            showPrediction(result);
        } catch (e) {
            $qs('#predictionResult').innerHTML = `<p class="text-red-500">Error fetching or analyzing pattern data.</p>`;
        }
    });

    candleCountSelect.addEventListener('change', (e) => {
        const val = parseInt(e.target.value, 10);
        renderCandleDiagram(val);
    });

    function updateChart(sym) {
        if (!sym) return;
        createTradingViewWidget(sym);
        fetchPrice(sym);
    }

    symbolInput.value = DEFAULT_SYMBOL;
    predictorSymbol.value = DEFAULT_SYMBOL;
    updateChart(DEFAULT_SYMBOL);
    fetchNews();
    renderCandleDiagram(parseInt(candleCountSelect.value, 10));
});