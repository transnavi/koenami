/* The JSON-LD block of a page's head. Built here so no page holds a `<script` literal in
   its markup: the linter reads such a literal as a script block and cannot parse it. */
export const jsonLd = (data: string) => `<script type="application/ld+json">${data}</script>`;
