const vscode = require('vscode');

const { Main } = require("./src/main");
const { NotesExplorer } = require('./src/dataManager');
const { NotesExplorerProvider } = require('./src/notesExplorerProvider');

let notifyInterval = null;
const path = require("path")
const notifiedDeadlines = new Set();

function activate(context) {
    
    // initialize classes
    const main = new Main(context);
    const provider = new NotesExplorer(context);
    const notesExplorerProvider = new NotesExplorerProvider(provider.notesData, context);

    const treeView = vscode.window.registerTreeDataProvider('sidebar_protasker_id1', provider); // Register the tree data provider
    let lineHasNoteState = {edit:false, show: false, delete: false, add: true}; // object to store lineHasNote state
    
    const notesExplorerView = vscode.window.registerTreeDataProvider('notesExplorer', notesExplorerProvider); // Register the tree data provider
    context.subscriptions.push(notesExplorerView); // Register the tree data provider

    // setContext
    vscode.window.onDidChangeTextEditorSelection(async event => {
        await updateLineHasNoteState(event.textEditor, provider); // update setContext
    });

    // Initialization highlight commented lines in editor
    if (vscode.window.activeTextEditor) {
        highlightCommentedLines(vscode.window.activeTextEditor, provider);
    }
    
    // Change active editor
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (!editor) {
            setTimeout(() => {
                const activeEditor = vscode.window.activeTextEditor; // active editor
                if (activeEditor) {
                    highlightCommentedLines(activeEditor, provider); // update highlight commented lines
                }
            }, 500); // wait 500ms
            return;
        }
    
        notesExplorerProvider.refresh(); // update notes explorer
        highlightCommentedLines(editor, provider); // update highlight commented lines
    });
    
    // configuration change handler
    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('protasker')) {
            
            // refresh providers
            provider.refresh();
            updateNotifications(provider);
        }
    });
    
    // update lineHasNote state
    vscode.window.onDidChangeVisibleTextEditors(async () => {
         if (vscode.window.activeTextEditor) {
            updateLineHasNoteState(vscode.window.activeTextEditor, provider) // update setContext
        }
    });
    
    // update lineHasNote state
    vscode.workspace.onDidOpenTextDocument(doc => {
        const editor = vscode.window.activeTextEditor;

        // if the opened document is the same as the active editor 
        if (editor && editor.document.uri.fsPath === doc.uri.fsPath) {
            highlightCommentedLines(editor, provider);
        }
    });

    /**
     * Updates the lineHasNote state and sets the corresponding context variables. 
     * If the editor is not specified, it will use the active editor.
     * @param {import('vscode').TextEditor} editor - The text editor to get the line number from.
     * @param {NotesExplorer} provider - The notes explorer provider.
     * @return {Promise<void>}
     */
    async function updateLineHasNoteState(editor, provider) {
        if (!editor) return;

            // Wait for the document to be fully loaded
            await lineHasNote(); // update lineHasNote state

            // update context menu items
            await vscode.commands.executeCommand('setContext', 'protasker.deleteNoteFromLine', lineHasNoteState.delete)
            await vscode.commands.executeCommand('setContext', 'protasker.openComment', lineHasNoteState.show)
            await vscode.commands.executeCommand('setContext', 'protasker.editNote', lineHasNoteState.edit)
            await vscode.commands.executeCommand('setContext', 'protasker.addNoteToLine', lineHasNoteState.add)
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
        lineHasNoteState.edit = newstate;
        lineHasNoteState.delete = newstate;
        lineHasNoteState.show = newstate;
        lineHasNoteState.add = newstate ? false : true;
        return newstate;  // if notes are found on the current line
    }

    // register commands
    main.comands([
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
        'editNoteFromList', // edit note from list
        'searchNotes', // search notes
        'resetSearch', // reset search
        'filterNotes', // filter notes
        'goToNote', // go to note
        'goToFile', // go to file
        'deleteAll', // delete all notes
    ]);

    // set commands callback
    main.set('openSettings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'protasker'); // open settings
    });

    // set commands callback for add note
    main.set('addNote', async () => {
        const editor = vscode.window.activeTextEditor;
        const settings = getProTaskerSettings();
        let deadline = null; // deadline for note

        // 1️⃣ Choose entry type
        const entryType = await vscode.window.showQuickPick(['Note', 'Comment', 'Checklist', 'Event', ...settings.customTypes], {
            placeHolder: 'Choose entry type'
        });
    
        if (!entryType) return;
    
        // 2️⃣ Choose selection file or directory
        const selection = await vscode.window.showQuickPick(['File', 'Directory'], {
            placeHolder: 'Choose selection'
        });
    
        if (!selection) return;
        
        // 3️⃣ Choose deadline if checklist or event
        if (entryType === 'Checklist' || entryType === 'Event') {
            const wantsDeadline = await vscode.window.showQuickPick(['Yеs', 'No'], {
                placeHolder: 'Add deadline?'
            });

            // 3️⃣ Choose deadline
            if (wantsDeadline === 'Yеs') {
                deadline = await vscode.window.showInputBox({ placeHolder: 'Deadline (YYYY-MM-DD HH:MM)' });
                if (deadline) {
                    const parsedDate = new Date(deadline);
                    // Check if the parsed date is valid
                    if (isNaN(parsedDate.getTime())) {
                        vscode.window.showErrorMessage('❌ Invalid date format. Please use YYYY-MM-DD HH:MM');
                        return;
                    }
                    deadline = parsedDate.toISOString(); // Convert to ISO string
                }
            }
        }

        // 3️⃣ Get file path
        let filePath = await getTargetPath(selection);
        if (!filePath){  
            vscode.window.showErrorMessage("No active editor."); //if there is no active editor show error message 
            return
        };
    
        // 4️⃣ if type is checklist get checklist items
        if (entryType === 'Checklist') {
            let checklistItems = []; // checklist items
            let addMore = true; // flag for adding more items

            const name = await vscode.window.showInputBox({placeHolder: 'Checklist name'}); // get checklist name

            if (!name) return;
    
            // 4️⃣ Add checklist items
            while (addMore) {
                const item = await vscode.window.showInputBox({ placeHolder: 'Enter checklist item (leave empty to finish)' });
                if (!item) break;
                checklistItems.push({ text: item, done: false });
    
                addMore = await vscode.window.showQuickPick(['Add more item', 'Done'], { placeHolder: 'Add more?' }) === 'Add more';
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
            await provider.addEntry(filePath, selection === 'Directory', 'checklist', checklistEntry);
        } else {
            // 4️⃣ Get note content
            const noteContent = await vscode.window.showInputBox({ placeHolder: 'Enter note content' });
            if (!noteContent) return;
    
            if (selection === 'File') {
                await provider.addEntry(filePath, false, entryType.toLowerCase(), noteContent, Boolean(deadline));
            } else if (selection === 'Directory') {
                await provider.addEntry(filePath, true, entryType.toLowerCase(), noteContent, Boolean(deadline));
            } else if (selection === 'Line') {
                const lineNumber = editor ? editor.selection.active.line + 1 : 0;
                await provider.addNoteToLine(filePath, lineNumber, entryType.toLowerCase(), noteContent);
            }
        }

        // 5️⃣ Refresh UI
        provider.refresh();
        notesExplorerProvider.refresh();
        highlightCommentedLines(editor, provider);
    });
    // set commands callback for add checklist items
    main.set('addChecklistItem', async (treeItem) => {
        if (!treeItem || treeItem.context.type !== "checklist") return; // check if treeItem is checklist

        const newItemText = await vscode.window.showInputBox({ placeHolder: 'Enter item text' });
        if (!newItemText) return;
        
        // Add new item to the checklist
        treeItem.context.content.items.push({ text: newItemText, done: false });
        
        try {
            // Save changes to the JSON file
            await provider.saveNotesToFile();

            // Refresh UI
            provider.refresh();
            notesExplorerProvider.refresh();
            vscode.window.showInformationMessage(`✅ Item "${newItemText}" added to the checklist!`);
            
        } catch (error) {
            vscode.window.showErrorMessage(`❌ Error saving changes: ${error.message}`);
        }
    });

    // set commands callback for toggle checklist items
    main.set('toggleChecklistItem', async (treeItem) => {
        treeItem.data = treeItem?.data ? treeItem.data : treeItem.context; // check if treeItem is checklist
        if (!treeItem || typeof treeItem.data.done === "undefined") {
            return;
        }
        // Get the filePath via findChecklistFilePath
        const filePath = findChecklistFilePath(treeItem.data.checklistId, treeItem.data.path);
        if (!filePath) {
            return;
        }
    
        // Check if the file exists
        const fileNotes = provider.notesData[treeItem.data.path][filePath];
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
        provider.notesData[treeItem.data.path][filePath] = { ...fileNotes };


            // Save changes to the JSON file
            provider.saveNotesToFile();
    
            // Refresh UI
            provider.refresh();
            notesExplorerProvider.refresh();

            // Show success message with the new done status
            vscode.window.showInformationMessage(`🔄 Item "${treeItem.data.text}" now ${treeItem.data.done ? "not fulfilled ❌" : "fulfilled ✅"}`);
    });

    // set commands callback for remove checklist items
    main.set('removeChecklistItem', async (item) => {
        
        if (!item || !item.context.checklistId || item.context.index === undefined) {
            vscode.window.showErrorMessage("❌ Item Unable to Delete: No Data.");
            return;
        }

        const confirm = await vscode.window.showWarningMessage(`You are about to delete the item: ${item.context.text}?`, "Yes", "No");
        if (confirm !== "Yes") return;

        // Get the filePath via findChecklistFilePath
        const filePath = findChecklistFilePath(item.context.checklistId, item.context.path);
        if (!filePath) {
            vscode.window.showErrorMessage("❌ File not found.");
            return;
        }

        // Uploading the checklist data
        const checklist = provider.notesData[item.context.path][filePath].checklists.find(cl => cl.id === item.context.checklistId);
        if (!checklist) {
            vscode.window.showErrorMessage("❌ Checklist not found.");
            return;
        }
        // Delete the item from the checklist
        checklist.content.items.splice(item.context.index, 1);

        // Save changes to the JSON file
        await provider.saveNotesToFile();

        // Refresh UI
        provider.refresh();
        notesExplorerProvider.refresh();

        vscode.window.showInformationMessage("✅ Item Deleted Successfully."); // Show success message
    });

    // set commands callback for delete note
    main.set('deleteNote', async (treeItem) => {
        const editor = vscode.window.activeTextEditor;
        const filePath = treeItem.parent || treeItem.path; // Get the filePath via findChecklistFilePath

        if (!filePath) {
            return;
        }

        const confirm = await vscode.window.showWarningMessage("Do you want to delete this note?", "Yes", "No");
        if (confirm !== "Yes") return;

        const isDirectory = provider.notesData.directories[filePath] !== undefined; // Check if it's a directory or a file
        const target = isDirectory ? provider.notesData.directories[filePath] : provider.notesData.files[filePath]; // Get the target object
        
        if (!target || !target.notes) {
            return;
        }

        const noteIndex = target.notes.findIndex(n => n.content.trim() === treeItem.label.trim()); // Find the index of the note
        // Check if the note was found
        if (noteIndex === -1) {
            return;
        }

        target.notes.splice(noteIndex, 1); // Delete the note
        await provider.saveNotesToFile(); // Save changes to the JSON file
        
        // Refresh UI
        highlightCommentedLines(editor, provider);
        provider.refresh();
        notesExplorerProvider.refresh();
    });

    // set commands callback for open comment
    main.set('openComment', () => {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            vscode.window.showErrorMessage("❌ No active editor.");
            return;
        }

        let filePath = path.normalize(editor.document.uri.fsPath).replace(/\\/g, "/").toLowerCase(); // Get the file path and normalize it to Unix-style
        const line = editor.selection.active.line +1; // Get the line number of the cursor

        // Check if the file exists
        if (!provider.notesData.lines[filePath]) {
            vscode.window.showErrorMessage("❌ File not found.");
            return;
        }

        // 🛠 Receiving all comments
        const allNotes = provider.notesData.lines[filePath] || [];

        // 🛠 Filter only those that match the current row
        const lineNotes = allNotes.filter(note => {
            return note.line === line && typeof note.content === "string" && note.content.trim().length > 0;
        });

        // Check if there are any notes
        if (lineNotes.length === 0) {
            vscode.window.showInformationMessage("📭 There are no comments for this line.");
            return;
        }

        // Combining all comments into one text
        const fullText = lineNotes.map((note, index) => `Type: ${note.type}* \r\n Content: ${note.content}. \r\n Created: ${note.createdAt}`).join("\n\n");

        vscode.window.showInformationMessage(`📝 Comments for line ${line}:\n\n${fullText}`, { modal: true });
    });

    // set commands callback for addNoteToLine
    main.set('addNoteToLine', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
    
        // Get the note content from the user
        const noteContent = await vscode.window.showInputBox({
            placeHolder: 'Enter note content'
        });
    
        if (noteContent) {
            const lineNumber = editor.selection.active.line + 1;  // The line on which the note is inserted
            const filePath = editor.document.uri.fsPath;  // The file path
    
            // Add the note to the line
            provider.addNoteToLine(filePath, lineNumber, "line", noteContent); // 📝 add note to line
            highlightCommentedLines(editor, provider); // Update highlight commented lines
            notesExplorerProvider.refresh();
        }
    });

    // set commands callback for editNote
    main.set('editNote', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
    
        const lineNumber = editor.selection.active.line + 1;  // Get the line number
        const filePath = path.normalize(editor.document.uri.fsPath).replace(/\\/g, "/").toLowerCase(); // Get the file path
    
        // Check if there are notes on the current line
        if (!lineHasNote()) {
            vscode.window.showInformationMessage("There are no notes on this line.");
            return;
        }
    
        const notesForFile = provider.notesData.lines[filePath] || []; // Search for notes
        const notesOnLine = notesForFile.filter(note => note.line === lineNumber); // Search for notes on the current line
    
        // Check if there are notes on the current line
        if (notesOnLine.length === 0) {
            vscode.window.showInformationMessage("There are no notes on this line.");
            return;
        }
    
        const noteToEdit = notesOnLine[0]; // Get the first note on the current line
        const editedContent = await vscode.window.showInputBox({
            value: noteToEdit.content,
            placeHolder: "Edit note content"
        });
    
        // Check if the note content was edited
        if (editedContent) {
            noteToEdit.content = editedContent;
            await provider.saveNotesToFile(); // Save changes to the JSON file
    
            // Refresh UI
            provider.refresh();
            notesExplorerProvider.refresh()
            vscode.window.showInformationMessage("Note content has been edited successfully.");
        }
        highlightCommentedLines(editor, provider); // Update highlight commented lines
    });

    // set commands callback for deleteNote
    main.set('deleteNoteFromList', async (treeItem) => {
        treeItem.data = treeItem?.data ? treeItem.data : treeItem.context; // Get the note data
        const settings = getProTaskerSettings(); // Get settings from the extension

        // Check if the note data exists
        if (!treeItem || !treeItem.data || !treeItem.data.id) {
            vscode.window.showErrorMessage("Error: Note data not found.");
            return;
        }
    
        // Confirm deletion
        const confirm = await vscode.window.showWarningMessage(`You are about to delete ${treeItem.data.content} ?`, "Yes", "No");
        if (confirm !== "Yes") return;
    
        const customTypes = settings.customTypes.map(item => (item + "s").toLowerCase()); // Get custom note types
    
        const { id, type, prov, path, linepath } = treeItem.data; // Get note data from the tree item
        let targetCollection = null;
        let targetKey = null;
        let stillExists = true;

        // check if path exists and set targetCollection and targetKey
        if (path || treeItem.context.path || treeItem.context.dirpath || treeItem.context.filepath) {
            targetCollection = provider.notesData[prov];
            targetKey = path || treeItem.context.path || treeItem.context.dirpath || treeItem.context.filepath;
        }
        if (!targetCollection || !targetKey || !targetCollection[targetKey]) {
            vscode.window.showErrorMessage("Error: Target collection or key not found.");
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
    
        provider.saveNotesToFile(); // Save changes to the JSON file

        // Refresh UI
        provider.refresh();
        notesExplorerProvider.refresh();
        highlightCommentedLines(vscode.window.activeTextEditor, provider); //Update highlight commented lines

        vscode.window.showInformationMessage("✅ Note has been deleted.");
    });

    // set commands callback for editNote
    main.set('editNoteFromList', async (treeItem) => {
        treeItem.data = treeItem?.data ? treeItem.data : treeItem.context;
        const settings = getProTaskerSettings(); // Get settings from the extension

        // Check if the note data exists
        if (!treeItem || !treeItem.data || !treeItem.data.id) {
            vscode.window.showErrorMessage("Error: Note data not found.");
            return;
        }
        const { id, type, prov, path, linepath } = treeItem.data; // Get note data from the tree item
        let targetCollection = null;
        let targetKey = null;
        let targetEntry = null;

        const customTypes = settings.customTypes.map(item => (item + "s").toLowerCase()); // Get custom note types and convert to lowercase
    
        // check if path exists and set targetCollection and targetKey
        if (path || treeItem.context.path || treeItem.context.dirpath || treeItem.context.filepath) {
            targetCollection = provider.notesData[prov];
            targetKey = path || treeItem.context.path || treeItem.context.dirpath || treeItem.context.filepath;
        }
        if (!targetCollection || !targetKey || !targetCollection[targetKey]) {
            vscode.window.showErrorMessage("Error: Target collection or key not found.");
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
            vscode.window.showErrorMessage("Error: Note not found.");
            return;
        }
    
        // Show input box for new text
        const newText = await vscode.window.showInputBox({
            placeHolder: 'Enter new text for the note',
            value: targetEntry.content
        });
    
        // Check if the new text is valid
        if (!newText || newText.trim() === "") {
            vscode.window.showErrorMessage("⚠️ New text cannot be empty.");
            return;
        }
    
        // Update the note
        targetEntry.content = newText;
    
        // Show success message
        vscode.window.showInformationMessage("✅ Note has been updated.");
    
        // Save changes
        provider.saveNotesToFile();
    
        // Refresh UI
        provider.refresh();
        notesExplorerProvider.refresh();
        highlightCommentedLines(vscode.window.activeTextEditor, provider); //Update highlight commented lines
    });

    // set commands callback for search
    main.set('searchNotes', async () => {
        const query = await vscode.window.showInputBox({
            placeHolder: "🔍 Enter search query",
            prompt: "Enter search query"
        });
    
        if (!query || query.trim() === "") {
            vscode.window.showErrorMessage("⚠️ Search query cannot be empty!");
            return;
        }
        // search notes
        provider.searchNotes(query);
        provider.filteredNotes = null;

        // refresh UI
        provider.refresh();
    });

    // set commands callback for resetSearch
    main.set('resetSearch', async () => {
        // reset search
        provider.search = false;
        provider.filteredNotes = null; // Clear filtered notes
        provider.searchResults = null; // Clear search results
        provider.refresh();  // Refresh UI
    });

    // set commands callback for filterNotes
    main.set('filterNotes', async () => {
        const settings = getProTaskerSettings(); // Get settings from the extension
        const customTypes = []; // Array to store custom note types

        // Add custom note types to the array
        settings.customTypes.map(note => {
            customTypes.push({label: note, description: `Filter by ${note} only`})
        })
        
        // Choosing a Filter Type
        const filterType = await vscode.window.showQuickPick(
            [
                { label: 'All', description: 'Show all notes, comments, checklists, events, ...' },
                { label: 'Notes', description: 'Filter by notes only' },
                { label: 'Comments', description: 'Filter by comments only' },
                { label: 'Checklists', description: 'Filter by checklists only' },
                { label: 'Events', description: 'Filter by events only' },
                { label: 'Line', description: 'Filter by events only' },
                ...customTypes
            ],
            { placeHolder: 'Select a type to filter' }
        );
    
        if (!filterType) return;  // if user cancels, do nothing
    
        // Choosing a Filter Category
        const filterCategory = await vscode.window.showQuickPick(
            [
                { label: 'All', description: 'Show from all categories (files, directories, lines)' },
                { label: 'Files', description: 'Filter by files' },
                { label: 'Directories', description: 'Filter by directories' },
                { label: 'Lines', description: 'Filter by lines' }
            ],
            { placeHolder: 'Select a category to filter by' }
        );
    
        if (!filterCategory) return;  // if user cancels, do nothing
    
        // Convert the selected type and category to lowercase
        const queryType = filterType.label.toLowerCase();
        const queryCategory = filterCategory.label.toLowerCase();
    
        // Filter notes based on the selected type and category
        provider.filterNotes(queryType, queryCategory);
        const filteredResults = await provider.filteredNotes
    
        // Show a message if no results were found
        if (filteredResults.length === 0) {
            vscode.window.showInformationMessage("No results found.");
        }
    
        // Clear search results
        provider.searchResults = null;

        // Refresh UI
        provider.refresh();
    });

    // set commands callback for goToNote
    main.set('goToNote', async (note) => {
        // Check if the note is valid
        if (!note || !note.context.path || typeof note.context.line !== "number") {
            vscode.window.showErrorMessage("Error: Invalid note.");
            return;
        }
    
        const fileUri = vscode.Uri.file(note.context.path); // Get the file URI
    
        try {
            // Check if the file exists
            await vscode.workspace.fs.stat(fileUri);
            
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
            vscode.window.showErrorMessage(`File not found: ${fileUri.fsPath}`);
        }
    });

    // set commands callback for goToFile
    main.set('goToFile', async (note) => {
        // Check if the note is valid
        if (!note || !note.filepath ) {
            vscode.window.showErrorMessage("Error: Note is not valid.");
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
    main.set('deleteAll', async (note) => {
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
            const confirm = await vscode.window.showWarningMessage(`Are you sure you want to clear ${note.label}?`, "Yes", "No");
            if (confirm !== "Yes") return;

            const isDirectory = provider.notesData[type][path] !== undefined; // Check if it's a directory
            const target = provider.notesData[type][path];
            
            // Check if it's a directory
            if (!isDirectory || target.length == 0) {
                return;
            }

            // Clear the directory
            if(delete provider.notesData[type][path]) vscode.window.showInformationMessage(`Clear ${note.label} success.`);
            else { vscode.window.showErrorMessage(`Clear ${note.label} failed. Try again letter.`); return;};

            // save notes
            await provider.saveNotesToFile();
        
            // Refresh UI
            highlightCommentedLines(editor, provider);
            provider.refresh();
            notesExplorerProvider.refresh();
        }
    });
    
    /**
     * Finds the file path where a checklist with given id is located
     * @param {number} checklistId - The id of the checklist to search for
     * @param {string} type - The type of notes data to search in. Defaults to "files"
     * @returns {string|null} The file path of the checklist, or null if not found
     */
    function findChecklistFilePath(checklistId, type = "files") {
        
        const file = provider.notesData[type]; // Get the notes data
        
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
     * Highlights lines in the editor that have associated comments or notes.
     * 
     * @param {import('vscode').TextEditor} editor - The active text editor.
     * @param {NotesExplorer} provider - The notes explorer provider containing note data.
     * 
     * This function checks if the active editor and document are available. It retrieves
     * settings and normalizes the file path of the current document. The function looks
     * for matching file paths in the provider's notes data. If found, it loads and processes
     * the lines with notes, creating decorations to visually represent comments. The decorations
     * can be styled as an icon, highlighted text, or inline text based on user settings. 
     * It clears any existing decorations before applying new ones.
     */
    function highlightCommentedLines(editor, provider) {
        // Check if the active editor and document are available
        if (!editor || !editor.document) {
            return;
        }
        const settings = getProTaskerSettings(); // Get settings

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
                    hoverMessage: new vscode.MarkdownString(`**Note:** ${note.content}  \n **Type:** ${note.type}  \n **Created:** ${provider.timeago.format(new Date(note.createdAt))}`),
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

    context.subscriptions.push(treeView); // Register the tree view
    updateNotifications(provider); // Update notifications
}

/**
 * Updates the notification interval based on the user's settings.
 * 
 * This function retrieves the current notification setting from 
 * the 'protasker' configuration. If notifications are enabled,
 * it starts a recurring interval to check deadlines every 15 seconds.
 * If they are disabled and an interval is already running, it clears 
 * the interval to stop checking deadlines.
 * 
 * @param {NotesExplorer} provider - The notes explorer provider used to check deadlines.
 */

function updateNotifications(provider) {
    // Get the current notification setting
    const enableNotifications = vscode.workspace.getConfiguration("protasker").get("notificatons");

    // Update the notification interval
    if (enableNotifications) {
        if (!notifyInterval || notifyInterval == null) {
            notifyInterval = setInterval(() => checkDeadlines(provider), 15000); // Check deadlines every 15 seconds
        }
    } else {
        // Stop checking deadlines
        if (notifyInterval) { 
            clearInterval(notifyInterval); // Clear the interval
            notifyInterval = null; // Reset the interval
        }
    }
}

/**
 * Checks all deadlines in the notes data and displays notifications if deadlines are approaching or have passed.
 * 
 * This function is called by the updateNotifications function every 15 seconds if notifications are enabled.
 * It checks all deadlines in the notes data and displays a notification if a deadline is approaching (less than 1 hour remaining)
 * or has passed. The notification includes the content of the note and the location (file or directory) where the note is located.
 * The function also logs messages to the console to indicate which deadlines are being checked and whether notifications are being displayed.
 * 
 * @param {NotesExplorer} provider - The notes explorer provider used to access the notes data.
 */
function checkDeadlines(provider) {

    const now = Date.now(); // Get the current time
    const settings = getProTaskerSettings(); // Get user settings
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
                    vscode.window.showErrorMessage(`❌ Overdue: ${note.content}`);
                    notifiedDeadlines.add(uniqueKey); // Add the deadline to the set
                }
            }
        }
    }

    try {
        // Check deadlines in notes data
        for (const [filepath, data] of Object.entries(provider.notesData.files || {})) {
            checkEntries(data, `File: ${filepath}`);

            // Check deadlines in lines
            for (const [lineNumber, lineData] of Object.entries(data.lines || {})) {
                checkEntries(lineData, `Line ${lineNumber} in ${filepath}`);
            }
        }

        // Check deadlines in directories
        for (const [dirPath, dirData] of Object.entries(provider.notesData.directories || {})) {
            checkEntries(dirData, `Directory: ${dirPath}`);
        }

    } catch (error) {
        console.error("❌ Error in checkDeadlines:", error);
    }
}

/**
 * Asynchronously retrieves the target file path based on the provided selection.
 * 
 * This function determines the file path depending on whether the selection is for a line or directory.
 * - If 'Line' is selected and there is an active editor, it returns the file path of the currently open document.
 * - If 'Directory' is selected, it opens a dialog for the user to choose a directory and returns the path of the selected directory.
 * - In other cases, it defaults to returning the file path of the current document if an editor is active.
 * 
 * @param {string} selection - The selection option, either 'Line' or 'Directory'.
 * @returns {Promise<string|null>} The file path based on selection, or null if no path is available.
 */
async function getTargetPath(selection) {

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
            openLabel: 'Select Directory for notes'
        });

        return uri && uri.length > 0 ? uri[0].fsPath : null; // Return the path of the selected directory
    }

    return editor ? editor.document.uri.fsPath : null; // Return the file path of the currently open document
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
function getProTaskerSettings() {
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

function deactivate() {
    console.log('ProTasker extension deactivated');
}

module.exports = {
    activate,
    deactivate
};