/**
 * AI News App - Axy Lusion
 * Dynamic news feed from markdown digest files
 * Adapted from Kol's Korner (koltregaskes.com)
 */

class NewsApp {
    constructor() {
        this.articles = [];
        this.filteredArticles = [];
        this.sources = new Set();
        this.favorites = new Set(JSON.parse(localStorage.getItem('axyl-news-favorites') || '[]'));
        this.flags = JSON.parse(localStorage.getItem('axyl-news-flags') || '{}');
        this.init();
    }

    async init() {
        await this.loadArticles();
        this.setupEventListeners();

        // Default to last 7 days
        const today = new Date();
        const lastWeek = new Date();
        lastWeek.setDate(today.getDate() - 7);

        const fromDate = document.getElementById('fromDate');
        const toDate = document.getElementById('toDate');
        if (fromDate) fromDate.value = lastWeek.toISOString().split('T')[0];
        if (toDate) toDate.value = today.toISOString().split('T')[0];

        this.updateQuickFilterButtons('week');
        this.filterArticles();
    }

    async loadArticles() {
        const fileList = this.generateFileList();

        const loadPromises = fileList.map(async (filename) => {
            try {
                const response = await fetch(`news-digests/${filename}`);
                if (response.ok) {
                    const content = await response.text();
                    return this.parseDigest(content, filename);
                }
            } catch (e) {
                // File doesn't exist, skip
            }
            return [];
        });

        const results = await Promise.all(loadPromises);
        results.forEach(articles => this.articles.push(...articles));

        this.articles.sort((a, b) => new Date(b.date) - new Date(a.date));
        this.filteredArticles = [...this.articles];
        this.populateFilters();

        const loading = document.getElementById('loading');
        if (loading) loading.style.display = 'none';
    }

    generateFileList() {
        const files = [];
        const today = new Date();
        for (let i = 0; i < 90; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            files.push(`${year}-${month}-${day}-digest.md`);
        }
        return files;
    }

    parseDigest(content, filename) {
        const dateMatch = filename.match(/(\d{4})-(\d{2})-(\d{2})-digest\.md/);
        if (!dateMatch) return [];

        const [, year, month, day] = dateMatch;
        const fileDate = new Date(year, month - 1, day);
        const dateString = fileDate.toLocaleDateString('en-GB', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });

