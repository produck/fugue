# 异常面（异常发生后的行为设计）

> 本文是**规范**：一次异常（含“慢”带来的危险状态）出现之后，系统各部分
> **应当**怎样表现。正常路径的语义看 `DESIGN.md`，逐条决策的来历与实测
> 证据看 `DEV.md` 的「异常面」一节。本文只回答"出了事之后会怎样"。

## 一、责任划分

一句话：**谁有能力继续，谁负责继续。**

- **下游实现**：在抽象成员里如实抛出；想恢复就在成员内部自己吞。不负责
  "抛了业务还继续"——那不是框架能给的。
- **抽象层**：不吞、就地报告、前缀不废。不负责猜失败模式、不重试、不熔断。
- **宿主业务**：处置（告警、重试业务、`destroy()` 重建、用前缀收干净）。

两条推论：

- **抛不是违约**，而是"这次操作不能完成"的声明。框架不替下游解释失败的
  性质（暂时忙 vs 彻底坏），所以重试、缓冲、换落点这类"包庇"只能由下游
  在成员内部完成（见第四节）；框架自身只在**写侧与初始化**上亲自
  重试，判据见 §三「其他说明」。
- 框架**不吞数据面的错**：它只承诺三件事——在发生处报告、让拒绝沿自然
  路径走到消费方、让已经拿到的数据照常交付。
- **拷贝与源同形，且不做二次包装**：分发流与源流给出一致的 chunk 序列与
  结束状态；同一个因在哪个拷贝里被撞上，消费方拿到的都是宿主抛出的**那个
  对象本身**（`===`）。多拷贝各自在自己的时空里得到相同的结果，互不牵连。

## 二、两条不对称的策略

- **数据面 fail-fast**：宿主模板成员的失败 ⇒ 报告 + 原样抛出 ⇒ 该拷贝的
  读被拒。落在这里的异常意味着"这一笔不可完成"，不会被悄悄跳过。
- **收摊面 fail-soft**：`_I.CLOSE` / `_I.DROP` / 源 `cancel` 的失败
  **只报告、不再抛出**（`degraded-reader-close-failed` /
  `transferrer-drop-failed` / `source-cancel-failed`）。收摊的职责是把摊子
  收干净，不是继续交付；
  让一个坏介质把 `destroy()` 卡住或拒掉是纯损失。

## 三、逐个异常点：等级 · 发生处 · 观测 · 失败域 · 后处理 · 相关测试

### 等级定义

等级（L1 已定；L2–L4 是当前口径，待你定名）：

- **\[L1\] 可忽略级**：抓到了该异常，但只提供观测——不影响分发器层状态，
  也不影响业务进度。**不靠 `try` 块的也算**：由“慢”带来的危险状态
  （`transferrer-backlog`：积压超阈值）同样落这一级。
- **\[L2\] 局部级**：一个拷贝（或它自己的读器）出局，其他拷贝与分发器照旧。
- **\[L3\] 闩错级**：共享的写侧实例闩错、不可逆；此后只剩已经捕获的前缀。
- **\[L4\] 分发器级**：全部拷贝一起——源坏之后，要新数据的读都拒。
- **后处理**：**\[L1\] 一律“无”**——只观测；资源层面的未了账（源侧
  清理没跑完、介质句柄没放开、内存涨上去）归宿主自己记账。其余各条已
  全部定下，口径分两种：**可重放者重试到预算用尽**（dump / drain /
  initialize），**不可重放者立刻抛出、不闩、出局**（seek / read / close）。
  恢复统一归宿主在自己的成员内部自吞（§一、§四）。

### 所有异常点

- **\[L1\]** · **`source-cancel-failed`**（源 `cancel()` 拒）
  - 观测：`source-cancel-failed`，一次。
  - 失败域：无。
  - 后处理：无（只观测；源侧清理有没有跑完归宿主自己记账）。
  - 相关测试：`Distributor/destroy/promise.test.mjs` ›
    `should dispatch warn(source-cancel-failed) when it refuses`。
- **\[L1\]** · **`transferrer-drop-failed`**（宿主 `_I.DROP` 拒）
  - 观测：`transferrer-drop-failed`。
  - 失败域：无。
  - 后处理：无（只观测；介质句柄是否真放开归宿主自己兜）。
  - 相关测试：`Distributor/destroy/promise.test.mjs` ›
    `should dispatch warn(transferrer-drop-failed) when the release fails`；
    `Transferrer.test.mjs` ›
    `should swallow a failure of the release`、
    `should swallow a synchronous failure of the release`。
