// ================================================================
// TV-CHECKPROGRAMM — Search Robot + Workflow Bot
// Finds playable IPTV streams for channels and builds iptv.tatnet.app
// embed previews without replacing the EPG provider.
// ================================================================

'use strict';

(function() {

const EMBED_BASE = 'https://iptv.tatnet.app/embed.html';
const CACHE_TTL = 45 * 60 * 1000;
const FEDERAL_CATS = new Set(['federal', 'news']);

// Source order follows the product rule:
// 1) zabava-project for Russian/federal channels (Rostelecom/WINK backed);
// 2) LIVEM3U for everything else and international channels;
// 3) the proxied Zabava mirror as an operational fallback.
const SOURCES = [
  {
    id: 'zabava-project',
    label: 'Zabava Project',
    role: 'Лучший источник для РФ/федеральных каналов',
    url: 'https://raw.githubusercontent.com/CrocoUser/zabava-project/refs/heads/main/zabava-full.m3u',
    prefer: channel => isRussianChannel(channel) || FEDERAL_CATS.has(channel.cat),
  },
  {
    id: 'livem3u',
    label: 'LIVEM3U',
    role: 'Мировые, нишевые и не федеральные каналы',
    url: 'https://secure-272717.tatnet.app/livem3u.tatnet.app/data/playlist.m3u',
    prefer: channel => !isRussianChannel(channel) && !FEDERAL_CATS.has(channel.cat),
  },
  {
    id: 'zabava-mirror',
    label: 'Zabava mirror',
    role: 'Fallback через tatnet proxy',
    url: 'https://secure-272717.tatnet.app/livem3u.tatnet.app/zabava-full.m3u',
    prefer: () => false,
  },
  {
    id: 'russia-tv',
    label: 'Russia TV',
    role: 'Дополнительный РФ fallback',
    url: 'https://secure-272717.tatnet.app/livem3u.tatnet.app/russ.m3u',
    prefer: channel => isRussianChannel(channel),
  },
];

const cache = {
  sources: {},
  matches: {},
  catalog: {},
};

function sourceOrder(channel) {
  return SOURCES
    .map((source, index) => ({ source, index, score: source.prefer(channel) ? 0 : 1 }))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map(item => item.source);
}

async function findStream(channel) {
  if (!channel || channel.type === 'radio') return null;
  const embedded = getEmbeddedStream(channel);
  if (embedded) return embedded;
  const key = `match_${channel.id}_${normalize(channel.name)}`;
  const cached = readCache(cache.matches, key);
  if (cached !== undefined) return cached;

  for (const source of sourceOrder(channel)) {
    const playlist = await loadSource(source);
    if (!playlist.length) continue;
    const match = rankMatches(channel, playlist)[0];
    if (match && match.score >= 72) {
      const found = {
        ...match.item,
        score: match.score,
        sourceId: source.id,
        sourceLabel: source.label,
        sourceRole: source.role,
        embedUrl: buildEmbedUrl(match.item.url, match.item.name),
      };
      writeCache(cache.matches, key, found);
      return found;
    }
  }

  writeCache(cache.matches, key, null);
  return null;
}

async function findMany(channels, limit = 10) {
  const jobs = channels
    .filter(channel => channel && channel.type !== 'radio')
    .slice(0, limit)
    .map(channel => findStream(channel).then(stream => ({ channel, stream })));
  return Promise.all(jobs);
}

async function loadSource(source) {
  const cached = readCache(cache.sources, source.id);
  if (cached) return cached;

  try {
    const resp = await fetch(source.url, { signal: AbortSignal.timeout(12000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    const parsed = parseM3U(text).map(item => ({
      ...item,
      sourceId: source.id,
      sourceLabel: source.label,
      sourceRole: source.role,
      embedUrl: buildEmbedUrl(item.url, item.name),
    }));
    writeCache(cache.sources, source.id, parsed);
    return parsed;
  } catch (e) {
    console.warn(`Stream source ${source.id} failed:`, e.message);
    writeCache(cache.sources, source.id, []);
    return [];
  }
}

function parseM3U(text) {
  const lines = String(text || '').split(/\r?\n/);
  const items = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF')) {
      current = {
        name: cleanTitle(line.split(',').slice(1).join(',') || 'Канал'),
        group: attr(line, 'group-title') || 'TV',
        tvgId: attr(line, 'tvg-id') || '',
        logo: attr(line, 'tvg-logo') || '',
        url: '',
      };
      continue;
    }

    if (current && !line.startsWith('#') && /^https?:\/\//i.test(line)) {
      current.url = line;
      items.push(current);
      current = null;
    }
  }

  return items;
}

function rankMatches(channel, playlist) {
  const channelName = normalize(channel.name);
  const aliases = buildAliases(channel);
  return playlist
    .map(item => {
      const itemName = normalize(item.name);
      const tvgId = normalize(item.tvgId);
      const exactAlias = aliases.some(alias => itemName === alias || tvgId === alias);
      const containsAlias = aliases.some(alias => alias.length >= 3 && (itemName.includes(alias) || alias.includes(itemName)));
      let score = similarity(channelName, itemName);

      for (const alias of aliases) {
        score = Math.max(score, similarity(alias, itemName), similarity(alias, tvgId));
      }

      if (exactAlias) score += 30;
      else if (containsAlias) score += 18;
      if (/\(\+\d+\)|\+\d+$/i.test(item.name)) score -= 18;
      if (/\bhd\b/i.test(item.name)) score += 2;

      return { item, score: Math.max(0, Math.min(100, Math.round(score))) };
    })
    .filter(match => match.score >= 55)
    .sort((a, b) => b.score - a.score);
}


async function buildChannelCatalog(limit = 2500) {
  const cached = readCache(cache.catalog, 'stream_catalog');
  if (cached) return cached.slice(0, limit);

  const seen = new Set();
  const catalog = [];
  for (const source of SOURCES) {
    const playlist = await loadSource(source);
    for (const item of playlist) {
      const name = cleanTitle(item.name);
      const normalized = normalize(name);
      if (!normalized || normalized.length < 2 || seen.has(normalized)) continue;
      seen.add(normalized);

      catalog.push({
        id: streamChannelId(source.id, item.url || name),
        epgId: item.tvgId || '',
        name,
        type: 'tv',
        cat: inferCategory(name, item.group, source.id),
        logo: item.logo || '',
        color: colorFromString(`${source.id}:${name}`),
        abbr: makeAbbr(name),
        streamUrl: item.url,
        streamName: name,
        streamGroup: item.group || 'TV',
        streamSourceId: source.id,
        streamSourceLabel: source.label,
        streamSourceRole: source.role,
        streamEmbedUrl: buildEmbedUrl(item.url, name),
        isStreamCatalog: true,
      });
      if (catalog.length >= limit) break;
    }
    if (catalog.length >= limit) break;
  }

  writeCache(cache.catalog, 'stream_catalog', catalog);
  return catalog.slice(0, limit);
}

function makeAbbr(name) {
  const words = String(name || '').split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return String(name || 'TV').slice(0, 3).toUpperCase();
}

function getEmbeddedStream(channel) {
  if (!channel?.streamUrl) return null;
  return {
    name: channel.streamName || channel.name,
    group: channel.streamGroup || 'TV',
    url: channel.streamUrl,
    logo: channel.logo || '',
    score: 100,
    sourceId: channel.streamSourceId || 'stream-catalog',
    sourceLabel: channel.streamSourceLabel || 'IPTV catalog',
    sourceRole: channel.streamSourceRole || 'Прямой поток из расширенного каталога',
    embedUrl: channel.streamEmbedUrl || buildEmbedUrl(channel.streamUrl, channel.streamName || channel.name),
  };
}

function makeLiveSchedule(channel, date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0).getTime();
  const stop = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).getTime();
  const group = channel.streamGroup ? ` · ${channel.streamGroup}` : '';
  const liveStream = getEmbeddedStream(channel);
  const desc = liveStream
    ? `Live-расписание сформировано поисковым роботом из IPTV-каталога${group}.`
    : 'Live-расписание сформировано поисковым роботом: классический EPG для этого канала пока недоступен.';

  return [{
    title: `Прямой эфир ${channel.name}`,
    desc,
    genre: channel.streamGroup || (liveStream ? 'Live TV' : 'Робот'),
    start,
    stop,
    time: '00:00',
    duration: 24 * 60,
    liveStream,
  }];
}

function isStreamChannel(channel) {
  return Boolean(channel?.streamUrl || channel?.isStreamCatalog);
}

function buildAliases(channel) {
  const base = channel.name || '';
  const aliases = new Set([
    normalize(base),
    normalize(base.replace(/\b(тв|tv|hd|sd|канал|channel)\b/gi, '')),
    normalize(channel.epgId || ''),
  ]);

  const custom = {
    'Первый канал': ['первый', '1tv', 'pervy'],
    'Россия 1': ['россия 1', 'rossia1'],
    'Россия К': ['культура', 'россия культура'],
    'Матч ТВ': ['матч!', 'матч', 'match-tv'],
    'Пятый канал': ['пятый', '5 канал'],
    'ТВ Центр': ['твц', 'tvc'],
    'Дождь': ['дождь', 'tvrain', 'rain'],
  };

  Object.entries(custom).forEach(([name, vals]) => {
    if (normalize(base).includes(normalize(name))) vals.forEach(v => aliases.add(normalize(v)));
  });

  return [...aliases].filter(Boolean);
}

function buildEmbedUrl(streamUrl, title) {
  const params = new URLSearchParams({ url: streamUrl, title });
  return `${EMBED_BASE}?${params.toString()}`;
}

function attr(line, name) {
  const match = line.match(new RegExp(`${name}="([^"]*)"`, 'i'));
  return match ? match[1].trim() : '';
}

function cleanTitle(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}


function inferCategory(name, group, sourceId) {
  const text = `${name} ${group} ${sourceId}`.toLowerCase();
  if (/news|новост|инфо|дожд|bbc|cnn|euronews|dw|rt\b/.test(text)) return 'news';
  if (/sport|спорт|match|матч|football|футбол|хоккей|ufc|mma/.test(text)) return 'sport';
  if (/kids|дет|мульт|cartoon|nick|disney/.test(text)) return 'kids';
  if (/music|муз|mtv|vh1|шансон|radio/.test(text)) return 'music';
  if (/кино|film|movie|cinema|serial|сериал/.test(text)) return 'movies';
  if (/doc|док|history|discovery|animal|science|nat geo/.test(text)) return 'doc';
  if (/культур|culture|театр/.test(text)) return 'culture';
  if (sourceId === 'zabava-project' || /росси|основные|федерал/.test(text)) return 'federal';
  return 'entertainment';
}

function streamChannelId(sourceId, seed) {
  // Keep IDs numeric so the existing dataset/detail navigation keeps working.
  return 900000 + (hashString(`${sourceId}:${seed}`) % 900000);
}

function colorFromString(value) {
  return '#' + (hashString(value).toString(16).slice(-6)).padStart(6, '0');
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < String(value).length; i++) {
    hash ^= String(value).charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/&/g, ' and ')
    .replace(/[^a-zа-я0-9]+/g, ' ')
    .replace(/\b(телеканал|канал|channel|tv|тв|hd|sd|ru|russia)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a))) return 86;

  const aTokens = new Set(a.split(' ').filter(Boolean));
  const bTokens = new Set(b.split(' ').filter(Boolean));
  const intersection = [...aTokens].filter(token => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size || 1;
  const tokenScore = (intersection / union) * 92;
  const distanceScore = (1 - levenshtein(a, b) / Math.max(a.length, b.length, 1)) * 78;
  return Math.max(tokenScore, distanceScore);
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

function isRussianChannel(channel) {
  return /[а-яё]/i.test(channel?.name || '') || /\.ru$/i.test(channel?.epgId || '');
}

function readCache(bucket, key) {
  const entry = bucket[key];
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL) {
    delete bucket[key];
    return undefined;
  }
  return entry.data;
}

function writeCache(bucket, key, data) {
  bucket[key] = { data, ts: Date.now() };
}

window.StreamBot = {
  sources: SOURCES.map(({ id, label, role, url }) => ({ id, label, role, url })),
  findStream,
  findMany,
  buildChannelCatalog,
  getEmbeddedStream,
  makeLiveSchedule,
  isStreamChannel,
  buildEmbedUrl,
};

})();
