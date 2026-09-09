# Проектная модель данных

Документ задает логическую модель. Физические имена, типы и индексы уточняются миграциями, но перечисленные границы и состояния обязательны.

## 1. Общие правила

- Внутренние идентификаторы — UUID/UUIDv7; публичный assistant id имеет отдельный непредсказуемый namespace.
- Время хранится в UTC с timezone-aware типом, UI отображает timezone проекта.
- Tenant-owned строки имеют `project_id` и индекс по нему.
- Ссылочная целостность обеспечивается foreign keys; опасные cascade delete не используются для audit/conversations/documents без отдельного решения.
- Published revisions неизменяемы. Edit создает новую revision.
- Soft archive немедленно исключает сущность из runtime. Физическая очистка выполняется retention job.
- Секреты, сообщения и crawl snapshots имеют отдельные retention/redaction rules.

## 2. Identity и доступ

### `users`

`id`, `email_normalized`, `password_hash`, `status`, `last_login_at`, timestamps.

### `sessions`

`id`, `user_id`, hashed opaque token, hashed CSRF token, `expires_at`, `last_seen_at`, `rotated_from_id`, `revoked_at`, timestamps. Plaintext session/CSRF tokens в БД не хранятся.

### `password_reset_tokens`

`id`, `user_id`, hashed одноразовый token, `expires_at`, `used_at`, privacy-preserving hash инициатора и timestamp. Plaintext существует только на этапе доставки пользователю.

### `projects`

`id`, `name`, `slug`, `status(active|suspended|archived)`, `timezone`, `default_locale`, `conversation_retention_days`, timestamps.

`slug` — уникальный человекочитаемый технический код проекта, который всегда формируется сервером из названия с автоматическим разрешением коллизий и не редактируется пользователем. `timezone` хранит IANA identifier для расписаний и отображения локального времени. Панель предлагает все региональные IANA-зоны России, покрывающие 11 действующих UTC-смещений. `default_locale` пока фиксирован как `ru`: поле остаётся в модели для совместимости, но не является пользовательской настройкой. `conversation_retention_days` физически хранится вместе с проектом, однако относится к эксплуатационной конфигурации assistant и редактируется в его разделе.

`active` разрешает административные операции, public widget и фоновые задания. `suspended` сохраняет данные проекта, но немедленно исключает его из runtime, обычного project scope и новых worker-заданий; Owner может вернуть проект в `active`. Пользовательское удаление переводит проект в терминальное состояние `archived`: он исчезает из списка управления, но история, audit и tenant-owned данные сохраняются до отдельной retention/purge-процедуры.

Создание проекта всегда создаёт нового assistant с новым непредсказуемым `public_id`, собственным черновиком конфигурации и Owner membership. При выборе проекта-шаблона копируется только allowlist повторно используемых настроек: визуальная/поведенческая конфигурация assistant, его политика срока хранения диалогов и последние revision неархивированных prompts. Origins/домены, contact fallback, provider credentials, model settings, knowledge, publications, conversations и audit не копируются. Ключ провайдера остаётся project-scoped записью; один и тот же внешний ключ можно вручную сохранить в нескольких проектах, но у каждого будут собственные envelope, lifecycle и audit.

### `project_memberships`

`project_id`, `user_id`, `role(owner|editor|viewer)`, timestamps. Unique `(project_id, user_id)`.

## 3. Assistant и prompts

### `assistants`

`id`, `project_id`, `public_id`, `status`, `config_version`, `active_publication_id`, timestamps. В MVP один assistant на project; unique `project_id`. `config_version` используется для optimistic concurrency черновика настроек.

### `assistant_config_revisions`

Immutable snapshot: branding, greeting, placeholder, launcher position, fallback, locale, limits, citations flag. Имеет `revision_no`, `created_by`, `created_at`.

### `assistant_publications`

`id`, `assistant_id`, `config_revision_id`, `prompt_revision_id`, `published_by`, `published_at`, `supersedes_id`. Active pointer меняется транзакционно.

Миграция `0003_broken_dark_beast.sql` создаёт первый prompt-срез: `assistants`, `prompts`, `prompt_revisions` и `assistant_publications`. Миграция `0004_noisy_ares.sql` добавляет immutable `assistant_config_revisions`, Origins и обязательную ссылку publication на точную config revision. Для ранее созданных publication миграция создаёт и привязывает совместимый начальный snapshot без потери выбранной prompt revision и model settings.

### `assistant_allowed_origins`

`config_revision_id`, normalized exact `origin`, `scheme`, `host`, optional `port`, `environment`, `enabled`. Paths не участвуют в Origin. Записи входят в immutable config snapshot и не изменяются после создания revision.

### `prompts`

