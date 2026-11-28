# 任务闭环、摘要与自主开发收尾 — 2026-11-17

Owner：Codex。用户在共享 Gateway 部署窗口释放后要求继续完成这三项任务。
此前证据见[11月16日验收](task-lifecycle-activation-2026-11-16.md)；本轮不覆盖旧失败。

## 范围与当前状态

2026-11-19 收尾确认：本任务包括任务闭环、服务器摘要无期限保留与显式删除、自主开发验收。下文及后续正式开发频道记录已验证该范围，关联 #58、#60 已完成关闭。后续报告读取与 blocked-result 审核修复由开放的 #132 跟踪；完整产品边界由 #65 跟踪。

- 正式整合 PR #98，保留其两个已验证修复，解决与最新 main 的纯文档冲突。
- 保持共享 Gateway：nori-router/nori-web/nori-slack 三服务，main/nori-community 双探针；
  独立 nori-discord 保持禁用。保留全部 Slack、Community 状态、现有能力和运行配置。
- 正式发布包含修复的源码后，将 rein-acp 从旧私有发行副本收敛回标准 plugins/rein-acp；
  先完整备份、验证候选，再切换并验证。旧副本保留供追溯，不删除历史。
- 复验无期限摘要、显式删除防复活、当前owner范围和重启恢复；再由Nori完成新的隔离仓库开发闭环。
  不代写Nori验收项目代码，不发布其项目或引入业务写入。

状态：本次任务范围已完成并验收。最终候选a56081a七项CI均通过；PR #98于2026-11-17 23:50:33 UTC合并为2aed6422d3f8。正式部署与真实入口收尾结果见下文。

## 已核对的基线

线上源码73074b316625；三服务active、独立Discord inactive，updater已退出、队列为空。
纯文档冲突已解决，保留共享Gateway与任务验收双方的完整记录，合并提交88ba152。
在updater锁下创建root-only备份`/var/backups/nori-task-closeout-20261117T232938Z`：
5个agent数据库及原生状态/摘要库共7个SQLite一致备份，配置/启动器/updater配置副本，
原会话标识及不可变历史行哈希清单。备份不进入Git；后续只验证原记录仍存在，不覆盖新增记录。

## 历史ACP恢复边界

旧flow7c1a6a2b…/run3a180afa…在当时插件关联错误发生前没有保存有效settlement。
本轮再次检查固定SDK：ACP runner先写Task succeeded，随后才更新idle、reconcile identifiers、
关闭oneshot runtime，并最终等待execution binding和释放active turn。因此succeeded/endedAt、
session idle或聊天结果都不能代替完整结束证明。

公共getSessionStatus只选择session，不选择run；公共Task detail无持久settlement字段。
accepted-turn settled Promise属于进程内Map；agent.wait缺失snapshot时返回timeout，
没有从ACP持久Task重建exact-run receipt的公共接口。旧记录保持原状态与缺项，不重复执行、
不改写原生数据库、不伪造完成；已有新复验的有效native_wait及complete证据仍成立。

所需最窄上游契约：native owner在cleanup/execution binding/accepted-turn结算完成后，持久化
带taskId/runId/childSessionKey/ownerKey/instanceId的fenced receipt，通过owner-bound Task API
返回settled/active/unknown。未写入或崩溃时必须unknown，不能用session idle推断。此处仅记录
接口需求，未修改只读vendor，也未声称该跨重启crash gap已消除。

## 陈旧提示修复与发布前检查

只处理精确的missing-backing提示：当前owner/run/child/runtime确切匹配后，保存一份有界
backingRecovery记录并清除已被事实取代的提示。既有complete记录仅在当前scope的review/report、
succeeded和已保存有效settlement一致时，在view中改列historicalNotice；不改写原生历史，也不声称重新检查了backing。
缺结算、外部owner、报告矛盾、真实取消/期限/未知提示不会因此被升级为完成。
新增回归先在旧实现失败，修复后80项定向通过，零失败/跳过；scaffold及diff检查通过。
正式CI、部署和真实入口复验仍待执行。

发布前再次发现main推进到PR #106 / 45e61fc（原生Slack定时任务线程投影修复）。
已以a56081a同步，未发生代码冲突；其自动部署已成功退出、队列清空后才继续本窗口。
首次本地Cron边界测试因该轻量worktree缺少openclaw包链接而无法加载；连接原checkout中相同固定SDK的
只读依赖后，18项全部通过。此前601f810的集成CI因新head被取消，不冒充最终发布检查；
最终发布候选a56081a自己的七项CI全部通过（integration 44201431989、scaffold 44201432002），
插件1490项：1486通过、0失败、4既有跳过；未沿用被取消head结果。


## 正式部署与保留检查

