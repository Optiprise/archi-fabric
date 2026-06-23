/**
 * @module artifacts/Section
 * @description A composite artifact representing a logical section or chapter in the document.
 * It renders its own HTML wrapper (<section>). If a label expression is provided, it evaluates
 * it as a proper header, increases the document level, and adds it to the TOC.
 * If left empty, it acts purely as a structural HTML container (no heading, no TOC level change).
 * It intelligently pairs template references with explicitly defined target views and seamlessly
 * converts visual notes into parsed Markdown text blocks. Allows custom CSS classes via the name field.
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

        this.helpUrl = 'https://optiprise.nl/archi-fabric/?view=id-7fe76c98f54c4177b125063dc166f1e5';
        
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

        // 2. Extract base name and optional custom parameters (e.g., class=page-break)
        const { baseName, params } = this.parseTemplateName(modelElement.name);
        
        // Generate the base CSS class, and append any custom class if provided
        const baseCssClass = this.markup.genHtmlClass(baseName);
        const customCssClass = params['class'] ? ` ${params['class']}` : '';
        const cssClass = baseCssClass + customCssClass;
        
        // ONLY increase the document depth if this section has a visible heading
        if (isHeading) {
            this.markup.levelUp(); 
        }
        
        // 3. Open the HTML Section using the combined CSS classes
        this.markup.appendContent(`<section id="${targetElement.id}" class="${cssClass}">\n`);
        
        // 4. Render Title as a Header
        if (isHeading) {
            this.markup.appendContent(this.markup.header(displayTitle, modelElement.id));
        }

        // 5. Render Documentation
        if (modelElement.documentation) {
            const parsedDoc = this.parseExpression(modelElement.documentation, targetElement);
            if (parsedDoc && parsedDoc.trim() !== '') {
                this.markup.appendContent(this.markup.parse(parsedDoc) + '\n');
            }
        }

        // 6. Process Child Artifacts using Spatial Pairing (Template -> Targets)
        const modelStructure = new ModelStructure(this.lb, modelElement);
        const structuralPairs = modelStructure.getTemplateTargetPairs();

        for (const pair of structuralPairs) {
            const { template, targets } = pair;
            
            // Handle standard visual notes directly as text blocks
            if ($(template).is('diagram-model-note')) {
                this.lb.log(`Processing Note element as static Markdown text.`);
                const rawText = template.labelExpression || template.content || template.name || '';
                const evaluatedText = this.parseExpression(rawText, targetElement);
                
                if (evaluatedText) {
                    this.markup.appendContent(this.markup.parse(evaluatedText) + '\n');
                }
                continue; 
            }

            // Route standard artifacts
            let rawArtifactName = template.name;
            let templateModel = template;

            // Resolve the actual template model if it's a reference to a view.
            if ($(template).is('diagram-model-reference') && template.refView) {
                // Try to find a group matching the reference's name
                let matchedGroup = $(template.refView).children('diagram-model-group')
                    .filter(g => (g.labelExpression || g.name) === template.name).first();
                
                // If not found, intelligently fallback to the FIRST group inside the view
                if (!matchedGroup || !matchedGroup.id) {
                    matchedGroup = $(template.refView).children('diagram-model-group').first();
                }

                // If a group was found, use its raw name (including parameters) for routing
                if (matchedGroup && matchedGroup.id) {
                    templateModel = matchedGroup;
                    rawArtifactName = templateModel.name;
                }
            }

            if ($(template).is('diagram-model-reference')) {
                if (targets.length > 0) {
                    for (const targetNode of targets) {
                        const actualTarget = $(targetNode).is('diagram-model-reference') ? targetNode.refView : targetNode;
                        this.artifactory.render(rawArtifactName, templateModel, actualTarget);
                    }
                } else {
                    const actualTarget = template.refView ? template.refView : template;
                    this.artifactory.render(rawArtifactName, templateModel, actualTarget);
                }
            } else if ($(template).is('diagram-model-group')) {
                this.artifactory.render(rawArtifactName, templateModel, targetElement);
            } else {
                this.artifactory.render(rawArtifactName, templateModel, targetElement);
            }
        }

        // 7. Close the HTML Section
        this.markup.appendContent(`</section>\n`);
        
        // ONLY decrease the document depth if we increased it earlier
        if (isHeading) {
            this.markup.levelDown(); 
        }

        this.lb.leave();
    }
}