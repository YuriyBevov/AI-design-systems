# Журнал проекта AI Assist

## 2026-09-01 — Нулевой этап: исследование и проектирование

### Контекст

Поставлена задача подготовить отдельный проект ИИ-ассистента, встраиваемого на любой сайт, включая 1С-Битрикс. Требуются административные CRUD-интерфейсы для prompts и базы знаний, выбор моделей AITUNNEL, безопасное хранение provider key и наполнение знаний из URL интернет-магазина.

### Проверено

- Папка `pen.dev/newmark/scripts` существует.
- `import-catalog-source.mjs` обходит страницы, извлекает товарные данные и изображения, сохраняет draft JSON.
- `normalize-catalog-draft.mjs` фильтрует, дедуплицирует и приводит draft к модели Newmark.
- Прототип полезен для fixtures/правил первого магазина, но связан с конкретным HTML, словарем и frontend paths и не подходит как production crawler без переработки.

### Принятые решения

- Создан корневой проект `ai-assist`.
- Nuxt 4 используется для административной панели и Nitro API.
- Виджет собирается отдельно как Vue 3 Custom Element через Vite и Shadow DOM.
- Долгие crawl/index операции вынесены в Node/TypeScript worker и BullMQ.
- PostgreSQL + pgvector — основное и векторное хранилище; Redis — очередь/лимиты; S3/MinIO — файлы/снимки.
- AITUNNEL изолирован provider adapter-ом; каталог моделей синхронизируется через публичный API.
- Provider key хранится только server-side в authenticated encrypted виде и никогда не возвращается из API.
- Данные сайта не «обучают» модель; применяется versioned ingestion и RAG.
- Multi-project isolation через `project_id` закладывается с первого MVP; public SaaS/billing исключены.
- Prompt/document/index публикации версионируются и переключаются атомарно.
- URL crawler проектируется с SSRF, robots, scope, resource limits и review-before-publish.
- Принят ADR-002: стабильные данные индексируются, изменяемые поля проверяются точечно; базовый путь — feed/HTML, а read-only API/MySQL является опциональным улучшением.
- Модели запрещено генерировать SQL. MySQL connector использует versioned fixed queries, allowlisted views и отдельные зашифрованные credentials.

### Созданные материалы

ТЗ, ADR стека, архитектура, модель данных, API draft, пошаговый план, правила кодовых агентов, admin/development/security/provider/prompt/knowledge/crawler/widget/testing/operations guides и `.env.example`.

### Проверки

- Сверены официальные документы Nuxt/Vue/Vite, AITUNNEL, OWASP SSRF/CSRF и 1С-Битрикс по структуре шаблона.
- Согласованность и ссылки документов проверяются отдельным финальным проходом.

### Следующий этап

Этап 1 реализован и проверен. Следующий этап — authentication/projects/audit из `implementation-plan.md`.

## 2026-09-01 — Этап 1: исполняемый каркас

### Реализовано

- pnpm monorepo, Node LTS pin, strict TypeScript, ESLint, Prettier, Vitest и CI;
- Nuxt control panel с liveness/readiness endpoints;
- BullMQ worker и тестовый `system.ping` flow;
- Vue Custom Element widget и отдельный IIFE loader с Shadow DOM;
- PostgreSQL/pgvector, Redis и MinIO через Docker Compose;
- Drizzle schema/migration и seed проекта `Гофропродпак` с публичным origin первого сайта;
- runtime contracts для опциональных `mysql/api/feed/url/manual/product` sources.

### Проверено

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`;
- три Docker services имеют healthy status;
- migration и seed успешно выполнены;
- liveness/readiness вернули `ok`, а test job прошла путь API → Redis → worker → `completed`.

### Уточнение источников

MySQL не является зависимостью MVP. Базовый путь — feed/HTML ingestion, а read-only API/MySQL может быть добавлен через общий adapter contract по решению клиента.

## 2026-09-01 — Правила разметки и именования классов

### Контекст

По запросу владельца в AI Assist перенесены правила HTML и CSS-классов, использованные в проекте Newmark.

### Изменения

- Создан `guides/class-names.md` с БЭМ-логикой, одним `__`, минимальным набором классов, запретом имен по цвету/позиции/порядку и словарем компонентов AI Assist.
- Создан `guides/markup.md` с семантикой HTML, правилами заголовков, форм, таблиц, кнопок/ссылок, изображений, текста и отсутствия лишних оберток/декора.
- Правила адаптированы для Nuxt/Vue: стабильные `:key`, SSR/hydration, запрет небезопасного `v-html`, ARIA/focus, `data-testid` и Shadow DOM виджета.
- Оба документа добавлены в обязательный порядок чтения `AGENTS.md` и индекс гайдов.

### Важное уточнение

Правило Newmark «только `h1` и `h2`» сохранено для простых публичных страниц. В сложной административной панели разрешены `h3` и более глубокие уровни, только когда они отражают реальную семантическую вложенность, а не размер текста.

## 2026-09-01 — Этап 2: базовый контур доступа

### Реализовано

- Argon2id password hashing и development owner без production seed;
- opaque admin sessions: в cookie находится токен, в PostgreSQL — только SHA-256 hash; сессия имеет expiry, last seen и серверный отзыв;
- отдельный double-submit CSRF token с серверной hash-проверкой, точный Origin и Fetch Metadata check;
- privacy-preserving Redis rate limit для login и одинаковая ошибка для неизвестного email/неверного пароля;
- роли Owner/Editor/Viewer, неизменяемый `ProjectScope` и project-scoped repositories;
- настройки проекта, protected Nuxt routes, responsive admin layout и журнал аудита;
- рекурсивное удаление password/token/cookie/credential-полей из audit metadata;
- миграция для sessions, password reset tokens и audit events.

### Проверено

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`;
- миграция и повторный development seed;
- `pnpm smoke:admin`: 401 для анонимной сессии, успешный login, 403 без CSRF, 404 для чужого project UUID, разрешённый Owner update, audit event, logout и 401 отозванной сессии;
- SSR отдаёт login page и перенаправляет неавторизованный запрос к панели на `/login`.

### Осталось до завершения этапа 2

Password reset после выбора канала доставки, очистка/ротация сессий и интеграционный fixture с реальным вторым tenant. К следующему продуктовому вертикальному срезу можно параллельно проектировать AITUNNEL credential storage, но пользовательский ключ до реализации шифрования не сохраняется.

## 2026-09-01 — Этап 3: AITUNNEL provider и secrets

### Реализовано

- отдельный `@ai-assist/provider-aitunnel` adapter для credential verification, public catalog, streaming chat и embeddings;
- стабильные безопасные error codes для invalid credential, budget, unavailable model, rate limit, timeout, malformed response и provider outage;
- AES-256-GCM credential envelope с уникальным nonce, AAD, key version и поддержкой previous master keys;
- таблицы provider credentials, model catalog и project model settings с миграцией;
- Owner-only API и экран «Провайдер»: save/replace/test/delete, mask/status/verification metadata, sync models и отдельный выбор chat/embedding/rerank;
- recent authentication и CSRF для операций с ключом, project scope для настроек, redacted audit без secret/provider payload;
- compatibility validation: unavailable capability отклоняется, embeddings не принимает `auto`, output limit не может превышать model limit;
- production guard и development save guard против default encryption key, а также документированный порядок ротации.

### Проверено

- публичный каталог AITUNNEL синхронизирован без ключа и прошел API smoke;
- локальный mock credential flow подтвердил отсутствие plaintext в БД/API/audit, новый ciphertext/nonce при замене, test и delete;
- отдельный default-key guard smoke подтвердил `503`, отсутствие записи и безопасный audit;
- adapter unit tests покрывают 401/402/429/502, timeout, malformed stream, streaming success, embeddings и catalog parsing;
- полный `pnpm lint`, `pnpm typecheck`, 44 unit-теста и `pnpm build` прошли успешно;
- миграция применена к локальному PostgreSQL.

### Ограничения и следующий этап

Ранее опубликованный в переписке provider key не сохранялся и не использовался: перед реальной приемкой его необходимо отозвать и создать новый. Следующий продуктовый этап — CRUD/versioning/publication prompts; chat adapter станет пользовательским runtime после реализации knowledge retrieval и orchestration.

## 2026-09-02 — Этап 4: первый prompt-срез

### Реализовано

- таблицы `assistants`, `prompts`, immutable `prompt_revisions` и цепочка `assistant_publications` с active pointer;
- runtime schemas и DTO для CRUD, revisions, публикации, archive/delete и опубликованного prompt snapshot;
- явный allowlist шаблонных переменных и блокировка publish для неизвестного имени или повреждённого синтаксиса;
- optimistic integer version для metadata, revisions, publish и destructive operations;
- rollback как новая publication с `supersedes_id`, без изменения старой revision;
- snapshot выбранных chat/embedding/rerank-моделей и параметров в каждой publication;
- tenant-scoped repositories, Viewer read / Editor write, CSRF, recent-auth для физического удаления и безопасные audit events без prompt content;
- страницы списка и editor-а Prompts, история версий, validation summary, publish/rollback и подтверждения archive/delete;
- deterministic server-side resolver активной publication для следующего chat runtime.

