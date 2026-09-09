# Черновой контракт API

Префикс административного и публичного API: `/api/v1`. Контракт версионируется до начала pilot; breaking changes требуют нового префикса или согласованного migration window.

## 1. Общие правила

- JSON — UTF-8, даты — ISO 8601 UTC.
- Request/response получают `X-Request-Id`; входное значение принимается только после валидации или генерируется заново.
- Все DTO валидируются runtime schemas. Неизвестные поля state-changing команд по умолчанию отклоняются.
- Ошибка использует `application/problem+json` без stack trace/provider secret.
- List endpoints используют cursor pagination.
- Update принимает `version`/ETag для optimistic concurrency; конфликт — `409`.
- Долгая операция возвращает `202 Accepted` и job resource.
- `Idempotency-Key` обязателен для создания crawl/index jobs и рекомендуется для chat message start.

Пример ошибки:

```json
{
  "type": "https://assist.example.ru/problems/validation-error",
  "title": "Некорректные данные",
  "status": 422,
  "code": "VALIDATION_ERROR",
  "requestId": "req_xxx",
  "errors": [{ "path": "startUrl", "code": "URL_NOT_ALLOWED" }]
}
```

## 2. Admin authentication

Admin API использует Secure HttpOnly session cookie и CSRF token для state-changing methods.

```text
POST   /auth/login
POST   /auth/logout
POST   /auth/password/forgot
POST   /auth/password/reset
GET    /auth/session
```

Login/reset endpoints имеют отдельные rate limits и не раскрывают существование email.

Статус реализации этапа 2: `login`, `logout` и `session` работают; password reset будет подключён вместе с выбранным каналом доставки. Login принимает только строгий DTO, выдаёт новую opaque session и отдельный CSRF token; logout отзывает запись на сервере.

`GET /auth/session` возвращает пользователя с `name`, `email` и продуктовой ролью `admin|user`. Роли `owner|editor|viewer` не являются внешними ролями аккаунта и в интерфейсе не показываются.

### Пользователи

```text
GET    /users
POST   /users
PATCH  /users/{userId}
```

Все три endpoint доступны только `admin`. `POST` принимает `name`, нормализуемый `email`, временный пароль длиной 12–128 символов, роль `admin|user` и массив `projectIds`. `PATCH` изменяет профиль, роль, статус `active|disabled`, необязательный пароль и назначения. Для администратора `projectIds` вычисляется сервером как все неархивированные проекты; обычный пользователь получает только выбранные проекты. State-changing методы требуют CSRF. Пароль сохраняется только как Argon2id hash, отключение отзывает сессии, а отключение или понижение последнего активного администратора возвращает `409 LAST_ACTIVE_ADMIN`.

## 3. Projects и assistant

```text
GET    /projects
POST   /projects
GET    /projects/{projectId}
PATCH  /projects/{projectId}
PATCH  /projects/{projectId}/status
DELETE /projects/{projectId}
GET    /projects/{projectId}/members
POST   /projects/{projectId}/members
PATCH  /projects/{projectId}/members/{userId}
DELETE /projects/{projectId}/members/{userId}

GET    /projects/{projectId}/assistant
PATCH  /projects/{projectId}/assistant/draft
POST   /projects/{projectId}/assistant/publish
POST   /projects/{projectId}/assistant/rotate-public-id
GET    /projects/{projectId}/assistant/embed
```

Реализованные project endpoints позволяют получить управляемый список, создать, изменить, приостановить/возобновить и безопасно удалить проект. `POST /projects` принимает имя, IANA timezone, nullable `templateProjectId` и массив `userIds` активных обычных пользователей. Уникальный slug всегда генерируется сервером и не является пользовательской настройкой. В текущей версии locale фиксирована как `ru` и также не выводится в интерфейс. Панель предлагает все региональные IANA identifiers России, покрывающие 11 UTC-смещений. Новый проект получает новый assistant/public id, пустые индивидуальные настройки, всех активных администраторов и выбранных пользователей.

