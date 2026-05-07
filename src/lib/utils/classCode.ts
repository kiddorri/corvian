export function generateClassCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'KRS-'
  for (let i = 0; i < 3; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}
