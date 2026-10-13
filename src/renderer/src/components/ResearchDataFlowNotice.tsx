import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings-store'
import { Button } from '@/components/ui/button'
import { configuredDataRoutes } from '../../../shared/research-data-flow'

type Props = { providerId?: string; model?: string; sessionContext?: boolean; compact?: boolean }
export const ResearchDataFlowNotice = ({
  providerId,
  model,
  sessionContext = false,
  compact = false
}: Props): React.JSX.Element => {
  const { t } = useTranslation()
  const providers = useSettingsStore((state) => state.providers)
  const defaultProvider = useSettingsStore((state) => state.activeProviderId)
  const defaultModel = useSettingsStore((state) => state.activeModel)
  const details = useSettingsStore((state) => state.sessionDetailsModel)
  const subagent = useSettingsStore((state) => state.subagentModel)
  const reviewer = useSettingsStore((state) => state.reviewerModel)
  const vision = useSettingsStore((state) => state.visionModel)
  const openSettings = useSettingsStore((state) => state.openSettingsToPanel)
  const routes = configuredDataRoutes({
    providers,
    providerId: sessionContext ? providerId : (providerId ?? defaultProvider),
    model: sessionContext ? model : (model ?? defaultModel),
    details,
    subagent,
    reviewer,
    vision
  })
  const roles = {
    main: t('Main model'),
    details: t('Titles and summaries'),
    subagent: t('Subagents'),
    reviewer: t('Reviewer'),
    vision: t('Image fallback model')
  }
  const contents = {
    main: t(
      'Messages, relevant history, prepared attachments, and tool-result content used for the task.'
    ),
    details: t('First user message text for generating the session title and summary.'),
    subagent: t(
      'Delegated instructions and the task context or evidence supplied to the subagent.'
    ),
    reviewer: t('Review instructions and the material supplied for review.'),
    vision: t(
      'Prepared images when a text-only model needs image fallback; derived evidence may then go to the main model.'
    )
  }
  return (
    <details
      className={
        compact
          ? 'shrink-0 border-b border-border-200 bg-bg-000 px-4 py-2'
          : 'rounded-xl border border-border-200 bg-bg-000 p-4'
      }
      data-testid="research-data-flow"
    >
      <summary className="cursor-pointer text-xs font-medium text-text-100">
        {t('Data destinations · Local-first does not mean offline')}
        <span className="ml-2 text-text-300">
          {routes[0].recipient ?? t('Recipient unknown')}
          {routes[0].endpoint ? ` · ${routes[0].endpoint}` : ''}
        </span>
      </summary>
      <div className="mt-3 max-h-[45vh] space-y-3 overflow-y-auto text-xs leading-5 text-text-300">
        <p>
          {sessionContext
            ? t('Configured routes for this conversation; not a log of actual network requests.')
            : t(
                'Default configured routes; a conversation may select a different main model. This is not a network-request log.'
              )}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left">
            <thead className="text-text-100">
              <tr>
                <th className="p-2">{t('Model role')}</th>
                <th className="p-2">{t('Recipient and endpoint')}</th>
                <th className="p-2">{t('Potential transmitted content')}</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((route) => (
                <tr key={route.role} className="border-t border-border-200 align-top">
                  <th className="p-2 font-medium text-text-100">{roles[route.role]}</th>
                  <td className="break-words p-2">
                    {route.status === 'disabled'
                      ? t('Disabled')
                      : (route.recipient ?? t('Recipient unknown'))}
                    {route.status !== 'disabled' ? (
                      <>
                        <div>{route.model ?? t('Model not specified')}</div>
                        <div>
                          {route.endpoint ?? t('Endpoint not available from this configuration')}
                        </div>
                        {route.loopback ? (
                          <div>{t('Loopback address; the service may still forward data.')}</div>
                        ) : null}
                      </>
                    ) : null}
                  </td>
                  <td className="p-2">
                    {route.status === 'disabled'
                      ? t('No call through this configured route.')
                      : contents[route.role]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          {t(
            'Connectors send query terms, identifiers, filters, and other tool arguments to their services. Remote compute sends selected scripts and inputs to the chosen host.'
          )}
        </p>
        <p>
          {t(
            'With remote browser access, uploads first reach the computer running DRA. Exact recipients depend on the selected connector, compute host, agent framework, and any forwarding service.'
          )}
        </p>
        <p>
          {t(
            'Review these recipients and content categories against your hospital policy before sending confidential data. A local file or loopback endpoint alone does not prove offline processing or institutional approval.'
          )}
        </p>
        <Button variant="outline" size="sm" onClick={() => openSettings('model')}>
          {t('Review model routing')}
        </Button>
      </div>
    </details>
  )
}
