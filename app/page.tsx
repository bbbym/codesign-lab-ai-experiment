'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Bot, Check, Clock3, Download, RotateCcw, Settings2, Sparkles, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type Mode = 'SA' | 'SR' | 'CA' | 'CR';
type Message = { role: 'user' | 'assistant'; content: string; at: string; trace?: unknown };
type TaskEvaluation = { taskId: string; condition: Mode; ratings: Record<number, number>; submittedAt: string };
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
  { id: '01', domain: '健康福祉', title: '健康与福祉', description: '健康福祉设计强调以人为本地改善身体、心理与社会生活体验。你可以面向儿童、老年人、慢性病患者、照护者或普通公众，从日常健康管理、心理支持、适老化与无障碍、居家照护、医疗服务体验、健康数据理解及隐私信任等方向展开，也可以提出其他与生活质量和健康公平相关的设计议题。' },
  { id: '02', domain: '学习教育', title: '学习与教育', description: '学习教育设计关注不同人群如何获得知识、维持投入、发展能力并与他人协作。你可以面向儿童、大学生、教师、职业学习者或特殊学习群体，从学习动机与习惯、个性化支持、同伴协作、师生互动、教育公平、数字学习工具、学习环境及AI辅助教育等方向展开，也可以探索其他能够改善学习体验的议题。' },
  { id: '03', domain: '社区文化', title: '社区与文化', description: '社区文化设计关注人们如何参与公共生活、建立社会连接并理解和延续地方文化。你可以从邻里互助、公共空间与社区服务、弱势群体参与、跨代际或跨文化交流、地方记忆、传统文化传播、公共活动及社区治理等方向展开，探索产品、服务、空间或传播体验，也可以提出其他与社区认同和文化活力有关的议题。' },
  { id: '04', domain: '数字生活', title: '数字生活', description: '数字生活设计关注数字技术如何影响人们的工作、消费、社交与日常决策。你可以从信息理解与自主控制、隐私安全、数字身份、智能服务、网络社交、数字包容、平台规则、AI应用以及技术便利与生活负担的平衡等方向展开，探索更清晰、可信、可控且包容的数字体验，也可以提出其他相关议题。' },
];

