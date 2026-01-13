import axios from 'axios';

// Judge0 Language IDs
export const JUDGE0_LANGUAGES = {
  C: 50,
  'C++': 54,
  PYTHON: 92,
  JAVA: 91
};

// Judge0 Status IDs
export const JUDGE0_STATUS = {
  IN_QUEUE: 1,
  PROCESSING: 2,
  ACCEPTED: 3,
  WRONG_ANSWER: 4,
  TIME_LIMIT_EXCEEDED: 5,
  COMPILATION_ERROR: 6,
  RUNTIME_ERROR: 7,
  INTERNAL_ERROR: 8,
  EXEC_FORMAT_ERROR: 9,
  MEMORY_LIMIT_EXCEEDED: 10
};

/**
 * Submit code to Judge0 for execution
 * @param {string} sourceCode - The source code to execute
 * @param {number} languageId - Judge0 language ID
 * @param {string} stdin - Input for the program
 * @param {number} timeLimit - Time limit in seconds (default: 5)
 * @param {number} memoryLimit - Memory limit in KB (default: 128000)
 * @returns {Promise<Object>} Judge0 submission response
 */
export async function submitToJudge0(sourceCode, languageId, stdin = '', timeLimit = 5, memoryLimit = 128000) {
  const JUDGE0_API_URL = process.env.JUDGE0_API_URL || 'http://localhost:2358';
  const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY;

  try {
    const response = await axios.post(
      `${JUDGE0_API_URL}/submissions`,
      {
        source_code: sourceCode,
        language_id: languageId,
        stdin: stdin,
        cpu_time_limit: timeLimit,
        memory_limit: memoryLimit,
        wait: false // Don't wait for result, get token immediately
      },
      {
        headers: {
          'Content-Type': 'application/json',
          ...(JUDGE0_API_KEY && { 'X-RapidAPI-Key': JUDGE0_API_KEY })
        },
        timeout: 10000
      }
    );

    return {
      success: true,
      token: response.data.token,
      data: response.data
    };
  } catch (error) {
    console.error('Judge0 submission error:', error.message);
    if (error.response) {
      console.error('Judge0 response:', error.response.data);
    }
    return {
      success: false,
      error: error.message,
      data: error.response?.data
    };
  }
}

/**
 * Get submission result from Judge0
 * @param {string} token - Submission token from Judge0
 * @returns {Promise<Object>} Submission result
 */
export async function getJudge0Result(token) {
  const JUDGE0_API_URL = process.env.JUDGE0_API_URL || 'http://localhost:2358';
  const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY;

  try {
    const response = await axios.get(
      `${JUDGE0_API_URL}/submissions/${token}`,
      {
        headers: {
          ...(JUDGE0_API_KEY && { 'X-RapidAPI-Key': JUDGE0_API_KEY })
        },
        timeout: 10000
      }
    );

    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    console.error('Judge0 get result error:', error.message);
    return {
      success: false,
      error: error.message,
      data: error.response?.data
    };
  }
}

/**
 * Wait for submission to complete and get result
 * @param {string} token - Submission token
 * @param {number} maxWaitTime - Maximum time to wait in milliseconds (default: 30000)
 * @param {number} pollInterval - Polling interval in milliseconds (default: 1000)
 * @returns {Promise<Object>} Final submission result
 */
export async function waitForJudge0Result(token, maxWaitTime = 30000, pollInterval = 1000) {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    const result = await getJudge0Result(token);

    if (!result.success) {
      return result;
    }

    const statusId = result.data.status?.id;

    // Status 1 (In Queue) or 2 (Processing) means still running
    if (statusId === 1 || statusId === 2) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      continue;
    }

    // Any other status means completed
    return result;
  }

  // Timeout
  return {
    success: false,
    error: 'Timeout waiting for Judge0 result',
    data: { status: { id: 1, description: 'In Queue' } }
  };
}

/**
 * Execute code with test cases and return results
 * @param {string} sourceCode - Source code
 * @param {number} languageId - Language ID
 * @param {Array<string>} testCases - Array of input test cases
 * @param {Array<string>} expectedOutputs - Array of expected outputs
 * @param {number} timeLimit - Time limit per test case in seconds
 * @returns {Promise<Object>} Results for all test cases
 */
export async function executeWithTestCases(sourceCode, languageId, testCases, expectedOutputs, timeLimit = 5) {
  const results = [];
  let passedCount = 0;

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const expectedOutput = expectedOutputs[i]?.trim() || '';

    // Submit to Judge0
    const submission = await submitToJudge0(sourceCode, languageId, testCase, timeLimit);

    if (!submission.success) {
      results.push({
        testCase: i + 1,
        input: testCase,
        expected: expectedOutput,
        actual: null,
        passed: false,
        status: 'ERROR',
        error: submission.error
      });
      continue;
    }

    // Wait for result
    const result = await waitForJudge0Result(submission.token, 30000);

    if (!result.success) {
      results.push({
        testCase: i + 1,
        input: testCase,
        expected: expectedOutput,
        actual: null,
        passed: false,
        status: 'ERROR',
        error: result.error
      });
      continue;
    }

    const statusId = result.data.status?.id;
    const stdout = result.data.stdout || '';
    const stderr = result.data.stderr || '';
    const actualOutput = stdout.trim();
    const passed = actualOutput === expectedOutput && statusId === 3; // 3 = ACCEPTED

    if (passed) passedCount++;

    results.push({
      testCase: i + 1,
      input: testCase,
      expected: expectedOutput,
      actual: actualOutput,
      passed: passed,
      status: getStatusDescription(statusId),
      error: stderr || (statusId !== 3 ? result.data.status?.description : null),
      executionTime: result.data.time,
      memoryUsed: result.data.memory,
      token: submission.token
    });
  }

  return {
    results,
    passedCount,
    totalCount: testCases.length,
    score: (passedCount / testCases.length) * 100
  };
}

/**
 * Get human-readable status description
 */
function getStatusDescription(statusId) {
  const statusMap = {
    1: 'IN_QUEUE',
    2: 'PROCESSING',
    3: 'ACCEPTED',
    4: 'WRONG_ANSWER',
    5: 'TIME_LIMIT_EXCEEDED',
    6: 'COMPILATION_ERROR',
    7: 'RUNTIME_ERROR',
    8: 'INTERNAL_ERROR',
    9: 'EXEC_FORMAT_ERROR',
    10: 'MEMORY_LIMIT_EXCEEDED'
  };
  return statusMap[statusId] || 'UNKNOWN';
}





