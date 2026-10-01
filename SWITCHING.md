# 策略切换协调协议（讨论稿）

> 本文件是内存→文件阶段切换的专门讨论空间。先讨论、后落笔。
> 所有内容均为待定草案，不构成已定设计。

## 核心基调

**消费永远是异步的。** 这是整个设计的顶层事实，也是所有协调协议的
立足点：

- 消费者 `reader.read()` 永远返回 Promise；单流内 `pull` 不并发重入。
- 数据流本身是异步的——即便 Buffer 阶段的 chunk 是内存暂存，它们
  也是从 source 流异步消费而来的。
- 因此 `ChunkReader.read()` 对所有实现统一保持 Promise 化（async）
  是**如实建模**，不是妥协：
  - BufferChunkReader 内部可以同步推进（如 index++），但接口统一 async，
    与 FileChunkReader 的异步 I/O 对齐。
  - 正是这个统一 async 契约，让 `$I.CHUNK_READER` 切换透明——拷贝
    不关心前后是不是同一个 reader。
- 单线程 JS 中 `await` 是天然顺序化点：`await dump → 换读器` 不可能
  穿插。可靠性来自 Promise 顺序化，而非同步 I/O。

## 单一协调者模型（已明确）

**分发器是唯一协调者。** 所有共享可变状态由一个协调者集中处理，
这是确定的职责，不是实现偏好。

| 共享状态                          | 谁碰                                  |
| --------------------------------- | ------------------------------------- |
| source reader                     | 仅分发器（唯一 source 消费者）        |
| `Buffer[]`                        | 分发器写；拷贝经自己的 ChunkReader 读 |
| 降级存储                          | 降级策略写入（分发器触发 dump）       |
| 阶段状态（memory/switching/file） | 分发器                                |
| 拷贝集                            | 分发器；拷贝经保护契约注销            |

**拷贝是"哑消费者"**——只通过自己私有的 ChunkReader 读取，从不
直接触碰共享状态。切换是分发器编排的**异步过程**，不是瞬态：

```text
进入 switching → 暂停 source 拉取 → fs.promises.open
  → dump Buffer[] → 播种各拷贝位置 → 换读器 → 恢复拉取
```

切换天然并入既有背压点（dump 未完成暂停 source.read），不是新增机制。

### 实现范围约束

- **Distributor**（`Abstract.mjs` + 其 `I/$I` 状态）：唯一允许触碰
  `SOURCE_READER`、`BUFFER`、文件、阶段状态的代码。
- **ChunkReader**（`ChunkReader/`）：纯读取装置，只维护自身进度
  （`$I.CONSUMED_CHUNK_COUNT`），不接触分发器共享状态。
- **ForkedReadableStream**（`ForkedReadableStream/`）：面向消费者的
  流面，只经 `I.CHUNK_READER` 与 `$I.CHUNK_READER` getter ·
  `$I.SET_DEGRADED_CHUNK_READER()` 交互，对协调无感。
- 跨模块共享状态访问一律走明确的契约接口，不得越权直接写。

## 已收敛设计：`init` Promise 屏障

切换竞态的核心解法已收敛为 **`init` Promise 屏障**，依托"read 恒为
Promise"这一事实：

### 同 tick 换读器

换读器全程**同步**，同一 tick 内一次完成，杜绝"读半截 buffer"窗口：

```text
同 tick（同步）：
  $I.DUMP(stash) 一挥手（不再 await）
    → 读各拷贝的位置（$I.CONSUMED_CHUNK_COUNT） → 构造降级 reader
    → $I.REQUEST_INITIALIZE(progress) → 换入 $I.CHUNK_READER
之后（异步）：
  init 链：等 dumping 落地 → open 介质 → 进度同步（逐界 _I.SEEK）
  read()：过门（该位被接受）→ 队列命中就直接交付；
          否则 await init 链 → I.SYNC() 补差 → 介质侧读回（按游标取数）
```

- 初始化由 `$I.REQUEST_INITIALIZE` **请求**（同一 tick 播种 + 发起链）：
  先等 dumping 落地，再 open 介质，再进度同步。（`close()` **不**等这条链
  ——链体等 `dumping`，死盘上永不落地。）
