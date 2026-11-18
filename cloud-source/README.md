# 瘤度俱乐部：云端共享版本

保持原三个页面、13张头像和全部计分规则。源网页在 source-web，业务数学不变；后端改为Cloudflare Worker，共享数据在绑定BUCKET的R2对象中，通过ETag条件写入防并发覆盖。

本机原版及 data/state.json 不变。本次准备时本机已提交人数为0，因此云端以13张初始头像初始化新共享实例，不迁移浏览器会话凭据。

构建：`node build.mjs`；测试：`node --test test.mjs password.test.mjs source-web/test.mjs`。

数据接口与网页一致，额外 `/api/health` 检查配置、`/api/settle` 只执行已经到期日期的幂等补算并返回日期，不接受任意日期或分值参数。所有读取/写入均可补算，保存版本使补算按各日23:59时点重建，不能用当前分配倒填历史。

部署入口 dist/server/index.js，绑定配置在 .openai/hosting.json。定时结算已由用户Cloudflare账号的原生Cron每天北京时间23:59直接调用原站/api/settle；旧GPT任务已暂停。不依赖Render入口、Codex、GPT或用户电脑。首次实际Cron执行的日志核验与配置核验需分别记录。

公网访问需要该站点访问模式为 public。默认私有站点不能直接给群友免登录访问。访问模式和实际URL以部署后核对结果为准。

当前使用24个固定姓名账号（名单在worker/index.mjs的NAMES中，含张继元）。首次POST /api/login发送{action:"register",name,password}注册，之后{action:"login",name,password}登录；action省略时仍为密码登录，不会自动注册。每名只可注册一次，密码8～128字符，服务端用随机盐PBKDF2-SHA256摘要存入R2的passwordAccounts，绝不保存明文。用户明确接受先到先注册的抢注风险，不设置注册码或本人核验。没有密码找回入口。

旧accounts免密令牌保留存储但完全不再鉴权，旧会话全部失效。密码验证后设置新的HttpOnly/Secure/SameSite Cookie；未登录不能读榜、方案或评分/上传。连续5次密码错误后该账号暂锁15分钟，成功登录清除错误记录。账号仍为name:姓名，多设备共用同一评分者和最新方案；同名不重复计人数。/api/logout仅清除本机Cookie，不删除评分或退出其他设备。公开列表只含公开方案，passwordAccounts、密码摘要、令牌和原始R2对象不对外返回。

每个账号每天最多成功提交5次分配，首次也计次，按北京时间日期于零点重置。配额在同一个R2条件事务中检查和追加记录，换设备、退出重登和并发请求均不能超额。无效提交不扣次数，公开/隐藏单独切换不计次；新版本以kind=allocation和kind=visibility区分。升级前记录不倒扣当天配额，也不删除旧分配。GET /api/state的dailyLimit返回date/limit/used/remaining；页面展示余量并在耗尽后禁用提交，服务端仍强制拦截第6次。

原始versions/users/targets/days保留。旧浏览器记录中与名单完全同名的评分，在计算视图按姓名合并，采用最后一次提交；其他旧匿名记录保留在存储但不参与新账号榜单。已经保存的每日结果不回改。此次上线前核对云端已提交人数为0，初始13头像，无历史结算记录。

当前共享状态以一个R2 JSON对象存放，适合本次几十人规模；如规模或历史数据明显增长，应迁移数据库和分页接口。持续云端调度及跨运营商手机访问需分别验证，不因本地测试通过而宣称成功。

## 仅站主后台查询

GET /api/owner/allocations 只接受X-Liudu-Owner-Key请求头，值必须匹配后台Secret环境变量LIUDU_OWNER_READ_KEY。普通评分Cookie、姓名和密码、伪造平台身份头均不授予该权限。此端点只执行单次R2读取，不调用结算、登录或写入，不返回密码摘要、盐、令牌或原始状态。返回24名当前方案、公开状态、最近分配及记录时间和头像映射。旧版未标记记录时间注明legacy_record，不能保证为独立分配提交时间。

密钥不放网页、源码、公开GitHub、URL查询参数或交接包。站主通过Sites管理权限配置Secret并部署版本后生效。Secret读取被屏蔽；将来通过Codex查询时可重新生成密钥、更新该Secret并重新部署当前保存版本，再在会话内携带密钥查询。不会依赖群友密码，也不改变普通用户身份。没有提供公共管理员页面或将“张继元”姓名自动提升为管理员。修改权限需要站主明确指示。

2026-11-18定向维护：POST /api/owner/reset-compromised-20261118仅接受独立Secret LIUDU_ACCOUNT_RESET_KEY及X-Liudu-Reset-Key，且名单只能恰好为张子豪、周文博、吴日成。操作ID固定，R2条件事务内只执行一次；清除三人的当前分配、全部旧身份会话、注册及登录失败状态，旧分配归档于不可公开读取的ownerAccountResets，冻结日历史和其他账号不改。GET仅返回三人注册/提交状态，不返回密码或令牌。完成后移除维护Secret并重新部署，使维护接口失效；不会增加普通用户删除功能。
