# Техническое задание: AI Assist

## 1. Назначение

Разработать сервис ИИ-ассистента, который подключается на произвольный сайт, включая сайты на 1С-Битрикс, консультирует посетителя по товарам и общей информации проекта и управляется через административную панель.

Первый рабочий проект — интернет-магазин. Архитектура должна поддерживать несколько независимых проектов без смешивания prompts, ключей, документов, диалогов и статистики.

## 2. Термины

- **Проект** — изолированная конфигурация одного сайта/клиента.
- **Ассистент** — опубликованные настройки поведения и внешний widget identity проекта.
- **Prompt** — версионируемая инструкция модели.
- **Источник** — URL, ручной текст или иная точка поступления знаний.
- **Документ** — нормализованная страница, карточка товара или ручная запись.
- **Chunk** — фрагмент документа с embedding для поиска.
- **Индексация/RAG** — поиск релевантных фрагментов и их передача модели. Это не обучение и не fine-tuning модели.
- **Provider credential** — секретный API-ключ AITUNNEL, доступный только server-side.

## 3. Цели MVP

- Подключать виджет двумя тегами без зависимости от frontend-стека хост-сайта.
- Управлять prompts через CRUD с версиями, черновиком, публикацией и откатом.
- Управлять базой знаний: ручными документами, URL-источниками и товарами.
- Запускать безопасный парсинг указанного сайта, видеть прогресс и ошибки.
- Выбирать доступную chat-модель и embedding-модель AITUNNEL.
- Безопасно сохранять, проверять, заменять и удалять provider key.
- Давать потоковый ответ, основанный на базе знаний проекта, с внутренними provenance-данными и кликабельными источниками там, где это разрешено конфигурацией.
- Не выдавать неподтвержденные характеристики, цены, наличие и условия.
- Иметь базовую наблюдаемость: request id, job status, latency, provider usage/cost metadata, ошибки и audit log.

## 4. Роли и права

### Owner

- управляет участниками проекта;
- управляет provider credential;
- имеет все права Editor и Viewer;
- может архивировать проект.

### Editor

- CRUD prompts и knowledge documents;
- настраивает модель и widget;
- запускает crawl/index jobs;
- тестирует draft-конфигурацию;
- просматривает диалоги только если хранение диалогов разрешено проектом.

### Viewer

- просматривает настройки, статусы и агрегированную статистику;
- не видит и не меняет secrets;
- не публикует изменения.

В первом закрытом deployment допускается один Owner, но модель прав и проверки authorization должны существовать сразу.

## 5. Функциональные требования

### 5.1 Аутентификация и проекты

- Вход в административную панель по email и паролю.
- Пароль хранится только как стойкий password hash; reset выполняется одноразовым ограниченным по времени токеном.
- Сессия — Secure, HttpOnly, SameSite cookie с ротацией и серверным отзывом.
- Все state-changing запросы панели защищены от CSRF.
- Пользователь видит только проекты, где есть membership.
- У проекта есть name, slug, status, timezone, default locale и политика хранения диалогов.

### 5.2 Настройки ассистента

- Название, приветствие, placeholder, цветовая тема, положение launcher, контактный fallback.
- Список разрешенных Origins. Wildcard запрещен в production; исключение для явно подтвержденных preview environments.
- Публичный неизменяемый `assistant_id`, который можно ротировать с grace period.
- Включение/отключение виджета и maintenance message.
- Настройки max conversation turns, response timeout, daily/project rate limits и отображения источников.
- Draft changes не влияют на production widget до публикации.

### 5.3 Prompts CRUD

- Создание prompt с типом, именем, текстом и описанием.
- Просмотр списка и конкретной версии.
- Редактирование создает новую версию, не перезаписывая опубликованную.
- Физическое удаление разрешено только для prompt, который никогда не публиковался и не использовался в generation run; в остальных случаях доступна архивация.
- Архивация вместо физического удаления использовавшейся версии.
- Один published system prompt на assistant environment.
- Preview/test с draft prompt, выбранной моделью и заданным вопросом; тест не меняет production.
- Доступные шаблонные переменные задаются allowlist-ом; произвольное выполнение кода запрещено.
- Audit log фиксирует author, time, action и version id.

