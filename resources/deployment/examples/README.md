# DRA 医院部署配置示例

统一候选包含机构 OAuth 连接、organization/audience 校验及独立命名档案。
随包的 `resources/dra-auth.json` 是生产占位，不是开发租户。占位符未替换或文件缺失时应用锁定。打包不代表医院 SSO 已配置或已通过真实登录。
生产示例中的 REPLACE 字段必须由机构管理员替换；客户端不保存 OAuth 客户端密钥。
使用 resources/profile-launcher.cmd 选择固定档案名；本地免登录使用 local- 前缀独立档案。
本地免登录不代表外部模型/检索离线，也不代表具有 Plus/Pro 会员授权。
同一 Windows 账号下的档案分离不是针对操作系统管理员的安全隔离。
不要用示例覆盖现有研究档案；部署前备份并完成真实身份/数据隔离验证。
