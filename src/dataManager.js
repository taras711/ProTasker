const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const timeago = require('timeago.js');
const {Manager} = require("./manager")

class NotesExplorer extends Manager{
    constructor(context) {
        super();
        this.context = context;
        this.activeDecorationType = null;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.timeago = timeago;
        this.viewId = null;
        this.dataNotes = path.join(__dirname, 'notesData.json');
        this.notesData = this.loadNotes();
        this.searchResults = null
        this.search = false;
    }

    loadNotes() {
        try {
            if (fs.existsSync(this.dataNotes)) {
                const data = JSON.parse(fs.readFileSync(this.dataNotes).toString());
                return data;
            }
        } catch (error) {
            console.error("❌ Ошибка при загрузке заметок:", error);
        }
        return { files: {}, directories: {}, lines: {} };
    }

    saveNotesToFile() {
        try {
            fs.writeFileSync(this.dataNotes, JSON.stringify(this.notesData, null, 2));
            this.refresh();
        } catch (error) {
            console.error("Ошибка при сохранении заметок:", error);
        }
    }

    getTreeItem(element) {
        if (!element) {
            console.error("❌ Ошибка: element is undefined в getTreeItem()");
            return new vscode.TreeItem("Ошибка", vscode.TreeItemCollapsibleState.None);
        }

        
        console.log(element)
        
    
        const treeItem = new vscode.TreeItem(element.label, element.collapsibleState);

        if (element.contextValue === "checklistItem") {
            treeItem.command = {
                command: "protasker.toggleChecklistItem",
                title: "Toggle Checklist Item",
                arguments: [element] // Передаём элемент в команду
            };
        }
        treeItem.contextValue = element.contextValue;
        treeItem.tooltip = element.tooltip || "";
        treeItem.description = element.description || "";

        if (element.contextValue === "resetSearch" && (this.searchResults !== null || this.filteredNotes !== null)) {
            treeItem.command = {
                command: "protasker.resetSearch",
                title: "Сбросить поиск"
            };
            treeItem.tooltip = "Нажмите, чтобы очистить результаты поиска";
            treeItem.contextValue = "resetSearch"; // ✅ Добавляем contextValue
        }

        //treeItem.iconPath = element.iconPath || new vscode.ThemeIcon('file');
        
                element.context?.icon ? treeItem.iconPath = treeItem.iconPath = element.iconPath || new vscode.ThemeIcon(element.context.icon): "undefined";

        return treeItem;
    }

    getData(data){
        if(!data) return {};
        const keys = Object.keys(data).map(filePath => {return data[filePath]})

        return keys;
    }

    async getChildren(element) {
       return await this.mainData(element)
    }
    
    
// Функция для отображения значков файлов с заметками
    getFileLabel(filePath) {
        const hasNotes = this.notesData.files[filePath]?.notes.length > 0;
        const hasComments = Object.keys(this.notesData.files[filePath]?.lines || {}).length > 0;
        return `${hasNotes || hasComments ? '📝 ' : ''}${path.basename(filePath)}`;
    }

        // Функция для папок
    getDirectoryLabel(directoryPath) {
        const hasNotes = this.notesData.directories[directoryPath]?.notes.length > 0;
        return `${hasNotes ? '📂📝 ' : '📂 '}${path.basename(directoryPath)}`;
    }

        // Вспомогательная функция для извлечения всех данных (заметки, комментарии, чеклисты и события) для объекта
    extractItemData(item, parent = null) {
        const allCategories = ['notes', 'comments', 'checklists', 'events']; // Все возможные категории данных
        const extractedData = [];

        // Для каждой категории данных (заметки, комментарии и т.д.)
        allCategories.forEach(category => {
            if (item[category] && item[category].length > 0) {
                item[category].forEach(entry => {
                    extractedData.push({
                        label: `${category.slice(0, 1).toUpperCase()}${category.slice(1)}: ${entry.content}`, // Заголовок категории
                        type: category.slice(0, -1), // Тип записи, например: "note", "comment", и т.д.
                        id: entry.id,
                        content: entry.content,
                        createdAt: entry.createdAt || new Date().toISOString(),
                        parent: parent ? parent.path : null, // Если есть родитель, передаем его путь
                    });
                });
            }
        });

        return extractedData;
    }

