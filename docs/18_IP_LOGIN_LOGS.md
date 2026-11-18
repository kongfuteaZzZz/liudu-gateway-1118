# 每日 IP 绑定与站主操作日志

2026-11-18 用户确认：同一公网 IP 当天仅能登录一个姓名账号，北京时间次日零点重置。采用 IP HMAC，不采集浏览器指纹。账号原有每日5次提交上限独立生效。

## 行为

- 注册或密码登录成功才占用当天 IP；错误密码、名单外姓名、无效注册不占用。
- 退出、清 Cookie、无痕窗口不解除绑定。旧会话首次请求也绑定，后续读取和评分写入都检查；R2 CAS 事务防止并发切换。
- 零点按服务器北京时间日期逻辑重置，不依赖定时任务、电脑或 Codex 在线。
- IP 代表公网出口，并不代表自然人；同一 Wi-Fi、宿舍、校园网或运营商 NAT 下多人可能互相限制，更换网络、VPN 或 IPv6 地址仍可能绕过。不承诺识别实际本人。
- 既有分配、密码、每日次数与23:59结算规则不因开启本功能而清除。

## 信任边界与部署

Render 入口当前通过 Cloudflare 边缘接入，只使用边缘覆盖的 CF-Connecting-IP，拒绝缺失/非法 IP；不信任可能被客户端拼接的 X-Forwarded-For。IPv4/IPv6 规范化，同一 IPv4 的 IPv4-mapped IPv6 归一。

网关配置 Secret `LIUDU_IP_PROXY_KEY`（至少32字符）。网关使用 HMAC-SHA256('ip-v1\\n'+IP) 生成 IP 摘要，只向源站转发摘要，并签名时间、HTTP方法、完整路径、摘要、请求体SHA256和会话Cookie SHA256。源站校验共享密钥、签名和5分钟时效；不能重用签名更改账号、正文、会话或地址。明文 IP 不写入应用状态/日志，密钥不进入仓库或浏览器页面。

源站配置同名 Secret，并设置 `LIUDU_IP_ENFORCE=true` 后强制验证参与者 API。直接使用旧源站地址登录或伪造头不能绕过；页面提示使用群内 Render 入口。`/api/health`、`/api/settle`、站主只读及固定历史维护端点仍各自独立鉴权或执行原有逻辑。原生23:59定时器不受影响。

先部署有签名密钥的网关，再部署启用源站限制的版本；不同端密钥不一致会拒绝参与者请求。停用仅是应急回滚，不能把未开启强制验证描述为功能已上线。生产与 GitHub 分别核对。

## 站主日志

`GET /api/owner/logs` 只接受 `X-Liudu-Owner-Key` 与 `LIUDU_OWNER_READ_KEY` 匹配。继续由站主在 Codex 中查询；普通姓名（包括张继元）、Cookie、密码和伪造平台身份头均没有该权限。网关不代理站主接口。

只读返回 capturedAt、timezone、retentionDays、maxEvents、events。每条包含 id、time、date、name、action、result、ipHash。记录注册/登录成败、旧会话首日绑定与冲突、评分提交及拒绝；名单外名字不保存原文。滚动保留最近30天、最多2000条，下一次事务（包括原生结算）时清理；读取时也过滤过期项。不保存明文IP、浏览器指纹、密码、密码摘要、会话Cookie、分配内容或密钥。此为应用日志，不代表托管平台自身访问日志策略。

相同 ipHash 表示同一出口（在密钥不变时）；不能据此认定冒名者的实际身份。日志从功能启用时开始，无法追溯此前的 IP。站主查询不触发结算或任何写入。日志和原始运行数据不得同步 GitHub。

实现参考：[Render边缘接入与客户端IP](https://render.com/articles/how-render-handles-ddos-attacks)、[Cloudflare的CF-Connecting-IP定义](https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip)。网关不用X-Forwarded-For左端值作为安全身份依据。

## 生产部署核对（2026-11-18，北京时间）

网关已部署GitHub提交c85672153174223e042c4b93eec0113347d77d46，Render部署dep-dbupeu4ipgvc739kgt50，状态Live。源站源码a90386a7705fae131def5b6dc909929a6138f05c，Sites第9版appgprj_6afca8e1cb308191b53889466d55f73b~appgver_86db9c959fdc8191ae1c242ba8a687ea，部署appgdep_6afd97f2ee50819192b647ed637ce839成功，应用环境修订7。两端共享Secret已配置，源站强制IP校验已开启。

本地33项源站测试和7项网关测试通过，涵盖同IP切换、并发、零点、旧会话、失败密码不占用、日志清理、正文/路径/方法/Cookie篡改。线上已核对：健康检查启用IP校验；直接源站登录拒绝未签名请求；伪造X-Forwarded-For及业务签名头不会改变IP摘要；日志无密钥拒绝，有站主密钥可读。浏览器既有密码会话仍可打开榜单。线上只发送名单外无效登录测试，没有创建真实账号、提交评分或改变已有分配；生产未用他人密码测试账号切换，零点逻辑由隔离测试验证。

正常入口仍为 https://liudu-gateway-1118.onrender.com/ 。新源码推送不等于再次部署；文档后续提交可比生产网关提交更新，勿据此误报生产版本落后。
