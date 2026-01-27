
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AppView, Deck, Phrase, GlobalStats, BackupData, ActivityLog, DeckSessionLog, DeckSubject, Folder, ContentType, StudyMode } from '../types';
import { StudySession } from './components/StudySession';
import { Importer } from './components/Importer';
import { DeckEditor } from './components/DeckEditor';
import { ExamSession } from './components/ExamSession';
import { Button } from './components/Button';
import { PlusCircle, BookOpen, Trash2, BrainCircuit, ListOrdered, CheckCircle2, XCircle, BarChart2, X, Clock, Edit, AlertTriangle, Settings, Download, Upload, FileJson, GraduationCap, Play, FileText, Hash, GripVertical, Zap, CopyPlus, FolderInput, Languages, FolderPlus, Folder as FolderIcon, FolderOpen, ChevronRight, Home, Move, ArrowUp, ArrowDown, ScrollText, ShieldAlert, RotateCcw, Keyboard, Database, Type as TypeIcon, AlignLeft, ArrowRightLeft, GitMerge, ArrowRight, Layers, History, Flower, Info, Shuffle, ArrowDownToLine, ArrowUpToLine, AlignJustify, Check, Flame, Timer } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { DailyReport } from './components/DailyReport';

const STORAGE_KEY = 'recallflow_data_v1';
const STATS_KEY = 'recallflow_stats_v1';
const FOLDERS_KEY = 'recallflow_folders_v1';
const ALGO_SETTINGS_KEY = 'recallflow_algo_settings_v1';
const EXAM_CONFIG_KEY = 'recallflow_exam_config_v1';

export const SPIRIT_ROOT_QUANTITY_LEVELS = [
  { name: '仙灵根', en: 'Immortal', threshold: 4, color: 'text-amber-500', tiers: [ {name:'上位', en:'Upper', t:3.05}, {name:'中位', en:'Middle', t:3.49}, {name:'下位', en:'Lower', t:4} ] },
  { name: '天灵根', en: 'Sky', threshold: 6, color: 'text-fuchsia-500', tiers: [ {name:'上位', en:'Upper', t:4.58}, {name:'中位', en:'Middle', t:5.24}, {name:'下位', en:'Lower', t:6} ] },
  { name: '异灵根', en: 'Mutant', threshold: 9, color: 'text-indigo-500', tiers: [ {name:'上位', en:'Upper', t:6.87}, {name:'中位', en:'Middle', t:7.86}, {name:'下位', en:'Lower', t:9} ] },
  { name: '双灵根', en: 'Double', threshold: 13.5, color: 'text-blue-500', tiers: [ {name:'上位', en:'Upper', t:10.3}, {name:'中位', en:'Middle', t:11.79}, {name:'下位', en:'Lower', t:13.5} ] },
  { name: '三灵根', en: 'Triple', threshold: 27, color: 'text-cyan-600', tiers: [ {name:'上位', en:'Upper', t:17.01}, {name:'中位', en:'Middle', t:21.43}, {name:'下位', en:'Lower', t:27} ] },
  { name: '四灵根', en: 'Quad', threshold: 54, color: 'text-emerald-600', tiers: [ {name:'上位', en:'Upper', t:34.02}, {name:'中位', en:'Middle', t:42.86}, {name:'下位', en:'Lower', t:54} ] },
  { name: '五灵根', en: 'Penta', threshold: Infinity, color: 'text-slate-500', tiers: [ {name:'上位', en:'Upper', t:68.04}, {name:'中位', en:'Middle', t:85.72}, {name:'下位', en:'Lower', t:Infinity} ] },
];

export const SPIRIT_ROOT_QUALITY_LEVELS = [
  { name: '仙品', en: 'Divine', threshold: 0.81, color: 'text-amber-500', tiers: [ {name:'高等', en:'High', t:0.715}, {name:'中等', en:'Medium', t:0.76}, {name:'低等', en:'Low', t:0.81} ] },
  { name: '极品', en: 'Top', threshold: 1.05, color: 'text-fuchsia-500', tiers: [ {name:'半步', en:'Half-step', t:0.865}, {name:'高等', en:'High', t:0.925}, {name:'中等', en:'Medium', t:0.98}, {name:'低等', en:'Low', t:1.05} ] },
  { name: '上品', en: 'High', threshold: 1.49, color: 'text-indigo-500', tiers: [ {name:'半步', en:'Half-step', t:1.13}, {name:'高等', en:'High', t:1.22}, {name:'中等', en:'Medium', t:1.33}, {name:'低等', en:'Low', t:1.49} ] },
  { name: '中品', en: 'Mid', threshold: 2.45, color: 'text-blue-500', tiers: [ {name:'半步', en:'Half-step', t:1.65}, {name:'高等', en:'High', t:1.85}, {name:'中等', en:'Medium', t:2.1}, {name:'低等', en:'Low', t:2.45} ] },
  { name: '下品', en: 'Low', threshold: 5.3, color: 'text-emerald-500', tiers: [ {name:'半步', en:'Half-step', t:2.9}, {name:'高等', en:'High', t:3.5}, {name:'中等', en:'Medium', t:4.3}, {name:'低等', en:'Low', t:5.3} ] },
  { name: '凡品', en: 'Mortal', threshold: Infinity, color: 'text-slate-500', tiers: [ {name:'半步', en:'Half-step', t:6.5}, {name:'高等', en:'High', t:8.0}, {name:'中等', en:'Medium', t:10.0}, {name:'低等', en:'Low', t:Infinity} ] }
];

export const getSpiritRootQuantity = (x: number, subject: DeckSubject = 'English') => {
    const m = subject === 'Chinese' ? 4 : 1;
    for (const level of SPIRIT_ROOT_QUANTITY_LEVELS) {
        if (x <= level.threshold * m) {
            for (const tier of level.tiers) {
                if (x <= tier.t * m) {
                    return { full: `${tier.name}${level.name}`, fullEn: `${tier.en} ${level.en} Root`, color: level.color };
                }
            }
        }
    }
    return { full: '未入流', fullEn: 'Unranked', color: 'text-slate-400' };
};

export const getSpiritRootQuality = (x: number) => {
    if (x < 0) return { full: '未定', fullEn: 'Pending', color: 'text-slate-400' };
    for (let i = 0; i < SPIRIT_ROOT_QUALITY_LEVELS.length; i++) {
        const level = SPIRIT_ROOT_QUALITY_LEVELS[i];
        if (x <= level.threshold) {
            for (const tier of level.tiers) {
                if (x <= tier.t) {
                    if (tier.name === '半步' && i > 0) {
                        const nextLevel = SPIRIT_ROOT_QUALITY_LEVELS[i - 1];
                        return { full: `${tier.name}${nextLevel.name}`, fullEn: `${tier.en} ${nextLevel.en} Grade`, color: level.color };
                    }
                    return { full: `${level.name}${tier.name}`, fullEn: `${level.en} Grade ${tier.en}`, color: level.color };
                }
            }
        }
    }
    return { full: '废品', fullEn: 'Scrap', color: 'text-slate-400' };
};

