import { afterEach, expect, it, vi } from 'vitest'
import { checkConnectorQueryArgs, installMachineApproval, installPhiGate } from '../../phi/gate'
import { detectPhi } from '../../phi/detect'
import { releaseTextThroughPhiGate } from './notebook-phi-release'

// This bounded ward label has zero lightweight detections. The installed scanner
// must still receive the complete text, not just an empty health probe.
afterEach(() => {
  installPhiGate(null)
  installMachineApproval(null)
})

it.each(['notebook', 'connector'])('fully scans a zero-detection %s label', async (path) => {
  const release = vi.fn((text: string) => ({
    text: text ? '[fictional-masked-label]' : '',
    replacements: [],
    warnings: []
  }))
  expect(detectPhi('123病棟')).toEqual([])
  installMachineApproval(() => true)
  installPhiGate({ release, restore: (text) => text })
  if (path === 'notebook') {
    expect(await releaseTextThroughPhiGate('123病棟', 'fiction', 'refused')).toBe(
      '[fictional-masked-label]'
    )
  } else {
    const send = vi.fn()
    await expect(checkConnectorQueryArgs({ query: '123病棟' }).then(send)).rejects.toThrow(
      /search terms changed/
    )
    expect(send).not.toHaveBeenCalled()
  }
  expect(release).toHaveBeenCalledWith('123病棟', expect.any(String))
})
