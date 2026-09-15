# Crawler и AI-нормализация сайта

Актуальное решение описано в [ADR-005](../decisions/005-ai-normalized-raw-site-ingestion.md).
HTML-crawler отвечает только за безопасное получение структуры, ссылок и сырого текста. Смысловая
очистка и классификация выполняются отдельным server-side AI-normalizer после fetch.

## 1. Discovery

Администратор задаёт публичный URL и глубину дерева от 1 до 8. Discovery:

1. Проверяет URL/DNS и получает `robots.txt`.
2. Находит sitemap из robots и `/sitemap.xml`.
3. Собирает ссылки из `nav`, `header` и элементов `role=navigation` главной страницы.
4. Объединяет URL в дерево по сегментам path до заданной глубины.
5. Возвращает рекурсивные nodes с path, URL, label, depth, provenance и descendant count.

Query URL, другой origin, запрещённые robots paths и служебные Bitrix/auth/cart/search paths в дерево
не попадают. Sitemap discovery ограничен 50 файлами и 10 000 URL.

Выбранный узел без потомков становится `includeExactPath`; с потомками — `includePathPrefix`.
Внутренние ссылки страниц дополнительно расширяют очередь только внутри этого scope.

## 2. Safe fetch

- Только HTTP(S), без credentials/fragments и нестандартных портов.
- Все DNS answers должны быть публичными; DNS повторно проверяется после redirect.
- Redirect остаётся на exact origin и в разрешённом path scope.
- `robots.txt`, crawl delay, MIME allowlist, TLS, timeout и byte limit обязательны.
- Страница загружается обычным HTTP; JavaScript/Playwright сейчас не используется.
- Limited mode обрабатывает до 100 страниц, full mode — до 5000.
- Crawler внутри одного run последовательный; общий worker может выполнять два system jobs.

## 3. Сырой HTML-to-text

Cheerio получает первый `h1` либо `title`, полный видимый `body.text()` и до 3000 ссылок. Удаляются
только технические whitespace-различия. Crawler намеренно не:

- читает JSON-LD/schema.org/microdata;
- определяет товар, услугу или информационную страницу;
- удаляет меню, footer, cookie banner, рекламу и повторяющиеся блоки;
- извлекает цену, SKU или характеристики в отдельные поля;
- исполняет инструкции из HTML.

Сырой HTML не хранится и не возвращается панели.

## 4. AI-normalizer

Для каждой успешно полученной страницы worker использует verified AITUNNEL credential и выбранную
chat-модель проекта. Фиксированная platform-инструкция отделена от сырого текста, который передаётся
как недоверенный user content.

Модель должна:

1. Удалить навигационный и повторяющийся мусор.
2. Не добавлять отсутствующие факты.
3. Выбрать один тип: `info`, `product` или `service`.
4. Собрать характеристики, артикул, цену и условия внутри единого Markdown.
5. Вернуть только JSON `{ type, title, markdown }`.

Ответ ограничен по размеру и валидируется runtime-схемой. Невалидный JSON, неизвестный type, пустое
поле или provider error превращают страницу в failed result. Модель не получает tools, provider key,
prompt ассистента или прямой доступ к публикации.

## 5. Записи и публикация

Одна страница создаёт максимум одну запись. `info` сохраняется внутренним типом `page`; `product` и
`service` — одноимёнными типами. URL источника является identity для идемпотентной синхронизации.

- Новый AI-результат создаёт новую запись.
- Изменившийся checksum создаёт внутреннюю immutable version.
- Неизменившийся checksum не создаёт version.
- Результаты остаются pending до ручной batch-публикации.
- Публикация запускает сборку versioned embedding index и атомарно переключает active index.

История versions остаётся внутренней для аудита/конкурентности. В пользовательском редакторе доступны
поля title/type/Markdown/source URL и действия «Опубликовать изменения»/«Снять с публикации».

## 6. Известные ограничения

- Одна страница не разделяется на несколько товаров/услуг.
- Нет JS rendering, feed/file ingestion, расписания и missing detection.
- Стоимость/latency растут на один chat request для каждой HTML-страницы.
- Provider credential и chat model обязательны до запуска crawl.
- AI confidence пока не калибруется; валидный результат отображается для ручной проверки.

## 7. Обязательные проверки

- private/local/metadata IP, DNS rebinding и cross-origin redirect;
- timeout, oversized body, wrong MIME и redirect loop;
- robots policy, exact/prefix scope и max depth;
- nested tree из sitemap + нескольких меню;
- raw extractor сохраняет boilerplate и не читает schema markup;
- AI output success, malformed JSON, неизвестный type, oversized output, 401/429/5xx;
- prompt-injection text остаётся user content;
- повторный crawl идемпотентен;
- publication не повреждает предыдущий active index.
