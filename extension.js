const vscode = require('vscode');
const { Main } = require("./src/main");
const { NotesExplorer } = require('./src/dataManager');
const { NotesExplorerProvider } = require('./src/notesExplorerProvider');
const {wvManager} = require('./src/wvDataManager');

function activate(context) {
    // initialize classes
    const main = new Main(context);
    const provider = new NotesExplorer(context);
    const notesExplorerProvider = new NotesExplorerProvider(provider.notesData, context);
    const treeView = vscode.window.registerTreeDataProvider('sidebar_protasker_id1', provider); // Register the tree data provider
    const notesExplorerView = vscode.window.registerTreeDataProvider('notesExplorer', notesExplorerProvider); // Register the tree data provider
    
    main.register(notesExplorerView); // Register the tree data provider
    main.register(treeView); // Register the tree view
    main.provider = provider;
    main.notesExplorerProvider = notesExplorerProvider;
    main.init();
   
    
}



function deactivate() {
    console.log('ProTasker extension deactivated');
}

module.exports = {
    activate,
    deactivate
};