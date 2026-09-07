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

async function callDeepSeek(apiKey: string, messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, maxTokens: number) {
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
      temperature: 0.7,
      max_tokens: maxTokens,
      messages,
    }),
  });
  if (!response.ok) throw new Error(`DeepSeek ${response.status}`);
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('DeepSeek returned empty content');
  return content;
}

function parseRepresentation(raw: string): TaskRepresentation {
  const candidate = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const value = JSON.parse(candidate) as Partial<TaskRepresentation>;
  const topics = value.search_topics || ({} as Record<SearchCategory, string>);
  if (!value.design_goal || !topics.user_context || !topics.precedents || !topics.implementation) throw new Error('Invalid task representation');
  return {
    design_goal: String(value.design_goal),
    user_needs: Array.isArray(value.user_needs) ? value.user_needs.map(String) : [],
    use_context: Array.isArray(value.use_context) ? value.use_context.map(String) : [],
    constraints: Array.isArray(value.constraints) ? value.constraints.map(String) : [],
    unresolved_questions: Array.isArray(value.unresolved_questions) ? value.unresolved_questions.map(String) : [],
    search_topics: {
      user_context: String(topics.user_context),
      precedents: String(topics.precedents),
      implementation: String(topics.implementation),
    },
  };
}

async function searchTavily(apiKey: string, category: SearchCategory, query: string) {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, topic: 'general', search_depth: 'basic', max_results: 5, include_answer: false, include_raw_content: false, include_images: false }),
  });
  if (!response.ok) throw new Error(`Tavily ${response.status}`);
  const data = (await response.json()) as { results?: SearchResult[] };
  return { category, label: CATEGORY_LABEL[category], query, results: (data.results || []).slice(0, 5) };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { mode?: Mode; task?: { title?: string }; messages?: ChatMessage[] };
    const mode = body.mode && STYLE[body.mode] ? body.mode : 'SA';
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const deepSeekKey = process.env.DEEPSEEK_API_KEY;
    const tavilyKey = process.env.TAVILY_API_KEY;
    if (!deepSeekKey || !tavilyKey) return Response.json({ error: 'AI检索服务尚未完成配置，请联系研究人员。' }, { status: 503 });

    const representationPrompt = `你负责将一段早期设计对话整合为结构化任务表征，并规划三类外部检索。当前开放设计主题为“${body.task?.title || '开放设计'}”。不得替用户确定尚未表达的目标、用户群或方案；缺失信息应放入unresolved_questions。只返回合法JSON，不要添加解释或Markdown。JSON结构必须为：{"design_goal":"","user_needs":[],"use_context":[],"constraints":[],"unresolved_questions":[],"search_topics":{"user_context":"","precedents":"","implementation":""}}。三条search_topics分别检索：用户需求与使用情境、相关案例与现有方案、实施条件与发展环境；应结合当前对话动态生成，彼此不重复，表述为适合网页搜索的简洁查询。`;
    const representationRaw = await callDeepSeek(deepSeekKey, [
      { role: 'system', content: representationPrompt },
      ...messages.map(({ role, content }) => ({ role, content })),
    ], 700);
    const representation = parseRepresentation(representationRaw);

    const categories: SearchCategory[] = ['user_context', 'precedents', 'implementation'];
    const searches = await Promise.all(categories.map((category) => searchTavily(tavilyKey, category, representation.search_topics[category])));
    const evidence = searches.map((search) => ({
      category: search.category,
      label: search.label,
      query: search.query,
      results: search.results.map(({ title, url, content, score }) => ({ title, url, content: content.slice(0, 900), score })),
    }));

    const responseSystem = `你是一名参与早期概念设计的AI协作伙伴。围绕开放设计主题“${body.task?.title || '开放设计'}”与用户进行多轮中文对话。下面提供结构化任务表征与三类外部检索结果。只使用与当前输入相关且有依据的信息，不要罗列所有资料；不得虚构来源。回复控制在120至220个汉字，通常包含2至3个信息单元，不使用Markdown标题或列表。实验条件仅控制回复方式，不得改变任务主题或捏造用户意图。\n\n实验条件：${STYLE[mode]}\n\n结构化任务表征：${JSON.stringify(representation)}\n\n外部信息集合：${JSON.stringify(evidence)}`;
    const reply = await callDeepSeek(deepSeekKey, [
      { role: 'system', content: responseSystem },
      ...messages.map(({ role, content }) => ({ role, content })),
    ], 420);

    return Response.json({
      reply,
      trace: {
        pipelineVersion: 'three-stage-v1',
        model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
        representation,
        searches: evidence.map((item) => ({ ...item, results: item.results.map(({ title, url, score }) => ({ title, url, score })) })),
      },
    });
  } catch (error) {
    console.error('chat-pipeline-error', error instanceof Error ? error.message : 'unknown');
    return Response.json({ error: '任务表征、检索或回复生成失败，请稍后重试。' }, { status: 502 });
  }
}
