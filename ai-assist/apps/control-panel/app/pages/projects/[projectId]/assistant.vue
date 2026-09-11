<script setup lang="ts">
import type {
  AssistantSettingsResponse,
  ProjectResponse,
  UpdateAssistantDraftRequest,
} from "@ai-assist/contracts";

const route = useRoute();
const session = useAdminSessionState();
const projectId = computed(() => String(route.params.projectId));
const localTab = computed(() => getAssistantSettingsTab(route.path, route.query.tab));
const requestFetch = useRequestFetch();
const isSaving = ref(false);
const isPublishing = ref(false);
const isSavingRetention = ref(false);
const message = ref<{ type: "success" | "error"; text: string } | null>(null);
const retentionMessage = ref<{ type: "success" | "error"; text: string } | null>(null);
useToastMessage(message);
useToastMessage(retentionMessage);
const retentionDays = ref(30);
let nextOriginKey = 0;
const createOriginRow = (origin: string) => ({
  key: (nextOriginKey += 1),
  origin,
});
const form = reactive({
  name: "",
  greeting: "",
  placeholder: "",
  accentColor: "#315EFB",
  launcherPosition: "right" as "left" | "right",
  contactFallback: "",
  enabled: true,
  maintenanceMessage: "",
  maxConversationTurns: 20,
  responseTimeoutSeconds: 45,
  dailyRateLimit: 500,
  citationsEnabled: true,
  allowedOrigins: [] as Array<{
    key: number;
    origin: string;
  }>,
});
const launcherPositionOptions = [
  { value: "right", label: "Справа" },
  { value: "left", label: "Слева" },
] as const;
const { data, error } = await useAsyncData(
  () => `project-assistant-${projectId.value}`,
  () => requestFetch<AssistantSettingsResponse>(`/api/v1/projects/${projectId.value}/assistant`),
);

const { data: projectSettings, error: projectSettingsError } = await useAsyncData(
  () => `assistant-project-settings-${projectId.value}`,
  () => requestFetch<ProjectResponse>(`/api/v1/projects/${projectId.value}`),
);

const applyDraft = (settings: AssistantSettingsResponse): void => {
  form.name = settings.draft.name;
  form.greeting = settings.draft.greeting;
  form.placeholder = settings.draft.placeholder;
  form.accentColor = settings.draft.accentColor;
  form.launcherPosition = settings.draft.launcherPosition;
  form.contactFallback = settings.draft.contactFallback ?? "";
  form.enabled = settings.draft.enabled;
  form.maintenanceMessage = settings.draft.maintenanceMessage ?? "";
  form.maxConversationTurns = settings.draft.maxConversationTurns;
  form.responseTimeoutSeconds = settings.draft.responseTimeoutSeconds;
  form.dailyRateLimit = settings.draft.dailyRateLimit;
  form.citationsEnabled = settings.draft.citationsEnabled;
  form.allowedOrigins.splice(
    0,
    form.allowedOrigins.length,
    ...settings.draft.allowedOrigins.map(({ origin }) => createOriginRow(origin)),
  );
};

watch(
  data,
  (settings) => {
    if (settings) applyDraft(settings);
  },
  { immediate: true },
);

watch(
  projectSettings,
  (project) => {
    if (project) retentionDays.value = project.conversationRetentionDays;
  },
  { immediate: true },
);

const projectRole = computed(
  () => session.value?.projects.find((project) => project.id === projectId.value)?.role,
);
const canEdit = computed(() => projectRole.value === "owner");

const errorMessages: Record<string, string> = {
  ASSISTANT_ORIGIN_INVALID:
    "URL-адрес должен содержать только протокол, домен и порт без пути и дополнительных параметров.",
  ASSISTANT_ORIGIN_HTTPS_REQUIRED:
    "Боевой URL-адрес должен использовать HTTPS. HTTP разрешён только для локального предпросмотра.",
  ASSISTANT_ORIGIN_DUPLICATE: "Один URL-адрес указан несколько раз.",
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
  form.allowedOrigins.push(createOriginRow("https://"));
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
  locale: "ru",
  enabled: form.enabled,
  maintenanceMessage: form.maintenanceMessage.trim() || null,
  maxConversationTurns: form.maxConversationTurns,
  responseTimeoutSeconds: form.responseTimeoutSeconds,
  dailyRateLimit: form.dailyRateLimit,
  citationsEnabled: form.citationsEnabled,
  allowedOrigins: form.allowedOrigins.map(({ origin }) => ({ origin })),
});

