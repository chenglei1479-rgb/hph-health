import type { NavigationView } from '@/stores/navigation-store'

// Variable definition and writing checks stay available in a project or the library.
// They are hidden on the home screen so the three starting entries are the only primary actions.
export const cornerFloatingEntriesVisible = (view: NavigationView): boolean => view !== 'home'
