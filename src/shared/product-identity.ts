// User-visible product name for the window title, home header, about line, and
// native dialog titles. Change this one value to rename those surfaces.
//
// Installer productName, bundle display names, HTML <title>, and the web app
// manifest still duplicate the current value. src/main/app-branding.test.ts
// fails if the installer and HTML titles drift from this constant.
//
// Manuscript disclosures do not insert this value while it is still the
// development code name. They use neutral wording until a public name is set.
export const PRODUCT_DISPLAY_NAME = 'DRA'

// Legal name of the company that operates the product, used in disclosures.
// Leave empty until the real name is known. Empty renders a marked placeholder
// instead of omitting the provider.
export const OPERATOR_COMPANY_LEGAL_NAME = ''

// The development code name must not be written into a manuscript. Any other
// non-empty PRODUCT_DISPLAY_NAME is treated as the public name.
const DEVELOPMENT_CODE_NAME = 'DRA'

export const productNameIsPublic = (name: string): boolean => {
  const trimmed = name.trim()
  return trimmed.length > 0 && trimmed !== DEVELOPMENT_CODE_NAME
}
