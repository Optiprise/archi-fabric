/**
 * @module core/ModelStructure
 * @description Analyzes the visual template (Model Structure) defined in the Archi diagram.
 * Extracts parameters like layout bounds, repeatable elements (lists), ArchiMate context,
 * and handles the spatial pairing of templates with their adjacent target views.
 */

export class ModelStructure {
    /**
     * Initializes the ModelStructure by analyzing the provided template element.
     * @param {Object} lb - The LogBook instance for logging.
     * @param {Object} modelElement - The Archi diagram element acting as the template container.
     */
    constructor(lb, modelElement) {
        lb.enter(`ModelStructure.constructor(${modelElement.name || modelElement.id})`);
        
        if (!($(modelElement).is('element')) && 
            !($(modelElement).is('diagram-model-group')) && 
            !($(modelElement).is('diagram-model-reference'))) {
            lb.error(`Illegal Element provided to ModelStructure: ${modelElement}`);
        }

        this.lb = lb;
        this.modelElement = modelElement;
        
        // Extracted properties
        this.repeatElementID = '';
        this.listDirection = ''; // 'V' for Vertical, 'H' for Horizontal
        this.archimateElement = null;
        this.size = 0;
        
        // Grid spacing properties
        this.xPositions = [];
        this.yPositions = [];

        this._analyzeStructure();
        this.lb.leave();
    }

    /**
     * Performs the layout and bounds analysis to determine grid spacing
     * and identifies special elements like the repeat-note and ArchiMate concepts.
     * @private
     */
    _analyzeStructure() {
        const xSet = new Set([0, this.modelElement.bounds.width - 1]);
        const ySet = new Set([0, this.modelElement.bounds.height - 1]);

        this.sortedElements = this._sortElements(this.modelElement);
        this.size = this.sortedElements.length;

        this.sortedElements.forEach(element => {
            // Register boundaries for the grid
            xSet.add(element.bounds.x);
            xSet.add(element.bounds.x + element.bounds.width - 1);
            ySet.add(element.bounds.y);
            ySet.add(element.bounds.y + element.bounds.height - 1);

            this._checkArchiMateElement(element);
            this._checkRepeatableElement(element);
        });

        // Calculate and finalize cell spacing
        this.xPositions = Array.from(xSet).sort((a, b) => a - b);
        this.yPositions = Array.from(ySet).sort((a, b) => a - b);

        if (this.listDirection === 'H') this.xPositions.pop();
        if (this.listDirection === 'V') this.yPositions.pop();
    }

    /**
     * Checks if the element is an ArchiMate concept and ensures only one exists as context.
     * @param {Object} element - The Archi element to check.
     * @private
     */
    _checkArchiMateElement(element) {
        if ($(element).is('element')) {
            if (!this.archimateElement) {
                this.archimateElement = element;
                this.lb.log(`ArchiMate context element found: ${this.archimateElement.name}`);
            } else if (this.archimateElement.concept.id !== element.concept.id) {
                this.lb.error('More than one distinct ArchiMate element found in the same container!');
            }
        }
    }

    /**
     * Identifies the dog-ear note used for repeating sequences (lists).
     * @param {Object} element - The Archi element to check.
     * @private
     */
    _checkRepeatableElement(element) {
        if ($(element).is('diagram-model-note') && element.borderType === 0) {
            this.repeatElementID = element.id;

            if ((element.bounds.width - 3) < this.modelElement.bounds.width) {
                this.listDirection = 'V';
            } else if ((element.bounds.height - 3) < this.modelElement.bounds.height) {
                this.listDirection = 'H';
            } else {
                this.lb.error('Illegal dimensions detected for the repeat note.');
            }
        }
    }

    /**
     * Sorts the children of the given container by Y, then X coordinates.
     * @param {Object} containerElement - The parent element.
     * @returns {Array} Sorted array of elements.
     * @private
     */
    _sortElements(containerElement) {
        const children = $(containerElement)
            .children()
            .not("relationship")
            .not("diagram-model-connection");
            
        return Array.from(children).sort((a, b) => {
            return (a.bounds.y - b.bounds.y) || (a.bounds.x - b.bounds.x);
        });
    }

    /**
     * Scans the sorted elements and pairs template references with their explicitly 
     * defined targets positioned to the right (and stacked vertically).
     * @returns {Array<{template: Object, targets: Array<Object>}>} An array of pairing objects.
     */
    getTemplateTargetPairs() {
        this.lb.enter('ModelStructure.getTemplateTargetPairs');
        const pairs = [];
        const elements = this.sortedElements;
        let i = 0;

        while (i < elements.length) {
            const currentElement = elements[i];
            const rowBottom = currentElement.bounds.y + currentElement.bounds.height;
            const targetElements = [];

            if ($(currentElement).is('diagram-model-reference')) {
                i++; // Move to the next element to search for targets
                
                // Horizontal Lookahead: Consume elements that are positioned below the template's top edge
                // and fit within the template's bottom edge constraint. (Allows vertical stacking on the right).
                while (i < elements.length && elements[i].bounds.y <= rowBottom) {
                    targetElements.push(elements[i]);
                    i++;
                }
            } else {
                // Standard group or note. Just process this single item.
                i++;
            }

            pairs.push({
                template: currentElement,
                targets: targetElements
            });
        }

        this.lb.leave(`Generated ${pairs.length} Template/Target pairs.`);
        return pairs;
    }
    
    /**
     * Exposes the extracted parameters so the TargetStructure can use them.
     * @returns {Object} Configuration parameters.
     */
    getParameters() {
        return {
            archimateConceptId: this.archimateElement ? this.archimateElement.concept.id : null,
            listDirection: this.listDirection,
            repeatElementID: this.repeatElementID
        };
    }
}