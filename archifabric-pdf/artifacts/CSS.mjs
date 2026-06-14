/**
 * @module artifacts/CSS
 * @description Artifact that injects custom CSS styling into the final document.
 * It reads the CSS code from the content of an Archi Note or the documentation of an element,
 * and appends it to the global stylesheet buffer.
 */
import { Artifact } from '../core/Artifact.mjs';

export default class CSS extends Artifact { 
    /**
     * Initializes the CSS injection artifact.
     * @param {Object} artifactory - The main Artifactory instance.
     */
    constructor(artifactory) {
        super('CSS', artifactory);
    }

    /**
     * Reads the CSS content and adds it to the Markup engine's CSS buffer.
     * @param {Object} modelElement - The Archi template element.
     * @param {Object} targetElement - The actual Archi element containing the CSS string.
     */
    render(modelElement, targetElement) {
        this.lb.enter(`${this.name}.render`);

        // CSS is typically stored in the 'content' of a Note, or 'documentation' of a Group/Element
        const cssContent = targetElement.content || targetElement.documentation || '';
        
        if (cssContent) {
            this.lb.log(`Injecting custom CSS from element: ${targetElement.name || targetElement.id}`);
            this.markup.appendCss(cssContent + '\n');
        } else {
            this.lb.log(`Warning: No CSS content found in target element.`);
        }
        
        this.lb.leave();
    }
}