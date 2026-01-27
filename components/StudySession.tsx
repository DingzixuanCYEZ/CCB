
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Phrase, Deck, CardState } from '../types';
import { Button } from './Button';
import { ArrowLeft, CheckCircle2, XCircle, Trophy, Clock, StickyNote, BarChart2, Edit2, Settings2, ListOrdered, X, RefreshCw, Hash, ArrowRight, Waves, ThermometerSnowflake, AlertCircle, RotateCcw, Divide, MoveDown, Undo2, Activity, Eye, ArrowUp, Timer } from 'lucide-react';
import { calculateMasteryValue, getDynamicColor, estimateMastery, formatFullTime, getBadgeColor } from '../App';

interface StudySessionProps {
  deck: Deck;
  onUpdateDeck: (updatedDeck: Deck) => void;
  onExit: () => void;
  onReview: (phraseId: string, verdict: 'correct' | 'wrong' | 'half', qualityMetric?: { value: number, weight: number }) => void; 
  onTimeUpdate: (seconds: number) => void; 
  onSessionComplete?: (durationSeconds: number, correctCount: number, wrongCount: number, halfCount: number, trend: { t: number; v: number }[]) => void;
}

const getPhraseLabel = (p: Phrase) => {
    if (p.consecutiveCorrect > 0) return `对${p.consecutiveCorrect}`;
    if (p.consecutiveWrong > 0) return `错${p.consecutiveWrong}`;
    return '新';
};

const cleanNote = (text?: string) => {
    if (!text) return "";
    return text.replace(/\n\s*\n/g, '\n').trim();
};

const ALGO_SETTINGS_KEY = 'recallflow_algo_settings_v1';

const CORRECT_ALGO_GROUPS = [
    { id: 1, name: '稠密 Dense', multiplier: 0.5, expBase: 1.6, desc: '高频复习', masteryFactors: [0.14, 0.21, 0.28, 0.35] },
    { id: 2, name: '稳固 Solid', multiplier: 0.75, expBase: 1.75, desc: '加强巩固', masteryFactors: [0.16, 0.24, 0.32, 0.40] },
    { id: 3, name: '标准 Standard', multiplier: 1.0, expBase: 2.0, desc: '平衡节奏', masteryFactors: [0.20, 0.30, 0.40, 0.50] },
    { id: 4, name: '跃进 Leap', multiplier: 1.5, expBase: 2.5, desc: '快速推进', masteryFactors: [0.24, 0.36, 0.48, 0.60] },
    { id: 5, name: '极速 Flash', multiplier: 2.0, expBase: 3.0, desc: '极限挑战', masteryFactors: [0.28, 0.42, 0.56, 0.70] }
];

type WrongAlgoType = 'cycle' | 'constant';
type Cycle2Pattern = '1,4' | '1,2';
type Cycle3Pattern = '1,2,5' | '1,1,4';
type OverflowStrategy = 'clamp' | 'cooling';
type RecoveryMode = 'reset' | 'halve' | 'decrement' | 'restore';

// Helper to calculate theoretical mastery for a given streak from 0
// E.g. Standard: Streak 1 = 20%, Streak 2 = 20 + (80*0.3) = 44%, etc.
const getTheoreticalMastery = (streak: number, factors: number[]) => {
    let m = 0;
    for (let i = 1; i <= streak; i++) {
        let f = factors[3];
        if (i === 1) f = factors[0];
        else if (i === 2) f = factors[1];
        else if (i === 3) f = factors[2];
        m = m + (100 - m) * f;
    }
    return m;
};

