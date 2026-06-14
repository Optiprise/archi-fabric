/**
 * @module core/TargetStructure
 * @description Builds an index for a target view or group. 
 * Provides a pipeline to Scope (gather nodes), Select (filter nodes), and Sort (order nodes)
 * based on X/Y positioning or dependency chains.
 */

export class TargetStructure {
    /**
     * @param {Object} lb - The LogBook instance.
     * @param {Object} targetElement - The view, group, or diagram object to process.
     * @param {Object} [options] - Configuration options.
     * @param {string[]} [options.dependencyRelTypes] - Relationship types defining the dependency chain.
     * @param {"Y_X"|"X_Y"} [options.xyMode] - Reading order preference.
     */
    constructor(lb, targetElement, options = {}) {
        this.lb = lb;
        this.target = targetElement;

        this.options = {
            dependencyRelTypes: options.dependencyRelTypes || ["flow-relationship", "triggering-relationship"],
            xyMode: options.xyMode || "Y_X",
        };

        // Resolve reference views if a diagram-model-reference is passed
        this.root = ($(targetElement).is("diagram-model-reference") ? targetElement.refView : targetElement);

        // Indices
        this.nodes = new Map();          // nodeId -> node data
        this.children = new Map();       // nodeId -> Array of childIds
        this.conceptToNodes = new Map(); // conceptId -> Array of nodeIds
        this.parentOf = new Map();       // nodeId -> parentId

        // Initialize the pipeline
        this.currentResultSet = [];
        this._buildScope();
    }

    // ========================================================================
    // PIPELINE PHASE 1: SCOPE (Gathering all elements)
    // ========================================================================

    /**
     * Builds the initial flat index and hierarchy maps of all relevant objects.
     * @private
     */
    _buildScope() {
        this.lb?.enter?.(`TargetStructure._buildScope(${this.root})`);

        if (!this.root || !$(this.root).children) {
            this.lb?.leave?.(`No children found in scope.`);
            return;
        }

        const addNode = (obj, parentId = null, parentAbs = { x: 0, y: 0 }, depth = 0) => {
            const b = obj.bounds || { x: 0, y: 0, width: 0, height: 0 };
            const type = obj.type || $(obj).attr("type") || "";
            const name = obj.labelValue || obj.name || "";

            const node = {
                id: obj.id,
                obj: obj,
                type: type,
                name: name,
                bounds: { x: b.x, y: b.y, w: b.width, h: b.height },
                absBounds: { x: parentAbs.x + b.x, y: parentAbs.y + b.y, w: b.width, h: b.height },
                parentId: parentId,
                childIds: [],
                depth: depth,
                index: $(obj).attr("index"),
                conceptId: (obj.concept ? obj.concept.id : null),
            };

            this.nodes.set(node.id, node);
            this.parentOf.set(node.id, parentId);

            if (node.conceptId) {
                if (!this.conceptToNodes.has(node.conceptId)) {
                    this.conceptToNodes.set(node.conceptId, []);
                }
                this.conceptToNodes.get(node.conceptId).push(node.id);
            }

            // Recurse through children, excluding visual connections
            $(obj).children().not("relationship").not("diagram-model-connection").each((child) => {
                const childNode = addNode(child, node.id, { x: node.absBounds.x, y: node.absBounds.y }, depth + 1);
                node.childIds.push(childNode.id);
            });

            this.children.set(node.id, node.childIds);
            return node;
        };

        // Start indexing from the root level
        $(this.root).children().not("relationship").not("diagram-model-connection").each((obj) => {
            addNode(obj, null, { x: 0, y: 0 }, 0);
        });

        // Set initial result set to all top-level nodes
        this.currentResultSet = this.allNodes();
        this.lb?.leave?.(`Scope built. Total nodes indexed: ${this.nodes.size}`);
    }

    // ========================================================================
    // PIPELINE PHASE 2: SELECT (Filtering elements)
    // ========================================================================

    /**
     * Filters the current result set based on a specific container or criteria.
     * * @param {Object} criteria - Filter criteria.
     * @param {string} [criteria.containerId] - Only include nodes inside this container.
     * @returns {TargetStructure} Returns this instance for chaining.
     */
    applySelect(criteria = {}) {
        this.lb?.enter?.(`TargetStructure.applySelect`);
        
        if (criteria.containerId) {
            const allowedIds = new Set(this._getNodesInsideContainer(criteria.containerId).map(n => n.id));
            this.currentResultSet = this.currentResultSet.filter(n => allowedIds.has(n.id));
        }

        // Additional selection criteria (like RegEx on names or element types) can be added here
        
        this.lb?.leave?.(`Nodes remaining after select: ${this.currentResultSet.length}`);
        return this; // Enable chaining
    }

    // ========================================================================
    // PIPELINE PHASE 3: SORT (Ordering elements)
    // ========================================================================

