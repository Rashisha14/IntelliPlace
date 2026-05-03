import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2, X, CheckCircle, Sparkles, Loader2 } from 'lucide-react';
import Swal from 'sweetalert2';
import { API_BASE_URL } from '../config.js';

const JUDGE0_LANGUAGES = {
  C: 50,
  'C++': 54,
  PYTHON: 92,
  JAVA: 91
};

const LANGUAGE_OPTIONS = [
  { id: JUDGE0_LANGUAGES.C, name: 'C' },
  { id: JUDGE0_LANGUAGES['C++'], name: 'C++' },
  { id: JUDGE0_LANGUAGES.PYTHON, name: 'Python' },
  { id: JUDGE0_LANGUAGES.JAVA, name: 'Java' }
];

const DIFFICULTY_OPTIONS = ['EASY', 'MEDIUM', 'HARD'];

const CompanyCreateCodingTest = ({ isOpen, onClose, jobId, onCreated, editingTest = null }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [allowedLanguages, setAllowedLanguages] = useState([JUDGE0_LANGUAGES.PYTHON, JUDGE0_LANGUAGES.JAVA]);
  const [timeLimit, setTimeLimit] = useState(60);
  const [cutoff, setCutoff] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (editingTest) {
        // Load existing test data for editing
        setFetching(true);
        fetch(`${API_BASE_URL}/jobs/${jobId}/coding-test`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        })
          .then(res => res.json())
          .then(json => {
            if (json.success && json.data) {
              const test = json.data;
              setTitle(test.title || '');
              setDescription(test.description || '');
              setAllowedLanguages(Array.isArray(test.allowedLanguages) ? test.allowedLanguages : [JUDGE0_LANGUAGES.PYTHON]);
              setTimeLimit(test.timeLimit || 60);
              setCutoff(test.cutoff || null);
              
              // Load questions
              if (test.questions && Array.isArray(test.questions)) {
                setQuestions(test.questions.map(q => {
                  let sampleCases = [];
                  if (q.sampleCases && Array.isArray(q.sampleCases)) {
                    sampleCases = q.sampleCases;
                  } else if (q.sampleInput || q.sampleOutput) {
                    sampleCases = [{ input: q.sampleInput || '', output: q.sampleOutput || '' }];
                  } else {
                    sampleCases = [{ input: '', output: '' }];
                  }
                  return {
                    id: q.id,
                    title: q.title || '',
                    description: q.description || '',
                    difficulty: q.difficulty || 'MEDIUM',
                    points: q.points || 10,
                    testCases: Array.isArray(q.testCases) ? q.testCases : (q.testCases ? JSON.parse(q.testCases) : ['']),
                    expectedOutputs: Array.isArray(q.expectedOutputs) ? q.expectedOutputs : (q.expectedOutputs ? JSON.parse(q.expectedOutputs) : ['']),
                    sampleCases,
                    constraints: q.constraints || ''
                  };
                }));
              } else {
                setQuestions([]);
              }
            }
          })
          .catch(err => {
            console.error('Failed to load coding test:', err);
            Swal.fire('Error', 'Failed to load coding test data', 'error');
          })
          .finally(() => setFetching(false));
      } else {
        // Reset for new test
        setTitle('');
        setDescription('');
        setAllowedLanguages([JUDGE0_LANGUAGES.PYTHON, JUDGE0_LANGUAGES.JAVA]);
        setTimeLimit(60);
        setCutoff(null);
        setQuestions([]);
      }
    }
  }, [isOpen, jobId, editingTest]);

  if (!isOpen) return null;

  const addQuestion = () => {
    setQuestions([
      ...questions,
      {
        title: '',
        description: '',
        difficulty: 'MEDIUM',
        points: 10,
        testCases: [''],
        expectedOutputs: [''],
        sampleCases: [{ input: '', output: '' }],
        constraints: ''
      }
    ]);
  };

  const handleGenerateQuestion = async () => {
    const { value: topic } = await Swal.fire({
      title: 'Generate Coding Question',
      input: 'text',
      inputLabel: 'Topic & Difficulty (e.g., Arrays, Medium)',
      inputPlaceholder: 'Enter topic, concepts, or difficulty...',
      showCancelButton: true,
      confirmButtonText: 'Generate',
      confirmButtonColor: '#9333ea',
      inputValidator: (value) => {
        if (!value) {
          return 'Please provide a topic or prompt!'
        }
      }
    });

    if (topic) {
      try {
        setGenerating(true);
        const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/generate-coding-question`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`
          },
          body: JSON.stringify({ topic })
        });

        const data = await res.json();
        if (data.success && data.question) {
          setQuestions([...questions, data.question]);
          Swal.fire({
            icon: "success",
            title: "Question Generated",
            text: "AI has successfully generated a coding question.",
            toast: true,
            position: "top-end",
            showConfirmButton: false,
            timer: 3000
          });
        } else {
          throw new Error(data.message || "Failed to generate question");
        }
      } catch (error) {
        console.error("AI Generation Error:", error);
        Swal.fire("Generation Failed", "Could not generate coding question using AI. Please try again.", "error");
      } finally {
        setGenerating(false);
      }
    }
  };

  const removeQuestion = (index) => {
    Swal.fire({
      title: 'Remove Question?',
      text: 'This question will be deleted',
      icon: 'warning',
      showCancelButton: true,
      confirmColor: '#dc2626'
    }).then((result) => {
      if (result.isConfirmed) {
        setQuestions(questions.filter((_, i) => i !== index));
      }
    });
  };

  const updateQuestion = (index, field, value) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], [field]: value };
    setQuestions(updated);
  };

  const addTestCase = (questionIndex) => {
    const updated = [...questions];
    updated[questionIndex].testCases.push('');
    updated[questionIndex].expectedOutputs.push('');
    setQuestions(updated);
  };

  const addSampleCase = (questionIndex) => {
    const updated = [...questions];
    if (!updated[questionIndex].sampleCases) updated[questionIndex].sampleCases = [{ input: '', output: '' }];
    else updated[questionIndex].sampleCases.push({ input: '', output: '' });
    setQuestions(updated);
  };

  const removeSampleCase = (questionIndex, sampleIndex) => {
    const updated = [...questions];
    updated[questionIndex].sampleCases.splice(sampleIndex, 1);
    if (updated[questionIndex].sampleCases.length === 0) {
      updated[questionIndex].sampleCases = [{ input: '', output: '' }];
    }
    setQuestions(updated);
  };

  const updateSampleCase = (questionIndex, sampleIndex, field, value) => {
    const updated = [...questions];
    updated[questionIndex].sampleCases[sampleIndex][field] = value;
    setQuestions(updated);
  };

  const removeTestCase = (questionIndex, testCaseIndex) => {
    const updated = [...questions];
    updated[questionIndex].testCases.splice(testCaseIndex, 1);
    updated[questionIndex].expectedOutputs.splice(testCaseIndex, 1);
    setQuestions(updated);
  };

  const updateTestCase = (questionIndex, testCaseIndex, field, value) => {
    const updated = [...questions];
    if (field === 'input') {
      updated[questionIndex].testCases[testCaseIndex] = value;
    } else {
      updated[questionIndex].expectedOutputs[testCaseIndex] = value;
    }
    setQuestions(updated);
  };

  const handleSubmit = async () => {
    if (!title || questions.length === 0) {
      Swal.fire('Error', 'Title and at least one question are required', 'error');
      return;
    }

    // Validate questions
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.title || !q.description) {
        Swal.fire('Error', `Question ${i + 1}: Title and description are required`, 'error');
        return;
      }
      if (q.testCases.length === 0 || q.expectedOutputs.length === 0) {
        Swal.fire('Error', `Question ${i + 1}: At least one test case is required`, 'error');
        return;
      }
      if (q.testCases.some(tc => !tc.trim()) || q.expectedOutputs.some(eo => !eo.trim())) {
        Swal.fire('Error', `Question ${i + 1}: All test cases and expected outputs must be filled`, 'error');
        return;
      }
    }

    try {
      setLoading(true);

      const isEdit = !!editingTest;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/coding-test`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          title,
          description: description || null,
          allowedLanguages,
          timeLimit,
          cutoff: cutoff || null,
          questions: questions.map(q => ({
            title: q.title,
            description: q.description,
            difficulty: q.difficulty,
            points: q.points,
            testCases: q.testCases,
            expectedOutputs: q.expectedOutputs,
            sampleCases: (q.sampleCases || []).filter(sc => sc?.input?.trim() || sc?.output?.trim()).length > 0
              ? (q.sampleCases || []).map(sc => ({ input: sc.input || '', output: sc.output || '' }))
              : null,
            sampleInput: (q.sampleCases?.[0]?.input) || null,
            sampleOutput: (q.sampleCases?.[0]?.output) || null,
            constraints: q.constraints || null
          }))
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || (isEdit ? 'Failed to update coding test' : 'Failed to create coding test'));
      }

      Swal.fire({
        icon: 'success',
        title: isEdit ? 'Coding Test Updated Successfully' : 'Coding Test Created Successfully',
        confirmButtonColor: '#2563eb'
      }).then(() => {
        onCreated?.();
        onClose();
      });
    } catch (error) {
      Swal.fire('Error', error.message || (editingTest ? 'Failed to update coding test' : 'Failed to create coding test'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleLanguage = (languageId) => {
    if (allowedLanguages.includes(languageId)) {
      if (allowedLanguages.length > 1) {
        setAllowedLanguages(allowedLanguages.filter(id => id !== languageId));
      }
    } else {
      setAllowedLanguages([...allowedLanguages, languageId]);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between p-6 border-b flex-shrink-0">
          <h2 className="text-2xl font-semibold text-gray-800">
            {editingTest ? 'Edit Coding Test' : 'Create Coding Test'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        
        {fetching && (
          <div className="p-6 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading coding test data...</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {/* Basic Info */}
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Test Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Software Engineer Coding Test"
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Test description and instructions..."
                rows="3"
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Allowed Languages <span className="text-red-500">*</span>
                </label>
                <div className="space-y-2">
                  {LANGUAGE_OPTIONS.map((lang) => (
                    <label key={lang.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowedLanguages.includes(lang.id)}
                        onChange={() => toggleLanguage(lang.id)}
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500 rounded"
                      />
                      <span className="text-sm text-gray-700">{lang.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Time Limit (minutes) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(parseInt(e.target.value) || 60)}
                  min="1"
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cutoff Score (%)
                </label>
                <input
                  type="number"
                  value={cutoff || ''}
                  onChange={(e) => setCutoff(e.target.value ? parseFloat(e.target.value) : null)}
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="Optional"
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Questions */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">Questions</h3>
              <div className="flex gap-2">
                <button
                  onClick={handleGenerateQuestion}
                  disabled={generating}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  AI Generate
                </button>
                <button
                  onClick={addQuestion}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Question
                </button>
              </div>
            </div>

            {questions.map((question, qIndex) => (
              <div key={qIndex} className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-gray-800">Question {qIndex + 1}</h4>
                  <button
                    onClick={() => removeQuestion(qIndex)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={question.title}
                      onChange={(e) => updateQuestion(qIndex, 'title', e.target.value)}
                      placeholder="Question title"
                      className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Difficulty
                      </label>
                      <select
                        value={question.difficulty}
                        onChange={(e) => updateQuestion(qIndex, 'difficulty', e.target.value)}
                        className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        {DIFFICULTY_OPTIONS.map((diff) => (
                          <option key={diff} value={diff}>{diff}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Points
                      </label>
                      <input
                        type="number"
                        value={question.points}
                        onChange={(e) => updateQuestion(qIndex, 'points', parseInt(e.target.value) || 10)}
                        min="1"
                        className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Problem Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={question.description}
                    onChange={(e) => updateQuestion(qIndex, 'description', e.target.value)}
                    placeholder="Describe the problem..."
                    rows="4"
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                </div>

                {/* Sample Cases - visible to students for Run Sample */}
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Sample Cases <span className="text-gray-500 font-normal">(students can run these)</span>
                    </label>
                    <button
                      onClick={() => addSampleCase(qIndex)}
                      className="flex items-center gap-1 px-2 py-1 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 rounded"
                    >
                      <Plus className="w-3 h-3" />
                      Add Sample Case
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(question.sampleCases || [{ input: '', output: '' }]).map((sc, scIndex) => (
                      <div key={scIndex} className="grid grid-cols-2 gap-2 p-2 bg-gray-50 rounded-lg">
                        <div>
                          <input
                            type="text"
                            value={sc.input}
                            onChange={(e) => updateSampleCase(qIndex, scIndex, 'input', e.target.value)}
                            placeholder="Sample input"
                            className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                          />
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={sc.output}
                            onChange={(e) => updateSampleCase(qIndex, scIndex, 'output', e.target.value)}
                            placeholder="Expected output"
                            className="flex-1 p-2 border rounded focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                          />
                          {(question.sampleCases?.length || 1) > 1 && (
                            <button
                              onClick={() => removeSampleCase(qIndex, scIndex)}
                              className="px-2 text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Constraints
                  </label>
                  <textarea
                    value={question.constraints}
                    onChange={(e) => updateQuestion(qIndex, 'constraints', e.target.value)}
                    placeholder="e.g. 1 <= n <= 1000"
                    rows="2"
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                </div>

                {/* Test Cases */}
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Test Cases <span className="text-red-500">*</span>
                    </label>
                    <button
                      onClick={() => addTestCase(qIndex)}
                      className="flex items-center gap-1 px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
                    >
                      <Plus className="w-3 h-3" />
                      Add Test Case
                    </button>
                  </div>
                  <div className="space-y-2">
                    {question.testCases.map((testCase, tcIndex) => (
                      <div key={tcIndex} className="grid grid-cols-2 gap-2">
                        <div>
                          <input
                            type="text"
                            value={testCase}
                            onChange={(e) => updateTestCase(qIndex, tcIndex, 'input', e.target.value)}
                            placeholder="Input"
                            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                          />
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={question.expectedOutputs[tcIndex]}
                            onChange={(e) => updateTestCase(qIndex, tcIndex, 'output', e.target.value)}
                            placeholder="Expected Output"
                            className="flex-1 p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                          />
                          {question.testCases.length > 1 && (
                            <button
                              onClick={() => removeTestCase(qIndex, tcIndex)}
                              className="px-2 text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            {questions.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <p>No questions added yet. Click "Add Question" to get started.</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end items-center gap-3 p-6 border-t flex-shrink-0 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || questions.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (editingTest ? 'Updating...' : 'Creating...') : (editingTest ? 'Update Test' : 'Create Test')}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default CompanyCreateCodingTest;


