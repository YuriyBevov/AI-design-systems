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

## 2026-09-15 — Сырой обход сайта и ИИ-нормализация БЗ

### Решение

- перед изменениями создан snapshot-коммит `47c1f61`;
- discovery принимает URL и глубину, объединяет sitemap и навигационные меню главной страницы и возвращает полное вложенное дерево;
- пользователь выбирает точные узлы или поддеревья для обхода;
- crawler больше не ищет JSON-LD, schema.org, microdata или товарные поля: он извлекает заголовок, сырой `body` text и ссылки;
- worker отдельно передаёт сырой текст в AITUNNEL: ИИ удаляет контентный шум, выбирает `info|product|service` и возвращает строго валидируемые название и Markdown;
- контент сайта отделён от system prompt и считается недоверенным; ответ ИИ проходит runtime-валидацию;
- тип `service` добавлен в контракты и PostgreSQL enum;
- редактор БЗ сокращён до названия, типа, единого Markdown-описания и URL источника; товарные характеристики больше не имеют отдельных UI-полей;
- продуктовые действия сокращены до «Опубликовать» и «Снять с публикации»; immutable versions оставлены только как внутренний механизм аудита и optimistic concurrency;
- решение зафиксировано в ADR-005.

### Ограничения

- текущий pipeline создаёт одну запись БЗ на одну страницу и не разбивает категорию с несколькими товарами на отдельные записи;
- для каждой страницы выполняется отдельный модельный вызов;
- JavaScript-rendered content без SSR не извлекается;
- для запуска нужны проверенный provider credential и выбранная chat-модель.

### Проверки

- миграция `0012_green_gwen_stacy.sql` применена к локальной PostgreSQL;
- formatter, lint, typecheck, 173 теста, production build, `git diff --check` и readiness-проверка PostgreSQL/Redis прошли успешно;
- development-серверы панели, worker и widget preview остались запущены.

## 2026-09-15 — Раскрывающееся дерево структуры сайта

### Решение

- серверная ошибка discovery на крупных сайтах исправлена: контракт дерева принимает до 10 000
  корневых и дочерних узлов вместо прежнего ограничения 500;
- добавлен общий `BaseTreeSelect` с рекурсивным раскрытием, SVG-chevron и доступными состояниями
  `aria-expanded`/`aria-checked="mixed"`;
- выбор родителя каскадно включает или снимает всё поддерево, частичный выбор дочерних узлов переводит
  родителя в промежуточное состояние, а полный выбор восстанавливает его отметку;
- страница источников БЗ переведена со всегда раскрытого списка и отдельного флажка вложенности на
  общий компонент дерева;
- полностью выбранные ветви автоматически сжимаются в URL-префиксы, отдельные листья сохраняются как
  точные пути;
- в каталоге компонентов добавлен интерактивный пример выбора регионов;
- содержимое строки дерева выстроено горизонтально, URL узла отображается в скобках после названия;
- прежний специализированный `KnowledgeSiteTreeNode` удалён.

### Проверки

- добавлены regression-тест контракта на 501 дочерний узел и unit-тесты каскадного выбора,
  промежуточного состояния и сжатия URL-областей;
- все 178 тестов workspace, общий lint, typecheck и production build панели прошли успешно;
- readiness панели, PostgreSQL и Redis подтверждён, development-серверы панели, worker и widget
  preview оставлены запущенными.

## 2026-09-15 — Доступ worker к master key credential

### Исправление

- ошибка `CREDENTIAL_KEY_VERSION_UNAVAILABLE` воспроизведена при запуске обхода: credential в БД и
  корневой `.env` использовали версию 2, но дочерний процесс worker в watch-режиме запускался только
  со вторым устаревшим путём `apps/control-panel/.env` и получал дефолтную версию 1;
- из `dev` и `start` worker удалён несуществующий второй `--env-file-if-exists`; единственным
  источником server secrets оставлен общий корневой `.env`, как предусмотрено руководством запуска;
- сохранённые provider credentials и сами master keys не изменялись.

## 2026-09-15 — Таймаут ИИ-нормализации страниц

### Исправление

