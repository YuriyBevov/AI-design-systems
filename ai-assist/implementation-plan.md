# Пошаговый план реализации

План построен по вертикальным срезам. Каждый этап заканчивается работающим, проверяемым результатом; переход к следующему не отменяет устранение дефектов exit criterion текущего этапа.

## Этап 0. Спецификация и границы — выполнен

### Результат

- проверен существующий парсер Newmark;
- выбран базовый стек и оформлен ADR;
- определены MVP, non-goals, архитектура, data model и API draft;
- подготовлены security, ingestion, prompt, widget, testing и operations guides;
- зафиксированы критерии приемки.

### Exit criterion

Владелец проекта подтверждает MVP и отвечает на блокирующие вопросы из `agent-suggestions.md` перед production-интеграциями.

## Этап 1. Monorepo и локальная инфраструктура — выполнен

### Работы

1. Инициализировать pnpm workspace и закрепить Node LTS/package manager.
2. Создать `apps/control-panel`, `apps/worker`, `apps/widget` и shared packages из `architecture.md`.
3. Настроить TypeScript strict, ESLint, formatter, unit test runner и environment validation.
4. Поднять PostgreSQL + pgvector, Redis и MinIO через Docker Compose.
5. Добавить migrations, seed development user/project и команды `dev`, `build`, `lint`, `typecheck`, `test`.
6. Настроить CI без production secrets.

### Проверки

- чистый clone запускается по development guide;
- все packages собираются и typecheck проходят;
- migration up и повторный идемпотентный seed проверены на локальной БД; destructive down для production не предоставляется;
- healthchecks PostgreSQL/Redis/MinIO работают.

### Exit criterion

Одна документированная команда поднимает систему, панель показывает health page, worker принимает тестовую job.

## Этап 2. Аутентификация, проекты и audit — в работе

Базовый вертикальный срез реализован 2026-09-01: Argon2id, opaque sessions, CSRF/Origin validation, login rate limit, роли и `ProjectScope`, настройки проекта, redacted audit и защищённая Nuxt-панель. До завершения всего этапа остаются password reset с каналом доставки, политика session rotation/cleanup и интеграционные fixtures с отдельным вторым tenant.

### Работы

1. Реализовать users, sessions, projects, memberships и role policies.
2. Добавить login/logout/reset flow, password hashing, session rotation и CSRF.
3. Создать project switcher и базовые settings.
4. Ввести `ProjectScope` в repository/domain API.
5. Добавить audit events и redaction middleware.

### Проверки

- Viewer/Editor/Owner permission matrix;
- cross-project IDOR negative tests;
- CSRF/session expiration/reset token tests;
- audit не содержит password/token/cookie.

### Exit criterion

Owner входит и управляет проектом; пользователь другого проекта не может прочитать/изменить ресурс даже по известному UUID.

## Этап 3. AITUNNEL provider и secrets — реализован

Вертикальный срез реализован 2026-09-01: provider adapter, проверка ключа через server-side API AITUNNEL, AES-256-GCM credential envelope, key versions, mask/status/verification metadata, публичный каталог моделей, модельные настройки и Owner UI. Реальный публичный каталог и mock credential flow проверены сквозными smoke-тестами. Приемка с настоящим provider key выполняется только новым ключом, который ранее нигде не публиковался.

### Работы

1. Реализовать provider interface и AITUNNEL adapter.
2. Добавить encrypted credential storage, mask, test/replace/delete и key-version metadata.
3. Синхронизировать public model catalog; отделить chat и embedding capabilities.
4. Добавить модельные настройки проекта и compatibility validation.
5. Реализовать mocked streaming client, error mapping, timeout и usage metadata.

### Проверки

- ciphertext отличается при сохранении одинакового ключа;
- API/логи/browser не раскрывают plaintext;
- 401/429/5xx/timeout/malformed stream обработаны;
- model removed/disabled не ломает опубликованную конфигурацию молча.

### Exit criterion

Owner безопасно сохраняет ключ, видит mask/status, синхронизирует каталог и выполняет server-side test request.

## Этап 4. Prompts и публикация конфигурации — в работе

