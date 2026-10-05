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

### 共享词汇：@produck/argot

组织级共享词汇包（`Common` 助手 + `SYMBOL` 符号表），2026-09-30 接入核心包，
替掉本地近义写法：

- `Common.ignoreRejection(promise)` ← 本地那份 `.catch(() => {})`
  （`Distributor/Abstract.mjs` 的 `initializeReader`：初始化失败由读点收，
  这里只吞给自己）。
- `Common.sleep(ms)` ← 本地两处 `setTimeout` 包装（读器初始化、写侧
  dump / drain 的重试等待）。
- `Common.ThrowFalse(fn)` ← `Checker.mjs` 里本地的 `try { … } catch { false }`
  （`isReadableStream` 的"有判据、不抛"保证）。注意这个成员在 0.1.2 是
  **工厂**：`ThrowFalse(fn)` 返回 `(...args) => …`，不是立即调用；0.1.0 里
  它叫小写的 `throwFalse` 且立即调用——包写的是 `^0.1.2`，两者别混。
- `SYMBOL.CONSTRUCTOR` ← 本地的 `I.CTOR`（`.#ctor`）：`_Symbol.mjs` 不再
  声明这个键，且照旧"纯叶子、不引用任何东西"——argot 的 import 落在
  `Abstract.mjs`。

一处域收紧：`Common.sleep` 断言"非负整数"，本地那份会把小数静默交给
`setTimeout` 截断。三个 interval 选项本来就是 `NonNegativeInteger`（`Tune`
时读一次校验），但 `Get` **不在读时复查**，所以"Tune 一个 getter、它后来
返回非整数"会在这条重试路径上抛 `TypeError`——违约用法，未单独实测。

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
- 面向调用者的具名成员（如 `get prepared` / `get done`）用普通字符串键。
- 缩写白名单：构造器（`new.target` 捕获）→ `CTOR`。**符号键持有类值一律
  以 `_CTOR` 结尾**（`_S.DEGRADED_CHUNK_READER_CTOR` /
  `_S.TRANSFERRER_CTOR`）。组织级共享符号集已建成（`@produck/argot` 的
  `SYMBOL`，2026-09-30）：第一个被收编的是捕获的构造器
  `SYMBOL.CONSTRUCTOR`（原来本地的 `.#ctor` 已删）；`_S` 里那几个持类值的
  槽仍本地声明（argot 只给 `CONSTRUCTOR`）。
- **两个表文件分工**：`_Symbol.mjs` 只定义自己的表（纯叶子，不引用任
  何东西）并出别名 `A`；对外的表单独放 `_External.mjs`，在那里导入并
  转发（`export * as CHUNK_READER from '../ChunkReader/_Symbol.mjs'`），
  并出别名 `_A`。现转发：`Part` →`DISTRIBUTOR`；`SourceReader` →`PART`；
  `ChunkReader` →`DISTRIBUTOR`+`PART`；`BufferChunkReader` →
  `CHUNK_READER`+`DISTRIBUTOR`+`PART`；`ForkedReadableStream` →
  `DISTRIBUTOR`+`CHUNK_READER`；降级族 →
  `TRANSFERRER`+`CHUNK_READER`+`DISTRIBUTOR`+`PART`；写侧 →
  `CHUNK_STASH`+`PART`。
- **两个别名各管一摊**：`A`（自己的符号，在 `_Symbol.mjs`）——长键的
  短名（`A.$I.AGENT` / `A.$I.CONSUMED_COUNT` / `A.I.CTOR.READER.CURRENT`…）；
  `_A`（借来的表，在 `_External.mjs`）——`_A.STASH` / `_A.READER` /
  `_A.BUFFER` / `_A.DEGRADED` / `_A.FORKED`。消费侧一眼分出“我的符号”与
  “外面借的”。
- **`_A` 只收“需要短名”的借表**：它装的是“角色名 → 借来的表”
  （`_A.READER` = `ChunkReader`）。表名本身够短的（`PART` / `DISTRIBUTOR`）
  按名从 `_External.mjs` 导入，不机械划进来；判据与 `A` 同：**别名比原名
  短 × 消费点数量**（`_A.DISTRIBUTOR` 比 `DISTRIBUTOR` 还长，所以不进）。
- **别名在定义处也套**：键开了就用（`ChunkReader/Abstract.mjs` 自己就写
  `A.$I.CONSUMED_COUNT`）。没开键的长名可以随手开一个，判据是**键名长短 ×
  消费点数量**（短名开别名反而更长，见下条）。
- **现存键集**（`A`）：`Distributor`——`I.{STASH,AGENT,SOURCE}`、
  `I.CTOR.{TRANSFERRER,READER.{DEGRADED,CURRENT}}`、`$I.REGISTRY`；
  `ChunkReader`——`$I.CONSUMED_COUNT`；
  `DegradedChunkReader`——`I.SEEKED_COUNT`；`Transferrer`——`I.WRITTEN_COUNT`；
  `ForkedReadableStream`——`I.READER`、`$I.READER`。
- **现存 `_A`**：`Distributor`——`{STASH,READER,BUFFER,DEGRADED,FORKED}`；
  `BufferChunkReader` / `DegradedChunkReader` / `ForkedReadableStream`——
  `{READER}`；`Transferrer`——`{STASH}`；`Part` / `SourceReader` / `ChunkReader`
  没有 `_A`（借表都按名导入）。
- **别名只给“直接子表 + 本模块自己的符号”**：家族的内部下级表不设别名，
  按名从 `_External.mjs` 导入即可（写侧 `TRANSFERRER.$I.PREPARE`——名字本身
  已经够短，套一层别名只是多一层）。
- **局部别名 vs 内联**：一行放不下时起局部别名
  （`const stash = this[A.$I.STASH]`）而不是自行折行；但**实参位置别内联**
  ——把一个 `this[…]` 拼进多参调用里，prettier 会把实参逐行展开，反而
  多占行、也更难读。判据：内联后整行仍 ≤80 列才收（`printWidth`）。
- 环检查 `logs/check-import-cycles.mjs`：44 个模块，强连通分量 0。
  `_Symbol.mjs` 只定义不引用，“向上借”落在 `_External.mjs` 这条叶子上，
  环自然消失。
- **宿主面 = 公开成员 + `_I` / `_S`**（后者经包出口的 `SYMBOL` 开出去，
  按家族分组）。`I` / `$I` / `A` **不开**：宿主需要一项能力时，优先把它
  _升格为公开成员_（例：写侧构造参数从 `$I.SET_TRANSFERRER_ARGS` 升为
  `setTransferrerArgs()`、降级读器新增 `get transferrer()`），而不是把符号表
  整个开出去——符号是内部的维护面，公开成员才是承诺面。

### 受保护实例字段与静态钩子（`_S`）

- 分发器没有公开静态面：策略只经 `_S` 静态钩子声明类值（现只剩
  `_S.DEGRADED_CHUNK_READER_CTOR`），消费者是构造时捕获的
  `SYMBOL.CONSTRUCTOR`（`new.target`），不用 `this.constructor`。
- 内存→介质阈值：**选项** `MaxChunkStashByteLength`（默认 1GiB 由
  `Items.mjs` 给）。
  读经 `Options.Get.MaxChunkStashByteLength`、写经 `Options.Tune`——构造器只收
  `source`，没有第二个写入点；降级触发点因此确定可复现。
- `_S.DEGRADED_CHUNK_READER_CTOR`：策略侧给出的降级读取器类引用，
  degrade 时用它构造各 fork 的新读取器；暂以 `M.Function` 弱校（只确认
  是函数），待收敛为“必须是降级家族的子类”。

## 观点 / 决策 / 结论

### 目录约定

