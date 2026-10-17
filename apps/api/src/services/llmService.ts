import { matchExplanationSchema, MatchExplanationData } from '@hirematch/shared';

export interface JobContext {
  title: string;
  company: string;
  description: string;
  skills: string[];
  requirements: string[];
}

/**
 * AI Match Explanation Service
 *
 * Non-obvious / Interview Talking Point:
 * Structured LLM Output with Single Retry on Invalid JSON:
 * - Real-world LLMs occasionally hallucinate markdown blocks, omit brackets, or return trailing commas.
 * - Rather than crashing the request or creating infinite loops, we enforce:
 *   1. System prompt with explicit JSON schema instructions.
 *   2. Zod validation (`matchExplanationSchema.safeParse`).
 *   3. Exactly ONE retry with corrective prompt feedback if parsing or validation fails.
 * - This provides deterministic reliability while bounding latency and OpenAI API token spend.
 */
export async function explainJobMatch(
  resumeText: string,
  job: JobContext,
  apiKey?: string
): Promise<MatchExplanationData> {
  const openAiKey = apiKey || process.env.OPENAI_API_KEY;
  const modelName = process.env.LLM_MODEL_NAME || 'gpt-4o-mini';

  // If live OpenAI key is configured, call OpenAI Chat Completions API
  if (openAiKey && openAiKey !== 'your-openai-api-key') {
    return await callLlmWithSingleRetry(resumeText, job, modelName, openAiKey);
  }

  // Fallback: Deterministic offline explanation engine for local dev and automated tests
  return generateOfflineMatchExplanation(resumeText, job);
}

/**
 * Calls OpenAI with a single retry on invalid JSON or schema validation failure
 */
async function callLlmWithSingleRetry(
  resumeText: string,
  job: JobContext,
  modelName: string,
  apiKey: string
): Promise<MatchExplanationData> {
  const prompt = buildExplanationPrompt(resumeText, job);

  // Attempt 1: Standard structured prompt
  try {
    const rawResponse = await requestChatCompletion(prompt, modelName, apiKey);
    const parsed = parseAndValidateJson(rawResponse);
    if (parsed) return parsed;
  } catch (err: any) {
    console.warn(`[LLM Warning] Attempt 1 failed (${err.message}). Retrying once with corrective prompt...`);
  }

  // Attempt 2: Strict JSON remediation retry
  const correctivePrompt = `${prompt}\n\nCRITICAL ERROR: Your previous response was NOT valid JSON matching the schema. Respond ONLY with a valid RFC-8259 JSON object without markdown formatting, backticks, or preamble:
{"matchReasons": ["reason 1", "reason 2", "reason 3"], "missingSkills": ["skill 1", "skill 2"]}`;

  try {
    const rawRetryResponse = await requestChatCompletion(correctivePrompt, modelName, apiKey);
    const parsedRetry = parseAndValidateJson(rawRetryResponse);
    if (parsedRetry) return parsedRetry;
  } catch (retryErr: any) {
    console.error(`[LLM Retry Failed] Attempt 2 failed: ${retryErr.message}. Falling back to rule-based explanation.`);
  }

  // If both attempts fail, return fallback explanation
  return generateOfflineMatchExplanation(resumeText, job);
}

function buildExplanationPrompt(resumeText: string, job: JobContext): string {
  return `You are an expert technical recruiter analyzing the match between a candidate resume and a job description.

JOB POSTING:
Title: ${job.title}
Company: ${job.company}
Required Skills: ${job.skills.join(', ')}
Key Requirements: ${job.requirements.join(' | ')}
Description: ${job.description.slice(0, 800)}

CANDIDATE RESUME:
${resumeText.slice(0, 2000)}

Analyze why this job fits the candidate and identify any missing skills or requirements.
You MUST output ONLY a valid JSON object matching this schema:
{
  "matchReasons": [
    "Specific strength 1 highlighting relevant experience or matching tech",
    "Specific strength 2 highlighting demonstrated project work",
    "Specific strength 3 highlighting architectural or foundational alignment"
  ],
  "missingSkills": [
    "Identified skill or experience requirement from the job that is absent from the resume"
  ]
}

Constraints:
1. Provide 2 to 4 concise matchReasons.
2. Provide 0 to 4 genuine missingSkills.
3. Output raw JSON only. Do not enclose in backticks or markdown fences.`;
}

async function requestChatCompletion(prompt: string, model: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are an AI career matching engine. Always output valid RFC-8259 JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as any;
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Validates raw string output against the shared Zod matchExplanationSchema
 */
export function parseAndValidateJson(rawContent: string): MatchExplanationData | null {
  try {
    // Strip possible markdown fences ```json ... ```
    const cleaned = rawContent
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/, '')
      .replace(/\s*```$/, '')
      .trim();

    const parsedObject = JSON.parse(cleaned);
    const result = matchExplanationSchema.safeParse(parsedObject);

    if (result.success) {
      return result.data;
    } else {
      console.warn('[Zod Validation Warning] Invalid match explanation schema:', result.error.format());
      return null;
    }
  } catch {
    return null;
  }
}

/**
 * Deterministic offline match explanation engine
 * Computes exact skill overlaps and gaps using set intersection.
 */
export function generateOfflineMatchExplanation(resumeText: string, job: JobContext): MatchExplanationData {
  const resumeLower = resumeText.toLowerCase();

  const matchingSkills: string[] = [];
  const missingSkills: string[] = [];

  for (const skill of job.skills) {
    if (resumeLower.includes(skill.toLowerCase())) {
      matchingSkills.push(skill);
    } else {
      missingSkills.push(skill);
    }
  }

  const matchReasons: string[] = [];

  if (matchingSkills.length > 0) {
    matchReasons.push(
      `Strong technical overlap in core stack: demonstrated familiarity with ${matchingSkills.slice(0, 3).join(', ')}.`
    );
  } else {
    matchReasons.push(
      `Candidate background exhibits foundational software engineering principles applicable to ${job.title}.`
    );
  }

  matchReasons.push(
    `Experience level aligns well with ${job.company}'s requirements for ${job.title}.`
  );

  if (job.description.toLowerCase().includes('scalable') || resumeLower.includes('system')) {
    matchReasons.push('Strong architectural alignment for distributed systems and clean API design.');
  }

  return {
    matchReasons: matchReasons.slice(0, 4),
    missingSkills: missingSkills.slice(0, 3),
  };
}
