const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const {NotesExplorer} = require("./dataManager")
class Manager{
    constructor(data,  viewId) {
        this.notesExplorer = new NotesExplorer()
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.viewId = viewId;
        this.dataNotes = path.join(__dirname, 'notesData.json');
        // Загружаем данные для каждого экземпляра отдельно
        this.notesData = data;
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
    
            return treeItem;
        }

    getChildren(element){
        return this.notesExplorer.mainData(element)
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

    // Метод для обновления данных
    refresh() {
        console.log("✅ DEBUG: TreeView обновляется...");
        this._onDidChangeTreeData.fire();
    }
}

module.exports = { Manager };