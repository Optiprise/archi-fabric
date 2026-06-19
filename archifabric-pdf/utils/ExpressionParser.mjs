/**
 * @module utils/ExpressionParser
 * @description Evaluates dynamic ArchiMate labelExpressions (e.g. ${name}, ${var:myVar}, ${ask:author}).
 * Supports an extensible plugin system where Artifacts can register their own custom tags.
 */
export class ExpressionParser {
    /**
     * @param {Object} artifactory - The main Artifactory instance for context access (LogBook, GlobalVars, etc.).
     */
    constructor(artifactory) {
        this.artifactory = artifactory;
        this.handlers = new Map();
        this._registerDefaultHandlers();
    }

    /**
     * Registers a new command handler for the expression parser.
     * @param {string} command - The command string (e.g., 'header' for ${header}).
     * @param {Function} handler - The callback function: (argsArray, targetElement, contextArtifact) => string.
     */
    registerHandler(command, handler) {
        this.artifactory.lb.log(`ExpressionParser: Registered custom handler for '\${${command}}'`);
        this.handlers.set(command, handler);
    }

    /**
     * Evaluates a label expression containing ${...} tags.
     * @param {string} expression - The raw label expression string.
     * @param {Object} targetElement - The Archi element providing the data.
     * @param {Object} contextArtifact - The artifact triggering the evaluation (for context like markup levels).
     * @returns {string} The fully evaluated string.
     */
    evaluate(expression, targetElement, contextArtifact) {
        if (!expression) return '';

        return expression.replace(/\${(.*?)}/g, (match, innerContent) => {
            const parts = innerContent.split(':');
            const command = parts[0];
            const args = parts.slice(1);

            if (this.handlers.has(command)) {
                try {
                    return this.handlers.get(command)(args, targetElement, contextArtifact);
                } catch (error) {
                    this.artifactory.lb.error(`Error evaluating \${${command}}: ${error.message}`);
                    return match;
                }
            }
            
            // Return unparsed match if no handler is found
            this.artifactory.lb.log(`Warning: No handler registered for expression \${${command}}`);
            return match; 
        });
    }

    /**
     * Registers the built-in, standard expression commands.
     * @private
     */
    _registerDefaultHandlers() {
        // ${name} -> Element name
        this.registerHandler('name', (args, target) => target ? target.name : '');

        // ${label} -> Archi Label property
        this.registerHandler('label', (args, target) => target && target.labelValue ? target.labelValue : '');

        // ${documentation} -> Element documentation
        this.registerHandler('documentation', (args, target) => target ? target.documentation : '');

        // ${property:propName} -> Get specific property value
        this.registerHandler('property', (args, target) => {
            const propName = args[0];
            const val = target.prop(propName);
            return val ? val : '';
        });

        // ${var:varName:defaultValue} -> Get from GlobalVars, fallback to default
        this.registerHandler('var', (args) => {
            const varName = args[0];
            const defaultValue = args[1] || '';
            return this.artifactory.globalVars.get(varName) || defaultValue;
        });

        // ${set:varName:value} -> Sets a variable in GlobalVars silently
        this.registerHandler('set', (args) => {
            const varName = args[0];
            // Rejoin the rest of the arguments in case the value contained colons (like URLs)
            const value = args.slice(1).join(':') || '';
            
            if (varName) {
                this.artifactory.globalVars.set(varName, value);
                this.artifactory.lb.log(`ExpressionParser: Set global variable '${varName}' to '${value}'`);
            }
            
            // Return empty string to remain invisible in the final rendered output
            return ''; 
        });

        // ${ask:varName} -> Get from GlobalVars, or prompt the user via UI if missing
        this.registerHandler('ask', (args) => {
            const varName = args[0];
            let val = this.artifactory.globalVars.get(varName);
            if (!val) {
                val = window.prompt(`Please provide a value for: ${varName}`, "");
                this.artifactory.globalVars.set(varName, val);
            }
            return val;
        });

        // ${currentDate} -> Localized current date
        this.registerHandler('currentDate', () => {
            const formatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
            return new Date().toLocaleString('nl-NL', formatOptions);
        });
        
        // ${hline} -> HTML Horizontal line
        this.registerHandler('hline', () => '<hr>\n');
    }
}