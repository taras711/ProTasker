const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

class NotesExplorer {
    constructor() {
        this.activeDecorationType = null;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        
        this.dataNotes = path.join(__dirname, 'notesData.json');
        this.notesData = this.loadNotes();
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
        const treeItem = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    
        // Устанавливаем правильный contextValue в зависимости от типа элемента
        if (["note", "comment", "checklist", "event"].includes(element.type)) {
            treeItem.id = element.id;  // Присваиваем id
            treeItem.contextValue = `${element.type}Item`;  // Используем тип как суффикс
        } else if (element.type === "line") {
            treeItem.contextValue = "lineItem";
        } else {
            treeItem.contextValue = "folderItem";
        }
        console.log(JSON.stringify(element))
    
        return treeItem;
    }

    getData(data){
        if(!data) return {};
        const keys = Object.keys(data).map(filePath => {return data[filePath]})

        return keys;
    }
    

    async getChildren(element) {
        if (!element) {
            const categories = ['files', 'directories', 'lines'];
            const results = [];
            
            // Проходим по каждой категории
            categories.forEach(cat => {
                const categoryData = this.notesData[cat]; // Динамически извлекаем данные
                Object.keys(categoryData).forEach(itemPath => {
                    const item = categoryData[itemPath];
                    console.log(this.extractItemData(item))
                    // Для каждой записи в категории (например, file или directory) добавляем все категории (notes, comments и т.д.)
                    results.push({
                        label: cat === "directories" ? this.getDirectoryLabel(itemPath) :
                           cat === "files" ? this.getFileLabel(itemPath) :
                           `📌 ${path.basename(itemPath)}`,
                        type: cat, // Тип категории (file, directory, или line)
                        path: itemPath,
                        ...this.extractItemData(item), // Динамически извлекаем все данные: заметки, комментарии, события и т.д.
                    });
                });
            });
            
            return results;
        } else if (element.type === "file") {
            return [
                ...this.getEntries(this.notesData.files[element.path], element.path)
            ];
        } else if (element.type === "directory") {
            return [
                ...this.getEntries(this.notesData.directories[element.path], element.path)
            ];
        } else if (element.type === "lineGroup") {
            return Object.keys(this.notesData.lines[element.path] || {}).map(lineNumber => ({
                label: `📌 Line ${lineNumber}`,
                type: "line",
                line: parseInt(lineNumber),
                path: element.path
            }));
        } else if (element.type === "line") {
            const fileNotes = this.notesData.lines[element.path]?.[element.line] || [];
            if (fileNotes.length > 0) {
                return fileNotes.map(note => ({
                    label: `📌 ${note.content}`,
                    type: "note",
                    line: element.line,
                    filePath: element.path,
                    noteId: note.id
                }));
            }
        }

        if (element.type === "file") {
            return this.getEntries(this.notesData.files[element.path] || {}, element.path);
        }
        if (element.type === "directory") {
            return this.getEntries(this.notesData.directories[element.path] || {}, element.path);
        }
        return [];
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

    async addEntry(targetPath, isDirectory = false, entryType, noteContent, categories) {
        const typeKey = entryType.toLowerCase() + "s"; // Пример: "notes", "comments", "checklists", "events"
    
        // Добавляем тип записи в файл или папку
        let target;
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
            categories: categories,
            createdAt: new Date().toISOString()
        });
    
        await this.saveNotesToFile();
    }
    
    
    
}

module.exports = { NotesExplorer };