    /**
     * Sorts the current result set based on a sorting strategy.
     * * @param {string} strategy - "XY" for visual reading order, "DEPENDENCY" for topological flow.
     * @returns {Array} The final processed array of nodes ready for artifact rendering.
     */
    applySort(strategy = "XY") {
        this.lb?.enter?.(`TargetStructure.applySort(${strategy})`);

        let result = [];
        if (strategy === "XY") {
            result = this._flattenDepthFirst();
        } else if (strategy === "DEPENDENCY") {
            result = this._dependencyOrderedNodes();
        } else {
            result = this.currentResultSet; // Fallback to unsorted
        }

        this.lb?.leave?.();
        return result;
    }

    // ========================================================================
    // HELPER & SORTING LOGIC
    // ========================================================================

    allNodes() {
        return [...this.nodes.values()];
    }

    _getNodesInsideContainer(containerId) {
        const set = new Set();
        const walk = (id) => {
            set.add(id);
            const kids = this.children.get(id) || [];
            kids.forEach(walk);
        };
        walk(containerId);
        return [...set].map((id) => this.nodes.get(id)).filter(Boolean);
    }

    /**
     * Compares two nodes visually based on their absolute coordinates.
     * @private
     */
    _cmpXY(a, b, mode = this.options.xyMode) {
        const A = a.absBounds, B = b.absBounds;
        const ia = (a.index ?? 0), ib = (b.index ?? 0);

        if (mode === "X_Y") {
            return (A.x - B.x) || (A.y - B.y) || (ia - ib) || (a.name.localeCompare(b.name));
        }
        return (A.y - B.y) || (A.x - B.x) || (ia - ib) || (a.name.localeCompare(b.name));
    }

    /**
     * Sorts nodes in a visual reading order while respecting hierarchy depth.
     * @private
     */
    _flattenDepthFirst() {
        const out = [];
        // Only sort nodes that are currently in our filtered result set
        const currentIds = new Set(this.currentResultSet.map(n => n.id));
        
        const roots = this.allNodes()
            .filter((n) => !n.parentId && currentIds.has(n.id))
            .sort((a, b) => this._cmpXY(a, b));

        const walk = (n) => {
            out.push(n);
            const kids = n.childIds
                .map((id) => this.nodes.get(id))
                .filter(child => child && currentIds.has(child.id))
                .sort((a, b) => this._cmpXY(a, b));
            kids.forEach(walk);
        };

        roots.forEach(walk);
        return out;
    }

    /**
     * Topologically sorts nodes based on their ArchiMate relationships (flow/trigger).
     * @private
     */
    _dependencyOrderedNodes() {
        // Build graph edges
        const edges = new Map();
        const conceptIds = [...this.conceptToNodes.keys()];
        const conceptSet = new Set(conceptIds);

        conceptIds.forEach((cid) => {
            const nodeIds = this.conceptToNodes.get(cid) || [];
            const n = nodeIds.length ? this.nodes.get(nodeIds[0]) : null;
            const concept = n?.obj?.concept;

            if (!concept) return;

            let outR = $();
            this.options.dependencyRelTypes.forEach((t) => {
                outR = outR.add($(concept).outRels(t));
            });

            outR.targetEnds().each((tConcept) => {
                if (tConcept && tConcept.id && conceptSet.has(tConcept.id)) {
                    if (!edges.has(cid)) edges.set(cid, new Set());
                    edges.get(cid).add(tConcept.id);
                }
            });
        });

        // Kahn's algorithm for Topological Sorting
        const indeg = new Map(conceptIds.map((id) => [id, 0]));
        for (const [u, vs] of edges.entries()) {
            for (const v of vs.values()) {
                indeg.set(v, (indeg.get(v) || 0) + 1);
            }
        }

        const zero = conceptIds
            .filter((id) => (indeg.get(id) || 0) === 0)
            .sort((a, b) => a.localeCompare(b)); // Simple tie-breaker

        const q = [...zero];
        const outConcepts = [];

        while (q.length) {
            const u = q.shift();
            outConcepts.push(u);

            const vs = edges.get(u);
            if (vs) {
                for (const v of vs.values()) {
                    indeg.set(v, indeg.get(v) - 1);
                    if (indeg.get(v) === 0) q.push(v);
                }
                q.sort((a, b) => a.localeCompare(b));
            }
        }

        // Map sorted concepts back to actual nodes present in the filtered result set
        const currentIds = new Set(this.currentResultSet.map(n => n.id));
        const outNodes = [];

        outConcepts.forEach((cid) => {
            const nodeIds = this.conceptToNodes.get(cid) || [];
            const matchingNodes = nodeIds
                .map((id) => this.nodes.get(id))
                .filter(node => node && currentIds.has(node.id))
                .sort((a, b) => this._cmpXY(a, b)); // Group instances visually
            outNodes.push(...matchingNodes);
        });

        return outNodes;
    }
}