/**
 * 通用复制工具。
 *
 * 浏览器在**非安全上下文**（例如 `http://` + 公网 IP、自签证书）下不提供
 * `navigator.clipboard`，此时回退到隐藏 textarea + `document.execCommand('copy')`，
 * 保证内网/公网 IP 部署也能复制教程命令。
 *
 * 返回是否复制成功，调用方据此给出提示。
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && typeof window !== 'undefined') {
    const clipboard = navigator.clipboard
    if (clipboard?.writeText && window.isSecureContext) {
      try {
        await clipboard.writeText(text)
        return true
      } catch {
        // 权限被拒或接口异常：继续尝试回退方案
      }
    }
  }
  return legacyCopy(text)
}

function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined' || !document.body) return false

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  // 固定在视口外，避免页面滚动或闪烁
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  textarea.style.left = '-9999px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)

  const selection = document.getSelection()
  const previousRange =
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null

  try {
    textarea.select()
    // 兼容 iOS：setSelectionRange 才能让选中生效
    textarea.setSelectionRange(0, textarea.value.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
    // 恢复用户原有选区，避免影响页面上的其他选择
    if (previousRange && selection) {
      selection.removeAllRanges()
      selection.addRange(previousRange)
    }
  }
}
