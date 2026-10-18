export type ResearchAnswers = Readonly<Record<string, string | undefined>>

export type ResearchClassification = {
  isResearch: boolean | null
  law:
    | '指針'
    | '指針適用除外'
    | '臨床研究法'
    | '臨床研究法（2025年改正で追加された類型）'
    | '薬機法（治験/GCP）'
  tokutei: boolean | null
  caseReportTrack: boolean | null
  exitTo: 'CRB' | 'CRB/臨床研究支援部門' | '治験事務局' | null
}

const answer = (answers: ResearchAnswers, node: string): string => answers[node] ?? '未回答'

export const classifyResearch = (answers: ResearchAnswers): ResearchClassification => {
  const research = answer(answers, 'Q0a_研究該当性')
  const caseReport = research.startsWith('症例報告')
  const isResearch = research === '研究' ? true : research === '不確定' ? null : false
  const caseReportTrack =
    research === '不確定' && answer(answers, 'Q5_事前の系統的解析計画') === '不確定'
      ? null
      : caseReport

  if (answer(answers, 'Q0d3_治験・再生医療') === 'はい') {
    return {
      isResearch,
      law: '薬機法（治験/GCP）',
      tokutei: false,
      caseReportTrack,
      exitTo: '治験事務局'
    }
  }

  if (answer(answers, 'Q0d1_計画に基づく投薬・機器使用') === 'はい') {
    const specific = answer(answers, 'Q0d1b_特定臨床研究（企業資金・適応外）')
    return {
      isResearch,
      law: '臨床研究法',
      tokutei: specific === 'はい' ? true : specific === 'いいえ' ? false : null,
      caseReportTrack,
      exitTo: specific === 'はい' ? 'CRB' : 'CRB/臨床研究支援部門'
    }
  }

  if (answer(answers, 'Q0d2_研究目的の負担ある追加検査') === 'はい') {
    return {
      isResearch,
      law: '臨床研究法（2025年改正で追加された類型）',
      tokutei: false,
      caseReportTrack,
      exitTo: 'CRB/臨床研究支援部門'
    }
  }

  return {
    isResearch,
    law: answer(answers, 'Q0b_適用除外') === 'はい' ? '指針適用除外' : '指針',
    tokutei: false,
    caseReportTrack,
    exitTo: null
  }
}
