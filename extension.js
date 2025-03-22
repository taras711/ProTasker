const vscode = require('vscode');
const {I18nManager} = require("./src/i18nManager");
const { Main } = require("./src/main");
const { NotesExplorer } = require('./src/dataManager');
const { NotesExplorerProvider } = require('./src/notesExplorerProvider');
const { setTimeagoLocale, formatTimeAgo } = require('./src/getTimeAgo');

const i18n = new I18nManager();

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
    main.init()

    // setContext
   

    // Initialization highlight commented lines in editor
    
    
    // Change active editor
    
    
    // configuration change handler
   
    
    // update lineHasNote state
    
    
    // update lineHasNote state
    
}



function deactivate() {
    console.log('ProTasker extension deactivated');
}

module.exports = {
    activate,
    deactivate
};