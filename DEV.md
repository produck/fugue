# DEV — Implementation Notes

> 组织方式：按**主题/方面**，而非日期。每个主题只记**当前有效结论**；
> 同一主题后到的决策覆盖先前的（越新越有效），日期仅作追溯标注。

## 架构基座

### 抽象层：@produck/es-abstract

- `Abstract(cls, Abstract({...}))` 声明抽象实例成员；`Abstract.Static({...})`
  声明抽象静态成员；`Member as M` 提供 `M.Method().returns(...)` 契约。
- 成员约束在**实例属性访问时惰性校验**（缺实现抛 "must be implemented
  in the subclass"），不阻断 `extends`；静态覆写同样绕过运行时校验，
  需强约束的下游用 `SubConstructorProxy(Sub)` 包裹。
- 契约返回类型用 `OrPromiseLike(...)` 表达"或同步或 Promise"：void 钩子
  标 `OrPromiseLike(Undefined)`；携带值/标志的钩子按其形态（如 `_I.SEEK`
  标 `OrPromiseLike(Boolean)`；`_I.READ` 返回 `{ value, done }`，契约保持
  宽松 `OrPromiseLike()`）。

### Symbol 约定

- **三个维度**（总纲）：**原始含义**（`_Symbol.mjs` 里
  `Symbol('.#…')` / `'.$…'` 的定义，唯一事实，引用绕不过它）·
  **便捷形式**（同文件导出的 `A`，纯派生：删掉别名或某个键，语义层不动）·
  **引用关系**（`_External.mjs` 转发并导出 `_A`，图是 DAG，
  `_Symbol.mjs` 是叶子）。
- 一个符号走完全程（以读器位置为例）：定义在 `ChunkReader/_Symbol.mjs`
  的 `Symbol('.$consumedChunkCount')` → 原始 `this[$I.CONSUMED_CHUNK_COUNT]`
  → 便捷 `this[A.$I.CONSUMED_COUNT]`（自己的 `A`）→ 跨模块
  `this[_A.READER.A.$I.CONSUMED_COUNT]`（借表 + 它自己的别名：
  `_A.READER` 说明“这是谁的”，`.A.$I.…` 说明“它叫什么”）。
- 别名的**本地性**：键名由各模块自理，同名可为不同物（`ForkedReadableStream`
  的 `A.I.READER` 是字段，`BufferChunkReader` 的 `_A.READER` 是表）。约定
  “只从自己的 `./_Symbol.mjs` / `./_External.mjs` 取，惯用 `A` / `_A`
  两个名字”——于是读一个文件的头部 import，就知道每个别名归谁。
- 唯一的代价（不会自己守住）：**键名是两份账**——底层键改名时别名键
  不会跟着动，而别名仍能引用到旧符号。所以改名要两边一起改。
- 层级：`I`/`S` = 实例/静态私有；`$I`/`$S` = 受保护；`_I`/`_S` = 抽象。
  **跨家族要读的一律用受保护级**（读者家族读的 agent 与 stash 因此落在 `$I`）。
- 方法符号带 `()` 后缀（`.$read()`、`._seek()`）；字段符号不带
  （`.$consumedChunkCount`）；描述符：实例 `.#*` / `.$*` / `._*`，静态 `S.*`。
- `index.mjs` **只导出类**（`Concrete` / `Abstract`；降级家族再带
  `Transferrer` 命名空间），**不导出任何符号表**——符号只走
  `_Symbol.mjs` / `_External.mjs` 这条路径。
- 模块路径即命名空间——跨模块同词不冲突（降级 `_I.READ` 与基类 `_I.READ`
  各自独立）；符号表的键数不设上限。
- 面向调用者的具名成员（如 `get dumping` / `get done`）用普通字符串键。
- 缩写白名单：构造器（`new.target` 捕获）→ `CTOR`。**符号键持有类值一律
  以 `_CTOR` 结尾**（`_S.DEGRADED_CHUNK_READER_CTOR` /
  `_S.TRANSFERRER_CTOR`）。组织级共享符号集（待建）收编这类通用含义的
  键，避免每个模块重复声明。
- **两个表文件分工**：`_Symbol.mjs` 只定义自己的表（纯叶子，不引用任
  何东西）并出别名 `A`；对外的表单独放 `_External.mjs`，在那里导入并
  转发（`export * as CHUNK_READER from '../ChunkReader/_Symbol.mjs'`），
  并出别名 `_A`。现转发：`ChunkReader` →`DISTRIBUTOR`；
  `BufferChunkReader` →`CHUNK_READER`+`DISTRIBUTOR`；
  `ForkedReadableStream` →`DISTRIBUTOR`+`CHUNK_READER`；降级族 →
  `TRANSFERRER`+`CHUNK_READER`+`DISTRIBUTOR`；写侧 →`CHUNK_STASH`。
- **两个别名各管一摊**：`A`（自己的符号，在 `_Symbol.mjs`）——长键的
  短名（`A.$I.AGENT` / `A.$I.CONSUMED_COUNT` / `A.I.CTOR.READER.CURRENT`…）；
  `_A`（借来的表，在 `_External.mjs`）——`_A.STASH` / `_A.READER` /
  `_A.BUFFER` / `_A.DEGRADED` / `_A.FORKED`。消费侧一眼分出“我的符号”与
  “外面借的”。
- **别名在定义处也套**：键开了就用（`ChunkReader/Abstract.mjs` 自己就写
  `A.$I.CONSUMED_COUNT`）。没开键的长名可以随手开一个，判据是**键名长短 ×
  消费点数量**（短名开别名反而更长，见下条）。
- **现存键集**（`A`）：`Distributor`——`I.{STASH,AGENT,SOURCE}`、
  `I.CTOR.{TRANSFERRER,READER.{DEGRADED,CURRENT}}`、`$I.REGISTRY`；
  `ChunkReader`——`I.AGENT`、`$I.{CONSUMED_COUNT,STASH}`；
  `DegradedChunkReader`——`I.SEEKED_COUNT`；`Transferrer`——`I.WRITTEN_COUNT`；
  `ForkedReadableStream`——`I.READER`、`$I.READER`。
- **现存 `_A`**：`Distributor`——`{STASH,READER,BUFFER,DEGRADED,FORKED}`；
  `BufferChunkReader` / `DegradedChunkReader` / `ForkedReadableStream`——
  `{READER}`；`Transferrer`——`{STASH}`。
- **别名只给“直接子表 + 本模块自己的符号”**：家族的内部下级表不设别名，
  按名从 `_External.mjs` 导入即可（写侧 `TRANSFERRER.$I.DUMP`——名字本身
  已经够短，套一层别名只是多一层）。
- **局部别名 vs 内联**：一行放不下时起局部别名
  （`const stash = this[A.$I.STASH]`）而不是自行折行；但**实参位置别内联**
  ——把一个 `this[…]` 拼进多参调用里，prettier 会把实参逐行展开，反而
  多占行、也更难读。判据：内联后整行仍 ≤80 列才收（`printWidth`）。
- 环检查 `logs/check-import-cycles.mjs`：34 个模块，强连通分量 0。
  拆表之前存过一个二元回边（别名表读子表 + 子表向上借父表）；
  拆开后“向上借”落在 `_External.mjs` 这条叶子上，`_Symbol.mjs` 只定义
  不引用，环自然消失。
- **宿主面 = 公开成员 + `_I` / `_S`**（后者经包出口的 `SYMBOL` 开出去，
  按家族分组）。`I` / `$I` / `A` **不开**：宿主需要一项能力时，优先把它
  _升格为公开成员_（例：写侧构造参数从 `$I.SET_TRANSFERRER_ARGS` 升为
  `setTransferrerArgs()`、降级读器新增 `get transferrer()`），而不是把符号表
  整个开出去——符号是内部的维护面，公开成员才是承诺面。

### 受保护实例字段与静态钩子（`_S`）

- 分发器没有公开静态面：策略只经 `_S` 静态钩子声明类值（现只剩
  `_S.DEGRADED_CHUNK_READER_CTOR`），消费者是构造时捕获的 `I.CTOR`
  （`new.target`），不用 `this.constructor`。
- 内存→介质阈值：**选项** `MaxStashByteLength`（默认 1GiB 由 `Items.mjs` 给）。
  读经 `Options.Get.MaxStashByteLength`、写经 `Options.Tune`——构造器只收
  `source`，没有第二个写入点；降级触发点因此确定可复现。
- `_S.DEGRADED_CHUNK_READER_CTOR`：策略侧给出的降级读取器类引用，
  degrade 时用它构造各 fork 的新读取器；暂以 `M.Function` 弱校（只确认
  是函数），待收敛为“必须是降级家族的子类”。

## 观点 / 决策 / 结论

### 目录约定

- 一目录一类：主类文件 `Abstract.mjs`/`Concrete.mjs`（存在性互斥）+
  `index.mjs` + `_Symbol.mjs`（借用外部表时再多一个 `_External.mjs`）；
  目录路径即命名空间。
- **子类目录平行于抽象类类目录**（兄弟层级）；向下扩展仅限非继承的
  内部类（如 `DegradedChunkReader/Transferrer/`）。
- 介质侧实现极端简化可用单文件特例（如 `Distributor/BufferChunkReader.mjs`）。

### Distributor（分发器）

