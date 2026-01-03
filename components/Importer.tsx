
import React, { useState } from 'react';
import { Button } from './Button';
import { generatePhraseDeck } from '../services/geminiService';
import { Sparkles, Upload, Loader2, ArrowLeft, WifiOff, Languages, Info, Bot, Code, Type as TypeIcon, AlignLeft, ArrowRightLeft, FileType } from 'lucide-react';
import { Phrase, DeckSubject, ContentType, StudyMode } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface ImporterProps {
  onImport: (name: string, phrases: Phrase[], subject: DeckSubject, contentType?: ContentType, studyMode?: StudyMode) => void;
  onBack: () => void;
}

export const Importer: React.FC<ImporterProps> = ({ onImport, onBack }) => {
  const [mode, setMode] = useState<'manual' | 'ai'>('manual');
  const [deckName, setDeckName] = useState('');
  const [subject, setSubject] = useState<DeckSubject>('English');
  const [contentType, setContentType] = useState<ContentType>('PhraseSentence');
  const [studyMode, setStudyMode] = useState<StudyMode>('CN_EN');
  const [manualText, setManualText] = useState('');
  const [aiTopic, setAiTopic] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleManualImport = () => {
    if (!deckName.trim()) {
      setError("请输入词组本名称。");
      return;
    }

    const lines = manualText.split('\n').filter(l => l.trim().length > 0);
    
    const parsedItems = lines.map((line, index) => {
       const parts = line.split('|').map(s => s.trim());
       if (parts.length < 2) return null;

       // 统一格式：题目 | 答案 | 笔记 | 进度 | 位置
       const chinese = parts[0];
       const english = parts[1];
       const noteRaw = parts[2] || '';
       
       let progress = 0;
       if (parts.length >= 4 && parts[3] !== '') {
          const val = parseInt(parts[3]);
          if (!isNaN(val)) progress = val;
       }
       
       let position: number | null = null;
       if (parts.length >= 5 && parts[4] !== '') {
          const val = parseInt(parts[4]);
          if (!isNaN(val)) position = val;
       }

       return { english, chinese, note: noteRaw, progress, position, originalIndex: index };
    }).filter(item => item !== null) as Array<{
        english: string, chinese: string, note: string, progress: number, position: number | null, originalIndex: number
    }>;

    parsedItems.sort((a, b) => {
        const posA = a.position;
        const posB = b.position;
        if (posA !== null && posB === null) return -1;
        if (posA === null && posB !== null) return 1;
        if (posA !== null && posB !== null) {
            if (posA !== posB) return posA - posB;
            return a.originalIndex - b.originalIndex;
        }
        return a.originalIndex - b.originalIndex;
    });

    const phrases: Phrase[] = parsedItems.map(item => {
       let correct = 0;
       let wrong = 0;
       if (item.progress > 0) correct = item.progress;
       if (item.progress < 0) wrong = Math.abs(item.progress);
       return {
          id: uuidv4(),
          english: item.english,
          chinese: item.chinese,
          note: item.note.replace(/\\n/g, '\n'), // 处理换行符
          consecutiveCorrect: correct,
          consecutiveWrong: wrong,
          totalReviews: correct + wrong
       };
    });

    if (phrases.length === 0 && mode === 'manual' && manualText.trim().length > 0) {
      setError("无法解析内容。请确保格式正确：题目 (中文) | 答案 (英文)");
      return;
    }

    onImport(deckName, phrases, subject, contentType, studyMode);
  };

  const handleAiImport = async () => {
    if (!navigator.onLine) {
       setError("AI 生成需要网络连接，请检查您的网络设置。");
       return;
    }

    if (!deckName.trim() || !aiTopic.trim()) {
      setError("请输入词组本名称和主题。");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await generatePhraseDeck(aiTopic);
      const phrases: Phrase[] = result.map(p => ({
        id: uuidv4(),
        ...p,
        consecutiveCorrect: 0,
        consecutiveWrong: 0,
        totalReviews: 0
      }));
      onImport(deckName, phrases, subject, contentType, studyMode);
    } catch (err) {
      setError("生成失败，请检查 API Key 或重试。");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center space-x-4">
        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full">
          <ArrowLeft className="w-6 h-6 text-slate-600" />
        </button>
        <h2 className="text-2xl font-bold text-slate-800">新建词组本</h2>
      </div>

      <div className="flex space-x-2 bg-slate-100 p-1 rounded-lg">
        <button onClick={() => setMode('manual')} className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${mode === 'manual' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>手动导入</button>
        <button onClick={() => setMode('ai')} className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${mode === 'ai' ? 'bg-indigo-50 shadow text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}>AI 智能生成</button>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">词组本名称</label>
            <input type="text" value={deckName} onChange={(e) => setDeckName(e.target.value)} placeholder="例如：高中英语核心..." className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none shadow-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">学科分类</label>
            <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200">
               <button onClick={()=>setSubject('English')} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-black rounded-md transition-all ${subject==='English'?'bg-white shadow-sm text-indigo-600':'text-slate-400 hover:text-slate-600'}`}><Languages className="w-3.5 h-3.5"/> 英语</button>
               <button onClick={()=>setSubject('Chinese')} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-black rounded-md transition-all ${subject==='Chinese'?'bg-white shadow-sm text-emerald-600':'text-slate-400 hover:text-slate-600'}`}>语文</button>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in duration-300">
             <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">内容类型</label>
                <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200">
                   <button onClick={()=>setContentType('Word')} className={`flex-1 py-2 text-xs font-black rounded-md transition-all ${contentType==='Word'?'bg-white shadow-sm text-indigo-600':'text-slate-400 hover:text-slate-600'}`}>
                       {subject === 'English' ? '单词' : '文言实词'}
                   </button>
                   <button onClick={()=>setContentType('PhraseSentence')} className={`flex-1 py-2 text-xs font-black rounded-md transition-all ${contentType==='PhraseSentence'?'bg-white shadow-sm text-indigo-600':'text-slate-400 hover:text-slate-600'}`}>
                       {subject === 'English' ? '词组/句子' : '其他'}
                   </button>
                </div>
             </div>
             
             {subject === 'English' && (
                 <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">背诵模式</label>
                    <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200">
                        <button onClick={()=>setStudyMode('CN_EN')} className={`flex-1 py-2 text-xs font-black rounded-md transition-all ${studyMode==='CN_EN'?'bg-white shadow-sm text-indigo-600':'text-slate-400 hover:text-slate-600'}`}>中→英</button>
                        <button onClick={()=>setStudyMode('EN_CN')} className={`flex-1 py-2 text-xs font-black rounded-md transition-all ${studyMode==='EN_CN'?'bg-white shadow-sm text-indigo-600':'text-slate-400 hover:text-slate-600'}`}>英→中</button>
                    </div>
                 </div>
             )}
        </div>

        {mode === 'manual' ? (
          <div className="space-y-4">
            <div className="space-y-2">
                <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 space-y-3">
                   <div className="flex items-start gap-2.5 text-xs text-amber-800">
                      <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                      <div className="space-y-1">
                        <p className="font-black text-sm mb-1">基础格式：题目 | 答案</p>
                        <p className="opacity-80">示例：<code className="bg-white/50 px-1 rounded">你好 | Hello</code></p>
                      </div>
                   </div>
                   <div className="flex items-start gap-2.5 text-xs text-amber-800 pt-2 border-t border-amber-200/50">
                      <Code className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                      <div className="space-y-1">
                        <p className="font-black">高级格式：题目 | 答案 | 笔记 | 进度 | 位置</p>
                        <p className="opacity-80 leading-relaxed">
                          - 笔记中换行请使用 <code className="bg-white/50 px-1 rounded font-bold">\n</code><br/>
                          - 进度正数为连对次数，负数为连错次数<br/>
                          - 位置为数字，决定在队列中的初始排序
                        </p>
                      </div>
                   </div>
                </div>
                
                <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100 flex items-start gap-2.5">
                    <Bot className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                    <div className="text-[11px] text-indigo-800 leading-normal font-medium">
                        <span className="font-bold block mb-0.5 text-xs">💡 推荐：让 AI 帮您预处理</span>
                        粘贴截图给 AI 说：“<span className="bg-white px-1 rounded border border-indigo-100 select-all font-mono">请OCR，整理成 '题目 | 答案' 格式，笔记换行转为 \n </span>”，随后粘贴至下方。
                    </div>
                </div>

                <textarea value={manualText} onChange={(e) => setManualText(e.target.value)} placeholder={`示例：\n你好 | Hello\n复杂的 | Complex | 笔记内容\\n第二行 | 0 | 1\n...`} className="w-full h-64 px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm shadow-inner leading-relaxed" />
            </div>
          </div>
        ) : (
          <div>
             <label className="block text-sm font-medium text-slate-700 mb-1">主题 / 场景</label>
             <input type="text" value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} placeholder="例如：机场对话，医疗术语..." className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none shadow-sm" />
              <div className="mt-4 bg-indigo-50 p-4 rounded-lg border border-indigo-100 flex items-start gap-3 shadow-sm">
                <Sparkles className="w-5 h-5 text-indigo-500 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm text-indigo-700 font-black">AI 智能生成</p>
                  <p className="text-xs text-indigo-600/80">根据主题自动生成 10 个高质量词组。需要网络连接。</p>
                </div>
              </div>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100 flex items-center gap-2">
            {!navigator.onLine && <WifiOff className="w-4 h-4" />}
            {error}
          </div>
        )}

        <div className="pt-4">
          <Button onClick={mode === 'manual' ? handleManualImport : handleAiImport} fullWidth disabled={isLoading} variant={mode === 'ai' ? 'primary' : 'secondary'} className="py-4 shadow-xl text-base font-black">
            {isLoading ? <span className="flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> 生成中...</span> : (mode === 'manual' ? '开始导入' : '立即生成')}
          </Button>
        </div>
      </div>
    </div>
  );
};