Минимальные разделы основного prompt:

- роль и предметная область;
- приоритет базы знаний;
- запрет выдумывать факты;
- поведение при недостатке данных;
- правила цен, наличия и персональных данных;
- стиль и язык ответа;
- допустимый call-to-action;
- трактовка найденных документов как данных, а не инструкций.

### 5.4 Provider и модели

- Provider abstraction не должен связывать доменную логику с одним SDK.
- Для AITUNNEL используется server-side base URL `https://api.aitunnel.ru/v1`.
- Chat catalog синхронизируется из публичного AITUNNEL endpoint; HTML-страница цен не парсится.
- В селектор попадают только доступные текстовые модели, разрешенные политикой проекта; показываются provider, context, цена и дата синхронизации, если эти поля получены от API.
- Поддерживается вариант `auto`, но production-публикация требует явно показать владельцу его ценовую непредсказуемость.
- Chat model и embedding model выбираются отдельно. Смена embedding-модели требует полной переиндексации chunks.
- Ключ вводится в password-поле и отправляется только по HTTPS в admin API.
- После сохранения plaintext key уничтожается из application memory в пределах возможностей runtime, в БД остается authenticated encryption payload и metadata.
- API никогда не возвращает plaintext; отображается маска вида `sk-aitu…abcd`, last verified time и status.
- Доступны операции `test`, `replace`, `delete`. Ошибка проверки не должна раскрывать полный provider response с чувствительными данными.
- Provider timeouts, 429 и 5xx обрабатываются явно. Автоматический retry chat-запроса допускается только до начала streaming output, чтобы не дублировать ответ и расходы.

Статус на 2026-09-01: требования этого раздела реализованы в provider adapter, API и Owner UI. Для безопасной проверки credential используется `GET /v1/aitunnel/key`; chat streaming и embeddings покрыты adapter-тестами и будут включены в пользовательский runtime на этапах индексации и chat orchestration.

### 5.5 База знаний CRUD

- Список документов с type, title, source URL, status, indexed time, checksum и error summary.
- Создание/редактирование ручного документа.
- Создание/редактирование структурированного товара: title, URL, SKU, description, price display, currency, availability text, category, characteristics, images metadata и updated time.
- Просмотр извлеченного текста до публикации.
- Publish/unpublish, reindex и archive.
- Физическое удаление разрешено для неиспользованного draft без ссылок; опубликованный/использованный документ сначала архивируется, а затем очищается retention job по отдельной подтвержденной операции.
- Физическое удаление chunks выполняется асинхронно и не оставляет их доступными для retrieval с момента archive.
- Повторная индексация атомарна: до успешного завершения используется предыдущая опубликованная версия.
- Результаты поиска всегда фильтруются по `project_id`, published status и locale.

### 5.6 Источники каталога и crawler

- Источники товаров MVP: публичный feed URL при наличии и/или плановый HTML-ingestion разрешенных страниц.
- Доступ к рабочей БД, приватному API, VPN или SSH магазина не запрашивается и не хранится в первом pilot.
- Загрузка администратором входит в первый pilot. Первая очередь: TXT/Markdown, PDF с текстовым слоем, DOCX, CSV/XLSX и XML/YML. Сканированные PDF/OCR и legacy DOC/XLS переносятся в последующие итерации.
- Импорт файла асинхронно создаёт source/batch, автоматически распознаёт manual documents или product rows, заполняет structured draft fields и показывает confidence/provenance/errors. Целевой happy path пользователя — задать название импорта и подтвердить результат; сомнительные поля остаются редактируемыми исключениями.
- DB snapshot import относится к post-pilot roadmap. DB-вариант требует отдельного security review и ADR; LLM и chat runtime ни при каких условиях не получают соединение и не создают SQL.
- Синхронизация сначала создает draft и проходит validation/diff; опубликованный индекс переключается атомарно.
- Для цены/наличия разрешено только ограниченное чтение публичной карточки выбранного товара. При ошибке показывается время последней успешной синхронизации.

