import { defineCustomElement } from "vue";

import AiAssist from "./AiAssist.ce.vue";

export const elementName = "ai-assist";

export const registerAiAssist = (): void => {
  if (!customElements.get(elementName)) {
    customElements.define(elementName, defineCustomElement(AiAssist));
  }
};

registerAiAssist();