### Проверено

- миграция `0003_broken_dark_beast.sql` применена к локальной PostgreSQL с сохранением provider/model данных;
- unit/contract tests добавлены для allowlist, malformed template, checksum, строгих DTO и обязательного optimistic version;
- `pnpm lint`, `pnpm typecheck`, все 52 теста, `pnpm build` и Prettier check прошли успешно;
- `pnpm smoke:prompts` в отдельном временном tenant проверяет create/update/revision, stale conflict, invalid variable, publish, rollback, resolver, audit и lifecycle policies, затем удаляет только test tenant.

### Осталось до завершения этапа 4

Assistant config revisions и Origins, полноценный visual diff, draft preview/eval через AITUNNEL и snapshot полной assistant configuration. Knowledge context в preview будет подключён после первого среза ручной базы знаний, чтобы тестовый pipeline не расходился с production orchestration.

## 2026-09-02 — Уточнение источников первого pilot

### Решение владельца

- Прямой доступ AI Assist и агента к рабочей БД магазина исключен из первого pilot.
- Первый контур ограничен публичным парсингом сайта/feed, ручными знаниями и промптами.
- В post-pilot план добавлена загрузка XML/YML/CSV-файлов.
- Возможность подключения к БД будет только отдельно исследована позднее; это не обещанная функция текущего scope.

### Зафиксированные границы

- Принят ADR-003; исходный ADR-002 сохранен как история и помечен частично замененным.
- Активный source contract принимает только `url`, `feed`, `manual` и `product`; `mysql`, `api` и еще не реализованный `file` отклоняются.
- Если DB import когда-либо будет одобрен, данные скачивает изолированный ingestion-worker как ограниченный snapshot. Модель, prompt pipeline, widget и chat runtime не получают доступ к соединению или SQL.
- До DB import обязательны threat model, security review и новый ADR; primary production DB запрещена по умолчанию.
- Новый policy-тест и полный workspace typecheck/test прошли; всего выполнено 53 теста.

## 2026-09-02 — Этап 4: настройки и публикация ассистента

### Реализовано

- immutable `assistant_config_revisions` с optimistic `config_version` и полным snapshot имени, приветствия, placeholder, оформления, fallback, локали, состояния, maintenance-сообщения, runtime-лимитов и citations;
- exact `assistant_allowed_origins`, привязанные к config revision: wildcard, credentials, path, query и fragment запрещены, production требует HTTPS, HTTP разрешён только для localhost preview;
- обязательная `config_revision_id` в каждой `assistant_publication`; существующие публикации мигрированы на совместимый начальный snapshot без изменения prompt/model данных;
- Owner-only API чтения, сохранения черновика и отдельной публикации с CSRF, tenant scope, optimistic conflict и безопасным аудитом;
- страница «Ассистент» с редактированием конфигурации и Origins, явными состояниями draft/production и отдельными действиями сохранения/публикации;
- prompt publication теперь фиксирует prompt, assistant config и model settings одним production snapshot; публикация config повторно использует активные prompt/model snapshots и не меняет их;
- новый `smoke:assistant` использует отдельный временный tenant и проверяет validation, конфликты, immutable revisions и изоляцию draft от production.

### Проверено

- миграция `0004_noisy_ares.sql` применена к локальной PostgreSQL;
- `pnpm lint`, `pnpm typecheck` и 61 unit/contract test прошли;
- `pnpm smoke:assistant` и регрессионный `pnpm smoke:prompts` прошли, не меняя клиентский проект;
- визуальная браузерная проверка отложена: в текущем окружении не был подключён доступный браузерный сеанс.

### Осталось до завершения этапа 4

Визуальный diff revisions и draft preview/eval через AITUNNEL. После этого следующий продуктовый срез — ручная база знаний и только затем перенос parser-а в ограниченный public ingestion pipeline.

## 2026-09-02 — Этап 4: model preview prompt revision

### Реализовано

- строгий `POST /api/v1/projects/{projectId}/prompts/{promptId}/preview` для выбранной сохранённой revision и тестового вопроса до 4000 символов;
- server-side рендер ровно пяти allowlisted переменных из tenant-scoped project и draft assistant config без доступа шаблона к env/secrets/code;
- потоковый вызов AITUNNEL с выбранной chat-моделью, `max_tokens`, опциональной `temperature`, полным response timeout и отменой upstream при disconnect клиента;
- неизменяемая platform policy следует после редактируемого system prompt и запрещает выдумывать факты или раскрывать инструкции, секреты и внутренние metadata;
- UI «Preview ответа» в редакторе prompt-а с вопросом, явным выбором сохранённой версии, ответом, model/revision diagnostics, latency и token usage;
- preview использует draft config и текущие model settings, но не создаёт publication и не меняет active production snapshot;
- knowledge retrieval намеренно имеет явный статус `not_connected` и пустые sources до этапа 5;
- отдельный Redis rate limit, Editor/Owner scope, CSRF и безопасные ошибки провайдера;
- audit events `prompt.previewed`/`prompt.preview_failed` содержат только технические ids, модель, latency/usage или error code; вопрос, prompt content, ответ и credential не сохраняются;
- локальный mock AITUNNEL расширен streaming chat, добавлен изолированный `smoke:prompt-preview` с временным tenant, synthetic credential/model и гарантированной очисткой;
- API, prompt/provider/development/admin guides, README и план реализации обновлены по фактическому состоянию.

### Проверено

- `pnpm lint`, `pnpm typecheck`, все 67 unit/contract тестов и `pnpm build` прошли;
- все изменённые файлы прошли отдельный Prettier check; глобальная проверка по-прежнему видит ранее существовавшее форматирование в 15 несвязанных файлах, которые этот этап не переписывал;
- финальный `pnpm smoke:prompt-preview` на production-сборке и локальном mock подтвердил CSRF, streaming response, diagnostics, rate limit, audit redaction и отсутствие production publication;
- регрессионный `pnpm smoke:prompts` подтвердил CRUD, immutable revisions, conflict, publish, rollback и lifecycle policies;
- оба smoke-сценария использовали только временные записи и не меняли клиентский проект или его credential; реальный AITUNNEL key не использовался;
- рабочий health endpoint панели на `localhost:3000` отвечает `status: ok`;
- визуальная браузерная проверка не выполнена: в текущем окружении не подключён ни один доступный браузерный сеанс.

### Следующий продуктовый шаг

Завершить этап 4 визуальным diff revisions и пакетным eval. Затем перейти к этапу 5: ручная база знаний, публикация документов и единый retrieval pipeline, после чего preview сможет показывать реальные sources/citations и проверять фактическое качество ответов.

## 2026-09-02 — Этап 5: ручная база знаний и retrieval baseline

### Реализовано

- миграция `0005_clammy_wallow.sql` с tenant-scoped sources, documents, immutable document versions, product projection, chunks и историей публикаций;
- строгие contracts для manual/product create, новой версии, publish/unpublish/archive/delete и retrieval provenance;
- нормализация, checksum, bounded chunking и детерминированное лексическое ранжирование опубликованных active versions по проекту и локали;
- tenant-safe repositories и service policies с Viewer read / Editor write, CSRF, optimistic version, recent-auth для физического удаления и запретом удаления когда-либо опубликованного документа;
- административные страницы списка и карточки знаний с ручными документами/товарами, историей версий и явными действиями публикации, снятия, архивации и удаления;
- prompt preview получает не более пяти опубликованных sources со scores, передаёт их как экранированный недоверенный контекст и не меняет production snapshot;
- platform policy запрещает выполнять инструкции из retrieved content и требует опираться на источники; содержимое документов/вопросов/ответов не записывается в audit;
- `smoke:knowledge` проверяет CSRF, tenant isolation, immutable versions, conflicts и полный lifecycle; `smoke:prompt-preview` расширен проверкой published retrieval и немедленного исключения после unpublish.

### Проверено

- миграция применена к локальной PostgreSQL; повторный `pnpm db:generate` подтвердил отсутствие расхождения schema/snapshot;
- `pnpm lint`, `pnpm typecheck`, все 75 unit/contract тестов и `pnpm build` прошли;
- `pnpm smoke:knowledge` прошёл на обычной локальной панели;
- изолированный `pnpm smoke:prompt-preview` с synthetic credential/model и локальным mock AITUNNEL подтвердил retrieval provenance, unpublish, streaming, rate limit, audit redaction и production isolation;
- readiness `localhost:3000` подтверждает доступность PostgreSQL и Redis;
- визуальный браузерный тест не выполнен: в текущей сессии не подключён доступный browser instance.

### Ограничения и следующий подэтап

Текущий retrieval — безопасный измеряемый lexical baseline. Этап 5 остаётся в работе: нужны фоновые embeddings, versioned hybrid index с atomic switch, threshold/diversity/token budget, отдельный playground и pilot eval set. Публичный crawler/feed ingestion и перенос правил Newmark относятся к этапу 6; прямой доступ агента к рабочей БД сайта по-прежнему исключён из pilot.

