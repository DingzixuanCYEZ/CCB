import React, { useState } from 'react';
import { DailyStats, Deck, ActivityLog, DeckSubject, SubjectStats, PersistenceData } from '../types';
import { X, Clock, BrainCircuit, Target, BookOpen, TrendingUp, GraduationCap, Zap, FileText, CheckCircle2, XCircle, Languages, Award, Swords, ScrollText, Info, Calendar, Flower, Hash, Flame } from 'lucide-react';
import { Button } from './Button';
import { getDynamicColor, calculateMasteryValue, getRealmInfo, REALM_CONFIGS, CHINESE_TITLES, formatFullTime, SPIRIT_ROOT_QUANTITY_LEVELS, SPIRIT_ROOT_QUALITY_LEVELS, getSpiritRootQuantity, getSpiritRootQuality, countWords, getPersistenceGrade, PERSISTENCE_GRADES } from '../App';

interface DailyReportProps {
  stats: DailyStats;
  globalStats?: SubjectStats; 
  decks: Deck[];
  onClose: () => void;
  persistence?: { English: PersistenceData; Chinese: PersistenceData };
}

const ALGO_SETTINGS_KEY = 'recallflow_algo_settings_v1';

const getMasteryThreshold = () => {
    try {
        const settings = JSON.parse(localStorage.getItem(ALGO_SETTINGS_KEY) || '{}');
        const group = settings.correctAlgoGroup ?? 3;
        if (group === 1) return 5; // Dense
        if (group === 2) return 4; // Solid
        if (group === 5) return 2; // Flash
        return 3; // Standard (3) & Leap (4)
    } catch { return 3; }
};