- `extends EventTarget`（WHATWG，不依赖 Node EventEmitter）。
- 公开面：`fork()` 注册消费拷贝并返回 `ForkedReadableStream`——读器取自
  当前相位字段 `I.CURRENT_CHUNK_READER_CTOR`（初值 `BufferChunkReader`，
  降级换读器的同一同步块里翻成策略类，后者当场
  `$I.REQUEST_INITIALIZE(0)` 播种）；`get degraded`（观察自己的
  `$I.TRANSFERRER` 是否落位——相位只有一个事实来源）；`get terminated`
  （`$I.TERMINATION` 是否已落）；
  `terminate()`（只关闸门，幂等）；`destroy()`（关闸门 + 封口 + 切断源
  - 收摊；幂等，返回同一个 Promise）。
- **`fork` 的 `label` 参数已废弃（2026-09-24）**：`fork()` 不再收助记符，
  `I.LABEL` 与该构造参数一并删——它写进去但从没被读过，不进事件也不进
  统计，留着只是死状态。
- 内部：`I.SOURCE_READER`（唯一 source 消费者）· `$I.CHUNK_STASH`（共享
  `ChunkStash`）· `$I.SOURCE_CONSUMPTION_AGENT`（消费代理）·
  `$I.FORKED_READABLE_STREAM_REGISTRY`
  （fork 注册表，fork 出口自清理也要读）· `$I.TERMINATION`（未终结为
  `null`，否则是终止原因；只剩 `fork()` 闸门与 `destroy()` 的取消读它）·
  `$I.WARN`（`warn` 的单出口——受保护成员，收 `(code, payload)`）·
  `I.CTOR`
  （捕获的自身类）· 两个类值
  getter `I.DEGRADED_CHUNK_READER_CTOR` / `I.TRANSFERRER_CTOR`，以及当前
  相位字段 `I.CURRENT_CHUNK_READER_CTOR`（初值 `BufferChunkReader`，降级
  换读器时置为前者）。受保护侧另有写侧实例 `$I.TRANSFERRER`，及其待用构造参数的
  **公开**入口 `setTransferrerArgs(...)`（落 `I.TRANSFERRER_ARGS`，经写侧家族的
  `_S.PARSE_ARGUMENTS` 归一——基类给了恒等默认，分发器自己不解释）。构造
  校验 source 为**本 realm** 的、未锁定的 WHATWG ReadableStream。
- **源必须是本 realm 的 ReadableStream（2026-09-26 定）**：判定只剩
  `value instanceof ReadableStream`；此前的鸭子型兼容面（`toStringTag` +
  `locked` 是布尔 + `getReader` 是函数）已拆。理由不是风格：库里多处**依赖
  真流的规范语义**（`locked` 恒真、`cancel()` 关流并兑现在途读、errored 流
  对新读立即拒绝、reader 独占），鸭子型对象只是“看起来像”，通过了才是
  坏消息——错误被推到运行期。判据仍**只出判词、不抛**：`instanceof` 对
  本地 Proxy（含 revoked）会跑 `[[GetPrototypeOf]]` 陷阱，所以 `try` 留着，
  抛就判 `false`。代价：跨 realm（iframe / worker / 另一 `vm` 上下文）的流
  不再直接收，得先经适配层转成本地 `ReadableStream` 再传——“适配工具包”
  另开一个包，与核心包分工干净。
  实测口径：`logs/probe-checker-throw.mjs`（真流通过；鸭子型、revoked、
  抛异常的访问器都判否）。
- 共享 stash 由分发器 create/持有并注入各读取器；内容生命周期（`$I.PUSH()` /
  `$I.SET_DONE()`）归 `SourceConsumptionAgent`；dump→drop
  归写侧（`START_DUMPING` 成功自己 DROP），内存相的 drop 归 `destroy()`。
- 降级：**触发在消费代理**（stash 字节超过构造时定下的阈值），**执行在分发器** `$I.DEGRADE`——
  构造写侧实例（按读器家族 `_S.TRANSFERRER_CTOR` + 预置构造参数）、
  把它挂上分发器（`$I.SET_DISTRIBUTOR`）、执行其 `dump`、
  遍历 registry、选降级 reader 类、换掉各 fork 的读取器
  都留在结构侧。**末尾派 `degrade` 事件**（载荷 `{ byteLength }`：入口处捕获的
  stash 字节数；派发在相位翻转与逐拷贝交接**之后**，所以事件里 `get degraded`
  已为真、监听者当场 `fork()` 拿到的也是降级读器）。
- **两个落点写入器都是同步的**（`toStash` / `toTransferrer`）：`$I.WRITE` 是框架
  自己的同步成员（宿主要实现的是模板 `_I.WRITE`，它在 drain 里被 await），所以
  写侧那一趟不需要 `async`——await 一个永远 `undefined` 的成员只多花一拍微任务，
  还会让两个分支看起来不一样；同步抛错照样让 `pull()` 拒绝。
- **相位边界的决定各有一个显式位置**：写入分支在 `pull()`（问
  `distributor.degraded`）、阈值判据与边界策略在 `degradeIfNeeded()`、**交接与
  终态播种在 `$I.DEGRADE`**。旧的写法把判据塞在 `toStash` 末尾，于是“达到上限
  又遇到 `done` 时不切换”是**位置带来的副作用**，没人声明过；现在判据对 `done`
  那一趟也跑。
- **边界策略是一个选项**（`DegradeOnStashFullAndDone`，2026-09-21 落）：
  “达到上限且源已到头”时切不切由它决定，判据读法就是它的名字——两个事实都在
  `degradeIfNeeded()` 里显式：越限（`byteLength > MaxStashByteLength`）+ 到头
  （`stash.done`）。**默认 `false` = 不切**：源已到头，数据全集已在这份 stash
  里且不会再涨，落介质只是白搬一趟；“不切”那一支**不需要交代任何状态**
  （stash 仍是落点、自己的 `done` 也在自己身上），读侧照旧按
  `stash.done && index >= length` 收尾。取 `true` 时是旧行为：照样切换，并且
  **终态随交接走**——stash 已 `done` 就先给新 transferrer `$I.SET_DONE()`，否则
  读器会在前沿等一个永不来的下一笔。两值实测
  `logs/probe-degrade-after-done.mjs`：**读侧结果一致**（`s0 → s1 → close`），
  差别只在落点是内存还是介质（默认相位字节 4、未被 DROP；`true` 时介质 2 块）。
- **该选项只在“越限且到头”那一趟被读（2026-09-25）**：判据写成
  `stash.done && !Options.Get.DegradeOnStashFullAndDone(...)`，越限但未到头
  时左侧即短路、不读它；切换决定不变（照旧切），省下的只是一次函数调用。
  用例锁两侧：越过阈值那趟读数为 0，越限且到头那趟读数为 1。
- **降级失败与这条策略的交互**：判据每趟都跑 ⇒ 失败不锁死；但若是**到头那一趟
  才修好**而策略为 `false`，重试会被策略挡下，此后源已尽、不再有 pull ⇒
  最终不切换、全量留内存（探针的两支正好覆盖这两个值）。
- **`terminate()` 的契约**：幂等（已终结即返回）；终止原因落
  `$I.TERMINATION`（`DOMException`，`name` 为 `AbortError`）；派
  `terminate` 事件。**它只关闸门**：此后 `fork()` 抛错，除此外什么都不动——
  不封口、不取消源、不碰任何已建 fork。已建 fork 照常运行：需要数据就
  继续向源拉取，直到源自己到头（`close()`）。消费代理不认识这个状态：
  它的循环只问“源还能不能拉”。
- **两个动作的语义分层**：`terminate()` = 只关**闸门**（拒新 fork，
  已建拷贝照旧运行）；`destroy()` = 闸门 + **封口**（前沿定长）+ **切断源**
  - **当场结束所有拷贝**（`error(终止原因)`，不补缓冲）。读侧观感：
    `terminate` 对拷贝不可见，`destroy` 立刻给出可辨识的 `AbortError`。
- **`destroy()` 骨架**：`destroy()` 是**幂等包装**（`$I.DESTROYED` 缓存
  同一个 Promise，`await` 几次也只跑一遍），实体在受保护的
  `async $I.DESTROY()`，分两段：
  - **同步段**（调用当场、不可逆、可辨识）：`terminate()` → 遍历注册表，
    **每个拷贝先关读器**（`$I.CLOSE`，两相同一句话）**再**
    `controller.error(终止原因)` + `prune`，不补已缓冲的前缀。
  - **异步段**（Promise 落地时才完成）：`await SOURCE_READER.cancel(终止原因)`
    （失败由源读取器在发生处派 `warn('source-cancel-failed')`，它**不再上抛**，
    所以这里既不用吞也不会被打断）→
    `await AGENT.pullingSettled`——**只取时机**，结果归代理侧（见消费代理一节）
    → **按此刻的相位收场**：两侧同形——`$I.SET_DONE()`（封口）+ `$I.DROP()`
    （放开载体）；内存相放开的是 stash 里的块，降级相放开的是待写队列与
    介质句柄。所以只有“拷贝全被 error”是当场的，**封口与放开都不在调用
    当场**。
