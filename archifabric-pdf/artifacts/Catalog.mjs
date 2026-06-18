/**
 * @module artifacts/Catalog
 * @description Artifact that generates data-driven grids and repeating table structures.
 * It translates the visual X/Y layout of elements in the Archi template into an HTML table.
 * Integrated with the QueryBuilder to decouple Scope, Select, and Sort from the view hierarchy.
 */
import { Artifact } from '../core/Artifact.mjs';
import { ModelStructure } from '../core/ModelStructure.mjs';
import { QueryBuilder } from '../core/QueryBuilder.mjs';

export default class Catalog extends Artifact { 
    /**
     * Initializes the Catalog artifact.
     * @param {Object} artifactory - The main Artifactory instance.
     */
    constructor(artifactory) {
        super('Catalog', artifactory);
        this.helpUrl = 'https://optiprise.nl/archi-fabric/?view=model';
    }

    /**
     * Renders the catalog grid by fetching data elements and generating the HTML tables.
     * @param {Object} modelElement - The Archi template element.
     * @param {Object} targetElement - The actual Archi view or concept being processed.
     */
    render(modelElement, targetElement) {
        this.lb.enter(`${this.name}.render(model: ${modelElement.name})`);
        
        // 1. Analyze the Visual Grid
        const modelStructure = new ModelStructure(this.lb, modelElement);
        const structuralParams = modelStructure.getParameters();
        const xPos = modelStructure.xPositions;
        const yPos = modelStructure.yPositions;
        
        if (xPos.length === 0 || yPos.length === 0 || modelStructure.sortedElements.length === 0) {
            this.lb.error("Catalog template is empty or contains no valid grid elements.", modelElement);
            this.lb.leave();
            return;
        }

        // 2. Parse Parameters (Scope, Select, Sort)
        const { baseName, params: inlineParams } = this.parseTemplateName(modelElement.name);
        const baseCssClass = this.markup.genHtmlClass(baseName);
        const customCssClass = inlineParams['class'] ? ` ${inlineParams['class']}` : '';

        const scope = inlineParams['scope'] || 'view';
        const sort = inlineParams['sort'] || 'name';
        const pattern = inlineParams['pattern'] || null;

        // --- CONTEXT PRESERVATION ---
        let currentView = null;
        if (targetElement && targetElement.type === 'archimate-diagram-model') {
            currentView = targetElement;
            this.artifactory.currentRenderView = currentView;
        } else {
            currentView = this.artifactory.currentRenderView;
        }

        // 3. Query Target Data using QueryBuilder
        let finalElements = [];
        let sourceElement = null; // Hoisted so it is available in the cell loop

        try {
            if (modelStructure.archimateElement) {
                const templateType = modelStructure.archimateElement.type;
                let relationType = inlineParams['rel'] || null;

                const isTargetView = targetElement && targetElement.type === 'archimate-diagram-model';
                sourceElement = isTargetView ? null : (targetElement.concept || targetElement);

                if (modelStructure.archimateElement && !relationType) {
                    $(modelStructure.archimateElement).inRels().each(rel => {
                        if (rel.concept) relationType = rel.concept.type;
                    });
                }

                const qb = new QueryBuilder(modelElement, targetElement, this.lb);
                const rawElements = qb.fetch({
                    scope: scope,
                    currentView: currentView,
                    select: {
                        types: [templateType],
                        relationType: relationType,
                        sourceElement: sourceElement,
                        pattern: pattern
                    },
                    sort: sort
                });
                
                const uniqueConcepts = new Set();
                finalElements = rawElements.filter(node => {
                    if (!node.id || uniqueConcepts.has(node.id)) return false;
                    uniqueConcepts.add(node.id);
                    return true;
                });
                
                this.lb.log(`Catalog query resolved ${finalElements.length} unique ArchiMate elements.`);
            } else {
                this.lb.log("No ArchiMate context in template. Rendering as static grid.");
                finalElements = [{ obj: targetElement }];
            }
        } catch (error) {
            this.lb.error(`Failed to process data for Catalog: ${error.message}`, modelElement);
            this.lb.leave();
            return; 
        }

        // 4. Render Grid Layout
        this.markup.appendCss(`
            .${baseCssClass}-cell pre, .${baseCssClass}-cell code { white-space: pre-wrap !important; word-wrap: break-word !important; }
            .${baseCssClass}-cell img { max-width: 100% !important; height: auto !important; }
        `);

        const flexDir = structuralParams.listDirection === 'H' ? 'row' : 'column';
        const wrapperStyle = `display: flex; flex-direction: ${flexDir}; flex-wrap: wrap; gap: 10px; width: 100%;`;
        
        const elementId = (targetElement && targetElement.id) || modelElement.id;
        this.markup.appendContent(`<div id="id-${elementId}" class="${baseCssClass}-wrapper${customCssClass}" style="${wrapperStyle}">\n`);
        
        if (modelElement.labelExpression) {
            const displayTitle = this.parseExpression(modelElement.labelExpression, targetElement);
            if (displayTitle) this.markup.appendContent(this.markup.header(displayTitle, elementId));
        }

        if (modelElement.documentation) {
            this.markup.appendContent(this.markup.parse(modelElement.documentation) + '\n');
        }

        const totalWidth = xPos[xPos.length - 1]; 

        for (const item of finalElements) {
            const dataContext = item.concept || item.obj || item;
            
            this.markup.appendContent(`<table class="${baseCssClass}${customCssClass}" style="width: 100%; border-collapse: collapse; table-layout: fixed;">\n<colgroup>\n`);
            for (let i = 1; i < xPos.length; i++) {
                const colWidthPct = ((xPos[i] - xPos[i - 1]) / totalWidth) * 100;
                this.markup.appendContent(`  <col style="width: ${colWidthPct}%;">\n`);
            }
            this.markup.appendContent('</colgroup>\n');

            let currentRowY = -1;
            for (const childNode of modelStructure.sortedElements) {
                if (childNode.id === structuralParams.repeatElementID) continue;
                if (childNode.bounds.y !== currentRowY) {
                    if (currentRowY !== -1) this.markup.appendContent('</tr>\n');
                    this.markup.appendContent('<tr>\n');
                    currentRowY = childNode.bounds.y;
                }

                const colspan = xPos.indexOf(childNode.bounds.x + childNode.bounds.width - 1) - xPos.indexOf(childNode.bounds.x);
                const rowspan = yPos.indexOf(childNode.bounds.y + childNode.bounds.height - 1) - yPos.indexOf(childNode.bounds.y);

                let spanHtml = '';
                if (colspan > 1) spanHtml += ` colspan="${colspan}"`;
                if (rowspan > 1) spanHtml += ` rowspan="${rowspan}"`;

                let hAlign = childNode.textAlignment === 2 ? 'center' : (childNode.textAlignment === 4 ? 'right' : 'left');
                let vAlign = 'top';
                if (childNode.textPosition >= 3 && childNode.textPosition <= 5) vAlign = 'middle';
                else if (childNode.textPosition >= 6 && childNode.textPosition <= 8) vAlign = 'bottom';

                const cellClass = this.markup.genHtmlClass(childNode.name || 'cell');
                const cellStyle = `text-align: ${hAlign}; vertical-align: ${vAlign}; word-wrap: break-word; overflow-wrap: break-word;`;
                this.markup.appendContent(`  <td${spanHtml} class="${baseCssClass}-cell ${cellClass}" style="${cellStyle}">\n`);

                if ($(childNode).is('diagram-model-group') || $(childNode).is('diagram-model-reference')) {
                    // Dynamically resolve view references natively
                    let artifactName = childNode.name;
                    if ($(childNode).is('diagram-model-reference')) {
                        artifactName = childNode.name.split(/\s+/)[0];
                        const coreArtifacts = ['Document', 'Section', 'Catalog', 'Matrix', 'Diagram', 'TOC', 'CSS', 'Documentation'];
                        if (!coreArtifacts.includes(artifactName)) {
                            artifactName = 'Section';
                        }
                    }
                    this.artifactory.render(artifactName, childNode, dataContext);
                } else {
                    // --- ADVANCED FEATURE: EXPLICIT RELATIONSHIP PROXY MATCHING ---
                    let evalContext = dataContext;
                    const templateRel = typeof this.getAttachedTemplateRelationship === 'function' ? this.getAttachedTemplateRelationship(childNode) : null;
                    
                    if (templateRel && dataContext && dataContext.type && !dataContext.source) {
                        let foundRel = null;
                        
                        // Get all relationships of the required type connected to the current data element
                        $(dataContext).rels(templateRel.type).each(r => {
                            // Safely match the strict parent-child connection using the hoisted sourceElement
                            if (sourceElement && sourceElement.id) {
                                if ((r.source.id === sourceElement.id && r.target.id === dataContext.id) ||
                                    (r.target.id === sourceElement.id && r.source.id === dataContext.id)) {
                                    foundRel = r;
                                }
                            } else {
                                // If there is no parent context (e.g., outer catalog), just pick the first match
                                if (!foundRel) foundRel = r;
                            }
                        });

                        if (foundRel) {
                            evalContext = foundRel;
                        } else {
                            // No valid relationship found in the data model. Clear context.
                            evalContext = null; 
                        }
                    }

                    const rawLabel = childNode.labelExpression || childNode.content || childNode.name || '';
                    
                    let cellValue = '';
                    if (evalContext) {
                        cellValue = this.parseExpression(rawLabel, evalContext);
                    } else if (rawLabel && !rawLabel.includes('${')) {
                        // FIX: Allow purely static text to render even if the data relationship is missing
                        cellValue = rawLabel;
                    }
                    
                    if (cellValue) {
                        cellValue = this.markup.parse(String(cellValue));
                        this.markup.appendContent(cellValue + '\n');
                    }
                }
                this.markup.appendContent(`</td>\n`);
            }
            if (currentRowY !== -1) this.markup.appendContent('</tr>\n');
            this.markup.appendContent('</table>\n');
        }
        this.markup.appendContent(`</div>\n`);
        this.lb.leave();
    }
}