export const countWords = (text: string): number => {
    if (!text) return 0;
    const clean = text.replace(/['".,\/#!$%\^&\*;:{}=\-_`~()\[\]]/g, " ");
    const matches = clean.match(/[a-zA-Z0-9\u4e00-\u9fa5]+/g);
    return matches ? matches.length : 0;
};

const getPhraseTag = (p: Phrase) => {
    if (p.consecutiveCorrect > 0) return `对${p.consecutiveCorrect}`;
    if (p.consecutiveWrong > 0) return `错${p.consecutiveWrong}`;
    return '新';
};

const getTodayDate = () => { 
    return new Date().toLocaleDateString('en-CA'); 
};

export const formatFullTime = (seconds: number) => { if (seconds <= 0) return '0s'; const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); const s = seconds % 60; if (h > 0) return `${h}h${m}m${s}s`; if (m > 0) return `${m}m${s}s`; return `${s}s`; };
export const getDynamicColor = (percent: number) => { const hue = (percent * 1.2); return `hsl(${hue}, 75%, 45%)`; };
export const getBadgeColor = (correct: number, wrong: number) => { if (correct > 0) { return getDynamicColor(Math.min(100, 40 + correct * 12)); } if (wrong > 0) { return getDynamicColor(Math.max(0, 40 - wrong * 10)); } return '#94a3b8'; };

export const REALM_CONFIGS = [
  { name: "Qi Refining", cnName: "炼气", start: 100, step: 200, color: "text-slate-500", bg: "bg-slate-50", border: "border-slate-200" },
  { name: "Foundation", cnName: "筑基", start: 1000, step: 300, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  { name: "Golden Core", cnName: "结丹", start: 2400, step: 500, color: "text-cyan-600", bg: "bg-cyan-50", border: "border-cyan-200" },
  { name: "Nascent Soul", cnName: "元婴", start: 4800, step: 900, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
  { name: "Soul Formation", cnName: "化神", start: 9000, step: 1500, color: "text-indigo-600", bg: "bg-indigo-50", border: "border-indigo-200" },
  { name: "Void Training", cnName: "炼虚", start: 16000, step: 2500, color: "text-violet-600", bg: "bg-violet-50", border: "border-violet-200" },
  { name: "Body Integration", cnName: "合体", start: 27500, step: 4000, color: "text-fuchsia-600", bg: "bg-fuchsia-50", border: "border-fuchsia-200" },
  { name: "Great Vehicle", cnName: "大乘", start: 45625, step: 6125, color: "text-rose-600", bg: "bg-rose-50", border: "border-rose-200" },
  { name: "Tribulation", cnName: "渡劫", start: 73000, step: 9000, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
];

export const CHINESE_TITLES = [
  { en: "9th Pin", middleEn: "Clumsiness", cn: "九品", sub: "守拙" },
  { en: "8th Pin", middleEn: "Simplicity", cn: "八品", sub: "若愚" },
  { en: "7th Pin", middleEn: "Strength", cn: "七品", sub: "斗力" },
  { en: "6th Pin", middleEn: "Dexterity", cn: "六品", sub: "小巧" },
  { en: "5th Pin", middleEn: "Wisdom", cn: "五品", sub: "用智" },
  { en: "4th Pin", middleEn: "Insight", cn: "四品", sub: "通幽" },
  { en: "3rd Pin", middleEn: "Concreteness", cn: "三品", sub: "具体" },
  { en: "2nd Pin", middleEn: "Sitting", cn: "二品", sub: "坐照" },
  { en: "1st Pin", middleEn: "Divinity", cn: "一品", sub: "入神" }
];

const SUFFIXES = { English: { en: ["Early", "Mid", "Late", "Peak"], cn: ["前期", "中期", "后期", "巅峰"] }, Chinese: { en: ["Initial", "Middle", "Deep", "Complete"], cn: ["初境", "中境", "深境", "圆满"] } };

// Updated with more distinct and vibrant colors for persistence grades
export const PERSISTENCE_GRADES = [
    { score: 0, grade: 'F', color: 'text-slate-400' },
    { score: 500, grade: 'E', color: 'text-zinc-500' },
    { score: 1000, grade: 'D', color: 'text-stone-500' },
    { score: 1500, grade: 'D+', color: 'text-stone-600' },
    { score: 2000, grade: 'C-', color: 'text-sky-500' },
    { score: 2500, grade: 'C', color: 'text-sky-600' },
    { score: 3000, grade: 'C+', color: 'text-cyan-600' },
    { score: 3500, grade: 'B-', color: 'text-blue-500' },
    { score: 4000, grade: 'B', color: 'text-blue-600' },
    { score: 4500, grade: 'B+', color: 'text-indigo-500' },
    { score: 5000, grade: 'A', color: 'text-indigo-600' },
    { score: 5500, grade: 'A+', color: 'text-violet-600' },
    { score: 6000, grade: 'S', color: 'text-fuchsia-500' },
    { score: 6500, grade: 'S+', color: 'text-fuchsia-600' },
    { score: 7000, grade: 'SS', color: 'text-pink-500' },
    { score: 7500, grade: 'SS+', color: 'text-pink-600' },
    { score: 8000, grade: 'SSS', color: 'text-rose-500' },
    { score: 8500, grade: 'SSS+', color: 'text-red-600' },
];

export const getPersistenceGrade = (score: number) => {
    let current = PERSISTENCE_GRADES[0];
    for (const g of PERSISTENCE_GRADES) {
        if (score >= g.score) current = g; else break;
    }
    const nextIdx = PERSISTENCE_GRADES.indexOf(current) + 1;
    const next = PERSISTENCE_GRADES[nextIdx];
    const progress = next ? (score - current.score) / (next.score - current.score) : 1;
    return { ...current, next, progress: Math.min(1, Math.max(0, progress)) };
};

export const getRealmInfo = (count: number, subject: DeckSubject = 'English') => {
  const divisor = subject === 'Chinese' ? 5 : 1;
  const subSuffixesEn = SUFFIXES[subject].en;
  const subSuffixesCn = SUFFIXES[subject].cn;
  
  const baseTitleEn = subject === 'Chinese' ? "Unranked" : "Mortal";
  const baseTitleCn = subject === 'Chinese' ? "不入格" : "凡人";
  const maxVal = 100000 / divisor;
  
  let currentConfigIndex = -1;
  for (let i = REALM_CONFIGS.length - 1; i >= 0; i--) { if (count >= REALM_CONFIGS[i].start / divisor) { currentConfigIndex = i; break; } }

  if (currentConfigIndex === -1) {
    const nextStart = REALM_CONFIGS[0].start / divisor;
    return { name: `${baseTitleEn} (${baseTitleCn})`, mainName: baseTitleEn, subName: baseTitleCn, color: "text-slate-500", bg: "bg-slate-100", border: "border-slate-300", current: count, target: nextStart, percent: (count / nextStart) * 100, remain: Math.max(0, nextStart - count) };
  }

  const config = REALM_CONFIGS[currentConfigIndex];
  const start = config.start / divisor;
  const step = config.step / divisor;
  const nextMajorStart = (currentConfigIndex < REALM_CONFIGS.length - 1) ? REALM_CONFIGS[currentConfigIndex + 1].start / divisor : maxVal;
  const subIndex = Math.min(3, Math.floor((count - start) / step));
  const suffixEn = subSuffixesEn[subIndex];
  const suffixCn = subSuffixesCn[subIndex];
  let currentInSub: number, targetInSub: number, nextTarget: number;

  if (subIndex < 3) { currentInSub = count - (start + subIndex * step); targetInSub = step; nextTarget = start + (subIndex + 1) * step; } 
  else { currentInSub = count - (start + 3 * step); targetInSub = nextMajorStart - (start + 3 * step); nextTarget = nextMajorStart; }
  
  let fullNameEn = "", fullNameCn = "";
  if (subject === 'Chinese') { const t = CHINESE_TITLES[currentConfigIndex]; fullNameEn = `${t.en} · ${t.middleEn} ${suffixEn}`; fullNameCn = `${t.cn}·${t.sub}${suffixCn}`; } 
  else { fullNameEn = `${config.name} ${suffixEn}`; fullNameCn = `${config.cnName}${suffixCn}`; }

  if (count >= maxVal) { return { name: `${fullNameEn} (${fullNameCn})`, mainName: fullNameEn, subName: fullNameCn, color: config.color, bg: config.bg, border: config.border, current: 1, target: 1, percent: 100, remain: 0 }; }
  return { name: `${fullNameEn} (${fullNameCn})`, mainName: fullNameEn, subName: fullNameCn, color: config.color, bg: config.bg, border: config.border, current: currentInSub, target: targetInSub, percent: Math.min(100, (currentInSub / targetInSub) * 100), remain: Math.ceil(Math.max(0, nextTarget - count)) };
};

export const estimateMastery = (correct: number, wrong: number) => { if (correct === 0 && wrong === 0) return 0; if (wrong >= 3) return 0; let m = 0; if (correct >= 1) m += (100 - m) * 0.2; if (correct >= 2) m += (100 - m) * 0.3; if (correct >= 3) m += (100 - m) * 0.4; for(let i=4; i<=correct; i++) m += (100 - m) * 0.5; for(let i=1; i<=wrong; i++) m = m * 0.5; return m; };
export const calculateMasteryValue = (phrases: Phrase[]) => { if (phrases.length === 0) return 0; const totalScore = phrases.reduce((sum, p) => sum + (p.mastery ?? estimateMastery(p.consecutiveCorrect, p.consecutiveWrong)), 0); return totalScore / phrases.length; };
export const getDeckHash = (deck: Deck | undefined, type: 'quantity' | 'quality'): 0 | 1 => { if (!deck) return 0; if (type === 'quantity') { return deck.statsOptions?.includeInQuantity === false ? 0 : 1; } else { return deck.statsOptions?.includeInQuality === false ? 0 : 1; } };

export const getDeckLabel = (deck: Deck) => {
  if (deck.subject === 'Chinese') {
    return deck.contentType === 'Word' ? '文言实词' : '其他';
  }
  return deck.contentType === 'Word' ? '单词' : '词组/句子';
};

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

export const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.DASHBOARD);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  const [sessionStartMastery, setSessionStartMastery] = useState(0);
  const [examConfig, setExamConfig] = useState<{ count: number; candidateIds?: string[] } | null>(null);
  const [showExamSetup, setShowExamSetup] = useState(false);
  const [tempExamCount, setTempExamCount] = useState(20);
  const [examTags, setExamTags] = useState<Set<string>>(new Set()); 
  const [examTwMin, setExamTwMin] = useState<string>('');
  const [examTwMax, setExamTwMax] = useState<string>('');
  const [stats, setStats] = useState<GlobalStats>({
    totalReviewCount: 0,
    totalPhrasesCount: 0,
    totalStudyTimeSeconds: 0,
    subjectStats: { English: 0, Chinese: 0, qualityHistory: [] },
    daily: { date: getTodayDate(), reviewCount: 0, correctCount: 0, wrongCount: 0, reviewedPhraseIds: [], studyTimeSeconds: 0, activities: [] },
    persistence: { 
        English: { baseScore: 0, lastDate: getTodayDate(), prevDayFinalScore: 0 }, 
        Chinese: { baseScore: 0, lastDate: getTodayDate(), prevDayFinalScore: 0 } 
    }
  });
  const [deckToDelete, setDeckToDelete] = useState<string | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);
  const [deckToMove, setDeckToMove] = useState<string | null>(null);
  const [deckToMerge, setDeckToMerge] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<Deck | null>(null);
  const [mergeTags, setMergeTags] = useState<Set<string>>(new Set());
  const [mergeTwMin, setMergeTwMin] = useState<string>('');
  const [mergeTwMax, setMergeTwMax] = useState<string>('');
  const [folderToRename, setFolderToRename] = useState<string | null>(null);
  const [renameFolderInput, setRenameFolderInput] = useState('');
  const [folderToMove, setFolderToMove] = useState<string | null>(null);
  const [deckToDuplicate, setDeckToDuplicate] = useState<string | null>(null);
  const [draggedDeckId, setDraggedDeckId] = useState<string | null>(null);
  const [keepProgress, setKeepProgress] = useState(false);
  const [mergeCap, setMergeCap] = useState(5); 
  const [mergeMethod, setMergeMethod] = useState<'append' | 'prepend' | 'shuffle' | 'interleave'>('append');
  const [mergeRatio, setMergeRatio] = useState(1);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showFactoryResetConfirm, setShowFactoryResetConfirm] = useState(false);
  const [factoryResetInput, setFactoryResetInput] = useState('');
  const [showGlobalProgressResetConfirm, setShowGlobalProgressResetConfirm] = useState(false);
  const [progressResetInput, setProgressResetInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [examTimeLimit, setExamTimeLimit] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const storedDecks = localStorage.getItem(STORAGE_KEY);
    if (storedDecks) {
      try {
        const parsed = JSON.parse(storedDecks);
        const sanitized = Array.isArray(parsed) ? parsed.map((d: any) => {
            const subject = d.subject || 'English';
            const contentType = d.contentType || (subject === 'Chinese' ? 'Word' : 'PhraseSentence');
            const studyMode = d.studyMode || 'CN_EN';
            let totalWordCount = d.totalWordCount;
            if (!totalWordCount || totalWordCount === 0) { totalWordCount = (d.phrases || []).reduce((acc:number, item:Phrase) => acc + countWords(item.english) + countWords(item.chinese), 0); }
            let statsOpts = d.statsOptions;
            if (!statsOpts) {
                const shouldIncludeQuantity = (subject === 'English' && contentType === 'PhraseSentence' && studyMode === 'CN_EN') || (subject === 'Chinese' && contentType === 'Word');
                statsOpts = { includeInQuantity: shouldIncludeQuantity, includeInQuality: true };
            }
            return { ...d, subject, contentType, studyMode, phrases: (d.phrases || []).map((p: any) => ({ ...p, maxConsecutiveCorrect: p.maxConsecutiveCorrect ?? p.consecutiveCorrect, totalWrong: p.totalWrong ?? Math.max(0, p.totalReviews - (p.consecutiveCorrect > 0 ? p.consecutiveCorrect : 0)), mastery: p.mastery ?? estimateMastery(p.consecutiveCorrect || 0, p.consecutiveWrong || 0) })), queue: d.queue || [], coolingPool: d.coolingPool || [], stats: d.stats || { totalStudyTimeSeconds: 0, totalReviewCount: 0 }, sessionHistory: d.sessionHistory || [], folderId: d.folderId || undefined, totalWordCount, statsOptions: statsOpts };
        }) : [];
        setDecks(sanitized);
      } catch (e) { setDecks([]); }
    }
    const storedStats = localStorage.getItem(STATS_KEY);
    if (storedStats) { 
        try { 
            const parsed = JSON.parse(storedStats); 
            const today = getTodayDate(); 
            let baseStats = { 
                ...parsed, 
                subjectStats: parsed.subjectStats || { English: 0, Chinese: 0, qualityHistory: [] },
                persistence: parsed.persistence || { 
                    English: { baseScore: 0, lastDate: today, prevDayFinalScore: 0 }, 
                    Chinese: { baseScore: 0, lastDate: today, prevDayFinalScore: 0 } 
                }
            }; 
            
            const checkPersistenceDecay = (subj: 'English' | 'Chinese') => {
                const pData = baseStats.persistence[subj];
                if (pData.lastDate !== today) {
                    let lastX = 0;
                    if (parsed.daily && parsed.daily.date === pData.lastDate) {
                        const acts = parsed.daily.activities || [];
                        lastX = acts.filter((a: any) => (a.deckSubject || 'English') === subj).reduce((sum: number, a: any) => sum + a.count, 0);
                    }
                    
                    const finalScoreLastTime = pData.baseScore + 100 * Math.log(1 + lastX / 100);
                    
                    pData.prevDayFinalScore = finalScoreLastTime;
                    pData.baseScore = finalScoreLastTime * 0.98; // Retain 98% of yesterday's final score
                    pData.lastDate = today;
                }
            };

            checkPersistenceDecay('English');
            checkPersistenceDecay('Chinese');

            if (parsed.daily?.date !== today) { 
                setStats({ ...baseStats, daily: { date: today, reviewCount: 0, correctCount: 0, wrongCount: 0, reviewedPhraseIds: [], studyTimeSeconds: 0, activities: [] } }); 
            } else { 
                setStats(baseStats); 
            } 
        } catch (e) { } 
    }
    const storedFolders = localStorage.getItem(FOLDERS_KEY);
    if (storedFolders) { try { setFolders(JSON.parse(storedFolders)); } catch(e) { setFolders([]); } }
    
    // Load Exam Config
    try {
        const storedExamConfig = localStorage.getItem(EXAM_CONFIG_KEY);
        if (storedExamConfig) {
            const conf = JSON.parse(storedExamConfig);
            setExamTimeLimit(conf.timeLimit || 0);
        }
    } catch {}
  }, []);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(decks)); }, [decks]);
  useEffect(() => { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); }, [stats]);
  useEffect(() => { localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders)); }, [folders]);
  useEffect(() => { localStorage.setItem(EXAM_CONFIG_KEY, JSON.stringify({ timeLimit: examTimeLimit })); }, [examTimeLimit]);

  const handleReviewStat = useCallback((deckId: string, mode: 'STUDY' | 'EXAM', phraseId: string, verdict: 'correct' | 'wrong' | 'half' | boolean, qualityMetric?: { value: number, weight: number }) => {
    const isCorrect = verdict === 'correct' || verdict === true;
    const isWrong = verdict === 'wrong' || verdict === false;
    // const isHalf = verdict === 'half';

    setStats(prev => {
      const deck = decks.find(d => d.id === deckId);
      const subject = deck?.subject || 'English';
      const activities = prev.daily.activities || [];
      const deckName = deck?.name || '未知';
      let newActivities = [...activities];
      const idx = newActivities.findIndex(a => a.deckId === deckId && a.mode === mode);
      
      const countInc = 1;
      const correctInc = isCorrect ? 1 : 0;
      const wrongInc = isWrong ? 1 : 0;
      
      if (idx >= 0) { 
          const old = newActivities[idx];
          newActivities[idx] = { 
              ...old, 
              count: old.count + countInc, 
              correct: old.correct + correctInc, 
              wrong: (old.wrong ?? (old.count - old.correct)) + wrongInc,
              timestamp: Date.now(), 
              deckSubject: subject 
          }; 
      } else { 
          newActivities.push({ 
              deckId, 
              deckName, 
              mode, 
              count: countInc, 
              correct: correctInc, 
              wrong: wrongInc,
              durationSeconds: 0, 
              masteryGain: 0, 
              timestamp: Date.now(), 
              deckSubject: subject 
          }); 
      }
      
      const currentScore = prev.subjectStats[subject] || 0;
      const netChange = isCorrect ? 1 : (isWrong ? -1 : 0);
      const newScore = Math.max(0, currentScore + netChange);
      
      let newQualityHistory = [...(prev.subjectStats.qualityHistory || [])];
      if (qualityMetric !== undefined && getDeckHash(deck, 'quality') === 1) { 
          const safeValue = Math.max(0, qualityMetric.value); 
          newQualityHistory.push({ timestamp: Date.now(), value: safeValue, weight: qualityMetric.weight, subject: subject, deckName: deckName, deckId: deckId }); 
          const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000; 
          newQualityHistory = newQualityHistory.filter(q => q.timestamp > sevenDaysAgo); 
      }
      
      return { 
          ...prev, 
          totalReviewCount: prev.totalReviewCount + 1, 
          subjectStats: { ...prev.subjectStats, [subject]: newScore, qualityHistory: newQualityHistory }, 
          daily: { 
              ...prev.daily, 
              reviewCount: prev.daily.reviewCount + 1, 
              correctCount: prev.daily.correctCount + correctInc, 
              wrongCount: prev.daily.wrongCount + wrongInc, 
              activities: newActivities 
          } 
      };
    });
  }, [decks]);

  const handleSessionComplete = useCallback((deckId: string, mode: 'STUDY' | 'EXAM', durationSeconds: number, correct: number, wrong: number, half: number | undefined, trend?: {t: number, v: number}[], examResults?: { q: string, a: string, isCorrect: boolean }[]) => {
    const halfCount = half || 0;
    const numDuration = Number(durationSeconds) || 0;
    const totalReview = correct + wrong + halfCount;
    
    if (totalReview === 0) return;
    
    setDecks(prevDecks => {
      const targetDeck = prevDecks.find(d => d.id === deckId);
      if (!targetDeck) return prevDecks;
      const endMastery = calculateMasteryValue(targetDeck.phrases);
      const masteryGain = endMastery - sessionStartMastery;
      let newFirstMasteryTime = targetDeck.stats?.firstMastery90Seconds;
      if (endMastery >= 90 && !newFirstMasteryTime) { newFirstMasteryTime = (targetDeck.stats?.totalStudyTimeSeconds || 0) + numDuration; }
      
      const newLog: DeckSessionLog = { 
          id: uuidv4(), 
          timestamp: Date.now(), 
          mode, 
          durationSeconds: numDuration, 
          reviewCount: totalReview, 
          correctCount: correct, 
          wrongCount: wrong, 
          halfCount: halfCount,
          masteryTrend: trend, 
          masteryStart: sessionStartMastery, 
          masteryEnd: endMastery, 
          masteryGain, 
          examResults 
      };
      
      setStats(prevStats => {
        const activities = [...(prevStats.daily.activities || [])];
        const idx = activities.findIndex(a => a.deckId === deckId && a.mode === mode);
        if (idx >= 0) { 
            activities[idx] = { 
                ...activities[idx], 
                durationSeconds: (activities[idx].durationSeconds || 0) + numDuration, 
                masteryGain: (activities[idx].masteryGain || 0) + masteryGain, 
                timestamp: Date.now() 
            }; 
        } else { 
            activities.push({ 
                deckId, 
                deckName: targetDeck.name, 
                mode, 
                count: totalReview, 
                correct, 
                wrong, 
                durationSeconds: numDuration, 
                masteryGain, 
                timestamp: Date.now(), 
                deckSubject: targetDeck.subject 
            }); 
        }
        return { ...prevStats, daily: { ...prevStats.daily, activities } };
      });
      
      return prevDecks.map(d => { 
          if (d.id === deckId) { 
              return { 
                  ...d, 
                  stats: { 
                      ...d.stats, 
                      totalStudyTimeSeconds: (d.stats?.totalStudyTimeSeconds || 0) + numDuration, 
                      totalReviewCount: (d.stats?.totalReviewCount || 0) + totalReview, 
                      firstMastery90Seconds: newFirstMasteryTime 
                  }, 
                  sessionHistory: [newLog, ...d.sessionHistory || []].slice(0, 50) 
              }; 
          } 
          return d; 
      });
    });
  }, [sessionStartMastery]);

  const handleTimeUpdate = useCallback((seconds: number) => { setStats(prev => ({ ...prev, totalStudyTimeSeconds: (prev.totalStudyTimeSeconds || 0) + seconds, daily: { ...prev.daily, studyTimeSeconds: (prev.daily?.studyTimeSeconds || 0) + seconds } })); }, []);
  const updateDeck = useCallback((updatedDeck: Deck) => { if (updatedDeck.phrases !== decks.find(d=>d.id===updatedDeck.id)?.phrases) { let totalWords = 0; updatedDeck.phrases.forEach(p => { if (updatedDeck.subject === 'English') totalWords += countWords(p.english); else totalWords += countWords(p.chinese); }); updatedDeck.totalWordCount = totalWords; } setDecks(prev => prev.map(d => d.id === updatedDeck.id ? { ...d, ...updatedDeck } : d)); }, [decks]);
  const handleCreateDeck = (name: string, phrases: Phrase[], subject: DeckSubject, contentType: ContentType = 'PhraseSentence', studyMode: StudyMode = 'CN_EN') => { let totalWords = 0; phrases.forEach(p => { if (subject === 'English') totalWords += countWords(p.english); else totalWords += countWords(p.chinese); }); const shouldIncludeQuantity = (subject === 'English' && contentType === 'PhraseSentence' && studyMode === 'CN_EN') || (subject === 'Chinese' && contentType === 'Word'); const newDeck: Deck = { id: uuidv4(), name, subject, contentType, studyMode, phrases, queue: phrases.map(p => p.id), stats: { totalStudyTimeSeconds: 0, totalReviewCount: 0 }, sessionHistory: [], folderId: currentFolderId || undefined, totalWordCount: totalWords, statsOptions: { includeInQuantity: shouldIncludeQuantity, includeInQuality: true } }; setDecks(prev => [...prev, newDeck]); setView(AppView.DASHBOARD); };
  const handleAddDecks = (newDecks: Deck[]) => { setDecks(prev => [...prev, ...newDecks]); };
  
  const handleDuplicateDeck = () => { if (!deckToDuplicate) return; const originalIndex = decks.findIndex(d => d.id === deckToDuplicate); if (originalIndex === -1) return; const original = decks[originalIndex]; const newPhrases = original.phrases.map(p => ({ ...p, id: uuidv4(), consecutiveCorrect: keepProgress ? Math.min(p.consecutiveCorrect, mergeCap) : 0, consecutiveWrong: keepProgress ? p.consecutiveWrong : 0, mastery: keepProgress ? (p.mastery || 0) : 0, totalReviews: 0, lastReviewedAt: undefined })); const phraseMap = new Map(); original.phrases.forEach((p, i) => phraseMap.set(p.id, newPhrases[i].id)); const newQueue = keepProgress ? original.queue.map(oldId => phraseMap.get(oldId)).filter(id => id) : newPhrases.map(p => p.id); const newDeck: Deck = { ...original, id: uuidv4(), name: `${original.name} (Copy)`, phrases: newPhrases, queue: newQueue, stats: { totalStudyTimeSeconds: 0, totalReviewCount: 0 }, sessionHistory: [], folderId: original.folderId }; const newDecks = [...decks]; newDecks.splice(originalIndex + 1, 0, newDeck); setDecks(newDecks); setDeckToDuplicate(null); setKeepProgress(false); };
  
  const handleMergeDeck = (targetDeckId: string) => { 
      if (!deckToMerge) return; 
      const sourceDeck = decks.find(d => d.id === deckToMerge); 
      if (!sourceDeck) return; 
      
      const hasFilter = mergeTags.size > 0 || mergeTwMin !== '' || mergeTwMax !== '';
      const phrasesToMerge = hasFilter ? sourceDeck.phrases.filter(p => {
          const tag = getPhraseTag(p);
          const tw = p.totalWrong ?? 0;
          const min = mergeTwMin === '' ? -1 : parseInt(mergeTwMin);
          const max = mergeTwMax === '' ? Infinity : parseInt(mergeTwMax);
          const tagMatch = mergeTags.size > 0 ? mergeTags.has(tag) : true;
          const rangeMatch = (tw >= min && tw <= max);
          if (mergeTags.size > 0 && (mergeTwMin !== '' || mergeTwMax !== '')) return tagMatch && rangeMatch;
          if (mergeTags.size > 0) return tagMatch;
          return rangeMatch;
      }) : sourceDeck.phrases;

      const newPhrasesForTarget = phrasesToMerge.map(p => ({ ...p, id: uuidv4(), consecutiveCorrect: keepProgress ? Math.min(p.consecutiveCorrect, mergeCap) : 0, consecutiveWrong: keepProgress ? p.consecutiveWrong : 0, totalWrong: keepProgress ? (p.totalWrong || 0) : 0, mastery: keepProgress ? (p.mastery || 0) : 0, totalReviews: keepProgress ? p.totalReviews : 0, lastReviewedAt: undefined })); 
      const sourceIds = newPhrasesForTarget.map(p => p.id); 
      
      setDecks(prev => prev.map(d => { 
          if (d.id === targetDeckId) { 
              const mergedPhrases = [...d.phrases, ...newPhrasesForTarget]; 
              const targetQueue = [...d.queue]; 
              let newQueue: string[] = []; 
              if (mergeMethod === 'append') { newQueue = [...targetQueue, ...sourceIds]; } 
              else if (mergeMethod === 'prepend') { newQueue = [...sourceIds, ...targetQueue]; } 
              else if (mergeMethod === 'shuffle') { newQueue = [...targetQueue, ...sourceIds].sort(() => Math.random() - 0.5); } 
              else if (mergeMethod === 'interleave') { 
                  let sIdx = 0; 
                  for (let tIdx = 0; tIdx < targetQueue.length; tIdx++) { 
                      newQueue.push(targetQueue[tIdx]); 
                      if ((tIdx + 1) % mergeRatio === 0 && sIdx < sourceIds.length) { newQueue.push(sourceIds[sIdx++]); } 
                  } 
                  while (sIdx < sourceIds.length) { newQueue.push(sourceIds[sIdx++]); } 
              } 
              return { ...d, phrases: mergedPhrases, queue: newQueue }; 
          } 
          return d; 
      })); 
      
      setDeckToMerge(null); 
      setMergeTarget(null); 
      setKeepProgress(false); 
      setMergeTags(new Set());
      setMergeTwMin('');
      setMergeTwMax('');
  };

  const handleRenameFolder = () => {
      if (!folderToRename || !renameFolderInput.trim()) return;
      setFolders(prev => prev.map(f => f.id === folderToRename ? { ...f, name: renameFolderInput.trim() } : f));
      setFolderToRename(null);
      setRenameFolderInput('');
  };

  const handleMoveFolderConfirm = (targetId: string | undefined) => {
      if (!folderToMove) return;
      if (folderToMove === targetId) return; 
      setFolders(prev => prev.map(f => f.id === folderToMove ? { ...f, parentId: targetId } : f));
      setFolderToMove(null);
  };

  const handleMoveDeck = (targetFolderId: string | undefined) => { if (!deckToMove) return; setDecks(prev => prev.map(d => d.id === deckToMove ? { ...d, folderId: targetFolderId } : d)); setDeckToMove(null); };
  const handleDragStart = (e: React.DragEvent, deckId: string) => { setDraggedDeckId(deckId); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const handleDrop = (e: React.DragEvent, targetDeckId: string) => { e.preventDefault(); if (!draggedDeckId || draggedDeckId === targetDeckId) return; const newDecks = [...decks]; const sourceIndex = newDecks.findIndex(d => d.id === draggedDeckId); const targetIndex = newDecks.findIndex(d => d.id === targetDeckId); if (sourceIndex === -1 || targetIndex === -1) return; const [movedDeck] = newDecks.splice(sourceIndex, 1); newDecks.splice(targetIndex, 0, movedDeck); setDecks(newDecks); setDraggedDeckId(null); };
  const handleCreateFolder = () => { if(!newFolderName.trim()) return; const newFolder: Folder = { id: uuidv4(), name: newFolderName, createdAt: Date.now(), parentId: currentFolderId || undefined }; setFolders(prev => [...prev, newFolder]); setNewFolderName(''); setShowNewFolderModal(false); };
  const deleteFolder = (id: string) => { const currentFolder = folders.find(f => f.id === id); const parentId = currentFolder?.parentId || undefined; setDecks(prev => prev.map(d => d.folderId === id ? { ...d, folderId: parentId } : d)); setFolders(prev => prev.map(f => f.parentId === id ? { ...f, parentId } : f).filter(f => f.id !== id)); setFolderToDelete(null); if (currentFolderId === id) setCurrentFolderId(parentId || null); };
  const handleGlobalProgressReset = () => { if (progressResetInput !== 'RESET') return; setDecks(prev => prev.map(deck => { const resetPhrases = deck.phrases.map(p => ({ ...p, consecutiveCorrect: 0, consecutiveWrong: 0, mastery: 0, totalReviews: 0, lastReviewedAt: undefined })); const shuffledQueue = resetPhrases.map(p => p.id).sort(() => Math.random() - 0.5); return { ...deck, phrases: resetPhrases, queue: shuffledQueue, stats: { totalStudyTimeSeconds: 0, totalReviewCount: 0 }, sessionHistory: [] }; })); setStats({ totalReviewCount: 0, totalPhrasesCount: 0, totalStudyTimeSeconds: 0, subjectStats: { English: 0, Chinese: 0 }, daily: { date: getTodayDate(), reviewCount: 0, correctCount: 0, wrongCount: 0, reviewedPhraseIds: [], studyTimeSeconds: 0, activities: [] } }); setShowGlobalProgressResetConfirm(false); setProgressResetInput(''); setShowSettings(false); };
  const handleFactoryReset = () => { if (factoryResetInput !== 'DELETE') return; setDecks([]); setFolders([]); setStats({ totalReviewCount: 0, totalPhrasesCount: 0, totalStudyTimeSeconds: 0, subjectStats: { English: 0, Chinese: 0 }, daily: { date: getTodayDate(), reviewCount: 0, correctCount: 0, wrongCount: 0, reviewedPhraseIds: [], studyTimeSeconds: 0, activities: [] } }); localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(STATS_KEY); localStorage.removeItem(FOLDERS_KEY); setShowFactoryResetConfirm(false); setFactoryResetInput(''); setShowSettings(false); };

  // Calculate stats for Dashboard
  const breadcrumbs = useMemo(() => {
    const path: Folder[] = [];
    let currentId = currentFolderId;
    while (currentId) {
        const folder = folders.find(f => f.id === currentId);
        if (folder) {
            path.unshift(folder);
            currentId = folder.parentId || null;
        } else {
            break;
        }
    }
    return path;
  }, [currentFolderId, folders]);

  const visibleFolders = useMemo(() => folders.filter(f => (f.parentId || null) === currentFolderId).sort((a,b) => b.createdAt - a.createdAt), [folders, currentFolderId]);
  const visibleDecks = useMemo(() => decks.filter(d => (d.folderId || null) === currentFolderId), [decks, currentFolderId]);

  const getDailyTime = (subject: DeckSubject) => {
    return (stats.daily?.activities || [])
        .filter(a => (decks.find(d => d.id === a.deckId)?.subject || a.deckSubject) === subject)
        .reduce((sum, a) => sum + (a.durationSeconds || 0), 0);
  };
  const enDailyTime = getDailyTime('English');
  const cnDailyTime = getDailyTime('Chinese');

  const calculateSubjectStats = (subj: DeckSubject) => {
    const relevantDecks = decks.filter(d => d.subject === subj);
    const time = relevantDecks.reduce((acc, d) => acc + (d.stats?.totalStudyTimeSeconds || 0), 0);
    const reviews = relevantDecks.reduce((acc, d) => acc + (d.stats?.totalReviewCount || 0), 0);
    const correct = relevantDecks.reduce((acc, d) => {
        return acc + (d.sessionHistory || []).reduce((s, log) => s + log.correctCount, 0);
    }, 0);
    return { time, reviews, correct };
  };
  const enStats = calculateSubjectStats('English');
  const cnStats = calculateSubjectStats('Chinese');

  const englishRealm = getRealmInfo(stats.subjectStats.English || 0, 'English');
  const chineseRealm = getRealmInfo(stats.subjectStats.Chinese || 0, 'Chinese');

  const getRecentMasteredDecks = useCallback((subject: DeckSubject) => {
      const threshold = getMasteryThreshold();
      const masteredDecks = decks.filter(d => {
          if (d.subject !== subject) return false;
          if (!d.stats?.firstMastery90Seconds) return false;
          if (d.statsOptions?.includeInQuantity === false) return false;
          if (!d.phrases.every(p => p.consecutiveCorrect >= threshold)) return false;
          return true;
      });
      return masteredDecks.sort((a, b) => { const tA = a.sessionHistory?.[0]?.timestamp || 0; const tB = b.sessionHistory?.[0]?.timestamp || 0; return tB - tA; }).slice(0, 10);
  }, [decks]);

  const getAllQualitySamples = useCallback((subject: DeckSubject) => {
      const history = (stats.subjectStats.qualityHistory || []) as any[];
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return history.filter(h => {
          if (h.value <= 0) return false;
          if (h.timestamp <= sevenDaysAgo) return false;
          if (h.subject !== subject) return false;
          if (h.deckId) {
              const deck = decks.find(d => d.id === h.deckId);
              if (deck?.statsOptions?.includeInQuality === false) return false;
          }
          return true;
      });
  }, [stats.subjectStats.qualityHistory, decks]);

  const calculateSpiritRootQuantityVal = useCallback((subject: DeckSubject) => {
      const recent10 = getRecentMasteredDecks(subject);
      if (recent10.length === 0) return 0;
      let totalX = 0;
      recent10.forEach(d => { 
          let totalDeckWeight = 0;
          let perfectDeckWeight = 0;
          d.phrases.forEach(p => {
              const w = subject === 'English' ? countWords(p.english) : 1;
              totalDeckWeight += w;
              const historicWrong = p.totalWrong ?? (p.totalReviews - (p.consecutiveCorrect > 0 ? p.consecutiveCorrect : 0));
              const isWrong = historicWrong > 0 || p.consecutiveWrong > 0;
              if (!isWrong && p.totalReviews > 0) perfectDeckWeight += w;
          });
          const effectiveCount = Math.max(0.1, totalDeckWeight - (0.5 * perfectDeckWeight));
          totalX += d.stats!.firstMastery90Seconds! / effectiveCount; 
      });
      return totalX / recent10.length;
  }, [getRecentMasteredDecks]);

  const getWeightedQualityVal = useCallback((subject: DeckSubject) => {
      const samples = getAllQualitySamples(subject);
      if (samples.length === 0) return null;
      let totalWeightedValue = 0;
      let totalWeight = 0;
      samples.forEach(h => {
          const w = h.weight !== undefined ? h.weight : 1; 
          totalWeightedValue += h.value * w;
          totalWeight += w;
      });
      return totalWeight > 0 ? totalWeightedValue / totalWeight : 0;
  }, [getAllQualitySamples]);

  // Calculate Persistence Scores
  const calculatePersistence = (subject: DeckSubject) => {
      const pData = stats.persistence?.[subject] || { baseScore: 0, lastDate: getTodayDate(), prevDayFinalScore: 0 };
      const acts = stats.daily.activities || [];
      const dailyCount = acts.filter(a => (a.deckSubject || 'English') === subject).reduce((sum, a) => sum + a.count, 0);
      const score = pData.baseScore + 100 * Math.log(1 + dailyCount / 100);
      return { score, gradeInfo: getPersistenceGrade(score) };
  };

  const enQuantityVal = calculateSpiritRootQuantityVal('English');
  const cnQuantityVal = calculateSpiritRootQuantityVal('Chinese');
  const enQualityVal = getWeightedQualityVal('English');
  const cnQualityVal = getWeightedQualityVal('Chinese');

  const enQuantity = enQuantityVal ? getSpiritRootQuantity(enQuantityVal, 'English') : { full: '未觉醒', fullEn: 'Unawakened', color: 'text-slate-400' };
  const cnQuantity = cnQuantityVal ? getSpiritRootQuantity(cnQuantityVal, 'Chinese') : { full: '未觉醒', fullEn: 'Unawakened', color: 'text-slate-400' };
  const enQuality = enQualityVal !== null ? getSpiritRootQuality(enQualityVal) : { full: '未觉醒', fullEn: 'Unawakened', color: 'text-slate-400' };
  const cnQuality = cnQualityVal !== null ? getSpiritRootQuality(cnQualityVal) : { full: '未觉醒', fullEn: 'Unawakened', color: 'text-slate-400' };

  const enPersistence = calculatePersistence('English');
  const cnPersistence = calculatePersistence('Chinese');

  const renderDashboard = () => (
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4"><div className="p-3 bg-indigo-50 rounded-2xl border border-indigo-100 shadow-sm cursor-pointer" onClick={() => setCurrentFolderId(null)}><ScrollText className="text-indigo-600 w-8 h-8" /></div><div><h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none">Chant Cultivation Bureau</h1><span className="text-sm font-bold text-slate-500 tracking-widest block mt-1.5">吟诵仙宗</span></div></div>
            <div className="flex gap-3 w-full md:w-auto"><Button onClick={() => setShowDailyReport(true)} variant="outline" className="px-4 py-2 text-sm font-bold border-indigo-100 text-indigo-700"><FileText className="w-4 h-4 mr-2" /> 日报</Button><Button onClick={() => setShowSettings(true)} variant="secondary" className="px-3 py-2 text-sm font-bold flex items-center gap-2"><Database className="w-4 h-4" /> 数据中心</Button><Button onClick={() => setShowNewFolderModal(true)} variant="outline" className="px-4 py-2 text-sm font-bold border-amber-200 text-amber-700 hover:bg-amber-50"><FolderPlus className="w-4 h-4 mr-2" /> 文件夹</Button><Button onClick={() => setView(AppView.IMPORT)} className="px-5 py-2 text-sm font-bold shadow-lg shadow-indigo-100"><PlusCircle className="w-4 h-4 mr-2" /> 新建</Button></div>
          </div>
          
          {currentFolderId === null && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                 <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-all flex flex-col justify-between h-full relative overflow-hidden group"><div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none group-hover:opacity-20 transition-opacity"><Languages className="w-24 h-24 text-indigo-600" /></div>
                 <div>
                     <div className="flex items-baseline justify-between mb-1"><span className="text-slate-400 font-bold uppercase text-xs tracking-wider">英语修为</span></div><div className="text-4xl font-black text-indigo-600 mb-2">{stats.subjectStats.English}</div>
                     <div className="flex gap-3 mb-4">
                         <div className="bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100"><span className="text-[9px] text-indigo-400 block uppercase font-bold">灵根数量 (Speed)</span><span className={`text-xs font-black ${enQuantity.color}`}>{enQuantity.full}</span></div>
                         <div className="bg-purple-50 px-2 py-1 rounded-lg border border-purple-100"><span className="text-[9px] text-purple-400 block uppercase font-bold">灵根质量 (Quality)</span><span className={`text-xs font-black ${enQuality.color}`}>{enQuality.full}</span></div>
                     </div>
                     <div className="mb-4">
                         <div className="flex justify-between items-end mb-1">
                             <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Flame className="w-3 h-3 text-orange-500"/> 坚持 (Persistence)</span>
                             <span className={`text-xs font-black ${enPersistence.gradeInfo.color}`}>{enPersistence.gradeInfo.grade} <span className="text-[9px] text-slate-300 font-bold">({Math.round(enPersistence.score)})</span></span>
                         </div>
                         <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-orange-400 rounded-full transition-all duration-700" style={{ width: `${enPersistence.gradeInfo.progress * 100}%` }}></div></div>
                     </div>
                     <div className="mb-6 flex flex-col items-start gap-1"><span className={`text-xs font-black ${englishRealm.color} whitespace-normal leading-tight`}>{englishRealm.mainName}</span><span className="text-[10px] text-slate-400 font-bold mt-0.5">{englishRealm.subName}</span><div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-1.5"><div className={`h-full transition-all duration-500 ${englishRealm.color.replace('text-', 'bg-').replace('600', '500')}`} style={{ width: `${englishRealm.percent}%` }}></div></div></div>
                 </div><div className="grid grid-cols-2 gap-y-3 gap-x-4 border-t border-slate-50 pt-4"><div><span className="text-[9px] text-slate-400 font-black uppercase block">今日时长</span><span className="text-sm font-bold text-slate-700 lowercase tabular-nums">{formatFullTime(enDailyTime)}</span></div><div><span className="text-[9px] text-slate-400 font-black uppercase block">累计时长</span><span className="text-sm font-bold text-slate-700 lowercase tabular-nums">{formatFullTime(enStats.time)}</span></div><div><span className="text-[9px] text-slate-400 font-black uppercase block">总复习数</span><span className="text-sm font-bold text-slate-700 tabular-nums">{enStats.reviews}</span></div><div><span className="text-[9px] text-slate-400 font-black uppercase block">累计正确</span><span className="text-sm font-bold text-emerald-600 tabular-nums">{enStats.correct}</span></div></div></div>
                 <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-all flex flex-col justify-between h-full relative overflow-hidden group"><div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none group-hover:opacity-20 transition-opacity"><ScrollText className="w-24 h-24 text-emerald-600" /></div>
                 <div>
                     <div className="flex items-baseline justify-between mb-1"><span className="text-slate-400 font-bold uppercase text-xs tracking-wider">语文品阶</span></div><div className="text-4xl font-black text-emerald-600 mb-2">{stats.subjectStats.Chinese}</div>
                     <div className="flex gap-3 mb-4">
                         <div className="bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100"><span className="text-[9px] text-emerald-400 block uppercase font-bold">灵根数量 (Speed)</span><span className={`text-xs font-black ${cnQuantity.color}`}>{cnQuantity.full}</span></div>
                         <div className="bg-cyan-50 px-2 py-1 rounded-lg border border-cyan-100"><span className="text-[9px] text-cyan-400 block uppercase font-bold">灵根质量 (Quality)</span><span className={`text-xs font-black ${cnQuality.color}`}>{cnQuality.full}</span></div>
                     </div>
                     <div className="mb-4">
                         <div className="flex justify-between items-end mb-1">
                             <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Flame className="w-3 h-3 text-orange-500"/> 坚持 (Persistence)</span>
                             <span className={`text-xs font-black ${cnPersistence.gradeInfo.color}`}>{cnPersistence.gradeInfo.grade} <span className="text-[9px] text-slate-300 font-bold">({Math.round(cnPersistence.score)})</span></span>
                         </div>
                         <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-orange-400 rounded-full transition-all duration-700" style={{ width: `${cnPersistence.gradeInfo.progress * 100}%` }}></div></div>
                     </div>
                     <div className="mb-6 flex flex-col items-start gap-1"><span className={`text-xs font-black ${chineseRealm.color} whitespace-normal leading-tight`}>{chineseRealm.mainName}</span><span className="text-[10px] text-slate-400 font-bold mt-0.5">{chineseRealm.subName}</span><div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-1.5"><div className={`h-full transition-all duration-500 ${chineseRealm.color.replace('text-', 'bg-').replace('600', '500')}`} style={{ width: `${chineseRealm.percent}%` }}></div></div></div>
                 </div><div className="grid grid-cols-2 gap-y-3 gap-x-4 border-t border-slate-50 pt-4"><div><span className="text-[9px] text-slate-400 font-black uppercase block">今日时长</span><span className="text-sm font-bold text-slate-700 lowercase tabular-nums">{formatFullTime(cnDailyTime)}</span></div><div><span className="text-[9px] text-slate-400 font-black uppercase block">累计时长</span><span className="text-sm font-bold text-slate-700 lowercase tabular-nums">{formatFullTime(cnStats.time)}</span></div><div><span className="text-[9px] text-slate-400 font-black uppercase block">总复习数</span><span className="text-sm font-bold text-slate-700 tabular-nums">{cnStats.reviews}</span></div><div><span className="text-[9px] text-slate-400 font-black uppercase block">累计正确</span><span className="text-sm font-bold text-emerald-600 tabular-nums">{cnStats.correct}</span></div></div></div>
              </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm font-bold text-slate-500"><button onClick={() => setCurrentFolderId(null)} className={`flex items-center hover:text-indigo-600 transition-colors ${currentFolderId === null ? 'text-indigo-600' : ''}`}><Home className="w-4 h-4 mr-1" /> 首页</button>{breadcrumbs.map((f, i) => (<React.Fragment key={f.id}><ChevronRight className="w-4 h-4 text-slate-300" /><button onClick={() => setCurrentFolderId(f.id)} className={`flex items-center hover:text-indigo-600 transition-colors ${i === breadcrumbs.length - 1 ? 'text-indigo-600' : ''}`}><FolderOpen className="w-4 h-4 mr-1.5" />{f.name}</button></React.Fragment>))}</div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {visibleFolders.map(folder => { const childDecks = decks.filter(d => d.folderId === folder.id); const childFolders = folders.filter(f => f.parentId === folder.id); const totalDecks = childDecks.length; const totalItems = childDecks.reduce((sum, d) => sum + d.phrases.length, 0); const hasContent = totalDecks > 0 || childFolders.length > 0; return ( <div key={folder.id} onClick={() => setCurrentFolderId(folder.id)} className={`group bg-white rounded-2xl p-4 shadow-sm border border-slate-100 hover:shadow-lg hover:border-amber-200 transition-all relative flex flex-col cursor-pointer h-[18rem]`}> <div className="absolute top-3 right-3 z-20 flex gap-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"><button onClick={(e) => { e.stopPropagation(); setFolderToRename(folder.id); setRenameFolderInput(folder.name); }} className="p-1.5 bg-white border border-slate-100 rounded-lg text-slate-400 hover:text-blue-600 shadow-sm"><Edit className="w-3.5 h-3.5" /></button><button onClick={(e) => { e.stopPropagation(); setFolderToMove(folder.id); }} className="p-1.5 bg-white border border-slate-100 rounded-lg text-slate-400 hover:text-amber-600 shadow-sm"><FolderInput className="w-3.5 h-3.5" /></button><button onClick={(e) => { e.stopPropagation(); setFolderToDelete(folder.id); }} className="p-1.5 bg-white border border-slate-100 rounded-lg text-slate-400 hover:text-red-500 shadow-sm"><Trash2 className="w-3.5 h-3.5" /></button></div> <div className="flex items-center gap-3 mb-3 shrink-0"> <FolderIcon className={`w-8 h-8 text-amber-400 fill-amber-50 transition-colors shrink-0`} /> <div className="min-w-0"><h3 className="font-black text-base text-slate-800 leading-tight truncate">{folder.name}</h3><span className="text-[9px] font-bold text-amber-600/60 uppercase tracking-widest mt-0.5 block">文件夹 Folder</span></div> </div> <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0"> {hasContent ? ( <div className="flex flex-col gap-1.5">{[...childFolders, ...childDecks].map((item: any) => { const isDeck = 'phrases' in item; return (<div key={item.id} className="flex items-center gap-2 text-[10px] text-slate-500 font-bold truncate">{isDeck ? (<div className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.subject === 'Chinese' ? 'bg-emerald-400' : 'bg-indigo-400'}`}></div>) : (<FolderIcon className="w-3 h-3 text-amber-300 shrink-0" />)}<span className="truncate opacity-80">{item.name}</span></div>); })}</div> ) : (<div className="h-full flex items-center justify-center text-[10px] text-slate-400 font-medium italic opacity-60">(空文件夹)</div>)} </div> <div className="mt-auto pt-2 border-t border-slate-50 flex justify-between items-center text-[10px] font-black text-slate-400 shrink-0"><span>{childFolders.length} 目录 / {totalDecks} 本</span><span>{totalItems} 词</span></div> </div> )})}
          {visibleDecks.map((deck) => { const mastery = calculateMasteryValue(deck.phrases); const totalReviews = deck.stats?.totalReviewCount || 0; const isMastered = !!deck.stats?.firstMastery90Seconds && deck.phrases.every(p => p.consecutiveCorrect >= 3); const totalCorrect = deck.sessionHistory?.reduce((acc, log) => acc + log.correctCount, 0) || 0; 
          const renderDeckStats = (deck: Deck) => { const statsMap = deck.phrases.reduce((acc, p) => { const key = p.consecutiveWrong > 0 ? `W${p.consecutiveWrong}` : p.consecutiveCorrect > 0 ? `C${p.consecutiveCorrect}` : 'New'; acc[key] = (acc[key] || 0) + 1; return acc; }, {} as Record<string, number>); const keys = Object.keys(statsMap).sort((a, b) => { if (a === 'New') return -1; if (b === 'New') return 1; const typeA = a[0], typeB = b[0], valA = parseInt(a.slice(1)), valB = parseInt(b.slice(1)); if (typeA !== typeB) return typeA === 'W' ? -1 : 1; if (typeA === 'W' && typeB === 'W') return valB - valA; if (typeA === 'C' && typeB === 'C') return valA - valB; return 0; }); return ( <div className="mt-3 pt-3 border-t border-slate-50 flex flex-wrap gap-1.5 min-h-[20px]">{keys.length > 0 ? keys.map(k => { const isW = k.startsWith('W'), isNew = k === 'New'; const label = isNew ? '新' : isW ? `错${k.slice(1)}` : `对${k.slice(1)}`; let customStyle = {}; if (!isNew) { const count = parseInt(k.slice(1)); customStyle = { backgroundColor: isW ? getBadgeColor(0, count) : getBadgeColor(count, 0), color: 'white', borderColor: 'transparent' }; } return ( <span key={k} style={customStyle} className={`text-[9px] px-1.5 py-0.5 rounded border font-black uppercase ${isNew ? 'bg-slate-50 text-slate-400 border-slate-100' : ''}`}>{label}:{statsMap[k]}</span> ); }) : <span className="text-[9px] text-slate-300 italic">暂无内容</span>}</div> ); };
          return ( <div key={deck.id} draggable={true} onDragStart={(e) => handleDragStart(e, deck.id)} onDragOver={(e) => handleDragOver(e)} onDrop={(e) => handleDrop(e, deck.id)} className={`group bg-white rounded-2xl p-4 shadow-sm border ${draggedDeckId === deck.id ? 'border-indigo-400 bg-indigo-50 opacity-50' : 'border-slate-100'} hover:shadow-xl hover:border-indigo-100 transition-all relative flex flex-col h-full animate-in fade-in duration-300 cursor-move min-h-[11rem]`}> <div className="absolute top-3 right-3 z-20 flex gap-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"> <button onClick={(e) => { e.stopPropagation(); setActiveDeckId(deck.id); setView(AppView.EDIT_DECK); }} className="p-1.5 bg-white border border-slate-100 rounded-lg text-slate-400 hover:text-blue-600 shadow-sm"><Edit className="w-3.5 h-3.5" /></button> <button onClick={(e) => { e.stopPropagation(); setDeckToDuplicate(deck.id); }} className="p-1.5 bg-white border border-slate-100 rounded-lg text-slate-400 hover:text-indigo-600 shadow-sm"><CopyPlus className="w-3.5 h-3.5" /></button> <button onClick={(e) => { e.stopPropagation(); setDeckToMerge(deck.id); }} className="p-1.5 bg-white border border-slate-100 rounded-lg text-slate-400 hover:text-emerald-600 shadow-sm"><GitMerge className="w-3.5 h-3.5" /></button> <button onClick={(e) => { e.stopPropagation(); setDeckToMove(deck.id); }} className="p-1.5 bg-white border border-slate-100 rounded-lg text-slate-400 hover:text-amber-600 shadow-sm"><FolderInput className="w-3.5 h-3.5" /></button> <button onClick={(e) => { e.stopPropagation(); setDeckToDelete(deck.id); }} className="p-1.5 bg-white border border-slate-100 rounded-lg text-slate-400 hover:text-red-500 shadow-sm"><Trash2 className="w-3.5 h-3.5" /></button> </div> <div className="cursor-pointer h-full flex flex-col" onClick={() => { setSessionStartMastery(mastery); setActiveDeckId(deck.id); setView(AppView.STUDY); }}> <div className="flex items-start justify-between mb-3"> <div className={`p-2.5 rounded-xl group-hover:bg-white group-hover:shadow-md transition-all shrink-0 ${deck.subject === 'Chinese' ? 'bg-emerald-50 text-emerald-600 group-hover:text-emerald-700' : 'bg-indigo-50 text-indigo-600 group-hover:text-indigo-700'}`}> {deck.subject === 'Chinese' ? <FileText className="w-5 h-5" /> : <BookOpen className="w-5 h-5" />} </div> </div> <div className="mb-4 pr-16 relative"> <h3 className="font-black text-base text-slate-800 truncate leading-tight mb-1">{deck.name}</h3> <div className="flex flex-wrap gap-1.5"> <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${deck.subject === 'Chinese' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>{deck.subject === 'Chinese' ? '语文' : '英语'}</span> <span className="text-[9px] font-bold text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">{getDeckLabel(deck)} {deck.subject !== 'Chinese' && `· ${deck.studyMode === 'CN_EN' ? '英→中' : '中→英'}`}</span> <span className="text-[9px] font-bold text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">{deck.phrases.length} 词</span> </div> </div> <div className="space-y-3 mb-4 mt-auto"> <div className="flex flex-wrap gap-2 text-[10px] font-bold text-slate-500"> <span className="bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100 flex items-center gap-1" title="学习时长"><Clock className="w-3 h-3 text-blue-400" /><span className="lowercase tabular-nums">{formatFullTime(deck.stats?.totalStudyTimeSeconds || 0)}</span></span> <span className="bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100 flex items-center gap-1" title="复习总次数"><Hash className="w-3 h-3 text-indigo-400" /><span className="tabular-nums">{totalReviews}</span></span> <span className="bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100 text-emerald-600 flex items-center gap-1" title="累计正确"><CheckCircle2 className="w-3 h-3" /><span className="tabular-nums">{totalCorrect}</span></span> {isMastered && (<span className="bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 text-emerald-700 flex items-center gap-1 shadow-sm" title="已达标 (Mastered)"><CheckCircle2 className="w-3 h-3 text-emerald-500" /><span className="tabular-nums">90%+</span></span>)} </div> <div className="pt-1"> <div className="flex justify-between text-[9px] font-black uppercase mb-1" style={{ color: getDynamicColor(mastery) }}><span>掌握度</span><span>{mastery.toFixed(2)}%</span></div> <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden shadow-inner relative"><div className="h-full transition-all duration-700 ease-out" style={{width: `${mastery}%`, backgroundColor: getDynamicColor(mastery)}}></div></div> </div> </div> </div> <div className="grid grid-cols-2 gap-2 mt-auto"> <Button variant="primary" className={`text-[10px] py-2 font-black rounded-lg ${deck.subject === 'Chinese' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`} onClick={() => { setSessionStartMastery(mastery); setActiveDeckId(deck.id); setView(AppView.STUDY); }}><Play className="w-3 h-3 mr-1" /> 复习</Button> <Button variant="secondary" className="text-[10px] py-2 font-black rounded-lg" onClick={(e) => { e.stopPropagation(); setActiveDeckId(deck.id); const tags = new Set<string>(); tags.add('新'); deck.phrases.forEach(p => tags.add(getPhraseTag(p))); setExamTags(tags); setExamTwMin(''); setExamTwMax(''); setTempExamCount(Math.min(20, deck.phrases.length)); setShowExamSetup(true); }}><GraduationCap className="w-3 h-3 mr-1" /> 考试</Button> </div> {renderDeckStats(deck)} </div> ); })}
        </div>
      </div>
  );

  return (
    <>
      {view === AppView.DASHBOARD && renderDashboard()}
      {showExamSetup && activeDeckId && (() => {
          const deck = decks.find(d => d.id === activeDeckId);
          if (!deck) return null;
          
          const availableTags = Array.from(new Set(['新', ...deck.phrases.map(p => getPhraseTag(p))])).sort((a, b) => {
              if (a === '新') return -1; if (b === '新') return 1;
              const typeA = a.startsWith('错') ? 'W' : 'C';
              const typeB = b.startsWith('错') ? 'W' : 'C';
              const valA = parseInt(a.slice(1)) || 0;
              const valB = parseInt(b.slice(1)) || 0;
              if (typeA !== typeB) return typeA === 'W' ? -1 : 1;
              if (typeA === 'W') return valB - valA; 
              return valA - valB;
          });

          const getTagColor = (tag: string) => {
              if (tag === '新') return '#94a3b8';
              const type = tag.charAt(0);
              const val = parseInt(tag.slice(1));
              if (type === '对') return getBadgeColor(val, 0);
              if (type === '错') return getBadgeColor(0, val);
              return '#94a3b8';
          };

          const toggleTag = (tag: string) => {
              const newSet = new Set(examTags);
              if (newSet.has(tag)) newSet.delete(tag); else newSet.add(tag);
              setExamTags(newSet);
          };

          const selectGroup = (type: 'New' | 'Wrong' | 'Correct' | 'All') => {
              const newSet = new Set(examTags);
              if (type === 'All') {
                  const allSelected = availableTags.every(t => newSet.has(t));
                  if (allSelected) newSet.clear(); else availableTags.forEach(t => newSet.add(t));
              } else {
                  const groupTags = availableTags.filter(t => {
                      if (type === 'New') return t === '新';
                      if (type === 'Wrong') return t.startsWith('错');
                      if (type === 'Correct') return t.startsWith('对');
                      return false;
                  });
                  const allSelected = groupTags.every(t => newSet.has(t));
                  if (allSelected) { groupTags.forEach(t => newSet.delete(t)); } else { groupTags.forEach(t => newSet.add(t)); }
              }
              setExamTags(newSet);
          };

          const hasTagFilter = examTags.size > 0;
          const hasRangeFilter = examTwMin !== '' || examTwMax !== '';

          const filteredPhrases = deck.phrases.filter(p => {
              const tag = getPhraseTag(p);
              const tw = p.totalWrong ?? 0;
              const twMinVal = examTwMin === '' ? -1 : parseInt(examTwMin);
              const twMaxVal = examTwMax === '' ? Infinity : parseInt(examTwMax);
              
              const tagMatch = examTags.has(tag);
              const twMatch = (examTwMin !== '' || examTwMax !== '') ? (tw >= twMinVal && tw <= twMaxVal) : true; 
              
              if (!hasTagFilter && !hasRangeFilter) return true; 
              if (hasTagFilter && hasRangeFilter) return tagMatch && twMatch; 
              if (hasTagFilter) return tagMatch;
              if (hasRangeFilter) return (tw >= twMinVal && tw <= twMaxVal);
              
              return true;
          });
          
          const maxCount = filteredPhrases.length;
          
          return (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full animate-in zoom-in-95 max-h-[90vh] flex flex-col">
                    <div className="flex items-center gap-3 mb-4 shrink-0">
                        <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600"><GraduationCap className="w-6 h-6" /></div>
                        <div><h3 className="text-lg font-black text-slate-800">考试准备</h3><p className="text-xs text-slate-400">选择出题范围与数量</p></div>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
                        <div className="mb-4">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block">1. 筛选出题范围 Filter Scope</label>
                            <div className="mb-3">
                                <div className="flex justify-between items-center mb-2"><div className="text-[10px] font-bold text-slate-400 uppercase">按状态 Status</div><div className="text-[9px] font-bold text-slate-300">{hasTagFilter ? `${examTags.size} selected` : 'Any Status'}</div></div>
                                <div className="flex flex-wrap gap-2 mb-2"><button onClick={()=>selectGroup('All')} className="px-2 py-1 rounded border border-slate-200 text-[10px] font-bold hover:bg-slate-50">全选/全不选</button><button onClick={()=>selectGroup('New')} className="px-2 py-1 rounded border border-slate-200 text-[10px] font-bold hover:bg-slate-50 text-slate-500">新词</button><button onClick={()=>selectGroup('Wrong')} className="px-2 py-1 rounded border border-slate-200 text-[10px] font-bold hover:bg-slate-50 text-rose-500">错词</button><button onClick={()=>selectGroup('Correct')} className="px-2 py-1 rounded border border-slate-200 text-[10px] font-bold hover:bg-slate-50 text-emerald-600">熟词</button></div>
                                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar p-1 border border-slate-100 rounded-xl bg-slate-50/50">{availableTags.map(tag => (<button key={tag} onClick={()=>toggleTag(tag)} className={`px-2 py-1 rounded-lg text-[10px] font-black border transition-all flex items-center gap-1 ${examTags.has(tag) ? 'text-white shadow-sm border-transparent' : 'bg-white text-slate-400 border-slate-200 hover:border-indigo-300'}`} style={examTags.has(tag) ? { backgroundColor: getTagColor(tag) } : {}}>{tag}{examTags.has(tag) && <Check className="w-2.5 h-2.5"/>}</button>))}</div>
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-2"><div className="text-[10px] font-bold text-slate-400 uppercase">按错误历史 Total Wrong</div><div className="text-[9px] font-bold text-slate-300">{hasRangeFilter ? 'Active' : 'Any Count'}</div></div>
                                <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100"><span className="text-xs font-bold text-slate-500">Range:</span><input type="number" min="0" value={examTwMin} onChange={e=>setExamTwMin(e.target.value)} className="w-16 p-1 text-center font-black border-2 border-slate-200 rounded-lg focus:border-indigo-500 outline-none text-slate-700 bg-white text-sm" placeholder="Min" /><span className="text-xs font-bold text-slate-400">to</span><input type="number" min="0" value={examTwMax} onChange={e=>setExamTwMax(e.target.value)} className="w-16 p-1 text-center font-black border-2 border-slate-200 rounded-lg focus:border-indigo-500 outline-none text-slate-700 bg-white text-sm" placeholder="Max" /></div>
                            </div>
                            <div className="text-right mt-3 text-xs font-bold text-slate-500 bg-slate-100/50 p-2 rounded-lg border border-slate-200">符合条件的题目: <span className="text-indigo-600 font-black text-sm">{maxCount}</span> <span className="text-slate-400">/ {deck.phrases.length}</span></div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">2. 题目数量 Count</label>
                                <div className="flex items-center gap-2"><input type="number" min="1" max={Math.max(1, maxCount)} value={Math.min(tempExamCount, maxCount)} onChange={(e) => setTempExamCount(parseInt(e.target.value) || 0)} className="w-full p-2 border border-slate-300 rounded-xl text-center font-black text-xl focus:ring-2 focus:ring-indigo-500 outline-none shadow-inner" disabled={maxCount === 0} /><span className="text-slate-400 text-sm whitespace-nowrap font-bold">题</span></div>
                            </div>
                            <div>
                                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">3. 限时 Time Limit</label>
                                <div className="flex items-center gap-2">
                                    <input type="number" min="0" value={examTimeLimit} onChange={(e) => setExamTimeLimit(Math.max(0, parseInt(e.target.value) || 0))} className="w-full p-2 text-center font-black border border-slate-300 rounded-xl text-xl focus:ring-2 focus:ring-indigo-500 outline-none shadow-inner" />
                                    <span className="text-slate-400 text-sm whitespace-nowrap font-bold">秒</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-3 pt-4 border-t border-slate-100 shrink-0"><Button variant="ghost" fullWidth onClick={() => setShowExamSetup(false)}>取消</Button><Button fullWidth className="font-black" disabled={maxCount === 0} onClick={() => { setExamConfig({ count: Math.min(tempExamCount, maxCount), candidateIds: filteredPhrases.map(p => p.id) }); setShowExamSetup(false); setView(AppView.EXAM_SESSION); }}>开始考试</Button></div>
                </div>
            </div>
          );
      })()}
      {/* ... (Keep existing modals) ... */}
      {showNewFolderModal && (<div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4"><div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full animate-in zoom-in-95"><div className="flex items-center gap-3 mb-4"><div className="p-2 bg-amber-100 rounded-lg text-amber-600"><FolderPlus className="w-6 h-6" /></div><h3 className="text-lg font-black text-slate-800">新建文件夹</h3></div><input autoFocus type="text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()} className="w-full p-3 border-2 border-slate-100 rounded-xl font-bold mb-4 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 outline-none" placeholder="输入文件夹名称..." /><div className="flex gap-3"><Button variant="ghost" fullWidth onClick={() => setShowNewFolderModal(false)} className="font-bold">取消</Button><Button fullWidth onClick={handleCreateFolder} className="bg-amber-500 hover:bg-amber-600 text-white font-black shadow-lg shadow-amber-100">创建</Button></div></div></div>)}
      {folderToRename && (<div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4"><div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full animate-in zoom-in-95"><div className="flex items-center gap-3 mb-4"><div className="p-2 bg-blue-100 rounded-lg text-blue-600"><Edit className="w-6 h-6" /></div><h3 className="text-lg font-black text-slate-800">重命名文件夹</h3></div><input autoFocus type="text" value={renameFolderInput} onChange={(e) => setRenameFolderInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRenameFolder()} className="w-full p-3 border-2 border-slate-100 rounded-xl font-bold mb-4 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none" placeholder="新文件夹名称..." /><div className="flex gap-3"><Button variant="ghost" fullWidth onClick={() => setFolderToRename(null)} className="font-bold">取消</Button><Button fullWidth onClick={handleRenameFolder} className="bg-blue-500 hover:bg-blue-600 text-white font-black shadow-lg shadow-blue-100">保存</Button></div></div></div>)}
      {folderToMove && (<div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4"><div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full animate-in zoom-in-95 flex flex-col max-h-[80vh]"><div className="flex items-center gap-3 mb-4 shrink-0"><div className="p-2 bg-amber-100 rounded-lg text-amber-600"><FolderInput className="w-6 h-6" /></div><div><h3 className="text-lg font-black text-slate-800">移动文件夹</h3><p className="text-xs text-slate-400">选择目标位置</p></div></div><div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar p-1"><button onClick={() => handleMoveFolderConfirm(undefined)} className={`w-full p-3 rounded-xl border-2 transition-all flex items-center gap-3 ${!currentFolderId ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-slate-100 hover:border-amber-200'}`} disabled={folderToMove === undefined}><Home className="w-5 h-5 text-slate-400" /><span className="font-bold text-sm">根目录 (首页)</span></button>{folders.filter(f => {
          const invalid = new Set<string>();
          invalid.add(folderToMove!);
          const queue = [folderToMove!];
          while(queue.length > 0) {
              const curr = queue.shift()!;
              const children = folders.filter(child => child.parentId === curr);
              children.forEach(c => { invalid.add(c.id); queue.push(c.id); });
          }
          return !invalid.has(f.id);
      }).map(f => (<button key={f.id} onClick={() => handleMoveFolderConfirm(f.id)} className={`w-full p-3 rounded-xl border-2 transition-all flex items-center gap-3 ${f.id === folders.find(fd => fd.id === folderToMove)?.parentId ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-slate-100 hover:border-amber-200'}`}><FolderIcon className="w-5 h-5 text-amber-400" /><span className="font-bold text-sm truncate">{f.name}</span></button>))}</div><div className="mt-4 pt-4 border-t border-slate-100 shrink-0"><Button variant="ghost" fullWidth onClick={() => setFolderToMove(null)}>取消</Button></div></div></div>)}
      {showSettings && (<div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[200] flex items-center justify-center p-4"><div className="bg-white rounded-[2rem] shadow-2xl p-6 max-w-md w-full animate-in zoom-in-95 max-h-[90vh] overflow-y-auto custom-scrollbar"><div className="flex justify-between items-center mb-6"><h3 className="text-xl font-black flex items-center gap-2 text-slate-800"><Database className="w-6 h-6 text-slate-300" /> 数据中心</h3><button onClick={() => setShowSettings(false)} className="p-1 hover:bg-slate-100 rounded-full transition-colors"><X className="w-6 h-6" /></button></div><div className="space-y-6"><div className="bg-slate-50 p-5 rounded-2xl border border-slate-200"><div className="flex items-center gap-2 mb-2 text-slate-600 font-black text-xs uppercase tracking-widest"><Database className="w-4 h-4" /> 存档管理</div><p className="text-xs text-slate-500 mb-4 font-medium leading-relaxed">数据存储在浏览器本地。防止数据丢失或迁移设备，请定期导出。</p><div className="grid grid-cols-2 gap-3"><Button onClick={() => { const now = new Date(); const timeStr = `${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}`; const backup: BackupData = { version: 1, timestamp: Date.now(), decks: decks, stats: stats, folders: folders }; const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup)); const dl = document.createElement('a'); dl.setAttribute("href", dataStr); dl.setAttribute("download", `chant_cultivation_bureau_backup_${getTodayDate()}_${timeStr}.json`); dl.click(); }} fullWidth variant="outline" className="font-black rounded-xl text-xs"><Download className="w-3.5 h-3.5 mr-1.5" /> 导出存档</Button><div className="w-full"><input type="file" ref={fileInputRef} onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = (ev) => { try { const b = JSON.parse(ev.target?.result as string) as BackupData; setDecks(b.decks.map(d => ({...d, subject: d.subject || 'English'}))); setStats({...b.stats, subjectStats: b.stats.subjectStats || { English: 0, Chinese: 0, qualityHistory: [] }}); if (b.folders) setFolders(b.folders); setImportStatus('success'); setTimeout(() => setShowSettings(false), 1500); } catch(e) { setImportStatus('error'); } }; r.readAsText(f); }} className="hidden" /><Button onClick={() => fileInputRef.current?.click()} fullWidth variant="outline" className={`font-black rounded-xl text-xs ${importStatus==='success'?'text-emerald-600 bg-emerald-50':''}`}><Upload className="w-3.5 h-3.5 mr-1.5" /> {importStatus==='success'?'成功':'导入存档'}</Button></div></div></div><div className="pt-2 space-y-4"><div className="bg-amber-50/50 p-5 rounded-2xl border border-amber-100"><div className="flex items-center gap-2 mb-2 text-amber-700 font-black text-xs uppercase tracking-widest"><RotateCcw className="w-4 h-4" /> 全局重置修行</div><p className="text-xs text-amber-600/70 mb-4 font-medium leading-relaxed">保留所有单词本内容（题目、答案、笔记），但将所有词汇状态重置为“新词”，清空所有连对/连错记录、累计时长与修为境界。</p><Button onClick={() => setShowGlobalProgressResetConfirm(true)} fullWidth variant="outline" className="font-black py-3 rounded-xl border-amber-200 text-amber-700 hover:bg-amber-100 text-sm">仅重置进度 (保留词库)</Button></div><div className="bg-rose-50/50 p-5 rounded-2xl border border-rose-100"><div className="flex items-center gap-2 mb-2 text-rose-700 font-black text-xs uppercase tracking-widest"><ShieldAlert className="w-4 h-4" /> 危险区域</div><p className="text-xs text-rose-600/70 mb-4 font-medium leading-relaxed">不可逆操作。删除所有文件夹、单词本、背诵记录与统计数据。应用将完全恢复至初始状态。</p><Button onClick={() => setShowFactoryResetConfirm(true)} fullWidth variant="danger" className="font-black py-3 rounded-xl shadow-lg shadow-rose-100 border-0">彻底格式化全站</Button></div></div></div></div></div>)}
      {showGlobalProgressResetConfirm && (<div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[300] flex items-center justify-center p-4"><div className="bg-white rounded-[2rem] shadow-2xl p-8 max-w-sm w-full animate-in zoom-in-95 text-center space-y-6"><div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto"><RotateCcw className="w-8 h-8 text-amber-600" /></div><div><h3 className="text-xl font-black text-slate-900 mb-2">重置进度确认</h3><p className="text-slate-500 text-sm leading-relaxed text-left">保留所有单词本题目和注释，但抹除全站所有连对记录、学习时长和历史记录，并随机打乱所有题目顺序。</p></div><div className="space-y-3"><p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center justify-center gap-2"><Keyboard className="w-3 h-3"/> 请输入 <span className="text-amber-600 font-black">RESET</span> 确认</p><input autoFocus value={progressResetInput} onChange={e=>setProgressResetInput(e.target.value)} className="w-full p-4 border-2 border-amber-100 rounded-2xl text-center font-black text-lg focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none" placeholder="RESET" /></div><div className="flex flex-col gap-2"><Button onClick={handleGlobalProgressReset} disabled={progressResetInput !== 'RESET'} className="py-4 font-black rounded-2xl bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-100 border-0">确认重置并打乱</Button><Button onClick={() => { setShowGlobalProgressResetConfirm(false); setProgressResetInput(''); }} variant="ghost" className="py-4 font-black">取消</Button></div></div></div>)}
      {showFactoryResetConfirm && (<div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[300] flex items-center justify-center p-4"><div className="bg-white rounded-[2rem] shadow-2xl p-8 max-w-sm w-full animate-in zoom-in-95 text-center space-y-6"><div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto"><ShieldAlert className="w-8 h-8 text-rose-600" /></div><div><h3 className="text-xl font-black text-slate-900 mb-2">彻底格式化确认</h3><p className="text-slate-500 text-sm leading-relaxed">彻底抹除一切数据（包括所有单词本、文件夹、统计历史）。操作不可逆，请谨慎！</p></div><div className="space-y-3"><p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center justify-center gap-2"><Keyboard className="w-3 h-3"/> 请输入 <span className="text-rose-600 font-black">DELETE</span> 确认</p><input autoFocus value={factoryResetInput} onChange={e=>setFactoryResetInput(e.target.value)} className="w-full p-4 border-2 border-rose-100 rounded-2xl text-center font-black text-lg focus:ring-4 focus:ring-rose-500/20 focus:border-rose-500 outline-none" placeholder="DELETE" /></div><div className="flex flex-col gap-2"><Button onClick={handleFactoryReset} disabled={factoryResetInput !== 'DELETE'} variant="danger" className="py-4 font-black rounded-2xl shadow-lg shadow-rose-100 border-0">是的，全部删除</Button><Button onClick={() => { setShowFactoryResetConfirm(false); setFactoryResetInput(''); }} variant="ghost" className="py-4 font-black">点错了，取消</Button></div></div></div>)}
      {showDailyReport && <DailyReport stats={stats.daily} globalStats={stats.subjectStats} decks={decks} onClose={() => setShowDailyReport(false)} persistence={stats.persistence} />}
      {deckToDelete && (<div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"><div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full animate-in zoom-in-95"><div className="flex flex-col items-center text-center space-y-4"><div className="p-3 bg-red-100 rounded-full"><AlertTriangle className="w-8 h-8 text-red-600" /></div><h3 className="text-lg font-bold text-slate-900">确定删除吗？</h3><div className="flex gap-3 w-full pt-2"><Button variant="secondary" fullWidth onClick={() => setDeckToDelete(null)}>取消</Button><Button variant="danger" fullWidth onClick={() => { setDecks(prev => prev.filter(d => d.id !== deckToDelete)); setDeckToDelete(null); }}>确认删除</Button></div></div></div></div>)}
      {folderToDelete && (<div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"><div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full animate-in zoom-in-95"><div className="flex flex-col items-center text-center space-y-4"><div className="p-3 bg-red-100 rounded-full"><AlertTriangle className="w-8 h-8 text-red-600" /></div><div><h3 className="text-lg font-bold text-slate-900">删除文件夹？</h3><p className="text-sm text-slate-500 mt-2">其中的单词本和子文件夹将移至上一级，不会被删除。</p></div><div className="flex gap-3 w-full pt-2"><Button variant="secondary" fullWidth onClick={() => setFolderToDelete(null)}>取消</Button><Button variant="danger" fullWidth onClick={() => deleteFolder(folderToDelete)}>确认删除</Button></div></div></div></div>)}
      {deckToDuplicate && (<div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4"><div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full animate-in zoom-in-95"><div className="flex items-center gap-3 mb-4"><div className="p-2 bg-indigo-100 rounded-lg text-indigo-600"><CopyPlus className="w-6 h-6" /></div><h3 className="text-lg font-black text-slate-800">确认复制</h3></div><p className="text-sm text-slate-500 mb-6 font-medium leading-relaxed">将创建 <span className="font-black text-slate-800">"{decks.find(d => d.id === deckToDuplicate)?.name}"</span> 的副本。</p><div className="mb-6 space-y-4"><label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-all"><div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${keepProgress ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300 bg-white'}`}>{keepProgress && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}</div><input type="checkbox" checked={keepProgress} onChange={e => setKeepProgress(e.target.checked)} className="hidden" /><div className="text-xs"><span className="block font-black text-slate-700">保留掌握度 (Keep Mastery)</span><span className="block text-slate-400 font-medium">勾选将保留连对/连错状态；不勾选则全部重置为新词</span></div></label>{keepProgress && (<div className="animate-in fade-in slide-in-from-top-2"><label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">连对上限 (Cap)</label><div className="flex items-center gap-3"><input type="number" min="0" max="100" value={mergeCap} onChange={(e) => setMergeCap(parseInt(e.target.value) || 0)} className="w-20 p-2 text-center font-black border-2 border-slate-200 rounded-xl focus:border-indigo-500 outline-none" /><span className="text-xs text-slate-500 font-medium">防止高熟练度词组(如连对10+)在合并后被推得太远</span></div></div>)}</div><div className="flex gap-3"><Button variant="ghost" fullWidth onClick={() => { setDeckToDuplicate(null); setKeepProgress(false); }}>取消</Button><Button fullWidth onClick={() => handleDuplicateDeck()} className="bg-indigo-600 hover:bg-indigo-700 text-white font-black shadow-lg">确认复制</Button></div></div></div>)}
      {deckToMerge && (<div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full animate-in zoom-in-95 flex flex-col max-h-[90vh]">
              {!mergeTarget ? (<><div className="flex items-center gap-3 mb-4 shrink-0"><div className="p-2 bg-emerald-100 rounded-lg text-emerald-600"><GitMerge className="w-6 h-6" /></div><div><h3 className="text-lg font-black text-slate-800">合并到...</h3><p className="text-xs text-slate-400">选择要追加到的目标词组本</p></div></div>
              <div className="mb-4 shrink-0">
                  <div className="text-[10px] font-bold text-slate-400 mb-2 uppercase flex justify-between"><span>可选：仅合并部分词组</span><span>Filter Source</span></div>
                  <div className="flex gap-2 mb-2 overflow-x-auto no-scrollbar pb-1">{Array.from(new Set(['新', ...(decks.find(d => d.id === deckToMerge)?.phrases.map(p => getPhraseTag(p)) || [])])).sort().map(tag => (<button key={tag} onClick={()=>{const newSet = new Set(mergeTags); if(newSet.has(tag)) newSet.delete(tag); else newSet.add(tag); setMergeTags(newSet);}} className={`px-2 py-1 rounded text-[10px] font-black border shrink-0 whitespace-nowrap transition-all ${mergeTags.has(tag) ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-500 border-slate-200'}`}>{tag}</button>))}</div>
                  <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100"><span className="text-[10px] font-bold text-slate-500 uppercase">Wrong:</span><input type="number" min="0" value={mergeTwMin} onChange={e=>setMergeTwMin(e.target.value)} className="w-12 p-1 text-center font-black border border-slate-200 rounded text-xs outline-none" placeholder="Min" /><span className="text-[10px] text-slate-400">-</span><input type="number" min="0" value={mergeTwMax} onChange={e=>setMergeTwMax(e.target.value)} className="w-12 p-1 text-center font-black border border-slate-200 rounded text-xs outline-none" placeholder="Max" /><div className="text-[9px] text-slate-400 ml-auto font-bold">{mergeTags.size > 0 || mergeTwMin || mergeTwMax ? 'Filtered' : 'All'}</div></div>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar p-1">{decks.filter(d => d.id !== deckToMerge).map(d => (<button key={d.id} onClick={() => setMergeTarget(d)} className="w-full p-3 rounded-xl border-2 border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition-all flex items-center gap-3 text-left group"><div className={`p-2 rounded-lg ${d.subject === 'Chinese' ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>{d.subject === 'Chinese' ? <FileText className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}</div><div className="min-w-0 flex-1"><div className="font-bold text-sm truncate text-slate-800 group-hover:text-emerald-800">{d.name}</div><div className="flex gap-1 mt-1"><span className={`text-[9px] px-1.5 py-0.5 rounded font-black border ${d.subject === 'Chinese' ? 'text-emerald-500 border-emerald-100 bg-emerald-50' : 'text-indigo-500 border-indigo-100 bg-indigo-50'}`}>{d.subject === 'Chinese' ? '语文' : '英语'}</span><span className="text-[9px] px-1.5 py-0.5 rounded font-bold text-slate-400 border border-slate-100 bg-slate-50">{getDeckLabel(d)} {d.subject !== 'Chinese' && `· ${d.studyMode === 'CN_EN' ? '中→英' : '英→中'}`}</span></div></div><div className="text-xs font-black text-slate-300 group-hover:text-emerald-400">{d.phrases.length}</div></button>))}{decks.length <= 1 && <div className="text-center text-slate-400 text-sm py-4">没有其他词组本可合并</div>}</div><div className="mt-4 pt-4 border-t border-slate-100 shrink-0"><Button variant="ghost" fullWidth onClick={() => { setDeckToMerge(null); setMergeTags(new Set()); setMergeTwMin(''); setMergeTwMax(''); }}>取消</Button></div></>) : (<><div className="flex items-center gap-3 mb-4 shrink-0"><div className="p-2 bg-emerald-100 rounded-lg text-emerald-600"><GitMerge className="w-6 h-6" /></div><h3 className="text-lg font-black text-slate-800">确认合并</h3></div><div className="bg-slate-50 rounded-xl p-4 mb-4 border border-slate-200 space-y-3"><div className="flex items-center justify-between text-xs font-bold text-slate-500"><span>来源 Source</span><ArrowRight className="w-3.5 h-3.5 text-slate-300"/><span>目标 Target</span></div><div className="flex items-center justify-between text-sm font-black text-slate-800"><span className="truncate max-w-[40%]">{decks.find(d => d.id === deckToMerge)?.name}</span><div className="h-px bg-slate-300 flex-1 mx-2"></div><span className="truncate max-w-[40%] text-emerald-600">{mergeTarget.name}</span></div></div><div className="mb-4 space-y-4"><label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-all"><div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${keepProgress ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 bg-white'}`}>{keepProgress && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}</div><input type="checkbox" checked={keepProgress} onChange={e => setKeepProgress(e.target.checked)} className="hidden" /><div className="text-xs"><span className="block font-black text-slate-700">保留掌握度 (Keep Mastery)</span><span className="block text-slate-400 font-medium">合并后保留原词组的熟练度状态</span></div></label>{keepProgress && (<div className="animate-in fade-in slide-in-from-top-2"><label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">连对上限 (Cap)</label><div className="flex items-center gap-3"><input type="number" min="0" max="100" value={mergeCap} onChange={(e) => setMergeCap(parseInt(e.target.value) || 0)} className="w-20 p-2 text-center font-black border-2 border-slate-200 rounded-xl focus:border-indigo-500 outline-none" /><span className="text-xs text-slate-500 font-medium">0表示重置连对但保留错误记录</span></div></div>)}</div>
      <div className="mb-6 space-y-2">
          <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">合并方式 Strategy</label>
          <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setMergeMethod('append')} className={`p-3 rounded-xl border-2 text-left transition-all ${mergeMethod === 'append' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100 hover:border-slate-300'}`}><div className="flex items-center gap-2 mb-1"><ArrowDownToLine className={`w-4 h-4 ${mergeMethod==='append'?'text-emerald-600':'text-slate-400'}`} /><span className={`font-black text-xs ${mergeMethod==='append'?'text-emerald-700':'text-slate-600'}`}>追加到末尾</span></div></button>
              <button onClick={() => setMergeMethod('prepend')} className={`p-3 rounded-xl border-2 text-left transition-all ${mergeMethod === 'prepend' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100 hover:border-slate-300'}`}><div className="flex items-center gap-2 mb-1"><ArrowUpToLine className={`w-4 h-4 ${mergeMethod==='prepend'?'text-emerald-600':'text-slate-400'}`} /><span className={`font-black text-xs ${mergeMethod==='prepend'?'text-emerald-700':'text-slate-600'}`}>插入到开头</span></div></button>
              <button onClick={() => setMergeMethod('shuffle')} className={`p-3 rounded-xl border-2 text-left transition-all ${mergeMethod === 'shuffle' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100 hover:border-slate-300'}`}><div className="flex items-center gap-2 mb-1"><Shuffle className={`w-4 h-4 ${mergeMethod==='shuffle'?'text-emerald-600':'text-slate-400'}`} /><span className={`font-black text-xs ${mergeMethod==='shuffle'?'text-emerald-700':'text-slate-600'}`}>完全打乱</span></div></button>
              <button onClick={() => setMergeMethod('interleave')} className={`p-3 rounded-xl border-2 text-left transition-all ${mergeMethod === 'interleave' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100 hover:border-slate-300'}`}><div className="flex items-center gap-2 mb-1"><AlignJustify className={`w-4 h-4 ${mergeMethod==='interleave'?'text-emerald-600':'text-slate-400'}`} /><span className={`font-black text-xs ${mergeMethod==='interleave'?'text-emerald-700':'text-slate-600'}`}>穿插 (1:{mergeRatio})</span></div></button>
          </div>
          {mergeMethod === 'interleave' && (
              <div className="flex items-center gap-3 animate-in fade-in slide-in-from-top-2 bg-emerald-50/50 p-3 rounded-xl border border-emerald-100"><span className="text-xs font-bold text-emerald-700">每隔</span><input type="number" min="1" max="50" value={mergeRatio} onChange={(e) => setMergeRatio(Math.max(1, parseInt(e.target.value) || 1))} className="w-16 p-1 text-center font-black border-2 border-emerald-200 rounded-lg focus:border-emerald-500 outline-none text-emerald-800 bg-white" /><span className="text-xs font-bold text-emerald-700">个旧词插入1个新词</span></div>
          )}
      </div>
      <div className="flex gap-3 mt-auto"><Button variant="ghost" fullWidth onClick={() => { setMergeTarget(null); setKeepProgress(false); }}>返回</Button><Button fullWidth onClick={() => handleMergeDeck(mergeTarget.id)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-black shadow-lg">确认合并</Button></div></>)}</div></div>)}
      {activeDeckId && view === AppView.STUDY && (
        <StudySession
          deck={decks.find(d => d.id === activeDeckId)!}
          onUpdateDeck={updateDeck}
          onExit={() => setView(AppView.DASHBOARD)}
          onReview={(pId, verdict, quality) => handleReviewStat(activeDeckId, 'STUDY', pId, verdict, quality)}
          onTimeUpdate={handleTimeUpdate}
          onSessionComplete={(dur, corr, wrong, half, trend) => handleSessionComplete(activeDeckId, 'STUDY', dur, corr, wrong, half, trend)}
        />
      )}
      {activeDeckId && view === AppView.EXAM_SESSION && examConfig && (
        <ExamSession
          deck={decks.find(d => d.id === activeDeckId)!}
          questionCount={examConfig.count}
          candidatePhraseIds={examConfig.candidateIds}
          timeLimit={examTimeLimit} // Pass Time Limit Prop
          onUpdateDeck={updateDeck}
          onExit={() => setView(AppView.DASHBOARD)}
          onReview={(pId, isCorrect, quality) => handleReviewStat(activeDeckId, 'EXAM', pId, isCorrect, quality)}
          onTimeUpdate={handleTimeUpdate}
          onSessionComplete={(dur, corr, wrong, trend, results) => handleSessionComplete(activeDeckId, 'EXAM', dur, corr, wrong, undefined, trend, results)}
        />
      )}
      {/* ... (Keep rest of views: EDIT_DECK, IMPORT) ... */}
      {activeDeckId && view === AppView.EDIT_DECK && (
        <DeckEditor
          deck={decks.find(d => d.id === activeDeckId)!}
          onUpdateDeck={updateDeck}
          onAddDecks={handleAddDecks}
          onBack={() => setView(AppView.DASHBOARD)}
        />
      )}
      {view === AppView.IMPORT && (
        <Importer onImport={handleCreateDeck} onBack={() => setView(AppView.DASHBOARD)} />
      )}
    </>
  );
};
