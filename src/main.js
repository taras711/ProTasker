
const vscode = require('vscode');
const {commandHelper} = require('./CommandHelper');
const path = require("path");
const fs = require("fs");
const { setTimeagoLocale, formatTimeAgo } = require('./getTimeAgo');
const {I18nManager} = require("./i18nManager");

/**
 * Main class constructor.
 * @param {vscode.ExtensionContext} context The extension context.
 * @description This constructor is used to initialize the extension.
 * It sets up the extension context, registers commands, and initializes the notes explorer.
 * It also sets up the notification interval and loads the notes data.
 * @since 1.0.0
 * @version 1.0.0
 * @returns 
 * @author taras711
 */

const notifiedDeadlines = new Set();

class Main extends commandHelper {
    
    constructor(context) {
        super(context);
        this.notifyInterval = null;
        
        this.context = context;
        this.i18n = new I18nManager();
        this.provider = null;
        this.notesExplorerProvider = null;
        
        this.lineHasNoteState = {edit:false, show: false, delete: false, add: true}; // object to store lineHasNote state
        
        this.commandsRegister();
        this.updateNotifications()
        this.listeners();
        
        setTimeagoLocale();
    }

    /**
     * Registers commands for the extension.
     * 
     * This method registers commands with the VS Code extension context. These commands include
     * commands for opening settings, adding, editing, deleting notes and checklist items, as well as
     * searching, filtering, and navigating notes and files within the user's workspace.
     * @private
     */
    commandsRegister(){
        this.comands([
            'openSettings', // open settings
            'addNote', // add note
            'addChecklistItem', // add checklist item
            'toggleChecklistItem', // toggle checklist item
            'removeChecklistItem', // remove checklist item
            'deleteNote', // delete note
            'openComment', // open comment
            'addNoteToLine', // add note to line
            'editNote', // edit note
            'deleteNoteFromList', // delete note from list
            'deleteNoteFromLine', // delete note from line
            'editNoteFromList', // edit note from list
            'searchNotes', // search notes
            'resetSearch', // reset search
            'filterNotes', // filter notes
            'goToNote', // go to note
            'goToFile', // go to file
            'deleteAll', // delete all notes,
            'openedNote', // open note
            'updateContext', // update context
            "noteAction", // note action
            "reloadList", // reload list
            "clearList", // clear list
        ]);
    }


    /**
     * Initializes command callbacks and sets language translations for the extension.
     * 
     * This method sets up a variety of commands related to note management, such as adding, editing,
     * deleting notes, checklist items, and handling search and navigation functionalities within the
     * extension. It leverages Visual Studio Code's API to interact with the editor and the file system,
     * allowing for note management directly within the user's workspace.
     */
    init(){
        const i18n = this.i18n;

        this.set('openSettings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'protasker'); // open settings
        });

        // set commands callback for add note
        this.set('addNote', async () => {
            const editor = vscode.window.activeTextEditor;
            const settings = this.getProTaskerSettings();
            let deadline = null; // deadline for note
    
            // 1️⃣ Choose entry type
            const entryType = await vscode.window.showQuickPick(['Note', 'Comment', 'Checklist', 'Event', ...settings.customTypes], {
                placeHolder: i18n.translite('user_strings.choose_entry_type')
            });
        
            if (!entryType) return;
        
            // 2️⃣ Choose selection file or directory
            const selection = await vscode.window.showQuickPick(['File', 'Directory'], {
                placeHolder: i18n.translite('user_strings.choose_entry_selection')
            });
        
            if (!selection) return;
            
            // 3️⃣ Choose deadline if checklist or event
            if (entryType === 'Checklist' || entryType === 'Event') {
                const wantsDeadline = await vscode.window.showQuickPick([i18n.translite('user_strings.yes'), i18n.translite('user_strings.no')], {
                    placeHolder: i18n.translite('user_strings.add_deadline')
                });
    
                // 3️⃣ Choose deadline
                if (wantsDeadline === i18n.translite('user_strings.yes')) {
                    deadline = await vscode.window.showInputBox({ placeHolder: i18n.translite('user_strings.deadline') });
                    if (deadline) {
                        const parsedDate = new Date(deadline);
                        // Check if the parsed date is valid
                        if (isNaN(parsedDate.getTime())) {
                            vscode.window.showErrorMessage(i18n.translite('user_strings.invalid_date_format'));
                            return;
                        }
                        deadline = parsedDate.toISOString(); // Convert to ISO string
                    }
                }
            }
    
            // 3️⃣ Get file path
            let filePath = await this.getTargetPath(selection);
            if (!filePath){  
                vscode.window.showErrorMessage(i18n.translite('user_strings.no_active_editor')); //if there is no active editor show error message 
                return
            };
        
            // 4️⃣ if type is checklist get checklist items
            if (entryType === 'Checklist') {
                let checklistItems = []; // checklist items
                let addMore = true; // flag for adding more items
    
                const name = await vscode.window.showInputBox({placeHolder: `${i18n.translite('user_strings.checklist')} ${i18n.translite('user_strings.name')}`}); // get checklist name
    
                if (!name) return;
        
                // 4️⃣ Add checklist items
                while (addMore) {
                    const item = await vscode.window.showInputBox({ placeHolder: i18n.translite('user_strings.enter_checklist_item') });
                    if (!item) break;
                    checklistItems.push({ text: item, done: false });
        
                    addMore = await vscode.window.showQuickPick([i18n.translite('user_strings.add_more_item'), i18n.translite('user_strings.done')], { placeHolder: i18n.translite('user_strings.add_more') }) === i18n.translite('user_strings.add_more');
                }
        
                if (checklistItems.length === 0) return;
        
                // 4️⃣ Generate checklist entry
                const checklistEntry = {
                    id: Date.now(), // generate unique id
                    name: name,
                    type: 'checklist',
                    items: checklistItems,
                    createdAt: new Date().toISOString(),
                    deadline: deadline
                };
        
                // 4️⃣ Add entry
                await this.provider.addEntry(filePath, selection === 'Directory', 'checklist', checklistEntry);
            } else {
                // 4️⃣ Get note content
                const noteContent = await vscode.window.showInputBox({ placeHolder: i18n.translite('user_strings.enter_note_content') });
                if (!noteContent) return;
        
                if (selection === 'File') {
                    await this.provider.addEntry(filePath, false, entryType.toLowerCase(), noteContent, Boolean(deadline));
                } else if (selection === 'Directory') {
                    await this.provider.addEntry(filePath, true, entryType.toLowerCase(), noteContent, Boolean(deadline));
                } else if (selection === 'Line') {
                    const lineNumber = editor ? editor.selection.active.line + 1 : 0;
                    await this.provider.addNoteToLine(filePath, lineNumber, entryType.toLowerCase(), noteContent);
                }
            }
    
            // 5️⃣ Refresh UI
            this.provider.refresh();
            this.notesExplorerProvider.refresh();
            this.highlightCommentedLines(editor);
        });

