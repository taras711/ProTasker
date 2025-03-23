const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

const htmlMain = path.join(__dirname, './wvComponents', 'main.html');

// Create wevView
const wvManager = vscode.window.createWebviewPanel(
    'ProTasker',
    'ProTasker',
    vscode.ViewColumn.Two,
    {
        enableScripts: true,
        retainContextWhenHidden: true
    }
);

wvManager.webview.html = fs.readFileSync(htmlMain, 'utf-8');

wvManager.webview.onDidReceiveMessage((message) => {
    switch (message.command) {
        case 'openFile':
            vscode.commands.executeCommand('vscode.openWith', vscode.Uri.file(message.path));
            break;
        default:
            break;
    }
});

module.exports = {wvManager};