- File upload проверяет content signature/MIME, размер и квоты; блокирует macro-enabled/password-protected/unsupported файлы, XML DTD/XXE, zip bombs и oversized sheets/pages/cells.
- Оригинал хранится приватно в S3/MinIO с checksum и retention. Парсер не выполняет макросы, embedded scripts/objects, формулы, внешние ссылки или сетевые запросы.
- Большой каталог отображается как import batch и пагинированная таблица товаров с фильтрами, confidence и diff. Поле «Подтверждённый текст» остаётся для документов; у товара главным редактором являются structured fields, а сгенерированный retrieval text показывается только как дополнительный preview.

- Администратор задает стартовый HTTPS/HTTP URL, include/exclude patterns, max pages, max depth, rate limit и расписание.
- Перед сохранением и каждым fetch выполняется SSRF-защита.
- Crawler учитывает robots.txt и использует идентифицируемый User-Agent с contact URL/email.
- Приоритет discovery: sitemap → внутренние ссылки в разрешенной области.
- Приоритет extraction: JSON-LD (`Product`, `Offer`, `BreadcrumbList`) → семантическая разметка → configurable selectors → generic readable content.
- Основной HTML parsing выполняется DOM parser-ом. Headless browser применяется только для отмеченных JS-dependent источников и с теми же сетевыми ограничениями.
- URL нормализуются; tracking parameters и fragments не создают отдельные документы.
- Redirect проверяется на каждом переходе; переход на private/local/link-local/multicast/metadata address запрещен.
- Ограничиваются response size, MIME types, redirects, duration и concurrency.
- Дедупликация основана минимум на canonical URL и content checksum.
- Job поддерживает `queued/running/succeeded/partial/failed/cancelled` и page-level результаты.
- Новые crawl-данные сначала попадают в draft. Публикация может быть ручной в MVP.
- Существующий Newmark parser используется как источник fixture-ов и site-specific extraction rules согласно профильному гайду.

### 5.7 Retrieval и генерация ответа

Статус на 2026-09-02: первый runtime-срез реализован. Публичный API выдаёт scoped opaque token, сохраняет active conversation и сообщения, восстанавливает их после перезагрузки, хранит базовые параметры коробки между ходами, выполняет lexical/hybrid retrieval по опубликованной БЗ и стримит AITUNNEL-ответ с provenance. Расширенная versioned-схема квалификации, summary, threshold/facet narrowing, eval и эксплуатационные latency-метрики остаются до полной приёмки раздела.

