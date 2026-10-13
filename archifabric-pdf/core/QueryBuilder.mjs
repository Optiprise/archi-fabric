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
 * @module core/QueryBuilder
 * @description Central engine for retrieving, filtering, and sorting ArchiMate data.
 * Abstracts Scope, Select, and Sort logic away from the rendering artifacts.
 */
export class QueryBuilder {
    /**
     * @param {Object} modelElement - The template element representing the artifact.
     * @param {Object} targetElement - The current context being processed (can be view or concept).
     * @param {Object} logger - The logging utility.
     * @param {Object} artifact - The Artifact instance.
     */
    constructor(modelElement, targetElement, logger, artifact) {
        this.modelElement = modelElement;
        this.targetElement = targetElement;
        this.lb = logger;
        this.artifact = artifact;
        this.lb.log(`QueryBuilder: constructor(modelElement=${modelElement}, targetElement=${targetElement})`);
    }

    /**
     * Executes the query based on provided configuration.
     * @param {Object} config - { scope, currentView, select, sort }
     * @returns {Array} - The resulting list of ArchiMate elements.
     */

    fetch({ scope = 'view', currentView = null, select = {}, sort = 'name' }) {
        this.lb.enter(`QueryBuilder.fetch(scope=${scope}, currentView=${currentView ? currentView.name : 'null'}, select=${JSON.stringify(select)}, sort=${sort})`);
        const effectiveScope = scope || 'view';
        const types = select.types || [];

        this.lb.log(`QueryBuilder: Fetching data. Scope: ${effectiveScope}, currentView: ${currentView ? currentView.name : 'null'}, Type filter: ${types}`);

        let data = [];

        // 1. Implementation of scope=object: If the scope is set to 'object', we bypass any relation-based selection and directly return the target element (or its concept) as a single-item array. This is useful for scenarios where we want to isolate the query to a specific element without considering its relationships or type filters.
        // If the scope is set to 'object', we bypass any relation-based selection and directly return the target element (or its concept) as a single-item array. This is useful for scenarios where we want to isolate the query to a specific element without considering its relationships or type filters.
        if (effectiveScope === 'object') {
            const concept = this.targetElement && (this.targetElement.concept || this.targetElement);
            if (concept && concept.id) {
                data = [concept];
            }
            this.lb.log(`QueryBuilder: Scope is 'object'. Bypassed relations and isolated query to target element '${concept ? concept.name : 'unknown'}'.`);
        } 
        // 2. Implementation of scope=view or scope=model: We perform a selection based on the provided 'select' configuration, which may include source elements, relation types, and direction. This allows for dynamic queries that can traverse the model's relationships to find connected elements, which is particularly useful for generating context-aware documentation or diagrams.
        else {
            data = this._selectElements(select, effectiveScope, currentView);
            data = this._applyScope(data, effectiveScope, currentView);
        }

        // 3. Implementation of type filtering and pattern matching: After the initial selection, we apply additional filters based on the specified types and optional regex patterns. This ensures that the final result set only includes elements that match the desired criteria, providing a more refined and relevant output for the rendering artifacts.        
        data = this._applyTypeFilter(data, types);
        data = this._applySelectFilter(data, select.pattern);
        this.lb.log(`QueryBuilder: Filter [${select.pattern}] applied. Filtered to ${data.length} elements.`);

        this.lb.leave(`data=${data.length}, sort=${sort}, currentView=${currentView ? currentView.name : 'null'}`);
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
        
        // sort by name (default)
        else {
            if (sortType !== 'name') {
                this.lb.log(`QueryBuilder: Warning - unknown sort parameter '${sortType}'. Defaulting to 'name'.`);
            } else {
                this.lb.log(`QueryBuilder: Applying sort by name.`);
            }
            return arr.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        }
    }