## 2026-09-02 — Файловый импорт и представление большого каталога

### Уточнение владельца

- В первый рабочий вариант добавляется загрузка файлов администратором: пользователь задаёт название импорта, система сама распознаёт содержимое и заполняет reviewable draft, затем пользователь подтверждает результат.
- Нужны текстовые документы и каталожные форматы, включая TXT, PDF, Word и Excel.
- Требуется заранее определить, как индексировать и показывать большой каталог без одного гигантского поля «Подтверждённый текст».

### Принятое решение

- Принят ADR-004, который переносит admin file ingestion из post-pilot в scope первого pilot, не меняя запрет прямого доступа к рабочей БД/приватному API.
- Первая очередь форматов: TXT/Markdown, PDF с текстовым слоем, DOCX, CSV/XLSX и XML/YML. OCR сканов, legacy DOC/XLS, macro-enabled и password-protected файлы отложены.
- Pipeline: private upload → signature/MIME/resource checks → async deterministic parse → AI-assisted schema mapping → draft documents/products с provenance/confidence → review/diff → отдельная publication.
- Happy path ограничен названием импорта и подтверждением, но low-confidence/conflict/error поля не скрываются и могут потребовать исправления.
- Большой каталог показывается как import batch и пагинированная таблица структурированных товаров; normalized retrieval text остаётся техническим preview, а не основным интерфейсом.
- Для retrieval выбран PostgreSQL full-text/structured lookup + pgvector и при измеренной пользе rerank. Отдельная vector database для pilot признана избыточной.

### План

- Этап 5 завершить фоновыми embeddings и versioned hybrid index.
- В этап 6 включить общий ingestion framework, публичный crawler/feed и защищённый файловый adapter с единым review/publish flow.

## 2026-09-02 — Этап 5.2: versioned pgvector index и hybrid retrieval

### Реализовано

- добавлена миграция `0006_fancy_roland_deschain.sql`: статусы index version, метаданные snapshot/model/dimension, pgvector embeddings и уникальные active/pending границы проекта;
- административный `POST /knowledge/reindex` создаёт только queued version и BullMQ payload с identifiers; AITUNNEL key не попадает в очередь;
- worker читает encrypted credential из PostgreSQL, локально использует server master-key, вызывает embeddings пакетами, проверяет count/dimension/finite values и пишет новую изолированную версию;
- перед активацией worker повторно проверяет embedding model и fingerprint опубликованных chunks; старый active index переключается в `superseded` одной serializable-транзакцией и остаётся активным при любой ошибке новой сборки;
- страница БЗ показывает model, latest status, published counts, stale state/error code, запускает индексацию и опрашивает queued/building job;
- prompt preview объединяет lexical и vector candidates, показывает `hybrid|lexical`, index version и безопасный warning code; provider/query/vector failure не блокирует текстовый fallback;
- смена embedding-модели сбрасывает сохранённую dimension до успешной новой индексации; local worker читает тот же env-file, что и панель.

### Проверено

- миграция применена к development PostgreSQL с уже установленным pgvector;
- contracts/domain/worker tests подтверждают строгий job payload без secret-полей, стабильный snapshot fingerprint, hybrid fusion и versioned keyring;
- `pnpm lint`, `pnpm typecheck`, все 81 unit/contract тест и `pnpm build` прошли; повторный `pnpm db:generate` не обнаружил schema drift;
- `smoke:knowledge-index` на отдельном tenant, synthetic credential и локальном mock прошёл полный путь API → Redis → worker → embeddings → pgvector → hybrid prompt preview; клиентский проект и его credential не использовались;
- регрессионный `pnpm smoke:knowledge` прошёл, а перезапущенные panel/worker и readiness PostgreSQL/Redis работают на `localhost:3000`;
- active index имеет exact pgvector scan; HNSW/partial dimension indexes и полнотекстовый GIN будут добавлены после замеров реального каталога, чтобы не фиксировать неверную размерность или ANN-параметры заранее.

### Следующий подэтап

Добавить retrieval threshold/diversity/token budget и pilot eval-набор, затем перейти к общему ingestion pipeline: crawler/feed и безопасная загрузка TXT/Markdown, text PDF, DOCX, CSV/XLSX, XML/YML с review/diff перед публикацией.

## 2026-09-02 — Этап 6.1: публичный URL crawler первого магазина

### Реализовано

- добавлен workspace-пакет `@ai-assist/crawler` с DOM parser, JSON-LD/microdata/generic extraction, robots/sitemap discovery, same-origin/path scope, bounded pages/depth/delay, redirects/timeouts/MIME/bytes limits;
- SSRF policy проверяет URL перед сохранением и на каждом network hop, запрещает credentials/non-default ports/private/local/link-local/multicast/reserved/metadata ответы, проверяет все DNS answers и соединяется с уже проверенным IP при корректных Host/SNI;
- миграция `0007_rich_onslaught.sql` добавила versioned URL sources, crawl runs/pages, progress/diff/review metadata и hashed per-source document identity;
- Nuxt API и панель создают/архивируют URL-source, ставят crawl в BullMQ, опрашивают прогресс, показывают batch-таблицу с confidence/warnings/preview и пакетно публикуют только актуальные `new|changed` drafts;
- worker создаёт immutable page/product versions и chunks, не создаёт новую version при неизменном checksum, а после подтверждения пытается запустить уже существующую versioned pgvector reindex;
- профиль `gofroprodpak-v1` подтверждён текущими `robots.txt`, sitemap и товарными microdata первого магазина; старый Newmark regex parser не импортирован и картинки не скачиваются.

### Проверено

- 19 crawler unit/security/fixture tests покрывают public/private DNS, alternate localhost forms, DNS rebinding, private redirect, timeout/oversize, sitemap dedupe, приоритет правил и `Crawl-delay` из robots.txt, product extraction и indirect prompt-injection marker;
- `smoke:crawler` на отдельном временном tenant прошёл реальный ограниченный обход `gofroprodpak.ru`: три страницы/товара стали reviewable drafts, были опубликованы, а повторный crawl классифицировал все три как `unchanged` без новых versions;
- клиентский проект, его AITUNNEL credential, prompts и знания smoke-тестом не изменялись.

### Следующий подэтап

Добавить field-level diff/conflict/missing review и затем защищённую загрузку файлов TXT/Markdown, text PDF, DOCX, CSV/XLSX и XML/YML. Feed, расписание и fresh public-card lookup остаются отдельными вертикальными срезами; MySQL/API по-прежнему не входят в pilot.

## 2026-09-02 — Этап 6.2: выбор структуры и массовая публикация

### Реализовано

- перед созданием URL-source административный endpoint безопасно объединяет sitemap и физическую навигацию и возвращает только разделы первого уровня;
- UI показывает дерево сайта, источник discovery и количество внутренних адресов; для каждого раздела доступны флаги «Включить в парсинг» и «Включая все внутренние разделы и элементы»;
- нерекурсивный выбор сохраняется как exact path, рекурсивный — как path prefix; crawler умеет начинать с выбранных разделов, даже если корневая стартовая страница не входит в scope;
- batch-таблица получила построчные чекбоксы, «выбрать все», счётчик выбранного и публикацию только переданных `pageIds`;
- сервер транзакционно проверяет tenant, run, pending/new|changed status и актуальность каждой выбранной версии; неотмеченные черновики не изменяются.

### Проверено

- discovery `gofroprodpak.ru` нашёл 6 содержательных разделов первого уровня; у `/catalog/` обнаружено 669 внутренних адресов;
- live smoke опубликовал только 2 выбранные записи из 3 и оставил третью pending, а повторный crawl классифицировал все 3 страницы как `unchanged`;
- crawler suite расширен до 22 тестов, contracts suite — до 31 теста.

## 2026-09-02 — Этап 6.3: полный обход сайта

### Реализовано

- URL-source получил режимы `limited` до 100 страниц и `full` до 5000 страниц; полный sitemap discovery читает до 50 sitemap-файлов и до 10000 URL-кандидатов;
- crawler сообщает фактическое число найденных URL, поэтому интерфейс показывает прогресс и явно предупреждает, если защитный лимит достигнут раньше завершения сайта;
- экран настроек переработан в отдельный fieldset; название, URL, режим, структура, include/descendant flags, исключения, лимит, глубина и задержка получили доступные hover/focus tooltips;
- результаты полного запуска пагинируются на сервере и в UI по 50 строк; выбор может охватывать текущие строки либо все pending `new|changed` записи запуска;
- парсинг по-прежнему выполняется локальным crawler-скриптом без вызова chat/embedding-моделей; ИИ-провайдер нужен только для отдельной последующей векторной индексации опубликованного текста.

### Проверено

- unit-сценарий полного режима обработал 125 страниц и корректно сообщил о 126 найденных URL при достигнутом лимите;
- live smoke прошёл full-mode path с безопасным лимитом: 3 страницы, 2 выбранные + 1 оставшаяся опубликованы двумя режимами, pagination проверена, повторный обход дал 3 `unchanged`;
- crawler suite содержит 23 теста, contracts suite — 33 теста.