- 一目录一类：主类文件 `Abstract.mjs`/`Concrete.mjs`（存在性互斥）+
  `index.mjs` + `_Symbol.mjs`（借用外部表时再多一个 `_External.mjs`）；
  目录路径即命名空间。读选项的模块再多一个 `Options.mjs`——模块内短名
  （见“Options（配置面）”）。
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
- 内部：`I.SOURCE_READER`（唯一 source 消费者）· `$I.CHUNK_STASH`（共享
  `ChunkStash`）· `$I.SOURCE_CONSUMPTION_AGENT`（消费代理）·
  `$I.FORKED_READABLE_STREAM_REGISTRY`
  （fork 注册表，fork 出口自清理也要读）· `$I.TERMINATION`（未终结为
  `null`，否则是终止原因；只剩 `fork()` 闸门与 `destroy()` 的取消读它）·
  `$I.WARN`（`warn` 的单出口——受保护成员，收 `(code, payload)`）·
  `SYMBOL.CONSTRUCTOR`（捕获的自身类，共享符号）· 两个类值
  getter `I.DEGRADED_CHUNK_READER_CTOR` / `I.TRANSFERRER_CTOR`，以及当前
  相位字段 `I.CURRENT_CHUNK_READER_CTOR`（初值 `BufferChunkReader`，降级
  换读器时置为前者）。受保护侧另有写侧实例 `$I.TRANSFERRER`，及其待用构造参数的
  **公开**入口 `setTransferrerArgs(...)`（落 `I.TRANSFERRER_ARGS`，经写侧家族的
  `_S.PARSE_ARGUMENTS` 归一——基类给了恒等默认，分发器自己不解释）。构造
  校验 source 为**本 realm** 的、未锁定的 WHATWG ReadableStream。
- **源必须是本 realm 的 ReadableStream（2026-09-26 定）**：判定就是
  `value instanceof ReadableStream`。理由不是风格：库里多处**依赖真流的
  规范语义**（`locked` 恒真、`cancel()` 关流并兑现在途读、errored 流对新读
  立即拒绝、reader 独占），“看起来像”的对象通过了才是坏消息——错误被推到
  运行期。判据**只出判词、不抛**：`instanceof` 对本地 Proxy（含 revoked）会
  跑 `[[GetPrototypeOf]]` 陷阱，所以 `try` 留着，抛就判 `false`。
  实测口径：`logs/probe-checker-throw.mjs`（真流通过；鸭子型、revoked、
  抛异常的访问器都判否）。
- **跨 realm 分享不需要适配层（2026-09-29 更正）**：`ReadableStream` 是
  HTML 的 transferable，`postMessage(stream, [stream])` 之后接收 realm 拿
  到的就是**它自己的** `ReadableStream`（反序列化落在目标 realm）：
  `instanceof` 为真、直接可读。所以此前那句“跨 realm 的流要先经适配层
  转成本地流、适配工具包另开一个包”作废——包不建（曾照它建过一个
  端口协议版，按此结论删除）。判据真正挡下的是**直接引用**别的 realm
  造出来的对象（`iframe.contentWindow.x`、`vm` 上下文、别的实现造的同形
  对象）：那条路没有反序列化环节，`instanceof` 为假；把它变成本地流是
  宿主的活，框架不管。
  实测：`logs/probe-stream-transfer.mjs`（Node：列 transferList 可转移，
  不列抛 `DataCloneError`）；`logs/probe-stream-transfer-realm.html`
  （浏览器打开即测：Chromium 同源 `about:blank` iframe，两边构造器互异、
  接收侧 `instanceof` 为真、读到 `[1,2,3]`）。
- 共享 stash 由分发器 create/持有并注入各读取器；内容生命周期（`$I.PUSH()` /
  `$I.SET_DONE()`）归 `SourceConsumptionAgent`；dump→drop
  归写侧（`I.DUMP` 成功自己 DROP），内存相的 drop 归 `destroy()`。
- 降级：**触发在消费代理**（stash 字节超过构造时定下的阈值），**执行在分发器** `$I.DEGRADE`——
  构造写侧实例（按读器家族 `_S.TRANSFERRER_CTOR` + 预置构造参数）、
  把它挂上分发器（元件的 `$I.SET_DISTRIBUTOR`）、执行其 `dump`、
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
  终态播种在 `$I.DEGRADE`**。判据对 `done` 那一趟也跑——“达到上限又遇到
  `done` 时切不切”因此是显式声明的决定，不是位置带来的副作用。
- **边界策略是一个选项**（`DegradeOnChunkStashFullAndDone`，2026-09-21 落）：
  “达到上限且源已到头”时切不切由它决定，判据读法就是它的名字——两个事实都在
  `degradeIfNeeded()` 里显式：越限
  （`byteLength > MaxChunkStashByteLength`）+ 到头
  （`stash.done`）。**默认 `false` = 不切**：源已到头，数据全集已在这份 stash
  里且不会再涨，落介质只是白搬一趟；“不切”那一支**不需要交代任何状态**
  （stash 仍是落点、自己的 `done` 也在自己身上），读侧照旧按
  `stash.done && index >= length` 收尾。取 `true` 时照样切换，并且
  **终态随交接走**——stash 已 `done` 就先给新 transferrer `$I.SET_DONE()`，否则
  读器会在前沿等一个永不来的下一笔。两值实测
  `logs/probe-degrade-after-done.mjs`：**读侧结果一致**（`s0 → s1 → close`），
  差别只在落点是内存还是介质（默认相位字节 4、未被 DROP；`true` 时介质 2 块）。
- **该选项现在每趟 pull 都读（2026-09-25 起“越限且到头才读”，2026-10-05
  改）**：判据里不再靠短路跳过它——越限但未到头时也读一次，只是用不到它
  的值（照旧切）。改的理由是条件块太长得折行；代价是每趟 pull 多一次
  函数调用，消费侧给的取值器会被多调几次。用例锁成“每趟 pull 读数 =
  块数 + 1”。
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
    （失败由源读取器在发生处派 `warn('source-cancel-failed')`，它**不上抛**，
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
    用例 `should leave the phase unswitched when the in-flight switch fails`
    走的就是这条路径。
  - 在途 pull 的**结果要吞掉**（2026-09-25 改）：销毁只关心时机，
    `pullingSettled` 内部 `.catch(noop)`。不吞则整个异步段中断——封口与
    释放都不发生，`destroy()` 还返回一个拒绝的 Promise。在途那笔若落到
    切换失败上，异常只随读的拒绝走，读侧（拷贝的 `ensure`）照旧收。
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
  以 `accepted=false` 且没有介质错误放行（不抛）、继续进宿主
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

### Part（元件）

- 定义：分发器下的业务实体——**持分发器引用**（受保护 `$I.DISTRIBUTOR`）、
  **经 `$I.WARN(code, payload)` 报告**（转发到分发器那一个出口）。成员四个：
  `SourceReader` · `SourceConsumptionAgent` · `ChunkReader.Abstract`
  （内存相与降级读器都在内） · `AbstractTransferrer`。
- 判据是“属于分发器”（引用那一半），报告是基类给的能力：内存相读器继承
  了引用、今天不报告，也不算不是元件。这个收编是继承链逼出来的——降级
  读器 `extends ChunkReader.Abstract`，基类只能挂在 `ChunkReader.Abstract` 上。
- 挂接点两个：构造器收分发器；或构造后用 `$I.SET_DISTRIBUTOR` 挂上
  （写侧的构造器收的是宿主参数，塞不进分发器）。写侧因此显式声明无参
  构造器，免得宿主的参数被转发进这个槽——构造完分发器立即挂上去。
- 不在这里：`ChunkStash`（不持引用、不报告）· `ForkedReadableStream`
  （只用构造器闭包拿注册表与选项）· `ForkedReadableStreamRegistry` ·
  `Options`（读时才把分发器当参数传）。
- `Part.Abstract` 直接构造抛错（`Abstract()` 的抽象构造保护，与家族基类
  同）；`$I.WARN` 是真出口的转发，`EXCEPTIONS.md` 的「出口唯一」说的仍
  是分发器那一个。

### Options（配置面）

- **定位**：分发器的**唯一配置面**。`constructor(source)` 只收源；要读就
  `Options.Get.*`，要改就 `Options.Tune.*`。
