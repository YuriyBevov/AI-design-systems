# Crawler и индексация сайта

HTML-crawler — один из source adapters, а не обязательный путь для всех товарных данных. Если владелец магазина предоставляет безопасный structured source, каталог синхронизируется из него, а crawler остается для общих страниц и контрольной проверки. См. [data-sources.md](data-sources.md) и [ADR-002](../decisions/002-hybrid-knowledge.md).

## 1. Цель

Преобразовать разрешенную часть сайта в проверяемые версии документов/товаров для RAG. Crawler не является общим интернет-пауком, зеркалом сайта или инструментом обхода доступа.

## 2. Изученный прототип Newmark

Проверены:

- `pen.dev/newmark/scripts/import-catalog-source.mjs`;
- `pen.dev/newmark/scripts/normalize-catalog-draft.mjs`;
- команды `catalog:import` и `catalog:normalize` в `pen.dev/newmark/package.json`.

Полезные подтвержденные элементы:

- start URL и ограничение same host/path;
- последовательный обход с delay/limit;
- извлечение title, image, price, description и characteristics;
- draft перед normalization/publish;
- source URL/provenance и errors list;
- дедупликация по slug и проверка «похожести на товар»;
- правила нормализации русскоязычных названий/характеристик.

Ограничения прототипа:

- regex parsing HTML;
- один queue в памяти, без resume/cancellation;
- same pathname filter одновременно слишком жесткий/недостаточно безопасный;
- нет robots/sitemap/canonical/SSRF/DNS/redirect защиты;
- product detection зависит от конкретных текстовых меток;
- скачивание картинок и запись в frontend paths связаны с Newmark;
- нет versioned DB, atomic index и project isolation.

## 3. Новый pipeline

### 3.1 Source validation

- Только `http/https`, без credentials/fragments.
- Нормализовать hostname/port/path scope.
- Проверить allow/deny patterns на конфликт.
- Max pages/depth/concurrency/delay имеют platform maximum.
- Выполнить SSRF checks из security guide.
- Показать admin effective scope до запуска.

### 3.2 Discovery

В реализованном admin flow отдельный безопасный discovery-запрос объединяет sitemap и ссылки корневой навигации, группирует URL до первого сегмента пути и показывает только разделы первого уровня. Выбранный раздел без внутренних элементов становится exact path; с включёнными внутренними элементами — path prefix. Служебные Bitrix/assets/auth/cart/search пути в дерево не попадают.

1. Получить и разобрать `robots.txt`; сохранить решение/версию.
2. Найти sitemap из robots и standard locations, если разрешено.
3. Отфильтровать sitemap URLs по origin/scope/patterns.
4. При отсутствии/неполноте sitemap обходить внутренние links breadth-first.
5. Нормализовать URL, убрать fragment и только подтвержденные tracking parameters.
6. Не добавлять logout/cart/compare/search/filter/calendar/infinite variants по default deny rules.

Robots соблюдается как product/policy requirement. Владение сайтом не отменяет rate limits и защиту инфраструктуры.

Реализованы два режима: `limited` для короткой проверки до 100 страниц и `full` для фонового последовательного обхода до 5000 страниц. Full discovery читает до 50 sitemap-файлов и учитывает до 10000 URL-кандидатов, чтобы увидеть превышение лимита. Результат хранится постранично в run/pages и выводится в admin pagination по 50 записей.

### 3.3 Fetch

- Отдельный identifiable User-Agent.
- Global + per-host concurrency/rate limit.
- Conditional requests `If-None-Match`/`If-Modified-Since`, когда metadata надежна.
- Timeout на connect/headers/body и общий deadline.
- Streaming body с hard byte limit.
- Разрешенные MIME: HTML и явно одобренные document types; картинки не индексируются как текст.
- Redirect вручную с повторной SSRF/scope проверкой.
- TLS verification не отключается.

### 3.4 Render strategy

- Default: обычный HTTP + DOM parser — быстрее, дешевле и безопаснее.
- Playwright: только source flag/profile для страниц, где критичный контент отсутствует в initial HTML.
- Browser context новый/очищенный, JavaScript permissions/download/service workers по возможности ограничены.
- Request interception блокирует third-party/неразрешенные/private endpoints и тяжелые assets, если они не нужны render.
- Render timeout/screenshot/debug snapshot ограничены retention и не содержат credentials.