- итоговая ошибка `CRAWL_NO_PAGES_EXTRACTED` разобрана по строкам запуска: все семь страниц были
  скачаны с HTTP 200, но каждая ИИ-нормализация завершилась `PROVIDER_TIMEOUT`;
- crawler больше не использует общий восьмисекундный provider timeout для длинной потоковой
  нормализации;
- добавлен отдельный `KNOWLEDGE_CRAWL_AI_TIMEOUT_MS` с безопасным диапазоном 10–120 секунд и
  значением по умолчанию 60 секунд;
- unit-тест проверяет передачу отдельного лимита в `streamChat`, config-тесты фиксируют default и
  границы настройки.

## 2026-09-15 — Полная нормализация страницы и редактируемый prompt

### Причина и решение

- отсутствие описаний товаров воспроизведено на карточке gofroprodpak.ru: исходный `body.text()`
  содержал около 80 тысяч символов, а прежний лимит 30 тысяч завершался внутри встроенного
  JavaScript-объекта до расположенного ниже видимого описания;
- extractor теперь удаляет только невидимые технические узлы `script`, `style`, `noscript`,
  `template` и `svg`, сохраняет весь видимый boilerplate для ИИ и допускает до 120 тысяч символов;
- regression fixture фиксирует, что большой script перед описанием больше не вытесняет полезный
  контент;
- prompt по умолчанию требует перенести без резюмирования все уникальные относящиеся к предмету
  страницы факты, включая полное описание, назначение, материалы, свойства, ограничения,
  характеристики, цены, наличие и условия;
- максимальный ответ нормализатора увеличен с 4 до 10 тысяч токенов при прежней строгой JSON-схеме
  и пределе Markdown 30 тысяч символов;
- редактируемый операторский prompt добавлен в форму URL-источника и сохраняется снимком в каждом
  crawl run; неизменяемая safety policy отдельно запрещает инструкции страницы и выдуманные факты;
- извлечённые raw title/text сохраняются в `knowledge_crawl_pages`, но не возвращаются API;
  интерфейс показывает только возможность повторной обработки;
- после завершения run prompt можно изменить и запустить новый AI-only run по сохранённым страницам
  без повторного обращения к сайту; исходный run не переписывается;
- контракт, модель данных, API, архитектура и эксплуатационные руководства обновлены; решение
  зафиксировано в ADR-007.

### Проверки

- миграция `0013_lumpy_klaw.sql` применена к локальной PostgreSQL, наличие колонок raw content и
  снимка prompt подтверждено прямой проверкой схемы;
- regression-тест на полное описание проверен как fixture и на реальной карточке gofroprodpak.ru:
  после удаления технических узлов видимый текст содержит 8 813 символов и описание товара;
- все 182 теста workspace, общий lint, typecheck, production build и `git diff --check` прошли
  успешно;
- в браузере проверены редактируемые поля prompt до и после парсинга, включая недоступность
  повторной обработки для исторических run без сохранённого raw content;
- readiness панели, PostgreSQL и Redis подтверждён; development-серверы панели, worker и widget
  preview оставлены запущенными.

## 2026-09-15 — Устойчивое управление парсингом

### Причина и решение

- в активном run подтверждены массовые ошибки: при 11 обработанных страницах восемь завершались
  `PROVIDER_TIMEOUT`, одна — `CRAWL_AI_RESPONSE_INVALID`; сырой текст составлял 7–31 тысячу
  символов и не был причиной сбоя;
- прежний 60-секундный таймер ограничивал весь streaming response и обрывал длинный ответ даже при
  продолжающемся поступлении данных;
- для ИИ-нормализации общий предел увеличен до 300 секунд, добавлен отдельный 60-секундный idle
  timeout, который сбрасывается при каждом фрагменте потока;
- provider adapter получил `response_format`, нормализация включает JSON Mode, а невалидный ответ
  или retryable provider error получает один ограниченный повтор;
- run хранит pause marker, worker проверяет его перед каждой новой страницей и продолжает ту же
  очередь URL после снятия паузы;
- для каждой строки результата добавлен точечный повтор: новый run заново скачивает только
  сохранённый URL и выполняет обычную ИИ-нормализацию;