- **命名**（2026-10-05 收口）：`Items.mjs` 里的键是**最完整、无歧义**的
  公开名——域前缀（`ChunkStash` / `ChunkReader` / `Transferrer` /
  `ForkedReadableStream`）+ 阶段 + 语义，一项一个名。**消费模块不写长名**：
  每个模块自带一个 `Options.mjs` 把长名收成本地短名
  （`Transferrer/Options.mjs`、`DegradedChunkReader/Options.mjs`、
  `ForkedReadableStream/Options.mjs`），模块只 import 它——短名在模块内唯一，
  长名在公开面上唯一。要合并粒度就写成 preset，**不在选项层合并**；preset
  名同样带所有者（`noChunkReaderInitializeRetry`、
  `noTransferrerDumpRetry` …），只有聚合的 `noRetry` / `unlimitedRetry`
  不带。
- **文件**：`Options/index.mjs`（门面：转发 `Accessor`、导出 `Preset`）、
  `Options/Accessor.mjs`（注册表：`OPTIONS` 槽位 + `Tune` / `Get` /
  `install` / `snapshot`）、`Options/Items.mjs`（选项定义表）、
  `Options/Assert.mjs`（断言实现）、`Options/Preset.mjs`（以分配器为参、
  调若干 `Tune` 重新映射语义的函数族：`noRetry` / `unlimitedRetry` /
  `noTransferrerDumpRetry` …）。**不在类设计规则体系内**：没有
  `_Symbol.mjs` / `_External.mjs`，自带本地槽位符号，也不进
  `Distributor/index.mjs` 的“只导出类”约定。
- **形状**：每个分发器实例挂一张 **bag**（普通对象，键 = `item.name`，
  值 = 取值器函数），放在实例的 `OPTIONS` 槽位（构造器里 `install(this)`
  造一次）。`Get.X(distributor)` 读、`Tune.X(distributor, value)` 写
  （值或取值器都收）、`snapshot()` / `get options` 拿一份**新建的**快照。
  - **槽位而不是 WeakMap**：构造期 `this` 是裸实例、之后拿到的是代理，
    WeakMap 按身份键控会两边对不上（实测踩过）；符号字段在代理与裸实例上
    读写的是同一份。
  - **默认值可以是取值器**（引用另一项）：
    `MaxTransferrerBacklogWarningByteLength`
    默认**跟随** `MaxChunkStashByteLength`，读时才求值——所以 `items` 的数组
    顺序不是契约。
  - `Items.mjs` 是**叶子**（只 import `Assert.mjs`）：一旦 import 注册表就
    成环 `index ↔ Items`，且从 `Items.mjs` 先进进程会
    `Cannot access 'items' before initialization`。默认值里要复用另一项
    就读 bag（`(options) => options.X(options)`）；**不能**写
    `Get.X(bag)`——`Get` 内部读槽位，传 bag 进去是 `undefined`。
- **断言**：`Assert.NonNegativeInteger` / `Boolean` / `HighWaterMark` /
  `NonNegativeIntegerOrInfinity`。
  `Tune` 是**唯一断言点**（坏值不落袋），`install` 不断言——默认值信任
  作者。`HighWaterMark` 按规范口径：先 `ToNumber` 再判，`NaN`/负数抛
  `RangeError`，`Symbol`/`BigInt` 抛 ToNumber 中止的 `TypeError`；归一
  发生在流侧，`Get` 回的是宿主给的原值。
- **宿主取值器抛异常一律放行（2026-09-25 定）**：这属于研发错误，下游工程师
  必须保证它不抛。所以 `Tune` 的安装期求值、`Get` / `snapshot` /
  `get options`，以及每个内部读取点（
  `ForkedReadableStreamHighWaterMark` 在 `fork()` 构造处、
  `degradeIfNeeded` 两项、转移器 `$I.WRITE` 一项）都不加 `try`。
  两处后果要知道：`fork()` 是**什么都没建**就抛（拷贝
  未注册、`fork` 事件不派）；pull 里的读取点抛 = 那趟 pull 失败，异常照旧
  到达读侧（拷贝的 read 拒绝），也不出事件——这是放行，不是拦截。
- **读取时机逐项不同**，写在 `Items.mjs` 每项的头一行注释里（每趟 pull /
  每笔写 / 每个 fork 构造一次）。这条不是风格：`Tune` 之后"为什么不生效"
  只能靠它回答（`ForkedReadableStreamHighWaterMark` 只管之后新建的拷贝）。
  刻度出处：`logs/measure-options.mjs` / `logs/measure-options2.mjs`。
- **八个重试选项（2026-09-29 收口，2026-10-05 增写侧就绪一对）**：
  `MaxChunkReaderInitializeRetryCount` / `MaxTransferrerInitializeRetryCount` /
  `MaxTransferrerDumpRetryCount` / `MaxTransferrerDrainRetryCount` 默认都是
  `Infinity`（无限重试），断言走 `NonNegativeIntegerOrInfinity`
  （`Infinity` 是唯一非整数合法值）；四个 `*RetryInterval` 是两次尝试之间
  的毫秒数，断言 `NonNegativeInteger`，默认 `1 * SECOND`（个数默认无限，
  间隔就不能默认 0——否则死盘上是自旋）。四个重试循环都已落位，读取时机
  写在 `Items.mjs` 每项的头一行注释里。

### SourceConsumptionAgent（消费代理）

- 角色：**唯一的源消费方**（`pulling` 单飞，所有等待者共享同一趟拉取）
  与**唯一的落点写入者**——“源的事实”经它交给落点，失败不归它报（报告
  各自在发生处，见异常面一节）。降级的**触发**也在这里，单独一个成员
  `degradeIfNeeded()`（stash 字节超阈值 →
  `distributor.$I.DEGRADE()`；执行仍在结构侧，见 Distributor 一节）
  ——落点写入（`toStash` / `toTransferrer`）与切换策略分开写，阈值这种
  分发器策略一眼看得见。
- **相位只有一个事实来源**：`distributor.degraded` 观察自己的
  `$I.TRANSFERRER` 是否落位，代理不持有它，`pull()` 的分支直接问分发器
  ——两份真相会在降级
  失败时分叉（`DEGRADE` 抛错则 transferrer 从未落位，而代理若自己记一份
  `degraded` 布尔就会已置真），后果是后续每趟 pull 都拿 `null[…]` 的
  TypeError 顶掉真正的原因
  （实测见 `logs/probe-degrade-failure.mjs`）。
- **积压告警**：报告点在**转移器**里——`$I.WRITE` 入队后问一次
  `pendingByteLength > MaxTransferrerBacklogWarningByteLength`
  （选项，读经 `Options.Get`）就派
  `warn('transferrer-backlog', { pendingByteLength })`——**不去抖：只要还在
  阈值以上每写一笔派一次**（水准信号，限频归宿主；通常本来就被忽略，代价
  只是每次一点分配），该选项默认**跟随** `MaxChunkStashByteLength`。这条信号
  只存在于降级相：内存相被降级触发天然封顶，而积压按设计不设上限、
  不闸门、也不反压源（“顶住死盘”的代价由宿主从这条 `warn` 里看见）。
- **它的采样点在写入路径上**（这条信号的边界条件，调阈值前先看这里）：
  `$I.WRITE` 只在某一趟 pull 真的写下一笔时跑，于是——
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
- `settlePulling()`：`try` / `finally`（没有 `catch`）——`finally` 复位
  `pulling`（失败后照样能再拉），拒绝**原样**传下去（`ensure` 的循环靠它
  退出，见陷阱第三条）。
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
- `finished` 的由来：`SourceReader.READ` 在 `CANCELLED` 之后**不写
  `DONE`**——只看 `done` 的循环会对着已收摊的源每圈 `SET_DONE` 一次。

### SourceReader（分发器侧拉取装置）

