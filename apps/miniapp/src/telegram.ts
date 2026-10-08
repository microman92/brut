import WebApp from "@twa-dev/sdk";

WebApp.ready();
WebApp.expand();

document.documentElement.dataset.tgScheme = WebApp.colorScheme;
document.documentElement.dataset.tgBg = WebApp.themeParams.bg_color ?? "";

const user = WebApp.initDataUnsafe.user;
export const initData = WebApp.initData;
export const telegramName = [user?.first_name, user?.last_name].filter(Boolean).join(" ");