- 定位是**家族**的义务：`I.SEEKED_CHUNK_COUNT` 记游标已寻道跨过多少条记录，
  每次把读交给介质侧前 `I.SYNC()` 逐次 `_I.SEEK()` 跨边界补差（跨不动就
  停，差值留给下一次）；队列拦下的那段不碰介质侧，差值由此产生。介质侧只
  提供边界原语（跨一条、答是否跨了）与读回（按游标取数）。
- 切换期间到达的 pull 自然 `await init` 挂着——Promise 就是调度队列，
  无需显式暂停/排队机制，`ForkedReadableStream.pull` 零切换感知。

### 两个注意细节

- **进度初始化（2026-09-09 定稿）**：skip 是定位不是新消费。播种途径
  为降级 `$I.REQUEST_INITIALIZE(progress)`：它在调 `_I.INITIALIZE` 前把
  `$I.CONSUMED_CHUNK_COUNT` 置为 `progress`（= skipN），而非靠 `read()` 累计，否则
  进度记错、后续再切换出错。分发器是唯一调用者；初始化无 once-guard
  （2026-09-09 迁往降级家族，`I.INITIALIZATION_STARTED` 已删）。
- **文件句柄生命周期**：所有拷贝共享同一 `init`（同一 fileHandle）。
  介质句柄归**写侧**（transferrer）——`$I.DROP()` 一次放开，不在读器手里；
  读器的 `close()` 只放开它自己的资源（不碰共享介质），由 `destroy()`
  在收摊时调一次，幂等。

### dump 与活块的落点模型（2026-09-16 改写，取代原"停靠模型"）

旧模型的"停靠"来自 `await dumping` 这道**全局屏障**；现在**没有屏障**：
降级时**接管** stash 的整份块列表（同一批对象，只加引用），从此**可读 =
已被接受**——在介质上，或仍在队列里：

- **写侧不阻塞**：`$I.WRITE` 入队即返回，`$I.DUMP` 同步返回——source
  的拉取不因"dump 还没完"停在一趟拉取上；活块在 dump 在途时照常
  进队列（队列无上限，积压处置归下游）。
- **读侧只等自己那一位被接受**：`$I.WAIT_POSITION(position)` 判的是
  `position < 水位 + 队列`；命中队列由抽象层直接交付（介质侧不参与、
  也不 init），已落介质的才走介质侧。
- **落地即交接**：dump 成功时水位一次推满到 `stash.length`，同时**清掉
  接管的这 L 条**（它们已落盘；两件都在结算门之前做完）。所以落地
  **不改变可读性**：同一批块只是从"队列里"变成"介质上"，读者不感知。
- **实测**：dump 30ms 在途时新建 fork，首读 **1ms**（此前 62ms）；整条
  20 块的流只碰介质 1 次（终态那次），介质 20 块、顺序正确、无重复。
- **剩下的等待**只有"位还没被拉进来"（等拉取）；介质的进度只决定
  "从哪儿取"，不决定"能不能取"。失败则闩 `I.DUMPING_ERROR` /
  `I.DRAINING_ERROR`、门只拒绝**未被接受**
  的位（队列里接管的这批照发），接管的块与 stash 都留着（现场）。

## 分发器与 ChunkReader 构造协议（已明确）