Если передан `templateProjectId`, инициатор должен быть администратором активного проекта-шаблона. Копируются только draft-настройки поведения/оформления assistant, политика срока хранения диалогов и последние revision неархивированных prompts. Origins/домены, contact fallback, provider credentials, model settings, knowledge, publications, conversations, memberships и audit всегда исключены. Без шаблона срок хранения по умолчанию равен 30 дням. В интерфейсе эта политика находится в разделе «Ассистент» и сохраняется сразу через `PATCH /projects/{projectId}`, независимо от публикации черновика. Один внешний provider key допускается вручную сохранить в нескольких проектах, но каждый credential остаётся отдельной project-scoped записью и автоматически не копируется.

`POST /projects`, `PATCH /projects/{projectId}/status` и `DELETE /projects/{projectId}` доступны только администратору. Status endpoint принимает только `{ "status": "active" | "suspended" }` и требует CSRF. Suspended-проект остаётся в управляемом списке, но исключается из обычного project scope, public widget и worker runtime до возобновления. Удаление дополнительно требует recent authentication и выполняет soft-delete в `archived`; tenant history и audit физически не удаляются. Archived-проекты не возвращаются в `GET /projects`.

Чтение, сохранение черновика и публикация настроек assistant доступны в активном проекте. Изменение и публикация assistant доступны Owner, требуют session cookie, точный same-origin request, CSRF header и актуальный `expectedVersion`. Origins нормализуются до exact scheme/host/port; wildcard, credentials, path, query и fragment отклоняются. HTTP разрешён только для локального preview, production Origin требует HTTPS. Неизвестный, недоступный или неактивный tenant resource возвращает одинаковый `404`.

Черновик настроек создаёт новую immutable config revision. Публикация настроек создаёт новую `assistant_publication`, повторно используя активную prompt revision и её model snapshot, поэтому production меняется атомарно. Первая публикация требует уже опубликованный основной system prompt, выбранную chat-модель и хотя бы один Origin. `rotate-public-id` и `embed` пока остаются проектным контрактом следующего среза.

Rotate public id требует grace period/явного подтверждения, иначе уже установленные snippets перестанут работать.

## 4. Prompts

```text
GET    /projects/{projectId}/prompts
POST   /projects/{projectId}/prompts
GET    /projects/{projectId}/prompts/{promptId}
PATCH  /projects/{projectId}/prompts/{promptId}
POST   /projects/{projectId}/prompts/{promptId}/revisions
GET    /projects/{projectId}/prompts/{promptId}/revisions
GET    /projects/{projectId}/prompts/{promptId}/revisions/{revisionId}
POST   /projects/{projectId}/prompts/{promptId}/preview
POST   /projects/{projectId}/prompts/{promptId}/publish
POST   /projects/{projectId}/prompts/{promptId}/archive
DELETE /projects/{projectId}/prompts/{promptId}
GET    /projects/{projectId}/prompt-publication
```

Реализованы все перечисленные операции. `PATCH` меняет metadata логического prompt. Текст изменяется только созданием immutable revision. Все update/revision/publish/archive/delete-команды принимают обязательный `expectedVersion`; устаревшее значение возвращает `409` + `PROMPT_VERSION_CONFLICT` с текущей версией.

`POST /prompts/{promptId}/preview` принимает строгий body `{ revisionId, question }`, где вопрос после trim содержит от 1 до 4000 символов. Preview использует указанную сохранённую prompt revision, текущую draft assistant config и текущие model settings, но не создаёт publication и не меняет active production pointer. В ответе возвращаются answer, prompt/config revision ids, requested/resolved model, generation parameters, finish reason, token usage, latency и retrieval со статусом `ready|empty`, режимом `hybrid|lexical`, nullable `indexVersionId`, безопасным `warningCode` и массивом sources. Источники выбираются только из активных опубликованных версий текущего проекта и локали. При отсутствии совместимого индекса или ошибке query embedding preview продолжает работу в lexical mode.

`GET /knowledge` возвращает настроенную embedding-модель, active/latest index version, stale flag и число опубликованных документов/chunks. `POST /knowledge/reindex` доступен Editor/Owner с CSRF, требует verified credential, выбранную embedding-модель и опубликованный контент, создаёт `queued` index version и возвращает `{ jobId, index }`. Job payload содержит только identifiers/timestamps/request ID; provider key в Redis не передаётся.

