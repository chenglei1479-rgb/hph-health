## 日本語

これは署名されていない内部テスト用ビルドです。個人のコンピュータにのみインストールしてください。病院の PC にはインストールしないでください。

インストーラーのファイル名は Baselio-<version>-mac-arm64.dmg、Baselio-<version>-mac-x64.dmg、Baselio-<version>-win-x64-setup.exe です。

同梱されている架空のデモデータ（240 症例の再入院データセット）だけを使ってください。実際の患者データは決して使わないでください。

Notebook 用の Python（pandas、numpy、scipy、statsmodels、matplotlib、openpyxl、lifelines）はインストーラーに入っています。初回起動時にダウンロードしません。

氏名・患者IDなど直接識別子の送信を防ぐため、送信前チェックと制限があります。絶対保証ではありません。

β／種では架空データのみご利用ください。病院の正式運用・実データは対象外です。リクエストは設定した AI サービス（OpenAI の場合は米国）へ送信されます。利用料金はご自身の契約先から請求されます。

### OpenAI の API キーを作る

1. https://platform.openai.com/api-keys を開き、サインインします。
2. 「Create new secret key」を選びます。
3. 表示されたキーをコピーし、アプリの設定で API キー欄に貼り付けます。キーは一度しか表示されないので、その場で控えてください。

macOS で止められた場合は、アプリを右クリックして「開く」を選ぶか、システム設定 > プライバシーとセキュリティ > 「このまま開く」を選んでください。

Windows SmartScreen で止められた場合は、「詳細情報」>「実行」を選んでください。

## 中文

这是未签名的内部测试版本。请只安装在个人电脑上，不要安装在医院电脑上。

安装包文件名为 Baselio-<version>-mac-arm64.dmg、Baselio-<version>-mac-x64.dmg、Baselio-<version>-win-x64-setup.exe。

请只使用随附的虚构演示数据（240 例再入院数据集），切勿使用真实患者数据。

Notebook 用的 Python（pandas、numpy、scipy、statsmodels、matplotlib、openpyxl、lifelines）已包含在安装包中，首次启动不会下载。

为防止发送姓名、患者ID等直接标识符，设有发送前检查和限制。这并非绝对保证。

β／种子阶段请仅使用虚构数据。医院正式运行及真实数据不在适用范围内。请求会发送到您设置的 AI 服务（如果是 OpenAI，则发送到美国）。

### 创建 OpenAI API 密钥

1. 打开 https://platform.openai.com/api-keys 并登录。
2. 选择「Create new secret key」。
3. 复制显示的密钥，粘贴到应用设置中的 API 密钥栏。密钥只显示一次，请立即保存。

如果 macOS 拦截了应用，请右键点按并选择“打开”，或前往“系统设置”>“隐私与安全性”>“仍要打开”。

如果 Windows SmartScreen 拦截了安装程序，请选择“更多信息”>“仍要运行”。

## English

Pre-send checks and restrictions help prevent direct identifiers such as names and patient IDs from being sent. This is not an absolute guarantee.

For beta/seed use, please use fictional data only. Formal hospital operations and real data are out of scope.

Requests are sent to the AI service you configure (for OpenAI, the United States). Usage fees are billed by your own provider.