        // set commands callback for add checklist items
        this.set('addChecklistItem', async (treeItem) => {
            if (!treeItem || treeItem.context.type !== "checklist") return; // check if treeItem is checklist
        
            const newItemText = await vscode.window.showInputBox({ placeHolder: i18n.translite('user_strings.enter_item_text') });
            if (!newItemText) return;
                
            // Add new item to the checklist
            treeItem.context.content.items.push({ text: newItemText, done: false });
                
            try {
                // Save changes to the JSON file
                await this.provider.saveNotesToFile();
        
                // Refresh UI
                this.provider.refresh();
                this.notesExplorerProvider.refresh();
                vscode.window.showInformationMessage(i18n.translite('user_strings.checklist_item_added').replace('%%newItemText%%', newItemText));
                
            } catch (error) {
                vscode.window.showErrorMessage(`${i18n.translite('user_strings.error_saving_changes')} ${error.message}`);
            }
        });

        // set commands callback for toggle checklist items
        this.set('toggleChecklistItem', async (treeItem) => {
            treeItem.data = treeItem?.data ? treeItem.data : treeItem.context; // check if treeItem is checklist
            if (!treeItem || typeof treeItem.data.done === "undefined") {
                return;
            }
            // Get the filePath via findChecklistFilePath
            const filePath = this.findChecklistFilePath(treeItem.data.checklistId, treeItem.data.path);
            if (!filePath) {
                return;
            }
            
            // Check if the file exists
            const fileNotes = this.provider.notesData[treeItem.data.path][filePath];
            if (!fileNotes) {
                return;
            }
            
            // Check if `checklists` is an array
            if (!Array.isArray(fileNotes.checklists)) {
                return;
            }
            
            // Search for the checklist by ID
            const checklistIndex = fileNotes.checklists.findIndex(cl => cl.id === treeItem.data.checklistId);
            if (checklistIndex === -1) {
                return;
            }
            
            // Check if `items` is an array
            if (!Array.isArray(fileNotes.checklists[checklistIndex].content.items)) {
                return;
            }
            
            // Search for the item by text
            const checklistItemIndex = fileNotes.checklists[checklistIndex].content.items.findIndex(item => item.text === treeItem.data.text);
            if (checklistItemIndex === -1) {
                return;
            }
            
            // Toggle the done status
            fileNotes.checklists[checklistIndex].content.items[checklistItemIndex].done = !fileNotes.checklists[checklistIndex].content.items[checklistItemIndex].done;
        
            // Save the changes to provider.notesData
            this.provider.notesData[treeItem.data.path][filePath] = { ...fileNotes };
        
        
                // Save changes to the JSON file
                this.provider.saveNotesToFile();
            
                // Refresh UI
                this.provider.refresh();
                this.notesExplorerProvider.refresh();
        
                // Show success message with the new done status
                vscode.window.showInformationMessage(`🔄 ${i18n.translite('user_strings.item')} "${treeItem.data.text}" ${i18n.translite('user_strings.now')} ${treeItem.data.done ? i18n.translite('user_strings.not_fulfilled') : i18n.translite('user_strings.fulfilled')}`);
        });

        // set commands callback for remove checklist items
        this.set('removeChecklistItem', async (item) => {
                
            if (!item || !item.context.checklistId || item.context.index === undefined) {
            vscode.window.showErrorMessage(`${i18n.translite('user_strings.item_unable_to_delete')}: ${i18n.translite('user_strings.no_data')}`);
            return;
            }

            const confirm = await vscode.window.showWarningMessage(`${i18n.translite('user_strings.delete_the_item')}: ${item.context.text}?`, i18n.translite('user_strings.yes'), i18n.translite('user_strings.no'));
            if (confirm !== i18n.translite('user_strings.yes')) return;

            // Get the filePath via findChecklistFilePath
            const filePath = this.findChecklistFilePath(item.context.checklistId, item.context.path);
            if (!filePath) {
            vscode.window.showErrorMessage(`${i18n.translite('user_strings.file')} ${i18n.translite('user_strings.not_found')}`);
            return;
            }

            // Uploading the checklist data
            const checklist = this.provider.notesData[item.context.path][filePath].checklists.find(cl => cl.id === item.context.checklistId);
            if (!checklist) {
            vscode.window.showErrorMessage(`${i18n.translite('user_strings.checklist')} ${i18n.translite('user_strings.not_found')}`);
            return;
            }
            // Delete the item from the checklist
            checklist.content.items.splice(item.context.index, 1);

            // Save changes to the JSON file
            await this.provider.saveNotesToFile();

            // Refresh UI
            this.provider.refresh();
            this.notesExplorerProvider.refresh();

            vscode.window.showInformationMessage(`${i18n.translite('user_strings.deleted')} ${i18n.translite('user_strings.successfully')}.`); // Show success message
        });

        // set commands callback for delete note
        this.set('deleteNote', async (treeItem) => {
            const editor = vscode.window.activeTextEditor;
            const filePath = treeItem.parent || treeItem.path; // Get the filePath via findChecklistFilePath
            console.log(treeItem);
            if (!filePath) {
                return;
            }
    
            const confirm = await vscode.window.showWarningMessage(i18n.translite('user_strings.delete_this_note'), i18n.translite('user_strings.yes'), i18n.translite('user_strings.no'));
            if (confirm !== i18n.translite('user_strings.yes')) return;
    
            const isDirectory = this.provider.notesData.directories[filePath] !== undefined; // Check if it's a directory or a file
            const target = isDirectory ? this.provider.notesData.directories[filePath] : this.provider.notesData.files[filePath]; // Get the target object
            
            if (!target || !target.notes) {
                return;
            }
    
            const noteIndex = target.notes.findIndex(n => n.content.trim() === treeItem.label.trim()); // Find the index of the note
            // Check if the note was found
            if (noteIndex === -1) {
                return;
            }
    
            target.notes.splice(noteIndex, 1); // Delete the note
            await this.provider.saveNotesToFile(); // Save changes to the JSON file
            
            // Refresh UI
            this.highlightCommentedLines(editor);
            this.provider.refresh();
            this.notesExplorerProvider.refresh();
        });

