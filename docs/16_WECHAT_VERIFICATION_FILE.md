# 微信根目录TXT验证文件

2026-11-18，Asia/Shanghai。用户要求按微信团队页面截图在现有网站根目录部署验证文件；本次仅更新Render访问网关，不重新部署Sites源站，不恢复此前暂停的账号处理，也不添加IP限制。

- 文件名：b4a0cbf20b78dbe8a5fbd27c3e9bc446.txt
- 正文（无BOM、无额外换行，40个ASCII字符）：0de74c938711254c186a07bc0d15db9fb2ec7f3c
- 正式地址：https://liudu-gateway-1118.onrender.com/b4a0cbf20b78dbe8a5fbd27c3e9bc446.txt
- 网关从源码根目录的实际TXT文件直接返回text/plain，不要求姓名、密码、Cookie，不访问上游；仅放行这一条精确文件路径，不开放任意本地文件读取。
- GitHub提交：4a4faf04a2c0ba9b3607ebf44227cadda6ef64e5。公开仓库仅更新server.mjs和验证TXT文件，未上传私密评分报告、账号资料或密钥。
- Render服务：srv-dbudfpgm7kps73c36c80；部署dep-dbunc98m7kps73cure9g，控制台显示Deploy succeeded | Live；继续使用原免费实例，没有升级或新增收费服务。
- GitHub连接器写入返回403，用户在已打开网页登录后，通过GitHub网页上传；Render控制台手动部署最新提交。未扩大连接器权限。
- 5项本地网关测试通过。正式匿名GET/HEAD均200、正文逐字匹配且无跳转，原站密码与每日5次限制健康字段正常，见evidence/wechat-root-verification.json。

此结果仅证明验证文件已部署且可公开读取，不等于微信已验证通过或解除限制。微信申请页在用户手机上，最后需用户返回原页面点击“已部署，开始验证”；按页面提示在提交前保持页面打开。本轮未替用户提交证明材料、作出声明或确认审核结果。

网关源码已同步gateway-source。源站、评分、定时器和账号没有被本轮脚本修改。关于此前账号重置的暂停状态，不能根据本次网关部署推断已恢复、撤销或进一步操作。
