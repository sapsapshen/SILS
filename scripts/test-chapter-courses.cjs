const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');

/* The chapter-tail cards are the one place where the reader and the /courses
 * catalogue meet, and every failure mode there is silent: a chapter mapping
 * that points at a chapter number nobody has simply never renders, and a card
 * that loses its license line still looks like a card. No runtime test covers
 * the reader, so this asserts the two contracts the block relies on: the
 * catalogue's chapter numbers are real, and the markup carries attribution.
 *
 * Everything here runs against the shipped sources, in a bare vm context --
 * chapter-courses.js writes to the DOM only inside render(), which the test
 * never calls. */

const DATA_SOURCE = readFileSync(join(__dirname, '..', 'assets', 'external-courses-data.js'), 'utf8');
const RENDER_SOURCE = readFileSync(join(__dirname, '..', 'assets', 'chapter-courses.js'), 'utf8');
const TOTAL_CHAPTERS = 35;

function boot(lang) {
  const window = {MSI18N: {lang: lang || 'zh'}};
  const sandbox = {window, console};
  vm.createContext(sandbox);
  vm.runInContext(DATA_SOURCE, sandbox);
  vm.runInContext(RENDER_SOURCE, sandbox);
  return window;
}

const LANGS = ['zh', 'en', 'es'];

test('catalogue carries 8 courses, each with three title/summary editions and a license', () => {
  const {EXTERNAL_COURSES: data} = boot();
  assert.equal(data.courses.length, 8, '课程数量变了；章节映射与 /courses 页面的计数需要一起更新');
  for (const course of data.courses) {
    for (const lang of LANGS) {
      assert.ok(course.title && course.title[lang], `${course.id} 缺少 ${lang} 标题`);
      assert.ok(course.summary && course.summary[lang], `${course.id} 缺少 ${lang} 摘要`);
      assert.ok(data.ui[lang].chapterTitle, `ui.${lang}.chapterTitle 缺失，章节卡片没有标题`);
    }
    assert.ok(course.license && course.license !== 'NONE', `${course.id} 没有许可证`);
    assert.match(course.url, /^https:\/\/github\.com\//, `${course.id} 的外链必须指向 GitHub`);
  }
});

test('every chapter mapping points at a real chapter and never repeats', () => {
  const {EXTERNAL_COURSES: data} = boot();
  for (const course of data.courses) {
    assert.ok(Array.isArray(course.silsChapters) && course.silsChapters.length, `${course.id} 没有章节映射`);
    const seen = new Set();
    for (const number of course.silsChapters) {
      assert.equal(typeof number, 'number', `${course.id} 的章节号必须是数字：${number}`);
      assert.ok(Number.isInteger(number) && number >= 1 && number <= TOTAL_CHAPTERS,
        `${course.id} 映射到不存在的第 ${number} 章（全书 ${TOTAL_CHAPTERS} 章）`);
      assert.ok(!seen.has(number), `${course.id} 重复映射第 ${number} 章`);
      seen.add(number);
    }
  }
});

test('a chapter sees exactly the courses mapped to it, strongest first', () => {
  const {ChapterCourses} = boot();
  // Array.from, not .map: the catalogue returns arrays built in the vm realm, and
  // strict deepEqual compares prototypes as well as contents.
  const agentChapter = Array.from(ChapterCourses.forChapter(27), course => course.id);
  assert.deepEqual(agentChapter.slice().sort(), ['ms-agents-beginners', 'ms-mcp-beginners', 'datawhale-hello-agents'].sort(),
    '第 27 章（MCP）的匹配课程集合变了');
  assert.equal(ChapterCourses.forChapter(2).length, 0, '第 2 章没有任何课程映射，应当保持为空');
  assert.equal(ChapterCourses.forChapter(999).length, 0, '不存在的章节号必须返回空，而不是抛错');
  assert.equal(ChapterCourses.forChapter('26').length, ChapterCourses.forChapter(26).length,
    '章节号以字符串传入时（chapter.number 的写法）必须与数字一致');
  // 第 26 章同时命中 4 门，其中两门 sils 相关度 5；星标更高的那门排第一。
  assert.equal(ChapterCourses.forChapter(26)[0].id, 'ms-genai-beginners',
    '同等相关度下应按星标降序，最强匹配必须先出现');
});

test('section() marks up attribution, the license and a safe external link', () => {
  const {ChapterCourses} = boot();
  const {count, html} = ChapterCourses.section(27, 'en');
  assert.equal(count, 3);
  assert.match(html, /Further courses for this chapter/, '英文标题缺失');
  assert.match(html, /License: MIT/, '许可证署名缺失');
  assert.match(html, /https:\/\/github\.com\/microsoft\/mcp-for-beginners/, '仓库外链缺失');
  assert.match(html, /rel="noopener noreferrer"/, 'target=_blank 必须配 rel=noopener noreferrer');
  assert.match(html, /See all 8 extended courses/, '「查看全部」的计数必须是全部课程数');
  assert.match(html, /href="courses.html"/, '「查看全部」必须回到 /courses 目录页');
  assert.match(html, /id="chapterCoursesTitle"/, 'index.html 的 aria-labelledby 指向这个 id');
});

test('the same chapter renders in all three languages, and an unmatched one renders nothing', () => {
  const {ChapterCourses} = boot();
  const zh = ChapterCourses.section(27, 'zh').html;
  const en = ChapterCourses.section(27, 'en').html;
  const es = ChapterCourses.section(27, 'es').html;
  assert.match(zh, /本章延伸课程/);
  assert.match(es, /Cursos complementarios/);
  assert.notEqual(zh, en, '语言切换后卡片文案没有变化');
  assert.notEqual(en, es, '英文与西语卡片文案相同');
  assert.equal(ChapterCourses.section(2, 'zh').html, '', '没有匹配时不能渲染空标题');
  assert.equal(ChapterCourses.section(2, 'zh').count, 0);
});

test('the card list is capped so a heavily mapped chapter cannot flood the tail', () => {
  const {ChapterCourses} = boot();
  const widest = Math.max(...Array.from({length: TOTAL_CHAPTERS}, (_, i) => ChapterCourses.forChapter(i + 1).length));
  assert.ok(widest <= 4, `有章节命中 ${widest} 门课程，超过卡片上限`);
  const busy = ChapterCourses.section(26, 'zh');
  assert.equal(busy.count, 4);
  assert.equal((busy.html.match(/class="chapter-course"/g) || []).length, 4);
});
