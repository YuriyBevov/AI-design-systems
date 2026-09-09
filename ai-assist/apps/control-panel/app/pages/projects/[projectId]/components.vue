<script setup lang="ts">
const iconSamples = [
  { name: "home", label: "Обзор" },
  { name: "settings", label: "Настройки" },
  { name: "assistant", label: "Ассистент" },
  { name: "prompt", label: "Prompts" },
  { name: "knowledge", label: "База знаний" },
  { name: "components", label: "Компоненты" },
  { name: "projects", label: "Проекты" },
  { name: "provider", label: "Провайдер" },
  { name: "audit", label: "Аудит" },
  { name: "arrow-left", label: "Назад" },
  { name: "plus", label: "Добавить" },
  { name: "close", label: "Закрыть" },
  { name: "help", label: "Подсказка" },
  { name: "chevron-down", label: "Раскрыть" },
  { name: "check", label: "Выбрано" },
] as const;
const selectValue = ref("balanced");
const selectOptions = [
  { value: "fast", label: "Быстрый" },
  { value: "balanced", label: "Сбалансированный" },
  { value: "accurate", label: "Точный" },
] as const;
</script>

<template>
  <main class="page-frame">
    <header class="page-header">
      <div>
        <p class="eyebrow">Дизайн-система</p>
        <h1 class="page-title page-title--compact">Компоненты</h1>
        <p class="page-description">
          Общий каталог компонентов интерфейса AI Assist для визуальной проверки и повторного
          использования.
        </p>
      </div>
    </header>

    <section class="panel" aria-labelledby="button-components-title">
      <header class="section-header">
        <div>
          <p class="eyebrow">Действия</p>
          <h2 id="button-components-title" class="section-title">Обычные кнопки</h2>
        </div>
        <p class="section-description">
          Один базовый класс <code>button</code>. Размер и визуальный вариант задаются только
          абстрактными модификаторами.
        </p>
      </header>

      <div class="component-preview" aria-label="Варианты обычной кнопки">
        <button class="button" type="button">Базовая</button>
        <button class="button button--primary" type="button">Основная</button>
        <button class="button button--danger" type="button">Опасное действие</button>
        <button class="button button--ghost" type="button">Без фона</button>
        <button class="button button--text" type="button">Текстовая</button>
        <button class="button button--compact" type="button">Компактная</button>
        <button class="button" type="button" disabled>Недоступная</button>
      </div>
    </section>

    <section class="panel" aria-labelledby="icon-button-components-title">
      <header class="section-header">
        <div>
          <p class="eyebrow">Действия</p>
          <h2 id="icon-button-components-title" class="section-title">Кнопки с иконкой</h2>
        </div>
        <p class="section-description">
          Кнопка только с иконкой использует <code>icon-button</code>, SVG и обязательный
          <code>aria-label</code>.
        </p>
      </header>

      <div class="component-preview" aria-label="Варианты кнопки с иконкой">
        <button class="icon-button" type="button" aria-label="Добавить">
          <UiIcon name="plus" />
        </button>
        <button
          class="icon-button icon-button--compact icon-button--ghost"
          type="button"
          aria-label="Закрыть"
        >
          <UiIcon name="close" />
        </button>
        <button
          class="icon-button icon-button--compact icon-button--danger"
          type="button"
          aria-label="Закрыть с предупреждением"
        >
          <UiIcon name="close" />
        </button>
        <button class="icon-button" type="button" aria-label="Добавить" disabled>
          <UiIcon name="plus" />
        </button>
      </div>
    </section>

    <section class="panel" aria-labelledby="select-components-title">
      <header class="section-header">
        <div>
          <p class="eyebrow">Поля формы</p>
          <h2 id="select-components-title" class="section-title">Выпадающие списки</h2>
        </div>
        <p class="section-description">
          Все одиночные списки используют один доступный компонент <code>BaseSelect</code>. Нативный
          <code>select</code> в интерфейсе не используется.
        </p>
      </header>

      <div class="component-preview" aria-label="Варианты выпадающего списка">
        <div class="form-field component-preview__control">
          <span class="form-field__label">Режим ответа</span>
          <BaseSelect v-model="selectValue" :options="selectOptions" label="Режим ответа" />
        </div>
        <div class="form-field component-preview__control">
          <span class="form-field__label">Недоступный список</span>
          <BaseSelect
            v-model="selectValue"
            :options="selectOptions"
            label="Недоступный список"
            disabled
          />
        </div>
      </div>
    </section>

    <section class="panel" aria-labelledby="icon-components-title">
      <header class="section-header">
        <div>
          <p class="eyebrow">Графика</p>
          <h2 id="icon-components-title" class="section-title">SVG-иконки</h2>
        </div>
        <p class="section-description">
          Контролируемый локальный спрайт. Иконки наследуют цвет текста и не зависят от шрифта
          операционной системы.
        </p>
      </header>

      <ul class="icon-catalog" aria-label="Доступные SVG-иконки">
        <li v-for="icon in iconSamples" :key="icon.name" class="icon-sample">
          <span class="icon-sample__preview" aria-hidden="true">
            <UiIcon class="ui-icon--large" :name="icon.name" />
          </span>
          <span>{{ icon.label }}</span>
          <code>{{ icon.name }}</code>
        </li>
      </ul>
    </section>
  </main>
</template>
