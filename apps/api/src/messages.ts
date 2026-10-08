const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

export type Card = {
  services: string;
  barberName: string;
  clientName: string;
  when: string;
  price: string;
};

export function money(value: number) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function whenLabel(date: string, time: string) {
  const [, month, day] = date.split("-").map(Number);
  return `${day} ${months[(month ?? 1) - 1]}, ${time}`;
}

export function startKind(payload: string) {
  if (payload.startsWith("b_") && payload.length > 2) return { type: "book" as const, token: payload.slice(2) };
  if (payload.startsWith("m_") && payload.length > 2) return { type: "barber" as const, code: payload.slice(2) };
  return { type: "menu" as const };
}

export function confirmedText(card: Card) {
  return ["BRUT. Запись подтверждена", card.services, `Мастер: ${card.barberName}`, card.when, `${card.price} сум`].join("\n");
}

export function cancelledText(card: Card) {
  return ["BRUT. Запись отменена", card.services, `Мастер: ${card.barberName}`, card.when].join("\n");
}

export function movedText(card: Card, previous: string) {
  return ["BRUT. Запись перенесена", card.services, `Мастер: ${card.barberName}`, `Было: ${previous}`, `Стало: ${card.when}`, `${card.price} сум`].join("\n");
}

export function barberBookedText(card: Card) {
  return ["BRUT. Новая запись", `Клиент: ${card.clientName}`, card.services, card.when, `${card.price} сум`].join("\n");
}

export function barberCancelledText(card: Card) {
  return ["BRUT. Запись отменена", `Клиент: ${card.clientName}`, card.services, card.when].join("\n");
}

export function barberMovedText(card: Card, previous: string) {
  return ["BRUT. Запись перенесена", `Клиент: ${card.clientName}`, card.services, `Было: ${previous}`, `Стало: ${card.when}`].join("\n");
}

export function reminderDayText(card: Card) {
  return ["BRUT. Напоминание", card.when, card.services, `Мастер: ${card.barberName}`].join("\n");
}

export function reminderSoonText(card: Card) {
  return ["BRUT. Через 30 минут", card.when, card.services, `Мастер: ${card.barberName}`].join("\n");
}

export function reviewAskText(card: Card) {
  return ["BRUT. Как прошёл визит?", `${card.when}. ${card.services}. Мастер: ${card.barberName}.`, "Если хотите, ответьте числом от 1 до 5."].join("\n");
}
