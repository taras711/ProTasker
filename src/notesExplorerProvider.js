const vscode = require('vscode');
const {NoteManager} = require("./manager");

/**
 * This class is responsible for providing data for the VS Code Tree View.
 * It inherits from the NoteManager class and provides methods for retrieving and filtering data.
 * @class
 * @classdesc This class is used to provide data for the VS Code Tree View.
 * @author taras711
 * @since 1.0.0
 * @version 1.0.0
 * @description This class is used to provide data for the VS Code Tree View.
 * It contains the main methods and properties of the Tree View.
 * @property {object} notesData - Data from notesData.json.
 * @property {vscode.EventEmitter} _onDidChangeTreeData - The event emitter for tree data changes.
 * @property {vscode.Event} onDidChangeTreeData - The event for tree data changes.
 * @property {vscode.ExtensionContext} context - The extension context.
 * @method refresh - Refreshes the tree data.
 * @method getTreeItem - Gets a TreeItem from a NoteItem.
 * @see {@link https://code.visualstudio.com/api/references/vscode-api#TreeDataProvider}
 * @see {@link https://code.visualstudio.com/api/references/vscode-api#TreeItem}
 * @see {@link https://code.visualstudio.com/api/references/vscode-api#ThemeIcon}
 */

class NotesExplorerProvider extends NoteManager{
    constructor(data, context) {
        super(); // Call the parent constructor
        this.notesData = data || {}; // Data from notesData.json
        this._onDidChangeTreeData = new vscode.EventEmitter(); // Event emitter
        this.onDidChangeTreeData = this._onDidChangeTreeData.event; // Event
        this.context = context; // Extension context
    }

    /**
     * Refreshes the tree data.
     * This function is used to notify the Tree View that the data has changed and it should refresh itself.
     * @memberof NotesExplorerProvider
     * @instance
     * @function refresh
     * @since 1.0.0
     * @description This function is used to notify the Tree View that the data has changed and it should refresh itself.
     */
    refresh() {
        this._onDidChangeTreeData.fire(); // Notify the Tree View that the data has changed
    }

    /**
     * Creates a VS Code TreeItem from a given NoteItem element.
     * 
     * This function constructs a TreeItem with properties such as label,
     * context value, collapsible state, and an optional command if the
     * element represents a checklist item. It also assigns an icon path
     * if provided in the element's context.
     * 
     * @param {object} element - The NoteItem to create a TreeItem from.
     * @returns {vscode.TreeItem} The created TreeItem with specified properties.
     */
    getTreeItem(element) {
        const treeItem = new vscode.TreeItem(element.label); // Create a TreeItem
        
        // Check if the element is a file
        if (element.contextValue === "checklistItem") {
            treeItem.command = {
                command: "protasker.toggleChecklistItem",
                title: "Toggle Checklist Item",
                arguments: [element] // Add the element as an argument
            };
        }
        
        treeItem.contextValue = element.contextValue; // Set the context value
        treeItem.collapsibleState = element.collapsibleState; // Set the collapsible state

        element.context?.icon ? treeItem.iconPath = treeItem.iconPath = element.iconPath || new vscode.ThemeIcon(element.context.icon): "undefined"; // Set the icon
        
        return treeItem; // Return the created TreeItem
    }

    /**
     * Retrieves the children of the given element from the notes data.
     * 
     * This function first checks if there is an active editor. If not, it returns
     * a single TreeItem with a label indicating that there is no active editor.
     * Otherwise, it calls the mainData function to retrieve the children of the
     * given element from the notes data.
     * 
     * @param {object} element - The element to get the children from.
     * @returns {Promise<Array<vscode.TreeItem>>} - A Promise that resolves to an array of TreeItem objects.
     * @since 1.0.0
     * @description This function is used by the Tree View to retrieve the children of a TreeItem.
     */
    async getChildren(element) {
        const editor = vscode.window.activeTextEditor;

        // Check if there is an active editor
        if(!editor){
            return [new this.noteItem("... No active editor", vscode.TreeItemCollapsibleState.None)]; // Return a single TreeItem
        }
        return await this.mainData(element) // Return the children of the element
    }
}

module.exports = { NotesExplorerProvider };
