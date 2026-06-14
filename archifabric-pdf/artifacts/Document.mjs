/**
 * @module artifacts/Document
 * @description The root composite artifact representing the entire generated document.
 * It parses global variables, initializes the main HTML shell, and delegates the 
 * rendering of all child components (like Sections, TOC, and CSS artifacts).
 */
import { Artifact } from '../core/Artifact.mjs';
import { ModelStructure } from '../core/ModelStructure.mjs';

export default class Document extends Artifact { 
    /**
     * Initializes the Document artifact.
     * @param {Object} artifactory - The main Artifactory instance.
     */
    constructor(artifactory) {
        super('Document', artifactory);
    }

    /**
     * Renders the root document structure.
     * @param {Object} modelElement - The Archi template element.
     * @param {Object} targetElement - The actual Archi element providing the context.
     */
    render(modelElement, targetElement) {
        this.lb.enter(`${this.name}.render(model: ${modelElement.name})`);
        
        // 1. Parse global variables from the document's documentation field
        const docText = modelElement.documentation || '';
        docText.split(/\r?\n/).forEach(line => {
            const matches = line.match(/\${(.*?)}/g) || [];
            matches.forEach(expr => {
                const inner = expr.slice(2, -1);
                const separatorIndex = inner.indexOf(':');
                
                // Skip commands intended for the ExpressionParser (like ask, var, name)
                if (separatorIndex > -1 && !['ask', 'var', 'name', 'property', 'header'].includes(inner.slice(0, separatorIndex).trim())) {
                    const key = inner.slice(0, separatorIndex).trim();
                    const value = inner.slice(separatorIndex + 1).trim();
                    
                    this.lb.log(`Setting global var from documentation: ${key} = ${value}`);
                    this.globalVars.set(key, value);
                }
            });
        });

        // 2. Evaluate Document Title
        const rawLabel = modelElement.labelExpression || modelElement.name;
        const documentTitle = this.parseExpression(rawLabel, targetElement);
        this.globalVars.set('documentTitle', documentTitle);

        // 3. Setup the Document HTML Shell
        const cssClass = this.markup.genHtmlClass(modelElement.name);
        this.markup.appendContent(`<div id="${targetElement.id}" class="${cssClass}">\n`);
        
        // Insert placeholder for the Front Page (TOC is now handled by its own Artifact!)
        this.markup.insertFrontPagePlaceholder();

        // 4. Process Child Artifacts using Spatial Pairing (Template -> Targets)
        const modelStructure = new ModelStructure(this.lb, modelElement);
        const structuralPairs = modelStructure.getTemplateTargetPairs();

        for (const pair of structuralPairs) {
            const { template, targets } = pair;
            const artifactName = template.name;

            let templateModel = template;
            if ($(template).is('diagram-model-reference') && template.refView) {
                const matchedGroup = $(template.refView).children('diagram-model-group')
                    .filter(g => (g.labelExpression || g.name) === template.name).first();
                if (matchedGroup) templateModel = matchedGroup;
            }

            if ($(template).is('diagram-model-reference')) {
                if (targets.length > 0) {
                    for (const targetNode of targets) {
                        const actualTarget = $(targetNode).is('diagram-model-reference') ? targetNode.refView : targetNode;
                        this.artifactory.render(artifactName, templateModel, actualTarget);
                    }
                } else {
                    const actualTarget = template.refView ? template.refView : template;
                    this.artifactory.render(artifactName, templateModel, actualTarget);
                }
            } else if ($(template).is('diagram-model-group')) {
                // E.g., nested Section, TOC, or custom container
                this.artifactory.render(artifactName, templateModel, targetElement);
            } else {
                // Notes, lines, or specific artifacts like CSS
                this.artifactory.render(artifactName, templateModel, targetElement);
            }
        }

        // 5. Close the Document HTML Shell
        this.markup.appendContent(`</div>\n`);
        this.lb.leave();
    }
}