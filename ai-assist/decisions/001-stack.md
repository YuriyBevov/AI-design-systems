# ADR-001: Стек и форма развертывания

- Статус: принято для MVP
- Дата: 2026-09-01

## Контекст

Нужны три разных runtime-профиля:

1. административный web UI и короткие server requests;
2. маленький изолированный widget для чужих сайтов;
3. долгие, повторяемые crawl/index jobs.

Один Nuxt bundle для всех трех профилей увеличил бы размер виджета и связал фоновые задания с жизненным циклом HTTP-сервера. Полностью раздельные frontend, API и worker сервисы дали бы больше инфраструктуры, чем нужно первому пилоту.

## Решение

Использовать TypeScript monorepo со следующими deployable units:

- `apps/control-panel`: Nuxt 4 — admin UI и Nitro API;
- `apps/worker`: Node.js worker, потребляющий BullMQ jobs;
- `apps/widget`: Vue 3 Custom Element, отдельная Vite library build;
- shared packages для contracts, database, domain, provider и observability.

На первом этапе control-panel и API развертываются одним Node server build. Бизнес-логика остается вне route handlers, чтобы при подтвержденной нагрузке публичный API можно было вынести в отдельный Fastify/Nitro service без переписывания домена.

## Почему так

- Nuxt покрывает административные страницы, маршрутизацию, server handlers и Node deployment одним стеком.
- Vue `defineCustomElement` дает framework-agnostic custom element и Shadow DOM.
- Vite library mode производит самостоятельный версионируемый browser artifact.
- Отдельный worker изолирует Playwright, crawl timeouts, embeddings и retry от чата.
- PostgreSQL хранит транзакционные данные, full-text index и pgvector в одном backup/authorization контуре.
- Redis нужен там, где БД неудобна: очередь, короткие блокировки и распределенные лимиты. Redis не является источником истины.

## Зафиксированные технологии

- текущая LTS-версия Node.js на момент scaffold, закрепленная в `.nvmrc`/`engines` и CI;
- pnpm workspaces;
- Nuxt 4, Vue 3, Vite, TypeScript strict;
- PostgreSQL + pgvector;
- Redis + BullMQ;
- DOM parser для обычных страниц и Playwright как opt-in fallback;
- runtime validation через Zod или эквивалент с единым выводом типов/contracts;
- Docker Compose для локальной среды и первого закрытого deployment.

Конкретный ORM выбирается на этапе scaffold после spike с pgvector migrations и type-safe queries. Предпочтение — Drizzle, но ADR не считается принятием ORM до прохождения spike.

## Отклоненные варианты

### Только Vue SPA

Не дает готового server runtime и вынуждает отдельно собирать routing/API/auth инфраструктуру панели.

### Nuxt внутри виджета

SSR, Nuxt app runtime и router не нужны одному chat custom element; размер и вероятность конфликтов выше.

### Полностью отдельный Fastify API с первого дня

Технически жизнеспособно, но добавляет deployment, auth/CORS и контрактную сложность до появления подтвержденной нагрузки. Возможность выделения сохраняется границами модулей.

### Внешняя специализированная vector database в MVP

Увеличивает число систем, backup/tenant boundaries и operational cost. PostgreSQL + pgvector достаточно до появления измеренного ограничения.

## Последствия

- Репозиторий остается единым, а deployable units — раздельными.
- Worker и control-panel используют одинаковые domain/contracts packages.
- Изменение embedding dimension требует versioned index/migration, а не изменения колонки «на месте» во время работы.
- Для локального запуска необходимы PostgreSQL и Redis; S3 может быть заменен MinIO.
- Security review охватывает две browser boundaries: same-origin admin и cross-origin public widget.

## Источники

- [Nuxt server directory](https://nuxt.com/docs/4.x/directory-structure/server)
- [Nuxt Node deployment](https://nuxt.com/docs/4.x/getting-started/deployment)
- [Vue Web Components](https://vuejs.org/guide/extras/web-components.html)
- [Vite library mode](https://vite.dev/guide/build.html#library-mode)
