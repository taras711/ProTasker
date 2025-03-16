const vscode = require('vscode');
const path = require('path');
const timeago = require('timeago.js');

/**
 * This class is responsible for managing notes, comments, checklists, and events for a given view.
 * It provides methods for retrieving and filtering data, as well as creating new notes.
 * @class NoteManager
 * @author taras711
 * @since 1.0.0
 * @version 1.0.0
 * @hideconstructor
 * @description This class is used to manage notes and other data for a specific view.
 * @tutorial https://github.com/tarasovvg/ProTasker/blob/master/extension.js
 */

class NoteManager{
    constructor(data,  viewId) {
        this.viewId = viewId; // Id of the view
        this.notesData = data; // Data from notesData.json
        this.searchResults = null; // Search results
        this.filteredNotes = null; // Filtered notes
        this.noteItem = NoteItem; // Note item
        this.context = null; // Context

        
    }

    /**
     * Retrieves and filters data from notes, directories, and files, returning them as NoteItem objects.
     * @param {Object} element - The element representing a directory, file, line, or note context.
     * @returns {Promise<Array>} - A Promise that resolves to an array of NoteItem objects, which represent the structured data.
     */
    async mainData(element){
        const editor = vscode.window.activeTextEditor; // active editor
        const file = editor ? path.normalize(editor.document.uri.fsPath).replace(/\\/g, "/").toLowerCase() : null; // Get the file path
        const pathDir = file ? file.slice(0, file.lastIndexOf('/')) : null; // Get the directory path

        // Check if the element is a directory
        if (!element) {
            const items = []; // Array to store NoteItem objects
        
            // Get directories
            const directories = Object.keys(this.notesData.directories)
                .filter(dirPath => 
                    // Check if the directory path is not in the filtered notes
                    (!this.filteredNotes || this.filteredNotes.some(item => item.parentPath === dirPath && item.type !== "line")) &&
                    (!this.searchResults || this.searchResults.some(item => item.parentPath === dirPath && item.type !== "line"))
                )
                .map(dirPath => {
                    
                    const dirData = this.notesData.directories[dirPath]; // Get directory data
                    
                    // Check if the directory path is not in the filtered notes
                    const hasDeadline = Object.values(dirData)
                        .filter(Array.isArray)
                        .flat()
                        .some(note => note?.deadline && Boolean(note.deadline));
                    
                    // Check if the directory path is not in the filtered notes
                    const totalRecords = Object.values(dirData)
                        .filter(Array.isArray)
                        .reduce((sum, category) => sum + category.length, 0);
                    
                    if (this.viewId !== null && dirPath !== pathDir) return; // Check if the directory path is not in the filtered notes
                    
                    return new NoteItem(
                        `${hasDeadline ? `(🔔)` : ""} ${path.basename(dirPath)}`,
                         vscode.TreeItemCollapsibleState.Collapsed,
                        { count: totalRecords, directory: dirPath, prov: "file", contextValue: "directory", icon: "folder"}
                    );
                });
                   
            // Get files
            const files = Object.keys(this.notesData.files)
                .filter(filePath => 
                    // Check if the file path is not in the filtered notes
                    (!this.filteredNotes || this.filteredNotes.some(item => item.parentPath === filePath && item.type !== "line")) &&
                    (!this.searchResults || this.searchResults.some(item => item.parentPath === filePath && item.type !== "line"))
                )
                .map(filePath => {
                    const fileData = this.notesData.files[filePath];
                    
                    const hasDeadline = Object.values(fileData)
                        .filter(Array.isArray)
                        .flat()
                        .some(note => note?.deadline && Boolean(note.deadline)) ;
                    
                    const totalRecords = Object.values(fileData)
                        .filter(Array.isArray)
                        .reduce((sum, category) => sum + category.length, 0);
                    
                    
                    if (this.viewId !== null && filePath !== file) return; // if the file path is not in the filtered notes
                        
                    // Return the NoteItem object
                    return new NoteItem(
                        `${hasDeadline? `(🔔)` : ""} ${path.basename(filePath)}`,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        { count: totalRecords, file: filePath, prov: "directories", contextValue: "file", icon: "file"}
                    );
                });
                
            // Get lines
            const lines = Object.keys(this.notesData.lines)
                .filter(filePath => 
                    // Check if the file path is not in the filtered notes
                     (!this.filteredNotes || this.filteredNotes.some(item => item.parentPath === filePath && item.type == "line")) &&
                     (!this.searchResults || this.searchResults.some(item => item.parentPath === filePath && item.type == "line"))
                )
                .map(filePath => {
                    if (this.viewId !== null && filePath !== file) return;
                    
                    const hasDeadline = this.notesData.lines[filePath].some(note => note?.deadline && Boolean(note.deadline)); // Check if the line has a deadline
                    
                    // Return the NoteItem object
                    return new NoteItem(
                        `${hasDeadline ? "(🔔)" : ""} ${path.basename(filePath)}`,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        { count: this.notesData.lines[filePath].length, contextValue: "lines", lineFile: filePath, icon: "pinned"}
                    );
                });

            // Get all items
            const allItems = [...items, ...directories, ...files, ...lines];

            // Check if allItems is empty
            if (allItems.length == 0) {
                allItems.push(new NoteItem("📭 No notes", vscode.TreeItemCollapsibleState.None));
            }
        
            // Add reset search item if needed
            if (this.filteredNotes || this.searchResults) {
                const label = this.filteredNotes ? "Reset the filter" : "Reset the search";
                const resetSearchItem = new NoteItem(
                    label,
                    vscode.TreeItemCollapsibleState.None,
                    {contextValue: "resetSearch", icon: "close"}
                );
                allItems.push(resetSearchItem); // Add reset search item to the end of the array
            } 
                    
            return allItems; // Return all items
                
        }
            
        // Check if the element is a directory
        if (element.context.directory) {
            const dirPath =  this.notesData.directories[element.context.directory] || {}; // Get directory path
            
            // Get notes
            return Object.entries(dirPath)
                .flatMap(([type, notes]) => 
                    (Array.isArray(notes) ? notes : [])
                        .filter(note => {
                            // Check if the note is not in the filtered notes
                            const isFound = !this.filteredNotes || this.filteredNotes.some(item => item.id === note.id);
                            const searchFound = !this.searchResults || this.searchResults.some(item => item.id === note.id)
                            return isFound && searchFound; // Return true if the note is not in the filtered notes
                        })
                        .map(note => {
                            // Return the NoteItem object
                            note.prov = "directories"; // Set provider

                            // Set label
                            const label = note.type === 'checklist' 
                                ? `📋 ${note.content.name || 'Checklist'}`
                                : note.content;
                                
                            // Return the NoteItem object
                            return new NoteItem(label, 
                                note.type === 'checklist' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Collapsed, 
                                { ...note, contextValue: note.type === 'checklist' ? 'checklist' : "noteItem", dirpath: element.context.directory, icon: note.type === 'checklist' ? "tasklist" : "notebook" }
                            );
                        })
                );
        }
            
        // Check if the element is a file
        if (element.context.file) {
            const fileNotes = this.notesData.files[element.context.file] || {}; // Get file notes
            
            // Get notes from file
            return Object.entries(fileNotes)
                .flatMap(([type, notes]) => 
                    (Array.isArray(notes) ? notes : [])
                    .filter(note => {
                        // Check if the note is not in the filtered notes
                        const isFound = !this.filteredNotes || this.filteredNotes.some(item => item.id === note.id);
                        const searchFound = !this.searchResults || this.searchResults.some(item => item.id === note.id)
                        return isFound && searchFound; // Return true if the note is not in the filtered notes
                    })
                    .map(note => {
                        const totalItems = note.type == "checklist" ? note.content.items.length : null; // Get total items
                        const completedItems = note.type == "checklist" ? note.content.items.filter(item => item.done).length : null; // Get completed items
                        const progress = note.type == "checklist" ? totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0 : null; // Get progress
                        const color = note.type == "checklist" ? getProgressColor(progress) : null; // Get color
                        note.prov = "files";
                        // Set label
                        const label = note.type === 'checklist' 
                            ? `${note.content.name} (${totalItems}, ${color} ${progress}%)` || 'Checklist'
                            : note.content;
                                
                        // Return the NoteItem object
                        return new NoteItem(label, 
                            note.type === 'checklist' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Collapsed, 
                            { ...note, contextValue: note.type === 'checklist' ? "checklist" : "noteItem", filepath: element.context.file, icon: note.type === 'checklist' ? "tasklist" : "notebook"}
                        );
                    })
                );
        }
            
        // Check if the element is a line
        if (element.context.lineFile) {
            const filePath = element.context.lineFile;
                
            // Get notes
            return this.notesData.lines[filePath]
                .filter(note => {
                    const isFound = !this.filteredNotes || this.filteredNotes.some(item => item.id === note.id);
                    const searchFound = !this.searchResults || this.searchResults.some(item => item.id === note.id)
                    return isFound && searchFound;
                })
                .map(note =>
                    new NoteItem(`Line ${note.line}: ${note.content}`, vscode.TreeItemCollapsibleState.Collapsed, { ...note, prov: "lines", path: filePath,  contextValue: "line", linepath: filePath, icon: "pinned-dirty"})
                );
        }
        
        // Check if the element is a checklist
        if (element.context.type === 'checklist') {
            // If the element is a checklist
            if (!element.context.content || !element.context.content.items || !Array.isArray(element.context.content.items)) {
                return [new NoteItem("📭 Checklist is empty", vscode.TreeItemCollapsibleState.None)]; // Return empty array
            }

            const filePath = element.context.prov; // Get file path
                
            // Get notes from file
            return element.context.content.items.map((item, index) => 
                new NoteItem(
                    item.done ? `✅ ${item.text}` : `⬜ ${item.text}`,
                    vscode.TreeItemCollapsibleState.None,
                    { ...item, prov: "directories", path: filePath, checklistId: element.context.id, index, type: element.context.type, contextValue: "checklistItem" }
                )
            );
        }
                
            
        // Check if the element is a note
        if (element.context.id) {
            return [
                new NoteItem(`- ID: ${element.context.id}`, vscode.TreeItemCollapsibleState.None),
                new NoteItem(`- Type: ${element.context.type}`, vscode.TreeItemCollapsibleState.None),
                new NoteItem(`- Content: ${element.context.content}`, vscode.TreeItemCollapsibleState.None),
                new NoteItem(`- Created: ${new Date(element.context.createdAt).toLocaleString()}`, vscode.TreeItemCollapsibleState.None),
                element.context?.deadline ? new NoteItem(`🔔 Deadline: ${formatDeadlineStatus(element.context?.deadline)}`, vscode.TreeItemCollapsibleState.None) : "",
                ...(element.context.line ? [new NoteItem(`- Line: ${element.context.line}`, vscode.TreeItemCollapsibleState.None)] : [])
            ];
        }
            
        return []; // Return empty array if the element is not a note
              
    }

}