const EVALUATION_ITEMS = [
  { dimension: '表达体验', text: '该AI的表达方式让我感到被尊重和支持。', points: 5, low: '非常不同意', high: '非常同意' },
  { dimension: '表达体验', text: '该AI的表达方式带有明显的施压或对抗感。', points: 5, low: '非常不同意', high: '非常同意' },
  { dimension: '回应方式', text: '该AI主要通过提供信息或具体方向帮助我继续发展构想。', points: 5, low: '非常不同意', high: '非常同意' },
  { dimension: '回应方式', text: '该AI主要通过提出需要审视的问题引导我反思构想。', points: 5, low: '非常不同意', high: '非常同意' },
  { dimension: '交互体验', text: '总体而言，我对本次与该AI的交互体验感到满意。', points: 5, low: '非常不同意', high: '非常同意' },
  { dimension: '交互体验', text: '我与该AI的交互像是一段连贯的对话。', points: 5, low: '非常不同意', high: '非常同意' },
  { dimension: '构想探索支持', text: '使用该AI原型时，我能够较容易地探索不同的想法、选择、设计或结果。', points: 5, low: '非常不同意', high: '非常同意' },
  { dimension: '构想探索支持', text: '该AI原型帮助我追踪和比较不同的想法、结果或可能性。', points: 5, low: '非常不同意', high: '非常同意' },
  { dimension: '反思性投入', text: '在本次任务中，我重新审视了原有做法，并尝试思考更好的方式。', points: 5, low: '非常不同意', high: '非常同意' },
  { dimension: '反思性投入', text: '在本次任务中，我回顾了自己的思考，并考虑了其他可能的处理方式。', points: 5, low: '非常不同意', high: '非常同意' },
  { dimension: '反思性投入', text: '在本次任务中，我反思了自己的设计判断是否还可以改进。', points: 5, low: '非常不同意', high: '非常同意' },
  { dimension: '反思性投入', text: '在本次任务中，我回顾了本次设计过程，以思考今后如何改进。', points: 5, low: '非常不同意', high: '非常同意' },
  { dimension: '感知创作控制权', text: '在与该AI协作时，我仍然掌握构想的判断和决定权。', points: 5, low: '非常不同意', high: '非常同意' },
  { dimension: '自评构想质量', text: '我认为本次形成的设计构想具有新颖性。', points: 5, low: '非常不同意', high: '非常同意' },
  { dimension: '自评构想质量', text: '我认为本次形成的设计构想具有实用价值。', points: 5, low: '非常不同意', high: '非常同意' },
];

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
  const [requestError, setRequestError] = useState<string | null>(null);
  const [researcherOpen, setResearcherOpen] = useState(false);
  const [evaluationOpen, setEvaluationOpen] = useState(false);
  const [ratings, setRatings] = useState<Record<number, number>>({});
  const [evaluations, setEvaluations] = useState<Record<string, TaskEvaluation>>({});
  const [showCondition, setShowCondition] = useState(false);
  const [completed, setCompleted] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const requestInFlightRef = useRef(false);
  const task = TASKS[taskIndex];
  const mode = LATIN_SQUARE[sequenceIndex][taskIndex];
  const sessionKey = `${participantId}-${task.id}-${mode}`;

  useEffect(() => { setSequenceIndex(sequenceFromParticipant(participantId)); }, [participantId]);

  useEffect(() => {
    try { setEvaluations(JSON.parse(localStorage.getItem(`design-lab:evaluations:${participantId}`) || '{}')); } catch { setEvaluations({}); }
  }, [participantId]);

  useEffect(() => { localStorage.setItem(`design-lab:evaluations:${participantId}`, JSON.stringify(evaluations)); }, [evaluations, participantId]);

  useEffect(() => {
    setMessages([]);
    setRemaining(15 * 60); setRunning(false); setCompleted(false); setEvaluationOpen(false); setRatings({}); setRequestError(null);
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

  async function requestReply(history: Message[]) {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    setLoading(true); setRequestError(null);
    try {
      let lastReason = 'AI服务暂时不可用';
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, task, messages: history }) });
          const data = (await response.json()) as { reply?: string; error?: string; trace?: unknown };
          if (!response.ok || !data.reply) throw new Error(data.error || '请求失败');
          setMessages((current) => {
            const last = current.at(-1);
            if (last?.role === 'assistant' && last.content.trim() === data.reply!.trim()) return current;
            return [...current, { role: 'assistant', content: data.reply!, at: new Date().toISOString(), trace: data.trace }];
          });
          return;
        } catch (error) {
          lastReason = error instanceof Error ? error.message : 'AI服务暂时不可用';
          if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 800));
        }
      }
      setRequestError(`${lastReason}。可重新尝试，原输入不会重复记录。`);
    } finally { requestInFlightRef.current = false; setLoading(false); }
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();
    if (!content || loading || requestInFlightRef.current || completed) return;
    if (!running) setRunning(true);
    const userMessage: Message = { role: 'user', content, at: new Date().toISOString() };
    const next = [...messages, userMessage];
    setMessages(next); setInput('');
    await requestReply(next);
  }

  function resetSession() {
    setMessages([]);
    setRemaining(900); setRunning(false); setCompleted(false); setRequestError(null);
    localStorage.removeItem(`design-lab:${sessionKey}`);
  }

  async function exportSession() {
    const { default: writeXlsxFile } = await import('write-excel-file/browser');
    const evaluation = evaluations[sessionKey];
    const header = (value: string) => ({ value, fontWeight: 'bold' as const, color: '#FFFFFF', backgroundColor: '#2447E7', align: 'center' as const, wrap: true });
    const label = (value: string) => ({ value, fontWeight: 'bold' as const, backgroundColor: '#EDF1FF' });
    const summary = [
      [header('字段'), header('内容')],
      [label('参与者编号'), { value: participantId }], [label('实验序列'), { value: sequenceIndex + 1 }],
      [label('任务顺序'), { value: taskIndex + 1 }], [label('任务编号'), { value: task.id }],
      [label('设计主题'), { value: task.title }], [label('AI编号'), { value: MODES[mode].short }],
      [label('内部条件代码'), { value: mode }], [label('任务用时（秒）'), { value: 900 - remaining, type: Number }],
      [label('用户对话轮次'), { value: messages.filter((message) => message.role === 'user').length, type: Number }],
      [label('任务状态'), { value: completed ? '已完成' : '未完成' }], [label('导出时间'), { value: new Date() }],
    ];
    const scores = [[header('题号'), header('维度'), header('题项'), header('量表锚点'), header('评分')], ...EVALUATION_ITEMS.map((item, index) => [
      { value: index + 1, type: Number }, { value: item.dimension }, { value: item.text, wrap: true }, { value: `1=${item.low}；${item.points}=${item.high}`, wrap: true }, { value: evaluation?.ratings[index + 1] ?? '', type: evaluation ? Number : String },
    ])];
    const conversation = [[header('序号'), header('角色'), header('时间'), header('对话内容'), header('技术追踪')], ...messages.map((message, index) => [
      { value: index + 1, type: Number }, { value: message.role === 'user' ? '参与者' : 'AI' }, { value: new Date(message.at) },
      { value: message.content, wrap: true }, { value: message.trace ? JSON.stringify(message.trace) : '', wrap: true },
    ])];
    const workbook = writeXlsxFile([
      { data: summary, sheet: '实验信息', columns: [{ width: 20 }, { width: 48 }], stickyRowsCount: 1 },
      { data: scores, sheet: '量表评分', columns: [{ width: 9 }, { width: 18 }, { width: 58 }, { width: 34 }, { width: 10 }], stickyRowsCount: 1 },
      { data: conversation, sheet: '对话记录', columns: [{ width: 9 }, { width: 12 }, { width: 22 }, { width: 70 }, { width: 70 }], stickyRowsCount: 1, orientation: 'landscape' },
    ], { fontFamily: 'Arial', fontSize: 11 });
    const blob = await workbook.toBlob();
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `${participantId}_任务${task.id}_${MODES[mode].short}.xlsx`; link.click(); URL.revokeObjectURL(url);
  }

  return (
    <main className="lab-shell">
      <header className="topbar">
        <div className="session-meta"><span>{participantId}</span><span className="status-dot" /><span>本地记录中</span><Button variant="ghost" size="icon" aria-label="研究者设置" onClick={() => setResearcherOpen(true)}><Settings2 /></Button></div>
      </header>

      <div className="workspace">
        <aside className="task-panel">
          <div className="eyebrow">TASK {task.id}</div><h1>{task.title}</h1><p className="task-description"><b>主题解读</b>{task.description}</p>
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
            {requestError && <div className="request-error"><span>{requestError}</span><Button type="button" size="sm" onClick={() => requestReply(messages)}>重新尝试</Button><button type="button" onClick={() => setRequestError(null)}>继续输入</button></div>}
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} placeholder={completed ? '本任务已完成' : requestError ? '请先重试，或选择继续输入…' : '描述你的想法、问题或判断…'} disabled={completed || loading || Boolean(requestError)} aria-label="发送给AI的消息" />
            <Button type="submit" size="icon-lg" disabled={!input.trim() || loading || completed} aria-label="发送"><ArrowUp /></Button><span className="composer-hint">Enter发送 · Shift + Enter换行</span>
          </form>
        </section>

        <aside className="session-panel">
          <div className="eyebrow">SESSION</div><h2>本次实验</h2><dl><div><dt>实验序列</dt><dd>{sequenceIndex + 1} / 4</dd></div><div><dt>任务</dt><dd>{taskIndex + 1} / {TASKS.length}</dd></div><div><dt>对话轮次</dt><dd>{messages.filter((m) => m.role === 'user').length}</dd></div><div><dt>当前状态</dt><dd>{completed ? '已完成' : running ? '进行中' : '未开始'}</dd></div></dl>
          <div className="protocol-note"><Sparkles size={17} /><p>请自然地与AI讨论。你可以采纳、质疑、修改或拒绝它的建议。</p></div>
          <Button className="complete-btn" disabled={messages.filter((m) => m.role === 'user').length === 0} onClick={() => { if (completed && taskIndex < TASKS.length - 1) { setTaskIndex((index) => index + 1); } else if (!completed) { setRunning(false); setEvaluationOpen(true); } }}><Check />{completed && taskIndex < TASKS.length - 1 ? '进入下一任务' : completed ? '本任务已完成' : '完成当前任务'}</Button>
          <Button variant="outline" className="export-btn" onClick={exportSession}><Download />导出Excel记录</Button>
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

      {evaluationOpen && <div className="modal-backdrop evaluation-backdrop"><dialog open className="evaluation-modal" aria-labelledby="evaluation-title">
        <div className="evaluation-heading"><div><span className="eyebrow">TASK {task.id} EVALUATION</span><h2 id="evaluation-title">任务后评价</h2><p>请根据刚刚完成的设计任务以及与AI的实际交互体验，判断您对以下陈述的同意程度。1＝非常不同意，2＝不同意，3＝一般，4＝同意，5＝非常同意。</p></div></div>
        <div className="evaluation-items">{EVALUATION_ITEMS.map((item, index) => <div className="evaluation-row" style={{ gridTemplateColumns: `minmax(330px, 1fr) repeat(${item.points}, 54px)` }} key={item.text}><div><span>{item.dimension}</span><p>{index + 1}. {item.text}</p><small className="scale-anchors">1＝{item.low}　·　{item.points}＝{item.high}</small></div>{Array.from({ length: item.points }, (_, value) => value + 1).map((value) => <label key={value}><input type="radio" name={`rating-${index}`} value={value} checked={ratings[index + 1] === value} onChange={() => setRatings((current) => ({ ...current, [index + 1]: value }))}/><i>{value}</i></label>)}</div>)}</div>
        <div className="evaluation-actions"><Button variant="outline" onClick={() => { setEvaluationOpen(false); setRunning(remaining > 0); }}>返回任务</Button><Button disabled={Object.keys(ratings).length !== EVALUATION_ITEMS.length} onClick={() => { const result = { taskId: task.id, condition: mode, ratings, submittedAt: new Date().toISOString() }; setEvaluations((current) => ({ ...current, [sessionKey]: result })); setCompleted(true); setEvaluationOpen(false); }}>提交评价</Button></div>
      </dialog></div>}
    </main>
  );
}
