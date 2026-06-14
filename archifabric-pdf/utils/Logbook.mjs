/**
 * @module utils/Logbook
 * @description A utility class for structured logging, debugging, and execution tracing.
 * Provides a hierarchical ASCII tree view of the execution flow based on debug levels.
 */

export class LogBook {
    static LEVELS = {
        ERROR: 0,
        INFO: 1,  
        DEBUG: 2  
    };

    constructor(debugLevel = LogBook.LEVELS.ERROR) {
        this.debugLevel = debugLevel;
        this.functionLevel = 0;
        this.stack = [];
        
        if (this.debugLevel >= LogBook.LEVELS.INFO) {
            console.show();
        }
    }

    enter(functionName) {
        if (this.debugLevel >= LogBook.LEVELS.INFO) {
            console.log('│ '.repeat(this.functionLevel) + '├─┐ ' + functionName);
        }
        this.stack.push(functionName);
        this.functionLevel++;
    }

    leave(returnValue) {
        this.functionLevel = Math.max(0, this.functionLevel - 1);
        this.stack.pop();
        
        if (this.debugLevel >= LogBook.LEVELS.INFO) {
            const logValue = (returnValue !== undefined) ? `├─┘ return(${returnValue})` : '│ ┴';
            console.log('│ '.repeat(this.functionLevel) + logValue);    
        }
    }

    log(entry) {
        if (this.debugLevel >= LogBook.LEVELS.DEBUG) {
            console.log('│ '.repeat(this.functionLevel) + '├ ' + entry);
        }
    }

    /**
     * Logs a critical error, marks the faulty element with a red border, and aborts execution.
     * @param {string|Error} error - The error message or native Error object.
     * @param {Object} [contextElement=null] - The Archi element where the error occurred (optional).
     */
/**
     * Logs a critical error, marks the faulty element with a red border, and aborts execution.
     * @param {string|Error} error - The error message or native Error object.
     * @param {Object} [contextElement=null] - The Archi element where the error occurred (optional).
     */
    error(error, contextElement = null) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Prevent infinite loops if jArchi is already attempting to exit, 
        // or if we are already in the abort phase.
        if (errorMessage.includes('__EXIT__') || this._isAborting) {
            throw error; 
        }
        this._isAborting = true;

        // --- VISUAL ERROR MARKER ---
        let locationHint = "";
        if (contextElement) {
            try {
                // Ensure the element stops inheriting default colors so our red border applies
                contextElement.deriveLineColor = false; 
                
                // Give the element a thick red border to stand out
                contextElement.lineColor = "#FF0000";
                contextElement.lineWidth = 3;
                
                // Determine which view contains this element to help the user find it
                if (contextElement.view) {
                    locationHint = `\n[Location: Look for the red-bordered element in view "${contextElement.view.name}"]`;
                }
            } catch(e) {
                this.log(`Could not apply visual error marker to element: ${e.message}`);
            }
        }

        const tree = (this.debugLevel >= LogBook.LEVELS.INFO) 
            ? '┴ '.repeat(this.functionLevel) + '┴ ' 
            : '';
        
        console.log(`\n${tree}ERROR: ${errorMessage} ${locationHint}`);
        
        console.log(`\n=================[ ArchiFabric Execution Stack ]=================`);
        console.log(`Engine.run()`);
        this.stack.forEach((stackItem, index) => {
            console.log('│ '.repeat(index) + '├─┐ ' + stackItem);
        });

        if (error instanceof Error && error.stack) {
            console.log(`\n=================[ Native JS Stack Trace ]=================`);
            console.log(error.stack);
        }

        console.log('\nAborting program...');
        console.show(); 
        window.alert(`ArchiFabric Error:\n${errorMessage}\n${locationHint}\n\nPlease check the Script Console for details.`);
        
        exit(); 
    }
}