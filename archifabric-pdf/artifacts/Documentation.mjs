/**
 * @module artifacts/Documentation
 * @description Artifact module that renders the documentation field of an Archi element 
 * as formatted Markdown/HTML.
 */
import { Artifact } from '../core/Artifact.mjs';

export default class Documentation extends Artifact { 
    /**
     * @param {Object} artifactory - The main Artifactory instance.
     */
    constructor(artifactory) {
        super('Documentation', artifactory);
    }

    /**
     * Renders the documentation field of the target element.
     * @param {Object} modelElement - The Archi template element.
     * @param {Object} targetElement - The actual Archi element containing the documentation.
     */
    render(modelElement, targetElement) {
        this.lb.enter(`${this.name}.render(${targetElement.name || targetElement.id})`);
        
        if (targetElement.documentation) {
            // Parse the markdown documentation and append it to the markup buffer
            const parsedHtml = this.markup.parse(targetElement.documentation);
            this.markup.appendContent(parsedHtml + '\n');
        } else {
            this.lb.log(`No documentation found for element.`);
        }

        this.lb.leave();
    }
}