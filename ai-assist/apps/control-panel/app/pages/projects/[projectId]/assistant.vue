<script setup lang="ts">
import type {
  AssistantOriginEnvironment,
  AssistantSettingsResponse,
  UpdateAssistantDraftRequest,
} from "@ai-assist/contracts";

const route = useRoute();
const session = useAdminSessionState();
const projectId = computed(() => String(route.params.projectId));
const requestFetch = useRequestFetch();
const isSaving = ref(false);
const isPublishing = ref(false);
const message = ref<{ type: "success" | "error"; text: string } | null>(null);
let nextOriginKey = 0;
const createOriginRow = (origin: string, environment: AssistantOriginEnvironment) => ({
  key: (nextOriginKey += 1),
  origin,
  environment,
});
const form = reactive({
  name: "",
  greeting: "",
  placeholder: "",
  accentColor: "#315EFB",
  launcherPosition: "right" as "left" | "right",
  contactFallback: "",
  locale: "ru",
  enabled: true,
  maintenanceMessage: "",
  maxConversationTurns: 20,
  responseTimeoutSeconds: 45,
  dailyRateLimit: 500,
  citationsEnabled: true,
  allowedOrigins: [] as Array<{
    key: number;
    origin: string;
    environment: AssistantOriginEnvironment;
  }>,
});

const { data, error } = await useAsyncData(
  () => `project-assistant-${projectId.value}`,
  () => requestFetch<AssistantSettingsResponse>(`/api/v1/projects/${projectId.value}/assistant`),
);

const applyDraft = (settings: AssistantSettingsResponse): void => {
  form.name = settings.draft.name;
  form.greeting = settings.draft.greeting;
  form.placeholder = settings.draft.placeholder;
  form.accentColor = settings.draft.accentColor;
  form.launcherPosition = settings.draft.launcherPosition;
  form.contactFallback = settings.draft.contactFallback ?? "";
  form.locale = settings.draft.locale;
  form.enabled = settings.draft.enabled;
  form.maintenanceMessage = settings.draft.maintenanceMessage ?? "";
  form.maxConversationTurns = settings.draft.maxConversationTurns;
  form.responseTimeoutSeconds = settings.draft.responseTimeoutSeconds;
  form.dailyRateLimit = settings.draft.dailyRateLimit;
  form.citationsEnabled = settings.draft.citationsEnabled;
  form.allowedOrigins.splice(
    0,
    form.allowedOrigins.length,
    ...settings.draft.allowedOrigins.map(({ origin, environment }) =>
      createOriginRow(origin, environment),
    ),
  );
};

watch(
  data,
  (settings) => {
    if (settings) applyDraft(settings);
  },
  { immediate: true },
);

const projectRole = computed(
  () => session.value?.projects.find((project) => project.id === projectId.value)?.role,
);
const canEdit = computed(() => projectRole.value === "owner");

const errorMessages: Record<string, string> = {
  ASSISTANT_ORIGIN_INVALID:
    "Origin должен содержать только scheme, host и порт без пути, wildcard или credentials.",
  ASSISTANT_ORIGIN_HTTPS_REQUIRED:
    "Production Origin обязан использовать HTTPS. HTTP разрешён только для localhost preview.",
  ASSISTANT_ORIGIN_DUPLICATE: "Один Origin указан несколько раз.",
  ASSISTANT_VERSION_CONFLICT:
    "Настройки уже изменены в другой вкладке. Обновите страницу перед повторным сохранением.",
  ASSISTANT_CONFIG_UNCHANGED: "В настройках нет изменений.",
  ASSISTANT_PROMPT_REQUIRED: "Сначала опубликуйте основной системный prompt.",
};

const setError = (requestError: unknown, fallback: string): void => {
  const fetchError = requestError as {
    data?: { code?: string; data?: { code?: string }; statusMessage?: string };
  };
  const code = fetchError.data?.data?.code ?? fetchError.data?.code;
  message.value = {
    type: "error",
    text: (code && errorMessages[code]) || fetchError.data?.statusMessage || fallback,
  };
};

const addOrigin = (): void => {
  form.allowedOrigins.push(createOriginRow("https://", "production"));
};

const removeOrigin = (index: number): void => {
  if (form.allowedOrigins.length <= 1) return;
  form.allowedOrigins.splice(index, 1);
};

const requestBody = (): UpdateAssistantDraftRequest => ({
  expectedVersion: data.value?.assistant.configVersion ?? 1,
  name: form.name,
  greeting: form.greeting,
  placeholder: form.placeholder,
  accentColor: form.accentColor,
  launcherPosition: form.launcherPosition,
  contactFallback: form.contactFallback.trim() || null,
  locale: form.locale,
  enabled: form.enabled,
  maintenanceMessage: form.maintenanceMessage.trim() || null,
  maxConversationTurns: form.maxConversationTurns,
  responseTimeoutSeconds: form.responseTimeoutSeconds,
  dailyRateLimit: form.dailyRateLimit,
  citationsEnabled: form.citationsEnabled,
  allowedOrigins: form.allowedOrigins.map(({ origin, environment }) => ({ origin, environment })),
});

