# Baselio installer text export

Generated with `NSISDIR=<electron-builder NSIS bundle> node scripts/export-installer-copy.ts`.

Source: electron-builder 26.15.3, NSIS 3.0.4.1. This is a source-backed text export, not a Windows screenshot. Runtime file paths and error codes remain placeholders. NSIS ampersands mark keyboard shortcuts.

Installer flow: language selector → informational Apache license → directory → installation → finish. There is no separate installer welcome page. The install-mode page is bypassed by the existing forced current-user hook. License/directory pages are skipped for updates by electron-builder. The uninstaller has welcome, progress, and finish pages.

The selector uses the Windows UI language when supported and English otherwise. It remains visible for interactive installs so the user can choose another language; silent invocations remain silent.

## ja_JP

### License page

**BaselioLicenseHeader**

```text
オープンソースライセンス
```

**BaselioLicenseSubheader**

```text
Apache License 2.0
```

**BaselioLicenseTop**

```text
Baselio（ベースリオ）は Apache License 2.0 で配布されています。
```

**BaselioLicenseBottom**

```text
ライセンスはインストールされたアプリにも同梱されています。
```

License body: `build/license_ja_JP.txt`; the introductory paragraph is:

Baselio（ベースリオ）は Apache License 2.0 で配布されています。以下は正文（英語）です。

It is followed by the complete, byte-identical English `LICENSE`, including its existing copyright notice. The license page uses the localized Next button; it does not request agreement.

### Directory

**MUI_TEXT_DIRECTORY_TITLE**

```text
インストール先を選んでください。
```

**MUI_TEXT_DIRECTORY_SUBTITLE**

```text
Baselioをインストールするフォルダを選んでください。
```

**^DirText**

```text
Baselioを以下のフォルダにインストールします。異なったフォルダにインストールするには、[参照] を押して、別のフォルダを選択してください。 続けるには [次へ] をクリックして下さい。
```

**^DirBrowseText**

```text
Baselioをインストールするフォルダを選択してください：
```

**^SpaceRequired**

```text
必要なディスクスペース： 
```

**^SpaceAvailable**

```text
利用可能なディスクスペース： 
```

### Installation progress / result

**MUI_TEXT_INSTALLING_TITLE**

```text
インストール
```

**MUI_TEXT_INSTALLING_SUBTITLE**

```text
Baselioをインストールしています。しばらくお待ちください。
```

**MUI_TEXT_FINISH_TITLE**

```text
インストールの完了
```

**MUI_TEXT_FINISH_SUBTITLE**

```text
インストールに成功しました。
```

**MUI_TEXT_ABORT_TITLE**

```text
インストールの中止
```

**MUI_TEXT_ABORT_SUBTITLE**

```text
セットアップは正常に完了されませんでした。
```

### Finish

**MUI_TEXT_FINISH_INFO_TITLE**

```text
Baselio セットアップ ウィザードは完了しました。
```

**MUI_TEXT_FINISH_INFO_TEXT**

```text
Baselioは、このコンピュータにインストールされました。

ウィザードを閉じるには [完了] を押してください。
```

**MUI_TEXT_FINISH_INFO_REBOOT**

```text
Baselio のインストールを完了するには、このコンピュータを再起動する必要があります。今すぐ再起動しますか？
```

**MUI_TEXT_FINISH_RUN**

```text
Baselioを実行(&R)
```

**MUI_TEXT_FINISH_REBOOTNOW**

```text
今すぐ再起動する
```

**MUI_TEXT_FINISH_REBOOTLATER**

```text
後で手動で再起動する
```

### Uninstall welcome

**MUI_UNTEXT_WELCOME_INFO_TITLE**

```text
Baselio アンインストール ウィザードへようこそ
```

**MUI_UNTEXT_WELCOME_INFO_TEXT**

```text
このウィザードは、Baselioのアンインストールをガイドしていきます。

アンインストールを開始する前に、Baselioが起動していないことを確認して下さい。

続けるには [次へ] をクリックして下さい。
```

