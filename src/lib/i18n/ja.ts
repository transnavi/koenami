/* 日本語。キーの並びは画面の上から下、続いて app.js の処理順。
   {name} は差し込み、{n} を持つ {one, other} は数による使い分け、配列は箇条書き。 */
const ja = {
	'page.title': 'Koenami · 女声・男声のボイトレツール',
	'page.description':
		'両声類を目指す方、トランスジェンダーの方、女声・男声を出してみたい方向けの無料ボイトレツール。見本の声を真似して録音すると、自分の声が見本と同じ地図に表示され、近づきたい声との距離が見えます。リアルタイム測定にも対応。',
	'page.browser_requirements': 'マイクを使えるブラウザー',
	'page.publisher': 'とらんすナビ',

	'toolbar.language': '言語（画面と見本）',
	'toolbar.guide': '画面ガイド',
	'toolbar.share': '判定を共有',
	'toolbar.settings': '設定',
	'toolbar.info': '出典と関連ツール',
	'toolbar.theme': '明暗を切り替え',

	'common.self': '自分',
	'common.reference': '見本',
	'common.close': '閉じる',
	'common.save': '保存',

	'profile.aria': '5つの声の指標',
	'profile.heading': '声の特徴',
	'profile.canvas_aria': '自分と見本の5指標を重ねた図',
	'profile.indicators_aria': '声の指標',
	'profile.fit': '見本との差',
	'profile.fit_title': '比較レポートを開く',
	'profile.fit_title_ready':
		'見本との距離（5指標を標準化、0で一致）。押すと比較レポートが開きます。',
	'verdict.heading': '声の判定',
	'verdict.end_male': '男性的 −100',
	'verdict.end_center': '0',
	'verdict.end_female': '女性的 +100',

	'graph.aria': '声の比較',
	'graph.canvas_aria': '声の分布。スクロールで拡大縮小、ドラッグで回転、Shift＋ドラッグで移動。',
	'graph.projection_variance': '主成分',
	'graph.projection_variance_title':
		'全体のばらつきが大きい方向から表示します（主成分分析）。女性・男性のラベルは使いません。',
	'graph.projection_contrast': '男女差',
	'graph.projection_contrast_title':
		'女性的な声と男性的な声が最も離れる方向を横軸にします。ラベル付きの見本から計算します。',
	'graph.auto_rotate': '自動回転',
	'graph.auto_rotate_title': '3Dの自動回転を切り替え',
	'graph.space_label': '声の分布',
	'graph.space_title': '5つの指標から計算した主成分空間',
	'graph.space_title_contrast':
		'5つの指標から計算。横軸は女性的な声と男性的な声が最も離れる方向です。',
	'graph.zoom_in': '拡大',
	'graph.zoom_out': '縮小',
	'graph.find_me': '声の広がりに表示を合わせる',
	'graph.reset': '表示をリセット',
	'group.female': '女性的な声',
	'group.male': '男性的な声',
	'group.androgynous': '中性的な声',
	'group.all': 'すべての声',
	'group.favorites': '★ お気に入り',
	'group.custom': '読み込んだ声',

	'signal.aria': '波形とスペクトルの比較',
	'signal.view_aria': '音声の表示',
	'signal.pitch': '高さ',
	'signal.spectrogram': 'スペクトログラム',
	'signal.spectrum': 'スペクトル',
	'signal.waveform': '波形',
	'signal.both': '重ねる',
	'signal.both_title': '長さをそろえて重ねて表示します',
	'signal.both_title_on': '各範囲の長さを0〜100%にそろえます。単語の位置は一致しません。',
	'signal.words': '単語',
	'signal.words_title': '文字起こしと単語分割',
	'signal.range_reset': '選択範囲を解除',
	'signal.range_reset_title': '選択範囲を解除（Esc）',
	'signal.canvas_aria':
		'波形をクリックして再生位置を移動、ドラッグして範囲を選択。左右キーで再生位置を移動。高さの目盛りをクリックするとHzと音名が切り替わります。',
	'signal.word_list_aria': '推定した単語の位置',
	'signal.word_title': '{start}–{end}s · 推定位置',

	'samples.aria': '見本の音声',
	'samples.browser_aria': '見本を選ぶ',
	'samples.heading': '見本の声',
	'samples.add': '見本の音声を読み込む',
	'samples.group_aria': '見本の種類',
	'samples.sort_aria': '並び順',
	'sort.name': '話者名順',
	'sort.near': '自分の声に近い順',
	'sort.low': '高さが低い順',
	'sort.high': '高さが高い順',
	'samples.search': '検索',
	'samples.search_aria': '見本を検索',
	'samples.more': 'もっと見る',
	'lab.teacher': '講師',
	'lab.pitch': '高さ',
	'lab.pitch_aria': '講師の声の高さ',
	'lab.resonance': '響き',
	'lab.resonance_aria': '講師の響き',
	'lab.weight': '重さ',
	'lab.weight_aria': '講師の声の重さ',
	'lab.low': '低い',
	'lab.med': '中間',
	'lab.high': '高い',
	'lab.light': '軽い',
	'lab.heavy': '重い',
	'jvs.banner_title': 'JVSの見本を追加',
	'jvs.banner_count': '100人 · 5,000音声',
	'jvs.download': 'ダウンロード ↗',
	'jvs.download_title': 'JVS公式配布（ZIP、約3.5GB）',
	'jvs.import': '読み込む',
	'jvs.added': '{n}音声を追加済み',
	'jvs.cancelled': '中止しました。読み込み済みの音声は保存されています。',
	'jvs.index_failed': 'JVSの一覧を取得できませんでした。',
	'jvs.audio_missing': 'JVSの音声が見つかりません。もう一度追加してください。',
	'jvs.no_match':
		'対応するJVS音声が見つかりませんでした。公式のZIPか、展開したフォルダーを選んでください。',
	'jvs.quota': '保存容量が足りません。話者ごとのフォルダーを選ぶと、一部だけ追加できます。',
	'jvs.size_mismatch': '音声ファイルのサイズが一致しません。',
	'jvs.hash_mismatch': '公式音声と一致しないファイルがあります。公式のZIPを選び直してください。',

	'target.aria': '選んだ音声',
	'target.play': '見本を再生',
	'target.pause': '見本を一時停止',
	'target.pick': '見本を選ぶ',
	'target.favorite': 'お気に入り',
	'target.favorite_add': '見本をお気に入りに追加',
	'target.source': '出典',
	'target.seek_aria': '見本の再生位置',
	'target.meta_synthetic': '合成音声',
	'target.analysis_error': '見本の解析：{message}',
	'favorite.add': 'お気に入りに追加',
	'favorite.remove': 'お気に入りから外す',
	'favorite.add_clip': '{name} をお気に入りに追加',
	'favorite.remove_clip': '{name} をお気に入りから外す',
	'favorite.marked': 'お気に入りあり',

	'record.title': '録音（R）',
	'record.aria': '新しく録音',
	'record.stop': '録音を停止',
	'record.stop_title': '録音を停止（R）',
	'play.label': '再生',
	'play.own': '自分の声を再生',
	'play.own_title': '自分の声を再生（Space）',
	'play.own_pause': '自分の声を一時停止',
	'takes.menu': '録音履歴',
	'takes.retry': '再解析',
	'takes.default_name': '録音 {n}',
	'live.label': 'リアルタイム',
	'live.measuring': '測定中',
	'live.title': 'マイクの声をリアルタイムに表示',
	'live.start': 'リアルタイム測定を開始',
	'live.stop': 'リアルタイム測定を停止',
	'live.stop_title': 'リアルタイム測定を停止（Esc）',
	'loopback.aria': '自分の声を聴く',
	'loopback.title': '自分の声を聴く（イヤホン推奨）',
	'loopback.stop': '自分の声の再生を止める',
	'speed.aria': '再生速度',
	'speed.reset': '標準速度に戻す',
	'ab.title': '見本、自分の順に再生',
	'upload.title': '音声を読み込む',
	'state.recording': '録音中',
	'state.preparing': '準備中',
	'state.analyzing': '解析中',

	'import.heading': '見本を追加',
	'import.audio': '音声ファイルを選ぶ',
	'import.jvs_heading': 'JVSを追加',
	'import.jvs_site': '公式サイトでダウンロード ↗',
	'import.jvs_hint': '公式のZIP、または展開したフォルダーを選択。100人・5,000音声を追加できます。',
	'import.zip': 'ZIPを選ぶ',
	'import.folder': 'フォルダーを選ぶ',
	'import.progress_aria': 'JVSの読み込み',
	'import.cancel': '中止',
	'import.terms':
		'音声の利用はJVSの規約に従ってください。読み込んだ見本は、このブラウザーに保存されます。',

	'settings.heading': '設定',
	'settings.theme': '配色',
	'theme.light': 'ライト',
	'theme.dark': 'ダーク',
	'theme.system': '端末に合わせる',
	'settings.live_window': 'リアルタイムの解析時間',
	'settings.live_shape': 'リアルタイムに表示する時間',
	'settings.seconds': '{n} 秒',
	'settings.normalize': '再生音量をそろえる',
	'settings.export': '測定値を書き出す',
	'settings.takes': '録音履歴',
	'settings.download_all': 'まとめてダウンロード',
	'settings.delete_all': 'すべて削除',

	'info.about1':
		'両声類を目指す方、トランスジェンダーの方、女声・男声を出してみたい方のためのボイトレツールです。見本の声を選び、真似するように録音すると、自分の声が見本と同じ地図に表示され、近づきたい声にどれくらい近いかが分かります。リアルタイム測定では、声を変えながら地図の上の位置が動くのを見て、寄せていく方向をつかめます。',
	'info.about2':
		'見本は日本語のほか、中国語・英語・韓国語を収録しています。無料・オープンソースで公開しており、録音はブラウザーの中に保存されます。',
	'info.guide': '使い方 ↗',
	'info.tutorial': '声のしくみと練習の手引き ↗',
	'info.method': '測定方法と出典 ↗',
	'info.references': '参考文献 ↗',
	'info.source': 'ソースコード（GitHub） ↗',
	'info.colors': '配色の参考：',

	'rename.heading': '名前の変更',
	'rename.aria': '録音の名前',
	'rename.empty': '名前を入力してください。',
	'rename.failed': '名前を変更できませんでした。もう一度お試しください。',
	'report.heading': '比較',
	'report.save': 'レポートを保存',
	'metric.factors': '何で変わるか',
	'metric.caveats': '注意',

	'share.heading': '声の判定',
	'share.help': '判定の読み方',
	'share.age_label': '聞こえる年齢のめやす',
	'share.age_run': '推定する',
	'share.age_running': '推定中…',
	'share.age_include': '画像とリンクに含める',
	'share.age_note':
		'年齢の推定モデル（audEERING）の参考値です。日本語の声や練習中の声について「何歳に聞こえるか」と合うかは確かめていません。音声は推定のためだけに送信され、保存されません。',
	'share.age_value': '{age}（4秒ごとの推定 {low}〜{high}）',
	'share.age_years': '約{n}歳',
	'share.group_aria': '結果を共有',
	'share.system': '共有…',
	'share.copy': 'リンクをコピー',
	'share.copied': 'リンクをコピーしました。',
	'share.save': '画像を保存',
	'share.open': '結果ページ',
	'share.post_to': '{name}に投稿',
	'share.image_alt': '{text}。5つの指標と見本の分布を描いた画像。',
	'share.history': '判定の推移',
	'share.history_sub': 'この端末の録音',
	'share.history_aria': '録音ごとの判定の推移',
	'share.history_note':
		'古い録音は判定の条件（有声区間など）を記録していないため、条件を確認せずに表示しています。',
	'share.note':
		'リンクには5つの測定値だけが含まれます。録音は送信されません。判定の読み方は<a href="/method.html" target="_blank">測定方法と出典</a>にあります。',
	'share.unavailable': 'この言語の見本では判定を計算できません',
	'share.text': '私の声は{verdict}でした（{leaning} {score}）',
	'share.image_failed': '画像を作成できませんでした。',
	'history.current': '表示中',
	'history.open': '開く',
	'history.open_title': 'この録音を表示',

	'metric.f0.label': '高さ',
	'metric.f0.unit': 'Hz',
	'metric.f0.description':
		'声帯の振動の速さです。有声音の基本周波数（F0）の中央値を使います。値が大きいほど高い声です。帯は参照グループの見本の中央80%を示します。',
	'metric.f0.factors': [
		'声帯の張り（喉頭の筋肉の使い方）と声帯の質量',
		'喉頭の高さ、息の量、力み',
		'文の種類と感情。疑問文や強調では上がります'
	],
	'metric.f0.caveats': [
		'高さだけでは性別の印象は決まりません。同じ高さでも響きで印象が変わります（<a href="https://doi.org/10.5112/jjlp.50.14" target="_blank" rel="noreferrer">櫻庭ほか 2009</a>）。',
		'息の音や機械音を拾うと極端な値になります。マイクから10〜20cm離し、静かな場所で試してください。'
	],
	'metric.delta_f.label': '響き',
	'metric.delta_f.unit': 'Hz ΔF',
	'metric.delta_f.description':
		'最初の4つのフォルマントから求めた間隔です。大きいほど声道が短く、明るい響きになる傾向があります。母音でも変わるので、同じ言葉で比べると違いが分かりやすくなります。',
	'metric.delta_f.factors': [
		'喉頭の高さ（上げると声道が短くなり、値が上がります）',
		'口の開き、舌の位置、唇の形',
		'母音。「い」と「あ」では同じ人でも大きく違います'
	],
	'metric.delta_f.caveats': [
		'推定値です。短い録音や雑音では安定せず、解析設定でも動きます。',
		'母音の違いが響きの違いに見えることがあります。同じ言葉、できれば同じ母音で比べてください。'
	],
	'metric.hnr.label': '質感',
	'metric.hnr.unit': 'dB',
	'metric.hnr.description':
		'声の周期成分と雑音成分の比（HNR）です。息やかすれのほか、録音の雑音でも値が下がります。声の重さを直接測る指標ではありません。',
	'metric.hnr.factors': [
		'息漏れ（声帯の閉じ方）',
		'かすれ、がらつき',
		'録音の雑音。環境音が多いと下がります'
	],
	'metric.hnr.caveats': [
		'声の「重さ」や「太さ」の指標ではありません。',
		'静かな部屋で録った見本と、雑音のある自分の録音を直接比べると、雑音の分だけ低く出ます。'
	],
	'metric.balance.label': '明るさ',
	'metric.balance.unit': 'dB',
	'metric.balance.description':
		'100〜1,000 Hzに対する1,000〜4,000 Hzの音の強さです。大きいほど高域の成分が多くなります。母音、息の量、マイクの特性も影響します。',
	'metric.balance.factors': [
		'口の開きと舌の位置',
		'息の量と声帯の閉じ方',
		'マイクの位置と特性、ブラウザーの音声処理'
	],
	'metric.balance.caveats': [
		'機材に強く依存します。録音条件が違う音声どうしでは比べにくい指標です。',
		'見本との差より、同じ機材で録った自分の録音どうしの変化を見るのに向いています。'
	],
	'metric.pitch_span.label': '抑揚',
	'metric.pitch_span.unit': '半音',
	'metric.pitch_span.description':
		'声の高さの10〜90パーセンタイルの幅です。女性的な印象に関わることもありますが、日本語のアクセント、中国語の声調、文の種類、感情でも変わるので、広いほどよいわけではありません。標準偏差や間の取り方はレポートで確認できます。',
	'metric.pitch_span.factors': [
		'文の種類と感情',
		'言語。日本語のアクセント、中国語の声調で幅が変わります',
		'録音の長さ。長いほど幅が広がりやすくなります'
	],
	'metric.pitch_span.caveats': [
		'大きいほど良いわけではありません。',
		'長さの違う録音は比べにくいので、同じ文か短い句で比べてください。'
	],
	'verdict.help.label': '声の判定',
	'verdict.help.description':
		'5つの指標を、女性的な声と男性的な声の見本が最も離れる方向（男女差の軸）に投影した位置です。0は両方の見本の中央値のちょうど中間、−50は男性的な見本の中央値、+50は女性的な見本の中央値です。',
	'verdict.help.factors': [
		'上の5指標すべて。特に高さと響きの寄与が大きくなります',
		'見本の言語。言語ごとに見本が違うので、言語をまたいで数値は比べられません'
	],
	'verdict.help.caveats': [
		'聞き手の評価ではなく、音響指標の位置です。校正は行っていません。',
		'短い録音や雑音の多い録音では安定しません。同じ文を何度か録音して見比べてください。',
		'どちらの向きも、また0に近づけることも、目標として扱います。'
	],
	'indicator.title': '{label}: 自分 {own} {unit}・見本 {ref} {unit}',
	'help.own': '自分',
	'help.reference': '選んだ見本',
	'help.band': '{group}の見本 · 中央80%',
	'help.speakers': '参照話者数',
	'help.male_band': '男性的な見本 · 中央80%',
	'help.female_band': '女性的な見本 · 中央80%',
	'help.band_range': '{low}〜{high}',

	'corpus.clips': '{n}音声',
	'corpus.speakers': '{n}人',
	'corpus.count': '{clips} · {speakers}',

	'quality.no_voice': '声を検出できませんでした。マイクの入力を確認してください。',
	'quality.longer': 'もう少し長く話してください。',
	'quality.resonance': '響きを安定して測定できませんでした。',
	'quality.waiting': '音声を待っています…',
	'verdict.unavailable': 'この言語では計算できません',
	'verdict.record': '録音すると表示',
	'verdict.analyzing': '解析中',
	'verdict.not_yet': 'まだ判定できません',
	'verdict.gate': '{label} {value}（{need}）',
	'verdict.female': '女性的な声',
	'verdict.androgynous': '中間的な声',
	'verdict.male': '男性的な声',
	'leaning.female': '女性寄り',
	'leaning.androgynous': '中間',
	'leaning.male': '男性寄り',
	'gate.voiced_seconds': '有声区間',
	'gate.formant_seconds': '安定した響きの区間',
	'gate.clipping_fraction': 'クリップ率',
	'gate.resonance_sensitivity_pct': '響きの推定のぶれ',
	'gate.seconds': '秒',
	'gate.none': '測定なし',
	'gate.min': '{value} {unit}以上',
	'gate.max': '{value} {unit}以下',

	'report.pitch_sd_hz': '高さの標準偏差 · Hz',
	'report.pitch_sd_st': '高さの標準偏差 · 半音',
	'report.quiet_pct': '無音の割合 · %',
	'report.quiet_mean': '無音区間の平均 · 秒',
	'report.pace': '話す速さ · {unit}',
	'report.note_pitch':
		'見本の高さは自分より{diff}半音{direction}です。速度を落として聴き、無理のない高さで同じ文を試してください。',
	'report.higher': '高め',
	'report.lower': '低め',
	'report.note_resonance':
		'響きの推定値は自分 {own}、見本 {ref} Hz ΔF。同じ母音や短い言葉を選び、高さを保ちながら響きの違いを聴き比べてください。',
	'report.note_intonation':
		'抑揚は言語や文の内容でも変わります。同じ文章を読み、アクセント、文末、間の取り方を比べてください。',
	'report.distance_caption': '見本との音響的な差 · 0で一致',
	'report.distance_note':
		'高さ・響き・質感・明るさ・抑揚の5指標を標準化した距離です。女性らしさや自然さの評価には対応していません。',
	'report.share': 'この2音声の差：図に表示 {shown}% · 省略 {omitted}%',
	'report.share_note':
		'5次元での差の二乗を分けた割合です。図で重なっていても、省略された方向では離れていることがあります。',
	'report.col_metric': '指標',
	'report.col_own': '自分',
	'report.col_ref': '見本',
	'report.col_band': '参照音声の中央80%',
	'report.footer': '{name} · {duration} · 見本 {reference}',
	'report.languages': '録音言語 {own} · 見本の言語 {ref}',
	'report.density':
		'{group}の参照分布内の密度順位：{percentile}パーセンタイル（聞き手による評価ではありません）。',
	'report.projection':
		'分布図は5次元を{dimension}次元に投影しています。表示する分散は{variance}%。省略された方向の違いは左の指標で確認できます。',
	'report.file_title': '声の比較',
	'report.method_link': '測定方法の研究',

	'notice.imported': '音声を読み込みました。',
	'notice.take_deleted': '録音を削除しました。',
	'notice.zipped': '{n}件の録音をまとめました。',
	'notice.deleted_all': '{n}件の録音を削除しました。',
	'confirm.delete_all': '保存された録音{n}件をすべて削除します。元に戻せません。',
	'error.load': '読み込めませんでした: {message}',
	'error.playback': '再生できませんでした。別の音声を選んでください。',
	'error.replay': '再生できませんでした。',
	'error.ab_wait': '両方の音声が読み込まれるまでお待ちください。',
	'error.words_first': '先に音声を読み込んでください。',
	'error.file_size': '150 MB未満の音声を選んでください。',
	'error.duration': '0.25秒〜15分の音声を選んでください。',
	'error.too_long': '{n}分以内の音声を選んでください。',
	'error.too_short': '0.25秒以上録音してください。',
	'error.mic_denied': 'ブラウザーのマイク設定で、このページからの使用を許可してください。',
	'error.take_save': '録音を保存できませんでした。必要な音声をダウンロードしてください。',
	'error.take_save_retry':
		'録音を保存できませんでした。音声をダウンロードしてから、保存容量を確認してください。',
	'error.take_kept': '録音を残しました。録音のメニューから再解析できます。',
	'error.take_load': 'この録音は読み込めませんでした。',
	'error.take_delete': '録音を削除できませんでした。もう一度お試しください。',
	'error.no_takes': '保存された録音がありません。',
	'error.favorite_save': 'お気に入りを保存できませんでした。',
	'error.reference_save': '見本の音声を保存できませんでした。',

	'action.play': '再生',
	'action.stop': '停止',
	'action.rename': '名前を変更',
	'action.download': 'ダウンロード',
	'action.delete': '削除',
	'action.label': '{name}を{action}',

	'tour.later': 'あとで',
	'tour.later_title': '中断して、次回に続きから',
	'tour.skip': 'スキップ',
	'tour.skip_title': 'ガイドを終了',
	'tour.back': '戻る',
	'tour.next': '次へ',
	'tour.start': 'はじめる',
	'tour.steps': [
		{
			title: 'Koenamiへようこそ',
			text: '見本を真似して録音し、声の違いを目で確かめられるツールです。主な画面の使い方を1分ほどで順にご紹介します。\nスキップしても、画面右上の{help}からいつでも見直せます。'
		},
		{
			title: '選んだ見本',
			text: '今選択されている見本を{play}で再生でき、また{star}でお気に入りとして登録できます。'
		},
		{ title: '見本の一覧', text: '声の種類で絞り込み、並べ替えて、近づきたい声を探します。' },
		{ title: '録音', text: '{mic}か{R}で録音を始め、もう一度押して止めます。' },
		{ title: '声の特徴', text: '高さ・響き・質感・明るさ・抑揚を、自分と見本で見比べます。' },
		{ title: '声の分布', text: '見本の声の地図です。自分の声が見本にどれだけ近いかが分かります。' },
		{ title: '波形', text: '高さの推移やスペクトログラムを見比べます。ドラッグで範囲を選べます。' },
		{ title: 'リアルタイム', text: '話しながら、声の位置が動くのを見て調整します。' },
		{ title: '詳しい説明', text: '使い方や声のしくみの解説は{info}から開けます。' }
	],

	'card.eyebrow': 'KOENAMI · 声の判定',
	'card.male': '男性的 −100',
	'card.center': '0',
	'card.female': '女性的 +100',
	'card.male_refs': '男性的な見本',
	'card.female_refs': '女性的な見本',

	'result.title': 'Koenami · 声の判定',
	'result.description':
		'Koenamiで測った声の判定。女性的な声・男性的な声・中間の見本の中で、この声がどこにあるか。',
	'result.og_description': '女性的な声・男性的な声の見本の中で、この声がどこにあるか。',
	'result.share_description': '{text}。女性的な声・男性的な声の見本の中で、この声がどこにあるか。',
	'result.window_title': 'Koenami · {verdict}（{leaning} {score}）',
	'nav.guide': '使い方',
	'nav.tutorial': '声のしくみ',
	'nav.method': '測定方法と出典',
	'result.eyebrow': 'この声の判定',
	'result.loading': '読み込んでいます…',
	'result.age_label': '聞こえる年齢のめやす：',
	'result.age_note':
		'年齢の推定モデルの参考値です。日本語の声や練習中の声について「何歳に聞こえるか」と合うかは確かめていません。',
	'result.try': '自分の声も測る',
	'result.metrics_heading': '5つの指標',
	'result.metrics_intro':
		'自分の値と、見本の話者の中央80%（女性的な声・男性的な声）を並べています。',
	'result.col_metric': '指標',
	'result.col_this': 'この声',
	'result.col_female': '女性的な声の見本',
	'result.col_male': '男性的な声の見本',
	'result.notes_heading': 'この判定の読み方',
	'result.notes_p1':
		'数値は、見本の話者から求めた「男女差」の方向（女性的な声と男性的な声が最も離れる向き）に、この声の5つの指標を投影した位置です。男性的な見本の中央値と女性的な見本の中央値のちょうど中間を0とし、男性的な見本の中央値を−50、女性的な見本の中央値を+50とする直線の目盛りで、−100〜+100の範囲で表示します。+30以上を「女性的な声」、−30以下を「男性的な声」、その間を「中間的な声」と呼んでいます。',
	'result.notes_p2':
		'どちらの向きも目標になります。女声を目指すなら＋の方向、男声を目指すなら−の方向、性別の印象を薄くしたい・中性的な声を目指すなら0に近づくことが目安です。',
	'result.notes_li1':
		'5つの音響指標から求めた位置です。聞き手にどう聞こえるかまでは測っていません。同じ人でも文章、話し方、マイク、周囲の音で変わります。',
	'result.notes_li2':
		'見本の分布は一般人口の標準値ではありません。言語ごとに見本が違うため、言語をまたいで数値を比べることはできません。',
	'result.notes_li3':
		'短い録音や雑音の多い録音では、響きや抑揚の値が安定しません。同じ文をいくつか録音して見比べてください。',
	'result.notes_footer':
		'判定の計算方法は<a href="/method.html">測定方法と出典</a>にあります。判定の方式を変えたときは、この番号（<span id="result-version">v1</span>）が変わります。',
	'result.unavailable': 'この結果は表示できません',
	'result.no_params': 'リンクに測定値が含まれていません。',
	'result.no_library': '見本の一覧を読み込めませんでした。',
	'result.no_verdict': 'この言語の見本では判定を計算できません。',
	'result.version_note':
		'このリンクは判定方式v{from}で作られました。現在の方式（v{to}）で計算し直しています。',

	'manifest.name': 'Koenami · 女声・男声のボイトレツール',
	'manifest.description': '見本の声を真似して録音し、近づきたい声との距離を見るボイトレツール。',
	'manifest.screenshot_wide': 'Koenamiのスタジオ：声の分布、5つの指標、見本の一覧、波形',
	'manifest.screenshot_narrow': 'スマートフォンでのスタジオ',

	'api.busy': '少し待ってからお試しください。',
	'api.too_long': '1分以内の音声を選んでください。',
	'api.no_audio': '音声がありません。',
	'api.too_short': '0.25秒以上の音声を使用してください。',
	'api.starting': '解析サーバーを準備しています。少し待ってからお試しください。'
} as const;

/* Every catalogue carries these keys. A text is a string or, where the language inflects
   by count, {one, other}; a list key holds a list (of strings, or of titled items). */
export type Text = string | { one: string; other: string };
export type Item = string | { title: string; text: string };
export type Catalogue = {
	[K in keyof typeof ja]: (typeof ja)[K] extends readonly unknown[] ? readonly Item[] : Text;
};
export type Key = keyof typeof ja;
export default ja;