const saveDraft = async (): Promise<void> => {
  if (!canEdit.value || !data.value) return;
  isSaving.value = true;
  message.value = null;
  try {
    data.value = await $fetch<AssistantSettingsResponse>(
      `/api/v1/projects/${projectId.value}/assistant/draft`,
      {
        method: "PATCH",
        headers: getCsrfHeaders(),
        body: requestBody(),
      },
    );
    message.value = {
      type: "success",
      text: "Черновик сохранён. Production-конфигурация пока не изменилась.",
    };
  } catch (requestError) {
    setError(requestError, "Не удалось сохранить настройки ассистента.");
  } finally {
    isSaving.value = false;
  }
};

const publish = async (): Promise<void> => {
  if (!canEdit.value || !data.value) return;
  isPublishing.value = true;
  message.value = null;
  try {
    data.value = await $fetch<AssistantSettingsResponse>(
      `/api/v1/projects/${projectId.value}/assistant/publish`,
      {
        method: "POST",
        headers: getCsrfHeaders(),
        body: { expectedVersion: data.value.assistant.configVersion },
      },
    );
    message.value = { type: "success", text: "Настройки ассистента опубликованы." };
  } catch (requestError) {
    setError(requestError, "Не удалось опубликовать настройки ассистента.");
  } finally {
    isPublishing.value = false;
  }
};
</script>