- поле prompt-а постобработки временно исключено из render tree формы источника и блока результатов,
  CSS-скрытие оставлено как дополнительная защита; данные, снимки run и API сохранены;
- решение и эксплуатационные границы зафиксированы в ADR-008, контракты и руководства обновлены.

### Проверки

- миграция `0014_fluffy_killraven.sql` применена к локальной PostgreSQL, наличие
  `pause_requested_at` подтверждено прямой проверкой схемы;
- regression-тесты покрывают JSON Mode, полный и idle timeout, один повтор, pause hook перед fetch и
  строгие queue-контракты точечного запуска;
- все 187 тестов workspace, общий lint, typecheck, production build и `git diff --check` прошли
  успешно;
- авторизованный API smoke-test подтвердил pause, resume и запрет конкурирующего точечного запуска;
- в браузере подтверждены скрытие обоих редакторов prompt-а и кнопки «Парсить заново» в каждой
  строке результата;
- старый run штатно завершён без принудительного прерывания, после чего worker подхватил новую
  версию; readiness панели на порту 3000 и доступность widget preview на порту 4173 подтверждены.

## 2026-09-15 — DOM-очистка страницы до отправки в ИИ

### Причина и решение

- технический extractor расширен: до AI input удаляются `iframe`, `canvas`, `object`, `embed`,
  `audio`, `video`, статически скрытые элементы, а также прежние script/style/template nodes;
- из текста удаляются nav/aside/menu/dialog, внешний header/footer, их ARIA-эквиваленты и блоки с
  явными class/id marker-ами breadcrumbs, cookie/consent, pagination, social/share, subscription,
  modal/popup, menu/sidebar, callback/feedback, CTA, advertising и promo;
- удаляются только формы поиска, подписки, callback и feedback; содержательные product forms
  сохраняются;
- ссылки собираются до очистки DOM, поэтому меню и шапка не попадают в ИИ, но продолжают участвовать
  в расширении безопасной crawl-очереди;
- изменение архитектурной границы зафиксировано в ADR-009; ADR-005 и ADR-007 отмечены как частично
  заменённые.

### Проверки

- regression-тест подтверждает удаление технического и видимого boilerplate, сохранение main/article
  content внутри потенциально ложного `menu-open` wrapper, product form и ссылок из уже удалённой
  шапки;
- на `https://gofroprodpak.ru/catalog/kartonnye-korobki/` очищенный текст уменьшился с сохранённых в
  прежнем run 17 346 до 10 868 символов; header phones/footer исчезли, а заголовок, 22 упоминания цены,
  33 размера и 161 discovery link сохранились;
- все 187 тестов workspace, общий lint, typecheck, production build и `git diff --check` прошли
  успешно.

## 2026-09-15 — Формат строки узла структуры сайта

- metadata узла дерева приведена к единой строке без скобок вокруг URL;
- разделитель `·` заменён круглым маркером `•`: `Каталог /catalog/ • вложенных узлов: 662`.

## 2026-09-15 — Остановка и удаление приостановленного парсинга

### Причина и решение

- для paused run добавлена необратимая команда «Остановить» с модальным подтверждением; продолжение
  остаётся отдельным действием;
- остановка атомарно переводит только `running + paused` run в `cancelled`, после чего worker
  кооперативно завершает текущую операцию, записывает `finishedAt` и возвращает queue result
  `cancelled`, не меняя `lastErrorCode` источника;
- UI различает состояния «Приостановлен», «Останавливается» и «Остановлен», продолжает polling до
  подтверждения worker и только затем показывает действие «Удалить»;
- удаление разрешено только для подтверждённого остановленного run и каскадно очищает его
  `knowledge_crawl_pages`; уже созданные документы и версии БЗ сохраняются;
- чтение остановленного run сверяет три допустимых BullMQ job id и подтверждает завершение по
  терминальному состоянию очереди. Это позволяет корректно закончить остановку, начатую worker-ом
  предыдущей версии во время локальной hot-reload или rolling deployment;
- обе мутации требуют Editor/Owner, CSRF и tenant scope, используют строгие response-схемы и пишут
  безопасные audit events.

### Проверки

