import { russianTimezoneOptions } from "./project-options";

export type ProjectFormErrors = {
  name: string;
  timezone: string;
};

export const validateProjectRequiredFields = (input: {
  name: string;
  timezone: string;
}): ProjectFormErrors => ({
  name: input.name.trim() ? "" : "Укажите название проекта.",
  timezone: russianTimezoneOptions.some((option) => option.value === input.timezone)
    ? ""
    : "Выберите часовой пояс.",
});
