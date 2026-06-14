/**
 * @module artifacts/TOC
 * @description Artifact that generates the Table of Contents (TOC).
 * It inserts a placeholder in the HTML buffer, which the Markup utility 
 * replaces with the actual generated TOC right before exporting to PDF.
 * It wraps the TOC in a section and allows custom CSS via the documentation field.
 */
import { Artifact } from '../core/Artifact.mjs';

export default class TOC extends Artifact { 
    /**
     * Initializes the Table of Contents artifact.
     * @param {Object} artifactory - The main Artifactory instance.
     */
    constructor(artifactory) {
        super('TOC', artifactory);
    }

    /**
     * Renders the TOC section and inserts the TOC placeholder into the HTML document.
     * @param {Object} modelElement - The Archi template element defining the TOC.
     * @param {Object} targetElement - The actual Archi element (usually the same as modelElement).
     */
    render(modelElement, targetElement) {
        this.lb.enter(`${this.name}.render(model: ${modelElement.name})`);

        // 1. Evaluate the label for an optional title
        const rawLabel = modelElement.labelExpression || modelElement.name;
        const displayTitle = this.parseExpression(rawLabel, targetElement);

        // 2. Open the TOC Section
        this.markup.appendContent('<section class="toc">\n');

        // 3. Render the title div if a specific label is provided
        if (displayTitle && displayTitle !== 'TOC') {
            this.markup.appendContent(`<div class="toc-title">${displayTitle}</div>\n`);
        }

        // 4. Insert the actual placeholder that the Markup utility will replace
        this.markup.insertTocPlaceholder();

        // 5. Close the TOC Section
        this.markup.appendContent('</section>\n');

        // 6. Inject custom CSS from the documentation field (if any)
        if (modelElement.documentation) {
            this.lb.log('Injecting custom CSS from TOC documentation.');
            this.markup.appendCss(modelElement.documentation + '\n');
        }

        this.lb.leave();
    }
}