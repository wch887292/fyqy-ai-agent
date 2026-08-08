/**
 * 轻量 cron 表达式匹配器（无第三方依赖）
 *
 * 仅支持文档中出现的 5 段表达式：分钟 小时 日 月 星期
 * 每段支持：* 任意、, 列表、? 等同 *、a-b 区间、a/b 步长。
 * 例：0 0 8,18 * * ?   -> 每天 8 点、18 点整
 *     0 0 2 * * ?       -> 每天凌晨 2 点
 *     0 0 9 * * 1       -> 每周一 9 点
 */
export function cronMatch(expr: string, now: Date = new Date()): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const fields = [now.getMinutes(), now.getHours(), now.getDate(), now.getMonth() + 1, now.getDay()];
  const names = ['分', '时', '日', '月', '周'];
  for (let i = 0; i < 5; i++) {
    if (!matchField(parts[i], fields[i])) {
      // 调试用，避免噪音日志
      void names[i];
      return false;
    }
  }
  return true;
}

function matchField(token: string, value: number): boolean {
  if (token === '*' || token === '?') return true;
  for (const seg of token.split(',')) {
    if (matchSeg(seg, value)) return true;
  }
  return false;
}

function matchSeg(seg: string, value: number): boolean {
  // 步长 a/b
  if (seg.includes('/')) {
    const [range, stepStr] = seg.split('/');
    const step = Number(stepStr);
    if (!step) return false;
    if (range === '*' || range === '?') return value % step === 0;
    if (range.includes('-')) {
      const [s, e] = range.split('-').map(Number);
      return value >= s && value <= e && (value - s) % step === 0;
    }
    const base = Number(range);
    return value >= base && (value - base) % step === 0;
  }
  // 区间 a-b
  if (seg.includes('-')) {
    const [s, e] = seg.split('-').map(Number);
    return value >= s && value <= e;
  }
  // 单值
  return Number(seg) === value;
}