    /**
     * @param {Array} data - The array of elements to filter.
     * @param {String} selectString - The selection string (e.g., "${property:Cost}<500 &&${status}==Active")
     * @returns {Array} - The filtered array of elements.
     * @private
     */
    _applySelectFilter(data, selectString) {
        if (!selectString || selectString.trim() === '') return data;
        this.lb.log(`QueryBuilder: _applySelectFilter(data, selectString: ${selectString})`);

        let processedString = selectString.replace(/\$\{var:([^:}]+)(?::([^}]+))?\}/g, (match, varName, defaultValue) => {
            //  We attempt to retrieve the variable value from the contextArtifact (the artifact currently being processed). 
            // This allows for dynamic filtering based on global variables defined in the document structure or template.
            return this.artifact.artifactory ? this.artifact.artifactory.globalVars.get(varName) || (defaultValue || '') : (defaultValue || '');
        });
         this.lb.log(`QueryBuilder: prossessed selection=${processedString}.`);  
        // 1. Split the selection string into OR groups (||) and trim whitespace
        const orGroups = processedString.split('||').map(s => s.trim());

        return data.filter(element => {
            // 2. Check if any OR group evaluates to true for the current element (.some)
            return orGroups.some(orGroup => {
                
                // 3. Split the OR group into AND conditions (&&) and trim whitespace
                const andConditions = orGroup.split('&&').map(s => s.trim());
                
                // 4. Check if all AND conditions evaluate to true for the current element (.every)
                return andConditions.every(condition => {
                    
                    // 5. Parse the condition into expression, operator, and value using regex
                    const match = condition.match(/^(?:\$\{(.*?)\})?\s*(==|!=|~|>|<)?\s*(.*)$/);
                    if (!match) return true; // If the condition doesn't match the expected pattern, we consider it as true (no filtering).
                    
                    // 6. Extract the expression key (default ${name}), operator (default ~ regex)), and filter value from the regex match
                    const expKey = match[1] ? `\$\{${match[1]}\}` : '${name}';
                    const operator = match[2] || '~';
                    let filterValue = match[3];
                    
                    // 7. Remove surrounding quotes from the filter value if present (to allow for string comparisons)
                    if ((filterValue.startsWith('"') && filterValue.endsWith('"')) || 
                        (filterValue.startsWith("'") && filterValue.endsWith("'"))) {
                        filterValue = filterValue.substring(1, filterValue.length - 1);
                    }

                    // 8. Evaluate the expression using the ExpressionParser to get the actual value from the element    
                    const actualValue = this.artifact.parseExpression(expKey, element, this.artifact);
                    this.lb.log(`QueryBuilder: expKey(${expKey}), actualValue(${actualValue}), operator(${operator}), filterValue(${filterValue}).`);        

                    // 5. Apply the operator to compare the actual value with the filter value. The supported operators are:
                    //    - ~ : Regex match (case-insensitive)
                    //    - == : Exact match
                    //    - != : Not match
                    //    - > : Greater than (numerical comparison)
                    //    - < : Less than (numerical comparison)    
                    switch (operator) {
                        case '~': // Regex (case-insensitive)
                            try {
                            const regex = new RegExp(filterValue, 'i');
                            return regex.test(actualValue);
                            } catch (e) {
                                // Gooi een duidelijke foutmelding met een referentie naar uitleg
                                throw new Error(`Invalid Regular Expression in select filter: '${filterValue}'. Please check your syntax. For help, visit: https://regex101.com/`);
                            }
                        case '==': // Exact match
                            return actualValue == filterValue;
                        case '!=': // Not match
                            return actualValue != filterValue;
                        case '>': // Greater than
                            return parseFloat(actualValue) > parseFloat(filterValue);
                        case '<': // Less than
                            return parseFloat(actualValue) < parseFloat(filterValue);
                        default:
                            return true;
                    }
                });
            });
        });
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

        this.lb.log(`QueryBuilder: Scope applied (view). Filtered from ${data.length} down to ${scoped.length} elements.`);
        return scoped;
    }

    _applyTypeFilter(data, types) {
        if (!types || types.length === 0) {
            return data;
        }

        // 1. Determine the target specialization based on the modelElement's concept or its children. This is important for scenarios where certain templates require a specific specialization to be present in the elements being processed. We check both the root element and its nested children to find any matching specializations that align with the provided types.
        let targetSpecialization = null;
        
        // Check the main concept of the modelElement
        const mainConcept = this.modelElement.concept || this.modelElement;
        if (types.includes(mainConcept.type) && mainConcept.specialization) {
            targetSpecialization = mainConcept.specialization;
        }

        // Check the children of the modelElement for any matching types and specializations
        $(this.modelElement).children('element').each(child => {
            const concept = child.concept || child;
            if (types.includes(concept.type) && concept.specialization) {
                targetSpecialization = concept.specialization;
            }
        });

        // 2. Filter the data based on the determined target specialization. If a target specialization is found, we ensure that only elements matching that specialization are included in the final result set. This helps maintain the integrity of the template and ensures that only relevant elements are processed for rendering.
        return data.filter(e => {
            // Check A: Komt het hoofdtype overeen?
            if (!e || !e.type || types.indexOf(e.type) === -1) {
                return false;
            }

            // If a target specialization was determined, we further filter to ensure that only elements with the matching specialization are included. This is crucial for templates that require specific specializations to be present in the elements being processed.
            if (targetSpecialization) {
                if (e.specialization !== targetSpecialization) {
                    return false;
                }
            }

            return true;
        });
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