- **源的所有权**：构造时即 `getReader()` 锁死——给了分发器的源即被独占
  整个生命周期。永不 `releaseLock()`，且这不是纪律而是结构事实：reader
  只存在于私有 `I.READER`，外部无处取得释放机会；`stream.cancel()` 也被
  锁挡死（锁定即拒，且不尝试取消）。前提：一个源只喂一个分发器、一个
  分发器一生只用一个 reader。对外可见的外观是 `stream.locked` 恒为 true。
- 两个事实位互斥穷尽：`done`（源到头，拉取触发）· `cancelled`（我们下过
  收摊令，同步置位）。**源错不是位**（2026-09-26 移除 `I.SOURCE_ERROR`）：它只以
  两样东西存在——平台 `read()` 的拒绝，与发生处那条
  `warn('source-read-failed')` 的 payload；存一个没人读的位是死状态。
  对“源还能不能拉”这一个问题，对外只给一个读口：`finished`
  （`done || cancelled`）——消费代理的 `ensure()` 只认它。**源错不进
  `finished`**：进去就是陷阱第一条（循环提前停），出路只能是那个拒绝。
- **构造收 `(distributor, stream)`，引用由元件基类持有**（2026-09-28 起归
  `Part`）：用途就是报告——`[I.READ]()` 里平台 `read()` 拒 → 派
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
- `cancel(reason)`：**单次到达**（唯一调用者 `$I.DESTROY`，且它被
  `$I.DESTROYED` 缓存，不加幂等守卫）；**先置位再转交**平台
  `reader.cancel(reason)`；上游 cancel 回调失败时它先派
  `warn('source-cancel-failed')`，异常**不上抛**（收摊面 fail-soft；
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
- **放开没有守卫**：`$I.DROP` 的两个触发点（dump 成功、destroy 收场）都在
  该相位结束之后，此后没有任何路径再触碰 stash，所以不加守卫。代价：将来
  若误用，症状是静默——写进没人看的数组、`get(index)` 得 `undefined`。
- **写面没有独立的闸**：写面冻结由**相位翻转**与**dump 成功即 `DROP`**
  保证；“触达前沿”与“真 `done`”的区分归 `ensure()` 的就绪契约与位置门
  （见「读路径」）。实测（`logs/probe-write-face.mjs`）：成功路径载体已
  放开（推进去抛 `dropped`），失败路径也照样推得进去。

### Reader 术语

- `ChunkReader` = 各拷贝的逐块读取装置；`source reader` = 分发器侧拉取
  装置。职责不同，代码与文档不共用 `READER`。

### ChunkReader 家族

- 分叉：内存路径 `BufferChunkReader`（直接读共享 `ChunkStash`）与降级
  家族（`AbstractDegradedChunkReader` + 具体介质侧实现）。
- **读器只持一个保护级分发器成员**：引用归元件基类
  （`Part.$I.DISTRIBUTOR`），`agent` / `stash` / 介质实例都按需从它解构
  （`ENSURE_THEN_READ` 解出 `agent`，`chunkStash` / `transferrer` 是从它
  取的 getter）。读器因此
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
  拉取里（触发降级的那块），所以 `ensure()` 回来后重看一眼就够，不依赖
  DROP 时序。旧实例自己那一个位置照旧前进——它已不被任何 fork
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
  `I.INITIALIZED` 置为链体 `I.INITIALIZE`：等 `get prepared`（整份转移
  落地）→ `_I.INITIALIZE` 打开介质（**可重试**，见下一条）→ `I.SYNC()`
  进度同步（只能走到介质当时能到的地方）。**失败就是链体 reject**
  （2026-09-25 定）：判据只留一处。两个观测点：重试层每次失败就派
  `warn('degraded-reader-initialize-failed', { retry, cause })`
  （2026-09-26 下移到读器：
  报告留在发生处；2026-09-29 加重试）；需要介质的那一读在
  `I.READ_BACK` 的 `await this[I.INITIALIZED]` 上拿到同一个 cause。
- **初始化可重试，且不再把整条链包进一个 try**（2026-09-29 定）：只有
  `_I.INITIALIZE` 在 try 里——`await get prepared` 与 `I.SYNC()` 在外面，
  于是同步失败不再被顺手报成 `degraded-reader-initialize-failed`（以前那两
  种失败会各自再报一条聚合的 `degraded-reader-initialize-failed`，旧期望是
  两条：`degraded-reader-seek-failed` 之后又一条初始化失败。重试的依据：
  宿主 `_I.INITIALIZE` 没有复杂状态，创始不成功再来一遍不会带来危险的
  副作用（与 dump / drain 同族，但**不是**"仍持有那份数据"那条判据，
  而是"这一步本身可安全重放"）；用尽才原样抛出，收摊（`I.CLOSED`）
  落下时立即收手。
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
- **分发器是唯一调用者**（同一 tick：构造 → 播种 → 交接）；无守卫——
  链体的每个 `await` 都在播种之后，读路径拿到的一定是就位点。
- `$I.CLOSE`（**键归基类**，降级族覆盖同一个键）：`I.CLOSED` 幂等 →
  **发起式**调 `_I.CLOSE`——**同步抛也经 promise 转手**，失败派
  `warn('degraded-reader-close-failed', cause)`
  （2026-09-26：不静默吞；若让它逃出去，destroy 的遍历会被打断）。
  **不** `await I.INITIALIZED`：链体里第一句
  就是等 `get prepared`，而 `prepared` 在死盘上永不落地，等它就会把收摊
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
  就交**零长 Buffer**。
  内存族那个角（源被 cancel 而没 done 时 `stash.done` 仍假）今天不可达——
  `destroy()` 先 error 掉所有 fork 才 cancel 源；真到了那天得在内存族自己
  收口。
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
- **介质契约**：第 i 条记录对应共享序列第 i 位——`$I.PREPARE` 交出的是整份
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
  - `$I.PREPARE(chunkStash)` — 交出整份 stash。**同步返回**：它
    **接管** stash 的整份块列表（同一批对象，只加引用，不复制）——此刻
    队列必空，因为 `$I.PREPARE` 是队列的第一个写入者（transferrer 刚在
    `$I.DEGRADE` 里构造出来就挥手），这条是接管式写法的前提。把那一趟
    记进 `I.PREPARING` 并返回，本体在 `I.PREPARE` 里——**prepare 阶段 =
    就绪 + 交付**（2026-10-05 起）：先跑就绪段（就绪重试循环，自己的预算
    与报文），成功再调抽象 `_I.DUMP` 开工；成功即 `$I.DROP` 释放载体、清掉
    接管的这 L 条（已落盘）并把水位一次推满；失败只闩 `I.PREPARING_ERROR`
    并结算门，**不 DROP**（保留现场待查）。接管的这 L 条仍留在队列里——
    各读者按自己位置读到底，只有永不会有块的位被拒。返回的 Promise 失败时
    以转义错误拒给，唯一消费者是分发器（非阻塞挂 `warn`）。
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
    **放开的判据只有一位**：`$I.DROP` 可重入，
    `$I.WRITE` / `$I.PEEK` / `$I.WAIT_POSITION` 不加断言——调用面不出包
    （`SYMBOL.TRANSFERRER` 只开 `_I` / `_S`），包内四个入口又都在
    `$I.DROP` 之前的时序里。放开载荷与 stash 同形（`PENDING_CHUNKS`
    置空 → drain 靠队列空收手）。一处不同：介质那半**归它自己观测**
    （2026-09-26 改）：`$I.DROP()` 是 async、`await this[_I.DROP]()`，但它
    仍**不被 await**——失败由它就地派
    `warn('transferrer-drop-failed', cause)` 并**只报
    **只报不抛**（收摊面 fail-soft，2026-09-27 改）；调用方（`$I.DESTROY`）因此
    连吞都不用。
    “不被 await”是硬约束：宿主的放开若挂住（死盘），`destroy()` 不许被一起
    拖住（2026-09-25 定，用例 `should not wait for the medium to release its
own resources` 守着）。**drain 同样不等**：死盘会让 `prepared` 永不落地，
    收摊不陪它。stash 那半是完成式（同步清干净）。它也**不**替分发器封口：
    `SET_DONE()` 由 `destroy()` 先调，拿到的是“先定长后放开”。
