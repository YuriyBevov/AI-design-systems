<script setup lang="ts">
import type {
  AssistantSettingsResponse,
  KnowledgeIndexStateResponse,
  ModelCatalogResponse,
  ProjectModelSettingsResponse,
  ProviderModelResponse,
  ProviderStateResponse,
  ReauthenticateResponse,
  SyncModelsResponse,
} from "@ai-assist/contracts";

type SensitiveCredentialAction = "save" | "delete";

const route = useRoute();
const projectId = computed(() => String(route.params.projectId));
const requestFetch = useRequestFetch();
const { setKnowledgeIndexState, markKnowledgeReindexRequired } = useKnowledgeIndexState();
const apiKey = ref("");
const isSavingKey = ref(false);
const isTestingKey = ref(false);
const isDeletingKey = ref(false);
const isSyncingModels = ref(false);
const isSavingModels = ref(false);
const deleteConfirmationVisible = ref(false);
const reauthenticationVisible = ref(false);
const isReauthenticating = ref(false);
const pendingCredentialAction = ref<SensitiveCredentialAction | null>(null);
const message = ref<{ type: "success" | "error"; text: string } | null>(null);
useToastMessage(message);
const modelForm = reactive({
  chatModelId: null as string | null,
  embeddingModelId: null as string | null,
  rerankModelId: null as string | null,
  maxOutputTokens: 1500,
  temperature: null as number | null,
});

const { data, error, refresh } = await useAsyncData(
  () => `project-provider-${projectId.value}`,
  async () => {
    const [assistantSettings, providerState, modelCatalog, modelSettings, indexState] =
      await Promise.all([
        requestFetch<AssistantSettingsResponse>(`/api/v1/projects/${projectId.value}/assistant`),
        requestFetch<ProviderStateResponse>(`/api/v1/projects/${projectId.value}/provider`),
        requestFetch<ModelCatalogResponse>("/api/v1/models"),
        requestFetch<ProjectModelSettingsResponse>(
          `/api/v1/projects/${projectId.value}/model-settings`,
        ),
        requestFetch<KnowledgeIndexStateResponse>(`/api/v1/projects/${projectId.value}/knowledge`),
      ]);
    return { assistantSettings, providerState, modelCatalog, modelSettings, indexState };
  },
);

watch(
  () => data.value?.modelSettings,
  (settings) => {
    if (!settings) return;
    modelForm.chatModelId = settings.chatModelId;
    modelForm.embeddingModelId = settings.embeddingModelId;
    modelForm.rerankModelId = settings.rerankModelId;
    modelForm.maxOutputTokens = settings.maxOutputTokens;
    modelForm.temperature = settings.temperature;
  },
  { immediate: true },
);

watch(
  () => data.value?.indexState,
  (indexState) => {
    if (indexState) setKnowledgeIndexState(projectId.value, indexState);
  },
  { immediate: true },
);