Три вертикальных среза реализованы 2026-09-02: prompt CRUD, immutable revisions, явный allowlist переменных, optimistic version, publication chain и rollback; assistant config revisions, exact Origins, редактор настроек и полный prompt/config/model runtime snapshot; затем model preview выбранной сохранённой revision с draft-конфигурацией, streaming AITUNNEL, диагностикой, rate limit и безопасным аудитом. Публикация prompt и конфигурации атомарно переключает production pointer и не изменяет прошлые snapshots. До завершения этапа остаются визуальное diff-представление и пакетный eval; knowledge-aware preview входит в этап 5 вместе с единым retrieval pipeline.

### Работы

1. Реализовать prompt, revision, publication и archive.
2. Добавить editor, allowlisted variables, versions/diff и audit.
3. Создать assistant settings, origins и immutable public id.
4. Реализовать preview, использующий сохранённую draft revision без production publication. Готово: preview использует опубликованные ручные sources этапа 5 и не меняет production.
5. Добавить rollback как новую publication.

### Проверки

- конкурентное редактирование/optimistic lock;
- опубликованная revision не изменяется;
- invalid/unknown template variable блокирует publish;
- preview и production выбирают разные revision ожидаемо.

### Exit criterion

Editor проходит полный CRUD/publish/rollback, а runtime resolver детерминированно возвращает опубликованную конфигурацию.

## Этап 5. Ручная база знаний и retrieval — в работе

Первый вертикальный срез реализован 2026-09-02: ручные документы/товары, immutable versions, optimistic locking, publish/unpublish/archive/delete, bounded chunking и tenant/locale-scoped lexical retrieval с provenance в model preview. Второй срез добавил BullMQ embeddings, versioned pgvector index, атомарную активацию, контроль fingerprint/model/dimension и hybrid retrieval с lexical fallback. Unpublish исключает материал уже из следующего запроса независимо от свежести векторной версии; retrieved content передаётся модели как экранированный недоверенный контекст. До exit criterion остаются threshold/diversity/token budget, отдельный playground и pilot eval set.

### Работы

1. Реализовать documents, versions, products, chunks и index versions.
2. Добавить manual text/product CRUD, preview, publish/unpublish/archive.
3. ✅ Реализовать chunking и batched embeddings.
4. ✅ Реализовать project-scoped hybrid search и source provenance.
5. Подготовить небольшой pilot eval set: вопросы, ожидаемые документы и допустимые ответы/fallback.

### Проверки

- tenant isolation в SQL/vector retrieval;
- unpublish немедленно исключает документ;
- atomic index switch сохраняет прежнюю версию при ошибке;
- повторная индексация не создает доступные дубликаты;
- retrieval quality прогоняется на eval set.

### Exit criterion

Playground показывает релевантные chunks ручных документов/товаров с provenance и измеренными scores.

## Этап 6. Источники данных и импорт первого интернет-магазина

Первый URL-crawl срез реализован 2026-09-02: CRUD публичного URL-источника, versioned настройки scope/лимитов, BullMQ runs с page-level результатами, DNS-pinned SSRF-safe HTTP(S), redirects/bytes/MIME/timeouts, robots/sitemap discovery, DOM/JSON-LD/microdata/generic extraction, профиль `gofroprodpak-v1`, идемпотентные draft versions и пакетное ручное подтверждение с запуском индексации. Перед созданием источника панель объединяет sitemap и физическую навигацию в дерево разделов первого уровня; каждый раздел сохраняется как точный путь либо рекурсивный префикс. Реализованы быстрый режим до 100 страниц и полный фоновый режим до 5000 страниц, прогресс, предупреждение о достигнутом лимите, pagination результатов и публикация выбранных строк/всего запуска. Ограниченный live smoke первого магазина подтвердил discovery, full-mode worker path, обе массовые publication-команды и `unchanged` на повторном обходе. Feed/file adapters, field-level diff/conflicts, missing detection, расписание и bounded fresh lookup ещё не реализованы.

### Работы

1. Реализовать общий source/import CRUD для публичных URL/feed и admin files, jobs и progress.
2. Синхронизировать базовый catalog source через HTML первого магазина и публичный feed URL, если он доступен.
3. Создать SSRF-safe fetcher, robots/sitemap discovery, scope/canonical/dedupe для карточек, категорий и общих страниц.
4. Добавить JSON-LD, semantic и generic extractors.
5. Перенести правила из Newmark parser в изолированный extraction profile и fixtures.
6. Добавить file upload в закрытое object storage и bounded parsers TXT/Markdown, text PDF, DOCX, CSV/XLSX, XML/YML.
7. Добавить AI-assisted classification/mapping в structured draft documents/products с provenance/confidence; provider output проходит schema validation и не публикуется автоматически.
8. Добавить каталоговый import UI: batch summary, errors, row review и bulk confirmation без гигантского textarea. Выбор строк, массовая публикация и пагинация реализованы; фильтры и field-level conflicts остаются следующим расширением.
9. Добавить review/publish flow, source conflict reporting и re-sync/import diff.
10. Добавить расписание и bounded lookup публичной карточки после ручного успешного прогона.

