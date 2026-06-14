/**
 * @module artifacts/Section
 * @description A composite artifact representing a logical section or chapter in the document.
 * It renders its own HTML wrapper (<section>). If a label expression is provided, it evaluates
 * it as a proper header, increases the document level, and adds it to the TOC.
 * If left empty, it acts purely as a structural HTML container (no heading, no TOC level change).
 * It intelligently pairs template references with explicitly defined target views.
 */
import { Artifact } from '../core/Artifact.mjs';
import { ModelStructure } from '../core/ModelStructure.mjs';

export default class Section extends Artifact { 
    /**
     * Initializes the Section artifact and registers custom expression handlers.
     * @param {Object} artifactory - The main Artifactory instance.
     */
    constructor(artifactory) {
        super('Section', artifactory);
        
        // Retain the registration for the ${header} command for future use
        // (e.g., inside data-driven lists or tables like the Catalog).
        this.registerExpressionHandler('header', (args, targetElement, contextArtifact) => {
            const title = targetElement.name;
            return contextArtifact.markup.header(title, targetElement.id);
        });
    }

    /**
     * Renders the section, including its HTML wrapper, optional heading, documentation, and child artifacts.
     * @param {Object} modelElement - The Archi template element defining the section layout.
     * @param {Object} targetElement - The actual Archi element providing the data/context.
     */
    render(modelElement, targetElement) {
        this.lb.enter(`${this.name}.render(model: ${modelElement.name})`);
        
        // 1. Evaluate Title
        let displayTitle = '';
        if (modelElement.labelExpression) {
            displayTitle = this.parseExpression(modelElement.labelExpression, targetElement);
        }
        
        // Determine if this section acts as a visible heading in the document
        const isHeading = displayTitle && displayTitle.trim() !== '';

        // 2. Open the HTML Section
        const cssClass = this.markup.genHtmlClass(modelElement.name);
        
        // ONLY increase the document depth if this section has a visible heading
        if (isHeading) {
            this.markup.levelUp(); 
        }
        
        this.markup.appendContent(`<section id="${targetElement.id}" class="${cssClass}">\n`);
        
        // 3. Render Title as a Header
        if (isHeading) {
            this.markup.appendContent(this.markup.header(displayTitle, targetElement.id));
        }

        // 4. Render Documentation
        if (targetElement.documentation) {
            this.markup.appendContent(this.markup.parse(targetElement.documentation) + '\n');
        }

        // 5. Process Child Artifacts using Spatial Pairing (Template -> Targets)
        const modelStructure = new ModelStructure(this.lb, modelElement);
        const structuralPairs = modelStructure.getTemplateTargetPairs();

        for (const pair of structuralPairs) {
            const { template, targets } = pair;
            const artifactName = template.name;

            // Resolve the actual template model if it's a reference to a view.
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
                this.artifactory.render(artifactName, templateModel, targetElement);
            } else {
                 this.artifactory.render(artifactName, templateModel, targetElement);
            }
        }

        // 6. Close the HTML Section
        this.markup.appendContent(`</section>\n`);
        
        // ONLY decrease the document depth if we increased it earlier
        if (isHeading) {
            this.markup.levelDown(); 
        }

        this.lb.leave();
    }
}