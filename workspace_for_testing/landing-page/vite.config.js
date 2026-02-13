import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// OSC 8 超链接：让终端把「完整 URL（含端口和路径）」识别为可点击链接
const g = (s) => `\u001b[32m${s}\u001b[0m`
const b = (s) => `\u001b[1m${s}\u001b[0m`
function terminalHyperlinkUrlsPlugin() {
  return {
    name: 'terminal-hyperlink-urls',
    configureServer(server) {
      const origPrintUrls = server.printUrls.bind(server)
      server.printUrls = function () {
        if (!this.resolvedUrls) {
          origPrintUrls()
          return
        }
        const { resolvedUrls } = this
        const info = this.config.logger.info
        const link = (url) => `\u001b]8;;${url}\u0007${url}\u001b]8;;\u0007`
        for (const url of resolvedUrls.local) {
          info(`  ${g('➜')}  ${b('Local')}:   ${link(url)}`)
        }
        for (const url of resolvedUrls.network) {
          info(`  ${g('➜')}  ${b('Network')}: ${link(url)}`)
        }
      }
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), terminalHyperlinkUrlsPlugin()],
  server: {
    host: true,
    allowedHosts: true
  }
})
