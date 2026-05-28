/*
 * Log en debug Class for logging all actions
 */
 
export default class LogBook {
    constructor(debugLevel) {
        this.debugLevel = debugLevel;
        this.functionLevel = 0;
        this.stack = [];
        if (debugLevel > 0) console.show();
    }


    enter(functionName) {
        if (this.debugLevel > 0) {
            console.log('│ '.repeat(this.functionLevel)+'├─┐ '+functionName);
        }
        this.stack.push(functionName);
        this.functionLevel++;
    }

    leave(returnValue) {
        this.functionLevel--;
        this.stack.pop();
        if (this.debugLevel > 0) { 
            if (returnValue) {
                console.log('│ '.repeat(this.functionLevel)+'├─┘ return('+returnValue+')');    
            }
            console.log('│ '.repeat(this.functionLevel+1));
        }
    }

    log(entry) {
        if (this.debugLevel > 1) {
            console.log('│ '.repeat(this.functionLevel)+'├ '+entry);
        }
    }

    error(error) {
        let tree=(this.debugLevel > 0) ? '┴ '.repeat(this.functionLevel)+'┴ ': '';
        console.error(`${tree}Error: ${error}`);
        if (this.debugLevel == 0) {
            console.log(` =================[ Stack trace ]=================\n`);
            console.log(`docgen`);
            let i=0
            this.stack.forEach(stack => {
                console.log('│ '.repeat(i)+'├─┐ '+stack);
                i++;
        })

        }
        console.log('\nAbort program....');
        console.show();
        window.alert(error);
        exit();
    }

    exception(exception) {
        console.log('┴ '.repeat(this.functionLevel)+'┴ '+exception);
        console.log('Abort program..');
        exit();
    }
}
