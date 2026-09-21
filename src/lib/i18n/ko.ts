import type { Catalogue } from './ja';

/* 한국어. 키는 ja.js와 같다. {n}은 수, {one, other}는 수에 따른 선택, 배열은 항목 목록. */
export default {
	'page.title': 'Koenami · 여성·남성 목소리 연습 도구',
	'page.description':
		'여성 목소리와 남성 목소리를 모두 내고 싶은 분(양성류), 트랜스젠더, 새로운 목소리에 도전해 보고 싶은 분을 위한 무료 목소리 연습 도구입니다. 참고 음성을 골라 따라 녹음하면 내 목소리가 참고 음성과 같은 분포도에 나타나, 목표 목소리에 얼마나 가까운지 한눈에 보입니다. 실시간 측정도 지원합니다.',
	'page.browser_requirements': '마이크를 쓸 수 있는 브라우저',
	'page.publisher': 'とらんすナビ',

	'toolbar.language': '언어 (화면과 참고 음성)',
	'toolbar.guide': '화면 안내',
	'toolbar.share': '판정 공유',
	'toolbar.settings': '설정',
	'toolbar.info': '출처와 관련 도구',
	'toolbar.theme': '테마 전환',

	'common.self': '내 목소리',
	'common.reference': '참고 음성',
	'common.close': '닫기',
	'common.save': '저장',

	'profile.aria': '목소리 지표 다섯 가지',
	'profile.heading': '목소리 특징',
	'profile.canvas_aria': '내 목소리와 참고 음성의 다섯 지표를 겹쳐 나타낸 차트',
	'profile.indicators_aria': '목소리 지표',
	'profile.fit': '참고 음성과의 차이',
	'profile.fit_title': '비교 보고서 열기',
	'profile.fit_title_ready':
		'참고 음성과의 거리입니다(다섯 지표 표준화, 0이면 일치). 누르면 비교 보고서가 열립니다.',
	'verdict.heading': '목소리 판정',
	'verdict.end_male': '남성적 −100',
	'verdict.end_center': '0',
	'verdict.end_female': '여성적 +100',

	'graph.aria': '목소리 비교',
	'graph.canvas_aria': '목소리 분포. 스크롤로 확대·축소, 드래그로 회전, Shift+드래그로 이동.',
	'graph.projection_variance': '주성분',
	'graph.projection_variance_title':
		'분포가 가장 넓게 퍼진 방향을 축으로 삼습니다(주성분 분석). 여성·남성 구분은 쓰지 않습니다.',
	'graph.projection_contrast': '남녀 차이',
	'graph.projection_contrast_title':
		'여성적인 목소리와 남성적인 목소리가 가장 멀리 떨어지는 방향을 가로축으로 삼습니다. 성별 구분이 있는 참고 음성으로 계산합니다.',
	'graph.auto_rotate': '자동 회전',
	'graph.auto_rotate_title': '3D 자동 회전 켜기/끄기',
	'graph.space_label': '목소리 분포',
	'graph.space_title': '다섯 지표로 계산한 주성분 공간',
	'graph.space_title_contrast':
		'다섯 지표로 계산. 가로축은 여성적인 목소리와 남성적인 목소리가 가장 멀어지는 방향입니다.',
	'graph.zoom_in': '확대',
	'graph.zoom_out': '축소',
	'graph.find_me': '목소리 분포에 화면 맞추기',
	'graph.reset': '화면 초기화',
	'group.female': '여성적인 목소리',
	'group.male': '남성적인 목소리',
	'group.androgynous': '중성적인 목소리',
	'group.all': '모든 목소리',
	'group.favorites': '★ 즐겨찾기',
	'group.custom': '불러온 목소리',

	'signal.aria': '파형과 스펙트럼 비교',
	'signal.view_aria': '음성 표시 방식',
	'signal.pitch': '음높이',
	'signal.spectrogram': '스펙트로그램',
	'signal.spectrum': '스펙트럼',
	'signal.waveform': '파형',
	'signal.both': '겹치기',
	'signal.both_title': '길이를 맞춰 겹쳐 보여 줍니다',
	'signal.both_title_on':
		'각 선택 구간의 시작을 0%, 끝을 100%로 맞춰 겹쳐 보여 줍니다. 단어 위치까지 일치하지는 않습니다.',
	'signal.words': '단어',
	'signal.words_title': '음성 인식·단어 분할',
	'signal.range_reset': '선택 구간 해제',
	'signal.range_reset_title': '선택 구간 해제 (Esc)',
	'signal.canvas_aria':
		'파형을 클릭하면 재생 위치가 이동하고, 드래그하면 구간이 선택됩니다. 좌우 화살표 키로 재생 위치를 옮깁니다. 음높이 눈금을 클릭하면 표시를 Hz 또는 음이름으로 바꿀 수 있습니다.',
	'signal.word_list_aria': '추정한 단어 위치',
	'signal.word_title': '{start}–{end}s · 추정 위치',

	'samples.aria': '참고 음성',
	'samples.browser_aria': '참고 음성 고르기',
	'samples.heading': '참고 음성',
	'samples.add': '참고 음성 불러오기',
	'samples.group_aria': '참고 음성 종류',
	'samples.sort_aria': '정렬',
	'sort.name': '화자 이름순',
	'sort.near': '내 목소리에 가까운 순',
	'sort.low': '낮은 목소리 순',
	'sort.high': '높은 목소리 순',
	'samples.search': '검색',
	'samples.search_aria': '참고 음성 검색',
	'samples.more': '더 보기',
	'lab.teacher': '강사',
	'lab.pitch': '음높이',
	'lab.pitch_aria': '강사 목소리의 음높이',
	'lab.resonance': '울림',
	'lab.resonance_aria': '강사 목소리의 울림',
	'lab.weight': '무게',
	'lab.weight_aria': '강사 목소리의 무게',
	'lab.low': '낮음',
	'lab.med': '중간',
	'lab.high': '높음',
	'lab.light': '가벼움',
	'lab.heavy': '무거움',
	'jvs.added': '음성 {n}개 추가됨',
	'jvs.cancelled': '중단했습니다. 이미 불러온 음성은 그대로 저장되어 있습니다.',
	'jvs.index_failed': 'JVS 목록을 가져오지 못했습니다.',
	'jvs.audio_missing': 'JVS 음성을 찾을 수 없습니다. 다시 추가해 주세요.',
	'jvs.no_match': '해당하는 JVS 음성을 찾지 못했습니다. 공식 ZIP이나 압축을 푼 폴더를 골라 주세요.',
	'jvs.quota': '저장 공간이 부족합니다. 화자 폴더를 하나씩 고르면 일부만 추가할 수 있습니다.',
	'jvs.size_mismatch': '음성 파일 크기가 일치하지 않습니다.',
	'jvs.hash_mismatch': '공식 음성과 다른 파일이 있습니다. 공식 ZIP을 다시 골라 주세요.',

	'target.aria': '고른 참고 음성',
	'target.play': '참고 음성 재생',
	'target.pause': '참고 음성 일시정지',
	'target.pick': '참고 음성 고르기',
	'target.favorite': '즐겨찾기',
	'target.favorite_add': '참고 음성을 즐겨찾기에 추가',
	'target.source': '출처',
	'target.seek_aria': '참고 음성 재생 위치',
	'target.meta_synthetic': '합성 음성',
	'target.analysis_error': '참고 음성 분석 오류: {message}',
	'favorite.add': '즐겨찾기에 추가',
	'favorite.remove': '즐겨찾기에서 해제',
	'favorite.add_clip': '즐겨찾기에 추가: {name}',
	'favorite.remove_clip': '즐겨찾기에서 해제: {name}',
	'favorite.marked': '즐겨찾기에 추가됨',

	'record.title': '녹음 (R)',
	'record.aria': '새로 녹음',
	'record.stop': '녹음 멈추기',
	'record.stop_title': '녹음 멈추기 (R)',
	'play.label': '재생',
	'play.own': '내 목소리 재생',
	'play.own_title': '내 목소리 재생 (Space)',
	'play.own_pause': '내 목소리 일시정지',
	'takes.menu': '녹음 기록',
	'takes.retry': '다시 분석',
	'takes.default_name': '녹음 {n}',
	'takes.sort': '정렬 순서',
	'takes.sort_newest': '최신순',
	'takes.sort_oldest': '오래된순',
	'takes.sort_name': '이름순',
	'takes.sort_longest': '길이순',
	'live.label': '실시간',
	'live.measuring': '측정 중',
	'live.title': '마이크 소리를 실시간으로 표시',
	'live.start': '실시간 측정 시작',
	'live.stop': '실시간 측정 멈추기',
	'live.stop_title': '실시간 측정 멈추기 (Esc)',
	'loopback.aria': '내 목소리 듣기',
	'loopback.title': '내 목소리 듣기 (이어폰 권장)',
	'loopback.stop': '내 목소리 듣기 멈추기',
	'speed.aria': '재생 속도',
	'speed.reset': '기본 속도로 되돌리기',
	'ab.title': '참고 음성과 내 목소리를 차례로 재생',
	'upload.title': '음성 파일 불러오기',
	'state.recording': '녹음 중',
	'state.preparing': '준비 중',
	'state.analyzing': '분석 중',

	'import.heading': '참고 음성 추가',
	'import.audio': '음성 파일 고르기',
	'import.jvs_heading': 'JVS 추가',
	'import.jvs_site': '공식 사이트에서 다운로드 ↗',
	'import.jvs_hint':
		'공식 ZIP 또는 압축을 푼 폴더를 선택하세요. 화자 100명의 음성 5,000개를 추가할 수 있습니다.',
	'import.zip': 'ZIP 고르기',
	'import.folder': '폴더 고르기',
	'import.progress_aria': 'JVS 불러오기',
	'import.cancel': '중단',
	'import.terms':
		'음성은 JVS 이용 약관에 따라 사용해 주세요. 불러온 참고 음성은 이 브라우저에만 저장됩니다.',
	'settings.heading': '설정',
	'settings.theme': '테마',
	'theme.light': '라이트',
	'theme.dark': '다크',
	'theme.system': '시스템 설정 따르기',
	'settings.live_window': '실시간 분석 구간 길이',
	'settings.live_shape': '실시간 표시 구간 길이',
	'settings.seconds': '{n}초',
	'settings.normalize': '재생 음량 맞추기',
	'settings.export': '측정값 내보내기',
	'settings.takes': '녹음 기록',
	'settings.download_all': '모두 다운로드',
	'settings.delete_all': '모두 삭제',

	'info.about1':
		'Koenami는 여성 목소리와 남성 목소리를 모두 내고 싶은 분(양성류), 트랜스젠더, 새로운 목소리에 도전해 보고 싶은 분을 위한 목소리 연습 도구입니다. 참고 음성을 골라 따라 녹음하면 내 목소리가 참고 음성과 같은 분포도에 나타나, 목표 목소리에 얼마나 가까운지 한눈에 보입니다. 실시간 측정을 켜면 목소리를 바꿔 가며 분포도 위에서 내 위치가 움직이는 것을 보고, 어느 쪽으로 가야 할지 알 수 있습니다.',
	'info.about2':
		'참고 음성은 일본어뿐 아니라 중국어·영어·한국어도 있습니다. 무료 오픈 소스이며, 녹음은 브라우저 안에만 저장됩니다.',
	'info.guide': '사용법 (일본어) ↗',
	'info.tutorial': '목소리의 원리와 연습 안내 (일본어) ↗',
	'info.method': '측정 방법과 출처 (일본어) ↗',
	'info.references': '참고 문헌 (일본어) ↗',
	'info.source': '소스 코드 (GitHub) ↗',

	'rename.failed': '이름을 바꾸지 못했습니다. 다시 시도해 주세요.',
	'report.heading': '비교',
	'report.save': '보고서 저장',
	'metric.factors': '영향을 주는 요인',
	'metric.caveats': '주의',

	'share.heading': '목소리 판정',
	'share.help': '판정 읽는 법',
	'share.age_label': '들리는 나이(추정)',
	'share.age_run': '추정하기',
	'share.age_running': '추정 중…',
	'share.age_include': '이미지와 링크에 포함',
	'share.age_note':
		'나이 추정 모델(audEERING)이 낸 참고용 값입니다. 일본어 음성이나 연습 중인 목소리에서 실제 듣는 사람이 느끼는 나이와 얼마나 맞는지는 검증하지 않았습니다. 음성은 추정에만 쓰이고 저장되지 않습니다.',
	'share.age_value': '{age} (4초 구간별 추정 범위 {low}~{high})',
	'share.age_years': '약 {n}세',
	'share.group_aria': '결과 공유',
	'share.system': '공유…',
	'share.copy': '링크 복사',
	'share.copied': '링크를 복사했습니다.',
	'share.save': '이미지 저장',
	'share.open': '결과 페이지',
	'share.post_to': '{name}에 올리기',
	'share.image_alt': '{text}. 다섯 지표와 참고 음성 분포를 그린 이미지.',
	'share.history': '판정 추이',
	'share.history_sub': '이 기기의 녹음',
	'share.history_aria': '녹음별 판정 추이',
	'share.history_note':
		'이전 녹음에는 유성 구간 등 판정 조건이 기록되어 있지 않아, 조건 충족 여부를 확인하지 않고 표시합니다.',
	'share.note':
		'링크에는 다섯 측정값만 들어 있고, 녹음은 보내지 않습니다. 판정 결과를 해석하는 방법은 <a href="/method.html" target="_blank" hreflang="ja">측정 방법과 출처</a>(일본어)에 있습니다.',
	'share.unavailable': '이 언어의 참고 음성으로는 판정할 수 없습니다',
	'share.text': '내 목소리 판정: {verdict} ({leaning} {score})',
	'share.image_failed': '이미지를 만들지 못했습니다.',
	'history.current': '표시 중',
	'history.open': '열기',
	'history.open_title': '이 녹음 표시',

	'metric.f0.label': '음높이',
	'metric.f0.unit': 'Hz',
	'metric.f0.description':
		'성대가 진동하는 속도입니다. 유성음 기본 주파수(F0)의 중앙값을 씁니다. 값이 클수록 높은 목소리입니다. 띠는 참고 그룹 화자들의 중앙 80% 범위입니다.',
	'metric.f0.factors': [
		'성대의 긴장(후두 근육의 사용)과 성대의 질량',
		'후두 높이, 호흡량, 힘이 들어간 정도',
		'문장 종류와 감정. 의문문이나 강조할 때 올라갑니다'
	],
	'metric.f0.caveats': [
		'음높이만으로 성별 인상이 정해지지는 않습니다. 같은 음높이라도 울림에 따라 인상이 달라집니다(<a href="https://doi.org/10.5112/jjlp.50.14" target="_blank" rel="noreferrer">Sakuraba 외 2009</a>).',
		'숨소리나 기계음이 들어가면 극단적인 값이 나옵니다. 마이크에서 10~20cm 떨어져서 조용한 곳에서 녹음해 보세요.'
	],
	'metric.delta_f.label': '울림',
	'metric.delta_f.unit': 'Hz ΔF',
	'metric.delta_f.description':
		'처음 네 포먼트에서 구한 간격입니다. 클수록 성도가 짧고 울림이 밝은 경향이 있습니다. 모음에 따라서도 달라지므로 같은 말로 비교하면 차이를 알아보기 쉽습니다.',
	'metric.delta_f.factors': [
		'후두의 높이(올리면 성도가 짧아져 값이 올라갑니다)',
		'입을 벌리는 정도, 혀의 위치, 입술 모양',
		'모음. ‘이’와 ‘아’는 같은 사람이라도 크게 다릅니다'
	],
	'metric.delta_f.caveats': [
		'추정값이므로 녹음이 짧거나 잡음이 있으면 불안정하고, 분석 설정에 따라서도 달라집니다.',
		'모음의 차이가 울림의 차이처럼 보일 수 있습니다. 같은 말, 되도록 같은 모음으로 비교해 주세요.'
	],
	'metric.hnr.label': '질감',
	'metric.hnr.unit': 'dB',
	'metric.hnr.description':
		'목소리에서 주기 성분과 잡음 성분의 비율(HNR)입니다. 숨소리나 쉰 소리, 녹음 잡음이 있으면 낮아집니다. 목소리의 무게를 직접 재는 지표는 아닙니다.',
	'metric.hnr.factors': [
		'숨 새는 소리(성대가 닫히는 정도)',
		'쉰 소리, 거친 소리',
		'녹음 잡음. 주변 소리가 많으면 낮아집니다'
	],
	'metric.hnr.caveats': [
		'목소리의 ‘무게’나 ‘굵기’의 지표가 아닙니다.',
		'조용한 방에서 녹음한 참고 음성과 잡음이 섞인 내 녹음을 그대로 비교하면, 잡음 때문에 내 녹음의 값이 더 낮게 나옵니다.'
	],
	'metric.balance.label': '밝기',
	'metric.balance.unit': 'dB',
	'metric.balance.description':
		'1,000~4,000 Hz 성분이 100~1,000 Hz 성분에 비해 얼마나 센지를 나타냅니다. 클수록 고음역 성분이 많습니다. 모음, 숨의 양, 마이크 특성도 영향을 줍니다.',
	'metric.balance.factors': [
		'입을 벌리는 정도와 혀의 위치',
		'숨의 양과 성대가 닫히는 방식',
		'마이크의 위치와 특성, 브라우저의 음성 처리'
	],
	'metric.balance.caveats': [
		'장비에 크게 좌우되어, 녹음 조건이 다른 음성끼리는 비교하기 어렵습니다.',
		'참고 음성과 비교하기보다, 같은 장비로 녹음한 내 목소리가 어떻게 달라졌는지 볼 때 더 적합합니다.'
	],
	'metric.pitch_span.label': '억양',
	'metric.pitch_span.unit': '반음',
	'metric.pitch_span.description':
		'음높이의 10백분위수와 90백분위수 사이의 폭입니다. 여성적인 인상과 관련이 있을 수 있지만, 일본어 악센트, 중국어 성조, 문장 종류, 감정에 따라서도 달라지므로 넓다고 더 좋은 것은 아닙니다. 표준편차와 쉬는 구간은 보고서에서 볼 수 있습니다.',
	'metric.pitch_span.factors': [
		'문장 종류와 감정',
		'언어. 일본어 악센트와 중국어 성조에 따라 폭이 달라집니다',
		'녹음 길이. 길수록 폭이 넓어지기 쉽습니다'
	],
	'metric.pitch_span.caveats': [
		'클수록 좋은 것은 아닙니다.',
		'길이가 다른 녹음은 비교하기 어려우니 같은 문장이나 짧은 구절을 녹음해 비교해 주세요.'
	],
	'verdict.help.label': '목소리 판정',
	'verdict.help.description':
		'다섯 지표를 여성적인 참고 음성과 남성적인 참고 음성이 가장 멀리 떨어지는 방향(남녀 차이 축)에 투영한 위치입니다. 0은 두 그룹 중앙값의 정중앙, −50은 남성적인 참고 음성의 중앙값, +50은 여성적인 참고 음성의 중앙값입니다.',
	'verdict.help.factors': [
		'위의 다섯 지표 모두. 특히 음높이와 울림의 영향이 큽니다',
		'참고 음성의 언어. 언어마다 참고 음성이 다르므로, 언어가 다르면 수치를 비교할 수 없습니다'
	],
	'verdict.help.caveats': [
		'듣는 사람의 평가가 아니라 음향 지표상의 위치이며, 별도의 보정은 하지 않았습니다.',
		'짧은 녹음이나 잡음이 많은 녹음에서는 안정되지 않습니다. 같은 문장을 몇 번 녹음해 비교해 보세요.',
		'여성적인 쪽이나 남성적인 쪽으로 연습할 수도 있고, 0에 가까워지는 것을 목표로 삼을 수도 있습니다.'
	],
	'indicator.title': '{label}: 내 목소리 {own} {unit} · 참고 음성 {ref} {unit}',
	'help.own': '나',
	'help.reference': '고른 참고 음성',
	'help.band': '{group} 참고 음성 · 중앙 80%',
	'help.speakers': '참고 화자 수',
	'help.male_band': '남성적인 참고 음성 · 중앙 80%',
	'help.female_band': '여성적인 참고 음성 · 중앙 80%',
	'help.band_range': '{low}~{high}',

	'corpus.clips': '음성 {n}개',
	'corpus.speakers': '{n}명',
	'corpus.count': '{clips} · {speakers}',

	'quality.no_voice': '목소리를 감지하지 못했습니다. 마이크 입력을 확인해 주세요.',
	'quality.longer': '조금 더 길게 말해 주세요.',
	'quality.resonance': '울림을 안정되게 측정하지 못했습니다.',
	'quality.waiting': '음성 입력 대기 중…',
	'verdict.unavailable': '이 언어에서는 판정할 수 없습니다',
	'verdict.record': '녹음 후 표시',
	'verdict.analyzing': '분석 중',
	'verdict.not_yet': '아직 판정할 수 없습니다',
	'verdict.gate': '{label} {value} ({need})',
	'verdict.female': '여성적인 목소리',
	'verdict.androgynous': '중간 목소리',
	'verdict.male': '남성적인 목소리',
	'leaning.female': '여성 쪽',
	'leaning.androgynous': '중간',
	'leaning.male': '남성 쪽',
	'gate.voiced_seconds': '유성 구간',
	'gate.formant_seconds': '울림이 안정된 구간',
	'gate.clipping_fraction': '클리핑 비율',
	'gate.resonance_sensitivity_pct': '울림 추정값의 변동',
	'gate.seconds': '초',
	'gate.none': '측정 없음',
	'gate.min': '{value} {unit} 이상 필요',
	'gate.max': '{value} {unit} 이하 필요',

	'report.pitch_sd_hz': '음높이의 표준편차 · Hz',
	'report.pitch_sd_st': '음높이의 표준편차 · 반음',
	'report.quiet_pct': '무음 비율 · %',
	'report.quiet_mean': '무음 구간 평균 길이 · 초',
	'report.pace': '말하기 속도 · {unit}',
	'report.note_pitch':
		'참고 음성이 내 목소리보다 {diff}반음 {direction}. 재생 속도를 늦춰 들어 보고, 무리 없는 음높이로 같은 문장을 말해 보세요.',
	'report.higher': '높습니다',
	'report.lower': '낮습니다',
	'report.note_resonance':
		'울림 추정값(ΔF)은 내 목소리 {own} Hz, 참고 음성 {ref} Hz입니다. 같은 모음이나 짧은 말을 골라, 음높이를 유지하면서 울림의 차이를 들어 보세요.',
	'report.note_intonation':
		'억양은 언어나 문장 내용에 따라서도 달라집니다. 같은 글을 읽으며 악센트, 문장 끝의 억양, 쉬는 위치를 비교해 보세요.',
	'report.distance_caption': '참고 음성과의 음향적 차이 · 0이면 일치',
	'report.distance_note':
		'음높이·울림·질감·밝기·억양을 각각 표준화한 뒤 계산한 거리입니다. 여성스러움이나 자연스러움을 평가하는 값은 아닙니다.',
	'report.share': '두 음성의 차이: 그림에 표시 {shown}% · 생략 {omitted}%',
	'report.share_note':
		'5차원 차이의 제곱을 그림에 표시된 방향과 생략된 방향으로 나눈 비율입니다. 그림에서 겹쳐 보여도 생략된 방향에서는 떨어져 있을 수 있습니다.',
	'report.col_metric': '지표',
	'report.col_own': '나',
	'report.col_ref': '참고 음성',
	'report.col_band': '참고 음성의 중앙 80%',
	'report.footer': '{name} · {duration} · 참고 음성 {reference}',
	'report.languages': '녹음 언어 {own} · 참고 음성 언어 {ref}',
	'report.density':
		'{group} 참고 음성 분포에서의 밀도 순위: {percentile} 백분위수 (듣는 사람의 평가가 아닙니다).',
	'report.projection':
		'분포도는 5차원을 {dimension}차원으로 투영한 것으로, 전체 분산의 {variance}%가 반영되어 있습니다. 생략된 방향의 차이는 왼쪽 지표에서 확인할 수 있습니다.',
	'report.file_title': '목소리 비교',
	'report.method_link': '측정 방법 연구',

	'notice.imported': '음성을 불러왔습니다.',
	'notice.take_deleted': '녹음을 삭제했습니다.',
	'notice.zipped': '녹음 {n}개를 ZIP으로 묶었습니다.',
	'notice.deleted_all': '녹음 {n}개를 삭제했습니다.',
	'confirm.delete_all': '저장된 녹음 {n}개를 모두 삭제합니다. 되돌릴 수 없습니다.',
	'error.load': '불러오지 못했습니다: {message}',
	'error.playback': '재생하지 못했습니다. 다른 음성을 골라 주세요.',
	'error.replay': '재생하지 못했습니다.',
	'error.ab_wait': '두 음성을 모두 불러올 때까지 기다려 주세요.',
	'error.words_first': '먼저 음성을 불러와 주세요.',
	'error.file_size': '150 MB 미만의 음성을 골라 주세요.',
	'error.duration': '0.25초~15분 길이의 음성을 골라 주세요.',
	'error.too_long': '{n}분 이내의 음성을 골라 주세요.',
	'error.too_short': '0.25초 이상 녹음해 주세요.',
	'error.mic_denied': '브라우저 마이크 설정에서 이 페이지의 마이크 사용을 허용해 주세요.',
	'error.take_save': '녹음을 저장하지 못했습니다. 필요한 음성은 다운로드해 두세요.',
	'error.take_save_retry':
		'녹음을 저장하지 못했습니다. 음성을 다운로드한 뒤 저장 공간을 확인해 주세요.',
	'error.take_kept': '녹음은 보관해 두었습니다. 녹음 기록 메뉴에서 다시 분석할 수 있습니다.',
	'error.take_load': '이 녹음을 불러오지 못했습니다.',
	'error.take_delete': '녹음을 삭제하지 못했습니다. 다시 시도해 주세요.',
	'error.no_takes': '저장된 녹음이 없습니다.',
	'error.favorite_save': '즐겨찾기를 저장하지 못했습니다.',
	'error.reference_save': '참고 음성을 저장하지 못했습니다.',

	'action.play': '재생',
	'action.stop': '정지',
	'action.rename': '이름 바꾸기',
	'action.download': '다운로드',
	'action.delete': '삭제',
	'action.label': '{name} {action}',

	'tour.later': '나중에',
	'tour.later_title': '멈추고 다음에 이어서 보기',
	'tour.skip': '건너뛰기',
	'tour.skip_title': '안내 끝내기',
	'tour.back': '이전',
	'tour.next': '다음',
	'tour.start': '시작하기',
	'tour.steps': [
		{
			title: 'Koenami에 오신 것을 환영합니다',
			text: '참고 음성을 따라 녹음하고 목소리의 차이를 눈으로 확인하는 도구입니다. 주요 화면의 사용법을 안내해 드릴게요. 1분 정도 걸립니다.\n건너뛰어도 화면 오른쪽 위의 {help}에서 언제든 다시 볼 수 있습니다.'
		},
		{
			title: '고른 참고 음성',
			text: '지금 고른 참고 음성은 {play}로 재생하고, {star}로 즐겨찾기에 추가할 수 있습니다.'
		},
		{
			title: '참고 음성 목록',
			text: '목소리 종류별로 추리거나 정렬해서 닮고 싶은 목소리를 찾아보세요.'
		},
		{ title: '녹음', text: '{mic}나 {R}로 녹음을 시작하고, 한 번 더 누르면 멈춥니다.' },
		{
			title: '목소리 특징',
			text: '내 목소리와 참고 음성의 음높이·울림·질감·밝기·억양을 비교합니다.'
		},
		{
			title: '목소리 분포',
			text: '참고 음성의 분포도입니다. 내 목소리가 참고 음성에 얼마나 가까운지 알 수 있습니다.'
		},
		{
			title: '파형',
			text: '음높이의 변화나 스펙트로그램을 비교합니다. 드래그로 구간을 고를 수 있습니다.'
		},
		{
			title: '실시간',
			text: '말할 때 분포도에서 내 목소리의 위치가 어떻게 움직이는지 보면서 목소리를 조절해 보세요.'
		},
		{ title: '자세한 설명', text: '{info}에서 사용법과 목소리 원리에 관한 설명을 볼 수 있습니다.' }
	],

	'card.eyebrow': 'KOENAMI · 목소리 판정',
	'card.male': '남성적 −100',
	'card.center': '0',
	'card.female': '여성적 +100',
	'card.male_refs': '남성적인 참고 음성',
	'card.female_refs': '여성적인 참고 음성',
	'result.title': 'Koenami · 목소리 판정',
	'result.description':
		'Koenami로 측정한 목소리 판정입니다. 여성적·남성적·중간 참고 음성 사이에서 이 목소리가 어디에 있는지 보여 줍니다.',
	'result.og_description':
		'여성적인 참고 음성과 남성적인 참고 음성 사이에서 이 목소리가 어디에 있는지 보여 줍니다.',
	'result.share_description':
		'{text}. 여성적인 참고 음성과 남성적인 참고 음성 사이에서 이 목소리가 어디에 있는지 보여 줍니다.',
	'result.window_title': 'Koenami · {verdict} ({leaning} {score})',
	'nav.guide': '사용법',
	'nav.tutorial': '목소리의 원리',
	'nav.method': '측정 방법과 출처',
	'result.eyebrow': '이 목소리의 판정',
	'result.loading': '불러오는 중…',
	'result.age_label': '들리는 나이(추정): ',
	'result.age_note':
		'나이 추정 모델이 낸 참고용 값입니다. 일본어 음성이나 연습 중인 목소리에서 실제 듣는 사람이 느끼는 나이와 얼마나 맞는지는 검증하지 않았습니다.',
	'result.try': '내 목소리도 측정해 보기',
	'result.metrics_heading': '다섯 지표',
	'result.metrics_intro':
		'이 목소리의 값을 참고 화자의 중앙 80% 범위(여성적인 목소리·남성적인 목소리)와 나란히 보여 줍니다.',
	'result.col_metric': '지표',
	'result.col_this': '이 목소리',
	'result.col_female': '여성적인 참고 음성',
	'result.col_male': '남성적인 참고 음성',
	'result.notes_heading': '이 판정 읽는 법',
	'result.notes_p1':
		'수치는 참고 화자에서 구한 ‘남녀 차이’ 방향(여성적인 목소리와 남성적인 목소리가 가장 멀리 떨어지는 방향)에 이 목소리의 다섯 지표를 투영한 위치입니다. 남성적인 참고 음성의 중앙값과 여성적인 참고 음성의 중앙값의 정중앙을 0, 남성 쪽 중앙값을 −50, 여성 쪽 중앙값을 +50으로 하는 선형 눈금이며, −100~+100 범위로 표시합니다. +30 이상은 ‘여성적인 목소리’, −30 이하는 ‘남성적인 목소리’, 그 사이는 ‘중간 목소리’로 부릅니다.',
	'result.notes_p2':
		'어느 방향이든 목표가 될 수 있습니다. 여성 목소리를 원하면 + 쪽으로, 남성 목소리를 원하면 − 쪽으로, 성별 인상을 옅게 하거나 중성적인 목소리를 원하면 0에 가까워지는 것을 목표로 삼으면 됩니다.',
	'result.notes_li1':
		'다섯 음향 지표로 구한 위치일 뿐, 듣는 사람에게 어떻게 들리는지까지 측정하지는 않습니다. 같은 사람이라도 문장, 말투, 마이크, 주변 소리에 따라 달라집니다.',
	'result.notes_li2':
		'참고 음성의 분포는 일반 인구의 표준값이 아닙니다. 언어마다 참고 음성이 다르므로, 언어가 다르면 수치를 비교할 수 없습니다.',
	'result.notes_li3':
		'짧은 녹음이나 잡음이 많은 녹음에서는 울림과 억양 값이 안정되지 않습니다. 같은 문장을 몇 번 녹음해 비교해 보세요.',
	'result.notes_footer':
		'판정 계산 방법은 <a href="/method.html" hreflang="ja">측정 방법과 출처</a>(일본어)에서 볼 수 있습니다. 판정 방식이 바뀌면 이 번호(<span id="result-version">v1</span>)도 바뀝니다.',
	'result.unavailable': '이 결과는 표시할 수 없습니다',
	'result.no_params': '링크에 측정값이 들어 있지 않습니다.',
	'result.no_library': '참고 음성 목록을 불러오지 못했습니다.',
	'result.no_verdict': '이 언어의 참고 음성으로는 판정을 계산할 수 없습니다.',
	'result.version_note':
		'이 링크는 판정 방식 v{from} 기준으로 만들어졌습니다. 현재 방식(v{to})으로 다시 계산했습니다.',
	'manifest.name': 'Koenami · 여성·남성 목소리 연습 도구',
	'manifest.description':
		'참고 음성을 따라 녹음하고, 목표 목소리에 얼마나 가까운지 분포도에서 확인하는 목소리 연습 도구.',
	'manifest.screenshot_wide': 'Koenami 스튜디오: 목소리 분포, 다섯 지표, 참고 음성 목록, 파형',
	'manifest.screenshot_narrow': '스마트폰 화면의 스튜디오',
	'api.busy': '잠시 후 다시 시도해 주세요.',
	'api.too_long': '1분 이내의 음성을 골라 주세요.',
	'api.no_audio': '음성이 없습니다.',
	'api.too_short': '0.25초 이상의 음성을 사용해 주세요.',
	'api.starting': '분석 서버를 준비하고 있습니다. 잠시 후 다시 시도해 주세요.'
} satisfies Catalogue;
