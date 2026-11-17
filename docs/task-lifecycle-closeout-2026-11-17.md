# 任务闭环、摘要与自主开发收尾 — 2026-11-17

Owner：Codex。用户在共享 Gateway 部署窗口释放后要求继续完成这三项任务。
此前证据见[11月16日验收](task-lifecycle-activation-2026-11-16.md)；本轮不覆盖旧失败。

## 范围与当前状态

- 正式整合 PR #98，保留其两个已验证修复，解决与最新 main 的纯文档冲突。
- 保持共享 Gateway：nori-router/nori-web/nori-slack 三服务，main/nori-community 双探针；
  独立 nori-discord 保持禁用。保留全部 Slack、Community 状态、现有能力和运行配置。
- 正式发布包含修复的源码后，将 rein-acp 从旧私有发行副本收敛回标准 plugins/rein-acp；
  先完整备份、验证候选，再切换并验证。旧副本保留供追溯，不删除历史。
- 复验无期限摘要、显式删除防复活、当前owner范围和重启恢复；再由Nori完成新的隔离仓库开发闭环。
  不代写Nori验收项目代码，不发布其项目或引入业务写入。

状态：进行中。PR原head af90ea1曾通过7项CI；本轮合并main后须重新检查，不能沿用旧head结论。

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
