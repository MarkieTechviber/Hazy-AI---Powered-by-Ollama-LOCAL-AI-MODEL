// Consolidated system prompts for Hazy AI

const fs = require('fs');
const path = require('path');

function getPrompts() {
  const rootDir = path.resolve(__dirname, '../../../');
  const settingsPath = path.join(rootDir, 'cache', 'hazy-control', 'settings.json');
  let activeProfilePath = 'backend/ai/system_prompt/profiles/default.md'; // Fallback
  
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (settings.active_system_prompt) {
        activeProfilePath = settings.active_system_prompt;
      }
    } catch (err) {
      console.error('[Hazy] Failed to parse settings.json, using default profile.', err);
    }
  }

  const fullProfilePath = path.join(rootDir, activeProfilePath);
  let mdContent = '';
  try {
    mdContent = fs.readFileSync(fullProfilePath, 'utf8');
  } catch (err) {
    console.error(`[Hazy] Failed to read active profile at ${fullProfilePath}.`);
    // Fallback logic if needed, but for now we'll just return empty strings or partials if it fails.
  }

  const prompts = {
    DEFAULT_SYSTEM_PROMPT: extractSection(mdContent, 'DEFAULT_SYSTEM_PROMPT'),
    WEBSITE_SYSTEM_PROMPT: extractSection(mdContent, 'WEBSITE_SYSTEM_PROMPT'),
    CODE_SYSTEM_PROMPT: extractSection(mdContent, 'CODE_SYSTEM_PROMPT'),
    REVIEWER_SYSTEM_PROMPT_TEMPLATE: extractSection(mdContent, 'REVIEWER_SYSTEM_PROMPT_TEMPLATE')
  };

  return prompts;
}

function extractSection(markdown, sectionName) {
  // Match `# SECTION_NAME` and capture everything until the next `# ` or end of string.
  const regex = new RegExp(`^#\\s*${sectionName}\\s*\\n([\\s\\S]*?)(?=^# |$)`, 'im');
  const match = markdown.match(regex);
  return match ? match[1].trim() : '';
}

const SMART_CODE_PREAMBLE = `You are Hazy — a senior software engineer with deep expertise across all major programming languages and paradigms.\n\n`;

function buildFixPrompt(response, critique) {
  return `You wrote this code:
${response}

Your Senior Reviewer gave this feedback:
${critique}

Rewrite the code fixing ALL the reviewer's points.
Output the final complete code with the fixes applied.
Maintain the same format (code fences, file delimiters, etc.).`;
}

function buildTitlePrompt(userMsg, aiReply, userName) {
  const displayUserName = userName && userName.toLowerCase() !== 'you' ? userName : 'Not specified';
  return `In 4 words or less, give this conversation a short descriptive title. No quotes, no punctuation, just the title words.

User Name: ${displayUserName}
AI Name: Hazy


User said: "${userMsg.slice(0, 200)}"
AI replied: "${aiReply.slice(0, 200)}"

Title:`;
}

module.exports = {
  getPrompts,
  SMART_CODE_PREAMBLE,
  buildFixPrompt,
  buildTitlePrompt,
};

