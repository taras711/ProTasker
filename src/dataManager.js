const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const timeago = require('timeago.js');

class NotesExplorer {
    constructor() {
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

        if (element.contextValue === "resetSearch" && (this.searchResults !== null || this.searchResults.length > 1)) {
            treeItem.command = {
                command: "protasker.resetSearch",
                title: "Сбросить поиск"
            };
            treeItem.tooltip = "Нажмите, чтобы очистить результаты поиска";
            treeItem.contextValue = "resetSearch"; // ✅ Добавляем contextValue
        }

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

    async mainData(element, viewId = false){
            this.viewId = viewId || this.viewId;
            const editor = vscode.window.activeTextEditor;
            const file = editor ? path.normalize(editor.document.uri.fsPath).replace(/\\/g, "/").toLowerCase() : null;
            const pathDir = file ? file.slice(0, file.lastIndexOf('/')) : null;
            console.log("📌 Отображаем ViewId...", this.viewId);
            if (!element) {
    
                const items = [];
    
                if (this.searchResults !== null && this.searchResults.length > 1) {
                    console.log("📌 Отображаем результаты поиска...", this.searchResults);
                    
                    return this.searchResults;
                }
                    
                // 🌳 Корневой список — директории + файлы + строки
                const directories = Object.keys(this.notesData.directories).map(dirPath =>{
                    const dirData = this.notesData.directories[dirPath];
                    const totalRecords = Object.values(dirData)
                        .filter(Array.isArray) // 🛡️ Оставляем только массивы
                        .reduce((sum, category) => sum + category.length, 0);
                    if(this.viewId !== null && dirPath !== pathDir) return;
                    return new NoteItem(`📁 ${path.basename(dirPath)}`, vscode.TreeItemCollapsibleState.Collapsed, { count: totalRecords, directory: dirPath, prov: "file", contextValue: "directory" })
                });
                const files = Object.keys(this.notesData.files).map(filePath => {
                    const dirData = this.notesData.files[filePath];
                    const totalRecords = Object.values(dirData)
                        .filter(Array.isArray) // 🛡️ Оставляем только массивы
                        .reduce((sum, category) => sum + category.length, 0);
                    if(this.viewId !== null && filePath !== file) return;
                    return new NoteItem(`📄 ${path.basename(filePath)}`, vscode.TreeItemCollapsibleState.Collapsed, { count: totalRecords, file: filePath, prov: "directories", contextValue: "file" })
                });
                const lines = Object.keys(this.notesData.lines).map(filePath =>{
                    console.log("File path: " + this.viewId + " " + file)
                    if(this.viewId !== null && filePath !== file) return;
                    return new NoteItem(`📍 ${path.basename(filePath)}`, vscode.TreeItemCollapsibleState.Collapsed, {count: this.notesData.lines[filePath].length, lineFile: filePath })
                });
        
                const allItems = [...items, ...directories, ...files, ...lines];
    
                // Если список пуст — возвращаем сообщение
                if (allItems.length === 0) {
                    return [new NoteItem("📭 Нет записей", vscode.TreeItemCollapsibleState.None)];
                }
    
                return allItems;
            }
        
            // Если это директория - показываем записи в ней
            if (element.context.directory) {
                const dirPath =  this.notesData.directories[element.context.directory] || {};
        
                return Object.entries(dirPath)
                    .flatMap(([type, notes]) => 
                        (Array.isArray(notes) ? notes : []).map(note => {
                            note.prov = "directories";
                            const label = note.type === 'checklist' 
                                ? `📋 ${note.content.name || 'Чек-лист'}`
                                : `${note.type.toUpperCase()}: ${note.content}`;
                            
                            return new NoteItem(label, 
                                note.type === 'checklist' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Collapsed, 
                                { ...note, contextValue: note.type === 'checklist' ? 'checklist' : "noteItem", dirpath: element.context.directory }
                            );
                        })
                    );
            }
        
            // Если это файл - показываем записи в нем
            if (element.context.file) {
                const fileNotes = this.notesData.files[element.context.file] || {};
    
                return Object.entries(fileNotes)
                    .flatMap(([type, notes]) => 
                        (Array.isArray(notes) ? notes : []).map(note => {
                            const totalItems = note.type == "checklist" ? note.content.items.length : null;
                            const completedItems = note.type == "checklist" ? note.content.items.filter(item => item.done).length : null;
                            const progress = note.type == "checklist" ? totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0 : null;
                            const color = note.type == "checklist" ? getProgressColor(progress) : null;
                            note.prov = "files";
                            const label = note.type === 'checklist' 
                                ? `📋 ${note.content.name} (${totalItems}, ${color} ${progress}%)` || 'Checklist'
                                : `${note.type.toUpperCase()}: ${note.content}`;
                            
                            return new NoteItem(label, 
                                note.type === 'checklist' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Collapsed, 
                                { ...note, contextValue: note.type === 'checklist' ? "checklist" : "noteItem", filepath: element.context.file}
                            );
                        })
                    );
            }
        
            // Если это строка файла - показываем записи
            if (element.context.lineFile) {
                const filePath = element.context.lineFile;
                
                return this.notesData.lines[filePath].map(note =>
                    new NoteItem(`📍 Line ${note.line}: ${note.content}`, vscode.TreeItemCollapsibleState.Collapsed, { ...note, prov: "lines", path: filePath,  contextValue: "line", linepath: filePath})
                );
            }
    
            // ✅ Если элемент — чек-лист, возвращаем его пункты
            if (element.context.type === 'checklist') {
                if (!element.context.content || !element.context.content.items || !Array.isArray(element.context.content.items)) {
                    console.error("❌ Ошибка: у чек-листа нет массива items", element.context);
                    return [new NoteItem("📭 Нет пунктов в чек-листе", vscode.TreeItemCollapsibleState.None)];
                }
                console.log("Checklists",element)
                const filePath = element.context.prov;
            
                return element.context.content.items.map((item, index) => 
                    new NoteItem(
                        item.done ? `✅ ${item.text}` : `⬜ ${item.text}`,
                        vscode.TreeItemCollapsibleState.None,
                        { ...item, prov: "directories", path: filePath, checklistId: element.context.id, index, type: element.context.type, contextValue: "checklistItem" }
                    )
                );
            }
            
        
            // Если это заметка/комментарий - показываем детали
            if (element.context.id) {
                return [
                    new NoteItem(`🆔 ID: ${element.context.id}`, vscode.TreeItemCollapsibleState.None),
                    new NoteItem(`📌 Type: ${element.context.type}`, vscode.TreeItemCollapsibleState.None),
                    new NoteItem(`📝 Content: ${element.context.content}`, vscode.TreeItemCollapsibleState.None),
                    new NoteItem(`📅 Created: ${new Date(element.context.createdAt).toLocaleString()}`, vscode.TreeItemCollapsibleState.None),
                    element.context?.deadline ? new NoteItem(`🔔 Deadline: ${new Date(element.context.deadline).toLocaleString()}`, vscode.TreeItemCollapsibleState.None) : "",
                    ...(element.context.line ? [new NoteItem(`📍 Line: ${element.context.line}`, vscode.TreeItemCollapsibleState.None)] : [])
                ];
            }
    
             // Если у элемента нет дочерних элементов, показываем "Нет записей"
            // if (children.length === 0) {
            //     return [new NoteItem("📭 Нет записей", vscode.TreeItemCollapsibleState.None)];
            // }
        
            return []; // 🛑 Если элемент не распознан, возвращаем пустой массив
        
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
        query = query.toLowerCase().trim();
    
        let results = [];
    
        const searchInCollection = (collection, parentPath = "") => {
            Object.entries(collection).forEach(([path, data]) => {
                const categories = ["notes", "comments", "checklists", "events"];
                categories.forEach(category => {
                    if (Array.isArray(data[category])) {
                        data[category].forEach(note => {
                            if (typeof note.content === "string" && note.content.toLowerCase().includes(query)) {
                                console.log(`✅ Найдена запись: ${note.content}`);  // Добавим логирование
                                results.push(new NoteItem(
                                    `🔍 ${category.toUpperCase()}: ${note.content}`,
                                    vscode.TreeItemCollapsibleState.None,
                                    { ...note, parentPath, contextValue: "noteItem" }
                                ));
                            }
    
                            // Дополнительная проверка для чеклистов
                            if (category === "checklists" && Array.isArray(note.content.items)) {
                                note.content.items.forEach(item => {
                                    if (item.text.toLowerCase().includes(query)) {
                                        console.log(`✅ Найден пункт чеклиста: ${item.text}`);
                                        results.push(new NoteItem(
                                            `🔍 CHECKLIST: ${note.content.name} → ${item.text}`,
                                            vscode.TreeItemCollapsibleState.None,
                                            { ...item, checklistId: note.id, index: note.content.items.indexOf(item), parentPath, contextValue: "checklistItem" }
                                        ));
                                    }
                                });
                            }
                        });
                    }
                });
            });
        };
    
        // 🔎 Ищем в файлах, директориях и строках
        searchInCollection(this.notesData.files);
        searchInCollection(this.notesData.directories);
        Object.entries(this.notesData.lines).forEach(([path, notes]) => {
            notes.forEach(note => {
                if (typeof note.content === "string" && note.content.toLowerCase().includes(query)) {
                    console.log(`✅ Найдена строка: ${note.content}`);
                    results.push(new NoteItem(
                        `🔍 LINE ${note.line}: ${note.content}`,
                        vscode.TreeItemCollapsibleState.None,
                        { ...note, parentPath: path, contextValue: "noteItem" }
                    ));
                }
            });
        });
    
        results.push(new NoteItem(
            "❌ Сбросить поиск", 
            vscode.TreeItemCollapsibleState.None, 
            { contextValue: "resetSearch" }
        ));
    
        console.log(`🔹 Найдено результатов: ${results.length}`);
        
        if (results.length === 0) {
            vscode.window.showInformationMessage("😕 Ничего не найдено по запросу.");
        }
    
        this.searchResults = results;
        this.search = true;
        this.refresh();  // Обновляем TreeView с результатами поиска
    }
    
    
    filterNotes(type, category) {
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
    
        const typeMap = {
            "notes": "note",
            "comments": "comment",
            "checklists": "checklist",
            "events": "event",
            "lines": "line"
        };
    
        const filterByType = (items) => {
            if (!type || type === 'all') return items;
            const normalizedType = typeMap[type] || type;
            return items.filter(item => item.type === normalizedType);
        };
    
        const categoryFilteredData = filterByCategory(this.notesData);
        console.log(`📚 После фильтрации по категории, количество объектов: ${categoryFilteredData.length}`);
    
        if (!Array.isArray(categoryFilteredData)) {
            console.error("❌ Ошибка: categoryFilteredData не массив!", categoryFilteredData);
            return [];
        }
    
        categoryFilteredData.forEach(([dataPath, data]) => {
            console.log(`🔍 Проверяем путь: ${dataPath}`);
    
            if (category === "lines") {
                if (Array.isArray(data)) {
                    const filteredItems = filterByType(data);
                    if (filteredItems.length > 0) {
                        if (!results.some(item => item.contextValue === "lineContainer" && item.label === `📍 ${path.basename(dataPath)}`)) {
                            results.push(new NoteItem(
                                `📍 ${path.basename(dataPath)}`,
                                vscode.TreeItemCollapsibleState.None,
                                { lineFile: dataPath, contextValue: "lineContainer" }
                            ));
                        }
    
                        filteredItems.forEach(note => {
                            results.push(new NoteItem(
                                `📝 LINE ${note.line}: ${note.content}`,
                                vscode.TreeItemCollapsibleState.Collapsed, // Теперь запись может раскрываться
                                { ...note, parentPath: dataPath, contextValue: "noteItem" }
                            ));
                        });
                    }
                }
                return;
            }
    
            ["notes", "comments", "checklists", "events"].forEach(categoryKey => {
                if (!Array.isArray(data[categoryKey])) return;
                
                const filteredItems = filterByType(data[categoryKey]);
                if (filteredItems.length > 0) {
                    if (!results.some(item => item.contextValue === "directory" && item.label === `📁 ${path.basename(dataPath)}`)) {
                        results.push(new NoteItem(
                            `📁 ${path.basename(dataPath)}`,
                            vscode.TreeItemCollapsibleState.None,
                            { directory: dataPath, contextValue: "directory" }
                        ));
                    }
    
                    filteredItems.forEach(note => {
                        results.push(new NoteItem(
                            `${categoryKey.toUpperCase()}: ${note.content}`,
                            vscode.TreeItemCollapsibleState.Collapsed, // Теперь запись разворачивается
                            { ...note, parentPath: dataPath, contextValue: "noteItem" }
                        ));
                    });
                }
            });
        });

        // **Добавляем кнопку "Сбросить фильтр"** 
        results.push(new NoteItem(
            "❌ Сбросить фильтр",
            vscode.TreeItemCollapsibleState.None,
            { contextValue: "resetSearch" }
        ));
    
        return results;
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

    async addEntry(targetPath, isDirectory = false, entryType, noteContent, deadline = "false") {
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
function getProgressColor(percent) {
    if (percent <= 30) return "🔴"; // Красный
    if (percent <= 70) return "🟠"; // Оранжевый
    return "🟢"; // Зеленый
}
class NoteItem extends vscode.TreeItem {
    constructor(label, collapsibleState, context = {}) {
        const settings = getProTaskerSettings()
        let converToTimeago = context?.createdAt ? new Date(context.createdAt).toLocaleString() : "", description = "";
        super(label, collapsibleState);
        this.context = context;
        this.tooltip = context.content || label;
        this.notifiedDeadlines = new Set();
        
        this.contextValue = this.context.contextValue || context.type || "unknown";
        this.dirpath = this.context.dirpath || null
        this.filepath = this.context.filepath || null
        this.linepath = this.context.linepath || null
        if(context.createdAt){
            if(settings.showTimeAgo) converToTimeago = timeago.format(new Date(context.createdAt)) || ""
        }

        description = context?.count ? `(${context.count})` : (`${context.type ? `(${context.type})` : ""} ${converToTimeago}`)
        
        this.description = description;

        console.log(`📌 NoteItem создан: ${this.label}, contextValue: ${this.contextValue}`);

        if(settings.notificatons){
            if (context?.deadline) {
                const notifiedDeadlines = this.notifiedDeadlines;
                const deadline = new Date(context.deadline);
                const now = new Date().getTime();
                const diff = deadline.getTime() - now;

                if (diff < 3600000 && diff > 0 && !notifiedDeadlines.has(context.id)) {
                    this.iconPath = new vscode.ThemeIcon("clock", new vscode.ThemeColor("notificationsWarningIcon.foreground"));
                    notifiedDeadlines.add(context.id); // Помечаем как уведомлённое
                } else if (diff <= 0 && !notifiedDeadlines.has(context.id)) {
                    this.iconPath = new vscode.ThemeIcon("error", new vscode.ThemeColor("notificationsErrorIcon.foreground"));
                    notifiedDeadlines.add(context.id);
                } else {
                    this.iconPath = new vscode.ThemeIcon("note");
                }
            }
        }
    }
}

// class SettingsItem extends vscode.TreeItem {
//     constructor(){
//         super()
//     }
// }
function playSound( soundLink ) {
    vscode.env.openExternal(soundLink);
}
function getProTaskerSettings(){
    const config = vscode.workspace.getConfiguration('protasker');

    return {
        language: config.get('language'),
        customTypes: config.get('customTypes'),
        noteDisplay: config.get('noteDisplay'),
        highlightColor: config.get('highlightColor'),
        showTimeAgo: config.get('showTimeAgo'),
        notificatons: config.get('notificatons')
    }

}

module.exports = { NotesExplorer };