- **放开后的写侧收手**：drain 不需要额外的标志位——队列被置空，下一圈
  自然退出（在途那一笔照旧落介质，落不回来的不管）。两个错误状态各只
  有一处置位，放开后介质抛出的次生失败落在 `I.DRAINING_ERROR`，不碰
  `I.PREPARING_ERROR`（源错 / dump 失败）。在途
  的 `_I.DUMP` **不打断**：宿主若要提前收手，自己查 `get dropped`。
- 串行链 `I.DRAIN` 单飞：先等 `I.PREPARING` 落地（不然会把接管的这 L 条
  再写一遍），再按 FIFO 一块一块写队列，写一块推一格水位。于是
  "活块永远排在 dump 之后"天然成立。
  - **错误状态按域分开（2026-09-28）**：`I.PREPARING_ERROR` = dump 的失败，
    `I.DRAINING_ERROR` = 排空里写失败的因，**没有共用的 FAIL**，两处各自
    置位并调一次 `I.SETTLE()`。两者互斥：dump 挂了的排空不再写，所以写
    失败只在 dump 落地后发生——读侧因此能用 `PREPARING_ERROR ??
DRAINING_ERROR` 无歧义地取出“那个把介质废掉的因”。
  - **排空不在 dump 失败后碰队列（2026-09-23 实测）**：排空可能起于
    dump 在途时（读在 dump 期间照常发生），它一进门就挂在首句的
    `await this[I.PREPARING]` 上；dump 随后失败 → 排空恢复时撞上循环首项
    `I.PREPARING_ERROR === null`，队列原样留下（`$I.WRITE` 只挡错误**之后**
    起的排空，挡不住这一趟）。实测 `logs/probe-drain-guard.mjs`：这一支
    宿主 `_I.WRITE` 调用数 0、`pendingByteLength` 不清零，对照支排空跑完
    （写 2 笔、队列归零）；哨兵用例
    `should keep the chunks a failed dump left undrained`。排空自己那笔
    失败则由 `I.DRAIN_HEAD` 收手（重试用尽才 `break`，并闩
    `I.DRAINING_ERROR` 供读侧用）。
  - **单飞位在唯一出口复位**：停止条件写成循环的首项
    `while (PREPARING_ERROR === null && 队列非空)`，而不是闸后的早退——
    否则早退会把一个已落定的 promise 留在“正在排”的位置上。今天无观测面
    （`$I.WRITE` 见错即抛，起不了新排空），但那是颗雷。
  - **首句等的是 promise，不是 thunk（2026-09-23）**：
    `await this[I.PREPARING].catch(noop)` 里，等待与吞拒绝都发生在 dump
    那笔 promise 自身上——**两件事不能分给两处**：`then()` 的参数位要
    函数，传 promise 会被按恒等处理，等待立刻返回、也没挂上 handler，
    闸于是在错误置位前被检查，失败 dump 留下的队列会被写掉。
    `should keep the chunks a failed dump left undrained` 就是这条的哨兵
    （写错时宿主 `_I.WRITE` 2 笔、期望 0），`logs/probe-drain-guard.mjs`
    的 P1 支同理。
- 读侧原语（受保护）：`$I.WAIT_POSITION(position)` = 等到该位**已被接受**
  （`position < 水位 + 队列`）或**永远不会有块**（done）。拒绝只落在
  **永不会有块**那一位：`I.PREPARING_ERROR` / `I.DRAINING_ERROR` 是**介质域**
  的否决，已被接受的位照发
  （块还在队列里，介质坏了不作废手上这一份）。放行时把"已被接受"这个
  判断结果一并交给等待者，判据仍只写一处。`$I.PEEK(position)` 给出
  **还在队列里**的那一块
  （越界/已落介质则 `undefined`，由介质侧判）。等待靠登记表：
  `I.WAITING_POSITION_TABLE` = `Map<resolve, position>`——键是这一位的放行指令，
  值是它等的位。
  `$I.WAIT_POSITION` 登记后立刻结算一次；改变可读判定的五处（入队、dump
  落地、dump 失败、写失败、`SET_DONE`）各调一次 `I.SETTLE()`，由它按
  `position < 水位 + 队列` 或 `DONE` / 任一错误放行够号的——没有广播，
  也没有各自重判。失败那两路放行的是**未被接受**的位——它们永不会有
  块，放行只为当场拒绝；已被接受的位不因错误被拒。drain 落盘
  **不**结算：对 `total = 水位 + 队列`
  恒定，放行不了任何人；门收不到介质进度，也就不可能让它参与可读性。
- **可读 = 被接受**：在介质上或在队列里都算。介质的进度只决定"从哪儿
  取"（队列 or 介质侧），不决定"能不能取"。
- **积压策略（2026-09-16 定）**：队列**不设上限、不做闸门**。写**挂住**
  不闩错（继续积压，撑多久由宿主内存与分发器生命周期决定），写**报错**
  才闩 `I.DRAINING_ERROR`。积压只观察，计数不外露。
- **闩错的拒绝范围（2026-09-20 定）**：只否决
  **未被接受**的位，已被接受的位继续发——内存还拿得到的块不因介质坏了
  作废。两处失败仍要结算门，是因为未被接受的等待者必须当场拒掉，不能
  留着悬挂。真需要介质的那一读仍然失败：越过前沿后下一次拉取的
  `$I.WRITE` 同步抛同一个错误（写侧不再收活块），从 `pull()` 一路拒到
  消费者——流照样报错，只是失败点推到"这位真的需要介质"处（源不再交块
  时与健康状态一样等，不额外抛）。dump 失败因此不等于整份前缀作废：
  接管的 L 条还在队列里，各拷贝按自己的播种位置读到底再拒。
- **门的成本（记录）**：过门 445–483ns/笔，对"命中即返回"153ns（整条读
  路径 ~3.0µs 对 ~2.6µs，约 −15%；promise 构造本身约 20ns）。为这 15%
  把判据落成两处、并把两侧错误检查搬进命中路径，不划算，故保持
  "判据只写一处"。终局也不单列分支：放行写成单循环
  `position < 水位 + 队列 || isTerminal`，一处 `delete` + `resolve`，
  让"放行点只有一处"一眼可见。`I.SETTLE` 首行空表早返回。刻度出处：
  `logs/probe-wait-cost.mjs`。
- **纯内部对象**：实例由分发器私有持有，**不开观察面**——要看就进
  调试器按符号表读成员（`I.PENDING_CHUNKS` / `I.PENDING_BYTE_LENGTH` /
  `I.WRITTEN_CHUNK_COUNT` / `I.WAITING_POSITION_TABLE` / `I.DRAINING` /
  `I.DRAINING_ERROR` / `I.DONE` / `I.DROPPED` / `I.PREPARING` /
  `I.PREPARING_ERROR`）。
  读口是 getter：
  `prepared` / `done` / `dropped` / `pendingByteLength`；两组错误态合成的
  那一个走私有 `I.ERROR`（不外露），其余交互
  全走 `$I` 原语。
- **积压计数 `I.PENDING_BYTE_LENGTH` / `get pendingByteLength`**：只数
  **切换之后新堆上去、还没落盘**的字节（`$I.WRITE` 加、drain 每写一笔减、
  `$I.DROP` 归零）；**交接过来那份不算**——它本来就在阈值附近，算进去等于
  每次正常降级都误报一次。它是“写侧落后了多少”的度量，也是宿主的积压信号。
- 实例与 `ChunkStash` 1:1，因此状态就是普通字段，不需要 WeakMap /
  WeakSet 按 stash 键控。抽象钩子 `_I.DUMP` / `_I.WRITE` / `_I.DROP` 由下游
  实现，静态侧 `_S.PARSE_ARGUMENTS` 基类已给恒等实现（覆盖可选；入参是整份
  参数数组而非摊平，receiver 是写侧类，预置构造参数时经它归一）。