export const DailyReport: React.FC<DailyReportProps> = ({ stats, globalStats, decks, onClose, persistence }) => {
  const [realmDetails, setRealmDetails] = useState<DeckSubject | null>(null);
  const [spiritRootDetails, setSpiritRootDetails] = useState<{ type: 'quantity' | 'quality', subject: DeckSubject } | null>(null);
  const [persistenceDetails, setPersistenceDetails] = useState<DeckSubject | null>(null);

  const accuracy = stats.reviewCount > 0 ? (stats.correctCount / stats.reviewCount) * 100 : 0;
  const activities = stats.activities || [];
  
  const studyActivities = activities.filter(a => a.mode === 'STUDY').sort((a, b) => b.timestamp - a.timestamp);
  const examActivities = activities.filter(a => a.mode === 'EXAM').sort((a, b) => b.timestamp - a.timestamp);

  const calculateMetrics = (subject: DeckSubject) => {
    const relevantActs = activities.filter(a => { const d = decks.find(deck => deck.id === a.deckId); return (d?.subject || a.deckSubject) === subject; });
    const total = relevantActs.reduce((sum, a) => sum + a.count, 0);
    const correct = relevantActs.reduce((sum, a) => sum + a.correct, 0);
    const time = relevantActs.reduce((sum, a) => sum + a.durationSeconds, 0);
    const wrong = total - correct;
    const acc = total > 0 ? (correct / total) : 0;
    const efficiency = total > 0 ? (correct - wrong) / total : 0;
    const netChange = correct - wrong;
    return { total, correct, wrong, acc, efficiency, netChange, time };
  };

  const enMetrics = calculateMetrics('English');
  const cnMetrics = calculateMetrics('Chinese');

  const getRecentMasteredDecks = (subject: DeckSubject) => {
      const threshold = getMasteryThreshold();
      const masteredDecks = decks.filter(d => {
          if (d.subject !== subject) return false;
          if (!d.stats?.firstMastery90Seconds) return false;
          // Strict Exclusion: Check statsOptions directly
          if (d.statsOptions?.includeInQuantity === false) return false;
          
          if (!d.phrases.every(p => p.consecutiveCorrect >= threshold)) return false;

          return true;
      });
      return masteredDecks.sort((a, b) => { const tA = a.sessionHistory?.[0]?.timestamp || 0; const tB = b.sessionHistory?.[0]?.timestamp || 0; return tB - tA; }).slice(0, 10);
  };

  const getAllQualitySamples = (subject: DeckSubject) => {
      const history = (globalStats?.qualityHistory || []) as any[];
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return history.filter(h => {
          if (h.value <= 0) return false; // Filter valid values only
          if (h.timestamp <= sevenDaysAgo) return false;
          if (h.subject !== subject) return false;
          if (h.deckId) {
              const deck = decks.find(d => d.id === h.deckId);
              if (deck?.statsOptions?.includeInQuality === false) return false;
          }
          return true;
      });
  };

  // Helper to calculate Quantity Metric for a Single Deck
  const getDeckQuantityMetrics = (d: Deck, subject: DeckSubject) => {
      let totalDeckWeight = 0; 
      let perfectDeckWeight = 0;
      
      d.phrases.forEach(p => {
          const w = subject === 'English' ? countWords(p.english) : 1;
          totalDeckWeight += w;

          const historicWrong = p.totalWrong ?? (p.totalReviews - (p.consecutiveCorrect > 0 ? p.consecutiveCorrect : 0));
          if (historicWrong === 0 && p.consecutiveWrong === 0 && p.totalReviews > 0) {
              perfectDeckWeight += w;
          }
      });
      
      const effectiveCount = Math.max(0.1, totalDeckWeight - (0.5 * perfectDeckWeight));
      const val = (d.stats?.firstMastery90Seconds || 0) / effectiveCount;
      
      return { totalDeckWeight, perfectDeckWeight, effectiveCount, val };
  };

  const calculateSpiritRootQuantityVal = (subject: DeckSubject) => {
      const recent10 = getRecentMasteredDecks(subject);
      if (recent10.length === 0) return 0;
      
      let totalX = 0;
      recent10.forEach(d => { 
          const { val } = getDeckQuantityMetrics(d, subject);
          totalX += val;
      });
      
      return totalX / recent10.length;
  };

  const getWeightedQualityVal = (subject: DeckSubject) => {
      const samples = getAllQualitySamples(subject);
      if (samples.length === 0) return null; // Return null if no data
      
      let totalWeightedValue = 0;
      let totalWeight = 0;

      samples.forEach(h => {
          const w = h.weight !== undefined ? h.weight : 1; 
          totalWeightedValue += h.value * w;
          totalWeight += w;
      });
      
      return totalWeight > 0 ? totalWeightedValue / totalWeight : 0;
  };

  // Calculate Persistence Scores
  const calculatePersistence = (subject: DeckSubject) => {
      const pData = persistence?.[subject] || { baseScore: 0, lastDate: '', prevDayFinalScore: 0 };
      const metrics = subject === 'English' ? enMetrics : cnMetrics;
      const score = pData.baseScore + 100 * Math.log(1 + metrics.total / 100);
      const { grade, color, progress, next } = getPersistenceGrade(score);
      // Change vs Yesterday (Prev Final Score)
      // Note: If day changed, baseScore is 0.98 * PrevFinal. So Change starts at negative.
      const diff = score - pData.prevDayFinalScore;
      
      return { score, grade, color, progress, next, diff, baseScore: pData.baseScore, totalReviews: metrics.total };
  };

  const enQuantityVal = calculateSpiritRootQuantityVal('English');
  const cnQuantityVal = calculateSpiritRootQuantityVal('Chinese');
  const enQualityVal = getWeightedQualityVal('English');
  const cnQualityVal = getWeightedQualityVal('Chinese');

  const enQuantity = enQuantityVal ? getSpiritRootQuantity(enQuantityVal, 'English') : { full: '未觉醒', fullEn: 'Unawakened', color: 'text-slate-400' };
  const cnQuantity = cnQuantityVal ? getSpiritRootQuantity(cnQuantityVal, 'Chinese') : { full: '未觉醒', fullEn: 'Unawakened', color: 'text-slate-400' };
  const enQuality = enQualityVal !== null ? getSpiritRootQuality(enQualityVal) : { full: '未觉醒', fullEn: 'Unawakened', color: 'text-slate-400' };
  const cnQuality = cnQualityVal !== null ? getSpiritRootQuality(cnQualityVal) : { full: '未觉醒', fullEn: 'Unawakened', color: 'text-slate-400' };

  const englishRealm = getRealmInfo(globalStats?.English || 0, 'English');
  const chineseRealm = getRealmInfo(globalStats?.Chinese || 0, 'Chinese');

  const enPersistence = calculatePersistence('English');
  const cnPersistence = calculatePersistence('Chinese');

  const renderActivityRow = (activity: ActivityLog) => {
    // ... (rest of implementation remains same)
    const relatedDeck = decks.find(d => d.id === activity.deckId);
    const currentMastery = relatedDeck ? calculateMasteryValue(relatedDeck.phrases) : 0;
    const acc = activity.count > 0 ? (activity.correct / activity.count) * 100 : 0;
    const subject = relatedDeck?.subject || activity.deckSubject || 'English';
    const isChinese = subject === 'Chinese';
    
    // Check if included in quantity (defaults to true if undefined)
    const isIncludedInQuantity = relatedDeck?.statsOptions?.includeInQuantity !== false;

    let displayContentType = '';
    if (!isIncludedInQuantity) {
        displayContentType = isChinese ? '其他' : '单词';
    } else {
        const rawType = relatedDeck?.contentType || (isChinese ? 'Word' : 'PhraseSentence');
        if (isChinese) {
            displayContentType = rawType === 'Word' ? '文言实词' : '其他';
        } else {
            displayContentType = rawType === 'Word' ? '单词' : '词组/句子';
        }
    }
    
    const studyMode = relatedDeck?.studyMode === 'EN_CN' ? '英→中' : '中→英';

    return (
      <div key={`${activity.deckId}-${activity.mode}-${activity.timestamp}`} className="group hover:bg-slate-50 px-4 py-2.5 transition-colors border-b border-slate-50 last:border-0 flex flex-col gap-1">
        <div className="flex justify-between items-center min-w-0">
            <div className="flex flex-wrap items-center gap-2 min-w-0 overflow-hidden">
               <div className="font-black text-slate-800 text-xs truncate leading-tight max-w-[160px]">{activity.deckName}</div>
               <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase border shrink-0 ${isChinese ? 'text-emerald-500 border-emerald-100 bg-emerald-50/50' : 'text-indigo-500 border-indigo-100 bg-indigo-50/50'}`}>{isChinese ? '语文' : '英语'}</span>
               <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 shrink-0">{displayContentType}</span>
               {!isChinese && (<span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 shrink-0">{studyMode}</span>)}
            </div>
            <div className="text-[10px] font-black shrink-0 whitespace-nowrap ml-2" style={{ color: getDynamicColor(acc) }}>
                正确率 {acc.toFixed(2)}%
            </div>
        </div>
        <div className="flex items-center gap-x-3 text-[10px] text-slate-400 font-bold whitespace-nowrap overflow-x-auto no-scrollbar">
              <span className="flex items-center gap-1 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100"><Clock className="w-2.5 h-2.5" />{formatFullTime(activity.durationSeconds)}</span>
              <span className="flex items-center gap-1.5 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                <span className="text-slate-500 font-black">{activity.count} 总</span>
                <span className="text-slate-300">|</span>
                <span className="text-emerald-600 font-black">{activity.correct} 对</span>
              </span>
              <span className="flex items-center gap-1">
                <span style={{ color: getDynamicColor(currentMastery) }}>掌握 {currentMastery.toFixed(2)}%</span>
                {activity.masteryGain ? (<span className={`ml-0.5 font-black ${activity.masteryGain > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{activity.masteryGain > 0 ? '↑' : '↓'}{Math.abs(activity.masteryGain).toFixed(2)}%</span>) : null}
              </span>
        </div>
      </div>
    );
  };

  const renderPersistenceDetails = () => {
      if (!persistenceDetails) return null;
      const subject = persistenceDetails;
      const p = subject === 'English' ? enPersistence : cnPersistence;
      const colorClass = subject === 'English' ? 'text-indigo-600' : 'text-emerald-600';
      const barColor = subject === 'English' ? 'bg-indigo-500' : 'bg-emerald-500';

      return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1100] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-[2rem] w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-300">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white rounded-t-[2rem] shrink-0 z-10">
                    <div><h3 className={`text-xl font-black ${colorClass}`}>{subject === 'English' ? '英语' : '语文'}坚持等级</h3><p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">Persistence Grades</p></div>
                    <button onClick={() => setPersistenceDetails(null)} className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    
                    <div className="p-6 bg-slate-50 border border-slate-100 rounded-2xl mb-6">
                        <div className="flex items-start gap-3 mb-4"><Info className="w-5 h-5 text-slate-400 mt-0.5 shrink-0"/><div className="text-xs text-slate-500 leading-relaxed font-medium">
                            <p className="mb-2"><strong className="text-slate-700">定义：</strong> 衡量每日坚持复习的连续性与强度。</p>
                            <p className="mb-1"><strong className="text-slate-700">公式：</strong> {'$S_{today} = S_{base} + 100 \\times \\ln(1 + \\frac{Count_{today}}{100})$'}</p>
                            <p className="mb-2 text-[10px] text-slate-400">{'其中 $Count_{today}$ 为今日所有复习总数（含错误）。'}</p>
                            <p className="mb-1"><strong className="text-slate-700">衰减规则：</strong> {'每日凌晨，$S_{base}$ 衰减为前一日得分的 98%。'}</p>
                            <p className="text-[10px] text-slate-400">若不复习，分数将每日下降。你需要一定量的复习来抵消 2% 的自然流失。</p>
                        </div></div>
                        <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-100">
                            <div><div className="text-xs font-black uppercase text-slate-500">当前得分 (Score)</div><div className="text-[10px] text-slate-400 font-bold mt-0.5">基础分: {Math.round(p.baseScore)} + 今日加成</div></div>
                            <span className={`text-3xl font-black ${colorClass}`}>{Math.round(p.score)}</span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        {PERSISTENCE_GRADES.map((g, idx) => {
                            const isReached = p.score >= g.score;
                            const isCurrent = isReached && (idx === PERSISTENCE_GRADES.length - 1 || p.score < PERSISTENCE_GRADES[idx+1].score);
                            const nextGrade = PERSISTENCE_GRADES[idx+1];
                            const isNextTarget = !isReached && (idx === 0 || p.score >= PERSISTENCE_GRADES[idx-1].score);

                            if (!isReached && !isNextTarget) return null; // Hide far future grades

                            return (
                                <div key={g.grade} className={`p-3 rounded-xl border flex justify-between items-center transition-all ${isCurrent ? 'bg-slate-800 border-slate-900 text-white shadow-lg scale-[1.02] z-10' : (isReached ? 'bg-white border-slate-100 opacity-60' : 'bg-slate-50 border-slate-200 border-dashed opacity-50')}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs ${isCurrent ? 'bg-white text-slate-900' : 'bg-slate-100 text-slate-500'}`}>{g.grade}</div>
                                        <span className={`text-sm font-bold ${isCurrent ? 'text-white' : 'text-slate-600'}`}>{isCurrent ? '当前等级 (Current)' : (isReached ? '已达成 (Reached)' : '下一目标 (Target)')}</span>
                                    </div>
                                    <div className="font-mono font-black text-sm">{g.score}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
      );
  };

  const renderRealmDetails = () => {
    // ... (rest of implementation remains same)
    if (!realmDetails) return null;
    const currentCount = globalStats?.[realmDetails] || 0;
    const divisor = realmDetails === 'Chinese' ? 5 : 1;
    const suffixes = realmDetails === 'Chinese' ? ["Initial", "Middle", "Deep", "Complete"] : ["Early", "Mid", "Late", "Peak"];
    const suffixesCn = realmDetails === 'Chinese' ? ["初境", "中境", "深境", "圆满"] : ["前期", "中期", "后期", "巅峰"];
    const allThresholds: { title: string; threshold: number; config: any }[] = [];
    allThresholds.push({ title: realmDetails === 'Chinese' ? "Unranked (不入格)" : "Mortal (凡人)", threshold: 0, config: { color: "text-slate-500", border: "border-slate-300" } });
    REALM_CONFIGS.forEach((r, i) => {
      const majorEn = realmDetails === 'Chinese' ? CHINESE_TITLES[i].en : r.name;
      const majorCn = realmDetails === 'Chinese' ? CHINESE_TITLES[i].cn : r.cnName;
      const middleEn = realmDetails === 'Chinese' ? CHINESE_TITLES[i].middleEn : "";
      const middleCn = realmDetails === 'Chinese' ? CHINESE_TITLES[i].sub : "";
      suffixes.forEach((suffix, j) => {
        let fullTitle = "";
        if (realmDetails === 'Chinese') { fullTitle = `${majorEn} · ${middleEn} ${suffix} (${majorCn}·${middleCn}${suffixesCn[j]})`; } 
        else { fullTitle = `${majorEn} ${suffix} (${majorCn}${suffixesCn[j]})`; }
        allThresholds.push({ title: fullTitle, threshold: (r.start + j * r.step) / divisor, config: r });
      });
    });
    const visibleRealms: any[] = [];
    let foundNext = false;
    for (const item of allThresholds) {
        if (item.threshold <= currentCount) { visibleRealms.push({...item, reached: true}); } 
        else if (!foundNext) { visibleRealms.push({...item, reached: false}); foundNext = true; } else { break; }
    }
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1100] flex items-center justify-center p-4 animate-in fade-in duration-300">
        <div className="bg-white rounded-[2rem] w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-300">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center">
             <div><h3 className="text-xl font-black text-slate-800">{realmDetails === 'English' ? '英语修为境界' : '语文品阶表'}</h3><p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">Cultivation Progress</p></div>
             <button onClick={() => setRealmDetails(null)} className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
             {visibleRealms.map((r, i) => {
                if (r.reached) {
                    return (
                        <div key={r.title} className={`p-4 rounded-2xl border bg-white ${r.config.border} shadow-sm ring-1 ring-slate-100/50`}>
                            <div className="flex justify-between items-start mb-2"><span className={`text-sm font-black ${r.config.color}`}>{r.title}</span><CheckCircle2 className={`w-4 h-4 ${r.config.color}`} /></div>
                            <div className="flex justify-between items-end"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">达成点数</span><span className="text-xs font-black text-slate-600 tabular-nums">{r.threshold} <span className="text-[10px] text-slate-400 font-bold">净正确</span></span></div>
                        </div>
                    )
                }
                return (
                  <div key={r.title} className="p-4 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 opacity-80">
                    <div className="flex justify-between items-center mb-2"><span className="text-sm font-black text-slate-400">???</span><div className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded">正在追寻</div></div>
                    <div className="flex justify-between items-end"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">突破要求</span><span className="text-xs font-black text-slate-500 tabular-nums">{r.threshold} <span className="text-[10px] text-slate-400 font-bold">净正确</span></span></div>
                  </div>
                );
             })}
          </div>
          <div className="p-6 bg-slate-50 rounded-b-[2rem]"><Button fullWidth onClick={() => setRealmDetails(null)}>返回日报</Button></div>
        </div>
      </div>
    );
  };

  const renderSpiritRootDetails = () => {
      // ... (rest of implementation remains same)
      if (!spiritRootDetails) return null;
      const { type, subject } = spiritRootDetails;
      const isQuantity = type === 'quantity';
      const title = isQuantity ? '灵根数量 (Speed)' : '灵根质量 (Quality)';
      const subjectLabel = subject === 'English' ? '英语' : '语文';
      const colorClass = subject === 'English' ? (isQuantity ? 'text-indigo-600' : 'text-purple-600') : (isQuantity ? 'text-emerald-600' : 'text-cyan-600');
      
      const currentVal = isQuantity ? (subject === 'English' ? enQuantityVal : cnQuantityVal) : (subject === 'English' ? enQualityVal : cnQualityVal);
      const levels = isQuantity ? SPIRIT_ROOT_QUANTITY_LEVELS : SPIRIT_ROOT_QUALITY_LEVELS;
      const recentMastered = isQuantity ? getRecentMasteredDecks(subject) : [];
      const qualitySamples = !isQuantity ? getAllQualitySamples(subject).sort((a,b) => b.timestamp - a.timestamp).slice(0, 10) : [];
      const totalQualityCount = !isQuantity ? getAllQualitySamples(subject).length : 0;

      // Stats for today
      const todayMetrics = subject === 'English' ? enMetrics : cnMetrics;

      let currentLevelIndex = -1;
      let currentTierIndex = -1;
      const m = (isQuantity && subject === 'Chinese') ? 4 : 1;

      // Valid check: non-null and (if quantity) > 0. For quality, 0 is valid.
      if (currentVal !== null && currentVal !== undefined && (isQuantity ? currentVal !== 0 : true)) {
          for (let i = 0; i < levels.length; i++) {
              const meetsCondition = isQuantity ? (currentVal <= levels[i].threshold * m) : (currentVal <= levels[i].threshold);
              if (meetsCondition) {
                  currentLevelIndex = i;
                  for (let j = 0; j < levels[i].tiers.length; j++) { 
                      const tierCondition = isQuantity ? (currentVal <= levels[i].tiers[j].t * m) : (currentVal <= levels[i].tiers[j].t);
                      if (tierCondition) { currentTierIndex = j; break; } 
                  }
                  break;
              }
          }
      }
      
      const isUnawakened = currentVal === null || (isQuantity && currentVal === 0);
      const flatLevels: any[] = [];
      levels.forEach((l, lIdx) => {
          l.tiers.forEach((t, tIdx) => {
              let displayName = `${l.name}${t.name}`;
              let displayEn = `${l.en} ${t.en}`;
              if (!isQuantity) {
                  if (t.name === '半步' && lIdx > 0) { const nextL = levels[lIdx - 1]; displayName = `半步${nextL.name}`; displayEn = `Half-step ${nextL.en} Grade`; } 
                  else { displayName = `${l.name}${t.name}`; displayEn = `${l.en} Grade ${t.en}`; }
              } else { displayName = `${t.name}${l.name}`; displayEn = `${t.en} ${l.en} Root`; }
              const fullT = t.t * m;
              flatLevels.push({ ...t, displayName, displayEn, levelName: l.name, levelEn: l.en, lIdx, tIdx, fullThreshold: fullT, color: (l as any).color });
          });
      });

      let currentFlatIndex = -1;
      if (!isUnawakened) { for(let i=0; i<flatLevels.length; i++) { if (flatLevels[i].lIdx === currentLevelIndex && flatLevels[i].tIdx === currentTierIndex) { currentFlatIndex = i; break; } } }

      return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1100] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-[2rem] w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-300">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white rounded-t-[2rem] shrink-0 z-10">
                    <div><h3 className={`text-xl font-black ${colorClass}`}>{subjectLabel}·{title}</h3><p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">Spirit Root Assessment</p></div>
                    <button onClick={() => setSpiritRootDetails(null)} className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    
                    {/* Today's Stats in Modal */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col items-center justify-center">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">今日正确率 Accuracy</span>
                            <span className={`text-xl font-black ${subject === 'English' ? 'text-indigo-600' : 'text-emerald-600'}`}>{(todayMetrics.acc * 100).toFixed(2)}%</span>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col items-center justify-center">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">今日效率 Efficiency</span>
                            <span className={`text-xl font-black ${subject === 'English' ? 'text-indigo-600' : 'text-emerald-600'}`}>{isFinite(todayMetrics.efficiency) ? todayMetrics.efficiency.toFixed(2) : '0.00'}</span>
                        </div>
                    </div>

                    <div className="p-6 bg-slate-50 border border-slate-100 rounded-2xl mb-6">
                        <div className="flex items-start gap-3 mb-4"><Info className="w-5 h-5 text-slate-400 mt-0.5 shrink-0"/><div className="text-xs text-slate-500 leading-relaxed font-medium">{isQuantity ? (<><p className="mb-1"><strong className="text-slate-700">定义：</strong> 代表记忆速度天赋。</p><p className="mb-1"><strong className="text-slate-700">要求：</strong> 所有词汇连对 ≥ {getMasteryThreshold()} (Must all be Streak ≥ {getMasteryThreshold()})。</p><p className="mb-1"><strong className="text-slate-700">注意：</strong> 只有满足"连对全部≥{getMasteryThreshold()}"且已达到90%掌握度的词组本，才会计入灵根数量。</p><p className="mb-1"><strong className="text-slate-700">公式：</strong> {'$X = T(90\\%) / N_{eff}$'}</p><p className="mb-1 text-[10px] text-slate-400">{'$N_{eff} = W_{total} - 0.5 \\times W_{perfect}$'}</p><p className="text-[10px] text-slate-400">(Perfect Weight = weight of phrases with ZERO total errors)</p></>) : (<><p className="mb-1"><strong className="text-slate-700">定义：</strong> 代表记忆效率与稳定性。</p><p className="mb-1"><strong className="text-slate-700">触发：</strong> 当题目打破连对记录时。</p><p className="mb-1"><strong className="text-slate-700">单次值(x)：</strong> {'$Streak_{new} / \\log_2(Wrong_{total}+1)$'}</p><p className="mb-1"><strong className="text-slate-700">权重(w)：</strong> {'$0.7^{(Streak_{new}-1)}$'}</p><p><strong className="text-slate-700">总评：</strong> 加权平均值 (Weighted Avg)</p></>)}</div></div>
                        <div className={`p-4 rounded-xl border flex justify-between items-center bg-white ${colorClass.replace('text-', 'border-')}`}><div><div className="text-xs font-black uppercase text-slate-500">当前数值 (Current Value)</div><div className="text-[10px] text-slate-400 font-bold mt-0.5">{isQuantity ? `基于最近 ${recentMastered.length} 个样本` : `基于近7天所有顿悟事件 (Weighted)`}</div></div><span className={`text-3xl font-black ${colorClass}`}>{currentVal !== null ? currentVal.toFixed(3) : '-'}</span></div>
                    </div>
                    {isQuantity && recentMastered.length > 0 && (
                        <div className="mb-6"><h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1"><BookOpen className="w-3 h-3"/> 近期考核样本 (Recent 10)</h4><div className="bg-slate-50 rounded-xl border border-slate-100"><table className="w-full text-left text-[10px]"><thead className="bg-slate-100 text-slate-500 font-black"><tr><th className="p-2 pl-3">Deck</th><th className="p-2 text-right">Time(T)</th><th className="p-2 text-right">Total Wgt</th><th className="p-2 text-right">Perf Wgt</th><th className="p-2 text-right">Eff Count(N)</th><th className="p-2 pr-3 text-right">Val(X)</th></tr></thead><tbody className="divide-y divide-slate-100">{recentMastered.map(d => { 
                            const { totalDeckWeight, perfectDeckWeight, effectiveCount, val } = getDeckQuantityMetrics(d, subject);
                            return (<tr key={d.id} className="text-slate-600 font-medium"><td className="p-2 pl-3 break-all max-w-[80px]" title={d.name}>{d.name}</td><td className="p-2 text-right">{formatFullTime(d.stats?.firstMastery90Seconds || 0)}</td><td className="p-2 text-right text-slate-400">{totalDeckWeight.toFixed(1)}</td><td className="p-2 text-right text-emerald-600">{perfectDeckWeight.toFixed(1)}</td><td className="p-2 text-right font-bold">{effectiveCount.toFixed(2)}</td><td className="p-2 pr-3 text-right font-bold text-indigo-600">{val.toFixed(2)}</td></tr>); 
                        })}</tbody></table></div></div>
                    )}
                    {!isQuantity && qualitySamples.length > 0 && (
                         <div className="mb-6"><div className="flex justify-between items-end mb-2"><h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Zap className="w-3 h-3"/> 近期顿悟 (Recent Epiphanies)</h4><span className="text-[9px] text-slate-300 font-bold">Total: {totalQualityCount}</span></div><div className="bg-slate-50 rounded-xl border border-slate-100 overflow-x-auto"><table className="w-full text-left text-[10px]"><thead className="bg-slate-100 text-slate-500 font-black"><tr><th className="p-2 pl-3 whitespace-nowrap">Phrase</th><th className="p-2 text-right whitespace-nowrap">Val (X)</th><th className="p-2 text-right whitespace-nowrap">Wgt (W)</th></tr></thead><tbody className="divide-y divide-slate-100">{qualitySamples.map((s, idx) => (<tr key={idx} className="text-slate-600 font-medium"><td className="p-2 pl-3 truncate max-w-[140px]">{s.phrase || s.deckName || 'Unknown'}</td><td className="p-2 pr-3 text-right font-bold text-indigo-600">{s.value.toFixed(2)}</td><td className="p-2 pr-3 text-right text-slate-400">{s.weight !== undefined ? s.weight.toFixed(3) : '1.000'}</td></tr>))}</tbody></table></div></div>
                    )}
                    <div className="space-y-2">
                        {flatLevels.map((item, idx) => {
                            const isCurrent = !isUnawakened && idx === currentFlatIndex;
                            const isLowerThanSelf = !isUnawakened && idx > currentFlatIndex; // Inferior ranks
                            const isNextTarget = !isUnawakened && idx === currentFlatIndex - 1; // Immediate superior rank
                            
                            if (isUnawakened) { 
                                // Show only the lowest rank as target if unawakened
                                if (idx < flatLevels.length - 1) return null; 
                            } else {
                                // Show Next Target, Current, and All Below
                                if (!isCurrent && !isLowerThanSelf && !isNextTarget) return null;
                            }
                            
                            const inequality = '≤';
                            let diff = 0;
                            if (currentVal !== null) {
                                diff = currentVal - item.fullThreshold;
                            }
                            
                            if (isNextTarget || (isUnawakened && idx === flatLevels.length - 1)) { 
                                return (<div key={idx} className="p-3 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 opacity-60 flex justify-between items-center"><div className="flex items-center gap-2"><span className="text-sm font-black text-slate-300">???</span><span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[9px] font-bold">目标 (Target)</span></div><div className="text-right"><div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">突破要求</div><div className="text-lg font-black text-slate-500 font-mono">{inequality} {item.fullThreshold.toFixed(3)}</div><div className="text-[9px] font-bold text-amber-600 mt-0.5">{currentVal !== null ? `还差 ${diff.toFixed(3)}` : '未开启'}</div></div></div>); 
                            }
                            
                            const colorStyle = item.color || 'text-slate-600';
                            
                            return (
                                <div key={idx} className={`p-3 rounded-xl border flex justify-between items-center transition-all ${isCurrent ? 'bg-slate-800 border-slate-900 text-white shadow-lg scale-[1.02] z-10 relative' : 'bg-white border-slate-100 text-slate-400 opacity-80'}`}>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-sm font-black ${isCurrent ? 'text-white' : colorStyle}`}>{item.displayName} <span className="text-[10px] opacity-60 font-bold uppercase">{item.displayEn}</span></span>
                                            {isCurrent && <span className="px-1.5 py-0.5 bg-white/20 rounded text-[9px] font-bold text-white">当前 (Current)</span>}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xl font-black font-mono">{inequality} {Math.abs(item.fullThreshold) === Infinity ? '∞' : item.fullThreshold.toFixed(3)}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
      );
  };

  return (
    <div className="fixed inset-0 bg-white z-[1000] flex flex-col h-full w-full overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white border-b border-slate-100 flex justify-between items-center px-5 py-3 shrink-0 h-16 shadow-sm relative z-10">
         <div className="flex items-center gap-3"><div className="p-2 bg-slate-900 rounded-xl shadow-lg"><ScrollText className="w-6 h-6 text-white" /></div><div><h2 className="text-sm font-black text-slate-800 tracking-tight leading-none">今日学习日报</h2><div className="flex items-center gap-1.5 mt-0.5"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Growth Tracker</span><span className="text-[10px] font-bold text-slate-300">|</span><span className="flex items-center gap-1 text-[10px] font-bold text-slate-500"><Calendar className="w-3 h-3"/> {stats.date}</span></div></div></div>
         <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-600 transition-colors bg-slate-50 rounded-full"><X className="w-6 h-6" /></button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/30 pb-32">
        <div className="max-w-2xl mx-auto p-5 space-y-6">
          
          <div className="grid grid-cols-3 gap-4">
             <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-center items-center text-center"><Clock className="w-6 h-6 text-blue-500 mb-2" /><div className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">学习时长</div><div className="text-lg font-black text-slate-800">{formatFullTime(stats.studyTimeSeconds)}</div></div>
             <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-center items-center text-center"><Target className="w-6 h-6 text-indigo-600 mb-2" /><div className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">复习统计</div><div className="text-lg font-black text-slate-800 leading-tight">{stats.reviewCount} <span className="text-xs text-slate-300">次</span></div><div className="flex gap-3 mt-1 text-[10px] font-black"><span className="text-emerald-500">{stats.correctCount}对</span><span className="text-rose-400">{stats.wrongCount}错</span></div></div>
             <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-center items-center text-center">
                 <Zap className="w-6 h-6 text-amber-500 mb-2" />
                 <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">修炼效率</div>
                 <div className="text-2xl font-black text-slate-800 mb-1">{isFinite(enMetrics.efficiency) ? enMetrics.efficiency.toFixed(2) : '0.00'} <span className="text-xs text-slate-300">pt/题</span></div>
                 <div className="text-[10px] font-black text-slate-400 bg-slate-50 px-2 py-0.5 rounded-lg">正确率 <span className="text-slate-800">{accuracy.toFixed(1)}%</span></div>
             </div>
          </div>

          <div className="space-y-5">
             <div className="bg-white p-6 rounded-[2.5rem] border border-indigo-100 shadow-lg relative overflow-hidden flex flex-col gap-6 hover:shadow-xl transition-all">
                <div className="flex items-start justify-between cursor-pointer" onClick={() => setRealmDetails('English')}>
                  <div className="flex items-center gap-4"><div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100"><Languages className="w-6 h-6" /></div><div><div className="flex items-center gap-2"><h3 className="text-lg font-black text-slate-800">英语修为 (English)</h3><Info className="w-4 h-4 text-indigo-300" /></div>
                  <div className="flex flex-col items-start gap-0.5 mt-1">
                      <span className={`text-sm font-black ${englishRealm.color} flex items-center gap-1.5 shrink-0`}><Swords className="w-4 h-4"/>{englishRealm.name}</span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total: {globalStats?.English || 0} (Net Correct / 净正确)</span>
                  </div></div></div>
                  <div className="text-right"><div className="text-[10px] text-indigo-400 font-black uppercase tracking-widest">今日净正确</div><div className={`text-3xl font-black ${enMetrics.netChange >= 0 ? 'text-indigo-600' : 'text-rose-500'}`}>{enMetrics.netChange > 0 ? '+' : ''}{enMetrics.netChange}</div></div>
                </div>
                
                {/* English Persistence Bar */}
                <div className="cursor-pointer" onClick={() => setPersistenceDetails('English')}>
                    <div className="flex justify-between items-end mb-1.5">
                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1"><Flame className="w-3 h-3 text-indigo-500"/> 坚持 (Persistence) <Info className="w-3 h-3"/></span>
                        <div className="flex items-center gap-2">
                            <span className={`text-xs font-black ${enPersistence.color}`}>{enPersistence.grade} <span className="text-[9px] text-slate-300 font-bold">({Math.round(enPersistence.score)})</span></span>
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${enPersistence.diff >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'}`}>{enPersistence.diff > 0 ? '↑' : ''}{enPersistence.diff.toFixed(1)}</span>
                        </div>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-400 rounded-full transition-all duration-700" style={{ width: `${enPersistence.progress * 100}%` }}></div></div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-indigo-50/50 pt-3">
                    <div onClick={() => setSpiritRootDetails({type: 'quantity', subject: 'English'})} className="cursor-pointer hover:bg-indigo-50/50 rounded-lg p-1 -m-1 transition-colors"><span className="text-[10px] text-indigo-400 font-black uppercase flex items-center gap-1">灵根数量 (Speed) <Info className="w-3 h-3"/></span><div className="flex items-center gap-2 mt-0.5"><span className={`text-sm font-black ${enQuantity.color}`}>{enQuantity.full}</span></div></div>
                    <div onClick={() => setSpiritRootDetails({type: 'quality', subject: 'English'})} className="cursor-pointer hover:bg-purple-50/50 rounded-lg p-1 -m-1 transition-colors"><span className="text-[10px] text-purple-400 font-black uppercase flex items-center gap-1">灵根质量 (Quality) <Info className="w-3 h-3"/></span><div className={`text-sm font-black ${enQuality.color}`}>{enQuality.full}</div></div>
                    <div><span className="text-[10px] text-slate-400 font-black uppercase">今日正确率</span><div className="text-sm font-black text-indigo-700">{(enMetrics.acc * 100).toFixed(2)}%</div></div>
                    <div><span className="text-[10px] text-slate-400 font-black uppercase block">今日做题总数</span><div className="text-sm font-black text-slate-700">{enMetrics.total}</div></div>
                </div>
                <div className="space-y-2 cursor-pointer" onClick={() => setRealmDetails('English')}><div className="flex justify-between items-end"><span className="text-xs font-black text-slate-400 uppercase">Next Realm: {englishRealm.percent.toFixed(2)}%</span><span className="text-xs font-black text-indigo-500 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">Need {englishRealm.remain}</span></div><div className="h-4 bg-slate-100 rounded-full overflow-hidden p-0.5 shadow-inner border border-slate-50"><div className="h-full bg-gradient-to-r from-indigo-400 to-indigo-700 rounded-full transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(79,70,229,0.4)] relative" style={{ width: `${englishRealm.percent}%` }}><div className="absolute inset-0 bg-white/20 animate-pulse"></div></div></div></div>
             </div>

             <div className="bg-white p-6 rounded-[2.5rem] border border-emerald-100 shadow-lg relative overflow-hidden flex flex-col gap-6 hover:shadow-xl transition-all">
                <div className="flex items-start justify-between cursor-pointer" onClick={() => setRealmDetails('Chinese')}>
                  <div className="flex items-center gap-4"><div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100"><ScrollText className="w-6 h-6" /></div><div><div className="flex items-center gap-2"><h3 className="text-lg font-black text-slate-800">语文品阶 (Chinese)</h3><Info className="w-4 h-4 text-emerald-300" /></div>
                  <div className="flex flex-col items-start gap-0.5 mt-1">
                      <span className={`text-sm font-black ${chineseRealm.color} flex items-center gap-1.5`}><Swords className="w-4 h-4"/>{chineseRealm.mainName}</span>
                      <span className={`text-sm font-black ${chineseRealm.color} ml-5`}>{chineseRealm.subName}</span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Total: {globalStats?.Chinese || 0} (Net Correct / 净正确)</span>
                  </div></div></div>
                  <div className="text-right"><div className="text-[10px] text-emerald-400 font-black uppercase tracking-widest">今日净正确</div><div className={`text-3xl font-black ${cnMetrics.netChange >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{cnMetrics.netChange > 0 ? '+' : ''}{cnMetrics.netChange}</div></div>
                </div>

                 {/* Chinese Persistence Bar */}
                 <div className="cursor-pointer" onClick={() => setPersistenceDetails('Chinese')}>
                    <div className="flex justify-between items-end mb-1.5">
                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1"><Flame className="w-3 h-3 text-emerald-500"/> 坚持 (Persistence) <Info className="w-3 h-3"/></span>
                        <div className="flex items-center gap-2">
                            <span className={`text-xs font-black ${cnPersistence.color}`}>{cnPersistence.grade} <span className="text-[9px] text-slate-300 font-bold">({Math.round(cnPersistence.score)})</span></span>
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${cnPersistence.diff >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'}`}>{cnPersistence.diff > 0 ? '↑' : ''}{cnPersistence.diff.toFixed(1)}</span>
                        </div>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-400 rounded-full transition-all duration-700" style={{ width: `${cnPersistence.progress * 100}%` }}></div></div>
                </div>

                 <div className="grid grid-cols-2 gap-4 border-t border-emerald-50/50 pt-3">
                    <div onClick={() => setSpiritRootDetails({type: 'quantity', subject: 'Chinese'})} className="cursor-pointer hover:bg-emerald-50/50 rounded-lg p-1 -m-1 transition-colors"><span className="text-[10px] text-emerald-400 font-black uppercase flex items-center gap-1">灵根数量 (Speed) <Info className="w-3 h-3"/></span><div className="flex items-center gap-2 mt-0.5"><span className={`text-sm font-black ${cnQuantity.color}`}>{cnQuantity.full}</span></div></div>
                    <div onClick={() => setSpiritRootDetails({type: 'quality', subject: 'Chinese'})} className="cursor-pointer hover:bg-cyan-50/50 rounded-lg p-1 -m-1 transition-colors"><span className="text-[10px] text-cyan-400 font-black uppercase flex items-center gap-1">灵根质量 (Quality) <Info className="w-3 h-3"/></span><div className={`text-sm font-black ${cnQuality.color}`}>{cnQuality.full}</div></div>
                    <div><span className="text-[10px] text-slate-400 font-black uppercase">今日正确率</span><div className="text-sm font-black text-emerald-700">{(cnMetrics.acc * 100).toFixed(2)}%</div></div>
                    <div><span className="text-[10px] text-slate-400 font-black uppercase block">今日做题总数</span><div className="text-sm font-black text-slate-700">{cnMetrics.total}</div></div>
                </div>
                <div className="space-y-2 cursor-pointer" onClick={() => setRealmDetails('Chinese')}><div className="flex justify-between items-end"><span className="text-xs font-black text-slate-400 uppercase">Next Rank: {chineseRealm.percent.toFixed(2)}%</span><span className="text-xs font-black text-emerald-500 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">Need {chineseRealm.remain}</span></div><div className="h-4 bg-slate-100 rounded-full overflow-hidden p-0.5 shadow-inner border border-slate-50"><div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-700 rounded-full transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(16,185,129,0.4)] relative" style={{ width: `${chineseRealm.percent}%` }}><div className="absolute inset-0 bg-white/20 animate-pulse"></div></div></div></div>
             </div>
          </div>

          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col mt-2">
             <div className="px-6 py-4 border-b border-slate-50 bg-slate-50/50 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-blue-500" /><h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">详细复盘记录 BREAKDOWN</h3></div>
             <div className="divide-y divide-slate-50">
               {studyActivities.length > 0 && (<><div className="px-4 py-2 bg-slate-50/30 text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Zap className="w-3 h-3" /> 日常背诵 Sessions</div>{studyActivities.map(renderActivityRow)}</>)}
               {examActivities.length > 0 && (<><div className="px-4 py-2 bg-slate-50/30 text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><GraduationCap className="w-3 h-3" /> 模拟考试 Trials</div>{examActivities.map(renderActivityRow)}</>)}
               {(studyActivities.length === 0 && examActivities.length === 0) && (<div className="text-center py-16 text-slate-300 text-sm font-medium italic">今日尚无有效记忆记录</div>)}
             </div>
          </div>
        </div>
      </div>
      
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-white/95 backdrop-blur-lg border-t border-slate-100 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.1)]">
         <div className="max-w-xl mx-auto"><Button fullWidth onClick={onClose} className="py-4 text-base font-black rounded-2xl bg-slate-900 text-white shadow-xl hover:bg-slate-800 active:scale-95 transition-all">确认并关闭日报</Button></div>
      </div>
      {renderRealmDetails()}
      {renderSpiritRootDetails()}
      {renderPersistenceDetails()}
    </div>
  );
};