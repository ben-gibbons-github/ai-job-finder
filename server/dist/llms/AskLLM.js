import 'dotenv/config';
import { getCachedAnswer, setCachedAnswer } from './LLMCache.js';
// Read Gemini API key from environment.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_REQUEST_DELAY_MS = 1_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 1_500;
const MAX_SERVER_HINT_COOLDOWN_MS = 5 * 60_000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
let requestQueueTail = Promise.resolve();
let lastRequestStartedAt = 0;
let cooldownUntil = 0;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function enqueueGeminiRequest(task) {
    const run = requestQueueTail.then(task, task);
    requestQueueTail = run.then(() => undefined, () => undefined);
    return run;
}
function parseRetryDelayMs(retryDelay) {
    const value = retryDelay.trim().toLowerCase();
    const match = value.match(/^([0-9]+(?:\.[0-9]+)?)\s*(ms|s)$/);
    if (!match) {
        return 0;
    }
    const amount = Number(match[1]);
    if (!Number.isFinite(amount) || amount <= 0) {
        return 0;
    }
    return match[2] === 's' ? Math.round(amount * 1000) : Math.round(amount);
}
function parseRetryDelayFromGeminiError(errorText) {
    try {
        const parsed = JSON.parse(errorText);
        const details = parsed.error?.details ?? [];
        for (const detail of details) {
            if (typeof detail.retryDelay === 'string') {
                return parseRetryDelayMs(detail.retryDelay);
            }
        }
    }
    catch {
        return 0;
    }
    return 0;
}
function isRetriableNetworkError(error) {
    if (!(error instanceof Error)) {
        return false;
    }
    const text = `${error.message} ${error.cause ?? ''}`.toLowerCase();
    return (text.includes('fetch failed') ||
        text.includes('econnreset') ||
        text.includes('etimedout') ||
        text.includes('econnrefused'));
}
async function waitForRequestDelay(delayMs) {
    const elapsed = Date.now() - lastRequestStartedAt;
    if (lastRequestStartedAt > 0 && elapsed < delayMs) {
        await sleep(delayMs - elapsed);
    }
    lastRequestStartedAt = Date.now();
}
async function fetchWithTimeout(url, init, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            ...init,
            signal: controller.signal
        });
    }
    catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(`Gemini request timed out after ${timeoutMs}ms`);
        }
        throw error;
    }
    finally {
        clearTimeout(timeout);
    }
}
/**
 * Ask Gemini one or more questions with Google Search enabled.
 * Questions are asked sequentially so later questions can follow up on earlier answers.
 */
export async function askGeminiWithSearch(questions, options = {}) {
    if (questions.length === 0) {
        return [];
    }
    const apiKey = options.apiKey ?? GEMINI_API_KEY;
    console.log(`Using Gemini model "${options.model ?? 'gemini-2.5-flash'}" with search tool enabled.`);
    if (!apiKey) {
        throw new Error('Missing Gemini API key. Set GEMINI_API_KEY or pass options.apiKey.');
    }
    const model = options.model ?? 'gemini-2.5-flash';
    const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const requestDelayMs = options.requestDelayMs ?? DEFAULT_REQUEST_DELAY_MS;
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const answers = [];
    const history = [];
    for (const rawQuestion of questions) {
        const question = rawQuestion.trim();
        if (!question) {
            continue;
        }
        const cachedAnswer = await getCachedAnswer(question);
        if (cachedAnswer) {
            answers.push({ question, answer: cachedAnswer });
            history.push({ role: 'user', parts: [{ text: question }] });
            history.push({ role: 'model', parts: [{ text: cachedAnswer }] });
            continue;
        }
        history.push({ role: 'user', parts: [{ text: question }] });
        const body = {
            contents: history,
            tools: [{ google_search: {} }]
        };
        if (options.systemInstruction?.trim()) {
            body.systemInstruction = {
                parts: [{ text: options.systemInstruction.trim() }]
            };
        }
        const response = await enqueueGeminiRequest(async () => {
            let attempt = 0;
            while (true) {
                attempt += 1;
                if (cooldownUntil > Date.now()) {
                    await sleep(cooldownUntil - Date.now());
                }
                await waitForRequestDelay(requestDelayMs);
                try {
                    const res = await fetchWithTimeout(endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    }, requestTimeoutMs);
                    if (res.status === 429) {
                        const errorText = await res.text();
                        const retryAfterMs = parseRetryDelayFromGeminiError(errorText);
                        const boundedCooldown = Math.min(MAX_SERVER_HINT_COOLDOWN_MS, Math.max(retryAfterMs, retryDelayMs));
                        cooldownUntil = Math.max(cooldownUntil, Date.now() + boundedCooldown);
                        if (attempt <= maxRetries + 1) {
                            continue;
                        }
                        throw new Error(`Gemini request failed (429): ${errorText}`);
                    }
                    return res;
                }
                catch (error) {
                    if (attempt <= maxRetries + 1 && isRetriableNetworkError(error)) {
                        await sleep(retryDelayMs * attempt);
                        continue;
                    }
                    throw error;
                }
            }
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini request failed (${response.status}): ${errorText}`);
        }
        const data = (await response.json());
        const answer = data.candidates?.[0]?.content?.parts
            ?.map((part) => part.text ?? '')
            .join('\n')
            .trim() ?? '';
        if (!answer) {
            throw new Error('Gemini returned an empty response.');
        }
        if (!IS_PRODUCTION) {
            console.log(`Gemini response for question "${question}": ${answer}`);
        }
        answers.push({ question, answer });
        await setCachedAnswer(question, answer);
        history.push({ role: 'model', parts: [{ text: answer }] });
    }
    return answers;
}
