import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Alert, Button, Select, Space, Tag, Typography, message } from 'antd'
import { CheckOutlined, CopyOutlined } from '@ant-design/icons'
import { copyText } from '@/utils/clipboard'

const { Text, Paragraph } = Typography

interface SshGuideValues {
  host?: string
  port?: number
  username?: string
  keyAlias?: string
}

interface GuideStep {
  key: string
  title: string
  detail: string
  command: string
  note?: string
}

interface SystemGuide {
  label: string
  steps: GuideStep[]
}

/** Ubuntu / Debian 目标机的 SSH 准备步骤（命令中的占位符按当前表单值渲染） */
const UBUNTU_STEPS: GuideStep[] = [
  {
    key: 'target-ssh',
    title: '1. 目标机：确认 SSH 服务已启动',
    detail: '在目标 Linux 宿主机（不是 runner 容器）执行；已启用 SSH 时可只跑后两条。',
    command: [
      'sudo apt update && sudo apt install -y openssh-server',
      'sudo systemctl enable --now ssh',
      "sudo sshd -T | grep '^port '",
    ].join('\n'),
    note: '按目标机防火墙与云安全组规则，对主节点来源开放实际 SSH 端口。',
  },
  {
    key: 'run-user',
    title: '2. 主节点：确认运行 FlowOps 的用户',
    detail: '私钥属主必须与运行 FlowOps 的用户一致，先确认再填写下面的属主命令。',
    command: [
      '# 容器运行：容器名按实际替换，容器内以 root 运行时输出 root',
      'docker exec flowops id -un',
      '# 宿主机 / WSL 直接运行 Java：输出运行该进程的用户（如 lihao）',
      "ps -o user= -p \"$(pgrep -f '[f]lowops' | head -1)\"",
    ].join('\n'),
    note: '两种部署的运行用户通常不同：容器默认 root，宿主机/WSL 直连则是启动 Java 的那个用户。下一步的 RUN_USER 要按这里的结果填。',
  },
  {
    key: 'master-key',
    title: '3. 主节点：预置专用私钥并设置属主与权限',
    detail: '在运行 FlowOps 的主节点宿主机执行；把 RUN_USER 换成上一步查到的用户。注意 chmod 只改权限、不改属主，属主必须显式设置。',
    command: [
      '# RUN_USER 按上一步结果替换：容器通常为 root；宿主机 / WSL 直连为实际运行用户',
      'RUN_USER=root',
      'sudo install -d -m 700 -o "$RUN_USER" -g "$RUN_USER" /data/flowops/ssh-keys',
      "sudo ssh-keygen -t ed25519 -N '' -f /data/flowops/ssh-keys/{{keyAlias}}",
      'sudo chown "$RUN_USER":"$RUN_USER" /data/flowops/ssh-keys/{{keyAlias}} /data/flowops/ssh-keys/{{keyAlias}}.pub',
      'sudo chmod 600 /data/flowops/ssh-keys/{{keyAlias}}',
      'sudo chmod 644 /data/flowops/ssh-keys/{{keyAlias}}.pub',
    ].join('\n'),
    note: '密钥目录 700、私钥 600，因此目录与文件都必须属于运行用户，否则会返回 KEY_NOT_FOUND / KEY_UNREADABLE。当前不支持带口令私钥，也不要使用符号链接。更换运行用户或部署方式后，重跑 chown/chmod 即可，不必重新生成密钥。路径以主节点 flowops.ssh.key-dir 配置为准。',
  },
  {
    key: 'install-pub',
    title: '4. 主节点：把公钥安装到目标机',
    detail: '把上一步生成的公钥追加到目标用户的 authorized_keys；首次连接前先用下一步在目标机核对主机指纹。',
    command:
      'sudo ssh-copy-id -i /data/flowops/ssh-keys/{{keyAlias}}.pub -p {{port}} {{username}}@{{host}}',
    note: '目标机无 ssh-copy-id 时，可在该用户会话执行 install -d -m 700 ~/.ssh 后手工追加公钥单行内容并 chmod 600。',
  },
  {
    key: 'fingerprint',
    title: '5. 目标机：读取主机密钥指纹',
    detail: '在目标机可信控制台执行，把输出里的 SHA256:... 填入上方“主机密钥指纹”。',
    command: 'sudo ssh-keygen -E sha256 -lf /etc/ssh/ssh_host_ed25519_key.pub',
    note: '指纹必须与上方所选“主机密钥算法”取自同一把主机公钥；不要填写网络扫描得到的未核实值。重装或更换主机密钥后需重新核对。',
  },
]

/** 已支持的系统教程；新增系统时在此登记即可，选择器会自动出现（见 SYSTEM_OPTIONS） */
const SYSTEM_GUIDES: Record<string, SystemGuide> = {
  ubuntu: { label: 'Ubuntu / Debian', steps: UBUNTU_STEPS },
}

