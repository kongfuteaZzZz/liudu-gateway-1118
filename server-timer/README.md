# 瘤度服务器定时器（已部署）

当前状态（2026-11-18）：已部署到用户Cloudflare账号306156a12a4ea155c40365f6122dc41e，Worker名liudu-daily-settlement，版本9741c4ac-34ac-460e-88f1-4dfcade7c3ff。原生Cron配置已读取核对；原ChatGPT每日任务已由用户暂停，并通过Sites核对is_enabled=false。Wrangler授权已撤销，whoami确认未登录。定时器继续独立运行，不依赖部署工具登录。

7项本地测试通过；同一处理函数在Cloudflare远端预览测试返回HTTP200。首次真实每日23:59尚未发生，不能将预览测试称为每日Cron实跑。详见verification.json、cloud-deployment-verification.json和cloud-runtime-verification.json。截图cloudflare-cron.jpg中的59 15按UTC计，即北京时间23:59。

此Worker每天北京时间23:59请求现有正式网站的/api/settle。网站及R2数据不迁移，24个姓名账号和头像不变。不调用GPT、不需要本机开机、不传参与者Cookie、不创建投票。它是独立的原生Cloudflare Cron Trigger，不是Sites关联的AI任务。

## 账号注册

1. 打开 https://dash.cloudflare.com/sign-up ，用自己的邮箱和密码创建账号。
2. 打开Cloudflare发来的验证邮件，完成邮箱验证并登录。
3. 进入Workers & Pages；此方案不需要添加域名或购买域名。若向导要求导入网站，先返回控制台，进入Workers & Pages。
4. 登录完成后继续部署；不要在对话里发送密码、验证码或Global API Key。

官方注册说明：https://developers.cloudflare.com/fundamentals/account/create-account/

## 部署内容

- worker.mjs：可直接粘贴到Cloudflare的Worker编辑器。
- wrangler.jsonc：声明原生Cron，`59 15 * * *`（UTC）对应每天北京时间23:59。关闭workers.dev及预览HTTP路由；该Worker没有公开HTTP处理器。
- test.mjs：不联网的7项测试。

若使用控制台：创建名为liudu-daily-settlement的Worker，粘贴worker.mjs并部署；在Settings > Triggers > Cron Triggers添加`59 15 * * *`。核对控制台显示的时区为UTC。关闭该Worker的HTTP访问路由，开启日志。不要给原正式网站修改域名、DNS或访问权限。

若已安装并登录Wrangler：在此目录执行`wrangler deploy --config wrangler.jsonc`。配置文件中无账号密钥。配置变更可能需要最多15分钟传播。

## 切换和验收

1. 在用户自己的账号部署，并读取确认已发布代码及Cron确为`59 15 * * *`。
2. 在Cloudflare触发一次测试并核对日志、现有网站结算接口响应。23:59前的人工测试只确认连接正常，不会预生成尚未到期的记录；日志verifiedDate为null。
3. 确认新定时器已配置且实际测试成功后，暂停原ChatGPT任务Automation_b75d38f44c0c8191863be60d1d8932c7；不要提前删除或停用。
4. 首次真实23:59后，核对Cloudflare日志和网站当天历史。定时触发可能延迟，但计分始终按北京时间23:59的历史版本，不使用触发时的当前分数倒填。

结算接口本身具备幂等和补算，重复触发不会重复发积分；一次网络失败会在Cloudflare中报错，之后网站访问或下一次触发可补算。

本地测试：`node --test test.mjs`。Wrangler4.163.0及缓存安装在D盘work/cloudflare-tools，已注销，不打包其依赖或授权文件。没有启动本机后台定时任务，也没有修改现有Sites源码或原始评分数据。

兼容性注意：Cloudflare的fetch不支持redirect:error，使用manual并对非2xx返回报错，不跟随重定向。compatibility_date使用已到达的UTC日期2026-11-17，业务日和每天23:59始终按Asia/Shanghai。

官方Cron说明：https://developers.cloudflare.com/workers/configuration/cron-triggers/
