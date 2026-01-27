
export type ContentType = 'Word' | 'PhraseSentence';
export type StudyMode = 'CN_EN' | 'EN_CN';

export interface Phrase {
  id: string;
  chinese: string;
  english: string;
  consecutiveCorrect: number;
  consecutiveWrong: number;
  totalReviews: number;
  totalWrong?: number; // New: Track total wrong attempts explicitly
  maxConsecutiveCorrect?: number; // New: Track max streak for quality calc
  previousStreak?: number; // New: Track streak before error for recovery logic
  mastery?: number; // 0-100 exact score
  lastReviewedAt?: number;
  note?: string;
}

export interface DeckStats {
  totalStudyTimeSeconds: number;
  totalReviewCount: number;
  firstMastery90Seconds?: number; // New: Time taken to reach 90% first time
}

export interface DeckSessionLog {
  id: string;
  timestamp: number;
  mode: 'STUDY' | 'EXAM';
  durationSeconds: number;
  reviewCount: number;
  correctCount: number;
  wrongCount: number;
  halfCount?: number; // Added to track half correct explicitly
  masteryStart?: number;
  masteryEnd?: number;
  masteryGain?: number; // Added property to track gain in session
  masteryTrend?: { t: number; v: number }[]; // Time (seconds), Value (Mastery %)
  examResults?: { q: string; a: string; isCorrect: boolean }[];
}

export type DeckSubject = 'English' | 'Chinese';

export interface Folder {
  id: string;
  parentId?: string; // 支持嵌套文件夹
  name: string;
  createdAt: number;
}

export interface DeckStatsOptions {
    includeInQuantity?: boolean;
    includeInQuality?: boolean;
}

export interface Deck {
  id: string;
  folderId?: string; 
  name: string;
  subject: DeckSubject;
  contentType?: ContentType;
  studyMode?: StudyMode;
  phrases: Phrase[];
  queue: string[];
  coolingPool?: { id: string; wait: number }[]; // New: Persist cooling items
  stats?: DeckStats;
  sessionHistory?: DeckSessionLog[];
  totalWordCount?: number; // New: Cached word count for Spirit Root calc
  statsOptions?: DeckStatsOptions; // New: Options to include/exclude from global stats
}

export interface ActivityLog {
  deckId: string;
  deckName: string;
  deckSubject?: DeckSubject;
  mode: 'STUDY' | 'EXAM';
  count: number;
  correct: number;
  wrong?: number; // Added to track wrong explicitly (excluding half)
  durationSeconds: number;
  masteryGain: number;
  timestamp: number;
}

export interface DailyStats {
  date: string;
  reviewCount: number;
  correctCount: number; 
  wrongCount: number;   
  reviewedPhraseIds: string[];
  studyTimeSeconds: number;
  activities?: ActivityLog[];
}

export interface SubjectStats {
  English: number;
  Chinese: number;
  // Store quality metric events for 7-day average calc
  qualityHistory?: { timestamp: number; value: number; weight: number; subject?: DeckSubject; deckName?: string; deckId?: string }[]; 
}

export interface PersistenceData {
    baseScore: number; // Score at beginning of day (after decay)
    lastDate: string; // Date of last calculation
    prevDayFinalScore: number; // For "change vs yesterday" display
}

export interface GlobalStats {
  totalReviewCount: number;
  totalPhrasesCount: number; 
  totalStudyTimeSeconds: number;
  subjectStats: SubjectStats;
  daily: DailyStats;
  persistence?: {
      English: PersistenceData;
      Chinese: PersistenceData;
  };
}

export interface BackupData {
  version: number;
  timestamp: number;
  folders?: Folder[];
  decks: Deck[];
  stats: GlobalStats;
}

export enum AppView {
  DASHBOARD = 'DASHBOARD',
  STUDY = 'STUDY',
  IMPORT = 'IMPORT',
  EDIT_DECK = 'EDIT_DECK',
  EXAM_SETUP = 'EXAM_SETUP',
  EXAM_SESSION = 'EXAM_SESSION',
}

export enum CardState {
  HIDDEN = 'HIDDEN',
  VERIFYING = 'VERIFYING',
  MISSED = 'MISSED',
  REVIEWED = 'REVIEWED',
}
