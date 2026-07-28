import type { NextConfig } from "next"

/**
 * GitHub Pages(org 사이트 하위 경로 /ip-platform)로 정적 배포한다.
 * 서버 런타임이 없으므로 서버 액션·동적 라우트 핸들러·ISR은 사용하지 않는다.
 */
const nextConfig: NextConfig = {
  // 상위 디렉터리의 lockfile 을 워크스페이스 루트로 오인하지 않게 고정한다.
  turbopack: { root: import.meta.dirname },
  output: "export",
  images: { unoptimized: true },
  basePath: "/ip-platform",
  assetPrefix: "/ip-platform",
  trailingSlash: true,
}

export default nextConfig
