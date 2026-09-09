<script setup lang="ts">
type ReadinessState = {
  status: "idle" | "checking" | "ok" | "degraded";
  checks?: Record<string, "ok" | "error">;
};

const session = useAdminSessionState();
const project = computed(() => session.value?.projects[0]);
const readiness = ref<ReadinessState>({ status: "idle" });

const checkReadiness = async (): Promise<void> => {
  readiness.value = { status: "checking" };

  try {
    const result = await $fetch<{ status: "ok" | "degraded"; checks?: ReadinessState["checks"] }>(
      "/api/health/ready",
    );
    readiness.value = { status: result.status, checks: result.checks };
  } catch (error) {
    const response = error as { data?: { checks?: ReadinessState["checks"] } };
    readiness.value = { status: "degraded", checks: response.data?.checks };
  }
};
</script>

<template>
  <main class="page-frame">
    <header class="page-header">
      <div>
        <p class="eyebrow">Первый агент</p>
        <h1 class="page-title">{{ project?.name ?? "AI Assist" }}</h1>
        <p class="page-description">Рабочее пространство ассистента для gofroprodpak.ru</p>
      </div>
      <span class="status-badge" data-status="active">Активен</span>
    </header>

    <section class="metric-grid" aria-label="Краткий статус">
      <article class="metric-card">
        <span class="metric-card__label">Роль</span>
        <strong class="metric-card__value">{{ project?.role ?? "—" }}</strong>
        <span class="metric-card__hint">Права в текущем проекте</span>
      </article>
      <article class="metric-card">
        <span class="metric-card__label">Стратегия знаний</span>
        <strong class="metric-card__value">Гибридная</strong>
        <span class="metric-card__hint">Индекс + точечные live-проверки</span>
      </article>
      <article class="metric-card">
        <span class="metric-card__label">Контур</span>
        <strong class="metric-card__value">Локальный</strong>
        <span class="metric-card__hint">Этап 4 · Prompts и публикация</span>
      </article>
    </section>

    <section class="panel" aria-labelledby="quick-actions-title">
      <header class="section-header">
        <div>
          <p class="eyebrow">Управление</p>
          <h2 id="quick-actions-title" class="section-title">Быстрые действия</h2>
        </div>
        <p class="section-description">Базовые административные функции первого проекта.</p>
      </header>

      <div v-if="project" class="action-grid">
        <NuxtLink class="action-card" :to="`/projects/${project.id}/settings`">
          <span class="action-card__icon" aria-hidden="true">
            <UiIcon class="ui-icon--large" name="settings" />
          </span>
          <strong>Настройки проекта</strong>
          <span>Название, локаль, часовой пояс и срок хранения диалогов.</span>
        </NuxtLink>
        <NuxtLink class="action-card" :to="`/projects/${project.id}/audit`">
          <span class="action-card__icon" aria-hidden="true">
            <UiIcon class="ui-icon--large" name="audit" />
          </span>
          <strong>Журнал аудита</strong>
          <span>Проверить входы и изменения критичных настроек.</span>
        </NuxtLink>
        <NuxtLink class="action-card" :to="`/projects/${project.id}/prompts`">
          <span class="action-card__icon" aria-hidden="true">
            <UiIcon class="ui-icon--large" name="prompt" />
          </span>
          <strong>Prompts</strong>
          <span>Создать инструкцию, проверить версии и опубликовать production-конфигурацию.</span>
        </NuxtLink>
        <NuxtLink
          v-if="project.role === 'owner'"
          class="action-card"
          :to="`/projects/${project.id}/provider`"
        >
          <span class="action-card__icon" aria-hidden="true">
            <UiIcon class="ui-icon--large" name="provider" />
          </span>
          <strong>AITUNNEL и модели</strong>
          <span>Безопасно подключить ключ и выбрать chat/embedding модели.</span>
        </NuxtLink>
      </div>
    </section>

    <section class="panel" aria-labelledby="health-title">
      <header class="section-header">
        <div>
          <p class="eyebrow">Диагностика</p>
          <h2 id="health-title" class="section-title">Состояние сервисов</h2>
        </div>
        <button
          class="button"
          type="button"
          :disabled="readiness.status === 'checking'"
          @click="checkReadiness"
        >
          {{ readiness.status === "checking" ? "Проверяем…" : "Проверить" }}
        </button>
      </header>

      <div class="health-line">
        <span class="health-dot" :data-state="readiness.status" aria-hidden="true" />
        <strong>{{
          readiness.status === "idle" ? "Проверка ещё не запускалась" : readiness.status
        }}</strong>
      </div>
      <ul v-if="readiness.checks" class="check-list" aria-label="Проверки инфраструктуры">
        <li v-for="(status, name) in readiness.checks" :key="name" class="check-list__item">
          <span>{{ name }}</span>
          <span>{{ status }}</span>
        </li>
      </ul>
    </section>
  </main>
</template>
