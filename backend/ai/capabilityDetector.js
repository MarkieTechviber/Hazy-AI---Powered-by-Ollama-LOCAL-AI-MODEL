'use strict';

const { getModelCapabilities, setModelCapabilities } = require('./modelRegistry');

/**
 * Detects model capabilities by running lightweight probe requests.
 * @param {string} modelId 
 * @param {Object} provider - Provider interface instance
 * @returns {Promise<Object>} Capabilities object
 */
async function detectCapabilities(modelId, provider) {
  let currentDigest = '';

  // 1. Fetch provider metadata (digest) to validate cache freshness
  if (provider && typeof provider.getMetadata === 'function') {
    const meta = await provider.getMetadata(modelId);
    currentDigest = meta.digest || '';
  }

  // 2. Check Cache
  let caps = getModelCapabilities(modelId, currentDigest);
  if (caps) return caps;

  caps = {
    supportsTools: false,
    supportsJson: false
  };

  try {
    // Probe 1: Tool Calling Test
    const toolTestResult = await provider.execute({
      modelId,
      messages: [{ role: 'user', content: 'Add 5 and 7' }],
      tools: [{
        name: 'add',
        description: 'Adds two numbers',
        parameters: {
          type: 'object',
          properties: {
            a: { type: 'number' },
            b: { type: 'number' }
          },
          required: ['a', 'b']
        }
      }]
    });
    
    if (toolTestResult && Array.isArray(toolTestResult.toolCalls) && toolTestResult.toolCalls.length > 0) {
      caps.supportsTools = true;
    }
  } catch (err) {
    console.warn(`[CapabilityDetector] Tool probe failed for ${modelId}:`, err.message);
  }

  try {
    if (!caps.supportsTools) {
      // Probe 2: JSON Mode Test (if tools failed)
      const jsonTestResult = await provider.execute({
        modelId,
        messages: [{ role: 'user', content: 'Respond with a JSON object containing {"hello": "world"}' }],
        format: 'json'
      });
      
      const text = jsonTestResult.text || jsonTestResult.content || '';
      try {
        JSON.parse(text);
        caps.supportsJson = true;
      } catch (e) {
        // failed JSON test
      }
    } else {
      caps.supportsJson = true; // Tool models inherently support JSON
    }
  } catch (err) {
    console.warn(`[CapabilityDetector] JSON probe failed for ${modelId}:`, err.message);
  }

  // 3. Cache results
  setModelCapabilities(modelId, caps, currentDigest);
  return caps;
}

module.exports = { detectCapabilities };
