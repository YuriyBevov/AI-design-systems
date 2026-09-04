# Виджет и интеграция с сайтом

## 1. Целевой embed

```html
<script
  async
  src="https://assist.example.ru/widget/v1/loader.js"
  data-assistant-id="asst_public_xxx"
></script>

<ai-assist assistant-id="asst_public_xxx"></ai-assist>
```

Конкретные host/id выдаются административной панелью. `assistant-id` публичен; вставлять AITUNNEL key, admin token или session secret в HTML нельзя.

Если custom element не добавлен вручную, loader может поддерживать документированный auto-mount через `data-auto-mount="true"`, но один canonical snippet должен оставаться основным. Не создавать два виджета одновременно из-за смешения auto/manual режимов.

## 2. Loader contract

- `async`, без `document.write`.
- Идемпотентно регистрирует custom element и не падает при повторном теге.
- Определяет asset base из собственного script URL, а не из `window.location`.
- Загружает immutable/versioned bundle.
- Публичные `loader.js`/`widget.js` отдаются с `Cross-Origin-Resource-Policy: cross-origin`; ES-module bundle получает `Access-Control-Allow-Origin: *`, поскольку dynamic import проверяет CORS. Это относится только к несекретным статическим assets — API продолжает отвечать конкретным разрешённым Origin.
- Передает только public config/assistant id.
- Не устанавливает глобальные CSS resets и не требует jQuery/Vue/Nuxt на host page.
- Ошибка загрузки не ломает host page и фиксируется только безопасной telemetry.

## 3. Custom Element

- Реализация Vue `defineCustomElement`, SFC custom-element mode и Shadow DOM.
- Props/attributes имеют runtime normalization и безопасные defaults.
- Host page не может передать произвольный API base/provider key через attribute в production build.
- Внешний theming API — ограниченные CSS custom properties, например:

```css
ai-assist {
  --ai-assist-accent: #315efb;
  --ai-assist-z-index: 1000;
  --ai-assist-font-family: system-ui, sans-serif;
}
```

Точный список публикуется после UI prototype. Внутренние class names контрактом не являются.

## 4. Доступность

- Launcher — button с доступным именем и state.
- Панель — dialog/region по выбранному interaction pattern; focus move/return и Escape работают.
- Tab не попадает в скрытые элементы.
- Streaming updates объявляются дозированно через live region, не на каждый token.
- Input имеет label, send/retry/new conversation доступны клавиатурой.
- Color contrast, 200% zoom, reduced motion и touch target проверяются.
- Не блокировать скролл всей страницы без корректного восстановления.

## 5. Безопасный render

- Plain text по умолчанию; Markdown — allowlisted subset.
- Произвольный HTML, inline style/event handlers, iframe/object/svg из ответа запрещены.
- Citation URL приходит из server provenance и проверяется scheme/host policy.
- External links используют `noopener noreferrer`.
- Текст сообщения не вставляется через `innerHTML`.

## 6. Сессия посетителя и продолжение диалога

- При первом bootstrap API создаёт анонимную visitor session и возвращает opaque bearer token с ограниченным сроком действия. Token привязан к assistant и разрешённому Origin и не является административной авторизацией.
- Widget сохраняет только opaque token и идентификатор активного conversation; provider key, prompt, содержимое базы знаний и серверное состояние подбора в browser storage не попадают.
- После перезагрузки страницы widget запрашивает историю активного conversation и продолжает беседу с уже подтверждёнными параметрами коробки. Кнопка «Новый диалог» создаёт новый conversation внутри той же visitor session с чистым состоянием подбора.
- Сервер ограничивает число/возраст сообщений, поддерживает ротацию и отзыв token, проверяет assistant/origin scope на каждом запросе и не доверяет переданному клиентом conversation id без связи с session.
- Анонимная сессия не означает, что система знает реальное имя человека. Для авторизованного пользователя Bitrix может быть добавлен server-side подписанный identity token с минимальным набором разрешённых полей и сроком действия. Простая передача имени/email через HTML-атрибут запрещена как недостоверная и небезопасная.
- Продолжение на другом устройстве возможно только для подтверждённого аккаунта сайта; анонимная история по умолчанию остаётся в пределах браузера и действует до истечения retention/сессии.

## 7. CSP

Владелец сайта может потребовать добавить origin сервиса:

```text
script-src  https://assist.example.ru
connect-src https://assist.example.ru
```

Если fonts/images загружаются с того же origin, могут потребоваться `font-src`/`img-src`; предпочтительно встроить небольшие icons/styles в bundle и не расширять CSP без необходимости.

