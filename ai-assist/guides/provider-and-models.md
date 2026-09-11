# AITUNNEL: ключи и модели

## 1. Поддерживаемый интерфейс

AITUNNEL предоставляет OpenAI-совместимый API с base URL:

```text
https://api.aitunnel.ru/v1
```

Чат MVP использует `/chat/completions` со streaming. Embeddings — `/embeddings`. Rerank подключается отдельной capability после оценки качества/стоимости.

Официальные источники:

- [введение и быстрый старт](https://aitunnel.ru/docs);
- [API-ключи](https://aitunnel.ru/docs/keys);
- [проверка текущего ключа](https://aitunnel.ru/docs/api/key);
- [список моделей](https://aitunnel.ru/docs/models);
- [стриминг](https://aitunnel.ru/docs/streaming);
- [embeddings](https://aitunnel.ru/docs/embeddings);
- [rerank](https://aitunnel.ru/docs/rerank).

Перед реализацией endpoint/параметра нужно открыть актуальную официальную страницу; examples в этом проекте не заменяют provider documentation.

Текущая реализация проверяет credential запросом `GET /v1/aitunnel/key`. Этот endpoint не выполняет платную генерацию и позволяет получить имя ключа, бюджет, срок действия, ограничения моделей и PII-настройки, когда provider возвращает эти поля.

## 2. Каталог моделей

Для UI используется публичный каталог без ключа:

```text
GET https://api.aitunnel.ru/public/aitunnel/models/chat
GET https://api.aitunnel.ru/public/aitunnel/models/embeddings
GET https://api.aitunnel.ru/public/aitunnel/models/rerank
```

Не парсить HTML каталога и не хранить hard-coded перечень как единственный источник истины. Синхронизация:

1. Fetch с timeout и response-size limit.
2. Runtime-валидация известных полей; неизвестные поля сохранять только в ограниченном raw metadata при необходимости.
3. Upsert catalog cache с `fetched_at` и checksum.
4. Модель, пропавшая из каталога, помечается unavailable, а не физически удаляется — старые runs должны оставаться объяснимыми.
5. Admin видит stale badge, если sync давно не удался.

`GET /v1/models` можно применять для проверки доступности с конкретным ключом/пресетов, но цены и capabilities берутся из публичного каталога согласно документации AITUNNEL.

Реализованный adapter запрашивает три capability endpoint параллельно, ограничивает время и размер ответа, валидирует известные поля runtime-схемой и сохраняет checksum нормализованной provider metadata.

## 3. Выбор модели

Отдельные настройки:

- `chat_model_id` — generation;
- `embedding_model_id` + dimension/profile — indexing/query;
- `rerank_model_id` — optional second-stage ranking.

Admin selector показывает только модели нужной capability. При публикации проверяются:

- модель доступна или владелец явно принимает stale/unavailable risk;
- text input/output поддерживаются;
- context/output limits совместимы с server token budgets;
- provider credential проверен;
- active index совместим с embedding profile.

`auto` разрешен для chat, но UI предупреждает, что фактическая модель и стоимость могут меняться. Для embeddings `auto` не используется: одинаковая модель/размерность обязательны для индекса и query.

## 4. Операции администратора с ключом

Сохранение, замена и удаление ключа требуют подтверждения текущего пароля, если после входа или последнего подтверждения прошло больше 30 минут. Панель открывает модальное окно, а после успешной проверки автоматически повторяет исходное действие — выходить из панели и снова вводить email не нужно. Проверка уже сохранённого ключа не меняет secret и повторного подтверждения не требует.

### Добавить

1. Открыть Provider settings как Owner.
2. Вставить ключ в password input.
3. Нажать «Проверить и сохранить».
4. Убедиться, что UI показывает `verified`, mask и время проверки.
5. Обновить model catalog и выбрать chat/embedding модели.

### Заменить

1. Создать новый ключ/бюджет у provider.
2. В AI Assist выбрать replace и проверить новый key.
3. После успешного provider smoke test переключить credential атомарно.
4. Отозвать старый ключ у provider.

### Удалить

Удаление немедленно блокирует новые provider calls. UI предупреждает, что chat и reindex перестанут работать. Существующие документы и audit не удаляются.

Если ключ был опубликован в чате, issue, commit, screenshot или логе, его нельзя считать безопасным даже после удаления из сообщения. Его нужно отозвать у provider, создать новый и только новый ключ ввести в UI. Опубликованный ключ не используется для development smoke-тестов.

Master key для credential envelope задается отдельно через `CREDENTIAL_ENCRYPTION_KEY` как base64 от 32 случайных байт. `CREDENTIAL_ENCRYPTION_KEY_VERSION` указывает активную версию, а `CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS` временно содержит JSON-карту старых версий на период ротации. Production-конфигурация с development master key отклоняется при старте; в development известный default допускает просмотр панели, но блокирует credential save.

Локально `pnpm dev:setup` создаёт независимый master key в игнорируемом Git корневом `.env`, а
панель и worker читают его совместно. Значение должно сохраняться между перезапусками. Если
сохранённая запись ссылается на отсутствующую версию, API возвращает
`CREDENTIAL_KEY_VERSION_UNAVAILABLE`; если версия найдена, но AES-GCM envelope не проходит
аутентификацию, — `CREDENTIAL_DECRYPTION_FAILED`. Ни одна из этих ошибок не должна превращаться в
общий `Provider operation failed`.

## 5. Streaming adapter

- Server открывает upstream streaming и преобразует provider-specific chunks в внутренние events.
- Prompt preview передаёт выбранные `model`, `max_tokens` и опциональный `temperature`; timeout ограничивает весь stream, а не только получение HTTP-заголовков.
- До первого delta возможен ограниченный retry для transient network/429 по политике; после первого delta — только завершение ошибкой.
- Client disconnect передает AbortSignal upstream.
- Unknown/malformed chunk фиксируется sanitized error, а не проксируется widget-у.
- Provider usage/model/request id сохраняются, если доступны и безопасны.
- Raw stream не сохраняется.

## 6. Embeddings

- Нормализовать input и chunk до вызова, но не менять смысл.
- Batch ограничивается документированными provider limits и собственным byte/token budget.
- Cache key включает provider, model, embedding profile, normalized content checksum.
- Ошибка части batch не активирует неполный index.
- Смена модели/dimension создает новую `knowledge_index_version` и полный reindex.
- Query embedding вызывается той же active profile.

## 7. Ошибки

Внутренние стабильные коды:

- `PROVIDER_CREDENTIAL_INVALID`;
- `PROVIDER_MODEL_UNAVAILABLE`;
- `PROVIDER_RATE_LIMITED`;
- `PROVIDER_BUDGET_EXCEEDED`;
- `PROVIDER_TIMEOUT`;
- `PROVIDER_BAD_RESPONSE`;
- `PROVIDER_UNAVAILABLE`.

Widget получает локализованное безопасное сообщение и `retryable`. Admin diagnostics получает code, request id, time и sanitized details. Полный Authorization/provider body запрещены.

## 8. Проверки перед публикацией

- credential verified недавно;
- catalog не stale сверх установленного окна;
- test chat дает stream и корректное завершение;
- embedding round-trip возвращает ожидаемую dimension;
- rate/budget guardrails заданы;
- логи/trace redaction проверены автоматическим тестом;
- ключ отсутствует в widget bundle, HTML, source map и browser network.

## 9. Статус реализации

На 2026-09-02 готовы credential CRUD/test, mask/status/verification metadata, audit, public catalog sync, capability selectors, settings validation, streaming chat parser, embeddings client и административный prompt preview через chat adapter. Preview возвращает usage/latency и sources опубликованной ручной базы знаний, а в audit — только безопасные технические metadata. Полноценный run, пользовательский chat runtime, долговременная usage/cost аналитика и embedding index относятся к следующим этапам.
