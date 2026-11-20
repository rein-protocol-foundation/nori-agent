// Match complete, typed runtime notices. Ordinary chat can quote these strings verbatim.
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";

type Copy = { zh: string; en: string };

const statuses = new Map<string, Copy>([
  ["✅ New session started.", { zh: "Nori 已为你开启新对话。", en: "Nori started a new conversation." }],
  ["✅ Session reset.", { zh: "Nori 已重置这段对话。", en: "Nori reset this conversation." }],
  ["✅ ACP session reset in place.", { zh: "Nori 已在当前线程重置任务会话。", en: "Nori reset the task session in this thread." }],
  ["⚠️ ACP session reset failed. Check /acp status and try again.", { zh: "Nori 未能重置任务会话。请用 /acp status 查看状态后重试。", en: "Nori could not reset the task session. Check /acp status and try again." }],
  ["⚙️ Compaction unavailable (missing session id).", { zh: "Nori 找不到当前会话，暂时无法压缩上下文。", en: "Nori could not find this session to compact it." }],
  ["⚙️ Compaction unavailable: the previous run is still stopping.", { zh: "上一次任务还在停止，结束后可以再压缩上下文。", en: "The previous task is still stopping. Try compacting again when it finishes." }],
  ["⚙️ Compaction unavailable: command session changed.", { zh: "会话已切换，请在目标对话中重新发起压缩。", en: "The conversation changed. Request compaction again in the intended conversation." }],
  ["⚙️ Compaction unavailable: command invocation closed.", { zh: "这次压缩请求已关闭，请重新发起。", en: "The compaction request closed. Please try again." }],
  ["⚙️ Compaction unavailable: session accounting failed.", { zh: "Nori 未能核对会话用量，本次压缩无法确认。", en: "Nori could not verify session usage or confirm compaction." }],
]);

const errors = new Map<string, Copy>([
  ["Follow-up completed, but OpenClaw could not deliver it to the originating channel. The reply content was not forwarded to this channel to avoid cross-channel misdelivery.",
    { zh: "后续任务已完成，但 Nori 未能把结果送达原频道。为保护原对话的内容，结果未转发到这里。", en: "Nori finished the follow-up but could not deliver it to the original channel. To protect that conversation, the result was not forwarded here." }],
  ["I generated a reply but could not deliver it to this chat. Please try again.", { zh: "Nori 已生成回复，但未能送达这段对话。请再试一次。", en: "Nori prepared a reply but could not deliver it here. Please try again." }],
  ["OpenClaw could not write local session data because the disk is full. Free some disk space and try again.", { zh: "Nori 的存储空间已满，这次会话数据未能写入。请联系管理员释放空间后重试。", en: "Nori could not save this conversation because the disk is full. Ask an administrator to free space and try again." }],
  ["The selected auth profile is unavailable in this agent's OpenClaw credential store. Import or migrate that credential into the agent, select another configured profile, or run `openclaw configure`, then retry.",
    { zh: "Nori 无法使用所选的认证配置。请切换到可用配置，或联系管理员恢复凭据后重试。", en: "Nori could not use the selected sign-in profile. Select an available profile or ask an administrator to restore the credentials, then retry." }],
  ['⚠️ Missing API key for provider "openai". Run `openclaw doctor --fix` to repair stale OpenAI model/session routes, restart the gateway if doctor asks, then try again. If doctor has nothing to repair or the error persists, re-auth with `openclaw models auth login --provider openai` or run `openclaw configure`.',
    { zh: "Nori 找不到当前 OpenAI 路由的 API 密钥。请联系管理员检查模型路由和认证配置后重试。", en: "Nori could not find the API key for the current OpenAI route. Ask an administrator to check the model route and its credentials, then retry." }],
  ["⚠️ Something went wrong while processing your request. Please try again, or use /new to start a fresh session.", { zh: "Nori 未能处理这次请求。请重试，也可以用 /new 开启新对话。", en: "Nori could not process this request. Please try again, or use /new to start a fresh conversation." }],
]);

// The backend detail may contain multiple lines. Keep it intact and only replace
// the wrapper and recovery hint when both match the same native error code.
const backendMissingHint = "Run `/acp doctor`, install/enable the backend plugin, then retry.";
const acpRecovery = new Map<string, [string, Copy]>([
  ["ACP_BACKEND_MISSING", [backendMissingHint, { zh: "请联系管理员检查任务服务的安装与配置后重试。", en: "Ask a Nori administrator to check that the task service is installed and enabled." }]],
  ["ACP_BACKEND_UNAVAILABLE", [backendMissingHint, { zh: "请联系管理员检查任务服务是否可用后重试。", en: "Ask a Nori administrator to check the task service and try again." }]],
  ["ACP_DISPATCH_DISABLED", ["Enable `acp.dispatch.enabled=true` to allow thread-message ACP turns.", { zh: "请联系管理员确认当前线程是否允许使用任务服务。", en: "Ask a Nori administrator whether task requests are enabled for this thread." }]],
  ["ACP_SESSION_INIT_FAILED", ["If this session is stale, recreate it with `/acp spawn` and rebind the thread.", { zh: "如果会话已失效，请用 /acp spawn 创建会话并重新绑定线程。", en: "If the session has expired, create one with /acp spawn and reconnect this thread." }]],
  ["ACP_INVALID_RUNTIME_OPTION", ["Use `/acp status` to inspect options and pass valid values.", { zh: "请用 /acp status 检查可用选项后重试。", en: "Check the options with /acp status, then try again." }]],
  ["ACP_BACKEND_UNSUPPORTED_CONTROL", ["This backend does not support that control; use a supported command.", { zh: "当前任务服务不支持此操作，请选择它支持的命令。", en: "Choose a command that the task service supports." }]],
  ["ACP_TURN_FAILED", ["Retry, or use `/acp cancel` and send the message again.", { zh: "可以重试，也可以用 /acp cancel 取消后重新发送。", en: "Try again, or cancel with /acp cancel before resending." }]],
]);

function formatTaskError(text: string, language: keyof Copy) {
  const match = /^ACP error \((ACP_[A-Z_]+)\): ([\s\S]+)\nnext: ([^\n]+)$/u.exec(text);
  if (!match) return;
  const recovery = acpRecovery.get(match[1]);
  if (!recovery || match[3] !== recovery[0]) return;
  if (language === "en") return `Nori could not complete the task request: ${match[2]}\n${recovery[1].en}`;
  return `Nori 的任务服务遇到问题：${match[2]}\n${recovery[1].zh}`;
}

export function registerChatNotices(api: OpenClawPluginApi) {
  const language = process.env.NORI_CHAT_NOTICE_LANGUAGE === "en" ? "en" : "zh";
  api.on?.("reply_payload_sending", ({ payload }) => {
    if (!payload.text) return;
    const text = (payload.isError && (errors.get(payload.text)?.[language] ?? formatTaskError(payload.text, language))) ||
      (payload.isStatusNotice && statuses.get(payload.text)?.[language]);
    if (text) return { payload: { ...payload, text } };
  });
}