### Uninstall progress / result

**MUI_UNTEXT_UNINSTALLING_TITLE**

```text
アンインストール
```

**MUI_UNTEXT_UNINSTALLING_SUBTITLE**

```text
Baselioをアンインストールしています。しばらくお待ちください。
```

**MUI_UNTEXT_FINISH_TITLE**

```text
アンインストールの完了
```

**MUI_UNTEXT_FINISH_SUBTITLE**

```text
アンインストールに成功しました。
```

**MUI_UNTEXT_ABORT_TITLE**

```text
アンインストールの中止
```

**MUI_UNTEXT_ABORT_SUBTITLE**

```text
アンインストールは正常に完了されませんでした。
```

### Uninstall finish

**MUI_UNTEXT_FINISH_INFO_TITLE**

```text
Baselio アンインストール ウィザードは完了しました。
```

**MUI_UNTEXT_FINISH_INFO_TEXT**

```text
Baselioは、このコンピュータからアンインストールされました。

ウィザードを閉じるには [完了] を押してください。
```

**MUI_UNTEXT_FINISH_INFO_REBOOT**

```text
Baselio のアンインストールを完了するには、このコンピュータを再起動する必要があります。今すぐ再起動しますか？
```

### Navigation / captions

**^SetupCaption**

```text
Baselio セットアップ
```

**^UninstallCaption**

```text
Baselio アンインストール
```

**^BackBtn**

```text
< 戻る(&B)
```

**^NextBtn**

```text
次へ(&N) >
```

**^InstallBtn**

```text
インストール
```

**^UninstallBtn**

```text
ｱﾝｲﾝｽﾄｰﾙ(&U)
```

**^CancelBtn**

```text
キャンセル
```

**^CloseBtn**

```text
閉じる(&C)
```

**^BrowseBtn**

```text
参照(&R)...
```

**^ShowDetailsBtn**

```text
詳細を表示(&D)
```

**MUI_BUTTONTEXT_FINISH**

```text
完了(&F)
```

### Custom recovery dialogs and detail log

**BaselioNotebookCleanupFailed**

```text
Baselio の Notebook 分離リソースを安全に削除できませんでした。クリーンアップを再試行できるよう、アンインストールを中止しました。
```

**BaselioDetail0**

```text
Baselio Notebook クリーンアップ失敗 code=$0 sandboxRoot="$INSTDIR\resources\notebook-network-sandbox\windows"
```

**BaselioDataProtectionFailed**

```text
Baselio は更新前にデータフォルダーを安全に保護できませんでした。
既存のデータは変更されていません。
```

**BaselioBackupConflict**

```text
Baselio は現在のデータフォルダーと以前の更新バックアップの両方を検出しました。
データは変更されていません。次の場所を確認してください：
$baselioMessageBackup
```

**BaselioRestoreDestinationExists**

```text
復元先が既に存在するため、Baselio はデータフォルダーを復元できませんでした。
保護されたデータは次の場所にあります：
$baselioMessageBackup
```

**BaselioRestoreFailed**

```text
Baselio は更新後にデータフォルダーを復元できませんでした。
保護されたデータは次の場所にあります：
$baselioMessageBackup
```

**BaselioUpdateAccessDenied**

```text
Baselio の更新を完了できませんでした。

Windows が次のファイルへのアクセスを拒否しました：
$INSTDIR\${UNINSTALL_FILENAME}

この通知を閉じ、Baselio の公式インストーラーを管理者として実行して更新してください。

Windows エラー：$R1
```

**BaselioUpdateFileInUse**

```text
Baselio の更新を完了できませんでした。

別のプロセスが次のファイルを使用しています：
$INSTDIR\${UNINSTALL_FILENAME}

このファイルを使用中のプロセスを終了して「再試行」を選択してください。「キャンセル」で更新を中止します。

Windows エラー：$R1
```

**BaselioUpdateReplaceFailed**