- 完成标志 `$I.SET_DONE()` / `get done` 与 stash 侧 `$I.SET_DONE()` /
  `done` 同形（连分层也一致），但落点换人：降级相位的落点交接记在
  transferrer 上（源已尽那一趟拉取由 agent 同步置位）。它不只置位——
  还结算门："该位永不会有块"正是由它冻结的终值算出来的。
- **配对**：写侧**类**由降级读器家族声明（`_S.TRANSFERRER_CTOR`，
  基类静态抽象）；分发器在降级时构造实例、立刻把**自己**挂上去
  （元件的 `$I.SET_DISTRIBUTOR`，三个宿主成员的就地报告靠它）、再持有
  （`$I.TRANSFERRER`）、
  再交接给各拷贝的新读取器。实例与 `ChunkStash` 1:1，因此不需要
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
- **预取深度是一个选项**（`ForkedReadableStreamHighWaterMark`，默认 `1`，
  2026-09-21 落）：构造时读一次，作为 `ReadableStream` 的**第二参数**（排队
  长策）——不能塞进第一个参数（那是 underlying source，塞进去等于没设；
  实测踩过这个坑）。
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

- 内部协作类：平铺字段、普通方法名，不带符号表；由分发器构造并持有在受保护字段
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
- **不做二次包装**（2026-09-28 定）：数据面的承诺是“让拒绝沿自然路径走到
  消费方”，所以消费方拿到的是宿主抛出的那个对象本身——源读取器与流面那
  两处 catch 都用 `Ow.throw`（它本身就是 `throw any`），中间的
  `settlePulling()` 只有 `try` / `finally`。实测
  `logs/probe-source-error-identity.mjs`：三个拷贝 + `for await` 拒的
  都是同一个对象，warn 载荷同一个，框架不添任何自有属性、不设 `cause`，
  非 `Error` 抛值同样保真。
- **构造器抛的后果**（2026-09-26 定）：它落在某一趟 pull 里 ⇒ 那趟 pull
  失败（异常照旧到读侧，无事件），而 `$I.TRANSFERRER` 未落位 ⇒
  `degraded` 仍 `false`，下一趟 pull 照旧重试切换（不锁死）。
- **报告点跟着发生处**（2026-09-26）：降级读者的四个宿主模板成员在**调用
  现场**派事件，派发器就是分发器（读器构造时就拿到了它）：
  `_I.INITIALIZE` → `degraded-reader-initialize-failed` ·
  `_I.SEEK` → `degraded-reader-seek-failed` ·
  `_I.READ` → `degraded-reader-read-failed` ·
  `_I.CLOSE` → `degraded-reader-close-failed`
  （同步抛也经 promise 转手）。前三个**报完照旧抛出**（控制流不变）；后一个
  是即发即弃，只报不抛。源读取器同样：平台 `read()` 拒 → 它派
  `source-read-failed` 再原样抛出（那趟 pull 于是照旧失败）；
  平台 `cancel()` 拒 → 它派 `source-cancel-failed`，**只报不抛**（收摊面
  fail-soft）。**出口唯一**（2026-09-26 收口）：以上所有 `warn` 都
  经分发器的受保护成员 `$I.WARN(code, payload)` 派发——出口一处，
  报告点仍各自在失败的发生处。
- **介质侧同样在发生处**（2026-09-26 收口，代派没有了）：转移器**构造后**
  被分发器挂上自己（元件的 `$I.SET_DISTRIBUTOR`——构造器收的是宿主参数，
  塞不进分发器），于是三个宿主模板成员各自就地上报：
  `_I.DUMP` → `transferrer-dump-failed`（载荷是**宿主原始因**；用尽后闩在
  `I.PREPARING_ERROR`，此后由 `$I.WRITE` / `$I.WAIT_POSITION` 原样抛出，没有
  包装）· `_I.WRITE` → `transferrer-write-failed`（闩住后仍会在后续每趟
  pull 里由 `$I.WRITE` 同步抛，同样原样）· `_I.DROP` →
  `transferrer-drop-failed` 后只报不抛（收摊面 fail-soft）。
- **重复上报不去抖**：与 `transferrer-backlog` 同族——一个因（dump 被拒）可以让
  每个降级 reader 各派一条（重试则各派多条）
  `degraded-reader-initialize-failed`。水准信号，限频归宿主。
- **计数由分发器记**（2026-09-29 定）：`$I.WARN` 是唯一出口，也是唯一计数点
  ——先记数、再派发，所以监听器里 `getWarningCount(code)` 读到的次数**含
  当前这一条**（宿主“第 N 次之后再动作”的策略才写得成立）；未报过的 code 返回
  `0`；不在 `CODE_LIST` 里的 code 抛 `TypeError`（运行期校验；类型层面另有
  `WarnPayloadMap` 兜住）。code 词汇表在 `Warning.mjs` 里按发生处分层
  （`CODES`），再扁平化成 `CODE_LIST`：既预制计数表的 key，也兼做
  `getWarningCount` 的合法性判据。
- **漏斗唯一**：所有内向失败统一从拷贝流的 `read()` 抛出并拒该拷贝（监听器
  抛不在此列，已实测）。
- **谁持有那份数据，决定谁亲自重试**（2026-09-29 定）：框架只在「它仍持有
  那份数据 + 失败发生在队尾」或「这一步本身无状态、可安全重放」的操作上
  亲自重试（后者只有读器初始化）——`_I.DUMP` 时字节在 stash
  快照、`_I.WRITE` 时块还在 `PENDING_CHUNKS`，重试是**重放同一份数据**；
  用尽即封存，前缀照旧经 `PEEK` 交付（尾断而头不断 ⇒ 渐进降级）。
  `_I.SEEK` / `_I.READ` 不满足：块一写成功即卸货 ⇒ 介质是**唯一副本**，
  游标又只有宿主知道（`SEEKED_COUNT` 只是镜像，没有绝对定位原语可从
  "未知推进"里回退），失败还落在**消费点**（头）——重试不是重放，是再赌
  一次，赌输即静默丢块。**别用"账本在谁手里"这条推**：`_I.WRITE` 抛时
  可能已半写进介质，写侧的账同样不在框架手里（2026-09-29 试过，被否）。
- **四个模板成员共享一条契约**（同日定）：抛出 ⇒ 这一笔**没发生**（字节
  没落、游标没动）。dump / drain 的两次重试立在这条宿主义务上；违约的代价
  是介质侧错位或残迹，**框架检测不到**。能自证"位置无关"的宿主，就该在
  自己的成员内部吞掉重来。
- **启动期不动介质的"门"在读回**（2026-09-29 定）：`I.INITIALIZED` 全仓只在
  `I.READ_BACK` 开头被 await，而 `READ_BACK` 只在 `PEEK` 未命中时才进得来
  ⇒ 队列还攥着的那些位，读路径既不碰介质、也不等 `prepared`、也不受寻道
  影响；分发器那侧再用 `.catch(noop)` 兜住初始化失败
  （`Distributor/Abstract.mjs`），于是"初始化失败"只体现为一条 warn 与
  将来那次真要用介质的读被拒。谁要是把 `await this[I.INITIALIZED]` 提到
  读路径开头，等于把整条队列交付一起拖进介质域——这是契约性质，不是实现
  细节。

## 术语

- seek = 寻道（光驱磁头找道，游标跨边界）；seed = 播种（给 `CONSUMED_CHUNK_COUNT`
  初值）——不同词，不混用。
- 读回（read back）= 降级 reader 从**真实介质**里取块的行为（家族侧
  `I.READ_BACK()`）：`_I.READ` 交出介质侧游标上那一条。从队列交付的那几笔
  不算读回（没碰介质）；定位（`_I.SEEK` 跨边界）也不取货，它是读回前的
  归位。这个名字对着 write-back：入队即返回是回写，没命中缓冲时就把块
  **读回**来。
