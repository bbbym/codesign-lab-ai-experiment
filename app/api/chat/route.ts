type Mode = 'SA' | 'SR' | 'CA' | 'CR';
type ChatMessage = { role: 'user' | 'assistant'; content: string };
type SearchCategory = 'user_context' | 'precedents' | 'implementation';
type TaskRepresentation = {
  design_goal: string;
  user_needs: string[];
  use_context: string[];
  constraints: string[];
  unresolved_questions: string[];
  search_topics: Record<SearchCategory, string>;
};
type SearchResult = { title: string; url: string; content: string; score?: number };

const STYLE: Record<Mode, string> = {
  SA: '采用支持式沟通与辅助方案推进。以低压力、协作性措辞呈现内容，适度确认用户当前的思考进展并保留其选择权。直接补充相关事实、机制、案例或约束，解释其与当前构想的关系，并给出可以继续发展的具体方向。不得空泛表扬或无条件赞同。',
  SR: '采用支持式沟通与引导反思。以低压力、协作性措辞呈现内容，适度确认用户当前的思考进展并保留其选择权。指出值得检视的目标、假设、矛盾、限制或取舍，通过一至两个聚焦问题帮助用户形成判断。不要提供完整替代方案或代替用户决策。',
  CA: '采用对抗式沟通与辅助方案推进。使用直接、低缓和度且带有适度施压感的陈述，明确指出构想不充分之处，但不得讽刺、羞辱或评价用户能力。补充相关事实、机制、案例或约束，解释其重要性，并给出可以继续发展的具体方向。',
  CR: '采用对抗式沟通与引导反思。使用直接、低缓和度且带有适度施压感的表达，明确指出未经检验的假设或被回避的矛盾，但不得讽刺、羞辱或评价用户能力。提出一至两个必须由用户判断的聚焦问题，不提供完整替代方案。',
};

const CATEGORY_LABEL: Record<SearchCategory, string> = {
  user_context: '用户需求与使用情境',
  precedents: '相关案例与现有方案',
  implementation: '实施条件与发展环境',
};

async function callDeepSeek(
  apiKey: string,
  model: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  maxTokens: number,
  options: { json?: boolean; temperature?: number; timeoutMs?: number } = {},
) {
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    signal: controller.signal,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: options.temperature ?? 0.7,
      max_tokens: maxTokens,
      messages,
      ...(options.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  }).finally(() => clearTimeout(timeout));
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`DeepSeek ${response.status}: ${detail}`);
  }
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string; reasoning_content?: string } }> };
  const message = data.choices?.[0]?.message;
  const content = (message?.content || message?.reasoning_content)?.trim();
  if (!content) throw new Error('DeepSeek returned empty content');
  return content;
}

function modelCandidates() {
  return ['glm-5.3-flash', 'qwen3.8-flash'];
}

function localRepresentation(taskTitle: string, messages: ChatMessage[]): TaskRepresentation {
  const latest = [...messages].reverse().find((message) => message.role === 'user')?.content.trim() || taskTitle;
  const focus = latest.slice(0, 120);
  return {
    design_goal: focus,
    user_needs: [], use_context: [], constraints: [],
    unresolved_questions: ['目标用户、具体使用情境与关键限制仍需结合后续对话确认'],
    search_topics: {
      user_context: `${taskTitle} ${focus} 用户需求 使用情境 研究`,
      precedents: `${taskTitle} ${focus} 相关产品 服务 设计案例`,
      implementation: `${taskTitle} ${focus} 实施条件 技术 成本 隐私`,
    },
  };
}

async function searchTavily(apiKey: string, category: SearchCategory, query: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7_000);
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST', signal: controller.signal,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, topic: 'general', search_depth: 'basic', max_results: 10, include_answer: false, include_raw_content: false, include_images: false }),
  }).finally(() => clearTimeout(timeout));
  if (!response.ok) throw new Error(`Tavily ${response.status}`);
  const data = (await response.json()) as { results?: SearchResult[] };
  return { category, label: CATEGORY_LABEL[category], query, results: (data.results || []).slice(0, 10) };
}

