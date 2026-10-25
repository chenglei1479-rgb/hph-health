import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DEFAULT_RESEARCH_PLAN_CHECK_STATE,
  RESEARCH_PLAN_CHECK_STATES,
  S34_PITFALLS_INITIAL_VISIBLE,
  S34_RESEARCH_PLAN_CHECKLIST,
  S34_RESEARCH_PLAN_PANEL_HEADING,
  type ResearchPlanChecklistBlock,
  type ResearchPlanChecklistDraft,
  type ResearchPlanCheckState
} from '../../../../shared/s34-research-plan-checklist'
import { S34_2_RESEARCH_DESIGN_CHECKLIST } from '../../../../shared/s34-disclaimers'
import {
  loadResearchPlanChecklistDraft,
  saveResearchPlanChecklistDraft
} from './research-plan-checklist-draft'

const checkStateOf = (draft: ResearchPlanChecklistDraft, itemId: string): ResearchPlanCheckState =>
  draft.checks[itemId] ?? DEFAULT_RESEARCH_PLAN_CHECK_STATE

/**
 * §34 T3 — the four-question research-plan checklist on the mentor-prep (① 指導医と相談する準備)
 * surface. Seed copy is founder-locked Japanese; the chrome (show more, memo placeholder) is
 * translated, and the ① disclaimer is imported so it can never drift into a locale file.
 */
export const ResearchPlanChecklistPanel = ({
  projectId
}: {
  projectId?: string
}): React.JSX.Element | null => {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<ResearchPlanChecklistDraft>(() =>
    loadResearchPlanChecklistDraft(projectId)
  )
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setDraft(loadResearchPlanChecklistDraft(projectId))
  }, [projectId])

  if (!projectId) return null

  const update = (next: ResearchPlanChecklistDraft): void => {
    setDraft(saveResearchPlanChecklistDraft(projectId, next))
  }

  const setCheck = (itemId: string, state: ResearchPlanCheckState): void => {
    const checks = { ...draft.checks }
    if (state === DEFAULT_RESEARCH_PLAN_CHECK_STATE) delete checks[itemId]
    else checks[itemId] = state
    update({ ...draft, checks })
  }

  const setMemo = (blockId: ResearchPlanChecklistBlock['id'], memo: string): void => {
    const memos = { ...draft.memos }
    if (memo.trim().length === 0) delete memos[blockId]
    else memos[blockId] = memo
    update({ ...draft, memos })
  }

  return (
    <div
      data-testid="s34-research-plan-checklist"
      className="mt-2 space-y-2 rounded-xl border border-[#e4ded2] bg-[#faf8f2] px-3.5 py-3 text-xs leading-5 text-[#635f56]"
    >
      <p className="font-medium">{S34_RESEARCH_PLAN_PANEL_HEADING}</p>
      <p data-testid="s34-plan-disclaimer">{S34_2_RESEARCH_DESIGN_CHECKLIST}</p>
      {S34_RESEARCH_PLAN_CHECKLIST.map((block) => {
        const limit = block.id === 'pitfalls' ? S34_PITFALLS_INITIAL_VISIBLE : block.items.length
        const visible = expanded[block.id] ? block.items : block.items.slice(0, limit)
        const hidden = block.items.length - visible.length
        return (
          <details
            key={block.id}
            data-testid={`s34-plan-block-${block.id}`}
            className="border-t border-[#e4ded2] pt-2"
          >
            <summary className="cursor-pointer font-medium">{block.title}</summary>
            <p className="mt-1">{block.question}</p>
            <ul className="mt-2 space-y-1">
              {visible.map((item) => (
                <li
                  key={item.id}
                  data-testid={`s34-plan-item-${item.id}`}
                  className="flex flex-wrap items-center gap-2"
                >
                  <span className="min-w-0 flex-1">{item.label}</span>
                  <select
                    aria-label={item.label}
                    value={checkStateOf(draft, item.id)}
                    onChange={(event) =>
                      setCheck(item.id, event.target.value as ResearchPlanCheckState)
                    }
                    className="rounded-md border border-[#d5dfdc] bg-white px-2 py-1 text-xs"
                  >
                    {RESEARCH_PLAN_CHECK_STATES.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
            {hidden > 0 ? (
              <button
                type="button"
                data-testid={`s34-plan-more-${block.id}`}
                onClick={() => setExpanded((current) => ({ ...current, [block.id]: true }))}
                className="mt-2 cursor-pointer text-xs font-medium text-primary underline decoration-primary/40 underline-offset-2"
              >
                {t('Show more')}
              </button>
            ) : null}
            {expanded[block.id] && block.items.length > limit ? (
              <button
                type="button"
                data-testid={`s34-plan-less-${block.id}`}
                onClick={() => setExpanded((current) => ({ ...current, [block.id]: false }))}
                className="mt-2 cursor-pointer text-xs font-medium text-primary underline decoration-primary/40 underline-offset-2"
              >
                {t('Show less')}
              </button>
            ) : null}
            <input
              type="text"
              data-testid={`s34-plan-memo-${block.id}`}
              aria-label={`${block.title} — ${t('Notes')}`}
              placeholder={t('Notes')}
              value={draft.memos[block.id] ?? ''}
              onChange={(event) => setMemo(block.id, event.target.value)}
              className="mt-2 w-full rounded-md border border-[#d5dfdc] bg-white px-2 py-1 text-xs"
            />
          </details>
        )
      })}
    </div>
  )
}
