'use strict';

const { PermanentError } = require('../errors');

const PERMISSION_STATES = {
  ALLOW: 'allow',
  DENY: 'deny',
  ASK: 'ask'
};

/**
 * Ensures the AI Runtime does not execute unauthorized actions.
 * Supports three states: ALLOW, DENY, ASK.
 */
class PermissionLayer {
  constructor() {
    this.permissions = {
      write_files: PERMISSION_STATES.ASK,
      run_terminal: PERMISSION_STATES.DENY
    };
  }

  setPermission(action, state) {
    if (!Object.values(PERMISSION_STATES).includes(state)) {
      throw new Error(`Invalid permission state: ${state}`);
    }
    this.permissions[action] = state;
  }

  enforce(normalizedPayload) {
    let requiresConfirmation = false;
    let pendingAction = null;

    if (normalizedPayload.files && normalizedPayload.files.length > 0) {
      const state = this.permissions.write_files;
      if (state === PERMISSION_STATES.DENY) {
        throw new PermanentError('Permission denied: writing files is disabled.');
      }
      if (state === PERMISSION_STATES.ASK) {
        requiresConfirmation = true;
        pendingAction = { type: 'write_files', payload: normalizedPayload.files };
      }
    }

    if (normalizedPayload.commands && normalizedPayload.commands.length > 0) {
      const state = this.permissions.run_terminal;
      if (state === PERMISSION_STATES.DENY) {
        throw new PermanentError('Permission denied: running commands is disabled.');
      }
      if (state === PERMISSION_STATES.ASK) {
        requiresConfirmation = true;
        pendingAction = { type: 'run_terminal', payload: normalizedPayload.commands };
      }
    }

    if (requiresConfirmation) {
      // Append confirmation metadata so the upstream consumer can prompt the user
      normalizedPayload.requiresConfirmation = true;
      normalizedPayload.pendingAction = pendingAction;
    }

    return normalizedPayload;
  }
}

module.exports = new PermissionLayer();
module.exports.PERMISSION_STATES = PERMISSION_STATES;
