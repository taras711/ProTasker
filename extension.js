const vscode = require('vscode');
const {I18nManager} = require("./src/i18nManager");
const { Main } = require("./src/main");
const { NotesExplorer } = require('./src/dataManager');
const { NotesExplorerProvider } = require('./src/notesExplorerProvider');
const { setTimeagoLocale, formatTimeAgo } = require('./src/getTimeAgo');

const path = require("path")
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

    // setContext
    vscode.window.onDidChangeTextEditorSelection(async event => {
        await updateLineHasNoteState(event.textEditor); // update setContext
    });

    // Initialization highlight commented lines in editor
    if (vscode.window.activeTextEditor) {
        main.highlightCommentedLines(vscode.window.activeTextEditor, provider);
    }
    
    // Change active editor
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (!editor) {
            setTimeout(() => {
                const activeEditor = vscode.window.activeTextEditor; // active editor
                if (activeEditor) {
                    main.highlightCommentedLines(activeEditor, provider); // update highlight commented lines
                }
            }, 500); // wait 500ms
            return;
        }
    
        notesExplorerProvider.refresh(); // update notes explorer
        main.highlightCommentedLines(editor, provider); // update highlight commented lines
    });
    
    // configuration change handler
    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('protasker')) {

            setTimeagoLocale();

            i18n.loadTranslations().then(() => {
                vscode.window.showInformationMessage(i18n.translite("settings.languageChanged"));
            });

            provider.notesData.lang = vscode.workspace.getConfiguration('protasker').get('language');
            
            // refresh providers
            provider.refresh();
            main.updateNotifications();
        }
    });
    
    // update lineHasNote state
    vscode.window.onDidChangeVisibleTextEditors(async () => {
         if (vscode.window.activeTextEditor) {
            updateLineHasNoteState(vscode.window.activeTextEditor) // update setContext
        }
    });
    
    // update lineHasNote state
    vscode.workspace.onDidOpenTextDocument(doc => {
        const editor = vscode.window.activeTextEditor;

        // if the opened document is the same as the active editor 
        if (editor && editor.document.uri.fsPath === doc.uri.fsPath) {
            main.highlightCommentedLines(editor, provider);
        }
    });
    /**
     * Updates the lineHasNote state and sets the corresponding context variables. 
     * If the editor is not specified, it will use the active editor.
     * @param {import('vscode').TextEditor} editor - The text editor to get the line number from.
     * @return {Promise<void>}
     */
    async function updateLineHasNoteState(editor) {
        if (!editor) return;

            // Wait for the document to be fully loaded
            await lineHasNote(); // update lineHasNote state

            // update context menu items
            await vscode.commands.executeCommand('setContext', 'protasker.deleteNoteFromLine', main.lineHasNoteState.delete)
            await vscode.commands.executeCommand('setContext', 'protasker.openComment', main.lineHasNoteState.show)
            await vscode.commands.executeCommand('setContext', 'protasker.editNote', main.lineHasNoteState.edit)
            await vscode.commands.executeCommand('setContext', 'protasker.addNoteToLine', main.lineHasNoteState.add)
    }

/**
 * Checks if there are any notes on the current line in the active text editor.
 * Updates the lineHasNoteState with the presence of notes, affecting context menu items.
 * 
 * @return {Promise<boolean>} Returns true if notes are found on the current line, otherwise false.
 */
    async function lineHasNote() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return false;
    
        
        const lineNumber = editor.selection.active.line + 1; // Get the line number and file path
        const filePath = path.normalize(editor.document.uri.fsPath).replace(/\\/g, "/").toLowerCase(); // Get the file path
    
        const notesForFile = await provider.notesData.lines[filePath] || [];// Search for notes
        const notesOnLine = await notesForFile.filter(note => note.line === lineNumber);// Search for notes on the current line

        // update lineHasNote state 
        let newstate = await notesOnLine.length > 0 ? true : false;
        main.lineHasNoteState.edit = newstate;
        main.lineHasNoteState.delete = newstate;
        main.lineHasNoteState.show = newstate;
        main.lineHasNoteState.add = newstate ? false : true;
        return newstate;  // if notes are found on the current line
    }
}



function deactivate() {
    console.log('ProTasker extension deactivated');
}

module.exports = {
    activate,
    deactivate
};