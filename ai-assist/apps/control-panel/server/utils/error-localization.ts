const fallbackMessages: Record<number, string> = {
  400: "Некорректный запрос",
  401: "Требуется авторизация",
  402: "Недостаточно средств у провайдера",
  403: "Недостаточно прав для выполнения операции",
  404: "Запрошенные данные не найдены",
  405: "Метод запроса не поддерживается",
  409: "Не удалось выполнить операцию из-за конфликта данных",
  413: "Размер запроса превышает допустимый",
  415: "Формат данных не поддерживается",
  422: "Переданы некорректные данные",
  429: "Слишком много запросов. Повторите позже",
  499: "Запрос отменён",
  500: "Не удалось выполнить запрос из-за ошибки сервера",
  502: "Не удалось получить ответ от внешнего сервиса",
  503: "Сервис временно недоступен",
  504: "Время ожидания ответа истекло",
};

const hasRussianText = (value: string | undefined): value is string =>
  Boolean(value && /[А-Яа-яЁё]/u.test(value));

export const getRussianServerErrorMessage = (input: {
  statusCode: number;
  statusMessage?: string;
  message?: string;
}): string => {
  if (hasRussianText(input.statusMessage)) return input.statusMessage;
  if (hasRussianText(input.message)) return input.message;
  return fallbackMessages[input.statusCode] ?? fallbackMessages[500] ?? "Ошибка сервера";
};