Логический prompt: `id`, `project_id`, `type`, `name`, `description`, `status`.

### `prompt_revisions`

`id`, `prompt_id`, `revision_no`, `content`, `variables_json`, `created_by`, `created_at`, `content_checksum`. Unique `(prompt_id, revision_no)`.

Логический `prompt` дополнительно имеет integer `version` для optimistic concurrency. Изменение metadata, создание revision и публикация увеличивают version; запрос со старым значением получает conflict и не перетирает изменения.

## 4. Provider

### `provider_credentials`

`id`, `project_id`, `provider`, `ciphertext`, `nonce`, `auth_tag`, `key_version`, `masked_hint`, `status`, `last_verified_at`, `last_error_code`, timestamps.

Plaintext и полный provider response не хранятся. В MVP unique active credential `(project_id, provider)`.

### `provider_model_catalog`

`provider`, `model_id`, `capability_group`, normalized capabilities/pricing JSON, `available`, `fetched_at`, `raw_checksum`. Это cache внешнего каталога, а не tenant data.

### `project_model_settings`

`project_id`, `chat_model_id`, `embedding_model_id`, optional `rerank_model_id`, bounded parameters, `updated_by`, timestamps.

Embedding setting дополнительно имеет `embedding_profile_version/dimension`. Активный индекс должен быть совместим с ним.

Таблицы этого раздела созданы миграцией `0002_gray_magma.sql`. На этапе 3 `embedding_dimension` зарезервирован для фактического профиля индекса и остается `null` до реализации embeddings pipeline.

## 5. Knowledge и ingestion

### `knowledge_sources`

Целевая сущность: `id`, `project_id`, `type(feed|url|file|manual|product)`, `name`, `status`, normalized public endpoint/origin, scope/settings JSON, schedule, last successful job, timestamps. `mysql` и `api` зарезервированы только как возможные post-pilot расширения.

В миграциях `0005_clammy_wallow.sql` и `0007_rich_onslaught.sql` реализованы source record без `file`: `id`, `project_id`, `type`, `name`, `status`, optimistic `version`, nullable `system_key`, versioned JSON settings, crawl freshness/error metadata и timestamps. Для ручных документов и товаров сервис создаёт по одному управляемому source на проект; URL-source хранит нормализованный start URL, рекурсивные `includePathPrefixes`, нерекурсивные `includeExactPaths`, exclude prefixes и bounded limits. `file` добавляется только вместе с upload/import entities и защищённым ingestion flow.

### `knowledge_file_uploads` / `knowledge_import_batches` (этап 6)

Upload хранит project/uploader, исходное безопасное имя, detected MIME/signature, size, checksum, private object key, scan/parse status, retention и timestamps. Import batch хранит source/upload/profile ids, status, counts `new|changed|unchanged|missing|conflict|failed`, confidence summary, requested/confirmed users и timestamps. Product/document drafts ссылаются на batch/result provenance; публичный runtime не получает object key или исходный файл.

Network-настройки хранятся структурировано и валидируются. Реквизиты БД, VPN, SSH, приватного API, произвольные request headers и SQL из admin UI не входят в MVP.

### `source_credentials`

Post-pilot сущность для источников, которым действительно потребуется секрет. В первом pilot не создается и не используется: публичный crawl/feed не требует реквизитов клиента. Перед активацией любого source credential нужны отдельный ADR и security review.

### `source_profiles`

Версионируемый adapter/mapping contract: source type, разрешенные URL/path patterns, field mappings, validation schema, authoritative/fallback fields и extraction profile fingerprint. Secrets и произвольные исполняемые fragments не хранятся.

### `ingestion_jobs`

Реализованная таблица `knowledge_crawl_runs`: `id`, `project_id`, `source_id`, status, requested user/request id, profile version, progress/diff/review counters, safe error code и timestamps. Один source имеет не более одного `queued|running` run.

Статусы: `queued`, `running`, `succeeded`, `partial`, `failed`, `cancelled`.

### `ingestion_page_results`

Реализованная таблица `knowledge_crawl_pages`: tenant/run, normalized URL/depth, HTTP metadata, status, document/version ids, `new|changed|unchanged`, type/title/checksum/confidence/warnings, safe retryable error code, review status и fetched time. Raw HTML в ней не хранится и через admin API не отдаётся.

Для feed/manual/product sources эквивалентный result хранит external id/cursor, profile version и безопасные error metadata.

### `knowledge_documents`

Логическая сущность: `id`, `project_id`, `source_id`, optional hashed source external identity, `type(page|product|manual)`, `status`, optimistic `version`, `active_version_id`, timestamps. Уникальная source identity обеспечивает идемпотентный повторный crawl.

