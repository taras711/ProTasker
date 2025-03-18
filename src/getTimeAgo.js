const vscode = require("vscode");
const timeago = require("timeago.js");
const locales = require("timeago.js/lib/lang"); // Импорт всех локалей

/**
 * Устанавливает локаль для timeago.js
 */
function setTimeagoLocale() {
    const settings = vscode.workspace.getConfiguration("protasker");
    let currentLocale = settings.get("language") || "en_US";

    currentLocale == "en" ? (currentLocale = "en_US") : null;

    console.log("Current locale:", locales);

    if (locales[currentLocale]) {
        timeago.register(currentLocale, locales[currentLocale]);
    } else {
        timeago.register("en", locales["en_US"]);
    }
}

/**
 * Форматирует дату в стиль "time ago"
 * @param {Date} date Дата
 * @returns {string} Отформатированное время
 */
function formatTimeAgo(date) {
    const settings = vscode.workspace.getConfiguration("protasker");
    const currentLocale = settings.get("language") || "en";

    return timeago.format(date, currentLocale);
}

// Вызываем настройку локали
setTimeagoLocale();

// Пример использования
console.log(formatTimeAgo(new Date()));

module.exports = {
    setTimeagoLocale,
    formatTimeAgo
};
