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
    /**
     * Executes the query based on provided configuration.
     * @param {Object} config - { scope, currentView, select, sort }
     * @returns {Array} - The resulting list of ArchiMate elements.
     */

    fetch({ scope = 'view', currentView = null, select = {}, sort = 'name' }) {
        const effectiveScope = scope || 'view';
        const types = select.types || [];

        this.lb.log(`QueryBuilder: Fetching data. Scope: ${effectiveScope}, currentView: ${currentView ? currentView.name : 'null'}, Type filter: ${types}`);

        let data = [];

        // 1. IMPLEMENTATIE VAN SCOPE=OBJECT
        // If the scope is set to 'object', we bypass any relation-based selection and directly return the target element (or its concept) as a single-item array. This is useful for scenarios where we want to isolate the query to a specific element without considering its relationships or type filters.
        if (effectiveScope === 'object') {
            const concept = this.targetElement && (this.targetElement.concept || this.targetElement);
            if (concept && concept.id) {
                data = [concept];
            }
            this.lb.log(`QueryBuilder: Scope is 'object'. Bypassed relations and isolated query to target element '${concept ? concept.name : 'unknown'}'.`);
        } 
        // 2. LOGICA VOOR SCOPE=VIEW EN SCOPE=MODEL
        else {
            data = this._selectElements(select, effectiveScope, currentView);
            data = this._applyScope(data, effectiveScope, currentView);
        }

        // 3. Pas type- en patroonfilters toe (zelfs bij een object, om de sjabloon-integriteit te bewaken)
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

    _selectElements(select, effectiveScope, currentView) {
        const types = select.types || [];

        // 1. FORCE TYPE SELECT: If the modelElement's name contains 'select=type', we bypass any relation-based filtering and directly return all elements of the specified types. This is a special case that allows for a more direct query when the user explicitly wants to filter by type without considering relationships or spatial constraints.
        const forceTypeSelect = this.modelElement && this.modelElement.name && this.modelElement.name.includes('select=type');
        
        if (forceTypeSelect) {
            this.lb.log("QueryBuilder: 'select=type' parameter applied. Bypassing spatial relation filter.");
        }

        // 2. RELATION-BASED SELECTION: If a source element and relation type are specified, we retrieve all related elements based on the direction of the relationship. This allows for dynamic queries that can traverse the model's relationships to find connected elements, which is particularly useful for generating context-aware documentation or diagrams.
        if (select.sourceElement && select.relationType && !forceTypeSelect) {
            let related = [];

            if (select.relationDirection === "in") {
                related = Array.from(
                    $(select.sourceElement).inRels(select.relationType).map(r => r.source)
                );
            } else {
                related = Array.from(
                    $(select.sourceElement).outRels(select.relationType).map(r => r.target)
                );
            }

            this.lb.log(`QueryBuilder: Relation selection found ${related.length} elements. relation=${select.relationType}/${select.relationDirection || "out"}`);
            return this._uniqueById(related);
        }

        // 3. MODEL SCAN: If no specific source element or relation type is provided, we perform a global scan of the model for elements of the specified types. This is a more exhaustive search that retrieves all elements matching the type filter, regardless of their relationships or spatial context. It is useful for generating comprehensive lists or reports of certain element types within the entire model.
        // If the scope is set to 'view', we optimize the selection by only scanning elements that are visually present in the current view. This avoids a full model scan and significantly improves performance for large models. We collect all concepts that have a visual representation in the specified view and return them as the result set.
        if (effectiveScope === 'view' && currentView) {
            const elementsInView = [];
            $(currentView).find('element').each(visualNode => {
                if (visualNode && visualNode.concept) {
                    elementsInView.push(visualNode.concept);
                }
            });
            this.lb.log(`QueryBuilder: Type selection optimized! Scanned only view '${currentView.name}'. Found ${elementsInView.length} concepts.`);
            return elementsInView;
        }

        // 4. MODEL STRATEGY: If no source element or relation type is specified, and the scope is not limited to a view, we perform a global scan of the model for elements of the specified types. This is a more exhaustive search that retrieves all elements matching the type filter, regardless of their relationships or spatial context. It is useful for generating comprehensive lists or reports of certain element types within the entire model.
        // If no types are specified, we log a warning and return an empty array to avoid unnecessary processing. This ensures that the query does not return unintended results and maintains the integrity of the selection process.
        if (!types || types.length === 0) {
            this.lb.log("QueryBuilder: No relation and no type filter. Returning empty result.");
            return [];
        }
        if (!types || types.length === 0) {
            this.lb.log("QueryBuilder: No relation and no type filter. Returning empty result.");
            return [];
        }

        const elements = Array.from($(this.modelElement.model).find(types[0]));
        this.lb.log(`QueryBuilder: Type selection scanned global model for '${types[0]}'. Found ${elements.length} elements.`);

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