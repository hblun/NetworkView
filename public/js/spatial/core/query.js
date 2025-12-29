/**
 * Spatial query domain model
 *
 * Pure data structure representing a spatial query.
 * No dependencies on global state or DOM.
 */

export class SpatialQuery {
  /**
   * Create a spatial query
   * @param {object} options - Query options
   * @param {string} options.find - What to find ("routes" or "stops")
   * @param {string} options.condition - Spatial relation ("within" or "intersect")
   * @param {number} options.distance - Distance in meters
   * @param {string} options.target - Target type ("selected_point" or "boundary")
   * @param {Array} options.blocks - Additional query blocks
   */
  constructor({
    find = "routes",
    condition = "intersect",
    distance = 300,
    target = "selected_point",
    blocks = []
  } = {}) {
    this.find = find;
    this.condition = condition;
    this.distance = distance;
    this.target = target;
    this.blocks = blocks.map(b => ({ ...b })); // Deep copy
  }

  /**
   * Serialize to plain object
   * @returns {object} Plain object representation
   */
  toJSON() {
    return {
      find: this.find,
      condition: this.condition,
      distance: this.distance,
      target: this.target,
      blocks: this.blocks.map(b => ({ ...b }))
    };
  }

  /**
   * Deserialize from plain object
   * @param {object} json - Plain object representation
   * @returns {SpatialQuery} Query instance
   */
  static fromJSON(json) {
    return new SpatialQuery(json);
  }

  /**
   * Generate human-readable description
   * @returns {string} Description
   */
  describe() {
    let desc = `Find ${this.find} ${this.condition} ${this.distance}m of ${this.target}`;

    this.blocks.forEach(block => {
      if (block.type === "exclude") {
        desc += `, excluding ${block.operator} = ${block.value}`;
      } else if (block.type === "include" || block.type === "also-include") {
        desc += `, including ${block.operator}`;
        if (block.value) {
          desc += ` = ${block.value}`;
        }
      }
    });

    return desc;
  }
}