<template>
  <main class="page-frame page-frame--narrow">
    <header class="page-header">
      <div>
        <p class="eyebrow">Конфигурация</p>
        <h1 class="page-title page-title--compact">Ассистент</h1>
        <p class="page-description">
          Черновик интерфейса и&nbsp;разрешённых сайтов. Production меняется только после
          публикации.
        </p>
      </div>
      <span
        v-if="data"
        class="status-badge"
        :data-status="data.hasUnpublishedChanges ? 'draft' : 'published'"
      >
        {{ data.hasUnpublishedChanges ? "есть черновик" : "опубликовано" }}
      </span>
    </header>

    <div v-if="error" class="empty-state" role="alert">
      Настройки ассистента недоступны или&nbsp;проект не&nbsp;найден.
    </div>

    <template v-else-if="data">
      <p
        v-if="message"
        class="form-message assistant-message"
        :class="`form-message--${message.type}`"
        role="status"
      >
        {{ message.text }}
      </p>

      <section class="panel assistant-summary" aria-labelledby="assistant-identity-title">
        <header class="section-header">
          <div>
            <p class="eyebrow">Identity</p>
            <h2 id="assistant-identity-title" class="section-title">Публичный идентификатор</h2>
          </div>
        </header>
        <div class="readonly-summary">
          <div>
            <span>Assistant ID</span>
            <code>{{ data.assistant.publicId }}</code>
          </div>
          <div>
            <span>Черновик</span>
            <strong>revision {{ data.draft.revisionNo }}</strong>
          </div>
          <div>
            <span>Production</span>
            <strong>
              {{
                data.activeConfig ? `revision ${data.activeConfig.revisionNo}` : "не опубликован"
              }}
            </strong>
          </div>
        </div>
      </section>

      <form class="panel form-stack" @submit.prevent="saveDraft">
        <header class="section-header">
          <div>
            <p class="eyebrow">Интерфейс</p>
            <h2 class="section-title">Тексты и&nbsp;отображение</h2>
          </div>
        </header>

        <div class="form-grid">
          <label class="form-field">
            <span class="form-field__label">Название ассистента</span>
            <input
              v-model.trim="form.name"
              class="form-field__control"
              type="text"
              maxlength="160"
              required
              :disabled="!canEdit"
            />
          </label>

          <label class="form-field">
            <span class="form-field__label">Язык</span>
            <input
              v-model.trim="form.locale"
              class="form-field__control"
              type="text"
              maxlength="16"
              required
              :disabled="!canEdit"
            />
          </label>

          <label class="form-field form-field--wide">
            <span class="form-field__label">Приветствие</span>
            <textarea
              v-model.trim="form.greeting"
              class="form-field__control assistant-textarea"
              maxlength="2000"
              required
              :disabled="!canEdit"
            />
          </label>

          <label class="form-field">
            <span class="form-field__label">Placeholder поля вопроса</span>
            <input
              v-model.trim="form.placeholder"
              class="form-field__control"
              type="text"
              maxlength="200"
              required
              :disabled="!canEdit"
            />
          </label>

          <label class="form-field">
            <span class="form-field__label">Положение кнопки</span>
            <select
              v-model="form.launcherPosition"
              class="form-field__control"
              :disabled="!canEdit"
            >
              <option value="right">Справа</option>
              <option value="left">Слева</option>
            </select>
          </label>

          <label class="form-field">
            <span class="form-field__label">Акцентный цвет</span>
            <span class="assistant-color">
              <input
                v-model="form.accentColor"
                class="assistant-color__picker"
                type="color"
                :disabled="!canEdit"
              />
              <input
                v-model.trim="form.accentColor"
                class="form-field__control"
                type="text"
                pattern="#[A-Fa-f0-9]{6}"
                maxlength="7"
                required
                :disabled="!canEdit"
              />
            </span>
          </label>

          <label class="form-field">
            <span class="form-field__label">Контактный fallback</span>
            <input
              v-model.trim="form.contactFallback"
              class="form-field__control"
              type="text"
              maxlength="2000"
              placeholder="Телефон, email или URL"
              :disabled="!canEdit"
            />
          </label>

          <label class="form-field form-field--wide">
            <span class="form-field__label">Сообщение при&nbsp;отключённом виджете</span>
            <textarea
              v-model.trim="form.maintenanceMessage"
              class="form-field__control assistant-textarea"
              maxlength="2000"
              :disabled="!canEdit"
            />
          </label>
        </div>

        <div class="assistant-toggles">
          <label class="assistant-toggle">
            <input v-model="form.enabled" type="checkbox" :disabled="!canEdit" />
            <span>Виджет включён</span>
          </label>
          <label class="assistant-toggle">
            <input v-model="form.citationsEnabled" type="checkbox" :disabled="!canEdit" />
            <span>Показывать источники ответа</span>
          </label>
        </div>

        <header class="section-header assistant-section-header">
          <div>
            <p class="eyebrow">Безопасность</p>
            <h2 class="section-title">Разрешённые Origins</h2>
          </div>
          <button
            class="button button--secondary"
            type="button"
            :disabled="!canEdit || form.allowedOrigins.length >= 20"
            @click="addOrigin"
          >
            Добавить Origin
          </button>
        </header>

        <p class="form-field__hint">
          Только точный origin без пути: например, https://gofroprodpak.ru. Wildcard запрещён.
        </p>

        <div class="assistant-origin-list">
          <div
            v-for="(origin, index) in form.allowedOrigins"
            :key="origin.key"
            class="assistant-origin"
          >
            <label class="form-field">
              <span class="form-field__label">Origin</span>
              <input
                v-model.trim="origin.origin"
                class="form-field__control"
                type="url"
                maxlength="512"
                required
                :disabled="!canEdit"
              />
            </label>
            <label class="form-field">
              <span class="form-field__label">Среда</span>
              <select v-model="origin.environment" class="form-field__control" :disabled="!canEdit">
                <option value="production">Production</option>
                <option value="preview">Preview</option>
              </select>
            </label>
            <button
              class="text-button text-button--danger assistant-origin__remove"
              type="button"
              :disabled="!canEdit || form.allowedOrigins.length <= 1"
              @click="removeOrigin(index)"
            >
              Удалить
            </button>
          </div>
        </div>

        <header class="section-header assistant-section-header">
          <div>
            <p class="eyebrow">Ограничения</p>
            <h2 class="section-title">Runtime</h2>
          </div>
        </header>

        <div class="form-grid">
          <label class="form-field">
            <span class="form-field__label">Сообщений в&nbsp;диалоге</span>
            <input
              v-model.number="form.maxConversationTurns"
              class="form-field__control"
              type="number"
              min="1"
              max="50"
              required
              :disabled="!canEdit"
            />
          </label>
          <label class="form-field">
            <span class="form-field__label">Timeout ответа, секунд</span>
            <input
              v-model.number="form.responseTimeoutSeconds"
              class="form-field__control"
              type="number"
              min="5"
              max="120"
              required
              :disabled="!canEdit"
            />
          </label>
          <label class="form-field form-field--wide">
            <span class="form-field__label">Дневной лимит запросов</span>
            <input
              v-model.number="form.dailyRateLimit"
              class="form-field__control"
              type="number"
              min="10"
              max="100000"
              required
              :disabled="!canEdit"
            />
          </label>
        </div>

        <p v-if="!canEdit" class="form-message">
          Только владелец проекта может изменять и&nbsp;публиковать настройки.
        </p>

        <div class="form-actions form-actions--split">
          <button
            class="button button--secondary"
            type="button"
            :disabled="!canEdit || isPublishing || !data.hasUnpublishedChanges"
            @click="publish"
          >
            {{ isPublishing ? "Публикуем…" : "Опубликовать настройки" }}
          </button>
          <button class="button button--primary" type="submit" :disabled="!canEdit || isSaving">
            {{ isSaving ? "Сохраняем…" : "Сохранить черновик" }}
          </button>
        </div>
      </form>
    </template>
  </main>
</template>
