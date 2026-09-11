<script setup lang="ts">
import type {
  AssistantSettingsResponse,
  ModelCatalogResponse,
  ProjectModelSettingsResponse,
  ProviderModelResponse,
  ProviderStateResponse,
  SyncModelsResponse,
} from "@ai-assist/contracts";

const route = useRoute();
const projectId = computed(() => String(route.params.projectId));
const requestFetch = useRequestFetch();
const apiKey = ref("");
const isSavingKey = ref(false);
const isTestingKey = ref(false);
const isSyncingModels = ref(false);
const isSavingModels = ref(false);
const deleteConfirmationVisible = ref(false);
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
    const [assistantSettings, providerState, modelCatalog, modelSettings] = await Promise.all([
      requestFetch<AssistantSettingsResponse>(`/api/v1/projects/${projectId.value}/assistant`),
      requestFetch<ProviderStateResponse>(`/api/v1/projects/${projectId.value}/provider`),
      requestFetch<ModelCatalogResponse>("/api/v1/models"),
      requestFetch<ProjectModelSettingsResponse>(
        `/api/v1/projects/${projectId.value}/model-settings`,
      ),
    ]);
    return { assistantSettings, providerState, modelCatalog, modelSettings };
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
    "Вставьте только полный ключ AITUNNEL без кавычек, пояснений и лишних символов.",
  RECENT_AUTHENTICATION_REQUIRED:
    "Для работы с ключом выйдите из панели, войдите заново и повторите операцию в течение 30 минут.",
  CREDENTIAL_ENCRYPTION_KEY_REQUIRED:
    "На сервере не настроен безопасный master key для шифрования provider credential.",
  CREDENTIAL_ENCRYPTION_KEY_INVALID:
    "Master key сервера имеет неверный формат. Требуется base64 от 32 случайных байт; это не ключ AITUNNEL.",
  CREDENTIAL_KEY_VERSION_UNAVAILABLE:
    "На сервере отсутствует master key нужной версии. Проверьте конфигурацию ротации ключей.",
  PROVIDER_CREDENTIAL_INVALID: "AITUNNEL отклонил ключ. Проверьте его статус и ограничения.",
  PROVIDER_BUDGET_EXCEEDED: "Бюджет ключа AITUNNEL исчерпан.",
  PROVIDER_RATE_LIMITED: "AITUNNEL временно ограничил частоту запросов. Повторите позже.",
  PROVIDER_TIMEOUT: "AITUNNEL не ответил за отведённое время. Повторите позже.",
  PROVIDER_UNAVAILABLE: "AITUNNEL временно недоступен. Повторите позже.",
  PROVIDER_BAD_RESPONSE: "AITUNNEL вернул ответ неизвестного формата.",
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

const formatDate = (value: string | null | undefined): string =>
  value
    ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
      )
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
    setError(requestError, "Ключ не прошёл проверку");
  } finally {
    apiKey.value = "";
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
  message.value = null;
  try {
    await $fetch(`/api/v1/projects/${projectId.value}/provider/credential`, {
      method: "DELETE",
      headers: getCsrfHeaders(),
    });
    if (data.value) data.value.providerState = { provider: "aitunnel", credential: null };
    message.value = { type: "success", text: "Ключ удалён. Новые запросы к провайдеру отключены." };
  } catch (requestError) {
    setError(requestError, "Не удалось удалить ключ");
  } finally {
    deleteConfirmationVisible.value = false;
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
      text: `Каталог обновлён: chat ${result.counts.chat}, embeddings ${result.counts.embeddings}, rerank ${result.counts.rerank}`,
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
    if (data.value) data.value.modelSettings = modelSettings;
    message.value = { type: "success", text: "Настройки моделей сохранены" };
  } catch (requestError) {
    setError(requestError, "Не удалось сохранить модели");
  } finally {
    isSavingModels.value = false;
  }
};
</script>