### Проверки

- redirect/DNS rebinding/private/metadata test matrix;
- timeout, oversized response, wrong MIME, redirect loop;
- robots policy и rate limit;
- fixture regression для товаров первого магазина;
- file signature/MIME mismatch, macros/password, zip/XML bomb, oversized PDF/sheet/cell и parser timeout;
- AI mapping schema/confidence, prompt-injection fixture, duplicate row и cross-tenant upload/import isolation;
- административный API отклоняет `mysql` и `api`; `file` принимается только через защищённый upload/import flow;
- live lookup принимает только нормализованный SKU/external id, читает разрешенную публичную карточку и соблюдает timeout;
- повторный crawl, changed/deleted/new page scenarios.

### Exit criterion

Из публичного URL/feed или поддерживаемого файла система воспроизводимо получает набор товаров/общих документов, показывает provenance/conflicts/errors и индексирует только одобренные данные без доступа к инфраструктуре клиента. Для корректного файла нормальный путь администратора ограничен названием импорта и подтверждением результата.

## Этап 7. Chat orchestration и grounding

Статус первого вертикального среза на 2026-09-02: реализованы пункты 1, базовая часть 2/4/5/8/10/11 и часть этапа 8 — публичный session/config API, persisted conversation/messages/qualification state, bounded history, lexical/hybrid RAG, server-only published prompt/model/credential, SSE, provenance, timeout/cancel, rate limits и рабочий Vue Custom Element. До exit criterion остаются versioned расширенный профиль параметров, summary старой истории, threshold/facets, latency dashboard, eval/prompt-injection набор и браузерная матрица.

### Работы

1. Реализовать раздельные модели visitor session, conversation и message с retention policy. Анонимная widget-сессия получает короткоживущий opaque token, scoped на assistant/origin, и восстанавливает активный диалог после перезагрузки страницы без доступа к admin API.
2. Добавить безопасное продолжение контекста: ограниченное окно последних сообщений, структурированное состояние подбора и версионируемое резюме старой части беседы. Полная история не должна бесконтрольно увеличивать prompt и latency.
3. Предусмотреть опциональную идентификацию авторизованного клиента сайта через подписанный server-side handoff. Неподписанные name/email/user id из HTML, URL или JavaScript не считаются подтверждённой личностью; анонимная сессия обеспечивает непрерывность, но не устанавливает реальную личность пользователя.
4. Собрать prompt pipeline с отдельным untrusted RAG context.
5. Реализовать конфигурируемый сценарий квалификации запроса для подбора коробок: сохранять уже известные параметры, задавать короткие уточняющие вопросы по одному или небольшой группой и не запускать широкую товарную выдачу, пока запрос нельзя сузить до полезного набора кандидатов.
6. Добавить structured slots для размеров, типа/конструкции коробки, содержимого и нагрузки, материала, количества, печати и сроков. Обязательные и дополнительные поля задаются versioned-конфигурацией проекта, а не зашиваются только в свободный prompt.
7. Ограничить итоговую рекомендацию несколькими наиболее подходящими товарами с кратким объяснением совпадений и различий. Полный каталог и длинное полотно характеристик не выводятся без прямой просьбы пользователя.
8. Добавить retrieval threshold, token budget, facet/filter narrowing, fallback и citations.
9. Уменьшить время ответа: измерять retrieval latency, time to first token и полную длительность; кэшировать опубликованную runtime-конфигурацию и безопасные справочные данные, ограничивать retrieval/rerank budget и не блокировать chat фоновыми crawl/index jobs.
10. Реализовать streaming, cancel, timeout и usage/cost collection.
11. Добавить abuse/content limits; moderation — feature flag после product decision.
12. Прогнать answer eval и ручной prompt-injection набор.

### Проверки

