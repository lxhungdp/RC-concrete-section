const majorLinePattern = /^(0|[1-9]\d*)\.x$/u
const stableVersionPattern = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u

const majorOfLine = (versionLine, label) => {
  const match = majorLinePattern.exec(versionLine)
  if (!match) {
    throw new Error(`${label} must be declared as a major version line such as 24.x.`)
  }
  return Number(match[1])
}

const majorOfStableVersion = (version) => {
  if (typeof version !== 'string') return null
  const match = stableVersionPattern.exec(version)
  return match ? Number(match[1]) : null
}

export const isVersionInMajorLine = (version, versionLine) =>
  majorOfStableVersion(version) === majorOfLine(versionLine, 'Supported version')

export const assertSupportedRuntime = ({ supportedNode, supportedNpm, actualNode, actualNpm }) => {
  const nodeIsSupported = isVersionInMajorLine(actualNode, supportedNode)
  const npmIsSupported = isVersionInMajorLine(actualNpm, supportedNpm)

  if (!nodeIsSupported || !npmIsSupported) {
    throw new Error(
      `Unsupported runtime: expected Node.js ${supportedNode} with npm ${supportedNpm}; ` +
        `received Node.js ${actualNode} with npm ${actualNpm ?? 'unknown'}. Run \`nvm use\` at the repository root.`,
    )
  }
}
