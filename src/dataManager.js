const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const timeago = require('timeago.js');
const { NoteManager } = require("./manager");
/**
 * NotesExplorer Class
 * 
 * @class
 * @extends NoteManager
 * @classdesc This class is responsible for exploring and managing notes within the VS Code extension.
 * It inherits from the NoteManager class and provides additional functionality for handling notes.
 * @author taras711
 * @since 1.0.0
 * @version 1.0.0
 * @property {vscode.ExtensionContext} context - The extension context.
 * @property {vscode.EventEmitter} _onDidChangeTreeData - The event emitter for tree data changes.
 * @property {vscode.Event} onDidChangeTreeData - The event for tree data changes.
 * @property {Object} timeago - Library to convert timestamps to "time ago" format.
 * @property {string} viewId - Identifier for the view.
 * @property {string} dataNotes - Path to the notes data file.
 * @property {Object} notesData - The loaded notes data.
 * @property {Object|null} searchResults - Results from a search operation.
 * @property {boolean} search - Indicates if a search is active.
 * @property {Object|null} activeDecorationType - Active decoration type for editor.
 * 
 * @method loadNotes - Loads notes from the data file.
 * 
 * @see NoteManager
 * @see {@link https://code.visualstudio.com/api/references/vscode-api | VS Code API}
 */


class NotesExplorer extends NoteManager{

    constructor(context) {
        
        super();
        this.context = context; // Extension context
        this.activeDecorationType = null; // Active decoration type
        this._onDidChangeTreeData = new vscode.EventEmitter(); // Event emitter
        this.onDidChangeTreeData = this._onDidChangeTreeData.event; // Event
        this.timeago = timeago; // Library
        this.viewId = null; // View identifier
        this.dataNotes = path.join(__dirname, 'notesData.json'); // Data file
        this.notesData = this.loadNotes(); // Loaded notes
        this.notesData['lang'] = vscode.workspace.getConfiguration('protasker').get('language');
        this.searchResults = null; // Search results
        this.search = false; // Search active
    }

    /**
     * Loads notes from the data file.
     * 
     * @returns {Object} Notes data or an empty object if the data file does not exist.
     * @throws {Error} If there is an error reading the file or parsing the data.
     */
    loadNotes() {
        try {
            // Check if the data file exists
            if (fs.existsSync(this.dataNotes)) {
                const data = JSON.parse(fs.readFileSync(this.dataNotes).toString());
                return data;
            }
        } catch (error) {
            console.error("❌ Error loading notes:", error);
        }
        
        return { files: {}, directories: {}, lines: {} }; // Return an empty object
    }

    /**
     * Saves the notes data to the data file.
     * If the data cannot be written, an error is logged to the console.
     * After saving, the tree data is refreshed.
     */
    saveNotesToFile() {
        try {
            // Write the notes data to the file
            fs.writeFileSync(this.dataNotes, JSON.stringify(this.notesData, null, 2));
            this.refresh(); // Refresh the tree data
        } catch (error) {
            console.error("❌ Error saving notes:", error);
        }
    }

    /**
     * Creates a VS Code TreeItem from a NoteItem.
     * @param {object} element - The NoteItem to create a TreeItem from.
     * @returns {vscode.TreeItem} The created TreeItem.
     * @throws {Error} If the element is undefined.
     */
    getTreeItem(element) {
        
        // Check if the element is undefined
        if (!element) {
            return new vscode.TreeItem("Empty", vscode.TreeItemCollapsibleState.None);
        }
    
        const treeItem = new vscode.TreeItem(element.label, element.collapsibleState); // Create a TreeItem

        // Check if the element is a file
        if (element.contextValue === "checklistItem") {
            treeItem.command = {
                command: "protasker.toggleChecklistItem",
                title: this.lang.translite("user_strings.toggle_checklist"),
                arguments: [element] // Add the element as an argument
            };
        }

        // Check if the element is a file
        treeItem.contextValue = element.contextValue; // Set the context value
        treeItem.tooltip = element.tooltip || ""; // Set the tooltip
        treeItem.description = element.description || ""; // Set the description

        // Check if the element is a file
        if (element.contextValue === "resetSearch" && (this.searchResults !== null || this.filteredNotes !== null)) {
            // Add a command to reset the search
            treeItem.command = {
                command: "protasker.resetSearch",
                title: this.lang.translite("user_strings.reset_search")
            };
            treeItem.tooltip = `${this.lang.translite("user_strings.click_to")} ${this.lang.translite("user_strings.reset_search")}`; // Set the tooltip
            treeItem.contextValue = "resetSearch"; // Set the context value
        }
        
        // Check if the element has an icon
        element.context?.icon ? treeItem.iconPath = treeItem.iconPath = element.iconPath || new vscode.ThemeIcon(element.context.icon): "undefined";

        return treeItem; // Return the TreeItem
    }