- **\[L1\]** · **`degraded-reader-close-failed`**（宿主 `_I.CLOSE` 拒）
  - 观测：`degraded-reader-close-failed`。
  - 失败域：无。
  - 后处理：无（只观测；读器 / 介质句柄是否真关好归宿主自己兜）。
  - 相关测试：`Distributor/destroy/promise.test.mjs` ›
    `should dispatch warn(degraded-reader-close-failed) when it refuses`；
    `ForkedReadableStream.test.mjs` ›
    `should dispatch warn(degraded-reader-close-failed) when it refuses`。
- **\[L1\]** · **`transferrer-backlog`**（积压超阈值——“慢”带来的危险状态）
  - 观测：`transferrer-backlog`，超阈值后每写一笔一条（不去抖）。
  - 失败域：无（不改状态、不挡读、不反压源）。
  - 后处理：无（只观测；内存代价归宿主——限频 / 扩容 / 重建都是宿主的决定）。
  - 相关测试：`Distributor/degraded/warn.test.mjs` ›
    `should dispatch warn(transferrer-backlog) once over the limit`。
- **\[L2\]** · **`degraded-reader-initialize-failed`**（宿主
  `_I.INITIALIZE` 拒；可重试，用尽才出局）
  - 观测：每次尝试一条，载荷 `{ retry, cause }`（`retry` 从 0 起；
    每个降级读器各派）。
  - 失败域：该读器，**从第一个需要介质的位置起**出局（在那之前队列交付
    的读不受影响）；未用尽不闩。
  - 后处理：按 `InitializeRetryInterval` 重试到 `MaxInitializeRetryCount`
    （重试期间该读器的读一直 pending，队列交付的读照旧）；用尽则原样
    抛出；收摊（`I.CLOSED`）落下时立即收手。恢复归宿主——它自己的初始化
    没成功，只有它能判断能不能再来一遍。
  - 相关测试：`Distributor/degraded/warn.test.mjs` ›
    `should dispatch warn(degraded-reader-initialize-failed) on the switch`、
    `should dispatch warn(degraded-reader-initialize-failed) once per attempt`、
    `should land the initialize when the medium answers the retry`、
    `should stop retrying the initialize once the reader is released`；
    `Distributor/fork.test.mjs` ›
    `should dispatch warn(degraded-reader-initialize-failed) after the switch`；
    `Distributor/degraded/phase.test.mjs` ›
    `should reject the read that needs the medium when the medium
refused to open`。
- **\[L2\]** · **`degraded-reader-seek-failed`**（宿主 `_I.SEEK` 拒）
  - 观测：`degraded-reader-seek-failed`，每次定位一条。
  - 失败域：该拷贝（读器不闩，但那个拷贝已摘牌）。
  - 后处理：无（立刻抛出：不重试、不闩）：该拷贝出局，判据见 §三
    「其他说明」；恢复归宿主——只有它知道这次失败有没有动过游标，能自证
    位置无关就在 `_I.SEEK` 内部吞掉重来。
  - 相关测试：`ForkedReadableStream.test.mjs` ›
    `should dispatch warn(degraded-reader-seek-failed) on a failed seek`。
- **\[L2\]** · **`degraded-reader-read-failed`**（宿主 `_I.READ` 拒）
  - 观测：`degraded-reader-read-failed`，每次读回一条。
  - 失败域：该拷贝；只发生在队列卸空之后（`PEEK` 未命中才读回）。
  - 后处理：无（立刻抛出：不重试、不闩）：该拷贝出局，同上；且这块数据
    已不在框架手里（写成功即从队列卸货），介质是唯一副本，等它恢复不保证
    那份数据还在原处。
  - 相关测试：`ForkedReadableStream.test.mjs` ›
    `should dispatch warn(degraded-reader-read-failed) on a failed read`。
