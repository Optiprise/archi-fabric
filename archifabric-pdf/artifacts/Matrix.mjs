/*
 * ArchiFabric-PDF - [Document Generation Engine for Archi]
 * Copyright (C) 2026 [Optiprise, Bart Ratgers]
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * @module artifacts/Matrix
 * @description Generates a 2D cross-reference matrix.
 * Infers Rows and Columns visually from the template (Leftmost = Row, Rightmost = Column).
 * Integrates QueryBuilder for deduplicated data retrieval.
 * Parameters: rows, cols, rel, scope, rowScope, colScope, sort, select (strict), rowSelect, colSelect
 */
import { Artifact } from '../core/Artifact.mjs';
import { QueryBuilder } from '../core/QueryBuilder.mjs';

export default class Matrix extends Artifact {
    constructor(artifactory) {
        super('Matrix', artifactory);
        this.helpUrl = 'https://optiprise.nl/archi-fabric/?view=id-a56d1cd7235a48e59a8ee56a1932a050';
    }

    render(modelElement, targetElement) {
        this.lb.enter(`${this.name}.render(model: ${modelElement.name}, target: ${targetElement.name})`);
        
        try {
            // 1. Parse configuration parameters
            const { baseName, params: inlineParams } = this.parseTemplateName(modelElement.name);
            

            const baseCssClass = this.markup.genHtmlClass(baseName);
            const customCssClass = inlineParams['class'] ? ` ${inlineParams['class']}` : '';

            // Strict Mode
            const specializationMode = inlineParams['specialization'] || 'strict';
            // Patterns for filtering rows and columns
            const strictMode = inlineParams['select'] === 'strict';
            const rowSelect = inlineParams['rowSelect'] || null;
            const colSelect = inlineParams['colSelect'] || null;
            const scope = inlineParams['scope'] || 'view';
            const rowScope = inlineParams['rowScope'] || scope;
            const colScope = inlineParams['colScope'] || scope;
            const sort = inlineParams['sort'] || 'name';
            const rowSort = inlineParams['rowSort'] || sort;
            const colSort = inlineParams['colSort'] || sort;


            const archimateChildren = [];
            $(modelElement).children("element").each(child => {
                if (child.concept) archimateChildren.push(child);
            });

            if (archimateChildren.length !== 2) {
                this.lb.error(`Found ${archimateChildren.length} ArchiMate concepts in Matrix. Expected exactly 2 for visual inference.`);
            }

            archimateChildren.sort((a, b) => a.bounds.x - b.bounds.x);
            const rowTemplate = archimateChildren[0];
            const colTemplate = archimateChildren[1];
            const rowType = rowTemplate.concept.type;
            const colType = colTemplate.concept.type;
            const elementId = (targetElement && targetElement.id) || modelElement.id;

            let foundRel = null;
            $(rowTemplate).outRels().each(r => { if (r.target.id === colTemplate.id) foundRel = r; });
            if (!foundRel) {
                $(rowTemplate).inRels().each(r => { if (r.source.id === colTemplate.id) foundRel = r; });
            }
            
            if (!foundRel.concept) {
                this.lb.error(`No relationship found between row (${rowType}) and column (${colType}) templates. Please ensure a valid ArchiMate relationship exists.`);
            }
            const relType = foundRel.concept.type;

            this.lb.log(`Matrix: Rendering '${rowType}' rows and '${colType}' columns with relationship type '${relType}' from template.`);



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
            let uniqueRows = qb.fetch({ 
                scope: rowScope,
                currentView: currentView, 
                select: {
                    types: [rowType],
                    pattern: rowSelect
                },
                sort: rowSort,
                unique: 'true', // Enforce uniqueness by default
                specialization: specializationMode
            });

            let uniqueCols = qb.fetch({ 
                scope: colScope,
                currentView: currentView, 
                select: {
                    types: [colType],
                    pattern: colSelect
                },
                sort: colSort,
                unique: 'true' // Enforce uniqueness by default
            });
 
            // Filter Logic for strict mode
            if (strictMode) {
                const validRows = new Set();
                const validCols = new Set();
                
                uniqueRows.forEach(row => {
                    uniqueCols.forEach(col => {
                        const rel = $(row).rels(relType).filter(r => r.target.id === col.id || r.source.id === col.id).first();
                        if (rel) {
                            validRows.add(row.id);
                            validCols.add(col.id);
                        }
                    });
                });
                
                uniqueRows = uniqueRows.filter(r => validRows.has(r.id));
                uniqueCols = uniqueCols.filter(c => validCols.has(c.id));
                
                this.lb.log(`Matrix (select=strict): Filtered out elements without relations. Rendering ${uniqueRows.length} rows and ${uniqueCols.length} columns.`);
            } else {
                this.lb.log(`Matrix (select=loose): Rendering all ${uniqueRows.length} rows and ${uniqueCols.length} columns.`);
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
            uniqueCols.forEach(col => {
                this.markup.appendContent(`<th class="matrix-col-header">${col.name}</th>\n`);
            });
            this.markup.appendContent(`</tr></thead>\n<tbody>\n`);

            // Data rows
            uniqueRows.forEach(row => {
                this.markup.appendContent(`<tr><th class="matrix-row-header">${row.name}</th>\n`);
                
                uniqueCols.forEach(col => {
                    const rel = $(row).rels(relType).filter(r => r.target.id === col.id || r.source.id === col.id).first();
                    
                    let cellHtml = ""; 
                    let classModifiers = "";
                    
                    if (rel) {
                        let rawContent = this.parseExpression(rawLabel, rel);

                        if (rawContent && rawContent.trim() !== '') {
                            cellHtml = this.markup.parse(String(rawContent));
                        } else if (rawLabel === '${documentation}') {
                            if (!cellTemplateNote || (cellTemplateNote.labelExpression || cellTemplateNote.content || cellTemplateNote.name) === undefined) {
                                cellHtml = "X";
                            }
                        }

                        classModifiers = " matrix-cell-filled";
                    } else {
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