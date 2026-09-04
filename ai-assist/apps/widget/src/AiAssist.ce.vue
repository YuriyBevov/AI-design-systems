<script setup lang="ts">
import type {
  WidgetMessageResponse,
  WidgetPublicConfig,
  WidgetSseCitation,
} from "@ai-assist/contracts";
import { computed, nextTick, onBeforeUnmount, reactive, ref, useId } from "vue";

import {
  createConversation,
  createSession,
  getSession,
  resolveWidgetApiBase,
  streamChat,
  WidgetApiError,
  widgetSessionStorageKey,
} from "./api";

type UiMessage = WidgetMessageResponse & { citations: WidgetSseCitation[] };

const props = defineProps<{ assistantId?: string }>();
const apiBase = resolveWidgetApiBase(import.meta.url);
const instanceId = useId().replace(/[^A-Za-z0-9_-]/gu, "");
const dialogId = `ai-assist-dialog-${instanceId}`;
const messageInputId = `ai-assist-message-${instanceId}`;
const statusId = `ai-assist-status-${instanceId}`;

const isOpen = ref(false);
const isLoading = ref(false);
const isSending = ref(false);
const errorMessage = ref<string | null>(null);
const sessionToken = ref<string | null>(null);
const expiresAt = ref<string | null>(null);
const config = ref<WidgetPublicConfig | null>(null);
const conversationId = ref<string | null>(null);
const messages = ref<UiMessage[]>([]);
const draft = ref("");
const launcher = ref<HTMLButtonElement>();
const closeButton = ref<HTMLButtonElement>();
const messageInput = ref<HTMLInputElement>();
const messageList = ref<HTMLOListElement>();
let initialization: Promise<void> | null = null;
let activeRequest: AbortController | null = null;

const widgetStyle = computed<Record<string, string>>(() => ({
  "--ai-assist-accent": config.value?.accentColor ?? "#275F3B",
}));
const isLeft = computed(() => config.value?.launcherPosition === "left");
const isAvailable = computed(() => config.value?.enabled !== false);
const assistantName = computed(() => config.value?.name ?? "Помощник магазина");
const statusText = computed(() => {
  if (isLoading.value) return "Подключаемся…";
  if (isSending.value) return "Печатает…";
  if (!isAvailable.value) return "Временно недоступен";
  return "Готов помочь с выбором упаковки";
});

const storageKey = (): string | null =>
  props.assistantId ? widgetSessionStorageKey(apiBase, props.assistantId) : null;

