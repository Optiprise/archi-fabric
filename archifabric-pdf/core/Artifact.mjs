/**
 * @module core/Artifact
 * @description Base class for all ArchiFabric rendering artifacts.
 * Every specific artifact (like Documentation, Section, Diagram) must extend this class
 * and implement the render() method.
 */
export class Artifact {
    /**
     * Initializes the base artifact.
     * @param {string} name - The unique name/identifier of the artifact (e.g., "Documentation").
     * @param {Object} artifactory - Reference to the main Artifactory instance.
     */
    constructor(name, artifactory) {
        this.name = name;
        this.artifactory = artifactory;
    }

    /**
     * Convenience getter for the LogBook instance.
     * @returns {Object} The LogBook instance.
     */
    get lb() {
        return this.artifactory.lb;
    }

    /**
     * Convenience getter for the Markup instance.
     * @returns {Object} The Markup instance.
     */
    get markup() {
        return this.artifactory.markup;
    }

    /**
     * Convenience getter for global variables.
     * @returns {Map} The global variables map.
     */
    get globalVars() {
        return this.artifactory.globalVars;
    }

    /**
     * Abstract render method. Must be overridden by subclasses.
     * @param {Object} modelElement - The Archi template element defining the layout.
     * @param {Object} targetElement - The actual Archi element containing the data to be rendered.
     * @throws {Error} If the subclass does not implement this method.
     */
    render(modelElement, targetElement) {
        throw new Error(`Method 'render()' must be implemented in artifact: ${this.name}`);
    }

    /**
     * Parses a label expression using the globally registered handlers.
     * @param {string} expression - The expression string to evaluate.
     * @param {Object} targetElement - The Archi element providing data.
     * @returns {string} The fully processed string.
     */
    parseExpression(expression, targetElement) {
        if (!expression) return "";
        return this.artifactory.parser.evaluate(expression, targetElement, this);
    }

    /**
     * Allows subclasses to register custom expression handlers.
     * @param {string} command - The command tag (e.g. 'header').
     * @param {Function} handler - The logic to execute.
     */
    registerExpressionHandler(command, handler) {
        this.artifactory.parser.registerHandler(command, handler);
    }
}