## 2026-09-02 — Этап 7.1/8.1: публичная сессия и рабочий streaming widget

### Реализовано

- миграция `0008_breezy_manta.sql` добавила отдельные widget sessions, conversations, messages, generation runs/sources, structured qualification state, idempotency и provenance;
- браузер получает только короткоживущий opaque token, привязанный к published assistant и exact Origin; в PostgreSQL хранится только hash, а admin session/credential/prompt/внутренние ids через public DTO не выдаются;
- публичные bootstrap/resume/new conversation/chat endpoints получили строгие contracts, exact CORS, Redis rate limits и tenant/session/conversation isolation;
- chat собирает опубликованный prompt, bounded history, сохранённые параметры подбора и недоверенный RAG context, вызывает выбранную AITUNNEL chat-модель и отдаёт SSE `meta/citation/delta/usage/done|error`;
- Vue Custom Element теперь является рабочим чатом: динамическая опубликованная конфигурация, plain-text render, безопасные ссылки на источники, loading/error states, восстановление после reload и кнопка «Новый чат»; `loader.js` и `widget.js` собираются в `control-panel/public/widget/v1`;
- базовый квалификатор сохраняет между сообщениями размеры, количество, материал и необходимость печати; platform policy просит уточнить широкий запрос и ограничивает рекомендацию тремя вариантами.

### Проверено

- миграция применена к локальной PostgreSQL;
- unit-тесты проверяют qualification state, включая фразу «печать не нужна», widget contracts и фрагментированный SSE parser;
- `smoke:widget-chat` на отдельном временном tenant и mock AITUNNEL прошёл CORS, session, SSE, published RAG/citation, reload, два хода квалификации, idempotency, чужой Origin/conversation и новый чат; тестовые данные удалены;
- клиентский published runtime (`deepseek-v4-flash-0731`, 873 опубликованных документа) прошёл один короткий реальный public-widget запрос с последовательностью `meta/citation/delta/usage/done`; token и content не логировались, тестовая widget session сразу удалена каскадно;
- локальная production-like сборка виджета — 49.91 kB gzip, ниже текущего ориентира 100 kB.
- для cross-origin dynamic import статический `/widget/v1/widget.js` получает публичные CORS/CORP headers; widget API сохраняет отдельную exact-Origin проверку. Локальный host fixture работает на `http://localhost:4173` с намеренно конфликтующими host-стилями.

### Остаётся

Расширить versioned qualification profile и facet narrowing, добавить summary старой истории, retrieval threshold/diversity, latency dashboard/eval/prompt-injection набор, retention purge job и browser/Bitrix fixture matrix. Подтверждённая личность пользователя и перенос между устройствами остаются отдельным signed server-side handoff; HTML-атрибуты не считаются identity.

## 2026-09-08 — Раздел компонентов дизайна

### Изменения

- в основную project-scoped навигацию административной панели добавлен отдельный пункт «Компоненты»;
- создан каркас страницы библиотеки компонентов; он не выдаёт ещё не описанные паттерны за готовые компоненты.

### Проверки

- lint, typecheck, 123 unit/contract теста и production build прошли;
- авторизованный SSR-запрос подтвердил route, заголовки, project-scoped href и active navigation state; визуальная browser-проверка не выполнена, поскольку в сессии нет подключённого браузера.

## 2026-09-08 — Унификация кнопок и SVG-иконок

### Изменения

- по аналогии с `icat-test` обычные действия сведены к базовому классу `button`, icon-only действия — к `icon-button`; нейтральный вариант больше не требует избыточного `button--secondary`, а размеры, цвет, фон и форма задаются абстрактными модификаторами;
- прежний `text-button` удалён из панели и виджета, а contextual-классы оформления submit/launcher в виджете заменены общими модификаторами кнопки;
- символьные иконки навигации, быстрых действий, ссылки назад, tooltip и закрытия виджета заменены контролируемыми SVG; для панели добавлены локальный sprite и типизированный `UiIcon`;
- `SettingTooltip` переведён с `span[tabindex]` на нативную icon-only кнопку с `aria-label`;
- раздел `Компоненты` наполнен рабочими образцами обычных и icon-only кнопок и каталогом текущих SVG-иконок;
- правила DRY, базовых классов, модификаторов, contextual-классов и запрета Unicode/emoji вместо иконок закреплены в `AGENTS.md`, `guides/markup.md` и `guides/class-names.md`.

### Проверки

- formatter, lint, typecheck и production build прошли; widget bundle после изменения — 35.97 kB gzip;
- headless Chrome проверил авторизованный каталог на desktop и 390 px: SVG разрешены, горизонтального overflow нет; отдельно проверен открытый widget внутри hostile-style fixture, устаревших `text-button` в Shadow DOM нет;
- 122 теста проходят штатно; единственный crawler test для `http://[::1]/` упирается в общий timeout 5000 мс из-за системного DNS-вызова и проходит без изменения кода при `--testTimeout=15000`. Это существующая проблема URL policy вне UI-задачи, поэтому crawler-код не менялся.

## 2026-09-08 — Единый кастомный выпадающий список

### Изменения

- по референсу `briefing-app/app/components/base/BaseSelect.vue` в панель добавлен единый generic-компонент `BaseSelect` на `reka-ui`, поддерживающий строковые union-типы, nullable значения, disabled options и доступное имя trigger;
- все 9 нативных `<select>` на шести рабочих экранах заменены на `BaseSelect`; страницы передают только значение, options и функциональные props, а dropdown-разметка и визуальные стили больше не дублируются;
- в локальный SVG-спрайт добавлены `chevron-down` и `check`, а рабочие варианты dropdown и новые иконки представлены в разделе `Компоненты`;
- обязательное использование `BaseSelect` и запрет route-specific/native dropdown закреплены в `AGENTS.md`, `guides/markup.md` и `guides/class-names.md`.

### Проверки

- formatter, lint, typecheck, production build и полный набор из 123 тестов прошли;
- browser-проверка подтвердила mouse/keyboard selection, portal listbox с option roles, disabled-состояние, SVG-индикаторы и отсутствие overflow на 390 px;
- runtime-аудит assistant, provider, knowledge documents/detail/sources и prompts подтвердил 10 отрендеренных экземпляров `BaseSelect`, отсутствие нативных `<select>`, unresolved components и error pages.

## 2026-09-09 — Управление проектами и безопасное копирование

### Изменения

- перед началом работы чистое состояние ветки сохранено коммитом `625e20b` и отправлено в `origin/YuriyBevov/ai-assist`;
- в глобальную навигацию добавлен раздел «Проекты» со страницей создания, списка, приостановки, возобновления и удаления проектов; раздел остаётся доступен, даже если активных проектов нет;
- жизненный цикл расширен состояниями `active|suspended|archived`: приостановленный проект остаётся в управляемом списке, но исключается из обычного project scope, public widget и worker runtime; удаление реализовано как терминальный soft-delete с сохранением истории и audit;
- создание проекта транзакционно создаёт Owner membership, новый assistant/public id и первый immutable config draft; уникальный slug всегда генерируется сервером, а коллизии разрешаются автоматически;
- создание из активного проекта-шаблона копирует только draft-конфигурацию поведения/оформления, политику срока хранения диалогов и последние revision неархивированных prompts; домены, contact fallback, provider credentials, model settings, знания, публикации, диалоги и audit не копируются;
- одинаковый внешний provider key разрешено вручную сохранить в нескольких проектах, но каждая запись остаётся независимо зашифрованной и project-scoped;
- технический slug и фиксированная locale `ru` убраны из интерфейса создания и настроек; срок хранения диалогов убран из проекта и перенесён в отдельную операционную настройку раздела «Ассистент»;
- свободный ввод timezone на экранах создания и настроек заменён единым `BaseSelect` с 27 региональными IANA-зонами России, покрывающими все 11 действующих UTC-смещений;
- решение и контракты закреплены в ADR-005, `data-model.md` и `api-contract.md`; добавлена миграция `0009_fixed_rawhide_kid.sql` и сквозной сценарий `smoke:projects`.

### Проверки

- миграция `0009` применена к локальной PostgreSQL;
- `smoke:projects` прошёл создание и автоматическое разрешение коллизии slug, чужой template, allowlist-копирование, изоляцию ключа/моделей/БЗ, новый public id, suspend/resume, недоступность suspended scope и soft-delete; `smoke:admin` и `smoke:assistant` также прошли;
- formatter, XML validation, lint, typecheck, 129 тестов и production build прошли; известный системный DNS-вызов crawler-теста для `http://[::1]/` потребовал прежний лимит 15 секунд вместо штатных 5;
- headless Chrome проверил `/projects`, настройки, «Ассистент» и формы БЗ на 1440 px и ключевые экраны на 390 px: технический slug и locale отсутствуют, срок хранения доступен только в «Ассистенте», подпись под timezone удалена, нативных select и горизонтального overflow нет.
- отдельные UI-тесты проверяют полноту и уникальность 27 IANA identifiers, покрытие 11 UTC-смещений и поддержку каждой зоны текущим runtime; браузер подтвердил scrollable listbox из 27 options на desktop/mobile и отсутствие overflow.