```text
Baselio の更新を完了できませんでした。

Windows が次のファイルを置き換えられませんでした：
$INSTDIR\${UNINSTALL_FILENAME}

「再試行」でやり直すか、「キャンセル」で更新を中止してください。問題が続く場合は、ファイルのパスと以下の Windows エラーを報告してください。

Windows エラー：$R1
```

**BaselioRetryPreservationFailed**

```text
$(uninstallFailed): $R0
この再試行で既に保護されたデータは次の場所にあります：
$retryLegacyDataBackup
$retryBrandedDataBackup
```

**BaselioAdditionalData**

```text
Baselio は旧バージョンの終了中に作成された追加データを検出しました。
元のデータを復元します。追加データは次の場所にあります：
$baselioMessageBackup
```

**BaselioRetryRestoreFailed**

```text
Baselio は更新後にデータフォルダーを復元できませんでした。
データは次の場所にあります：
$baselioMessageBackup
```

**BaselioUninstallFailed**

```text
$(uninstallFailed): $R0
```

**BaselioDetail1**

```text
Baselio データ保護失敗 code=parent-path-unresolved path="$baselioMessageDir\$baselioMessageFolder"
```

**BaselioDetail2**

```text
"$baselioMessageDir\$baselioMessageFolder" を安全に保護できません。親パスを解決できませんでした。
```

**BaselioDetail3**

```text
Baselio データ保護失敗 code=backup-already-exists path="$baselioMessageDir\$baselioMessageFolder" backup="$baselioMessageBackup"
```

**BaselioDetail4**

```text
"$baselioMessageDir\$baselioMessageFolder" を安全に保護できません。バックアップ先が既に存在します：$baselioMessageBackup
```

**BaselioDetail5**

```text
Baselio データ保護失敗 code=preserve-rename-failed path="$baselioMessageDir\$baselioMessageFolder" backup="$baselioMessageBackup"
```

**BaselioDetail6**

```text
"$baselioMessageDir\$baselioMessageFolder" を安全に保護できません。既存のインストールは変更されていません。
```

**BaselioDetail7**

```text
データフォルダーを保護しました：$baselioMessageBackup
```

**BaselioDetail8**

```text
中断された更新で保護されたデータを検出しました：$baselioMessageBackup
```

**BaselioDetail9**

```text
Baselio データ保護失敗 code=restore-destination-exists path="$baselioMessageDir\$baselioMessageFolder" backup="$baselioMessageBackup"
```

**BaselioDetail10**

```text
保護されたデータは次の場所にあります：$baselioMessageBackup
```

**BaselioDetail11**

```text
Baselio データ保護失敗 code=restore-rename-failed path="$baselioMessageDir\$baselioMessageFolder" backup="$baselioMessageBackup"
```

**BaselioDetail12**

```text
データフォルダーを復元しました：$baselioMessageDir\$baselioMessageFolder
```

**BaselioDetail13**

```text
全ユーザーのデータフォルダーの保護を管理者権限のインストーラーに委ねます。
```

**BaselioDetail14**

```text
共有データフォルダーの保護を管理者権限のインストーラーに委ねます。
```

**BaselioDetail15**

```text
既存のアンインストーラーを置き換えられません："$INSTDIR\${UNINSTALL_FILENAME}"。Windows エラー：$R1。
```

**BaselioDetail16**

```text
更新中に作成された追加データは次の場所にあります：$baselioMessageBackup
```

**BaselioDetail17**

```text
旧アンインストーラーの終了コードは $R0 ですが、旧インストールは既に削除されています。続行します。
```

**BaselioDetail18**

```text
旧アンインストーラーの終了コードは $R0 です。残ったアプリのプロセスを終了し、一度だけ再試行します。
```

**BaselioDetail19**

```text
再試行の終了コードは $R0 ですが、旧インストールは既に削除されています。続行します。
```

**BaselioDetail20**

```text
アンインストールに失敗しました。アンインストーラーのエラーコード：$R0。
```

**BaselioDetail21**

```text
対応するユーザー単位のアンインストール処理が終わるまで共有データフォルダーを保護します。
```

## zh_CN

### License page

