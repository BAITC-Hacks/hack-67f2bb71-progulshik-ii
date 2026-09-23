/* Compose the richer interview with the team's existing quality evaluator.
 * Keeping reviewCard unchanged preserves the concurrently added scoring work. */
import { createAiService as createCoreService } from './ai.js';
import { createAiService as createInterviewService } from './interview-ai.js';
export { AI_PROMPT } from './interview-ai.js';
export function createAiService(options = {}) {
  const core = createCoreService(options);
  const interview = createInterviewService(options);
  return { ...core, analyze: (input) => interview.analyze(input) };
}
