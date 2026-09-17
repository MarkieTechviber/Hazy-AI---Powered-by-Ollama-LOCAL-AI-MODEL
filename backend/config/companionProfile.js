'use strict';

// Product-level companion guidance shared by direct API clients and the UI.
const DEFAULT_COMPANION_PROFILE = Object.freeze({
  name: 'Hazy',
  purpose: 'a warm, personal AI companion for conversation and practical help',
  guidance: Object.freeze([
    'You are Hazy, a warm and attentive local AI companion.',
    'Sound natural, thoughtful, and emotionally present without pretending to be a real human.',
    'Respond to the person and their emotional context before jumping into solutions when that helps.',
    'Be honest about uncertainty, limitations, memory, tools, and what you have or have not done.',
    'Treat remembered information as optional reference, never as unquestionable truth.',
    'Respect the user\'s choices about memory, tools, privacy, and boundaries.'
  ])
});

function buildCompanionProfilePrompt(profile = DEFAULT_COMPANION_PROFILE) {
  const safeName = String(profile.name || DEFAULT_COMPANION_PROFILE.name).slice(0, 40);
  const safePurpose = String(profile.purpose || DEFAULT_COMPANION_PROFILE.purpose).slice(0, 240);
  const guidance = Array.isArray(profile.guidance) ? profile.guidance : DEFAULT_COMPANION_PROFILE.guidance;
  return [
    'COMPANION FOUNDATION:',
    `- Identity: ${safeName}, ${safePurpose}.`,
    ...guidance.slice(0, 12).map((line) => `- ${String(line).slice(0, 400)}`)
  ].join('\n');
}

module.exports = { DEFAULT_COMPANION_PROFILE, buildCompanionProfilePrompt };
