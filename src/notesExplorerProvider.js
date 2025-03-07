const vscode = require('vscode');
const path = require('path');

class NotesExplorerProvider {
    constructor(data) {
        this.notesData = data || {}; // Будем загружать данные чеклистов здесь
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element) {
        const treeItem = new vscode.TreeItem(element.label);
        
        if (element.contextValue === "checklistItem") {
            treeItem.command = {
                command: "protasker.toggleChecklistItem",
                title: "Toggle Checklist Item",
                arguments: [element] // Передаём элемент в команду
            };
        }

        console.log("📌 getTreeItem for", element.label, "contextValue:", element.contextValue);
        
        treeItem.contextValue = element.contextValue;
        treeItem.collapsibleState = element.collapsibleState;
        return treeItem;
    }

    getChildren(element) { 
        const editor = vscode.window.activeTextEditor;
        
        
        if (!editor) {
            console.log("❌ Нет активного редактора.");
            return [new NoteItem("📭 Нет активного файла", vscode.TreeItemCollapsibleState.None, { contextValue: "null" })];
        }
    
        console.log("📌 Все файлы в notesData.files:", Object.keys(this.notesData.files));
    
        const filePath = path.normalize(editor.document.uri.fsPath).replace(/\\/g, "/").toLowerCase();
        const normalizedPath = filePath.toLowerCase();

        const pathDir = filePath.slice(0, filePath.lastIndexOf('/'))
    
        //const fileData = this.notesData.files[matchedPath] || {};
        const fileData = this.notesData
        const { notes = [], comments = [], checklists = [], events = [] } = fileData;
        const data =  ["notes", "comments", "checklists", "events"];
    
        if (!element) {
            console.log("📌 Вызов getChildren с элементом: undefined");
            const rootItems = [];

            Object.keys(this.notesData.directories).map( dirpath => {
                console.log(dirpath,pathDir)
                if(dirpath == filePath || dirpath == pathDir){
                    rootItems.push(new NoteItem(`📁 ${path.basename(dirpath)}`, vscode.TreeItemCollapsibleState.Collapsed, { dirpath, contextValue: "directory" }));
                }
            })

            Object.keys(this.notesData.files).map( file => {
                if(file == filePath){
                    rootItems.push(new NoteItem(`📄 ${path.basename(file)}`, vscode.TreeItemCollapsibleState.Collapsed, { file, contextValue: "file" }));
                }
            })

            Object.keys(this.notesData.lines).map( line => {
                if(line == filePath) rootItems.push(new NoteItem(`📍 ${path.basename(line)}`, vscode.TreeItemCollapsibleState.Collapsed, { line, contextValue: "lines" }));
            })
    
            // if (notes.length) {
            //     rootItems.push(new NoteItem("📝 Заметки", vscode.TreeItemCollapsibleState.Collapsed, { contextValue: "notes" }));
            // }
            // if (comments.length) {
            //     rootItems.push(new NoteItem("💬 Комментарии", vscode.TreeItemCollapsibleState.Collapsed, { contextValue: "comments" }));
            // }
            // if (checklists.length) {
            //     rootItems.push(new NoteItem("📋 Чек-листы", vscode.TreeItemCollapsibleState.Collapsed, { contextValue: "checklists" }));
            // }
            // if (events.length) {
            //     rootItems.push(new NoteItem("📅 События", vscode.TreeItemCollapsibleState.Collapsed, { contextValue: "events" }));
            // }
            // if (events.length) {
            //     rootItems.push(new NoteItem("📌 Строки", vscode.TreeItemCollapsibleState.Collapsed, { contextValue: "lines" }));
            // }
    
            console.log("📌 Корневые элементы для файла:", rootItems.map(item => item.label));
    
            return rootItems.length ? rootItems : [new NoteItem("📭 Нет записей", vscode.TreeItemCollapsibleState.None, { contextValue: "checklists" })];
        }

        if(element.contextValue == "directory"){
            console.log("Derictory", element)
            const dirPath = this.notesData.directories[element.data.dirpath] || []

            return Object.entries(dirPath)
            .flatMap(([type, notes]) => 
               (Array.isArray(notes) ? notes : []).map(note => {
                    note.path = element.data.dirpath;
                    const totalItems = note.type == "checklist" ? note.content.items.length : null;
                    const completedItems = note.type == "checklist" ? note.content.items.filter(item => item.done).length : null;
                    const progress = note.type == "checklist" ? totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0 : null;
                    const color = note.type == "checklist" ? getProgressColor(progress) : null;
                    const label = note.type == "checklist"
                        ? `📋 ${note.content.name} (${totalItems}, ${color} ${progress}%)` || 'Checklist'
                        : `${note.type.toUpperCase()}: ${note.content}`

                    return new NoteItem(label,
                                note.type == 'checklist' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Collapsed,
                                {...note, prov: "directories", contextValue: "noteItem"}
                    )
            }))
        }

        if(element.contextValue == "file"){
            const filePath = this.notesData.files[element.data.file] || []

            return Object.entries(filePath)
            .flatMap(([type, notes]) => 
               (Array.isArray(notes) ? notes : []).map(note => {
                    note.path = element.data.file;
                    const totalItems = note.type == "checklist" ? note.content.items.length : null;
                    const completedItems = note.type == "checklist" ? note.content.items.filter(item => item.done).length : null;
                    const progress = note.type == "checklist" ? totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0 : null;
                    const color = note.type == "checklist" ? getProgressColor(progress) : null;
                    const label = note.type == "checklist"
                        ? `📋 ${note.content.name} (${totalItems}, ${color} ${progress}%)` || 'Checklist'
                        : `${note.type.toUpperCase()}: ${note.content}`

                    return new NoteItem(label,
                        note.type == 'checklist' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Collapsed,
                        {...note, prov: "files", contextValue: (note.type == 'checklist' ? "checklist" : "noteItem") }
                    )
            }))
        }

        if(element.contextValue == "lines"){
            
            const fileLine = this.notesData.lines[element.data.line] || [];
            return fileLine.map(note => {
                note.path = element.data.line;
                return new NoteItem(`📌 Line ${note.line}: ${note.content}`, vscode.TreeItemCollapsibleState.Collapsed, {...note, prov: "lines", contextValue: "noteItem"})
            })
        }
    
        if (element.contextValue === "checklists") {
            return checklists.map(checklist => {
                const totalItems = checklist.content.items.length;
                const completedItems = checklist.content.items.filter(item => item.done).length;
                const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
                const color = getProgressColor(progress);
    
                return new NoteItem(
                    `📋 ${checklist.content.name} (${totalItems}, ${color} ${progress}%)`,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    { ...checklist.content, contextValue: "checklist" }
                );
            });
        }

        if(element.contextValue == "checklist"){
            return (element.item || element.data.content?.items || []).map((item, index) =>
                new NoteItem(
                    item.done ? `✅ ${item.text}` : `⬜ ${item.text}`,
                    vscode.TreeItemCollapsibleState.None,
                    { ...item, checklistId: element.data.id, index, path: element.data.prov, contextValue: "checklistItem" }
                )
            )
        }

        if(element.contextValue == "noteItem" && element.contextValue != "checklistItem"){
            return [
                new NoteItem(`🆔 ID: ${element.data.id}`, vscode.TreeItemCollapsibleState.None),
                new NoteItem(`📁 Path: ${element.data.path ? element.data.path : "None"}`, vscode.TreeItemCollapsibleState.None),
                new NoteItem(`📌 Type: ${element.data.type}`, vscode.TreeItemCollapsibleState.None),
                new NoteItem(`📝 Content: ${element.data.content}`, vscode.TreeItemCollapsibleState.None),
                new NoteItem(`📅 Created: ${element.data.createdAt}`, vscode.TreeItemCollapsibleState.None),
                ...(element.data.line ? [new NoteItem(`📍 Line: ${element.data.line}`, vscode.TreeItemCollapsibleState.None)] : [])
            ];
        }
    
        console.log("⚠️ Неизвестный элемент, возвращаем пустой массив.", element);
        return [];
    }
    

    
    
}

function getProgressColor(percent) {
    if (percent <= 30) return "🔴"; // Красный
    if (percent <= 70) return "🟠"; // Оранжевый
    return "🟢"; // Зеленый
}

class NoteItem extends vscode.TreeItem {
    constructor(label, collapsibleState, data = {}) {
        super(label, collapsibleState);
        this.data = data;
        this.contextValue = data.contextValue || "note";
    }
}

module.exports = { NotesExplorerProvider };