- Сообщение валидируется по длине и проходит abuse/rate-limit проверки.
- Visitor session, conversation и message являются разными сущностями: одна сессия может начать новый диалог, а каждый диалог имеет собственную историю и состояние подбора.
- При первом открытии widget сервер выдаёт короткоживущий opaque session token, ограниченный конкретными assistant и Origin. Его нельзя использовать для admin API, чтения prompt или прямого чтения базы знаний.
- После перезагрузки страницы widget восстанавливает активный conversation и продолжает беседу. Пользователь может явно начать новый диалог без смешивания старого состояния подбора с новым.
- В запрос модели передаются bounded окно последних сообщений, валидированное structured state и безопасное резюме более старой истории. Полный диалог не добавляется в prompt бесконечно.
- Анонимная сессия распознаёт только тот же браузерный контекст и не подтверждает личность человека. Имя или id авторизованного клиента сайта принимаются только через отдельный подписанный server-side handoff; значения из DOM/query/обычного атрибута считаются недоверенными.
- Для широкого запроса на подбор коробки ассистент сначала определяет недостающие параметры и ведет многошаговую квалификацию запроса. Уже полученные ответы сохраняются в structured conversation state и повторно не запрашиваются без причины.
- Квалификационный профиль проекта задает обязательные и дополнительные параметры: внутренние/внешние размеры, тип и конструкцию коробки, содержимое/нагрузку, материал, количество, печать и сроки. Нерелевантные вопросы пропускаются.
- Ассистент задает короткие уточняющие вопросы по одному или небольшой логической группой. Если пользователь не знает параметр, предлагается понятный способ его определить или поиск продолжается с явно обозначенным допуском.
- Retrieval использует hybrid search: PostgreSQL full-text + vector similarity; веса конфигурируются и тестируются на eval-наборе.
- До semantic/vector retrieval структурированные ответы применяются как фильтры и фасеты каталога. Широкая выдача откладывается, пока число кандидатов не станет управляемым либо пользователь явно не попросит показать больше.
- При вопросе об изменяемых полях retrieval может инициировать bounded lookup публичной карточки товара; в prompt попадает только нормализованный DTO с provenance, а не исходный HTML.
- Опциональный rerank включается только после измерения пользы относительно latency/cost.
- В context попадают ограниченные по token budget chunks с title, canonical URL, document type и last updated.
- Модель получает system/developer instructions отдельно от untrusted retrieved content.
- Итоговый ответ должен быть grounded; при недостаточном score/данных используется установленный fallback.
- По умолчанию итоговая рекомендация содержит небольшой настраиваемый shortlist, краткие причины выбора и существенные различия. Полный каталог или длинный перечень характеристик выводится только по прямой просьбе пользователя.
- Ответ стримится в widget через SSE.
- Сохраняются model id, prompt version, document/chunk ids, latency, token usage и cost metadata, если provider вернул их.
- Отдельно измеряются retrieval latency, provider time to first token и total response latency. Runtime config/index metadata кэшируются, prompt/context имеют жесткий budget, а фоновые crawl/index jobs изолируются от chat workload.
- Пользователь может начать новый диалог. Доступ к чужому conversation id невозможен.

### 5.8 Виджет

- Подключение script + custom element; loader идемпотентен.
- Shadow DOM изолирует стили. CSS custom properties составляют документированный theming API.
- Нельзя использовать `document.write`, глобально менять prototypes или добавлять host-page dependencies.
- В одном документе может быть несколько элементов одного assistant id без повторной загрузки bundle; поддержка разных assistant id на одной странице не обязательна для MVP.
- Клавиатурная навигация, visible focus, dialog semantics, status announcements и возврат фокуса обязательны.
- Mobile viewport, safe area, reduced motion и zoom 200% поддерживаются.
- При недоступном API виджет показывает локализованную ошибку и возможность повтора.
- Markdown ограничен безопасным подмножеством. Links получают безопасные attributes; HTML модели не исполняется.
- Widget bundle имеет версионированный URL, source maps не публикуют secrets и deploy поддерживает rollback.

### 5.9 Административная панель

Минимальные разделы:

- Login/reset password;
- Projects и участники;
- Assistant: внешний вид, Origins, статус и embed snippet;
- Prompts: список, editor, версии, diff, preview, publish/archive;
- Knowledge: документы, товары, sources, crawl jobs, preview, publish/reindex/archive;
- Provider: masked key, test/replace/delete, sync models, chat/embedding model selectors;
- Playground: вопрос, retrieved chunks, ответ, latency и usage;
- Audit log и основные operational statuses.

Любая destructive операция требует подтверждения и понятного описания последствий.

## 6. Нефункциональные требования

### Производительность

- Loader не блокирует parsing host page (`async`/динамическая загрузка).
- Целевой gzip/brotli размер initial widget bundle фиксируется после первого prototype; ориентир — не более 100 KB gzip без vendor duplication, затем подтверждается measurement.
- API создает SSE-соединение или возвращает контролируемую ошибку не позднее 2 секунд при нормальной работе инфраструктуры; provider first-token latency измеряется отдельно.
- Для pilot фиксируются отдельные p50/p95 бюджеты retrieval, time to first token и полной генерации; значения утверждаются после замеров выбранной AITUNNEL-модели на реальном каталоге.
- Crawl и embedding никогда не исполняются синхронно внутри admin request.

