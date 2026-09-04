# Стратегия тестирования

## 1. Пирамида

- Unit: policies, normalizers, chunking, URL safety, prompt assembly, crypto envelope helpers, error mapping.
- Integration: PostgreSQL/pgvector, Redis/BullMQ, migrations, repositories, provider mock server, HTTP auth/CORS/CSRF/SSE.
- Contract: widget ↔ API, provider fixtures, extraction profile snapshots.
- E2E: admin workflows, widget on plain/hostile/Bitrix fixtures.
- Security: tenant isolation, SSRF, prompt injection, XSS/Markdown, rate limits, secret redaction.
- Eval: retrieval/answer quality, claims and sources.
- Load/resilience: concurrent streams, queue backlog, provider latency/failure, DB/Redis restart.

## 2. Обязательные unit suites

### Tenant/auth

- role matrix;
- project scope cannot be built from unverified path alone;
- cross-project ids return safe 404/403 policy consistently;
- archived/disabled project unavailable runtime.

### Secrets

- round-trip current/previous key version;
- random nonce дает разный ciphertext;
- associated-data mismatch fails;
- mask handles short/invalid inputs without leak;
- logger/trace/problem response redaction.

### URL safety

Полная матрица из crawler guide, включая IPv6, redirects и DNS changes. Tests не должны обращаться к реальному internal network; используется controlled DNS/HTTP harness.

### Prompts/RAG

- unknown template variable;
- content delimiter escaping;
- untrusted context position;
- low score/empty result fallback;
- token budget/truncation preserves provenance;
- unpublished/other-project chunk excluded.

## 3. Integration tests

Запускать реальные PostgreSQL + pgvector и Redis в disposable environment.

- migrations с нуля и upgrade from previous schema;
- transaction rollback при publication/index failure;
- outbox/job idempotency и retry;
- vector dimension/profile mismatch;
- hybrid search tenant/status/locale filters;
- archive/unpublish immediate exclusion;
- job cancellation and partial errors;
- session rotation/CSRF/CORS exact Origin;
- SSE success, error after headers, cancellation и slow consumer.

Provider тестируется локальным mock HTTP/SSE server с 200/401/429/5xx, delayed first byte, malformed chunks, disconnect и usage/no-usage. CI не расходует реальный AITUNNEL balance. Ограниченный live smoke — только manual/staging secret job.

## 4. Crawler fixtures

Хранить маленькие обезличенные HTML/JSON fixtures:

- category and product pages первого магазина;
- JSON-LD complete/partial/conflicting;
- lazy-loaded images, missing price, multiple offers;
- generic company/delivery pages;
- navigation/cookie/duplicate boilerplate;
- malformed HTML;
- prompt injection in visible/hidden/comment text;
- JS-dependent page for Playwright path.

Fixture содержит source snapshot date/profile version и expected normalized JSON. Не хранить copyrighted site dump целиком, если достаточно минимального фрагмента для теста.

## 5. Widget E2E fixtures

Минимум три host pages:

1. plain HTML;
2. hostile CSS/JS: global `button/input/*`, transforms, high z-index modal, repeated loader;
3. Bitrix-like layout/footer/cache fixture.

Проверять:

- mount/open/send/stream/retry/new conversation;
- focus/escape/tab/return focus/live region;
- 320px viewport, zoom 200%, reduced motion;
- offline/403/429/timeout/stream error;
- host input/forms/navigation unchanged;
- no secret/local storage leak;
- bundle requested once.

## 6. Eval quality

Eval record:

- stable id/category;
- question/locale;
- required and forbidden source document ids;
- required/forbidden claims;
- expected fallback/CTA;
- optional reference answer, но не единственный критерий;
- tags: price, availability, comparison, company, missing, conflict, injection.

Метрики:

- retrieval recall@k/precision-style relevance;
- grounded claim rate;
- citation correctness;
- correct abstention/no-result;
- p50/p95 retrieval latency, time to first token, total response latency и cost;
- qualification completion rate, число уточняющих ходов, повторно заданные вопросы и средний размер shortlist;
- доля широких запросов, где каталог был показан до достаточного уточнения;
- regressions by category.

Model-as-judge может быть дополнительным сигналом, но critical price/availability/security cases имеют deterministic/manual assertions.

## 7. Load/resilience

- SSE concurrency при ожидаемом pilot traffic и запасе;
- disconnect storm/cancellation освобождает upstream/resources;
- queue backlog и bounded worker concurrency;
- rate limit across multiple API instances;
- provider slow/429 circuit behavior;
- DB/Redis temporary outage and recovery;
- crawl одного большого сайта не вытесняет chat workloads;
- embedding batch retry не дублирует active chunks/cost бесконтрольно.

## 8. CI gates

Для каждого change:

- format/lint/typecheck;
- unit + relevant integration;
- migration check при schema diff;
- dependency/secret scan;
- widget size budget при browser code diff;
- docs/contracts check при public/schema change.

Перед pilot:

- full E2E browser matrix;
- live provider smoke на staging;
- crawl fixture + ограниченный live source smoke;
- eval regression;
- security review;
- backup/restore/deploy/rollback drills.

## 9. Test data

- Никаких production keys/cookies/PII.
- Секреты в fixtures — явно фальшивые patterns, которые secret scanner allowlist-ит точечно.
- Test tenant ids различаются и регулярно используются для negative cross-tenant cases.
- Clock/random/DNS/provider управляются test doubles для воспроизводимости.
- Snapshot не заменяет semantic assertions для security/business rules.
