const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

class NotesExplorer {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        
        this.dataNotes = path.join(__dirname, 'notesData.json');
        this.notesData = this.loadNotes();
    }

    loadNotes() {
        try {
            if (fs.existsSync(this.dataNotes)) {
                const data = JSON.parse(fs.readFileSync(this.dataNotes).toString());
                console.log("✅ DEBUG: Загруженные notesData", JSON.stringify(data, null, 2));
                return data;
            }
        } catch (error) {
            console.error("❌ Ошибка при загрузке заметок:", error);
        }
        return { files: {}, directories: {} };
    }

    saveNotesToFile() {
        console.log("✅ DEBUG: Перед сохранением в JSON", JSON.stringify(this.notesData, null, 2));
        try {
            fs.writeFileSync(this.dataNotes, JSON.stringify(this.notesData, null, 2));
            this.refresh();
        } catch (error) {
            console.error("Ошибка при сохранении заметок:", error);
        }
    }

    getTreeItem(element) {
        console.log(element)
        const treeItem = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    
        //console.log("DEBUG getTreeItem - element:", element); // Отладка
    
        if (element.type === 'file' || element.type === 'directory') {
            if (element.createdAt) {
                const date = new Date(element.createdAt);
                treeItem.description = `📅 ${isNaN(date.getTime()) ? "Invalid Date" : date.toLocaleDateString()}`;
            } else {
                treeItem.description = "📅 No date";
            }

            //treeItem.id = element.id; // ✅ Теперь ID передаётся
    
            treeItem.contextValue = "noteItem";
        }

        console.log("DEBUG getTreeItem - treeItem:", treeItem);
    
        return treeItem;
    }

    getContent(element = {}){
      if(!element || element == {}) return {};

      if(element instanceof Object){
        if("notes" in element){
            if(element.notes instanceof Array && element.notes.length > 0){
                return element.notes;
            }
        }
        else if("lines" in element){
            if(element.lines instanceof Object && Object.keys(element.lines).length > 0){
                return Object.keys(element.lines).map(key => ({
                    line: key,
                    notes: element.lines[key]
                }));
            }
        }
        return {};
      }
    }

    async getChildren(element) {
        let _this = this;
        if (!element) {
            return [
                ...Object.keys(this.notesData.files).map(filePath => ({
                    label: path.basename(filePath),
                    type: 'file',
                    path: filePath,
                    createdAt: this.notesData.files[filePath]?.createdAt || new Date().toISOString(), // Добавляем дату
                })),
                ...Object.keys(this.notesData.directories).map(dirPath => ({
                    label: path.basename(dirPath),
                    type: 'directory',
                    path: dirPath,
                    
                    createdAt: this.notesData.directories[dirPath]?.createdAt || new Date().toISOString(), // Добавляем дату
                    id: this.notesData.files[dirPath]?.notes.id || null
                }))
            ];
        } else if (element.type === 'file') {
            let notes = this.notesData.files[element.path]?.notes || [];
            let lines = this.notesData.files[element.path]?.lines || {};
    
            return [
                ...notes.map(note => ({
                    label: `📝 ${note.content}`,
                    type: 'note',
                    createdAt: note.createdAt || new Date().toISOString(), // Добавляем дату
                    parent: element.path
                })),
                ...Object.keys(lines).map(lineNumber => ({
                    label: `📌 Line ${lineNumber}`,
                    type: 'line',
                    createdAt: new Date().toISOString(), // Дата для строк
                    line: parseInt(lineNumber),
                    parent: element.path
                }))
            ];
        }
    }
    
    

    refresh() {
        console.log("✅ DEBUG: TreeView обновляется...");
        this._onDidChangeTreeData.fire();
    }

    async addNoteToFile(filePath, content) {
        if (!this.notesData.files[filePath]) {
            this.notesData.files[filePath] = { notes: [], lines: {} };
        }
    
        this.notesData.files[filePath].notes.push({
            id: Date.now(),
            type: 'note',
            content,
            createdAt: new Date().toISOString() // Дата создаётся правильно!
        });
    
        await this.saveNotesToFile();
    }

    addNoteToLine(filePath, lineNumber, content) {
        if (!this.notesData.files[filePath]) {
            this.notesData.files[filePath] = { notes: [], lines: {} };
        }
        if (!this.notesData.files[filePath].lines[lineNumber]) {
            this.notesData.files[filePath].lines[lineNumber] = [];
        }
        this.notesData.files[filePath].lines[lineNumber].push({ id: Date.now(), type: 'comment', content, createdAt: new Date().toISOString() });
        this.saveNotesToFile();
    }

    addNoteToDirectory(directoryPath, content) {
        if (!this.notesData.directories[directoryPath]) {
            this.notesData.directories[directoryPath] = { notes: [] };
        }
        this.notesData.directories[directoryPath].notes.push({ id: Date.now(), type: 'note', content, createdAt: new Date().toISOString() });
        this.saveNotesToFile();
    }

    addContextMenuCommands(context) {
        context.subscriptions.push(vscode.commands.registerCommand('notesExplorer.addNoteToFile', (uri) => {
            vscode.window.showInputBox({ prompt: 'Введите заметку' }).then(content => {
                if (content) {
                    this.addNoteToFile(uri.fsPath, content);
                }
            });
        }));

        context.subscriptions.push(vscode.commands.registerCommand('notesExplorer.addNoteToDirectory', (uri) => {
            vscode.window.showInputBox({ prompt: 'Введите заметку для папки' }).then(content => {
                if (content) {
                    this.addNoteToDirectory(uri.fsPath, content);
                }
            });
        }));

        context.subscriptions.push(vscode.commands.registerTextEditorCommand('notesExplorer.addNoteToLine', (editor) => {
            const { document, selection } = editor;
            const filePath = document.uri.fsPath;
            const lineNumber = selection.start.line;
            vscode.window.showInputBox({ prompt: 'Введите комментарий к строке' }).then(content => {
                if (content) {
                    this.addNoteToLine(filePath, lineNumber, content);
                }
            });
        }));
    }
}

module.exports = { NotesExplorer };
