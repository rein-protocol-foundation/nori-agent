# 任务配置、沙箱修复与真实验收 — 2026-11-16

Owner：Codex / Astra High；跟进 SA-M1、SA-M2、SA-M2-06。代码基线9ed4cb2。
用户明确批准既有私有频道的 taskLoop/continuation、两个任务工具、上下文注入、原线程回复及
仅重启 nori-slack；另批准 bubblewrap 0.9.0-1ubuntu0.3 与官方定向 AppArmor profile，
要求保留全局限制和 workspace-write 隔离。无期限服务器保留、默认不删除和 Slack 原文保留决定不变。
本记录补充[先前准备、失败与发布](task-lifecycle-live-2026-11-16.md)，不将旧失败改记为通过。

## 已批准配置与隔离验证

- 21:11:42 UTC 在 updater lock 下完整备份原 Slack 配置及四服务PID，基于最新配置只合并获批字段。
  原生 config validate 通过，再原子替换并仅重启 Slack；其PID523428→525786。
  Discord523435、Router523417、Web523425未变。保留现有主助手原生能力、partnership工具、bindings与全部其他频道设置。
- 启用 rein-acp / taskLoop / continuation / retainedSummaries；agent为main，仅频道C0C4L0YN814。
  bounds为4 attempts、2 no-progress、30分钟、16 active flows；summary本身没有TTL。
  配置备份位于服务器 root-only `task-enable-20261116T211142Z`。
- 安装日志确认0 upgraded、1 newly installed、0 removed：bubblewrap 0.9.0-1ubuntu0.3。
  AppArmor profile直接取自Ubuntu官方apparmor-profiles包，只加载/usr/bin/bwrap及其受限子profile；
  未安装/升级apparmor-profiles或其他包。kernel.apparmor_restrict_unprivileged_userns与
  kernel.unprivileged_userns_clone均保持1。包/操作回滚材料在root-only `sandbox-enable-20261116T211228Z`。
- 首次profile预校验因本机parser不支持`--skip-write-cache`退出，此时没有安装包或加载profile。
  根据实际help改为`-Q -K`，再验证/安装/加载成功，未降低检查要求。
- 使用ACP实际嵌套Codex二进制、`:workspace`权限profile与禁用网络设置，运行不调用模型的Python探针：
  工作区写入成功、同账号原本可写的工作区外目录写入被拒绝、宿主loopback测试监听端口连接被拒绝。
  workspace临时文件由探针清理，外部测试文件未创建；无互联网请求。后续没有新增bwrap/Codex AppArmor拒绝日志。

## 实际用户入口与当前证据

所有消息均由Slack连接器以真实Rein Admin发送，并读回验证；不是Nori自行触发。