Статусы текущего ручного среза: `draft`, `published`, `archived`. `needs_review` будет состоянием ingestion/review pipeline. Runtime проверяет active published version.

### `knowledge_document_versions`

Текущий immutable normalized snapshot: `id`, `document_id`, `version_no`, `title`, `canonical_url`, `locale`, `plain_text`, tags JSON, content checksum, `created_by`, `created_at`. Provenance/job/confidence расширяются при подключении crawler-а.

### `knowledge_products`

Проекция структурированной товарной версии для редактирования/фильтрации: document version id, external id, SKU, category, price display/amount/currency, availability text, minimum order и characteristics JSON. Источником retrieval остается published document version/chunks. Image metadata добавится вместе с ingestion.

### `knowledge_document_publications`

Неизменяемая история активаций: document/version ids, publisher и время. Текущая активная версия определяется `knowledge_documents.active_version_id`; unpublish очищает указатель, не стирая историю.

### `knowledge_index_versions`

`id`, `project_id`, embedding model/dimension, source fingerprint, `status(queued|building|active|superseded|failed)`, counts, safe error code, request/actor и timestamps. Один active и не более одного queued/building index на проект.

### `knowledge_chunks`

В текущем срезе: `id`, `project_id`, `document_version_id`, ordinal, plain text, приблизительный token count, content checksum и время создания. Chunks создаются синхронно вместе с ручной immutable version, но доступны retrieval только через published active pointer.

`knowledge_index_embeddings` связывает `index_version_id` и `knowledge_chunk_id` с pgvector embedding произвольной размерности. Embedding build выполняется worker-ом; административный запрос создаёт queued version и BullMQ job без provider key.

Vector query всегда получает project/active publication/locale filters и совместимую model/dimension. На текущем pilot exact pgvector search не вводит риск неверного ANN recall; HNSW/partial dimension indexes и GIN full-text добавляются после измерения реального каталога и latency.

## 6. Conversations и usage

### `widget_sessions`

Короткоживущая server-side запись: UUID, assistant/project ids, SHA-256 hash opaque token, keyed origin hash, locale/widget version, expires/last seen/revoked и timestamps. Plaintext token существует только в ответе bootstrap и browser storage. Не является admin session.

### `widget_conversations`

`id`, `widget_session_id`, `project_id`, `assistant_id`, public opaque id, `active|closed`, locale, structured `qualification_state`, optional summary, last activity/expires/timestamps. Partial unique index разрешает только один active conversation на widget session. IP целиком не хранится.

### `widget_messages`

`id`, `conversation_id`, `role`, content or redacted/encrypted content according to project policy, status, created_at. Для streaming assistant message создается pending и финализируется атомарно; incomplete явно помечается.

### `widget_generation_runs`

`id`, project/session/conversation и user/assistant message ids, точный publication/model, hash idempotency key, `running|completed|failed|cancelled`, requested/resolved model, latency/first-token, request id, token usage, finish reason, error code и timestamps. Unique session/idempotency hash предотвращает повторную запись одного запроса.

### `widget_generation_sources`

`run_id`, `chunk_id`, rank, итоговый retrieval score и cited flag. Это provenance и основа оценки качества.

Миграция `0008_breezy_manta.sql` создаёт перечисленные widget runtime таблицы, индексы, статусы и tenant-scoped внешние ключи.

## 7. Audit и operations

### `audit_events`

Actor, project, action, resource type/id, safe diff metadata, request id, timestamp. Значения secrets и полные message contents запрещены.

### `outbox_events`

Транзакционный outbox для надежной постановки критичных jobs после commit. Consumer помечает delivered; повторы идемпотентны.

## 8. Удаление и retention

- Archive document: active pointer снимается/фильтруется немедленно, purge chunks ставится в очередь.
- Delete provider key: credential становится unusable в транзакции, ciphertext purged по короткому retention, audit сохраняет только факт/metadata.
- Conversations: purge по `conversation_retention_days`; агрегированные обезличенные метрики можно хранить дольше отдельной политикой.
- Crawl snapshots: короткий настраиваемый retention; опубликованный normalized text хранится до archive/purge.
- User/project deletion: отдельная административная операция с dry-run inventory и подтверждением, не простой cascade endpoint.

## 9. Инварианты для тестов

- Нельзя иметь active publication из revision другого project/assistant.
- Нельзя активировать index version с несовместимой embedding dimension/model profile.
- Нельзя получить chunk через runtime retrieval, если document/version/index не active/published.
- Нельзя удалить revision, на которую ссылается publication или generation run; доступна archive/redaction policy.
- Повтор одного idempotency key не создает второй ingestion job.
- Один public conversation id не разрешается в другом assistant/project.