> 2026-08-26 设计讨论修订：移除分发器 `id`；转存职责移到
> `AbstractDegradedChunkReader` 静态侧（`_S.DUMP` + `dump()`）；
> 不设 `_I.OPEN`。下文标注"已认可"的为定稿方向，其余待定。
>
> 2026-09-07 修订：转存职责迁出 reader——`AbstractDegradedChunkReader`
> 回归纯读；写侧抽为独立 **Transferrer**（家族内部抽象实例：`dump` /
> `write` / per-stash dumping），具体 reader 经一次性静态成员
> `transferrer` 配置其配套 Transferrer 实例。原静态 `_S.DUMP` /
> `S.DUMPING` / `getChunkStashDumping` 相应改为 Transferrer 成员。
>
> 2026-09-15 修订：Transferrer 由策略级单例改为**分发器持有、降级时
> 构造**的实例——类由降级读器家族静态给出（`_S.TRANSFERRER_CTOR`），
> 构造参数经 `setTransferrerArgs()` 预置（写侧家族的
> `_S.PARSE_ARGUMENTS` 归一、基类默认恒等，分发器不解释），
> 实例与 `ChunkStash` 1:1；原一次性静态成员 `transferrer` 的配置方式取消。
> 与 stash 的绑定仍发生在 `dump(chunkStash)`。
>
> 同日续：实例 1:1 于 stash，故写侧状态退化为普通字段；三个驱动
> `$I.DUMP(chunkStash)` / `$I.WRITE(buffer)` / `$I.SET_DONE()` 归受保护
> （只给分发器与 agent），读侧公开 `get dumping` / `get done`；抽象侧
> `_I.WRITE(buffer)` 不再带 stash。
>
> 2026-09-16 修订：**dump 并入延缓写入**——`$I.DUMP` 同步返回（同步
> 里开工）并把 stash 的整份块列表**接管**过来（此刻队列必空），成功即
> 自己 `DROP` 载体、清掉那 L 条、失败保留现场；`$I.WRITE` 入队即返回，单飞 drain 按
> FIFO 落盘（先等 dump 落地，否则会把副本再写一遍）。读侧不再认识
> dump：旧 dumping 屏障（`chunkStashDumping`）退役，改为统一位置门
> `$I.WAIT_POSITION(position)`（**接受度**：在介质上或在队列里都算可读），
> 策略 init 改惰性（首次读介质前），公开面随之去掉 `get dumping`。
> 因此**降级改全同步**：一挥 `$I.DUMP` 即换读器，分发器不再 `await`
> 任何东西。
>
> 同日再续：策略 init 不再是惰性——`$I.REQUEST_INITIALIZE` 同步播种
> 并发起链（等 dumping 落地 → open → 进度同步），定位归家族
> （`I.SEEKED_CHUNK_COUNT` 记游标已寻道跨过的块数，`I.SYNC()` 逐界 `_I.SEEK`，
> 落介质前补差），`get dumping` 加回公开面，初始化链直接 `await dumping`
> （不再另有受保护入口）。

- **分发器 `id`**：每个分发器对应一个 SourceStream，持有一个 UUID
  作为唯一标识（构造时生成），供存储工件唯一命名。
  **已移除**（已认可，2026-08-26）：分发器不承担标识职能。ChunkStash
  作为数据制品层承担数据职责；若某个降级方案需要字符串 `id`，那是
  该降级方案（下游）的责任，`DUMP` 逻辑自理。
- **构造上下文**：分发器创建 ChunkReader 时提供共享 stash（构造直接
  收 `chunkStash`，受保护 `$I.CHUNK_STASH`；2026-09-09：`progress` 不再
  入构造）。进度作为请求初始化的参数：分发器调用受保护
  `$I.REQUEST_INITIALIZE(progress)`（`progress` = 该拷贝在共享序列的
  位置，读受保护 `$I.CONSUMED_CHUNK_COUNT`，即 skip 位置），降级在调
  `_I.INITIALIZE` 前先播种 `$I.CONSUMED_CHUNK_COUNT = progress`。
  `BufferChunkReader` 经同一符号按 index 读；降级时 stash 由 transferrer
  接管——`$I.DUMP` 成功即 `DROP`（失败保留现场，供调试）。
  reader 其余要素由子类自己实现；分发器不提供存储实现细节（临时
  目录、文件句柄、路径），也不提供 `id`——`id` / 文件名等属降级
  策略内部细节。
  2026-09-15：降级时另向各拷贝读器交接写侧实例（构造参数由策略经
  `setTransferrerArgs()` 预置，分发器只存转、不解释）。
