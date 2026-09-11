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
      thinking: { type: 'disabled' },
      messages,
      ...(options.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  }).finally(() => clearTimeout(timeout));
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`DeepSeek ${response.status}: ${detail}`);
  }
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('DeepSeek returned empty content');
  return content;
}

function modelCandidates() {
  return ['minimax-m3', 'qwen3.8-flash'];
}

function localRepresentation(taskTitle: string, messages: ChatMessage[]): TaskRepresentation {
  const userTurns = messages.filter((message) => message.role === 'user').map((message) => message.content.trim()).filter(Boolean);
  const latest = userTurns.at(-1) || taskTitle;
  const original = userTurns[0] || taskTitle;
  const focus = (userTurns.length > 1 ? `${original}；当前请求：${latest}` : latest).slice(0, 320);
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

function localEvidenceReply(mode: Mode, representation: TaskRepresentation, evidence: Array<{ results: SearchResult[] }>) {
  const topics = evidence.flatMap((item) => item.results.slice(0, 4)).map((item) => item.title.replace(/^\[?PDF\]?\s*/i, '').replace(/\s*[-_|].*$/, '').trim()).filter((item, index, all) => item.length >= 6 && all.indexOf(item) === index);
  const first = topics[0] || '目标用户的具体困难与使用情境';
  const second = topics.find((item) => item !== first) || '相关方案的适用条件与实施限制';
  const [originalIssue, currentRequest = ''] = representation.design_goal.split('；当前请求：');
  const issue = originalIssue.slice(0, 80);
  if (/药品|药物|吃药|服药|用药|药盒|处方/.test(issue)) {
    if (mode === 'SA') return '你关注的四类困难可以对应到三个设计环节。药品识别可结合大字标签、颜色与形状编码，但不能只靠颜色；服药前应根据个人药单核对药名、剂量和时间，冲突提示需由可靠药物数据库或药师确认，避免让老人按症状自行选药。取药结构可考虑按压弹出、倾斜药仓或整板药托，并让家属或药师协助完成首次录入。你可以先选一种高频用药情境，画出“识别—核对—取药—确认”的流程。';
    if (mode === 'SR') return '你已经把记忆、识别、用药安全和操作能力四类困难放在了一起。可以继续想一想：系统是在帮助老人按既定医嘱取药，还是允许他们根据症状决定吃什么药？这两种目标对应的安全责任并不相同。若药盒提示与纸质处方、家属录入或药师记录不一致，老人应相信哪一个，又如何获得确认？取药便利也值得放到真实手部力量、视力和多药并用的情境中检视。';
    if (mode === 'CA') return '不要把症状判断、药品识别、冲突核验和取药结构混成一个模糊功能。先限定系统只帮助老人执行已确认的医嘱，不能让其按症状自行选药；再建立个人药单，核对药名、剂量和服用时间，并由可靠数据库或药师确认冲突。药仓必须用大字、形状和位置共同编码，不能只依赖颜色。最后用“识别—核对—取药—确认”流程测试按压弹出或倾斜药仓。';
    return '目前最需要审视的是系统的安全边界。先回答：它是在提醒老人执行既定医嘱，还是在帮助老人根据症状选择药物？如果药盒、处方、家属录入和药师记录出现不一致，谁拥有最终确认权？还要分别检查看不清、记不住、手部力量不足和多药冲突发生时，用户在哪一步最容易出错；这些判断会决定你需要的是信息提示、专业核验，还是取药结构改造。';
  }
  if (/(隔代|家庭|家人|亲属|子女).*(沟通|交流|联系)|(远程|异地).*(照护|健康|陪伴)/.test(issue)) {
    const asksForDefinition = /情境|功能|亮点|画像|一起|共同|判断|定义/.test(currentRequest);
    const revisesAudience = /不涉及|改为|仅限|不是|而是|成年|子女|孙辈/.test(currentRequest);
    if (revisesAudience && mode === 'SA') return '明白，这里不把儿童作为使用者，而是聚焦独居老人和异地成年子女。可以把“晚间报平安”设为核心情境：老人睡前通过实体按键、语音或简单状态卡主动确认；子女在自己的作息允许时查看结果并留言，不要求双方同时在线。若超过约定时间仍未确认，系统先温和提醒老人，再按家庭预设逐级通知联系人。这样装置的亮点是异步、低打扰的双向确认，而不是持续监控或普通视频通话。';
    if (revisesAudience && mode === 'SR') return '明白，核心关系应改为独居老人和异地成年子女，而不是儿童参与。以“晚间报平安”为场景时，可以继续审视：报平安是老人主动表达，还是系统要求其完成的任务？子女晚归或加班未查看时，老人会不会反而产生担忧？如果老人没有确认，系统应经过几次提醒、间隔多久，才升级为异常联络？这些取舍决定它更像关系连接工具，还是健康监护设备。';
    if (revisesAudience && mode === 'CA') return '既然不涉及儿童，就不要再保留“隔代互动”的功能设定。目标用户应明确为独居老人和异地成年子女，核心场景锁定晚间报平安。流程必须规定老人如何主动确认、子女何时查看、超时后怎样提醒，以及何种条件下才通知第二联系人；不能把一次未回应直接判定为健康异常。功能重点应是异步、低打扰的双向确认，而不是继续堆叠视频和健康监测。';
    if (revisesAudience) return '既然不涉及儿童，需要重新审视“隔代沟通”是否仍是准确的问题定义；当前更接近异地成年子女与独居老人的家庭照护。以晚间报平安为场景时，谁在承担确认义务：老人必须按时操作，还是子女需要主动查看？如果子女因加班没有回应，是否会让老人产生新的担忧？如果老人没有确认，什么证据足以把普通遗漏升级为健康异常？这些问题会影响装置的角色与责任边界。';
    if (asksForDefinition && mode === 'SA') return '可以，我们先把它具体化。核心用户可定义为独居或留守、具有基本自理能力但数字操作经验有限的老人，以及异地居住、希望参与照护的成年子女和孙辈。重点情境包括日常报平安、儿童主动发起陪伴、服药或活动提醒，以及老人长时间未回应时的分级联络。功能亮点可放在“双向参与”：老人用一个动作回应或发起联系，孩子用语音、照片和简短任务参与陪伴；健康信息只共享趋势和异常，不持续展示全部数据。下一步可以先选择“晚间报平安”作为核心情境展开。';
    if (asksForDefinition && mode === 'SR') return '可以先共同厘清这个装置究竟服务于“维系亲情”还是“远程照护”，因为两者会形成不同的用户画像与功能重点。对于老人，需要考虑其独居状态、操作能力、健康风险和被监控感；对于孩子及其父母，则要区分陪伴意愿、照护责任和可投入时间。你希望优先处理日常联系、健康提醒，还是异常情况下的求助？如果只能突出一个亮点，什么价值是普通视频通话无法替代的？';
    if (asksForDefinition && mode === 'CA') return '先不要继续泛化功能，必须把目标用户和核心场景定下来。用户画像应至少区分独居老人、异地成年子女和参与交流的孙辈，并明确谁负责设备设置与异常处理。场景先锁定日常报平安、儿童陪伴和异常联络三类；亮点不能只是视频通话加健康监测，而应形成老人能主动回应、孩子能轻量参与、异常信息分级通知的闭环。先选一个主场景，否则功能会继续堆叠。';
    if (asksForDefinition) return '先审视三项关键判断：这个装置的首要目标是缓解孤独、促进隔代关系，还是降低远程照护的不确定感？老人、成年子女和孙辈在其中分别是主要用户、照护者，还是陪伴者？日常无回应在什么条件下才应升级为健康异常，而不是隐私或生活节奏问题？这些答案会决定核心情境，也能检验所谓“功能亮点”是否真正超越普通视频通话和健康手环。';
    if (mode === 'SA') return '这个方向把家庭沟通与远程健康照护联系起来了。可以将装置分为日常交流、健康状态共享和异常联络三个层次：平时支持低门槛的语音或视频联系；健康信息只呈现老人愿意共享的少量指标；出现异常时，再按预先约定通知家人或照护者。为了避免装置变成单向监控，可以加入老人可见的共享状态、暂停共享和主动发起联系功能。你可以先画出老人和孩子各自发起一次互动的流程。';
    if (mode === 'SR') return '这个构想同时涉及亲情交流与健康照护，但两者的关系还值得进一步审视。孩子远程了解健康状态时，老人会感到被关心，还是被持续监控？哪些信息适合日常共享，哪些只有出现异常并获得同意后才能发送？如果老人没有回应，系统应把它理解为暂时不方便、设备操作失败，还是健康风险？这些不同解释会直接影响提醒方式、隐私边界和家人介入程度。';
    if (mode === 'CA') return '不要把“促进沟通”和“远程照护”合并成一个含糊目标。先区分日常交流、健康信息共享与异常求助三条流程，并明确每条流程由谁发起、共享什么、何时结束。健康信息不能默认全部向家人开放，必须提供老人可见的授权、暂停和撤回机制；未回应也不能直接判定为健康异常。先用一次日常联系和一次异常联络验证完整流程，再决定需要哪些传感器和通信功能。';
    return '当前构想需要先审视亲情连接与照护介入之间的边界。孩子希望及时了解情况，是否等同于老人愿意持续共享健康信息？当老人没有回应时，系统依据什么判断是暂时不便、不会操作，还是需要家人介入？还可以进一步比较：由老人主动分享、系统定时询问和异常时自动通知，哪种方式更能兼顾安全感、自主性与家庭关系？这些判断会影响装置的核心角色。';
  }
  if (mode === 'SA') return `你的构想已经形成了可继续发展的切入点。相关资料显示，${first}；另有案例指出，${second}。可以先围绕“${issue}”明确目标用户和高频情境，再把两项证据转化为功能要求，并用一个典型使用流程检查可行性。具体优先级可以由你结合任务目标决定。`;
  if (mode === 'SR') return `你已经提出了一个值得继续检视的方向。相关资料显示，${first}；同时，${second}。这些信息提示我们需要进一步思考：当前构想主要回应的是谁在什么情境下的核心困难？如果便利性、实施条件和用户自主性发生冲突，你会依据什么标准作出取舍？`;
  if (mode === 'CA') return `当前构想还不足以直接进入方案细化。资料显示，${first}；另有案例指出，${second}。不要停留在“${issue}”这一宽泛表述，先锁定目标用户与高频情境，把上述证据转化为明确的功能要求，再绘制一条关键使用流程并检查实施条件。`;
  return `当前构想中的关键依据还没有被检验。资料显示，${first}；同时，${second}。先回答两个问题：你所说的“${issue}”究竟发生在谁的哪种具体情境中？当用户自主性、使用便利与实施成本无法同时满足时，你依据什么标准决定优先级？`;
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

    const responseSystem = `你是一名参与早期概念设计的AI协作伙伴。围绕开放设计主题“${body.task?.title || '开放设计'}”与用户进行多轮中文对话。必须结合完整对话理解“这方面”“继续说”等指代，直接承接上一轮话题回答，不能把这些追问本身当成设计目标，也不要重复已经说过的内容。下面提供结构化任务表征与三类外部检索结果。优先选择相关性最高且能直接回应当前输入的材料，不要罗列全部资料，不得虚构来源；不要输出网页标题、作者、年份、引用次数、“摘要”等检索元数据或原始片段。回复控制在200至260个汉字、4至6个完整句子；包含3至4个有实质内容的信息单元，其中至少两项应是来自检索材料的具体事实、案例、机制或现实约束，并自然说明它们与当前构想的关系，再依照实验条件辅助方案推进或引导反思。使用自然连贯的对话语言，不要只给出分类框架、笼统方向或重复用户输入，不使用Markdown标题或列表。实验条件仅控制回复方式，不得改变任务主题或捏造用户意图。\n\n实验条件：${STYLE[mode]}\n\n结构化任务表征：${JSON.stringify(representation)}\n\n外部信息集合：${JSON.stringify(evidence)}`;
    let reply = '';
    let responseModel = '';
    const responseCandidates = candidates;
    for (const model of responseCandidates) {
      try {
        const candidate = await callDeepSeek(deepSeekKey, model, [
          { role: 'system', content: responseSystem },
          ...messages.map(({ role, content }) => ({ role, content })),
        ], 420, { timeoutMs: 14_000 });
        reply = candidate;
        responseModel = model;
        attempts.push({ stage: 'response', model, success: true });
        break;
      } catch (error) {
        attempts.push({ stage: 'response', model, success: false, reason: error instanceof Error ? error.message : 'unknown' });
      }
    }
    if (!reply) {
      reply = localEvidenceReply(mode, representation, evidence);
      responseModel = 'local-evidence-fallback';
    }

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
