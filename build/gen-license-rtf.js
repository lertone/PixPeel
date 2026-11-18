/* 由 LICENSE 生成安装向导的协议页 build/license.rtf
 *
 * 注意：electron-builder 只要在 build/ 里发现 license.rtf（或 license.txt / license.html），
 * 就只用这一个文件（见 app-builder-lib/out/util/license.js 的 getNotLocalizedLicenseFile），
 * license_zh_CN.rtf / license_en_US.rtf 会被完全忽略。所以这里生成的是中英双语单文件。
 *
 * 中文按 \uN? 转义（有符号 16 位），输出纯 ASCII，避免 NSIS 读成乱码。
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const lic = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8').replace(/\r\n/g, '\n');
const lines = lic.split('\n');
const start = lines.indexOf('Acceptance');
const end = lines.indexOf('---');
if (start < 0 || end < 0) throw new Error('LICENSE 结构不对（找不到 Acceptance 或 ---）');
const terms = lines.slice(start, end).join('\n').replace(/\n+$/, '');

const head = `PixPeel
PolyForm Noncommercial License 1.0.0 / PolyForm 非商用许可 1.0.0

PixPeel 采用 PolyForm 非商用许可 1.0.0。

- 非商业用途免费：个人学习、研究、爱好项目、教学、公益和宗教用途都可以免费使用，也可以阅读和修改源码。
- 商业用途需要事先授权：公司内部业务使用、打包进商业产品、或基于它提供收费服务，请先在 GitHub Issues 里说明用途。
- 1.0.7 及更早的版本按 MIT 协议发布，仍按原协议提供，不受本次变更影响。

PixPeel is licensed under the PolyForm Noncommercial License 1.0.0.

- Free for noncommercial use: personal study, research, hobby projects, teaching, charity and religious use, including reading and modifying the source.
- Commercial use needs a license first: using it for your company's business, shipping it inside a commercial product, or offering a paid service based on it - please open an issue on GitHub first.
- Releases up to and including v1.0.7 were published under the MIT License and stay available under those terms.

----------------------------------------------------------------
许可全文 / Full license text（英文为准 / authoritative in English）
https://polyformproject.org/licenses/noncommercial/1.0.0
----------------------------------------------------------------`;

const tail = `----------------------------------------------------------------

隐私：PixPeel 只在你自己的电脑上处理图片，没有账号、没有统计、没有遥测。
可选联网只有两处：(1) 检查 GitHub 上有没有新版本，(2) 第一次使用 AI 点选时下载模型。
详见应用内的隐私政策。

Privacy: PixPeel processes your images only on your computer. It has no accounts,
no analytics and no telemetry. Optional network use: (1) checking GitHub for a
newer version, (2) downloading the AI model the first time you use AI pick.
See the in-app Privacy Policy for details.`;

function esc(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (ch === '\\') out += '\\\\';
    else if (ch === '{') out += '\\{';
    else if (ch === '}') out += '\\}';
    else if (c < 128) out += ch;
    else {
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

const out = path.join(root, 'build/license.rtf');
fs.writeFileSync(out, rtf([head, terms, tail].join('\n\n')), 'latin1');
console.log('wrote', out, fs.statSync(out).size, 'bytes');