const saveRetention = async (): Promise<void> => {
  if (!canEdit.value || !projectSettings.value || isSavingRetention.value) return;
  isSavingRetention.value = true;
  retentionMessage.value = null;
  try {
    projectSettings.value = await $fetch<ProjectResponse>(`/api/v1/projects/${projectId.value}`, {
      method: "PATCH",
      headers: getCsrfHeaders(),
      body: { conversationRetentionDays: retentionDays.value },
    });
    retentionMessage.value = { type: "success", text: "Срок хранения диалогов сохранён." };
  } catch (requestError) {
    const fetchError = requestError as { data?: { statusMessage?: string } };
    retentionMessage.value = {
      type: "error",
      text: fetchError.data?.statusMessage ?? "Не удалось сохранить срок хранения диалогов.",
    };
  } finally {
    isSavingRetention.value = false;
  }
};

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
    <div v-if="error" class="empty-state" role="alert">
      Настройки ассистента недоступны или&nbsp;проект не&nbsp;найден.
    </div>

    <template v-else-if="data">
      <form
        v-if="localTab === 'interface' || localTab === 'security'"
        class="panel form-stack"
        @submit.prevent="saveDraft"
      >
        <template v-if="localTab === 'interface'">
          <header class="section-header">
            <div>
              <h2 class="section-title">Интерфейс</h2>
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

            <div class="form-field">
              <span class="form-field__label">Положение кнопки</span>
              <BaseSelect
                v-model="form.launcherPosition"
                :options="launcherPositionOptions"
                label="Положение кнопки"
                :disabled="!canEdit"
              />
            </div>

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
              <span class="form-field__label">Резервный контакт</span>
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
        </template>

        <template v-else>
          <header class="section-header">
            <div>
              <h2 class="section-title">Разрешённые URL-адреса</h2>
            </div>
            <button
              class="button"
              type="button"
              :disabled="!canEdit || form.allowedOrigins.length >= 20"
              @click="addOrigin"
            >
              Добавить URL-адрес
            </button>
          </header>

          <div class="assistant-origin-list">
            <div
              v-for="(origin, index) in form.allowedOrigins"
              :key="origin.key"
              class="assistant-origin"
            >
              <div class="form-field">
                <input
                  v-model.trim="origin.origin"
                  class="form-field__control"
                  type="url"
                  aria-label="URL-адрес"
                  maxlength="512"
                  required
                  :disabled="!canEdit"
                />
              </div>
              <button
                class="icon-button icon-button--danger assistant-origin__remove"
                type="button"
                aria-label="Удалить URL-адрес"
                :disabled="!canEdit || form.allowedOrigins.length <= 1"
                @click="removeOrigin(index)"
              >
                <UiIcon name="trash" />
              </button>
            </div>
          </div>

          <p class="form-field__hint">* Только точный URL, например https://sitename.ru</p>

          <header class="section-header assistant-section-header">
            <div>
              <h2 class="section-title">Ограничения работы</h2>
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
              <span class="form-field__label">Таймаут ответа, секунд</span>
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
        </template>

        <p v-if="!canEdit" class="form-note">
          Только администратор может изменять и&nbsp;публиковать настройки.
        </p>

        <div class="form-actions form-actions--split">
          <button
            class="button"
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

      <form v-if="localTab === 'security'" class="panel form-stack" @submit.prevent="saveRetention">
        <header class="section-header">
          <div>
            <h2 class="section-title">Хранение диалогов</h2>
          </div>
          <p class="section-description">
            Применяется сразу и&nbsp;не&nbsp;требует публикации черновика.
          </p>
        </header>

        <div v-if="projectSettingsError" class="form-note form-note--error" role="alert">
          Настройка срока хранения недоступна.
        </div>

        <template v-else-if="projectSettings">
          <label class="form-field">
            <span class="form-field__label">Хранение диалогов, дней</span>
            <input
              v-model.number="retentionDays"
              class="form-field__control"
              type="number"
              min="0"
              max="3650"
              required
              :disabled="!canEdit"
            />
            <span class="form-field__hint">
              0 — хранить только до&nbsp;окончания текущей сессии. Максимум — 3650 дней.
            </span>
          </label>

          <div class="form-actions">
            <button
              class="button button--primary"
              type="submit"
              :disabled="!canEdit || isSavingRetention"
            >
              {{ isSavingRetention ? "Сохраняем…" : "Сохранить срок хранения" }}
            </button>
          </div>
        </template>
      </form>
    </template>
  </main>
</template>