- 内存→磁盘阶段切换称“降级（degraded）”。

## 决策日志（演进 · 按时间追加）

> 不稳定、演进中的决策先在此按时间（`### YYYY-MM-DD`）追加，保留
> 来龙去脉；一旦收敛为确定结论，不定期执行"结论压缩"——并入上方
> 对应主题的"当前有效结论"，并从本节移除。

### 2026-10-01

新增第二个介质包 `packages/degraded/temporary-file`
（`@produck/fugue-degraded-temporary-file`），建在
`degraded/node-file` 之上——

- **继承不重写**：`TemporaryFileTransferrer extends FileTransferrer` 只在
  构造器里现取名，并把 `_S.PARSE_ARGUMENTS` 答成空数组；
  `TemporaryFileChunkReader` 只把 `_S.TRANSFERRER_CTOR` 的 getter 指向自家
  写侧。帧格式、显式偏移、"释放即删" 全是父类的。
- **取名**：静态 `generateFileName()`，默认 `fugue-<uuid>.tmp`（`os.tmpdir()` +
  全局 `crypto` 的 `randomUUID`）——并发不撞名，名字里还带着产品名；不建私有
  目录，于是释放后一点痕迹不留（文件由父类的释放删掉）。构造器读的是
  `new.target.generateFileName()`，所以子类重载命名器即生效，不必另给参数。
- **命名器要过闸**：命名器的返回值必须是**临时目录内的一个路径**——非绝对、
  不靠 `..` 爬出去（拿 `path.relative` 量一次）；**落到临时目录本身上也算错**
  （`''` / `.` / `a/..` 都会拼成目录本身）。两种情形都抛
  `ThrowTypeError('generateFileName() as name', …)`：前者答 `relative path`，
  后者答 `path inside the temporary directory`。
- **别处放盘请用 node-file**：临时介质不让宿主借名字把 spool 放到临时目录
  之外，也就堵掉了"绕开临时目录机制"这条路。
- **参数与构造器对应（2026-10-01 定）**：构造器不收参数 ⇒ 钩子答 `[]`。
  于是**宿王不必**调 `setTransferrerArgs()`（框架给 `TRANSFERRER_ARGS` 的初值
  就是 `[]`）；调了也照旧。钩子**必须是方法**：框架在 `Abstract.mjs:137`
  是 `…[SYM](args)`，写成 getter 返回数组会当场撞 `is not a function`
  （实测）。换名字有口子（`generateFileName()`）；换目录没有——要就自己派生。
- **入口给出通用对**：`ChunkReader` / `Transferrer` 两个别名与
  `degraded/<kind>` 布局配套（`node-file` 也补了），换介质只换包名。
- **依赖方向**：`temporary-file` → `node-file` → `main`，不反向。

**产品名定为 `fugue`**（同一天，单独一条）：

- **判据是用户给的**：分配类词都暗示“把主流按比例切分”（守恒）；而这个
  框架做的是**非守恒复制**——每次交付都是**从第 0 字节起的完整一份**，
  介质里却只存一份（“同一份材料被完整重演 N 次”）。据此排除水／管路族：
  `delta`（还撞“差分”）`manifold` `plenum` `distributary`（与类名
  `Distributor` 读音太近）`aqueduct` `irrigation`。
- **选中的意象**：“每个声部都奏**完整**主题、先后进入、互不等待”，
  再加词源 _fuga_ = 逃／追 → “前追后赶，各自距离”。
- **范围**：只换**产品名**（包名 `@produck/fugue` /
  `-degraded-node-file` / `-degraded-temporary-file`）；**类名不动**——
  `Distributor` / `Transferrer` / `DegradedChunkReader` 是**角色名**，
  契约语言都建在它们上面。
- **下游约定**：核心包一律 `import * as Fugue from '@produck/fugue'`
  （原来的 `Core` 别名退役；本仓的 `test/` 也跟着换，因为测试走的就是
  消费者面）。介质包保留自家别名（`NodeFile` / `TemporaryFile`）。
- **仓名同日跟上**：GitHub 仓库同日改为 `produck/fugue`，于是三个包的
  `repository.url` / `bugs` / `homepage`、本地 `origin` 与根 README 的标题
  一起改过来；仓内不再出现旧名。

**核心包一律走 `Fugue` 命名空间**（同一天）：

- 全仓（`src/`、`test/`、示例、README）对 `@produck/fugue` 只写
  `import * as Fugue from '@produck/fugue'`，用到的成员一律写全路径——
  `Fugue.Distributor`、`Fugue.Options.Tune.MaxStashByteLength(…)`、
  `Fugue.SYMBOL.TRANSFERRER._I.DUMP`。理由是**下游抄的就是这一段**：
  示例、测试、手册读起来要和使用现场一模一样。
- **唯一的解构例外是符号槽**：`const { _I: X } = Fugue.SYMBOL.<家族>;`
  保留，因为契约就是让介质在自己的模块顶部解构一次。
- **介质包自家入口不套 `Fugue`**：自家包按自己的名字导入
  （`import * as NodeFile from '@produck/fugue-degraded-node-file'`），
  或按需具名导入。
- 两个误伤处一并纠回：`DESIGN.md` 里被换行折断的旧包名，以及
  `fork.test.mjs` 中被误加重前缀的正则字面量——**期望报文里的类名**
  （`/Distributor has been terminated/`）是运行时字符串，不是引用。

**`Options.Tune` / `Options.Get` 的声明对齐运行时**（同日，探针发现）：

- 运行时的键就是选项名本身（`Accessor.mjs` 里 `_Tune[name]` / `_Get[name]`；
  `tune*` / `get*` 只是函数名），而 `index.d.ts` 把键映射成
  `` `tune${Name}` `` / `` `get${Name}` ``——TS 用户照 README 写会编译不过。
- 两处映射改成裸 `Name`，消费者探针（`tsc --noEmit`）正反验证通过：
  `Tune.MaxStashByteLength(distributor, value)`、
  `Get.MaxStashByteLength(distributor)`、`Asset.noRetry(distributor)`。

### 2026-10-05

**写侧补上"就绪"这一步**（`_I.INITIALIZE`）：为"`_I.DUMP` 可以省掉"铺路。

- **问题**：`_I.DUMP` 一直兼职两件事——"让介质就绪"与"批量写整份"。
  `node-file` 的 `open(pathname, 'w')` 就藏在它的头几行里，而 `_I.WRITE`
  只写不备。于是"只实现 `_I.WRITE` + `_I.DROP`"的介质永远没人替它打开，
  第一次写就撞 `null.write()`。读侧早有第一等的 `_I.INITIALIZE`（自带预算
  与报文），写侧没有——不对称就在这里。
- **定案**：写侧加 `_I.INITIALIZE()`，**基类默认空实现**（没有就绪动作的
  介质不必写它）；框架在**首次 dump 尝试**里先跑一次，`I.INITIALIZED`
  闩住，成功即不再重跑——否则 `open('w')` 会在重试时截断已落盘的前缀。
- **有自己的预算与报文（同日改，按 B）**：`MaxTransferrerInitializeRetryCount`
  / `TransferrerInitializeRetryInterval` 与 `transferrer-initialize-failed`。
  两段**串行**（就绪段跑完才进 dump 段），所以预算不叠乘；读侧那对
  （`MaxInitializeRetryCount`）管的是拷贝的初始化，两者互不影响。代价是
  Options 从 10 项到 12 项、warn 词表 +1，宿主若已按 dump 预算调
  "介质打不开"要换口径。
- **Asset 预设必须跟着长**：`Asset.mjs` 是**逐个列名**的，新预算漏掉时
  `noRetry` 不会归零它——介质一直拒就变自旋（实测：`warn.test.mjs`
  跑到最后一条用例仍不退进程，exit 124）。已补
  `noTransferrerInitializeRetry` / `unlimitedTransferrerInitializeRetry`，
  `noRetry` / `unlimitedRetry` 覆盖四对；`options.test.mjs` 的清单测试与
  Asset 用例都把新预算钉住了。
