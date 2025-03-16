const vscode = require('vscode');
class Main {
    constructor(context){
        this.context = context;
        this.registerComands = [];
    }

    async comands(comand, subscriptions = true){
        
        if(comand instanceof Array){
            comand.map(async com => {
                this.registerComands.push({comand:com, subscriptions: subscriptions});
            });
        }else{
            this.registerComands.push({comand:comand, subscriptions: subscriptions})
        }
    }

    async set(comand, callback){
        let registeredCommands = null;
        const comands = this.registerComands;
        comands.map(async item=>{
            if(item.comand !== comand) return;
            registeredCommands = vscode.commands.registerCommand(`protasker.${item.comand}`, async (param) => {
                if(param) param = await param;
                return callback(param);
            });
            if(item.subscriptions) await this.register(registeredCommands)
        });
    }

    async register(comand){
        if(comand && comand !== null){
            this.context.subscriptions.push(comand)
        }
    }
}

module.exports = {Main};