| 场景 | 实际证据 | 状态/限制 |
| --- | --- | --- |
| 无期限摘要写入/回读 | [摘要线程](https://reinprotocolf-e2q1425.slack.com/archives/C0C4L0YN814/p1794863584039689)；flow f290c615-3625-4723-8b41-e0ed94ac1cde，run b9f4043b-dfd5-40a2-9e42-bf1b86ba8484；结果1147，父助手独立复算，review返回retained/expiresAt=null；下一条真实用户请求list/read成功 | 真实通过；存储目录0700/文件0600；后台完成回调的list被human-control拒绝，未扩大权限 |
| 运行中改向 | flow aa68adf3-bcf7-47bd-b5b6-48202df77b65：scope1旧run160d0ebb-b79a-4875-b41b-95f8be25e1d6在90秒等待中被取消，native_cancel_record确认；scope2新rund0b7bd79-d4be-492b-a014-9b8c20916575完成2×3=6并保留摘要 | 真实通过；本次旧子任务未产出迟到结果，真实迟到竞争未被这次运行覆盖 |
| 停止和显式删除 | flow ae290ed5-7683-4b54-b80b-2da46f3d30fb，run89a26a24-92b2-4674-aaea-f1115e1fbbd8在180秒等待中停止；native取消确认，先保存终态摘要，再仅delete_summary该副本，read返回null | 真实通过；fullDeletion=false，原生Flow/Task、Slack原文、文件/备份保留；库中2 retained/1空payload tombstone |
| 不同原生owner读取 | [独立线程](https://reinprotocolf-e2q1425.slack.com/archives/C0C4L0YN814/p1794863862525159)实际调用read_summary返回null/unavailable_or_deleted，同时普通聊天回答41 | 真实通过；同一人不同原生owner的范围检查，不冒充另一账户或真实成员撤权验收；随后stop同一外部flow实际返回rein_continuation_unavailable，未改变目标。该错误故意不区分缺失/无权，Nori曾误解释成整项工具不可用，技能文案已澄清 |
| ACP新开发 | [开发线程](https://reinprotocolf-e2q1425.slack.com/archives/C0C4L0YN814/p1794863659885799)；flow7c1a6a2b-d5c6-4496-8417-0fa777e78d51，run3a180afa-53bb-4c24-8e85-9bc2d1c2ee16，taskaf271ceb-a318-46eb-a61b-cb1ccb4a0781 | 代码实际交付/18测试通过；Flow后置关联与摘要收尾仍待修复，见下节 |

可用性标记实际返回artifactAvailability=not_verified；Nori明确保存引用不证明外部文件存在或可访问。
不以该标记冒充真实外部文件下载/丢失测试。原生七天cleanup仍由隔离fixture模拟，未删除/伪造线上原生历史。
重启后摘要保留与tombstone防复活测试，待当前收尾修复验证后执行。

## ACP实际开发与发现的收尾问题

Nori自行调查和保存跑前快照，经现有ACP Codex补充stdin输入功能和5项新测试，父助手独立审阅
diff/新增文件并复测。新文件test_stdin_input.py、event_summary.py的stdin分支均非维护侧代写。
父助手用跑前实现+新测试复现11个失败subtest，修复后全套18项通过；维护侧也独立重跑18项通过，
git diff --check通过。旧两次blocked run保留原样；新ACP run为succeeded且terminal_outcome为空，
父助手实际收到返回并核对，而非将accepted当完成。项目未commit/发布/安装依赖或调整权限。
首次spawn使用不允许的override被拒，Nori自行改为配置允许的参数后启动；记录该拒绝，不称零错误执行。

已完成的ACP在父助手首次rein_continuation review时才补建managed projection，被原生runTask拒绝：
`Task backing ownership could not be verified.`。重复status也失败。维护侧要求停止重复对账和运行环境调查，
Nori如实交付代码、测试、旧失败与未保存摘要的缺口，未伪造完成。

固定SDK的runTask仅接受queued/running参数；kernel禁止为终态backing创建新的活动projection。
控制器自有Flow stateJson/finish并不要求该投影。拟采用终态原生引用，继续验证当前owner/session、
捕获的run/child/runtime、实际taskId和独立settlement，不把引用伪装为linked，也不对任意关联拒绝降级放行。
修复、原生接缝验证和真实恢复结果待补充。不得因此修改只读vendor或直接改原生数据库。

收尾修复本地证据：73项定向通过；worker两次临时native fixture失败后停止并升级。Astra修正fixture共享状态与ACP能力声明后，`rein-terminal-native-FuNqr2`原生Gateway探针断言通过：实际ACP单次执行、原生终态投影拒绝复现、准确引用保留、native_wait结算与complete review/合成原线程交付。该探针不替代下次线上恢复验收。

## 限定运行副本与重启验收跟进

PR #98 / 9481dc549ea4：73定向通过；CI 1439通过、0失败、4既有跳过，7项检查全部通过。
最终只读代码复核无发现。服务器候选配置、原生runtime inspect均通过，rein-acp loaded且注册两个任务工具。
首次候选验证因误用UID1000不可读而失败；改用实际ubuntu账户后通过，此前线上配置未动。
21:43:29 UTC仅Slack切换到 `runtime/task-controller-release-9481dc549ea4/rein-acp`，
Slack PID525786→530514；Discord523435、Router523417、Web523425不变。
完整配置及摘要SQLite一致备份位于root-only `task-controller-20261116T213723Z`；原生数据库未改写。

原开发flow实际status已恢复为review并准确引用task/run/child，linkage=terminal_reference_only。
但旧run缺少已保存settlement，重启后的review返回run_not_settled；保留原flow/run及缺口，不重置期限，
不以代码18测试通过或native succeeded伪装流程完成。旧notice仍描述早先missing backing，不能据此忽略新task引用。

摘要重启验收发现native worker后端身份冲突，实际list/read均失败，不能计为保留验收通过。
进一步查明运行代码经过OpenClaw plugin-captures临时副本，import.meta.url不是稳定后端路径。
尝试对字节完全一致的后端使用规范路径symlink并仅重启Slack（PID531301）后，capture不包含该symlink，
错误变为ENOENT。该路径方案未通过，停止继续尝试；原摘要仍2 retained/1空payload tombstone，原生记录与Slack原文保留。
既有Discord网关18793不是异常旧Slack进程，未停止或改变它。后续需基于公共插件源路径修复并补真实多capture测试。

公共接缝核查确认：固定SDK的`docs/plugins/sdk-overview.md`明确要求用`api.runtimeSource`定位runtime
entry旁的私有模块；`api.source`/`resolvePath`属于discovery身份，不能替代选定runtime artifact。
SQLite broker是每个Gateway进程内的global singleton，冲突不存储在数据库中；同release多capture必须使用
同一真实backend URL，跨release需关闭全部旧lease或完整重启所属独立Gateway。无需重置数据库或重启Discord。

新独立只读交付复验flow `cc05aa0c-d478-42e0-8fe5-e45b61e26a41`，run
`a41e3456-5844-4253-abb5-085ec6da976d`，task `a2e9b10d-7cb9-42a6-a0fa-de9c0c4df339`：
真实ACP执行一次，native_wait确认结算、父助手review complete。ACP与父助手各自18测试通过，CLI行为正确，
四个源码SHA256及既有git dirty状态前后不变；没有重新实现、添加测试、commit、发布或扩权。
该新复验没有重写旧flow的run_not_settled缺口。其长期摘要当前仍failed，后台read_summary被human-control
正确拒绝；待路径修复后由真实用户入口触发保留/回读。

修复实现改为仅在摘要启用时从可信`api.runtimeSource`构造同目录backend file URL，并显式传给store。
缺失/相对runtimeSource或非静态本地URL直接拒绝，没有import.meta fallback。
新增实际公开worker回归先在旧代码复现同库backend冲突，修复后双捕获模块并发读写、删除防复活、
关闭单一lease后另一实例继续工作、全部close后重开均通过。现有范围/权限与失败闭合测试保持通过。
聚合定向验证75项全通过（53 continuation/summary/ACP +22 Slack task-loop）；scaffold及diff检查通过。
