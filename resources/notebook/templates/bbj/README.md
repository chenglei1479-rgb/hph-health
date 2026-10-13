# BBJ 深化：汇总统计、坐标转换、jMorp 与 MR Notebook

已合入 DRA `0.1.33-unified.1` 候选源码。模板和连接器提供分析准备能力；真实数据 MR 尚未执行。当前候选的构建和包核验状态以随包 verification.json 为准。

## 使用入口

在 DRA 的 REPL 控制平面发现来源：

```javascript
const catalogue = await host.mcp('human-genetics', 'bbj_summary_statistics', {source:'nbdc', query:'GWAS'});
const jenger = await host.mcp('human-genetics', 'bbj_summary_statistics', {source:'jenger', query:'diabetes'});
const template = await host.mcp('human-genetics', 'bbj_notebook_workflow', {});
```

`template.resource_directory` 返回已存在的源码／打包模板路径；不存在时 `resource_found=false`。将模板文件复制到研究工作区再编辑。目录中含 `BBJ_MR.ipynb`、准备脚本、MR 脚本和配置示例。现有 `resources/**` 的 asarUnpack 规则包含该目录，候选交付时应核验该目录的全部模板文件。

NBDC 工具固定到 hum0014/v28 以保持来源可复现，仅保留明确 Unrestricted-access 的 NHA GWAS/汇总统计条目；NHA URL 可能是详情页，需要进入后取得实际文件。JENGER 解析其目录中本域 `/download/` 链接（包括 8080 端口）。不会猜测下载文件名、默认所有数据都用同一 build，或将来源失败变为成功空结果。

## Notebook 执行

在外部 Jupyter 的 Python 3 kernel 打开 `BBJ_MR.ipynb`。默认执行只显示“未运行”；填写 `config.json` 并逐阶段开启开关。下载和 Rscript 子进程单元适用于外部 Jupyter；DRA 数据 kernel 的网络／进程策略可能禁止它们。DRA 内应通过已授权的获取路径或人工下载导入本地数据，Python 准备单元读本地文件，R 代码在允许的 R Notebook 环境运行。不要关闭沙箱来绕过限制。

命令行准备与 MR：

```powershell
python bbj_pipeline.py config.json prepared_bbj
Rscript bbj_mr.R config.json prepared_bbj
```

配置中的相对路径相对于启动目录。输出目录必须不存在，失败输出不要当作完成的分析。规范字段为 SNP/CHR/POS/REF/ALT/EA/OA/BETA/SE/P，可选 EAF；列名必须按所选数据文件的说明逐项映射，禁止推测 REF/ALT。OR 转 logOR，但其 SE 原本必须在 logOR 尺度。P=0 不自动重建，会拒绝并提示核对源数据精度。

GRCh37→38 或 GRCh38→37 自动按数据 build 选择对应 chain，校验预先记录的 SHA256 和方向，变为 0-based 后映射并恢复 1-based，负链互补全部等位基因，校验目标 FASTA/.fai。未映射、多映射、跨染色体、参考不一致、重复 target 或非 SNP 被排除且留下行级原因；同 build 也校验目标参考。当前自动转换范围是 SNP，INDEL/SV 需要 variant-aware liftover 和规范化。本次没有真实 chain/FASTA 转换验证。

jMorp 使用经过条款确认的本地 VCF，要求面板版本和 target build 一致；根据 CHR/POS/REF/ALT 匹配多等位 AF，重复或缺失保持空值。EA=REF 时使用 1−ALT_AF。jMorp AF 作为日本人群注释独立输出，不替代 BBJ EAF、不充当 LD 参考。部分面板 INFO AF 字段名不同，需要配置 `af_info_key`；实际面板未下载/验证。

MR 需要研究者确认、样本重叠评估、本地日本／东亚 LD 参考及 PLINK。两份 BBJ GWAS可能共享参与者，本模板不会自动纠正重叠偏倚。模板包括 F≥10、P<5e-8、10Mb/r²=0.001 clumping、回文排除、效应对齐、IVW/Egger/weighted median 和敏感性分析；至少三个独立 SNP。无足够 SNP 时终止，不输出假结果。效应尺度、因果假设和多重检验仍需研究者解释。

## 来源与验证边界（2026-10-09）

- [NBDC BBJ v28](https://humandbs.dbcls.jp/en/research/hum0014/v28)：网页已核查，包含开放 NHA GWAS和受控个体数据。
- [RIKEN 官方目录中的 JENGER](https://data.riken.jp/en/database/)：[JENGER 入口](http://jenger.riken.jp/en/result)，本次直接访问失败，实网下载待验证。
- [jMorp 官方数据指南](https://jmorp.megabank.tohoku.ac.jp/docs/guide-en/overview/access_to_datasets/)：[下载](https://jmorp.megabank.tohoku.ac.jp/downloads)，面板有不同 build，需要逐版确认。
- [UCSC liftOver](https://genome.ucsc.edu/cgi-bin/hgLiftOver)：此实现只接受唯一 SNP 映射并加目标参考校验，不将坐标映射本身当作变异正确性证明。
- [TwoSampleMR](https://mrcieu.github.io/TwoSampleMR/articles/perform_mr.html)。

Python 自动化测试使用 SYNTHETIC 小型链、FASTA 和 VCF；这些不是 BBJ 患者数据或研究结果。Notebook Python 单元默认路径已顺序 smoke 执行，但环境没有 nbformat/nbclient/Jupyter kernel 或 Rscript，未完成 Jupyter 顶到底执行、R 运行和真实数据 MR。预览页仅用于查看模板内容，不是分析报告。

验证结果：连接器与契约测试 496 项通过，Python 测试 9 项通过，全项目 Node 类型检查及 BBJ 定向类型检查通过。全局 i18n guard 为 724 项通过、53 项失败，涉及本次未修改的翻译／renderer／README 文件，仍未解决；因此不声明整个项目所有检查均通过。
