// The root page is the Japanese studio. A visitor whose saved session names another
// language is sent to that language's page before anything renders; the page itself
// then loads that language's references. Runs as a classic script in <head>, so the
// redirect happens before the first paint. The list mirrors the locales in
// project.inlang/settings.json without the Japanese root; a new language is added here as well.
(function () {
  try {
    if (location.pathname !== '/') return;
    var session = JSON.parse(localStorage.getItem('koenami-session') || 'null');
    var lang = session && session.lang;
    if (lang && ['zh-CN', 'en', 'ko'].indexOf(lang) >= 0) location.replace('/' + lang + '/' + location.search + location.hash);
  } catch {}
})();