- **`AbstractDegradedChunkReader` 抽象中间层（纯读）**：降级读取器家族
  的统一基类。写侧不在本类（2026-09-07 迁往 Transferrer）：
  - 实例经受保护 `$I.CHUNK_STASH` 持有共享 `chunkStash`（已认可：
    维持受保护、不新增符号，构造阶段与 `AbstractChunkReader` 协议
    对齐）。初始化不再等整份 dump（2026-09-16 改）：先过位置门，
  - **写侧类静态声明**（2026-09-15 取代一次性静态成员 `transferrer`）：
    具体 reader 类静态声明写侧类 `_S.TRANSFERRER_CTOR`；实例
    由分发器在降级时构造并持有，交接给各拷贝读器（不再一次性守卫）。
  - **位置门（2026-09-16 取代 `chunkStashDumping`）**：读路径每次
    `$I.WAIT_POSITION($I.CONSUMED_CHUNK_COUNT)`；初始化链先 `await dumping`
    （整份转移落地）再跑 `_I.INITIALIZE`。`get dumping` 是公开观察面，
    可读性不依赖它。
  - **不设 `_I.OPEN`**（已认可）：`OPEN` 是文件类降级的领域术语，
    抽象初始化 `_I.INITIALIZE` 已包含 open 概念。
- **`AbstractTransferrer`（写侧内部抽象，2026-09-07 定稿）**：
  - 受保护实例 `$I.DUMP(chunkStash)`：与 stash 绑定的时刻，**同步返回**；
    微任务里调抽象 `_I.DUMP`，成功则由**本实例** `DROP` 载体并把水位推
    满；失败闩 `I.DUMPING_ERROR`、结算门、保留现场（接管的
    这批仍在队列里照发），返回的 Promise 以转义错误拒给分发器挂 `warn`。
  - 抽象实例 `_I.DUMP`（下游实现）：**靠参数拿到 `chunkStash`**，
    负责转存 ChunkStash 到降级目标，返回 PromiseOr。
  - 受保护实例 `$I.WRITE(buffer)`：**入队即返回**（不碰介质）；抽象
    `_I.WRITE(buffer)` 由单飞 drain 按 FIFO 调用。
  - 受保护实例 `$I.SET_DONE()`：源已尽在降级相位的一次落点。
  - 实例为纯内部对象：不开公开观察面（调试看符号）；家族只经
    `get dumping` 与 `$I` 原语交互——1:1 于
    stash，故为普通字段而非 WeakMap / WeakSet。
  - **Degraded 自定义资源由策略自持**（2026-09-15 放宽）：实例与
    stash 1:1，转存产物可留在实例自己的字段里（原为策略自备
    WeakMap）；例如文件降级在 `DUMP` 时自行生成 uuid 或文件名；
    `id` / 文件名等是降级策略内部细节，非分发器职责。
  - **位置门只提供阻塞，不提供产物**（语义延续 2026-09-16）：门放行 =
    "该位已落介质"；转存产物（文件名 / 偏移等）仍走降级策略自备字段，
    与门解耦。分发器与读器都不接触 dump 的生命周期。
  - 【待定：`_I.DUMP` 返回的 Promise resolve 值（转存产物）的结构；
    实例侧 `_I.INITIALIZE` / `_I.READ` 具体签名】
- **文件版已落地（2026-09-29）**：`FileChunkReader` / `FileTransferrer` 是
  `AbstractDegradedChunkReader` 的 Node 文件系统实现，实现在兄弟包
  `@produck/fugue-degraded-node-file`；文件路径通过
  **配置方法**给出（`setTransferrerArgs(path)`，无默认），属子类职责，非
  分发器维护；**释放即删**（只删本介质自己开过句柄的那个文件），宿主不再
  负责清理，要留档得在 `destroy()` 之前自己复制。**临时文件版已落地**
  （`@produck/fugue-degraded-temporary-file`）：它建在上
  面，自己取名（`os.tmpdir()` + `node:crypto` 随机段），其余全继承。浏览器
  分支（IndexedDB / OPFS）将来同挂其下。
- **动态替换降级 reader 类**：分发器提供"设置降级 ChunkReader 类"的
  方法，可动态替换存储降级阶段使用的 reader 子类（"降级策略读取器
  机制"）。

## 背景与目标