- **\[L3\]** · **`transferrer-dump-failed`**（宿主 `_I.DUMP` 拒；可重试，
  用尽才闩）
  - 观测：每次尝试一条，载荷 `{ retry, cause }`（`retry` 从 0 起，每条
    事件是独立快照）。
  - 失败域：写侧实例；未用尽不闩，用尽后闩错、不可逆，收摊则不闩。
  - 后处理：按 `DumpRetryInterval` 重试到 `MaxDumpRetryCount`；期间不闩
    错、`dumping` 保持 pending、队列里的块照发（吸收）；用尽则闩
    `I.DUMPING_ERROR` 并结算门——未被接受的位当场拒；`destroy()` 落下时
    立即收手（既不闩也不记账）。
  - 相关测试：`Distributor/degraded/warn.test.mjs` ›
    `should dispatch warn(transferrer-dump-failed) when the dump fails`、
    `should dispatch warn(transferrer-dump-failed) once per attempt`；
    `Transferrer.test.mjs` › `should retry the dump until the option runs out`、
    `should land the dump when the medium answers the retry`、
    `should stop retrying once the transferrer is released`、
    `should keep the chunks a failed dump left undrained`。
- **\[L3\]** · **`transferrer-write-failed`**（宿主 `_I.WRITE` 拒；可重试，
  用尽才闩）
  - 观测：每次尝试一条，载荷 `{ retry, cause }`（`retry` 从 0 起，每条
    事件是独立快照）。
  - 失败域：写侧实例；未用尽不闩，用尽后闩错、不可逆，收摊则不闩。
  - 后处理：每块由 `I.DRAIN_HEAD` 按 `DrainRetryInterval` 重试到
    `MaxDrainRetryCount`（**重试归每块，逆历归 `I.DRAIN`**）；期间不闩错、
    队列里的块照发（吸收）；用尽则闩 `I.DRAINING_ERROR` 并结算门——未被
    接受的位当场拒；`destroy()` 落下时立即收手（既不闩也不记账）。
  - 相关测试：`Distributor/degraded/warn.test.mjs` ›
    `should dispatch warn(transferrer-write-failed) when the write fails`；
    `Transferrer.test.mjs` ›
    `should retry the write when the medium answers the second time`、
    `should give up the drain once the retry option runs out`、
    `should stop draining once the transferrer is released`。
- **\[L4\]** · **`source-read-failed`**（源 `read()` 拒，源基础设施坏）
  - 观测：`source-read-failed`，每次一条。
  - 失败域：分发器。
  - 后处理：**已存在的拷贝不被主动终结**——前缀内的位置照读
    （`ensure` 不进循环），一旦要 `pulledChunkCount` 之外的那一块就起一趟
    pull ⇒ 那个拷贝**自己**拒，其他拷贝不受影响。与 `terminate()` /
    `destroy()` 的区别：那两条才是主动终结所有拷贝。
  - 相关测试：`ForkedReadableStream.test.mjs` ›
    `should reject with the source error itself`、
    `should dispatch warn(source-read-failed) when the source fails`、
    `should keep the prefix of every copy when the source breaks`。

### 其他说明

- **"该拷贝"= 拷贝自己摘牌**：`conclude()` 关自己的读器 + 从降级交接名单
  摘牌，其他拷贝各有自己的读器实例，不受影响（它们读同一介质，可能各自
  失败，但不是链式熔断）。
- **"写侧实例"= 闩错**：介质域的失败按域落在 `I.DUMPING_ERROR` /
  `I.DRAINING_ERROR`，各自只置一次、不可逆。闩住之后 drain 不再进循环、
  `$I.WRITE` 直接抛，于是"之后每趟要新数据的读都拒"。已入队 / 已落盘的块
  照发（`[I.SETTLE]` 在终态放行全部等待者，`position < total` 的位就位）。
- **挂 ≠ 崩**：介质"永不落地"（死盘）时位置门不结算，该拷贝的 read 一直
  pending（不拒也不给数据），只能靠消费者 cancel 那个拷贝；`destroy()`
  不陪它。
- **不给码的失败**：宿主取值器抛、切换期的写侧构造器 / 降级读器构造器 /
  `_S` 静态成员抛——只有那个拷贝 read 的拒绝，`degraded` 保持为假、下一趟
  pull 重试切换。守它的三条用例：`ForkedReadableStream.test.mjs` ›
  `should reject the read when an option getter throws`、
  `Distributor/degraded/phase.test.mjs` ›
  `should stay false, rejecting the read, when the host constructor throws`、
  `should stay false, rejecting the read, when the family is unfinished`。