PR #98 的2aed6422d3f8已通过原有合并webhook自动部署，23:53:56 UTC健康；等待更新器归档退出、
队列清空后才取得锁。配置候选原生validate和runtime plugin inspect通过，实际加载源为
`/home/ubuntu/rein-agent/plugins/rein-acp/index.ts`。只将rein-acp旧私有副本路径切到正式源码，
仅重启共享nori-slack（612736→614948）；Router/Web PID未变，独立Discord仍inactive。
main/Community的rein_status均成功，业务写入能力分别true/false。

5个agent的原session_nodes、session_windows、transcript_events、archives行均未丢失，
82个私有文件内容与权限不变；5份retained摘要与1个空payload删除标记完整，摘要库0700/0600。
updater、其他受检配置均未改变。最早基线到切换前存在两项并发配置差异：agentToAgent allow及
rein-router trustedSlackChannels；两项在本次切换前的即时备份中已存在，均原样保留，
不把它们归为本次变更。相对于即时备份，本次配置差异严格只有rein-acp加载路径。
即时回滚备份：`/var/backups/nori-task-standard-path-20261117T235614Z`；旧私有插件副本保留。

## 新的自主编码真实验收

[新独立Slack线程](https://reinprotocolf-e2q1425.slack.com/archives/C0C4L0YN814/p1794959891820509)：
给既有隔离fixture增加正整数`--min-count N`过滤，保留stdin等既有未提交改动；
Nori调查、测试先失败、ACP实现、全部回归、父助手独立审阅和review。维护侧不代写功能。
新任务已完成实现、父助手独立审阅、原生结算、complete review及真实用户摘要回读；重启复验结果见后续记录。

正式路径重启后的真实用户回读已通过：KEEP=1147、CHANGE=6均retained/expiresAt=null；
STOP status后read_summary仍null/unavailable_or_deleted。cc05aa0c…仍complete、一次attempt、
原native_wait结算和摘要可读；historicalNotice明确superseded_by_settled_complete_review及
currentBackingAvailability=not_rechecked，未伪称重新验证backing。旧7c1a6a2b…记录保持，
此前deadline对账已使其表现为cancellation_pending，缺settlement依然存在。


实际flow `b90ab1ae-2af0-47c0-b5c1-b2801357fb16`，仅一次attempt；
run `a5707e92-b471-4b98-a14c-3986d99c88e1`，task `2d48a70a-c086-4e40-a118-f66b139afa75`，
child `agent:codex:acp:d1c70bc7-8810-41ea-95e9-d553c3d40b4d`。
`native_wait`结算、reviewed=true、complete；terminal_reference_only保留准确原生引用。
backingRecovery保存初始缺记录提示及准确引用，当前notice已清除，未放宽结算门槛。

Nori先调查并跑18项基线，新增test_min_count.py五项；旧实现实际报unrecognized arguments --min-count，
再最小改动event_summary.py的参数校验和过滤。父助手与维护侧分别23项全通过；维护侧另测多组排序、
阈值过滤全部输出空对象通过。与跑前归档直接比较，stdin及三份原测试字节未变；只新增过滤功能和新测试。
维护侧在nori-acp-pilot的workspace-write、network_access=false真实Codex sandbox内运行验证，未代写实现。
未提交、发布或安装依赖；既有未跟踪文件和缓存保留。

运行中同线程普通聊天回答41，精确run进度可查询；没有重派。Nori曾漏tool_call id、传入不允许的taskName、
重建而非使用delegate原文，遭schema/策略拒绝后自行修正；维护侧补充了一条调用契约提醒。
因此本轮证明Nori主导实现/测试/审阅闭环，不声称整个首次调用过程无人提示或零错误。
一次旧turn status返回current authorized turn required，未越过当前回合权限；后续授权回合与completion正常。

真实人类入口read_summary确认retained/expiresAt=null，report与原run一致；不同原生owner读取返回
null/unavailable_or_deleted。明确合成不存在PDF经test -e确认ABSENT，摘要仍明确artifactAvailability=not_verified，
未伪称产物存在；此检查不代表删除过任何文件。review的pending_or_uncertain并非消息送达回执，
实际Slack线程可见交付，仅证明本轮确实到达，不宣称exactly-once。

保留限制：旧ACP的未持久结算恢复契约仍缺；真实另一账户/成员撤权、实际迟到子结果竞争未在本轮新增覆盖。
本轮没有将整个Super Agent PRD或公共边界验收标记完成。

## 最终重启复验

所有原生Task均无queued/running、更新队列为空后，在更新器锁内再次完整重启共享nori-slack：
614948→618798，Router/Web PID未变。main/Community健康及权限均通过；全部原历史行、82私有文件、
其他配置保留；摘要库现为6 retained/1空payload tombstone。
真实用户在新开发原线程再次调用status/read_summary：complete、恰好一次attempt、原run/task、
native_wait、父助手23测试报告均不变，retained/expiresAt=null。未重跑代码、未重新委派或删除任何记录。

本轮授权范围完成：正式源码发布/加载、无期限摘要及保留边界、限定Nori主导开发验收。
旧缺结算run和未覆盖的完整产品边界按上文保留；后续证据文档发布状态以对应PR与部署记录为准。
