# Руководства AI Assist

## Для кодового агента/разработчика

Обязательный порядок:

1. [../AGENTS.md](../AGENTS.md)
2. [../technical-task.md](../technical-task.md)
3. [../architecture.md](../architecture.md)
4. [development.md](development.md)
5. Для любой UI-задачи дополнительно прочитать:
   - [markup.md](markup.md) — семантика HTML/Vue, доступность и безопасный вывод;
   - [class-names.md](class-names.md) — БЭМ-логика и именование классов из правил Newmark.
6. Профильный гайд задачи:
   - [security.md](security.md) — secrets, auth, widget boundary, SSRF и prompt injection;
   - [provider-and-models.md](provider-and-models.md) — AITUNNEL, ключи, модели и streaming;
   - [prompts.md](prompts.md) — prompt CRUD, версии, публикация и eval;
   - [knowledge-base.md](knowledge-base.md) — документы, товары, RAG и жизненный цикл;
   - [data-sources.md](data-sources.md) — публичные feed/HTML-источники, file roadmap и границы будущего DB-импорта;
   - [crawler-and-indexing.md](crawler-and-indexing.md) — безопасный crawl и перенос Newmark parser;
   - [widget-integration.md](widget-integration.md) — loader, Custom Element, CSP и Bitrix;
   - [testing.md](testing.md) — уровни и обязательные test matrix;
   - [deployment-and-operations.md](deployment-and-operations.md) — окружения, deploy, monitoring и incidents.

Изменение поведения, противоречащее принятому ADR, требует нового ADR. Изменять историческое решение задним числом нельзя.

## Для администратора проекта

Рабочая последовательность:

1. [admin-operations.md](admin-operations.md) — первоначальная настройка и ежедневные действия.
2. [provider-and-models.md](provider-and-models.md) — подключение AITUNNEL и выбор моделей.
3. [prompts.md](prompts.md) — создание и публикация поведения.
4. [knowledge-base.md](knowledge-base.md) — подготовка знаний.
5. [data-sources.md](data-sources.md) — выбор и настройка источника каталога.
6. [crawler-and-indexing.md](crawler-and-indexing.md) — настройка HTML-источника.
7. [widget-integration.md](widget-integration.md) — установка на обычный сайт/Bitrix.

## Правило актуальности

Гайды описывают целевой MVP до появления кода. При реализации примеры команд, routes и UI labels должны быть сверены с фактическим приложением. Документ не должен утверждать, что несуществующая команда уже работает.

При изменении:

- public API — обновить `api-contract.md` и widget guide;
- сущностей/статусов — обновить `data-model.md` и admin guide;
- правил UI-разметки/классов — обновить `markup.md`, `class-names.md` и связанные fixtures;
- deployment/env — обновить operations guide и `.env.example`;
- provider endpoints — сверить только с официальной документацией AITUNNEL;
- Bitrix placement — сверить с актуальным шаблоном конкретного сайта, потому что один сайт может использовать несколько шаблонов по условиям.