- **两个位置的陷阱**（都实测过）：
  - 等在途 pull **必须在 `cancel` 之后**：在途的 `read()` 只有 cancel 能
    解（源不再出声时它就一直挂着），放在前面 `destroy()` 直接死锁。而
    cancel 把它**兑现成 `{done:true}`**（规范），所以 destroy 期间那趟 pull
    不可能因源拒——真要拒只可能来自切换那一步（宿主取值器 / 介质构造器），
    用例 `should dispatch warn(pull-failed) for the in-flight pull` 走的就是
    这条路径。
  - 在途 pull 的**结果要吞掉**（2026-09-25 改）：销毁只关心时机，
    `pullingSettled` 内部 `.catch(noop)`。不吞则整个异步段中断——封口与
    释放都不发生，`destroy()` 还返回一个拒绝的 Promise。**报不在这里**：
    那条 `warn('pull-failed')` 由代理的 `settlePulling()` 派（见消费代理
    一节），读侧（拷贝的 `ensure`）照旧收，分流不变。
- **相位只读一次**（在所有异步都结束之后）：`cancel` 一被调用
  `finished` 即为真，之后 `ensure` 不可能再起新的一趟 pull，而在途那一笔
  刚被等过——相位在收场那一刻已经冻结，无需快照 + 重读。
- **释放不等拷贝**：拷贝的读面在 `error()` 之后不可达（流不会再调
  `pull` 钩子），在途的那次 `$I.ENSURE_THEN_READ` 若落在 DROP 之后，
  只会得到一个被流吞掉的拒绝，读侧观感不变。
- **已完成**：两相都随 `$I.DROP()` 放开（内存相的块 / 降级相的队列与
  介质句柄，见 Transferrer 一节），术语与 `ChunkStash.$I.DROP()` 对齐；
  读器随 `$I.CLOSE()` 关闭（见下）。
- **读侧关闭的时机（2026-09-23 扩到三处）**：拷贝的流结束时立刻关——
  正常读完（`done`）、读抛出（源 / 介质错误）、拷贝自己 `cancel()`；再加上
  `destroy()` 的收摊。流侧结束会 `prune`，所以收摊通常扫不到它们，但
  **不保证**：`destroy()` 当场若有一笔读在飞，它随后以失败落定会再走一次
  流侧收尾——“每条拷贝一生最多关一次”靠 `I.CLOSED` 幂等兑住，不靠互斥。
- **`destroy()` 撞上在途读：两个落定分支（2026-09-23 实测）**：
  `$I.DESTROY` 的同步段遍历注册表，先关读器、再 `error` + `prune`，
  全在第一个 `await` 之前，插不进任何东西——所以“撞不撞上”只是
  一个状态判定：`destroy()` 当场该拷贝有没有一笔读在飞。
  之后按落定分岔，两支都会走到：
  - **失败** ⇒ `pull` 的 catch 收尾 ⇒ 第二次 `$I.CLOSE`——
    由 `I.CLOSED` 挡下（见上一条）。
  - **值 / `done`** ⇒ `controller.enqueue()` / `close()` 在已 `error`
    的流上**先抛 `TypeError`**，`conclude()` 整条不走（连带 `prune`
    也跳过——收摊已 prune 过，无积压），这个 `TypeError` 被平台吞掉，
    不产生未处理拒绝（不落进 `unhandledRejection`）。
- **降级相在途读的悬挂点只有一个：`ensure()` 里等源的那笔 `read()`**，不是
  `$I.WAIT_POSITION`。后者的等待窗在现有路径下观测不到：记账恒等式
  `WRITTEN_COUNT + PENDING_CHUNKS.length === 已拉取数`，而 `ensure()`
  返回时已保证 `total > position`，`SETTLE()` 在同一个调用里放行——
  没有可供撞上的间隙。
- **源被 `cancel` 后在途那笔读不是拒绝，是 `{done: true}`**：
  `SOURCE_READER.READ` 的 catch 因 `I.CANCELLED` 已置位而不落错误。所以
  降级在途读被 destroy 撞上时走的是“值 / `done`”那一支：`WAIT_POSITION`
  以 `accepted=false` 且 `I.ERROR === null` 放行（不抛）、继续进宿主
  `_I.READ`、以 `done` 落定、`close()` 抛出、`conclude()` 不走。
  所以降级相的真实 destroy 收尾走的是“值 / `done`”支；失败支要介质当场
  也在报错（用例用宿主 `_I.READ` 拒绝来安排）。
- **实测 `logs/probe-degraded-suspend.mjs`**：宿主 `_I.READ` 调用数在
  destroy 前后 1 → 2，是“确实越过了 `WAIT_POSITION`”的直接证据；`_I.CLOSE`
  计数 1、未处理拒绝 0。同一探针的第三支说明这条放行路径就是降级态读到
  源尾的**常规**收尾（读到 `done`，`conclude()` 在活流上跑完，`prune` 也
  照常）。平台契约两支（`close()` / `enqueue()` 在已 error 的流上抛
  `TypeError`；`pull` 里未捕获的抛出不算未处理拒绝）也在同一文件里。
- **读侧关闭的边界**：钩子 `_I.CLOSE` 里**不得关介质**——介质是各读器
  共享的，归 `_I.DROP()` 与 transferrer。算作读器自己的资源（比如独立
  日志通道）才在它的职责里；资源语义归宿主。

### Options（配置面）

- **定位**：分发器的**唯一配置面**。`constructor(source)` 只收源，阈值一类的
  配置成员全部退役（`$I.STASH_BYTE_LIMIT` 及其别名已删）；要读就
  `Options.Get.*`，要改就 `Options.Tune.*`。
- **文件**：`Options/index.mjs`（注册表：`OPTIONS` 槽位 + `Tune` / `Get` /
  `install` / `snapshot`）、`Options/Items.mjs`（选项定义表）、
  `Options/Assert.mjs`（断言实现）。**不在类设计规则体系内**：没有
  `_Symbol.mjs` / `_External.mjs`，自带本地槽位符号，也不进
  `Distributor/index.mjs` 的“只导出类”约定。
- **形状**：每个分发器实例挂一张 **bag**（普通对象，键 = `item.name`，
  值 = 取值器函数），放在实例的 `OPTIONS` 槽位（构造器里 `install(this)`
  造一次）。`Get.X(distributor)` 读、`Tune.X(distributor, value)` 写
  （值或取值器都收）、`snapshot()` / `get options` 拿一份**新建的**快照。
  - **槽位而不是 WeakMap**：构造期 `this` 是裸实例、之后拿到的是代理，
    WeakMap 按身份键控会两边对不上（实测踩过）；符号字段在代理与裸实例上
    读写的是同一份。
  - **默认值可以是取值器**（引用另一项）：`MaxBacklogWarningByteLength`
    默认**跟随** `MaxStashByteLength`，读时才求值——所以 `items` 的数组
    顺序不是契约。
  - `Items.mjs` 是**叶子**（只 import `Assert.mjs`）：一旦 import 注册表就
    成环 `index ↔ Items`，且从 `Items.mjs` 先进进程会
    `Cannot access 'items' before initialization`。默认值里要复用另一项
    就读 bag（`(options) => options.X(options)`）；**不能**写
    `Get.X(bag)`——`Get` 内部读槽位，传 bag 进去是 `undefined`。
- **断言**：`Assert.NonNegativeInteger` / `Boolean` / `HighWaterMark`。
  `Tune` 是**唯一断言点**（坏值不落袋），`install` 不断言——默认值信任
  作者。`HighWaterMark` 按规范口径：先 `ToNumber` 再判，`NaN`/负数抛
  `RangeError`，`Symbol`/`BigInt` 抛 ToNumber 中止的 `TypeError`；归一
  发生在流侧，`Get` 回的是宿主给的原值。
- **宿主取值器抛异常一律放行（2026-09-25 定）**：这属于研发错误，下游工程师
  必须保证它不抛。所以 `Tune` 的安装期求值、`Get` / `snapshot` /
  `get options`，以及每个内部读取点（`ForkHighWaterMark` 在 `fork()` 构造
  处、`degradeIfNeeded` 两项、`observeBacklog` 一项）都不加 `try`——五个
  `TODO` 标记随之删掉。两处后果要知道：`fork()` 是**什么都没建**就抛（拷贝
  未注册、`fork` 事件不派）；pull 里的读取点抛 = 那趟 pull 失败，异常照旧
  到达读侧（拷贝的 read 拒绝），另外派一条 `warn('pull-failed')`——那是
  “失败归代理报”的自然结果，不是拦截。
- **读取时机逐项不同**，写在 `Items.mjs` 每项的头一行注释里（每趟 pull /
  每笔写 / 每个 fork 构造一次）。这条不是风格：`Tune` 之后"为什么不生效"
  只能靠它回答（`ForkHighWaterMark` 只管之后新建的拷贝）。刻度出处：
  `logs/measure-options.mjs` / `logs/measure-options2.mjs`。

### SourceConsumptionAgent（消费代理）

- 角色：**唯一的源消费方**（`pulling` 单飞，所有等待者共享同一趟拉取）
  与**唯一的落点写入者**——“源的事实”经它交给落点，这一趟的失败也归它派
  （`warn('pull-failed')`，见下）。降级的**触发**也在这里，单独一个成员
  `degradeIfNeeded()`（stash 字节超阈值 →
  `distributor.$I.DEGRADE()`；执行仍在结构侧，见 Distributor 一节）
  ——落点写入（`toStash` / `toTransferrer`）与切换策略分开写，阈值这种
  分发器策略一眼看得见。
- **相位只有一个事实来源**：`distributor.degraded` 观察自己的
  `$I.TRANSFERRER` 是否落位，代理不再发这个事实（也不自己持
  `degraded` 字段），`pull()` 的分支直接问分发器——两份真相会在降级
  失败时分叉（`DEGRADE` 抛错则 transferrer 从未落位，而旧字段已置真），
  后果是后续每趟 pull 都拿 `null[…]` 的 TypeError 顶掉真正的原因
  （实测见 `logs/probe-degrade-failure.mjs`）。