## 2026-09-09 — Дизайн briefing-app и переключатель активного проекта

### Изменения

- административная панель переведена на визуальную систему `briefing-app`: тёмная тема по умолчанию, синяя accent-палитра, светлый вариант, унифицированные surface/control/border tokens, радиусы 4/8 px, компактные панели, формы, кнопки и таблицы;
- оболочка собрана по структуре briefing-app: sidebar шириной 280 px, отдельный topbar высотой 72 px, компактная навигация, блок пользователя и адаптивный горизонтальный navigation rail на узких экранах;
- добавлен переключатель темы с сохранением выбора в localStorage; солнце, луна и выход добавлены в общий SVG-спрайт и каталог компонентов;
- статичный `project-switcher` заменён отдельным компонентом-композицией поверх общего `BaseSelect`; компактный вид реализован абстрактным модификатором `base-select--compact` без дублирования dropdown-логики;
- активный проект хранится в общем reactive state и cookie, поэтому его одновременно используют sidebar, topbar и обзор; выбор на project-scoped странице переводит в соответствующий раздел другого проекта, а detail URL безопасно возвращается к списку prompts или документов;
- owner-only раздел провайдера при выборе проекта с недостаточной ролью заменяется безопасным переходом в настройки; после создания новый проект автоматически становится текущим;
- единственная отдельная стилизация кнопки выбора revision перенесена в абстрактный модификатор `button--list-option`, сохранив правило одного базового класса для обычных кнопок.

### Проверки

- formatter, lint, typecheck, production build и все 133 unit/contract теста прошли; добавлены четыре unit-сценария маршрутизации переключателя;
- `smoke:projects` и `smoke:admin` подтвердили lifecycle, безопасное копирование, tenant isolation, CSRF и audit;
- авторизованный SSR-прогон подтвердил новую shell-разметку, компактный custom select, topbar и SVG-кнопки; отдельный временный проект подтвердил, что cookie выбора меняет обзор и все project-scoped ссылки, после чего был удалён;
- интерактивная browser-проверка в этой сессии недоступна: Orca вернула `Browser is not available: iab`.

## 2026-09-09 — Пользователи, продуктовые роли и назначения на проекты

### Изменения

- внешняя модель доступа сведена к двум ролям: `Администратор` имеет полный доступ ко всем проектам, `Пользователь` получает read-only доступ только к назначенным проектам и не видит технический раздел «Компоненты»;
- в `users` добавлены отображаемое имя и роль аккаунта; миграция `0010_glossy_forgotten_one.sql` переводит прежних владельцев в администраторов, назначает им все неархивированные проекты и нормализует прочие memberships до viewer;
- создан защищённый раздел «Пользователи» с созданием, редактированием, выбором роли и проектов, активацией и отключением; пароль сохраняется только как Argon2id hash, отключение отзывает сессии, а последнего активного администратора нельзя понизить или отключить;
- форма создания проекта получила список активных пользователей по образцу `briefing-app`; все активные администраторы добавляются к новому проекту автоматически, выбранные пользователи получают доступ на чтение;
- из переключателя проекта удалены подписи «Текущий проект» и «Роль: owner», а внутренние роли больше не показываются в UI; в интерфейсе используется только «Администратор» или «Пользователь»;
- с обзора удалён статичный «Контур: Локальный», а карточка стратегии заменена фактическим состоянием БЗ: число опубликованных документов и состояние/актуальность индекса;
- добавлены общий `BaseCheckbox`, SVG-иконка пользователей и их образцы в каталоге компонентов; маршруты «Пользователи» и «Компоненты» закрыты для обычного пользователя также на уровне route middleware;
- решение закреплено в ADR-006, API contract, модели данных, техническом задании и руководствах администратора/безопасности.

### Проверки

- миграция `0010` применена к локальной PostgreSQL, development seed обновлён;
- formatter, lint, typecheck, 136 unit/contract тестов и production build прошли;
- `smoke:admin`, `smoke:projects` и новый `smoke:users` подтвердили вход с продуктовой ролью, назначение проекта, read-only tenant scope, запрет пользовательского API и project mutations, серверные redirect с защищённых UI-разделов и отзыв сессии при отключении;
- проект запущен на `http://localhost:3000` вместе с worker; PostgreSQL и Redis доступны.

## 2026-09-09 — Компактные поля проектов и модальные формы пользователей

### Изменения

- общий `BaseSelect` получил абстрактный вариант ширины по максимальному содержимому списка с безопасным ограничением контейнером; вариант добавлен в каталог компонентов;
- поля названия, часового пояса и проекта-шаблона в форме создания проекта получили компактные ограничения ширины и выстраиваются в один ряд на экранах от 1200 px, сохраняя адаптивную раскладку на меньшей ширине;
- по паттерну `briefing-app` создан общий доступный `BaseModal` на `reka-ui` с focus trap, закрытием по Escape или SVG-кнопке-крестику и блокировкой закрытия по клику вне окна; компонент добавлен в каталог;
- создание и редактирование пользователей перенесены со страницы в единое модальное окно, а в заголовок списка добавлено явное действие создания;
- таблица пользователей получила абстрактный центрированный вариант для заголовков, данных, статусов и действий;
- подпись «Временный пароль» заменена на «Пароль», действие «Отключить» — на «Деактивировать»; для единственного активного администратора кнопка деактивации недоступна, а серверная защита последнего администратора сохранена.

### Проверки

- formatter, lint, typecheck, все 136 unit/contract тестов и production build панели прошли;
- `smoke:users` подтвердил роли, назначения проектов, read-only доступ и отзыв сессии; development server отвечает на readiness-check по `http://localhost:3000`.

## 2026-09-09 — Единые toast-уведомления

### Изменения

- создан единый глобальный стек уведомлений на toast-примитивах `reka-ui`; уведомления появляются справа внизу, складываются вертикально, поддерживают авто-закрытие, паузу при взаимодействии, swipe и ручное закрытие SVG-кнопкой;
- успешные и ошибочные результаты действий на экранах входа, проектов, пользователей, настроек, ассистента, провайдера, prompts, документов и URL-источников переведены с inline-сообщений на общий toast API;
- устаревшие `form-message`, `prompt-message`, `provider-message` и `assistant-message` удалены; постоянные пояснения прав и ошибки загрузки остались inline как состояния экрана под отдельным классом `form-note`;
- рабочие примеры успешного и ошибочного уведомления добавлены в раздел «Компоненты»; анимация учитывает системную настройку reduced motion.

### Проверки

- formatter, lint, typecheck, все 136 unit/contract тестов и production build панели прошли;
- headless Chrome подтвердил появление тоста, фиксированную позицию с отступами 24 px справа и снизу, отсутствие legacy message-классов и горизонтального overflow на 1440 px.

## 2026-09-09 — Настройки проекта внутри обзора

### Изменения

- разделы переименованы единообразно в навигации и заголовках: «Обзор проекта», «Управление проектами» и «Управление пользователями»;
- обзор показывает название выбранного проекта под подписью «Текущий проект»; пояснение о синхронизации данных удалено;
- из topbar удалено дублирующее название проекта и связанные стили;
- вся рабочая форма прежнего раздела «Настройки» перенесена в обзор: название, российский часовой пояс, основной сайт, идентификатор, проверка прав и сохранение с toast-уведомлением;
- пункт «Настройки» и дублирующая карточка быстрого действия удалены; старый project-scoped URL настроек сохраняет выбранный проект и перенаправляет на обзор;
- действие «Открыть» в управлении проектами теперь выбирает проект и ведёт непосредственно на его обзор; fallback переключателя проекта для недоступных или устаревших маршрутов также ведёт на обзор.

### Проверки

- typecheck и 8 unit-тестов панели прошли, включая новый сценарий маршрутизации legacy settings;
- авторизованный SSR-прогон подтвердил название текущего проекта, полный блок настроек, новые названия разделов, отсутствие старой подписи, `topbar__project` и settings-ссылки, а также redirect прежнего URL настроек на `/`.
- browser-проверка подтвердила, что название выбранного проекта больше не скрывается общим правилом заголовков и остаётся видимым без горизонтального overflow.

## 2026-09-09 — Единые настройки ассистента

### Изменения