        // set commands callback for open comment
        this.set('openComment', () => {
            const editor = vscode.window.activeTextEditor;
    
            if (!editor) {
                vscode.window.showErrorMessage(i18n.translite('user_strings.no_active_editor'));
                return;
            }
    
            let filePath = path.normalize(editor.document.uri.fsPath).replace(/\\/g, "/").toLowerCase(); // Get the file path and normalize it to Unix-style
            const line = editor.selection.active.line +1; // Get the line number of the cursor
    
            // Check if the file exists
            if (!this.provider.notesData.lines[filePath]) {
                vscode.window.showErrorMessage(`${i18n.translite('user_strings.file')} ${i18n.translite('user_strings.not_found')}`);
                return;
            }
    
            // 🛠 Receiving all comments
            const allNotes = this.provider.notesData.lines[filePath] || [];
    
            // 🛠 Filter only those that match the current row
            const lineNotes = allNotes.filter(note => {
                return note.line === line && typeof note.content === "string" && note.content.trim().length > 0;
            });
    
            // Check if there are any notes
            if (lineNotes.length === 0) {
                vscode.window.showInformationMessage(`📭 ${ i18n.translite('user_strings.no_comments_for_this_line')}.`);
                return;
            }
    
            // Combining all comments into one text
            const fullText = lineNotes.map((note) => `${i18n.translite('user_strings.type')}: ${note.type}* \r\n ${i18n.translite('user_strings.content')}: ${note.content}. \r\n ${i18n.translite('user_strings.created_at')}: ${new Date(note.createdAt).toLocaleString()}`).join("\n\n");
    
            vscode.window.showInformationMessage(`📝 ${i18n.translite('user_strings.comments_for_line')} ${line}:\n\n${fullText}`, {modal: true});
        });