- **谁持有那份数据，决定谁亲自重试**：框架亲自重试（dump / drain 的策略）
  只落在「**框架仍持有那份数据 + 失败发生在队尾**」上——`_I.DUMP` 时字节在
  stash 快照里、`_I.WRITE` 时块还在 `PENDING_CHUNKS` 里，重试是**重放同一
  份数据**；用尽即封存，前缀照旧经 `PEEK` 交付（尾断而头不断 ⇒ 渐进降级）。
  不满足的是 `_I.SEEK` / `_I.READ`：块一写成功即卸货 ⇒ 介质成为**唯一副本**，
  游标又只有宿主知道（`SEEKED_COUNT` 只是镜像，也没有绝对定位原语可从
  "未知推进"里回退），失败还落在**消费点**（头）——重试不是重放，是再赌
  一次，赌输的代价是静默丢块。
- **共同前提是一条宿主义务**：模板成员抛出 ⇒ 这一笔**没发生**（字节没落、
  游标没动）。dump / drain 的两次重试立在这条上；违约的代价是介质侧错位
  或残迹，**框架检测不到**。能自证"位置无关"的宿主，就该在自己的成员
  内部吞掉重来。
- **回退只在下游自己的成员内部**（2026-09-29 定）：`_I.INITIALIZE` 抛出即
  "没发生"，半开状态（句柄 / 映射 / 临时文件）由下游在自己的成员里用
  `try` / `finally` 就近收干净；框架**不**赋予 `_I.CLOSE` "清理半开
  初始化"的语义——它的含义只有一个：关闭这个读器。但要注意：拷贝出局时
  `_CLOSE` 仍会被调到（初始化失败的拷贝也会出局），所以回退必须就地做完，
  不能留到 `_CLOSE` 去猜。

## 四、恢复归属

- **闩错不可逆**：没有"重置闩锁 / 换一个写侧实例"的口子，相位也单向
  （降级之后不回内存相）。所以要恢复只有两条路：**在模板成员内部消化**
  （唯一的包庇点），或者**重建分发器**。
- **构造器抛与模板成员抛不对称**：构造器抛时 `degraded` 仍为假，下一趟
  pull 会重试切换（不闩）；模板成员抛一律闩住。前者是"还没切换"，后者是
  "切换后介质坏了"。
- **已接受的位不因闩错作废**：闩错只否决"还没拿到的"位置。

## 五、观测面

- **出口唯一**：所有 `warn` 都经分发器的受保护成员 `$I.WARN(code, payload)`
  派发（元件那份 `$I.WARN` 只是转发，真出口仍是分发器那一个）；每个 code
  只有**一个**报告点，且都落在**发生处**（没有代派）。
- **不去抖、不聚合、不发回落事件**：同一个因可以出多条（每次尝试一条），
  这些是水准信号，限频与计数归宿主。`transferrer-backlog` 是唯一的“带量”信号
  （payload = 当前积压字节），也是唯一不进 `try` 块的异常点（按 L1，
  见 §三）；不采样就没有事件，最后一条也不是峰值。
- **10 个 code**：`degraded-reader-close-failed` /
  `degraded-reader-initialize-failed` /
  `degraded-reader-read-failed` / `degraded-reader-seek-failed` /
  `source-cancel-failed` / `source-read-failed` /
  `transferrer-backlog` / `transferrer-dump-failed` /
  `transferrer-drop-failed` / `transferrer-write-failed`。
- **命名约定**：**发生处前缀**——源读取器自己发生的失败带 `source-`
  （`source-read-failed`、`source-cancel-failed`）；写侧实例自己发生的信号
  带 `transferrer-`（现在四个：`transferrer-backlog`、
  `transferrer-dump-failed`、`transferrer-drop-failed` /
  `transferrer-write-failed`）；降级读器自己发生的信号带
  `degraded-reader-`（现在四个：`degraded-reader-close-failed`、
  `degraded-reader-initialize-failed`、
  `degraded-reader-read-failed` / `degraded-reader-seek-failed`）。
- **监听器抛异常不在异常面上**：`dispatchEvent` 不抛，一个抛异常的监听器
  只会成为 `uncaughtException`，不影响任何读。

## 六、不做的事

- 不自动 `terminate()` / `destroy()`：框架不替宿主判断"值不值得继续"。
  全部分发器一起死的路只有两条，都是宿主动作。
- 不聚合、不去抖、不发"恢复"事件：那会把 `warn` 变成宿主必须实现的状态机。
- 不翻译、不包装宿主异常：`warn` 载荷里和沿调用链抛出的都是**宿主给出的
  那个对象本身**，dump 失败也不例外（`transferrer-dump-failed` 的载荷即
  将闩住、随后由 `$I.WRITE` / `$I.WAIT_POSITION` 原样抛出的那个因）。
- 不做失败计数与熔断阈值：没有这样的配置项，也不打算有。