- отдельные пункты «Ассистент», «Prompts», «База знаний» и «Провайдер и модели» объединены в один пункт боковой панели «Настройки ассистента»;
- все входящие в раздел экраны получили общую верхнюю панель вкладок: «Интерфейс», «Внешний вид», «Безопасность и ограничения», «Роль и поведение», «База знаний» и доступная администратору «Интеграция»; существующие URL и deep links сохранены;
- «Внешний вид» содержит тексты, отображение и параметры виджета, а «Безопасность и ограничения» — разрешённые Origins, runtime-лимиты и перенесённый из «Интерфейса» срок хранения диалогов;
- прежний раздел «Prompts» переименован в «Роль и поведение»: отдельный блок создания убран, список сделан основным содержимым, кнопка «Создать» расположена под ним и открывает прежнюю форму в общем модальном окне;
- из всех корневых и вложенных экранов внутри вкладок настроек ассистента удалены дублирующие `page-header`; необходимые переходы к списку документов, источникам и ролям сохранены отдельными компактными действиями;
- у списка «Роль и поведение» удалён внутренний `section-header prompt-list__header`, поэтому таблица начинается сразу под панелью вкладок;
- HTML `caption` удалены из всех таблиц панели; доступные названия таблиц сохранены через `aria-label` без дополнительного визуального или скрытого блока разметки;
- вспомогательные надзаголовки удалены из всей панели управления, каталога компонентов и preview-host виджета вместе с неиспользуемыми стилями; паттерн больше не используется в проекте;
- дублирующие заголовочные блоки удалены над таблицами ролей, пользователей, документов и настроенных источников; названия колонок `thead` сохранены как необходимая структура данных;
- все таблицы используют единое выравнивание: заголовки и содержимое ячеек расположены слева и центрированы по вертикали; отдельный центрированный вариант таблицы пользователей и центрирование checkbox-колонки результата обхода удалены;
- раздел «Провайдер и модели» переименован в «Интеграция»; в него перенесён публичный Assistant ID и сведения о draft/production revision;
- во вкладке «Интеграция» удалены все вспомогательные надзаголовки, блок публичного идентификатора перенесён последним и при коротком содержимом прижат к нижней границе страницы;
- каталог и выбор моделей показываются только для проверенного provider credential со статусом `verified` и непустого каталога доступных моделей; без подключённого провайдера остаётся только форма ключа и публичный идентификатор;
- общий route-aware компонент вкладок и его абстрактные классы `tab-bar` добавлены в каталог дизайн-компонентов; вкладки прокручиваются внутри панели на узком экране, не расширяя страницу;
- добавлены unit-тесты распознавания корневых и вложенных маршрутов объединённого раздела.

### Проверки

- formatter, lint, typecheck и 11 unit-тестов панели прошли;
- авторизованный browser-прогон проверил все шесть вкладок, единый заголовок и активное состояние, отсутствие прежних отдельных пунктов sidebar, перенос публичного идентификатора и отсутствие горизонтального overflow на 1440 и 390 px.
- отдельная проверка отключённого провайдера подтвердила отсутствие блока моделей и вспомогательных надзаголовков, последний порядок публичного идентификатора и точное прилегание его нижней границы к нижней границе контентной страницы.
- browser-проверка «Роли и поведения» подтвердила отсутствие прежнего блока создания, единственную кнопку под списком и открытие полной формы в модальном окне; во вкладке ограничений срок хранения следует после Origins и runtime-параметров, а в «Интерфейсе» больше не отображается.
- browser-прогон семи экранов вкладок подтвердил отсутствие `page-header`, `caption` и `prompt-list__header`, сохранённые доступные имена таблиц и отсутствие горизонтального overflow.
- browser-прогон входа, обзора, проектов, пользователей, компонентов, ролей и базы знаний подтвердил полное отсутствие вспомогательных надзаголовков и шапок списочных таблиц без нарушения раскладки или горизонтального overflow.

## 2026-09-09 — Упрощение вкладок интерфейса

### Изменения

- вкладка «Внешний вид» переименована в «Интерфейс», а прежняя пустая вкладка «Интерфейс» удалена;
- прежний URL `?tab=appearance` сохранён как совместимый переход в объединённую вкладку «Интерфейс»;
- содержимое всех `section-header` выровнено по центру по вертикали единым базовым правилом без локальных модификаторов.

### Проверки

- formatter, lint, typecheck, 11 unit-тестов, production build и `git diff --check` прошли;
- работающий проект подтвердил готовность API ответом HTTP 200.

## 2026-09-09 — Подсказка для разрешённых адресов

- техническая формулировка про Origin и wildcard заменена на «* Только точный URL, например https://sitename.ru»;
- подсказка перенесена под список разрешённых адресов и теперь относится ко всему списку.

## 2026-09-09 — URL-адреса и удаление из списка

- пользовательский термин Origin заменён в интерфейсе на «URL-адрес», включая заголовок, поле, добавление и ошибки валидации;
- текстовая кнопка удаления адреса заменена на общий `icon-button` с danger-модификатором, доступным названием и новой SVG-иконкой корзины;
- иконка корзины добавлена в общий SVG-спрайт, типизированный компонент `UiIcon` и каталог компонентов.

## 2026-09-09 — Подключение

- вкладка «Интеграция» переименована в «Подключение» в настройках ассистента и каталоге компонентов;
- внутренний идентификатор и маршрут провайдера сохранены для совместимости.

## 2026-09-09 — Автоматическое определение среды URL

- поле «Среда» и видимая подпись URL удалены из списка разрешённых адресов; поле ввода сохраняет доступное имя через `aria-label`;
- клиент больше не отправляет среду: сервер автоматически назначает `preview` адресам localhost/loopback и `production` всем остальным;
- HTTP допускается только для автоматически определённых локальных preview-адресов, внешние адреса по-прежнему требуют HTTPS;
- входной API-контракт больше не принимает управляемое клиентом поле `environment`, при этом вычисленное значение сохраняется в БД и возвращается в ответе.

## 2026-09-09 — Выравнивание верхней навигации

- `project-switcher` и `tab-bar` получили общую высоту 46 px, одинаковое скругление и параметры границы;
- верхние элементы боковой панели и рабочей области визуально выровнены по одной горизонтали;
- у общей подсказки `form-field__hint` сброшен стандартный внешний отступ;
- технический заголовок «Runtime» заменён на «Ограничения работы».
- кнопка удаления в строке URL переведена с compact на базовый размер `icon-button` 40 × 40 px, равный высоте поля, и остаётся квадратной;
- smoke-сценарии ассистента и копирования проектов обновлены под входной контракт без поля среды.

### Проверки

- formatter, полный lint и typecheck monorepo прошли;
- прошёл 141 unit-тест всех пакетов и приложений;
- после перезапуска dev-сервера интеграционный smoke управления проектами прошёл с новым контрактом URL;
- production build панели, `git diff --check` и проверка готовности работающего API завершились успешно.

## 2026-09-09 — Внутренние отступы полей

- базовый `padding` компонента `.form-field__control` изменён на `6px 10px` для всех полей формы.
- подпись «Timeout ответа, секунд» локализована как «Таймаут ответа, секунд».
- техническая подпись «Контактный fallback» переименована в понятный пользователю «Резервный контакт»; внутренний контракт сохранён.

## 2026-09-09 — Список записей базы знаний

- действие «Источники сайта» переименовано в «Парсинг данных»; рядом добавлены действия «Загрузить документ» и «Создать запись»;
- встроенный блок «Создать черновик» удалён со страницы списка, а форма вынесена на отдельный маршрут создания записи;
- список ограничен шириной узкого каркаса страницы и получил быстрый поиск по названию, типу и статусу;
- добавлен кастомный выбор размера страницы: 10 по умолчанию, 25, 50, 100, 500 или все записи;
- добавлены диапазон и общее число записей, номер и количество страниц, переходы назад/вперёд и нумерация с многоточиями при количестве страниц больше семи;
- алгоритм сокращённой нумерации вынесен в отдельную утилиту и покрыт unit-тестами;
- до реализации защищённого file-upload кнопка загрузки показывает честное toast-уведомление о недоступности функции.

### Проверки

- formatter, lint, typecheck, 15 unit-тестов панели, production build и `git diff --check` прошли;
- авторизованный browser-прогон подтвердил три действия, отсутствие прежнего блока создания, наличие поиска и селекта, переход на отдельную форму и отсутствие горизонтального overflow;
- работающий API подтвердил готовность ответом HTTP 200.

## 2026-09-11 — Диагностика и восстановление подключения AITUNNEL

### Причина

- локальный процесс панели был запущен без `CREDENTIAL_ENCRYPTION_KEY`, поэтому сохранение нового
  provider credential корректно блокировалось защитой от известного development master key;
- credential проекта «Гофропродпак» был зашифрован другим master key версии 1, которого больше нет
  в окружении; AES-256-GCM аутентификация сохранённого envelope текущим ключом не проходит;
- сервер ошибочно перехватывал классифицированные ошибки keyring/decryption и возвращал общий 500
  `Provider operation failed`.

### Изменения

- H3-ошибки конфигурации provider теперь сохраняют исходный HTTP-статус и безопасный код;
- невозможность расшифровать credential получила отдельный код
  `CREDENTIAL_DECRYPTION_FAILED` и понятное сообщение во вкладке «Подключение»;
- audit и `last_error_code` сохраняют точную причину вместо `PROVIDER_OPERATION_FAILED`;
- добавлена команда `pnpm dev:secrets`: она один раз создаёт случайный master key в игнорируемом
  корневом `.env`, не выводит его и не заменяет существующий;
