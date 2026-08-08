import { Injectable, Logger } from '@nestjs/common';

/**
 * 文档解析引擎
 * 支持 pdf / word(docx) / excel(xlsx,xls,csv) / txt / md
 * 输出统一为纯文本，供切片与向量化使用
 */
@Injectable()
export class DocParserService {
  private readonly logger = new Logger('DocParser');

  /** 支持的扩展名 */
  static readonly SUPPORTED = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.csv', '.txt', '.md'];

  static isSupported(fileName: string): boolean {
    const ext = this.ext(fileName);
    return this.SUPPORTED.includes(ext);
  }

  static ext(fileName: string): string {
    const i = (fileName || '').lastIndexOf('.');
    return i < 0 ? '' : fileName.slice(i).toLowerCase();
  }

  async parse(fileName: string, buf: Buffer): Promise<string> {
    const ext = DocParserService.ext(fileName);
    try {
      switch (ext) {
        case '.pdf':
          return await this.parsePdf(buf);
        case '.docx':
        case '.doc':
          return await this.parseWord(buf);
        case '.xlsx':
        case '.xls':
        case '.csv':
          return this.parseExcel(buf);
        case '.txt':
        case '.md':
          return buf.toString('utf-8');
        default:
          // 未知类型尽力按文本读取
          return buf.toString('utf-8').replace(/[\x00-\x08\x0e-\x1f]/g, '');
      }
    } catch (e: any) {
      this.logger.error(`解析文档失败 ${fileName}: ${e.message}`);
      throw new Error(`文档解析失败：${e.message}`);
    }
  }

  private async parsePdf(buf: Buffer): Promise<string> {
    // 直接引用 lib 入口，规避 pdf-parse 包根部的调试分支
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require('pdf-parse/lib/pdf-parse.js');
    const data = await pdfParse(buf);
    return (data.text || '').trim();
  }

  private async parseWord(buf: Buffer): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mammoth = require('mammoth');
    const res = await mammoth.extractRawText({ buffer: buf });
    return (res.value || '').trim();
  }

  private parseExcel(buf: Buffer): string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const XLSX = require('xlsx');
    const wb = XLSX.read(buf, { type: 'buffer' });
    const parts: string[] = [];
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      if (csv.trim()) parts.push(`【工作表：${name}】\n${csv.trim()}`);
    }
    return parts.join('\n\n');
  }

  /**
   * 文本切片
   * 优先按段落/句号切分，保证语义完整；再按长度上限兜底
   */
  chunk(text: string, maxLen = 500, overlap = 60): string[] {
    const clean = (text || '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!clean) return [];
    if (clean.length <= maxLen) return [clean];

    // 先按段落聚合
    const paras = clean.split(/\n\s*\n/).filter((p) => p.trim());
    const chunks: string[] = [];
    let cur = '';

    const flush = () => {
      if (cur.trim()) chunks.push(cur.trim());
      cur = '';
    };

    for (const para of paras) {
      if ((cur + '\n' + para).length <= maxLen) {
        cur = cur ? cur + '\n' + para : para;
        continue;
      }
      flush();
      if (para.length <= maxLen) {
        cur = para;
        continue;
      }
      // 超长段落按句子切
      const sentences = para.split(/(?<=[。！？；!?;])/);
      let sub = '';
      for (const s of sentences) {
        if ((sub + s).length > maxLen) {
          if (sub.trim()) chunks.push(sub.trim());
          // 保留重叠，避免切断上下文
          sub = sub.length > overlap ? sub.slice(-overlap) + s : s;
        } else {
          sub += s;
        }
      }
      if (sub.trim()) cur = sub.trim();
    }
    flush();

    return chunks.filter((c) => c.length >= 5);
  }
}
