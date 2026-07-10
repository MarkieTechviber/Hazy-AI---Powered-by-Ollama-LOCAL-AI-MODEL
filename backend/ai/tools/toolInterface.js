'use strict';

/**
 * ToolInterface defines the contract that all executable tools must follow.
 * New tools can be added simply by dropping them into the tools/ plugin folders.
 */
class ToolInterface {
  
  /**
   * The unique identifier for the tool (e.g., 'write_files').
   * @returns {string}
   */
  get name() {
    throw new Error('Tool must implement "name" getter.');
  }

  /**
   * A JSON schema representing the tool's expected arguments.
   * This is sent to the LLM.
   * @returns {Object} JSON schema
   */
  getSchema() {
    throw new Error('Tool must implement getSchema()');
  }

  /**
   * Validates the tool's raw arguments before execution.
   * Prevents unsafe operations (like path traversal) before reaching execution.
   * @param {Object} args - The parsed arguments from the LLM.
   * @returns {boolean} True if valid, throws ValidationError otherwise.
   */
  validate(args) {
    throw new Error('Tool must implement validate(args)');
  }

  /**
   * Defines the permission state required to run this tool.
   * Options are 'ALLOW', 'DENY', or 'ASK'.
   * @returns {string}
   */
  permissions() {
    return 'ASK'; // Default to require confirmation
  }

  /**
   * Executes the tool's logic.
   * @param {Object} args - The validated arguments.
   * @returns {Promise<any>} The result of the execution.
   */
  async execute(args) {
    throw new Error('Tool must implement execute(args)');
  }
}

module.exports = ToolInterface;