const credential = computed(() => data.value?.providerState.credential ?? null);
const availableModels = computed(
  () => data.value?.modelCatalog.models.filter((model) => model.available) ?? [],
);
const hasConnectedProvider = computed(() => credential.value?.status === "verified");
const showModelCatalog = computed(
  () => hasConnectedProvider.value && availableModels.value.length > 0,
);
const chatModels = computed(() =>
  availableModels.value.filter(
    (model) =>
      model.capability === "chat" &&
      model.inputModalities.includes("text") &&
      model.outputModalities.includes("text"),
  ),
);
const selectedChatModel = computed(() =>
  chatModels.value.find((model) => model.id === modelForm.chatModelId),
);
const applicationMaxOutputTokens = 64_000;
const modelMaxOutputTokens = computed(() => selectedChatModel.value?.maxOutput ?? null);
const maxOutputTokensLimit = computed(() =>
  Math.min(modelMaxOutputTokens.value ?? applicationMaxOutputTokens, applicationMaxOutputTokens),
);
const formatInteger = (value: number): string =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value);
const maxOutputTokenNotes = computed(() => [
  "Задаёт верхний предел длины одного ответа. Модель может завершить ответ раньше.",
  "Чем выше значение, тем длиннее может быть ответ и тем больше потенциальный расход бюджета.",
  modelMaxOutputTokens.value
    ? `Максимум в панели — ${formatInteger(maxOutputTokensLimit.value)} токенов. Технический максимум выбранной модели — ${formatInteger(modelMaxOutputTokens.value)}.`
    : `Максимум в панели — ${formatInteger(maxOutputTokensLimit.value)} токенов. Провайдер не указал технический максимум выбранной модели.`,
]);
const clampNumberInput = (
  event: Event,
  minimum: number,
  maximum: number,
  update: (value: number) => void,
): void => {
  const input = event.target as HTMLInputElement;
  if (!input.value) return;
  const value = input.valueAsNumber;
  if (!Number.isFinite(value)) return;
  const clampedValue = Math.min(maximum, Math.max(minimum, value));
  if (clampedValue === value) return;
  input.value = String(clampedValue);
  update(clampedValue);
};
const clampMaxOutputTokens = (event: Event): void => {
  clampNumberInput(event, 1, maxOutputTokensLimit.value, (value) => {
    modelForm.maxOutputTokens = value;
  });
};
const clampTemperature = (event: Event): void => {
  clampNumberInput(event, 0, 2, (value) => {
    modelForm.temperature = value;
  });
};
const embeddingModels = computed(() =>
  availableModels.value.filter(
    (model) =>
      model.capability === "embeddings" &&
      model.id !== "auto" &&
      model.inputModalities.includes("text") &&
      model.outputModalities.includes("embedding"),
  ),
);
const rerankModels = computed(() =>
  availableModels.value.filter(
    (model) => model.capability === "rerank" && model.outputModalities.includes("rerank"),
  ),
);

const providerErrorMessages: Record<string, string> = {
  PROVIDER_CREDENTIAL_FORMAT_INVALID:
    "Вставьте только полный ключ провайдера без кавычек, пояснений и лишних символов.",
  REAUTHENTICATION_FAILED: "Пароль неверный. Проверьте его и повторите попытку.",
  CREDENTIAL_ENCRYPTION_KEY_REQUIRED:
    "На сервере не настроен безопасный master key для шифрования provider credential.",
  CREDENTIAL_ENCRYPTION_KEY_INVALID:
    "Master key сервера имеет неверный формат. Требуется base64 от 32 случайных байт; это не ключ провайдера.",
  CREDENTIAL_KEY_VERSION_UNAVAILABLE:
    "На сервере отсутствует master key нужной версии. Проверьте конфигурацию ротации ключей.",
  CREDENTIAL_DECRYPTION_FAILED:
    "Сохранённый ключ не удалось расшифровать текущим master key. Верните прежний master key или сохраните ключ провайдера заново.",
  PROVIDER_CREDENTIAL_INVALID: "Провайдер отклонил ключ. Проверьте его статус и ограничения.",
  PROVIDER_BUDGET_EXCEEDED: "Бюджет ключа провайдера исчерпан.",
  PROVIDER_RATE_LIMITED: "Провайдер временно ограничил частоту запросов. Повторите позже.",
  PROVIDER_TIMEOUT: "Провайдер не ответил за отведённое время. Повторите позже.",
  PROVIDER_UNAVAILABLE: "Провайдер временно недоступен. Повторите позже.",
  PROVIDER_BAD_RESPONSE: "Провайдер вернул ответ неизвестного формата.",
};

const getErrorCode = (error: unknown): string | undefined => {
  const fetchError = error as { data?: { code?: string; data?: { code?: string } } };
  return fetchError.data?.data?.code ?? fetchError.data?.code;
};

const setError = (error: unknown, fallback: string): void => {
  const fetchError = error as {
    data?: { code?: string; data?: { code?: string }; statusMessage?: string };
  };
  const code = fetchError.data?.data?.code ?? fetchError.data?.code;
  message.value = {
    type: "error",
    text: (code && providerErrorMessages[code]) || fetchError.data?.statusMessage || fallback,
  };
};