class NoteItem extends vscode.TreeItem {
    constructor(label, collapsibleState, context = {}) {
        const settings = getProTaskerSettings()
        let converToTimeago = context?.createdAt ? new Date(context.createdAt).toLocaleString() : "", description = "";
        super(label, collapsibleState);
        this.context = context;
        
        this.notifiedDeadlines = new Set();
        
        this.contextValue = this.context.contextValue || context.type || "unknown";
        this.dirpath = this.context.dirpath || null
        this.filepath = this.context.filepath || null
        this.linepath = this.context.linepath || null
        if(context.createdAt){
            if(settings.showTimeAgo) converToTimeago = `| ${timeago.format(new Date(context.createdAt))}` || ""
        }

        this.tooltip = `${((typeof context.content == "object" ? context.name : context.content) || label)} ${converToTimeago}`;
        description = context?.count ? `(${context.count})` : (`${context.type ? `(${context.type})` : ""} ${converToTimeago}`)
        
        this.description = description;

      

        if(settings.notificatons){
            if (context?.deadline) {
                const notifiedDeadlines = this.notifiedDeadlines;
                const deadline = new Date(context.deadline);
                const now = new Date().getTime();
                const diff = deadline.getTime() - now;

                if (diff < 3600000 && diff > 0 && !notifiedDeadlines.has(context.id)) {
                    this.iconPath = new vscode.ThemeIcon("clock", new vscode.ThemeColor("notificationsWarningIcon.foreground"));
                    notifiedDeadlines.add(context.id); // Помечаем как уведомлённое
                } else if (diff <= 0 && !notifiedDeadlines.has(context.id)) {
                    this.iconPath = new vscode.ThemeIcon("error", new vscode.ThemeColor("notificationsErrorIcon.foreground"));
                    notifiedDeadlines.add(context.id);
                } else {
                    this.iconPath = new vscode.ThemeIcon("note");
                }
            }
        }
    }
}

