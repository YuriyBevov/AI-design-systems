# Руководство по разработке

## 1. Принципы

- Один monorepo, несколько deployable units.
- Domain code не зависит от Nuxt pages/components.
- Внешние границы имеют runtime validation.
- Долгие операции идут через очередь.
- Published behavior изменяется только явной publication.
- Security-sensitive defaults закрыты; ослабление требует обоснования и теста.
- Сначала простой измеряемый pipeline, затем framework/agent abstractions. В MVP не добавлять LangChain только ради обертки одного chat + embeddings API.

## 2. Команды

После установки зависимостей локальный контур запускается так:

```bash
pnpm install --frozen-lockfile
pnpm dev:setup
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

`pnpm dev:setup` поднимает Compose, применяет миграции и выполняет идемпотентный development seed. Панель по умолчанию слушает `http://localhost:3000`. PostgreSQL AI Assist опубликован на `localhost:55432`, Redis — на `6379`, MinIO API/console — на `9000/9001`. Если порт занят, его можно переопределить одноименной переменной Compose; `DATABASE_URL` должен указывать на тот же порт.

`test:integration` и `test:e2e` будут добавлены вместе с первыми соответствующими сценариями; пустые команды не объявляются успешными проверками.

После запуска панели доступны smoke-проверки:

```bash
pnpm smoke:admin
pnpm smoke:provider
pnpm smoke:prompts
pnpm smoke:assistant
pnpm smoke:knowledge
pnpm smoke:knowledge-index
pnpm smoke:crawler
pnpm smoke:prompt-preview
pnpm smoke:widget-chat
```

`smoke:prompts` создаёт отдельный случайный development tenant, копирует в него только несекретный snapshot выбранных моделей и проверяет CRUD, optimistic conflict, неизвестную переменную, publish, rollback, runtime resolver и запреты archive/delete. В `finally` удаляется только созданный test tenant; проект клиента, его credential и prompt-ы не меняются.

`smoke:assistant` таким же изолированным способом проверяет начальные настройки, нормализацию и запреты Origins, immutable revisions, optimistic conflict и независимость draft от production snapshot. Финальная публикация конфигурации сохраняет активные prompt/model snapshots и переключает только config revision.

`smoke:knowledge` создаёт отдельный tenant и проверяет CSRF, tenant isolation, manual/product CRUD, immutable versions, optimistic conflict, publish/unpublish/archive/delete и отсутствие document content в audit. Provider credential ему не нужен.

`smoke:knowledge-index` использует только synthetic credential и локальный mock. Он проверяет CSRF запуска, путь API → Redis → worker → AITUNNEL embeddings → pgvector, активацию версии, совпадение chunk/embedding counts и `hybrid` режим prompt preview. Панель и worker должны использовать один synthetic `CREDENTIAL_ENCRYPTION_KEY`; worker в local dev читает корневой `.env`, а при его отсутствии — `apps/control-panel/.env`, чтобы расшифровывать тот же credential envelope.

`smoke:crawler` создаёт отдельный временный tenant, запускает full-mode worker path с тестовым лимитом в три публичные страницы `gofroprodpak.ru`, проверяет CSRF/строгий payload, structure discovery, pagination, извлечение товарной карточки, выборочную и run-wide публикацию и повторный идемпотентный crawl. Сценарий соблюдает `robots.txt`, использует паузу 250 мс и удаляет только свой test tenant; проект клиента, его ключи, prompts и знания не изменяются.

`smoke:prompt-preview` требует панель, направленную на локальный mock AITUNNEL. Сценарий создаёт отдельный tenant, синтетический credential/model и ручное знание, проверяет опубликованный retrieval с provenance, немедленное исключение после unpublish, streaming answer, diagnostics, rate limit, audit redaction и отсутствие production publication, затем удаляет созданные записи. Для изолированного запуска можно собрать панель и открыть её на отдельном порту:

```bash
pnpm build
pnpm mock:aitunnel
PORT=3120 CREDENTIAL_ENCRYPTION_KEY="$(openssl rand -base64 32)" AITUNNEL_BASE_URL=http://127.0.0.1:3310/v1 PROMPT_PREVIEW_RATE_LIMIT_MAX=4 node apps/control-panel/.output/server/index.mjs
AI_ASSIST_SMOKE_BASE_URL=http://127.0.0.1:3120 AI_ASSIST_PREVIEW_SMOKE_RATE_LIMIT_MAX=4 pnpm smoke:prompt-preview
```

Mock и тестовая панель запускаются в отдельных терминалах. Этот контур не должен использовать credential или master key клиентского проекта.