**BaselioLicenseHeader**

```text
开源许可证
```

**BaselioLicenseSubheader**

```text
Apache License 2.0
```

**BaselioLicenseTop**

```text
Baselio 以 Apache License 2.0 分发。
```

**BaselioLicenseBottom**

```text
许可证也包含在已安装的应用中。
```

License body: `build/license_zh_CN.txt`; the introductory paragraph is:

Baselio 以 Apache License 2.0 分发。以下为英文正式文本。

It is followed by the complete, byte-identical English `LICENSE`, including its existing copyright notice. The license page uses the localized Next button; it does not request agreement.

### Directory

**MUI_TEXT_DIRECTORY_TITLE**

```text
选定安装位置
```

**MUI_TEXT_DIRECTORY_SUBTITLE**

```text
选定 Baselio 要安装的文件夹。
```

**^DirText**

```text
Setup 将安装 Baselio 在下列文件夹。要安装到不同文件夹，单击 [浏览(B)...] 并选择其他的文件夹。 单击 [下一步(N)] 继续。
```

**^DirBrowseText**

```text
选择要安装 Baselio 的文件夹位置: 
```

**^SpaceRequired**

```text
"所需空间: "
```

**^SpaceAvailable**

```text
"可用空间: "
```

### Installation progress / result

**MUI_TEXT_INSTALLING_TITLE**

```text
正在安装
```

**MUI_TEXT_INSTALLING_SUBTITLE**

```text
Baselio 正在安装，请等候。
```

**MUI_TEXT_FINISH_TITLE**

```text
安装完成
```

**MUI_TEXT_FINISH_SUBTITLE**

```text
安装程序已成功地运行完成。
```

**MUI_TEXT_ABORT_TITLE**

```text
安装己中止
```

**MUI_TEXT_ABORT_SUBTITLE**

```text
安装程序并未成功地运行完成。
```

### Finish

**MUI_TEXT_FINISH_INFO_TITLE**

```text
正在完成 Baselio 安装向导
```

**MUI_TEXT_FINISH_INFO_TEXT**

```text
Baselio 已安装在你的系统。
单击 [完成(F)] 关闭此向导。
```

**MUI_TEXT_FINISH_INFO_REBOOT**

```text
你的系统需要重新启动，以便完成 Baselio 的安装。现在要重新启动吗？
```

**MUI_TEXT_FINISH_RUN**

```text
运行 Baselio(&R)
```

**MUI_TEXT_FINISH_REBOOTNOW**

```text
是，现在重新启动(&Y)
```

**MUI_TEXT_FINISH_REBOOTLATER**

```text
否，我稍后再自行重新启动(&N)
```

### Uninstall welcome

**MUI_UNTEXT_WELCOME_INFO_TITLE**

```text
欢迎使用 Baselio 解除安装向导
```

**MUI_UNTEXT_WELCOME_INFO_TEXT**

```text
这个向导将全程指引你 Baselio 的解除安装进程。

在开始解除安装之前，确认 Baselio 并未运行当中。

单击 [下一步(N)] 继续。
```

### Uninstall progress / result

**MUI_UNTEXT_UNINSTALLING_TITLE**

```text
正在解除安装
```

**MUI_UNTEXT_UNINSTALLING_SUBTITLE**

```text
Baselio 正在解除安装，请等候。
```

**MUI_UNTEXT_FINISH_TITLE**

```text
解除安装已完成
```

**MUI_UNTEXT_FINISH_SUBTITLE**

```text
解除安装程序已成功地运行完成。
```

**MUI_UNTEXT_ABORT_TITLE**

```text
解除安装已中止
```

**MUI_UNTEXT_ABORT_SUBTITLE**

```text
解除安装程序并未成功地运行完成。
```

### Uninstall finish

**MUI_UNTEXT_FINISH_INFO_TITLE**

```text
正在完成 Baselio 解除安装向导
```

**MUI_UNTEXT_FINISH_INFO_TEXT**

```text
Baselio 已从你的计算机解除安装。

单击 [完成] 关闭这个向导。
```