`ChunkStash` 累计超过 `stashByteLimit` 时，分发器从内存阶段切换到
文件阶段。切换必须是**可靠的**——任何拷贝在任何时刻都只能读到
连续完整前缀，不允许读到半截 chunk 或跳号。

本协议讨论切换期间各方的协调，确保：

- 切换对拷贝流透明（拷贝只感知 `read()` 的返回值）
- 切换期间无竞态（dump 与读 buffer 互斥）
- 快慢拷贝的 skip 位置正确
- 切换中的新 fork / cancel 行为确定（`terminate()` 只关闸门，与切换无涉）

## 待定问题清单

### 1. 触发与状态机

- 何时判定需要切换？`ChunkStash` 累计超过 `stashByteLimit` 即触发？
  是否需要二次确认（避免瞬态抖动）？
- 三态模型：`in-memory` / `switching` / `in-file`。
  `switching` 是瞬态还是可持续状态？
- 谁驱动状态推进？source 拉取协程？独立异步任务？

### 2. 竞态清单

- [x] dump 进行中，拷贝 pull 从 BufferChunkReader 读 → 半截数据
      已解：同 tick 换读器后无拷贝再碰 buffer。
- [x] 降级读取器在 dump 完成前读取 → 读到不完整/半截数据
      已解（2026-09-16 换机制）：读侧不再认识 dump，改为统一位置门
      `transferrer.$I.WAIT_POSITION($I.CONSUMED_CHUNK_COUNT)`——`read()` 每次
      先过门，`$I.REQUEST_INITIALIZE` 也在策略 init 前先过门（open/seek
      时介质必已存在）；dump / 写失败各自闩在 `I.DUMPING_ERROR` /
      `I.DRAINING_ERROR`，门只以之拒绝
      未被接受的位（已被接受的位照发），所有（含迟到）消费者一致。
- [x] switching 期间新 `fork()` 的拷贝 → 拿到的 reader 指向何物？
      已解（2026-09-15）：`fork()` 取当前相位字段
      `I.CURRENT_CHUNK_READER_CTOR`（初值内存类，降级换读器的同一同步块里
      翻成策略类），降级相位当场 `$I.REQUEST_INITIALIZE(0)` 播种，故新拷贝
      从介质第 0 位起完整读。
- [ ] 切换途中某拷贝 `cancel` → 未完成的 reader 怎么办？
      （`terminate()` 已不涉于此：它只关闸门、不碰拷贝，2026-09-19）
- [x] **在途 `read` 仍绑旧读器**：`pull` 先取 `$I.CHUNK_READER` 再调
      `$I.ENSURE_THEN_READ`，其中 `ensure()` 期间会换读器——`this` 仍是
      旧的内存读器；DROP 之后它再读即抛 `ChunkStash has been dropped`。
      已解（2026-09-16）：换读器时由分发器调内存族的 `$I.HANDOVER(新读器)`
      交接在途那一笔（位是本文件私有符号，族表与基类都不认识它）；内存
      介质侧在 `ensure()` 回来后重看一眼，已被交接就整笔转发给接替者
      ——转发走接替者的单纯读 `$I.READ`，不再重复 ensure。
      换读器只可能发生在 `ensure()` 的拉取里，所以这一眼足够，也不再依赖
      DROP 时序。实测三种：慢盘 30ms、同步秒落地（无 await）、以及"这次读
      的 ensure 还要再拉六趟"，序列都严格 c1..c20（或 c11..c20）+ done。
- [x] 慢拷贝落后：skip 位置 = 该拷贝的 `$I.CONSUMED_CHUNK_COUNT`，如何保证
      切换瞬间读到的是已 dump 的边界？
      已解：skip 到位在 init 过程中，`read()` await init 后才读文件。
- [x] dump 期间 source 有新数据到达 → 先入 buffer 还是直接入文件？
      已解（2026-09-16）：入 transferrer 的**待写队列**（无上限），dump
      落地后由单飞 drain 按 FIFO 补齐——顺序天然正确，拉取不停顿。

> 剩余未决项集中在**分发器侧调度**：切换触发与 `dump()` 调用时机、
> 切换中 `cancel` 行为（`fork` 已解：按相位取读器；`terminate()` 不碰
> 拷贝）、在途 `read` 的旧读器窗口、source 暂停/恢复衔接。