    /**
     * Returns an array of note data for the given file paths from the notes data object.
     * If the data object is undefined, an empty object is returned.
     * @param {Object} data - The notes data object.
     * @returns {any} - An array of note data.
     */
    getData(data){
        if(!data) return {}; // Return an empty object
        const keys = Object.keys(data).map(filePath => {return data[filePath]}) // Return an array of note data

        return keys; // Return the array
    }

    /**
     * Returns the children of the given element.
     * @param {Object} element - The element to get the children from.
     * @returns {Promise<Array>} - A Promise that resolves to an array of NoteItem objects.
     */
    async getChildren(element) {
       return await this.mainData(element); // Return the children of the element
    }
    
    /**
     * Generates a label for a file based on the presence of notes or comments.
     * 
     * This function checks if the file at the given file path has any associated notes or comments.
     * If there are notes or comments, it prepends a '📝' emoji to the file's basename in the returned label.
     * Otherwise, it simply returns the basename of the file.
     * 
     * @param {string} filePath - The path to the file for which the label is being generated.
     * @returns {string} The label for the file, with an emoji if notes or comments are present.
     */
    getFileLabel(filePath) {
        const hasNotes = this.notesData.files[filePath]?.notes.length > 0; // Check if the file has any notes
        const hasComments = Object.keys(this.notesData.files[filePath]?.lines || {}).length > 0; // Check if the file has any comments
        return `${hasNotes || hasComments ? '📝 ' : ''}${path.basename(filePath)}`; // Return the label
    }

    /**
     * Generates a label for a directory based on the presence of notes.
     * 
     * This function checks if the directory at the given directory path has any associated notes.
     * If there are notes, it prepends a '📂📝' emoji to the directory's basename in the returned label.
     * Otherwise, it simply returns the basename of the directory.
     * 
     * @param {string} directoryPath - The path to the directory for which the label is being generated.
     * @returns {string} The label for the directory, with an emoji if notes are present.
     */
    getDirectoryLabel(directoryPath) {
        const hasNotes = this.notesData.directories[directoryPath]?.notes.length > 0;
        return `${hasNotes ? '📂📝 ' : '📂 '}${path.basename(directoryPath)}`;
    }


    /**
     * Extracts all data from an item (directory or file) into an array of objects.
     * Each object represents a single note, comment, checklist, or event and has the following properties:
     * - label: A string with a title for the category and the content of the note/comment/checklist/event.
     * - type: A string representing the type of the note/comment/checklist/event (e.g. "note", "comment", etc.).
     * - id: A unique identifier for the note/comment/checklist/event.
     * - content: The content of the note/comment/checklist/event.
     * - createdAt: The timestamp of when the note/comment/checklist/event was created.
     * - parent: The path to the parent directory or file of the note/comment/checklist/event.
     * @param {object} item - The item to extract data from.
     * @param {object} [parent] - The parent directory or file of the item.
     * @returns {Array} An array of objects, each representing a single note/comment/checklist/event.
     */
    extractItemData(item, parent = null) {
        const allCategories = ['notes', 'comments', 'checklists', 'events']; // All categories of data
        const extractedData = []; // Array to store extracted data

        // Extract data from each category
        allCategories.forEach(category => {
            if (item[category] && item[category].length > 0) {
                item[category].forEach(entry => {
                    extractedData.push({
                        label: `${category.slice(0, 1).toUpperCase()}${category.slice(1)}: ${entry.content}`, // Label
                        type: category.slice(0, -1), // Remove "s"
                        id: entry.id, // Unique identifier
                        content: entry.content, // Content
                        createdAt: entry.createdAt || new Date().toISOString(), // Timestamp
                        parent: parent ? parent.path : null, // Parent
                    });
                });
            }
        });

        return extractedData; // Return the extracted data
    }