export const StudySession: React.FC<StudySessionProps> = ({ deck, onUpdateDeck, onExit, onReview, onTimeUpdate, onSessionComplete }) => {
  const [activePhraseId, setActivePhraseId] = useState<string | null>(deck.queue.length > 0 ? deck.queue[0] : null);
  const [cardState, setCardState] = useState<CardState>(CardState.HIDDEN);
  const [sessionStats, setSessionStats] = useState({ correct: 0, wrong: 0, half: 0 });
  const [sessionDuration, setSessionDuration] = useState(0);
  const [showQueue, setShowQueue] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [preEditState, setPreEditState] = useState<CardState>(CardState.HIDDEN);
  const [editForm, setEditForm] = useState({ english: '', chinese: '', note: '' });
  const [feedback, setFeedback] = useState<{ insertIndex: number; verdict: 'correct' | 'wrong' | 'half' | 'watch'; prevState: string; newState: string; overflow?: boolean } | null>(null);
  const [isAntiTouchActive, setIsAntiTouchActive] = useState(false);
  
  // Load initial settings only once
  const [initialSettings] = useState(() => {
      try {
          const saved = localStorage.getItem(ALGO_SETTINGS_KEY);
          return saved ? JSON.parse(saved) : {};
      } catch {
          return {};
      }
  });

  // Algorithm State - Correct
  const [correctAlgoGroup, setCorrectAlgoGroup] = useState(initialSettings.correctAlgoGroup ?? 3);
  
  // Algorithm State - Incorrect
  const [wrongAlgoType, setWrongAlgoType] = useState<WrongAlgoType>(initialSettings.wrongAlgoType ?? 'cycle');
  const [wrongCycleLen, setWrongCycleLen] = useState<2 | 3>(initialSettings.wrongCycleLen ?? 3);
  const [wrongCycle2Pat, setWrongCycle2Pat] = useState<Cycle2Pattern>(initialSettings.wrongCycle2Pat ?? '1,4');
  const [wrongCycle3Pat, setWrongCycle3Pat] = useState<Cycle3Pattern>(initialSettings.wrongCycle3Pat ?? '1,2,5');
  const [wrongMultiplier, setWrongMultiplier] = useState(initialSettings.wrongMultiplier ?? 2);
  const [wrongConstantVal, setWrongConstantVal] = useState(initialSettings.wrongConstantVal ?? 5);
  
  // Algorithm State - Recovery
  const [recoveryMode, setRecoveryMode] = useState<RecoveryMode>(initialSettings.recoveryMode ?? 'halve');
  
  // Algorithm State - Overflow
  const [overflowStrategy, setOverflowStrategy] = useState<OverflowStrategy>(initialSettings.overflowStrategy ?? 'cooling');
  
  // Algorithm State - Half Correct
  const [allowHalf, setAllowHalf] = useState<boolean>(initialSettings.allowHalf ?? false);

  // Time Limit State
  const [timeLimit, setTimeLimit] = useState<number>(initialSettings.timeLimit ?? 0);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  // Local state for Cooling Pool (Overflow)
  const [coolingPool, setCoolingPool] = useState<{id: string, wait: number}[]>(deck.coolingPool || []);

  const [showAlgoMenu, setShowAlgoMenu] = useState(false);

  const [startMastery] = useState(calculateMasteryValue(deck.phrases));
  const [masteryTrend, setMasteryTrend] = useState<{ t: number; v: number }[]>([{ t: 0, v: calculateMasteryValue(deck.phrases) }]);
  const [isFinished, setIsFinished] = useState(false);

  const timerRef = useRef<number | null>(null);
  const questionTimerRef = useRef<number | null>(null);

  // Persist settings whenever they change
  useEffect(() => {
      const settings = {
          correctAlgoGroup,
          wrongAlgoType,
          wrongCycleLen,
          wrongCycle2Pat,
          wrongCycle3Pat,
          wrongMultiplier,
          wrongConstantVal,
          overflowStrategy,
          allowHalf,
          recoveryMode,
          timeLimit
      };
      localStorage.setItem(ALGO_SETTINGS_KEY, JSON.stringify(settings));
  }, [correctAlgoGroup, wrongAlgoType, wrongCycleLen, wrongCycle2Pat, wrongCycle3Pat, wrongMultiplier, wrongConstantVal, overflowStrategy, allowHalf, recoveryMode, timeLimit]);

  useEffect(() => {
    if (isFinished) return;
    timerRef.current = window.setInterval(() => {
      onTimeUpdate(1);
      setSessionDuration(prev => prev + 1);
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [onTimeUpdate, isFinished]);

  // Question Timer Logic
  useEffect(() => {
      if (cardState === CardState.HIDDEN && timeLimit > 0 && !isEditing && !isFinished) {
          setTimeLeft(timeLimit);
          questionTimerRef.current = window.setInterval(() => {
              setTimeLeft(prev => {
                  if (prev <= 0.1) {
                      if (questionTimerRef.current) clearInterval(questionTimerRef.current);
                      // Timeout Logic
                      setIsAntiTouchActive(true);
                      setTimeout(() => setIsAntiTouchActive(false), 1000); // 1s protection
                      handleVerdict('wrong');
                      return 0;
                  }
                  return prev - 0.1;
              });
          }, 100);
      } else {
          if (questionTimerRef.current) clearInterval(questionTimerRef.current);
      }
      return () => { if (questionTimerRef.current) clearInterval(questionTimerRef.current); };
  }, [cardState, timeLimit, isEditing, isFinished]);

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
      const totalReviews = sessionStats.correct + sessionStats.wrong + sessionStats.half;
      if (totalReviews > 0) {
          setIsFinished(true);
      } else {
          onExit();
      }
  };

  const handleConfirmExit = () => {
      if (onSessionComplete) onSessionComplete(sessionDuration, sessionStats.correct, sessionStats.wrong, sessionStats.half, masteryTrend);
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

  const handleVerdict = useCallback((verdict: 'correct' | 'wrong' | 'half' | 'watch') => {
    if (!activePhraseId) return;
    
    // Clear timer if manually triggered
    if (questionTimerRef.current) clearInterval(questionTimerRef.current);

    const previousPhrase = deck.phrases.find(p => p.id === activePhraseId)!;
    const prevStateLabel = getPhraseLabel(previousPhrase);
    
    // Get active algo config and factors
    const activeAlgo = CORRECT_ALGO_GROUPS.find(g => g.id === correctAlgoGroup) || CORRECT_ALGO_GROUPS[2];
    const factors = activeAlgo.masteryFactors!;

    // --- Watch Logic (Key 4) ---
    if (verdict === 'watch') {
        const rawQueue = [...deck.queue];
        const currentIndexInRaw = rawQueue.indexOf(activePhraseId);
        if (currentIndexInRaw >= 0) rawQueue.splice(currentIndexInRaw, 1);
        
        let nextQueue = rawQueue.filter(id => !coolingPool.some(c => c.id === id));
        let nextCoolingPool = [...coolingPool];

        if (overflowStrategy === 'cooling') {
            nextCoolingPool.forEach(item => item.wait -= 1);
            const awaken = nextCoolingPool.filter(item => item.wait <= 0);
            nextCoolingPool = nextCoolingPool.filter(item => item.wait > 0);
            if (awaken.length > 0) nextQueue.push(...awaken.map(i => i.id));
        }

        const S = Math.max(1, Math.round(5 * activeAlgo.multiplier));
        
        let feedbackSteps = 0;
        let wasOverflow = false;

        if (overflowStrategy === 'cooling') {
            const L = nextQueue.length;
            if (S < L) {
                nextQueue.splice(S, 0, activePhraseId);
                feedbackSteps = S;
            } else {
                const waitTime = S - L;
                nextCoolingPool.push({ id: activePhraseId, wait: waitTime });
                wasOverflow = true;
                feedbackSteps = waitTime;
            }
        } else {
            const actualInsertIndex = Math.min(S, nextQueue.length);
            nextQueue.splice(actualInsertIndex, 0, activePhraseId);
            feedbackSteps = actualInsertIndex;
        }

        setCoolingPool(nextCoolingPool);
        const persistenceQueue = [...nextQueue, ...nextCoolingPool.map(c => c.id)];
        onUpdateDeck({ ...deck, queue: persistenceQueue, coolingPool: nextCoolingPool });

        setFeedback({ 
            insertIndex: feedbackSteps,
            verdict: 'watch',
            prevState: prevStateLabel, 
            newState: prevStateLabel, 
            overflow: wasOverflow 
        });
        setCardState(CardState.MISSED); 
        return;
    }

    let newConsecutiveCorrect = 0;
    let newConsecutiveWrong = 0;
    let newPreviousStreak = previousPhrase.previousStreak;
    let qualityMetric: { value: number, weight: number } | undefined;

    // --- 1. State Transitions ---
    if (verdict === 'correct') {
        if (previousPhrase.consecutiveWrong > 0) {
            // Recovery from Wrong
            const prevS = previousPhrase.previousStreak || 0;
            if (recoveryMode === 'reset') {
                newConsecutiveCorrect = 1;
            } else {
                let recovered = 1;
                if (recoveryMode === 'halve') recovered = Math.ceil(prevS / 2);
                else if (recoveryMode === 'decrement') recovered = Math.max(1, prevS - 1);
                else if (recoveryMode === 'restore') recovered = Math.max(1, prevS);
                newConsecutiveCorrect = Math.max(1, recovered);
            }
        } else {
            // Normal Progress or New
            const isNewPhrase = previousPhrase.consecutiveCorrect === 0 && previousPhrase.consecutiveWrong === 0;
            newConsecutiveCorrect = isNewPhrase ? 3 : previousPhrase.consecutiveCorrect + 1;
        }
        newConsecutiveWrong = 0;

        // Quality Metric
        const newStreak = newConsecutiveCorrect;
        const totalW = previousPhrase.totalWrong ?? (previousPhrase.totalReviews - (previousPhrase.consecutiveCorrect > 0 ? previousPhrase.consecutiveCorrect : 0));
        const safeTotalW = Math.max(0, totalW);
        const maxS = previousPhrase.maxConsecutiveCorrect || previousPhrase.consecutiveCorrect;
        if (newStreak > maxS && safeTotalW > 0) {
            const val = safeTotalW / Math.log2(newStreak + 1);
            const weight = Math.pow(0.7, Math.max(0, newStreak - 1));
            qualityMetric = { value: val, weight: weight };
        }

    } else if (verdict === 'wrong') {
        newConsecutiveWrong = previousPhrase.consecutiveWrong + 1;
        newConsecutiveCorrect = 0;
        if (previousPhrase.consecutiveCorrect > 0) newPreviousStreak = previousPhrase.consecutiveCorrect;
        else if (previousPhrase.consecutiveWrong === 0) newPreviousStreak = 0;

    } else if (verdict === 'half') {
        // Half Correct Logic
        if (previousPhrase.consecutiveCorrect > 0) {
            const currentS = previousPhrase.consecutiveCorrect;
            let recovered = 1;
            if (recoveryMode === 'reset') recovered = 1;
            else if (recoveryMode === 'halve') recovered = Math.ceil(currentS / 2);
            else if (recoveryMode === 'decrement') recovered = Math.max(1, currentS - 1);
            else if (recoveryMode === 'restore') recovered = currentS;
            
            newConsecutiveCorrect = Math.max(1, recovered);
            newConsecutiveWrong = 0;
        } else if (previousPhrase.consecutiveWrong > 0) {
            newConsecutiveWrong = previousPhrase.consecutiveWrong;
            newConsecutiveCorrect = 0;
        } else {
            newConsecutiveWrong = 1;
            newConsecutiveCorrect = 0;
            newPreviousStreak = 0;
        }
    }

    let newStateLabel = newConsecutiveCorrect > 0 ? `对${newConsecutiveCorrect}` : `错${newConsecutiveWrong}`;

    onReview(activePhraseId, verdict, qualityMetric);
    
    // --- Mastery Update (Revised) ---
    let currentMastery = previousPhrase.mastery ?? estimateMastery(previousPhrase.consecutiveCorrect, previousPhrase.consecutiveWrong);
    
    if (verdict === 'correct') {
        const wasWrongOrNew = previousPhrase.consecutiveWrong > 0 || (previousPhrase.consecutiveCorrect === 0 && previousPhrase.consecutiveWrong === 0);
        
        if (wasWrongOrNew) {
            currentMastery = getTheoreticalMastery(newConsecutiveCorrect, factors);
        } else {
            let factor = factors[3];
            if (newConsecutiveCorrect === 1) factor = factors[0];
            else if (newConsecutiveCorrect === 2) factor = factors[1];
            else if (newConsecutiveCorrect === 3) factor = factors[2];
            currentMastery = currentMastery + (100 - currentMastery) * factor;
        }

    } else if (verdict === 'half') {
        if (previousPhrase.consecutiveCorrect > 0) {
             currentMastery = getTheoreticalMastery(newConsecutiveCorrect, factors);
        } else {
             currentMastery = currentMastery * 0.5;
        }
    } else {
        const nextStreak = newConsecutiveWrong;
        if (nextStreak === 1) currentMastery = currentMastery * 0.5;
        else if (nextStreak === 2) currentMastery = currentMastery * 0.5; // Cumulative 0.25
        else currentMastery = 0;
    }

    const updatedPhrases = deck.phrases.map(p => {
      if (p.id === activePhraseId) {
        const currentTotalWrong = p.totalWrong ?? (p.totalReviews - (p.consecutiveCorrect > 0 ? p.consecutiveCorrect : 0));
        const safeCurrentTotalWrong = Math.max(0, currentTotalWrong);
        
        const errorContribution = verdict === 'correct' ? 0 : (verdict === 'half' ? 0.5 : 1);

        return { 
          ...p, 
          totalReviews: p.totalReviews + 1, 
          consecutiveCorrect: newConsecutiveCorrect, 
          consecutiveWrong: newConsecutiveWrong,
          totalWrong: safeCurrentTotalWrong + errorContribution, 
          maxConsecutiveCorrect: Math.max(p.maxConsecutiveCorrect || 0, newConsecutiveCorrect), 
          mastery: currentMastery, 
          lastReviewedAt: Date.now(),
          previousStreak: newPreviousStreak
        };
      }
      return p;
    });
    
    const updatedPhrase = updatedPhrases.find(p => p.id === activePhraseId)!;
    
    // --- 2. Queue Logic ---
    
    const rawQueue = [...deck.queue];
    const currentIndexInRaw = rawQueue.indexOf(activePhraseId);
    if (currentIndexInRaw >= 0) rawQueue.splice(currentIndexInRaw, 1);
    
    let nextQueue = rawQueue.filter(id => !coolingPool.some(c => c.id === id));
    let nextCoolingPool = [...coolingPool];

    if (overflowStrategy === 'cooling') {
        nextCoolingPool.forEach(item => item.wait -= 1);
        const awaken = nextCoolingPool.filter(item => item.wait <= 0);
        nextCoolingPool = nextCoolingPool.filter(item => item.wait > 0);
        if (awaken.length > 0) {
            nextQueue.push(...awaken.map(i => i.id));
        }
    }

    // 3. Calculate Base Offset S
    let baseOffset = 0;
    
    if (newConsecutiveCorrect > 0) {
        if (newConsecutiveCorrect > 1) {
            baseOffset = Math.pow(activeAlgo.expBase, newConsecutiveCorrect + 1);
        } else {
            let rawBase = 0;
            if (previousPhrase.consecutiveWrong > 0) {
                const wrongCount = previousPhrase.consecutiveWrong;
                if (wrongCount === 1) rawBase = 5;
                else if (wrongCount <= 3) rawBase = 4;
                else if (wrongCount <= 6) rawBase = 3;
                else rawBase = 2;
            } else {
                rawBase = 8;
            }
            baseOffset = rawBase * activeAlgo.multiplier;
        }
    } else {
        if (verdict === 'half') {
            if (wrongAlgoType === 'constant') {
                baseOffset = wrongConstantVal * 2;
            } else {
                 let maxVal = 1;
                if (wrongCycleLen === 2) {
                    const pat = wrongCycle2Pat === '1,4' ? [1, 4] : [1, 2];
                    maxVal = Math.max(...pat);
                } else {
                    const pat = wrongCycle3Pat === '1,2,5' ? [1, 2, 5] : [1, 1, 4];
                    maxVal = Math.max(...pat);
                }
                baseOffset = maxVal * wrongMultiplier;
            }
        } else {
            // Standard Wrong
            if (wrongAlgoType === 'constant') {
                baseOffset = wrongConstantVal;
            } else {
                const count = updatedPhrase.consecutiveWrong;
                const idx = (Math.max(1, count) - 1) % wrongCycleLen;
                let base = 1;
                if (wrongCycleLen === 2) {
                    const pat = wrongCycle2Pat === '1,4' ? [1, 4] : [1, 2];
                    base = pat[idx];
                } else {
                    const pat = wrongCycle3Pat === '1,2,5' ? [1, 2, 5] : [1, 1, 4];
                    base = pat[idx];
                }
                baseOffset = base * wrongMultiplier;
            }
        }
    }
    
    const perturbation = 0.9 + (Math.random() * 0.2); 
    const finalOffset = Math.round(baseOffset * perturbation);
    const S = Math.max(1, finalOffset);

    // 4. Current Phrase Placement
    let wasOverflow = false;
    let actualInsertIndex = 0;
    let feedbackSteps = 0; 

    if (overflowStrategy === 'cooling') {
        const L = nextQueue.length;
        if (S < L) {
            nextQueue.splice(S, 0, activePhraseId);
            actualInsertIndex = S;
            feedbackSteps = S;
        } else {
            const waitTime = S - L;
            nextCoolingPool.push({ id: activePhraseId, wait: waitTime });
            wasOverflow = true;
            actualInsertIndex = S; 
            feedbackSteps = waitTime;
        }
    } else {
        actualInsertIndex = Math.min(S, nextQueue.length);
        nextQueue.splice(actualInsertIndex, 0, activePhraseId);
        feedbackSteps = actualInsertIndex;
    }

    if (overflowStrategy === 'cooling' && nextQueue.length === 0 && nextCoolingPool.length > 0) {
        const minWait = Math.min(...nextCoolingPool.map(c => c.wait));
        if (minWait > 0) {
            nextCoolingPool.forEach(item => item.wait -= minWait);
        }
        const awaken = nextCoolingPool.filter(item => item.wait <= 0);
        nextCoolingPool = nextCoolingPool.filter(item => item.wait > 0);
        if (awaken.length > 0) {
            nextQueue.push(...awaken.map(i => i.id));
        }
    }

    setCoolingPool(nextCoolingPool);
    const persistenceQueue = [...nextQueue, ...nextCoolingPool.map(c => c.id)];

    onUpdateDeck({ ...deck, phrases: updatedPhrases, queue: persistenceQueue, coolingPool: nextCoolingPool });
    
    setSessionStats(prev => ({ 
        correct: prev.correct + (verdict === 'correct' ? 1 : 0), 
        wrong: prev.wrong + (verdict === 'wrong' ? 1 : 0),
        half: prev.half + (verdict === 'half' ? 1 : 0)
    }));
    
    setFeedback({ 
        insertIndex: feedbackSteps,
        verdict, 
        prevState: prevStateLabel, 
        newState: newStateLabel,
        overflow: wasOverflow 
    });
    setCardState(verdict === 'correct' ? CardState.REVIEWED : CardState.MISSED);

    const newMastery = calculateMasteryValue(updatedPhrases);
    setMasteryTrend(prev => [...prev, { t: sessionDuration, v: newMastery }]);

  }, [deck, activePhraseId, onReview, onUpdateDeck, sessionDuration, correctAlgoGroup, wrongAlgoType, wrongCycleLen, wrongCycle2Pat, wrongCycle3Pat, wrongMultiplier, wrongConstantVal, overflowStrategy, coolingPool, recoveryMode]);

  const handleNext = useCallback(() => {
    if (isAntiTouchActive) return; 
    const realQueue = deck.queue.filter(id => !coolingPool.some(c => c.id === id));
    if (realQueue.length > 0) setActivePhraseId(realQueue[0]);
    else if (deck.queue.length > 0) setActivePhraseId(deck.queue[0]); 
    else setActivePhraseId(null);

    setCardState(CardState.HIDDEN);
    setFeedback(null);
  }, [deck.queue, coolingPool, isAntiTouchActive]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditing || isFinished || isAntiTouchActive) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (cardState) {
        case CardState.HIDDEN:
          if (e.code === 'Space' || e.key === 'Enter' || e.key === '1') { e.preventDefault(); setCardState(CardState.VERIFYING); } 
          else if (e.key === '2') { 
              e.preventDefault(); 
              handleVerdict('wrong'); 
          }
          break;
        case CardState.VERIFYING:
          // 1: Correct, 2: Wrong, 3: Half, 4: Watch
          if (e.key === '1' || e.key === 'Enter' || e.key === 'ArrowLeft') { e.preventDefault(); handleVerdict('correct'); } 
          else if (e.key === '2' || e.key === 'ArrowRight') { e.preventDefault(); handleVerdict('wrong'); }
          else if (allowHalf && (e.key === '3' || e.key === 'ArrowDown')) { e.preventDefault(); handleVerdict('half'); }
          else if (e.key === '4' || e.key === 'ArrowUp') { e.preventDefault(); handleVerdict('watch'); }
          break;
        case CardState.REVIEWED:
        case CardState.MISSED:
          if (e.code === 'Space' || e.key === 'Enter' || e.key === '1' || e.key === '2' || (allowHalf && e.key === '3') || e.key === '4') { e.preventDefault(); handleNext(); }
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cardState, isEditing, handleVerdict, handleNext, isFinished, allowHalf, isAntiTouchActive]);

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
  const activeCorrectAlgo = CORRECT_ALGO_GROUPS.find(g => g.id === correctAlgoGroup);

  if (isFinished) {
      const endMastery = masteryTrend[masteryTrend.length - 1].v;
      const gain = endMastery - startMastery;
      const wrongConfigStr = wrongAlgoType === 'constant' 
          ? `Fixed: ${wrongConstantVal}` 
          : `Cycle-${wrongCycleLen} [${wrongCycleLen === 2 ? wrongCycle2Pat : wrongCycle3Pat}] x${wrongMultiplier}`;

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
                        <div className="text-2xl font-black text-slate-800">{sessionStats.correct + sessionStats.wrong + sessionStats.half} <span className="text-xs text-slate-400">词</span></div>
                        <div className="text-xs font-bold mt-1 flex justify-center gap-1.5">
                            <span className="text-emerald-500">{sessionStats.correct} 对</span>
                            <span className="text-slate-300">/</span>
                            <span className="text-amber-500">{sessionStats.half} 半</span>
                            <span className="text-slate-300">/</span>
                            <span className="text-rose-500">{sessionStats.wrong} 错</span>
                        </div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                        <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">专注时长</div>
                        <div className="text-2xl font-black text-slate-800">{formatFullTime(sessionDuration)}</div>
                    </div>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col gap-1.5">
                    <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">使用的策略 Algorithm</div>
                    <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-500">正确 Correct:</span>
                        <span className="font-black text-emerald-600">{activeCorrectAlgo?.name} <span className="text-[9px] font-normal opacity-60">x{activeCorrectAlgo?.multiplier}</span></span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-500">错误 Wrong:</span>
                        <span className="font-black text-rose-500">{wrongConfigStr}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-500">恢复 Recovery:</span>
                        <span className="font-black text-indigo-500 uppercase">{recoveryMode}</span>
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

  const isEnToCn = deck.studyMode === 'EN_CN';
  const questionText = isEnToCn ? currentPhrase.english : currentPhrase.chinese;
  const answerText = isEnToCn ? currentPhrase.chinese : currentPhrase.english;

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
                        {sessionStats.half > 0 && <><span className="text-slate-300 mx-0.5">/</span><span className="text-amber-500">{sessionStats.half}</span></>}
                        <span className="text-slate-300 mx-1">/</span>
                        <span>{sessionStats.correct + sessionStats.wrong + sessionStats.half}</span>
                     </span>
                 </div>
            </div>
            <div className="flex gap-1 shrink-0 items-center">
                 <div className="relative">
                    <button onClick={() => setShowAlgoMenu(!showAlgoMenu)} className={`p-2 rounded-lg transition-colors flex items-center gap-1 ${showAlgoMenu ? 'text-indigo-600 bg-indigo-50' : 'text-slate-300 hover:text-slate-500'}`}>
                        <Settings2 className="w-5 h-5"/>
                    </button>
                    {showAlgoMenu && (
                        <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50 animate-in fade-in zoom-in-95 max-h-[80vh] overflow-y-auto">
                            <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Spacing Algorithms</span>
                                <button onClick={()=>setShowAlgoMenu(false)}><X className="w-3 h-3 text-slate-400"/></button>
                            </div>
                            
                            <div className="p-4 border-b border-slate-100">
                                <div className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Timer className="w-3 h-3"/> Question Timer</div>
                                <div className="flex items-center gap-3">
                                    <input type="number" min="0" value={timeLimit} onChange={(e) => setTimeLimit(Math.max(0, parseInt(e.target.value) || 0))} className="w-16 p-1.5 text-center font-black border-2 border-slate-200 rounded-lg focus:border-indigo-500 outline-none text-slate-700 text-sm" />
                                    <div className="text-[10px] text-slate-400 font-medium">Seconds (0 = No Limit)</div>
                                </div>
                                <p className="text-[9px] text-slate-400 mt-2">Timeout forces "Wrong" verdict and shows answer.</p>
                            </div>

                            <div className="p-4 border-b border-slate-100">
                                <div className="text-xs font-black text-emerald-600 uppercase tracking-widest mb-3 flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3"/> Correct</div>
                                <div className="space-y-1">
                                    {CORRECT_ALGO_GROUPS.map(g => (
                                        <button key={g.id} onClick={() => setCorrectAlgoGroup(g.id)} className={`w-full text-left px-3 py-2 text-xs font-bold flex items-center justify-between rounded-lg transition-all ${correctAlgoGroup === g.id ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'text-slate-600 hover:bg-slate-50 border border-transparent'}`}>
                                            <div>
                                                <div className="flex items-center gap-1.5">
                                                    {g.name} 
                                                    {correctAlgoGroup === g.id && <span className="text-[10px] font-normal opacity-60">x{g.multiplier}</span>}
                                                </div>
                                                <div className="text-[9px] opacity-60 font-normal">{g.desc}</div>
                                            </div>
                                            {correctAlgoGroup === g.id && <div className="w-2 h-2 rounded-full bg-emerald-500"></div>}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                                <div className="text-xs font-black text-rose-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><XCircle className="w-3 h-3"/> Wrong</div>
                                <div className="flex bg-white p-1 rounded-lg border border-slate-200 mb-3 shadow-sm">
                                    <button onClick={()=>setWrongAlgoType('cycle')} className={`flex-1 py-1.5 text-[10px] font-black rounded uppercase transition-all ${wrongAlgoType==='cycle'?'bg-rose-50 text-rose-600':'text-slate-400'}`}>Cycle (周期)</button>
                                    <button onClick={()=>setWrongAlgoType('constant')} className={`flex-1 py-1.5 text-[10px] font-black rounded uppercase transition-all ${wrongAlgoType==='constant'?'bg-rose-50 text-rose-600':'text-slate-400'}`}>Fixed (连续)</button>
                                </div>

                                {wrongAlgoType === 'cycle' ? (
                                    <div className="space-y-3 animate-in fade-in">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-slate-500 w-12">Period:</span>
                                            <div className="flex gap-1 flex-1">
                                                <button onClick={()=>setWrongCycleLen(2)} className={`flex-1 py-1 text-[10px] font-bold rounded border ${wrongCycleLen===2 ? 'bg-white border-rose-200 text-rose-600 shadow-sm' : 'border-transparent text-slate-400 hover:bg-slate-100'}`}>2-Step</button>
                                                <button onClick={()=>setWrongCycleLen(3)} className={`flex-1 py-1 text-[10px] font-bold rounded border ${wrongCycleLen===3 ? 'bg-white border-rose-200 text-rose-600 shadow-sm' : 'border-transparent text-slate-400 hover:bg-slate-100'}`}>3-Step</button>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-slate-500 w-12">Base:</span>
                                            <div className="flex gap-1 flex-1">
                                                {wrongCycleLen === 2 ? (
                                                    <>
                                                        <button onClick={()=>setWrongCycle2Pat('1,4')} className={`flex-1 py-1 text-[10px] font-bold rounded border ${wrongCycle2Pat==='1,4' ? 'bg-white border-rose-200 text-rose-600 shadow-sm' : 'border-transparent text-slate-400 hover:bg-slate-100'}`}>1, 4</button>
                                                        <button onClick={()=>setWrongCycle2Pat('1,2')} className={`flex-1 py-1 text-[10px] font-bold rounded border ${wrongCycle2Pat==='1,2' ? 'bg-white border-rose-200 text-rose-600 shadow-sm' : 'border-transparent text-slate-400 hover:bg-slate-100'}`}>1, 2</button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button onClick={()=>setWrongCycle3Pat('1,2,5')} className={`flex-1 py-1 text-[10px] font-bold rounded border ${wrongCycle3Pat==='1,2,5' ? 'bg-white border-rose-200 text-rose-600 shadow-sm' : 'border-transparent text-slate-400 hover:bg-slate-100'}`}>1, 2, 5</button>
                                                        <button onClick={()=>setWrongCycle3Pat('1,1,4')} className={`flex-1 py-1 text-[10px] font-bold rounded border ${wrongCycle3Pat==='1,1,4' ? 'bg-white border-rose-200 text-rose-600 shadow-sm' : 'border-transparent text-slate-400 hover:bg-slate-100'}`}>1, 1, 4</button>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-slate-500 w-12">Mult:</span>
                                            <div className="flex-1 flex items-center gap-2 bg-white px-2 py-1 rounded border border-slate-200">
                                                <X className="w-3 h-3 text-slate-400"/>
                                                <input type="number" step="0.1" min="0.1" max="100" value={wrongMultiplier} onChange={(e)=>setWrongMultiplier(Math.max(0.1, Math.min(100, parseFloat(e.target.value)||1)))} className="w-full text-xs font-black text-rose-600 outline-none" />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3 animate-in fade-in">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-slate-500 w-12">Offset:</span>
                                            <div className="flex-1 flex items-center gap-2 bg-white px-2 py-1 rounded border border-slate-200">
                                                <RefreshCw className="w-3 h-3 text-slate-400"/>
                                                <input type="number" min="1" max="100" value={wrongConstantVal} onChange={(e)=>setWrongConstantVal(Math.max(1, Math.min(100, parseInt(e.target.value)||1)))} className="w-full text-xs font-black text-rose-600 outline-none" />
                                            </div>
                                        </div>
                                        <p className="text-[9px] text-slate-400 leading-relaxed px-1">Always move card back by this fixed amount when answered incorrectly.</p>
                                    </div>
                                )}
                            </div>

                            <div className="p-4 border-b border-slate-100">
                                <div className="text-xs font-black text-indigo-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Activity className="w-3 h-3"/> Streak Recovery</div>
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={()=>setRecoveryMode('reset')} className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all ${recoveryMode==='reset'?'bg-indigo-50 border-indigo-200 text-indigo-700':'border-slate-100 text-slate-400 hover:bg-slate-50'}`}>
                                        <RotateCcw className="w-4 h-4 mb-1"/>
                                        <span className="text-[10px] font-black uppercase">归零 Reset</span>
                                    </button>
                                    <button onClick={()=>setRecoveryMode('halve')} className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all ${recoveryMode==='halve'?'bg-indigo-50 border-indigo-200 text-indigo-700':'border-slate-100 text-slate-400 hover:bg-slate-50'}`}>
                                        <Divide className="w-4 h-4 mb-1"/>
                                        <span className="text-[10px] font-black uppercase">减半 Halve</span>
                                    </button>
                                    <button onClick={()=>setRecoveryMode('decrement')} className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all ${recoveryMode==='decrement'?'bg-indigo-50 border-indigo-200 text-indigo-700':'border-slate-100 text-slate-400 hover:bg-slate-50'}`}>
                                        <MoveDown className="w-4 h-4 mb-1"/>
                                        <span className="text-[10px] font-black uppercase">递减 Dec-1</span>
                                    </button>
                                    <button onClick={()=>setRecoveryMode('restore')} className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all ${recoveryMode==='restore'?'bg-indigo-50 border-indigo-200 text-indigo-700':'border-slate-100 text-slate-400 hover:bg-slate-50'}`}>
                                        <Undo2 className="w-4 h-4 mb-1"/>
                                        <span className="text-[10px] font-black uppercase">恢复 Restore</span>
                                    </button>
                                </div>
                                <p className="text-[9px] text-slate-400 leading-relaxed px-1 mt-2">
                                    {recoveryMode === 'reset' && "Hardcore: Wrong once, correct starts at 1."}
                                    {recoveryMode === 'halve' && "Standard: Wrong once, correct recovers to 50% streak."}
                                    {recoveryMode === 'decrement' && "Lenient: Wrong once, correct recovers to streak - 1."}
                                    {recoveryMode === 'restore' && "Merciful: Wrong once, correct restores full streak."}
                                </p>
                            </div>

                            <div className="p-4 bg-amber-50/30 border-b border-slate-100">
                                <div className="text-xs font-black text-amber-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><AlertCircle className="w-3 h-3"/> Half Correct</div>
                                <div className="flex bg-white p-1 rounded-lg border border-slate-200 mb-3 shadow-sm">
                                    <button onClick={()=>setAllowHalf(false)} className={`flex-1 py-1.5 text-[10px] font-black rounded uppercase transition-all ${!allowHalf?'bg-slate-100 text-slate-600':'text-slate-400'}`}>Disabled</button>
                                    <button onClick={()=>setAllowHalf(true)} className={`flex-1 py-1.5 text-[10px] font-black rounded uppercase transition-all ${allowHalf?'bg-amber-50 text-amber-600':'text-slate-400'}`}>Enabled</button>
                                </div>
                                <p className="text-[9px] text-slate-400 leading-relaxed px-1">
                                    Allow a "Half Correct" option (Key 3) for minor mistakes. New words become Wrong 1; Correct streaks suffer recovery penalty.
                                </p>
                            </div>

                            <div className="p-4 bg-indigo-50/30">
                                <div className="text-xs font-black text-indigo-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Waves className="w-3 h-3"/> Overflow Strategy</div>
                                <div className="flex bg-white p-1 rounded-lg border border-slate-200 mb-3 shadow-sm">
                                    <button onClick={()=>setOverflowStrategy('clamp')} className={`flex-1 py-1.5 text-[10px] font-black rounded uppercase transition-all ${overflowStrategy==='clamp'?'bg-indigo-50 text-indigo-600':'text-slate-400'}`}>Clamp</button>
                                    <button onClick={()=>setOverflowStrategy('cooling')} className={`flex-1 py-1.5 text-[10px] font-black rounded uppercase transition-all ${overflowStrategy==='cooling'?'bg-indigo-50 text-indigo-600':'text-slate-400'}`}>Cooling</button>
                                </div>
                                <p className="text-[9px] text-slate-400 leading-relaxed px-1">
                                    {overflowStrategy === 'clamp' ? 'Limits pushback to current queue length. Simple and predictable.' : 'Uses a separate "Cooling Pool" for cards pushed beyond current queue length. Cards return when ready.'}
                                </p>
                            </div>
                        </div>
                    )}
                 </div>
                 <button onClick={()=>setShowStats(!showStats)} className={`p-2 rounded-lg transition-colors ${showStats ? 'text-indigo-600 bg-indigo-50' : 'text-slate-300 hover:text-slate-500'}`}><BarChart2 className="w-5 h-5"/></button>
                 <button onClick={()=>setShowQueue(!showQueue)} className={`p-2 rounded-lg transition-colors relative ${showQueue ? 'text-indigo-600 bg-indigo-50' : 'text-slate-300 hover:text-slate-500'}`}>
                     <ListOrdered className="w-5 h-5"/>
                     {coolingPool.length > 0 && <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-sky-400 rounded-full"></div>}
                 </button>
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
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col items-center w-full relative">
                        <div className="w-full flex flex-col items-center text-center pt-6 mb-2">
                           <h1 className="text-2xl sm:text-3xl font-black text-slate-800 leading-snug break-words max-w-full">
                               {renderFormattedText(questionText)}
                           </h1>
                           {cardState === CardState.HIDDEN && timeLimit > 0 && (
                               <div className="mt-4 flex flex-col items-center animate-in fade-in">
                                   <div className="text-xs font-black text-indigo-400 tabular-nums mb-1">{timeLeft.toFixed(1)}s</div>
                                   <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                       <div 
                                           className="h-full bg-indigo-400 transition-all duration-100 ease-linear"
                                           style={{ width: `${(timeLeft / timeLimit) * 100}%` }}
                                       ></div>
                                   </div>
                               </div>
                           )}
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
                                <div className="text-center py-1 px-2 rounded-xl w-full">
                                    <p className="text-2xl font-black text-indigo-600 leading-snug break-words max-w-full inline-block">
                                        {renderFormattedText(answerText)}
                                    </p>
                                </div>
                                {feedback && (
                                    <div className="flex flex-col items-center gap-1 animate-in zoom-in-95 pt-2 border-t border-slate-50">
                                        <div className={`text-lg font-black mt-1 flex items-center gap-2 ${feedback.verdict === 'correct' ? 'text-emerald-500' : feedback.verdict === 'half' ? 'text-amber-500' : feedback.verdict === 'watch' ? 'text-slate-400' : 'text-rose-500'}`}>
                                            {feedback.overflow && <Waves className="w-4 h-4 text-sky-400 animate-pulse" />}
                                            {feedback.verdict === 'watch' ? '观望中...' : ''}
                                            {feedback.overflow ? `冷却 ${feedback.insertIndex} 步` : `后移 ${feedback.insertIndex} 位`}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            {feedback.verdict === 'correct' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : feedback.verdict === 'half' ? <AlertCircle className="w-3.5 h-3.5 text-amber-500" /> : feedback.verdict === 'watch' ? <Eye className="w-3.5 h-3.5 text-slate-400"/> : <XCircle className="w-3.5 h-3.5 text-rose-500" />}
                                            <span className="text-sm font-bold text-slate-400">{feedback.prevState}</span>
                                            <span className="text-slate-300">→</span>
                                            <span className="text-sm font-bold text-slate-600">{feedback.newState}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        {/* Hidden input blocker for anti-touch */}
                        {isAntiTouchActive && <div className="absolute inset-0 z-20 cursor-not-allowed"></div>}
                    </div>
                    <div className="p-4 bg-slate-50 border-t border-slate-100 shrink-0">
                         {cardState === CardState.HIDDEN ? (
                             <div className="grid grid-cols-2 gap-3">
                                 <Button onClick={()=>setCardState(CardState.VERIFYING)} className="py-3.5 text-lg font-black rounded-xl shadow-lg shadow-indigo-200/50 bg-indigo-600 hover:bg-indigo-700 border-0 text-white">记得 (1)</Button>
                                 <Button onClick={()=>{if(allowHalf) setCardState(CardState.VERIFYING); else handleVerdict('wrong');}} className="py-3.5 text-lg font-black rounded-xl bg-white border-2 border-slate-200 text-slate-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 shadow-sm">忘了 (2)</Button>
                             </div>
                         ) : cardState === CardState.VERIFYING ? (
                             <div className={`grid ${allowHalf ? 'grid-cols-4' : 'grid-cols-3'} gap-2`}>
                                <button onClick={()=>handleVerdict('correct')} className="flex flex-col items-center justify-center py-2 bg-white border-2 border-slate-100 rounded-xl hover:border-emerald-400 hover:bg-emerald-50 active:scale-95 transition-all shadow-sm group relative overflow-hidden">
                                    <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <CheckCircle2 className="w-5 h-5 text-emerald-500 mb-0.5 group-hover:scale-110 transition-transform relative z-10"/>
                                    <span className="text-xs font-black text-slate-600 group-hover:text-emerald-700 relative z-10">正确 (1)</span>
                                </button>
                                <button onClick={()=>handleVerdict('watch')} className="flex flex-col items-center justify-center py-2 bg-white border-2 border-slate-100 rounded-xl hover:border-slate-400 hover:bg-slate-50 active:scale-95 transition-all shadow-sm group relative overflow-hidden">
                                    <div className="absolute inset-0 bg-slate-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <Eye className="w-5 h-5 text-slate-400 mb-0.5 group-hover:scale-110 transition-transform relative z-10"/>
                                    <span className="text-xs font-black text-slate-600 group-hover:text-slate-800 relative z-10">观望 (4)</span>
                                </button>
                                {allowHalf && (
                                    <button onClick={()=>handleVerdict('half')} className="flex flex-col items-center justify-center py-2 bg-white border-2 border-slate-100 rounded-xl hover:border-amber-400 hover:bg-amber-50 active:scale-95 transition-all shadow-sm group relative overflow-hidden">
                                        <div className="absolute inset-0 bg-amber-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                        <AlertCircle className="w-5 h-5 text-amber-500 mb-0.5 group-hover:scale-110 transition-transform relative z-10"/>
                                        <span className="text-xs font-black text-slate-600 group-hover:text-amber-700 relative z-10">半对 (3)</span>
                                    </button>
                                )}
                                <button onClick={()=>handleVerdict('wrong')} className="flex flex-col items-center justify-center py-2 bg-white border-2 border-slate-100 rounded-xl hover:border-rose-400 hover:bg-rose-50 active:scale-95 transition-all shadow-sm group relative overflow-hidden">
                                    <div className="absolute inset-0 bg-rose-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <XCircle className="w-5 h-5 text-rose-500 mb-0.5 group-hover:scale-110 transition-transform relative z-10"/>
                                    <span className="text-xs font-black text-slate-600 group-hover:text-rose-700 relative z-10">错误 (2)</span>
                                </button>
                             </div>
                         ) : (
                             <Button onClick={handleNext} disabled={isAntiTouchActive} fullWidth className={`py-3.5 text-lg font-black rounded-xl shadow-lg ${feedback?.verdict === 'correct' ? 'bg-indigo-600 shadow-indigo-200/50 hover:bg-indigo-700' : 'bg-slate-800 shadow-slate-300 hover:bg-slate-900'} ${isAntiTouchActive ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                 {feedback?.verdict === 'correct' ? '复习下一个' : '继续努力'} <span className="opacity-50 text-sm ml-2 font-normal">(Space/1/2/4)</span> <ArrowRight className="w-5 h-5 ml-2"/>
                             </Button>
                         )}
                    </div>
                 </>
             )}
          </div>
        </div>
        
        {/* ... (rest of the file remains same) ... */}
        <div className={`absolute top-0 right-0 h-full w-[320px] bg-white border-l border-slate-100 shadow-2xl transition-transform duration-300 z-[70] flex flex-col ${showQueue ? 'translate-x-0' : 'translate-x-full'}`}>
             <div className="p-4 flex justify-between items-center bg-white border-b border-slate-50 shrink-0">
                 <h3 className="font-bold text-slate-800 flex items-center gap-2"><ListOrdered className="w-5 h-5"/> 复习队列</h3>
                 <button onClick={()=>setShowQueue(false)} className="p-1 hover:bg-slate-100 rounded-full"><X className="w-5 h-5 text-slate-400"/></button>
             </div>
             
             <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                 {deck.queue.filter(id => !coolingPool.some(c => c.id === id)).map((id, idx) => {
                     const p = deck.phrases.find(item => item.id === id);
                     if (!p) return null;
                     const isCurrent = id === activePhraseId;
                     const label = getPhraseLabel(p);
                     const badgeColor = getBadgeColor(p.consecutiveCorrect, p.consecutiveWrong);
                     
                     return (
                         <div key={id} className="flex items-center justify-between text-sm py-1.5 group">
                             <div className="flex items-center gap-3 min-w-0 flex-1">
                                 <span className={`font-bold text-xs w-5 text-center shrink-0 ${isCurrent ? 'text-indigo-600' : 'text-slate-300'}`}>{idx+1}</span>
                                 <div className={`truncate font-bold text-sm ${isCurrent ? 'text-indigo-600' : 'text-slate-700 group-hover:text-slate-900'}`}>{p.chinese}</div>
                             </div>
                             <div className="px-1.5 py-0.5 rounded text-[9px] font-black text-white shrink-0 ml-2" style={{backgroundColor: badgeColor}}>{label}</div>
                         </div>
                     )
                 })}

                 {overflowStrategy === 'cooling' && coolingPool.length > 0 && (
                    <div className="relative py-4">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-sky-100"></div></div>
                        <div className="relative flex justify-center"><span className="bg-white px-3 text-[9px] font-black text-sky-400 uppercase tracking-widest flex items-center gap-1"><ThermometerSnowflake className="w-3 h-3"/> Cooling Pool</span></div>
                    </div>
                 )}

                 {overflowStrategy === 'cooling' && [...coolingPool].sort((a,b)=>a.wait-b.wait).map((item, idx) => {
                    const p = deck.phrases.find(p => p.id === item.id);
                    if (!p) return null;
                    const label = getPhraseLabel(p);
                    const badgeColor = getBadgeColor(p.consecutiveCorrect, p.consecutiveWrong);
                    
                    return (
                        <div key={item.id} className="flex items-center justify-between text-sm py-1.5 opacity-70 hover:opacity-100 transition-opacity">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                <span className="font-black text-xs w-5 text-center shrink-0 text-sky-400 tabular-nums">{item.wait}</span>
                                <div className="truncate font-bold text-sm text-slate-500">{p.chinese}</div>
                            </div>
                            <div className="px-1.5 py-0.5 rounded text-[9px] font-black text-white shrink-0 ml-2 grayscale-[0.3]" style={{backgroundColor: badgeColor}}>{label}</div>
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
