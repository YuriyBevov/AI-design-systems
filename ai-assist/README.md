# AI Assist

`ai-assist` — проект встраиваемого ИИ-ассистента для интернет-магазинов и других сайтов. Ассистент подключается небольшим фрагментом HTML, отвечает по базе знаний конкретного проекта и управляется через отдельную административную панель.

Нулевой и первый этапы завершены. На втором этапе уже работает базовый вертикальный срез: вход/выход, отзываемые server-side сессии, CSRF, роли проекта, tenant scope, настройки проекта и журнал аудита. Этап 3 — AITUNNEL provider, безопасное хранение ключа, каталог моделей и модельные настройки — реализован и проверен. На этапе 4 работают prompt CRUD/revisions/publication, версионируемые настройки assistant с exact Origins и безопасный model preview сохранённой revision без изменения production. На этапе 5 готовы ручные документы/товары, immutable versions, публикация, фоновая индексация AITUNNEL embeddings, versioned pgvector index с атомарным переключением и hybrid retrieval с безопасным lexical fallback. Этап 6 добавил публичные URL-источники, безопасный sitemap/robots crawl, DOM/microdata extraction первого магазина, review и пакетную публикацию. Первый вертикальный срез этапов 7–8 подключил публичный виджет к реальному streaming chat: анонимная сессия и история переживают перезагрузку, RAG использует только опубликованную БЗ, а «Новый чат» очищает состояние подбора. File/feed ingestion, расписание, retrieval threshold/diversity, расширенный квалификационный профиль, отдельный playground и пакетный eval остаются следующими задачами.

## Что уже работает

- В панели две продуктовые роли: Администратор имеет полный доступ ко всем проектам, а Пользователь видит назначенные проекты в режиме чтения без технического раздела «Компоненты».
- В отдельном разделе «Пользователи» администратор создаёт и редактирует учётные записи, назначает проекты, активирует и отключает доступ; участников можно выбрать сразу при создании проекта.
- На странице «Провайдер» можно проверить и сохранить новый ключ AITUNNEL, повторно проверить, заменить или удалить его. API возвращает только маску и безопасные verification metadata.
- Ключ хранится в PostgreSQL как AES-256-GCM envelope с уникальным nonce, привязкой к проекту/provider и версией master key. Production не запускается, а credential save даже в development не выполняется с известным default master key.
- Публичный каталог AITUNNEL синхронизируется отдельно для `chat`, `embeddings` и `rerank`; исчезнувшая модель помечается недоступной, а не удаляется.
- Chat-, embedding- и rerank-модели выбираются отдельно. `auto` разрешен только для chat; лимит ответа проверяется относительно выбранной модели.
- Provider adapter проверяет ключ, читает публичный каталог, выполняет streaming chat и создаёт embeddings. Публичный runtime вызывает его только на сервере с опубликованным prompt/model snapshot.
- На странице «Prompts» Editor/Owner создаёт инструкции и новые неизменяемые версии; Viewer может просматривать историю.
- На странице «База знаний» Editor/Owner создаёт ручные документы и структурированные товары, сохраняет новые неизменяемые версии, публикует выбранную версию, снимает её с публикации или архивирует. Viewer может читать документы и историю.
- Там же видны embedding-модель, число опубликованных документов/chunks, актуальность и состояние индекса. Переиндексация уходит в BullMQ; provider key в payload не передаётся. Успешная версия активируется одной транзакцией, а при ошибке продолжает работать предыдущая версия и текстовый fallback.
- На странице «Источники сайта» Editor/Owner сначала получает объединённую структуру из sitemap и физической навигации, выбирает разделы первого уровня и отдельно разрешает или запрещает их внутренние страницы. Доступны быстрый режим до 100 страниц и полный фоновый обход до 5000 страниц; sitemap discovery в полном режиме видит до 10000 URL. Отдельный блок настроек объясняет каждый параметр всплывающей подсказкой. Worker учитывает robots/sitemap, блокирует private/local/metadata адреса и небезопасные redirect/DNS ответы, извлекает страницы и товары в черновики. Результаты пагинируются по 50 записей; массовый выбор может охватывать текущую страницу или весь запуск.
- В редакторе prompt-а Editor/Owner может задать тестовый вопрос и получить потоковый ответ AITUNNEL для выбранной сохранённой revision. Preview ищет только по опубликованным знаниям проекта/локали, показывает источники и scores, но не публикует prompt или assistant config.
- Публикация блокируется при неизвестных/повреждённых шаблонных переменных и без выбранной chat-модели. Rollback создаёт новую publication, не переписывая историю.
- На странице «Ассистент» Owner управляет приветствием, полем ввода, локалью, цветом, положением launcher-а, fallback, лимитами и точными production/preview Origins. Сохранение создаёт новую immutable revision, а публикация отдельно переключает production.
- Runtime resolver возвращает только активные prompt/config revisions и snapshot выбранных модельных настроек; optimistic version предотвращает незаметное перетирание параллельных изменений.
- Версионированные `loader.js` и Vue Custom Element собираются прямо в публичные assets панели. Виджет создаёт scoped opaque-сессию, стримит grounded-ответ, показывает citations, хранит в браузере только token и восстанавливает текущий conversation после перезагрузки.

