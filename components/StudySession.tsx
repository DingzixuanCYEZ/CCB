
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Phrase, Deck, CardState } from '../types';
import { Button } from './Button';
import { ArrowLeft, CheckCircle2, XCircle, Eye, HelpCircle, ArrowRight, ListOrdered, X, StickyNote, BarChart2, Edit2, Clock, TrendingUp, Trophy } from 'lucide-react';
import { calculateMasteryValue, getDynamicColor, estimateMastery, formatFullTime, getBadgeColor } from '../App';

interface StudySessionProps {
  deck: Deck;
  onUpdateDeck: (updatedDeck: Deck) => void;
  onExit: () => void;
  onReview: (phraseId: string, isCorrect: boolean, qualityMetric?: { value: number, weight: number }) => void; 
  onTimeUpdate: (seconds: number) => void; 
  onSessionComplete?: (durationSeconds: number, correctCount: number, wrongCount: number, trend: { t: number; v: number }[]) => void;
}

const getPhraseLabel = (p: Phrase) => {
    if (p.consecutiveCorrect > 0) return `对${p.consecutiveCorrect}`;
    if (p.consecutiveWrong > 0) return `错${p.consecutiveWrong}`;
    return '新';
};

// Helper to remove excess newlines and trim text
const cleanNote = (text?: string) => {
    if (!text) return "";
    // Replace multiple newlines with a single newline, and trim
    return text.replace(/\n\s*\n/g, '\n').trim();
};