`smoke:widget-chat` использует тот же изолированный mock-контур. Он проверяет exact-Origin CORS/preflight, opaque session, SSE meta/delta/citation/usage/done, опубликованный RAG, восстановление сообщений, structured qualification между ходами, idempotency, запрет чужого session/conversation и создание нового чата. Для development server на отдельном порту:

```bash
pnpm mock:aitunnel
AITUNNEL_BASE_URL=http://127.0.0.1:3310/v1 NUXT_PORT=3100 NUXT_IGNORE_LOCK=1 pnpm --filter @ai-assist/control-panel dev
AI_ASSIST_SMOKE_BASE_URL=http://localhost:3100 pnpm smoke:widget-chat
```

`smoke:provider` синхронизирует реальный публичный каталог AITUNNEL без ключа, проверяет capability и временно изменяет/восстанавливает модельные настройки. Credential flow проверяется только синтетическим ключом и локальным mock. При пустом credential проекта запустите в отдельных терминалах:

```bash
pnpm mock:aitunnel
CREDENTIAL_ENCRYPTION_KEY="$(openssl rand -base64 32)" AITUNNEL_BASE_URL=http://127.0.0.1:3310/v1 pnpm dev:panel
pnpm smoke:provider-credential
```

Последний сценарий проверяет ciphertext/nonce непосредственно в development PostgreSQL, отсутствие plaintext и envelope fields в HTTP/audit, замену, повторный test и удаление созданного credential. Он намеренно прекращает работу, если у проекта уже есть ключ.

Панель, запущенная без собственного `CREDENTIAL_ENCRYPTION_KEY`, должна блокировать запись. При пустом credential это проверяется отдельно:

```bash
pnpm smoke:provider-encryption-guard
```

## 3. Конфигурация

- Конфигурация считывается один раз на startup и валидируется schema.
- Server-only env не импортируется browser package-ами.
- `apps/widget` должен собираться при физическом отсутствии server env, чтобы случайная зависимость обнаруживалась в CI.
- Значения, меняющие runtime behavior проекта, хранятся в БД как versioned config, а не в env.
- Env содержит инфраструктурные адреса, encryption/session secrets и service-level настройки.
- `.env.example` содержит имена и безопасные примеры, но не действительные secrets.

## 4. Слои server-кода

```text
HTTP handler -> authorization + DTO -> use case -> repository/provider/queue port
```

Handler:

- получает session/request context;
- валидирует path/query/body;
- вызывает use case;
- маппит ожидаемую ошибку в problem response.

Use case:

- проверяет business policy и состояние;
- задает транзакционную границу;
- пишет audit/outbox;
- не знает о Vue/Nuxt UI.

Repository:

- принимает авторизованный project scope;
- инкапсулирует tenant filter;
- возвращает domain records, не raw provider/browser objects.

## 5. Contracts

- Runtime schema — источник истины DTO; TypeScript type выводится из нее.
- Admin, widget и server не копируют вручную разные формы одного события.
- SSE event — discriminated union с версией.
- Database row не отдается напрямую наружу.
- Public ids отделены от internal ids.

## 6. Миграции

- Миграции только forward-compatible для rolling deploy: сначала add/backfill, затем code switch, затем отдельное remove.
- Большая reindex/backfill job не выполняется внутри migration transaction.
- Изменение vector dimension создает новую index/version structure и reindex, не blind alter active index.
- Каждая migration тестируется на пустой и реалистично наполненной БД.

## 7. Очереди

- Payload содержит identifiers и минимальные immutable параметры, но не provider key.
- Job читает актуальное состояние из БД после старта.
- Idempotency key и attempt number фиксируются.
- Progress обновляется ограниченно, чтобы не создавать write storm.
- Cancellation cooperative: проверяется между страницами/batches.
- Ошибки классифицируются permanent/retryable. Validation/SSRF block не ретраятся.
- После исчерпания попыток job получает terminal status; скрытый бесконечный retry запрещен.

## 8. Логи

Structured fields: timestamp, level, service, environment, request/job/correlation id, project id (internal), operation, duration, outcome, safe error code.

Запрещенные поля:

- Authorization/cookie/CSRF;
- plaintext secrets и ciphertext;
- password/reset token;
- полный message/prompt/document content по умолчанию;
- raw headers/provider response;
- signed object URLs.

Redaction тестируется, а не полагается только на дисциплину вызовов logger.

## 9. Изменение документации

Документация меняется в той же задаче, если изменился contract/decision. В `agent-conversation-history.md` записываются: дата, задача, решение, затронутые области, проверки и незакрытые ограничения.