const readStoredToken = (): string | null => {
  const key = storageKey();
  if (!key) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const storeToken = (token: string | null): void => {
  const key = storageKey();
  if (!key) return;
  try {
    if (token) window.localStorage.setItem(key, token);
    else window.localStorage.removeItem(key);
  } catch {
    // A restricted browser storage policy must not prevent the current chat session.
  }
};

const setConversation = (
  conversation: { id: string; messages: WidgetMessageResponse[] } | null,
): void => {
  conversationId.value = conversation?.id ?? null;
  messages.value = (conversation?.messages ?? []).map((message) => ({
    ...message,
    citations: [],
  }));
};

const applySession = (session: {
  expiresAt: string;
  config: WidgetPublicConfig;
  conversation: { id: string; messages: WidgetMessageResponse[] } | null;
}): void => {
  expiresAt.value = session.expiresAt;
  config.value = session.config;
  setConversation(session.conversation);
};

const initialize = async (): Promise<void> => {
  if (initialization) return initialization;
  initialization = (async () => {
    if (!props.assistantId) throw new Error("Для виджета не указан assistant-id");
    isLoading.value = true;
    errorMessage.value = null;
    const storedToken = readStoredToken();
    if (storedToken) {
      try {
        const session = await getSession(apiBase, storedToken);
        sessionToken.value = storedToken;
        applySession(session);
        return;
      } catch (error) {
        if (!(error instanceof WidgetApiError) || error.statusCode !== 401) throw error;
        storeToken(null);
      }
    }
    const session = await createSession(apiBase, props.assistantId, navigator.language || "ru-RU");
    sessionToken.value = session.sessionToken;
    storeToken(session.sessionToken);
    applySession(session);
  })()
    .catch((error: unknown) => {
      initialization = null;
      errorMessage.value =
        error instanceof WidgetApiError && error.statusCode === 404
          ? "Ассистент пока недоступен на этом сайте."
          : "Не удалось подключить ассистента. Обновите страницу или попробуйте позже.";
      throw error;
    })
    .finally(() => {
      isLoading.value = false;
    });
  return initialization;
};

const scrollToLatest = async (): Promise<void> => {
  await nextTick();
  messageList.value?.scrollTo({ top: messageList.value.scrollHeight, behavior: "smooth" });
};

const open = async (): Promise<void> => {
  isOpen.value = true;
  await nextTick();
  closeButton.value?.focus();
  await initialize().catch(() => undefined);
  await scrollToLatest();
};

const close = (): void => {
  isOpen.value = false;
  nextTick(() => launcher.value?.focus());
};

const startNewConversation = async (): Promise<void> => {
  if (!sessionToken.value || isSending.value) return;
  isLoading.value = true;
  errorMessage.value = null;
  try {
    setConversation(await createConversation(apiBase, sessionToken.value));
    await nextTick();
    messageInput.value?.focus();
  } catch {
    errorMessage.value = "Не удалось начать новый диалог. Попробуйте ещё раз.";
  } finally {
    isLoading.value = false;
  }
};

const temporaryId = (): string => crypto.randomUUID();

const submit = async (): Promise<void> => {
  const content = draft.value.trim();
  if (!content || isSending.value || !isAvailable.value) return;
  if (!sessionToken.value) {
    await initialize().catch(() => undefined);
    if (!sessionToken.value) return;
  }
  draft.value = "";
  errorMessage.value = null;
  isSending.value = true;
  const createdAt = new Date().toISOString();
  const userMessage = reactive<UiMessage>({
    id: temporaryId(),
    role: "user",
    content,
    status: "completed",
    createdAt,
    citations: [],
  });
  const assistantMessage = reactive<UiMessage>({
    id: temporaryId(),
    role: "assistant",
    content: "",
    status: "pending",
    createdAt,
    citations: [],
  });
  messages.value.push(userMessage, assistantMessage);
  await scrollToLatest();
  activeRequest = new AbortController();
  let streamFailed = false;
  try {
    await streamChat({
      apiBase,
      sessionToken: sessionToken.value,
      conversationId: conversationId.value,
      message: content,
      signal: activeRequest.signal,
      onEvent: (event) => {
        if (event.type === "meta") {
          conversationId.value = event.data.conversationId;
          userMessage.id = event.data.userMessageId;
          assistantMessage.id = event.data.assistantMessageId;
        }
        if (event.type === "delta") {
          assistantMessage.content += event.data.text;
          void scrollToLatest();
        }
        if (event.type === "citation") assistantMessage.citations.push(event.data);
        if (event.type === "error") {
          streamFailed = true;
          assistantMessage.status = "failed";
          assistantMessage.content ||= event.data.message;
        }
        if (event.type === "done") assistantMessage.status = "completed";
      },
    });
    if (!streamFailed && assistantMessage.status === "pending") {
      assistantMessage.status = "failed";
      assistantMessage.content ||= "Ответ прервался. Попробуйте отправить сообщение ещё раз.";
    }
  } catch (error) {
    if (activeRequest.signal.aborted) return;
    assistantMessage.status = "failed";
    assistantMessage.content =
      error instanceof WidgetApiError && error.statusCode === 409
        ? "Предыдущий ответ ещё формируется. Подождите немного и повторите отправку."
        : "Не удалось получить ответ. Попробуйте ещё раз.";
  } finally {
    activeRequest = null;
    isSending.value = false;
    await scrollToLatest();
  }
};

const safeCitationUrl = (value: string | null): string | undefined => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
};

const onKeydown = (event: KeyboardEvent): void => {
  if (event.key === "Escape" && isOpen.value) close();
};

