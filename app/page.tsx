'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Bot, Check, Clock3, Download, RotateCcw, Settings2, Sparkles, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type Mode = 'SA' | 'SR' | 'CA' | 'CR';
type Message = { role: 'user' | 'assistant'; content: string; at: string; trace?: unknown };
type WebMcpContext = { registerTool: (tool: object, options?: { signal?: AbortSignal }) => void | Promise<void> };

const LATIN_SQUARE: Mode[][] = [
  ['SA', 'SR', 'CA', 'CR'],
  ['SR', 'CA', 'CR', 'SA'],
  ['CA', 'CR', 'SA', 'SR'],
  ['CR', 'SA', 'SR', 'CA'],
];

const MODES: Record<Mode, { label: string; short: string }> = {
  SA: { label: '支持式沟通 · 辅助方案推进', short: 'AI–A' },
  SR: { label: '支持式沟通 · 引导反思', short: 'AI–B' },
  CA: { label: '对抗式沟通 · 辅助方案推进', short: 'AI–C' },
  CR: { label: '对抗式沟通 · 引导反思', short: 'AI–D' },
};

const TASKS = [
  { id: '01', domain: '健康福祉', title: '未来健康与福祉' },
  { id: '02', domain: '学习教育', title: '未来学习与教育' },
  { id: '03', domain: '社区文化', title: '未来社区与文化' },
  { id: '04', domain: '数字生活', title: '未来数字生活' },
];

const OPENERS: Record<Mode, string> = {
  SA: '很高兴和你一起完成这项设计任务。请先描述你目前的想法或最想处理的问题，我会补充相关信息，并帮助你把构想发展得更具体。',
  SR: '很高兴和你一起分析这项设计任务。请先描述你目前的想法或判断，我会和你一起检查其中的目标、假设与取舍，帮助你形成自己的判断。',
  CA: '直接说明你目前的构想。不要只给出宽泛目标；我会指出缺失的信息，并给出能够继续发展方案的具体内容。',
  CR: '直接说明你目前的构想及其依据。不要回避其中的假设和限制；我会要求你检查关键矛盾，再由你决定如何调整方案。',
};

function formatTime(total: number) {
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}

function sequenceFromParticipant(id: string) {
  const number = Number(id.match(/\d+/)?.[0]);
  return Number.isFinite(number) && number > 0 ? (number - 1) % 4 : 0;
}