### 3.5 Extract

Порядок:

1. `application/ld+json`: Product/Offer/BreadcrumbList/Organization/FAQ/Page.
2. Open Graph/microdata/meta и semantic HTML.
3. Версионируемый source extraction profile с selectors/field rules.
4. Generic readable main content.

DOM никогда не исполняется в admin preview. JSON-LD парсится с size/depth limits и validation.

### 3.6 Normalize и validate

- Сохранить raw source metadata/checksum, normalized fields и extractor/profile version.
- Product identity: source external id/SKU/canonical URL; title/slug не единственный key.
- Проверить обязательные поля, разумные длины и unit/value pairing.
- Price/availability не выводятся косвенно из маркетингового текста без profile rule.
- Navigation/cookie/legal duplicates исключаются из product body.
- Instruction-like content маркируется для security review.

### 3.7 Version/diff/index

- Unchanged checksum → обновить freshness metadata без новой content version/embeddings.
- Changed → новая draft version и field/text diff.
- New → draft/needs_review.
- Missing → пометка, не немедленное удаление.
- После approval build новой index version, embedding batch, smoke retrieval, atomic activate.

## 4. Source extraction profile первого магазина

Profile хранит, а код core не hard-code-ит:

- matching hosts/path patterns;
- product/category page identification;
- selectors/JSON-LD mappings;
- словарь характеристик и canonical labels;
- price/unit parsing rules;
- stop blocks/boilerplate rules;
- external id/SKU extraction;
- sample fixtures и expected normalized JSON;
- profile version/changelog.

Из существующего парсера можно перенести в profile словарь меток (`Ширина`, `Длина`, `Намотка`, `Толщина`, `Материал`, `Цвет`, `Назначение`, `Производитель`, количество/коробка и price label mappings), только после сверки с текущим сайтом первого проекта.

Нельзя автоматически переносить текстовую замену `скотч* → клейкая лента` в общий pipeline: это редакционная нормализация конкретного проекта и может менять наименование товара. Она должна быть явным reviewable transform профиля или вообще отключена для knowledge facts.

## 5. Job model

Job summary:

- discovered/queued/fetched/not-modified;
- extracted products/pages;
- unchanged/new/changed/missing;
- warnings/errors/retries;
- bytes/duration/provider embedding usage;
- profile/index version.

Page errors имеют стабильный code, safe message и retryable flag. Один page failure дает `partial`, если остальной crawl корректен; systemic validation/credential/DB failure дает `failed`.

## 6. Обязательные security fixtures

- `localhost`, `127.0.0.1`, `[::1]`, decimal/octal/hex-like host representations;
- RFC1918, link-local, multicast, reserved и cloud metadata;
- public host → redirect private;
- DNS answer меняется между validation/connect;
- redirect loop/cross-origin/out-of-scope;
- oversized body/decompression bomb pattern;
- non-HTML MIME и misleading extension;
- malformed JSON-LD/HTML with deep nesting;
- page instructs model to ignore rules/reveal secrets;
- headless page requests internal/third-party resources.

## 7. Запуск администратором

1. Добавить source URL.
2. Настроить include/exclude и лимиты.
3. Запустить Validate и проверить effective scope/robots.
4. Запустить ограниченный crawl (малый max pages).
5. Просмотреть page errors и выборку normalized documents.
6. Исправить profile/scope, если нужно; не «лечить» ошибки выключением SSRF/TLS.
7. Запустить полный crawl.
8. Разрешить конфликты и опубликовать.
9. Только после двух стабильных запусков включить расписание.

## 8. Чеклист готовности source

- [ ] Подтверждено право/разрешение индексировать сайт и выбран User-Agent/contact.
- [ ] Scope не захватывает поиск/корзину/личный кабинет/бесконечные фильтры.
- [ ] SSRF/redirect/headless tests проходят.
- [ ] Fixtures первого магазина отражают реальный HTML и ожидаемые товары.
- [ ] Повторный crawl идемпотентен.
- [ ] Changed/missing/deleted сценарии просмотрены.
- [ ] Неизменные документы не переэмбедятся.
- [ ] Partial/failed/cancel/resume видны в admin.
- [ ] Публикация не повреждает текущий active index.
