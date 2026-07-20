/**
 * @module artifacts/Catalog
 * @description Artifact that generates data-driven grids and repeating table structures.
 * It translates the visual X/Y layout of elements in the Archi template into an HTML table.
 * Integrated with the QueryBuilder to decouple Scope, Select, and Sort from the view hierarchy.
 */
import { Artifact } from '../core/Artifact.mjs';
import { ModelStructure } from '../core/ModelStructure.mjs';
import { QueryBuilder } from '../core/QueryBuilder.mjs';

class RelationDescriptor {
    constructor(type, direction) {
        this.type = type;
        this.direction = direction;
    }
}

export default class Catalog extends Artifact {
    /**
     * Initializes the Catalog artifact.
     * @param {Object} artifactory - The main Artifactory instance.
     */
    constructor(artifactory) {
        super('Catalog', artifactory);
        this.helpUrl = 'https://optiprise.nl/archi-fabric/?view=id-309858853fb2465bbb62938824e3f3f2';
    }

    /**
     * Renders the catalog grid by fetching data elements and generating the HTML tables.
     * @param {Object} modelElement - The Archi template element.
     * @param {Object} targetElement - The actual Archi view or concept being processed.
     */
    render(modelElement, targetElement) {
        this.lb.enter(`${this.name}.render(model: ${modelElement.name}, target: ${targetElement.name})`);

        const gridData = this._analyzeVisualGrid(modelElement);
        if (!gridData) { this.lb.leave(); return; }

        const context = this._buildRenderContext(modelElement, targetElement, gridData);
        const finalElements = this._fetchElements(modelElement, targetElement, gridData.modelStructure, context);
        if (!finalElements) { this.lb.leave(); return; }

        this._renderGrid(modelElement, targetElement, gridData, context, finalElements);
        this.lb.leave();
    }

    /**
     * Analyzes the visual grid structure from the model element.
     * @param {Object} modelElement - The Archi template element.
     * @returns {Object|null} Grid data containing modelStructure, positions, and params, or null if invalid.
     */
    _analyzeVisualGrid(modelElement) {
        const modelStructure = new ModelStructure(this.lb, modelElement);
        const structuralParams = modelStructure.getParameters();
        const { xPositions: xPos, yPositions: yPos } = modelStructure;

        if (xPos.length === 0 || yPos.length === 0 || modelStructure.sortedElements.length === 0) {
            this.lb.error("Catalog template is empty or contains no valid grid elements.", modelElement);
            return null;
        }
        return { modelStructure, structuralParams, xPos, yPos };
    }

    /**
     * Builds the rendering context from parameters and target element.
     * @param {Object} modelElement - The Archi template element.
     * @param {Object} targetElement - The actual Archi view or concept being processed.
     * @param {Object} gridData - The analyzed grid data.
     * @returns {Object} The render context.
     */
    _buildRenderContext(modelElement, targetElement, gridData) {
        const { baseName, params: inlineParams } = this.parseTemplateName(modelElement.name);
        const isTargetView = targetElement?.type === 'archimate-diagram-model';
        return {
            baseCssClass: this.markup.genHtmlClass(baseName),
            customCssClass: inlineParams['class'] ? ` ${inlineParams['class']}` : '',
            gap: Number(inlineParams['gap'] ?? gridData.structuralParams['gap'] ?? 0),
            queryParams: {
                scope: inlineParams['scope'] || 'view',
                sort: inlineParams['sort'] || 'name',
                pattern: inlineParams['pattern'] || null
            },
            currentView: this._getCurrentView(targetElement),
            sourceElement: isTargetView ? null : (targetElement.concept || targetElement)
        };
    }