**MUI_UNTEXT_FINISH_INFO_REBOOT**

```text
计算机需要重新启动，以便完成 Baselio 的解除安装。现在想要重新启动吗？
```

### Navigation / captions

**^SetupCaption**

```text
Baselio 安装
```

**^UninstallCaption**

```text
Baselio 解除安装
```

**^BackBtn**

```text
< 上一步(&P)
```

**^NextBtn**

```text
下一步(&N) >
```

**^InstallBtn**

```text
安装(&I)
```

**^UninstallBtn**

```text
解除安装(&U)
```

**^CancelBtn**

```text
取消(&C)
```

**^CloseBtn**

```text
关闭(&L)
```

**^BrowseBtn**

```text
浏览(&B)...
```

**^ShowDetailsBtn**

```text
显示细节(&D)
```

**MUI_BUTTONTEXT_FINISH**

```text
完成(&F)
```

### Custom recovery dialogs and detail log

**BaselioNotebookCleanupFailed**

```text
Baselio 无法安全移除其 Notebook 隔离资源。卸载已停止，以便重试清理。
```

**BaselioDetail0**

```text
Baselio Notebook 清理失败 code=$0 sandboxRoot="$INSTDIR\resources\notebook-network-sandbox\windows"
```

**BaselioDataProtectionFailed**

```text
Baselio 无法在更新前安全保护数据文件夹。
现有数据未被更改。
```

**BaselioBackupConflict**

```text
Baselio 检测到当前数据文件夹和之前的更新备份同时存在。
未更改任何数据。请检查：
$baselioMessageBackup
```

**BaselioRestoreDestinationExists**

```text
目标位置已存在，Baselio 无法恢复数据文件夹。
受保护的数据仍位于：
$baselioMessageBackup
```

**BaselioRestoreFailed**

```text
Baselio 无法在更新后恢复数据文件夹。
受保护的数据仍位于：
$baselioMessageBackup
```

**BaselioUpdateAccessDenied**

```text
Baselio 无法完成更新。

Windows 拒绝访问：
$INSTDIR\${UNINSTALL_FILENAME}

请关闭此提示，然后以管理员身份运行 Baselio 官方安装程序以更新此安装。

Windows 错误：$R1
```

**BaselioUpdateFileInUse**

```text
Baselio 无法完成更新。

其他进程正在使用：
$INSTDIR\${UNINSTALL_FILENAME}

请关闭使用此文件的进程，然后选择“重试”。选择“取消”可停止更新。

Windows 错误：$R1
```

**BaselioUpdateReplaceFailed**

```text
Baselio 无法完成更新。

Windows 无法替换：
$INSTDIR\${UNINSTALL_FILENAME}

请选择“重试”再试一次，或选择“取消”停止更新。如果问题持续，请报告文件路径及以下 Windows 错误。

Windows 错误：$R1
```

**BaselioRetryPreservationFailed**

```text
$(uninstallFailed): $R0
本次重试中已保护的数据仍位于：
$retryLegacyDataBackup
$retryBrandedDataBackup
```

**BaselioAdditionalData**

```text
Baselio 检测到关闭旧版本时创建的额外数据。
原始数据将被恢复；额外数据仍位于：
$baselioMessageBackup
```

**BaselioRetryRestoreFailed**

```text
Baselio 无法在更新后恢复数据文件夹。
数据仍位于：
$baselioMessageBackup
```

**BaselioUninstallFailed**

```text
$(uninstallFailed): $R0
```

**BaselioDetail1**

```text
Baselio 数据保护失败 code=parent-path-unresolved path="$baselioMessageDir\$baselioMessageFolder"
```

**BaselioDetail2**

```text
无法安全保护 "$baselioMessageDir\$baselioMessageFolder"；无法解析其父路径。
```

**BaselioDetail3**

```text
Baselio 数据保护失败 code=backup-already-exists path="$baselioMessageDir\$baselioMessageFolder" backup="$baselioMessageBackup"
```

**BaselioDetail4**