- typecheck и lint всех workspace-пакетов прошли;
- все 189 тестов workspace прошли, включая новые contract-сценарии удаления и queue result
  `cancelled`;
- `git diff --check` прошёл;
- авторизованный read-only API smoke повторно проверил текущий queued run: endpoint деталей вернул
  `200`, корректные status/pagination и не изменил ни один существующий запуск;
- работающие development-серверы не останавливались; текущий пользовательский paused run оставлен
  без изменений.

### Исправление зависшей очереди

- проверка PostgreSQL/BullMQ обнаружила отменённые run без `finishedAt`: один старый job уже был в
  `failed`, другой после graceful restart вернулся в `waiting`; из-за этого UI не разрешал удаление;
- reconciliation теперь блокирует удаление только для реально `active` job, а отменённый
  `waiting|failed|completed` job удаляет из BullMQ и подтверждает остановку в БД;
- автоматический выбор активного запуска больше не заменяет уже открытый остановленный run, поэтому
  кнопка «Удалить» остаётся доступной после завершения polling;
- read-only API-проверка согласовала зависшие run `f350…`, `9a40…` и `a830…`: все получили
  `finishedAt`; пользовательские run из БД не удалялись;
- после исправления в BullMQ остался только действительно активный run `f3b1…`, очередь ожидания
  пуста; typecheck и lint control-panel прошли.

## 2026-09-15 — Повтор временного PROVIDER_BAD_RESPONSE

- в run `f3b1…` технический fetch категории `/catalog/kartonnye-korobki/` завершился HTTP 200 и
  сохранил 10 868 символов очищенного текста, но AI-этап вернул `PROVIDER_BAD_RESPONSE`; соседняя
  товарная карточка в том же run обработалась успешно;
- точный диагностический вызов с сохранённым текстом, той же моделью и credential успешно вернул
  `product` и 1 707 символов Markdown, подтвердив временный сбой provider stream, а не проблему
  входного контента;
- crawl AI-normalizer теперь делает один ограниченный повтор для любого `PROVIDER_BAD_RESPONSE`, а
  не только для HTTP 400/JSON Mode rejection; постоянная ошибка остаётся failed после второй
  попытки;
- regression-тест воспроизводит неполный provider stream на первой попытке и успешный JSON на
  второй;
- typecheck, lint и 11 тестов worker прошли; `git diff --check` чист, development worker штатно
  перезапустился с новой логикой, а BullMQ `active` и `waiting` после завершения текущего run пусты.

## 2026-09-16 — Reasoning-модель не возвращала JSON общей страницы

- точная диагностика сохранённого raw content категории `/catalog/kartonnye-korobki/` показала:
  `deepseek-v4-flash-0731` при прежнем бюджете 10 000 токенов завершал stream с
  `finish_reason=length`, расходовал весь бюджет на reasoning и не отдавал ни одного content delta;
  пустой ответ затем ошибочно отображался как `CRAWL_AI_RESPONSE_INVALID`;
- crawl-нормализатор теперь использует `reasoning_effort=low`, бюджет 20 000 токенов и строгий
  provider JSON Schema; локальная runtime-валидация результата сохранена;
- `finish_reason=length` преобразуется в отдельный `CRAWL_AI_OUTPUT_TRUNCATED`, поэтому исчерпание
  output budget больше не смешивается с синтаксически неверным JSON;
- повторная диагностическая обработка той же общей страницы успешно вернула запись `info`
  «Картонные коробки» и 2 767 символов Markdown примерно за 49 секунд при прежнем транспортном
  лимите 1 MiB;
- в настройках модели проекта добавлен отдельный ручной `crawlMaxOutputTokens` с default 20 000 и
  диапазоном 1 000–64 000; лимит ответов ассистента остаётся независимым;
- все 192 теста workspace, общий typecheck, lint, production build и `git diff --check` прошли;
  миграция `0015_careful_beast.sql` применена локально, readiness панели подтверждает доступность
  PostgreSQL и Redis.

## 2026-09-16 — Управление историей парсинга и очистка БЗ

- раздел источников получил таблицу полной истории до 5 000 запусков с открытием результата и
  удалением любого терминального `succeeded|partial|failed|cancelled` run;