export const StudySession: React.FC<StudySessionProps> = ({ deck, onUpdateDeck, onExit, onReview, onTimeUpdate, onSessionComplete }) => {
  const [activePhraseId, setActivePhraseId] = useState<string | null>(deck.queue.length > 0 ? deck.queue[0] : null);
  const [cardState, setCardState] = useState<CardState>(CardState.HIDDEN);
  const [sessionStats, setSessionStats] = useState({ correct: 0, wrong: 0 });
  const [sessionDuration, setSessionDuration] = useState(0);
  const [showQueue, setShowQueue] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [preEditState, setPreEditState] = useState<CardState>(CardState.HIDDEN);
  const [editForm, setEditForm] = useState({ english: '', chinese: '', note: '' });
  const [feedback, setFeedback] = useState<{ insertIndex: number; isCorrect: boolean; prevState: string; newState: string } | null>(null);
  
  const [startMastery] = useState(calculateMasteryValue(deck.phrases));
  const [masteryTrend, setMasteryTrend] = useState<{ t: number; v: number }[]>([{ t: 0, v: calculateMasteryValue(deck.phrases) }]);
  const [isFinished, setIsFinished] = useState(false);

  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isFinished) return;
    timerRef.current = window.setInterval(() => {
      onTimeUpdate(1);
      setSessionDuration(prev => prev + 1);
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [onTimeUpdate, isFinished]);

  useEffect(() => {
    if (activePhraseId) {
       const phrase = deck.phrases.find(p => p.id === activePhraseId);
       if (phrase) {
         setEditForm({
           english: phrase.english,
           chinese: phrase.chinese,
           note: (phrase.note || '').replace(/\\n/g, '\n')
         });
       }
       setIsEditing(false);
    }
  }, [activePhraseId, deck.phrases]);

  const handleFinish = () => {
      const totalReviews = sessionStats.correct + sessionStats.wrong;
      if (totalReviews > 0) {
          setIsFinished(true);
      } else {
          onExit();
      }
  };

  const handleConfirmExit = () => {
      if (onSessionComplete) onSessionComplete(sessionDuration, sessionStats.correct, sessionStats.wrong, masteryTrend);
      onExit();
  };

  const handleSaveEdit = useCallback(() => {
    if (!activePhraseId) return;
    const updatedPhrases = deck.phrases.map(p => {
      if (p.id === activePhraseId) {
        return { ...p, english: editForm.english, chinese: editForm.chinese, note: editForm.note };
      }
      return p;
    });
    onUpdateDeck({ ...deck, phrases: updatedPhrases });
    setIsEditing(false);
    setCardState(preEditState);
  }, [activePhraseId, deck, editForm, onUpdateDeck, preEditState]);

  const handleVerdict = useCallback((isCorrect: boolean) => {
    if (!activePhraseId) return;
    const previousPhrase = deck.phrases.find(p => p.id === activePhraseId)!;
    const prevStateLabel = getPhraseLabel(previousPhrase);
    
    // --- START RECOVERY STREAK LOGIC ---
    let newConsecutiveCorrect = 0;
    let newConsecutiveWrong = 0;
    let newPreviousStreak = previousPhrase.previousStreak;

    if (isCorrect) {
        // Recovery Logic
        if (previousPhrase.consecutiveWrong > 0) {
            const errCount = previousPhrase.consecutiveWrong;
            const prevS = previousPhrase.previousStreak || 0;
            if (errCount === 1) {
                newConsecutiveCorrect = Math.max(1, Math.ceil(prevS / 2));
            } else if (errCount === 2) {
                newConsecutiveCorrect = Math.max(1, Math.ceil(prevS / 4));
            } else {
                newConsecutiveCorrect = 1; // 3+ mistakes = reset to 1
            }
        } else {
            // Standard Logic
            const isNewPhrase = previousPhrase.consecutiveCorrect === 0 && previousPhrase.consecutiveWrong === 0;
            if (isNewPhrase) {
                newConsecutiveCorrect = 3; 
            } else {
                newConsecutiveCorrect = previousPhrase.consecutiveCorrect + 1;
            }
        }
        newConsecutiveWrong = 0;
    } else {
        // Mistake Logic
        newConsecutiveWrong = previousPhrase.consecutiveWrong + 1;
        newConsecutiveCorrect = 0;
        
        // If this is the FIRST mistake in a sequence, save the streak
        if (previousPhrase.consecutiveCorrect > 0) {
            newPreviousStreak = previousPhrase.consecutiveCorrect;
        } else if (previousPhrase.consecutiveWrong === 0) {
            // It was a new word (0/0) -> Wrong. prevStreak is effectively 0.
            newPreviousStreak = 0;
        }
        // If consecutiveWrong > 0 already, we keep the existing previousStreak
    }
    // --- END RECOVERY LOGIC ---

    let newStateLabel = '';
    if (isCorrect) {
        newStateLabel = `对${newConsecutiveCorrect}`;
    } else {
        newStateLabel = `错${newConsecutiveWrong}`;
    }

    let qualityMetric: { value: number, weight: number } | undefined;
    if (isCorrect) {
        const newStreak = newConsecutiveCorrect;
        const totalW = previousPhrase.totalWrong ?? (previousPhrase.totalReviews - (previousPhrase.consecutiveCorrect > 0 ? previousPhrase.consecutiveCorrect : 0));
        const safeTotalW = Math.max(0, totalW);
        const maxS = previousPhrase.maxConsecutiveCorrect || previousPhrase.consecutiveCorrect;
        
        // Trigger calculation if we broke the streak record
        if (newStreak > maxS && safeTotalW > 0) {
            const val = safeTotalW / Math.log2(newStreak + 1);
            // Weight formula: Streak 1 = 1.0, Streak 2 = 0.7, Streak 3 = 0.49... (0.7 ^ (streak - 1))
            const weight = Math.pow(0.7, Math.max(0, newStreak - 1));
            qualityMetric = { value: val, weight: weight };
        }
    }

    onReview(activePhraseId, isCorrect, qualityMetric);
    
    let currentMastery = previousPhrase.mastery ?? estimateMastery(previousPhrase.consecutiveCorrect, previousPhrase.consecutiveWrong);
    
    // Recalculate based on new state
    if (isCorrect) {
        let factor = 0.5;
        if (newConsecutiveCorrect === 1) factor = 0.2;
        else if (newConsecutiveCorrect === 2) factor = 0.3;
        else if (newConsecutiveCorrect === 3) factor = 0.4;
        currentMastery = currentMastery + (100 - currentMastery) * factor;
    } else {
        // Wrong
        const nextStreak = previousPhrase.consecutiveWrong + 1;
        if (nextStreak === 1) currentMastery = currentMastery * 0.5;
        else if (nextStreak === 2) currentMastery = currentMastery * 0.5;
        else currentMastery = 0;
    }

    const updatedPhrases = deck.phrases.map(p => {
      if (p.id === activePhraseId) {
        // Ensure totalWrong is valid (default to 0 if undefined to start tracking properly)
        const currentTotalWrong = p.totalWrong ?? (p.totalReviews - (p.consecutiveCorrect > 0 ? p.consecutiveCorrect : 0));
        const safeCurrentTotalWrong = Math.max(0, currentTotalWrong);
        
        return { 
          ...p, 
          totalReviews: p.totalReviews + 1, 
          consecutiveCorrect: newConsecutiveCorrect, 
          consecutiveWrong: newConsecutiveWrong,
          // Explicitly track totalWrong: if correct, keep same; if wrong, increment.
          // This decouples it from consecutive streaks and ensures monotonicity.
          totalWrong: isCorrect ? safeCurrentTotalWrong : safeCurrentTotalWrong + 1, 
          maxConsecutiveCorrect: Math.max(p.maxConsecutiveCorrect || 0, newConsecutiveCorrect), 
          mastery: currentMastery, 
          lastReviewedAt: Date.now(),
          previousStreak: newPreviousStreak
        };
      }
      return p;
    });
    
    const updatedPhrase = updatedPhrases.find(p => p.id === activePhraseId)!;
    const nextQueue = [...deck.queue];
    const currentIndexInQueue = nextQueue.indexOf(activePhraseId);
    if (currentIndexInQueue >= 0) nextQueue.splice(currentIndexInQueue, 1);
    
    let baseOffset = 0;
    // Calculate offset based on NEW status
    if (isCorrect) {
        if (updatedPhrase.consecutiveCorrect === 1) {
            // Logic for first correct
             if (previousPhrase.consecutiveWrong > 0) {
                const wrongCount = previousPhrase.consecutiveWrong;
                if (wrongCount === 1) baseOffset = 5; else if (wrongCount <= 3) baseOffset = 4; else if (wrongCount <= 6) baseOffset = 3; else baseOffset = 2;
            } else {
                // Was 0/0 (New) or 0/X (impossible if Correct)
                baseOffset = 8;
            }
        } else {
            // High streak
            baseOffset = Math.pow(2, updatedPhrase.consecutiveCorrect + 1);
        }
    } else {
        if (updatedPhrase.consecutiveWrong === 1) {
             if (previousPhrase.consecutiveCorrect > 0) {
                const correctCount = previousPhrase.consecutiveCorrect;
                if (correctCount === 1) baseOffset = 3; else if (correctCount <= 3) baseOffset = 4; else if (correctCount <= 6) baseOffset = 5; else baseOffset = 6;
            } else {
                baseOffset = 2; // 0/0 -> Wrong
            }
        } else {
            const wrongCount = updatedPhrase.consecutiveWrong;
            const remainder = wrongCount % 3;
            if (remainder === 0) baseOffset = 10; else if (remainder === 1) baseOffset = 2; else baseOffset = 4;
        }
    }
    
    const perturbation = 0.9 + (Math.random() * 0.2);
    const finalOffset = Math.round(baseOffset * perturbation);
    const actualInsertIndex = Math.max(1, Math.min(finalOffset, nextQueue.length));
    nextQueue.splice(actualInsertIndex, 0, activePhraseId);

    onUpdateDeck({ ...deck, phrases: updatedPhrases, queue: nextQueue });
    setSessionStats(prev => ({ correct: prev.correct + (isCorrect ? 1 : 0), wrong: prev.wrong + (isCorrect ? 0 : 1) }));
    setFeedback({ insertIndex: actualInsertIndex, isCorrect, prevState: prevStateLabel, newState: newStateLabel });
    setCardState(isCorrect ? CardState.REVIEWED : CardState.MISSED);

    const newMastery = calculateMasteryValue(updatedPhrases);
    setMasteryTrend(prev => [...prev, { t: sessionDuration, v: newMastery }]);

  }, [deck, activePhraseId, onReview, onUpdateDeck, sessionDuration]);

  const handleNext = useCallback(() => {
    if (deck.queue.length > 0) setActivePhraseId(deck.queue[0]);
    setCardState(CardState.HIDDEN);
    setFeedback(null);
  }, [deck.queue]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditing || isFinished) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (cardState) {
        case CardState.HIDDEN:
          if (e.code === 'Space' || e.key === 'Enter' || e.key === '1') { e.preventDefault(); setCardState(CardState.VERIFYING); } 
          else if (e.key === '2') { e.preventDefault(); handleVerdict(false); }
          break;
        case CardState.VERIFYING:
          if (e.key === '1' || e.key === 'ArrowLeft') { e.preventDefault(); handleVerdict(true); } 
          else if (e.key === '2' || e.key === 'ArrowRight') { e.preventDefault(); handleVerdict(false); }
          break;
        case CardState.REVIEWED:
        case CardState.MISSED:
          if (e.code === 'Space' || e.key === 'Enter' || e.key === '1' || e.key === '2') { e.preventDefault(); handleNext(); }
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cardState, isEditing, handleVerdict, handleNext, isFinished]);

  const renderFormattedText = (text: string) => {
    if (!text) return null;
    const parts = text.split(/\[(.*?)\]/g);
    return (
      <span className="overflow-wrap-anywhere break-words hyphens-none">
        {parts.map((part, i) => (i % 2 === 1 ? (<span key={i} className="text-orange-700 font-bold mx-0.5 border-b-2 border-orange-400">{part}</span>) : (<span key={i}>{part}</span>)))}
      </span>
    );
  };

  const renderTrendChart = (data = masteryTrend, height = 100) => {
    if (data.length < 2) return null;
    const width = 240; const padding = { top: 10, right: 10, bottom: 20, left: 30 };
    const chartWidth = width - padding.left - padding.right; const chartHeight = height - padding.top - padding.bottom;
    const maxTime = Math.max(...data.map(d => d.t), 1); const minTime = data[0].t; const timeRange = maxTime - minTime || 1;
    const points = data.map(d => { const x = padding.left + ((d.t - minTime) / timeRange) * chartWidth; const y = padding.top + chartHeight - ((d.v) / 100) * chartHeight; return `${x},${y}`; }).join(' ');
    return (
         <div className="relative">
             <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible bg-slate-50/50 rounded-lg border border-slate-100">
                <line x1={padding.left} y1={padding.top} x2={width-padding.right} y2={padding.top} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />
                <line x1={padding.left} y1={padding.top + chartHeight/2} x2={width-padding.right} y2={padding.top + chartHeight/2} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />
                <line x1={padding.left} y1={height-padding.bottom} x2={width-padding.right} y2={height-padding.bottom} stroke="#e2e8f0" strokeWidth="1" />
                <text x={25} y={padding.top + 4} className="text-[9px] fill-slate-400 font-bold" textAnchor="end">100%</text>
                <text x={25} y={padding.top + chartHeight/2 + 4} className="text-[9px] fill-slate-400 font-bold" textAnchor="end">50%</text>
                <text x={25} y={height-padding.bottom - 2} className="text-[9px] fill-slate-400 font-bold" textAnchor="end">0%</text>
                <text x={width-padding.right} y={height-5} className="text-[9px] fill-slate-400 font-bold" textAnchor="end">Time (s) &rarr;</text>
                <polyline points={points} fill="none" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
             </svg>
         </div>
    );
  };

  const formatHeaderTime = (seconds: number) => { const m = Math.floor(seconds / 60); const s = seconds % 60; return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`; };
  const liveMasteryValue = calculateMasteryValue(deck.phrases);
  const currentPhrase = deck.phrases.find(p => p.id === activePhraseId);
  
  if (isFinished) {
      const endMastery = masteryTrend[masteryTrend.length - 1].v;
      const gain = endMastery - startMastery;
      return (
        <div className="fixed inset-0 bg-slate-50 z-50 flex flex-col items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-300">
            <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 flex flex-col space-y-6">
                <div className="text-center">
                    <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-600"><Trophy className="w-8 h-8" /></div>
                    <h2 className="text-2xl font-black text-slate-800">背诵结算</h2>
                    <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">{deck.name}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                        <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">本次复习</div>
                        <div className="text-2xl font-black text-slate-800">{sessionStats.correct + sessionStats.wrong} <span className="text-xs text-slate-400">词</span></div>
                        <div className="text-xs font-bold mt-1"><span className="text-emerald-500">{sessionStats.correct} 对</span> / <span className="text-rose-500">{sessionStats.wrong} 错</span></div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                        <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">专注时长</div>
                        <div className="text-2xl font-black text-slate-800">{formatFullTime(sessionDuration)}</div>
                    </div>
                </div>
                <div className="bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <span className="text-xs font-black text-indigo-900 uppercase tracking-widest block mb-1">掌握度变化 Mastery Gain</span>
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                                <span>{startMastery.toFixed(2)}%</span>
                                <span className="text-slate-300">→</span>
                                <span>{endMastery.toFixed(2)}%</span>
                            </div>
                        </div>
                        <span className={`text-lg font-black ${gain >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{gain > 0 ? '+' : ''}{gain.toFixed(2)}%</span>
                    </div>
                    {renderTrendChart(masteryTrend, 120)}
                </div>
                <Button fullWidth onClick={handleConfirmExit} className="py-4 text-lg font-black rounded-2xl shadow-xl">确认完成</Button>
            </div>
        </div>
      );
  }

  if (!currentPhrase) return <div className="fixed inset-0 bg-white flex items-center justify-center font-bold text-lg">词库为空</div>;

  const questionText = currentPhrase.chinese;
  const answerText = currentPhrase.english;

  const distributionData = deck.phrases.reduce((acc, p) => {
    const key = p.consecutiveWrong > 0 ? `连错 ${p.consecutiveWrong}次` : p.consecutiveCorrect > 0 ? `连对 ${p.consecutiveCorrect}次` : '待复习';
    const existing = acc.find(a => a.label === key);
    if (existing) { existing.count++; } 
    else { acc.push({label: key, count: 1, correct: p.consecutiveCorrect, wrong: p.consecutiveWrong}); }
    return acc;
  }, [] as {label: string, count: number, correct: number, wrong: number}[]).sort((a,b) => {
     const valA = a.wrong > 0 ? -a.wrong : a.correct;
     const valB = b.wrong > 0 ? -b.wrong : b.correct;
     return valB - valA;
  });

  return (
    <div className="fixed inset-0 bg-slate-50 z-50 flex flex-col h-full overflow-hidden">
      <div className="bg-white shadow-sm shrink-0 relative z-[60]">
        <div className="flex items-center justify-between px-3 py-2 gap-3 h-14">
            <button onClick={handleFinish} className="p-2 text-slate-400 hover:text-slate-600 active:scale-95 transition-transform shrink-0"><ArrowLeft className="w-5 h-5"/></button>
            <div className="flex-1 flex flex-col justify-center max-w-[70%] sm:max-w-[50%]">
                 <div className="flex justify-between items-end mb-1 leading-none">
                     <span className="text-[10px] text-slate-400 font-bold truncate pr-2">{deck.name}</span>
                     <span className="text-[10px] font-mono font-bold text-slate-400">{formatHeaderTime(sessionDuration)}</span>
                 </div>
                 <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden relative border border-slate-50">
                    <div className="absolute top-0 left-0 h-full transition-all duration-700 ease-out" style={{ width: `${liveMasteryValue}%`, backgroundColor: getDynamicColor(liveMasteryValue) }}></div>
                 </div>
                 <div className="flex justify-between items-start mt-1 leading-none">
                     <span className="text-[10px] font-black" style={{ color: getDynamicColor(liveMasteryValue) }}>{liveMasteryValue.toFixed(2)}%</span>
                     <span className="text-[10px] font-bold text-slate-400 flex items-center">
                        <span className="text-emerald-500">{sessionStats.correct}</span>
                        <span className="text-slate-300 mx-1">/</span>
                        <span>{sessionStats.correct + sessionStats.wrong}</span>
                     </span>
                 </div>
            </div>
            <div className="flex gap-1 shrink-0">
                 <button onClick={()=>setShowStats(!showStats)} className={`p-2 rounded-lg transition-colors ${showStats ? 'text-indigo-600 bg-indigo-50' : 'text-slate-300 hover:text-slate-500'}`}><BarChart2 className="w-5 h-5"/></button>
                 <button onClick={()=>setShowQueue(!showQueue)} className={`p-2 rounded-lg transition-colors ${showQueue ? 'text-indigo-600 bg-indigo-50' : 'text-slate-300 hover:text-slate-500'}`}><ListOrdered className="w-5 h-5"/></button>
            </div>
        </div>
      </div>

      <div className="flex-1 flex relative overflow-hidden">
        <div className={`flex-1 flex flex-col items-center p-4 sm:p-6 transition-all duration-300 ${showQueue ? 'lg:pr-[320px]' : ''} ${showStats ? 'lg:pl-[320px]' : ''}`}>
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl border border-slate-100 flex flex-col h-full max-h-[calc(100vh-90px)] sm:max-h-[600px] overflow-hidden relative">
             {cardState !== CardState.HIDDEN && (
               <div className="absolute top-2 right-2 z-10">
                 <button onClick={()=>{setPreEditState(cardState); setIsEditing(true); setCardState(CardState.HIDDEN);}} className="p-2 text-slate-200 hover:text-indigo-400 transition-colors"><Edit2 className="w-4 h-4"/></button>
               </div>
             )}

             {isEditing ? (
                 <div className="flex-1 p-5 overflow-y-auto">
                    <h3 className="font-black text-slate-800 mb-4 flex items-center gap-2"><Edit2 className="w-4 h-4"/> 编辑卡片</h3>
                    <div className="space-y-4">
                        <div><label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">Chinese</label><textarea className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 ring-indigo-500" rows={2} value={editForm.chinese} onChange={e=>setEditForm({...editForm, chinese: e.target.value})}/></div>
                        <div><label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">English</label><textarea className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 ring-indigo-500" rows={2} value={editForm.english} onChange={e=>setEditForm({...editForm, english: e.target.value})}/></div>
                        <div><label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">Note</label><textarea className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 outline-none focus:ring-2 ring-indigo-500" rows={4} value={editForm.note} onChange={e=>setEditForm({...editForm, note: e.target.value})}/></div>
                        <div className="flex gap-3 pt-2"><Button variant="ghost" fullWidth onClick={()=>{setIsEditing(false); setCardState(preEditState);}}>取消</Button><Button fullWidth onClick={handleSaveEdit}>保存</Button></div>
                    </div>
                 </div>
             ) : (
                 <>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col items-center w-full">
                        <div className="w-full flex flex-col items-center text-center pt-6 mb-2">
                           <h1 className="text-2xl sm:text-3xl font-black text-slate-800 leading-snug break-words max-w-full">
                               {renderFormattedText(questionText)}
                           </h1>
                        </div>
                        {(cardState !== CardState.HIDDEN) && (
                            <div className="w-full space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-300 pb-2">
                                {currentPhrase.note && (
                                    <div className="w-full bg-amber-50 p-4 rounded-xl border border-amber-100 text-left relative">
                                        <div className="absolute top-4 left-4"><StickyNote className="w-4 h-4 text-amber-400" /></div>
                                        <div className="pl-8 text-sm font-medium text-slate-700 whitespace-pre-wrap leading-relaxed break-words">
                                            {renderFormattedText(cleanNote(currentPhrase.note))}
                                        </div>
                                    </div>
                                )}
                                <div className="text-center py-1 px-2 rounded-xl">
                                    <p className="text-2xl font-black text-indigo-600 leading-snug break-words">
                                        {renderFormattedText(answerText)}
                                    </p>
                                </div>
                                {feedback && (
                                    <div className="flex flex-col items-center gap-1 animate-in zoom-in-95 pt-2 border-t border-slate-50">
                                        <div className={`text-lg font-black mt-1 ${feedback.isCorrect ? 'text-emerald-500' : 'text-rose-500'}`}>
                                            {`后移 ${feedback.insertIndex} 位`}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            {feedback.isCorrect ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <XCircle className="w-3.5 h-3.5 text-rose-500" />}
                                            <span className="text-sm font-bold text-slate-400">{feedback.prevState}</span>
                                            <span className="text-slate-300">→</span>
                                            <span className="text-sm font-bold text-slate-600">{feedback.newState}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="p-4 bg-slate-50 border-t border-slate-100 shrink-0">
                         {cardState === CardState.HIDDEN ? (
                             <div className="grid grid-cols-2 gap-3">
                                 <Button onClick={()=>setCardState(CardState.VERIFYING)} className="py-3.5 text-lg font-black rounded-xl shadow-lg shadow-indigo-200/50 bg-indigo-600 hover:bg-indigo-700 border-0 text-white">记得 (1)</Button>
                                 <Button onClick={()=>handleVerdict(false)} className="py-3.5 text-lg font-black rounded-xl bg-white border-2 border-slate-200 text-slate-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 shadow-sm">忘了 (2)</Button>
                             </div>
                         ) : cardState === CardState.VERIFYING ? (
                             <div className="grid grid-cols-2 gap-3">
                                <button onClick={()=>handleVerdict(true)} className="flex flex-col items-center justify-center py-3 bg-white border-2 border-slate-100 rounded-xl hover:border-emerald-400 hover:bg-emerald-50 active:scale-95 transition-all shadow-sm group relative overflow-hidden">
                                    <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <CheckCircle2 className="w-6 h-6 text-emerald-500 mb-1 group-hover:scale-110 transition-transform relative z-10"/>
                                    <span className="text-sm font-black text-slate-600 group-hover:text-emerald-700 relative z-10">正确 (1)</span>
                                </button>
                                <button onClick={()=>handleVerdict(false)} className="flex flex-col items-center justify-center py-3 bg-white border-2 border-slate-100 rounded-xl hover:border-rose-400 hover:bg-rose-50 active:scale-95 transition-all shadow-sm group relative overflow-hidden">
                                    <div className="absolute inset-0 bg-rose-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <XCircle className="w-6 h-6 text-rose-500 mb-1 group-hover:scale-110 transition-transform relative z-10"/>
                                    <span className="text-sm font-black text-slate-600 group-hover:text-rose-700 relative z-10">错误 (2)</span>
                                </button>
                             </div>
                         ) : (
                             <Button onClick={handleNext} fullWidth className={`py-3.5 text-lg font-black rounded-xl shadow-lg ${feedback?.isCorrect ? 'bg-indigo-600 shadow-indigo-200/50 hover:bg-indigo-700' : 'bg-slate-800 shadow-slate-300 hover:bg-slate-900'}`}>
                                 {feedback?.isCorrect ? '复习下一个' : '继续努力'} <span className="opacity-50 text-sm ml-2 font-normal">(Space/1/2)</span> <ArrowRight className="w-5 h-5 ml-2"/>
                             </Button>
                         )}
                    </div>
                 </>
             )}
          </div>
        </div>
        
        <div className={`absolute top-0 right-0 h-full w-[320px] bg-white border-l border-slate-100 shadow-2xl transition-transform duration-300 z-[70] flex flex-col ${showQueue ? 'translate-x-0' : 'translate-x-full'}`}>
             <div className="p-4 flex justify-between items-center bg-white border-b border-slate-50">
                 <h3 className="font-bold text-slate-800 flex items-center gap-2"><ListOrdered className="w-5 h-5"/> 复习队列</h3>
                 <button onClick={()=>setShowQueue(false)} className="p-1 hover:bg-slate-100 rounded-full"><X className="w-5 h-5 text-slate-400"/></button>
             </div>
             <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                 {deck.queue.map((id, idx) => {
                     const p = deck.phrases.find(item => item.id === id);
                     if (!p) return null;
                     const isCurrent = id === activePhraseId;
                     const label = getPhraseLabel(p);
                     const badgeColor = getBadgeColor(p.consecutiveCorrect, p.consecutiveWrong);
                     
                     return (
                         <div key={id} className="flex items-center justify-between text-sm py-1">
                             <div className="flex items-center gap-4 min-w-0">
                                 <span className="font-medium text-slate-300 w-4 text-center text-xs">{idx+1}</span>
                                 <div className={`truncate font-bold text-base ${isCurrent ? 'text-indigo-600' : 'text-slate-700'}`}>{p.chinese}</div>
                             </div>
                             <div className="px-2 py-0.5 rounded text-[10px] font-black text-white shrink-0" style={{backgroundColor: badgeColor}}>{label}</div>
                         </div>
                     )
                 })}
             </div>
        </div>

        <div className={`absolute top-0 left-0 h-full w-[320px] bg-white border-r border-slate-100 shadow-2xl transition-transform duration-300 z-[70] flex flex-col ${showStats ? 'translate-x-0' : '-translate-x-full'}`}>
             <div className="p-6 pb-2 flex justify-between items-center bg-white">
                 <div>
                    <h3 className="font-bold text-slate-500 text-sm">分布详情 DISTRIBUTION</h3>
                 </div>
                 <button onClick={()=>setShowStats(false)} className="p-1 hover:bg-slate-100 rounded-full"><X className="w-5 h-5 text-slate-400"/></button>
             </div>
             <div className="p-6 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-2 gap-3">
                    {distributionData.map(d => {
                        const color = getBadgeColor(d.correct, d.wrong);
                        return (
                           <div key={d.label} className="flex justify-between items-center p-3 rounded-xl border border-slate-100 shadow-sm bg-white">
                               <span className="text-sm font-bold" style={{color}}>{d.label}</span>
                               <span className="font-black text-slate-800">{d.count}</span>
                           </div>
                        );
                    })}
                </div>
                
                <div className="pt-4 border-t border-slate-50">
                    <div className="text-[10px] text-slate-300 mb-2">100%</div>
                    {renderTrendChart(masteryTrend, 120)}
                    <div className="flex justify-between text-[10px] text-slate-300 mt-1">
                        <span>0%</span>
                        <span>Time (s) &rarr;</span>
                    </div>
                </div>
             </div>
        </div>
      </div>
    </div>
  );
};
