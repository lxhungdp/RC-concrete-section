const nextConfig = {
  // The repository owns its agent instructions; next dev must not generate a second contract.
  agentRules: false,
  // Keep HMR usable when the local app is opened through either localhost or its loopback IP.
  allowedDevOrigins: ['127.0.0.1'],
  transpilePackages: ['@pm/geometry', '@structures/cad-drawing']
}

export default nextConfig