Preview доступен Editor/Owner, требует session, exact same-origin, CSRF и имеет отдельный Redis rate limit. Provider key расшифровывается только на сервере непосредственно перед вызовом AITUNNEL и не входит в DTO. Полный вопрос, собранный prompt и ответ не пишутся в audit; сохраняются только технические ids, модель, latency, usage и безопасный error code. Несохранённый текст editor-а endpoint не принимает.

Draft может содержать неизвестные переменные для исправления в editor-е, но publish вернёт `422` + `PROMPT_TEMPLATE_INVALID`. Разрешены только `assistant.name`, `project.name`, `project.locale`, `runtime.current_date`, `runtime.contact_fallback`. Публикация также требует выбранную chat-модель и хотя бы один Origin, создаёт новую `assistant_publication`, snapshot модельных настроек и ссылку на точный immutable assistant config snapshot, затем атомарно переключает active pointer. Публикация прежней revision является rollback и тоже создаёт новую publication. `GET /prompt-publication` — авторизованный административный runtime-resolver активного prompt/config/model snapshot; публичный widget не получает prompt text через этот endpoint.

`DELETE` допустим только для никогда не публиковавшегося prompt и требует recent authentication; использовавшийся prompt возвращает `409` + `PROMPT_DELETE_REQUIRES_ARCHIVE`. Активный prompt нельзя архивировать (`PROMPT_ACTIVE_PUBLICATION`). Чтение требует Viewer, изменения — Editor/Owner; state-changing операции защищены CSRF и tenant scope.

## 5. Provider и модели

```text
GET    /projects/{projectId}/provider
PUT    /projects/{projectId}/provider/credential
POST   /projects/{projectId}/provider/credential/test
DELETE /projects/{projectId}/provider/credential
GET    /models?capability=chat|embeddings|rerank
POST   /models/sync
GET    /projects/{projectId}/model-settings
PUT    /projects/{projectId}/model-settings
```

`GET /provider` возвращает только:

```json
{
  "provider": "aitunnel",
  "credential": {
    "id": "0e10586a-aed1-4a62-9348-ff66cf911735",
    "provider": "aitunnel",
    "maskedHint": "sk-aitunnel-…abcd",
    "status": "verified",
    "keyVersion": 1,
    "lastVerifiedAt": "2026-09-01T10:00:00Z",
    "lastErrorCode": null,
    "verification": {
      "keyName": "Production assistant",
      "budgetRemaining": 1000,
      "budgetInitial": 2000,
      "budgetResetAt": null,
      "expiresAt": null,
      "allowedModels": null,
      "piiMode": "mask"
    },
    "updatedAt": "2026-09-01T10:00:00Z"
  }
}
```

При отсутствии ключа `credential` равен `null`. Поля `apiKey`, `ciphertext`, `nonce` и `authTag` в response отсутствуют. `PUT` принимает `{ "apiKey": "..." }` как write-only, сначала требует корректный формат и настроенный non-default master key, затем проверяет ключ у provider и только после этого атомарно сохраняет новый envelope. Неверный формат возвращает `400` + `PROVIDER_CREDENTIAL_FORMAT_INVALID`; небезопасный development default — `503` + `CREDENTIAL_ENCRYPTION_KEY_REQUIRED`; некорректный base64/размер master key — `503` + `CREDENTIAL_ENCRYPTION_KEY_INVALID`. Save/test/delete требуют Owner, CSRF и recent authentication. Model settings требуют Owner; чтение каталога и настроек доступно авторизованному администратору в рамках его project scope.

## 6. Knowledge и sources

