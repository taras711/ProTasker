const vscode = require('vscode');
const path = require('path');
const timeago = require('timeago.js');

class Manager{
    constructor(data,  viewId) {
        this.viewId = viewId;
        this.notesData = data;
        this.searchResults = null
        this.noteItem = NoteItem;
        this.context = null;
    }
    async mainData(element){
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
                        
                    const directories = Object.keys(this.notesData.directories).map(dirPath => {
                        const dirData = this.notesData.directories[dirPath];
                        
                        // 🔍 Проверка наличия оповещений
                        const hasDeadline = Object.values(dirData)
                            .filter(Array.isArray)
                            .flat()
                            .some(note => note?.deadline);
                        
                        const totalRecords = Object.values(dirData)
                            .filter(Array.isArray)
                            .reduce((sum, category) => sum + category.length, 0);
                    
                        if (this.viewId !== null && dirPath !== pathDir) return;
                    
                        return new NoteItem(
                            `${hasDeadline ? `(🔔)` : ""} ${path.basename(dirPath)}`,
                            vscode.TreeItemCollapsibleState.Collapsed,
                            { count: totalRecords, directory: dirPath, prov: "file", contextValue: "directory", icon: "folder"}
                        );
                    });
                    
                    const files = Object.keys(this.notesData.files).map(filePath => {
                        const fileData = this.notesData.files[filePath];
                    
                        // 🔍 Проверка наличия оповещений
                        const hasDeadline = Object.values(fileData)
                            .filter(Array.isArray)
                            .flat()
                            .some(note => note?.deadline);
                    
                        const totalRecords = Object.values(fileData)
                            .filter(Array.isArray)
                            .reduce((sum, category) => sum + category.length, 0);
                    
                        if (this.viewId !== null && filePath !== file) return;
                        
                        return new NoteItem(
                            `${hasDeadline ? `(🔔)` : ""} ${path.basename(filePath)}`,
                            vscode.TreeItemCollapsibleState.Collapsed,
                            { count: totalRecords, file: filePath, prov: "directories", contextValue: "file", icon: "file"}
                        );
                    });
                    
                    const lines = Object.keys(this.notesData.lines).map(filePath => {
                        if (this.viewId !== null && filePath !== file) return;
                    
                        // 🔍 Проверка наличия оповещений
                        const hasDeadline = this.notesData.lines[filePath].some(note => note?.deadline);
                        return new NoteItem(
                            `${hasDeadline ? "(🔔)" : ""} ${path.basename(filePath)}`,
                            vscode.TreeItemCollapsibleState.Collapsed,
                            { count: this.notesData.lines[filePath].length, contextValue: "lines", lineFile: filePath, icon: "pinned"}
                        );
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
                                    : note.content;
                                
                                return new NoteItem(label, 
                                    note.type === 'checklist' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Collapsed, 
                                    { ...note, contextValue: note.type === 'checklist' ? 'checklist' : "noteItem", dirpath: element.context.directory, icon: note.type === 'checklist' ? "tasklist" : "notebook" }
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
                                    ? `${note.content.name} (${totalItems}, ${color} ${progress}%)` || 'Checklist'
                                    : note.content;
                                
                                return new NoteItem(label, 
                                    note.type === 'checklist' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Collapsed, 
                                    { ...note, contextValue: note.type === 'checklist' ? "checklist" : "noteItem", filepath: element.context.file, icon: note.type === 'checklist' ? "tasklist" : "notebook"}
                                );
                            })
                        );
                }
            
                // Если это строка файла - показываем записи
                if (element.context.lineFile) {
                    const filePath = element.context.lineFile;
                    
                    return this.notesData.lines[filePath].map(note =>
                        new NoteItem(`Line ${note.line}: ${note.content}`, vscode.TreeItemCollapsibleState.Collapsed, { ...note, prov: "lines", path: filePath,  contextValue: "line", linepath: filePath, icon: "pinned-dirty"})
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
                        new NoteItem(`- ID: ${element.context.id}`, vscode.TreeItemCollapsibleState.None),
                        new NoteItem(`- Type: ${element.context.type}`, vscode.TreeItemCollapsibleState.None),
                        new NoteItem(`- Content: ${element.context.content}`, vscode.TreeItemCollapsibleState.None),
                        new NoteItem(`- Created: ${new Date(element.context.createdAt).toLocaleString()}`, vscode.TreeItemCollapsibleState.None),
                        element.context?.deadline ? new NoteItem(`🔔 Deadline: ${formatDeadlineStatus(element.context?.deadline)}`, vscode.TreeItemCollapsibleState.None) : "",
                        ...(element.context.line ? [new NoteItem(`- Line: ${element.context.line}`, vscode.TreeItemCollapsibleState.None)] : [])
                    ];
                }
        
                 // Если у элемента нет дочерних элементов, показываем "Нет записей"
                // if (children.length === 0) {
                //     return [new NoteItem("📭 Нет записей", vscode.TreeItemCollapsibleState.None)];
                // }
            
                return []; // 🛑 Если элемент не распознан, возвращаем пустой массив
            
    }

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

function getIconPath(context, iconName) {
    return vscode.Uri.file(path.join(context.extensionPath, 'icons', `${iconName}`));
}

function formatDeadlineStatus(deadlineDate) {
    if (!deadlineDate) return "";

    const deadline = new Date(deadlineDate);
    const now = new Date();
    
    const diffTime = deadline.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let statusText = "";

    if (diffTime < 0) {
        statusText = `🔴 Просрочено (${Math.abs(diffDays)} дн. назад)`;
    } else if (diffDays === 0) {
        statusText = `🟡 Сегодня!`;
    } else if (diffDays === 1) {
        statusText = `🟢 Завтра`;
    } else {
        statusText = `🟢 Осталось ${diffDays} дн.`;
    }

    return `${statusText}: ${deadline.toLocaleString()}`;
}

function getProgressColor(percent) {
    if (percent <= 30) return "🔴"; // Красный
    if (percent <= 70) return "🟠"; // Оранжевый
    return "🟢"; // Зеленый
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

module.exports = { Manager };