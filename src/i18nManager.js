const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const timeago = require('timeago.js');
const cs = require('timeago.js/lib/lang/cs');
const uk = require('timeago.js/lib/lang/uk');

class I18nManager {
    // Properties
    translations = {}; // Translation data
    currentLocale = 'en'; // Default locale
    
    constructor() {
        this.loadTranslations(); // Load translations
    }

    /**
     * Loads the translations for the current locale
     * @returns {Promise<void>}
     * @public
     */
    async loadTranslations() {
        const settings = vscode.workspace.getConfiguration('protasker');
        
        this.currentLocale = settings.get('language');
        const translationsPath = path.join(__dirname, '..', "i18n", `${this.currentLocale}.json`);
        console.error('Error loading translations:', this.currentLocale);
        try {
            const fileContent = await fs.readFileSync(translationsPath, 'utf8');
            this.translations = JSON.parse(fileContent);
        } catch (error) {
            console.error('Error loading translations:', error);
        }

        this.setTimeagoLocale();
    }

    /**
     * Translates a given key to the current locale.
     * @param {string} key The key to translate. It can be a nested key (e.g. "settings.language")
     * @returns {string} The translation if found, otherwise the original key
     */
    translite(key) {
        return key.split(".").reduce((o, i) => o?.[i], this.translations) || key; // Return the translation if found, otherwise return the original key
    }

    /**
     * Sets the locale for the timeago.js library to the current locale of the extension.
     * This is required for the timeago.js library to work correctly with the chosen locale.
     * The locales are defined in the locales object, which is a map of locale codes to functions that return the timeago data.
     * The locale code is used to determine which function to call to get the timeago data.
     * If the locale code is not found in the locales object, the default (en) locale is used.
     * @private
     */
    setTimeagoLocale() {
        const locales = {
            uk: (number, index, totalSec) => uk[number] || uk[index] || ["", ""],
            ru: (number, index, totalSec) => cs[number] || cs[index] || ["", ""],
        };

        timeago.register(this.currentLocale, locales[this.currentLocale] || locales.en);
    }

    formatTimeAgo(date){
        return timeago.format(date, this.currentLocale);
    }
}

module.exports = { I18nManager };