```text
GET    /projects/{projectId}/knowledge/documents
POST   /projects/{projectId}/knowledge/documents
GET    /projects/{projectId}/knowledge/documents/{documentId}
POST   /projects/{projectId}/knowledge/documents/{documentId}/versions
POST   /projects/{projectId}/knowledge/documents/{documentId}/publish
POST   /projects/{projectId}/knowledge/documents/{documentId}/unpublish
POST   /projects/{projectId}/knowledge/documents/{documentId}/reindex
POST   /projects/{projectId}/knowledge/documents/{documentId}/archive
DELETE /projects/{projectId}/knowledge/documents/{documentId}

GET    /projects/{projectId}/knowledge/sources
POST   /projects/{projectId}/knowledge/sources/discover
POST   /projects/{projectId}/knowledge/sources
PATCH  /projects/{projectId}/knowledge/sources/{sourceId}
POST   /projects/{projectId}/knowledge/sources/{sourceId}/crawl
GET    /projects/{projectId}/knowledge/crawl-runs/{runId}
POST   /projects/{projectId}/knowledge/crawl-runs/{runId}/publish

POST   /projects/{projectId}/knowledge/uploads
POST   /projects/{projectId}/knowledge/imports
GET    /projects/{projectId}/knowledge/imports/{importId}
GET    /projects/{projectId}/knowledge/imports/{importId}/items
POST   /projects/{projectId}/knowledge/imports/{importId}/confirm
POST   /projects/{projectId}/knowledge/imports/{importId}/cancel

GET    /projects/{projectId}/ingestion/jobs
GET    /projects/{projectId}/ingestion/jobs/{jobId}
GET    /projects/{projectId}/ingestion/jobs/{jobId}/pages
POST   /projects/{projectId}/ingestion/jobs/{jobId}/cancel
```

В текущем срезе реализованы list/create/detail/version/publish/unpublish/archive/delete для `knowledge/documents`. Create принимает discriminated union `manual|product`: общие поля `title`, `content`, optional `canonicalUrl`, `locale`, `tags`; товар дополнительно принимает structured `product` с SKU/external id, category, display/parsed price, currency, availability, minimum order и characteristics. Изменение контента всегда создаёт новую immutable version. Version/publish/unpublish/archive/delete требуют `expectedVersion`; write требует Editor/Owner и CSRF, физическое удаление — также recent authentication.

Публикация атомарно переключает `activeVersionId`. Повторная публикация уже активной версии возвращает `409 KNOWLEDGE_VERSION_ALREADY_ACTIVE`; unpublish сразу очищает active pointer и исключает chunks из следующего retrieval; использовавшийся документ нельзя физически удалить (`409 KNOWLEDGE_DELETE_REQUIRES_ARCHIVE`). Все чтения и retrieval tenant-scoped. Project-level `reindex` и URL source/crawl endpoints реализованы; отдельный playground/retrieve, feed/file imports и универсальный ingestion jobs API остаются следующими срезами.

URL source create/update выполняет строгую schema, DNS/IP и scope validation, но не выполняет crawl внутри request. `POST .../sources/discover` принимает только публичный `startUrl`, безопасно читает robots/sitemap и корневую навигацию и возвращает не более 100 разделов первого уровня с provenance и количеством найденных внутренних адресов. Выбор с внутренними элементами сохраняется в `includePathPrefixes`, выбор без них — в `includeExactPaths`. Настройки содержат `crawlMode=limited|full`: limited ограничен 100 страницами, full — 5000 страницами; worker остаётся последовательным и соблюдает delay/robots. `POST .../crawl` возвращает `202` с `{ jobId, run }`; payload очереди содержит только project/source/run/request identifiers. Повторный запрос во время активного run возвращает существующее задание. `GET .../crawl-runs/{runId}?page=1&pageSize=50` отдаёт до 100 page results, pagination metadata и короткий escaped preview без raw HTML. `POST .../publish` принимает `{ selection: "selected", pageIds: uuid[] }` либо `{ selection: "all" }`, активирует только соответствующие последние `new|changed` draft versions текущего tenant/run, отклоняет устаревшие и по возможности ставит versioned knowledge reindex в очередь.

Целевой первый pilot поддерживает `url`, `feed`, `file`, `manual` и `product`; `mysql` и `api` не принимаются. В текущей реализации готовы `manual|product` document endpoints и URL-specific source/crawl endpoints. Пока upload/import flow не завершён целиком, общего endpoint с выбором `file|feed|mysql|api` нет.

Планируемый `POST /knowledge/uploads` создаёт ограниченную upload session для одного allowlisted файла; прямой object URL остаётся краткоживущим и приватным. `POST /knowledge/imports` принимает только завершённый tenant-owned upload id, название импорта и режим `auto`, возвращает `202` + job/import id. `items` отдаёт cursor-paginated review rows без object key; `confirm` принимает expected version и выбранные/исключённые items, но не публикует их без отдельной publication команды. Форматы первой очереди: TXT/Markdown, text PDF, DOCX, CSV/XLSX, XML/YML.