    /**
     * Fetches elements using the query builder with error handling.
     * @param {Object} modelElement - The Archi template element.
     * @param {Object} targetElement - The actual Archi view or concept being processed.
     * @param {Object} modelStructure - The analyzed model structure.
     * @param {Object} context - The render context.
     * @returns {Array|null} The fetched elements or null on error.
     */
    _fetchElements(modelElement, targetElement, modelStructure, context) {
        try {
            return this._queryTargetData(modelElement, targetElement, modelStructure,
                context.queryParams, context.sourceElement, context.currentView);
        } catch (error) {
            this.lb.error(`Failed to process data for Catalog: ${error.message}`, modelElement);
            return null;
        }
    }

    /**
     * Renders the complete grid with all elements.
     * @param {Object} modelElement - The Archi template element.
     * @param {Object} targetElement - The actual Archi view or concept being processed.
     * @param {Object} gridData - The analyzed grid data.
     * @param {Object} context - The render context.
     * @param {Array} finalElements - The elements to render.
     */
    _renderGrid(modelElement, targetElement, gridData, context, finalElements) {
        const { baseCssClass, customCssClass, gap, sourceElement } = context;
        const { modelStructure, structuralParams, xPos, yPos } = gridData;

        this._renderWrapperStart(modelElement, targetElement, baseCssClass, customCssClass, structuralParams, gap);
        const totalWidth = xPos.at(-1);

        for (const item of finalElements) {
            const dataContext = item.concept || item.obj || item;
            this._renderTableStart(baseCssClass, customCssClass, xPos, totalWidth);
            this._renderTableRows(modelStructure, structuralParams, xPos, yPos, baseCssClass, dataContext, sourceElement);
            this.markup.appendContent('</table>\n');
        }
        this.markup.appendContent(`</div>\n`);
    }

    /**
     * Gets the current view from target element or artifactory.
     * @param {Object} targetElement - The target element.
     * @returns {Object} The current view.
     */
    _getCurrentView(targetElement) {
        if (targetElement?.type === 'archimate-diagram-model') {
            this.artifactory.currentRenderView = targetElement;
            return targetElement;
        }
        return this.artifactory.currentRenderView;
    }

    /**
     * Queries target data using the QueryBuilder.
     * @param {Object} modelElement - The Archi template element.
     * @param {Object} targetElement - The target element.
     * @param {Object} modelStructure - The model structure.
     * @param {Object} queryParams - Query parameters (scope, sort, pattern).
     * @param {Object} sourceElement - The source element.
     * @param {Object} currentView - The current view.
     * @returns {Array} The filtered unique elements.
     */
    _queryTargetData(modelElement, targetElement, modelStructure, queryParams, sourceElement, currentView) {
        if (!modelStructure.archimateElement) {
            this.lb.log("No ArchiMate context in template. Rendering as static grid.");
            return [{ obj: targetElement }];
        }

        const templateType = modelStructure.archimateElement.type;
        const relation = this._getRelationDescriptor(modelElement, modelStructure.archimateElement, sourceElement);

        this.lb.log(`modelStructure: ${modelStructure.archimateElement.name}, ` +
            `sourceElement: ${sourceElement ? sourceElement.name : 'none'}, ` +
            `relation: ${relation ? relation.type + '/' + relation.direction : 'none'}`);

        const qb = new QueryBuilder(modelElement, targetElement, this.lb);
        const rawElements = qb.fetch({
            scope: queryParams.scope,
            currentView,
            select: {
                types: [templateType],
                relationType: relation?.type ?? null,
                relationDirection: relation?.direction ?? null,
                sourceElement,
                pattern: queryParams.pattern
            },
            sort: queryParams.sort
        });

        const uniqueConcepts = new Set();
        return rawElements.filter(node => {
            if (!node.id || uniqueConcepts.has(node.id)) return false;
            uniqueConcepts.add(node.id);
            return true;
        });
    }