- удаление run очищает его page results и оставшийся terminal BullMQ job, но сохраняет созданные
  записи БЗ; queued/running run нужно сначала приостановить и остановить;
- в списке и редакторе БЗ добавлено удаление отдельной записи со всеми versions, publications,
  chunks, products, embeddings и техническими generation provenance links; тексты диалогов
  сохраняются;
- Owner получил действия «Очистить историю», «Очистить записи» и «Очистить всё» с модальным
  подтверждением, повторной проверкой пароля, CSRF и audit event со счётчиками;
- массовая очистка блокируется при активном crawl или index job и сохраняет URL-источники, их
  настройки, диалоги, пользователей, проект и audit log;
- архитектурные границы и последствия зафиксированы в ADR-010.
- все 194 теста workspace, общий typecheck, lint, production build и `git diff --check` прошли;
  живой read-only API history smoke вернул `200`, а readiness подтвердил PostgreSQL и Redis.

## 2026-09-17 — Ограниченно-параллельный парсинг страниц

### Причина и решение

- прежний crawl run полностью ждал цепочку `fetch → AI → БД` одной страницы перед переходом к
  следующей, поэтому latency provider блокировала весь обход;
- crawler преобразован в bounded pipeline без пакетирования: по умолчанию допускаются два
  одновременных fetch и пять независимых обработок страниц, при этом общий `requestDelayMs` и robots
  `Crawl-delay` продолжают ограничивать частоту начала запросов к сайту;
- AI concurrency ограничена общим FIFO-limiter одного worker process, поэтому два параллельных
  system jobs не создают больше пяти provider streams;
- завершение страниц в произвольном порядке использует атомарные SQL-приращения и `greatest` для
  discovered count, исключая откат progress;
- AI-only повторная обработка сохранённого текста также выполняется с ограниченной параллельностью;
- pause перестаёт запускать новые fetch, позволяя уже начатым fetch/AI завершиться; bounded
  backpressure не позволяет накопить в памяти весь сайт;
- worker теперь может повторно claim-ить BullMQ job, если после аварийного перезапуска run остался
  `running`: счётчики восстанавливаются из page rows, сохранённые URL повторно участвуют только в
  link discovery и не отправляются в AI; checksum остаётся дополнительной защитой документов;
- лимиты вынесены в `KNOWLEDGE_CRAWL_FETCH_CONCURRENCY` (`1..10`, default `2`) и
  `KNOWLEDGE_CRAWL_AI_CONCURRENCY` (`1..20`, default `5`); решение зафиксировано в ADR-011.

### Проверки

- regression-тест одновременно измеряет независимые пределы: не более двух fetch и пяти page
  processors;
- config-тесты проверяют defaults и отклонение значений вне допустимых диапазонов;
- все 197 тестов workspace, общий lint, typecheck, production build и `git diff --check` прошли;
- во время обновления уже выполнялся run `34704253…`; после перезапуска development worker
  checkpoint сохранил `51` готовую страницу, новый pipeline восстановил задачу и увеличил прогресс
  до `64/870` (`62` успешно, `2` ошибки) без удаления прежних результатов; readiness панели, Redis,
  PostgreSQL и widget preview остались доступны.
- профильный технический гайд дополнен полной схемой pipeline: область действия четырёх лимитов,
  взаимодействие fetch concurrency с crawl delay, общий AI limiter, backpressure, page-level errors,
  атомарный progress, семантика паузы и checkpoint-восстановление после перезапуска.

## 2026-09-17 — Иконочные действия в таблицах и заголовках секций

- все кнопки в колонках «Действия» переведены на единый компактный `icon-button`: пользователи,
  настроенные источники, история запусков, результаты парсинга и документы БЗ;
- управляющие действия в `section-header` также приведены к иконочному виду: очистка истории и
  источников, пауза/продолжение/остановка/удаление запуска, повторная индексация и обновление;
- библиотека `UiIcon` дополнена значками редактирования, питания, запуска, паузы, остановки,
  обновления, архивации и восстановления; все иконки добавлены в каталог компонентов;
