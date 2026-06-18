/**
 * @module core/QueryBuilder
 * @description Central engine for retrieving, filtering, and sorting ArchiMate data.
 * Abstracts Scope, Select, and Sort logic away from the rendering artifacts.
 */
export class QueryBuilder {
    /**
     * @param {Object} modelElement - The template element representing the artifact.
     * @param {Object} targetElement - The current context being processed (can be view or concept).
     * @param {Object} logger - The logging utility.
     */
    constructor(modelElement, targetElement, logger) {
        this.modelElement = modelElement;
        this.targetElement = targetElement;
        this.lb = logger;
    }

    /**
     * Executes the query based on provided configuration.
     * @param {Object} config - { scope, currentView, select, sort }
     * @returns {Array} - The resulting list of ArchiMate elements.
     */
    fetch({ scope = 'view', currentView = null, select = {}, sort = 'name' }) {
        this.lb.log(`QueryBuilder: Fetching data. Scope: ${scope}, Type filter: ${select.types}`);

        let data = [];

        // 1. Resolve Data Selection (Relation or direct query)
        if (select.sourceElement && select.relationType) {
            // Logic: Follow the formal ArchiMate path: Source -> OutRels -> Target
            const rels = $(select.sourceElement).outRels(select.relationType);
            data = rels.map(r => r.target).filter(e => select.types.includes(e.type));
            this.lb.log(`QueryBuilder: Followed ${select.relationType} from ${select.sourceElement.name}. Found ${data.length} total model targets.`);
        } else {
            // Fallback: Scan entire model for the requested type
            const allModels = $(this.modelElement.model).find(select.types[0]);
            data = Array.from(allModels).filter(e => e.concept).map(e => e.concept);
            this.lb.log(`QueryBuilder: Scanned entire model. Found ${data.length} elements.`);
        }

        // 2. Apply Scope Filtering (View vs Model)
        if (scope === 'view') {
            if (currentView) {
                data = data.filter(e => {
                    // Does this concept have a visual node present in the current view?
                    const refsInView = $(e).objectRefs().filter(node => node.view && node.view.id === currentView.id);
                    return refsInView.length > 0;
                });
                this.lb.log(`QueryBuilder: Scope applied (view). Filtered down to ${data.length} targets visually present in diagram.`);
            } else {
                this.lb.log(`QueryBuilder: Warning - scope is 'view' but no view context was provided. Returning 0 targets.`);
                data = [];
            }
        }

        // 3. Apply Sort
        return this._applySort(data, sort, currentView);
    }

    /**
     * Sorts the data array based on the specified criteria.
     * @param {Array} data - The array of elements to sort.
     * @param {string} sortType - The sorting method ('name', 'position').
     * @param {Object} currentView - The current active view (required for positional sorting).
     * @returns {Array} - The sorted array.
     */
    _applySort(data, sortType, currentView) {
        let arr = Array.from(data);
        
        // SORT: POSITION (Visual layout in the current view)
        if (sortType === 'position') {
            this.lb.log(`QueryBuilder: Applying sort by visual position (Y-X)`);
            
            if (!currentView) {
                this.lb.log(`Warning: 'sort=position' requested but no currentView provided. Falling back to sort by name.`);
                return arr.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
            }
            
            // Helper to get visual node bounds of a concept within the specific view
            const getBounds = (concept) => {
                const refs = $(concept).objectRefs().filter(node => node.view && node.view.id === currentView.id);
                if (refs.length > 0) {
                    return refs.first().bounds;
                }
                // Elements not visually present in this view are sent to the back
                return { x: Number.MAX_SAFE_INTEGER, y: Number.MAX_SAFE_INTEGER };
            };

            return arr.sort((a, b) => {
                const boundsA = getBounds(a);
                const boundsB = getBounds(b);
                
                // Sort top-to-bottom (Y)
                const yDiff = boundsA.y - boundsB.y;
                if (yDiff !== 0) return yDiff;
                
                // Then left-to-right (X)
                const xDiff = boundsA.x - boundsB.x;
                if (xDiff !== 0) return xDiff;
                
                // Fallback to name if exactly at the same coordinate
                return (a.name || "").localeCompare(b.name || "");
            });
        } 
        
        // SORT: NAME (Default)
        else {
            if (sortType !== 'name') {
                this.lb.log(`QueryBuilder: Warning - unknown sort parameter '${sortType}'. Defaulting to 'name'.`);
            } else {
                this.lb.log(`QueryBuilder: Applying sort by name.`);
            }
            return arr.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        }
    }
}