/* 由 LICENSE 生成安装向导用的三个 RTF：license.rtf（默认）、license_en_US.rtf、license_zh_CN.rtf
 * 中文按 \uN? 转义（和原文件一致），非 ASCII 一律转义，避免 NSIS 读成乱码。 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const lic = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8').replace(/\r\n/g, '\n');
const lines = lic.split('\n');
const start = lines.indexOf('Acceptance');
const end = lines.indexOf('---');
if (start < 0 || end < 0) throw new Error('LICENSE 结构不对');
const terms = lines.slice(start, end).join('\n').replace(/\n+$/, '');

const enIntro = `PixPeel
PolyForm Noncommercial License 1.0.0

PixPeel is free for noncommercial use. You may use it for personal study,
research, hobby projects, teaching, charity and religious purposes, and you may
read and modify the source. Commercial use - using it for your company's
business, shipping it inside a commercial product, or offering a paid service
based on it - needs a written license from the author.

Releases up to and including v1.0.7 were published under the MIT License and
stay available under those terms. This license applies to v1.0.8 and later.

Full terms: https://polyformproject.org/licenses/noncommercial/1.0.0
A copy is also installed next to the application as LICENSE. The English text
below is the authoritative version.`;

const enPrivacy = `Privacy: PixPeel processes your images only on your computer. It has no
accounts, no analytics and no telemetry. Optional network use: (1) checking
GitHub for a newer version, (2) downloading the AI model the first time you use
AI pick. See the in-app Privacy Policy for details.`;

const zhIntro = `PixPeel
PolyForm 非商用许可 1.0.0

PixPeel 可以免费用于非商业用途：个人学习、研究、爱好项目、教学、公益和宗教
用途，也可以阅读和修改源码。商业用途——公司业务使用、打包进商业产品、或基于
它提供收费服务——需要事先取得作者的书面授权。

1.0.7 及更早的版本按 MIT 协议发布，仍然按原协议提供，不受本次变更影响。
本协议从 1.0.8 开始生效。

完整条款：https://polyformproject.org/licenses/noncommercial/1.0.0
安装目录下也带了一份 LICENSE。下面附上英文原文，以英文原文为准。`;

const zhPrivacy = `隐私：PixPeel 只在你自己的电脑上处理图片，没有账号、没有统计、没有遥测。
可选联网只有两处：(1) 检查 GitHub 上有没有新版本，(2) 第一次使用 AI 点选时
下载模型。详见应用内的隐私政策。`;

function esc(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (ch === '\\') out += '\\\\';
    else if (ch === '{') out += '\\{';
    else if (ch === '}') out += '\\}';
    else if (c < 128) out += ch;
    else {
      /* RTF 用有符号 16 位表示 */
      const v = c > 32767 ? c - 65536 : c;
      out += '\\u' + v + '?';
    }
  }
  return out;
}

function rtf(text) {
  const body = text.replace(/\r\n/g, '\n').split('\n')
    .map((l) => (l.trim() === '' ? '\\par' : esc(l) + '\\par'))
    .join('\n');
  return `{\\rtf1\\ansi\\ansicpg936\\deff0{\\fonttbl{\\f0\\fnil\\fcharset134 Microsoft YaHei;}{\\f1\\fnil\\fcharset0 Segoe UI;}}\\f0\\fs20 ${body}\n}`;
}

const en = [enIntro, terms, enPrivacy].join('\n\n');
const zh = [zhIntro, terms, zhPrivacy].join('\n\n');

fs.writeFileSync(path.join(root, 'build/license.rtf'), rtf(en), 'latin1');
fs.writeFileSync(path.join(root, 'build/license_en_US.rtf'), rtf(en), 'latin1');
fs.writeFileSync(path.join(root, 'build/license_zh_CN.rtf'), rtf(zh), 'latin1');
console.log('license.rtf', fs.statSync(path.join(root, 'build/license.rtf')).size);
console.log('license_en_US.rtf', fs.statSync(path.join(root, 'build/license_en_US.rtf')).size);
console.log('license_zh_CN.rtf', fs.statSync(path.join(root, 'build/license_zh_CN.rtf')).size);

