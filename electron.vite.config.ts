import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import path from 'path'
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs'

// Copy resources to output directory after build
const copyResourcesPlugin = () => ({
  name: 'copy-resources',
  closeBundle() {
    const srcDir = path.resolve(__dirname, 'resources')
    const destDir = path.resolve(__dirname, 'out/resources')

    if (!existsSync(srcDir)) return

    mkdirSync(destDir, { recursive: true })

    const files = readdirSync(srcDir)
    for (const file of files) {
      copyFileSync(
        path.join(srcDir, file),
        path.join(destDir, file)
      )
    }
    console.log('Resources copied to:', destDir)
  }
})

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyResourcesPlugin()],
    build: {
      rollupOptions: {
        external: ['node-pty']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [copyResourcesPlugin()],
    optimizeDeps: {
      include: ['@xterm/headless']
    },
    build: {
      rollupOptions: {
        input: './src/renderer/index.html'
      }
    }
  }
})
