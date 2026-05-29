# 📺 TV-CHECKPROGRAMM

**Продакшен-сайт с реальным расписанием ТВ и Радио**

> Аналог programma-peredach.com и tv.yandex.ru с настоящими EPG-данными

---

## 🚀 Быстрый старт

```bash
# Просто откройте index.html в браузере — никаких зависимостей!
open index.html
```

Или разверните на любом хостинге (Nginx, Apache, Vercel, Netlify, GitHub Pages).

---

## 📡 Источник данных

**EPG провайдер: [epg.pw](https://epg.pw)**
- Бесплатный публичный API, без ключей
- Более 10 000 каналов по всему миру
- Ежедневное обновление данных
- Формат: JSON

**API endpoint:**
```
GET https://epg.pw/api/epg.json?channel_id=1&timezone=Europe/Moscow
```

**CORS прокси (fallback-цепочка):**
- https://secure-272717.vercel.app/
- https://secure-272717.tatnet.app/
- https://proxyvideo.vercel.app/
- https://secure-ridge-22999-537c838d4a8a.herokuapp.com/

---

## 🗂 Структура проекта

```
tv-checkprogramm/
├── index.html              # Точка входа
├── css/
│   └── style.css           # Полные стили (тёмная тема, адаптив, анимации)
├── js/
│   ├── channels.js         # База каналов с реальными epg.pw ID
│   ├── epg.js              # EPG-движок: fetch, кэш, live-детекция
│   └── main.js             # SPA-приложение, рендер, события
└── widget/
    ├── widget.html         # Встраиваемый виджет (iframe)
    └── embed.js            # JS-скрипт для встраивания
```

---

## 📺 База каналов

- Встроенный быстрый каталог: 120+ популярных каналов/радиостанций
- Автодогрузка полного каталога epg.pw (до 10 000 каналов) при старте страницы

| Категория | Каналы |
|-----------|--------|
| **Федеральные** | Первый канал, Россия 1, НТВ, Пятый, Культура, ОТР, Звезда, МИР |
| **Новости** | Россия 24, ТВ Центр, РБК ТВ, Москва 24, CNN, BBC World, Euronews, DW, France 24 |
| **Спорт** | Матч ТВ, Eurosport 1/2, Матч! Футбол 1/2/3 |
| **Развлечения** | ТНТ, СТС, РЕН ТВ, ТВ-3, Пятница!, Домашний, ЧЕ!, ТНТ4, СТС Love, Суббота! |
| **Детские** | Карусель, Disney Channel, Nickelodeon, Мульт, Бибигон |
| **Кино** | TV 1000, Наши фильмы, Кино Хит, Киноклуб, НТВ Сериал |
| **Музыка** | МУЗ-ТВ, MTV Russia, VH1 |
| **Культура** | Россия К, Спас |
| **Документальные** | Discovery, National Geographic, Animal Planet, History Channel, Discovery Science, Наука |
| **Радио** | Радио России, Маяк, Вести FM, Европа Плюс, Авторадио, Русское Радио, Наше Радио, Love Radio, HIT FM, DFM, Юмор FM, Коммерсантъ FM, Business FM, Спорт FM, Jazz Radio, Ретро FM, Радио Классика, Эхо Москвы, Monte Carlo, Радио Рекорд |

---

## ✨ Функционал

| Функция | Описание |
|---------|----------|
| 📡 Реальные EPG данные | Расписание с epg.pw, никакого демо |
| 🟢 Текущий эфир | Индикатор «В ЭФИРЕ» с прогресс-баром |
| 🔍 Поиск | С автодополнением по названию |
| 📅 7 дней вперёд | Полная навигация по датам |
| 🗂 Фильтры | ТВ/Радио, тематика, категории |
| 📋 Детальная страница | Полное суточное расписание канала |
| 🔧 Виджет | iframe + JS embed для сторонних сайтов |
| 📱 Адаптив | ПК / Планшет / Смартфон |
| ⚡ Кэш | Расписание кэшируется на 30 минут |
| 🚀 Auto-refresh | Обновление каждые 5 минут |
| 🤖 Поисковой робот | Расширяет каталог РФ/международными/нишевыми IPTV-каналами, подбирает live-поток и строит live-расписание при отсутствии EPG |
| ⚙️ Workflow-бот | GitHub Actions workflow для регулярной проверки IPTV-источников |
| ❓ FAQ / Документация | Все разделы готовы |
| 🔒 Политика | Страница конфиденциальности |
| 📧 Контакты | Форма обратной связи |

---


## 🤖 Поисковой робот и workflow-бот

Поисковой робот работает в браузере рядом с EPG и делает каталог ближе к tv.mail.ru, но шире за счёт IPTV-источников:

1. Загружает расширенную коллекцию каналов из `zabava-project`, `LIVEM3U` и fallback-плейлистов.
2. Дедуплицирует каналы с базой EPG и добавляет международные, нишевые и региональные позиции в общий поиск/фильтры.
3. Для российских/федеральных каналов сначала проверяет `zabava-project`.
4. Для международных, нишевых и не федеральных каналов сначала проверяет `LIVEM3U`.
5. Если у IPTV-канала нет классического EPG, робот строит live-расписание «Прямой эфир» на текущий день, чтобы канал не выпадал из программы передач.
6. Если канал сейчас в эфире и найден поток, карточка показывает не статичную картинку, а живой iframe-плеер `https://iptv.tatnet.app/embed.html` с прямым stream URL.

Workflow-бот уже описан в `.github/workflows/tv-workflow-bot.yml`. После подключения GitHub Actions он по cron проверяет доступность основных IPTV-источников командой:

```bash
node scripts/stream-workflow-bot.mjs
```

## 🔧 Виджет для встраивания

### Способ 1: iframe
```html
<iframe
  src="https://tv-checkprogramm.ru/widget/widget.html?channel=1&theme=dark"
  width="400" height="600"
  style="border:none;border-radius:12px">
</iframe>
```

### Способ 2: JavaScript (свой домен)
```html
<div id="tvcheck-widget" data-channel="1" data-theme="dark"></div>
<script src="https://tv-checkprogramm.ru/widget/embed.js"></script>
```

`embed.js` автоматически подставляет домен, с которого загружен скрипт.  
Для принудительного домена можно добавить `data-base-url="https://your-domain.com"`.

### Параметры
| Параметр | Значения | По умолчанию |
|----------|----------|--------------|
| `channel` | ID из таблицы выше | 1 |
| `theme` | `dark` / `light` | `dark` |
| `limit` | 5–20 | 8 |
| `lang` | `ru` / `en` | `ru` |

---

## 🛠 Деплой на хостинг

### Vercel / Netlify
```bash
# Просто перетащите папку проекта в интерфейс
# или используйте CLI:
npx vercel --prod
```

### GitHub Pages
```bash
git init
git add .
git commit -m "init"
git branch -M main
git remote add origin https://github.com/USER/tv-checkprogramm.git
git push -u origin main
# Включите Pages в настройках репозитория
```

### Nginx
```nginx
server {
    listen 80;
    server_name tv-checkprogramm.ru;
    root /var/www/tv-checkprogramm;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
    gzip on;
    gzip_types text/css application/javascript;
}
```

---

## 🔌 Замена EPG-провайдера

Для подключения другого источника данных, замените функцию `fetchSchedule` в `js/epg.js`:

```js
async function fetchSchedule(channel, date) {
  // Ваш API вместо epg.pw
  const resp = await fetch(`https://your-api.com/schedule?id=${channel.id}&date=${toDateStr(date)}`);
  const data = await resp.json();
  return parseYourData(data);
}
```

---

## 📄 Лицензия

MIT — свободное использование, модификация и коммерческое применение.


Demo Theme https://tv-programma-test-byoinktechltdco-theme.vercel.app/

---

*TV-CHECKPROGRAMM © 2025 · Данные EPG: [epg.pw](https://epg.pw)*