- **积压告警**：`pull()` 走写侧那一趟在 `$I.WRITE` 之后问一次
  `observeBacklog()`——`pendingByteLength > MaxBacklogWarningByteLength`
  （选项，读经 `Options.Get`）就派
  `warn('backlog', { byteLength })`——**不去抖：只要还在阈值以上，每写一笔派
  一次**（水准信号，限频归宿主；通常本来就被忽略，代价只是每次一点分配），
  该选项默认**跟随** `MaxStashByteLength`。这条信号只存在
  于降级相：内存相被降级触发天然封顶，而积压按设计不设上限、不闸门、
  也不反压源（“顶住死盘”的代价由宿主从这条 `warn` 里看见）。
- **它的采样点在写入路径上**（这条信号的边界条件，调阈值前先看这里）：
  `observeBacklog()` 只在某一趟 pull 真的写下一笔时跑，于是——
  ① 消费者暂停或源到头之后不再有 pull，**也就不再采样**：哪怕排水还在排、
  积压仍很大；② 所以最后一条事件**不是峰值**，只是最后一次采样时的量；
  ③ 条件消失是**静默**的（没有“恢复”事件），要判断“现在好了没”得宿主
  自己记时间，或等它再次越界——这也是没做“回落事件”的原因，那会把
  `warn` 变成宿主必须实现的状态机。想在任何时刻看到当前积压只有“拉”
  （一个只读口）能做到：事件负责“值得看一眼的时刻”，读口负责“我随时想看”。
- `ensure(target)` 契约：返回时目标位置已可读，或落点已封口；源报错则
  拒绝；内部发生的切换已落地。
  - 循环只认一个判据：`!sourceReader.finished`（源还能不能拉）。
  - 收尾那句“源已终而仍有在途 pull 就等它”是**前缀一致性的来源**：
    任何拷贝读之前都排在同一个在途 pull 后面，于是封口时还在路上的那一
    笔对谁都可见、顺序也一致（两相位均实测）。
  - **那句是契约的尾巴，不是死代码（2026-09-23 定）**：驱动面撞不上它——
    六种驱动共 14380 次 `ensure` 调用 0 命中（其中 220 次进函数时源已终、
    8220 次有 pull 在途，从不同时），因为从 `finished` 置位到 `pulling`
    归零只有约三跳，而那三跳里全是本库续体，消费者要等块到货才被唤醒
    （`logs/probe-ensure-window.mjs`）。但外部**没有**任何规则排除这个交错
    （不同于 `pull` / `cancel` 那两处有标准兜底），删掉等于把上面那条契约
    偷偷放宽，故保留并标 `/* c8 ignore next 3 */`——**不要为了覆盖率删它**。
- `pull()`：`read()` → 按相位写落点（`toStash` / `toTransferrer`）→
  非终态才 `pulledChunkCount++`（计数只在这里做一次：每个等待者 join
  的都是这一趟）。它**不看**任何封口/终止状态；封口后仍在路上的那一笔
  照常入落点，不丢。
- `pullingSettled`（getter）：**只取时机**——在途那一笔落定即可
  （`Promise.allSettled([this.pulling])`：天然不拒，不必再带一个吞拒绝的
  `noop`），供 `$I.DESTROY` 收场前对齐。它必须在源 `cancel` **之后**读：那时
  `finished` 已真、`ensure` 起不了新一趟，一次读就够（同“相位只读一次”）。
- `settlePulling()`：单飞处**先报再抛**（2026-09-25 定）——代理是 pull 的
  所有者，失败由它派 `warn('pull-failed')`，销毁侧不再替它报（它只取
  时机）。**报完必须把拒绝还回去**（`throw cause`）：`ensure` 的循环就靠
  它退出，见陷阱第三条。因此这条 warn 覆盖**任何**一趟失败的 pull，不再
  只是“销毁时那一笔”。
- 三条陷阱（留档，改这里之前先读）：
  - 循环在没有封口的情况下提前停 → 读侧拿
    `{ done: false, value: undefined }` 无限空转。
  - 在 `pull()` 里“作废已拉回的一笔” → `pulledChunkCount` 不前进、循环
    条件永远成立 → 把源一路抽干、每笔都丢掉、读侧永不返回。
  - **让报错把拒绝咽掉**（`catch` 里只报不 `throw`，或把 `.catch` 的返回
    值当 `pulling`）→ `ensure` 的循环只靠那个拒绝退出：源报错后
    `finished` 仍假（`SourceReader.READ` 先抛后赋值，`DONE` 不置位）→
    循环立刻再起一趟，已 error 的流对任何新读**立即**拒绝（标准行为，无
    真 I/O）→ 再报再循环。实测（`logs/probe-swallow.mjs`）：源直接抛时
    0.5s CPU 派 20 万条 warn，`setInterval(100)` 在 6 秒里**一次都没
    跑**——微任务链不排干，宏任务（定时器 / `setImmediate` / IO）全停
    摆，SIGTERM 也进不来。
- `finished` 的由来：`SourceReader.READ` 在 `CANCELLED` 之后**不再写
  `DONE`**——只看 `done` 的循环会对着已收摊的源每圈 `SET_DONE` 一次。

### SourceReader（分发器侧拉取装置）

- **源的所有权**：构造时即 `getReader()` 锁死——给了分发器的源即被独占
  整个生命周期。永不 `releaseLock()`，且这不是纪律而是结构事实：reader
  只存在于私有 `I.READER`，外部无处取得释放机会；`stream.cancel()` 也被
  锁挡死（锁定即拒，且不尝试取消）。前提：一个源只喂一个分发器、一个
  分发器一生只用一个 reader。对外可见的外观是 `stream.locked` 恒为 true。
- 两个事实位互斥穷尽：`done`（源到头，拉取触发）· `cancelled`（我们下过
  收摊令，同步置位）。**源错不是位**（2026-09-26 移除 `I.ERROR`）：它只以
  两样东西存在——平台 `read()` 的拒绝，与发生处那条
  `warn('source-read-failed')` 的 payload；存一个没人读的位是死状态。
  对“源还能不能拉”这一个问题，对外只给一个读口：`finished`
  （`done || cancelled`）——消费代理的 `ensure()` 只认它。**源错不进
  `finished`**：进去就是陷阱第一条（循环提前停），出路只能是那个拒绝。
- **构造收 `(distributor, stream)`，只多存一个分发器引用**（2026-09-26）：
  用途就是报告——`[I.READ]()` 里平台 `read()` 拒 → 派
  `warn('source-read-failed', cause)` 再原样抛出（数据面 fail-fast）；
  `cancel()` 里平台 `cancel()` 拒 → 派 `warn('source-cancel-failed', cause)`
  **只报不抛**（收摊面 fail-soft，2026-09-27 改）。两处都**不打闩**：
  单次性是调用图的事实（`cancel` 唯一调用者 `$I.DESTROY` + 它被
  `$I.DESTROYED` 缓存），加闩只会多一个走不到的死分支。**一趟读只有 `[I.READ]`**
  （2026-09-26 合回）：平台读、失败上报、`I.READING` 清槽同在
  `try / catch / finally` 一个块里——槽因此与它代表的那条 promise 严格
  对齐，形状与代理的 `settlePulling()` 一致。`try` 里**保留
  `return result`**（2026-09-26 定）：c8/V8 会把 `try/catch/finally` 多记
  一条永远 0 的**合成范围**，挂在 `finally` 那一行上——那不是 `finally`
  体（体每次都跑：同一份报告里没有任何未覆盖行；最小复现
  `logs/probe-finally.mjs`，原始范围 `logs/probe-finally-ranges.mjs` 显示它
  只覆盖一个空格）。所以这是**分析口径的错，不是代码里有死路**——处理方式
  是**保留自然写法 + 就地挂标记**（2026-09-26）：`/* c8 ignore next */` 紧贴
  `} finally {` 的上一行（附一行原因注释），branches 回到字面 100%。阈值
  （99.5）其实容得下 99.64%，挂标记只为字面好看；代价是这个标记**不能挪**
  （挪一行就失效、回到 99.64%），也删不得。
- **`get error` / `get reading` 已删（2026-09-23）**：两个读口全仓零引用。
  `reading` 位保留（用于 `read()` 去重）；`error` 位随后整个移除
  （2026-09-26，见上一条）。
- `cancel(reason)`：**单次到达**（唯一调用者 `$I.DESTROY`，且它被
  `$I.DESTROYED` 缓存，不加幂等守卫）；**先置位再转交**平台
  `reader.cancel(reason)`；上游 cancel 回调失败时它先派
  `warn('source-cancel-failed')`，异常**不再上抛**（收摊面 fail-soft；
  规范保证流仍关闭）。**不释放锁**：它只表示我们不要这个源了，
  不表示把流还回去。
- **收摊后的平台回声不采信**：`cancelled` 为真时 `read()` 直接答
  `{done: true}`（不写 `done`），也不再去碰平台那个
  已释放的 reader——否则收摊后 `read()` 的 TypeError 会冒充源错误。
- 待收敛：第二次 `cancel()` 不等第一次 settle（要存 promise 闩锁，需先
  腾键位）；`I.STREAM` 是死字段（构造写入、无人读），可删。

### ChunkStash（共享内存暂存）

