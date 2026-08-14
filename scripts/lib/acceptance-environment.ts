/** 移除验收子进程不需要的模型、CI、云端和签名秘密。 */
export function sanitizedAcceptanceEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const environment = { ...source }
  for (const name of Object.keys(environment)) {
    const normalized = name.toLocaleUpperCase('en-US')
    if (/(_API_KEY|_TOKEN|_SECRET|_PASSWORD)$/u.test(normalized)
      || normalized.startsWith('AWS_') || normalized.startsWith('AZURE_')
      || normalized.startsWith('WINDOWS_CERTIFICATE_') || normalized.startsWith('WINDOWS_SIGN')
      || normalized === 'GOOGLE_APPLICATION_CREDENTIALS') delete environment[name]
  }
  return environment
}