`DELETE` документа разрешен только для неиспользованного draft без публикаций/runs. Для остальных документов используются unpublish/archive и отдельная Owner purge-процедура по retention.

## 7. Playground и audit

```text
POST   /projects/{projectId}/playground/retrieve
POST   /projects/{projectId}/playground/chat
GET    /projects/{projectId}/audit
GET    /projects/{projectId}/operations/summary
```

Playground принимает явные draft revision ids, доступен Editor/Owner и имеет более строгие cost limits.

## 8. Public widget bootstrap

### Создание сессии

```http
POST /api/v1/widget/sessions
Origin: https://shop.example.ru
Content-Type: application/json

{
  "assistantId": "asst_public_xxx",
  "widgetVersion": "1.0.0",
  "locale": "ru"
}
```

Успех:

```json
{
  "sessionToken": "opaque_short_lived_value",
  "expiresAt": "2026-09-05T10:15:00Z",
  "config": {
    "name": "Помощник",
    "greeting": "Здравствуйте! Чем помочь?",
    "placeholder": "Введите вопрос",
    "accentColor": "#315EFB",
    "launcherPosition": "right",
    "locale": "ru",
    "enabled": true,
    "maintenanceMessage": null,
    "features": { "citations": true }
  },
  "conversation": null
}
```

Сервер нормализует и проверяет `Origin` по assistant allowlist. Origin не считается доказательством личности вне браузера, поэтому endpoint не выдает чувствительные данные и дополнительно защищен rate limits/abuse controls. CORS отвечает конкретным разрешенным origin, а не `*`.

### Продолжение и новый диалог

```text
GET  /api/v1/widget/session
POST /api/v1/widget/conversations
```

Оба endpoint принимают `Authorization: Bearer <widget-session>` и exact `Origin`. `GET` возвращает public config и активный conversation с максимум 100 последними сообщениями. `POST` принимает строгий пустой JSON `{}`, закрывает прежний активный conversation этой сессии и возвращает новый с пустой историей. В ответах отсутствуют prompt, provider credential, qualification state и внутренние project/assistant ids.

### Chat stream

Используется `fetch` POST с response `text/event-stream`, а не native `EventSource`, чтобы передавать JSON body и Authorization header.

```http
POST /api/v1/widget/chat
Origin: https://shop.example.ru
Authorization: Bearer <short-lived-widget-session>
Accept: text/event-stream
Content-Type: application/json
Idempotency-Key: <random-id>

{
  "conversationId": null,
  "message": "Какая ширина у этой ленты?",
  "page": {
    "url": "https://shop.example.ru/catalog/item/",
    "title": "Карточка товара"
  }
}
```

`page` — недоверенная подсказка; URL обязан соответствовать session Origin, не fetch-ится chat endpoint-ом и не заменяет knowledge source.

## 9. SSE events

Каждое событие содержит `event:` и JSON в `data:`. Heartbeat — comment line, а не бизнес-событие.

```text
event: meta
data: {"requestId":"req_x","conversationId":"conv_x","userMessageId":"uuid","assistantMessageId":"uuid"}

event: delta
data: {"text":"..."}

event: citation
data: {"id":"src_1","title":"...","url":"https://..."}

event: usage
data: {"model":"...","inputTokens":123,"outputTokens":45}

event: done
data: {"finishReason":"stop"}
```

Ошибка до начала stream возвращается обычным problem JSON. Ошибка после начала:

```text
event: error
data: {"code":"PROVIDER_TIMEOUT","message":"Ответ не получен. Попробуйте еще раз.","retryable":true,"requestId":"req_x"}
```

Widget не показывает internal error/provider payload. Disconnect/AbortSignal отменяет upstream, если provider поддерживает cancellation.

## 10. Public rate-limit dimensions

Минимум:

- assistant/project daily budget;
- source IP privacy-preserving key;
- widget session;
- conversation;
- message size/concurrency.

Headers могут сообщать безопасные общие лимиты, но не внутренний budget владельца. При превышении — `429` с `Retry-After`.

## 11. Health

```text
GET /health/live    # процесс способен ответить, без тяжелых dependency checks
GET /health/ready   # DB/required config и способность принимать трафик
```

Readiness не раскрывает DSN, версии secrets и подробности внутренней сети.