- 公开只读：`done` / `length` / `byteLength`；`get(index)` 与 `chunks()`。
- 写面受保护：`$I.PUSH(chunk)` / `$I.SET_DONE()` / `$I.DROP()` 只在包内使用。
  交接之后源侧不会再往 stash 写：相位翻转（写侧落位）本身就是那条保证。
- `done` = 这一层存储自己的内容终态（由落点交接而来）。它是私有 `I` 成员，
  只经上面三个动作与 `get done` 进出。
- **放开守卫与 `dropped` 读口已删（2026-09-23）**：放开状态只服务守卫，
  而守卫不必要——`$I.DROP` 的两个触发点（dump 成功、destroy 收场）都在
  该相位结束之后，此后没有任何路径再触碰 stash。`I.DROPPED` 随之退场
  （它只被守卫读）。
  代价：将来若误用，症状从抛 `ChunkStash has been dropped` 变成静默
  ——写进没人看的数组、`get(index)` 得 `undefined`。
- **`sealed` 已删（2026-09-20）**：它原本把"触达前沿"与"真 `done`"分开
  （`index >= length` 且已封口才算完），09-13 起那份判据归 `ensure()` 的
  就绪契约与位置门；剩下的"整份 dump 前的写面冻结"由**相位翻转**与
  **dump 成功即 `DROP`** 保证，与这个位无关——实测
  （`logs/probe-write-face.mjs`）：成功路径载体已被放开（推进去抛
  `dropped`），失败路径"封口位为真"也照样推得进去。位既非判据也非闸，
  删掉不变量不变。

### Reader 术语

- `ChunkReader` = 各拷贝的逐块读取装置；`source reader` = 分发器侧拉取
  装置。职责不同，代码与文档不共用 `READER`。

### ChunkReader 家族

- 分叉：内存路径 `BufferChunkReader`（直接读共享 `ChunkStash`）与降级
  家族（`AbstractDegradedChunkReader` + 具体介质侧实现）。
- **读器只持一个保护级分发器成员**（2026-09-26 改）：`agent` / `stash` /
  介质实例都不再是字段——各方法按需从它解构（`ENSURE_THEN_READ` 解出
  `agent`，`chunkStash` / `transferrer` 是从它取的 getter）。读器因此
  **手里有分发器**，宿主模板成员在发生处就能派事件（见「异常面」），
  不必再借上一层代报。

#### 基类 AbstractChunkReader = "有位置的读头"

- 表：`I.DISTRIBUTOR`（唯一持有的引用）· `$I.CONSUMED_CHUNK_COUNT` /
  `$I.READ` / `$I.ENSURE_THEN_READ` / `$I.CLOSE` · `_I.READ`；无字符串键成员。
- `$I.READ`（单纯读）：`_I.READ()` → 介质侧报非终态才
  `CONSUMED_CHUNK_COUNT++` → 原样返回读结果；`done` 的含义不在这里
  （见「读路径」）。
- `$I.ENSURE_THEN_READ`（驱动入口）：`await ensure(CONSUMED_CHUNK_COUNT)` →
  `$I.READ()`；分发流的 `pull` 走这条。
- 基类**不认识相位**：内存 → 介质这一层不写在通用读路径里——接替是内存族
  自己的事（见下）。
- 不持初始化/关闭（已迁降级家族）；**只存一个保护级分发器成员**，构造签名
  就只有它。

#### BufferChunkReader（内存 · 即时读）

- 只实现 `_I.READ`（按 `CONSUMED_CHUNK_COUNT` 下标读共享 stash；`done` 为
  `stash.done` 且 `index >= stash.length`）；构造即就绪——分发器无需
  请求初始化，也无需 close（无资源）。
- **交接整套归这里**（自己的符号模块 `BufferChunkReader/Symbol.mjs`）：私有
  位 `.#successor` + 受保护 `$I.HANDOVER(successor)`；抽象 Reader 的符号表
  里没有这两个（交接不是通用概念，只是内存族的事）。换读器时由分发器调
  `$I.HANDOVER(新读器)`（不直接写字段）；介质侧进来先看那位，非空就把
  整笔读转发给接替者——转发走接替者的**单纯读** `$I.READ`（这一笔的
  ensure 已由转发者做过），不再重复。
- **在途读自愈就落在这一眼上**：换读器只可能发生在 `ensure()` 的那趟
  拉取里（触发降级的那块），所以 `ensure()` 回来后重看一眼就够；不再
  依赖 DROP 时序。旧实例自己那一个位置照旧前进——它已不被任何 fork
  持有，推进无副作用。

#### AbstractDegradedChunkReader（降级 · 生命周期持有者）

- `I`：`INITIALIZED` / `CLOSED` / `SEEKED_CHUNK_COUNT` /
  `INITIALIZE` / `SYNC` / `READ_BACK`；`$I`：`TRANSFERRER` / `REQUEST_INITIALIZE`；
  `_I`：`READ` / `INITIALIZE` / `CLOSE` / `SEEK`；`_S`：`TRANSFERRER_CTOR`
  （策略给出的写侧**类**）。
- **下游便利面**：`get chunkStash`（共享 stash，`_I.DUMP(chunkStash)` 的
  入参就是它）与 `get closed`。除此之外不开口——位置是家族的记账，
  策略只见"跨一条边界"。
- `$I.TRANSFERRER` 是降级时由分发器交接的那个写侧实例（基类构造第三
  个参数）；读侧原语 `$I.WAIT_POSITION(position)` / `$I.PEEK(position)`
  由它取。
- **请求初始化**：`$I.REQUEST_INITIALIZE(progress)` 同步播种位置，并把
  `I.INITIALIZED` 置为链体 `I.INITIALIZE`：等 `get dumping`（整份转移
  落地）→ `_I.INITIALIZE` 打开介质 → `I.SYNC()` 进度同步（只能走到介质
  当时能到的地方）。**失败就是链体 reject**（2026-09-25 改）：不再存进
  `I.ERROR`——那份状态随本次改动一并删，判据只留一处。两个观测点：
  链体自己 catch 到就派 `warn('initialize-failed', cause)` 再原样抛出
  （2026-09-26 下移到读器：报告留在发生处）；需要介质的那一读在
  `I.READ_BACK` 的 `await this[I.INITIALIZED]` 上拿到同一个 cause。
  分发器的 `I.INITIALIZE_READER` 只剩“播种 + 吞”——播种是即发即弃，
  没人接的拒绝会变成未处理拒绝（只吃队列的读者照旧不受影响，它们根本
  不 await 这条链）。
  宿主侧 open / 定位失败走这一支，
  框架侧 dump 失败则由门 `$I.WAIT_POSITION` 先抛（带的是原始 cause）；
  实测 `logs/probe-read-back-guard.mjs`：宿主侧失败时宿主 `_I.READ` 调用
  数为 0，证明失败出自读器侧而不是介质。只吃队列的读者也照做，代价是
  读器数 ≈ fd 数（共享句柄归策略自决）。

### 初始化与关闭（归降级家族）

- 播种 = `$I.REQUEST_INITIALIZE(progress)`：同步
  `CONSUMED_CHUNK_COUNT = progress`，随即在同一步里发起链体。
  曾用构造器传 `progress`、曾名 `START_INITIALIZE` + once-guard（均已废）。
- **分发器是唯一调用者**（同一 tick：构造 → 播种 → 交接）；无守卫——
  链体的每个 `await` 都在播种之后，读路径拿到的一定是就位点。
- `$I.CLOSE`（**键归基类**，降级族覆盖同一个键）：`I.CLOSED` 幂等 →
  **发起式**调 `_I.CLOSE`——**同步抛也经 promise 转手**，失败派
  `warn('close-failed', cause)`（2026-09-26：不再静默吞；若让它逃出去，
  destroy 的遍历会被打断）。**不** `await I.INITIALIZED`：链体里第一句
  就是等 `get dumping`，而 `dumping` 在死盘上永不落地，等它就会把收摊
  一起挂住；`get closed` 暴露状态。
  内存族的 close 是基类**空实现**（无资源），所以 `destroy()` 对两相
  都能用同一句话关。

### 读路径

- 基类 `$I.READ` 就是取一笔：`await _I.READ()` 后非终态才
  `CONSUMED_CHUNK_COUNT++`，原样返回读结果；带 ensure 的驱动入口是
  `$I.ENSURE_THEN_READ`（它只是在这句前面加一次 `await ensure(...)`），
  也是 `pull` 调的那个；`done` 的含义不归它。
- **形状归声明（2026-09-20 定）**：非终态**必带块**；`{done:false,`
  `value: undefined}` 这种"洞形"由 `ChunkReader/Parser.ReadableStreamResult`
  作 `_I.READ` 的返回描述（`M.Method().returns(M.OrPromiseLike(...))`），
  两家族都挂——**规格描述不进生产**：生产构建把
  `@produck/es-abstract-token` 换成它的 `./erase` 入口（`Abstract` 退化成
  恒等 `any => any`），声明被丢、member 包装不再安装，dev/test 才在调用点
  校验（es-abstract 的访问/调用期校验）。所以"两家族都写"不是白付，也不
  存在"把断言写进热路径"的交易。理由：默认流的规范其实允许 `undefined`
  块，但本包的块是 `Buffer`，"洞"冒充数据比报错坏；正确的宿主在被问到时
  本来就有货（位置被接受 = 队列里有或已落介质）。想表达"记录在但没 body"
  就交**零长 Buffer**。旧 TODO 里"介质侧可答
  `{value: undefined, done: false}`"那条许可作废。内存族那个角（源被
  cancel 而没 done 时 `stash.done` 仍假）今天不可达——`destroy()` 先 error
  掉所有 fork 才 cancel 源；真到了那天得在内存族自己收口。
