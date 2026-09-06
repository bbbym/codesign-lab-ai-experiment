type Mode = 'SA' | 'SR' | 'CA' | 'CR';

const STYLE: Record<Mode, string> = {
  SA: '采用支持式沟通与辅助方案推进。先对用户当前思考作非评价性确认，以低压力、协作性措辞呈现内容并保留用户选择权。直接补充相关事实、机制、案例或约束，解释这些信息为什么重要，并给出可继续发展的具体方向。不得空泛表扬或无条件赞同。',
  SR: '采用支持式沟通与引导反思。先对用户当前思考作非评价性确认，以低压力、协作性措辞呈现内容并保留用户选择权。指出值得检视的目标、假设、矛盾、限制或取舍，通过一至两个聚焦问题帮助用户形成判断。不要提供完整替代方案或代替用户决策。',
  CA: '采用对抗式沟通与辅助方案推进。使用直接、低缓和度且带有适度施压感的陈述，可明确指出构想不充分之处，但不得讽刺、羞辱或评价用户能力。补充相关事实、机制、案例或约束，解释其重要性，并给出可继续发展的具体方向。',
  CR: '采用对抗式沟通与引导反思。使用直接、低缓和度且带有适度施压感的表达，明确指出未经检验的假设或被回避的矛盾，但不得讽刺、羞辱或评价用户能力。提出一至两个必须由用户判断的聚焦问题，不提供完整替代方案。',
};

const DEMO: Record<Mode, string> = {
  SA: '你已经形成了一个可继续发展的切入点。可以先把当前构想拆成目标用户、发生情境和支持机制三个部分，再补充一项与真实使用条件相关的限制。这样能让后续功能和流程建立在更明确的问题基础上。',
  SR: '你已经提出了一个初步方向。我们可以进一步检视：这个构想解决的是用户表面的操作困难，还是造成困难的根本条件？如果去掉AI支持，用户是否仍能理解并控制关键决定？这会影响方案边界。',
  CA: '目前的构想还不够具体。先明确目标用户、问题发生的情境和系统实际承担的工作，再补充一项现实限制及对应处理方式。没有这些信息，功能列表无法形成可执行的设计方案。',
  CR: '不要默认当前方向已经解决了核心问题。先回答：你依据什么判断这是用户真正需要的支持？系统介入后，哪些判断仍由用户完成？如果这两个问题不清楚，就不应继续固定功能和流程。',
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { mode?: Mode; task?: { title?: string; brief?: string; deliverable?: string }; messages?: Array<{ role: 'user' | 'assistant'; content: string }> };
    const mode = body.mode && STYLE[body.mode] ? body.mode : 'SA';
    const messages = Array.isArray(body.messages) ? body.messages.slice(-10) : [];
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      await new Promise((resolve) => setTimeout(resolve, 650));
      return Response.json({ reply: DEMO[mode], demo: true });
    }

    const system = `你是一名参与早期概念设计的AI协作伙伴。围绕给定任务与用户进行多轮中文对话。回复应与任务直接相关，控制在120至220个汉字，通常包含2至3个信息单元。不要使用Markdown标题或列表。\n\n任务：${body.task?.title || ''}\n${body.task?.brief || ''}\n预期产出：${body.task?.deliverable || ''}\n\n实验条件：${STYLE[mode]}`;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o', temperature: 0.7, max_tokens: 420, messages: [{ role: 'system', content: system }, ...messages.map(({ role, content }) => ({ role, content }))] }),
    });
    if (!response.ok) return Response.json({ error: 'AI服务暂时不可用。' }, { status: 502 });
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) return Response.json({ error: 'AI未返回有效内容。' }, { status: 502 });
    return Response.json({ reply });
  } catch {
    return Response.json({ error: '请求格式无效。' }, { status: 400 });
  }
}
