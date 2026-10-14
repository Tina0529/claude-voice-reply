# voice-reply

**Claude Code 桌面版（macOS）的 mod：你正在看的 session 回答结束后，把回答改写成两三句口语摘要念给你听。**

配合语音输入（桌面 App 输入框旁的麦克风或 macOS 听写）用：你说，它答完念给你听，不用盯着屏幕看。

## 它会怎么做

- 只在**你正在看的那个 session** 回答结束时念；其他 session 跑完不出声。
- 不念全文：先用 Haiku 把回答改写成 2–4 句口语（不超过约 120 字）。代码、路径、表格、链接不念；如果回答在等你确认，最后一句会说出要你决定什么。
- 短回答（默认 60 字以内）直接念原文，不做摘要。
- 声音：edge-tts，默认**晓晓**，可在横条上的下拉框里换（选中会先试听一句），所有 session 同步：

  | 声音 | 特点 |
  |---|---|
  | 晓晓 `zh-CN-XiaoxiaoNeural` | 女 · 温暖自然（默认） |
  | 晓伊 `zh-CN-XiaoyiNeural` | 女 · 活泼 |
  | 晓臻 `zh-TW-HsiaoChenNeural` | 女 · 台湾腔，亲切 |
  | 云希 `zh-CN-YunxiNeural` | 男 · 年轻阳光 |
  | 云扬 `zh-CN-YunyangNeural` | 男 · 沉稳播音腔 |

- 没装 edge-tts、没网络、或 edge-tts 被微软拒绝（403）时，自动改用 macOS 自带的 `say`，并在横条上提示。edge-tts 被拒时运行 `pip install -U edge-tts` 升级即可。
- 你一发新消息（任何 session），正在念的立刻停。

## 开关

- 输入框上方横条里的 **🔊 朗读：开 / 🔇 朗读：关**，点一下切换，所有 session 同步。
- 正在念的时候横条上有 **⏹ 停止**。
- 也可以输入 `/voice-reply` 切换。
- 装好后默认是**关**的，点一下才开始念。

## 安装

```bash
claude plugin install voice-reply --marketplace Tina0529/claude-voice-reply
```

然后完全退出并重开桌面 App（Claude → Quit Claude）。

想要更自然的声音（推荐），装 edge-tts（需要联网，不需要 API Key）：

```bash
pip install edge-tts
```

## 费用与隐私

- 摘要用的是这个 session 自己的 Claude 登录（订阅用户算在订阅用量里），不需要另外的 API Key；每次几百 token。
- edge-tts 会把**摘要文本**发到微软的朗读服务合成声音；回答全文不会发出去。不想联网可以不装 edge-tts，只用 macOS 本地的 `say`。
- 「正在看哪个 session」是读桌面 App 本地的 session 记录（`lastFocusedAt`）判断的，不联网。

## 配置

```bash
claude plugin configure voice-reply@voice-reply
echo '{"voice":"zh-CN-XiaoxiaoNeural","rate":"+20%"}' | claude plugin configure voice-reply@voice-reply --values-stdin
```

| 配置项 | 默认 | 说明 |
|---|---|---|
| `voice` | `zh-CN-XiaoxiaoNeural` | 默认声音（上表 5 个之一）；横条下拉框选的优先 |
| `rate` | `+25%` | 语速 |
| `fallbackVoice` | `Tingting` | 离线时 macOS `say` 用的声音（`say -v '?'` 查看） |
| `summaryModel` | `haiku` | 做摘要的模型 |
| `minChars` | `60` | 比这个短的回答直接念原文 |

改完重启 App 生效。

## 和 session-radar 一起用

横条两个插件会叠在一起显示（session-radar 1.2.1 以上）。

## License

MIT