        const articles = [];
        let articleCount = 0;
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            const itemMatch = line.match(/^-\s+\*\*(.+?)\*\*\s+\(\[(.+?)\]\((.+?)\)\)(?:\s+_(.+?)_)?$/);
            if (itemMatch) {
                const [, title, sourceName, url, itemDate] = itemMatch;
                articleCount++;

                let summary = '';
                let j = i + 1;
                while (j < lines.length && lines[j].match(/^\s{2,}/)) {
                    summary += lines[j].trim() + ' ';
                    j++;
                }

                if (this.isJunkItem(title, url)) continue;

                const source = sourceName.trim() || this.extractSource(url);
                const tags = this.generateTags(title);

                let articleDate = fileDate;
                let articleDateString = dateString;
                if (itemDate && itemDate.trim()) {
                    const parsedDate = new Date(itemDate.trim());
                    if (!isNaN(parsedDate.getTime())) {
                        articleDate = parsedDate;
                        articleDateString = parsedDate.toLocaleDateString('en-GB', {
                            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                        });
                    }
                }

                const category = articleCount <= 5 ? 'Top Stories' : 'News';

                articles.push({
                    title: title.trim(),
                    source,
                    url: url.trim(),
                    summary: summary.trim(),
                    category,
                    date: articleDate,
                    dateString: articleDateString,
                    tags
                });

                this.sources.add(source);
            }
        }

        return articles;
    }

    isJunkItem(title, url) {
        const junkTitles = ['Browse Business', 'Browse Sustainability', 'Sponsored Content', 'View All Latest', 'Momentum AI', 'Computer Vision', 'Machine Learning'];
        const junkUrlPatterns = [/\/business\/?$/, /\/sustainability\/?$/, /\/sponsored\/?$/, /events\.reutersevents\.com/, /artificial-intelligence-news\/?$/, /\/categories\//, /\/events\//, /\/resources\/on-demand/];
        if (junkTitles.some(t => title.includes(t))) return true;
        if (junkUrlPatterns.some(p => p.test(url))) return true;
        return false;
    }

    generateTags(title) {
        const tagPatterns = {
            'agents': /\b(agent|agents|agentic)\b/i,
            'models': /\b(gpt|claude|gemini|llama|mistral|model|llm|foundation)\b/i,
            'research': /\b(research|paper|study|breakthrough|discover)\b/i,
            'funding': /\b(raises|funding|invest|valuation|series [a-c]|million|billion|\$\d+[mb])\b/i,
            'product': /\b(launch|release|announce|feature|update|new|beta)\b/i,
            'open-source': /\b(open source|open-source|opensource|github|hugging face)\b/i,
            'safety': /\b(safety|alignment|ethics|regulation|govern|policy)\b/i,
            'robotics': /\b(robot|robotics|hardware|humanoid|physical)\b/i,
            'image': /\b(image|midjourney|dall-e|stable diffusion|flux)\b/i,
            'video': /\b(video|runway|kling|pika|sora|luma|veo)\b/i,
            'audio': /\b(voice|speech|audio|sound|music|suno|elevenlabs)\b/i,
            'coding': /\b(code|coding|developer|programming|copilot|codex)\b/i
        };
        const tags = [];
        for (const [tag, pattern] of Object.entries(tagPatterns)) {
            if (pattern.test(title)) tags.push(tag);
        }
        if (tags.length === 0) tags.push('news');
        return tags.slice(0, 4);
    }

    extractSource(url) {
        if (!url) return 'Unknown';
        try {
            const hostname = new URL(url).hostname.toLowerCase();
            const sourceMap = {
                'techcrunch.com': 'TechCrunch',
                'reuters.com': 'Reuters',
                'theverge.com': 'The Verge',
                'wired.com': 'Wired',
                'arstechnica.com': 'Ars Technica',
                'bbc.com': 'BBC', 'bbc.co.uk': 'BBC',
                'nytimes.com': 'New York Times',
                'theguardian.com': 'The Guardian',
                'bloomberg.com': 'Bloomberg',
                'technologyreview.com': 'MIT Tech Review',
                'venturebeat.com': 'VentureBeat',
                'anthropic.com': 'Anthropic',
                'openai.com': 'OpenAI',
                'deepmind.com': 'DeepMind',
                'artificialintelligence-news.com': 'AI News'
            };
            for (const [domain, name] of Object.entries(sourceMap)) {
                if (hostname.includes(domain)) return name;
            }
            return hostname.replace('www.', '').split('.')[0];
        } catch { return 'Unknown'; }
    }

    populateFilters() {
        const sourceContainer = document.getElementById('sourceCheckboxes');
        if (!sourceContainer) return;

        const sortedSources = Array.from(this.sources).sort();
        sourceContainer.innerHTML = '';
        sortedSources.forEach(source => {
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" value="${source}" checked> ${source}`;
            sourceContainer.appendChild(label);
        });
    }

    setupEventListeners() {
        const searchInput = document.getElementById('searchInput');
        const fromDate = document.getElementById('fromDate');
        const toDate = document.getElementById('toDate');
        const sourceContainer = document.getElementById('sourceCheckboxes');
        const quick24h = document.getElementById('quick24h');
        const quickLastWeek = document.getElementById('quickLastWeek');
        const quickAll = document.getElementById('quickAll');
        const groupBy = document.getElementById('groupBy');

        if (searchInput) searchInput.addEventListener('input', () => this.filterArticles());
        if (fromDate) fromDate.addEventListener('change', () => { this.updateQuickFilterButtons(); this.filterArticles(); });
        if (toDate) toDate.addEventListener('change', () => { this.updateQuickFilterButtons(); this.filterArticles(); });
        if (sourceContainer) sourceContainer.addEventListener('change', () => this.filterArticles());
        if (groupBy) groupBy.addEventListener('change', () => this.displayArticles());

        if (quick24h) quick24h.addEventListener('click', () => {
            const today = new Date();
            const yesterday = new Date();
            yesterday.setDate(today.getDate() - 1);
            if (fromDate) fromDate.value = yesterday.toISOString().split('T')[0];
            if (toDate) toDate.value = today.toISOString().split('T')[0];
            this.updateQuickFilterButtons('24h');
            this.filterArticles();
        });

        if (quickLastWeek) quickLastWeek.addEventListener('click', () => {
            const today = new Date();
            const lastWeek = new Date();
            lastWeek.setDate(today.getDate() - 7);
            if (fromDate) fromDate.value = lastWeek.toISOString().split('T')[0];
            if (toDate) toDate.value = today.toISOString().split('T')[0];
            this.updateQuickFilterButtons('week');
            this.filterArticles();
        });

        if (quickAll) quickAll.addEventListener('click', () => {
            if (fromDate) fromDate.value = '';
            if (toDate) toDate.value = '';
            this.updateQuickFilterButtons('all');
            this.filterArticles();
        });

        const clearBtn = document.getElementById('clearFilters');
        if (clearBtn) clearBtn.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            if (fromDate) fromDate.value = '';
            if (toDate) toDate.value = '';
            document.querySelectorAll('#sourceCheckboxes input').forEach(cb => cb.checked = true);
            this.updateQuickFilterButtons('all');
            this.filterArticles();
        });
    }

    updateQuickFilterButtons(active = null) {
        ['24h', 'LastWeek', 'All'].forEach(id => {
            const btn = document.getElementById(`quick${id}`);
            if (btn) btn.classList.toggle('active', active === { '24h': '24h', 'LastWeek': 'week', 'All': 'all' }[id]);
        });
    }

    filterArticles() {
        const searchInput = document.getElementById('searchInput');
        const fromDateEl = document.getElementById('fromDate');
        const toDateEl = document.getElementById('toDate');

        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        const fromDate = fromDateEl ? fromDateEl.value : '';
        const toDate = toDateEl ? toDateEl.value : '';
        const selectedSources = Array.from(document.querySelectorAll('#sourceCheckboxes input:checked')).map(i => i.value);

        this.filteredArticles = this.articles.filter(article => {
            const articleDate = new Date(article.date);

            const matchesSearch = !searchTerm ||
                article.title.toLowerCase().includes(searchTerm) ||
                article.summary.toLowerCase().includes(searchTerm) ||
                article.source.toLowerCase().includes(searchTerm);

            let matchesRange = true;
            if (fromDate) matchesRange = matchesRange && articleDate >= new Date(fromDate);
            if (toDate) matchesRange = matchesRange && articleDate <= new Date(toDate + 'T23:59:59');

            const matchesSource = selectedSources.length === 0 || selectedSources.includes(article.source);

            return matchesSearch && matchesRange && matchesSource;
        });

        this.updateFilterSummary();
        this.displayArticles();
    }

    updateFilterSummary() {
        const summary = document.getElementById('filterSummary');
        const text = document.getElementById('filterSummaryText');
        if (summary && text) {
            text.textContent = `Showing ${this.filteredArticles.length} of ${this.articles.length} articles`;
            summary.style.display = 'block';
        }
    }

    displayArticles() {
        const groupByEl = document.getElementById('groupBy');
        const groupBy = groupByEl ? groupByEl.value : 'date';
        const container = document.getElementById('articlesContainer');
        const noResults = document.getElementById('noResults');

        if (!container) return;
        container.innerHTML = '';

        if (this.filteredArticles.length === 0) {
            if (noResults) noResults.style.display = 'block';
            return;
        }
        if (noResults) noResults.style.display = 'none';

        const getRelativeDate = (dateString) => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            const parts = dateString.match(/(\d+)\s+(\w+)\s+(\d+)/);
            if (parts) {
                const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                const articleDate = new Date(parseInt(parts[3]), months.indexOf(parts[2]), parseInt(parts[1]));
                if (articleDate.getTime() === today.getTime()) return 'Today';
                if (articleDate.getTime() === yesterday.getTime()) return 'Yesterday';
            }
            return dateString;
        };

        if (groupBy === 'source') {
            const groups = {};
            this.filteredArticles.forEach(a => {
                groups[a.source] = groups[a.source] || [];
                groups[a.source].push(a);
            });
            Object.keys(groups).sort().forEach(src => {
                const h = document.createElement('h3');
                h.className = 'an-group-title';
                h.textContent = src;
                container.appendChild(h);
                const g = document.createElement('div');
                g.className = 'an-grid';
                groups[src].forEach(a => g.appendChild(this.createCard(a)));
                container.appendChild(g);
            });
        } else {
            const groups = {};
            this.filteredArticles.forEach(a => {
                groups[a.dateString] = groups[a.dateString] || [];
                groups[a.dateString].push(a);
            });

            const sortedDates = Object.keys(groups).sort((a, b) => {
                const parse = (str) => {
                    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                    const parts = str.match(/(\d+)\s+(\w+)\s+(\d+)/);
                    if (parts) return new Date(parseInt(parts[3]), months.indexOf(parts[2]), parseInt(parts[1]));
                    return new Date(0);
                };
                return parse(b) - parse(a);
            });

            sortedDates.forEach(date => {
                const h = document.createElement('h3');
                h.className = 'an-group-title';
                h.textContent = getRelativeDate(date);
                container.appendChild(h);
                const g = document.createElement('div');
                g.className = 'an-grid';
                groups[date].forEach(a => g.appendChild(this.createCard(a)));
                container.appendChild(g);
            });
        }
    }

    createCard(article) {
        const card = document.createElement('article');
        card.className = 'an-card';

        const isFav = this.favorites.has(article.title);
        if (isFav) card.classList.add('highlight');

        const tagsHtml = article.tags.length > 0
            ? `<div class="an-tags">${article.tags.map(t => `<span class="an-tag">${t}</span>`).join('')}</div>`
            : '';

        card.innerHTML = `
            <div class="an-card-header">
                <span class="an-card-source">${article.source}</span>
                <span class="an-card-date">${article.dateString}</span>
            </div>
            <h3 class="an-card-title">
                <a href="${article.url}" target="_blank" rel="noopener noreferrer">${article.title}</a>
            </h3>
            ${article.summary ? `<p class="an-card-summary">${article.summary.slice(0, 180)}${article.summary.length > 180 ? '...' : ''}</p>` : ''}
            <div class="an-card-footer">
                <span class="an-card-category">${article.category}</span>
                <div class="an-card-actions">
                    <button class="an-fav-btn${isFav ? ' active' : ''}" title="Highlight">
                        <svg viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/></svg>
                    </button>
                    <a href="${article.url}" target="_blank" rel="noopener noreferrer" class="an-read-more">Read</a>
                </div>
            </div>
            ${tagsHtml}
        `;

        const favBtn = card.querySelector('.an-fav-btn');
        if (favBtn) {
            favBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.favorites.has(article.title)) {
                    this.favorites.delete(article.title);
                } else {
                    this.favorites.add(article.title);
                }
                localStorage.setItem('axyl-news-favorites', JSON.stringify(Array.from(this.favorites)));
                this.displayArticles();
            });
        }

        return card;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new NewsApp();
});
