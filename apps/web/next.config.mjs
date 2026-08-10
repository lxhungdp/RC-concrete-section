const nextConfig = {
  // Keep HMR usable when the local app is opened through either localhost or its loopback IP.
  allowedDevOrigins: ['127.0.0.1'],
  transpilePackages: ['@pm/geometry', '@structures/cad-drawing']
}

export default nextConfig