- no-result/low-score behavior;
- широкий запрос не создает массовую выдачу: агент сначала собирает недостающие параметры и учитывает ответы следующих сообщений;
- после достаточного уточнения shortlist ограничен заданным числом товаров, а найденные ограничения подтверждены пользователю;
- противоречивые размеры/условия уточняются, а не исправляются моделью молча;
- document prompt injection не меняет system policy;
- price/availability missing-data cases;
- stream success/cancel/error/disconnect;
- p50/p95 retrieval, time to first token и total response latency измеряются отдельно; crawl/index нагрузка не нарушает согласованный chat latency budget;
- перезагрузка страницы восстанавливает активный диалог и собранные параметры подбора, а явная команда «Новый диалог» начинает чистый conversation;
- истекший/отозванный/подменённый token, другой assistant/origin и чужой conversation id не дают доступа к истории;
- параллельные вкладки и повторная отправка запроса не создают дубликаты сообщений;
- после сокращения старой истории резюме сохраняет подтверждённые ограничения, но не превращает предположения модели в факты;
- conversation/session isolation и retention purge удаляют содержимое и связанные идентификаторы согласно политике проекта.

### Exit criterion

Playground дает grounded ответы на согласованный eval set, показывает использованные источники, проводит пользователя через проверяемый сценарий уточнения параметров коробки, формирует компактный shortlist и корректно отказывает при отсутствии фактов. Widget-сессия продолжает активный диалог после перезагрузки, не смешивает посетителей/проекты и соблюдает retention policy. Метрики latency соответствуют согласованному pilot-бюджету.

## Этап 8. Встраиваемый widget и Bitrix

### Работы

1. Собрать idempotent loader и `<ai-assist>` custom element.
2. Реализовать session/config bootstrap и fetch streaming.
3. Сделать launcher/dialog/messages/input/retry/new conversation.
4. Добавить Shadow DOM styling, CSS variables, locales и accessibility.
5. Реализовать Origin allowlist, public token и widget rate limits.
6. Подготовить plain HTML и Bitrix integration fixtures/инструкции.

### Проверки

- host CSS collision fixture и два loader executions;
- keyboard/screen-reader basics, mobile, reduced motion, 200% zoom;
- CSP allowlist documentation;
- Chrome/Edge/Firefox/Safari matrix;
- bundle size budget и slow network behavior.

### Exit criterion

Один snippet подключает production-like widget на чистую страницу и Bitrix fixture; секретов и конфликтов с host page нет.

## Этап 9. Полная административная панель

### Работы

1. Завершить IA/screens из ТЗ поверх реализованных domain flows.
2. Добавить crawl dashboard, document preview/diff, prompt diff и playground diagnostics.
3. Добавить embed snippet/CSP instructions и copy action.
4. Добавить loading/empty/error/permission states и destructive confirmations.
5. Провести accessibility и responsive review панели.

### Exit criterion

Owner выполняет весь pilot workflow без прямого API/SQL: ключ → модель → prompt → crawl/review → publish → embed → диагностика.

## Этап 10. Hardening, staging и pilot

### Работы

1. Настроить production images, reverse proxy/TLS, secret manager и migrations strategy.
2. Добавить metrics/dashboards/alerts, log retention и cost/budget alerts.
3. Проверить backup/restore, key rotation, deploy/rollback и incident runbook.
4. Выполнить dependency/container scans и application security review.
5. Нагрузочно проверить SSE concurrency, retrieval и worker throughput.
6. Развернуть staging, пройти acceptance checklist, затем ограниченный pilot.

### Exit criterion

Все критерии приемки `technical-task.md` подтверждены staging report; нет открытых critical/high security defects; rollback и restore выполнены практически.

## Порядок после pilot

Решения принимаются по метрикам и обратной связи: качество retrieval/ответов, no-result rate, latency, стоимость диалога, crawl/import freshness и обращения пользователей. Только после этого рассматриваются CRM tools, автоматические действия, отдельный public API service или специализированная vector database.

### Отложенные источники данных

1. После накопления опыта pilot отдельно исследовать импорт каталога из БД. До реализации провести threat model, security review и принять новый ADR.
2. Если DB import будет одобрен, использовать только изолированный ingestion-worker и фиксированный versioned adapter для скачивания ограниченного снимка. Модель и chat runtime не получают соединение или SQL-возможности; primary production DB остается запрещенным target по умолчанию.
3. Любой новый source type сначала получает fixtures, tenant/secret isolation tests, resource limits и rollback публикации, и только затем появляется в административном API.