        // set commands callback for addNoteToLine
        this.set('addNoteToLine', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
        
            // Get the note content from the user
            const noteContent = await vscode.window.showInputBox({
                placeHolder: i18n.translite('user_strings.enter_note_content'),
            });
        
            if (noteContent) {
                const lineNumber = editor.selection.active.line + 1;  // The line on which the note is inserted
                const filePath = editor.document.uri.fsPath;  // The file path
        
                // Add the note to the line
                this.provider.addNoteToLine(filePath, lineNumber, "line", noteContent); // 📝 add note to line
                this.highlightCommentedLines(editor); // Update highlight commented lines
                this.notesExplorerProvider.refresh();
            }
        });

        // set commands callback for editNote
        this.set('editNote', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
        
            const lineNumber = editor.selection.active.line + 1;  // Get the line number
            const filePath = path.normalize(editor.document.uri.fsPath).replace(/\\/g, "/").toLowerCase(); // Get the file path
        
            // Check if there are notes on the current line
            if (!this.lineHasNote()) {
                vscode.window.showInformationMessage(i18n.translite('user_strings.no_notes_on_this_line'));
                return;
            }
        
            const notesForFile = this.provider.notesData.lines[filePath] || []; // Search for notes
            const notesOnLine = notesForFile.filter(note => note.line === lineNumber); // Search for notes on the current line
        
            // Check if there are notes on the current line
            if (notesOnLine.length === 0) {
                vscode.window.showInformationMessage(i18n.translite('user_strings.no_notes_on_this_line'));
                return;
            }
        
            const noteToEdit = notesOnLine[0]; // Get the first note on the current line
            const editedContent = await vscode.window.showInputBox({
                value: noteToEdit.content,
                placeHolder: i18n.translite('user_strings.edit_note_content'),
            });
        
            // Check if the note content was edited
            if (editedContent) {
                noteToEdit.content = editedContent;
                await this.provider.saveNotesToFile(); // Save changes to the JSON file
        
                // Refresh UI
                this.provider.refresh();
                this.notesExplorerProvider.refresh()
                vscode.window.showInformationMessage(`${i18n.translite('user_strings.note_content_has_been_edited')} ${i18n.translite('user_strings.successfully')}.`);
            }
            this.highlightCommentedLines(editor); // Update highlight commented lines
        });

        this.set('deleteNoteFromLine', async () => { 
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
        
            const lineNumber = editor.selection.active.line + 1;  // Get the line number
            const filePath = path.normalize(editor.document.uri.fsPath).replace(/\\/g, "/").toLowerCase(); // Get the file path
        
            
            // Check if there are notes on the current line
            if (!this.lineHasNote()) {
                vscode.window.showInformationMessage(i18n.translite('user_strings.no_notes_on_this_line'));
                return;
            }
        
            const notesForFile = this.provider.notesData.lines[filePath] || []; // Search for notes
            const notesOnLine = notesForFile.filter(note => note.line === lineNumber); // Search for notes on the current line
        
            // Check if there are notes on the current line
            if (notesOnLine.length === 0) {
                vscode.window.showInformationMessage(i18n.translite('user_strings.no_notes_on_this_line'));
                return;
            }

            const confirm = await vscode.window.showInformationMessage(`${i18n.translite('user_strings.delete_this_note')} ${notesOnLine[0].content}`, i18n.translite('user_strings.yes'), i18n.translite('user_strings.no'));
        
            const noteToDelete = notesOnLine[0]; // Get the first note on the current line  
        
            // dElete the note
            if (confirm === i18n.translite('user_strings.yes')) {
                // update notesData 
                this.provider.notesData.lines[filePath] = this.provider.notesData.lines[filePath].filter(note => note.id !== noteToDelete.id);
                // save notesData
                await this.provider.saveNotesToFile();
                this.provider.refresh(); // Refresh UI
                this.notesExplorerProvider.refresh();
                this.highlightCommentedLines(editor);
                vscode.window.showInformationMessage(`${i18n.translite('user_strings.note_has_been_deleted')} ${i18n.translite('user_strings.successfully')}.`);
            }
            
            })

        // set commands callback for deleteNote
        this.set('deleteNoteFromList', async (treeItem) => {
            treeItem.data = treeItem?.data ? treeItem.data : treeItem.context; // Get the note data
            const settings = this.getProTaskerSettings(); // Get settings from the extension
            console.log(treeItem)
            // Check if the note data exists
            if (!treeItem || !treeItem.data || !treeItem.data.id) {
                vscode.window.showErrorMessage(`${i18n.translite('user_strings.error')}: ${i18n.translite('user_strings.note_data')} ${i18n.translite('user_strings.not_found')}.`);
                return;
            }
        
            // Confirm deletion
            const confirm = await vscode.window.showWarningMessage(`${i18n.translite('user_strings.delete_the_item')} ${treeItem.data.content}?`, i18n.translite('user_strings.yes'), i18n.translite('user_strings.no'));
            if (confirm !== i18n.translite('user_strings.yes')) return;
        
            const customTypes = settings.customTypes.map(item => (item + "s").toLowerCase()); // Get custom note types
        
            const { id, type, prov, path } = treeItem.data; // Get note data from the tree item
            let targetCollection = null;
            let targetKey = null;
            let stillExists = true;
            
            // check if path exists and set targetCollection and targetKey
            if (path || treeItem.context.path || treeItem.context.dirpath || treeItem.context.filepath) {
                targetCollection = this.provider.notesData[prov];
                targetKey = path || treeItem.context.path || treeItem.context.dirpath || treeItem.context.filepath;
            }
            if (!targetCollection || !targetKey || !targetCollection[targetKey]) {
                vscode.window.showErrorMessage(`${i18n.translite('user_strings.error')}: ${i18n.translite('user_strings.target_collection_or_key')} ${i18n.translite('user_strings.not_found')}.`);
                return;
            }
        
            
            let categories = ["comments", "checklists", "events", "notes", ...customTypes]; // Get note categories and custom note types
    
            if(type == "line"){
                if (targetCollection[targetKey].length){
                    targetCollection[targetKey] = targetCollection[targetKey].filter(note => note.id !== id)
                }
    
                stillExists = targetCollection[targetKey] && targetCollection[targetKey].length > 0
            }else{
                categories.forEach(category => {
                    if (targetCollection[targetKey][category]) {
                        targetCollection[targetKey][category] = targetCollection[targetKey][category].filter(note => note.id !== id);
                    }
                });
    
                // Check if any category still has notes
                stillExists = categories.some(category =>
                    targetCollection[targetKey][category] && targetCollection[targetKey][category].length > 0
                );
            }
        
            // Delete the note from the collection
            if (!stillExists) delete targetCollection[targetKey];
        
            this.provider.saveNotesToFile(); // Save changes to the JSON file
    
            // Refresh UI
            this.provider.refresh();
            this.notesExplorerProvider.refresh();
            this.highlightCommentedLines(vscode.window.activeTextEditor); //Update highlight commented lines
    
            vscode.window.showInformationMessage(`${i18n.translite('user_strings.note_has_been_deleted')} ${i18n.translite('user_strings.successfully')}.`);
        });

        // set commands callback for editNote
        this.set('editNoteFromList', async (treeItem) => {
            treeItem.data = treeItem?.data ? treeItem.data : treeItem.context;
            const settings = this.getProTaskerSettings(); // Get settings from the extension
    
            // Check if the note data exists
            if (!treeItem || !treeItem.data || !treeItem.data.id) {
                vscode.window.showErrorMessage(`${i18n.translite('user_strings.error')}: ${i18n.translite('user_strings.note_data')} ${i18n.translite('user_strings.not_found')}.`);
                return;
            }
            const { id, prov, path } = treeItem.data; // Get note data from the tree item
            let targetCollection = null;
            let targetKey = null;
            let targetEntry = null;
    
            const customTypes = settings.customTypes.map(item => (item + "s").toLowerCase()); // Get custom note types and convert to lowercase
        
            // check if path exists and set targetCollection and targetKey
            if (path || treeItem.context.path || treeItem.context.dirpath || treeItem.context.filepath) {
                targetCollection = this.provider.notesData[prov];
                targetKey = path || treeItem.context.path || treeItem.context.dirpath || treeItem.context.filepath;
            }
            if (!targetCollection || !targetKey || !targetCollection[targetKey]) {
                vscode.window.showErrorMessage(`${i18n.translite('user_strings.error')}: ${i18n.translite('user_strings.target_collection_or_key')} ${i18n.translite('user_strings.not_found')}.`);
                return;
            }
    
            // Search for the note in the collection
            if (prov == "lines") {
                // If prov is "lines", it's a line note and we can directly access the note
                targetEntry = targetCollection[targetKey].find(note => note.id === id);
            } else {
                // if files and directories then we need to find the note in the correct category
                const categories = ["notes", "comments", "checklists", "events", ...customTypes];
                for (const category of categories) {
                    if (Array.isArray(targetCollection[targetKey][category])) {
                        targetEntry = targetCollection[targetKey][category].find(note => note.id === id);
                        if (targetEntry) break;
                    }
                }
            }
        
            // Check if the note was found
            if (!targetEntry) {
                vscode.window.showErrorMessage(`${i18n.translite('user_strings.error')}: ${i18n.translite('user_strings.note')} ${i18n.translite('user_strings.not_found')}.`);
                return;
            }
        
            // Show input box for new text
            const newText = await vscode.window.showInputBox({
                placeHolder: i18n.translite('user_strings.enter_new_text_for_the_note'),
                value: targetEntry.content
            });
        
            // Check if the new text is valid
            if (!newText || newText.trim() === "") {
                vscode.window.showErrorMessage(`${i18n.translite('user_strings.new_text')} ${i18n.translite('user_strings.cannot_be_empty')}.`);
                return;
            }
        
            // Update the note
            targetEntry.content = newText;
        
            // Show success message
            vscode.window.showInformationMessage(i18n.translite('user_strings.note_has_been_updated'));
        
            // Save changes
            this.provider.saveNotesToFile();
        
            // Refresh UI
            this.provider.refresh();
            this.notesExplorerProvider.refresh();
            this.highlightCommentedLines(vscode.window.activeTextEditor); //Update highlight commented lines
        });

        // set commands callback for search
        this.set('searchNotes', async () => {
            const query = await vscode.window.showInputBox({
                placeHolder: `🔍 ${i18n.translite('user_strings.enter_search_query')}`,
                prompt: i18n.translite('user_strings.enter_search_query')
            });
        
            if (!query || query.trim() === "") {
                vscode.window.showErrorMessage(`${i18n.translite('user_strings.search_query')} ${i18n.translite('user_strings.cannot_be_empty')}.`);
                return;
            }
            // search notes
            this.provider.searchNotes(query);
            this.provider.filteredNotes = null;
    
            // refresh UI
            this.provider.refresh();
        });

        // set commands callback for resetSearch
        this.set('resetSearch', async () => {
            // reset search
            this.provider.search = false;
            this.provider.filteredNotes = null; // Clear filtered notes
            this.provider.searchResults = null; // Clear search results
            this.provider.refresh();  // Refresh UI
        });

        // set commands callback for filterNotes
        this.set('filterNotes', async () => {
            const settings = this.getProTaskerSettings(); // Get settings from the extension
            const customTypes = []; // Array to store custom note types
    
            // Add custom note types to the array
            settings.customTypes.map(note => {
                customTypes.push({label: note, description: `${i18n.translite('user_strings.filter')} ${i18n.translite('user_strings.by')} ${note} ${i18n.translite('user_strings.only')}`});
            })
            
            // Choosing a Filter Type
            const filterType = await vscode.window.showQuickPick(
                [
                    { label: 'All', description: `${i18n.translite('user_strings.show_all_types')} - notes, comments, checklists, events, ...` },
                    { label: 'Notes', description: `${i18n.translite('user_strings.filter')} ${i18n.translite('user_strings.by')} ${i18n.translite('user_strings.notes')} ${i18n.translite('user_strings.only')}` },
                    { label: 'Comments', description: `${i18n.translite('user_strings.filter')} ${i18n.translite('user_strings.by')} ${i18n.translite('user_strings.comments')} ${i18n.translite('user_strings.only')}` },
                    { label: 'Checklists', description: `${i18n.translite('user_strings.filter')} ${i18n.translite('user_strings.by')} ${i18n.translite('user_strings.checklists')} ${i18n.translite('user_strings.only')}` },
                    { label: 'Events', description: `${i18n.translite('user_strings.filter')} ${i18n.translite('user_strings.by')} ${i18n.translite('user_strings.events')} ${i18n.translite('user_strings.only')}` },
                    { label: 'Line', description: `${i18n.translite('user_strings.filter')} ${i18n.translite('user_strings.by')} ${i18n.translite('user_strings.lines')} ${i18n.translite('user_strings.only')}` },
                    ...customTypes
                ],
                { placeHolder: i18n.translite('user_strings.select_a_type_to_filter') }
            );
        
            if (!filterType) return;  // if user cancels, do nothing
        
            // Choosing a Filter Category
            const filterCategory = await vscode.window.showQuickPick(
                [
                    { label: 'All', description: `${i18n.translite('user_strings.show_from_all_categories')} (${i18n.translite('user_strings.files')}, ${i18n.translite('user_strings.directories')}, ${i18n.translite('user_strings.lines')})` },
                    { label: 'Files', description: `${i18n.translite('user_strings.filter')} ${i18n.translite('user_strings.by')} ${i18n.translite('user_strings.files')}` },
                    { label: 'Directories', description: `${i18n.translite('user_strings.filter')} ${i18n.translite('user_strings.by')} ${i18n.translite('user_strings.directories')}` },
                    { label: 'Lines', description: `${i18n.translite('user_strings.filter')} ${i18n.translite('user_strings.by')} ${i18n.translite('user_strings.lines')}` },
                ],
                { placeHolder: `${i18n.translite('user_strings.select_a_category_to')} ${i18n.translite('user_strings.filter')} ${i18n.translite('user_strings.by')}` }
            );
        
            if (!filterCategory) return;  // if user cancels, do nothing
        
            // Convert the selected type and category to lowercase
            const queryType = filterType.label.toLowerCase();
            const queryCategory = filterCategory.label.toLowerCase();
        
            // Filter notes based on the selected type and category
            this.provider.filterNotes(queryType, queryCategory);
            const filteredResults = await this.provider.filteredNotes
        
            // Show a message if no results were found
            if (filteredResults.length === 0) {
                vscode.window.showInformationMessage(i18n.translite('user_strings.no_results_found'));
            }
        
            // Clear search results
            this.provider.searchResults = null;
    
            // Refresh UI
            this.provider.refresh();
        });

        // set commands callback for goToNote
        this.set('goToNote', async (note) => {
            // Check if the note is valid
            if (!note || !note.context.path || typeof note.context.line !== "number") {
                vscode.window.showErrorMessage(`${i18n.translite('user_strings.error')}: ${i18n.translite('user_strings.invalid_note')}.`);
                return;
            }
        
            const fileUri = vscode.Uri.file(note.context.path); // Get the file URI

            if (!fileUri) {
                vscode.window.showErrorMessage(`${i18n.translite('user_strings.error')}: ${i18n.translite('user_strings.file')} ${i18n.translite('user_strings.not_found')}.`);
                return;
            }
        
            try {
                // Check if the file exists
                const fileStat = await vscode.workspace.fs.stat(fileUri);
                
                // If file exists, open it
                const document = await vscode.workspace.openTextDocument(fileUri);
                const editor = await vscode.window.showTextDocument(document);
        
                // Move the cursor to the specified line
                const position = new vscode.Position(note.context.line - 1, 0);
                const range = new vscode.Range(position, position);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            } catch (error) {
                // If file does not exist, show an error message
                vscode.window.showErrorMessage(`${i18n.translite('user_strings.error')}: ${i18n.translite('user_strings.file')} ${i18n.translite('user_strings.not_found')}: ${path.basename(fileUri.fsPath)} (${fileUri.fsPath})`);
            }
        });

        // set commands callback for goToFile
        this.set('goToFile', async (note) => {
            // Check if the note is valid
            if (!note || !note.filepath ) {
                vscode.window.showErrorMessage(`${i18n.translite('user_strings.error')}: ${ i18n.translite('user_strings.file')} ${i18n.translite('user_strings.not_found')} ${i18n.translite('user_strings.or')} ${i18n.translite('user_strings.invalid_note')}.`);
                return;
            }
        
            const fileUri = vscode.Uri.file(note.filepath ); // Get the file URI
    
            // Check if the file exists
            await vscode.workspace.fs.stat(fileUri);
    
            // If file exists, open it
            const document = await vscode.workspace.openTextDocument(fileUri);
            await vscode.window.showTextDocument(document);
        });

        // set commands callback for deleteAll
        this.set('deleteAll', async (note) => {
            const editor = vscode.window.activeTextEditor;
            let type = null; // lines, files, directories
            let path = null;
    
            // get type and path
            switch(note.context.contextValue){
                case "lines":
                    type = "lines";
                    path = note.context.lineFile;
                break;
                case "file":
                    type = "files";
                    path = note.context.file;
                break;
                case "directory":
                    type = "directories";
                    path = note.context.directory;
                break;
            }
    
            // confirm delete
            if(type && path){
                const confirm = await vscode.window.showWarningMessage(`${i18n.translite('user_strings.are_you_sure_you_want_to_clear')} ${note.label}?`, i18n.translite('user_strings.yes'), i18n.translite('user_strings.no'));
                if (confirm !== i18n.translite('user_strings.yes')) return;
    
                const isDirectory = this.provider.notesData[type][path] !== undefined; // Check if it's a directory
                const target = this.provider.notesData[type][path];
                
                // Check if it's a directory
                if (!isDirectory || target.length == 0) {
                    return;
                }
    
                // Clear the directory
                if(delete this.provider.notesData[type][path]) vscode.window.showInformationMessage(`${i18n.translite('user_strings.clear')} ${note.label} ${i18n.translite('user_strings.successfully')}.`);
                else { vscode.window.showErrorMessage(`${i18n.translite('user_strings.clear')} ${note.label} ${i18n.translite('user_strings.failed')}. ${i18n.translite('user_strings.try_again_letter')}.`); return;};
    
                // save notes
                await this.provider.saveNotesToFile();
            
                // Refresh UI
                this.highlightCommentedLines(editor);
                this.provider.refresh();
                this.notesExplorerProvider.refresh();
            }
        });

        this.set("openedNote", async (note) => {
            const editor = vscode.window.activeTextEditor;
            const i18n = this.i18n;

            if (!editor) return;

            //show information window with note all information
            const fullText = `
            ${i18n.translite('user_strings.file')}: ${note.filepath} \r\n
            ${i18n.translite('user_strings.category')}: ${note.prov} \r\n
            ${i18n.translite('user_strings.content')}: ${note.content} \r\n
            ${i18n.translite('user_strings.created_at')}: ${formatTimeAgo(note.createdAt)} \r\n
            ${i18n.translite('user_strings.created_at')}: ${new Date(note.createdAt).toLocaleString()} \r\n
            ${i18n.translite('user_strings.deadline')}: ${new Date(note.deadline).toLocaleString()} (${formatTimeAgo(note.deadline)}) \r\n
            ${i18n.translite('user_strings.id')}: ${note.id} \r\n
            ${i18n.translite('user_strings.type')}: ${note.type}`; // Get the   fullText

            vscode.window.showInformationMessage(fullText, { modal: true });

            //first check if file exists
            if(!fs.existsSync(note.filepath )){ 
                vscode.window.showErrorMessage(`${i18n.translite('user_strings.file')} ${path.basename(note.filepath)} ${i18n.translite('user_strings.not_found')}. (${note.filepath})`);
                return;
            }

            //go to file
            const fileUri = vscode.Uri.file(note.filepath ); // Get the file URI

            await vscode.workspace.fs.stat(fileUri);
            const document = await vscode.workspace.openTextDocument(fileUri);
            await vscode.window.showTextDocument(document);

            
        });

        this.set("noteAction", async (note) => {
            const editor = vscode.window.activeTextEditor;
            const i18n = this.i18n;
            if (!editor) return;

            // Узнать на какой (Номер строки) строке находится курсор
            const lineNumber = (editor.selection.active.line + 1).toString();  // Get the line number


            const items = []

            this.lineHasNoteState.edit ? items.push({label: i18n.translite('menus.edit_on_line').replace('%line%', lineNumber)}) : null;
            this.lineHasNoteState.show ? items.push({label: i18n.translite('menus.view')}) : null;
            this.lineHasNoteState.delete ? items.push({label: i18n.translite('menus.delete')}) : null;
            this.lineHasNoteState.add ? items.push({label: i18n.translite('menus.new_on_line').replace('%line%', lineNumber)}) : null;

            // const noteAction = await vscode.window.showQuickPick([i18n.translite('user_strings.edit_note'), i18n.translite('user_strings.open_note'), i18n.translite('user_strings.delete_note')], {
            const noteAction = await vscode.window.showQuickPick(items, {
                placeHolder: i18n.translite('user_strings.choose_action')
            });

            if (!noteAction) return;
            
            if (noteAction.label === i18n.translite('menus.edit_on_line').replace('%line%', lineNumber)) {
                vscode.commands.executeCommand('protasker.editNote', note);
            } else if (noteAction.label === i18n.translite('menus.view')) {
                vscode.commands.executeCommand('protasker.openComment', note);
            } else if (noteAction.label === i18n.translite('menus.delete')) {
                vscode.commands.executeCommand('protasker.deleteNoteFromLine', note);
            } else if (noteAction.label === i18n.translite('menus.new_on_line').replace('%line%', lineNumber)) {
                vscode.commands.executeCommand('protasker.addNoteToLine', note);
            }
        });

        this.set("reloadList", async () => {
            this.provider.refresh();
            this.notesExplorerProvider.refresh();
        });

        this.set("clearList", async () => {
            const i18n = this.i18n;

            const response = await vscode.window.showInformationMessage(`${i18n.translite('user_strings.clear')} ${i18n.translite('user_strings.content')}`, i18n.translite('user_strings.yes'), i18n.translite('user_strings.no'));
            if (response === i18n.translite('user_strings.yes')) {
                this.provider.notesData = {directories: {}, files: {}, lines: {}};
                this.notesExplorerProvider.notesData = {directories: {}, files: {}, lines: {}};

                this.provider.saveNotesToFile();

                this.provider.refresh();
                this.notesExplorerProvider.refresh();

                vscode.window.showInformationMessage(i18n.translite('user_strings.successfully'));
            }
            return;
        })
    }

    /**
     * This function is responsible for setting up event listeners for the VS Code application.
     * It listens for the following events: 
     * - onDidChangeTextEditorSelection: updates setContext and highlights commented lines
     * - onDidOpenTextDocument: highlights commented lines
     * - onDidChangeVisibleTextEditors: updates setContext and highlights commented lines
     * - onDidChangeActiveTextEditor: updates setContext and highlights commented lines
     * - onDidChangeConfiguration: updates the language and refreshes the providers
     */
    listeners() {
        const i18n = this.i18n;
        vscode.window.onDidChangeTextEditorSelection(async event => {
            await this.updateLineHasNoteState(event.textEditor); // update setContext
        });

        vscode.workspace.onDidOpenTextDocument(doc => {
            const editor = vscode.window.activeTextEditor;
    
            // if the opened document is the same as the active editor 
            if (editor && editor.document.uri.fsPath === doc.uri.fsPath) {
                this.highlightCommentedLines(editor);
            }
        });

        vscode.window.onDidChangeVisibleTextEditors(async () => {
            if (vscode.window.activeTextEditor) {
               this.updateLineHasNoteState(vscode.window.activeTextEditor) // update setContext
           }
        });

        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (!editor) {
                setTimeout(() => {
                    const activeEditor = vscode.window.activeTextEditor; // active editor
                    if (activeEditor) {
                        this.highlightCommentedLines(activeEditor); // update highlight commented lines
                    }
                    this.updateLineHasNoteState(activeEditor); // update setContext
                }, 500); // wait 500ms
                
                return;
            }
        
            this.notesExplorerProvider.refresh(); // update notes explorer
            this.highlightCommentedLines(editor); // update highlight commented lines
        });

        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('protasker')) {
    
                setTimeagoLocale();
    
                i18n.loadTranslations().then(() => {
                    vscode.window.showInformationMessage(i18n.translite("settings.languageChanged"));
                });
    
                this.provider.notesData.lang = vscode.workspace.getConfiguration('protasker').get('language');
                
                // refresh providers
                this.provider.refresh();
                this.notesExplorerProvider.refresh();
                this.updateNotifications();
                this.i18n.loadTranslations();
            }
        });

        if (vscode.window.activeTextEditor) {
            this.highlightCommentedLines(vscode.window.activeTextEditor);
        }
    }

    /**
     * Updates the lineHasNote state and context menu items based on the presence of notes on the current line.
     *
     * @async
     * @param {vscode.TextEditor} editor - The active text editor.
     * @returns {Promise<void>} - A promise that resolves when the update is complete.
     * @description This function checks if there are any notes on the current line of the active editor
     * and updates the lineHasNote state accordingly. It then updates the context menu items based on
     * the lineHasNote state to allow or restrict actions such as deleting, opening, editing, or adding notes.
     */
    async updateLineHasNoteState(editor) {
        if (!editor) return;
    
        await this.lineHasNote();
    }

    /**
     * Retrieves the ProTasker extension settings from the VS Code workspace configuration.
     *
     * This function accesses the 'protasker' configuration section and returns
     * an object containing various settings for the ProTasker extension.
     * 
     * @returns {Object} An object with the following properties:
     * - `language`: The selected interface language.
     * - `customTypes`: An array of custom note types.
     * - `noteDisplay`: The display mode for notes (icon, highlight, or inline text).
     * - `highlightColor`: The color used for line highlights.
     * - `showTimeAgo`: Boolean indicating if notes should display the time ago format.
     * - `notificatons`: Boolean indicating if notifications are enabled.
     * - `inlineTextColor`: Color for inline text notes.
     */
    getProTaskerSettings() {        
        const config = vscode.workspace.getConfiguration('protasker');
        return {
            language: config.get('language'), // Get the selected interface language
            customTypes: config.get('customTypes'), // Get the custom note types
            noteDisplay: config.get('noteDisplay'), // Get the note display mode
            highlightColor: config.get('highlightColor'), // Get the highlight color
            showTimeAgo: config.get('showTimeAgo'), // Get the show time ago setting
            notificatons: config.get('notificatons'), // Get the notifications setting
            inlineTextColor: config.get('inlineTextColor') // Get the inline text color
        };
    }

    /**
     * Gets the target path based on the user's selection.
     * @param {string} selection - The user's selection ('Line' or 'Directory').
     * @returns {Promise<string|null>} The target path or null if no editor is open.
     * @description
     * This method gets the target path based on the user's selection.
     * If the selection is 'Line', it returns the file path of the currently open document.
     * If the selection is 'Directory', it opens a file dialog for the user to select a directory.
     * If no editor is open, it returns null.
     */
    async getTargetPath(selection) {
        const i18n = this.i18n;
        const editor = vscode.window.activeTextEditor;
    
        // Check if the selection is for a line
        if (selection === 'Line') {
            return editor ? editor.document.uri.fsPath : null; // Return the file path of the currently open document
        }
    
        // Check if the selection is for a directory
        if (selection === 'Directory') {
            const uri = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: i18n.translite("user_strings.done"),
                title: i18n.translite("user_strings.select_directory_for_notes")
            });
    
            return uri && uri.length > 0 ? uri[0].fsPath : null; // Return the path of the selected directory
        }
    
        return editor ? editor.document.uri.fsPath : null; // Return the file path of the currently open document
    }

    /**
     * Highlights lines with notes in the active editor based on user settings.
     * @param {vscode.TextEditor} editor - The active text editor.
     * @returns {Promise<void>}
     * @description This method highlights lines with notes in the active editor based on user settings.
     * It uses the notes explorer provider to get the notes for the current file and line numbers.
     * It then applies the highlight styles based on the user settings (icon, highlight, or inline text).
     */
    async highlightCommentedLines(editor) {
        const i18n = await this.i18n;
        const provider = this.provider;
        // Check if the active editor and document are available
        if (!editor || !editor.document) {
            return;
        }
        const settings = this.getProTaskerSettings(); // Get settings

        const originalPath = path.normalize(editor.document.uri.fsPath).replace(/\\/g, "/").toLowerCase(); // Get the file path
        const normalizedPath = path.normalize(originalPath).replace(/\\/g, "/").toLowerCase();

        // Search for a matching file path
        const matchedPath = Object.keys(provider.notesData.lines).find(key =>
            path.basename(key).toLowerCase() === path.basename(normalizedPath)
        );

        // Check if a matching file path was found
        if (!matchedPath) {
            return;
        }

        // Clear existing decorations
        const fileNotes = provider.notesData.lines[matchedPath] || [];

        const MAX_LENGTH = 50; // Maximum length of the tooltip

        const decorationsArray = []; // Array to store decorations
        const linesWithNotes = new Set(); // Set to track lines with notes

        fileNotes.forEach(note => {
            let lineNumber = note.line; // Number of the line
            let tooltipText = note.content; // Full text of the note for the tooltip

            // Truncate the tooltip if it exceeds the maximum length
            if (tooltipText.length > MAX_LENGTH) {
                tooltipText = tooltipText.substring(0, MAX_LENGTH) + "...";
            }

            // Check if the line number has already been processed
            if (!linesWithNotes.has(lineNumber)) {
                linesWithNotes.add(lineNumber);
                // Create the decoration
                const decoration = {
                    range: new vscode.Range(lineNumber - 1, 0, lineNumber - 1, 100),
                    hoverMessage: new vscode.MarkdownString(`**${i18n.translite('user_strings.note')}:** ${note.content}  \n **${i18n.translite('user_strings.type')}:** ${note.type}  \n **${i18n.translite('user_strings.created_at')}:** ${formatTimeAgo(new Date(note.createdAt))}`),
                    renderOptions: {}
                };
                // Apply styles based on user settings
                if (settings.noteDisplay === "icon") {
                    decoration.renderOptions.before = {
                        contentText: "📌",
                        color: "red",
                        fontWeight: "bold",
                        margin: "0 10px 0 0"
                    };
                } else if (settings.noteDisplay === "highlight") {
                    decoration.renderOptions.backgroundColor = settings.highlightColor;
                    decoration.renderOptions.after = {
                        contentText:  `// ${tooltipText}`,
                        color: settings.inlineTextColor || " #03a9f4",
                        fontSize: "12px",
                        backgroundColor: settings.highlightColor,
                        margin: "0 0 0 5px",
                        width: "100%",
                        height: "100%"
                    }
                } else if (settings.noteDisplay === "inlineText") {
                    decoration.renderOptions.after = {
                        contentText: `📜 ${tooltipText}`,
                        color: settings.inlineTextColor || " #03a9f4",
                        fontSize: "12px"
                    };
                }

                // Apply other styles
                decoration.overviewRulerColor = settings.highlightColor;
                decoration.overviewRulerLane = vscode.OverviewRulerLane.Full;
        
                decorationsArray.push(decoration); // Add the decoration

            }
        });

        // Clear existing decorations
        if (provider.activeDecorationType) {
            editor.setDecorations(provider.activeDecorationType, []);
        }

        // Create a new decoration type for the active editor
        provider.activeDecorationType = vscode.window.createTextEditorDecorationType({
            isWholeLine: true // Make the decoration span the entire line
        });

        // Apply the decorations
        editor.setDecorations(provider.activeDecorationType, decorationsArray);
    }

    /**
     * Finds the file path associated with a checklist with the given id.
     * @function
     * @memberof Main
     * @param {string} checklistId - The id of the checklist to search for
     * @param {string} [type="files"] - The type of notes data to search. Defaults to "files".
     * @returns {string|null} - The file path associated with the checklist if found, otherwise null
     */
    findChecklistFilePath(checklistId, type = "files") {
        
        const file = this.provider.notesData[type]; // Get the notes data
        
        // Search for a checklist with the given id
        for (const filePath in file) {
            
            const fileData = file[filePath];
            if (fileData.checklists) {
                const checklist = fileData.checklists.find(cl => cl.id === checklistId);
                if (checklist) {
                    return filePath;
                }
            }
        }
        return null; // Checklist not found
    }

    /**
     * Checks if there are notes on the current line of the active editor and updates the lineHasNote state.
     * @function
     * @memberof Main
     * @returns {Promise<boolean>} - True if there are notes on the current line of the active editor
     */
    async lineHasNote() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return false;
    
        
        const lineNumber = editor.selection.active.line + 1; // Get the line number and file path
        const filePath = path.normalize(editor.document.uri.fsPath).replace(/\\/g, "/").toLowerCase(); // Get the file path

        const notesForFile = await this.provider.notesData.lines[filePath] || [];// Search for notes
        const notesOnLine = await notesForFile.filter(note => note.line === lineNumber);// Search for notes on the current line

        // update lineHasNote state 
        let newstate = await notesOnLine.length > 0 ? true : false;
 
        this.lineHasNoteState = {
            edit: newstate,
            show: newstate,
            delete: newstate,
            add: newstate ? false : true
        };
    }

    /**
     * Updates the notification interval based on the current notification setting.
     * If notifications are enabled, it will check deadlines every 15 seconds.
     * If notifications are disabled, it will stop checking deadlines.
     * @function
     * @memberof Main
     */
    updateNotifications() {
        // Get the current notification setting
        const enableNotifications = vscode.workspace.getConfiguration("protasker").get("notificatons");
    
        // Update the notification interval
        if (enableNotifications) {
            if (!this.notifyInterval || this.notifyInterval == null) {
                this.notifyInterval = setInterval(() => this.checkDeadlines(), 15000); // Check deadlines every 15 seconds
            }
        } else {
            // Stop checking deadlines
            if (this.notifyInterval) { 
                clearInterval(this.notifyInterval); // Clear the interval
                this.notifyInterval = null; // Reset the interval
            }
        }
    }

    /**
     * Checks deadlines in notes data and displays notifications if they are approaching or have passed
     * @private
     */
    checkDeadlines() {
        const i18n = this.i18n;
        const now = Date.now(); // Get the current time
        const settings = this.getProTaskerSettings(); // Get user settings
        const checkedItems = new Set(); // Set to keep track of checked items
    
        // Check deadlines in notes data
        function checkEntries(entries, location) {
            if (!entries || typeof entries !== "object") return; // Skip if entries is not an object
        
            // Check each note
            for (const category of ["notes", "comments", "checklists", "events", ...settings.customTypes]) {
                if (!entries[category] || !Array.isArray(entries[category])) continue;
        
                for (const note of entries[category]) {
                    if (!note.deadline) continue; // Skip if deadline is not set
        
                    // Check if the deadline has already been checked
                    const uniqueKey = `${location}:${note.deadline}:${note.content}`;
                    
                    // Check if the deadline has already been checked
                    if (checkedItems.has(uniqueKey)) {
                        continue;
                    }
    
                    checkedItems.add(uniqueKey); // Add the deadline to the set
        
                    // Check if the deadline is approaching
                    const deadline = new Date(note.deadline).getTime();
                    if (isNaN(deadline)) {
                        continue; // Skip if deadline is invalid
                    }
        
                    const diff = deadline - now; // Calculate the difference between the deadline and the current time
        
                    // Display a notification if the deadline is approaching
                    if (diff < 3600000 && diff > 0 && !notifiedDeadlines.has(uniqueKey)) {
                        notifiedDeadlines.add(uniqueKey); // Add the deadline to the set
                    }
                    // Display a notification if the deadline has passed
                    if (diff <= 0 && !notifiedDeadlines.has(uniqueKey)) {
                        note['filepath'] = location;
                        vscode.window.showErrorMessage(`❌ ${i18n.translite("user_strings.overdue")}: ${note.content} ${formatTimeAgo(note.deadline)}`, { title: i18n.translite("user_strings.view") }).then(() => {
                            vscode.commands.executeCommand('protasker.openedNote', (note));
                        });
                        notifiedDeadlines.add(uniqueKey); // Add the deadline to the set
                    }
                }
            }
        }
    
        try {
            // Check deadlines in notes data
            for (const [filepath, data] of Object.entries(this.provider.notesData.files || {})) {
                checkEntries(data, `File: ${filepath}`);
    
                // Check deadlines in lines
                for (const [lineNumber, lineData] of Object.entries(data.lines || {})) {
                    checkEntries(lineData, `Line ${lineNumber} in ${filepath}`);
                }
            }
    
            // Check deadlines in directories
            for (const [dirPath, dirData] of Object.entries(this.provider.notesData.directories || {})) {
                checkEntries(dirData, `Directory: ${dirPath}`);
            }
    
        } catch (error) {
            console.error("❌ Error in checkDeadlines:", error);
        }
    }

}

module.exports = { Main };