    /**
     * Renders the wrapper div start with CSS and optional header/documentation.
     * @param {Object} modelElement - The Archi template element.
     * @param {Object} targetElement - The target element.
     * @param {string} baseCssClass - The base CSS class.
     * @param {string} customCssClass - Custom CSS class suffix.
     * @param {Object} structuralParams - Structural parameters.
     * @param {number} gap - Gap between items in pixels.
     */
    _renderWrapperStart(modelElement, targetElement, baseCssClass, customCssClass, structuralParams, gap) {
        this.markup.appendCss(`
            .${baseCssClass}-cell pre, .${baseCssClass}-cell code { white-space: pre-wrap !important; word-wrap: break-word !important; }
            .${baseCssClass}-cell img { max-width: 100% !important; height: auto !important; }
        `);

        const flexDir = structuralParams.listDirection === 'H' ? 'row' : 'column';
        const wrapperStyle = `display: flex; flex-direction: ${flexDir}; flex-wrap: wrap; gap: ${gap}px; width: 100%;`;
        const elementId = targetElement?.id || modelElement.id;

        this.markup.appendContent(`<div id="id-${elementId}" class="${baseCssClass}-wrapper${customCssClass}" style="${wrapperStyle}">\n`);

        if (modelElement.labelExpression) {
            const displayTitle = this.parseExpression(modelElement.labelExpression, targetElement);
            if (displayTitle) this.markup.appendContent(this.markup.header(displayTitle, elementId));
        }
        if (modelElement.documentation) {
            this.markup.appendContent(this.markup.parse(modelElement.documentation) + '\n');
        }
    }

    /**
     * Renders the table start with colgroup.
     * @param {string} baseCssClass - The base CSS class.
     * @param {string} customCssClass - Custom CSS class suffix.
     * @param {Array} xPos - X positions array.
     * @param {number} totalWidth - Total width of the table.
     */
    _renderTableStart(baseCssClass, customCssClass, xPos, totalWidth) {
        this.markup.appendContent(`<table class="${baseCssClass}${customCssClass}" style="width: 100%; border-collapse: collapse; table-layout: fixed;">\n<colgroup>\n`);
        for (let i = 1; i < xPos.length; i++) {
            const colWidthPct = ((xPos[i] - xPos[i - 1]) / totalWidth) * 100;
            this.markup.appendContent(`  <col style="width: ${colWidthPct}%;">\n`);
        }
        this.markup.appendContent('</colgroup>\n');
    }

    /**
     * Renders table rows for all sorted elements in the model structure.
     * @param {Object} modelStructure - The model structure.
     * @param {Object} structuralParams - Structural parameters.
     * @param {Array} xPos - X positions array.
     * @param {Array} yPos - Y positions array.
     * @param {string} baseCssClass - The base CSS class.
     * @param {Object} dataContext - The data context.
     * @param {Object} sourceElement - The source element.
     */
    _renderTableRows(modelStructure, structuralParams, xPos, yPos, baseCssClass, dataContext, sourceElement) {
        let currentRowY = -1;
        for (const childNode of modelStructure.sortedElements) {
            if (childNode.id === structuralParams.repeatElementID) continue;
            if (childNode.bounds.y !== currentRowY) {
                if (currentRowY !== -1) this.markup.appendContent('</tr>\n');
                this.markup.appendContent('<tr>\n');
                currentRowY = childNode.bounds.y;
            }
            this._renderCell(childNode, dataContext, sourceElement, xPos, yPos, baseCssClass);
        }
        if (currentRowY !== -1) this.markup.appendContent('</tr>\n');
    }