## Рекомендуемый стек

- административная панель и серверные HTTP API: **Nuxt 4 + TypeScript + Nitro**;
- встраиваемый виджет: **Vue 3 Custom Element + Vite library mode + Shadow DOM**;
- фоновые задания парсинга и индексации: **отдельный Node.js/TypeScript worker**;
- основное хранилище и векторный поиск: **PostgreSQL + pgvector**;
- очередь, распределенные блокировки и rate limit: **Redis + BullMQ**;
- файлы и снимки источников: **S3-совместимое объектное хранилище**;
- модели чата, embeddings и при необходимости rerank: **AITUNNEL через отдельный provider adapter**;
- локальный запуск и первый production-контур: **Docker Compose**, затем при необходимости независимое масштабирование API и worker.

Nuxt выбран для панели и API, потому что дает Vue-интерфейс, маршрутизацию, TypeScript и серверные обработчики в одном приложении. Виджет собирается отдельно: Nuxt-runtime и SSR ему не нужны. Vue официально поддерживает Custom Elements и изоляцию внутри Shadow DOM, поэтому один и тот же bundle можно подключить к статическому HTML, CMS или Bitrix без зависимости от frontend-стека сайта.

Подробное обоснование: [decisions/001-stack.md](decisions/001-stack.md).

## Стратегия данных

Для первого магазина используются публичные источники — плановый HTML-ingestion разрешённых страниц и публичный feed URL при наличии — а также файлы, загруженные администратором. Первый file-ingestion поддержит TXT/Markdown, text PDF, DOCX, CSV/XLSX и XML/YML: система извлекает данные в черновики, показывает review/diff и публикует их только после подтверждения. Рабочая БД, приватный API, VPN и SSH магазина не подключаются, их реквизиты AI Assist не запрашивает. Полный обход сайта на каждое сообщение не выполняется. Решение и ограничения: [ADR-003](decisions/003-public-sources-for-pilot.md), [ADR-004](decisions/004-admin-file-ingestion-for-pilot.md), [guides/data-sources.md](guides/data-sources.md).

## Проверенный существующий парсер

Перед проектированием проверена папка `pen.dev/newmark/scripts`:

- `import-catalog-source.mjs` — обход URL в пределах раздела, извлечение товарных данных, загрузка и конвертация изображений, сохранение draft JSON;
- `normalize-catalog-draft.mjs` — фильтрация, дедупликация и преобразование draft-данных в модель каталога;
- команды находятся в `pen.dev/newmark/package.json`: `catalog:import` и `catalog:normalize`.

Этот код используется как исследованный прототип и набор подтвержденных правил для первого магазина. Он не переносится в production без переработки: текущая реализация зависит от regex-разбора HTML, русскоязычных меток конкретного сайта, локальных путей Newmark и загрузки изображений в каталог frontend-проекта. План миграции описан в [guides/crawler-and-indexing.md](guides/crawler-and-indexing.md).

## Карта документов

- [technical-task.md](technical-task.md) — полное техническое задание и критерии приемки;
- [implementation-plan.md](implementation-plan.md) — этапы реализации и контрольные результаты;
- [architecture.md](architecture.md) — компоненты, потоки данных и границы ответственности;
- [data-model.md](data-model.md) — сущности, связи, статусы и правила хранения;
- [api-contract.md](api-contract.md) — проектный HTTP/SSE-контракт;
- [AGENTS.md](AGENTS.md) — обязательные правила для кодовых ИИ-агентов;
- [guides/README.md](guides/README.md) — порядок чтения прикладных руководств;
- [guides/markup.md](guides/markup.md) и [guides/class-names.md](guides/class-names.md) — перенесенные и адаптированные правила разметки/классов Newmark;
- [guides/data-sources.md](guides/data-sources.md) — публичные feed/HTML-источники, будущая загрузка файлов и границы DB-импорта;
- [agent-conversation-history.md](agent-conversation-history.md) — журнал принятых решений;
- [agent-suggestions.md](agent-suggestions.md) — вопросы и идеи, не включенные в утвержденный scope.

## Базовый сценарий подключения

Целевой публичный контракт выглядит так:

```html
<script
  async
  src="https://assist.example.ru/widget/v1/loader.js"
  data-assistant-id="asst_public_xxx"
></script>

<ai-assist assistant-id="asst_public_xxx"></ai-assist>
```

`assistant-id` — публичный идентификатор, а не секрет. Ключ AITUNNEL никогда не передается в браузер. Loader проверяет наличие элемента, загружает версионированный widget bundle и обращается только к публичному API AI Assist.

## Главные ограничения MVP

- Один проект может иметь один опубликованный основной prompt и любое число черновиков/версий.
- Источники базы знаний MVP: публичный feed/URL сайта, загруженные администратором поддерживаемые файлы, ручной текст и структурированная карточка товара. Прямой доступ к БД и приватному API запрещён в pilot; изолированный DB snapshot import рассматривается только после его стабилизации и отдельного security review.
- Ответ формируется только по опубликованной конфигурации и активным опубликованным версиям документов проекта.
- Если подтвержденных данных недостаточно, ассистент сообщает об этом и предлагает предусмотренный prompt-ом следующий шаг; факты не выдумываются.
- Ассистент не оформляет заказ и не меняет данные магазина в MVP. Он консультирует и может передать пользователя в существующую форму/канал связи.
- Публичная регистрация, подписки, биллинг, голос, генерация изображений и CRM-интеграции не входят в MVP.

## Локальный запуск

Требуются Node из `.nvmrc`, pnpm 10 и Docker Desktop.

```bash
pnpm install --frozen-lockfile
pnpm dev:setup
pnpm dev
```

Панель: `http://localhost:3000`. PostgreSQL этого проекта опубликован на `localhost:55432`, чтобы не конфликтовать с типовой локальной БД на `5432`. Остановка инфраструктуры: `pnpm infra:down`.

Development seed создаёт локального владельца:

```text
email: owner@gofroprodpak.local
password: LocalDev-ChangeMe-2026!
```

Пароль можно заменить переменной `AI_ASSIST_DEV_OWNER_PASSWORD` перед `pnpm db:seed`. Seed отключён в production. После запуска панели сквозной тест авторизации выполняется командой `pnpm smoke:admin`; он проверяет tenant scope, CSRF, аудит и отзыв сессии.

Перед сохранением настоящего provider key задайте независимый master key через secret manager deployment-а или переменную окружения. Для локальной разработки новое значение можно получить так:

```bash
openssl rand -base64 32
```

Сгенерируйте значение один раз, сохраните его в локальном secret store и перед каждым запуском передавайте то же значение как `CREDENTIAL_ENCRYPTION_KEY`; номер версии — как `CREDENTIAL_ENCRYPTION_KEY_VERSION`. Известный development default позволяет открыть панель, но операция сохранения provider credential с ним вернет `CREDENTIAL_ENCRYPTION_KEY_REQUIRED`. Сам ключ AITUNNEL не помещается в `.env`: Owner вводит его на странице проекта «Провайдер». Если ключ когда-либо публиковался в чате, issue или логе, сначала отзовите его в AITUNNEL и создайте новый.

После запуска панели `pnpm smoke:provider` проверяет реальный публичный каталог без provider key. Полная проверка credential flow выполняется на локальном mock командой `pnpm smoke:provider-credential`; порядок запуска описан в [guides/development.md](guides/development.md).

Prompt CRUD/publish/rollback проверяется командой `pnpm smoke:prompts`, версии настроек и независимое переключение config snapshot — `pnpm smoke:assistant`, а ручная база знаний — `pnpm smoke:knowledge`. Knowledge-aware model preview проверяется командой `pnpm smoke:prompt-preview` на локальном mock AITUNNEL. Очередь embeddings, атомарную активацию pgvector-версии и hybrid preview проверяет `pnpm smoke:knowledge-index`; для него должны быть запущены mock AITUNNEL, тестовая панель и worker с одинаковым synthetic master key. Публичные session/chat API и продолжение диалога проверяет `pnpm smoke:widget-chat` на тестовой панели с mock AITUNNEL. Все сценарии создают отдельный временный tenant, не меняют данные клиентского проекта и удаляют только созданные ими тестовые записи.

## Внешние первичные источники

- [Nuxt: server routes](https://nuxt.com/docs/4.x/directory-structure/server)
- [Nuxt: deployment](https://nuxt.com/docs/4.x/getting-started/deployment)
- [Vue: Custom Elements](https://vuejs.org/guide/extras/web-components.html)
- [Vite: library mode](https://vite.dev/guide/build.html#library-mode)
- [AITUNNEL: введение и base URL](https://aitunnel.ru/docs)
- [AITUNNEL: публичный список моделей](https://aitunnel.ru/docs/models)
- [AITUNNEL: embeddings](https://aitunnel.ru/docs/embeddings)
- [OWASP: предотвращение SSRF](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