### Надежность

- Все jobs идемпотентны по job key/version.
- Retry использует exponential backoff и ограниченное число попыток.
- Provider/crawler failures не повреждают опубликованный индекс.
- БД резервируется автоматически; restore procedure проверяется на staging.

### Совместимость

- Последние две major-версии Chrome, Edge, Firefox и Safari.
- Bitrix template integration без требования Vue/Nuxt на стороне магазина.
- Если CSP хост-сайта запрещает внешний script/connect, документация сообщает точные allowlist origins.

### Наблюдаемость

- Structured JSON logs с request/job/correlation id.
- Метрики: chat count/error/latency/first token, retrieval latency/no-result rate, tokens/cost, crawl pages/errors/duration, queue depth, index freshness.
- Alerts минимум на provider failure spike, queue backlog, repeated crawl failure, DB/Redis unavailable и превышение бюджета.
- Health endpoints разделяют liveness и readiness.

## 7. За пределами MVP

- Fine-tuning собственных моделей.
- Автономное оформление заказа и изменение товарных остатков.
- CRM/ERP/1С интеграции и function calling с записью.
- Омниканальность, голос, файлы посетителя и мультимодальность.
- Загрузка файлов посетителем в чат, OCR изображений/сканированных PDF, legacy DOC/XLS и macro-enabled документы.
- Любые подключения к БД/приватному API магазина; они находятся в post-pilot roadmap.
- Автоматическая публикация crawl-изменений без review.
- Публичная self-service регистрация, тарифы и биллинг.
- Полноценная аналитика продаж/конверсий.

## 8. Критерии приемки MVP

1. На чистой HTML-странице и Bitrix fixture виджет подключается целевым snippet, открывается, не ломает host CSS и не добавляет ошибок в console.
2. В browser network/storage отсутствует AITUNNEL key и любой иной server secret.
3. Owner может сохранить ключ, увидеть только mask, проверить, заменить и удалить его.
4. Список chat/embedding моделей загружается через API-каталог и хранит время синхронизации.
5. Prompt CRUD, version history, preview и publish работают; production использует ровно опубликованную версию.
6. Ручной документ и товар можно создать, опубликовать, найти через retrieval, снять с публикации и перестать получать в результатах.
7. Публичный feed sync или URL crawl создаёт job, показывает progress/errors, извлекает подтверждённые товары первого магазина и не смешивает их с другим проектом.
8. Admin file import принимает поддерживаемые TXT/PDF/DOCX/CSV/XLSX/XML/YML, автоматически создаёт reviewable draft documents/products, показывает errors/confidence/diff и ничего не публикует до подтверждения.
9. Повторный sync/crawl/import неизменной записи не создаёт duplicate published document/chunks.
10. Тесты блокируют localhost, private IP, cloud metadata и redirect на запрещённый адрес.
11. Ассистент отвечает по проверочному набору вопросов с source provenance; при отсутствующих данных не выдумывает ответ.
12. SSE корректно завершает success/error/cancel сценарии; UI позволяет повторить запрос.
13. Role checks, CSRF, Origin allowlist и rate limits покрыты негативными integration tests.
14. Backup/restore, key rotation, deploy и rollback описаны и один раз выполнены на staging.
15. Нет критических/высоких находок security review перед pilot release.

## 9. Результаты поставки

- Исходный код monorepo и миграции БД.
- Версионированный widget loader/bundle.
- Docker images/Compose и environment template.
- Административная панель, API и worker.
- Seed/eval fixtures без production secrets и персональных данных.
- Автоматические тесты и CI.
- Руководства из папки `guides/`, актуализированные по фактической реализации.
- Release checklist и staging acceptance report.