- **释放竞态**：就绪在途时释放落地，框架放弃这次尝试（不报错、不写），
  介质在自己成员里收拾句柄（`node-file` 照 `FileChunkReader` 的写法做，
  带 `c8 ignore`）；`_I.DUMP` 里原来那道"开完发现已被放开"的守卫随就绪
  一起搬家。
- **介质侧同步**：`FileTransferrer` 的 `_I.DUMP` 现在只拼接 + 写（不再
  `open`），`_I.INITIALIZE` 才是开文件的地方；`_I.WRITE` 一个字没改。
- **仍未做**：`_I.DUMP` 的默认实现（逐 chunk 走写侧）。就绪问题已解，但还
  差记账分叉——`I.DUMP` 成功分支的 `splice(0, length)` + 水位一次推满只对
  "一次性写完整份"成立，逐 chunk 路径得让队列自己记（含队列归属与重试
  预算归属两条，见 `TODO.md`）。

**概念合并：initialize + dump = prepare 阶段**（同日，命名收口）：

- 一个动作被拆成"就绪 + 交付"两段之后，外面需要一个词指代"这一整趟"。
  定名 **prepare**：`$I.PREPARE(stash)` 是这趟的同步入口（内涵与旧的
  `$I.DUMP` 一致：接管块列表、返回 Promise、失败闩错），`I.PREPARE` 是本体
  （就绪段 + 交付段），`I.PREPARING` / `I.PREPARING_ERROR` 是它的在途与
  错误位；`I.DUMPING_ERROR` 两名合一，因为两段都闩在这一位。
- **`_I` 侧一个名字都不动**：`INITIALIZE` / `DUMP` / `WRITE` / `DROP` 是
  **阶段名**，宿主按阶段实现；概念合并只发生在框架内部与公开观察面上。
- **公开面一并改名**：`get dumping` → `get preparing`（它返回的那趟已经不
  只是 dump）。0.0.0 阶段，破坏性可接受。

**`Asset` → `Preset`**（同日，命名收口）：

- 理由：`Preset` 说的正是它干的事——显性、逐个列名地把若干最细粒度的
  `Tune` 重新映射成语义预设；`Asset` 是个空词。
- **合并粒度只在这里合法**：`Options` 侧保持最细粒度、每项一个无歧义的
  名字，**不许为了列宽之类的理由在 `Options` 侧合并**；要合并粒度就写成
  preset，那是显式且互不冲突的入口。
- 代价：公开面改名（`Fugue.Options.Preset`、d.ts 的 `Preset` /
  `PresetName`、文件 `Options/Preset.mjs`），13 个文件；preset 函数名
  （`noRetry` / `unlimitedDumpRetry` …）不含旧词，一个都没动。
- **历史条目不改名**：本文档 2026-10-05 早前两条里的 `Asset` 是当时的
  名字，原样保留。

**选项命名收口：公开名最完整，模块内短名**（同日）：

- `Items.mjs` 的 12 个键一律改成**最完整无歧义**的形式——域前缀
  （`ChunkStash` / `ChunkReader` / `Transferrer`）+ 阶段 + 语义。旧名里
  `MaxStashByteLength`、读侧与写侧两对 `MaxInitializeRetryCount`、
  `MaxDumpRetryCount`、`MaxDrainRetryCount` 都缺域前缀，两侧的 initialize
  只能靠猜；唯一漏网的 `DumpRetryInterval` 一并补成
  `TransferrerDumpRetryInterval`（同一对里另一个早有前缀）。
- **粒度不合并**：`Options` 侧一项一个名字；要合并粒度就写成 preset。
  列宽不够是文档的问题（README 的 Options 表去掉了 `Read` 列，读取时机
  并入下面每条 bullet），不是把名字改短的理由。
- **模块内短名**：每个消费模块自带 `Options.mjs`——
  `Transferrer/Options.mjs`（就绪 / dump / drain 三对 + 积压告警）与
  `DegradedChunkReader/Options.mjs`（读侧就绪一对），把长名收成
  `getMaxInitializeRetryCount(distributor)` 这样的本地名；模块只 import
  它，公开面与文档只认长名。
- **preset 名跟着对齐**：读侧那对本来没所有者（`noInitializeRetry` /
  `unlimitedInitializeRetry`），与写侧 `noTransferrerInitializeRetry`
  不对称，改成 `noChunkReaderInitializeRetry` /
  `unlimitedChunkReaderInitializeRetry`。
- **四对全对齐（同日）**：dump / drain 那两对也补上所有者
  （`noTransferrerDumpRetry` / `noTransferrerDrainRetry`，以及对应的两个
  unlimited）——preset 名从此一律“所有者 + 阶段 + 语义”，只有聚合的
  `noRetry` / `unlimitedRetry` 不带所有者，因为它们管的是全部四个。
- **仍未做**：`ForkHighWaterMark` 的域前缀是 `Fork`，而其它项用的都是类名
  （`ForkedReadableStream` 才是类）；`SourceConsumptionAgent.mjs` 与
  `ForkedReadableStream/Concrete.mjs` 两处仍在直接读公开长名。

**降级探针的那项改为每趟 pull 都读**（同日）：

- 起因：条件块里塞着 `Options.Get.DegradeOnChunkStashFullAndDone(...)`，
  两个判据都得折行；改成各取一个本地名（`stashLimit` / `should`）之后，
  条件块只剩比较。
- **读取时机是契约**，所以顺手把第二项从“越限且到头才读”改成“每趟 pull
  都读”，三处一起动：`Items.mjs` 的注释、`Options.test.mjs` 的两条用例
  （合并成“每趟 pull 读数 = 块数 + 1”）、本文件上面那条结论。
- 副作用：每趟 pull 多一次取值器调用；切换决定不变（越限就切，只有
  “越限 + 到头 + 选项为假”才留在内存）。
- **仍未做**：该项的本地名只能用 11 个字符以内——
  `DegradeOnChunkStashFullAndDone` 加 `Options.Get.` 就吃掉 43 列，要更长
  就得给这个模块也加本地门面。

**公开 getter `preparing` → `prepared`**（同日，取名收口）：

- 理由：内部在途是运行时语义（进行态），对外观测该是完成态——公开面上
  只有它一个现在分词（`done` / `dropped` / `closed` / `degraded` /
  `terminated` / `cancelled` / `finished` 全是完成态）。WHATWG 同形：
  `reader.closed` / `writer.closed` 都是 Promise，名字却是完成态。
- **只改公开面**：`I.PREPARING` / `I.PREPARING_ERROR` 一个字不动（内部
  运行时语义）。
- **名字与保证之间的缺口写明**：WHATWG 的 `closed` 失败会 reject，我们
  这颗不会——介质失败闩进 `I.PREPARING_ERROR`，`await prepared` 照样
  fulfilled。d.ts 与 README 各写了一句，不把 fulfilled 说成“介质已就绪”。
- **仍未做**：要让名字名副其实就得让它 reject（变成状态承诺），那会改失败
  归属（读器初始化会提前抛）并动 `EXCEPTIONS.md`。

**`ForkHighWaterMark` → `ForkedReadableStreamHighWaterMark`**（同日，收口）：

- 上面那条“仍未做”落地：域前缀改用**类名**（`ForkedReadableStream`），
  与 `ChunkStash` / `ChunkReader` / `Transferrer` 一致——旧里 `Fork` 既不是
  类也不是目录。
- 新增 `ForkedReadableStream/Options.mjs` 本地门面（`getHighWaterMark`），
  构造器只 import 它；至此三个消费模块（Transferrer / DegradedChunkReader
  / ForkedReadableStream）走同一套“公开长名 + 模块内短名”。
- **仍未做**：`SourceConsumptionAgent.mjs` 那两处仍在直接读公开长名——它是
  单文件模块，门面只能落在 `Distributor/` 下，而那里已有公开的 `Options/`
  目录，同名邻居容易混，要做建议叫 `_Options.mjs`。
