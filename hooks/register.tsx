import type { Register } from 'claude-code'

// ── 状态（存在插件自己的 store 里，所有 session 共享）──────────
const ON = 'on'               // 朗读开关
const SPEAKING = 'speaking'   // 正在朗读：{ id, at }，用来在横条上显示「⏹ 停止」
const SYNC_MS = 3000          // 各 session 对齐开关显示（只读一个值，不读文件）

// 当前正在看的 session：桌面 App 每次切换 session 都会更新它的 lastFocusedAt
const READ_FOCUSED = [
  'import glob, json, os',
  'best, bid = 0, ""',
  'for f in glob.glob(os.path.expanduser("~/Library/Application Support/Claude/claude-code-sessions/*/*/local_*.json")):',
  '    try:',
  '        j = json.load(open(f))',
  '        t = j.get("lastFocusedAt") or 0',
  '        if t > best and j.get("cliSessionId"): best, bid = t, j["cliSessionId"]',
  '    except Exception: pass',
  'print(bid)',
].join('\n')
async function focusedSession($: any): Promise<string> {
  try {
    const { exitCode, stdout } = await $.process.run(['/usr/bin/python3', '-c', READ_FOCUSED], { timeoutMs: 10000 })
    return exitCode === 0 ? stdout.trim() : ''
  } catch { return '' }
}

// 念之前先去掉不适合念的东西：代码块、表格、链接、Markdown 符号
function forSpeech(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s*\|.*\|\s*$/gm, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/[*_#>]+/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

const SUMMARY_SYSTEM = [
  '你把 AI 编程助手的一段回答改写成要念给用户听的口语摘要。',
  '要求：',
  '- 2 到 4 句话，总共不超过 120 个字，像同事口头汇报。',
  '- 只说结论和用户需要知道的事，不念代码、文件路径、命令、链接、表格。',
  '- 数字和版本号照实说。',
  '- 如果回答里在等用户确认、选择或回答问题，最后一句明确说出需要用户决定什么。',
  '- 用中文。只输出要念的话，不要任何前缀或说明。',
].join('\n')

// 播放：edge-tts 合成后用 afplay 播；没有 edge-tts 或没网络时退回 macOS 的 say
const PLAY = [
  'D="$HOME/.claude/voice-reply"; mkdir -p "$D"; T="$D/say-$$.txt"; M="$D/reply-$$.mp3"; cat > "$T"',
  'export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$HOME/miniconda3/bin:$PATH"',
  'E=$(command -v edge-tts)',
  'if [ -n "$E" ] && "$E" --voice "$1" --rate="$2" -f "$T" --write-media "$M" >/dev/null 2>&1; then /usr/bin/afplay "$M"; rc=$?',
  'else /usr/bin/say -v "$3" -f "$T" 2>/dev/null || /usr/bin/say -f "$T"; rc=$?; fi',
  'rm -f "$T" "$M"; exit $rc',
].join('\n')
const STOP = 'pkill -f "afplay $HOME/.claude/voice-reply/" ; pkill -x say ; exit 0'

async function stopSpeaking($: any) {
  try { await $.process.run(['/bin/sh', '-c', STOP], { timeoutMs: 5000 }) } catch { /* 忽略 */ }
  await $.store.set(SPEAKING, null)
  $.ui.invalidate('ui.render')
}

export const register: Register = (on, options) => {
  const o: any = options ?? {}
  const cfg = {
    voice: String(o.voice || 'zh-CN-YunxiNeural'),
    rate: String(o.rate || '+10%'),
    fallbackVoice: String(o.fallbackVoice || 'Tingting'),
    summaryModel: String(o.summaryModel || 'haiku'),
    minChars: Number(o.minChars ?? 60) || 60,
  }
  let shown: boolean | null = null   // 横条上次画的开关状态，变了才重画
  let sync: { cancel: () => void } | null = null

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    if (!e.isInteractive) return started
    try { await $.command.register({ name: 'voice-reply', description: '语音朗读回答摘要：开 / 关（和横条上的 🔊 按钮一样）' }) } catch { /* 忽略 */ }
    sync?.cancel()
    sync = $.clock.every(SYNC_MS, async () => {
      const now = (await $.store.get(ON)) === true
      if (now !== shown) $.ui.invalidate('ui.render')
    })
    return started
  })

  // 回答结束：开着、而且你正在看这个 session，才念它的摘要
  on('turn.complete', async ($, e, next) => {
    const out = await next(e)
    if (e.agentId || e.reason !== 'answer') return out
    if ((await $.store.get(ON)) !== true) return out
    const me = await $.session.id()
    if ((await focusedSession($)) !== me) return out
    const plain = forSpeech(String(e.answer || ''))
    if (!plain) return out
    // 摘要和播放都不挡住这一轮的收尾
    void (async () => {
      let text = plain
      if (plain.length >= cfg.minChars) {
        try {
          const r: any = await $.model.complete({ model: cfg.summaryModel, system: SUMMARY_SYSTEM, prompt: String(e.answer), maxTokens: 400, effort: 'low', timeoutMs: 30000 })
          text = r.isAnswered && r.text.trim() ? r.text.trim() : plain.slice(0, 120)
        } catch { text = plain.slice(0, 120) }
      }
      if ((await $.store.get(ON)) !== true) return
      const at = await $.clock.now()
      await $.store.set(SPEAKING, { id: me, at })
      $.ui.invalidate('ui.render')
      try {
        await $.process.run(['/bin/sh', '-c', STOP], { timeoutMs: 5000 })   // 先停掉还在念的上一段
        await $.process.run(['/bin/sh', '-c', PLAY, 'sh', cfg.voice, cfg.rate, cfg.fallbackVoice], { stdin: text, timeoutMs: 300000 })
      } catch { /* 忽略 */ }
      const cur = (await $.store.get(SPEAKING)) as any
      if (cur && cur.at === at) { await $.store.set(SPEAKING, null); $.ui.invalidate('ui.render') }
    })()
    return out
  })

  // 你一发消息就停（在任何 session 里都算）
  on('prompt.submit', async ($, e, next) => {
    if ((await $.store.get(SPEAKING)) != null) await stopSpeaking($)
    return next(e)
  })

  // /voice-reply：和横条按钮一样，开着就关、关着就开
  on('command.run', { command: 'voice-reply' }, async $ => {
    const v = (await $.store.get(ON)) !== true
    await $.store.set(ON, v)
    if (!v) await stopSpeaking($)
    $.ui.invalidate('ui.render')
    return { text: v ? '🔊 已开启：你正在看的 session 回答结束后，会念一段口语摘要。' : '🔇 已关闭语音朗读。' }
  })

  // 横条：在其他插件（比如 session-radar）画的内容下面加一行开关，不覆盖它们
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const { Box, Text, Button } = $.ui.resolve(e)
    const isOn = (await $.store.get(ON)) === true
    shown = isOn
    const speaking = (await $.store.get(SPEAKING)) != null
    return (
      <Box flexDirection="column">
        {below}
        <Box key="voice-row" flexDirection="row">
          <Button key="voice-toggle" label={isOn ? '🔊 朗读：开' : '🔇 朗读：关'} dimColor={!isOn} onPress={async () => {
            const v = !isOn
            await $.store.set(ON, v)
            if (!v) await stopSpeaking($)
            $.ui.invalidate('ui.render')
          }} />
          {speaking && <Button key="voice-stop" label="⏹ 停止" onPress={() => stopSpeaking($)} />}
          {isOn && !speaking && <Text dimColor>  只念你正在看的 session 的回答摘要</Text>}
        </Box>
      </Box>
    )
  })
}