export default function Home() {
  const [taskIndex, setTaskIndex] = useState(0);
  const [participantId, setParticipantId] = useState('P001');
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [remaining, setRemaining] = useState(15 * 60);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [researcherOpen, setResearcherOpen] = useState(false);
  const [showCondition, setShowCondition] = useState(false);
  const [completed, setCompleted] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const task = TASKS[taskIndex];
  const mode = LATIN_SQUARE[sequenceIndex][taskIndex];
  const sessionKey = `${participantId}-${task.id}-${mode}`;

  useEffect(() => { setSequenceIndex(sequenceFromParticipant(participantId)); }, [participantId]);

  useEffect(() => {
    setMessages([{ role: 'assistant', content: OPENERS[mode], at: new Date().toISOString() }]);
    setRemaining(15 * 60); setRunning(false); setCompleted(false);
  }, [taskIndex, mode]);

  useEffect(() => {
    if (!running || remaining <= 0) return;
    const timer = window.setInterval(() => setRemaining((v) => v - 1), 1000);
    return () => window.clearInterval(timer);
  }, [running, remaining]);

  useEffect(() => { if (remaining === 0) setRunning(false); }, [remaining]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);
  useEffect(() => {
    localStorage.setItem(`design-lab:${sessionKey}`, JSON.stringify({ participantId, taskId: task.id, mode, messages, remaining, completed }));
  }, [completed, messages, mode, participantId, remaining, sessionKey, task.id]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: WebMcpContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: 'start_design_session',
      title: '开始设计实验',
      description: '为指定参与者设置任务和AI条件，并重置计时与对话，准备开始一轮设计实验。',
      inputSchema: {
        type: 'object',
        properties: {
          participantId: { type: 'string', minLength: 1 },
          taskNumber: { type: 'integer', minimum: 1, maximum: 4 },
          condition: { type: 'string', enum: ['SA', 'SR', 'CA', 'CR'] },
        },
        required: ['participantId', 'taskNumber', 'condition'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(raw: unknown) {
        const value = raw as { participantId?: string; taskNumber?: number; condition?: Mode };
        if (!value.participantId?.trim() || !Number.isInteger(value.taskNumber) || !value.condition || !MODES[value.condition]) throw new Error('Invalid session configuration');
        setParticipantId(value.participantId.trim());
        setTaskIndex(Math.max(0, Math.min(3, value.taskNumber! - 1)));
        const requestedSequence = LATIN_SQUARE.findIndex((row) => row[Math.max(0, Math.min(3, value.taskNumber! - 1))] === value.condition);
        if (requestedSequence >= 0) setSequenceIndex(requestedSequence);
        setRemaining(900); setRunning(false); setCompleted(false);
        return { status: 'ready', participantId: value.participantId.trim(), taskNumber: value.taskNumber, condition: value.condition };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  const progress = useMemo(() => Math.round(((900 - remaining) / 900) * 100), [remaining]);

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();
    if (!content || loading || completed) return;
    if (!running) setRunning(true);
    const userMessage: Message = { role: 'user', content, at: new Date().toISOString() };
    const next = [...messages, userMessage];
    setMessages(next); setInput(''); setLoading(true);
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, task, messages: next }) });
      const data = (await response.json()) as { reply?: string; error?: string; trace?: unknown };
      if (!response.ok || !data.reply) throw new Error(data.error || '请求失败');
      setMessages((current) => [...current, { role: 'assistant', content: data.reply!, at: new Date().toISOString(), trace: data.trace }]);
    } catch (error) {
      const reason = error instanceof Error ? error.message : '当前无法连接AI服务';
      setMessages((current) => [...current, { role: 'assistant', content: `${reason}。你的输入已经保留，请稍后重试或联系研究人员。`, at: new Date().toISOString() }]);
    } finally { setLoading(false); }
  }

  function resetSession() {
    setMessages([{ role: 'assistant', content: OPENERS[mode], at: new Date().toISOString() }]);
    setRemaining(900); setRunning(false); setCompleted(false);
    localStorage.removeItem(`design-lab:${sessionKey}`);
  }

  function exportSession() {
    const data = { participantId, sequence: sequenceIndex + 1, taskOrder: taskIndex + 1, task, condition: mode, conditionLabel: MODES[mode].label, durationSeconds: 900 - remaining, completed, exportedAt: new Date().toISOString(), messages };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `${participantId}_task-${task.id}_${mode}.json`; link.click(); URL.revokeObjectURL(url);
  }

  return (
    <main className="lab-shell">
      <header className="topbar">
        <div className="session-meta"><span>{participantId}</span><span className="status-dot" /><span>本地记录中</span><Button variant="ghost" size="icon" aria-label="研究者设置" onClick={() => setResearcherOpen(true)}><Settings2 /></Button></div>
      </header>

      <div className="workspace">
        <aside className="task-panel">
          <div className="eyebrow">TASK {task.id}</div><h1>{task.title}</h1>
          <div className="task-list" aria-label="任务进度">{TASKS.map((item, index) => <button key={item.id} className={index === taskIndex ? 'active' : ''} onClick={() => setTaskIndex(index)}><span>{item.id}</span><span>{item.domain}</span></button>)}</div>
        </aside>

        <section className="chat-card">
          <div className="chat-head"><div className="agent-title"><span className="bot-avatar"><Bot size={21} /></span><div><strong>Design Partner</strong><span>{showCondition ? MODES[mode].label : 'AI设计协作伙伴'}</span></div></div><div className={`timer ${remaining < 180 ? 'urgent' : ''}`}><Clock3 size={16} />{formatTime(remaining)}</div></div>
          <div className="timer-track"><span style={{ width: `${progress}%` }} /></div>
          <div className="messages" aria-live="polite">
            {messages.map((message, index) => <article key={`${message.at}-${index}`} className={`message ${message.role}`}><span className="message-avatar">{message.role === 'assistant' ? <Bot size={18} /> : <UserRound size={18} />}</span><div><span className="message-name">{message.role === 'assistant' ? 'AI' : '你'}</span><p>{message.content}</p></div></article>)}
            {loading && <article className="message assistant"><span className="message-avatar"><Bot size={18} /></span><div><span className="message-name">AI</span><div className="typing"><i /><i /><i /></div></div></article>}<div ref={endRef} />
          </div>
          <form className="composer" onSubmit={sendMessage}>
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} placeholder={completed ? '本任务已完成' : '描述你的想法、问题或判断…'} disabled={completed || loading} aria-label="发送给AI的消息" />
            <Button type="submit" size="icon-lg" disabled={!input.trim() || loading || completed} aria-label="发送"><ArrowUp /></Button><span className="composer-hint">Enter发送 · Shift + Enter换行</span>
          </form>
        </section>

        <aside className="session-panel">
          <div className="eyebrow">SESSION</div><h2>本次实验</h2><dl><div><dt>实验序列</dt><dd>{sequenceIndex + 1} / 4</dd></div><div><dt>任务</dt><dd>{taskIndex + 1} / {TASKS.length}</dd></div><div><dt>对话轮次</dt><dd>{messages.filter((m) => m.role === 'user').length}</dd></div><div><dt>当前状态</dt><dd>{completed ? '已完成' : running ? '进行中' : '未开始'}</dd></div></dl>
          <div className="protocol-note"><Sparkles size={17} /><p>请自然地与AI讨论。你可以采纳、质疑、修改或拒绝它的建议。</p></div>
          <Button className="complete-btn" disabled={messages.filter((m) => m.role === 'user').length === 0} onClick={() => { if (completed && taskIndex < TASKS.length - 1) { setTaskIndex((index) => index + 1); } else { setCompleted(true); setRunning(false); } }}><Check />{completed && taskIndex < TASKS.length - 1 ? '进入下一任务' : '完成当前任务'}</Button>
          <Button variant="outline" className="export-btn" onClick={exportSession}><Download />导出本次记录</Button>
        </aside>
      </div>

      {researcherOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setResearcherOpen(false)}><dialog open className="researcher-modal" aria-labelledby="researcher-title" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-title"><div><span className="eyebrow">RESEARCHER CONTROL</span><h2 id="researcher-title">实验设置</h2></div><button onClick={() => setResearcherOpen(false)} aria-label="关闭">×</button></div>
        <label>参与者编号<input value={participantId} onChange={(e) => setParticipantId(e.target.value)} /></label>
        <fieldset><legend>拉丁方序列</legend><div className="sequence-grid">{LATIN_SQUARE.map((row, index) => <button key={index} className={sequenceIndex === index ? 'selected' : ''} onClick={() => setSequenceIndex(index)}><b>序列 {index + 1}</b><span>{row.map((item) => MODES[item].short).join(' → ')}</span></button>)}</div><p className="sequence-note">参与者编号会自动分配序列；也可在此手动调整。条件名称不会向参与者显示。</p></fieldset>
        <fieldset><legend>当前任务分配</legend><div className="assignment-strip">{TASKS.map((item, index) => <span key={item.id} className={index === taskIndex ? 'current' : ''}><b>{item.domain}</b>{MODES[LATIN_SQUARE[sequenceIndex][index]].short}</span>)}</div></fieldset>
        <label className="check-row"><input type="checkbox" checked={showCondition} onChange={(e) => setShowCondition(e.target.checked)} />在参与者界面显示条件名称</label>
        <div className="modal-actions"><Button variant="outline" onClick={resetSession}><RotateCcw />重置当前任务</Button><Button onClick={() => setResearcherOpen(false)}>保存设置</Button></div>
      </dialog></div>}
    </main>
  );
}
