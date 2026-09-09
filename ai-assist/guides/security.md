# Руководство по безопасности

Security требования являются частью Definition of Done, а не отдельным финальным этапом.

## 1. Модель угроз

Недоверенными считаются:

- посетитель, его сообщения и page metadata;
- host page и любой JavaScript на ней;
- `assistant-id`, Origin/Referer и widget session input;
- URL и содержимое парсируемого сайта;
- redirects, DNS answers, sitemap/robots и файлы;
- retrieved documents, включая prompt injection внутри них;
- ответы/ошибки AI provider;
- загруженные администратором файлы и всё извлечённое из них содержимое;
- identifiers из path/body до authorization.

Даже Администратор не получает автоматического доверия вне проверенной сессии и project scope.

## 2. Provider key

### При записи

1. Принять только по admin HTTPS endpoint после проверки роли Администратора + CSRF.
2. Ограничить размер и проверить ожидаемый формат без помещения значения в error/log.
3. Проверить ключ server-side минимальным безопасным запросом или отдельной командой `test`.
4. Зашифровать authenticated encryption с уникальным nonce и associated data (`project_id`, credential id, provider).
5. Сохранить mask, key version и verification metadata отдельно.
6. Не включать plaintext в response, queue payload, audit diff или analytics.

Реализация этапа 3 использует AES-256-GCM, случайный 96-bit nonce, 128-bit authentication tag и AAD из project id, credential id и provider. Повторное сохранение того же значения обязано создавать другой ciphertext/nonce. Master key не хранится в таблице credentials; production отвергает development default, а development с этим default блокирует credential save.

### При использовании

- Расшифровать в provider adapter непосредственно перед запросом.
- Не класть в глобальный cache дольше необходимого.
- Redact заголовок до HTTP logging/tracing.
- Не передавать ключ в query string.
- Ограничить egress provider hosts на infrastructure layer, если deployment это позволяет.

### Ротация

- Новый master key получает новую version.
- Runtime временно умеет читать current/previous version.
- Background re-encryption пишет новый ciphertext с новым nonce.
- После проверки previous key удаляется из secret manager.
- Provider credential replacement и master-key rotation — разные операции.

## 3. SSRF для crawler

Минимальный алгоритм каждого network hop:

1. Разобрать URL стандартным parser-ом; разрешить только `http:`/`https:`.
2. Запретить embedded credentials, необычные/пустые hosts и неразрешенные ports.
3. Нормализовать IDN/hostname и разрешить DNS самостоятельно.
4. Проверить все IPv4/IPv6 ответы: loopback, private, link-local, multicast, reserved, carrier-grade NAT и metadata targets запрещены.
5. Соединяться только с проверенным адресом/через защищенный egress proxy, сохраняя корректный Host/TLS verification; защититься от DNS rebinding.
6. Redirect не follow автоматически: разобрать `Location` и повторить шаги 1–5.
7. Ограничить redirects, bytes, headers, duration, content types и concurrency.
8. Не возвращать raw response посетителю/admin browser.

Headless browser не является обходом этих правил. Его network interception блокирует subresources/private addresses; downloads, file URLs, extensions и browser permissions выключены. Crawler запускается без доступа к cloud metadata/internal control plane на сетевом уровне.

Ориентир: [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).

## 4. Prompt injection и RAG

- Retrieved text помещается в явно отделенный `<knowledge>...</knowledge>`-подобный контейнер и объявляется недоверенными данными.
- System/platform policy запрещает выполнять инструкции из knowledge.
- HTML/scripts/comments/hidden text не считаются trusted prompt.
- Ingestion может маркировать/фильтровать очевидные instruction-like фрагменты, но filtering не является единственной защитой.
- Runtime не предоставляет модели destructive tools в MVP.
- URL/цитаты формируются из сохраненной provenance, а не из сгенерированного моделью URL.
- Structured product facts приоритетнее свободного текста при конфликте; конфликт показывается администратору.
- Eval включает indirect injection fixtures и проверяет не только текст ответа, но и отсутствие запрещенного действия/утечки.

## 5. Widget boundary

