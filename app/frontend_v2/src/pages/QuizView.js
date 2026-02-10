import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  CheckCircle2, XCircle, ChevronLeft, Trophy, Target,
  RotateCcw, ArrowRight, Lightbulb
} from 'lucide-react';
import { apiService } from '../utils/api';
import CodeBlock from '../components/common/CodeBlock';

const QuizView = () => {
  const { chapterNum, topicIdx } = useParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [answers, setAnswers] = useState({});
  const [quizComplete, setQuizComplete] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadQuiz();
  }, [chapterNum, topicIdx]);

  const loadQuiz = async () => {
    try {
      const response = await apiService.getQuiz(chapterNum, topicIdx, { count: 10 });
      setQuiz(response.data);
    } catch (error) {
      console.error('Failed to load quiz:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerSelect = async (answer) => {
    if (showFeedback) return;

    setSelectedAnswer(answer);
    setShowFeedback(true);

    const question = quiz.questions[currentQuestionIdx];

    try {
      const response = await apiService.checkAnswer(
        chapterNum,
        topicIdx,
        question.id,
        answer
      );

      setAnswers(prev => ({
        ...prev,
        [currentQuestionIdx]: {
          selected: answer,
          correct: response.data.is_correct,
          correctAnswer: response.data.correct_answer,
          explanation: response.data.explanation
        }
      }));
    } catch (error) {
      console.error('Failed to check answer:', error);
    }
  };

  const handleNext = () => {
    if (currentQuestionIdx < quiz.questions.length - 1) {
      setCurrentQuestionIdx(currentQuestionIdx + 1);
      setSelectedAnswer(null);
      setShowFeedback(false);
    } else {
      setQuizComplete(true);
    }
  };

  const handleRetry = () => {
    setCurrentQuestionIdx(0);
    setSelectedAnswer(null);
    setShowFeedback(false);
    setAnswers({});
    setQuizComplete(false);
    loadQuiz();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="skeleton w-full max-w-4xl h-96"></div>
      </div>
    );
  }

  if (!quiz || !quiz.questions || quiz.questions.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">No quiz available</p>
        <Link to={`/topic/${chapterNum}/${topicIdx}`} className="btn btn-primary">
          Back to Topic
        </Link>
      </div>
    );
  }

  if (quizComplete) {
    const correctCount = Object.values(answers).filter(a => a.correct).length;
    const totalQuestions = quiz.questions.length;
    const score = (correctCount / totalQuestions) * 100;

    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">
        {/* Results Header */}
        <div className="card text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
            <Trophy className="w-10 h-10 text-white" />
          </div>

          <h1 className="text-3xl font-bold mb-2 text-neutral-900 dark:text-neutral-50">
            Quiz Complete!
          </h1>

          <div className="text-6xl font-bold mb-4">
            <span className={score >= 70 ? 'text-gradient-success' : 'text-gradient-primary'}>
              {score.toFixed(0)}%
            </span>
          </div>

          <p className="text-xl text-neutral-600 dark:text-neutral-400 mb-6">
            {correctCount} out of {totalQuestions} correct
          </p>

          {score >= 90 && (
            <div className="inline-flex items-center space-x-2 px-4 py-2 bg-success-100 dark:bg-success-900/30 text-success-800 dark:text-success-300 rounded-lg mb-6">
              <Trophy className="w-5 h-5" />
              <span className="font-semibold">Excellent! You've mastered this topic!</span>
            </div>
          )}

          {score >= 70 && score < 90 && (
            <div className="inline-flex items-center space-x-2 px-4 py-2 bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-300 rounded-lg mb-6">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-semibold">Great job! You're making progress!</span>
            </div>
          )}

          {score < 70 && (
            <div className="inline-flex items-center space-x-2 px-4 py-2 bg-warning-100 dark:bg-warning-900/30 text-warning-800 dark:text-warning-300 rounded-lg mb-6">
              <Target className="w-5 h-5" />
              <span className="font-semibold">Keep practicing to improve!</span>
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-4 mt-6">
            <button onClick={handleRetry} className="btn btn-primary flex items-center space-x-2">
              <RotateCcw className="w-5 h-5" />
              <span>Retry Quiz</span>
            </button>
            <Link to={`/topic/${chapterNum}/${topicIdx}`} className="btn btn-secondary">
              Review Topic
            </Link>
            <Link to={`/chapter/${chapterNum}`} className="btn btn-outline">
              Back to Chapter
            </Link>
          </div>
        </div>

        {/* Question Review */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
            Review Answers
          </h2>

          {quiz.questions.map((question, idx) => {
            const answer = answers[idx];
            if (!answer) return null;

            return (
              <div key={idx} className={`card ${answer.correct ? 'border-l-4 border-success-500' : 'border-l-4 border-danger-500'}`}>
                <div className="flex items-start space-x-3 mb-4">
                  {answer.correct ? (
                    <CheckCircle2 className="w-6 h-6 text-success-600 flex-shrink-0 mt-1" />
                  ) : (
                    <XCircle className="w-6 h-6 text-danger-600 flex-shrink-0 mt-1" />
                  )}
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-2">
                      Question {idx + 1}
                    </h3>
                    <p className="text-neutral-700 dark:text-neutral-300 mb-3">
                      {question.question}
                    </p>

                    {question.code && (
                      <CodeBlock code={question.code} language="cpp" />
                    )}

                    <div className="space-y-2 mt-4">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                          Your answer:
                        </span>
                        <span className={`text-sm font-semibold ${answer.correct ? 'text-success-600' : 'text-danger-600'}`}>
                          {answer.selected}
                        </span>
                      </div>

                      {!answer.correct && (
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                            Correct answer:
                          </span>
                          <span className="text-sm font-semibold text-success-600">
                            {answer.correctAnswer}
                          </span>
                        </div>
                      )}
                    </div>

                    {answer.explanation && (
                      <div className="mt-4 p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg">
                        <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-2 flex items-center space-x-2">
                          <Lightbulb className="w-4 h-4 text-primary-600" />
                          <span>Explanation</span>
                        </h4>
                        <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
                          {answer.explanation}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const question = quiz.questions[currentQuestionIdx];
  const progress = ((currentQuestionIdx + 1) / quiz.questions.length) * 100;
  const currentAnswer = answers[currentQuestionIdx];

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="card">
        <Link
          to={`/topic/${chapterNum}/${topicIdx}`}
          className="inline-flex items-center space-x-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to Topic</span>
        </Link>

        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
            Quiz: {quiz.topic_title}
          </h1>
          <span className="badge badge-primary text-lg px-4 py-2">
            {currentQuestionIdx + 1} / {quiz.questions.length}
          </span>
        </div>

        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Question */}
      <div className="card">
        <div className="mb-6">
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50 flex-1">
              {question.question}
            </h2>
            {question.difficulty && (
              <span className={`badge ${
                question.difficulty === 'beginner' ? 'badge-success' :
                question.difficulty === 'intermediate' ? 'badge-primary' :
                question.difficulty === 'advanced' ? 'badge-warning' :
                'badge-danger'
              }`}>
                {question.difficulty}
              </span>
            )}
          </div>

          {question.code && (
            <CodeBlock code={question.code} language="cpp" />
          )}
        </div>

        {/* Options */}
        <div className="space-y-3">
          {question.options?.map((option, idx) => {
            const isSelected = selectedAnswer === option;
            const isCorrect = currentAnswer?.correctAnswer === option;
            const showCorrect = showFeedback && isCorrect;
            const showWrong = showFeedback && isSelected && !currentAnswer?.correct;

            return (
              <button
                key={idx}
                onClick={() => handleAnswerSelect(option)}
                disabled={showFeedback}
                className={`
                  w-full p-4 rounded-lg border-2 text-left transition-all
                  ${showCorrect
                    ? 'border-success-500 bg-success-50 dark:bg-success-900/20 success-animation'
                    : showWrong
                    ? 'border-danger-500 bg-danger-50 dark:bg-danger-900/20 error-animation'
                    : isSelected
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-neutral-300 dark:border-neutral-600 hover:border-primary-400 dark:hover:border-primary-500 hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                  }
                  ${showFeedback ? 'cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                <div className="flex items-center justify-between">
                  <span className={`font-medium ${
                    showCorrect ? 'text-success-900 dark:text-success-100' :
                    showWrong ? 'text-danger-900 dark:text-danger-100' :
                    'text-neutral-900 dark:text-neutral-100'
                  }`}>
                    {option}
                  </span>
                  {showCorrect && <CheckCircle2 className="w-6 h-6 text-success-600" />}
                  {showWrong && <XCircle className="w-6 h-6 text-danger-600" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Feedback */}
        {showFeedback && currentAnswer && (
          <div className={`mt-6 p-4 rounded-lg ${
            currentAnswer.correct
              ? 'bg-success-50 dark:bg-success-900/20 border-l-4 border-success-500'
              : 'bg-danger-50 dark:bg-danger-900/20 border-l-4 border-danger-500'
          }`}>
            <div className="flex items-start space-x-3">
              {currentAnswer.correct ? (
                <CheckCircle2 className="w-6 h-6 text-success-600 flex-shrink-0 mt-1" />
              ) : (
                <XCircle className="w-6 h-6 text-danger-600 flex-shrink-0 mt-1" />
              )}
              <div className="flex-1">
                <h3 className={`font-semibold mb-2 ${
                  currentAnswer.correct ? 'text-success-900 dark:text-success-100' : 'text-danger-900 dark:text-danger-100'
                }`}>
                  {currentAnswer.correct ? 'Correct!' : 'Incorrect'}
                </h3>
                {currentAnswer.explanation && (
                  <p className={`text-sm leading-relaxed ${
                    currentAnswer.correct ? 'text-success-800 dark:text-success-200' : 'text-danger-800 dark:text-danger-200'
                  }`}>
                    {currentAnswer.explanation}
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={handleNext}
              className="btn btn-primary mt-4 w-full sm:w-auto flex items-center justify-center space-x-2"
            >
              <span>{currentQuestionIdx < quiz.questions.length - 1 ? 'Next Question' : 'See Results'}</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuizView;