    /**
     * Renders a single table cell with proper span and alignment.
     * @param {Object} childNode - The child node to render.
     * @param {Object} dataContext - The data context.
     * @param {Object} sourceElement - The source element.
     * @param {Array} xPos - X positions array.
     * @param {Array} yPos - Y positions array.
     * @param {string} baseCssClass - The base CSS class.
     */
    _renderCell(childNode, dataContext, sourceElement, xPos, yPos, baseCssClass) {
        const colspan = xPos.indexOf(childNode.bounds.x + childNode.bounds.width - 1) - xPos.indexOf(childNode.bounds.x);
        const rowspan = yPos.indexOf(childNode.bounds.y + childNode.bounds.height - 1) - yPos.indexOf(childNode.bounds.y);

        let spanHtml = '';
        if (colspan > 1) spanHtml += ` colspan="${colspan}"`;
        if (rowspan > 1) spanHtml += ` rowspan="${rowspan}"`;

        let hAlign = 'left';
        if (childNode.textAlignment === 2) hAlign = 'center';
        else if (childNode.textAlignment === 4) hAlign = 'right';

        let vAlign = 'top';
        if (childNode.textPosition >= 3 && childNode.textPosition <= 5) vAlign = 'middle';
        else if (childNode.textPosition >= 6 && childNode.textPosition <= 8) vAlign = 'bottom';

        const cellClass = this.markup.genHtmlClass(childNode.name || 'cell');
        const cellStyle = `text-align: ${hAlign}; vertical-align: ${vAlign}; word-wrap: break-word; overflow-wrap: break-word;`;

        this.markup.appendContent(`  <td${spanHtml} class="${baseCssClass}-cell ${cellClass}" style="${cellStyle}">\n`);
        this._renderCellContent(childNode, dataContext, sourceElement);
        this.markup.appendContent(`</td>\n`);
    }

    /**
     * Renders cell content, delegating to artifacts for groups/references.
     * @param {Object} childNode - The child node.
     * @param {Object} dataContext - The data context.
     * @param {Object} sourceElement - The source element.
     */
    _renderCellContent(childNode, dataContext, sourceElement) {
        const isGroupOrRef = $(childNode).is('diagram-model-group') || $(childNode).is('diagram-model-reference');
        if (isGroupOrRef) {
            this._renderGroupOrReference(childNode, dataContext);
            return;
        }

        const cellValue = this._evaluateCellValue(childNode, dataContext, sourceElement);
        if (cellValue && cellValue.trim() !== '') {
            this.markup.appendContent(this.markup.parse(String(cellValue)) + '\n');
        }
    }

    /**
     * Renders a group or reference element by delegating to the appropriate artifact.
     * @param {Object} childNode - The child node to render.
     * @param {Object} dataContext - The data context for rendering.
     */
    _renderGroupOrReference(childNode, dataContext) {
        const artifactName = typeof this.resolveArtifactName === 'function'
            ? this.resolveArtifactName(childNode) : childNode.name;
        this.lb.log(`this.artifactory.render(artifactName, childNode, dataContext): ${artifactName}, childNode: ${childNode.name}, dataContext: ${dataContext ? dataContext.name : 'null'}`);
        this.artifactory.render(artifactName, childNode, dataContext);
    }

    /**
     * Evaluates the cell value based on label expression and context.
     * @param {Object} childNode - The child node containing the label.
     * @param {Object} dataContext - The data context for evaluation.
     * @param {Object} sourceElement - The source element for relation matching.
     * @returns {string} The evaluated cell value.
     */
    _evaluateCellValue(childNode, dataContext, sourceElement) {
        const rawLabel = childNode.labelExpression || childNode.content || childNode.name || '';
        const templateRel = typeof this.getAttachedTemplateRelationship === 'function'
            ? this.getAttachedTemplateRelationship(childNode) : null;

        if (templateRel) {
            const evalContext = this._findEvalContext(childNode, dataContext, sourceElement, templateRel);
            if (evalContext) return this.parseExpression(rawLabel, evalContext);
            this.lb.log(`Relation missing between parent and child. Cell remains empty.`);
            return '';
        }
        return dataContext ? this.parseExpression(rawLabel, dataContext) : rawLabel;
    }

    /**
     * Finds the evaluation context (relationship) for expression parsing.
     * @param {Object} childNode - The child node.
     * @param {Object} dataContext - The data context.
     * @param {Object} sourceElement - The source element.
     * @param {Object} templateRel - The template relationship.
     * @returns {Object|null} The matching relation or null.
     */
    _findEvalContext(childNode, dataContext, sourceElement, templateRel) {
        if (!templateRel || !dataContext?.type || dataContext.source) return null;

        const candidateRels = $(dataContext).rels().filter(r => r.type === templateRel.type);
        if (!sourceElement?.id) return candidateRels[0] || null;

        return candidateRels.find(r => this._isMatchingRelation(r, sourceElement.id, dataContext.id)) || null;
    }