### 3. 协调原语

- pull 如何在 switching 期间排队 / 等待？
  已解方向：无需显式排队，pull 的 `read()` 天然 `await init`。
- 读器替换的"原子性"边界：对拷贝流而言，`$I.CHUNK_READER` 一次
  替换是否足够？是否需要"先暂停、再换、再放行"？
  已解方向：同 tick 换读器即原子，无需三拍；在途那一笔由内存族的交接
  转发自愈（`$I.HANDOVER`，2026-09-16，见 §2 清单）。
- 背压与切换的交互：切换本身是背压点，还是与既有背压点（dump
  未完成暂停 source.read）合并？
  已解（2026-09-16）：**两处都不再暂停**——延缓写入把它们一并撤掉；
  积压不设上限、不做闸门，也不外露观察面（调试看符号），
  处置权归下游。见 §6。

### 4. 降级读取器接口

- 构造：分发器传 `{ chunkStash }` 上下文（`id` 已移除，属降级策略
  内部细节；`progress` 不再入构造，2026-09-09）；文件句柄等存储要素
  由子类自建（TemporaryFileChunkReader 的临时目录走配置 + 默认实现）。
  降级读取器继承 `AbstractDegradedChunkReader`（纯读，实现继承的
  `_I.*`）；写侧配套一个继承 `AbstractTransferrer` 的子类（`_I.DUMP` /
  `_I.WRITE` / `_I.DROP`），写侧类经 reader 静态 `_S.TRANSFERRER_CTOR` 声明。
- **寻道定位在介质侧**（2026-09-09）：`$I.REQUEST_INITIALIZE(progress)`
  播种 `$I.CONSUMED_CHUNK_COUNT = progress`（规定位置）；降级介质侧实现的 `_I.INITIALIZE`
  （惰性：首次读介质前）按 `$I.CONSUMED_CHUNK_COUNT` 自实现定位——经家族
  抽象 `_I.SEEK`（只读 4B 头并前进游标、不读 body）逐界寻道，或按
  存储做 O(1) 跳转。基类不含 `_I.SEEK` / `$I.SKIP`（定位非通用驱动器）。
- `_I.READ` 按 position 游标前进（读 body）。
- 文件句柄关闭归属：已定（2026-09-19/20）——介质归写侧
  `$I.DROP()`，读器自己的资源归 `$I.CLOSE`（`destroy()` 回收时调）

### 5. 错误路径

- dump 中途失败（磁盘满、写错误）
- 文件打开失败
- 切换中断后的恢复 / 降级

### 6. 阻塞点（性能）

- [x] `ensure()` 的 join 收窄为只在"源已闩、落点未落地"时等待
      （2026-09-15）：绑定在**内存读器**上的读（切换前就开始的那次）
      不再陪等一个与它无关的在途拉取。
- [x] **写侧阻塞已消除**（2026-09-16）：延缓写入使 pull 的落点不再等
      dump——实测慢盘 30ms 下，源在 dump 在途时即拉尽（20 块），15 块
      积压在队列、水位仍 0；dump 落地后按序补齐。抽象层到此不再引入
      额外阻塞。
- [x] **读侧等待已消**（2026-09-16）：旧 dumping 屏障退役（改位置门），
      再把 stash 的块接管进队列后，dump 在途新建的 fork 直接命中队列——实测
      首读 1ms（此前 62ms），整条流 20 块只碰介质 1 次。剩下的等待只有
      "位还没被拉进来"（等拉取），与介质进度无关。

## 已知约束（讨论前提）

- dump 使用 `fs.promises.open` + FileHandle（DESIGN.md 已假定
  `fileHandle.read/write`），异步 I/O。
- `ForkedReadableStream.$I.CHUNK_READER`（getter）与
  `$I.SET_DEGRADED_CHUNK_READER(reader)`（一次性换入）是换读器的契约
  接口；交接分两半：分发器调内存族自己的
  `BufferChunkReader.$I.HANDOVER(successor)` 交出在途那一笔，再换 fork
  的读器——两者在同一步里。