Если CSP использует nonce-only/strict-dynamic, стандартный внешний snippet может потребовать nonce от шаблона сайта или self-hosted loader policy. Это проверяется на staging; ослаблять CSP до `unsafe-inline` ради виджета нельзя.

## 8. Установка на обычный HTML-сайт

1. В admin добавить точный Origin, например `https://shop.example.ru`.
2. Вставить snippet перед закрывающим `</body>` общего layout.
3. Опубликовать сайт/очистить CDN cache.
4. Проверить Network: loader, bundle, session и chat; AITUNNEL key отсутствует.
5. Проверить desktop/mobile, keyboard и host page errors.

Origin allowlist управляется на странице «Ассистент» и входит в immutable published config snapshot. Public session/config bootstrap, loader, bundle, SSE chat, восстановление истории и «Новый чат» уже подключены. Для установки нужен публично доступный HTTPS-host сервиса; `localhost` из браузера посетителя указывает на его компьютер и для production-snippet не подходит.

## 9. Установка в 1С-Битрикс

Официальная документация Bitrix описывает шаблон сайта с `header.php` и `footer.php`; footer выбранного шаблона подключается в эпилоге страницы. Проектные файлы рекомендуется держать в `/local`, а не изменять ядро `/bitrix`.

1. Определить, какой шаблон реально применяется к нужному сайту/разделу. В многосайтовой/условной конфигурации шаблонов может быть несколько.
2. Сделать backup/изменение через систему версий проекта.
3. Открыть footer активного пользовательского шаблона, обычно:

```text
/local/templates/<template-id>/footer.php
```

4. Вставить embed snippet ближе к концу HTML перед `</body>`, не внутрь PHP-строки и не в core-файл `/bitrix/footer.php`.
5. Если используются разные шаблоны, добавить snippet в каждый нужный template либо вынести в общий контролируемый include проекта.
6. Очистить управляемый cache Bitrix/CDN согласно процедуре проекта.
7. Проверить публичную страницу как неавторизованный посетитель; admin toolbar не должна быть условием появления виджета.
8. Проверить CSP/композитный режим/HTML caching: snippet присутствует один раз, loader URL не переписывается и API requests не блокируются.

Реальный путь и способ включения утверждает разработчик конкретного Bitrix-проекта. Не редактировать vendor/core и не устанавливать секреты в PHP/HTML.

Официальные справочные страницы:

- [страница и порядок ее выполнения](https://www.dev.1c-bitrix.ru/api_help/main/general/pageplan.php);
- [сайт и шаблон сайта](https://dev.1c-bitrix.ru/api_help/main/general/template.php);
- [папка пользовательского шаблона и `/local`](https://dev.1c-bitrix.ru/learning/course/?COURSE_ID=43&LESSON_ID=12720&LESSON_PATH=3913.4564.12764.12720).

## 10. Troubleshooting

### Loader не загружается

Проверить status/DNS/TLS, `script-src`, ad blocker, правильность immutable URL. Не переходить на inline-копию bundle как постоянное решение.

### Session возвращает 403

Сравнить browser `Origin` с exact allowed origin, включая scheme/port. Paths не добавляются. Проверить assistant enabled/public id.

### Chat блокируется CORS

Проверить response `Access-Control-Allow-Origin` и `Vary: Origin`, preflight headers/methods. `*` с credentials не использовать; widget планируется на bearer session без third-party cookies.

### Виджет под/над модальным окном сайта

Настроить документированную `--ai-assist-z-index` в разумном диапазоне после проверки host UI. Не использовать максимальное 32-bit значение по умолчанию.

### Стили выглядят иначе

Проверить Shadow DOM, inherited properties на custom element (font/color/direction) и browser extensions. Добавить regression fixture, а не глобальный reset host page.

## 11. Acceptance checklist сайта

- [ ] Правильный assistant id и exact Origin.
- [ ] Snippet один раз в общем layout/template.
- [ ] CSP разрешает только нужный script/connect origin.
- [ ] Нет provider/admin secrets в DOM/network/storage.
- [ ] Host layout, формы, keyboard shortcuts и modals не сломаны.
- [ ] Widget работает без admin login/cookies Bitrix.
- [ ] Перезагрузка продолжает активный диалог, «Новый диалог» очищает его состояние, а истекшая сессия обрабатывается без утечки истории.
- [ ] Mobile/Safari/keyboard/reduced motion проверены.
- [ ] Ошибка API/provider показывает fallback, не stack trace.
- [ ] Cache purge и rollback snippet задокументированы.