- **`done` 归介质侧**：内存路径 = `stash.done && index >= stash.length`
  （存储层终态 + 自己的 backlog 闸）；文件路径 = 介质末尾标志 + 位置。
- 前沿不往下传：降级相位 `ensure()` 只保证"目标已拉取"（落点在队列或
  介质），**可读性归传输侧的门**（接受度）；内存相位拉取与 stash 同体，
  已拉取即可存取。门放行后仍取不到货，属契约违规，按断言处理。
- `CONSUMED_CHUNK_COUNT` 只在介质侧交出内容时前进，因此总是"下一个要取的位置"；
  终态那次读不推进。降级定位拿它做 skip 依赖这一点。
- 降级读法：**不覆写 `$I.READ` / `$I.ENSURE_THEN_READ`、不走 super**，直接实现
  `AbstractChunkReader._I.READ`：过门 `$I.WAIT_POSITION(位置)` → 队列命中
  （`$I.PEEK` 有值）**直接交付、不碰介质侧，也不推进已跨数** → 否则
  （已落介质 / 到头）走 `I.READ_BACK()` **读回**：先 await 就位点
  `I.INITIALIZED`（链：open + 进度同步）→ `I.SYNC()` 补差 → 转发自家
  `_I.READ`，非终态把 `I.SEEKED_CHUNK_COUNT` 推进一格。基类驱动对降级实例
  天然成立；介质侧只见降级 `_I` 空间。
- 门的语义是**接受度**：该位在介质上或在队列里就算可读，"到头"也算
  可读（介质侧回终态）。它**不等整份 dump**——实测 dump 30ms 在途时新建
  fork 首读 1ms，整条 20 块的流只碰介质 1 次。

### 定位（skip 由驱动器引导）

- `CONSUMED_CHUNK_COUNT` = fork 在共享序列的**绝对位置**（受保护）；切换时以
  各 fork 的 `$I.CONSUMED_CHUNK_COUNT` 作 `REQUEST_INITIALIZE` 的 progress
  （播种，非累计），同一步里用 `BufferChunkReader.$I.HANDOVER(新读器)` 交接
  在途那一笔，再换 `$I.CHUNK_READER`。
- **定位是家族的义务，不是介质侧的**：`I.SEEKED_CHUNK_COUNT` 记游标已
  寻道跨过多少条记录（出生 = 0，即它此刻站在第几条上；`_I.SEEK` 跨边界
  与 `_I.READ` 交付各算一次——`_I.READ` 视为"寻道 + 取货"）；`I.SYNC()`
  拿它当起点、用本地 `index` 逐次唤 `_I.SEEK()` 跨边界（只碰头、不读
  body），跨过几条就把数写回几；介质侧回"没有下一条可跨"就停在原地，
  剩下的差值留给下一笔。
  定位只为读回服务：`_I.SEEK` 跨边界不取货，读回才取。
- **队列拦截正是差值的来源**：命中队列的那些位置不碰介质侧，已跨数就停在
  原处，下一笔落介质前由 `I.SYNC()` 一并补上。
- **介质契约**：第 i 条记录对应共享序列第 i 位——`$I.DUMP` 交出的是整份
  stash（不裁剪，index 即绝对位置），所以介质侧实现出生在序列第 0 位。二进制
  布局（长度前缀、对齐、要不要索引）全归策略，家族不假设。**非终态必须
  交块**（要空就交零长 Buffer，洞形由 parser 拒）。
- 位置只前进：读者逐位消费，介质侧服务过的位置单调递增，故 `I.SYNC` 只需
  前扫；回退只能是契约违规。
- `_I.INITIALIZE` 里只做 open（不许在 init 里做定位，那是驱动器的事）；
  打开几个句柄、怎么解头、要不要批量跳，都归策略。

### Transferrer（降级写侧 · 介质中性）

- `AbstractDegradedChunkReader` 纯读；写侧抽为家族内部抽象
  `AbstractTransferrer`。**无阻塞调度的复杂性全在此作用域**：外部只
  挥手与转发，不再判断"何时降级 / dump 何时落地"。
- 四个驱动（受保护，只给分发器与 agent）：
  - `$I.DUMP(chunkStash)` — 交出整份 stash。**同步返回**：它
    **接管** stash 的整份块列表（同一批对象，只加引用，不复制）——此刻
    队列必空，因为 `$I.DUMP` 是队列的第一个写入者（transferrer 刚在
    `$I.DEGRADE` 里构造出来就挥手），这条是接管式写法的前提。把那一趟
    记进 `I.DUMPING` 并返回，本体在 `I.START_DUMPING` 里——同一步里就调
    抽象 `_I.DUMP` 开工，成功即 `$I.DROP` 释放载体、清掉接管的这 L 条
    （已落盘）并把水位一次推满；失败只闩 `I.ERROR` 并结算门，**不 DROP**
    （保留现场待查）。接管的这 L 条仍留在队列里——各读者按自己位置读到
    底，只有永不会有块的位被拒。返回的 Promise 失败时以转义错误拒给，
    唯一消费者是分发器（非阻塞挂 `warn`）。
  - `$I.WRITE(buffer)` — **入队即返回**（延缓写入）：不碰介质，只追加
    待写队列并确保 drain 在途。队列**无上限**，积压处置归下游；计数不
    外露（调试看符号表）。
  - `$I.SET_DONE()` — 源已尽的落点；置位并结算门（终值冻结会改变
    "可读"判定）。交接时若 stash 已 `done`，分发器先替它置位（终态随交接走，
    否则源头到头那一刻才降级就会留下一份在前沿白等的拷贝）。它**只冻结
    内存里的终值**，不在介质里留状态标记：定 `SET_DONE` 时就一并定了——
    进程一旦死掉，介质里的标记同样恢复不了，标记没有收益。介质的收尾
    （要不要尾部记录、要不要未完成标记）归宿主，它在 `_I.DROP` 里读
    `get done` 就能区分“到头”与“被中断”。
  - `$I.DROP()` — **放开载体**（2026-09-19 定，语义与 `ChunkStash.$I.DROP`
    对齐）：置 `I.DROPPED`、把 `I.PENDING_CHUNKS` 置空（那份没写完的东西
    我不再持有）、并调抽象 `_I.DROP()` 放开介质。**只由 `destroy()`
    触发**：没有活跃 fork 但未 `terminate()` 的分发器仍能 fork（只是进度
    落后而已），所以“何时完全放开”归宿主——没人要了不等于不能再用。
    **放开的判据只有一位**（2026-09-23 撤守卫）：`$I.DROP` 可重入，
    `$I.WRITE` / `$I.PEEK` / `$I.WAIT_POSITION` 不再断言——调用面不出包
    （`SYMBOL.TRANSFERRER` 只开 `_I` / `_S`），包内四个入口又都在
    `$I.DROP` 之前的时序里。与 stash 共有的只剩放开载荷（`PENDING_CHUNKS`
    置空 → drain 靠队列空收手）。一处不同：介质那半**归它自己观测**
    （2026-09-26 改）：`$I.DROP()` 是 async、`await this[_I.DROP]()`，但它
    仍**不被 await**——失败由它就地派 `warn('drop-failed', cause)` 并**只报
    不抛**（收摊面 fail-soft，2026-09-27 改；也不再经 `ignoreRejection`
    转手，那个助手早已删掉）；调用方（`$I.DESTROY`）因此连吞都不用。
    “不被 await”是硬约束：宿主的放开若挂住（死盘），`destroy()` 不许被一起
    拖住（2026-09-25 定，用例 `should not wait for the medium to release its
own resources` 守着）。**drain 同样不等**：死盘会让 `dumping` 永不落地，
    收摊不陪它。stash 那半是完成式（同步清干净）。它也**不**替分发器封口：
    `SET_DONE()` 由 `destroy()` 先调，拿到的是“先定长后放开”。
- **放开后的写侧收手**：drain 不需要额外的标志位——队列被置空，下一圈
  自然退出（在途那一笔照旧落介质，落不回来的不管）。`I.FAIL` 改为**首次
  错误优先**，放开后介质抛出的次生失败不再覆盖源错误 / dump 失败。在途
  的 `_I.DUMP` **不打断**：宿主若要提前收手，自己查 `get dropped`。
- 串行链 `I.DRAIN` 单飞：先等 `I.DUMPING` 落地（不然会把接管的这 L 条
  再写一遍），再按 FIFO 一块一块写队列，写一块推一格水位。于是
  "活块永远排在 dump 之后"天然成立。
  - **错误闸只在循环前，且不是死代码（2026-09-23 实测）**：排空可能起于
    dump 在途时（读在 dump 期间照常发生），它一进门就挂在首句的
    `await this[I.DUMPING]` 上；dump 随后失败 → `I.FAIL` 置 `ERROR` →
    排空恢复时撞上这道闸，队列原样留下（`$I.WRITE` 只挡错误**之后**起的
    排空，挡不住这一趟）。实测 `logs/probe-drain-guard.mjs`：这一支宿主
    `_I.WRITE` 调用数 0、`pendingByteLength` 不清零，对照支排空跑完
    （写 2 笔、队列归零）。
  - **单飞位在唯一出口复位（2026-09-23）**：闸后的早退曾跳过末尾的
    `I.DRAINING = null`，把一个已落定的 promise 留在“正在排”的位置上。
    今天无观测面（`$I.WRITE` 见错即抛，起不了新排空），但那是颗雷：把闸
    改成 `if (ERROR === null) { while … }` 之后，单飞位在唯一出口复位。
  - **首句等的是 promise，不是 thunk（2026-09-23）**：
    `await this[I.DUMPING].catch(noop)` 里，等待与吞拒绝都发生在 dump
    那笔 promise 自身上。**别把它交给 `ignoreRejection()`**：`then()`
    的参数位要函数，传 promise 会被按恒等处理——等待立刻返回、也没挂上
    handler，闸于是在错误置位前被检查，失败 dump 留下的队列会被写掉。
    `should keep the chunks a failed dump left undrained` 就是这条的哨兵
    （写错时宿主 `_I.WRITE` 2 笔、期望 0），`logs/probe-drain-guard.mjs`
    的 P1 支同理。
