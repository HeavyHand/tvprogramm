// ================================================================
// TV-CHECKPROGRAMM — Main Application
// ================================================================

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const { fetchSchedule, isLive, getProgress, getLiveIndex, getCurrentShow, toDateStr, fetchChannelCatalog } = window.EPG;
  const CHANNELS = window.CHANNELS;
  const StreamBot = window.StreamBot;
  const CAT_LABELS = window.CAT_LABELS;
  const CAT_TAG = window.CAT_TAG;

  // ===== STATE =====
  const S = {
    page: 'home',
    date: new Date(),
    filter: 'all',
    search: '',
    channelId: null,
    offset: 0,
    PER_PAGE: 10,
    mobMenu: false,
    modal: null,
  };

  // Schedule data store: { [channelId_dateStr]: items[] | 'loading' | 'error' }
  const scheduleStore = {};
  const streamStore = {};

  const app = document.getElementById('app');

  await hydrateChannelCatalog();

  // ===== MAIN RENDER =====
  function render() {
    app.innerHTML = '';
    app.appendChild(mkHeader());
    app.appendChild(mkMobMenu());
    switch (S.page) {
      case 'home':     app.appendChild(mkHome()); break;
      case 'channel':  app.appendChild(mkChannelPage()); break;
      case 'about':    app.appendChild(mkStatic('О сервисе', aboutHTML())); break;
      case 'docs':     app.appendChild(mkStatic('Документация', docsHTML())); break;
      case 'faq':      app.appendChild(mkStatic('FAQ', faqHTML())); break;
      case 'policy':   app.appendChild(mkStatic('Политика конфиденциальности', policyHTML())); break;
      case 'contacts': app.appendChild(mkStatic('Контакты', contactsHTML())); break;
      case 'widget':   app.appendChild(mkStatic('Виджет', widgetHTML())); break;
    }
    app.appendChild(mkFooter());
    bindAll();
    // Trigger EPG loads for visible channels
    if (S.page === 'home') {
      loadVisibleSchedules();
      loadVisibleStreams();
    }
    if (S.page === 'channel') loadChannelDetail();
  }

  async function hydrateChannelCatalog() {
    const remoteChannels = await fetchChannelCatalog(10000);
    if (!remoteChannels.length) return;

    const known = new Set(CHANNELS.map(c => Number(c.id)));
    let added = 0;

    for (const ch of remoteChannels) {
      const id = Number(ch.id);
      if (!Number.isFinite(id) || known.has(id)) continue;
      CHANNELS.push(ch);
      known.add(id);
      added++;
    }

    // Patch logos for existing channels with actual epg.pw metadata
    for (const local of CHANNELS) {
      const remote = remoteChannels.find(rc => Number(rc.id) === Number(local.id));
      if (remote?.logo) local.logo = remote.logo;
    }

    if (added > 0) {
      console.info(`Loaded ${added} additional channels from epg.pw catalog`);
    }
  }

  async function hydrateStreamCatalog() {
    if (!StreamBot?.buildChannelCatalog) return 0;
    const streamChannels = await StreamBot.buildChannelCatalog(2500);
    if (!streamChannels.length) return 0;

    const knownNames = new Set(CHANNELS.map(c => normalizeName(c.name)));
    const knownIds = new Set(CHANNELS.map(c => Number(c.id)));
    let added = 0;

    for (const ch of streamChannels) {
      if (knownNames.has(normalizeName(ch.name))) continue;
      while (knownIds.has(Number(ch.id))) ch.id += 1;
      CHANNELS.push(ch);
      knownNames.add(normalizeName(ch.name));
      knownIds.add(Number(ch.id));
      added++;
    }

    if (added > 0) {
      console.info(`Search robot added ${added} IPTV channels to the catalog`);
    }
    return added;
  }

  // ===== HEADER =====
  function mkHeader() {
    const el = ce('header', 'hdr');
    el.innerHTML = `
      <div class="hdr-inner">
        <a class="logo" href="#" data-nav="home">
          <div class="logo-box">📺</div>
          <span class="logo-txt">TV-<span>CHECK</span></span>
        </a>
        <div class="hdr-search" style="position:relative">
          <span class="si">🔍</span>
          <input type="text" id="hdrSearch" placeholder="Поиск канала или передачи..." value="${esc(S.search)}" autocomplete="off">
          <div class="ac" id="hdrAc"></div>
        </div>
        <nav class="hdr-nav">
          <a href="#" data-nav="home" class="${S.page==='home'?'on':''}">Главная</a>
          <a href="#" data-nav="about" class="${S.page==='about'?'on':''}">О сервисе</a>
          <a href="#" data-nav="docs" class="${S.page==='docs'?'on':''}">Документация</a>
          <a href="#" data-nav="faq" class="${S.page==='faq'?'on':''}">FAQ</a>
          <a href="#" data-nav="widget" class="${S.page==='widget'?'on':''}">Виджет</a>
          <span class="live-dot">В ЭФИРЕ</span>
        </nav>
        <div class="burger" id="burgerBtn"><span></span><span></span><span></span></div>
      </div>`;
    return el;
  }

  function mkMobMenu() {
    const el = ce('div', `mob-menu${S.mobMenu?' open':''}`);
    el.innerHTML = `
      <div class="mob-s">
        <input type="text" id="mobSearch" placeholder="Поиск..." value="${esc(S.search)}">
        <button class="btn-red" id="mobSearchBtn" style="padding:10px 14px;font-size:13px">🔍</button>
      </div>
      <a href="#" data-nav="home">🏠 Главная</a>
      <a href="#" data-nav="about">ℹ️ О сервисе</a>
      <a href="#" data-nav="docs">📄 Документация</a>
      <a href="#" data-nav="faq">❓ FAQ</a>
      <a href="#" data-nav="widget">🔧 Виджет для сайта</a>
      <a href="#" data-nav="policy">🔒 Политика конфиденциальности</a>
      <a href="#" data-nav="contacts">📧 Контакты</a>`;
    return el;
  }

  // ===== HOME =====
  function mkHome() {
    const wrap = ce('div', 'page');
    wrap.innerHTML = mkHeroHTML() + mkDateBarHTML() + mkFilterBarHTML() + mkBotPanelHTML();
    const layout = ce('div', 'layout');
    layout.appendChild(mkSidebar());
    layout.appendChild(mkScheduleSection());
    wrap.appendChild(layout);
    wrap.innerHTML += mkFeaturesHTML() + mkFaqHTML();
    return wrap;
  }

  function mkHeroHTML() {
    const tvCount = CHANNELS.filter(c => c.type === 'tv').length;
    const rCount  = CHANNELS.filter(c => c.type === 'radio').length;
    return `
      <section class="hero">
        <div class="hero-tag">🤖 Поисковой робот + актуальный эфир</div>
        <h1>TV-<span>CHECK</span><br>PROGRAMM</h1>
        <p>Обширная программа передач ${tvCount}+ телеканалов и ${rCount}+ радиостанций: РФ, международные и нишевые каналы. Если канал сейчас в эфире, вместо картинки показываем живой плеер iptv.tatnet.app/embed.html.</p>
        <div class="hero-form" style="position:relative">
          <input type="text" id="heroSearch" placeholder="Первый канал, НТВ, Eurosport..." value="${esc(S.search)}" autocomplete="off">
          <div class="ac" id="heroAc"></div>
          <button class="btn-red" id="heroBtn">Найти →</button>
        </div>
        <div class="hero-nums">
          <div class="h-num"><div class="n">${tvCount}+</div><div class="l">ТВ каналов</div></div>
          <div class="h-num"><div class="n">${rCount}+</div><div class="l">Радиостанций</div></div>
          <div class="h-num"><div class="n">LIVE</div><div class="l">Данные EPG</div></div>
          <div class="h-num"><div class="n">7</div><div class="l">Дней вперёд</div></div>
        </div>
      </section>`;
  }

  function mkBotPanelHTML() {
    const sources = StreamBot?.sources || [];
    const sourcesHTML = sources.slice(0, 3).map(src => `
      <div class="bot-source">
        <strong>${esc(src.label)}</strong>
        <span>${esc(src.role)}</span>
      </div>`).join('');

    return `
      <section class="bot-panel">
        <div class="bot-card">
          <div class="bot-ico">🔎</div>
          <div>
            <h2>Поисковой робот</h2>
            <p>Собирает расширенный каталог РФ, международных и нишевых каналов из IPTV-источников, дополняет EPG и формирует live-расписание там, где классический EPG отсутствует.</p>
          </div>
        </div>
        <div class="bot-card">
          <div class="bot-ico">⚙️</div>
          <div>
            <h2>Workflow-бот</h2>
            <p>Готов к GitHub Actions: cron проверяет источники, а сайт использует эти же правила выбора Zabava Project/LIVEM3U для актуального эфира.</p>
          </div>
        </div>
        <div class="bot-sources">${sourcesHTML}</div>
      </section>`;
  }

  function mkDateBarHTML() {
    const today = new Date();
    const DAY = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
    const MON = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
    let html = '<div class="datebar"><div class="datebar-inner">';
    for (let i = -3; i <= 7; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      const sel = d.toDateString() === S.date.toDateString();
      const isT = d.toDateString() === today.toDateString();
      const isY = i === -1;
      let label = `${DAY[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}`;
      if (isT) label = 'Сегодня';
      else if (isY) label = 'Вчера';
      else if (i === 1) label = 'Завтра';
      html += `<button class="d-btn${sel?' on':''}${isT?' today-btn':''}" data-date="${toDateStr(d)}">${label}</button>`;
    }
    return html + '</div></div>';
  }

  function mkFilterBarHTML() {
    const filters = [
      {k:'all',l:'📺 Все'},
      {k:'tv',l:'🖥 ТВ'},
      {k:'radio',l:'📻 Радио'},
      {k:'movies',l:'🎬 Кино'},
      {k:'sport',l:'⚽ Спорт'},
      {k:'news',l:'📰 Новости'},
      {k:'kids',l:'🧸 Детские'},
      {k:'music',l:'🎵 Музыка'},
      {k:'doc',l:'🔭 Документальные'},
    ];
    let html = '<div class="filterbar"><div class="filterbar-inner">';
    filters.forEach(f => {
      html += `<button class="chip${S.filter===f.k?' on':''}" data-c="${f.k}">${f.l}</button>`;
    });
    html += '</div></div>';
    return html;
  }

  function mkSidebar() {
    const el = ce('aside', 'sidebar');
    const tvCats = ['federal','entertainment','news','sport','kids','music','culture','movies','doc'];
    const rCats  = ['radio-music','radio-news','radio-talk','radio-sport'];

    let html = `<div class="sb-box"><div class="sb-title">Телеканалы</div>
      <button class="sb-lnk${S.filter==='tv'?' on':''}" data-filter="tv"><span class="ic">🖥</span> Все ТВ <span class="cnt">${CHANNELS.filter(c=>c.type==='tv').length}</span></button>`;
    tvCats.forEach(cat => {
      const n = CHANNELS.filter(c => c.cat === cat).length;
      if (!n) return;
      html += `<button class="sb-lnk" data-filter="cat:${cat}"><span class="ic">▸</span> ${CAT_LABELS[cat]||cat} <span class="cnt">${n}</span></button>`;
    });
    html += `</div><div class="sb-box"><div class="sb-title">Радиостанции</div>
      <button class="sb-lnk${S.filter==='radio'?' on':''}" data-filter="radio"><span class="ic">📻</span> Всё Радио <span class="cnt">${CHANNELS.filter(c=>c.type==='radio').length}</span></button>`;
    rCats.forEach(cat => {
      const n = CHANNELS.filter(c => c.cat === cat).length;
      if (!n) return;
      html += `<button class="sb-lnk" data-filter="cat:${cat}"><span class="ic">▸</span> ${CAT_LABELS[cat]||cat} <span class="cnt">${n}</span></button>`;
    });
    html += `</div><div class="sb-box"><div class="sb-title">Навигация</div>
      <button class="sb-lnk" data-nav="about"><span class="ic">ℹ️</span> О сервисе</button>
      <button class="sb-lnk" data-nav="faq"><span class="ic">❓</span> FAQ</button>
      <button class="sb-lnk" data-nav="widget"><span class="ic">🔧</span> Виджет</button>
      <button class="sb-lnk" data-nav="docs"><span class="ic">📄</span> Документация</button>
    </div>`;
    el.innerHTML = html;
    return el;
  }

  function filteredChannels() {
    let ch = CHANNELS;
    if (S.filter === 'tv') ch = ch.filter(c => c.type === 'tv');
    else if (S.filter === 'radio') ch = ch.filter(c => c.type === 'radio');
    else if (S.filter === 'movies') ch = ch.filter(c => c.cat === 'movies');
    else if (S.filter === 'sport') ch = ch.filter(c => c.cat === 'sport' || c.cat === 'radio-sport');
    else if (S.filter === 'news') ch = ch.filter(c => c.cat === 'news' || c.cat === 'radio-news');
    else if (S.filter === 'kids') ch = ch.filter(c => c.cat === 'kids');
    else if (S.filter === 'music') ch = ch.filter(c => c.cat === 'music' || c.cat === 'radio-music');
    else if (S.filter === 'doc') ch = ch.filter(c => c.cat === 'doc');
    else if (S.filter.startsWith('cat:')) { const cat = S.filter.slice(4); ch = ch.filter(c => c.cat === cat); }

    if (S.search.trim()) {
      const q = S.search.trim().toLowerCase();
      ch = ch.filter(c => c.name.toLowerCase().includes(q));
    }
    return ch;
  }

  function mkScheduleSection() {
    const wrap = ce('div', '');
    const channels = filteredChannels();
    const total = channels.length;
    const shown = channels.slice(0, (S.offset + 1) * S.PER_PAGE);

    if (S.search) {
      const lbl = ce('div', '');
      lbl.innerHTML = `<div style="padding:0 0 12px;font-size:13px;color:var(--muted)">Найдено: <strong style="color:var(--text)">${total}</strong> каналов по запросу "<strong style="color:var(--text)">${esc(S.search)}</strong>"</div>`;
      wrap.appendChild(lbl);
    }

    const grid = ce('div', 'ch-grid');

    if (shown.length === 0) {
      grid.innerHTML = `<div class="empty"><div class="ico">📭</div><h3>Ничего не найдено</h3><p>Попробуйте изменить фильтр или запрос</p></div>`;
    } else {
      shown.forEach((ch, i) => {
        grid.appendChild(mkChannelCard(ch, i));
      });
    }
    wrap.appendChild(grid);

    if (shown.length < total) {
      const more = ce('div', 'load-more');
      more.innerHTML = `<button class="btn-outline" id="loadMoreBtn">Показать ещё каналы (${total - shown.length})</button>`;
      wrap.appendChild(more);
    }
    return wrap;
  }

  function mkChannelCard(ch, animIdx) {
    const card = ce('div', 'ch-card');
    card.style.animationDelay = `${Math.min(animIdx * 0.05, 0.4)}s`;
    card.dataset.chid = ch.id;

    const dateStr = toDateStr(S.date);
    const storeKey = `${ch.id}_${dateStr}`;
    const data = scheduleStore[storeKey];

    const tagClass = CAT_TAG[ch.cat] || 'tag-tv';
    const tagLabel = CAT_LABELS[ch.cat] || ch.cat;
    const typeTag  = ch.type === 'radio' ? 'tag-radio' : 'tag-tv';
    const typeLabel = ch.type === 'radio' ? 'Радио' : 'ТВ';

    let schedHTML = '';
    let nowHTML = '';
    const streamHTML = mkStreamPreviewHTML(ch);

    if (!data || data === 'loading') {
      schedHTML = `<div class="loading-box"><div class="spinner"></div></div>`;
      nowHTML = `<div class="ch-now"><div class="lv">ЗАГРУЗКА</div><div class="lv-show">—</div></div>`;
    } else if (data === 'error') {
      schedHTML = `<div class="err-banner">⚠ Не удалось загрузить расписание для этого канала</div>`;
      nowHTML = `<div class="ch-now"><div class="lv" style="color:var(--muted)">—</div><div class="lv-show">Нет данных</div></div>`;
    } else if (data.length === 0) {
      schedHTML = `<div style="padding:18px;color:var(--muted);font-size:13px;text-align:center">Расписание на эту дату недоступно</div>`;
      nowHTML = `<div class="ch-now"><div class="lv" style="color:var(--muted)">—</div></div>`;
    } else {
      const liveIdx = getLiveIndex(data);
      const startIdx = Math.max(0, liveIdx - 1);
      const visible = data.slice(startIdx, startIdx + 5);
      const current = data[liveIdx];

      nowHTML = `<div class="ch-now">
        <div class="lv">СЕЙЧАС</div>
        <div class="lv-show">${esc(current ? current.title : '—')}</div>
      </div>`;

      schedHTML = visible.map((item, i) => {
        const absIdx = startIdx + i;
        const live = isLive(item, data, absIdx);
        const prog = live ? getProgress(item, data, absIdx) : 0;
        return `<div class="sch-item${live?' live':''}" data-ch="${ch.id}" data-show="${esc(item.title)}">
          <div class="sch-time">${esc(item.time)}</div>
          <div class="sch-info">
            <div class="sch-title">${esc(item.title)}</div>
            <div class="sch-sub">${esc(item.genre || '')}${item.genre && item.duration ? ' · ' : ''}${item.duration ? item.duration+' мин' : ''}</div>
            ${live ? `<div class="prog-bar"><div class="prog-fill" style="width:${prog}%"></div></div>` : ''}
          </div>
          ${live ? `<div class="sch-badge">В ЭФИРЕ</div>` : ''}
        </div>`;
      }).join('');
    }

    card.innerHTML = `
      <div class="ch-head" data-modal="${ch.id}">
        <div class="ch-logo">${chLogoHTML(ch)}</div>
        <div class="ch-meta">
          <div class="ch-name">${esc(ch.name)}</div>
          <div class="ch-tags">
            <span class="tag ${typeTag}">${typeLabel}</span>
            <span class="tag ${tagClass}">${esc(tagLabel)}</span>
          </div>
        </div>
        ${nowHTML}
      </div>
      ${streamHTML}
      <div class="sch-list">${schedHTML}</div>
      <button class="more-btn" data-detail="${ch.id}">Полное расписание →</button>`;
    return card;
  }

  function chLogoHTML(ch) {
    const logo = normalizeLogoUrl(ch.logo);
    if (logo) {
      return `<img src="${logo}" alt="${esc(ch.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.innerHTML='<span style=&quot;font-size:10px;font-weight:800;color:${esc(ch.color)}&quot;>${esc(ch.abbr)}</span>'">`;
    }
    return `<span style="font-size:10px;font-weight:800;color:${ch.color}">${esc(ch.abbr)}</span>`;
  }

  function mkStreamPreviewHTML(ch, expanded = null) {
    if (!StreamBot || ch.type === 'radio') return '';
    const state = getStreamState(ch);
    if (expanded === null) expanded = Boolean(state && state !== 'loading' && state !== 'error' && isSelectedDateToday());

    if (!state) {
      return `<div class="stream-preview compact">
        <div><strong>Live-превью</strong><span>робот ещё ищет поток</span></div>
        <button class="stream-btn" data-stream-find="${ch.id}">Найти эфир</button>
      </div>`;
    }

    if (state === 'loading') {
      return `<div class="stream-preview compact"><div class="mini-spinner"></div><div><strong>Поисковой робот</strong><span>проверяет источники IPTV…</span></div></div>`;
    }

    if (state === 'error') {
      return `<div class="stream-preview compact muted"><div><strong>Live-превью</strong><span>поток не найден в открытых источниках</span></div><button class="stream-btn" data-stream-find="${ch.id}">Повторить</button></div>`;
    }

    const iframe = expanded ? `<div class="stream-frame"><iframe src="${esc(state.embedUrl)}" title="${esc(ch.name)} live" loading="lazy" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="no-referrer"></iframe></div>` : '';
    return `<div class="stream-preview${expanded ? ' expanded' : ''}">
      <div class="stream-top">
        <div>
          <strong>▶ Сейчас онлайн</strong>
          <span>${esc(state.name)} · ${esc(state.sourceLabel)} · совпадение ${state.score}%</span>
        </div>
        <button class="stream-btn" data-stream-toggle="${ch.id}">${expanded ? 'Скрыть' : 'Превью'}</button>
      </div>
      ${iframe}
    </div>`;
  }

  async function loadVisibleStreams() {
    if (!StreamBot) return;
    const channels = filteredChannels().slice(0, (S.offset + 1) * S.PER_PAGE).filter(ch => ch.type !== 'radio');
    const toLoad = channels.filter(ch => !streamStore[ch.id] && !StreamBot.getEmbeddedStream?.(ch)).slice(0, 8);
    toLoad.forEach(ch => { streamStore[ch.id] = 'loading'; patchCardSchedule(ch, toDateStr(S.date)); });

    for (const ch of toLoad) {
      const stream = await StreamBot.findStream(ch);
      streamStore[ch.id] = stream || 'error';
      patchCardSchedule(ch, toDateStr(S.date));
    }
  }

  async function findStreamForChannel(chId) {
    const ch = CHANNELS.find(c => c.id === chId);
    if (!ch || !StreamBot) return;
    const embedded = StreamBot.getEmbeddedStream?.(ch);
    if (embedded) {
      streamStore[ch.id] = embedded;
      patchCardSchedule(ch, toDateStr(S.date));
      if (S.page === 'channel') loadChannelDetail();
      return;
    }
    streamStore[ch.id] = 'loading';
    patchCardSchedule(ch, toDateStr(S.date));
    const stream = await StreamBot.findStream(ch);
    streamStore[ch.id] = stream || 'error';
    patchCardSchedule(ch, toDateStr(S.date));
    if (S.page === 'channel') loadChannelDetail();
  }

  function toggleStreamPreview(chId) {
    const card = document.querySelector(`.ch-card[data-chid="${chId}"]`);
    const preview = card?.querySelector('.stream-preview');
    const ch = CHANNELS.find(c => c.id === chId);
    const stream = ch ? getStreamState(ch) : streamStore[chId];
    if (!preview || !ch || !stream || stream === 'loading' || stream === 'error') return;
    const expanded = preview.classList.contains('expanded');
    preview.outerHTML = mkStreamPreviewHTML(ch, !expanded);
    bindStreamControls(card || document);
  }

  function bindStreamControls(root = document) {
    root.querySelectorAll('[data-stream-find]').forEach(el => {
      el.addEventListener('click', e => { e.stopPropagation(); findStreamForChannel(+el.dataset.streamFind); });
    });
    root.querySelectorAll('[data-stream-toggle]').forEach(el => {
      el.addEventListener('click', e => { e.stopPropagation(); toggleStreamPreview(+el.dataset.streamToggle); });
    });
  }

  function getStreamState(ch) {
    return streamStore[ch.id] || StreamBot?.getEmbeddedStream?.(ch) || null;
  }

  async function fetchScheduleOrLive(ch, date) {
    if (StreamBot?.isStreamChannel?.(ch)) {
      const epgData = ch.epgId && !ch.isStreamCatalog ? await fetchSchedule(ch, date) : null;
      if (Array.isArray(epgData) && epgData.length) return epgData;
      return StreamBot.makeLiveSchedule(ch, date);
    }

    const epgData = await fetchSchedule(ch, date);
    if ((epgData === null || (Array.isArray(epgData) && epgData.length === 0)) && StreamBot?.getEmbeddedStream?.(ch)) {
      return StreamBot.makeLiveSchedule(ch, date);
    }
    return epgData;
  }

  function isSelectedDateToday() {
    return S.date.toDateString() === new Date().toDateString();
  }

  // ===== SCHEDULE LOADING =====
  async function loadVisibleSchedules() {
    const channels = filteredChannels().slice(0, (S.offset + 1) * S.PER_PAGE);
    const dateStr = toDateStr(S.date);
    const toLoad = channels.filter(ch => !scheduleStore[`${ch.id}_${dateStr}`]);

    // Mark as loading
    toLoad.forEach(ch => { scheduleStore[`${ch.id}_${dateStr}`] = 'loading'; });

    // Load in batches of 3 (respect rate limits)
    const BATCH = 3;
    for (let i = 0; i < toLoad.length; i += BATCH) {
      const batch = toLoad.slice(i, i + BATCH);
      await Promise.all(batch.map(async ch => {
        const key = `${ch.id}_${dateStr}`;
        const result = await fetchScheduleOrLive(ch, S.date);
        scheduleStore[key] = result === null ? 'error' : result;
        // Patch the card DOM directly without full re-render
        patchCardSchedule(ch, dateStr);
      }));
      // Tiny delay between batches
      if (i + BATCH < toLoad.length) await sleep(200);
    }
  }

  function patchCardSchedule(ch, dateStr) {
    const card = document.querySelector(`.ch-card[data-chid="${ch.id}"]`);
    if (!card) return;
    const newCard = mkChannelCard(ch, 0);
    newCard.style.animation = 'none';
    card.innerHTML = newCard.innerHTML;
    // Re-bind events on patched card
    card.querySelectorAll('[data-modal]').forEach(el => el.addEventListener('click', () => openModal(ch.id)));
    card.querySelectorAll('[data-detail]').forEach(el => el.addEventListener('click', () => goDetail(ch.id)));
    bindStreamControls(card);
  }

  // ===== CHANNEL DETAIL PAGE =====
  function mkChannelPage() {
    const ch = CHANNELS.find(c => c.id === S.channelId);
    if (!ch) { S.page = 'home'; return mkHome(); }

    const page = ce('div', 'page');
    const tagClass = CAT_TAG[ch.cat] || 'tag-tv';
    const tagLabel = CAT_LABELS[ch.cat] || ch.cat;

    page.innerHTML = `
      <div class="ch-detail-hdr">
        <div class="ch-detail-inner">
          <div class="ch-detail-logo">${chLogoHTML(ch)}</div>
          <div>
            <div style="margin-bottom:6px"><a href="#" data-nav="home" style="color:var(--muted);font-size:13px">← Все каналы</a></div>
            <div class="ch-detail-name">${esc(ch.name)}</div>
            <div class="ch-detail-sub">
              <span class="tag ${CAT_TAG[ch.cat]||'tag-tv'}">${esc(tagLabel)}</span>
              <span>·</span>
              <span id="detailDateLabel">${formatDate(S.date)}</span>
              <span id="apiStatus" class="api-badge api-load">🔄 Загрузка...</span>
            </div>
          </div>
        </div>
      </div>
      ${mkDateBarHTML()}
      <div style="max-width:860px;margin:0 auto;padding:20px">
        <div class="ch-card" id="detailCard" data-chid="${ch.id}">
          <div class="loading-box" style="padding:40px"><div class="spinner"></div></div>
        </div>
      </div>`;
    return page;
  }

  async function loadChannelDetail() {
    const ch = CHANNELS.find(c => c.id === S.channelId);
    if (!ch) return;
    const dateStr = toDateStr(S.date);
    const key = `${ch.id}_${dateStr}`;
    const card = document.getElementById('detailCard');
    const status = document.getElementById('apiStatus');
    if (!card) return;

    let data = scheduleStore[key];
    if (!data || data === 'loading') {
      scheduleStore[key] = 'loading';
      data = await fetchScheduleOrLive(ch, S.date);
      scheduleStore[key] = data === null ? 'error' : data;
      data = scheduleStore[key];
    }

    if (status) {
      if (data === 'error') { status.className = 'api-badge api-err'; status.textContent = '⚠ Ошибка загрузки'; }
      else { status.className = 'api-badge api-ok'; status.textContent = `✓ ${Array.isArray(data) ? data.length : 0} передач`; }
    }

    if (!card) return;
    if (data === 'error') {
      card.innerHTML = `<div class="err-banner" style="margin:20px">⚠ Не удалось загрузить расписание. Возможно, EPG данные для этого канала временно недоступны.</div>`;
      return;
    }
    if (!Array.isArray(data) || data.length === 0) {
      card.innerHTML = `<div class="empty" style="padding:40px"><div class="ico">📅</div><h3>Нет данных</h3><p>Расписание на эту дату недоступно</p></div>`;
      return;
    }

    const liveIdx = getLiveIndex(data);
    let html = data.map((item, i) => {
      const live = isLive(item, data, i);
      const prog = live ? getProgress(item, data, i) : 0;
      return `<div class="sch-item${live?' live':''}">
        <div class="sch-time">${esc(item.time)}</div>
        <div class="sch-info">
          <div class="sch-title">${esc(item.title)}</div>
          <div class="sch-sub">${esc(item.genre||'')}${item.genre&&item.duration?' · ':''}${item.duration?item.duration+' мин':''}</div>
          ${item.desc ? `<div class="sch-sub" style="margin-top:2px;opacity:.7">${esc(item.desc.slice(0,120))}${item.desc.length>120?'…':''}</div>` : ''}
          ${live ? `<div class="prog-bar"><div class="prog-fill" style="width:${prog}%"></div></div>` : ''}
        </div>
        ${live ? `<div class="sch-badge">В ЭФИРЕ</div>` : ''}
      </div>`;
    }).join('');
    card.innerHTML = `${mkStreamPreviewHTML(ch, Boolean(streamStore[ch.id] && streamStore[ch.id] !== 'loading' && streamStore[ch.id] !== 'error'))}<div class="sch-list">${html}</div>`;
    bindStreamControls(card);

    // Scroll to live
    setTimeout(() => {
      const liveEl = card.querySelector('.sch-item.live');
      if (liveEl) liveEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }

  // ===== MODAL =====
  function openModal(chId) {
    S.modal = chId;
    const ch = CHANNELS.find(c => c.id === chId);
    const ov = ce('div', 'modal-ov');
    ov.id = 'modalOv';
    const dateStr = toDateStr(S.date);
    const data = scheduleStore[`${chId}_${dateStr}`];
    const tagClass = CAT_TAG[ch?.cat] || 'tag-tv';

    let schedHTML = '';
    if (!data || data === 'loading') {
      schedHTML = `<div class="loading-box"><div class="spinner"></div></div>`;
    } else if (data === 'error' || !Array.isArray(data) || data.length === 0) {
      schedHTML = `<div style="padding:16px;color:var(--muted);font-size:13px">Нет данных расписания</div>`;
    } else {
      const liveIdx = getLiveIndex(data);
      const slice = data.slice(Math.max(0, liveIdx - 2), liveIdx + 15);
      schedHTML = slice.map((item, i) => {
        const absIdx = Math.max(0, liveIdx - 2) + i;
        const live = isLive(item, data, absIdx);
        return `<div class="modal-row${live?' live':''}">
          <div class="modal-tm">${esc(item.time)}</div>
          <div>
            <div class="modal-show">${esc(item.title)}</div>
            <div class="modal-genre">${esc(item.genre||'')}${live?'  · <span style="color:var(--live);font-weight:700">В ЭФИРЕ</span>':''}</div>
          </div>
        </div>`;
      }).join('');
    }

    ov.innerHTML = `<div class="modal">
      <div class="modal-hdr">
        <div class="modal-t">${esc(ch?.name||'')}</div>
        <button class="modal-x" id="modalClose">✕</button>
      </div>
      <div class="modal-ch-info">
        <div style="width:42px;height:42px;border-radius:8px;background:${ch?.color||'#333'}22;display:flex;align-items:center;justify-content:center;flex-shrink:0">${ch ? chLogoHTML(ch) : ''}</div>
        <div>
          <div style="font-size:15px;font-weight:700">${esc(ch?.name||'')}</div>
          <div style="font-size:12px;color:var(--muted)">${ch?.type==='radio'?'Радиостанция':'Телеканал'} · ${formatDate(S.date)}</div>
        </div>
        <button class="btn-red" style="margin-left:auto;font-size:12px;padding:8px 14px" data-detail="${chId}">Открыть →</button>
      </div>
      <div class="modal-sched">${schedHTML}</div>
    </div>`;

    app.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('open'));

    ov.querySelector('#modalClose').addEventListener('click', closeModal);
    ov.addEventListener('click', e => { if (e.target === ov) closeModal(); });
    ov.querySelectorAll('[data-detail]').forEach(el => el.addEventListener('click', () => { closeModal(); goDetail(+el.dataset.detail); }));
  }

  function closeModal() {
    const ov = document.getElementById('modalOv');
    if (ov) { ov.classList.remove('open'); setTimeout(() => ov.remove(), 250); }
    S.modal = null;
  }

  // ===== NAVIGATION HELPERS =====
  function goDetail(chId) {
    S.channelId = chId;
    S.page = 'channel';
    window.scrollTo(0, 0);
    render();
  }

  function goNav(page) {
    S.page = page;
    S.mobMenu = false;
    window.scrollTo(0, 0);
    render();
  }

  function doSearch(q) {
    S.search = q;
    S.filter = 'all';
    S.offset = 0;
    S.page = 'home';
    window.scrollTo(0, 300);
    render();
  }

  // ===== AUTOCOMPLETE =====
  function showAc(inputEl, acEl) {
    const q = inputEl.value.trim().toLowerCase();
    if (q.length < 1) { acEl.classList.remove('open'); return; }
    const matches = CHANNELS.filter(c => c.name.toLowerCase().includes(q)).slice(0, 7);
    if (!matches.length) { acEl.classList.remove('open'); return; }
    acEl.innerHTML = matches.map(ch => `
      <div class="ac-item" data-detail="${ch.id}">
        <div class="ac-logo" style="background:${ch.color}22;color:${ch.color}">${chLogoHTML(ch)}</div>
        <div>
          <div class="ac-n">${esc(ch.name)}</div>
          <div class="ac-t">${ch.type==='radio'?'Радио':'ТВ'} · ${CAT_LABELS[ch.cat]||ch.cat}</div>
        </div>
      </div>`).join('');
    acEl.classList.add('open');
    acEl.querySelectorAll('[data-detail]').forEach(el => el.addEventListener('click', () => goDetail(+el.dataset.detail)));
  }

  // ===== FEATURES & FAQ =====
  function mkFeaturesHTML() {
    const tvN = CHANNELS.filter(c=>c.type==='tv').length;
    const rN  = CHANNELS.filter(c=>c.type==='radio').length;
    return `
      <section class="features">
        <div class="sec-hdr">
          <div class="sec-eye">Возможности</div>
          <div class="sec-t">ВСЁ В ОДНОМ МЕСТЕ</div>
          <p class="sec-d">Реальные данные EPG, мгновенный поиск и удобный интерфейс</p>
        </div>
        <div class="feat-grid">
          <div class="feat-card"><div class="feat-icon">📡</div><div class="feat-t">${tvN+rN}+ источников</div><p class="feat-d">Полный охват российских ТВ-каналов и радиостанций с реальным расписанием EPG.</p></div>
          <div class="feat-card"><div class="feat-icon">🟢</div><div class="feat-t">Живые данные EPG</div><p class="feat-d">Расписание загружается из реального EPG-провайдера. Никаких демо-данных.</p></div>
          <div class="feat-card"><div class="feat-icon">🔍</div><div class="feat-t">Умный поиск</div><p class="feat-d">Ищите каналы по названию с мгновенным автодополнением.</p></div>
          <div class="feat-card"><div class="feat-icon">📅</div><div class="feat-t">7 дней вперёд</div><p class="feat-d">Смотрите расписание на неделю вперёд и 3 дня назад.</p></div>
          <div class="feat-card"><div class="feat-icon">🔧</div><div class="feat-t">Виджет для сайта</div><p class="feat-d">Встройте программу передач на любой сайт одной строкой кода.</p></div>
          <div class="feat-card"><div class="feat-icon">📱</div><div class="feat-t">Адаптивный дизайн</div><p class="feat-d">Удобно на любом устройстве — ПК, планшет, смартфон.</p></div>
        </div>
      </section>`;
  }

  function mkFaqHTML() {
    const items = [
      ['Откуда берутся данные расписания?', 'Расписание загружается в реальном времени из epg.pw — бесплатного публичного EPG-провайдера с поддержкой тысяч каналов по всему миру.'],
      ['Как найти расписание канала?', 'Введите название в строку поиска. Автодополнение предложит совпадения. Нажмите на канал для просмотра полного расписания.'],
      ['Почему не загружается расписание?', 'Данные загружаются через публичный CORS-прокси. В редких случаях возможны временные сбои — обновите страницу или попробуйте через несколько минут.'],
      ['Есть ли радиостанции?', `Да! В базе ${CHANNELS.filter(c=>c.type==='radio').length} радиостанций с расписанием передач.`],
      ['Как встроить на свой сайт?', 'Перейдите в раздел «Виджет» — там готовый код для вставки на любой сайт.'],
    ];
    return `
      <section class="faq-s">
        <div class="sec-hdr">
          <div class="sec-eye">FAQ</div>
          <div class="sec-t">ЧАСТЫЕ ВОПРОСЫ</div>
        </div>
        <div class="faq-list">
          ${items.map(([q,a]) => `
            <div class="faq-item">
              <div class="faq-q">${q} <span class="ch">▾</span></div>
              <div class="faq-a">${a}</div>
            </div>`).join('')}
        </div>
      </section>`;
  }

  // ===== STATIC PAGES =====
  function mkStatic(title, html) {
    const page = ce('div', 'page');
    page.innerHTML = `
      <div class="static-hdr">
        <div class="static-hdr-inner">
          <div style="margin-bottom:8px"><a href="#" data-nav="home" style="color:var(--muted);font-size:13px">← На главную</a></div>
          <h1 style="font-family:var(--font-d);font-size:34px;letter-spacing:2px">${title}</h1>
        </div>
      </div>
      <div class="static-body">${html}</div>`;
    return page;
  }

  function aboutHTML() {
    return `
      <p>TV-CHECKPROGRAMM — современный агрегатор телепрограммы с реальными данными EPG. Мы показываем расписание ${CHANNELS.filter(c=>c.type==='tv').length}+ телеканалов и ${CHANNELS.filter(c=>c.type==='radio').length}+ радиостанций.</p>
      <h3>Источник данных</h3>
      <p>Расписание загружается из <strong>epg.pw</strong> — крупнейшей бесплатной базы EPG-данных с поддержкой тысяч каналов по всему миру. Данные обновляются ежедневно.</p>
      <h3>Что умеет сервис</h3>
      <ul>
        <li>Реальное расписание всех федеральных и тематических ТВ-каналов</li>
        <li>Расписание радиостанций</li>
        <li>Индикатор текущего эфира в реальном времени</li>
        <li>Поиск по названию канала</li>
        <li>Расписание на 7 дней вперёд</li>
        <li>Виджет для встраивания на сторонние сайты</li>
        <li>Адаптивный дизайн для всех устройств</li>
      </ul>`;
  }

  function docsHTML() {
    return `
      <h3>Как пользоваться</h3>
      <p><strong>1. Поиск канала</strong> — введите название в строку поиска. Автодополнение покажет совпадения.</p>
      <p><strong>2. Выбор даты</strong> — используйте ленту дат. Доступны данные за 3 прошедших и 7 следующих дней.</p>
      <p><strong>3. Фильтрация</strong> — фильтруйте по типу (ТВ/Радио) или тематике.</p>
      <p><strong>4. Полное расписание</strong> — нажмите «Полное расписание →» на карточке для детального просмотра.</p>
      <h3>Виджет</h3>
      <p>Перейдите в раздел <a href="#" data-nav="widget" style="color:var(--accent2)">Виджет</a> — готовый iframe и скрипт для встраивания на любой сайт.</p>
      <h3>Источник данных EPG</h3>
      <p>Данные: <strong>epg.pw</strong>. Прокси: <strong>secure-272717.vercel.app</strong>, <strong>secure-272717.tatnet.app</strong>, <strong>proxyvideo.vercel.app</strong>, <strong>secure-ridge-22999-537c838d4a8a.herokuapp.com</strong> с автоматическим fallback.</p>`;
  }

  function faqHTML() {
    const items = [
      ['Откуда берётся расписание?', 'Из epg.pw — бесплатного публичного провайдера EPG-данных.'],
      ['Почему не загружается расписание?', 'Возможны временные сбои CORS-прокси. Обновите страницу через 1-2 минуты.'],
      ['Могу ли я встроить расписание на свой сайт?', 'Да! В разделе «Виджет» есть готовый код для встраивания.'],
      ['Есть ли API?', 'Публичный API не предоставляется. Вы можете использовать epg.pw API напрямую.'],
      ['Как добавить отсутствующий канал?', 'Напишите нам через форму контактов.'],
    ];
    return `<div class="faq-list" style="max-width:100%">${items.map(([q,a]) => `
      <div class="faq-item">
        <div class="faq-q">${q} <span class="ch">▾</span></div>
        <div class="faq-a">${a}</div>
      </div>`).join('')}</div>`;
  }

  function policyHTML() {
    return `
      <p style="color:var(--muted);font-size:13px">Обновлено: 1 января 2025</p>
      <h3>1. Собираемые данные</h3>
      <p>Сервис не собирает персональные данные. Анонимная статистика использования не передаётся третьим лицам.</p>
      <h3>2. Cookies</h3>
      <p>Используются только технические cookies для сохранения выбранных фильтров и даты. Данные хранятся локально в браузере.</p>
      <h3>3. Сторонние сервисы</h3>
      <p>Расписание загружается с epg.pw и через внешние CORS-прокси с fallback. К этим сервисам применяются их собственные политики конфиденциальности.</p>
      <h3>4. Контакты</h3>
      <p>По вопросам: <a href="mailto:privacy@tv-checkprogramm.ru" style="color:var(--accent2)">privacy@tv-checkprogramm.ru</a></p>`;
  }

  function contactsHTML() {
    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:28px">
        ${[['📧','Email','contact@tv-checkprogramm.ru'],['💬','Telegram','@tvcheckprogramm'],['📍','Адрес','Москва, Россия']].map(([ico,l,v]) =>
          `<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;text-align:center">
            <div style="font-size:28px;margin-bottom:7px">${ico}</div>
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:4px">${l}</div>
            <div style="font-size:14px;font-weight:600">${v}</div>
          </div>`).join('')}
      </div>
      <h3>Написать нам</h3>
      <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:22px;display:grid;gap:10px">
        <input placeholder="Ваше имя" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:11px 14px;color:var(--text);font-family:var(--font-b);font-size:14px;outline:none;width:100%">
        <input type="email" placeholder="Email" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:11px 14px;color:var(--text);font-family:var(--font-b);font-size:14px;outline:none;width:100%">
        <textarea rows="4" placeholder="Сообщение..." style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:11px 14px;color:var(--text);font-family:var(--font-b);font-size:14px;outline:none;width:100%;resize:vertical"></textarea>
        <button class="btn-red" id="sendBtn" style="width:fit-content">Отправить →</button>
      </div>`;
  }

  function widgetHTML() {
    const exampleChId = 1;
    const iframeCode = `<iframe
  src="https://tv-checkprogramm.ru/widget/widget.html?channel=1&theme=dark"
  width="400" height="600"
  style="border:none;border-radius:12px"
  title="TV-CHECKPROGRAMM Widget">
</iframe>`;
    const scriptCode = `<!-- TV-CHECKPROGRAMM Widget -->
<div id="tvcheck-widget" data-channel="1" data-theme="dark"></div>
<script src="https://tv-checkprogramm.ru/widget/embed.js"><\/script>`;

    return `
      <p>Встройте расписание любого канала на свой сайт. Виджет адаптивен, поддерживает тёмную и светлую тему, и автоматически показывает текущий эфир.</p>
      <h3>Способ 1: iframe</h3>
      <p>Замените <code style="background:var(--bg3);padding:2px 6px;border-radius:4px">channel=1</code> на нужный ID канала (см. таблицу ниже).</p>
      <div class="code-block">
        <button class="code-copy" onclick="navigator.clipboard.writeText(this.parentNode.querySelector('pre').textContent);this.textContent='Скопировано!'">Копировать</button>
        <pre id="iframeCode">${esc(iframeCode)}</pre>
      </div>
      <h3 style="margin-top:24px">Способ 2: JavaScript embed</h3>
      <div class="code-block">
        <button class="code-copy" onclick="navigator.clipboard.writeText(this.parentNode.querySelector('pre').textContent);this.textContent='Скопировано!'">Копировать</button>
        <pre>${esc(scriptCode)}</pre>
      </div>
      <h3 style="margin-top:24px">Параметры виджета</h3>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="border-bottom:1px solid var(--border)">
            <th style="padding:10px;text-align:left;color:var(--muted)">Параметр</th>
            <th style="padding:10px;text-align:left;color:var(--muted)">Значения</th>
            <th style="padding:10px;text-align:left;color:var(--muted)">Описание</th>
          </tr></thead>
          <tbody>
            ${[
              ['channel','1, 2, 3...','ID канала из таблицы ниже'],
              ['theme','dark / light','Цветовая тема'],
              ['limit','5-20','Количество передач (по умолч. 8)'],
              ['lang','ru / en','Язык интерфейса'],
            ].map(([p,v,d]) => `<tr style="border-bottom:1px solid var(--border)">
              <td style="padding:10px;font-weight:700;color:var(--accent2)">${p}</td>
              <td style="padding:10px;color:var(--text)">${v}</td>
              <td style="padding:10px;color:var(--muted)">${d}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <h3 style="margin-top:24px">ID каналов</h3>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="border-bottom:1px solid var(--border)">
            <th style="padding:8px;text-align:left;color:var(--muted)">ID</th>
            <th style="padding:8px;text-align:left;color:var(--muted)">Канал</th>
            <th style="padding:8px;text-align:left;color:var(--muted)">Тип</th>
          </tr></thead>
          <tbody>
            ${CHANNELS.map(ch => `<tr style="border-bottom:1px solid var(--border)">
              <td style="padding:7px 8px;font-family:monospace;color:var(--accent2)">${ch.id}</td>
              <td style="padding:7px 8px;font-weight:600">${esc(ch.name)}</td>
              <td style="padding:7px 8px;color:var(--muted)">${ch.type==='radio'?'Радио':'ТВ'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // ===== FOOTER =====
  function mkFooter() {
    const el = ce('footer', 'footer');
    el.innerHTML = `
      <div class="footer-inner">
        <div class="footer-grid">
          <div class="footer-brand">
            <div class="logo"><div class="logo-box">📺</div><span class="logo-txt">TV-<span>CHECK</span></span></div>
            <p>Реальное расписание ${CHANNELS.filter(c=>c.type==='tv').length}+ ТВ-каналов и ${CHANNELS.filter(c=>c.type==='radio').length}+ радиостанций России. Данные EPG обновляются ежедневно.</p>
          </div>
          <div>
            <div class="ft">Телеканалы</div>
            <ul class="fl">
              <li><a href="#" data-filter="federal">Федеральные</a></li>
              <li><a href="#" data-filter="news">Новостные</a></li>
              <li><a href="#" data-filter="sport">Спортивные</a></li>
              <li><a href="#" data-filter="kids">Детские</a></li>
              <li><a href="#" data-filter="movies">Кино</a></li>
              <li><a href="#" data-filter="doc">Документальные</a></li>
            </ul>
          </div>
          <div>
            <div class="ft">Радио</div>
            <ul class="fl">
              <li><a href="#" data-filter="radio">Все станции</a></li>
              <li><a href="#" data-filter="cat:radio-music">Музыкальное</a></li>
              <li><a href="#" data-filter="cat:radio-news">Новостное</a></li>
              <li><a href="#" data-filter="cat:radio-talk">Разговорное</a></li>
            </ul>
          </div>
          <div>
            <div class="ft">Сервис</div>
            <ul class="fl">
              <li><a href="#" data-nav="about">О нас</a></li>
              <li><a href="#" data-nav="widget">Виджет</a></li>
              <li><a href="#" data-nav="docs">Документация</a></li>
              <li><a href="#" data-nav="faq">FAQ</a></li>
              <li><a href="#" data-nav="policy">Конфиденциальность</a></li>
              <li><a href="#" data-nav="contacts">Контакты</a></li>
            </ul>
          </div>
        </div>
        <div class="footer-bottom">
          <p>© 2025 TV-CHECKPROGRAMM. Данные EPG: <a href="https://epg.pw" target="_blank" rel="noopener">epg.pw</a></p>
          <div class="footer-links-bot">
            <a href="#" data-nav="policy">Конфиденциальность</a>
            <a href="#" data-nav="contacts">Контакты</a>
            <a href="#" data-nav="widget">Виджет</a>
          </div>
        </div>
      </div>`;
    return el;
  }

  // ===== BIND EVENTS =====
  function bindAll() {
    // Nav links
    document.querySelectorAll('[data-nav]').forEach(el => {
      el.addEventListener('click', e => { e.preventDefault(); goNav(el.dataset.nav); });
    });

    // Filter chips
    document.querySelectorAll('[data-c]').forEach(el => {
      el.addEventListener('click', () => {
        S.filter = el.dataset.c;
        S.search = '';
        S.offset = 0;
        S.page = 'home';
        window.scrollTo(0, 0);
        render();
      });
    });

    // Sidebar filter buttons
    document.querySelectorAll('[data-filter]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        const f = el.dataset.filter;
        if (f.startsWith('cat:')) {
          S.filter = f;
        } else {
          S.filter = f;
        }
        S.search = '';
        S.offset = 0;
        S.page = 'home';
        window.scrollTo(0, 0);
        render();
      });
    });

    // Date buttons
    document.querySelectorAll('[data-date]').forEach(el => {
      el.addEventListener('click', () => {
        S.date = parseDateBtnValue(el.dataset.date);
        S.offset = 0;
        render();
      });
    });

    // Channel modal (header click)
    document.querySelectorAll('[data-modal]').forEach(el => {
      el.addEventListener('click', () => openModal(+el.dataset.modal));
    });

    // Channel detail
    document.querySelectorAll('[data-detail]').forEach(el => {
      el.addEventListener('click', () => goDetail(+el.dataset.detail));
    });

    // Load more
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) loadMoreBtn.addEventListener('click', () => { S.offset++; render(); });

    // Stream robot controls
    bindStreamControls(document);

    // FAQ toggle
    document.querySelectorAll('.faq-q').forEach(el => {
      el.addEventListener('click', () => el.closest('.faq-item').classList.toggle('open'));
    });

    // Hero search
    const heroSearch = document.getElementById('heroSearch');
    const heroAc = document.getElementById('heroAc');
    const heroBtn = document.getElementById('heroBtn');
    if (heroSearch) {
      heroSearch.addEventListener('input', () => showAc(heroSearch, heroAc));
      heroSearch.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(heroSearch.value); });
    }
    if (heroBtn) heroBtn.addEventListener('click', () => doSearch(heroSearch?.value || ''));

    // Header search
    const hdrSearch = document.getElementById('hdrSearch');
    const hdrAc = document.getElementById('hdrAc');
    if (hdrSearch) {
      hdrSearch.addEventListener('input', () => showAc(hdrSearch, hdrAc));
      hdrSearch.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(hdrSearch.value); });
    }

    // Burger
    const burger = document.getElementById('burgerBtn');
    if (burger) burger.addEventListener('click', () => { S.mobMenu = !S.mobMenu; render(); });

    // Mobile search
    const mobSearch = document.getElementById('mobSearch');
    const mobSearchBtn = document.getElementById('mobSearchBtn');
    if (mobSearchBtn) mobSearchBtn.addEventListener('click', () => doSearch(mobSearch?.value || ''));

    // Contact send
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) sendBtn.addEventListener('click', () => toast('✅ Сообщение отправлено! Мы ответим в течение 24 часов.'));

    // Close autocomplete
    document.addEventListener('click', e => {
      if (!e.target.closest('.hdr-search') && !e.target.closest('.hero-form')) {
        document.querySelectorAll('.ac').forEach(ac => ac.classList.remove('open'));
      }
    }, { capture: false });
  }

  // ===== UTILS =====
  function ce(tag, cls) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    return el;
  }

  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function formatDate(d) {
    const DAYS = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
    const MONS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
    return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONS[d.getMonth()]}`;
  }

  function toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3200);
  }

  function parseDateBtnValue(v) {
    // Keep day stable in every client timezone (avoid ISO UTC date shifts)
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date();
    const [y, m, d] = v.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }

  function normalizeLogoUrl(value) {
    if (!value) return '';
    let url = String(value).trim();
    if (!url) return '';
    if (url.startsWith('//')) url = `https:${url}`;
    if (url.startsWith('http://')) url = `https://${url.slice(7)}`;
    return url;
  }

  function normalizeName(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[^a-zа-я0-9]+/g, ' ')
      .split(/\s+/)
      .filter(token => token && !['телеканал','канал','channel','tv','тв','hd','sd','online','live','russia','ru','rus','russian','fhd','utf','lq','hq'].includes(token))
      .join(' ')
      .trim();
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ===== CLOCK UPDATE =====
  setInterval(() => {
    // Refresh progress bars every 30s without full re-render
    document.querySelectorAll('.prog-fill').forEach(el => {
      // Progress bars are static until next render; full refresh every 5 min
    });
  }, 30000);

  // Auto-refresh every 5 minutes
  setInterval(() => {
    if (S.page === 'home') {
      loadVisibleSchedules();
    }
  }, 5 * 60 * 1000);

  // ===== BOOT =====
  render();
  hydrateStreamCatalog()
    .then(added => { if (added && S.page === 'home') render(); })
    .catch(e => console.warn('Stream catalog hydration failed:', e.message));
});
