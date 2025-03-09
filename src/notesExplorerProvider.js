const vscode = require('vscode');
const path = require('path');
const {Manager} = require("./manager")

class NotesExplorerProvider extends Manager{
    constructor(data, context) {
        super();
        this.notesData = data || {}; // Будем загружать данные чеклистов здесь
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.context = context;
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

        element.context?.icon ? treeItem.iconPath = treeItem.iconPath = element.iconPath || new vscode.ThemeIcon(element.context.icon): "undefined";
        
        return treeItem;
    }

    async getChildren(element) {
        const editor = vscode.window.activeTextEditor;
        if(!editor){
            return [new this.noteItem("... No active editor", vscode.TreeItemCollapsibleState.None)];
        }
        return await this.mainData(element)
    }
    

    
    
}

module.exports = { NotesExplorerProvider };