- 读侧原语（受保护）：`$I.WAIT_POSITION(position)` = 等到该位**已被接受**
  （`position < 水位 + 队列`）或**永远不会有块**（done）。拒绝只落在
  **永不会有块**那一位：`I.ERROR` 是**介质域**的否决，已被接受的位照发
  （块还在队列里，介质坏了不作废手上这一份）。放行时把"已被接受"这个
  判断结果一并交给等待者，判据仍只写一处。`$I.PEEK(position)` 给出
  **还在队列里**的那一块
  （越界/已落介质则 `undefined`，由介质侧判）。等待靠登记表：
  `I.WAITING_POSITION_TABLE` = `Map<resolve, position>`——键是这一位的放行指令，
  值是它等的位。
  `$I.WAIT_POSITION` 登记后立刻结算一次；改变可读判定的四处（入队、dump
  落地、`SET_DONE`、`FAIL`）各调一次 `I.SETTLE()`，由它按
  `position < 水位 + 队列` 或 `DONE` / `ERROR` 放行够号的——没有广播，
  也没有各自重判。`FAIL` 那一路放行的是**未被接受**的位——它们永不会有
  块，放行只为当场拒绝；已被接受的位不因 `I.ERROR` 被拒。drain 落盘
  **不**结算：对 `total = 水位 + 队列`
  恒定，放行不了任何人；门收不到介质进度，也就不可能让它参与可读性。
- **可读 = 被接受**：在介质上或在队列里都算。介质的进度只决定"从哪儿
  取"（队列 or 介质侧），不决定"能不能取"。
- **积压策略（2026-09-16 定）**：队列**不设上限、不做闸门**。写**挂住**
  不闩错（继续积压，撑多久由宿主内存与分发器生命周期决定），写**报错**
  才闩 `I.ERROR`。积压只观察，计数不外露。
- **闩错的拒绝范围（2026-09-20 定；此前写作"此后所有读拒绝"）**：只否决
  **未被接受**的位，已被接受的位继续发——内存还拿得到的块不因介质坏了
  作废。`FAIL` 仍要结算门，是因为未被接受的等待者必须当场拒掉，不能
  留着悬挂。真需要介质的那一读仍然失败：越过前沿后下一次拉取的
  `$I.WRITE` 同步抛同一个错误（写侧不再收活块），从 `pull()` 一路拒到
  消费者——流照样报错，只是失败点推到"这位真的需要介质"处（源不再交块
  时与健康状态一样等，不额外抛）。dump 失败因此不再等于整份前缀作废：
  接管的 L 条还在队列里，各拷贝按自己的播种位置读到底再拒。
- **门的成本（记录）**：过门 445–483ns/笔，对"命中即返回"153ns（整条读
  路径 ~3.0µs 对 ~2.6µs，约 −15%；promise 构造本身约 20ns）。为这 15%
  把判据落成两处、并把 `I.ERROR` 检查搬进命中路径，不划算，故保持
  "判据只写一处"。终局也不单列分支：放行写成单循环
  `position < 水位 + 队列 || isTerminal`，一处 `delete` + `resolve`，
  让"放行点只有一处"一眼可见。`I.SETTLE` 首行空表早返回。刻度出处：
  `logs/probe-wait-cost.mjs`。
- **纯内部对象**：实例由分发器私有持有，**不开观察面**——要看就进
  调试器按符号表读成员（`I.PENDING_CHUNKS` / `I.PENDING_BYTE_LENGTH` /
  `I.WRITTEN_CHUNK_COUNT` / `I.WAITING_POSITION_TABLE` / `I.DRAINING` /
  `I.DONE` / `I.ERROR` / `I.DROPPED` / `I.DUMPING`）。读口是 getter：
  `dumping` / `done` / `error` / `dropped` / `pendingByteLength`，其余交互
  全走 `$I` 原语。
- **积压计数 `I.PENDING_BYTE_LENGTH` / `get pendingByteLength`**：只数
  **切换之后新堆上去、还没落盘**的字节（`$I.WRITE` 加、drain 每写一笔减、
  `$I.DROP` 归零）；**交接过来那份不算**——它本来就在阈值附近，算进去等于
  每次正常降级都误报一次。它是“写侧落后了多少”的度量，也是宿主的积压信号。
- 实例与 `ChunkStash` 1:1，因此状态就是普通字段，不再用 WeakMap /
  WeakSet 按 stash 键控。抽象钩子 `_I.DUMP` / `_I.WRITE` / `_I.DROP` 由下游
  实现，静态侧 `_S.PARSE_ARGUMENTS` 基类已给恒等实现（覆盖可选；入参是整份
  参数数组而非摊平，receiver 是写侧类，预置构造参数时经它归一）。
- 完成标志 `$I.SET_DONE()` / `get done` 与 stash 侧 `$I.SET_DONE()` /
  `done` 同形（连分层也一致），但落点换人：降级相位的落点交接记在
  transferrer 上（源已尽那一趟拉取由 agent 同步置位）。它不只置位——
  还结算门："该位永不会有块"正是由它冻结的终值算出来的。
- **配对**：写侧**类**由降级读器家族声明（`_S.TRANSFERRER_CTOR`，
  基类静态抽象）；分发器在降级时构造实例、立刻把**自己**挂上去
  （`$I.SET_DISTRIBUTOR`，三个宿主成员的就地报告靠它）、再持有
  （`$I.TRANSFERRER`）、
  再交接给各拷贝的新读取器。实例与 `ChunkStash` 1:1，因此不再需要
  一次性守卫与 `instanceof` 校验。转存产物可留在实例自己的字段里。

### ForkedReadableStream（流面）

- `extends ReadableStream`；`get $I.CHUNK_READER` 读当前读器，
  `$I.SET_DEGRADED_CHUNK_READER(reader)` 是唯一的换入口（降级时用，只此
  一次）。**流上不留早退位、源码里也不解释（2026-09-23 删）**：标准自己
  就是依据，替它写一句注释等于把“平台行为”降格成“我们的假设”，维护者
  在源码里看到空位是自然的。机制是两条：`pull` 不会在流离开 `readable`
  后再被调（`ShouldCallPull` 先过 `CanCloseOrEnqueue`）；`cancel` 也不会
  第二次到达回调（已 closed 的流由 `ReadableStreamCancel` 直接答 resolve）。
  实测 `logs/probe-pull-after-end.mjs` 三支的 `pull` 计数都停在 1；
  `I.DONE` / `$I.CANCELLED` 两字段随之退役。
- `start` 钩子只做一件事：把 controller 交给构造器局部变量，供入册用
  ——**不落字段**，controller 的唯一持有者是注册表。
- **预取深度是一个选项**（`ForkHighWaterMark`，默认 `1`，2026-09-21 落）：
  构造时读一次，作为 `ReadableStream` 的**第二参数**（排队长策）——不能塞进
  第一个参数（那是 underlying source，塞进去等于没设；实测踩过这个坑）。
  刻度已量（`logs/probe-fork-hwm.mjs`）：默认 `1` ⇒ 消费者读一笔时源已被拉 2
  笔（总有一笔躺在流内队列里）；`0` ⇒ 零预取（源进度 1）；`4` ⇒ 队列躺 4 笔
  （源进度 5）；小数按同一算式补拉（`1.5` ⇒ 3）；**`Infinity` 等于把源抽干**
  （实测源那 10 笔全进队列），别当"更快"的旋钮用。它是"每个拷贝多占几笔内存"
  与"源被推得多靠前"之间的刻度，也因此**决定降级交接时的播种进度**（预取那笔
  会走老读器并推高它的消耗计数）。
- **水标的断言是单独一条**（`Assert.HighWaterMark`）：按规范先 `ToNumber` 再判
  ——`NaN` 或负数抛 **`RangeError`**，`Symbol`/`BigInt` 则走 ToNumber 中止的
  `TypeError`（异常类跟规范，不用本仓的 `ThrowTypeError` 模板）。所以合法的值
  是"非负**数值**"：小数、`Infinity`、以及 `'3'`/`null`/`true` 这类可转数值的值
  （实测 `'3'` ⇒ 3、`null` ⇒ 0、`true` ⇒ 1）。**归一发生在流侧**（构造 fork
  时），选项本身存的是宿主给的原值——`Get` / `snapshot` 回的是原值（设 `'3'`
  读回 `'3'`，生效的是 3）。
- **两个出口自己出表**：注册表在构造器闭包里捕获一次（经分发器的
  受保护符号 `$I.FORKED_READABLE_STREAM_REGISTRY` 取，不落自己的字段）；
  读到尾（`pull` 收到 `done`）与被 `cancel` 时各调一次 `prune(this)`。
