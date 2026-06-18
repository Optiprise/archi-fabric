/**
 * @module artifacts/Matrix
 * @description Generates a 2D cross-reference matrix.
 * Infers Rows and Columns visually from the template (Leftmost = Row, Rightmost = Column).
 * Integrates QueryBuilder for deduplicated data retrieval.
 * Parameters: rows, cols, rel, scope, sort, select (strict)
 */
import { Artifact } from '../core/Artifact.mjs';
import { QueryBuilder } from '../core/QueryBuilder.mjs';

export default class Matrix extends Artifact {
    constructor(artifactory) {
        super('Matrix', artifactory);
        this.helpUrl = 'https://optiprise.nl/archi-fabric/?view=model';
    }

    render(modelElement, targetElement) {
        this.lb.enter(`${this.name}.render(model: ${modelElement.name})`);
        
        try {
            // 1. Parse configuration parameters
            const { baseName, params: inlineParams } = this.parseTemplateName(modelElement.name);
            let rowType = inlineParams['rows'];
            let colType = inlineParams['cols'];
            let relType = inlineParams['rel'];
            
            // Toepassing van Uitgangspunten ArchiFabric.md: select=strict
            const strictMode = inlineParams['select'] === 'strict';

            // --- VISUAL TEMPLATE INFERENCE ---
            const archimateChildren = [];
            $(modelElement).children().each(child => {
                if (child.concept) archimateChildren.push(child);
            });

            if (archimateChildren.length === 2) {
                archimateChildren.sort((a, b) => a.bounds.x - b.bounds.x);
                const rowTemplate = archimateChildren[0];
                const colTemplate = archimateChildren[1];

                rowType = rowTemplate.concept.type;
                colType = colTemplate.concept.type;

                let foundRel = null;
                $(rowTemplate).outRels().each(r => { if (r.target.id === colTemplate.id) foundRel = r; });
                if (!foundRel) {
                    $(rowTemplate).inRels().each(r => { if (r.source.id === colTemplate.id) foundRel = r; });
                }
                
                if (foundRel && foundRel.concept) {
                    relType = foundRel.concept.type;
                }
            } else if (archimateChildren.length > 0) {
                this.lb.log(`Warning: Found ${archimateChildren.length} ArchiMate concepts in Matrix. Expected exactly 2 for visual inference.`);
            } else {
                this.lb.log(`Warning: Matrix group is empty! Place 2 concepts and a diagram-model-note INSIDE the group to define the template.`);
            }

            rowType = rowType || 'business-process';
            colType = colType || 'business-function';
            relType = relType || 'aggregation-relationship';

            const scope = inlineParams['scope'] || 'model';
            const sort = inlineParams['sort'] || 'name';

            const baseCssClass = this.markup.genHtmlClass(baseName);
            const customCssClass = inlineParams['class'] ? ` ${inlineParams['class']}` : '';
            const elementId = (targetElement && targetElement.id) || modelElement.id;

            // --- CONTEXT PRESERVATION ---
            let currentView = null;
            if (targetElement && targetElement.type === 'archimate-diagram-model') {
                currentView = targetElement;
                this.artifactory.currentRenderView = currentView;
            } else {
                currentView = this.artifactory.currentRenderView;
            }

            const qb = new QueryBuilder(modelElement, targetElement, this.lb);

            // --- DATA FETCHING & DEDUPLICATION ---
            const uniqueRows = new Map();
            qb.fetch({ scope, currentView, select: { types: [rowType] }, sort }).forEach(r => uniqueRows.set(r.id, r));
            let rows = Array.from(uniqueRows.values());

            const uniqueCols = new Map();
            qb.fetch({ scope, currentView, select: { types: [colType] }, sort }).forEach(c => uniqueCols.set(c.id, c));
            let cols = Array.from(uniqueCols.values());

            // Filter Logic for strict mode
            if (strictMode) {
                const validRows = new Set();
                const validCols = new Set();
                
                rows.forEach(row => {
                    cols.forEach(col => {
                        const rel = $(row).rels(relType).filter(r => r.target.id === col.id || r.source.id === col.id).first();
                        if (rel) {
                            validRows.add(row.id);
                            validCols.add(col.id);
                        }
                    });
                });
                
                rows = rows.filter(r => validRows.has(r.id));
                cols = cols.filter(c => validCols.has(c.id));
                
                this.lb.log(`Matrix (select=strict): Filtered out elements without relations. Rendering ${rows.length} rows and ${cols.length} columns.`);
            } else {
                this.lb.log(`Matrix (select=loose): Rendering all ${rows.length} rows and ${cols.length} columns.`);
            }

            // --- STYLING EXTRACTION ---
            const cellTemplateNote = $(modelElement).children('diagram-model-note').first();
            let hAlign = 'center';
            let vAlign = 'middle';
            let rawLabel = 'X'; 
            
            if (cellTemplateNote) {
                hAlign = cellTemplateNote.textAlignment === 2 ? 'center' : (cellTemplateNote.textAlignment === 4 ? 'right' : 'left');
                if (cellTemplateNote.textPosition >= 3 && cellTemplateNote.textPosition <= 5) vAlign = 'middle';
                else if (cellTemplateNote.textPosition >= 6 && cellTemplateNote.textPosition <= 8) vAlign = 'bottom';
                else vAlign = 'top';
                
                rawLabel = cellTemplateNote.labelExpression || cellTemplateNote.content || cellTemplateNote.name || '';
                if (!rawLabel || rawLabel.trim() === '') {
                    rawLabel = '${documentation}'; // auto-fallback if note is completely empty
                }
            } else {
                this.lb.log('No diagram-model-note found inside Matrix group. Using default styling and "X".');
            }

            // Render Table Wrapper (Pure HTML, no forced styles except text-align)
            this.markup.appendContent(`<div class="${baseCssClass}-wrapper${customCssClass} matrix-wrapper">\n`);
            this.markup.appendContent(`<table id="id-${elementId}" class="matrix-table ${baseCssClass}">\n`);
            
            // Header row
            this.markup.appendContent(`<thead><tr><th class="matrix-corner"></th>\n`);
            cols.forEach(col => {
                this.markup.appendContent(`<th class="matrix-col-header">${col.name}</th>\n`);
            });
            this.markup.appendContent(`</tr></thead>\n<tbody>\n`);

            // Data rows
            rows.forEach(row => {
                this.markup.appendContent(`<tr><th class="matrix-row-header">${row.name}</th>\n`);
                
                cols.forEach(col => {
                    const rel = $(row).rels(relType).filter(r => r.target.id === col.id || r.source.id === col.id).first();
                    
                    let cellHtml = ""; 
                    let classModifiers = "";
                    
                    if (rel) {
                        let rawContent = this.parseExpression(rawLabel, rel);

                        if (rawContent && rawContent.trim() !== '') {
                            cellHtml = this.markup.parse(String(rawContent));
                        } else if (rawLabel === '${documentation}') {
                            // If auto-fallback to ${documentation} was used, but relation has no docs, print X
                            if (!cellTemplateNote || (cellTemplateNote.labelExpression || cellTemplateNote.content || cellTemplateNote.name) === undefined) {
                                cellHtml = "X";
                            }
                        }

                        classModifiers = " matrix-cell-filled";
                    } else {
                        // Empty relation
                        cellHtml = ""; 
                        classModifiers = " matrix-cell-empty";
                    }
                    
                    const inlineAlign = `text-align: ${hAlign}; vertical-align: ${vAlign};`;
                    this.markup.appendContent(`<td class="matrix-cell${classModifiers}" style="${inlineAlign}">${cellHtml}</td>\n`);
                });
                this.markup.appendContent(`</tr>\n`);
            });

            this.markup.appendContent(`</tbody></table>\n`);
            this.markup.appendContent(`</div>\n`);
            
        } catch (err) {
            this.lb.error(`Error during rendering of Matrix: ${err.message}`, modelElement);
        } finally {
            this.lb.leave();
        }
    }
}