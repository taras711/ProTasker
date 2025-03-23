const vscode = require("vscode");
const timeago = require("timeago.js");
const locales = require("timeago.js/lib/lang"); // Timeago.js locales

/**
 * Sets the locale for timeago.js
 */
function setTimeagoLocale() {
    const settings = vscode.workspace.getConfiguration("protasker");
    let currentLocale = settings.get("language") || "en_US";

    currentLocale == "en" ? (currentLocale = "en_US") : null;

    if (locales[currentLocale]) {
        timeago.register(currentLocale, locales[currentLocale]);
    } else {
        timeago.register("en", locales["en_US"]);
    }
}

/**
 * Formats a date using timeago.js
 * @param {Date} date Date
 * @returns {string} Formatted date
 */
function formatTimeAgo(date) {
    const settings = vscode.workspace.getConfiguration("protasker");
    const currentLocale = settings.get("language") || "en";

    return timeago.format(date, currentLocale);
}


module.exports = {
    setTimeagoLocale,
    formatTimeAgo
};