    /**
     * Extracts all notes, comments, checklists, and events from a target object and returns them in an array.
     * Each object in the array will have the following properties: label, type, id, and parent.
     * The label property is a string with a title for the category and the content of the note/comment/checklist/event.
     * The type property is a string representing the type of the note/comment/checklist/event (e.g. "note", "comment", etc.).
     * The id property is a unique identifier for the note/comment/checklist/event.
     * The parent property is the path to the parent directory or file of the note/comment/checklist/event.
     * @param {object} target - The object to extract data from.
     * @param {string} parentPath - The path to the parent directory or file of the target object.
     * @returns {Array} An array of objects, each representing a single note/comment/checklist/event.
     */
    getEntries(target, parentPath) {
        if (!target) return []; // If target is null or undefined, return an empty array

        // Return an array of notes, comments, checklists, and events
        return [
            ...(target.notes || []).map(note => ({
                label: `📝 ${note.content}`,
                type: "note",
                id: note.id,
                parent: parentPath
            })),
            ...(target.comments || []).map(comment => ({
                label: `💬 ${comment.content}`,
                type: "comment",
                id: comment.id,
                parent: parentPath
            })),
            ...(target.checklists || []).map(checklist => ({
                label: `✅ ${checklist.content}`,
                type: "checklist",
                id: checklist.id,
                parent: parentPath
            })),
            ...(target.events || []).map(event => ({
                label: `📅 ${event.content}`,
                type: "event",
                id: event.id,
                parent: parentPath
            }))
        ];
    }

    /**
     * Searches for notes, comments, checklists, and events that match the given query.
     * @param {string} query - The query to search for.
     * @returns {void}
     * @example
     * searchNotes("hello")
     */
    searchNotes(query) {
        const results = []; // Array to store search results
        const settings = getProTaskerSettings(); // Get settings

        // Recursive search function
        const searchInItem = (item, parentPath, category) => {
            const queryLower = query.toLowerCase(); // Convert query to lowercase
            
            const searchInObject = (obj) => {
                for (const key in obj) {
                    if (typeof obj[key] === "string" && obj[key].toLowerCase().includes(queryLower)) {
                        results.push({ ...item, parentPath, category });
                        return; // Return early if a match is found
                    } else if (Array.isArray(obj[key])) {
                        // If the value is an array, search within it
                        for (const subItem of obj[key]) {
                            if (typeof subItem === "string" && subItem.toLowerCase().includes(queryLower)) {
                                results.push({ ...item, parentPath, category });
                                return; // Return early if a match is found
                            } else if (typeof subItem === "object") {
                                searchInObject(subItem);
                            }
                        }
                    } else if (typeof obj[key] === "object") {
                        // If the value is an object, search within it
                        searchInObject(obj[key]);
                    }
                }
            };
    
            searchInObject(item); // Start the search
        };

        const customTypes = settings.customTypes.map(item => (item + "s").toLowerCase()); // Get custom types

        const mapTypes = ["notes", "comments", "checklists", "events", ...customTypes]; // Map types
    
        // Recursive search function
        const searchInCategory = (category) => {
            // For each item in the category
            for (const [path, data] of Object.entries(this.notesData[category])) {
                if(category == "lines"){
                    // For each item in the line
                    for (const item of data) {
                        searchInItem(item, path, category);
                    }
                }else{
                    // For each type
                    for (const type of mapTypes) {
                        if (data[type]) {
                            // For each item
                            for (const item of data[type]) {
                                searchInItem(item, path, category);
                            }
                        }
                    }
                }
                
            }
        };
    
        // Search in each category
        searchInCategory("files");
        searchInCategory("directories");
        searchInCategory("lines");

        this.searchResults = results; // Set search results
        
    }
    
