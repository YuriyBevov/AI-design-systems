# Развертывание и эксплуатация

## 1. Окружения

### Local

Docker Compose: PostgreSQL/pgvector, Redis, MinIO; приложения запускаются dev-командами. Только synthetic data/fake provider по умолчанию.

### CI

Disposable services, mock provider, без production network/secrets. Artifacts immutable и получают commit/image digest.

### Staging

Отдельные БД/Redis/bucket/keys/domains. Допускается ограниченный AITUNNEL key с малым бюджетом и staging Origins. Здесь проходят live crawl/provider/Bitrix acceptance.

### Production

Отдельный account/network/secrets/backups. Нельзя использовать staging DB/key/bucket. Admin и widget/API domains могут быть разделены CSP/traffic policy.

## 2. Deploy units

- control-panel/API Node image;
- worker Node image с browser dependencies только если включен Playwright;
- widget static loader/bundles на immutable versioned paths/CDN;
- migrations job запускается отдельно до code switch по backward-compatible strategy.

Worker image без headless browser предпочтителен для обычных queues; Playwright worker можно выделить в отдельную queue/image при подтвержденной необходимости.

## 3. Secrets/config

Secret manager предпочтительнее plain environment management UI. Минимум:

- database/redis/object credentials;
- admin session signing/encryption secrets;
- provider credential master encryption key + version;
- optional email provider credential;
- observability exporter authentication.

Tenant AITUNNEL keys хранятся только encrypted в БД, не как общий `.env`. `.env.example` не является production source.

## 4. Release procedure

1. CI build/test/scan и immutable images/assets.
2. Проверить migration plan, backup freshness и rollback compatibility.
3. Deploy backward-compatible migrations.
4. Deploy control-panel/API canary/staging smoke.
5. Deploy workers с bounded concurrency.
6. Опубликовать новый widget bundle, не удаляя предыдущий.
7. Переключить loader manifest/version после smoke.
8. Наблюдать errors/latency/queue/cost.
9. Отметить release и сохранить migration/image/widget versions.

Loader rollback переключает на предыдущий совместимый bundle. API contract должен поддерживать минимум текущую и предыдущую widget minor version в согласованном окне.

## 5. Миграции и reindex

- Deploy code не ожидает мгновенного completion большой backfill.
- Additive schema → background backfill → read/write switch → later cleanup.
- Full embedding reindex создает новую index version; active остается до smoke/atomic switch.
- Reindex cost/budget оценивается и ограничивается до запуска.
- Job можно cancel/resume безопасно; worker deploy не теряет состояние из БД.

## 6. Метрики и alerts

### Chat

Requests, success/error codes, first-token/total latency, active streams, disconnects, fallback/no-result, tokens/cost/model.

### Retrieval

Embedding/search/rerank latency, candidate counts, threshold abstention, active index freshness/dimension.

### Ingestion

Queue depth/oldest age, jobs by status/duration, pages/errors/retries, change rate, stale sources, embedding batches/cost.

### Infrastructure

CPU/memory/event loop, DB connections/locks/storage/backups, Redis availability/memory, object errors, provider availability/budget.

Alerts должны быть actionable и иметь ссылку на runbook. Не создавать alert только из единичного user error без aggregation.

## 7. Backup и restore

- PostgreSQL automatic backups + point-in-time recovery при доступности платформы.
- Object storage versioning/retention по выбранной политике.
- Redis не единственный источник истины, backup Redis не заменяет БД.
- Encryption master key backup хранится отдельно и защищенно; без него provider credentials не восстановить.
- Restore drill на staging минимум перед pilot и затем регулярно.
- Проверка restore включает publications, active index metadata, conversations policy и доступность encrypted credential test.

## 8. Incidents

### Provider outage/budget

Включить safe fallback/maintenance message, остановить автоматические reindex, проверить budget/error status, не делать uncontrolled retry/model switch.

### Crawl runaway

Pause queue/source, cancel jobs, проверить URL scope/canonical variants, rate/bytes/cost, устранить причину и возобновить ограниченным dry run.

### Suspected secret exposure

Отозвать affected secret/provider key, ротировать, ограничить сервис, сохранить audit evidence без копирования секрета, оценить scope, исправить канал, документировать incident.

### Bad knowledge/prompt publication

Переключить previous known-good publication/index, снять defective documents, сохранить run ids/evidence, добавить regression eval, затем исправлять draft.

### Tenant isolation concern

Остановить affected public/admin paths при подтвержденном риске, сохранить audit, оценить доступ, уведомить ответственных по incident/legal policy. Это P0 независимо от объема данных.

## 9. Production readiness

- [ ] Domains/TLS/CSP/CORS и exact Origins проверены.
- [ ] Secrets manager, key version и rotation procedure готовы.
- [ ] DB migrations/backups/restore проверены.
- [ ] Worker queues/concurrency/cancellation ограничены.
- [ ] Metrics/log redaction/dashboards/alerts работают.
- [ ] Provider budgets/circuit breakers/fallback настроены.
- [ ] Widget current/previous assets и rollback доступны.
- [ ] Security/eval/load acceptance пройдены.
- [ ] Runbooks содержат актуальные команды/ответственных после выбора hosting.