- **不暴露自己的分发器**：没有 `get distributor`——控制权不外溢。要形成
  级联就 `new Distributor(fork)`（把拷贝当源再造一个次级分发器），而不是
  让下游从拷贝摸回宿主。（`I.DISTRIBUTOR` 字段与符号键随之删掉：唯一读者
  就是那个 getter，注册表又已在构造器闭包里捕获。）
- **读到尾一律 `controller.close()`**：没有带外 poke，也就没有
  “把 close 换成 error”那个分叉；源报错走 read 拒绝，流自然 error。

### ForkedReadableStreamRegistry（fork 注册表）

- 内部协作类，与 `SourceConsumptionAgent` 同路：平铺字段、普通方法名，
  不带符号表；由分发器构造并持有在受保护字段
  `$I.FORKED_READABLE_STREAM_REGISTRY`（fork 出口自清理要读它，故不能私有）。
- `forks`：`Map<ForkedReadableStream, ReadableStreamDefaultController>`
  ——宿主对每个拷贝的账：成员 + 结束它所需的那根操作杆。
  `add(fork, controller)` 入册，**由 fork 自己在构造器体里登记**：
  `start` 钩子在 `super()` 期间跑，那时派生类还没有 `this`，所以
  controller 先落构造器局部变量，`super()` 返回后再连同 `this` 一起入册
  （controller 因此不落 fork 的字段，唯一持有者是注册表）。
  `for...of` 产出 `[fork, controller]` 条目——降级换读器解构第一个，
  强制档两个都要。
- `prune(fork)`：单个出表，**两个出口由 fork 自己调用**（读到尾、被
  cancel）——出口只有 fork 自己知道，所以这里是自清理而非扫表；
  **第三个出表点是强制档**：宿主代拷贝收场，所以那里由宿主 prune。
- **不变量：成员资格 = 降级交接名单**。表只有一条义务——降级那一刻
  还读得动的成员一个都不能漏。故出表只能由 fork 自己在出口发起，
  **不存在扫描式清理**：残留的读不动的成员（例如源报错之后）既不会被
  交接，也不会被谁读到，只按体积计费。`destroy()` 是第三个出表点：
  它当场结束每个拷贝并逐个 prune——那是“宿主代拷贝收场”，与
  “出口只有 fork 自己知道”不矛盾。
- **代价（记录在案）**：表到 fork 的强引用，加上 fork 的 `I.DISTRIBUTOR`
  回引，构成双向强引用——只要消费者还握着任一 fork，整条图（源读器、
  stash 及其字节、源流）都不可回收。“最后一个 fork 被丢弃”是分发器
  可回收的前提。

### 异常面（四类归属，2026-09-26 判）

> 规范面（责任划分、失败域、恢复归属、处置清单）在 `EXCEPTIONS.md`；
> 本节留逐条决策的来历与实测证据。

- **平台保证**（尊重、不兜底）：源是**本 realm 真流**，`read()` 的形状、
  `cancel()` 兑现在途读、已 error 的流对新读立即拒绝都是规范；`controller`
  在已取消 / 已 error 的流上抛、async `pull` 的拒绝被平台吞（已实测）也都
  是平台契约。
- **宿主自己抛的异常 ⇒ 放行**（不吞、不翻译）：Options 取值器 · 宿主类的构造器
  与静态成员（`new TransferrerImpl(...)` / `_S.PARSE_ARGUMENTS`，后者常带
  Transferrer 开发者给最终用户的自定义异常）· 降级读者的
  `_I.INITIALIZE` / `_I.SEEK` / `_I.READ` / `_I.CLOSE` · 介质的
  `_I.WRITE` / `_I.DUMP` / `_I.DROP` · 非 Buffer 的 chunk。**校验口例外**：
  `Checker` 只出判词、不抛。
- **构造器抛的后果**（2026-09-26 定）：它落在某一趟 pull 里 ⇒ 那趟 pull
  失败（异常照旧到读侧 + 派 `pull-failed`），而 `$I.TRANSFERRER` 未落位 ⇒
  `degraded` 仍 `false`，下一趟 pull 照旧重试切换（不锁死）。
- **报告点跟着发生处**（2026-09-26）：降级读者的四个宿主模板成员在**调用
  现场**派事件，派发器就是分发器（读器构造时就拿到了它）：
  `_I.INITIALIZE` → `initialize-failed` · `_I.SEEK` → `seek-failed` ·
  `_I.READ` → `read-failed` · `_I.CLOSE` → `close-failed`（同步抛也经
  promise 转手）。前三个**报完照旧抛出**（控制流不变）；`close-failed`
  是即发即弃，只报不抛。源读取器同样：平台 `read()` 拒 → 它派
  `source-read-failed` 再原样抛出（那趟 pull 于是照旧失败，代理另派一条
  `pull-failed`——一个因两条事件、两码两义，按“重复上报不去抖”不去重）；
  平台 `cancel()` 拒 → 它派 `source-cancel-failed`，**只报不抛**（收摊面
  fail-soft）。**出口唯一**（2026-09-26 收口）：以上所有 `warn` 都
  经分发器的受保护成员 `$I.WARN(code, payload)` 派发——出口一处，
  报告点仍各自在失败的发生处。
- **介质侧同样在发生处**（2026-09-26 收口，代派没有了）：转移器**构造后**
  被分发器挂上自己（`$I.SET_DISTRIBUTOR`——构造器收的是宿主参数，塞不进
  分发器），于是三个宿主模板成员各自就地上报：
  `_I.DUMP` → `dump-failed`（载荷是**宿主原始因**；包装错随后照旧抛给
  调用链）· `_I.WRITE` → `write-failed`（闩住后仍会在后续每趟 pull 里由
  `$I.WRITE` 同步抛、代理派 `pull-failed`）· `_I.DROP` → `drop-failed`
  后只报不抛（收摊面 fail-soft）。
- **重复上报不去抖**：与 `backlog` 同族——一个因（dump 被拒）可以让每个
  降级 reader 各派一条 `initialize-failed`；闩住的介质错误会让之后每趟消费
  各派一条 `pull-failed`。水准信号，限频归宿主。
- **漏斗唯一**：所有内向失败统一从拷贝流的 `read()` 抛出并拒该拷贝（监听器
  抛不在此列，已实测）。

## 术语

- seek = 寻道（光驱磁头找道，游标跨边界）；seed = 播种（给 `CONSUMED_CHUNK_COUNT`
  初值）——不同词，不混用。
- 读回（read back）= 降级 reader 从**真实介质**里取块的行为（家族侧
  `I.READ_BACK()`）：`_I.READ` 交出介质侧游标上那一条。从队列交付的那几笔
  不算读回（没碰介质）；定位（`_I.SEEK` 跨边界）也不取货，它是读回前的
  归位。这个名字对着 write-back：入队即返回是回写，没命中缓冲时就把块
  **读回**来。
- 内存→磁盘阶段切换称"降级（degraded）"（原 Fallback 术语已弃）。

## 决策日志（演进 · 按时间追加）

> 不稳定、演进中的决策先在此按时间（`### YYYY-MM-DD`）追加，保留
> 来龙去脉；一旦收敛为确定结论，不定期执行"结论压缩"——并入上方
> 对应主题的"当前有效结论"，并从本节移除。
>
> 最近一次压缩：2026-09-19——09-16 积压策略、09-17 位置门、09-18 注册表、
> 09-18/09-19 两档生命周期（terminate 关闸门 / destroy 封口切断源）
> 已并入上方主题。

### 2026-09-09 — 定位与生命周期收敛（已压缩入上方，留作示例）

- 演进弧：`START_INITIALIZE` + once-guard → 构造器播种 `progress` →
  `REQUEST_INITIALIZE(progress)` 播种、删 guard → 初始化/关闭迁降级
  家族、基类收缩为"有位置的读头"。
- SEEK：基类 `_I.SEEK`（配 `$I.SKIP`）→ 迁降级家族为寻道原语，介质侧
  自实现按位定位；`CONSUMED_CHUNK_COUNT` 承载 fork 绝对位置。
- 现结论见上方：ChunkReader 家族 / 初始化与关闭 / 读路径 / 切换定位。

### 2026-09-10 — 前沿语义收敛（已压缩入上方，留作演进记录）

- `$I.READ` 定位：per-fork 驱动 → 确认为"前沿消费"接触点，且是
  "推进消费 / 判定是否再进一步"的唯一作用域；`done` 归 `_I.READ`。
- 内存路径末尾标志落定：`ChunkStash` 增加保护级封口 `$I.SEALED`，把
  "触达前沿"与"真 `done`"分开（`index >= length` 且已封口才算完）。
- 09-13 修订：封口改归"整份 dump 前的冻结"，真 `done` 改由 `stash.done`
  与自身位置判定，前沿改由 `ensure()` 的就绪契约吸收；下列"待收敛"两项
  由此收口。
- 09-20 删除：`sealed` 整套移除（`I.SEALED` / `$I.SEAL` / `get sealed` /
  调用点）——两半职责早已各有归属（真 `done` 归 `stash.done` + 位置，写面
  冻结归相位翻转 + dump 成功即 `DROP`），这个位既非判据也非闸。
- 待收敛（当时）：前沿信号形态、`$I.READ` 的等待方式，以及它与共享
  取块层"确保可用"的衔接。

现结论见上方：「读路径」/「SourceConsumptionAgent（消费代理）」。