- `pnpm dev:setup` вызывает настройку секрета автоматически, а Nuxt-панель и worker локально читают
  общий корневой `.env`;
- добавлены негативные тесты на сохранение H3-ошибки и классификацию несовместимого AES-GCM
  envelope; документация локального запуска и ротации обновлена.

### Ограничение восстановления

- без прежнего master key старый ciphertext невозможно расшифровать; для текущего локального
  контура создан новый key version 2, после чего администратору нужно повторно ввести действующий
  AITUNNEL-ключ. Сам AITUNNEL credential и master key в Git, вывод команд и журнал не попадают.

### Проверки

- прошли полный lint, typecheck, 147 unit/contract-тестов, production build и `git diff --check`;
- повторный `pnpm dev:secrets` подтвердил идемпотентность и не изменил локальный `.env`;
- перезапущенная панель вернула для старой записи `503 CREDENTIAL_KEY_VERSION_UNAVAILABLE` вместо
  общего 500;
- сохранение синтетического неверного ключа прошло проверку master key и дошло до AITUNNEL, который
  ожидаемо вернул `PROVIDER_CREDENTIAL_INVALID`; существующий ciphertext не был заменён;
- актуальный официальный контракт AITUNNEL подтверждает base URL и проверку ключа через
  `GET /v1/aitunnel/key` с Bearer-авторизацией.

## 2026-09-11 — Упрощение редактора роли агента

### Изменения

- создание роли вынесено из модального окна на отдельный маршрут `/prompts/new`;
- страница создания содержит только название, описание, инструкцию и действия «Сохранить как черновик» и «Применить»;
- страница редактирования переведена на двухколоночную сетку: единый редактор слева и компактный список версий справа, ниже расположены preview и опасные действия;
- название и описание обновляются отдельно, а сохранение черновика создаёт новую неизменяемую версию без переключения текущей;
- действие «Применить» использует выбранную сохранённую версию либо сначала сохраняет изменённый текст и затем делает новую версию текущей;
- выбор версии сразу подставляет её текст в редактор; текущая версия и последний неприменённый черновик отмечаются в списке;
- из интерфейса удалены дублирующие заголовки блоков, повторный просмотр текста версии и техническая сводка переменных/синтаксиса; серверная проверка шаблона сохранена.

### Проверки

- formatter, полный lint и typecheck монорепозитория, 150 unit/contract-тестов и production build прошли;
- авторизованный browser-прогон подтвердил отдельный маршрут создания, единственный редактор, отсутствие заголовков блоков, переключение текста четырёх версий и двухколоночную сетку без горизонтального overflow;
- адаптивная проверка на ширине 390 px подтвердила переход к одной колонке и отсутствие горизонтального overflow.

## 2026-09-11 — Удаление ролей, версий и единые подтверждения

### Изменения

- все существовавшие inline-подтверждения проектов, ключа провайдера, документов БЗ и ролей заменены общим модальным компонентом `ConfirmModal`;
- действие «Удалить физически» переименовано в «Удалить» и теперь удаляет роль целиком: версии, публикации и связанные технические generation runs;
- удаление текущей роли сбрасывает активную публикацию и останавливает runtime до применения другой роли; audit-событие удаления сохраняется;
- для каждой версии добавлена SVG-кнопка удаления с модальным подтверждением; текущая и единственная версия защищены от отдельного удаления;
- удаление отдельной нетекущей версии и полное удаление роли больше не требуют недавнего повторного входа; обе операции сохраняют проверку прав, CSRF и модальное подтверждение;
- уведомление после удаления версии не показывает технический номер и содержит текст «Версия удалена»;
- все нетекущие версии отображаются как «Черновик», статусы вынесены в `status-badge`;
- строки версий уплотнены;
- из строк версий удалён видимый номер: в селекторе остаются дата, создатель, статус и SVG-кнопка удаления;
- колонка статусов получила фиксированную ширину, поэтому «Текущий» и «Черновик» не смещают сетку строк;
- дата, создатель, статус и удаление визуально объединены общим фоном и рамкой строки версии; выбранное состояние применяется ко всей строке;
- форма тестового запроса перенесена в сайдбар под списком версий; после запуска сразу открывается модальное окно с отправленным текстом и состоянием ожидания, которое затем сменяется ответом, диагностикой и источниками;
- действия архивации и полного удаления роли перенесены в нижнюю часть того же сайдбара;
- блок архивации и удаления прижат к нижней границе сайдбара, а список версий ограничен четырьмя строками с прокруткой последующих;
- обновление названия и описания перенесено в один ряд с полями и представлено общей квадратной SVG-кнопкой сохранения;
- пояснения под тестовым вопросом разбиты на отдельные строки со звёздочками и вынесены в переиспользуемый `BaseNote`, добавленный в каталог компонентов;
- в пояснении о расходе бюджета конкретное название AITUNNEL заменено на нейтральное «провайдер»;
- ручное изменение размеров отключено у всех многострочных полей приложения через общее правило `textarea`;
- единый `BaseModal` больше не закрывает окна по клику вне контента; доступны только крестик и Escape;
- клик вне `BaseModal` запускает короткую плавную анимацию подъёма и возврата окна, визуально подсказывая доступные способы закрытия;
- для чувствительных операций с ключом добавлена повторная авторизация без выхода: отдельный endpoint проверяет текущий пароль, обновляет `reauthenticated_at` сессии и открывает 30-минутное окно;
- при истёкшем окне сохранение, замена или удаление ключа открывает `ReauthenticateModal`, сохраняет введённый ключ и автоматически повторяет исходное действие; обычная проверка сохранённого ключа повторного пароля не требует;
- каталог компонентов дополнен примером общего окна подтверждения.

### Проверки

- formatter, полный lint и typecheck монорепозитория, 153 unit/contract-теста и production build прошли;
- изолированный `smoke:prompts` подтвердил защиту текущей версии, удаление ранее применённой нетекущей версии, полное удаление текущей роли и остановку runtime;
- `smoke:admin` подтвердил строгий контракт повторной авторизации, отказ по неверному паролю, успешное обновление 30-минутного окна и audit-событие;
- авторизованный browser-прогон подтвердил статусы одной текущей и трёх черновых версий, недоступность удаления текущей версии, SVG-кнопки, оба модальных окна и отсутствие горизонтального overflow.

## 2026-09-11 — Одна роль ассистента на проект

### Решение

- отдельный каталог ролей признан лишним уровнем для текущей модели продукта: у проекта один ассистент и одна рабочая роль;
- «Текущий» и «Черновик» остаются статусами версий этой роли, а не отдельными вложенными ролями;
- прежние записи автоматически не удаляются: для существующего проекта выбирается роль активной публикации, иначе последняя неархивная.

### Изменения

- вкладка «Роль и поведение» больше не показывает таблицу и кнопку «Создать», а сразу открывает полноценный редактор роли;
- если в проекте ещё нет рабочей роли, вкладка сразу открывает форму первичной настройки;
- прямой переход к созданию при существующей рабочей роли возвращает пользователя в её редактор;
- API блокирует создание второй неархивной роли кодом `PROJECT_PROMPT_ALREADY_EXISTS`;
- при создании проекта по шаблону копируется только одна роль: активная опубликованная либо последняя неархивная;
- после архивации вкладка переходит к первичной настройке новой рабочей роли.

### Проверки

- formatter, полный lint, typecheck панели, все 156 unit/contract-тестов, production build и `git diff --check` прошли;
- `smoke:prompts` подтвердил блокировку второй рабочей роли и сохранение CRUD, версий, публикации, отката и удаления;
- авторизованный SSR-запрос подтвердил переход таба `/prompts` прямо в редактор выбранной рабочей роли; браузерная поверхность текущего сеанса была недоступна, поэтому визуальная проверка в этот проход не выполнялась.

## 2026-09-11 — Двухколоночная сетка подключения