export async function POST(request: Request) {
  const diagnostics: Array<{ stage: 'representation' | 'response'; model: string; success: boolean; reason?: string }> = [];
  try {
    const body = (await request.json()) as { mode?: Mode; task?: { title?: string }; messages?: ChatMessage[] };
    const mode = body.mode && STYLE[body.mode] ? body.mode : 'SA';
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const deepSeekKey = process.env.DEEPSEEK_API_KEY;
    const tavilyKey = process.env.TAVILY_API_KEY;
    if (!deepSeekKey || !tavilyKey) return Response.json({ error: 'AI检索服务尚未完成配置，请联系研究人员。' }, { status: 503 });

    const candidates = modelCandidates();
    const attempts = diagnostics;
    const representation = localRepresentation(body.task?.title || '开放设计', messages);
    const representationModel = 'local-structured-processing';
    attempts.push({ stage: 'representation', model: representationModel, success: true });

    const categories: SearchCategory[] = ['user_context', 'precedents', 'implementation'];
    const searches = await Promise.all(categories.map(async (category) => {
      try { return await searchTavily(tavilyKey, category, representation.search_topics[category]); }
      catch (error) { return { category, label: CATEGORY_LABEL[category], query: representation.search_topics[category], results: [], error: error instanceof Error ? error.message : 'search failed' }; }
    }));
    const evidence = searches.map((search) => ({
      category: search.category,
      label: search.label,
      query: search.query,
      ...('error' in search ? { error: search.error } : {}),
      results: search.results.map(({ title, url, content, score }) => ({ title: title.slice(0, 120), url, content: content.slice(0, 160), score })),
    }));

    const responseSystem = `你是一名参与早期概念设计的AI协作伙伴。围绕开放设计主题“${body.task?.title || '开放设计'}”与用户进行多轮中文对话。下面提供结构化任务表征与三类外部检索结果。优先选择相关性最高且能直接回应当前输入的材料，不要罗列全部资料，不得虚构来源。回复控制在200至260个汉字、4至6个完整句子；包含3至4个有实质内容的信息单元，其中至少两项应是来自检索材料的具体事实、案例、机制或现实约束，并说明它们与当前构想的关系，再依照实验条件辅助方案推进或引导反思。不要只给出分类框架、笼统方向或重复用户输入，不使用Markdown标题或列表。实验条件仅控制回复方式，不得改变任务主题或捏造用户意图。\n\n实验条件：${STYLE[mode]}\n\n结构化任务表征：${JSON.stringify(representation)}\n\n外部信息集合：${JSON.stringify(evidence)}`;
    let reply = '';
    let responseModel = '';
    const responseCandidates = candidates;
    for (const model of responseCandidates) {
      try {
        const candidate = await callDeepSeek(deepSeekKey, model, [
          { role: 'system', content: responseSystem },
          ...messages.map(({ role, content }) => ({ role, content })),
        ], 420, { timeoutMs: model === responseCandidates[0] ? 12_000 : model === 'glm-5.3-flash' ? 12_000 : 15_000 });
        reply = candidate;
        responseModel = model;
        attempts.push({ stage: 'response', model, success: true });
        break;
      } catch (error) {
        attempts.push({ stage: 'response', model, success: false, reason: error instanceof Error ? error.message : 'unknown' });
      }
    }
    if (!reply) throw new Error('All response models failed');

    return Response.json({
      reply,
      trace: {
        pipelineVersion: 'three-stage-v3-single-llm-top10',
        model: responseModel,
        representationModel,
        responseModel,
        fallbackUsed: attempts.some((attempt) => !attempt.success),
        attempts,
        representation,
        searches: evidence.map((item) => ({ ...item, results: item.results.map(({ title, url, score }) => ({ title, url, score })) })),
      },
    });
  } catch (error) {
    console.error('chat-pipeline-error', error instanceof Error ? error.message : 'unknown');
    return Response.json({ error: '任务表征、检索或回复生成失败，请稍后重试。' }, { status: 502 });
  }
}
