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
        this.helpUrl = 'https://optiprise.nl/archi-fabric/?view=model';
    }

    render(modelElement, targetElement) {
        this.lb.enter(`${this.name}.render(model: ${modelElement.name})`);
        
        try {
            const { baseName, params: inlineParams } = this.parseTemplateName(modelElement.name);
            const baseCssClass = this.markup.genHtmlClass(baseName);
            const customCssClass = inlineParams['class'] ? ` ${inlineParams['class']}` : '';
            const elementId = (targetElement && targetElement.id) || modelElement.id;

            // 1. Generate Root HTML Container
            this.markup.appendContent(`<div id="id-${elementId}" class="${baseCssClass}${customCssClass}">\n`);

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

            // 4. SILENT EXPRESSION PARSING (The missing link!)
            // We parse the documentation to trigger any ${set:var:val} commands globally.
            // We explicitly DO NOT call renderElementDocumentation() here because we don't 
            // want to print it as HTML. The visual 'Documentation' artifact handles printing.
            if (modelElement.documentation) {
                this.parseExpression(modelElement.documentation, targetElement);
            }

            // 5. Process Nested Children via ModelStructure
            const modelStructure = new ModelStructure(this.lb, modelElement);
            const pairs = modelStructure.getTemplateTargetPairs(targetElement);

            // HELPER: Recursive function to handle Views as modular building blocks
            const processTemplateNode = (templateNode, currentTarget) => {
                // RULE: If it's a View, it's a container. Open it and scan for executable groups.
                if ($(templateNode).is('diagram-model-reference') || $(templateNode).is('archimate-diagram-model')) {
                    const refView = templateNode.refView || templateNode;
                    this.lb.log(`Document: Expanding modular view '${refView.name}'...`);
                    
                    $(refView).children('diagram-model-group').each(group => {
                        processTemplateNode(group, currentTarget);
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
            };

            // Loop through all mapped pairs and process them
            for (const pair of pairs) {
                const resolvedTarget = pair.target || targetElement;
                processTemplateNode(pair.template, resolvedTarget);
            }

            // 6. Close Root HTML Container
            this.markup.appendContent(`</div>\n`);
            
        } catch (err) {
            this.lb.error(`Error during rendering of Document: ${err.message}`, modelElement);
        } finally {
            this.lb.leave();
        }
    }
}