/** 系统选择项：尚未提供教程的系统先占位，便于后续扩展 */
const SYSTEM_OPTIONS: Array<{ value: string; label: string; disabled?: boolean }> = [
  { value: 'ubuntu', label: 'Ubuntu / Debian' },
  { value: 'centos', label: 'CentOS / RHEL（即将支持）', disabled: true },
  { value: 'windows', label: 'Windows（即将支持）', disabled: true },
]

const TROUBLESHOOTING: Array<{ code: string; tip: string }> = [
  {
    code: 'KEY_NOT_FOUND',
    tip: '主节点密钥目录缺少该别名的私钥文件；也检查目录属主/权限是否让运行用户可进入（别名不要填 .pub 或路径）',
  },
  {
    code: 'KEY_PERMISSION_TOO_OPEN',
    tip: '私钥对 group/other 可读：需 chmod 600 或更严（chmod 不改属主，属主问题见下一行）',
  },
  {
    code: 'KEY_UNREADABLE',
    tip: '私钥属主不是运行 FlowOps 的用户（用 chown 修正），或密钥带口令/格式不受支持',
  },
  { code: 'CONNECT_FAILED', tip: '主节点到目标机的地址、端口、路由与防火墙' },
  { code: 'HOST_KEY_MISMATCH', tip: '主机密钥算法与指纹必须取自同一把目标机主机公钥' },
  { code: 'AUTH_FAILED', tip: '目标用户的 authorized_keys 内容与权限、用户名是否正确' },
]

const codeStyle: CSSProperties = {
  background: '#1e1e1e',
  color: '#d4d4d4',
  padding: '10px 72px 10px 12px',
  borderRadius: 4,
  fontSize: 12,
  lineHeight: 1.7,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  margin: 0,
}

function renderCommand(command: string, values: SshGuideValues): string {
  return command
    .replaceAll('{{host}}', values.host?.trim() || '<目标地址>')
    .replaceAll('{{port}}', String(values.port || 22))
    .replaceAll('{{username}}', values.username?.trim() || '<目标用户名>')
    .replaceAll('{{keyAlias}}', values.keyAlias?.trim() || 'runner-1')
}

/**
 * SSH 配置教程（当前提供 Ubuntu / Debian）。
 * 命令按当前表单值渲染，每步可一键复制；复制走通用实现，兼容无 HTTPS 的
 * 公网 IP 部署（见 utils/clipboard）。
 */
export default function SshSetupGuide({ values }: { values: SshGuideValues }) {
  const [system, setSystem] = useState('ubuntu')
  const [copiedKey, setCopiedKey] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  const guide = SYSTEM_GUIDES[system] ?? SYSTEM_GUIDES.ubuntu

  const handleCopy = async (command: string, key: string) => {
    const ok = await copyText(command)
    if (!ok) {
      message.error('复制失败，请手动选中命令后复制')
      return
    }
    setCopiedKey(key)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopiedKey(''), 2000)
  }

  return (
    <div>
      <Space style={{ marginBottom: 12 }} wrap>
        <Text>目标机系统</Text>
        <Select
          size="small"
          style={{ width: 220 }}
          value={system}
          onChange={setSystem}
          options={SYSTEM_OPTIONS}
        />
        <Text type="secondary" style={{ fontSize: 12 }}>
          当前支持 {guide.label}；教程命令按上方表单值填充，可直接复制执行
        </Text>
      </Space>

      {guide.steps.map((step) => {
        const command = renderCommand(step.command, values)
        const copied = copiedKey === step.key
        return (
          <div key={step.key} style={{ marginBottom: 16 }}>
            <Text strong>{step.title}</Text>
            <Paragraph type="secondary" style={{ fontSize: 12, margin: '4px 0 6px' }}>
              {step.detail}
            </Paragraph>
            <div style={{ position: 'relative' }}>
              <pre style={codeStyle}>{command}</pre>
              <Button
                size="small"
                type="text"
                icon={copied ? <CheckOutlined /> : <CopyOutlined />}
                onClick={() => handleCopy(command, step.key)}
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  color: copied ? '#52c41a' : '#d4d4d4',
                }}
              >
                {copied ? '已复制' : '复制'}
              </Button>
            </div>
            {step.note && (
              <Paragraph type="warning" style={{ fontSize: 12, margin: '6px 0 0' }}>
                {step.note}
              </Paragraph>
            )}
          </div>
        )
      })}

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        title="填写要点"
        description="宿主机地址只填 IP 或域名（不带 ssh:// 与端口）；私钥别名只填文件名；指纹是目标机主机公钥的 SHA-256，不是登录密钥的指纹。私钥属主需与运行 FlowOps 的用户一致（容器通常 root；宿主机/WSL 直连 Java 时为该运行用户）。修改设置会清空上次测试结果，需重新测试连接。"
      />

      <Text strong>常见失败结果码</Text>
      <div style={{ marginTop: 8 }}>
        {TROUBLESHOOTING.map((item) => (
          <div key={item.code} style={{ fontSize: 12, marginBottom: 4 }}>
            <Tag style={{ marginRight: 8 }}>{item.code}</Tag>
            <Text type="secondary">{item.tip}</Text>
          </div>
        ))}
      </div>
    </div>
  )
}