window.addEventListener("keydown", onKeydown);
onBeforeUnmount(() => {
  activeRequest?.abort();
  window.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <section
    class="chat-widget"
    :class="{ 'chat-widget--left': isLeft }"
    :style="widgetStyle"
    :data-assistant-id="assistantId || undefined"
  >
    <section
      v-if="isOpen"
      :id="dialogId"
      class="chat-widget__panel"
      role="dialog"
      :aria-label="`ИИ-ассистент ${assistantName}`"
    >
      <header class="chat-widget__header">
        <div>
          <p class="chat-widget__title">{{ assistantName }}</p>
          <p class="chat-widget__status">{{ statusText }}</p>
        </div>
        <div class="chat-widget__header-actions">
          <button
            v-if="sessionToken"
            class="text-button"
            type="button"
            :disabled="isLoading || isSending"
            aria-label="Начать новый диалог"
            title="Начать новый диалог"
            @click="startNewConversation"
          >
            Новый чат
          </button>
          <button
            ref="closeButton"
            class="icon-button"
            type="button"
            aria-label="Закрыть ассистента"
            @click="close"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </header>

      <ol ref="messageList" class="message-list" aria-label="Сообщения" aria-live="polite">
        <li v-if="!messages.length" class="message-list__item">
          <article class="chat-message chat-message--assistant">
            <span class="visually-hidden">Ассистент:</span>
            {{ config?.greeting || "Расскажите, какая упаковка вам нужна." }}
          </article>
        </li>
        <li v-for="message in messages" :key="message.id" class="message-list__item">
          <article
            class="chat-message"
            :class="`chat-message--${message.role}`"
            :aria-busy="message.status === 'pending'"
          >
            <span class="visually-hidden">
              {{ message.role === "assistant" ? "Ассистент:" : "Вы:" }}
            </span>
            <span v-if="message.content" class="chat-message__text">{{ message.content }}</span>
            <span v-else class="typing-indicator" aria-label="Ассистент печатает">
              <span aria-hidden="true">•••</span>
            </span>
            <ul v-if="message.citations.length" class="source-list" aria-label="Источники">
              <li v-for="citation in message.citations" :key="citation.id">
                <a
                  v-if="safeCitationUrl(citation.url)"
                  class="source-list__link"
                  :href="safeCitationUrl(citation.url)"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {{ citation.title }}
                </a>
                <span v-else>{{ citation.title }}</span>
              </li>
            </ul>
          </article>
        </li>
      </ol>

      <form class="chat-composer" @submit.prevent="submit">
        <label class="visually-hidden" :for="messageInputId">Сообщение</label>
        <input
          :id="messageInputId"
          ref="messageInput"
          v-model="draft"
          class="chat-composer__control"
          type="text"
          name="message"
          :placeholder="config?.placeholder || 'Напишите вопрос'"
          autocomplete="off"
          maxlength="4000"
          :disabled="isLoading || isSending || !isAvailable || Boolean(errorMessage && !config)"
          :aria-describedby="statusId"
        />
        <button
          class="chat-composer__submit"
          type="submit"
          :disabled="!draft.trim() || isLoading || isSending || !isAvailable"
        >
          Отправить
        </button>
      </form>
      <p :id="statusId" class="chat-widget__note" role="status">
        {{
          errorMessage ||
          (!isAvailable
            ? config?.maintenanceMessage || "Ассистент временно недоступен."
            : "История разговора сохранится на этом устройстве.")
        }}
      </p>
    </section>

    <button
      ref="launcher"
      class="chat-widget__launcher"
      type="button"
      :aria-expanded="isOpen"
      :aria-controls="dialogId"
      @click="isOpen ? close() : open()"
    >
      {{ isOpen ? "Закрыть" : "Задать вопрос" }}
    </button>
  </section>
</template>

<style>
:host {
  --ai-assist-accent: #275f3b;
  --ai-assist-accent-contrast: #ffffff;
  --ai-assist-surface: #ffffff;
  --ai-assist-text: #162019;
  --ai-assist-muted: #667069;
  position: fixed;
  z-index: 2147483000;
  right: 20px;
  bottom: 20px;
  color: var(--ai-assist-text);
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  font-size: 16px;
  line-height: 1.5;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

button,
input {
  font: inherit;
}

.chat-widget {
  display: grid;
  justify-items: end;
  gap: 12px;
}

.chat-widget--left {
  position: fixed;
  left: 20px;
  bottom: 20px;
  justify-items: start;
}

.chat-widget__panel {
  display: grid;
  width: min(380px, calc(100vw - 24px));
  height: min(560px, calc(100dvh - 96px));
  grid-template-rows: auto 1fr auto auto;
  overflow: hidden;
  border: 1px solid rgb(22 32 25 / 14%);
  border-radius: 18px;
  background: var(--ai-assist-surface);
  box-shadow: 0 24px 70px rgb(12 25 16 / 22%);
}

.chat-widget__header,
.chat-widget__header-actions {
  display: flex;
  align-items: center;
}

.chat-widget__header {
  justify-content: space-between;
  gap: 16px;
  padding: 18px;
  border-bottom: 1px solid rgb(22 32 25 / 10%);
}

.chat-widget__header-actions {
  gap: 8px;
}

.chat-widget__title,
.chat-widget__status,
.chat-widget__note {
  margin: 0;
}

.chat-widget__title {
  font-weight: 750;
}

.chat-widget__status,
.chat-widget__note {
  color: var(--ai-assist-muted);
  font-size: 14px;
}

.chat-widget__status {
  margin-top: 2px;
}

.icon-button,
.text-button,
.chat-widget__launcher,
.chat-composer__submit {
  border: 0;
  cursor: pointer;
}

.icon-button {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
  background: #edf1ee;
  color: var(--ai-assist-text);
  font-size: 24px;
  line-height: 1;
}

.text-button {
  padding: 6px 8px;
  background: transparent;
  color: var(--ai-assist-accent);
  font-size: 14px;
  font-weight: 700;
}

.message-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 20px;
  overflow-y: auto;
  list-style: none;
}

.message-list__item {
  display: flex;
}

.message-list__item:has(.chat-message--user) {
  justify-content: flex-end;
}

.chat-message {
  max-width: 88%;
  padding: 12px 14px;
  border-radius: 16px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.chat-message--assistant {
  background: #edf3ee;
}

.chat-message--user {
  background: var(--ai-assist-accent);
  color: var(--ai-assist-accent-contrast);
}

.chat-message__text {
  display: block;
}

.typing-indicator {
  display: inline-block;
  letter-spacing: 4px;
  animation: ai-assist-pulse 1.2s ease-in-out infinite;
}

.source-list {
  display: grid;
  gap: 4px;
  margin: 10px 0 0;
  padding-left: 18px;
  font-size: 14px;
}

.source-list__link {
  color: var(--ai-assist-accent);
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}

.chat-composer {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  padding: 12px 14px 6px;
  border-top: 1px solid rgb(22 32 25 / 10%);
}

.chat-composer__control,
.chat-composer__submit {
  min-height: 44px;
  border-radius: 12px;
}

.chat-composer__control {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid #c9d2cb;
  color: var(--ai-assist-text);
}

.chat-composer__submit,
.chat-widget__launcher {
  padding: 10px 16px;
  background: var(--ai-assist-accent);
  color: var(--ai-assist-accent-contrast);
  font-weight: 700;
}

.chat-widget__note {
  min-height: 28px;
  padding: 0 14px 10px;
}

.chat-widget__launcher {
  min-height: 48px;
  border-radius: 999px;
  box-shadow: 0 12px 34px rgb(12 25 16 / 20%);
}

.icon-button:focus-visible,
.text-button:focus-visible,
.chat-widget__launcher:focus-visible,
.chat-composer__control:focus-visible,
.chat-composer__submit:focus-visible {
  outline: 2px solid #8bb89a;
  outline-offset: 2px;
}

button:disabled,
input:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@keyframes ai-assist-pulse {
  50% {
    opacity: 0.4;
  }
}

@media (max-width: 480px) {
  :host {
    right: 8px;
    bottom: 8px;
  }

  .chat-widget--left {
    left: 8px;
    bottom: 8px;
  }

  .chat-widget__panel {
    width: calc(100vw - 16px);
    height: min(600px, calc(100dvh - 80px));
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation: none !important;
  }
}
</style>
