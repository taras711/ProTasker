
const vscode = require('vscode');
/**
 * commandHelper class for the extension.
 * @class
 * @classdesc commandHelper class for the extension.
 * @author taras711
 * @since 1.0.0
 * @version 1.0.0
 * @description This class is the entry point of the extension.
 * It contains the main methods and properties of the extension.
 * @property {vscode.ExtensionContext} context The extension context.
 * @property {Array} registerComands The array of registered commands.
 * @method comands Registers a command or array of commands.
 * @method register Registers a command with the extension context.
 * If the command is already registered, it will be overwritten.
 * @see {@link https://code.visualstudio.com/docs/extensionAPI/vscode-api#_a-nameregistrationa-commands}
 * @see {@link https://code.visualstudio.com/docs/extensionAPI/vscode-api#_a-nameregistrationa-commands}
 * @returns {Promise<void>}
 */
class commandHelper {
    constructor(context){
        this.context = context; // extension context
        this.registerComands = []; // registered commands array
    }

    /**
     * Registers a command or array of commands. If the command is already registered, it will be overwritten.
     * @param {string|string[]} comand The command or array of commands to register. This should be a string or array of strings without the `protasker.` prefix.
     * @param {boolean} [subscriptions=true] Whether to add this command to the list of subscriptions.
     * @returns {Promise<void>}
     */
    async comands(comand, subscriptions = true){
        
        if(comand instanceof Array){
            comand.map(async com => {
                this.registerComands.push({comand:com, subscriptions: subscriptions});
            });
        }else{
            this.registerComands.push({comand:comand, subscriptions: subscriptions})
        }
    }

    /**
     * Registers a command. If the command is already registered, it will be overwritten.
     * @param {string} comand The command to register. This should be a string without the `protasker.` prefix.
     * @param {function} callback The callback function to run when the command is invoked.
     * If the command is given a parameter, it will be passed to the callback function.
     * @returns {Promise<void>}
     */
    async set(comand, callback){
        let registeredCommands = null;  // registered command
        const comands = this.registerComands; // get comands
        comands.map(async item=>{
            if(item.comand !== comand) return;
            registeredCommands = vscode.commands.registerCommand(`protasker.${item.comand}`, async (param) => {
                if(param) param = await param; // get param
                return callback(param); // run callback
            });
            if(item.subscriptions) await this.register(registeredCommands); // add to subscriptions
        });
    }

    /**
     * Registers a command with the extension context. If the command is already registered, it will be overwritten.
     * @param {vscode.Disposable} comand The command to register. This should be a `vscode.Disposable` object.
     * @returns {Promise<void>}
     */
    async register(comand){
        if(comand && comand !== null){
            this.context.subscriptions.push(comand)
        }
    }
}

module.exports = {commandHelper}