function getIconPath(context, iconName) {
    return vscode.Uri.file(path.join(context.extensionPath, 'icons', `${iconName}`));
}

function formatDeadlineStatus(deadlineDate) {
    if (!deadlineDate) return "";

    const deadline = new Date(deadlineDate);
    const now = new Date();
    
    const diffTime = deadline.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let statusText = "";

    if (diffTime < 0) {
        statusText = `🔴 Overdue (${Math.abs(diffDays)} days ago)`;
    } else if (diffDays === 0) {
        statusText = `🟡 Today!`;
    } else if (diffDays === 1) {
        statusText = `🟢 Tomorrow`;
    } else {
        statusText = `🟢 Left ${diffDays} days.`;
    }

    return `${statusText}: ${deadline.toLocaleString()}`;
}

function getProgressColor(percent) {
    if (percent <= 30) return "🔴"; // Красный
    if (percent <= 70) return "🟠"; // Оранжевый
    return "🟢"; // Зеленый
}

function getProTaskerSettings(){
    const config = vscode.workspace.getConfiguration('protasker');

    return {
        language: config.get('language'),
        customTypes: config.get('customTypes'),
        noteDisplay: config.get('noteDisplay'),
        highlightColor: config.get('highlightColor'),
        showTimeAgo: config.get('showTimeAgo'),
        notificatons: config.get('notificatons')
    }

}

module.exports = { NoteManager };