- `assistant-id` публичен и не авторизует admin/data access.
- Origin allowlist снижает browser abuse, но не заменяет rate limit: небраузерный клиент может подделать Origin.
- Widget session короткоживущая, scoped на assistant/origin и не дает читать prompt/knowledge/admin API.
- CORS отражает только exact normalized allowed origin и добавляет `Vary: Origin`.
- Public config содержит только display/runtime flags.
- Widget не хранит чувствительные данные в Local Storage; для conversation continuity используется только ротируемый opaque token с ограниченным сроком. Сервер проверяет связь session → assistant/origin → conversation на каждом запросе.
- Анонимный token подтверждает непрерывность браузерной сессии, но не личность человека. Контекст авторизованного клиента принимается только как короткоживущий подписанный сервером сайта identity assertion с allowlist полей; DOM, query string и обычные widget attributes недоверенны.
- История и structured state имеют retention/turn/token limits; старые сообщения сворачиваются в проверяемое резюме, а purge удаляет conversation data и связанные идентификаторы.
- Модельный Markdown sanitizes; ссылки используют разрешенные schemes. `target="_blank"` сопровождается `rel="noopener noreferrer"`.
- `postMessage`, если появится, проверяет exact origin и schema.

## 6. Admin web security

- Secure + HttpOnly + SameSite session cookie; session id ротируется после login/privilege change.
- CSRF token и Origin/Fetch Metadata defense-in-depth для state changes.
- Пароли хэшируются Argon2id с параметрами, выбранными по server benchmark.
- Login/reset имеют enumeration-safe response и rate limits.
- RBAC проверяется server-side на каждом resource, не только скрытием кнопки.
- Внешние роли ограничены `admin|user`: Администратор получает все проекты, Пользователь — только назначенные read-only memberships. Изменение роли и назначений требует admin session и CSRF; отключение отзывает сессии, последнего активного администратора отключить нельзя.
- Content Security Policy, HSTS, frame-ancestors, nosniff и безопасный Referrer-Policy задаются reverse proxy/app.
- Prompt/document preview экранирует untrusted content и не исполняет HTML.
- Destructive/secret operations требуют recent authentication при повышенной модели риска.

Ориентир: [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

## 7. Данные и приватность

- До pilot владелец выбирает, хранить ли содержимое диалогов и сколько дней.
- По умолчанию для технической аналитики хранить metadata, а не полный текст.
- Не собирать IP/user-agent сверх необходимого; для rate limit использовать короткоживущий keyed hash.
- Consent/legal text предоставляет владелец сайта и проходит юридическую проверку. Техническая реализация сама по себе не гарантирует соответствие 152-ФЗ или иной юрисдикции.
- Export/purge requests должны находить conversations/messages/objects/log references по проекту.
- Production данные не копируются в dev/test без обезличивания.

Admin file upload дополнительно требует allowlist signature/MIME, quotas, private object storage и sandboxed/bounded parser. Макросы, embedded scripts, внешние ссылки/объекты, DTD/XXE и формулы не исполняются; macro-enabled, password-protected и неподдерживаемые legacy-файлы отклоняются. AI-assisted mapping получает только ограниченный извлечённый фрагмент без tools/secrets и возвращает данные через строгую schema.

## 8. Abuse и расходы

- Лимиты на размер сообщения, turns, concurrent streams, assistant/day, session/minute и privacy-preserving IP bucket.
- Provider `max_tokens`/output limit задается server-side и не принимается от widget.
- Budget circuit breaker блокирует новые генерации до ручного решения, но показывает понятный fallback.
- Retry после начала стрима запрещен автоматически.
- Playground имеет отдельные лимиты и audit.

## 9. Security checklist изменения

- [ ] Authentication и authorization определены.
- [ ] Tenant scope применен до чтения/изменения.
- [ ] Input/output/runtime schema есть.
- [ ] Secrets и PII не попадают в response/log/audit/trace.
- [ ] CORS/CSRF/rate limit определены.
- [ ] SSRF применен ко всем server-side URL fetch.
- [ ] Prompt/document/provider output считается недоверенным.
- [ ] Negative tests добавлены.
- [ ] Dependency/lockfile/container scan проходит.
- [ ] Failure mode не оставляет partial published state.
