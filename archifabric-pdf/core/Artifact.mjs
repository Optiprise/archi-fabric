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
        
        /** * Optional URL pointing to documentation or troubleshooting guides for this artifact.
         * Subclasses can override this to provide specific help links upon failure.
         * @type {string|null} 
         */
        this.helpUrl = null;
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

    /**
     * Parses the raw name of a template element to extract the base artifact name and any inline parameters.
     * Expected format: "ArtifactName param1=value1 param2=value2"
     * @param {string} rawName - The raw name string from the Archi element.
     * @returns {Object} An object containing { baseName: string, params: Object }.
     */
    parseTemplateName(rawName) {
        if (!rawName || typeof rawName !== 'string') {
            return { baseName: '', params: {} };
        }
        
        const parts = rawName.trim().split(/\s+/);
        const baseName = parts.shift();
        const params = {};
        
        parts.forEach(part => {
            const splitIndex = part.indexOf('=');
            if (splitIndex > -1) {
                const key = part.slice(0, splitIndex).trim();
                const value = part.slice(splitIndex + 1).trim();
                if (key) {
                    params[key] = value;
                }
            }
        });
        
        return { baseName, params };
    }

    /**
     * Finds an ArchiMate relationship visually attached to the provided template node (e.g., a Note).
     * @param {Object} node - The visual node (usually a diagram-model-note) in the template.
     * @returns {Object|null} The ArchiMate relationship (concept) if found, otherwise null.
     */
    getAttachedTemplateRelationship(node) {
        if (!node) return null;
        let foundRel = null;
        try {
            // Retrieve all visual connections originating from this node
            const connections = $(node).outRels();
            
            for (const conn of connections) {
                const target = conn.target;
                
                // Check if the target of the connection is itself a relationship 
                // (identifiable by having an underlying ArchiMate concept with a source and target)
                if (target && target.concept && target.concept.source && target.concept.target) {
                    this.lb.log(`Attached relationship found: ${target.concept.type}`);
                    foundRel = target.concept;
                    break;
                }
            }
        } catch (e) {
            this.lb.log(`Warning checking attached relationships: ${e.message}`);
        }
        return foundRel;
    }
}