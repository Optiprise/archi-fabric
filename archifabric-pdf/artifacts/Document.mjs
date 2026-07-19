/**
 * @module artifacts/Document
 * @description The root artifact for generating the document structure.
 * Wraps the content in a main container, handles the front page placeholder,
 * and sets the document title/filename based on the label expression.
 * Supports modular building blocks by seamlessly expanding nested Views.
 */
import { Artifact } from '../core/Artifact.mjs';
import { ModelStructure } from '../core/ModelStructure.mjs';

export default class Document extends Artifact {
    constructor(artifactory) {
        super('Document', artifactory);
        this.helpUrl = 'https://optiprise.nl/archi-fabric/?view=id-a758bf44f0c44d22be8a1ddc6c385193';
    }

    render(modelElement, targetElement) {
        this.lb.enter(`${this.name}.render(model: ${modelElement.name}, target: ${targetElement.name})`);

        try {
            const { baseName, params: inlineParams } = this.parseTemplateName(modelElement.name);
            const baseCssClass = this.markup.genHtmlClass(baseName);
            const customCssClass = inlineParams['class'] ? ` ${inlineParams['class']}` : '';
            const elementId = (targetElement?.id) || modelElement.id;

            // 1. Generate Root HTML Container
            this.markup.appendContent(`<div id="id-${elementId}" class="${baseCssClass}${customCssClass}">\n`);

            // 2, 3, 4. Setup Metadata
            this._setupMetadata(modelElement, targetElement);

            // 5. Process Nested Children via ModelStructure
            const modelStructure = new ModelStructure(this.lb, modelElement);
            const pairs = modelStructure.getTemplateTargetPairs();
            this._processTemplatePairs(pairs, targetElement);

            // 6. Close Root HTML Container
            this.markup.appendContent(`</div>\n`);

        } catch (err) {
            this.lb.error(`Error during rendering of Document: ${err.message}`, modelElement);
        } finally {
            this.lb.leave();
        }
    }

    /**
     * Sets up document metadata, including the front page placeholder, the document title,
     * and evaluates expressions in the documentation.
     * @param {Object} modelElement - The model element defining the document.
     * @param {Object} targetElement - The actual target element.
     * @private
     */
    _setupMetadata(modelElement, targetElement) {
        // 2. Insert Frontpage Placeholder (if applicable)
        if (typeof this.markup.insertFrontPagePlaceholder === 'function') {
            this.markup.insertFrontPagePlaceholder(targetElement);
        }

        // 3. Document Title / Filename context
        if (modelElement.labelExpression) {
            const parsedTitle = this.parseExpression(modelElement.labelExpression, targetElement);
            if (parsedTitle && parsedTitle.trim() !== '') {
                this.globalVars.set('documentTitle', parsedTitle);
                this.lb.log(`Document title set to: ${parsedTitle}`);
            }
        }

        // 4. SILENT EXPRESSION PARSING 
        // We parse the documentation to trigger any ${set:var:val} commands globally.
        // We explicitly DO NOT call renderElementDocumentation() here because we don't 
        // want to print it as HTML. The visual 'Documentation' artifact handles printing.
        if (modelElement.documentation) {
            this.parseExpression(modelElement.documentation, targetElement);
        }
    }

    /**
     * Resolves a target node to its actual target, dereferencing views if it is a reference.
     * @param {Object} targetNode - The template target node to resolve.
     * @returns {Object} The resolved target element.
     * @private
     */
    _resolveTarget(targetNode) {
        return $(targetNode).is('diagram-model-reference') ? targetNode.refView : targetNode;
    }

    /**
     * Processes template target pairs, resolving targets and calling processTemplateNode.
     * @param {Array} pairs - The template target pairs to process.
     * @param {Object} targetElement - The fallback target element if no targets are mapped.
     * @private
     */
    _processTemplatePairs(pairs, targetElement) {
        for (const pair of pairs) {
            const { template, targets } = pair;
            if (targets && targets.length > 0) {
                for (const targetNode of targets) {
                    this._processTemplateNode(template, this._resolveTarget(targetNode));
                }
            } else {
                // Fallback: inherit the data context of the Document itself if nothing is mapped
                this._processTemplateNode(template, targetElement);
            }
        }
    }

    /**
     * Recursive function to handle Views as modular building blocks.
     * @param {Object} templateNode - The template node to process.
     * @param {Object} currentTarget - The target element to use as the data context.
     * @private
     */
    _processTemplateNode(templateNode, currentTarget) {
        // RULE: If it's a View, it's a container. Open it and scan for executable groups.
        if ($(templateNode).is('diagram-model-reference') || $(templateNode).is('archimate-diagram-model')) {
            const refView = templateNode.refView || templateNode;
            this.lb.log(`Document: Expanding modular view '${refView.name}'...`);

            $(refView).children('diagram-model-group').each(group => {
                this._processTemplateNode(group, currentTarget);
            });
        }
        // RULE: Only diagram-model-groups can contain artifact modules.
        else if ($(templateNode).is('diagram-model-group')) {
            const parsed = this.parseTemplateName(templateNode.name);
            this.artifactory.render(parsed.baseName, templateNode, currentTarget);
        }
        else {
            this.lb.log(`Warning: Ignored unsupported template node type: ${templateNode.type}`);
        }
    }
}