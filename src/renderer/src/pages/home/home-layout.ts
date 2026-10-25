// Home screen rhythm. Three type styles, one card chrome, and an 8 / 16 / 24 / 32 spacing scale.
// shadow-card already draws the hairline, so cards do not add a second border.

export const homeTitleClassName = 'text-base font-medium leading-6 text-text-000'

export const homeBodyClassName = 'text-sm font-medium leading-5 text-text-000'

export const homeMutedClassName = 'text-xs font-normal leading-5 text-text-300'

export const homeWarningClassName =
  'text-xs font-normal leading-5 text-status-warning-foreground dark:text-status-warning-dark-foreground'

export const homeCardClassName = 'rounded-2xl bg-bg-000 shadow-card'

export const homeCardInteractiveClassName =
  'group flex w-full min-w-0 cursor-pointer flex-col rounded-2xl bg-bg-000 p-4 text-left shadow-card transition-colors hover:bg-bg-200 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-bg-000'

// Home primary row. At lg the row is two shared tracks: every entry card sits on the first one and the
// mentor-prep §34.2 note on the second. Each column owns a subgrid over those tracks, so all three
// cards get one height instead of each column sizing itself from its own copy — with Japanese copy the
// mentor card's longer description plus its two warning lines made the row look ragged and crowded.
export const homePrimaryGridClassName =
  'grid grid-cols-1 gap-4 lg:grid-cols-3 lg:grid-rows-[auto_auto]'

export const homePrimaryColumnClassName =
  'flex w-full min-w-0 flex-col gap-2 lg:row-span-2 lg:grid lg:grid-rows-subgrid'

export const homeIconTileClassName =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-bg-200 text-primary'