- у каждой иконочной кнопки сохранены явные `aria-label` и `title`, опасные действия используют
  danger-состояние; действие повторного парсинга перенесено в корректную колонку таблицы;
- typecheck, lint, 43 теста control-panel и `git diff --check` прошли; визуально проверены таблицы
  истории/результатов парсинга и управления пользователями в запущенном приложении.

## 2026-09-17 — Автоматическая очередь повторов ошибочных страниц

- после завершения основной очереди worker теперь формирует retry-раунды только из failed URL и
  выполняет максимум три page-level попытки каждой страницы; успешные URL повторно не загружаются;
- `knowledge_crawl_pages.attempt_count` хранит checkpoint попыток, повтор обновляет ту же строку и
  корректирует succeeded/failed без увеличения unique `processedCount`;
- ручная кнопка в заголовке завершённого запуска создаёт новый tenant-scoped run только для всех
  оставшихся failed pages; точечный повтор одной строки сохранён;
- target retry пропускает sitemap discovery, но сохраняет SSRF, robots, crawl-delay, fetch/AI
  concurrency, pause/stop и source/project scope; URL для пакетного запуска читаются из БД, а не из
  запроса клиента;
- добавлены endpoint `POST .../crawl-runs/{runId}/retry-failed`, audit event, миграция `0016`,
  отображение «Попыток: N из 3», ADR-012 и обновления API/data model/crawler guide;
- миграция применена без удаления данных. После контролируемого dev restart зависший BullMQ job
  текущего run был безопасно возвращён из `failed` в `waiting` и повторно принят worker-ом в режиме
  checkpoint recovery; панель, worker и widget остались доступны;
- профильные typecheck/lint и тесты прошли: contracts 53, crawler 27, worker 13, control-panel 43;
  `git diff --check` чист, интерфейс активного run визуально проверен в Chrome.

## 2026-09-17 — Массовое управление и постобработка базы знаний

- источник нельзя архивировать, пока его последний crawl находится в `queued|running`; серверная
  защита и запрет удаления активного источника сохранены;
- список документов получил построчные checkbox, выбор всех найденных записей и массовые действия
  «Опубликовать», «Снять с публикации» и «Удалить»; массовое удаление требует свежего пароля;
- в правом sidebar добавлена инструкция для AI-постобработки всех либо выбранных записей, progress
  последнего запуска и фоновая очередь `knowledge.processing`;
- постобработка фиксирует исходные immutable versions, применяет инструкцию независимо к каждой
  записи и создаёт новую version без автоматического изменения `active_version_id`; частичные ошибки
  не отменяют успешные записи;
- таблицы панели используют общий горизонтальный scroll-контейнер и fixed layout; динамические
  колонки названия/описания ограничены 320 px с переносом длинного текста, статические колонки имеют
  предсказуемые ширины;
- добавлены tenant-scoped bulk/processing API, таблицы `knowledge_processing_runs/items`, миграция
  `0017`, ADR-013 и обновления эксплуатационной документации.
- contracts tests: 55, worker tests: 14, control-panel tests: 43; профильные typecheck/lint и
  `git diff --check` прошли. Авторизованный browser-прогон подтвердил sidebar, массовый selector,
  checkbox-колонку, иконочные действия и перенос полного текста инструкции;
- после контролируемого restart прежний crawl `34704253…` восстановлен из checkpoint `855/870`:
  stalled BullMQ job возвращён из `failed` в `waiting`, повторно принят новым worker-ом и продолжает
  обновлять `updated_at` без удаления 855 постраничных результатов.

## 2026-09-17 — Сортировка таблиц панели

- все найденные таблицы получили сортировку по подходящим содержательным колонкам: документы БЗ,
  пользователи, аудит, источники, история и результаты парсинга;
- общий `TableSortHeader` показывает направление, меняет его повторным нажатием и передаёт
  доступное состояние через `aria-sort`; checkbox и колонки действий намеренно не сортируются;
- сортировка выполняется после поиска и фильтров, но до клиентской пагинации; пустые значения
  располагаются в конце, строки сравниваются с учётом русского языка и числовых фрагментов;
