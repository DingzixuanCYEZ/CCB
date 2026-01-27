
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Deck, Phrase } from '../types';
import { Button } from './Button';
import { ArrowLeft, CheckCircle2, XCircle, Trophy, Clock, StickyNote, Shuffle, ArrowRight, Eye } from 'lucide-react';
import { getDynamicColor, calculateMasteryValue, estimateMastery } from '../App';

interface ExamSessionProps {
  deck: Deck;
  questionCount: number;
  candidatePhraseIds?: string[];
  timeLimit?: number; // New prop for time limit
  onUpdateDeck: (updatedDeck: Deck) => void;
  onExit: () => void;
  onReview: (phraseId: string, isCorrect: boolean, qualityMetric?: { value: number, weight: number }) => void; 
  onTimeUpdate: (seconds: number) => void;
  onSessionComplete?: (durationSeconds: number, correctCount: number, wrongCount: number, trend?: any, results?: any[]) => void;
}

type ExamStep = 'QUESTION' | 'GRADING' | 'VIEW_ANSWER' | 'RESULT';

export const ExamSession: React.FC<ExamSessionProps> = ({ 
  deck, 
  questionCount,
  candidatePhraseIds,
  timeLimit = 0,
  onUpdateDeck, 
  onExit, 
  onReview, 
  onTimeUpdate,
  onSessionComplete
}) => {
  const [questions, setQuestions] = useState<Phrase[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [step, setStep] = useState<ExamStep>('QUESTION');
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [results, setResults] = useState<{phrase: Phrase, correct: boolean}[]>([]);
  const [masteryTrend, setMasteryTrend] = useState<{ t: number; v: number }[]>([{ t: 0, v: calculateMasteryValue(deck.phrases) }]);
  const [interleaveRatio, setInterleaveRatio] = useState(1);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isAntiTouchActive, setIsAntiTouchActive] = useState(false);
  
  const isInitialized = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isInitialized.current) return;
    
    let pool = deck.phrases;
    if (candidatePhraseIds && candidatePhraseIds.length > 0) {
        pool = deck.phrases.filter(p => candidatePhraseIds.includes(p.id));
    }
    
    if (pool.length === 0) pool = deck.phrases;

    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, Math.min(questionCount, pool.length));
    setQuestions(selected);
    isInitialized.current = true;
  }, [deck.phrases, questionCount, candidatePhraseIds]);

  // Session Duration Timer
  useEffect(() => {
    if (isFinished) return;
    const timer = setInterval(() => {
      onTimeUpdate(1);
      setSessionDuration(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [onTimeUpdate, isFinished]);

  // Question Timer
  useEffect(() => {
      if (step === 'QUESTION' && timeLimit > 0 && !isFinished) {
          setTimeLeft(timeLimit);
          timerRef.current = window.setInterval(() => {
              setTimeLeft(prev => {
                  if (prev <= 0.1) {
                      if (timerRef.current) clearInterval(timerRef.current);
                      handleTimeout();
                      return 0;
                  }
                  return prev - 0.1;
              });
          }, 100);
      } else {
          if (timerRef.current) clearInterval(timerRef.current);
      }
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [step, timeLimit, isFinished]);

  const handleTimeout = () => {
      // Timeout behaves like "Forgot" (2)
      handleVerdict(false); 
      // Important: Since verdict(false) moves us to next step, enable anti-touch here
      setIsAntiTouchActive(true);
      setTimeout(() => setIsAntiTouchActive(false), 1000);
  };

  const handleFirstStage = (remembered: boolean) => {
      if (remembered) {
          setStep('GRADING'); // Show answer, ask for verdict
      } else {
          // Forgot -> Directly wrong, show answer
          handleVerdict(false);
      }
  };

  const handleVerdict = useCallback((correct: boolean) => {
    if (currentIndex >= questions.length) return;
    const currentPhrase = questions[currentIndex];
    if (!currentPhrase) return;

    // Quality calc only on correct
    let qualityMetric: { value: number, weight: number } | undefined;
    if (correct) {
        const nextStreak = currentPhrase.consecutiveCorrect + 1;
        const totalW = currentPhrase.totalWrong ?? (currentPhrase.totalReviews - (currentPhrase.consecutiveCorrect > 0 ? currentPhrase.consecutiveCorrect : 0));
        const safeTotalW = Math.max(0, totalW);
        const maxS = currentPhrase.maxConsecutiveCorrect || currentPhrase.consecutiveCorrect;
        
        if (nextStreak > maxS && safeTotalW > 0) {
            const val = safeTotalW / Math.log2(nextStreak + 1);
            const weight = Math.pow(0.7, Math.max(0, nextStreak - 1));
            qualityMetric = { value: val, weight: weight };
        }
    }

    onReview(currentPhrase.id, correct, qualityMetric);
    
    let currentMastery = currentPhrase.mastery ?? estimateMastery(currentPhrase.consecutiveCorrect, currentPhrase.consecutiveWrong);
    
    if (correct) {
        const nextStreak = currentPhrase.consecutiveCorrect + 1;
        let factor = 0.5;
        if (nextStreak === 1) factor = 0.2;
        else if (nextStreak === 2) factor = 0.3;
        else if (nextStreak === 3) factor = 0.4;
        currentMastery = currentMastery + (100 - currentMastery) * factor;
    } else {
        const nextStreak = currentPhrase.consecutiveWrong + 1;
        if (nextStreak === 1) currentMastery = currentMastery * 0.5;
        else if (nextStreak === 2) currentMastery = currentMastery * 0.5;
        else currentMastery = 0;
    }

    const updatedPhrases = deck.phrases.map(p => {
      if (p.id === currentPhrase.id) {
        const currentTotalWrong = p.totalWrong ?? (p.totalReviews - (p.consecutiveCorrect > 0 ? p.consecutiveCorrect : 0));
        const safeCurrentTotalWrong = Math.max(0, currentTotalWrong);
        
        let newPreviousStreak = p.previousStreak;
        if (!correct) {
             if (p.consecutiveCorrect > 0) newPreviousStreak = p.consecutiveCorrect;
             else if (p.consecutiveWrong === 0) newPreviousStreak = 0;
        }

        return {
          ...p,
          totalReviews: p.totalReviews + 1,
          consecutiveCorrect: correct ? p.consecutiveCorrect + 1 : 0,
          consecutiveWrong: correct ? 0 : p.consecutiveWrong + 1,
          totalWrong: correct ? safeCurrentTotalWrong : safeCurrentTotalWrong + 1,
          maxConsecutiveCorrect: Math.max(p.maxConsecutiveCorrect || 0, correct ? p.consecutiveCorrect + 1 : 0),
          mastery: currentMastery,
          previousStreak: newPreviousStreak,
          lastReviewedAt: Date.now()
        };
      }
      return p;
    });

    onUpdateDeck({ ...deck, phrases: updatedPhrases });
    setResults(prev => [...prev, { phrase: currentPhrase, correct }]);
    if (correct) setScore(prev => prev + 1);

    const newMastery = calculateMasteryValue(updatedPhrases);
    setMasteryTrend(prev => [...prev, { t: sessionDuration, v: newMastery }]);

    // Always transition to VIEW_ANSWER to show feedback/answer before continuing
    setStep('VIEW_ANSWER');
  }, [currentIndex, deck, onReview, onUpdateDeck, questions, sessionDuration]);

  const moveToNext = () => {
      if (currentIndex < questions.length - 1) {
          setCurrentIndex(prev => prev + 1);
          setStep('QUESTION');
      } else {
          setIsFinished(true);
          setStep('RESULT');
      }
  };

  const sortedResults = results.slice().sort((a, b) => {
      if (a.correct === b.correct) return 0;
      return a.correct ? 1 : -1;
  });

  const handleFinishExam = (sortType: 'none' | 'top' | 'interleave' = 'none') => {
      const answered = results.length;
      if (onSessionComplete && answered > 0) {
          const correct = results.filter(r => r.correct).length;
          const wrong = answered - correct;
          const formattedResults = sortedResults.map(r => ({
              q: r.phrase.chinese,
              a: r.phrase.english,
              isCorrect: r.correct
          }));
          onSessionComplete(sessionDuration, correct, wrong, masteryTrend, formattedResults);
      }

      if (sortType !== 'none') {
          const wrongIds = results.filter(r => !r.correct).map(r => r.phrase.id);
          if (wrongIds.length > 0) {
              const otherIds = deck.queue.filter(id => !wrongIds.includes(id));
              let newQueue: string[] = [];
              
              let newCoolingPool = (deck.coolingPool || []).filter(c => !wrongIds.includes(c.id));
              const oldCoolingMap = new Map((deck.coolingPool || []).map(c => [c.id, c.wait]));

              if (sortType === 'top') {
                  newQueue = [...wrongIds, ...otherIds];
              } else if (sortType === 'interleave') {
                  const ratio = Math.max(1, interleaveRatio);
                  let wIdx = 0;
                  
                  const inheritCooling = (targetId: string, predecessorId: string) => {
                      const wait = oldCoolingMap.get(predecessorId);
                      if (wait !== undefined) {
                          newCoolingPool.push({ id: targetId, wait });
                      }
                  };

                  for(let oIdx = 0; oIdx < otherIds.length; oIdx++) {
                      const oid = otherIds[oIdx];
                      newQueue.push(oid);
                      
                      if ((oIdx + 1) % ratio === 0 && wIdx < wrongIds.length) {
                          const wid = wrongIds[wIdx++];
                          newQueue.push(wid);
                          inheritCooling(wid, oid);
                      }
                  }
                  while(wIdx < wrongIds.length) {
                      const wid = wrongIds[wIdx++];
                      const lastId = newQueue.length > 0 ? newQueue[newQueue.length - 1] : undefined;
                      if (lastId) inheritCooling(wid, lastId);
                      newQueue.push(wid);
                  }
              }
              onUpdateDeck({ ...deck, queue: newQueue, coolingPool: newCoolingPool });
          }
      }
      onExit();
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
        if (isFinished || isAntiTouchActive) return;

        if (e.code === 'Space' || e.key === 'Enter') {
            if (step === 'VIEW_ANSWER') { e.preventDefault(); moveToNext(); }
        }
        else if (e.key === '1' || e.key === 'ArrowLeft') {
            e.preventDefault();
            if (step === 'QUESTION') handleFirstStage(true); // Remember
            else if (step === 'GRADING') handleVerdict(true);     // Correct
            else if (step === 'VIEW_ANSWER') moveToNext(); // Allow 1 to continue
        } 
        else if (e.key === '2' || e.key === 'ArrowRight') {
            e.preventDefault();
            if (step === 'QUESTION') handleFirstStage(false); // Forgot
            else if (step === 'GRADING') handleVerdict(false);     // Wrong
        }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isFinished, step, handleVerdict, isAntiTouchActive]);

  useEffect(() => {
    if (isFinished) {
        const handleFinishKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); handleFinishExam('none'); }
        };
        window.addEventListener('keydown', handleFinishKey);
        return () => window.removeEventListener('keydown', handleFinishKey);
    }
  }, [isFinished, handleFinishExam]);

  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const renderFormattedText = (text: string) => {
    if (!text) return null;
    const parts = text.split(/\[(.*?)\]/g);
    return (
      <span className="overflow-wrap-anywhere break-words hyphens-none">
        {parts.map((part, i) => (
          i % 2 === 1 ? (
             <span key={i} className="text-orange-700 font-bold mx-0.5 border-b-2 border-orange-400">{part}</span>
          ) : (
            <span key={i}>{part}</span>
          )
        ))}
      </span>
    );
  };

  if (questions.length === 0) return <div className="fixed inset-0 bg-white flex items-center justify-center font-black text-slate-400">准备试卷中...</div>;

  if (isFinished) {
    const percentage = (score / questions.length) * 100;
    const wrongCount = questions.length - score;
    
    return (
      <div className="fixed inset-0 bg-slate-50 flex flex-col items-center justify-start p-4 overflow-y-auto z-50 animate-in fade-in duration-300">
        <div className="max-w-2xl w-full bg-white rounded-3xl shadow-2xl p-6 sm:p-10 space-y-8 my-6 flex flex-col">
          <div className="mx-auto w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center"><Trophy className="w-10 h-10 text-indigo-600" /></div>
          <div className="text-center">
            <h2 className="text-3xl font-black text-slate-900">考试结算</h2>
            <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mt-2">{deck.name}</p>
          </div>
          <div className="grid grid-cols-2 gap-6 py-8 border-t border-b border-slate-50 text-center">
             <div>
               <div className="text-slate-300 text-xs uppercase font-black tracking-wider mb-1">正确率</div>
               <div className="text-4xl font-black" style={{ color: getDynamicColor(percentage) }}>{percentage.toFixed(2)}%</div>
               <div className="text-sm font-bold text-slate-400 mt-2">{score} / {questions.length} 正确</div>
             </div>
             <div>
               <div className="text-slate-300 text-xs uppercase font-black tracking-wider mb-1">耗时</div>
               <div className="text-4xl font-black text-slate-800">{formatTime(sessionDuration)}</div>
             </div>
          </div>
          
          <div className="space-y-2">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest text-center mb-4">错题回顾 ({wrongCount})</h3>
              <div className="space-y-2 max-h-[30vh] overflow-y-auto custom-scrollbar pr-2">
                  {sortedResults.map((item, idx) => (
                      <div key={idx} className={`flex items-center p-3 rounded-xl border ${item.correct ? 'bg-emerald-50/50 border-emerald-100' : 'bg-rose-50/50 border-rose-100'}`}>
                          <div className={`shrink-0 w-6 text-center text-xs font-black ${item.correct ? 'text-emerald-500' : 'text-rose-500'}`}>
                             {item.correct ? <CheckCircle2 className="w-4 h-4"/> : <XCircle className="w-4 h-4"/>}
                          </div>
                          <div className="flex-1 grid grid-cols-2 gap-4 ml-3 text-sm">
                              <div className="font-bold text-slate-700 truncate">{item.phrase.chinese}</div>
                              <div className="font-medium text-slate-500 truncate text-right">{item.phrase.english}</div>
                          </div>
                      </div>
                  ))}
              </div>
          </div>

          <div className="pt-4 border-t border-slate-50">
             <div className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 text-center">后续处理 Post-Exam Action</div>
             {wrongCount > 0 ? (
                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Button onClick={() => handleFinishExam('none')} variant="secondary" className="py-3 text-xs font-bold rounded-xl bg-slate-100 text-slate-500">
                        错题不动
                    </Button>
                    <Button onClick={() => handleFinishExam('top')} className="py-3 text-xs font-bold rounded-xl bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100 shadow-sm">
                        <ArrowLeft className="w-3 h-3 mr-1.5 rotate-90" /> 错题全部置顶
                    </Button>
                    <div className="flex flex-col gap-2">
                      <Button onClick={() => handleFinishExam('interleave')} className="py-3 text-xs font-bold rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 hover:bg-indigo-100 shadow-sm flex-1">
                          <Shuffle className="w-3 h-3 mr-1.5" /> 错题 1:{interleaveRatio} 穿插
                      </Button>
                      <div className="flex items-center justify-center gap-2 bg-indigo-50/50 px-2 py-1 rounded-lg border border-indigo-100">
                          <span className="text-[10px] font-bold text-indigo-400 uppercase">Ratio</span>
                          <input type="number" min="1" max="20" value={interleaveRatio} onChange={(e) => setInterleaveRatio(Math.max(1, parseInt(e.target.value) || 1))} className="w-12 text-center text-xs font-black p-1 rounded border border-indigo-200 text-indigo-900 focus:ring-2 ring-indigo-400 outline-none bg-white" />
                      </div>
                    </div>
                 </div>
             ) : (
                <div className="flex justify-center">
                    <Button onClick={() => handleFinishExam('none')} className="py-3 px-8 text-lg font-black bg-slate-900 text-white shadow-xl rounded-xl">完成考试</Button>
                </div>
             )}
          </div>
        </div>
      </div>
    );
  }

  const currentPhrase = questions[currentIndex];
  const isQuestionPhase = step === 'QUESTION';
  const isGradingPhase = step === 'GRADING';
  const isViewAnswerPhase = step === 'VIEW_ANSWER';
  
  // Determine if the current answered state was correct
  const lastResult = results[results.length - 1];
  // Check if we are viewing the answer for the current question we just graded
  const isViewingCurrentResult = isViewAnswerPhase && lastResult && lastResult.phrase.id === currentPhrase.id;
  const currentResultCorrect = isViewingCurrentResult ? lastResult.correct : false;

  return (
    <div className="fixed inset-0 bg-slate-50 flex flex-col h-full z-50">
       <div className="bg-white px-4 py-3 flex items-center justify-between border-b border-slate-100 shrink-0">
          <button onClick={onExit} className="p-2 text-slate-400 hover:text-slate-600"><ArrowLeft className="w-5 h-5"/></button>
          <div className="flex flex-col items-center">
             <span className="text-sm font-black text-slate-800">Exam Session</span>
             <span className="text-[10px] text-slate-400 font-bold">{currentIndex + 1} / {questions.length}</span>
          </div>
          <div className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-lg text-xs font-bold text-slate-500">
             <Clock className="w-3.5 h-3.5"/> <span>{formatTime(sessionDuration)}</span>
          </div>
       </div>

       <div className="flex-1 flex flex-col items-center justify-start p-6 pt-12 overflow-y-auto custom-scrollbar relative">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl border border-slate-100 p-6 sm:p-8 min-h-[240px] flex flex-col items-center text-center relative overflow-hidden shrink-0">
              <div className="text-2xl sm:text-3xl font-black text-slate-800 mb-4 leading-snug">
                  {renderFormattedText(currentPhrase.chinese)}
              </div>
              
              {/* Timer Visual for Question Phase */}
              {isQuestionPhase && timeLimit > 0 && (
                   <div className="mt-4 flex flex-col items-center animate-in fade-in w-full max-w-[120px]">
                       <div className="text-xs font-black text-indigo-400 tabular-nums mb-1">{timeLeft.toFixed(1)}s</div>
                       <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                           <div 
                               className="h-full bg-indigo-400 transition-all duration-100 ease-linear"
                               style={{ width: `${(timeLeft / timeLimit) * 100}%` }}
                           ></div>
                       </div>
                   </div>
              )}

              {(isGradingPhase || isViewAnswerPhase) && (
                  <div className="animate-in fade-in slide-in-from-bottom-4 space-y-4 w-full mt-4">
                      {currentPhrase.note && (
                          <div className="bg-amber-50 p-4 rounded-xl text-left border border-amber-100 relative">
                               <StickyNote className="w-4 h-4 text-amber-400 absolute top-4 left-4" />
                               <div className="pl-8 text-sm font-medium text-slate-700 whitespace-pre-wrap leading-relaxed break-words">
                                   {renderFormattedText(currentPhrase.note)}
                               </div>
                          </div>
                      )}
                      <div className="text-center py-2 px-2 rounded-xl">
                          <div className="text-2xl font-black text-indigo-600 leading-snug break-words">
                              {renderFormattedText(currentPhrase.english)}
                          </div>
                      </div>
                      
                      {isViewAnswerPhase && (
                          <div className={`flex items-center justify-center gap-2 font-black text-lg ${currentResultCorrect ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {currentResultCorrect ? <CheckCircle2 className="w-6 h-6"/> : <XCircle className="w-6 h-6"/>}
                              {currentResultCorrect ? 'Correct' : 'Wrong'}
                          </div>
                      )}
                  </div>
              )}
          </div>
          
          {/* Transparent Input Blocker for Anti-Touch */}
          {isAntiTouchActive && <div className="absolute inset-0 z-20 cursor-not-allowed"></div>}
       </div>

       <div className="p-4 bg-white border-t border-slate-100 shrink-0">
           <div className="max-w-xl mx-auto">
               {isQuestionPhase ? (
                   <div className="grid grid-cols-2 gap-3">
                       <Button onClick={() => handleFirstStage(true)} className="py-4 text-lg font-black bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200/50">
                           记得 (1)
                       </Button>
                       <Button onClick={() => handleFirstStage(false)} variant="outline" className="py-4 text-lg font-black border-2 border-slate-200 text-slate-600">
                           忘了 (2)
                       </Button>
                   </div>
               ) : isGradingPhase ? (
                   <div className="grid grid-cols-2 gap-4">
                       <button onClick={() => handleVerdict(true)} className="flex flex-col items-center justify-center py-4 rounded-xl border-2 border-slate-100 hover:border-emerald-400 hover:bg-emerald-50 transition-all group">
                           <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2 group-hover:scale-110 transition-transform" />
                           <span className="text-sm font-black text-slate-600">正确 (1)</span>
                       </button>
                       <button onClick={() => handleVerdict(false)} className="flex flex-col items-center justify-center py-4 rounded-xl border-2 border-slate-100 hover:border-rose-400 hover:bg-rose-50 transition-all group">
                           <XCircle className="w-8 h-8 text-rose-500 mb-2 group-hover:scale-110 transition-transform" />
                           <span className="text-sm font-black text-slate-600">错误 (2)</span>
                       </button>
                   </div>
               ) : (
                   <Button fullWidth onClick={moveToNext} disabled={isAntiTouchActive} className={`py-4 text-lg font-black shadow-lg bg-slate-800 hover:bg-slate-900 ${isAntiTouchActive ? 'opacity-50 cursor-not-allowed' : ''}`}>
                       继续 (Space / 1) <ArrowRight className="w-5 h-5 ml-2" />
                   </Button>
               )}
           </div>
       </div>
    </div>
  );
};