    /**
     * Filters notes based on the provided type and category within the notes data.
     * Utilizes the ProTasker settings and logs the filtering process.
     *
     * @param {string} type - The type of note to filter by (e.g., "note", "comment", "checklist", "event", etc.).
     * @param {string} category - The category within which to filter (e.g., "files", "directories", "lines", or "all").
     * 
     * @returns {void} - This function does not return a value. It updates the filteredNotes property with the results.
     */
    filterNotes(type, category) {
        const settings = getProTaskerSettings(); // Get settings
        const results = []; // Array to store filtered results
        
        this.selectedType = type; // Set selected type
        this.selectedCategory = category; // Set selected category
    
        // Filter function
        const filterByCategory = (data) => {
            if (!category || category === 'all') return Object.entries(data).flatMap(([key, value]) => Object.entries(value)); // If category is "all", return all items
    
            if (category === 'files') return Object.entries(data.files || {}); // If category is "files", return files
            if (category === 'directories') return Object.entries(data.directories || {}); // If category is "directories", return directories
            if (category === 'lines') return Object.entries(data.lines || {}); // If category is "lines", return lines
    
            return []; // If category is not "all", "files", "directories", or "lines", return an empty array
        };
        
        const customTypes = {}; // Object to store custom types
        const customTypesLowerCase = settings.customTypes.map(note => note.toLowerCase() + "s"); // Get custom types lowercase and add "s"
        // Add custom types
        settings.customTypes.forEach(note => {
            customTypes[note.toLowerCase()] = note.toString().toLowerCase();
        });
    
        // Map types
        const typeMap = {
            "notes": "note",
            "comments": "comment",
            "checklists": "checklist",
            "events": "event",
            "line": "line",
            ...customTypes
        };

    
        const types = ["notes", "comments", "checklists", "events", "Lines", ...customTypesLowerCase]; // Get types
        
        // Filter function
        const filterByType = (items) => {
            if (!type || type === 'all') return items; // If type is "all", return all items
            const normalizedType = typeMap[type] || type; // Get normalized type

            
            return items.filter(item => item.type === normalizedType); // Filter items by type
        };
    
        const categoryFilteredData = filterByCategory(this.notesData); // Filter data by category
        
        // Check if categoryFilteredData is an array
        if (!Array.isArray(categoryFilteredData)) {
            return; // If not, return
        }
    
        // Process categoryFilteredData
        categoryFilteredData.forEach(([dataPath, data]) => {
            if (category === "lines" || (type == "line" && category == "all")) {
    
                // Check if data is an array
                if (Array.isArray(data)) {
                    const filteredItems = filterByType(data); // Filter items
                    
                    // Check if filteredItems is an array
                    if (filteredItems.length > 0) {
                        results.push(...filteredItems.map(note => ({ ...note, parentPath: dataPath }))); // Add filtered items to results
                    }
                }
            }

            // Check if data is an object
            types.forEach(categoryKey => {
                if (!Array.isArray(data[categoryKey])) return; // If not, return
                const filteredItems = filterByType(data[categoryKey]); // Filter items

                // Check if filteredItems is an array
                if (filteredItems.length > 0) {
                    results.push(...filteredItems.map(note => ({ ...note, parentPath: dataPath }))); // Add filtered items to results
                }
            });
        });
    
        this.filteredNotes = results; // Set filtered notes
    }
    

    /**
     * Clears the search results and refreshes the tree data.
     * @memberof NotesExplorer
     * @instance
     * @function clearSearch
     * @since 1.0.0
     * @description This function is used to clear the search results and refresh the tree data.
     */
    clearSearch() {
        // Clear search
        this.search = false; 
        this.searchResults = null;
        this.refresh(); // Refresh the tree data
    }

    /**
     * Adds a note to a specified file in the notes data.
     *
     * @async
     * @param {string} filePath - The path of the file where the note should be added.
     * @param {string} content - The content of the note to be added.
     * @param {string} [type="note"] - The type of note to add. Defaults to "note".
     * @returns {Promise<void>} - A promise that resolves when the note has been added and saved to the file.
     */
    async addNoteToFile(filePath, content, type = "note") {
        // Check if the file exists
        if (!this.notesData.files[filePath]) {
            this.notesData.files[filePath] = { notes: [] }; // If not, create it
        }

        // Add the note
        this.notesData.files[filePath][type + "s"].push({
            id: Date.now(),
            type,
            categories: "file",
            content,
            createdAt: new Date().toISOString()
        });

        await this.saveNotesToFile(); // Save the notes
    }

 
    /**
     * Adds a note to a specified line in the notes data.
     *
     * @async
     * @param {string} filePath - The path of the file where the note should be added.
     * @param {number} lineNumber - The line number where the note should be added.
     * @param {string} entryType - The type of note to add. e.g. "note", "comment", "checklist", "event"
     * @param {string} noteContent - The content of the note to be added.
     */
    addNoteToLine(filePath, lineNumber, entryType, noteContent) {
        
        filePath = path.normalize(filePath).replace(/\\/g, "/").toLowerCase() // Get the file path
    
        // Check if the file exists
        if (!this.notesData.lines[filePath]) {
            this.notesData.lines[filePath] = []; // If not, create it
        }
    
        // Add the note
        this.notesData.lines[filePath].push({
            line: lineNumber,
            id: Date.now(),
            type: entryType.toLowerCase(),
            content: noteContent,
            createdAt: new Date().toISOString()
        });
    
        this.saveNotesToFile(); // Save the notes
    }

