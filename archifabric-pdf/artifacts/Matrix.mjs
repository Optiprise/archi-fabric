/**
 * @module artifacts/Matrix
 * @description Generates a 2D cross-reference matrix.
 * Uses the QueryBuilder for robust data retrieval, independent of view hierarchy.
 * Parameters in model element name: 
 * - rows: Type of element for rows (e.g., 'business-process')
 * - cols: Type of element for columns (e.g., 'business-function')
 * - rel: Relationship type to query (e.g., 'aggregation-relationship')
 * - scope: 'view' | 'model' (default: 'model')
 * - sort: 'name' | 'xy' (default: 'name')
 */
import { Artifact } from '../core/Artifact.mjs';
import { QueryBuilder } from '../core/QueryBuilder.mjs';

export default class Matrix extends Artifact {
    constructor(artifactory) {
        super('Matrix', artifactory);
    }

    /**
     * Renders the matrix grid.
     * @param {Object} modelElement - The Archi template element.
     * @param {Object} targetElement - The actual Archi view or context being processed.
     */
    render(modelElement, targetElement) {
        this.lb.enter(`${this.name}.render(model: ${modelElement.name})`);

        // 1. Parse configuration parameters
        const { baseName, params } = this.parseTemplateName(modelElement.name);
        const rowType = params['rows'] || 'business-process';
        const colType = params['cols'] || 'business-function';
        const relType = params['rel'] || 'aggregation-relationship';
        const scope = params['scope'] || 'model';
        const sort = params['sort'] || 'name';

        // 2. Initialize QueryBuilder for data retrieval
        const qb = new QueryBuilder(modelElement, targetElement, this.lb);

        // 3. Fetch data using the QueryBuilder
        const rows = qb.fetch({ scope: scope, select: { types: [rowType] }, sort: sort });
        const cols = qb.fetch({ scope: scope, select: { types: [colType] }, sort: sort });

        // Resolve cell template (from diagram note proxy inside the matrix definition)
        const cellTemplateNote = $(modelElement).children('diagram-model-note').first();

        this.lb.log(`Matrix: Rendering ${rows.length} rows and ${cols.length} columns.`);

        // 4. Render HTML Table
        const customCssClass = params['class'] ? ` ${params['class']}` : '';
        this.markup.appendContent(`<table class="matrix-table ${baseName}${customCssClass}" style="width: 100%; border-collapse: collapse;">\n`);
        
        // Header Row
        this.markup.appendContent(`<thead><tr><th class="matrix-corner"></th>\n`);
        cols.forEach(col => {
            this.markup.appendContent(`<th class="matrix-header" style="border: 1px solid #ccc; padding: 5px;">${col.name}</th>\n`);
        });
        this.markup.appendContent(`</tr></thead>\n<tbody>\n`);

        // Data Rows
        rows.forEach(row => {
            this.markup.appendContent(`<tr><th class="matrix-row-header" style="border: 1px solid #ccc; padding: 5px; text-align: left;">${row.name}</th>\n`);
            
            cols.forEach(col => {
                // Check for formal relationship existence in the model between row and col
                const rel = $(row).rels(relType).filter(r => r.target.id === col.id || r.source.id === col.id).first();
                
                let cellHtml = "";
                if (rel) {
                    const template = cellTemplateNote ? (cellTemplateNote.labelExpression || cellTemplateNote.name || cellTemplateNote.content) : "X";
                    const rawContent = this.parseExpression(template, rel);
                    cellHtml = this.markup.parse(String(rawContent));
                }
                
                this.markup.appendContent(`<td class="matrix-cell" style="border: 1px solid #ccc; padding: 5px; text-align: center;">${cellHtml}</td>\n`);
            });
            this.markup.appendContent(`</tr>\n`);
        });

        this.markup.appendContent(`</tbody></table>\n`);
        this.lb.leave();
    }
}