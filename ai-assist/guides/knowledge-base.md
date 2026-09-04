# Руководство по базе знаний

## 1. Что хранить

База знаний содержит проверяемые факты, которые могут изменяться независимо от prompt:

- карточки товаров и характеристики;
- категории и направления магазина;
- доставка, оплата, возврат, контакты и режим работы;
- ограничения заказа и типовые вопросы;
- ручные уточнения владельца с author/date;
- canonical URL и время актуальности.

Не хранить как knowledge:

- provider keys/passwords;
- инструкции по обходу platform policy;
- произвольные production DB dumps;
- неподтвержденные автоматически сгенерированные описания;
- персональные данные посетителей.

## 2. Типы документа MVP

### Manual

Поля: title, body, locale, optional source URL, tags, validity note. Используется для общей информации, которой нет/сложно извлечь с сайта.

### Page

Нормализованная страница source URL: title, canonical URL, main content, headings, provenance, fetched/modified time, checksum.

### Product

Поля:

- title и canonical URL;
- SKU/external id, если есть;
- category/breadcrumbs;
- description;
- price display и отдельные amount/currency только если надежно извлечены;
- availability text/status с provenance;
- characteristics как name/value/unit/source;
- image metadata (без обязательной локальной загрузки);
- source updated/fetched time.

Пустое поле и отрицательное значение различаются. Например, `availability: unknown` не превращается в «нет в наличии».

### File import

TXT/Markdown, text PDF и DOCX обычно создают один или несколько Manual documents по логическим разделам. CSV/XLSX/XML/YML обычно создают import batch структурированных Product records; система автоматически предлагает mapping, provenance и confidence. Файл не становится одним огромным документом и не публикуется автоматически.

## 3. CRUD и публикация

Текущий административный срез доступен в разделе проекта «База знаний». Viewer читает список и историю, Editor/Owner создаёт и изменяет записи. Сохранение изменения всегда создаёт новую immutable version и использует optimistic `expectedVersion`; опубликованный материал меняется только явным переключением active version. Все операции и выборка chunks ограничены `project_id`, а физическое удаление дополнительно требует недавней аутентификации.

### Создать вручную

1. Выбрать тип Manual/Product.
2. Заполнить только подтвержденные поля.
3. Сохранить draft.
4. Просмотреть normalized preview.
5. Запустить index preview/test retrieval.
6. Опубликовать.

### Изменить

Edit создает новую document version. До publish runtime использует прежнюю active version. Diff должен показывать удаленные факты отдельно от измененных.

### Снять с публикации

Unpublish немедленно исключает документ/chunks из retrieval. Физическая очистка embeddings идет в фоне. Повторная публикация создает новую publication/version activation.

### Архивировать

Archive применяется, если сущность больше не должна редактироваться/использоваться. История provenance/audit сохраняется согласно retention.

Физическое Delete доступно только для неиспользованного draft без публикаций/runs. Для опубликованных документов используется unpublish/archive, затем отдельная подтвержденная purge-процедура; прямое удаление строки/embeddings из БД не является административным CRUD-сценарием.

## 4. Нормализация

- Unicode/whitespace приводятся к стабильному виду.
- HTML преобразуется в plain structured text; scripts/styles/nav/cookie banners удаляются.
- Единицы не пересчитываются без явного надежного правила; исходное display value сохраняется.
- Цена хранит исходную формулировку и parsed amount/currency отдельно.
- URL canonicalization не удаляет business-significant query parameters без правила source profile.
- В document version хранится extraction/profile version, чтобы результат можно было воспроизвести.
- Любое AI-assisted extraction поле имеет provenance/confidence и требует review до публикации в MVP.

## 5. Chunking

- Сначала делить по document type/semantics: товарная identity, описание, характеристики, условия; затем по headings/абзацам.
- Не разрывать пару `характеристика — значение` и price/availability context.
- В каждый chunk metadata включать document title/type/url/version/locale и product identifiers.
- Overlap минимален и измеряется; чрезмерный overlap повышает стоимость и создает duplicate evidence.
- Chunker version входит в index profile.
- Token count считается tokenizer-ом, совместимым/достаточно близким к выбранной модели; hard byte/character limits остаются defense-in-depth.

## 6. Retrieval

Реализованный первый срез нормализует ручной текст, создаёт chunks до 1200 символов и выполняет ограниченное лексическое ранжирование опубликованных active versions текущего проекта/локали. Prompt preview возвращает не более пяти источников с document/version/chunk provenance и score. Retrieved text считается недоверенным: границы и специальные символы экранируются, а отдельная platform policy запрещает модели выполнять инструкции из документа.

Это промежуточный измеряемый baseline, не финальный RAG. Следующий подэтап переносит embedding generation в фоновые jobs, добавляет `knowledge_index_versions`, full-text/vector fusion, threshold/diversity/token budget и atomic index switch. Административный request не должен синхронно ждать embeddings.

Pipeline MVP:

1. Validate/normalize query.
2. Сформировать query embedding active profile.
3. Получить full-text и vector candidates только текущего project/active index/published docs/locale.
4. Объединить/нормализовать ranks.
5. При включенном rerank — переранжировать ограниченный candidate set.
6. Применить threshold/diversity и token budget.
7. Передать chunks с provenance в generation.

Exact веса/top-k/threshold не хардкодятся как «правильные навсегда». Они версионируются и подбираются на eval-наборе.

## 7. Конфликты и свежесть

- Structured product data одного active version имеет приоритет над generic page text того же товара.
- При двух активных источниках с разными фактами система не выбирает молча: применяется source priority, если он настроен, иначе документ получает conflict/needs review.
- Expired/failed-to-refresh source виден в admin как stale; runtime может показывать осторожный ответ согласно prompt.
- Удаленная со страницы сущность не удаляется автоматически при одном crawl: сначала `missing_in_source`, затем review/настраиваемое подтверждение несколькими успешными crawl.

## 8. Quality review

Для каждого source batch администратор видит:

- new/changed/unchanged/missing/failed;
- извлеченный title/type/URL;
- field-level product diff;
- extraction confidence/warnings;
- checksum и fetched time;
- будущий publish impact.

Random sample review обязателен даже если все документы прошли validation.

## 9. Чеклист публикации знаний

- [ ] URL/title/type/locale корректны.
- [ ] Факты подтверждены source/manual author.
- [ ] Price и availability не додуманы.
- [ ] Нет навигационного мусора, prompt injection или персональных данных.
- [ ] Дубликаты/конфликты разрешены.
- [ ] Preview и document diff просмотрены.
- [ ] Index build и smoke retrieval успешны.
- [ ] Eval вопросы находят ожидаемый документ.
- [ ] Active pointer переключен атомарно.