    /**
     * Normalizes a given file path by removing all backslashes and lowercasing the string.
     * @param {string} filePath - The path to normalize.
     * @returns {string} The normalized path.
     * @memberof NotesExplorer
     * @instance
     * @function normalizePath
     * @since 1.0.0
     * @description This function is used to normalize a given file path by removing all backslashes and lowercasing the string.
     */
    normalizePath(filePath) {
        return path.normalize(filePath).replace(/\\/g, "/").toLowerCase(); // Get the file path and normalize it
    }
    
    /**
     * Forces the tree view to refresh its data.
     * This function is used to notify the tree view that the data has changed and it should refresh itself.
     * @memberof NotesExplorer
     * @instance
     * @function refresh
     * @since 1.0.0
     * @description This function is used to notify the tree view that the data has changed and it should refresh itself.
     */
    refresh() {
        this._onDidChangeTreeData.fire(); // Notify the tree view that the data has changed
    }

    /**
     * Adds a new entry to the notes data.
     * @param {string} targetPath - The path to the file or directory where the entry should be added.
     * @param {boolean} isDirectory - Whether the target path is a file or directory. Defaults to false.
     * @param {string} entryType - The type of the entry. Examples: "note", "comment", "checklist", "event"
     * @param {string|object} noteContent - The content of the entry.
     * @param {boolean|Date} deadline - The deadline for the entry. If false, no deadline is set. If a date, the deadline is set to that date.
     * @returns {Promise<void>}
     * @memberof NotesExplorer
     * @instance
     * @function addEntry
     * @since 1.0.0
     * @description This function adds a new entry to the notes data. It can be used to add notes, comments, checklists or events to files or directories.
     * It takes the path to the file or directory where the entry should be added, whether the target path is a file or directory, the type of the entry, the content of the entry and optionally a deadline.
     * If a deadline is provided, it is set to the given date, otherwise no deadline is set.
     * After adding the entry, the function saves the notes data to the file.
     */
    async addEntry(targetPath, isDirectory = false, entryType, noteContent, deadline = false) {
        const typeKey = entryType.toLowerCase() + "s"; // Get the type key for the entry 
        
        // Get the target
        let target;
        targetPath = this.normalizePath(targetPath); // Normalize the path

        // If the target is a directory
        if (isDirectory) {
            if (!this.notesData.directories[targetPath]) {
                this.notesData.directories[targetPath] = { notes: [], comments: [], checklists: [], events: [] }; // If not, create it
            }

            target = this.notesData.directories[targetPath]; // Get the target
        } else {
            // If the target is a file
            if (!this.notesData.files[targetPath]) {
                this.notesData.files[targetPath] = { notes: [], comments: [], checklists: [], events: [] }; // If not, create it
            }
            target = this.notesData.files[targetPath]; // Get the target
        }

        // If the target doesn't have the type key
        if(!target?.[typeKey]) target[typeKey] = []
    
        // Add the entry
        target[typeKey].push({
            id: Date.now(),
            type: entryType.toLowerCase(),
            content: noteContent,  // Передаем сюда текст
            createdAt: new Date().toISOString(),
            deadline: deadline
        });
    
        await this.saveNotesToFile(); // Save the notes
    }
}

/**
 * Retrieves the ProTasker extension settings from the VS Code workspace configuration.
 *
 * This function accesses the 'protasker' configuration section and returns
 * an object containing various settings for the ProTasker extension.
 * 
 * @returns {Object} An object with the following properties:
 * - `language`: The selected interface language.
 * - `customTypes`: An array of custom note types.
 * - `noteDisplay`: The display mode for notes (icon, highlight, or inline text).
 * - `highlightColor`: The color used for line highlights.
 * - `showTimeAgo`: Boolean indicating if notes should display the time ago format.
 * - `notificatons`: Boolean indicating if notifications are enabled.
 * - `inlineTextColor`: Color for inline text notes.
 */
function getProTaskerSettings() {
    const config = vscode.workspace.getConfiguration('protasker'); // Get the protasker configuration

    // Return the settings
    return {
        language: config.get('language'), // Get the selected interface language
        customTypes: config.get('customTypes'), // Get the custom note types
        noteDisplay: config.get('noteDisplay'), // Get the note display mode
        highlightColor: config.get('highlightColor'), // Get the highlight color
        showTimeAgo: config.get('showTimeAgo'), // Get the show time ago setting
        notificatons: config.get('notificatons'),  // Get the notifications setting
        inlineTextColor: config.get('inlineTextColor')  // Get the inline text color
    };
}

module.exports = { NotesExplorer };
