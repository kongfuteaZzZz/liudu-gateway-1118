# 瘤度俱乐部

本仓库保存完整网站源码、初始静态头像、测试与部署配置。群内入口：https://liudu-gateway-1118.onrender.com/ 。

| 目录 | 用途 |
|---|---|
| 根目录 server.mjs、render.yaml | Render访问网关，保持原启动入口 |
| cloud-source/ | Sites源站：密码注册登录、100整数点分配、每天16:00及23:59结算完成后补足1次提交机会、排行、历史与站主只读查询 |
| server-timer/ | 独立Cloudflare原生Cron，北京时间每日23:59 |
| docs/ | 需求、计分、部署和权限说明；按文件日期与后续更新理解历史描述 |
| b4a0cbf20b78dbe8a5fbd27c3e9bc446.txt | 微信根目录验证文件 |

当前名单以张婧替换张子豪；张子豪禁止再次注册，新账号不继承旧评分，见docs/17_ROSTER_UPDATE.md。24个姓名是评分账号，初始13个头像是独立被评分对象；之后上传的头像只在运行数据中，不是初始资源。真实评分、私密查询报告、密码摘要、Cookie、R2状态和任何凭据均不在仓库中。

## 本地检查

先在cloud-source目录执行 node build.mjs 和 npm test；返回仓库根目录执行 npm test；在server-timer目录执行 node --test test.mjs。构建会生成仅用于运行的资源模块，不应提交生成文件或真实数据。

## 部署与后续同步

Render根目录继续使用node server.mjs，自动部署关闭；更新GitHub后需另行手动部署。Sites与Cloudflare定时器也各自独立部署，推送GitHub不能代替发布。Sites当前源码基线为f3d86da382a6dd5ae00f01ae81b292907130423b，网关当前已部署基线为282bdc75fbe30f7613590725927f5e9b1f998cb1。

用户要求以后每次更新均同步GitHub并核对远端提交，见AGENTS.md。原后台查询权限依赖仅站主管理的Secret；新增/owner.html和GET /api/allocations经用户明确授权仅张继元密码账号可读全部分配（含隐藏），不修改评分，见docs/19_BROWSER_OWNER_INSPECTION.md。源站保留一次性的定向维护代码，固定操作已执行并具有幂等保护；账号维护后续曾被用户暂停，不能仅因源码同步就再次调用维护写接口。新增每日IP绑定和站主日志，需网关LIUDU_IP_PROXY_KEY与源站同名Secret一致，并启用LIUDU_IP_ENFORCE=true，部署详情见docs/18_IP_LOGIN_LOGS.md。暂停的小程序工程未纳入本网站仓库。