- вкладка «Подключение» переведена на сетку по аналогии с редактором роли: настройки ключа и моделей находятся в основной колонке;
- сводка `credential-summary` перенесена в правый сайдбар и адаптирована под его ширину;
- блок публичного идентификатора перенесён туда же и прижат к нижней границе доступной области через общий модификатор `panel--push-end`;
- специфичные классы сетки редактора роли заменены общими `split-layout` и `panel-stack`, чтобы обе вкладки использовали одну реализацию по правилу DRY;
- техническая подпись `AES-256-GCM · key version N` означает алгоритм шифрования credential и версию серверного master key, а не версию ключа AITUNNEL.
- техническая подпись `AES-256-GCM · key version N` удалена из пользовательского интерфейса; значение сохранено в API и серверной диагностике.
- сводка credential в сайдбаре сокращена до ключа, остатка бюджета, срока действия и даты последней проверки; поля выстроены в одну колонку.
- проверка сохранённого ключа перенесена из формы замены под сводку credential в сайдбаре и получила короткую подпись «Проверить ключ».
- кнопка «Проверить ключ» включена внутрь общего блока `credential-summary`;
- из публичного идентификатора удалены технические поля черновика и production, поле переименовано из Assistant ID в «Публичный идентификатор», а подпись и значение расположены вертикально.
- внешний panel и дублирующий заголовок публичного идентификатора удалены; внизу сайдбара оставлена только информационная плашка `readonly-summary`.
- поле «Ключ» в сводке подключения переименовано в «Текущий ключ».
- заголовок «Ключ провайдера» и техническая подсказка под полем удалены;
- поле замены ключа переименовано в «Добавить новый ключ», основное действие — в «Активировать»;
- удаление ключа перенесено в сводку справа от проверки и заменено общей квадратной SVG-кнопкой корзины.
- у формы ключа удалены собственный верхний margin и ставший лишним класс `provider-key-form`; расстояние задаёт родительская панель;
- в гайд разметки добавлено правило: дочерний элемент не отталкивает себя от родителя или соседа внешним margin, межкомпонентные интервалы принадлежат родительским `gap`/`padding`;
- если провайдер не передал срок действия ключа, интерфейс показывает «Бессрочно» вместо прочерка.
- нижняя плашка публичного идентификатора получила общую с ячейкой credential-сводки минимальную высоту 86 px и вертикальное центрирование; её нижняя граница сохраняет выравнивание с нижней границей блока моделей.
- кнопки проверки и удаления ключа получили абстрактные размерные модификаторы высотой 44 px; icon-only удаление остаётся квадратным 44 × 44 px, варианты добавлены в каталог компонентов.
- `credential-summary` уплотнён: высота строк уменьшена с 86 до 70 px, padding — с 16 до 12 px, внутренний gap — с 6 до 4 px; нижняя плашка идентификатора сохраняет высоту одной строки грида.
- из сетки подключения удалено растягивание на всю высоту экрана: нижняя плашка публичного идентификатора теперь выравнивается по нижней границе фактической секции моделей.
- действие «Активировать» заменено квадратной SVG-кнопкой с иконкой проверки и размещено справа от поля нового ключа через общий layout-класс `form-row`.
- текст «Добавить новый ключ» перенесён из видимой подписи в placeholder; доступное имя поля сохранено скрытой подписью.
- бренд AITUNNEL удалён из пользовательских заголовков, подтверждений, подсказок и ошибок панели; интерфейс использует нейтральный термин «провайдер», а технический adapter и контракт ключа не изменены;
- все формы панели и виджета получили `novalidate`: browser validation pop-up отключён, ошибки обрабатываются собственной логикой и серверными runtime-схемами;
- правило кастомной валидации добавлено в гайд разметки и защищено unit-тестом, который проверяет каждый Vue-form панели и виджета.
- названия моделей подключения локализованы: «Диалоговая модель (Chat model)», «Модель векторизации (Embedding model)» и «Модель переранжирования (Rerank model)»;
- под каждым выбором модели добавлена заметка о её назначении; существующие ограничения режима `auto` и переиндексации включены в те же заметки.
- после выбора модели векторизации, не совпадающей с активным индексом, постоянное предупреждение о необходимости переиндексации показывается в общем `topbar`, в том числе в разделе «База знаний»;
- предупреждение использует серверный статус индекса, сохраняется после перезагрузки и исчезает после успешного построения актуального индекса;
- состояние индекса синхронизировано между layout, настройками подключения и базой знаний, поэтому плашка появляется сразу после сохранения модели и обновляется при фоновой переиндексации;
- сразу после успешного сохранения изменённой модели векторизации `toast__message` сообщает, что требуется переиндексация базы знаний; сохранение остальных модельных настроек использует обычное уведомление.
- реактивная плашка `topbar` больше не зависит от количества опубликованных фрагментов: выбор новой модели включает её без перезагрузки страницы, а снять её может только появление активного индекса на выбранной модели.
- общий layout продолжает опрашивать сервер во время состояний `queued` и `building`, поэтому плашка исчезает сразу после завершения переиндексации даже после ухода со страницы базы знаний.
- успешное сохранение изменённой модели отдельно выставляет общий реактивный флаг ожидаемой переиндексации; `topbar` больше не ждёт обновления объекта API и гарантированно перерисовывается в текущей странице.
- общая строка счётчиков каталога удалена, количество доступных вариантов перенесено в подпись каждого поля модели;
- дата каталога подписана «Последняя синхронизация» и выводится числовым форматом `ДД.ММ.ГГГГ, ЧЧ:ММ`;
- под `Temperature` добавлены назначение, диапазон 0–2 и рекомендация 0,2;
- под максимумом токенов показана простая рекомендация оставить 1500; фактический предел выбранной модели проверяется до отправки формы.
- числовые поля теперь немедленно ограничивают введённое значение: `Temperature` диапазоном 0–2, токены — диапазоном выбранной модели; нативные `min`/`max` остаются дополнительной семантикой;
- подсказка токенов различает оборванный ответ, для которого лимит увеличивают, и слишком длинный ответ, для которого лимит уменьшают;
- значение 1500 обозначено как стартовый дефолт проекта, а не рекомендация модели; технический `max_output` модели снова показан отдельно от фактического лимита панели в 64 000 токенов;
- клиентский предел токенов рассчитывается как меньшее из `max_output` выбранной модели и контрактного ограничения приложения 64 000, поэтому интерфейс больше не предлагает значение, которое API отклонит.
- примечание модели векторизации уточняет её влияние на смысловую релевантность найденных фрагментов, скорость и стоимость индексации/поиска и отдельно сообщает, что текст ответа формирует другая модель.
- примечание максимума токенов сокращено до фактического поведения: верхний предел длины одного ответа, влияние на потенциальный расход бюджета, максимум панели и отдельный технический максимум выбранной модели; стартовый дефолт и размытые советы удалены.
- поле `Temperature` и сообщение его валидации локализованы как «Температура».
- признак необязательного поля перенесён в скобки: «Температура (опционально)» и «Модель переранжирования (Rerank model, N, опционально)».
- настройка переименована в понятное «Вариативность ответа (Temperature, опционально)»; технический термин сохранён в скобках, placeholder локализован как «По умолчанию модели».
- базовая подпись поля `form-field__label` исправлена со старых 13 px / 600 на 12 px / 400; правило закреплено в гайде форм без локальных переопределений.
- определение несовпадения модели вынесено в общий helper и покрыто отдельными тестами для нового, актуального и устаревшего индекса;
- для постоянных сообщений страницы добавлен общий `BaseNotice` и его пример в каталоге компонентов;
- значение отсутствующего срока действия ключа изменено на «Бессрочно», текстовые значения `credential-summary` уменьшены до 12 px и веса 400.
- кнопка активации ключа использует общую SVG-иконку `save` вместо плюса.
- одноколоночные layout-контейнеры переведены с CSS Grid на `flex-direction: column`, включая поля форм, панели, вертикальные списки и стеки; настоящие многоколоночные сетки сохранены на Grid;
- правило выбора Flex для вертикального потока и Grid только для двухмерной раскладки закреплено в гайде разметки.
- подписи `form-field__label` ограничены одной строкой и при переполнении обрезаются многоточием; составные подписи сохраняют справа счётчик или другое дополнительное значение.
- описание копирования проекта сокращено до существенного ограничения: домены, контакты, настройки провайдера и модели не переносятся.
- кнопка сохранения настроек моделей переименована в «Применить» и доступна только при отличии хотя бы одного поля формы от сохранённых значений.
- форма создания проекта переименована в «Добавить проект», техническая подпись о пустых доменах, credential и моделях удалена.
- основная кнопка формы добавления проекта сокращена с «Создать проект» до «Создать».
- форма добавления проекта получила кастомную проверку обязательных полей: пустое название и неподдерживаемый часовой пояс блокируют запрос, отмечают поле и показывают русскую ошибку;
- пользовательские `statusMessage` всех API-маршрутов и бизнес-ограничений переведены на русский язык, как и собственные сообщения runtime-контрактов;
- для неожиданных ошибок `/api/**` добавлен общий обработчик: он возвращает безопасное русское сообщение, сохраняет технический код/данные ожидаемой ошибки и не показывает внутренний англоязычный текст;
- тесты фиксируют русскую локализацию серверных и контрактных сообщений, а также обязательность полей формы проекта;
- раздел управления проектами полностью переведён: технические слова `runtime`, `audit`, `retention` и `jobs` заменены понятными русскими формулировками.
- уточнение о формате разрешённых URL перенесено непосредственно под заголовок секции.
- лишняя обёртка `assistant-origin-list` удалена, строки URL участвуют в основном вертикальном потоке формы, а уточнение о точном URL расположено после всего списка полей.
- пояснение о сроке хранения диалогов оформлено как заметка со звёздочкой.
- отдельные действия сохранения черновика и публикации настроек ассистента объединены в одну кнопку «Применить»: она сохраняет изменённую конфигурацию и сразу делает её активной; кнопка срока хранения также переименована в «Применить».

### Проверки

- formatter, lint, typecheck, 35 тестов панели и виджета, production build и `git diff --check` прошли успешно.