const requestReauthentication = (error: unknown, action: SensitiveCredentialAction): boolean => {
  if (getErrorCode(error) !== "RECENT_AUTHENTICATION_REQUIRED") return false;
  pendingCredentialAction.value = action;
  reauthenticationVisible.value = true;
  return true;
};

const closeReauthentication = (): void => {
  if (isReauthenticating.value) return;
  reauthenticationVisible.value = false;
  pendingCredentialAction.value = null;
};

const formatDate = (value: string | null | undefined): string =>
  value
    ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
      )
    : "—";
const formatExpiration = (value: string | null | undefined): string =>
  value ? formatDate(value) : "Бессрочно";
const formatSyncDate = (value: string | null | undefined): string =>
  value
    ? new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "—";

const formatModel = (model: ProviderModelResponse): string => {
  const providerName = model.upstreamProvider ? ` · ${model.upstreamProvider}` : "";
  const promptCost = model.pricing.promptCost;
  const price = promptCost !== undefined ? ` · ${promptCost.toFixed(2)} ₽/1M` : "";
  return `${model.id}${providerName}${price}`;
};
const chatModelOptions = computed(() => [
  { value: null, label: "Не выбрана" },
  ...chatModels.value.map((model) => ({ value: model.id, label: formatModel(model) })),
]);
const embeddingModelOptions = computed(() => [
  { value: null, label: "Не выбрана" },
  ...embeddingModels.value.map((model) => ({ value: model.id, label: formatModel(model) })),
]);
const rerankModelOptions = computed(() => [
  { value: null, label: "Не используется" },
  ...rerankModels.value.map((model) => ({ value: model.id, label: formatModel(model) })),
]);
const isModelFormDirty = computed(() => {
  const savedSettings = data.value?.modelSettings;
  if (!savedSettings) return false;

  const temperature =
    typeof modelForm.temperature === "number" && Number.isFinite(modelForm.temperature)
      ? modelForm.temperature
      : null;

  return (
    (modelForm.chatModelId || null) !== savedSettings.chatModelId ||
    (modelForm.embeddingModelId || null) !== savedSettings.embeddingModelId ||
    (modelForm.rerankModelId || null) !== savedSettings.rerankModelId ||
    modelForm.maxOutputTokens !== savedSettings.maxOutputTokens ||
    temperature !== savedSettings.temperature
  );
});

const saveKey = async (): Promise<void> => {
  const normalizedApiKey = apiKey.value.trim();
  if (!/^sk-aitunnel-[A-Za-z0-9_-]+$/u.test(normalizedApiKey) || normalizedApiKey.length < 20) {
    message.value = {
      type: "error",
      text: providerErrorMessages.PROVIDER_CREDENTIAL_FORMAT_INVALID ?? "Неверный формат ключа.",
    };
    return;
  }

  isSavingKey.value = true;
  message.value = null;
  try {
    const providerState = await $fetch<ProviderStateResponse>(
      `/api/v1/projects/${projectId.value}/provider/credential`,
      {
        method: "PUT",
        headers: getCsrfHeaders(),
        body: { apiKey: normalizedApiKey },
      },
    );
    if (data.value) data.value.providerState = providerState;
    apiKey.value = "";
    message.value = { type: "success", text: "Ключ проверен, зашифрован и сохранён" };
  } catch (requestError) {
    if (!requestReauthentication(requestError, "save")) {
      setError(requestError, "Ключ не прошёл проверку");
    }
  } finally {
    isSavingKey.value = false;
  }
};

const testKey = async (): Promise<void> => {
  isTestingKey.value = true;
  message.value = null;
  try {
    await $fetch(`/api/v1/projects/${projectId.value}/provider/credential/test`, {
      method: "POST",
      headers: getCsrfHeaders(),
    });
    await refresh();
    message.value = { type: "success", text: "Сохранённый ключ действителен" };
  } catch (requestError) {
    setError(requestError, "Проверка ключа завершилась ошибкой");
  } finally {
    isTestingKey.value = false;
  }
};