```text
无法安全保护 "$baselioMessageDir\$baselioMessageFolder"，备份路径已存在：$baselioMessageBackup
```

**BaselioDetail5**

```text
Baselio 数据保护失败 code=preserve-rename-failed path="$baselioMessageDir\$baselioMessageFolder" backup="$baselioMessageBackup"
```

**BaselioDetail6**

```text
无法安全保护 "$baselioMessageDir\$baselioMessageFolder"；现有安装未被更改。
```

**BaselioDetail7**

```text
已保护数据文件夹：$baselioMessageBackup
```

**BaselioDetail8**

```text
发现中断的更新已保护的数据：$baselioMessageBackup
```

**BaselioDetail9**

```text
Baselio 数据保护失败 code=restore-destination-exists path="$baselioMessageDir\$baselioMessageFolder" backup="$baselioMessageBackup"
```

**BaselioDetail10**

```text
受保护的数据仍位于：$baselioMessageBackup
```

**BaselioDetail11**

```text
Baselio 数据保护失败 code=restore-rename-failed path="$baselioMessageDir\$baselioMessageFolder" backup="$baselioMessageBackup"
```

**BaselioDetail12**

```text
已恢复数据文件夹至：$baselioMessageDir\$baselioMessageFolder
```

**BaselioDetail13**

```text
将所有用户的数据文件夹保护交由管理员权限的安装程序处理。
```

**BaselioDetail14**

```text
将共享数据文件夹保护交由管理员权限的安装程序处理。
```

**BaselioDetail15**

```text
无法替换现有卸载程序："$INSTDIR\${UNINSTALL_FILENAME}"。Windows 错误：$R1。
```

**BaselioDetail16**

```text
更新期间创建的额外数据仍位于：$baselioMessageBackup
```

**BaselioDetail17**

```text
旧卸载程序以 $R0 退出，但旧安装已移除；继续安装。
```

**BaselioDetail18**

```text
旧卸载程序以 $R0 退出；关闭剩余应用进程并重试一次。
```

**BaselioDetail19**

```text
重试以 $R0 退出，但旧安装已移除；继续安装。
```

**BaselioDetail20**

```text
卸载失败。卸载程序错误码：$R0。
```

**BaselioDetail21**

```text
在对应的当前用户卸载流程完成前，继续保护共享数据文件夹。
```

## en_US

### License page

**BaselioLicenseHeader**

```text
Open-source license
```

**BaselioLicenseSubheader**

```text
Apache License 2.0
```

**BaselioLicenseTop**

```text
Baselio is distributed under the Apache License 2.0.
```

**BaselioLicenseBottom**

```text
The license is also included with the installed application.
```

License body: `build/license_en_US.txt`; the introductory paragraph is:

Baselio is distributed under the Apache License 2.0. The original English text follows.

It is followed by the complete, byte-identical English `LICENSE`, including its existing copyright notice. The license page uses the localized Next button; it does not request agreement.

### Directory

**MUI_TEXT_DIRECTORY_TITLE**

```text
Choose Install Location
```

**MUI_TEXT_DIRECTORY_SUBTITLE**

```text
Choose the folder in which to install Baselio.
```

**^DirText**

```text
Setup will install Baselio in the following folder. To install in a different folder, click Browse and select another folder. Click Next to continue.
```

**^DirBrowseText**

```text
Select the folder to install Baselio in:
```

**^SpaceRequired**

```text
"Space required: "
```

**^SpaceAvailable**

```text
"Space available: "
```

### Installation progress / result

**MUI_TEXT_INSTALLING_TITLE**

```text
Installing
```

**MUI_TEXT_INSTALLING_SUBTITLE**

```text
Please wait while Baselio is being installed.
```

**MUI_TEXT_FINISH_TITLE**

```text
Installation Complete
```

**MUI_TEXT_FINISH_SUBTITLE**

```text
Setup was completed successfully.
```

**MUI_TEXT_ABORT_TITLE**

```text
Installation Aborted
```

**MUI_TEXT_ABORT_SUBTITLE**

