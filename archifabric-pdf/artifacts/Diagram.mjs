/**
 * @module artifacts/Diagram
 * @description Artifact that renders an ArchiMate view as a Base64 encoded PNG image.
 * The scale (width percentage) of the image can be visually determined by placing a child element 
 * (e.g., a note) inside the Diagram group template. The ratio of their widths dictates the scale.
 */
import { Artifact } from '../core/Artifact.mjs';
import { ModelStructure } from '../core/ModelStructure.mjs';

export default class Diagram extends Artifact { 
    /**
     * Initializes the Diagram artifact with default image quality and margin settings.
     * @param {Object} artifactory - The main Artifactory instance.
     */
    constructor(artifactory) {
        super('Diagram', artifactory);
        this.helpUrl = 'https://optiprise.nl/archi-fabric/?view=id-df0d0ec25ec04bcea69f617758228255';
        
        // Default settings for jArchi Base64 rendering
        this.defaultImageQuality = 0.5;
        this.defaultImageMargin = 4;
    }

    /**
     * Renders the Base64 image and its HTML wrapper (<figure> and <figcaption>).
     * @param {Object} modelElement - The Archi template element defining the diagram layout and scale.
     * @param {Object} targetElement - The actual Archi view or element to render.
     */
    render(modelElement, targetElement) {
        this.lb.enter(`${this.name}.render(model: ${modelElement.name}, target: ${targetElement.name})`);
        
        // 1. Analyze the Template for Scale and View overrides FIRST
        const modelStructure = new ModelStructure(this.lb, modelElement);
        const children = modelStructure.sortedElements;
        
        let viewToRender = targetElement;
        let scale = 100; // Default width is 100%
        let alignmentClass = ' align-center';

        if (children.length > 0) {
            const sizingElement = children[0];
            
            // Calculate scale: child width / parent width
            scale = Math.round((sizingElement.bounds.width / modelElement.bounds.width) * 100);
            this.lb.log(`Calculated scale: ${scale}% based on child element.`);

            // If the sizing element itself is a diagram-model-reference, override the view being rendered
            if ($(sizingElement).is('diagram-model-reference') && sizingElement.refView) {
                viewToRender = sizingElement.refView;
                this.lb.log(`View overridden by nested reference: ${viewToRender.name}`);
            }

            if (modelElement.bounds && sizingElement.bounds) {
                const parentWidth = modelElement.bounds.width;
                const childX = sizingElement.bounds.x;
                const childWidth = sizingElement.bounds.width;
                
                // Bereken het middelpunt van de child ten opzichte van de parent
                const childCenter = childX + (childWidth / 2);

                if (childCenter < (parentWidth / 3)) {
                    alignmentClass = ' align-left';
                } else if (childCenter > (parentWidth / 3) * 2) {
                    alignmentClass = 'align-right';
                } 
                this.lb.log(`Diagram position calculated: ${alignmentClass} (center: ${childCenter}, parent width: ${parentWidth})`);
            }
        }
        
        // Safety check: if targetElement was passed as a reference, resolve it to the actual view
        if ($(viewToRender).is('diagram-model-reference') && viewToRender.refView) {
            viewToRender = viewToRender.refView;
        }

        if (!viewToRender || !$(viewToRender).is('archimate-diagram-model')) {
            this.lb.error(`Diagram artifact requires an 'archimate-diagram-model' (View) as target, but received: ${viewToRender ? viewToRender.type : 'undefined'}`);
            this.lb.leave();
            return; // Abort ONLY this image, do not crash the script!
        }
        
        // Validate that we actually have a valid view object to render
        if (!viewToRender || !viewToRender.id) {
            this.lb.error("No valid view found to render for Diagram artifact.");
            this.lb.leave();
            return;
        }

        // Extract base name and optional custom parameters (e.g., class=page-break)
        const { baseName, params } = this.parseTemplateName(modelElement.name);        

        // Generate the base CSS class, and append any custom class if provided
        const baseCssClass = this.markup.genHtmlClass(baseName);
        const customCssClass = params['class'] ? ` ${params['class']}` : '';
        const cssClass = baseCssClass + alignmentClass + customCssClass;
        
        // The caption should default to the actual View's name.
        // If the user provided a labelExpression on the template (e.g. "Figure: ${name}"), we evaluate it against the View.
        let captionText = viewToRender.name; 
        if (modelElement.labelExpression) {
            captionText = this.parseExpression(modelElement.labelExpression, viewToRender);
        }

        // 3. Retrieve Global Variables for Quality & Margin (or fallback to defaults)
        const globalQuality = this.globalVars.get('imageQuality');
        const imageQuality = globalQuality !== undefined ? parseFloat(globalQuality) : this.defaultImageQuality;

        const globalMargin = this.globalVars.get('imageMargin');
        const imageMargin = globalMargin !== undefined ? parseInt(globalMargin, 10) : this.defaultImageMargin;

        const options = { scale: imageQuality, margin: imageMargin };

        // 4. Generate the Image and HTML
        try {
            this.lb.log(`Rendering Base64 PNG for view: ${viewToRender.name} | Quality: ${imageQuality}`);
            const base64Image = $.model.renderViewAsBase64(viewToRender, "PNG", options);

            this.markup.appendContent(`\n<figure class="${cssClass}-figure">\n`);
            
            // Note: Weasyprint supports width="X%" natively on images.
            this.markup.appendContent(`  <img class="${cssClass}-img" src="data:image/png;base64,${base64Image}" alt="${viewToRender.name}" width="${scale}%" />\n`);
            
            this.markup.appendContent(`  <figcaption class="${cssClass}-caption" view-name="${viewToRender.name}">${captionText}</figcaption>\n`);
            this.markup.appendContent(`</figure>\n`);
            
        } catch (error) {
            this.lb.error(`Failed to render Base64 image: ${error.message}`);
        }

        this.lb.leave();
    }
}