    /**
     * Checks if a relation matches the given source and target IDs.
     * @param {Object} r - The relation to check.
     * @param {string} sourceId - The source element ID.
     * @param {string} targetId - The target element ID.
     * @returns {boolean} True if the relation matches.
     */
    _isMatchingRelation(r, sourceId, targetId) {
        const { srcId, tgtId } = { srcId: r.source.id, tgtId: r.target.id };
        return (srcId === sourceId && tgtId === targetId) || (tgtId === sourceId && srcId === targetId);
    }

    /**
     * Gets the relation descriptor between template and source element.
     * @param {Object} modelElement - The model element (catalog group).
     * @param {Object} childTemplateElement - The child template element.
     * @param {Object} sourceElement - The source element.
     * @returns {RelationDescriptor|null} The relation descriptor or null.
     */
    _getRelationDescriptor(modelElement, childTemplateElement, sourceElement) {
        if (!childTemplateElement || !sourceElement) return null;

        const matches = this._collectRelationMatches(modelElement, childTemplateElement, sourceElement);
        return this._resolveRelationResult(matches, sourceElement, childTemplateElement);
    }

    /**
     * Collects all matching relations from incoming and outgoing connections.
     * @param {Object} modelElement - The model element (catalog group).
     * @param {Object} childTemplateElement - The child template element.
     * @param {Object} sourceElement - The source element to match against.
     * @returns {Array} Array of RelationDescriptor matches.
     */
    _collectRelationMatches(modelElement, childTemplateElement, sourceElement) {
        const matches = [];
        const isInside = (node) => this._isInsideCatalog(node, modelElement);

        $(childTemplateElement).inRels().each(rel => {
            if (rel?.concept && rel?.source?.concept && rel.source.concept.type === sourceElement.type && !isInside(rel.source)) {
                matches.push(new RelationDescriptor(rel.concept.type, "out"));
            }
        });

        $(childTemplateElement).outRels().each(rel => {
            if (rel?.concept && rel?.target?.concept && rel.target.concept.type === sourceElement.type && !isInside(rel.target)) {
                matches.push(new RelationDescriptor(rel.concept.type, "in"));
            }
        });

        return matches;
    }

    /**
     * Checks if a visual node is inside the current catalog group.
     * @param {Object} visualNode - The visual node to check.
     * @param {Object} modelElement - The catalog model element.
     * @returns {boolean} True if the node is inside the catalog.
     */
    _isInsideCatalog(visualNode, modelElement) {
        let parent = $(visualNode).parent();
        while (parent && parent.length > 0) {
            if (parent.first().id === modelElement.id) return true;
            parent = parent.parent();
        }
        return false;
    }

    /**
     * Resolves the final relation result from collected matches.
     * @param {Array} matches - The collected matches.
     * @param {Object} sourceElement - The source element.
     * @param {Object} childTemplateElement - The child template element.
     * @returns {RelationDescriptor|null} The resolved relation or null.
     * @throws {Error} If conflicting relations are found.
     */
    _resolveRelationResult(matches, sourceElement, childTemplateElement) {
        if (matches.length === 0) return null;
        if (matches.length === 1) return matches[0];

        const uniqueStrings = new Set(matches.map(m => `${m.type}/${m.direction}`));
        if (uniqueStrings.size === 1) return matches[0];

        throw new Error(
            `Catalog template error: expected exactly one visual relation between source type ` +
            `'${sourceElement.type}' and child template '${childTemplateElement.name}', ` +
            `but found conflicting relations (${matches.length} matches). Ensure your template structure is unambiguous.`
        );
    }
}