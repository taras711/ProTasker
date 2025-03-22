const vscode = require('vscode');
const path = require('path');
const fs = require('fs');


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
        try {
            const fileContent = await fs.readFileSync(translationsPath, 'utf8');
            this.translations = JSON.parse(fileContent);
        } catch (error) {
            console.error('Error loading translations:', error);
        }
    }

    /**
     * Translates a given key to the current locale.
     * @param {string} key The key to translate. It can be a nested key (e.g. "settings.language")
     * @returns {string} The translation if found, otherwise the original key
     */
    translite(key) {
        return key.split(".").reduce((o, i) => o?.[i], this.translations) || key; // Return the translation if found, otherwise return the original key
    }
}

module.exports = { I18nManager };