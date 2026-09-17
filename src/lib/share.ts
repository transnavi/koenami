import { cardSVG, CARD_WIDTH, CARD_HEIGHT, type CardScorer } from './card';
import { resultParams, shareText, type ScoreResult, type MetricKey } from './score';
/* Everything a result needs to leave the app: its URL, the post text, the card
   as SVG and PNG, and the intent links. The result URL carries only the five
   measurements; the receiving page and the Worker recompute the score from them. */
export const HASHTAG = 'Koenami';
export const ICONS: Record<string, string> = {
	x: '<path d="M17.5 3h3l-7.1 8.2L21.7 21h-6.3l-4.6-6-5.3 6H2.5l7.6-8.7L2.2 3h6.4l4.2 5.5Zm-1.1 16.2h1.7L7.7 4.7H5.8Z" fill="currentColor" stroke="none"/>',
	bluesky:
		'<path d="M12 10.8c-1-2-3.8-5.7-6.4-7.5C3.2 1.5 2 1.8 1.6 2.2 1.1 2.6.8 3.6 1 5.1c.1 1 .8 5.7 1.3 6.9.8 2 2.7 2.7 5.2 2.4-3.7.6-6.9 1.9-2.7 6.6 4.7 4.8 6.4-1 7.2-4 .8 3 1.7 8.7 7.1 4 4.1-4 1.1-6-2.6-6.6 2.5.3 4.4-.4 5.2-2.4.5-1.2 1.2-5.9 1.3-6.9.2-1.5-.1-2.5-.6-2.9-.4-.4-1.6-.7-4 1.1C15.8 5.1 13 8.8 12 10.8Z" fill="currentColor" stroke="none"/>',
	misskey:
		'<path d="M3.5 19V7.2c0-1.3 1-2.2 2.2-2.2 1 0 1.6.5 2.1 1.4L12 12.5l4.2-6.1c.5-.9 1.1-1.4 2.1-1.4 1.2 0 2.2.9 2.2 2.2V19" stroke-width="2.8"/><path d="M12 12.5V19" stroke-width="2.8"/>',
	share:
		'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
	link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5"/>',
	download: '<path d="M12 3v13m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
	external:
		'<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
	image:
		'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-9 9"/>'
};
export const icon = (name: string) =>
	`<svg class="share-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
/* Render a share control's content: icon plus visible label. */
export const labelled = (name: string, text: string) => `${icon(name)}<span>${text}</span>`;

let fonts: Record<string, string> | null = null;
async function loadFonts() {
	if (fonts) return fonts;
	const load = async (weight: number) => {
		const bytes = new Uint8Array(
			await (await fetch(`/fonts/koenami-share-${weight}.ttf`)).arrayBuffer()
		);
		let binary = '';
		for (let i = 0; i < bytes.length; i += 0x8000)
			binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
		return `data:font/ttf;base64,${btoa(binary)}`;
	};
	const [regular, bold] = await Promise.all([load(400), load(700)]);
	return (fonts = { 400: regular, 700: bold });
}
export function resultURL(
	features: Record<MetricKey, number>,
	lang: string,
	origin = location.origin
) {
	return `${origin}/r?${resultParams(features, lang)}`;
}
export type Intent = { id: string; label: string; icon: string; href: string };
export function intents(url: string, text: string): Intent[] {
	return [
		{
			id: 'x',
			label: 'X',
			icon: 'x',
			href: `https://x.com/intent/post?${new URLSearchParams({ text, url, hashtags: HASHTAG })}`
		},
		{
			id: 'bluesky',
			label: 'Bluesky',
			icon: 'bluesky',
			href: `https://bsky.app/intent/compose?${new URLSearchParams({ text: `${text} #${HASHTAG}\n${url}` })}`
		},
		{
			id: 'misskey',
			label: 'Misskey',
			icon: 'misskey',
			href: `https://misskey-hub.net/share/?${new URLSearchParams({ text: `${text} #${HASHTAG}`, url, visibility: 'public' })}`
		}
	];
}
export async function cardImage(result: ScoreResult, scorer: CardScorer): Promise<File> {
	const svg = cardSVG(result, scorer, { fonts: await loadFonts() });
	const image = new Image();
	image.decoding = 'async';
	const source = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
	try {
		await new Promise<void>((ok, fail) => {
			image.onload = () => ok();
			image.onerror = () => fail(new Error('画像を作成できませんでした。'));
			image.src = source;
		});
	} finally {
		URL.revokeObjectURL(source);
	}
	const canvas = document.createElement('canvas');
	canvas.width = CARD_WIDTH;
	canvas.height = CARD_HEIGHT;
	canvas.getContext('2d')!.drawImage(image, 0, 0);
	const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'));
	if (!blob) throw new Error('画像を作成できませんでした。');
	return new File([blob], `koenami-${result.display}.png`, { type: 'image/png' });
}
export function shareBundle(result: ScoreResult, scorer: CardScorer, lang: string) {
	const url = resultURL(result.features, lang),
		text = shareText(result);
	return { url, text, svg: cardSVG(result, scorer), intents: intents(url, text) };
}
export async function systemShare(
	result: ScoreResult,
	scorer: CardScorer,
	lang: string
): Promise<boolean> {
	const { url, text } = shareBundle(result, scorer, lang);
	const file = await cardImage(result, scorer);
	const withFile = { title: 'Koenami', text: `${text} #${HASHTAG}`, url, files: [file] };
	if (navigator.canShare?.(withFile)) {
		await navigator.share(withFile);
		return true;
	}
	if (navigator.share) {
		await navigator.share({ title: 'Koenami', text: `${text} #${HASHTAG}`, url });
		return true;
	}
	return false;
}
