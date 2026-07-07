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
        this.lb.log(`QueryBuilder: constructor(modelElement=${modelElement}, targetElement=${targetElement})`);
    }

    /**
     * Executes the query based on provided configuration.
     * @param {Object} config - { scope, currentView, select, sort }
     * @returns {Array} - The resulting list of ArchiMate elements.
     */
    fetch({ scope = 'view', currentView = null, select = {}, sort = 'name' }) {
        const effectiveScope = scope || 'view';
        const types = select.types || [];

        this.lb.log(`QueryBuilder: Fetching data. Scope: ${effectiveScope}, currentView: ${currentView}, Type filter: ${types}`);

        let data = this._selectElements(select);

        data = this._applyScope(data, effectiveScope, currentView);
        data = this._applyTypeFilter(data, types);
        data = this._applyPattern(data, select.pattern);

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

    _applyPattern(data, pattern) {
        if (!pattern) return data;

        try {
            const regex = new RegExp(pattern, 'i');

            return data.filter(e => {
                const matchName = e.name && regex.test(e.name);
                const matchDoc = e.documentation && regex.test(e.documentation);
                return matchName || matchDoc;
            });
        } catch (err) {
            this.lb.log(`QueryBuilder: Invalid Regex pattern '${pattern}'. Skipping.`);
            return data;
        }
    }

    _containsElement(elements, candidate) {
        return elements.some(element =>
            element &&
            candidate &&
            element.id === candidate.id
        );
    }

    _selectElements(select) {
        const types = select.types || [];

        if (select.sourceElement && select.relationType) {
            let related = [];

            if (select.relationDirection === "in") {
                related = Array.from(
                    $(select.sourceElement)
                        .inRels(select.relationType)
                        .map(r => r.source)
                );
            } else {
                related = Array.from(
                    $(select.sourceElement)
                        .outRels(select.relationType)
                        .map(r => r.target)
                );
            }

            this.lb.log(
                `QueryBuilder: Relation selection found ${related.length} elements. ` +
                `relation=${select.relationType}/${select.relationDirection || "out"}`
            );

            return this._uniqueById(related);
        }

        if (!types || types.length === 0) {
            this.lb.log("QueryBuilder: No relation and no type filter. Returning empty result.");
            return [];
        }

        const elements = Array.from(
            $(this.modelElement.model).find(types[0])
        );

        this.lb.log(
            `QueryBuilder: Type selection scanned model for '${types[0]}'. Found ${elements.length} elements.`
        );

        return elements;
    }
    _applyScope(data, scope, currentView) {
        if (scope !== 'view') {
            return data;
        }

        if (!currentView) {
            this.lb.log("QueryBuilder: scope=view but no currentView was provided. Returning 0 elements.");
            return [];
        }

        const scoped = data.filter(e => this._isVisibleInView(e, currentView));

        this.lb.log(
            `QueryBuilder: Scope applied (view). Filtered from ${data.length} down to ${scoped.length} elements.`
        );

        return scoped;
    }

    _applyTypeFilter(data, types) {
        if (!types || types.length === 0) {
            return data;
        }

        return data.filter(e =>
            e &&
            e.type &&
            types.indexOf(e.type) !== -1
        );
    }

    _uniqueById(elements) {
        const seen = {};
        const result = [];

        elements.forEach(e => {
            if (!e || !e.id || seen[e.id]) return;
            seen[e.id] = true;
            result.push(e);
        });

        return result;
    }

    _isVisibleInView(element, currentView) {
        if (!element || !currentView) {
            return false;
        }

        const refsInView = $(element).objectRefs().filter(node =>
            node &&
            node.view &&
            node.view.id === currentView.id
        );

        return refsInView.length > 0;
    }
}