<template>
  <main class="page-frame page-frame--narrow page-frame--fill">
    <div v-if="error" class="empty-state" role="alert">
      Настройки провайдера недоступны. Раздел открыт только владельцу проекта.
    </div>

    <template v-else-if="data">
      <section class="panel" aria-labelledby="credential-title">
        <header class="section-header">
          <div>
            <h2 id="credential-title" class="section-title">Ключ провайдера</h2>
          </div>
          <span class="section-description"
            >AES-256-GCM · key version {{ credential?.keyVersion ?? "—" }}</span
          >
        </header>

        <div v-if="credential" class="credential-summary">
          <div>
            <span>Ключ</span>
            <strong>{{ credential.maskedHint }}</strong>
          </div>
          <div>
            <span>Последняя проверка</span>
            <strong>{{ formatDate(credential.lastVerifiedAt) }}</strong>
          </div>
          <div>
            <span>Имя в AITUNNEL</span>
            <strong>{{ credential.verification?.keyName ?? "—" }}</strong>
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
            <strong>{{ formatDate(credential.verification?.expiresAt) }}</strong>
          </div>
          <div>
            <span>Защита PII</span>
            <strong>{{ credential.verification?.piiMode ?? "выключена/не задана" }}</strong>
          </div>
        </div>

        <form class="form-stack provider-key-form" @submit.prevent="saveKey">
          <label class="form-field">
            <span class="form-field__label">
              {{ credential ? "Новый ключ для замены" : "Новый AITUNNEL-ключ" }}
            </span>
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
              placeholder="sk-aitunnel-…"
              spellcheck="false"
              autocapitalize="off"
              required
            />
            <span class="form-field__hint">
              Значение проверяется server-side и никогда не возвращается в браузер после запроса.
            </span>
          </label>
          <div class="form-actions form-actions--split">
            <div class="button-group">
              <button class="button button--primary" type="submit" :disabled="isSavingKey">
                {{
                  isSavingKey
                    ? "Проверяем…"
                    : credential
                      ? "Проверить и заменить"
                      : "Проверить и сохранить"
                }}
              </button>
              <button
                v-if="credential"
                class="button"
                type="button"
                :disabled="isTestingKey"
                @click="testKey"
              >
                {{ isTestingKey ? "Проверяем…" : "Проверить сохранённый" }}
              </button>
            </div>
            <button
              v-if="credential && !deleteConfirmationVisible"
              class="button button--text button--danger"
              type="button"
              @click="deleteConfirmationVisible = true"
            >
              Удалить ключ
            </button>
          </div>

          <div v-if="deleteConfirmationVisible" class="danger-confirmation">
            <p>После удаления чат и индексация не смогут обращаться к AITUNNEL.</p>
            <div class="button-group">
              <button class="button button--danger" type="button" @click="deleteKey">
                Удалить окончательно
              </button>
              <button class="button" type="button" @click="deleteConfirmationVisible = false">
                Отмена
              </button>
            </div>
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
          <span>Синхронизация: {{ formatDate(data.modelCatalog.lastSyncedAt) }}</span>
          <span>
            Chat {{ chatModels.length }} · embeddings {{ embeddingModels.length }} · rerank
            {{ rerankModels.length }}
          </span>
        </div>

        <form class="form-stack" @submit.prevent="saveModels">
          <div class="form-field">
            <span class="form-field__label">Chat model</span>
            <BaseSelect
              v-model="modelForm.chatModelId"
              :options="chatModelOptions"
              label="Chat model"
            />
            <span class="form-field__hint"
              >`auto` допустим, но фактическая модель и стоимость могут меняться.</span
            >
          </div>

          <div class="form-field">
            <span class="form-field__label">Embedding model</span>
            <BaseSelect
              v-model="modelForm.embeddingModelId"
              :options="embeddingModelOptions"
              label="Embedding model"
            />
            <span class="form-field__hint"
              >Модель фиксируется: смена потребует полной переиндексации знаний.</span
            >
          </div>

          <div class="form-field">
            <span class="form-field__label">Rerank model — опционально</span>
            <BaseSelect
              v-model="modelForm.rerankModelId"
              :options="rerankModelOptions"
              label="Rerank model"
            />
          </div>

          <div class="form-grid">
            <label class="form-field">
              <span class="form-field__label">Максимум токенов ответа</span>
              <input
                v-model.number="modelForm.maxOutputTokens"
                class="form-field__control"
                type="number"
                min="1"
                max="64000"
                required
              />
            </label>
            <label class="form-field">
              <span class="form-field__label">Temperature — опционально</span>
              <input
                v-model.number="modelForm.temperature"
                class="form-field__control"
                type="number"
                min="0"
                max="2"
                step="0.1"
                placeholder="Дефолт модели"
              />
            </label>
          </div>

          <div class="form-actions">
            <button class="button button--primary" type="submit" :disabled="isSavingModels">
              {{ isSavingModels ? "Сохраняем…" : "Сохранить модели" }}
            </button>
          </div>
        </form>
      </section>

      <section class="panel panel--push-end" aria-labelledby="assistant-identity-title">
        <header class="section-header">
          <div>
            <h2 id="assistant-identity-title" class="section-title">Публичный идентификатор</h2>
          </div>
        </header>
        <div class="readonly-summary">
          <div>
            <span>Assistant ID</span>
            <code>{{ data.assistantSettings.assistant.publicId }}</code>
          </div>
          <div>
            <span>Черновик</span>
            <strong>revision {{ data.assistantSettings.draft.revisionNo }}</strong>
          </div>
          <div>
            <span>Production</span>
            <strong>
              {{
                data.assistantSettings.activeConfig
                  ? `revision ${data.assistantSettings.activeConfig.revisionNo}`
                  : "не опубликован"
              }}
            </strong>
          </div>
        </div>
      </section>
    </template>
  </main>
</template>
