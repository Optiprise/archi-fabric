/**
 * @module utils/Logbook
 * @description A utility class for structured logging, debugging, and execution tracing.
 * Provides a hierarchical ASCII tree view of the execution flow based on debug levels.
 * Automatically handles critical error display, visual markers, and documentation links.
 */

export class LogBook {
    static LEVELS = {
        ERROR: 0,
        INFO: 1,  
        DEBUG: 2  
    };

    /**
     * Initializes the LogBook with a specific verbosity level.
     * @param {number} [debugLevel=0] - The verbosity level (default is ERROR).
     */
    constructor(debugLevel = LogBook.LEVELS.ERROR) {
        this.debugLevel = debugLevel;
        this.functionLevel = 0;
        this.stack = [];
        
        // Define a generic fallback URL for core/framework errors
        this.defaultHelpUrl = 'https://optiprise.nl/archi-fabric/?view=model';
        
        if (this.debugLevel >= LogBook.LEVELS.INFO) {
            console.show();
        }
    }

    /**
     * Logs the entry point of a function/method and builds the visual tree.
     * @param {string} functionName - The name of the function or block being entered.
     */
    enter(functionName) {
        if (this.debugLevel >= LogBook.LEVELS.INFO) {
            console.log('│ '.repeat(this.functionLevel) + '├─┐ ' + functionName);
        }
        this.stack.push(functionName);
        this.functionLevel++;
    }

    /**
     * Logs the exit point of a function/method and collapses the visual tree.
     * @param {any} [returnValue] - Optional return value to display in the log.
     */
    leave(returnValue) {
        this.functionLevel = Math.max(0, this.functionLevel - 1);
        this.stack.pop();
        
        if (this.debugLevel >= LogBook.LEVELS.INFO) {
            const logValue = (returnValue !== undefined) ? `├─┘ return(${returnValue})` : '│ ┴';
            console.log('│ '.repeat(this.functionLevel) + logValue);    
        }
    }

    /**
     * Logs a detailed debug message inside the current tree level.
     * @param {string} entry - The message to log.
     */
    log(entry) {
        if (this.debugLevel >= LogBook.LEVELS.DEBUG) {
            console.log('│ '.repeat(this.functionLevel) + '├ ' + entry);
        }
    }

    /**
     * Logs a critical error, marks the faulty element with a red border, 
     * opens the containing view in the UI, provides a documentation link, and aborts execution.
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

        // --- VISUAL ERROR MARKER & VIEW FOCUS ---
        if (contextElement) {
            try {
                // Ensure the element stops inheriting default colors so our red border applies
                contextElement.deriveLineColor = false; 
                
                // Give the element a thick red border to stand out
                contextElement.lineColor = "#FF0000";
                contextElement.lineWidth = 3;
                
                // Determine which view contains this element and open it in the UI
                if (contextElement.view && typeof contextElement.view.openInUI === 'function') {
                    contextElement.view.openInUI();
                }
            } catch(e) {
                // Do not swallow exceptions completely. 
                // Log it at debug level, as this is expected for non-visual concepts.
                this.log(`Could not apply visual error marker/focus to element: ${e.message}`);
            }
        }

        // --- GENERIC HELP URL FALLBACK ---
        let helpHint = "";
        // Only append the generic URL if the error message doesn't already contain a specific one
        if (!errorMessage.includes("[Documentation & Help:")) {
            helpHint = `\n[Documentation & Help: ${this.defaultHelpUrl}]`;
        }

        const tree = (this.debugLevel >= LogBook.LEVELS.INFO) 
            ? '┴ '.repeat(this.functionLevel) + '┴ ' 
            : '';
        
        console.log(`\n${tree}ERROR: ${errorMessage} ${helpHint}`);
        
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
        
        // Removed the locationHint from the alert since the view is now opened automatically
        window.alert(`ArchiFabric Error:\n${errorMessage}\n${helpHint}\n\nPlease check the Script Console for details.`);
        
        exit(); 
    }

    /**
     * Semantic alias for error(), meant for try/catch blocks handling thrown Exceptions.
     * @param {Error} exception - The caught JS exception.
     * @param {Object} [contextElement=null] - The Archi element where the error occurred.
     */
    exception(exception, contextElement = null) {
        this.error(exception, contextElement);
    }
}