    getEntries(target, parentPath) {
        if (!target) return [];

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

    searchNotes(query) {
        const results = [];
        const settings = getProTaskerSettings();

        const searchInItem = (item, parentPath, category) => {
            const queryLower = query.toLowerCase();
            
    
            // Рекурсивный поиск во всех значениях объекта
            const searchInObject = (obj) => {
                for (const key in obj) {
                    if (typeof obj[key] === "string" && obj[key].toLowerCase().includes(queryLower)) {
                        results.push({ ...item, parentPath, category });
                        return; // Достаточно одного совпадения
                    } else if (Array.isArray(obj[key])) {
                        for (const subItem of obj[key]) {
                            if (typeof subItem === "string" && subItem.toLowerCase().includes(queryLower)) {
                                results.push({ ...item, parentPath, category });
                                return;
                            } else if (typeof subItem === "object") {
                                searchInObject(subItem);
                            }
                        }
                    } else if (typeof obj[key] === "object") {
                        searchInObject(obj[key]);
                    }
                }
            };
    
            searchInObject(item);
        };

        const customTypes = settings.customTypes.map(item => (item + "s").toLowerCase());

        const mapTypes = ["notes", "comments", "checklists", "events", ...customTypes]
    
        // Общая функция поиска по категориям
        const searchInCategory = (category) => {
            for (const [path, data] of Object.entries(this.notesData[category])) {
                if(category == "lines"){
                    for (const item of data) {
                        searchInItem(item, path, category);
                    }
                }else{
                    for (const type of mapTypes) {
                        if (data[type]) {
                            for (const item of data[type]) {
                                searchInItem(item, path, category);
                            }
                        }
                    }
                }
                
            }
        };
    
        // Ищем во всех категориях
        searchInCategory("files");
        searchInCategory("directories");
        searchInCategory("lines");

        
    
        this.searchResults = results;
        
    }
    
    
    filterNotes(type, category) {
        const settings = getProTaskerSettings();
        const results = [];
        console.log(`🔍 Начинаем фильтрацию по типу: ${type} и категории: ${category}`);
        
        this.selectedType = type;
        this.selectedCategory = category;
    
        const filterByCategory = (data) => {
            if (!category || category === 'all') return Object.entries(data).flatMap(([key, value]) => Object.entries(value));
            console.log(`🔎 Фильтруем по категории: ${category}`);
    
            if (category === 'files') return Object.entries(data.files || {});
            if (category === 'directories') return Object.entries(data.directories || {});
            if (category === 'lines') return Object.entries(data.lines || {});
    
            return [];
        };
        
        const customTypes = {};
        const customTypesLowerCase = settings.customTypes.map(note => note.toLowerCase() + "s");
        settings.customTypes.forEach(note => {
            customTypes[note.toLowerCase()] = note.toString().toLowerCase();
        });
    
        const typeMap = {
            "notes": "note",
            "comments": "comment",
            "checklists": "checklist",
            "events": "event",
            "line": "line",
            ...customTypes
        };

    
        const types = ["notes", "comments", "checklists", "events", "Lines", ...customTypesLowerCase];
        
        const filterByType = (items) => {
            if (!type || type === 'all') return items;
            const normalizedType = typeMap[type] || type;

            
            return items.filter(item => item.type === normalizedType);
        };
    
        const categoryFilteredData = filterByCategory(this.notesData);
        
        if (!Array.isArray(categoryFilteredData)) {
            console.error("❌ Ошибка: categoryFilteredData не массив!", categoryFilteredData);
            return;
        }
    console.log("types:", category)
        categoryFilteredData.forEach(([dataPath, data]) => {
            if (category === "lines" || (type == "line" && category == "all")) {
                console.log("Обрабатываем категорию 'lines'");
    
                // Если данные для строки существуют и это массив
                if (Array.isArray(data)) {
                    const filteredItems = filterByType(data);
                    
    
                    if (filteredItems.length > 0) {
                        results.push(...filteredItems.map(note => ({ ...note, parentPath: dataPath })));
                    }
                }
            }

            types.forEach(categoryKey => {
                if (!Array.isArray(data[categoryKey])) return;
                const filteredItems = filterByType(data[categoryKey]);
                if (filteredItems.length > 0) {
                    results.push(...filteredItems.map(note => ({ ...note, parentPath: dataPath })));
                }
            });
        });
    
        this.filteredNotes = results; // ✅ Просто сохраняем в переменную
        
        console.log(`✅ Фильтрация завершена. Найдено записей: ${results.length}`);
    }
    

    clearSearch() {
        this.search = false;
        this.searchResults = null;
        this.refresh();
    }

    async addNoteToFile(filePath, content, type = "note") {
        if (!this.notesData.files[filePath]) {
            this.notesData.files[filePath] = { notes: [] };
        }
        this.notesData.files[filePath][type + "s"].push({
            id: Date.now(),
            type,
            categories: "file",
            content,
            createdAt: new Date().toISOString()
        });

        await this.saveNotesToFile();
    }

    addNoteToLine(filePath, lineNumber, entryType, noteContent) {
        const typeKey = entryType.toLowerCase() + "s";  // Преобразуем тип записи в соответствующую категорию, например, "comments", "checklists"
        filePath = path.normalize(filePath).replace(/\\/g, "/").toLowerCase() // Используем только имя файла
        // Проверяем, существует ли файл, и если нет, создаем структуру данных для этого файла
        // if (!this.notesData.files[filePath]) {
        //     this.notesData.files[filePath] = { notes: [], comments: [], checklists: [], events: [], lines: {} };
        // }
    
        // Проверяем, существует ли для этой строки запись, и если нет, создаем её
        if (!this.notesData.lines[filePath]) {
            this.notesData.lines[filePath] = [];
        }

        console.log(noteContent)
    
        // Добавляем новую запись в категорию строк
        this.notesData.lines[filePath].push({
            line: lineNumber,
            id: Date.now(),
            type: entryType.toLowerCase(),
            content: noteContent,
            createdAt: new Date().toISOString()
        });
    
        this.saveNotesToFile();
    }

    normalizePath(filePath) {
        return path.normalize(filePath).replace(/\\/g, "/").toLowerCase();
    }
    
    refresh() {
        console.log("✅ DEBUG: TreeView обновляется...");
        this._onDidChangeTreeData.fire();
    }

    async addEntry(targetPath, isDirectory = false, entryType, noteContent, deadline = false) {
        const typeKey = entryType.toLowerCase() + "s"; // Пример: "notes", "comments", "checklists", "events"
        
        
        // Добавляем тип записи в файл или папку
        let target;
        targetPath = this.normalizePath(targetPath)
        if (isDirectory) {
            if (!this.notesData.directories[targetPath]) {
                this.notesData.directories[targetPath] = { notes: [], comments: [], checklists: [], events: [] };
            }
            target = this.notesData.directories[targetPath];
        } else {
            if (!this.notesData.files[targetPath]) {
                this.notesData.files[targetPath] = { notes: [], comments: [], checklists: [], events: [] };
            }
            target = this.notesData.files[targetPath];
        }

        if(!target?.[typeKey]) target[typeKey] = []
    
        // Добавляем запись
        target[typeKey].push({
            id: Date.now(),
            type: entryType.toLowerCase(),
            content: noteContent,  // Передаем сюда текст
            createdAt: new Date().toISOString(),
            deadline: deadline
        });
    
        await this.saveNotesToFile();
    }
}

function getProTaskerSettings() {
    const config = vscode.workspace.getConfiguration('protasker');
    return {
        language: config.get('language'),
        customTypes: config.get('customTypes'),
        noteDisplay: config.get('noteDisplay'),
        highlightColor: config.get('highlightColor'),
        showTimeAgo: config.get('showTimeAgo'),
        notificatons: config.get('notificatons'),
        inlineTextColor: config.get('inlineTextColor')
    };
}

module.exports = { NotesExplorer };
