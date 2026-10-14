# DRA 用户账号接入

本实现接入 Auth0 Universal Login：邮箱注册、邮箱密码登录、邮箱验证、密码找回，以及 Google、Microsoft、Apple 登录。用户密码由认证服务处理。DRA 使用独立的账号，不要求用户提交 ChatGPT 密码，也不依赖 ChatGPT 订阅。

## 管理员配置

1. 在 Auth0 创建 **Native** 应用，启用 **Authorization Code** grant；使用 RS256 签名。应用没有 Client Secret 的使用需求。不要把 Client Secret 写入桌面应用。
2. 启用数据库连接，允许邮箱注册及密码找回，配置验证邮件发送服务。DRA 要求 ID Token 包含 `email`，且 `email_verified` 为 `true`；邮箱未验证时，研究界面保持锁定。可以在 Auth0 配置相应登录 Action、验证提醒和重新发送验证邮件入口。上述发送能力在 Auth0 配置，DRA 不发送邮件。
3. 在应用的 **Allowed Callback URLs** 添加 `http://127.0.0.1:49174/account/callback`。如果修改端口，两处必须保持一致。
4. 在 **Universal Login** 配置 DRA 名称、品牌、邮箱登录和注册页面。密码找回由该页面的“忘记密码”入口处理。
5. 为应用启用 Google、Microsoft（个人 Microsoft 账号）、Apple 连接，并配置各服务的正式 OAuth 凭据。若使用 Microsoft 企业 Entra ID 连接，应填入其真实 connection 名称。只有填写 connection 的第三方入口才会出现在 DRA 中；填写名称不能替代后台启用连接。
6. 启动 DRA 主进程前设置环境变量。这些是公开配置，不是密码：

```powershell
$env:DRA_AUTH_ISSUER = 'https://YOUR-TENANT.auth0.com/'
$env:DRA_AUTH_CLIENT_ID = 'YOUR-NATIVE-APP-CLIENT-ID'
$env:DRA_AUTH_CALLBACK_PORT = '49174'
$env:DRA_AUTH_GOOGLE_CONNECTION = 'google-oauth2'
$env:DRA_AUTH_MICROSOFT_CONNECTION = 'windowslive'
$env:DRA_AUTH_APPLE_CONNECTION = 'apple'
npm run dev
```

上面的环境变量是占位示例，只在未打包的开发构建中生效。打包后的应用忽略 `DRA_AUTH_*`，避免用环境变量关掉登录。

随包发布的 `resources/dra-auth.json` 是生产租户占位文件，不是可用的开发租户。所有者创建 Auth0 租户后，把 `REPLACE_WITH_*` 换成公开的 issuer、Native 应用 Client ID、API audience、organization 和连接名。不要写入 Client Secret、密码或令牌。占位符未替换、文件被删除、内容损坏或字段不完整时，应用锁定并要求配置，不会退回无限制本地模式。开发构建若要跳过登录，必须显式设置 `DRA_AUTH_MODE=local`。修改后重启生效。安装后手动替换的文件在升级后可能需要重新配置。

## 用户流程

从 0.1.18 起，登录后可在“账号 → 会员与套餐”查看 Free、Plus、Pro 和有效期。会员由管理员通过 Auth0 开通，定价为 Plus $20/月、Pro $100/月；支付稍后接入。部署与授权说明见 [dra-membership.md](dra-membership.md)。

- 配置账号服务后，启动先进入账号页面。邮箱注册打开系统浏览器的托管注册页面，登录成功后自动回到可使用的 DRA 状态；回调浏览器页可关闭。
- Google、Microsoft、Apple 按钮打开对应服务的登录流程。没有配置的入口不显示。
- 首页“账号”可查看当前邮箱及退出。退出会清除 DRA 内存会话；认证服务及浏览器的其他应用会话不受影响。再次登录要求新的登录流程。
- 登录请求最多等待五分钟，可取消。会话有效期取签名 ID Token 到期时间与八小时上限的较短值。到期需重新登录；重启 DRA 后也需重新登录。没有持久化 ID Token、Access Token 或 Refresh Token。
- 打包应用在账号配置缺失、被删除或仍是占位符时锁定，不能靠删掉 `dra-auth.json` 进入无限制本地模式。未打包的开发构建只有在显式 `DRA_AUTH_MODE=local` 时才跳过登录；部分填写或无效配置会锁定。

## 国外转移同意（APPI 第 28 条）

首次注册或登录前必须勾选同意。说明文从版本化文件 `resources/account-consent.json` 读取，当前内容是法务确认前的日文假文。正式文案由法务替换该文件，并提高 `version`。已保存的版本与文件版本不一致时，下次登录会重新要求勾选。

勾选结果写在配置目录的 `account-consent-record.json`，只包含 `version` 和 `acceptedAt`。同一版本再次登录沿用原来的时间戳。授权请求在 `/authorize` 上附加 `ext-consent_version` 和 `ext-consent_accepted_at`。说明正文不会放进 URL。桌面应用不调用 Auth0 Management API，也不保存管理令牌。租户需要一条 Post-Login Action，把这两个查询参数复制到用户的 `app_metadata`（`api.user.setAppMetadata`），才能记入 Auth0 用户资料。

账号已配置而说明文件缺失或损坏时，登录被拒绝。未配置账号的本地模式不要求这份同意。

## 本地数据与手机访问

本版本仍是单个研究者的本地桌面应用，账号功能不是共享服务器的多租户实现。首次成功登录将当前本地配置绑定到认证服务的 `issuer + sub`，记录在 DRA 配置目录的 `account-owner.json` 中。后续不同账号无法打开这一份本地数据。不会按邮箱自动合并第三方身份；需要由认证服务执行经过验证的账号关联。更换所有者应先备份，并由管理员进行独立数据迁移；不要直接删除绑定文件让另一账号使用原数据。

研究文件仍在本机，不会因注册而同步到 Auth0。已有本地资料也会归入首次登录账号，应由资料所有者执行首次登录。账号边界不隔离同一操作系统用户直接读取文件的权限。

手机继续使用桌面配对会话。账号未登录或过期时，HTTP、RPC、任务接口和 WebSocket 访问会被拦截；手机收到“请先在桌面端登录”提示。手机不独立登录其他研究者账号。退出不会删除已经下载到手机的文件，也不会取消已启动的本地分析任务；后续接口及事件访问会被拦截。

## 实现与验证范围

- OAuth Authorization Code + PKCE（S256），随机 state / nonce，回调仅监听 IPv4 loopback。
- 一次性回调消费，校验 Host、路径、状态，限制等待时间，取消时关闭回调监听并中止请求。
- 使用 `jose` 校验 RS256 签名、issuer、audience、过期时间、nonce，拒绝未验证邮箱及不同本地所有者。
- 认证材料保留在主进程，渲染进程只获得用户摘要和会话状态。
- 研究访问检查位于主进程 IPC、统一命令分发、浏览器 HTTP 与 WebSocket 边界。
- 本地自动化测试使用测试 RSA 密钥及模拟认证服务，不证明真实 Auth0、发信服务或第三方服务联通。正式验收需逐项完成邮箱注册/验证/找回，以及 Google/Microsoft/Apple 登录和退出测试。

参考：[ChatGPT 登录方式](https://help.openai.com/en/articles/7426629-why-cant-i-log-in-to-chatgpt)、[Auth0 Universal Login](https://auth0.com/docs/authenticate/login/auth0-universal-login)、[Auth0 PKCE 接入](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce/add-login-using-the-authorization-code-flow-with-pkce)。
