const vscode = require('vscode');
const { loadNotes, saveNotes } = require('../src/dataManager");

class NotesTreeProvider {

    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }

    refresh() {
        this._onDidChangeTreeData.fire();
    }

}

module.exports = { NotesTreeProvider };