```text
Setup was not completed successfully.
```

### Finish

**MUI_TEXT_FINISH_INFO_TITLE**

```text
Completing Baselio Setup
```

**MUI_TEXT_FINISH_INFO_TEXT**

```text
Baselio has been installed on your computer.

Click Finish to close Setup.
```

**MUI_TEXT_FINISH_INFO_REBOOT**

```text
Your computer must be restarted in order to complete the installation of Baselio. Do you want to reboot now?
```

**MUI_TEXT_FINISH_RUN**

```text
&Run Baselio
```

**MUI_TEXT_FINISH_REBOOTNOW**

```text
Reboot now
```

**MUI_TEXT_FINISH_REBOOTLATER**

```text
I want to manually reboot later
```

### Uninstall welcome

**MUI_UNTEXT_WELCOME_INFO_TITLE**

```text
Welcome to Baselio Uninstall
```

**MUI_UNTEXT_WELCOME_INFO_TEXT**

```text
Setup will guide you through the uninstallation of Baselio.

Before starting the uninstallation, make sure Baselio is not running.

Click Next to continue.
```

### Uninstall progress / result

**MUI_UNTEXT_UNINSTALLING_TITLE**

```text
Uninstalling
```

**MUI_UNTEXT_UNINSTALLING_SUBTITLE**

```text
Please wait while Baselio is being uninstalled.
```

**MUI_UNTEXT_FINISH_TITLE**

```text
Uninstallation Complete
```

**MUI_UNTEXT_FINISH_SUBTITLE**

```text
Uninstall was completed successfully.
```

**MUI_UNTEXT_ABORT_TITLE**

```text
Uninstallation Aborted
```

**MUI_UNTEXT_ABORT_SUBTITLE**

```text
Uninstall was not completed successfully.
```

### Uninstall finish

**MUI_UNTEXT_FINISH_INFO_TITLE**

```text
Completing Baselio Uninstall
```

**MUI_UNTEXT_FINISH_INFO_TEXT**

```text
Baselio has been uninstalled from your computer.

Click Finish to close Setup.
```

**MUI_UNTEXT_FINISH_INFO_REBOOT**

```text
Your computer must be restarted in order to complete the uninstallation of Baselio. Do you want to reboot now?
```

### Navigation / captions

**^SetupCaption**

```text
Baselio Setup
```

**^UninstallCaption**

```text
Baselio Uninstall
```

**^BackBtn**

```text
< &Back
```

**^NextBtn**

```text
&Next >
```

**^InstallBtn**

```text
&Install
```

**^UninstallBtn**

```text
&Uninstall
```

**^CancelBtn**

```text
Cancel
```

**^CloseBtn**

```text
&Close
```

**^BrowseBtn**

```text
B&rowse...
```

**^ShowDetailsBtn**

```text
Show &details
```

**MUI_BUTTONTEXT_FINISH**

```text
&Finish
```

### Custom recovery dialogs and detail log

**BaselioNotebookCleanupFailed**

```text
Baselio could not safely remove its owned Notebook isolation resources. The uninstall was stopped so the cleanup can be retried.
```

**BaselioDetail0**

```text
Baselio Notebook cleanup failure code=$0 sandboxRoot="$INSTDIR\resources\notebook-network-sandbox\windows"
```

**BaselioDataProtectionFailed**

```text
Baselio could not safely protect its data folder before updating.
The existing data was left untouched.
```

**BaselioBackupConflict**

```text
Baselio found both the current data folder and an earlier update backup.
No data was changed. Please inspect:
$baselioMessageBackup
```

**BaselioRestoreDestinationExists**

```text
Baselio could not restore its data folder because the destination already exists.
The preserved data remains at:
$baselioMessageBackup
```

**BaselioRestoreFailed**

```text
Baselio could not restore its data folder after updating.
The preserved data remains at:
$baselioMessageBackup
```

**BaselioUpdateAccessDenied**