const deleteKey = async (): Promise<void> => {
  if (isDeletingKey.value) return;
  isDeletingKey.value = true;
  message.value = null;
  try {
    await $fetch(`/api/v1/projects/${projectId.value}/provider/credential`, {
      method: "DELETE",
      headers: getCsrfHeaders(),
    });
    if (data.value) data.value.providerState = { provider: "aitunnel", credential: null };
    message.value = { type: "success", text: "Ключ удалён. Новые запросы к провайдеру отключены." };
  } catch (requestError) {
    if (!requestReauthentication(requestError, "delete")) {
      setError(requestError, "Не удалось удалить ключ");
    }
  } finally {
    deleteConfirmationVisible.value = false;
    isDeletingKey.value = false;
  }
};

const reauthenticate = async (password: string): Promise<void> => {
  if (!pendingCredentialAction.value || isReauthenticating.value) return;
  isReauthenticating.value = true;
  message.value = null;
  try {
    await $fetch<ReauthenticateResponse>("/api/v1/auth/reauthenticate", {
      method: "POST",
      headers: getCsrfHeaders(),
      body: { password },
    });
    const action = pendingCredentialAction.value;
    reauthenticationVisible.value = false;
    pendingCredentialAction.value = null;
    if (action === "save") await saveKey();
    if (action === "delete") await deleteKey();
  } catch (requestError) {
    setError(requestError, "Не удалось подтвердить пароль");
  } finally {
    isReauthenticating.value = false;
  }
};

const syncModels = async (): Promise<void> => {
  isSyncingModels.value = true;
  message.value = null;
  try {
    const result = await $fetch<SyncModelsResponse>("/api/v1/models/sync", {
      method: "POST",
      headers: getCsrfHeaders(),
      body: { projectId: projectId.value },
    });
    if (data.value) {
      data.value.modelCatalog = await $fetch<ModelCatalogResponse>("/api/v1/models");
    }
    message.value = {
      type: "success",
      text: `Каталог обновлён: диалоговые — ${result.counts.chat}, векторизация — ${result.counts.embeddings}, переранжирование — ${result.counts.rerank}`,
    };
  } catch (requestError) {
    setError(requestError, "Не удалось обновить каталог моделей");
  } finally {
    isSyncingModels.value = false;
  }
};

const saveModels = async (): Promise<void> => {
  isSavingModels.value = true;
  message.value = null;
  const previousEmbeddingModelId = data.value?.modelSettings.embeddingModelId ?? null;
  if (
    !Number.isInteger(modelForm.maxOutputTokens) ||
    modelForm.maxOutputTokens < 1 ||
    modelForm.maxOutputTokens > maxOutputTokensLimit.value
  ) {
    message.value = {
      type: "error",
      text: `Укажите максимум токенов от 1 до ${formatInteger(maxOutputTokensLimit.value)}.`,
    };
    isSavingModels.value = false;
    return;
  }
  if (
    typeof modelForm.temperature === "number" &&
    (!Number.isFinite(modelForm.temperature) ||
      modelForm.temperature < 0 ||
      modelForm.temperature > 2)
  ) {
    message.value = { type: "error", text: "Укажите вариативность ответа от 0 до 2." };
    isSavingModels.value = false;
    return;
  }
  try {
    const modelSettings = await $fetch<ProjectModelSettingsResponse>(
      `/api/v1/projects/${projectId.value}/model-settings`,
      {
        method: "PUT",
        headers: getCsrfHeaders(),
        body: {
          chatModelId: modelForm.chatModelId || null,
          embeddingModelId: modelForm.embeddingModelId || null,
          rerankModelId: modelForm.rerankModelId || null,
          maxOutputTokens: modelForm.maxOutputTokens,
          temperature: typeof modelForm.temperature === "number" ? modelForm.temperature : null,
        },
      },
    );
    if (data.value) {
      data.value.modelSettings = modelSettings;
      data.value.indexState.configuredEmbeddingModelId = modelSettings.embeddingModelId;
      setKnowledgeIndexState(projectId.value, data.value.indexState);
    }
    const embeddingModelChanged =
      modelSettings.embeddingModelId !== null &&
      modelSettings.embeddingModelId !== previousEmbeddingModelId;
    const reindexRequiredAfterSave =
      embeddingModelChanged &&
      data.value?.indexState.active?.embeddingModelId !== modelSettings.embeddingModelId;
    if (reindexRequiredAfterSave) markKnowledgeReindexRequired(projectId.value);
    message.value = {
      type: "success",
      text: embeddingModelChanged
        ? "Модель векторизации сохранена. Требуется переиндексация базы знаний."
        : "Настройки моделей сохранены",
    };
  } catch (requestError) {
    setError(requestError, "Не удалось сохранить модели");
  } finally {
    isSavingModels.value = false;
  }
};
</script>