- typecheck, lint, 43 теста control-panel и `git diff --check` прошли; browser-проверка подтвердила
  видимые индикаторы и реальное изменение порядка строк по нажатию на заголовок.

## 2026-09-17 — Устойчивый BullMQ lock долгих задач

- диагностика активного crawl выявила расхождение: PostgreSQL продолжал получать результаты, но
  BullMQ перевёл job в `failed` после нескольких потерь стандартного 30-секундного lock;
- system worker получил десятиминутный lock с обновлением раз в минуту, минутную stalled-проверку и
  максимум три восстановления; верхнеуровневая concurrency осталась равной двум;
- добавлены отдельные журнальные события потери lock и восстановления stalled job, regression-тест
  параметров lease и эксплуатационное описание компромисса между устойчивостью и временем recovery;
- изменение применено через graceful `worker.close()`: текущий парсинг не прерывается, а новый
  worker с исправленной конфигурацией стартует только после его завершения.

## 2026-09-17 — Исправление массовой постобработки БЗ

- устранён SQL `42702`: alias агрегата последней версии больше не совпадает с `version_no` основной
  таблицы, поэтому создание processing run не падает до постановки job в очередь;
- инструкция правого sidebar сохраняется по project id в Nuxt state и localStorage, переживает
  переходы между разделами и перезагрузку и очищается только после успешного ответа `202`;
- при ошибке текст остаётся в поле, а UI дополнительно показывает серверное `message`, если Nitro не
  вернул устаревшее поле `statusMessage`.

## 2026-09-18 — Управление и история постобработки БЗ

- подтверждён реально работающий run `3dd2…`: PostgreSQL progress и BullMQ lock обновлялись;
  предыдущий run завершился `CONNECT_TIMEOUT`, что подтвердило необходимость истории;
- добавлены история до 5 000 запусков, сортировка, иконочные действия паузы/продолжения, остановки и
  удаления терминального запуска;
- схема run расширена статусом `cancelled` и `pause_requested_at`; worker завершает уже начатые
  AI-запросы, не начинает новые во время паузы и кооперативно подтверждает остановку;
- удаление очищает processing items и BullMQ job, но сохраняет созданные immutable versions БЗ;
- действующий run после обновления worker-а восстановлен из checkpoint без создания нового запуска
  и без удаления 71 успешного результата; миграция `0018_strong_pyro.sql` применена локально;
- решение зафиксировано в ADR-015, API, data model, архитектура и руководство обновлены.

## 2026-09-18 — Ограничение ширины страницы документов БЗ

- базовые контейнеры контентной области, панели, стеки и scroll-обёртки получили явные
  `min-width: 0` и ограничение шириной родителя, поэтому минимальная ширина таблицы больше не
  растягивает всю страницу;
- двухколоночный `split-layout` теперь ориентируется на фактическую ширину `page-frame`: при ширине
  контента до 920 px правый блок постобработки переносится под основной контент;
- горизонтальный скролл длинных таблиц остаётся внутри соответствующей панели, а не у всей страницы.

## 2026-09-18 — Компактные таблицы и пятистрочное ограничение текста

- все семь таблиц панели занимают 100% доступной ширины и используют компактный автоматический
  расчёт колонок: статические колонки занимают ширину максимального значения без лишних переносов,
  а свободное место получают динамические колонки;
- уменьшены внутренние отступы ячеек и ширина служебных колонок выбора и действий;
- названия, URL, инструкции, ошибки и другие динамические значения ограничены шириной 280 px, для
  компактных динамических значений — 220 px;
- длинный текст в динамических ячейках ограничен пятью строками с многоточием, полный текст остаётся
  в DOM, а таблицы, которые всё же не помещаются, прокручиваются только внутри своего блока.
- заголовки колонок и отдельные слова больше не разрываются посередине; URL, email и технические
  идентификаторы отображаются одной строкой с многоточием, если не помещаются в доступную ширину.

## 2026-09-18 — Повторы ошибок постобработки БЗ

- каждая запись массовой постобработки получила durable счётчик попыток; временные provider/AI
  ошибки автоматически повторяются до трёх item-level попыток с ограниченной задержкой;