```text
Baselio could not finish updating.

Windows denied access to:
$INSTDIR\${UNINSTALL_FILENAME}

Close this notice, then run the official Baselio installer as administrator to update this installation.

Windows error: $R1
```

**BaselioUpdateFileInUse**

```text
Baselio could not finish updating.

Another process is using:
$INSTDIR\${UNINSTALL_FILENAME}

Close the process using this file, then choose Retry. Choose Cancel to stop this update.

Windows error: $R1
```

**BaselioUpdateReplaceFailed**

```text
Baselio could not finish updating.

Windows could not replace:
$INSTDIR\${UNINSTALL_FILENAME}

Choose Retry to try again, or Cancel to stop this update. If the problem continues, report the file path and Windows error below.

Windows error: $R1
```

**BaselioRetryPreservationFailed**

```text
$(uninstallFailed): $R0
Any data already preserved for this retry remains at:
$retryLegacyDataBackup
$retryBrandedDataBackup
```

**BaselioAdditionalData**

```text
Baselio found additional data created while closing the previous version.
Your original data will be restored; the additional data remains at:
$baselioMessageBackup
```

**BaselioRetryRestoreFailed**

```text
Baselio could not restore its data folder after updating.
Your data remains at:
$baselioMessageBackup
```

**BaselioUninstallFailed**

```text
$(uninstallFailed): $R0
```

**BaselioDetail1**

```text
Baselio data protection failure code=parent-path-unresolved path="$baselioMessageDir\$baselioMessageFolder"
```

**BaselioDetail2**

```text
Could not safely preserve "$baselioMessageDir\$baselioMessageFolder"; its parent path could not be resolved.
```

**BaselioDetail3**

```text
Baselio data protection failure code=backup-already-exists path="$baselioMessageDir\$baselioMessageFolder" backup="$baselioMessageBackup"
```

**BaselioDetail4**

```text
Could not safely preserve "$baselioMessageDir\$baselioMessageFolder" because the backup path already exists: $baselioMessageBackup
```

**BaselioDetail5**

```text
Baselio data protection failure code=preserve-rename-failed path="$baselioMessageDir\$baselioMessageFolder" backup="$baselioMessageBackup"
```

**BaselioDetail6**

```text
Could not safely preserve "$baselioMessageDir\$baselioMessageFolder"; leaving the existing installation untouched.
```

**BaselioDetail7**

```text
Protected the data folder at: $baselioMessageBackup
```

**BaselioDetail8**

```text
Found data preserved by an interrupted update at: $baselioMessageBackup
```

**BaselioDetail9**

```text
Baselio data protection failure code=restore-destination-exists path="$baselioMessageDir\$baselioMessageFolder" backup="$baselioMessageBackup"
```

**BaselioDetail10**

```text
The preserved data remains at: $baselioMessageBackup
```

**BaselioDetail11**

```text
Baselio data protection failure code=restore-rename-failed path="$baselioMessageDir\$baselioMessageFolder" backup="$baselioMessageBackup"
```

**BaselioDetail12**

```text
Restored the data folder to: $baselioMessageDir\$baselioMessageFolder
```

**BaselioDetail13**

```text
Deferring machine data-folder protection to the elevated installer.
```

**BaselioDetail14**

```text
Deferring shared data-folder protection to the elevated installer.
```

**BaselioDetail15**

```text
Cannot replace the existing uninstaller: "$INSTDIR\${UNINSTALL_FILENAME}". Windows error: $R1.
```

**BaselioDetail16**

```text
Additional data created during the update remains at: $baselioMessageBackup
```

**BaselioDetail17**

```text
Old uninstaller exited with $R0 but the previous installation is already removed; continuing.
```

**BaselioDetail18**

```text
Old uninstaller exited with $R0; closing leftover app processes and retrying once.
```

**BaselioDetail19**

```text
Retry exited with $R0 but the previous installation is already removed; continuing.
```

**BaselioDetail20**

```text
Uninstall was not successful. Uninstaller error code: $R0.
```

**BaselioDetail21**

```text
Keeping the shared data folder protected for the matching per-user uninstall pass.
```