<template>
  <main class="page-frame page-frame--fill">
    <div v-if="error" class="empty-state" role="alert">
      Настройки провайдера недоступны. Раздел открыт только владельцу проекта.
    </div>

    <template v-else-if="data">
      <section class="split-layout" aria-label="Настройки подключения">
        <div class="panel-stack">
          <section class="panel" aria-label="Подключение ключа провайдера">
            <form class="form-stack" novalidate @submit.prevent="saveKey">
              <div class="form-row">
                <label class="form-field">
                  <span class="visually-hidden">Ключ провайдера</span>
                  <input
                    v-model="apiKey"
                    class="form-field__control"
                    type="password"
                    name="provider-key"
                    autocomplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    minlength="20"
                    maxlength="512"
                    placeholder="Добавить новый ключ"
                    spellcheck="false"
                    autocapitalize="off"
                    required
                  />
                </label>
                <button
                  class="icon-button"
                  type="submit"
                  :aria-label="isSavingKey ? 'Активируем ключ' : 'Активировать ключ'"
                  :title="isSavingKey ? 'Активируем…' : 'Активировать ключ'"
                  :disabled="isSavingKey"
                >
                  <UiIcon name="save" />
                </button>
              </div>
            </form>
          </section>

          <section v-if="showModelCatalog" class="panel" aria-labelledby="models-title">
            <header class="section-header">
              <div>
                <h2 id="models-title" class="section-title">Каталог и выбор моделей</h2>
              </div>
              <button class="button" type="button" :disabled="isSyncingModels" @click="syncModels">
                {{ isSyncingModels ? "Синхронизируем…" : "Обновить каталог" }}
              </button>
            </header>

            <div class="catalog-meta">
              <span>
                Последняя синхронизация: {{ formatSyncDate(data.modelCatalog.lastSyncedAt) }}
              </span>
            </div>

            <form class="form-stack" novalidate @submit.prevent="saveModels">
              <div class="form-field">
                <span class="form-field__label">
                  Диалоговая модель (Chat model, {{ chatModels.length }})
                </span>
                <BaseSelect
                  v-model="modelForm.chatModelId"
                  :options="chatModelOptions"
                  :label="`Диалоговая модель (Chat model, ${chatModels.length})`"
                />
                <BaseNote
                  :items="[
                    'Формирует ответы ассистента на сообщения пользователей.',
                    'В режиме auto фактическая модель и стоимость могут меняться.',
                  ]"
                />
              </div>

              <div class="form-field">
                <span class="form-field__label">
                  Модель векторизации (Embedding model, {{ embeddingModels.length }})
                </span>
                <BaseSelect
                  v-model="modelForm.embeddingModelId"
                  :options="embeddingModelOptions"
                  :label="`Модель векторизации (Embedding model, ${embeddingModels.length})`"
                />
                <BaseNote
                  :items="[
                    'Определяет качество поиска по смыслу: какие фрагменты базы знаний будут найдены для вопроса пользователя.',
                    'Также влияет на скорость и стоимость индексации и поиска, но не формирует текст ответа.',
                    'Смена модели потребует полной переиндексации базы знаний.',
                  ]"
                />
              </div>

              <div class="form-field">
                <span class="form-field__label">
                  Модель переранжирования (Rerank model, {{ rerankModels.length }}, опционально)
                </span>
                <BaseSelect
                  v-model="modelForm.rerankModelId"
                  :options="rerankModelOptions"
                  :label="`Модель переранжирования (Rerank model, ${rerankModels.length}, опционально)`"
                />
                <BaseNote
                  :items="[
                    'Повторно сортирует найденные фрагменты по релевантности перед формированием ответа.',
                  ]"
                />
              </div>

              <div class="form-grid">
                <div class="form-field">
                  <label class="form-field__label" for="max-output-tokens">
                    Максимум токенов ответа
                  </label>
                  <input
                    id="max-output-tokens"
                    v-model.number="modelForm.maxOutputTokens"
                    class="form-field__control"
                    type="number"
                    min="1"
                    :max="maxOutputTokensLimit"
                    required
                    @input="clampMaxOutputTokens"
                  />
                  <BaseNote :items="maxOutputTokenNotes" />
                </div>
                <div class="form-field">
                  <label class="form-field__label" for="model-temperature">
                    Вариативность ответа (Temperature, опционально)
                  </label>
                  <input
                    id="model-temperature"
                    v-model.number="modelForm.temperature"
                    class="form-field__control"
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    placeholder="По умолчанию модели"
                    @input="clampTemperature"
                  />
                  <BaseNote
                    :items="[
                      'Управляет вариативностью ответа: 0–0,3 — стабильнее, высокие значения — разнообразнее.',
                      'Можно выбрать значение от 0 до 2. Для стабильных ответов рекомендуем 0,2.',
                    ]"
                  />
                </div>
              </div>

              <div class="form-actions">
                <button
                  class="button button--primary"
                  type="submit"
                  :disabled="isSavingModels || !isModelFormDirty"
                >
                  {{ isSavingModels ? "Применяем…" : "Применить" }}
                </button>
              </div>
            </form>
          </section>
        </div>

        <aside class="panel-stack" aria-label="Состояние подключения">
          <div v-if="credential" class="credential-summary credential-summary--sidebar">
            <div>
              <span>Текущий ключ</span>
              <strong>{{ credential.maskedHint }}</strong>
            </div>
            <div>
              <span>Остаток бюджета</span>
              <strong>
                {{ credential.verification?.budgetRemaining ?? "—" }}
                {{ credential.verification?.budgetRemaining !== null ? "₽" : "" }}
              </strong>
            </div>
            <div>
              <span>Срок действия</span>
              <strong>{{ formatExpiration(credential.verification?.expiresAt) }}</strong>
            </div>
            <div>
              <span>Последняя проверка</span>
              <strong>{{ formatDate(credential.lastVerifiedAt) }}</strong>
            </div>
            <div class="credential-summary__action">
              <button
                class="button button--large"
                type="button"
                :disabled="isTestingKey"
                @click="testKey"
              >
                {{ isTestingKey ? "Проверяем…" : "Проверить ключ" }}
              </button>
              <button
                class="icon-button icon-button--large icon-button--danger"
                type="button"
                aria-label="Удалить ключ"
                title="Удалить ключ"
                @click="deleteConfirmationVisible = true"
              >
                <UiIcon name="trash" />
              </button>
            </div>
          </div>

          <div class="readonly-summary readonly-summary--column panel--push-end">
            <div>
              <span>Публичный идентификатор</span>
              <code>{{ data.assistantSettings.assistant.publicId }}</code>
            </div>
          </div>
        </aside>
      </section>

      <ConfirmModal
        v-if="deleteConfirmationVisible"
        title="Удалить ключ провайдера?"
        description="После удаления чат и индексация не смогут обращаться к провайдеру."
        confirm-label="Удалить ключ"
        pending-label="Удаляем…"
        :pending="isDeletingKey"
        danger
        @close="deleteConfirmationVisible = false"
        @confirm="deleteKey"
      />

      <ReauthenticateModal
        v-if="reauthenticationVisible"
        :pending="isReauthenticating"
        @close="closeReauthentication"
        @confirm="reauthenticate"
      />
    </template>
  </main>
</template>