- progress увеличивается только при окончательном успехе или ошибке, а pause/stop и восстановление
  worker-а сохраняют уже использованный лимит попыток;
- в истории для `partial|failed` запуска добавлено иконочное действие «Повторить ошибки», которое
  создаёт новый run только по failed документам, с прежней инструкцией и актуальными версиями;
- добавлены tenant-scoped endpoint, audit event, миграция `0019`, тесты retry policy, ADR-016 и
  обновления API, data model, архитектуры и эксплуатационных руководств.

## 2026-09-18 — Полноширинный редактор записи БЗ

- route просмотра и редактирования записи БЗ переведён на полноширинный `BaseModal` с закрытием
  обратно в список документов;
- `BaseModal` получил общий вариант `size="full"`, добавленный также в каталог компонентов;
- название и тип записи расположены в одном ряду, URL — следующим полем на всю ширину, Markdown —
  ниже;
- публикация, снятие с публикации и удаление используют иконочные кнопки с доступными именами и
  единым интервалом между действиями; подтверждения опасных операций сохранены.

## 2026-09-19 — Высота и рабочая область редактора записи БЗ

- полноширинный modal редактора занимает всю доступную высоту viewport с одинаковыми отступами от
  краёв;
- название, компактный select типа, URL и иконочные действия объединены в одну строку на desktop;
- вариант `BaseSelect width="content"` теперь действительно рассчитывает минимальную ширину по
  самому длинному option, без прежнего фиксированного минимума 220 px;
- Markdown textarea растягивается на всё оставшееся пространство модального окна и сохраняет
  безопасную минимальную высоту на узких экранах.

## 2026-09-19 — Видимый статус переиндексации

- после запуска переиндексации панель немедленно показывает отдельный live-блок состояния задачи,
  не дожидаясь следующего polling-запроса;
- состояния очереди и выполнения сопровождаются понятным текстом, indeterminate progress и после
  старта worker-а — количеством документов и фрагментов текущего snapshot;
- polling каждые 1,5 секунды продолжает обновлять статус до `Завершено` либо `Ошибка`;
- общий визуальный компонент фонового прогресса переименован из crawl-specific `crawl-progress` в
  переиспользуемый `task-progress` и применяется также к обходу сайта.

## 2026-09-19 — Код подключения виджета

- вкладки настроек ассистента упорядочены так: «Подключение», «Безопасность», «Роль и поведение»,
  «Интерфейс», «База знаний»;
- во вкладку «Подключение» добавлен готовый snippet с публичным `assistant-id` выбранного проекта и
  URL loader текущего окружения;
- иконочная кнопка копирует весь код, показывает toast и временно меняет иконку на подтверждение;
- поле доступно для ручного выделения, если Clipboard API недоступен.
- локальная тестовая страница на `http://localhost:4173` переведена со старого архивного
  `assistant-id` на актуальный идентификатор активного проекта.

## 2026-09-19 — Создание записи БЗ в модальном окне

- кнопка «Создать запись» открывает полноширинный и полноэкранный modal по тому же route-паттерну,
  что и просмотр существующей записи;
- название, компактный выбор типа, URL и иконочная публикация расположены в общей верхней строке;
- Markdown-поле занимает оставшуюся рабочую высоту, а закрытие возвращает в таблицу документов.

## 2026-09-19 — AI-нормализация новой ручной записи

- поле создания принимает обычный несвязный текст либо готовый Markdown и явно объясняет последующую
  ИИ-обработку;
- `POST /knowledge/documents` до записи в БД всегда вызывает выбранную chat-модель с неизменяемым
  запретом придумывать факты и выполнять инструкции из пользовательского текста;
- модель возвращает только Markdown; пустой, усечённый или слишком большой ответ отклоняется, а
  документ при любой ошибке нормализации не создаётся;
- UI показывает этап «ИИ обрабатывает» и локализованные provider/normalization errors; audit хранит
  модель и usage без исходного текста.

## 2026-09-19 — Высота действий редактора БЗ

- иконочные действия в `knowledge-editor__actions` используют базовый размер 40 × 40 px вместо
  compact-варианта 32 × 32 px и визуально совпадают по высоте с соседними input/select.
